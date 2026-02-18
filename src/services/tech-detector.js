/**
 * CMS / framework / platform detection via weighted signature matching.
 * Ported from SignatureLibrary.php URL signal detection approach.
 *
 * Each signature has:
 *   - patterns: things to look for in HTML/headers
 *   - weight: base confidence for each match
 *
 * Total score > threshold = detected.
 */

/**
 * Platform signature definitions.
 * Each entry: { name, category, patterns: [{ check, weight }] }
 */
const SIGNATURES = [
  // -- CMS Platforms --
  {
    name: 'WordPress',
    category: 'cms',
    icon: 'wordpress',
    patterns: [
      { check: 'meta_generator', regex: /wordpress/i, weight: 30 },
      { check: 'html', regex: /wp-content\/(?:themes|plugins)/i, weight: 25 },
      { check: 'html', regex: /wp-includes\//i, weight: 20 },
      { check: 'html', regex: /wp-json/i, weight: 15 },
      { check: 'header', key: 'x-powered-by', regex: /wordpress/i, weight: 20 },
      { check: 'header', key: 'link', regex: /wp-json/i, weight: 15 },
      { check: 'html', regex: /class="[^"]*wp-/i, weight: 10 },
      { check: 'html', regex: /xmlrpc\.php/i, weight: 10 },
    ],
  },
  {
    name: 'Drupal',
    category: 'cms',
    icon: 'drupal',
    patterns: [
      { check: 'meta_generator', regex: /drupal/i, weight: 30 },
      { check: 'html', regex: /sites\/default\/files/i, weight: 25 },
      { check: 'html', regex: /drupal\.js|drupal\.settings/i, weight: 25 },
      { check: 'header', key: 'x-drupal-cache', regex: /./, weight: 30 },
      { check: 'header', key: 'x-generator', regex: /drupal/i, weight: 30 },
      { check: 'html', regex: /class="[^"]*drupal-/i, weight: 10 },
      { check: 'html', regex: /\/core\/misc\/drupal/i, weight: 20 },
      { check: 'html', regex: /data-drupal-/i, weight: 15 },
    ],
  },
  {
    name: 'Sitecore',
    category: 'cms',
    icon: 'sitecore',
    patterns: [
      { check: 'html', regex: /sitecore/i, weight: 15 },
      { check: 'html', regex: /\/sitecore\/shell/i, weight: 30 },
      { check: 'html', regex: /sc_site|sc_lang|sc_mode/i, weight: 25 },
      { check: 'html', regex: /\/-\/media\//i, weight: 20 },
      { check: 'html', regex: /scf\d+|SCForm/i, weight: 20 },
      { check: 'header', key: 'set-cookie', regex: /SC_ANALYTICS/i, weight: 20 },
      { check: 'html', regex: /Sitecore\.Context/i, weight: 25 },
      { check: 'html', regex: /\/layouts\/system/i, weight: 15 },
    ],
  },
  {
    name: 'Adobe Experience Manager',
    category: 'cms',
    icon: 'aem',
    patterns: [
      { check: 'html', regex: /\/etc\.clientlibs\//i, weight: 25 },
      { check: 'html', regex: /\/content\/dam\//i, weight: 25 },
      { check: 'html', regex: /cq-(?:dd|wcm|authoring)/i, weight: 25 },
      { check: 'html', regex: /adobe.*experience/i, weight: 10 },
      { check: 'html', regex: /\/etc\/designs\//i, weight: 20 },
      { check: 'html', regex: /granite\.ui/i, weight: 20 },
      { check: 'html', regex: /aem-/i, weight: 10 },
      { check: 'header', key: 'x-powered-by', regex: /day.*cq|communique/i, weight: 25 },
    ],
  },
  {
    name: 'Contentful',
    category: 'cms',
    icon: 'contentful',
    patterns: [
      { check: 'html', regex: /contentful/i, weight: 15 },
      { check: 'html', regex: /ctfl-/i, weight: 20 },
      { check: 'html', regex: /images\.ctfassets\.net/i, weight: 30 },
      { check: 'html', regex: /cdn\.contentful\.com/i, weight: 30 },
      { check: 'meta_generator', regex: /contentful/i, weight: 30 },
    ],
  },
  {
    name: 'HubSpot CMS',
    category: 'cms',
    icon: 'hubspot',
    patterns: [
      { check: 'html', regex: /hubspot/i, weight: 10 },
      { check: 'html', regex: /hs-scripts\.com|js\.hs-scripts/i, weight: 20 },
      { check: 'html', regex: /hbspt\.forms/i, weight: 20 },
      { check: 'html', regex: /hs_cos_wrapper/i, weight: 25 },
      { check: 'meta_generator', regex: /hubspot/i, weight: 30 },
      { check: 'header', key: 'x-powered-by', regex: /hubspot/i, weight: 25 },
    ],
  },

  // -- Frameworks --
  {
    name: 'React',
    category: 'framework',
    icon: 'react',
    patterns: [
      { check: 'html', regex: /react/i, weight: 5 },
      { check: 'html', regex: /data-reactroot|data-reactid|__react/i, weight: 25 },
      { check: 'html', regex: /_next\/static/i, weight: 20 },  // Next.js (React)
      { check: 'html', regex: /next\.js|__next/i, weight: 20 },
    ],
  },
  {
    name: 'Vue.js',
    category: 'framework',
    icon: 'vue',
    patterns: [
      { check: 'html', regex: /data-v-[a-f0-9]/i, weight: 25 },
      { check: 'html', regex: /vue\.js|vuejs/i, weight: 15 },
      { check: 'html', regex: /__nuxt|nuxt\.js/i, weight: 25 },  // Nuxt (Vue)
    ],
  },
  {
    name: 'Angular',
    category: 'framework',
    icon: 'angular',
    patterns: [
      { check: 'html', regex: /ng-version|ng-app/i, weight: 25 },
      { check: 'html', regex: /_ngcontent-|_nghost-/i, weight: 25 },
      { check: 'html', regex: /angular\.(?:js|min\.js)/i, weight: 20 },
    ],
  },

  // -- E-Commerce --
  {
    name: 'Shopify',
    category: 'ecommerce',
    icon: 'shopify',
    patterns: [
      { check: 'html', regex: /shopify/i, weight: 10 },
      { check: 'html', regex: /cdn\.shopify\.com/i, weight: 25 },
      { check: 'html', regex: /Shopify\.theme/i, weight: 25 },
      { check: 'meta_generator', regex: /shopify/i, weight: 30 },
    ],
  },
  {
    name: 'Magento',
    category: 'ecommerce',
    icon: 'magento',
    patterns: [
      { check: 'html', regex: /magento|mage-/i, weight: 15 },
      { check: 'html', regex: /\/static\/version/i, weight: 20 },
      { check: 'html', regex: /Magento_/i, weight: 25 },
      { check: 'header', key: 'x-magento-', regex: /./, weight: 25 },
    ],
  },

  // -- Hosting / CDN / Infrastructure --
  {
    name: 'Acquia',
    category: 'hosting',
    icon: 'acquia',
    patterns: [
      { check: 'header', key: 'x-ah-environment', regex: /./, weight: 30 },
      { check: 'header', key: 'x-cache', regex: /acquia/i, weight: 25 },
      { check: 'html', regex: /acquia/i, weight: 5 },
    ],
  },
  {
    name: 'Pantheon',
    category: 'hosting',
    icon: 'pantheon',
    patterns: [
      { check: 'header', key: 'x-pantheon-styx-hostname', regex: /./, weight: 30 },
      { check: 'header', key: 'server', regex: /pantheon/i, weight: 25 },
    ],
  },
  {
    name: 'WP Engine',
    category: 'hosting',
    icon: 'wpengine',
    patterns: [
      { check: 'header', key: 'x-powered-by', regex: /wp engine/i, weight: 25 },
      { check: 'header', key: 'wpe-backend', regex: /./, weight: 30 },
    ],
  },
  {
    name: 'Cloudflare',
    category: 'cdn',
    icon: 'cloudflare',
    patterns: [
      { check: 'header', key: 'cf-ray', regex: /./, weight: 30 },
      { check: 'header', key: 'server', regex: /cloudflare/i, weight: 25 },
    ],
  },
  {
    name: 'Vercel',
    category: 'hosting',
    icon: 'vercel',
    patterns: [
      { check: 'header', key: 'x-vercel-id', regex: /./, weight: 30 },
      { check: 'header', key: 'server', regex: /vercel/i, weight: 25 },
    ],
  },
  {
    name: 'Netlify',
    category: 'hosting',
    icon: 'netlify',
    patterns: [
      { check: 'header', key: 'x-nf-request-id', regex: /./, weight: 30 },
      { check: 'header', key: 'server', regex: /netlify/i, weight: 25 },
    ],
  },

  // -- Analytics / Tag Managers --
  {
    name: 'Google Analytics',
    category: 'analytics',
    icon: 'ga',
    patterns: [
      { check: 'html', regex: /google-analytics\.com\/(?:analytics|ga)\.js/i, weight: 25 },
      { check: 'html', regex: /gtag\(|googletagmanager/i, weight: 25 },
      { check: 'html', regex: /UA-\d{4,10}-\d{1,4}|G-[A-Z0-9]+/i, weight: 20 },
    ],
  },
  {
    name: 'Google Tag Manager',
    category: 'analytics',
    icon: 'gtm',
    patterns: [
      { check: 'html', regex: /googletagmanager\.com\/gtm\.js/i, weight: 25 },
      { check: 'html', regex: /GTM-[A-Z0-9]+/i, weight: 20 },
    ],
  },
];

/** Detection threshold — a platform must score above this to be "detected" */
const DETECTION_THRESHOLD = 25;

/**
 * Detect technologies from crawl data.
 *
 * @param {object} crawlData - Merged crawl result
 * @param {object} progress - ProgressEmitter
 * @returns {{ detected: object[], summary: object }}
 */
function detectTech(crawlData, progress) {
  progress.start('techDetect', 'Detecting technology stack');

  const html = crawlData.rawHtml || '';
  const headers = crawlData.headers || {};
  const generator = crawlData.meta?.generator || '';

  const detected = [];

  for (const sig of SIGNATURES) {
    let score = 0;
    const matches = [];

    for (const pattern of sig.patterns) {
      let matched = false;

      switch (pattern.check) {
        case 'html':
          matched = pattern.regex.test(html);
          break;
        case 'header':
          if (pattern.key) {
            // Check exact key and also fuzzy (key prefix for x-magento-*)
            const val = headers[pattern.key] || headers[pattern.key.toLowerCase()] || '';
            matched = pattern.regex.test(val);
            // Also check all headers for key prefix matches
            if (!matched && pattern.key.endsWith('-')) {
              matched = Object.keys(headers).some(k => k.startsWith(pattern.key));
            }
          }
          break;
        case 'meta_generator':
          matched = pattern.regex.test(generator);
          break;
      }

      if (matched) {
        score += pattern.weight;
        matches.push(pattern.check === 'header' ? `header:${pattern.key}` : pattern.check);
      }
    }

    if (score >= DETECTION_THRESHOLD) {
      detected.push({
        name: sig.name,
        category: sig.category,
        icon: sig.icon,
        score,
        confidence: Math.min(100, Math.round((score / sig.patterns.reduce((s, p) => s + p.weight, 0)) * 100)),
        matches,
      });
    }
  }

  // Sort by score descending
  detected.sort((a, b) => b.score - a.score);

  // Categorize
  const summary = {
    cms: detected.filter(d => d.category === 'cms'),
    framework: detected.filter(d => d.category === 'framework'),
    ecommerce: detected.filter(d => d.category === 'ecommerce'),
    hosting: detected.filter(d => d.category === 'hosting' || d.category === 'cdn'),
    analytics: detected.filter(d => d.category === 'analytics'),
  };

  // The primary CMS is the highest-scoring one
  const primaryCms = summary.cms[0]?.name || 'Unknown';

  progress.complete('techDetect', {
    primaryCms,
    totalDetected: detected.length,
    categories: Object.keys(summary).filter(k => summary[k].length > 0),
  });

  return { detected, summary, primaryCms };
}

module.exports = { detectTech, SIGNATURES, DETECTION_THRESHOLD };
