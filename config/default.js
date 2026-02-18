const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    enabled: process.env.ENABLE_AI_ANALYSIS !== 'false',
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 4096,
    timeoutMs: 60_000,
  },

  drupal: {
    baseUrl: process.env.DRUPAL_BASE_URL || 'https://demo.acquia-sites.com',
    username: process.env.DRUPAL_USERNAME || 'admin',
    password: process.env.DRUPAL_PASSWORD || '',
    enabled: process.env.ENABLE_DRUPAL_POPULATION === 'true',
  },

  crawler: {
    cheerioTimeoutMs: 10_000,
    puppeteerTimeoutMs: 30_000,
    maxPages: 5,
    userAgent: 'ProspectMirror/1.0 (Acquia Demo Tool)',
  },

  lighthouse: {
    categories: ['performance', 'accessibility', 'seo', 'best-practices'],
    throttling: 'applied',
  },

  jobs: {
    ttlMs: 30 * 60 * 1000, // 30 minutes
  },
};
