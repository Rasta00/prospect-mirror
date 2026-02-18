/**
 * Brand extraction: logo, colors, hero images, fonts.
 *
 * Multi-source color extraction ranked by confidence:
 *   1. CSS custom properties (--primary-color, --brand-color, etc.)
 *   2. <meta name="theme-color">
 *   3. Computed body/root styles
 *   4. CSS frequency analysis
 *   5. Image dominant color (from screenshot)
 */
const cheerio = require('cheerio');
const cssTree = require('css-tree');
const { parseColor, rgbToHex, isNeutral, deduplicateColors } = require('../utils/color-utils');
const { resolveUrl } = require('../utils/url-utils');

/** CSS custom property names likely to be brand colors */
const BRAND_COLOR_PROPS = [
  'primary', 'brand', 'accent', 'main', 'theme',
  'heading', 'link', 'highlight', 'action',
];

/**
 * Extract brand assets from crawl data.
 */
async function extractBrand(crawlData, progress) {
  progress.start('brand', 'Extracting brand assets');

  const $ = cheerio.load(crawlData.rawHtml);
  const results = {
    colors: { primary: null, secondary: null, accent: null, palette: [] },
    logo: null,
    heroes: crawlData.heroes || [],
    fonts: [],
    favicon: null,
  };

  try {
    // -- Colors --
    progress.progress('brand', 20, 'Analyzing colors');
    const allColors = [];

    // Source 1: CSS custom properties
    if (crawlData.computedData?.customProps) {
      for (const [prop, value] of Object.entries(crawlData.computedData.customProps)) {
        const propName = prop.toLowerCase();
        const isBrand = BRAND_COLOR_PROPS.some(kw => propName.includes(kw));
        const color = parseColor(value);
        if (color && !isNeutral(color)) {
          allColors.push({ ...color, confidence: isBrand ? 95 : 60, source: 'css-var' });
        }
      }
    }

    // Source 2: <meta name="theme-color">
    const themeColor = crawlData.meta?.themeColor;
    if (themeColor) {
      const color = parseColor(themeColor);
      if (color && !isNeutral(color)) {
        allColors.push({ ...color, confidence: 90, source: 'meta-theme' });
      }
    }

    // Source 3: Computed styles
    if (crawlData.computedData) {
      const bodyColor = parseColor(crawlData.computedData.bodyColor);
      if (bodyColor && !isNeutral(bodyColor)) {
        allColors.push({ ...bodyColor, confidence: 50, source: 'computed-body' });
      }
    }

    // Source 4: CSS inline styles & embedded stylesheets
    progress.progress('brand', 40, 'Parsing stylesheets');
    const cssColors = extractCssColors($);
    for (const c of cssColors) {
      if (!isNeutral(c)) {
        allColors.push({ ...c, confidence: 40, source: 'css-frequency' });
      }
    }

    // Source 5: Dominant color from screenshot
    if (crawlData.screenshot) {
      try {
        const dominantColors = await extractDominantColors(crawlData.screenshot);
        for (const c of dominantColors) {
          if (!isNeutral(c)) {
            allColors.push({ ...c, confidence: 30, source: 'image-dominant' });
          }
        }
      } catch { /* non-fatal */ }
    }

    // Sort by confidence, deduplicate, pick top 3
    allColors.sort((a, b) => b.confidence - a.confidence);
    const unique = deduplicateColors(allColors);
    const nonNeutral = unique.filter(c => !isNeutral(c));

    if (nonNeutral.length >= 1) results.colors.primary = rgbToHex(nonNeutral[0]);
    if (nonNeutral.length >= 2) results.colors.secondary = rgbToHex(nonNeutral[1]);
    if (nonNeutral.length >= 3) results.colors.accent = rgbToHex(nonNeutral[2]);
    results.colors.palette = nonNeutral.slice(0, 6).map(rgbToHex);

    // -- Logo --
    progress.progress('brand', 60, 'Finding logo');
    results.logo = findLogo($, crawlData.url);

    // -- Fonts --
    progress.progress('brand', 80, 'Detecting fonts');
    results.fonts = extractFonts($, crawlData.computedData);

    // -- Favicon --
    results.favicon = findFavicon($, crawlData.url);

    progress.complete('brand', {
      primaryColor: results.colors.primary,
      hasLogo: !!results.logo,
      fontCount: results.fonts.length,
      heroCount: results.heroes.length,
    });
  } catch (err) {
    progress.fail('brand', err.message);
  }

  return results;
}

/**
 * Extract colors from embedded <style> blocks and inline styles.
 */
function extractCssColors($) {
  const colors = [];
  const colorValues = [];

  // Inline styles
  $('[style]').each((_, el) => {
    const style = $(el).attr('style') || '';
    const matches = style.match(/(#[0-9a-f]{3,8}|rgba?\([^)]+\))/gi);
    if (matches) colorValues.push(...matches);
  });

  // Embedded <style> tags (already in raw HTML — re-parse just the CSS)
  $('style').each((_, el) => {
    const cssText = $(el).html();
    if (!cssText) return;
    try {
      const ast = cssTree.parse(cssText, { parseValue: true, tolerant: true });
      cssTree.walk(ast, {
        visit: 'Value',
        enter(node) {
          const raw = cssTree.generate(node);
          const matches = raw.match(/(#[0-9a-f]{3,8}|rgba?\([^)]+\))/gi);
          if (matches) colorValues.push(...matches);
        },
      });
    } catch { /* tolerant parsing */ }
  });

  for (const v of colorValues) {
    const c = parseColor(v);
    if (c) colors.push(c);
  }

  return colors;
}

/**
 * Extract dominant colors from a screenshot buffer using sharp.
 */
async function extractDominantColors(screenshotBuffer) {
  const sharp = require('sharp');
  // Resize to tiny, then extract pixel data
  const { data, info } = await sharp(screenshotBuffer)
    .resize(50, 50, { fit: 'cover' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const colorCounts = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    // Quantize to reduce palette
    const r = Math.round(data[i] / 16) * 16;
    const g = Math.round(data[i + 1] / 16) * 16;
    const b = Math.round(data[i + 2] / 16) * 16;
    const key = `${r},${g},${b}`;
    colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
  }

  return [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return { r, g, b, a: 1 };
    });
}

/**
 * Find the site logo via common patterns.
 */
function findLogo($, baseUrl) {
  // Common logo selectors (ordered by specificity)
  const selectors = [
    'a.logo img, .logo img, #logo img, [class*="logo"] img',
    'a.brand img, .brand img, .site-logo img',
    'header img[src*="logo"], .header img[src*="logo"]',
    'img[alt*="logo" i]',
    'img[class*="logo" i]',
    'link[rel="icon"][type="image/svg+xml"]',
  ];

  for (const sel of selectors) {
    const $el = $(sel).first();
    if ($el.length) {
      const src = $el.attr('src') || $el.attr('href');
      if (src) {
        const resolved = resolveUrl(src, baseUrl);
        if (resolved) return resolved;
      }
    }
  }

  return null;
}

/**
 * Find the favicon.
 */
function findFavicon($, baseUrl) {
  const selectors = [
    'link[rel="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]',
  ];

  for (const sel of selectors) {
    const href = $(sel).first().attr('href');
    if (href) {
      return resolveUrl(href, baseUrl);
    }
  }

  return resolveUrl('/favicon.ico', baseUrl);
}

/**
 * Extract font families from computed data and @font-face rules.
 */
function extractFonts($, computedData) {
  const fonts = new Set();

  if (computedData?.bodyFont) {
    const families = computedData.bodyFont.split(',').map(f => f.trim().replace(/^["']|["']$/g, ''));
    families.forEach(f => fonts.add(f));
  }

  // Check Google Fonts links
  $('link[href*="fonts.googleapis.com"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const familyMatch = href.match(/family=([^&:]+)/);
    if (familyMatch) {
      familyMatch[1].split('|').forEach(f => fonts.add(decodeURIComponent(f.replace(/\+/g, ' '))));
    }
  });

  // Filter out generic families
  const generics = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI'];
  return [...fonts].filter(f => !generics.includes(f));
}

module.exports = { extractBrand };
