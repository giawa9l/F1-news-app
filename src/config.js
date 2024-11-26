export const CONFIG = {
  BASE_URL: 'https://news.google.com/search',
  QUERY_PARAMS: {
    q: 'Formula+1',
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en'
  },
  MAX_RETRIES: 3,
  RETRY_DELAY: 3000,
  REQUEST_TIMEOUT: 30000,
  RATE_LIMIT: 1,
  PROXY_URLS: [
    'https://api.allorigins.win/raw?url=',
    'https://api.codetabs.com/v1/proxy?quest='
  ]
};