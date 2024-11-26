import { test } from 'node:test';
import assert from 'node:assert';
import { fetch } from 'node-fetch';
import { mockApiResponses, mockErrorResponse } from './mocks/newsData.js';

const BASE_URL = 'http://localhost:3000';

// Health endpoint tests
test('health endpoint returns ok status', async (t) => {
  const response = await fetch(`${BASE_URL}/health`);
  const data = await response.json();
  
  assert.equal(response.status, 200);
  assert.equal(data.status, 'ok');
  assert.ok(data.timestamp);
});

// Summary endpoint tests
test('summary endpoint returns valid data', async (t) => {
  const response = await fetch(`${BASE_URL}/api/summary`);
  const data = await response.json();
  
  assert.equal(response.status, 200);
  assert.ok(data.summary);
  assert.ok(data.lastUpdated);
  assert.ok(typeof data.articleCount === 'number');
});

test('summary endpoint handles no data gracefully', async (t) => {
  // Mock empty data scenario
  const response = await fetch(`${BASE_URL}/api/summary?empty=true`);
  const data = await response.json();
  
  assert.equal(response.status, 200);
  assert.equal(data.summary, 'No articles available to summarize.');
  assert.equal(data.articleCount, 0);
});

test('summary endpoint respects max length parameter', async (t) => {
  const maxLength = 100;
  const response = await fetch(`${BASE_URL}/api/summary?maxLength=${maxLength}`);
  const data = await response.json();
  
  assert.ok(data.summary.length <= maxLength, 'Summary should respect max length');
});

// Articles endpoint tests
test('articles endpoint returns array of articles', async (t) => {
  const response = await fetch(`${BASE_URL}/api/articles`);
  const data = await response.json();
  
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(data));
  
  if (data.length > 0) {
    const article = data[0];
    assert.ok(article.title);
    assert.ok(article.url);
    assert.ok(article.source);
    assert.ok(article.publishDate);
  }
});

test('articles endpoint supports pagination', async (t) => {
  const pageSize = 2;
  const page = 1;
  const response = await fetch(`${BASE_URL}/api/articles?page=${page}&pageSize=${pageSize}`);
  const data = await response.json();
  
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(data));
  assert.ok(data.length <= pageSize);
});

test('articles endpoint supports filtering by source', async (t) => {
  const source = 'Tech News Daily';
  const response = await fetch(`${BASE_URL}/api/articles?source=${encodeURIComponent(source)}`);
  const data = await response.json();
  
  assert.equal(response.status, 200);
  data.forEach(article => {
    assert.equal(article.source, source);
  });
});

// Error handling tests
test('invalid endpoint returns 404', async (t) => {
  const response = await fetch(`${BASE_URL}/api/invalid`);
  assert.equal(response.status, 404);
});

test('invalid parameters return 400', async (t) => {
  const response = await fetch(`${BASE_URL}/api/summary?maxLength=invalid`);
  assert.equal(response.status, 400);
});

// Rate limiting tests
test('rate limiting is enforced', async (t) => {
  const requests = Array(10).fill().map(() => 
    fetch(`${BASE_URL}/api/articles`)
  );
  
  const responses = await Promise.all(requests);
  const tooManyRequests = responses.some(r => r.status === 429);
  
  assert.ok(tooManyRequests, 'Should enforce rate limiting');
});

// Authentication tests
test('protected endpoints require authentication', async (t) => {
  const response = await fetch(`${BASE_URL}/api/admin/refresh`);
  assert.equal(response.status, 401);
});

test('invalid auth token returns 401', async (t) => {
  const response = await fetch(`${BASE_URL}/api/admin/refresh`, {
    headers: {
      'Authorization': 'Bearer invalid-token'
    }
  });
  assert.equal(response.status, 401);
});

// Cache tests
test('responses include cache headers', async (t) => {
  const response = await fetch(`${BASE_URL}/api/articles`);
  assert.ok(response.headers.get('Cache-Control'));
  assert.ok(response.headers.get('ETag'));
});

test('cached responses return 304', async (t) => {
  const firstResponse = await fetch(`${BASE_URL}/api/articles`);
  const etag = firstResponse.headers.get('ETag');
  
  const secondResponse = await fetch(`${BASE_URL}/api/articles`, {
    headers: {
      'If-None-Match': etag
    }
  });
  
  assert.equal(secondResponse.status, 304);
});

// Content type tests
test('responses have correct content type', async (t) => {
  const response = await fetch(`${BASE_URL}/api/articles`);
  assert.equal(response.headers.get('Content-Type'), 'application/json');
});

// CORS tests
test('CORS headers are present', async (t) => {
  const response = await fetch(`${BASE_URL}/api/articles`, {
    method: 'OPTIONS'
  });
  
  assert.ok(response.headers.get('Access-Control-Allow-Origin'));
  assert.ok(response.headers.get('Access-Control-Allow-Methods'));
  assert.ok(response.headers.get('Access-Control-Allow-Headers'));
});
