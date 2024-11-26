export const mockGoogleNewsResponse = {
  articles: [
    {
      title: "Major Tech Company Announces New AI Product",
      url: "https://example.com/tech-news/1",
      source: "Tech News Daily",
      publishDate: "2024-01-15T10:30:00Z",
      snippet: "Leading tech company unveils groundbreaking AI technology that promises to revolutionize industry standards."
    },
    {
      title: "Global Markets React to Economic Data",
      url: "https://example.com/finance/2",
      source: "Financial Times",
      publishDate: "2024-01-15T09:15:00Z",
      snippet: "Markets show volatile reaction to latest economic indicators and central bank announcements."
    },
    {
      title: "Scientific Breakthrough in Climate Research",
      url: "https://example.com/science/3",
      source: "Science Today",
      publishDate: "2024-01-15T08:45:00Z",
      snippet: "Researchers discover new method for carbon capture that could significantly impact climate change efforts."
    }
  ]
};

export const mockErrorResponse = {
  error: "Rate limit exceeded",
  status: 429,
  message: "Too many requests"
};

export const mockMalformedData = {
  articles: [
    {
      title: "Incomplete Article",
      // missing url
      source: "Unknown"
      // missing other fields
    },
    {
      // completely empty article
    }
  ]
};

export const mockApiResponses = {
  summary: {
    summary: "Latest news highlights: Tech company launches new AI product. Markets volatile amid economic data. Climate research shows promising results.",
    lastUpdated: "2024-01-15T10:35:00Z",
    articleCount: 3
  },
  articles: mockGoogleNewsResponse.articles,
  error: {
    error: "Internal server error",
    status: 500,
    message: "Failed to fetch news data"
  }
};
