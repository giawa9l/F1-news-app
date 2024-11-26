import { scrapeF1News } from './scraper.js';
import { NewsDB } from './db.js';
import { NewsSummarizer } from './summarizer.js';

const db = new NewsDB();
const summarizer = new NewsSummarizer();

async function main() {
  try {
    console.log('Fetching F1 news...');
    const articles = await scrapeF1News();
    
    // Save to database
    await db.saveArticles(articles);
    
    // Generate summary
    const summary = summarizer.summarize(articles);
    
    // Display results
    const lastFetch = await db.getLastFetchTime();
    
    console.log(`\nF1 News Summary (Last updated: ${lastFetch}):`);
    console.log('\n' + summary);
    
    console.log('\nDetailed Articles:');
    articles.forEach((article, index) => {
      console.log(`\n${index + 1}. ${article.title}`);
      console.log(`   Source: ${article.source}`);
      console.log(`   Date: ${article.publishDate}`);
      console.log(`   URL: ${article.url}`);
    });
  } catch (error) {
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

main();