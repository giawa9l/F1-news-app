# News Summarizer

A comprehensive news aggregation and summarization system with automated testing and deployment infrastructure.

## Features

- Google News scraping with reliability testing
- Automated news summarization with accuracy validation
- RESTful API endpoints with comprehensive test coverage
- Frontend user interface with interaction tests
- Complete deployment and scaling documentation

## Project Structure

```
├── src/
│   ├── frontend/
│   │   └── tests/        # Frontend test suite
│   ├── mocks/           # Mock data for testing
│   ├── scraper.js       # News scraping functionality
│   ├── summarizer.js    # News summarization logic
│   ├── server.js        # API server implementation
│   └── tests/          # Backend test suites
├── deployment/         # Deployment documentation
└── package.json       # Project configuration
```

## Testing

The project includes comprehensive test suites for:
- News scraping reliability
- Summary generation accuracy
- API endpoint functionality
- Frontend user interactions

Run tests with:
```bash
npm test
```

## Deployment

See [deployment/README.md](deployment/README.md) for detailed instructions on:
- Server setup
- Database configuration
- Monitoring setup
- Update procedures
- Backup strategy
- Scaling considerations

## Getting Started

1. Clone the repository
```bash
git clone [repository-url]
cd news-summarizer
```

2. Install dependencies
```bash
npm install
```

3. Run tests
```bash
npm test
```

4. Start the development server
```bash
npm run dev
```

## License

MIT
