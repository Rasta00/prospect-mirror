const { URL } = require('url');

/**
 * Normalize a user-entered URL to a canonical form.
 */
function normalizeUrl(input) {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  const parsed = new URL(url);
  // Drop trailing slash for consistency (except root)
  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.href;
}

/**
 * Resolve a potentially relative URL against a base.
 */
function resolveUrl(href, base) {
  if (!href || href.startsWith('data:') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) {
    return null;
  }
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

/**
 * Extract the registrable domain (e.g. "example.com" from "www.sub.example.com").
 */
function getDomain(url) {
  try {
    const { hostname } = new URL(url);
    const parts = hostname.split('.');
    return parts.length > 2 ? parts.slice(-2).join('.') : hostname;
  } catch {
    return url;
  }
}

/**
 * Check if a URL is same-origin (same registrable domain).
 */
function isSameOrigin(urlA, urlB) {
  return getDomain(urlA) === getDomain(urlB);
}

module.exports = { normalizeUrl, resolveUrl, getDomain, isSameOrigin };
