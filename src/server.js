import express from 'express';
import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';
import compression from 'compression';
import { scrapeF1News } from './scraper.js';
import { NewsDB } from './db.js';
import { NewsSummarizer, SummarizationError } from './summarizer.js';
import { NewsScheduler } from './scheduler.js';
import { logger } from './logger.js';
import { RequestTimeoutError, ProxyError, FALLBACK_CONTENT } from './http-client.js';
import { performance } from 'perf_hooks';

const app = express();
const port = process.env.PORT || 3000;
const db = new NewsDB();
const summarizer = new NewsSummarizer();

// Enhanced cache configuration
const cache = new NodeCache({ 
  stdTTL: 300, // 5 minutes cache
  checkperiod: 60, // Check for expired keys every minute
  errorOnMissing: false,
  useClones: false, // Optimize memory usage
  maxKeys: 1000 // Prevent memory leaks
});

const scheduler = new NewsScheduler(cache);

// Performance metrics
const metrics = {
  requestCount: 0,
  cacheHits: 0,
  cacheMisses: 0,
  averageResponseTime: 0,
  summaryGenerationTime: 0,
  lastGC: Date.now(),
  memoryUsage: process.memoryUsage()
};

// Update memory metrics every 5 minutes
setInterval(() => {
  metrics.memoryUsage = process.memoryUsage();
  
  // Force garbage collection if heap usage is high
  if (metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal > 0.9) {
    global.gc && global.gc();
    metrics.lastGC = Date.now();
  }
}, 300000);

// Compression middleware
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests', retryAfter: '15 minutes' }
});

app.use(limiter);
app.use(express.json());

// Enhanced request timeout middleware with monitoring
const timeoutMiddleware = (req, res, next) => {
  const startTime = performance.now();
  
  res.setTimeout(30000, () => {
    logger.error({ path: req.path }, 'Request timeout');
    metrics.timeouts = (metrics.timeouts || 0) + 1;
    res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Request timed out. Please try again later.'
    });
  });

  // Track response time
  res.on('finish', () => {
    const duration = performance.now() - startTime;
    metrics.averageResponseTime = 
      (metrics.averageResponseTime * metrics.requestCount + duration) / 
      (metrics.requestCount + 1);
    metrics.requestCount++;
  });

  next();
};

app.use(timeoutMiddleware);

// Request logging middleware with performance tracking
app.use((req, res, next) => {
  const startTime = performance.now();
  res.on('finish', () => {
    const duration = performance.now() - startTime;
    logger.info({ 
      method: req.method,
      url: req.url,
      ip: req.ip,
      status: res.statusCode,
      duration,
      memoryUsage: process.memoryUsage().heapUsed
    }, 'Request completed');
  });
  next();
});

// Enhanced health check endpoint with detailed metrics
app.get('/health', async (req, res) => {
  try {
    const schedulerMetrics = await scheduler.getMetrics();
    const dbStatus = await db.checkConnection();
    const cacheStats = cache.getStats();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      metrics: {
        ...metrics,
        scheduler: schedulerMetrics,
        cache: cacheStats,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      },
      database: dbStatus,
      lastError: scheduler.getLastError()
    });
  } catch (error) {
    logger.error({ err: error }, 'Health check failed');
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enhanced summary endpoint with stale-while-revalidate
app.get('/api/summary', async (req, res) => {
  const startTime = performance.now();
  try {
    const cachedSummary = cache.get('summary');
    if (cachedSummary) {
      metrics.cacheHits++;
      
      // Background refresh if cache is about to expire
      if (cache.getTtl('summary') - Date.now() < 60000) {
        refreshSummaryInBackground();
      }
      
      return res.json({
        ...cachedSummary,
        fromCache: true
      });
    }

    metrics.cacheMisses++;
    const articles = await db.getLatestArticles();
    
    if (!articles || !Array.isArray(articles)) {
      throw new Error('Invalid article data from database');
    }

    const summary = await summarizer.summarize(articles);
    const lastFetch = await db.getLastFetchTime();

    metrics.summaryGenerationTime = performance.now() - startTime;

    const response = {
      summary: summary.summary,
      lastUpdated: lastFetch,
      articleCount: articles.length,
      confidence: summary.confidence,
      fromCache: false,
      generationTime: metrics.summaryGenerationTime
    };

    if (summary.confidence >= 0.5) {
      cache.set('summary', response);
    }

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch summary');
    
    let statusCode = 500;
    let errorResponse = {
      error: 'Failed to fetch summary',
      message: 'An unexpected error occurred'
    };

    if (error instanceof SummarizationError) {
      statusCode = 422;
      errorResponse.message = 'Unable to generate summary from available data';
    } else if (error instanceof RequestTimeoutError) {
      statusCode = 504;
      errorResponse.message = 'Request timed out while fetching news';
    } else if (error instanceof ProxyError) {
      statusCode = 503;
      errorResponse.message = 'Service temporarily unavailable';
    }

    const cachedSummary = cache.get('summary', true);
    if (cachedSummary) {
      return res.status(statusCode).json({
        ...errorResponse,
        fallbackData: cachedSummary,
        notice: 'Showing cached data due to error'
      });
    }

    res.status(statusCode).json(errorResponse);
  }
});

// Background summary refresh function
async function refreshSummaryInBackground() {
  try {
    const articles = await db.getLatestArticles();
    const summary = await summarizer.summarize(articles);
    const lastFetch = await db.getLastFetchTime();

    if (summary.confidence >= 0.5) {
      cache.set('summary', {
        summary: summary.summary,
        lastUpdated: lastFetch,
        articleCount: articles.length,
        confidence: summary.confidence,
        fromCache: false
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Background summary refresh failed');
  }
}

// Enhanced articles endpoint with streaming
app.get('/api/articles', async (req, res) => {
  try {
    const cachedArticles = cache.get('articles');
    if (cachedArticles) {
      metrics.cacheHits++;
      return res.json({
        articles: cachedArticles,
        fromCache: true
      });
    }

    metrics.cacheMisses++;
    const articles = await db.getLatestArticles();
    
    if (!articles || !Array.isArray(articles)) {
      throw new Error('Invalid article data from database');
    }

    // Stream large responses
    if (articles.length > 100) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked'
      });

      res.write('{"articles":[');
      articles.forEach((article, index) => {
        if (!article.title || !article.url || !article.source) {
          logger.warn({ article }, 'Invalid article data detected');
          return;
        }

        const articleJson = JSON.stringify({
          title: article.title,
          url: article.url,
          source: article.source,
          publishDate: article.publish_date
        });

        res.write(`${index > 0 ? ',' : ''}${articleJson}`);
      });
      res.end('],"fromCache":false}');
    } else {
      const response = articles
        .filter(article => article.title && article.url && article.source)
        .map(article => ({
          title: article.title,
          url: article.url,
          source: article.source,
          publishDate: article.publish_date
        }));

      if (response.length > 0) {
        cache.set('articles', response);
      }

      res.json({
        articles: response,
        fromCache: false
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch articles');
    
    const cachedArticles = cache.get('articles', true);
    if (cachedArticles) {
      return res.status(500).json({
        error: 'Failed to fetch latest articles',
        fallbackData: cachedArticles,
        notice: 'Showing cached data due to error'
      });
    }

    res.status(500).json({ 
      error: 'Failed to fetch articles',
      fallback: FALLBACK_CONTENT
    });
  }
});

// Manual refresh endpoint with enhanced error handling
app.post('/api/refresh', async (req, res) => {
  const startTime = performance.now();
  try {
    const updateResult = await scheduler.processUpdate();
    
    // Clear cache after successful update
    cache.del(['summary', 'articles']);
    
    metrics.lastRefresh = {
      timestamp: Date.now(),
      duration: performance.now() - startTime,
      articlesProcessed: updateResult.processed
    };

    res.json({ 
      message: 'Refresh successful',
      articlesProcessed: updateResult.processed,
      newArticles: updateResult.new,
      duration: metrics.lastRefresh.duration
    });
  } catch (error) {
    logger.error({ err: error }, 'Manual refresh failed');
    
    let statusCode = 500;
    let errorResponse = {
      error: 'Refresh failed',
      message: 'An unexpected error occurred'
    };

    if (error instanceof RequestTimeoutError) {
      statusCode = 504;
      errorResponse.message = 'Request timed out while fetching news';
    } else if (error instanceof ProxyError) {
      statusCode = 503;
      errorResponse.message = 'Service temporarily unavailable';
    }

    res.status(statusCode).json(errorResponse);
  }
});

// Enhanced error handling middleware with monitoring
app.use((err, req, res, next) => {
  metrics.errors = (metrics.errors || 0) + 1;
  
  logger.error({ 
    err,
    method: req.method,
    url: req.url,
    body: req.body,
    stack: err.stack,
    memoryUsage: process.memoryUsage()
  }, 'Unhandled error');

  res.status(500).json({ 
    error: 'Internal server error',
    message: 'Something went wrong! Our team has been notified.'
  });
});

// Start server with enhanced monitoring
app.listen(port, () => {
  logger.info({
    port,
    env: process.env.NODE_ENV,
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage()
  }, 'Server started');
  
  scheduler.start().catch(error => {
    logger.error({ err: error }, 'Failed to start scheduler');
  });
});

// Enhanced graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  try {
    await scheduler.stop();
    await db.close();
    cache.close();
    
    logger.info({
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      metrics
    }, 'Server shutdown complete');
    
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
});
