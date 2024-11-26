import axios from 'axios';
import axiosRetry from 'axios-retry';
import { CONFIG } from './config.js';
import { logger } from './logger.js';

// Custom error classes for better error handling
export class RequestTimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'RequestTimeoutError';
    this.isOperational = true;
  }
}

export class ProxyError extends Error {
  constructor(message = 'All proxies failed') {
    super(message);
    this.name = 'ProxyError';
    this.isOperational = true;
  }
}

function getRandomProxy() {
  const proxyUrls = CONFIG.PROXY_URLS;
  return proxyUrls[Math.floor(Math.random() * proxyUrls.length)];
}

// Fallback content for when Google News is completely inaccessible
export const FALLBACK_CONTENT = {
  error: true,
  message: 'Unable to fetch latest news',
  fallbackArticles: [
    {
      title: 'Service Temporarily Unavailable',
      url: 'https://f1-news-app.local/service-unavailable',
      snippet: 'We are unable to fetch the latest news at this moment. Please try again later.',
      source: 'System',
      publishDate: new Date().toLocaleDateString()
    }
  ]
};

export const createHttpClient = () => {
  const client = axios.create({
    timeout: CONFIG.REQUEST_TIMEOUT,
    maxRedirects: 5,
    maxContentLength: 50 * 1024 * 1024, // 50MB
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    },
    decompress: true,
    validateStatus: status => status >= 200 && status < 300
  });

  // Enhanced retry behavior with exponential backoff
  axiosRetry(client, {
    retries: CONFIG.MAX_RETRIES,
    retryDelay: (retryCount) => {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      return delay;
    },
    retryCondition: (error) => {
      // Don't retry if we've explicitly marked this as non-retryable
      if (error.config && error.config.noRetry) {
        return false;
      }

      return (
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        (error.response && error.response.status >= 500) ||
        // Also retry on 429 (Too Many Requests)
        (error.response && error.response.status === 429)
      );
    },
    onRetry: (retryCount, error, requestConfig) => {
      logger.warn({
        attempt: retryCount,
        error: error.message,
        url: requestConfig.url
      }, 'Retrying failed request');
    }
  });

  // Enhanced request interceptor with proxy rotation
  client.interceptors.request.use(async (config) => {
    if (config.retryCount && config.retryCount > 0) {
      const proxyUrl = getRandomProxy();
      if (!proxyUrl) {
        throw new ProxyError();
      }
      config.url = `${proxyUrl}${encodeURIComponent(config.url)}`;
      logger.info({ proxy: proxyUrl }, 'Using proxy for retry');
    }
    return config;
  });

  // Enhanced response interceptor with detailed error handling
  client.interceptors.response.use(
    response => response,
    error => {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new RequestTimeoutError();
      }

      if (error.response) {
        const status = error.response.status;
        const errorData = {
          status,
          url: error.config.url,
          method: error.config.method
        };

        if (status === 403) {
          logger.error(errorData, 'Access forbidden - possible IP ban');
          error.config.noRetry = true; // Don't retry on 403
        } else if (status === 429) {
          logger.warn(errorData, 'Rate limited by target server');
        } else if (status >= 500) {
          logger.error(errorData, 'Target server error');
        }

        throw new Error(`HTTP Error: ${status} - ${error.response.statusText}`);
      } else if (error.request) {
        logger.error({ error: error.message }, 'Network error occurred');
        throw new Error(`Network Error: ${error.message}`);
      }

      throw error;
    }
  );

  return client;
}
