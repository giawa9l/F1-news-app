import { test } from 'node:test';
import assert from 'node:assert';
import { scrapeF1News, scrapeGoogleNews } from './scraper.js';
import { mockGoogleNewsResponse, mockErrorResponse, mockMalformedData } from './mocks/newsData.js';

// Original F1 News test
test('scrapeF1News returns valid article data', async (t) => {
  const articles = await scrapeF1News();
  
  assert.ok(Array.isArray(articles), 'Should return an array');
  assert.ok(articles.length <= 5, 'Should return maximum 5 articles');
  
  articles.forEach(article => {
    assert.ok(article.title, 'Article should have a title');
    assert.ok(article.url, 'Article should have a URL');
    assert.ok(article.url.startsWith('https://'), 'URL should be absolute');
    assert.ok(article.source, 'Article should have a source');
    assert.ok(article.publishDate, 'Article should have a publish date');
    assert.ok(article.snippet, 'Article should have a snippet');
  });
});

// New Google News scraping tests
test('scrapeGoogleNews handles successful response', async (t) => {
  // Mock the fetch function
  global.fetch = async () => ({
    ok: true,
    json: async () => mockGoogleNewsResponse
  });

  const articles = await scrapeGoogleNews();
  
  assert.ok(Array.isArray(articles), 'Should return an array');
  assert.equal(articles.length, mockGoogleNewsResponse.articles.length);
  
  articles.forEach(article => {
    assert.ok(article.title, 'Article should have a title');
    assert.ok(article.url, 'Article should have a URL');
    assert.ok(article.source, 'Article should have a source');
    assert.ok(article.publishDate, 'Article should have a publish date');
    assert.ok(article.snippet, 'Article should have a snippet');
  });
});

test('scrapeGoogleNews handles rate limiting', async (t) => {
  let attempts = 0;
  global.fetch = async () => {
    attempts++;
    if (attempts < 3) {
      throw new Error('Rate limit exceeded');
    }
    return {
      ok: true,
      json: async () => mockGoogleNewsResponse
    };
  };

  const articles = await scrapeGoogleNews();
  assert.equal(attempts, 3, 'Should retry on rate limit');
  assert.ok(Array.isArray(articles), 'Should eventually return articles');
});

test('scrapeGoogleNews handles malformed data', async (t) => {
  global.fetch = async () => ({
    ok: true,
    json: async () => mockMalformedData
  });

  const articles = await scrapeGoogleNews();
  assert.ok(Array.isArray(articles), 'Should return an array even with malformed data');
  assert.equal(articles.length, 0, 'Should filter out invalid articles');
});

test('scrapeGoogleNews handles network errors', async (t) => {
  global.fetch = async () => {
    throw new Error('Network error');
  };

  try {
    await scrapeGoogleNews();
    assert.fail('Should throw on network error');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'Network error');
  }
});

test('scrapeGoogleNews handles server errors', async (t) => {
  global.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: 'Internal server error' })
  });

  try {
    await scrapeGoogleNews();
    assert.fail('Should throw on server error');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes('500'));
  }
});

test('scrapeGoogleNews deduplicates similar articles', async (t) => {
  const duplicateResponse = {
    articles: [
      ...mockGoogleNewsResponse.articles,
      {...mockGoogleNewsResponse.articles[0], url: 'https://different.url'}
    ]
  };

  global.fetch = async () => ({
    ok: true,
    json: async () => duplicateResponse
  });

  const articles = await scrapeGoogleNews();
  assert.ok(articles.length < duplicateResponse.articles.length, 'Should remove duplicate content');
});
