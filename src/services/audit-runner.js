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

/** Human-readable descriptions for security headers */
const SECURITY_HEADER_INFO = {
  'strict-transport-security': {
    title: 'HTTP Strict Transport Security (HSTS)',
    description: 'Forces browsers to use HTTPS, preventing protocol downgrade attacks and cookie hijacking.',
  },
  'content-security-policy': {
    title: 'Content Security Policy (CSP)',
    description: 'Prevents XSS attacks by controlling which resources the browser can load.',
  },
  'x-content-type-options': {
    title: 'X-Content-Type-Options',
    description: 'Prevents MIME type sniffing, reducing exposure to drive-by download attacks.',
  },
  'x-frame-options': {
    title: 'X-Frame-Options',
    description: 'Prevents clickjacking by controlling whether the site can be embedded in frames.',
  },
  'x-xss-protection': {
    title: 'X-XSS-Protection',
    description: 'Legacy XSS filter — enables browser built-in cross-site scripting protection.',
  },
  'referrer-policy': {
    title: 'Referrer-Policy',
    description: 'Controls how much referrer information is shared when navigating away from the site.',
  },
  'permissions-policy': {
    title: 'Permissions-Policy',
    description: 'Controls which browser features (camera, mic, geolocation) the site can use.',
  },
};

/**
 * Run Lighthouse audits + security header check.
 */
async function runAudits(url, progress) {
  progress.start('audit', 'Running performance audits');

  const results = {
    scores: {},
    securityHeaders: {},
    diagnostics: {},
    categoryDetails: {},
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

    // Extract detailed per-category audit findings
    results.categoryDetails = extractCategoryDetails(lighthouseResult);
  }

  // Calculate a security score
  const headerCount = Object.values(results.securityHeaders).filter(Boolean).length;
  results.scores.security = Math.round((headerCount / SECURITY_HEADERS.length) * 100);

  // Build security details
  results.categoryDetails.security = buildSecurityDetails(results.securityHeaders);

  progress.complete('audit', {
    performance: results.scores.performance,
    accessibility: results.scores.accessibility,
    seo: results.scores.seo,
    security: results.scores.security,
  });

  return results;
}

/**
 * Extract detailed audit findings per Lighthouse category.
 */
function extractCategoryDetails(lhr) {
  const categories = lhr.categories || {};
  const audits = lhr.audits || {};
  const details = {};

  const categoryMap = {
    performance: 'performance',
    accessibility: 'accessibility',
    seo: 'seo',
    'best-practices': 'bestPractices',
  };

  for (const [lhKey, ourKey] of Object.entries(categoryMap)) {
    const cat = categories[lhKey];
    if (!cat) continue;

    const findings = [];

    for (const ref of cat.auditRefs || []) {
      const audit = audits[ref.id];
      if (!audit) continue;

      // Skip informative/manual audits and notApplicable
      if (audit.scoreDisplayMode === 'manual' || audit.scoreDisplayMode === 'notApplicable') continue;
      if (audit.score === null && audit.scoreDisplayMode === 'informative') continue;

      const finding = {
        id: ref.id,
        title: audit.title || '',
        description: stripMarkdownLinks(audit.description || ''),
        score: audit.score,
        displayValue: audit.displayValue || null,
        weight: ref.weight || 0,
        group: ref.group || null,
      };

      // Classify: fail (<0.5), warning (0.5-0.89), pass (>=0.9)
      if (audit.score === null || audit.scoreDisplayMode === 'informative') {
        finding.status = 'info';
      } else if (audit.score < 0.5) {
        finding.status = 'fail';
      } else if (audit.score < 0.9) {
        finding.status = 'warning';
      } else {
        finding.status = 'pass';
      }

      // Extract actionable items from audit details
      finding.items = extractAuditItems(audit);

      findings.push(finding);
    }

    // Sort: fails first (by weight desc), then warnings, then passes
    const statusOrder = { fail: 0, warning: 1, info: 2, pass: 3 };
    findings.sort((a, b) => {
      const s = statusOrder[a.status] - statusOrder[b.status];
      if (s !== 0) return s;
      return b.weight - a.weight;
    });

    details[ourKey] = findings;
  }

  return details;
}

/**
 * Extract actionable items from a Lighthouse audit's details.
 * Returns up to 5 items with human-readable descriptions.
 */
function extractAuditItems(audit) {
  const details = audit.details;
  if (!details) return [];

  const items = [];

  if (details.type === 'table' && details.items) {
    for (const item of details.items.slice(0, 5)) {
      const parts = [];

      // URL or node reference
      if (item.url) {
        parts.push(truncateUrl(item.url));
      } else if (item.node?.snippet) {
        parts.push(item.node.snippet.slice(0, 100));
      } else if (item.source?.url) {
        parts.push(truncateUrl(item.source.url));
      }

      // Size/savings
      if (item.totalBytes) {
        parts.push(formatBytes(item.totalBytes));
      }
      if (item.wastedBytes) {
        parts.push(`${formatBytes(item.wastedBytes)} saveable`);
      }
      if (item.wastedMs) {
        parts.push(`${Math.round(item.wastedMs)}ms wasted`);
      }

      // Label/description
      if (item.label) {
        parts.push(item.label);
      }
      if (item.description && !item.url) {
        parts.push(item.description.slice(0, 120));
      }

      if (parts.length > 0) {
        items.push(parts.join(' — '));
      }
    }
  } else if (details.type === 'opportunity' && details.items) {
    for (const item of details.items.slice(0, 5)) {
      const parts = [];
      if (item.url) parts.push(truncateUrl(item.url));
      if (item.totalBytes) parts.push(formatBytes(item.totalBytes));
      if (item.wastedBytes) parts.push(`save ${formatBytes(item.wastedBytes)}`);
      if (item.wastedMs) parts.push(`save ${Math.round(item.wastedMs)}ms`);
      if (parts.length > 0) items.push(parts.join(' — '));
    }
  }

  return items;
}

/**
 * Build security category details from header check results.
 */
function buildSecurityDetails(securityHeaders) {
  const findings = [];

  for (const [header, present] of Object.entries(securityHeaders)) {
    const info = SECURITY_HEADER_INFO[header] || { title: header, description: '' };
    findings.push({
      id: `security-header-${header}`,
      title: info.title,
      description: info.description,
      score: present ? 1 : 0,
      displayValue: present ? 'Present' : 'Missing',
      status: present ? 'pass' : 'fail',
      weight: 1,
      items: [],
    });
  }

  // Fails first
  findings.sort((a, b) => a.score - b.score);
  return findings;
}

/**
 * Strip markdown link syntax from Lighthouse descriptions.
 */
function stripMarkdownLinks(text) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/**
 * Truncate a URL to a reasonable display length.
 */
function truncateUrl(url) {
  if (url.length <= 80) return url;
  try {
    const u = new URL(url);
    const path = u.pathname.length > 40 ? '...' + u.pathname.slice(-37) : u.pathname;
    return u.hostname + path;
  } catch {
    return url.slice(0, 77) + '...';
  }
}

/**
 * Format bytes to human-readable.
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
