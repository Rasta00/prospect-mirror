/**
 * Lighthouse performance/a11y/SEO audits + security header checks.
 *
 * Uses Puppeteer's Chrome for Lighthouse (shared browser when possible).
 */
const config = require('../../config/default');

/** Security headers to check */
const SECURITY_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
  'x-xss-protection',
  'referrer-policy',
  'permissions-policy',
];

/**
 * Run Lighthouse audits + security header check.
 */
async function runAudits(url, progress) {
  progress.start('audit', 'Running performance audits');

  const results = {
    scores: {},
    securityHeaders: {},
    diagnostics: {},
  };

  // -- Security headers (fast, parallel with Lighthouse) --
  const headerPromise = checkSecurityHeaders(url);

  // -- Lighthouse --
  let lighthouseResult = null;
  try {
    progress.progress('audit', 20, 'Starting Lighthouse');
    lighthouseResult = await runLighthouse(url, progress);
  } catch (err) {
    progress.progress('audit', 50, `Lighthouse failed: ${err.message}`);
  }

  // -- Merge results --
  results.securityHeaders = await headerPromise;

  if (lighthouseResult) {
    const cats = lighthouseResult.categories || {};
    results.scores = {
      performance: Math.round((cats.performance?.score || 0) * 100),
      accessibility: Math.round((cats.accessibility?.score || 0) * 100),
      seo: Math.round((cats.seo?.score || 0) * 100),
      bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
    };

    // Extract key diagnostics
    const audits = lighthouseResult.audits || {};
    results.diagnostics = {
      fcp: audits['first-contentful-paint']?.displayValue || null,
      lcp: audits['largest-contentful-paint']?.displayValue || null,
      tbt: audits['total-blocking-time']?.displayValue || null,
      cls: audits['cumulative-layout-shift']?.displayValue || null,
      speedIndex: audits['speed-index']?.displayValue || null,
    };
  }

  // Calculate a security score
  const headerCount = Object.values(results.securityHeaders).filter(Boolean).length;
  results.scores.security = Math.round((headerCount / SECURITY_HEADERS.length) * 100);

  progress.complete('audit', {
    performance: results.scores.performance,
    accessibility: results.scores.accessibility,
    seo: results.scores.seo,
    security: results.scores.security,
  });

  return results;
}

/**
 * Run Lighthouse with chrome-launcher.
 */
async function runLighthouse(url, progress) {
  const chromeLauncher = require('chrome-launcher');
  const lhModule = require('lighthouse');
  const runLH = lhModule.default || lhModule;

  // Use system Chromium (Railway/Docker) or Puppeteer's bundled Chrome (local)
  const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || require('puppeteer').executablePath();
  const chrome = await chromeLauncher.launch({
    chromePath,
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--no-zygote'],
  });

  try {
    progress.progress('audit', 40, 'Running Lighthouse audits');

    const lhResult = await runLH(url, {
      port: chrome.port,
      output: 'json',
      onlyCategories: config.lighthouse.categories,
      formFactor: 'desktop',
      screenEmulation: { disabled: true },
      throttling: { cpuSlowdownMultiplier: 1 },
    });

    progress.progress('audit', 80, 'Lighthouse complete');
    return lhResult?.lhr || null;
  } finally {
    await chrome.kill();
  }
}

/**
 * Check for security headers via a simple HEAD/GET request.
 */
async function checkSecurityHeaders(url) {
  const result = {};
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
    const headers = res.headers;
    for (const h of SECURITY_HEADERS) {
      result[h] = headers.has(h);
    }
  } catch {
    // If fetch fails, mark all as unknown
    for (const h of SECURITY_HEADERS) {
      result[h] = false;
    }
  }
  return result;
}

module.exports = { runAudits, SECURITY_HEADERS };
