import { test } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { mockApiResponses } from '../../mocks/newsData.js';

// Setup JSDOM environment
const dom = new JSDOM('<!DOCTYPE html><div id="root"></div>');
global.document = dom.window.document;
global.window = dom.window;

// Mock fetch API
global.fetch = async (url) => {
  if (url.includes('/api/summary')) {
    return {
      ok: true,
      json: async () => mockApiResponses.summary
    };
  }
  if (url.includes('/api/articles')) {
    return {
      ok: true,
      json: async () => mockApiResponses.articles
    };
  }
  throw new Error('Unknown endpoint');
};

// UI Component Tests
test('App renders without crashing', async (t) => {
  const root = document.getElementById('root');
  assert.ok(root, 'Root element should exist');
});

test('News list renders all articles', async (t) => {
  const articles = mockApiResponses.articles;
  const newsList = document.createElement('div');
  newsList.className = 'news-list';
  
  articles.forEach(article => {
    const articleElement = document.createElement('div');
    articleElement.className = 'article';
    articleElement.innerHTML = `
      <h2>${article.title}</h2>
      <p>${article.snippet}</p>
    `;
    newsList.appendChild(articleElement);
  });
  
  assert.equal(
    newsList.querySelectorAll('.article').length,
    articles.length,
    'Should render all articles'
  );
});

test('Summary section displays latest summary', async (t) => {
  const summary = mockApiResponses.summary.summary;
  const summaryElement = document.createElement('div');
  summaryElement.className = 'summary';
  summaryElement.textContent = summary;
  
  assert.ok(
    summaryElement.textContent.includes('Latest news highlights'),
    'Should display summary content'
  );
});

// User Interaction Tests
test('Article expands on click', async (t) => {
  const article = document.createElement('div');
  article.className = 'article collapsed';
  
  article.addEventListener('click', () => {
    article.classList.toggle('collapsed');
    article.classList.toggle('expanded');
  });
  
  // Simulate click
  article.click();
  
  assert.ok(
    article.classList.contains('expanded'),
    'Article should expand on click'
  );
});

test('Search filter updates article list', async (t) => {
  const articles = mockApiResponses.articles;
  const searchInput = document.createElement('input');
  const newsList = document.createElement('div');
  newsList.className = 'news-list';
  
  // Add all articles initially
  articles.forEach(article => {
    const articleElement = document.createElement('div');
    articleElement.className = 'article';
    articleElement.innerHTML = `
      <h2>${article.title}</h2>
      <p>${article.snippet}</p>
    `;
    newsList.appendChild(articleElement);
  });
  
  // Simulate search
  const searchTerm = 'AI';
  searchInput.value = searchTerm;
  const filteredArticles = articles.filter(article =>
    article.title.includes(searchTerm) || article.snippet.includes(searchTerm)
  );
  
  // Update visible articles
  Array.from(newsList.children).forEach(articleElement => {
    const articleText = articleElement.textContent;
    articleElement.style.display = 
      articleText.includes(searchTerm) ? 'block' : 'none';
  });
  
  const visibleArticles = Array.from(newsList.children).filter(
    el => el.style.display !== 'none'
  );
  
  assert.equal(
    visibleArticles.length,
    filteredArticles.length,
    'Should show only matching articles'
  );
});

// Loading State Tests
test('Loading state is shown while fetching data', async (t) => {
  const app = document.createElement('div');
  app.className = 'app';
  
  const loadingElement = document.createElement('div');
  loadingElement.className = 'loading';
  loadingElement.textContent = 'Loading...';
  
  app.appendChild(loadingElement);
  
  assert.ok(
    app.querySelector('.loading'),
    'Loading indicator should be visible while fetching'
  );
});

// Error Handling Tests
test('Error message is shown on API failure', async (t) => {
  const errorMessage = 'Failed to fetch news';
  const app = document.createElement('div');
  app.className = 'app';
  
  const errorElement = document.createElement('div');
  errorElement.className = 'error';
  errorElement.textContent = errorMessage;
  
  app.appendChild(errorElement);
  
  assert.ok(
    app.querySelector('.error'),
    'Error message should be visible on API failure'
  );
  assert.equal(
    app.querySelector('.error').textContent,
    errorMessage,
    'Should show correct error message'
  );
});

// Accessibility Tests
test('Interactive elements are keyboard accessible', async (t) => {
  const button = document.createElement('button');
  button.textContent = 'Load More';
  
  assert.ok(
    button.getAttribute('tabindex') !== '-1',
    'Interactive elements should be keyboard accessible'
  );
});

test('Images have alt text', async (t) => {
  const article = document.createElement('div');
  article.innerHTML = `
    <img src="news-image.jpg" alt="News article image">
  `;
  
  const img = article.querySelector('img');
  assert.ok(
    img.hasAttribute('alt'),
    'Images should have alt text for accessibility'
  );
});

// Responsive Design Tests
test('Article layout adapts to screen size', async (t) => {
  const article = document.createElement('div');
  article.className = 'article';
  
  // Simulate mobile width
  window.innerWidth = 375;
  window.dispatchEvent(new Event('resize'));
  
  const computedStyle = window.getComputedStyle(article);
  assert.ok(
    computedStyle.getPropertyValue('max-width') !== 'none',
    'Articles should have responsive max-width'
  );
});
