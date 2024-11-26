import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { CONFIG } from './config.js';
import { createHttpClient, FALLBACK_CONTENT, RequestTimeoutError, ProxyError } from './http-client.js';
import { logger } from './logger.js';

const httpClient = createHttpClient();
const limit = pLimit(CONFIG.RATE_LIMIT);

export class ScrapingError extends Error {
  constructor(message = 'Scraping failed', cause = null) {
    super(message);
    this.name = 'ScrapingError';
    this.cause = cause;
    this.isOperational = true;
  }
}

function buildUrl() {
  try {
    const url = new URL(CONFIG.BASE_URL);
    Object.entries(CONFIG.QUERY_PARAMS).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    return url.toString();
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to build URL');
    throw new ScrapingError('Invalid URL configuration', error);
  }
}

function validateArticleData(articleData) {
  const required = ['title', 'url', 'source', 'publishDate', 'snippet'];
  const missing = required.filter(field => !articleData[field]);
  
  if (missing.length > 0) {
    logger.warn({ missing }, 'Article missing required fields');
    return false;
  }

  // Basic content validation
  if (articleData.title.length < 10 || articleData.snippet.length < 20) {
    logger.warn({ articleData }, 'Article content too short');
    return false;
  }

  return true;
}

function extractArticleData($, element) {
  try {
    const article = $(element);
    const titleElement = article.find('h3');
    const linkElement = titleElement.find('a');
    const sourceElement = article.find('time').parent();

    if (!titleElement.length || !linkElement.length) {
      throw new Error('Required elements not found');
    }

    const title = titleElement.text().trim();
    const relativeUrl = linkElement.attr('href');
    
    if (!relativeUrl) {
      throw new Error('Article URL not found');
    }

    const url = `https://news.google.com${relativeUrl.replace('./', '/')}`;
    const source = sourceElement.find('a').first().text().trim();
    const dateStr = article.find('time').attr('datetime');
    const publishDate = dateStr ? new Date(dateStr).toLocaleDateString() : 'Unknown';
    const snippet = article.find('div[class*="snippet"]').text().trim() || 'No snippet available';

    const articleData = { title, url, source, publishDate, snippet };

    if (!validateArticleData(articleData)) {
      return null;
    }

    return articleData;
  } catch (error) {
    logger.warn({ error: error.message }, 'Failed to parse article');
    return null;
  }
}

function detectGoogleNewsStructureChange($) {
  // Check for expected structure
  const hasArticles = $('article').length > 0;
  const hasHeaders = $('h3').length > 0;
  const hasTimeElements = $('time').length > 0;

  if (!hasArticles || !hasHeaders || !hasTimeElements) {
    logger.error({
      articles: hasArticles,
      headers: hasHeaders,
      timeElements: hasTimeElements
    }, 'Google News structure may have changed');
    
    return true;
  }

  return false;
}

async function fetchWithFallback(url, retryCount = 0) {
  try {
    const response = await limit(() => httpClient.get(url));
    return response.data;
  } catch (error) {
    if (error instanceof RequestTimeoutError || error instanceof ProxyError) {
      throw error; // Let these be handled by the caller
    }

    if (retryCount < CONFIG.MAX_RETRIES) {
      logger.warn({ 
        error: error.message, 
        attempt: retryCount + 1 
      }, 'Retrying fetch with fallback');
      
      // Exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, Math.min(1000 * Math.pow(2, retryCount), 10000))
      );
      
      return fetchWithFallback(url, retryCount + 1);
    }

    throw new ScrapingError('Failed to fetch news after retries', error);
  }
}

export async function scrapeF1News() {
  try {
    const url = buildUrl();
    const html = await fetchWithFallback(url);
    const $ = cheerio.load(html);

    // Check for structural changes
    if (detectGoogleNewsStructureChange($)) {
      throw new ScrapingError('Google News structure has changed');
    }

    const articles = $('article')
      .slice(0, 5)
      .map((_, element) => extractArticleData($, element))
      .get()
      .filter(article => article !== null);

    if (articles.length === 0) {
      logger.error('No valid articles found');
      return {
        ...FALLBACK_CONTENT,
        error: 'No valid articles could be extracted'
      };
    }

    // Quality check
    const validArticles = articles.filter(article => validateArticleData(article));
    const qualityScore = validArticles.length / articles.length;

    if (qualityScore < 0.5) {
      logger.warn({ 
        qualityScore,
        totalArticles: articles.length,
        validArticles: validArticles.length 
      }, 'Low quality scraping results');

      return {
        articles: validArticles,
        warning: 'Some articles may be incomplete or missing',
        qualityScore
      };
    }

    return {
      articles: validArticles,
      qualityScore
    };
  } catch (error) {
    logger.error({ error: error.message }, 'Scraping failed');

    if (error instanceof RequestTimeoutError) {
      throw new ScrapingError('Request timed out while fetching news', error);
    }

    if (error instanceof ProxyError) {
      throw new ScrapingError('All proxies failed', error);
    }

    // For any other errors, return fallback content
    return {
      ...FALLBACK_CONTENT,
      error: error.message
    };
  }
}
