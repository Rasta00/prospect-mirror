/**
 * Chrome stripping & content extraction — ported from ContentTransformerService.php.
 *
 * "Chrome" = navigation, footers, modals, cookie bars, ads — everything that
 * is NOT the main content of the page.
 */
const cheerio = require('cheerio');
const { resolveUrl } = require('./url-utils');

// Tags to strip entirely (including contents)
const STRIP_TAGS = ['script', 'style', 'noscript', 'iframe', 'form', 'button', 'select', 'textarea', 'input', 'svg'];

// ID/class substrings that indicate "chrome" (navigation, modals, etc.)
const CHROME_PATTERNS = [
  'navi', 'nav-', 'navbar', 'menu', 'hamburger',
  'header', 'topbar', 'top-bar', 'masthead',
  'footer', 'foot-', 'bottombar',
  'sidebar', 'side-bar', 'aside',
  'cookie', 'consent', 'gdpr', 'privacy-banner',
  'modal', 'popup', 'overlay', 'lightbox', 'dialog',
  'banner-ad', 'advert', 'ad-slot', 'sponsor',
  'social-share', 'share-btn', 'sharing',
  'breadcrumb', 'skip-link', 'back-to-top',
  'search-form', 'search-bar', 'site-search',
  'login', 'signup', 'sign-up', 'register',
  'newsletter', 'subscribe', 'cta-bar',
  'chat-widget', 'chatbot', 'intercom', 'drift',
  'notification', 'alert-bar', 'announcement',
  'pagination', 'pager', 'load-more',
  'related-post', 'recommended', 'you-may-also',
  'comment-form', 'comment-list', 'disqus',
  'widget-area', 'widget-', 'sidebar-widget',
  'carousel-nav', 'slick-dots', 'swiper-pagination',
  'pace', 'preloader', 'loading-screen',
  'screen-reader', 'sr-only', 'visually-hidden',
];

// CSS selectors that typically hold main content (ordered by specificity)
const CONTENT_STRATEGIES = [
  // Page builder containers
  { name: 'elementor', selector: '.elementor-widget-container' },
  // WordPress
  { name: 'wp-content', selector: '.entry-content, .post-content, .article-content' },
  // Semantic HTML
  { name: 'main', selector: 'main, [role="main"]' },
  { name: 'article', selector: 'article' },
  // Generic CMS wrappers
  { name: 'generic', selector: '#content, .content, .page-content, .main-content, .body-content' },
];

/**
 * Strip chrome and extract the meaningful content from raw HTML.
 *
 * @param {string} html - Raw page HTML
 * @param {string} baseUrl - Page URL for resolving relative paths
 * @returns {{ cleanHtml: string, textContent: string, title: string, meta: object }}
 */
function stripAndExtract(html, baseUrl) {
  const $ = cheerio.load(html, { decodeEntities: true });

  // -- Extract metadata before stripping --
  const title = extractTitle($);
  const meta = extractMeta($);

  // -- Strip unwanted tags --
  $(STRIP_TAGS.join(',')).remove();

  // -- Strip chrome by ID/class pattern --
  CHROME_PATTERNS.forEach(pattern => {
    $(`[id*="${pattern}" i], [class*="${pattern}" i]`).each((_, el) => {
      // Don't remove if it's inside the main content area
      const $el = $(el);
      if (!$el.closest('main, article, [role="main"]').length) {
        $el.remove();
      }
    });
  });

  // Also remove common chrome elements by tag
  $('nav, header, footer, aside').each((_, el) => {
    const $el = $(el);
    // Keep <header> or <footer> inside <article> (they might hold article meta)
    if (!$el.closest('article').length) {
      $el.remove();
    }
  });

  // -- Resolve relative URLs --
  $('[src], [href]').each((_, el) => {
    const $el = $(el);
    for (const attr of ['src', 'href']) {
      const val = $el.attr(attr);
      if (val) {
        const resolved = resolveUrl(val, baseUrl);
        if (resolved) $el.attr(attr, resolved);
      }
    }
  });

  // -- Extract main content block --
  let contentHtml = '';
  for (const strategy of CONTENT_STRATEGIES) {
    const $found = $(strategy.selector);
    if ($found.length) {
      if (strategy.name === 'elementor') {
        // Collect unique widget containers
        const seen = new Set();
        const parts = [];
        $found.each((_, el) => {
          const text = $(el).text().trim();
          if (text.length > 20) {
            const key = text.toLowerCase().slice(0, 100);
            if (!seen.has(key)) {
              seen.add(key);
              parts.push($(el).html());
            }
          }
        });
        if (parts.length) {
          contentHtml = parts.join('\n\n');
          break;
        }
      } else {
        contentHtml = $found.first().html() || '';
        if (contentHtml.trim().length > 50) break;
      }
    }
  }

  // Fallback: use entire body with chrome already stripped
  if (!contentHtml || contentHtml.trim().length < 50) {
    contentHtml = $('body').html() || '';
  }

  // -- Tidy --
  const cleanHtml = tidyHtml(contentHtml);
  const textContent = cheerio.load(cleanHtml).text().replace(/\s+/g, ' ').trim();

  return { cleanHtml, textContent, title, meta };
}

/**
 * Extract page title: og:title → <h1> → <title> (strip site suffix).
 */
function extractTitle($) {
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle) return ogTitle.trim();

  const h1 = $('h1').first().text().trim();
  if (h1) return h1;

  const docTitle = $('title').text().trim();
  // Strip common site-name suffixes: "Page Title | Site Name"
  return docTitle.replace(/\s*[|–—-]\s*[^|–—-]+$/, '').trim();
}

/**
 * Extract common meta tags into an object.
 */
function extractMeta($) {
  const get = (name) =>
    $(`meta[property="${name}"], meta[name="${name}"]`).attr('content') || '';

  return {
    description: get('og:description') || get('description'),
    image: get('og:image'),
    siteName: get('og:site_name'),
    type: get('og:type'),
    themeColor: get('theme-color'),
    generator: get('generator'),
  };
}

/**
 * Tidy up extracted HTML: remove empty paragraphs, collapse whitespace.
 */
function tidyHtml(html) {
  return html
    .replace(/<p[^>]*>\s*<\/p>/gi, '')               // empty <p>
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')     // excessive <br>
    .replace(/\n{3,}/g, '\n\n')                        // excessive newlines
    .trim();
}

/**
 * Extract all image URLs from HTML, resolved to absolute.
 */
function extractImages($, baseUrl) {
  const images = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
    if (src) {
      const resolved = resolveUrl(src, baseUrl);
      if (resolved) {
        const alt = $(el).attr('alt') || '';
        const width = parseInt($(el).attr('width'), 10) || 0;
        const height = parseInt($(el).attr('height'), 10) || 0;
        images.push({ src: resolved, alt, width, height });
      }
    }
  });
  return images;
}

/**
 * Find hero images: large images near the top of the page.
 * Heuristics: og:image, or first large image, or background images in hero sections.
 */
function extractHeroImages($, baseUrl) {
  const heroes = [];

  // 1. OG image
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) {
    const resolved = resolveUrl(ogImage, baseUrl);
    if (resolved) heroes.push({ src: resolved, source: 'og:image' });
  }

  // 2. First large image (width > 600 or no dimensions but in hero/banner container)
  $('img').each((i, el) => {
    if (heroes.length >= 3) return false;
    const $el = $(el);
    const src = $el.attr('src') || $el.attr('data-src');
    if (!src) return;
    const resolved = resolveUrl(src, baseUrl);
    if (!resolved) return;
    if (heroes.some(h => h.src === resolved)) return;

    const width = parseInt($el.attr('width'), 10) || 0;
    const parentClasses = ($el.parent().attr('class') || '') + ' ' + ($el.closest('section, div').attr('class') || '');
    const isHeroContainer = /hero|banner|jumbotron|cover|splash|feature/i.test(parentClasses);

    if (width > 600 || isHeroContainer || i < 3) {
      heroes.push({ src: resolved, source: isHeroContainer ? 'hero-container' : 'large-image' });
    }
  });

  return heroes;
}

module.exports = {
  stripAndExtract,
  extractTitle,
  extractMeta,
  extractImages,
  extractHeroImages,
  tidyHtml,
  CHROME_PATTERNS,
  CONTENT_STRATEGIES,
};
