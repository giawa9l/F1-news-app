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
    logger.warn({ missing, articleData }, 'Article missing required fields');
    return false;
  }

  // Basic content validation
  if (articleData.title.length < 10) {
    logger.warn({ articleData }, 'Article content too short');
    return false;
  }

  return true;
}

function extractArticleData($, element) {
  try {
    const article = $(element);
    
    // Get title and URL from the JtKRv class element
    const titleElement = article.find('.JtKRv');
    if (!titleElement.length) {
      logger.warn('Title element not found');
      throw new Error('Required elements not found');
    }

    const title = titleElement.text().trim();
    const relativeUrl = titleElement.attr('href');
    
    if (!relativeUrl) {
      logger.warn('URL attribute not found');
      throw new Error('Article URL not found');
    }

    // Get source from vr1PYe class
    const sourceElement = article.find('.vr1PYe');
    const source = sourceElement.text().trim() || 'Unknown Source';

    // Get date from hvbAAd class
    const timeElement = article.find('.hvbAAd');
    const dateStr = timeElement.attr('datetime');
    const publishDate = dateStr ? new Date(dateStr).toLocaleDateString() : new Date().toLocaleDateString();

    // Get author from bInasb class
    const authorElement = article.find('.bInasb span');
    const author = authorElement.text().trim();

    // Use the title as snippet since Google News doesn't show full snippets in search
    const snippet = `${title}${author ? ` - By ${author}` : ''}`;

    // Handle URL format
    const url = relativeUrl.startsWith('http') 
      ? relativeUrl 
      : `https://news.google.com${relativeUrl.replace('./', '/')}`;

    const articleData = { title, url, source, publishDate, snippet };

    // Log the extracted data for debugging
    logger.debug({ articleData }, 'Extracted article data');

    if (!validateArticleData(articleData)) {
      return null;
    }

    return articleData;
  } catch (error) {
    logger.warn({ 
      error: error.message,
      html: $(element).html()
    }, 'Failed to parse article');
    return null;
  }
}

function detectGoogleNewsStructureChange($) {
  // Check for expected structure with the new selectors
  const hasArticles = $('.m5k28').length > 0;
  const hasTitles = $('.JtKRv').length > 0;
  const hasTimeElements = $('.hvbAAd').length > 0;

  if (!hasArticles || !hasTitles || !hasTimeElements) {
    logger.error({
      articles: hasArticles,
      titles: hasTitles,
      timeElements: hasTimeElements
    }, 'Google News structure may have changed');
    
    return true;
  }

  return false;
}

async function fetchWithFallback(url, retryCount = 0) {
  try {
    const response = await limit(() => httpClient.get(url));
    
    // Log response details for debugging
    logger.debug({
      status: response.status,
      headers: response.headers,
      dataLength: response.data.length
    }, 'Fetch response details');

    return response.data;
  } catch (error) {
    if (error instanceof RequestTimeoutError || error instanceof ProxyError) {
      throw error;
    }

    if (retryCount < CONFIG.MAX_RETRIES) {
      logger.warn({ 
        error: error.message, 
        attempt: retryCount + 1 
      }, 'Retrying fetch with fallback');
      
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
    logger.info({ url }, 'Fetching news from URL');

    const html = await fetchWithFallback(url);
    const $ = cheerio.load(html);

    if (detectGoogleNewsStructureChange($)) {
      logger.warn('Using fallback content due to structure change');
      return FALLBACK_CONTENT;
    }

    const articles = $('.m5k28')
      .slice(0, 5)
      .map((_, element) => extractArticleData($, element))
      .get()
      .filter(article => article !== null);

    if (articles.length === 0) {
      logger.error('No valid articles found');
      return FALLBACK_CONTENT;
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

    return FALLBACK_CONTENT;
  }
}
