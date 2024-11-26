import { test } from 'node:test';
import assert from 'node:assert';
import { NewsSummarizer } from './summarizer.js';
import { mockGoogleNewsResponse } from './mocks/newsData.js';

test('NewsSummarizer handles empty input', async (t) => {
  const summarizer = new NewsSummarizer();
  const result = summarizer.summarize([]);
  assert.equal(result, 'No articles available to summarize.');
});

test('NewsSummarizer generates summary from articles', async (t) => {
  const summarizer = new NewsSummarizer();
  const articles = [
    {
      title: 'Hamilton wins GP',
      snippet: 'Lewis Hamilton wins the race. Max Verstappen finished second.',
      source: 'F1 News'
    },
    {
      title: 'Hamilton victorious',
      snippet: 'Hamilton takes the win. Perez completes podium finish.',
      source: 'Racing Today'
    }
  ];

  const summary = summarizer.summarize(articles);
  
  assert.ok(summary.includes('Sources: F1 News, Racing Today'));
  assert.ok(summary.length > 0);
  assert.ok(!summary.includes('No articles available'));
});

test('NewsSummarizer removes duplicate information', async (t) => {
  const summarizer = new NewsSummarizer();
  const sentences = [
    'Hamilton wins the race',
    'Hamilton is victorious in the race',
    'Verstappen finished second'
  ];

  const unique = summarizer.removeDuplicateInfo(sentences);
  assert.ok(unique.length < sentences.length);
});

// New comprehensive tests
test('Summary maintains key information from source articles', async (t) => {
  const summarizer = new NewsSummarizer();
  const articles = mockGoogleNewsResponse.articles;
  const summary = summarizer.summarize(articles);

  // Check if key topics from original articles are present
  articles.forEach(article => {
    const keyTerms = article.title.split(' ')
      .filter(word => word.length > 4)  // Only check significant words
      .map(word => word.toLowerCase());
    
    const summaryContainsKey = keyTerms.some(term => 
      summary.toLowerCase().includes(term)
    );
    
    assert.ok(summaryContainsKey, `Summary should contain key information from: ${article.title}`);
  });
});

test('Summary length is appropriate', async (t) => {
  const summarizer = new NewsSummarizer();
  const articles = mockGoogleNewsResponse.articles;
  const summary = summarizer.summarize(articles);

  // Summary should be shorter than combined articles but comprehensive
  const totalInputLength = articles.reduce((acc, article) => 
    acc + article.title.length + article.snippet.length, 0
  );
  
  assert.ok(summary.length < totalInputLength, 'Summary should be more concise than input');
  assert.ok(summary.length > totalInputLength * 0.1, 'Summary should retain sufficient information');
});

test('Summary handles articles with varying lengths', async (t) => {
  const summarizer = new NewsSummarizer();
  const articles = [
    {
      title: 'Short title',
      snippet: 'Brief news.',
      source: 'Source1'
    },
    {
      title: 'Very long and detailed title with multiple components',
      snippet: 'This is a much longer article snippet that contains multiple sentences. ' +
               'It provides more detail and context about the story. The story continues ' +
               'with additional information and quotes from various sources.',
      source: 'Source2'
    }
  ];

  const summary = summarizer.summarize(articles);
  assert.ok(summary.includes('Source1'), 'Should include short article source');
  assert.ok(summary.includes('Source2'), 'Should include long article source');
});

test('Summary maintains chronological order of events', async (t) => {
  const summarizer = new NewsSummarizer();
  const articles = [
    {
      title: 'Initial Event',
      snippet: 'First thing happened.',
      publishDate: '2024-01-15T08:00:00Z',
      source: 'Source1'
    },
    {
      title: 'Follow-up Event',
      snippet: 'Second thing happened after the first.',
      publishDate: '2024-01-15T09:00:00Z',
      source: 'Source2'
    },
    {
      title: 'Latest Update',
      snippet: 'Final development in the story.',
      publishDate: '2024-01-15T10:00:00Z',
      source: 'Source3'
    }
  ];

  const summary = summarizer.summarize(articles);
  const firstIndex = summary.indexOf('First thing');
  const secondIndex = summary.indexOf('Second thing');
  const finalIndex = summary.indexOf('Final development');

  assert.ok(
    firstIndex < secondIndex && secondIndex < finalIndex,
    'Summary should maintain chronological order'
  );
});

test('Summary handles special characters and formatting', async (t) => {
  const summarizer = new NewsSummarizer();
  const articles = [
    {
      title: 'Article with "quotes" & special chars',
      snippet: 'Content with $pecial ch@racters & "quoted text".',
      source: 'Source1'
    },
    {
      title: 'Article with numbers: 123',
      snippet: 'Content with numbers (123) and [brackets].',
      source: 'Source2'
    }
  ];

  const summary = summarizer.summarize(articles);
  assert.ok(!summary.includes('undefined'), 'Should handle special characters');
  assert.ok(!summary.includes('[object Object]'), 'Should properly stringify content');
});
