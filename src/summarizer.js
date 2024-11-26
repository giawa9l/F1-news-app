import stringSimilarity from 'string-similarity';
import { logger } from './logger.js';
import { performance } from 'perf_hooks';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class SummarizationError extends Error {
  constructor(message = 'Summarization failed') {
    super(message);
    this.name = 'SummarizationError';
    this.isOperational = true;
  }
}

export class NewsSummarizer {
  constructor() {
    this.commonWords = new Set(['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at']);
    this.fallbackSummary = {
      summary: 'Unable to generate summary at this time.',
      themes: [],
      confidence: 0
    };
    
    // Memoization cache
    this.phraseCache = new Map();
    this.similarityCache = new Map();
    
    // Performance metrics
    this.metrics = {
      totalProcessingTime: 0,
      phraseExtractionTime: 0,
      themeDetectionTime: 0,
      duplicateRemovalTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    // Initialize worker pool
    this.workerPool = [];
    const numWorkers = Math.max(1, cpus().length - 1); // Leave one core free
    const workerPath = join(__dirname, 'workers', 'phrase-worker.js');
    
    for (let i = 0; i < numWorkers; i++) {
      this.workerPool.push(new Worker(workerPath));
    }
  }

  // Get worker from pool
  getWorker() {
    return this.workerPool[Math.floor(Math.random() * this.workerPool.length)];
  }

  validateArticle(article) {
    if (!article || typeof article !== 'object') {
      return false;
    }

    const requiredFields = ['title', 'snippet', 'source'];
    return requiredFields.every(field => {
      const value = article[field];
      return value && typeof value === 'string' && value.trim().length > 0;
    });
  }

  async extractKeyPhrasesParallel(text) {
    try {
      if (!text || typeof text !== 'string') {
        throw new Error('Invalid input text for key phrase extraction');
      }

      // Check cache first
      const cacheKey = text.slice(0, 100); // Use first 100 chars as key
      if (this.phraseCache.has(cacheKey)) {
        this.metrics.cacheHits++;
        return this.phraseCache.get(cacheKey);
      }

      this.metrics.cacheMisses++;
      const startTime = performance.now();

      // Use worker for parallel processing
      return new Promise((resolve, reject) => {
        const worker = this.getWorker();
        worker.postMessage({ text, commonWords: Array.from(this.commonWords) });
        
        worker.once('message', (phrases) => {
          this.metrics.phraseExtractionTime += performance.now() - startTime;
          this.phraseCache.set(cacheKey, phrases);
          
          // Limit cache size
          if (this.phraseCache.size > 1000) {
            const oldestKey = this.phraseCache.keys().next().value;
            this.phraseCache.delete(oldestKey);
          }
          
          resolve(phrases);
        });

        worker.once('error', reject);
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Key phrase extraction failed');
      return [];
    }
  }

  async findCommonThemes(articles) {
    try {
      if (!Array.isArray(articles) || articles.length === 0) {
        throw new Error('Invalid articles array for theme detection');
      }

      const startTime = performance.now();

      // Process articles in parallel
      const phrasePromises = articles.map(article => {
        try {
          return this.extractKeyPhrasesParallel(article.title + ' ' + article.snippet);
        } catch (error) {
          logger.warn({ articleId: article.id }, 'Failed to process article for themes');
          return Promise.resolve([]);
        }
      });

      const allPhraseArrays = await Promise.all(phrasePromises);
      const allPhrases = allPhraseArrays.flat();

      // Find repeated phrases (themes) using Map for better performance
      const phraseCounts = new Map();
      allPhrases.forEach(phrase => {
        phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
      });

      const themes = Array.from(phraseCounts.entries())
        .filter(([_, count]) => count > 1)
        .sort(([_, a], [__, b]) => b - a)
        .map(([phrase]) => phrase);

      this.metrics.themeDetectionTime += performance.now() - startTime;
      return themes;
    } catch (error) {
      logger.error({ error: error.message }, 'Theme detection failed');
      return [];
    }
  }

  removeDuplicateInfo(sentences) {
    try {
      if (!Array.isArray(sentences)) {
        throw new Error('Invalid sentences array for duplicate removal');
      }

      const startTime = performance.now();

      // Process in chunks for better performance
      const chunkSize = 10;
      const chunks = [];
      for (let i = 0; i < sentences.length; i += chunkSize) {
        chunks.push(sentences.slice(i, i + chunkSize));
      }

      const uniqueSentences = chunks.reduce((acc, chunk) => {
        return acc.concat(
          chunk.filter((sentence, index) => {
            if (!sentence || typeof sentence !== 'string') {
              return false;
            }

            const prevSentences = acc.concat(chunk.slice(0, index));
            return !prevSentences.some(other => {
              // Check similarity cache
              const cacheKey = `${sentence}:${other}`;
              if (this.similarityCache.has(cacheKey)) {
                this.metrics.cacheHits++;
                return this.similarityCache.get(cacheKey) > 0.6;
              }

              this.metrics.cacheMisses++;
              try {
                const similarity = stringSimilarity.compareTwoStrings(sentence, other);
                
                // Cache the result
                this.similarityCache.set(cacheKey, similarity);
                if (this.similarityCache.size > 1000) {
                  const oldestKey = this.similarityCache.keys().next().value;
                  this.similarityCache.delete(oldestKey);
                }
                
                return similarity > 0.6;
              } catch (error) {
                logger.warn({ error: error.message }, 'String similarity comparison failed');
                return false;
              }
            });
          })
        );
      }, []);

      this.metrics.duplicateRemovalTime += performance.now() - startTime;
      return uniqueSentences;
    } catch (error) {
      logger.error({ error: error.message }, 'Duplicate removal failed');
      return sentences;
    }
  }

  async summarize(articles) {
    const startTime = performance.now();
    try {
      // Input validation
      if (!articles || !Array.isArray(articles)) {
        throw new SummarizationError('Invalid articles input');
      }

      // Filter out invalid articles
      const validArticles = articles.filter(article => this.validateArticle(article));

      if (validArticles.length === 0) {
        logger.warn('No valid articles to summarize');
        return {
          ...this.fallbackSummary,
          error: 'No valid articles available'
        };
      }

      // Find common themes with parallel processing
      const themes = await this.findCommonThemes(validArticles);

      // Process articles in parallel
      const processPromises = validArticles.map(async article => {
        try {
          const sentences = article.snippet
            .split(/[.!?]+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);

          const uniqueSentences = this.removeDuplicateInfo(sentences);
          const keyPoints = await this.extractKeyPhrasesParallel(article.snippet);

          return {
            source: article.source,
            sentences: uniqueSentences,
            keyPoints: keyPoints.filter(point => !themes.includes(point))
          };
        } catch (error) {
          logger.warn({ articleId: article.id, error: error.message }, 'Failed to process article');
          return null;
        }
      });

      const results = (await Promise.all(processPromises)).filter(Boolean);

      // Calculate confidence score
      const confidence = results.length / validArticles.length;

      if (confidence < 0.5) {
        logger.warn({ confidence }, 'Low confidence summary generated');
        return {
          ...this.fallbackSummary,
          partialData: true,
          processedArticles: results.length,
          totalArticles: validArticles.length
        };
      }

      // Build final summary
      const summary = [];

      if (themes.length > 0) {
        summary.push(`Key themes: ${themes.slice(0, 3).join(', ')}.`);
      }

      // Combine and deduplicate all sentences
      const allSentences = this.removeDuplicateInfo(
        results.flatMap(r => r.sentences)
      );

      const mainPoints = allSentences.slice(0, 3).join('. ');
      if (mainPoints) {
        summary.push(mainPoints + '.');
      }

      const sources = new Set(results.map(r => r.source));
      summary.push(`Sources: ${Array.from(sources).join(', ')}`);

      this.metrics.totalProcessingTime += performance.now() - startTime;

      return {
        summary: summary.join('\n'),
        themes,
        confidence,
        processedArticles: results.length,
        totalArticles: validArticles.length,
        metrics: { ...this.metrics }
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Summarization failed');
      return {
        ...this.fallbackSummary,
        error: error.message
      };
    }
  }

  // Cleanup method for worker threads
  cleanup() {
    this.workerPool.forEach(worker => worker.terminate());
    this.phraseCache.clear();
    this.similarityCache.clear();
  }
}
