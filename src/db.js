import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class NewsDB {
  constructor() {
    const dbPath = join(__dirname, '..', 'data', 'news.db');
    this.db = new sqlite3.Database(dbPath);
    // Convert callback-based methods to promises
    this.run = promisify(this.db.run.bind(this.db));
    this.all = promisify(this.db.all.bind(this.db));
    this.get = promisify(this.db.get.bind(this.db));
    this.init();
  }

  async init() {
    // Create tables with indexes for quick retrieval
    await this.run(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        url TEXT UNIQUE NOT NULL,
        source TEXT NOT NULL,
        publish_date TEXT NOT NULL,
        snippet TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);

    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(publish_date DESC)
    `);

    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source)
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  async saveArticles(articles) {
    // Run all operations in series
    for (const article of articles) {
      await this.run(`
        INSERT OR REPLACE INTO articles (title, url, source, publish_date, snippet)
        VALUES (?, ?, ?, ?, ?)
      `, [article.title, article.url, article.source, article.publishDate, article.snippet]);
    }

    await this.run(`
      INSERT OR REPLACE INTO metadata (key, value)
      VALUES ('last_fetch', datetime('now'))
    `);
  }

  async getLatestArticles(limit = 5) {
    return await this.all(`
      SELECT * FROM articles
      ORDER BY publish_date DESC, created_at DESC
      LIMIT ?
    `, [limit]);
  }

  async getLastFetchTime() {
    const result = await this.get(`
      SELECT value FROM metadata WHERE key = 'last_fetch'
    `);
    return result ? result.value : null;
  }

  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
