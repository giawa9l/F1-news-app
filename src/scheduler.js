import schedule from 'node-schedule';
import { scrapeF1News } from './scraper.js';
import { NewsDB } from './db.js';
import { NewsSummarizer } from './summarizer.js';
import { logger } from './logger.js';

export class NewsScheduler {
  constructor(cache) {
    this.db = new NewsDB();
    this.summarizer = new NewsSummarizer();
    this.cache = cache;
    this.isProcessing = false;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.retryDelay = 5 * 60 * 1000; // 5 minutes
  }

  async processUpdate() {
    if (this.isProcessing) {
      logger.warn('Update already in progress, skipping...');
      return;
    }

    this.isProcessing = true;
    try {
      logger.info('Starting scheduled news update');
      const startTime = Date.now();

      // Fetch and process news
      const articles = await scrapeF1News();
      logger.info(`Fetched ${articles.length} articles`);

      // Save to database
      await this.db.saveArticles(articles);
      logger.info('Saved articles to database');

      // Clear cache
      this.cache.del('summary');
      this.cache.del('articles');
      logger.info('Cleared cache');

      // Reset retry count on successful update
      this.retryCount = 0;

      const duration = (Date.now() - startTime) / 1000;
      logger.info(`Update completed successfully in ${duration}s`);

      // Record metrics
      await this.db.run(`
        INSERT INTO metadata (key, value)
        VALUES ('last_update_duration', ?)
      `, [duration.toString()]);

    } catch (error) {
      logger.error({ err: error }, 'Failed to process news update');
      
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        logger.info(`Scheduling retry attempt ${this.retryCount}/${this.maxRetries}`);
        setTimeout(() => this.processUpdate(), this.retryDelay);
      } else {
        logger.error('Max retries exceeded, manual intervention required');
        await this.alertFailure(error);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async alertFailure(error) {
    // Log critical failure
    logger.fatal({
      err: error,
      retries: this.retryCount,
      lastSuccess: await this.db.getLastFetchTime()
    }, 'Critical failure in news update process');

    // Store failure in database for monitoring
    await this.db.run(`
      INSERT INTO metadata (key, value)
      VALUES ('last_failure', ?), ('failure_reason', ?)
    `, [new Date().toISOString(), error.message]);
  }

  async getMetrics() {
    const metrics = {
      lastUpdate: await this.db.getLastFetchTime(),
      lastDuration: await this.db.get('SELECT value FROM metadata WHERE key = "last_update_duration"'),
      lastFailure: await this.db.get('SELECT value FROM metadata WHERE key = "last_failure"'),
      articleCount: await this.db.get('SELECT COUNT(*) as count FROM articles'),
      retryCount: this.retryCount
    };

    return metrics;
  }

  start() {
    // Run initial update
    this.processUpdate();

    // Schedule hourly updates
    schedule.scheduleJob('0 * * * *', () => {
      this.processUpdate();
    });

    // Schedule daily cleanup of old articles (keep last 7 days)
    schedule.scheduleJob('0 0 * * *', async () => {
      try {
        await this.db.run(`
          DELETE FROM articles 
          WHERE created_at < strftime('%s', 'now', '-7 days')
        `);
        logger.info('Completed daily cleanup of old articles');
      } catch (error) {
        logger.error({ err: error }, 'Failed to cleanup old articles');
      }
    });

    logger.info('News scheduler started successfully');
  }

  stop() {
    schedule.gracefulShutdown();
    logger.info('News scheduler stopped');
  }
}