/**
 * Technology detection via weighted signature matching + AI enrichment.
 *
 * Detection sources:
 *   1. HTML content patterns (class names, inline scripts, comments)
 *   2. Script src URLs (e.g., cdn.shopify.com, gtm.js)
 *   3. Stylesheet/link URLs
 *   4. HTTP response headers (server, x-powered-by, cookies)
 *   5. Meta tags (generator, etc.)
 *   6. Gemini AI secondary analysis (optional)
 */
const config = require('../../config/default');

// ─── Category Labels ──────────────────────────────────────────────
const CATEGORY_LABELS = {
  cms: 'Content Management',
  framework: 'JavaScript Frameworks',
  jslib: 'JavaScript Libraries',
  css: 'CSS & UI Frameworks',
  ecommerce: 'E-Commerce',
  analytics: 'Analytics & Tracking',
  marketing: 'Marketing Automation',
  testing: 'A/B Testing & Optimization',
  personalization: 'Personalization',
  chat: 'Chat & Support',
  cdn: 'CDN & Performance',
  hosting: 'Hosting & Infrastructure',
  server: 'Server Technology',
  security: 'Security',
  media: 'Media & Video',
  fonts: 'Fonts & Icons',
  consent: 'Privacy & Consent',
  payment: 'Payment',
  accessibility: 'Accessibility',
  tag_manager: 'Tag Management',
  ai_detected: 'Other (AI-Detected)',
};

// ─── Signature Definitions ──────────────────────────────────────
// Check types:
//   html         — regex against raw HTML
//   script_url   — regex against <script src="..."> URLs
//   link_url     — regex against <link href="..."> URLs
//   header       — regex against response header value (key required)
//   meta_generator — regex against <meta name="generator"> content
//   cookie       — regex against Set-Cookie header
const SIGNATURES = [

  // ── CMS & Website Builders ──────────────────────────────────
  {
    name: 'WordPress', category: 'cms',
    website: 'wordpress.org',
    patterns: [
      { check: 'meta_generator', regex: /wordpress\s*([\d.]+)?/i, weight: 30, version: 1 },
      { check: 'html', regex: /wp-content\/(?:themes|plugins)/i, weight: 25 },
      { check: 'html', regex: /wp-includes\//i, weight: 20 },
      { check: 'script_url', regex: /wp-includes|wp-content/i, weight: 20 },
      { check: 'header', key: 'link', regex: /wp-json/i, weight: 15 },
      { check: 'html', regex: /class="[^"]*wp-/i, weight: 10 },
    ],
  },
  {
    name: 'Drupal', category: 'cms',
    website: 'drupal.org',
    patterns: [
      { check: 'meta_generator', regex: /drupal\s*([\d.]+)?/i, weight: 30, version: 1 },
      { check: 'html', regex: /sites\/default\/files/i, weight: 25 },
      { check: 'header', key: 'x-drupal-cache', regex: /./, weight: 30 },
      { check: 'header', key: 'x-generator', regex: /drupal/i, weight: 30 },
      { check: 'html', regex: /data-drupal-/i, weight: 20 },
      { check: 'script_url', regex: /\/core\/misc\/drupal/i, weight: 20 },
    ],
  },
  {
    name: 'Sitecore', category: 'cms',
    website: 'sitecore.com',
    patterns: [
      { check: 'html', regex: /\/sitecore\/shell/i, weight: 30 },
      { check: 'html', regex: /sc_site|sc_lang|sc_mode/i, weight: 25 },
      { check: 'html', regex: /\/-\/media\//i, weight: 20 },
      { check: 'cookie', regex: /SC_ANALYTICS/i, weight: 20 },
      { check: 'html', regex: /Sitecore\.Context/i, weight: 25 },
    ],
  },
  {
    name: 'Adobe Experience Manager', category: 'cms',
    website: 'business.adobe.com/products/experience-manager',
    patterns: [
      { check: 'html', regex: /\/etc\.clientlibs\//i, weight: 25 },
      { check: 'html', regex: /\/content\/dam\//i, weight: 25 },
      { check: 'html', regex: /cq-(?:dd|wcm|authoring)/i, weight: 25 },
      { check: 'html', regex: /\/etc\/designs\//i, weight: 20 },
      { check: 'header', key: 'x-powered-by', regex: /day.*cq|communique/i, weight: 25 },
    ],
  },
  {
    name: 'Contentful', category: 'cms',
    website: 'contentful.com',
    patterns: [
      { check: 'html', regex: /images\.ctfassets\.net/i, weight: 30 },
      { check: 'html', regex: /cdn\.contentful\.com/i, weight: 30 },
      { check: 'meta_generator', regex: /contentful/i, weight: 30 },
      { check: 'html', regex: /ctfl-/i, weight: 20 },
    ],
  },
  {
    name: 'HubSpot CMS', category: 'cms',
    website: 'hubspot.com/products/cms',
    patterns: [
      { check: 'html', regex: /hs_cos_wrapper/i, weight: 25 },
      { check: 'meta_generator', regex: /hubspot/i, weight: 30 },
      { check: 'header', key: 'x-powered-by', regex: /hubspot/i, weight: 25 },
      { check: 'script_url', regex: /js\.hs-scripts\.com/i, weight: 20 },
    ],
  },
  {
    name: 'Squarespace', category: 'cms',
    website: 'squarespace.com',
    patterns: [
      { check: 'meta_generator', regex: /squarespace/i, weight: 30 },
      { check: 'html', regex: /static\.squarespace\.com/i, weight: 25 },
      { check: 'html', regex: /sqsp-/i, weight: 20 },
      { check: 'script_url', regex: /squarespace\.com/i, weight: 20 },
    ],
  },
  {
    name: 'Wix', category: 'cms',
    website: 'wix.com',
    patterns: [
      { check: 'meta_generator', regex: /wix\.com/i, weight: 30 },
      { check: 'html', regex: /static\.wixstatic\.com|wix-code-sdk/i, weight: 25 },
      { check: 'script_url', regex: /parastorage\.com|static\.wixstatic\.com/i, weight: 25 },
      { check: 'header', key: 'x-wix-request-id', regex: /./, weight: 25 },
    ],
  },
  {
    name: 'Webflow', category: 'cms',
    website: 'webflow.com',
    patterns: [
      { check: 'meta_generator', regex: /webflow/i, weight: 30 },
      { check: 'html', regex: /webflow\.com/i, weight: 10 },
      { check: 'script_url', regex: /assets\.website-files\.com|webflow\.js/i, weight: 25 },
      { check: 'html', regex: /class="[^"]*w-/i, weight: 15 },
    ],
  },
  {
    name: 'Joomla', category: 'cms',
    website: 'joomla.org',
    patterns: [
      { check: 'meta_generator', regex: /joomla/i, weight: 30 },
      { check: 'html', regex: /\/components\/com_/i, weight: 25 },
      { check: 'html', regex: /\/media\/jui\/js/i, weight: 20 },
      { check: 'script_url', regex: /media\/jui|media\/system/i, weight: 20 },
    ],
  },
  {
    name: 'Ghost', category: 'cms',
    website: 'ghost.org',
    patterns: [
      { check: 'meta_generator', regex: /ghost\s*([\d.]+)?/i, weight: 30, version: 1 },
      { check: 'html', regex: /ghost-(?:header|footer|content)/i, weight: 20 },
      { check: 'link_url', regex: /ghost\.(?:org|io)/i, weight: 20 },
    ],
  },
  {
    name: 'Kentico', category: 'cms',
    website: 'kentico.com',
    patterns: [
      { check: 'meta_generator', regex: /kentico/i, weight: 30 },
      { check: 'html', regex: /CMSPages|CMSModules/i, weight: 25 },
      { check: 'html', regex: /kentico/i, weight: 10 },
    ],
  },
  {
    name: 'Sitefinity', category: 'cms',
    website: 'progress.com/sitefinity-cms',
    patterns: [
      { check: 'html', regex: /Telerik\.Sitefinity|sfPageEditor/i, weight: 30 },
      { check: 'html', regex: /sitefinity/i, weight: 15 },
      { check: 'script_url', regex: /sitefinity/i, weight: 20 },
    ],
  },
  {
    name: 'Optimizely CMS', category: 'cms',
    website: 'optimizely.com',
    patterns: [
      { check: 'html', regex: /EPiServer|episerver/i, weight: 30 },
      { check: 'meta_generator', regex: /episerver|optimizely/i, weight: 30 },
      { check: 'header', key: 'x-powered-by', regex: /episerver/i, weight: 25 },
    ],
  },
  {
    name: 'Umbraco', category: 'cms',
    website: 'umbraco.com',
    patterns: [
      { check: 'html', regex: /umbraco/i, weight: 15 },
      { check: 'meta_generator', regex: /umbraco/i, weight: 30 },
      { check: 'header', key: 'x-umbraco-version', regex: /./, weight: 30 },
    ],
  },
  {
    name: 'Craft CMS', category: 'cms',
    website: 'craftcms.com',
    patterns: [
      { check: 'meta_generator', regex: /craft\s*cms/i, weight: 30 },
      { check: 'html', regex: /craftcms/i, weight: 15 },
      { check: 'header', key: 'x-powered-by', regex: /craft\s*cms/i, weight: 25 },
    ],
  },

  // ── JavaScript Frameworks ──────────────────────────────────
  {
    name: 'React', category: 'framework',
    website: 'react.dev',
    patterns: [
      { check: 'html', regex: /data-reactroot|data-reactid|__react/i, weight: 25 },
      { check: 'html', regex: /react-dom/i, weight: 15 },
      { check: 'script_url', regex: /react(?:\.production|\.development)?\.min\.js/i, weight: 20 },
    ],
  },
  {
    name: 'Next.js', category: 'framework',
    website: 'nextjs.org',
    patterns: [
      { check: 'html', regex: /_next\/static/i, weight: 25 },
      { check: 'html', regex: /__next|__NEXT_DATA__/i, weight: 25 },
      { check: 'header', key: 'x-nextjs-cache', regex: /./, weight: 30 },
      { check: 'header', key: 'x-powered-by', regex: /next\.js/i, weight: 25 },
    ],
  },
  {
    name: 'Vue.js', category: 'framework',
    website: 'vuejs.org',
    patterns: [
      { check: 'html', regex: /data-v-[a-f0-9]/i, weight: 25 },
      { check: 'script_url', regex: /vue(?:\.min)?\.js/i, weight: 20 },
      { check: 'html', regex: /v-cloak|v-bind|v-on:/i, weight: 20 },
    ],
  },
  {
    name: 'Nuxt.js', category: 'framework',
    website: 'nuxt.com',
    patterns: [
      { check: 'html', regex: /__nuxt|nuxt\.js/i, weight: 25 },
      { check: 'html', regex: /_nuxt\//i, weight: 25 },
      { check: 'header', key: 'x-powered-by', regex: /nuxt/i, weight: 25 },
    ],
  },
  {
    name: 'Angular', category: 'framework',
    website: 'angular.dev',
    patterns: [
      { check: 'html', regex: /ng-version="([\d.]+)"/i, weight: 25, version: 1 },
      { check: 'html', regex: /_ngcontent-|_nghost-/i, weight: 25 },
      { check: 'html', regex: /ng-app/i, weight: 15 },
    ],
  },
  {
    name: 'Gatsby', category: 'framework',
    website: 'gatsbyjs.com',
    patterns: [
      { check: 'meta_generator', regex: /gatsby\s*([\d.]+)?/i, weight: 30, version: 1 },
      { check: 'html', regex: /___gatsby/i, weight: 25 },
      { check: 'script_url', regex: /gatsby/i, weight: 15 },
    ],
  },
  {
    name: 'Svelte', category: 'framework',
    website: 'svelte.dev',
    patterns: [
      { check: 'html', regex: /svelte-[a-z0-9]+/i, weight: 25 },
      { check: 'script_url', regex: /svelte/i, weight: 15 },
    ],
  },

  // ── JavaScript Libraries ──────────────────────────────────
  {
    name: 'jQuery', category: 'jslib',
    website: 'jquery.com',
    patterns: [
      { check: 'script_url', regex: /jquery[.-]([\d.]+)/i, weight: 25, version: 1 },
      { check: 'script_url', regex: /jquery(?:\.min)?\.js/i, weight: 25 },
      { check: 'html', regex: /jQuery\s*(?:v|\.fn\.jquery\s*=\s*["'])([\d.]+)/i, weight: 15, version: 1 },
    ],
  },
  {
    name: 'jQuery UI', category: 'jslib',
    website: 'jqueryui.com',
    patterns: [
      { check: 'script_url', regex: /jquery-ui|jquery\.ui/i, weight: 25 },
      { check: 'link_url', regex: /jquery-ui|jquery\.ui/i, weight: 20 },
    ],
  },
  {
    name: 'Lodash', category: 'jslib',
    website: 'lodash.com',
    patterns: [
      { check: 'script_url', regex: /lodash(?:\.min)?\.js/i, weight: 30 },
      { check: 'html', regex: /\b_\.(?:map|filter|reduce|each|find)\b/, weight: 15 },
    ],
  },
  {
    name: 'GSAP', category: 'jslib',
    website: 'gsap.com',
    patterns: [
      { check: 'script_url', regex: /gsap|greensock/i, weight: 30 },
      { check: 'html', regex: /gsap\.|TweenMax|TweenLite|TimelineMax/i, weight: 20 },
    ],
  },
  {
    name: 'Swiper', category: 'jslib',
    website: 'swiperjs.com',
    patterns: [
      { check: 'script_url', regex: /swiper(?:\.min)?\.js/i, weight: 25 },
      { check: 'link_url', regex: /swiper(?:\.min)?\.css/i, weight: 20 },
      { check: 'html', regex: /swiper-container|swiper-slide/i, weight: 15 },
    ],
  },
  {
    name: 'Slick Slider', category: 'jslib',
    website: 'kenwheeler.github.io/slick',
    patterns: [
      { check: 'script_url', regex: /slick(?:\.min)?\.js/i, weight: 25 },
      { check: 'html', regex: /slick-slider|slick-track/i, weight: 20 },
    ],
  },

  // ── CSS & UI Frameworks ──────────────────────────────────
  {
    name: 'Bootstrap', category: 'css',
    website: 'getbootstrap.com',
    patterns: [
      { check: 'link_url', regex: /bootstrap[.-]([\d.]+)/i, weight: 25, version: 1 },
      { check: 'link_url', regex: /bootstrap(?:\.min)?\.css/i, weight: 25 },
      { check: 'script_url', regex: /bootstrap(?:\.bundle)?(?:\.min)?\.js/i, weight: 20 },
      { check: 'html', regex: /class="[^"]*\bcol-(?:xs|sm|md|lg|xl)-\d/i, weight: 15 },
    ],
  },
  {
    name: 'Tailwind CSS', category: 'css',
    website: 'tailwindcss.com',
    patterns: [
      { check: 'html', regex: /class="[^"]*\b(?:flex|grid|bg-|text-|px-|py-|mt-|mb-|rounded-|shadow-)\b[^"]*"/i, weight: 10 },
      { check: 'link_url', regex: /tailwind/i, weight: 25 },
      { check: 'script_url', regex: /tailwindcss|tailwind/i, weight: 25 },
      { check: 'html', regex: /tailwindcss/i, weight: 20 },
    ],
  },
  {
    name: 'Material UI', category: 'css',
    website: 'mui.com',
    patterns: [
      { check: 'html', regex: /class="[^"]*Mui[A-Z]/i, weight: 25 },
      { check: 'html', regex: /mui-/i, weight: 15 },
      { check: 'script_url', regex: /@mui|material-ui/i, weight: 20 },
    ],
  },
  {
    name: 'Font Awesome', category: 'fonts',
    website: 'fontawesome.com',
    patterns: [
      { check: 'link_url', regex: /font-?awesome/i, weight: 25 },
      { check: 'script_url', regex: /fontawesome|font-awesome/i, weight: 25 },
      { check: 'html', regex: /class="[^"]*\bfa[srlbd]?\s+fa-/i, weight: 20 },
    ],
  },
  {
    name: 'Google Fonts', category: 'fonts',
    website: 'fonts.google.com',
    patterns: [
      { check: 'link_url', regex: /fonts\.googleapis\.com/i, weight: 30 },
      { check: 'link_url', regex: /fonts\.gstatic\.com/i, weight: 25 },
    ],
  },
  {
    name: 'Adobe Fonts', category: 'fonts',
    website: 'fonts.adobe.com',
    patterns: [
      { check: 'link_url', regex: /use\.typekit\.net/i, weight: 30 },
      { check: 'script_url', regex: /use\.typekit\.net/i, weight: 25 },
    ],
  },

  // ── E-Commerce ──────────────────────────────────
  {
    name: 'Shopify', category: 'ecommerce',
    website: 'shopify.com',
    patterns: [
      { check: 'html', regex: /cdn\.shopify\.com/i, weight: 25 },
      { check: 'html', regex: /Shopify\.theme/i, weight: 25 },
      { check: 'meta_generator', regex: /shopify/i, weight: 30 },
      { check: 'script_url', regex: /cdn\.shopify\.com/i, weight: 20 },
    ],
  },
  {
    name: 'Magento', category: 'ecommerce',
    website: 'business.adobe.com/products/magento',
    patterns: [
      { check: 'html', regex: /\/static\/version/i, weight: 20 },
      { check: 'html', regex: /Magento_|mage-/i, weight: 25 },
      { check: 'cookie', regex: /PHPSESSID.*mage|form_key/i, weight: 15 },
      { check: 'html', regex: /mage\/cookies/i, weight: 20 },
    ],
  },
  {
    name: 'WooCommerce', category: 'ecommerce',
    website: 'woocommerce.com',
    patterns: [
      { check: 'html', regex: /woocommerce/i, weight: 15 },
      { check: 'script_url', regex: /woocommerce|wc-/i, weight: 25 },
      { check: 'html', regex: /wc-block-|wc_add_to_cart/i, weight: 25 },
    ],
  },
  {
    name: 'BigCommerce', category: 'ecommerce',
    website: 'bigcommerce.com',
    patterns: [
      { check: 'html', regex: /bigcommerce/i, weight: 15 },
      { check: 'script_url', regex: /bigcommerce\.com/i, weight: 25 },
      { check: 'header', key: 'x-bc-', regex: /./, weight: 25 },
    ],
  },
  {
    name: 'Salesforce Commerce Cloud', category: 'ecommerce',
    website: 'salesforce.com/commerce',
    patterns: [
      { check: 'html', regex: /demandware\.static|demandware\.edgekey/i, weight: 30 },
      { check: 'script_url', regex: /demandware/i, weight: 25 },
      { check: 'html', regex: /sfcc|SFRA/i, weight: 15 },
    ],
  },

  // ── Analytics & Tracking ──────────────────────────────────
  {
    name: 'Google Analytics', category: 'analytics',
    website: 'analytics.google.com',
    patterns: [
      { check: 'script_url', regex: /google-analytics\.com\/(?:analytics|ga)\.js/i, weight: 25 },
      { check: 'script_url', regex: /googletagmanager\.com\/gtag/i, weight: 25 },
      { check: 'html', regex: /UA-\d{4,10}-\d{1,4}|G-[A-Z0-9]{4,}/i, weight: 20 },
    ],
  },
  {
    name: 'Google Tag Manager', category: 'tag_manager',
    website: 'tagmanager.google.com',
    patterns: [
      { check: 'script_url', regex: /googletagmanager\.com\/gtm\.js/i, weight: 30 },
      { check: 'html', regex: /GTM-[A-Z0-9]{4,}/i, weight: 20 },
    ],
  },
  {
    name: 'Adobe Analytics', category: 'analytics',
    website: 'business.adobe.com/products/analytics',
    patterns: [
      { check: 'script_url', regex: /AppMeasurement|s_code/i, weight: 25 },
      { check: 'html', regex: /omniture|s_account|s\.pageName/i, weight: 20 },
      { check: 'script_url', regex: /adobedtm\.com|demdex\.net/i, weight: 25 },
    ],
  },
  {
    name: 'Adobe Launch', category: 'tag_manager',
    website: 'business.adobe.com/products/experience-platform/launch',
    patterns: [
      { check: 'script_url', regex: /assets\.adobedtm\.com\/launch/i, weight: 30 },
      { check: 'script_url', regex: /adobedtm\.com/i, weight: 20 },
    ],
  },
  {
    name: 'Segment', category: 'analytics',
    website: 'segment.com',
    patterns: [
      { check: 'script_url', regex: /cdn\.segment\.com/i, weight: 30 },
      { check: 'html', regex: /analytics\.load\(|analytics\.track\(/i, weight: 20 },
    ],
  },
  {
    name: 'Hotjar', category: 'analytics',
    website: 'hotjar.com',
    patterns: [
      { check: 'script_url', regex: /static\.hotjar\.com/i, weight: 30 },
      { check: 'html', regex: /hotjar|_hjSettings/i, weight: 20 },
    ],
  },
  {
    name: 'Heap', category: 'analytics',
    website: 'heap.io',
    patterns: [
      { check: 'script_url', regex: /cdn\.heapanalytics\.com/i, weight: 30 },
      { check: 'html', regex: /heap\.load\(/i, weight: 20 },
    ],
  },
  {
    name: 'Mixpanel', category: 'analytics',
    website: 'mixpanel.com',
    patterns: [
      { check: 'script_url', regex: /cdn\.mxpnl\.com|mixpanel/i, weight: 30 },
      { check: 'html', regex: /mixpanel\.init\(/i, weight: 20 },
    ],
  },
  {
    name: 'Microsoft Clarity', category: 'analytics',
    website: 'clarity.microsoft.com',
    patterns: [
      { check: 'script_url', regex: /clarity\.ms/i, weight: 30 },
      { check: 'html', regex: /clarity\s*\(\s*["']set["']/i, weight: 15 },
    ],
  },
  {
    name: 'Facebook Pixel', category: 'analytics',
    website: 'facebook.com/business',
    patterns: [
      { check: 'script_url', regex: /connect\.facebook\.net/i, weight: 20 },
      { check: 'html', regex: /fbq\s*\(\s*['"]init['"]/i, weight: 25 },
      { check: 'html', regex: /facebook\.com\/tr\?/i, weight: 20 },
    ],
  },
  {
    name: 'LinkedIn Insight Tag', category: 'analytics',
    website: 'linkedin.com',
    patterns: [
      { check: 'script_url', regex: /snap\.licdn\.com/i, weight: 30 },
      { check: 'html', regex: /_linkedin_partner_id/i, weight: 20 },
    ],
  },
  {
    name: 'Pinterest Tag', category: 'analytics',
    website: 'pinterest.com',
    patterns: [
      { check: 'script_url', regex: /s\.pinimg\.com\/ct\/core\.js/i, weight: 30 },
      { check: 'html', regex: /pintrk\s*\(/i, weight: 20 },
    ],
  },
  {
    name: 'Crazy Egg', category: 'analytics',
    website: 'crazyegg.com',
    patterns: [
      { check: 'script_url', regex: /script\.crazyegg\.com/i, weight: 30 },
    ],
  },
  {
    name: 'FullStory', category: 'analytics',
    website: 'fullstory.com',
    patterns: [
      { check: 'script_url', regex: /fullstory\.com\/s\/fs\.js/i, weight: 30 },
      { check: 'html', regex: /FS\.identify\(|window\['_fs_/i, weight: 20 },
    ],
  },

  // ── Marketing Automation ──────────────────────────────────
  {
    name: 'HubSpot', category: 'marketing',
    website: 'hubspot.com',
    patterns: [
      { check: 'script_url', regex: /js\.hs-scripts\.com|js\.hsforms\.net/i, weight: 25 },
      { check: 'html', regex: /hbspt\.forms\.create|hs-form/i, weight: 20 },
      { check: 'html', regex: /hubspot/i, weight: 5 },
    ],
  },
  {
    name: 'Marketo', category: 'marketing',
    website: 'marketo.com',
    patterns: [
      { check: 'script_url', regex: /munchkin\.marketo\.net|marketo\.com/i, weight: 30 },
      { check: 'html', regex: /Munchkin\.init\(/i, weight: 25 },
      { check: 'html', regex: /mktoForm|marketo/i, weight: 10 },
    ],
  },
  {
    name: 'Pardot', category: 'marketing',
    website: 'salesforce.com/products/marketing-cloud/marketing-automation',
    patterns: [
      { check: 'script_url', regex: /pi\.pardot\.com|pardot/i, weight: 30 },
      { check: 'html', regex: /piAId|piCId|pardot/i, weight: 20 },
    ],
  },
  {
    name: 'Eloqua', category: 'marketing',
    website: 'oracle.com/cx/marketing/automation',
    patterns: [
      { check: 'script_url', regex: /eloqua\.com/i, weight: 30 },
      { check: 'html', regex: /eloqua|elqCfg/i, weight: 20 },
    ],
  },
  {
    name: 'Mailchimp', category: 'marketing',
    website: 'mailchimp.com',
    patterns: [
      { check: 'script_url', regex: /chimpstatic\.com|mailchimp\.com/i, weight: 25 },
      { check: 'html', regex: /mc-embedded-subscribe|mailchimp/i, weight: 20 },
    ],
  },
  {
    name: 'ActiveCampaign', category: 'marketing',
    website: 'activecampaign.com',
    patterns: [
      { check: 'script_url', regex: /trackcmp\.net|activecampaign\.com/i, weight: 30 },
    ],
  },
  {
    name: 'Klaviyo', category: 'marketing',
    website: 'klaviyo.com',
    patterns: [
      { check: 'script_url', regex: /static\.klaviyo\.com/i, weight: 30 },
      { check: 'html', regex: /klaviyo/i, weight: 10 },
    ],
  },

  // ── A/B Testing & Optimization ──────────────────────────────
  {
    name: 'Optimizely', category: 'testing',
    website: 'optimizely.com',
    patterns: [
      { check: 'script_url', regex: /cdn\.optimizely\.com/i, weight: 30 },
      { check: 'html', regex: /optimizely/i, weight: 10 },
    ],
  },
  {
    name: 'VWO', category: 'testing',
    website: 'vwo.com',
    patterns: [
      { check: 'script_url', regex: /dev\.visualwebsiteoptimizer\.com/i, weight: 30 },
      { check: 'html', regex: /VWO|_vwo_/i, weight: 20 },
    ],
  },
  {
    name: 'LaunchDarkly', category: 'testing',
    website: 'launchdarkly.com',
    patterns: [
      { check: 'script_url', regex: /launchdarkly/i, weight: 30 },
      { check: 'html', regex: /launchdarkly|ldclient/i, weight: 15 },
    ],
  },
  {
    name: 'Adobe Target', category: 'personalization',
    website: 'business.adobe.com/products/target',
    patterns: [
      { check: 'script_url', regex: /mbox.*\.js|at\.js/i, weight: 20 },
      { check: 'html', regex: /adobe.*target|mboxCreate|mboxDefine/i, weight: 20 },
    ],
  },
  {
    name: 'Dynamic Yield', category: 'personalization',
    website: 'dynamicyield.com',
    patterns: [
      { check: 'script_url', regex: /cdn\.dynamicyield\.com/i, weight: 30 },
      { check: 'html', regex: /dynamicyield|DY\./i, weight: 15 },
    ],
  },

  // ── Chat & Support ──────────────────────────────────
  {
    name: 'Drift', category: 'chat',
    website: 'drift.com',
    patterns: [
      { check: 'script_url', regex: /js\.driftt\.com/i, weight: 30 },
      { check: 'html', regex: /drift\.load\(/i, weight: 20 },
    ],
  },
  {
    name: 'Intercom', category: 'chat',
    website: 'intercom.com',
    patterns: [
      { check: 'script_url', regex: /widget\.intercom\.io/i, weight: 30 },
      { check: 'html', regex: /intercomSettings|Intercom\(/i, weight: 20 },
    ],
  },
  {
    name: 'Zendesk', category: 'chat',
    website: 'zendesk.com',
    patterns: [
      { check: 'script_url', regex: /static\.zdassets\.com|zopim/i, weight: 30 },
      { check: 'html', regex: /zESettings|zE\(/i, weight: 15 },
    ],
  },
  {
    name: 'LiveChat', category: 'chat',
    website: 'livechat.com',
    patterns: [
      { check: 'script_url', regex: /cdn\.livechatinc\.com/i, weight: 30 },
      { check: 'html', regex: /LiveChatWidget/i, weight: 20 },
    ],
  },
  {
    name: 'Tawk.to', category: 'chat',
    website: 'tawk.to',
    patterns: [
      { check: 'script_url', regex: /embed\.tawk\.to/i, weight: 30 },
      { check: 'html', regex: /Tawk_API/i, weight: 20 },
    ],
  },
  {
    name: 'Crisp', category: 'chat',
    website: 'crisp.chat',
    patterns: [
      { check: 'script_url', regex: /client\.crisp\.chat/i, weight: 30 },
      { check: 'html', regex: /CRISP_WEBSITE_ID/i, weight: 20 },
    ],
  },
  {
    name: 'Freshdesk', category: 'chat',
    website: 'freshdesk.com',
    patterns: [
      { check: 'script_url', regex: /widget\.freshworks\.com|wchat\.freshchat\.com/i, weight: 30 },
    ],
  },

  // ── CDN & Performance ──────────────────────────────────
  {
    name: 'Cloudflare', category: 'cdn',
    website: 'cloudflare.com',
    patterns: [
      { check: 'header', key: 'cf-ray', regex: /./, weight: 30 },
      { check: 'header', key: 'server', regex: /cloudflare/i, weight: 25 },
    ],
  },
  {
    name: 'Akamai', category: 'cdn',
    website: 'akamai.com',
    patterns: [
      { check: 'header', key: 'x-akamai-transformed', regex: /./, weight: 30 },
      { check: 'header', key: 'server', regex: /akamai/i, weight: 25 },
      { check: 'script_url', regex: /akam|akamai/i, weight: 15 },
    ],
  },
  {
    name: 'Fastly', category: 'cdn',
    website: 'fastly.com',
    patterns: [
      { check: 'header', key: 'x-served-by', regex: /cache-/i, weight: 20 },
      { check: 'header', key: 'via', regex: /varnish/i, weight: 10 },
      { check: 'header', key: 'x-fastly-request-id', regex: /./, weight: 30 },
    ],
  },
  {
    name: 'AWS CloudFront', category: 'cdn',
    website: 'aws.amazon.com/cloudfront',
    patterns: [
      { check: 'header', key: 'x-amz-cf-id', regex: /./, weight: 30 },
      { check: 'header', key: 'x-amz-cf-pop', regex: /./, weight: 25 },
      { check: 'header', key: 'via', regex: /cloudfront/i, weight: 20 },
    ],
  },
  {
    name: 'Varnish', category: 'cdn',
    website: 'varnish-cache.org',
    patterns: [
      { check: 'header', key: 'via', regex: /varnish/i, weight: 25 },
      { check: 'header', key: 'x-varnish', regex: /./, weight: 30 },
    ],
  },
  {
    name: 'Cloudinary', category: 'media',
    website: 'cloudinary.com',
    patterns: [
      { check: 'html', regex: /res\.cloudinary\.com/i, weight: 30 },
      { check: 'script_url', regex: /cloudinary/i, weight: 20 },
    ],
  },
  {
    name: 'Imgix', category: 'media',
    website: 'imgix.com',
    patterns: [
      { check: 'html', regex: /\.imgix\.net/i, weight: 30 },
    ],
  },

  // ── Hosting & Infrastructure ──────────────────────────────
  {
    name: 'Acquia', category: 'hosting',
    website: 'acquia.com',
    patterns: [
      { check: 'header', key: 'x-ah-environment', regex: /./, weight: 30 },
      { check: 'header', key: 'x-cache', regex: /acquia/i, weight: 25 },
    ],
  },
  {
    name: 'Pantheon', category: 'hosting',
    website: 'pantheon.io',
    patterns: [
      { check: 'header', key: 'x-pantheon-styx-hostname', regex: /./, weight: 30 },
      { check: 'header', key: 'server', regex: /pantheon/i, weight: 25 },
    ],
  },
  {
    name: 'WP Engine', category: 'hosting',
    website: 'wpengine.com',
    patterns: [
      { check: 'header', key: 'x-powered-by', regex: /wp engine/i, weight: 25 },
      { check: 'header', key: 'wpe-backend', regex: /./, weight: 30 },
    ],
  },
  {
    name: 'Vercel', category: 'hosting',
    website: 'vercel.com',
    patterns: [
      { check: 'header', key: 'x-vercel-id', regex: /./, weight: 30 },
      { check: 'header', key: 'server', regex: /vercel/i, weight: 25 },
    ],
  },
  {
    name: 'Netlify', category: 'hosting',
    website: 'netlify.com',
    patterns: [
      { check: 'header', key: 'x-nf-request-id', regex: /./, weight: 30 },
      { check: 'header', key: 'server', regex: /netlify/i, weight: 25 },
    ],
  },
  {
    name: 'AWS S3', category: 'hosting',
    website: 'aws.amazon.com/s3',
    patterns: [
      { check: 'header', key: 'server', regex: /amazons3/i, weight: 30 },
      { check: 'header', key: 'x-amz-request-id', regex: /./, weight: 25 },
    ],
  },
  {
    name: 'Heroku', category: 'hosting',
    website: 'heroku.com',
    patterns: [
      { check: 'header', key: 'via', regex: /heroku/i, weight: 30 },
      { check: 'header', key: 'server', regex: /heroku/i, weight: 25 },
    ],
  },

  // ── Server Technology ──────────────────────────────────
  {
    name: 'Nginx', category: 'server',
    website: 'nginx.org',
    patterns: [
      { check: 'header', key: 'server', regex: /nginx\/?(\S+)?/i, weight: 30, version: 1 },
    ],
  },
  {
    name: 'Apache', category: 'server',
    website: 'httpd.apache.org',
    patterns: [
      { check: 'header', key: 'server', regex: /apache\/?(\S+)?/i, weight: 30, version: 1 },
    ],
  },
  {
    name: 'IIS', category: 'server',
    website: 'iis.net',
    patterns: [
      { check: 'header', key: 'server', regex: /microsoft-iis\/([\d.]+)/i, weight: 30, version: 1 },
    ],
  },
  {
    name: 'LiteSpeed', category: 'server',
    website: 'litespeedtech.com',
    patterns: [
      { check: 'header', key: 'server', regex: /litespeed/i, weight: 30 },
    ],
  },
  {
    name: 'PHP', category: 'server',
    website: 'php.net',
    patterns: [
      { check: 'header', key: 'x-powered-by', regex: /php\/([\d.]+)/i, weight: 30, version: 1 },
      { check: 'cookie', regex: /PHPSESSID/i, weight: 20 },
    ],
  },
  {
    name: 'ASP.NET', category: 'server',
    website: 'dotnet.microsoft.com',
    patterns: [
      { check: 'header', key: 'x-powered-by', regex: /asp\.net/i, weight: 30 },
      { check: 'header', key: 'x-aspnet-version', regex: /([\d.]+)/, weight: 25, version: 1 },
      { check: 'cookie', regex: /ASP\.NET_SessionId|\.ASPXAUTH/i, weight: 20 },
    ],
  },
  {
    name: 'Java/Servlet', category: 'server',
    website: 'oracle.com/java',
    patterns: [
      { check: 'cookie', regex: /JSESSIONID/i, weight: 25 },
      { check: 'header', key: 'x-powered-by', regex: /servlet|jsp|tomcat/i, weight: 25 },
    ],
  },
  {
    name: 'Node.js', category: 'server',
    website: 'nodejs.org',
    patterns: [
      { check: 'header', key: 'x-powered-by', regex: /express/i, weight: 25 },
    ],
  },

  // ── Security ──────────────────────────────────
  {
    name: 'reCAPTCHA', category: 'security',
    website: 'google.com/recaptcha',
    patterns: [
      { check: 'script_url', regex: /google\.com\/recaptcha/i, weight: 30 },
      { check: 'html', regex: /g-recaptcha|grecaptcha/i, weight: 20 },
    ],
  },
  {
    name: 'hCaptcha', category: 'security',
    website: 'hcaptcha.com',
    patterns: [
      { check: 'script_url', regex: /hcaptcha\.com/i, weight: 30 },
      { check: 'html', regex: /h-captcha/i, weight: 20 },
    ],
  },
  {
    name: 'Sucuri', category: 'security',
    website: 'sucuri.net',
    patterns: [
      { check: 'header', key: 'x-sucuri-id', regex: /./, weight: 30 },
      { check: 'header', key: 'server', regex: /sucuri/i, weight: 25 },
    ],
  },
  {
    name: 'Wordfence', category: 'security',
    website: 'wordfence.com',
    patterns: [
      { check: 'html', regex: /wordfence/i, weight: 15 },
      { check: 'script_url', regex: /wordfence/i, weight: 25 },
    ],
  },

  // ── Privacy & Consent ──────────────────────────────────
  {
    name: 'OneTrust', category: 'consent',
    website: 'onetrust.com',
    patterns: [
      { check: 'script_url', regex: /cdn\.cookielaw\.org|onetrust/i, weight: 30 },
      { check: 'html', regex: /onetrust|optanon/i, weight: 15 },
    ],
  },
  {
    name: 'Cookiebot', category: 'consent',
    website: 'cookiebot.com',
    patterns: [
      { check: 'script_url', regex: /consent\.cookiebot\.com/i, weight: 30 },
      { check: 'html', regex: /CookieConsent|Cookiebot/i, weight: 15 },
    ],
  },
  {
    name: 'TrustArc', category: 'consent',
    website: 'trustarc.com',
    patterns: [
      { check: 'script_url', regex: /consent\.trustarc\.com|truste\.com/i, weight: 30 },
    ],
  },
  {
    name: 'Osano', category: 'consent',
    website: 'osano.com',
    patterns: [
      { check: 'script_url', regex: /cmp\.osano\.com/i, weight: 30 },
    ],
  },

  // ── Media & Video ──────────────────────────────────
  {
    name: 'Wistia', category: 'media',
    website: 'wistia.com',
    patterns: [
      { check: 'script_url', regex: /fast\.wistia\.com/i, weight: 30 },
      { check: 'html', regex: /wistia_embed|wistia-player/i, weight: 20 },
    ],
  },
  {
    name: 'Vidyard', category: 'media',
    website: 'vidyard.com',
    patterns: [
      { check: 'script_url', regex: /play\.vidyard\.com/i, weight: 30 },
      { check: 'html', regex: /vidyard/i, weight: 10 },
    ],
  },
  {
    name: 'Brightcove', category: 'media',
    website: 'brightcove.com',
    patterns: [
      { check: 'script_url', regex: /players\.brightcove\.net/i, weight: 30 },
      { check: 'html', regex: /brightcove/i, weight: 10 },
    ],
  },
  {
    name: 'Vimeo', category: 'media',
    website: 'vimeo.com',
    patterns: [
      { check: 'html', regex: /player\.vimeo\.com/i, weight: 25 },
      { check: 'script_url', regex: /player\.vimeo\.com/i, weight: 25 },
    ],
  },
  {
    name: 'YouTube', category: 'media',
    website: 'youtube.com',
    patterns: [
      { check: 'html', regex: /youtube\.com\/embed|youtube-nocookie\.com/i, weight: 25 },
      { check: 'script_url', regex: /youtube\.com\/iframe_api/i, weight: 25 },
    ],
  },

  // ── Payment ──────────────────────────────────
  {
    name: 'Stripe', category: 'payment',
    website: 'stripe.com',
    patterns: [
      { check: 'script_url', regex: /js\.stripe\.com/i, weight: 30 },
      { check: 'html', regex: /stripe-/i, weight: 10 },
    ],
  },
  {
    name: 'PayPal', category: 'payment',
    website: 'paypal.com',
    patterns: [
      { check: 'script_url', regex: /paypal\.com\/sdk/i, weight: 30 },
      { check: 'html', regex: /paypal-button/i, weight: 20 },
    ],
  },

  // ── Accessibility ──────────────────────────────────
  {
    name: 'UserWay', category: 'accessibility',
    website: 'userway.org',
    patterns: [
      { check: 'script_url', regex: /cdn\.userway\.org/i, weight: 30 },
    ],
  },
  {
    name: 'accessiBe', category: 'accessibility',
    website: 'accessibe.com',
    patterns: [
      { check: 'script_url', regex: /acsbapp\.com|accessibe/i, weight: 30 },
    ],
  },
  {
    name: 'AudioEye', category: 'accessibility',
    website: 'audioeye.com',
    patterns: [
      { check: 'script_url', regex: /audioeye\.com/i, weight: 30 },
    ],
  },
];


/** Detection threshold */
const DETECTION_THRESHOLD = 25;

/**
 * Extract script src URLs from HTML.
 */
function extractScriptUrls(html) {
  const urls = [];
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) urls.push(m[1]);
  return urls;
}

/**
 * Extract link/stylesheet href URLs from HTML.
 */
function extractLinkUrls(html) {
  const urls = [];
  const re = /<link[^>]+href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) urls.push(m[1]);
  return urls;
}

/**
 * Detect technologies from crawl data.
 * Now async to support optional AI enrichment.
 */
async function detectTech(crawlData, progress) {
  progress.start('techDetect', 'Detecting technology stack');

  const html = crawlData.rawHtml || '';
  const headers = crawlData.headers || {};
  const generator = crawlData.meta?.generator || '';
  const cookieHeader = headers['set-cookie'] || '';

  // Pre-extract URLs for efficient matching
  const scriptUrls = extractScriptUrls(html);
  const linkUrls = extractLinkUrls(html);

  progress.progress('techDetect', 30, `Matching against ${SIGNATURES.length} signatures`);

  const detected = [];

  for (const sig of SIGNATURES) {
    let score = 0;
    let detectedVersion = null;
    const matches = [];

    for (const pattern of sig.patterns) {
      let matched = false;
      let matchResult = null;

      switch (pattern.check) {
        case 'html':
          matchResult = html.match(pattern.regex);
          matched = !!matchResult;
          break;

        case 'script_url':
          for (const url of scriptUrls) {
            matchResult = url.match(pattern.regex);
            if (matchResult) { matched = true; break; }
          }
          break;

        case 'link_url':
          for (const url of linkUrls) {
            matchResult = url.match(pattern.regex);
            if (matchResult) { matched = true; break; }
          }
          break;

        case 'header':
          if (pattern.key) {
            const val = headers[pattern.key] || headers[pattern.key.toLowerCase()] || '';
            matchResult = val.match(pattern.regex);
            matched = !!matchResult;
            if (!matched && pattern.key.endsWith('-')) {
              matched = Object.keys(headers).some(k => k.startsWith(pattern.key));
            }
          }
          break;

        case 'meta_generator':
          matchResult = generator.match(pattern.regex);
          matched = !!matchResult;
          break;

        case 'cookie':
          matchResult = cookieHeader.match(pattern.regex);
          matched = !!matchResult;
          break;
      }

      if (matched) {
        score += pattern.weight;
        matches.push(pattern.check === 'header' ? `header:${pattern.key}` : pattern.check);

        // Extract version if pattern specifies it
        if (pattern.version && matchResult && matchResult[pattern.version]) {
          detectedVersion = matchResult[pattern.version];
        }
      }
    }

    if (score >= DETECTION_THRESHOLD) {
      detected.push({
        name: sig.name,
        category: sig.category,
        website: sig.website || null,
        score,
        confidence: Math.min(100, Math.round((score / sig.patterns.reduce((s, p) => s + p.weight, 0)) * 100)),
        version: detectedVersion,
        matches,
      });
    }
  }

  // Sort by score descending
  detected.sort((a, b) => b.score - a.score);

  // ── AI Enrichment (optional) ──────────────────────────
  let aiTechs = [];
  if (config.gemini.enabled && config.gemini.apiKey) {
    try {
      progress.progress('techDetect', 60, 'AI-powered deep analysis');
      aiTechs = await aiEnrichTech(scriptUrls, linkUrls, headers, detected);
    } catch (err) {
      console.warn('[TechDetect] AI enrichment failed:', err.message);
    }
  }

  // Merge AI results (avoid duplicates)
  const existingNames = new Set(detected.map(d => d.name.toLowerCase()));
  for (const aiTech of aiTechs) {
    if (!existingNames.has(aiTech.name.toLowerCase())) {
      detected.push(aiTech);
      existingNames.add(aiTech.name.toLowerCase());
    }
  }

  // Build categorized summary
  const summary = {};
  for (const d of detected) {
    const cat = d.category || 'other';
    if (!summary[cat]) summary[cat] = [];
    summary[cat].push(d);
  }

  const primaryCms = (summary.cms || [])[0]?.name || 'Unknown';

  progress.complete('techDetect', {
    primaryCms,
    totalDetected: detected.length,
    categories: Object.keys(summary),
  });

  return { detected, summary, primaryCms, categoryLabels: CATEGORY_LABELS };
}

/**
 * Use Gemini to identify additional technologies from script URLs and headers.
 */
async function aiEnrichTech(scriptUrls, linkUrls, headers, alreadyDetected) {
  const { askGeminiJson } = require('../utils/gemini-utils');

  // Only send a compact list — minimize tokens
  const scripts = scriptUrls
    .filter(u => !u.startsWith('data:'))
    .map(u => { try { return new URL(u).hostname + new URL(u).pathname; } catch { return u; } })
    .slice(0, 40);
  const links = linkUrls
    .filter(u => !u.startsWith('data:'))
    .map(u => { try { return new URL(u).hostname + new URL(u).pathname; } catch { return u; } })
    .slice(0, 20);

  const headerSummary = {};
  for (const [k, v] of Object.entries(headers)) {
    if (/^(server|x-powered|x-generator|x-cache|via|set-cookie|x-drupal|x-ah|x-wp|x-frame|x-content)/i.test(k)) {
      headerSummary[k] = String(v).slice(0, 100);
    }
  }

  const alreadyFound = alreadyDetected.map(d => d.name).join(', ');

  const prompt = `You are a web technology analyst. Identify technologies from these website signals.

Script URLs:
${scripts.join('\n')}

Stylesheet URLs:
${links.join('\n')}

HTTP Headers:
${JSON.stringify(headerSummary, null, 2)}

Already detected (DO NOT repeat these): ${alreadyFound}

Identify any ADDITIONAL technologies, services, or platforms not already listed.
Return a JSON array of objects:
[
  { "name": "Technology Name", "category": "category_key", "confidence": 60-90, "evidence": "brief reason" }
]

Valid category keys: cms, framework, jslib, css, ecommerce, analytics, marketing, testing, personalization, chat, cdn, hosting, server, security, media, fonts, consent, payment, accessibility, tag_manager

Only include technologies you are confident about (60%+ confidence). Return an empty array [] if nothing additional is found.
Return ONLY the JSON array.`;

  const result = await askGeminiJson(prompt, { maxTokens: 1024 });

  if (!Array.isArray(result)) return [];

  return result
    .filter(t => t.name && t.category && t.confidence >= 50)
    .map(t => ({
      name: t.name,
      category: t.category,
      website: null,
      score: t.confidence,
      confidence: t.confidence,
      version: null,
      matches: ['ai_analysis'],
      evidence: t.evidence || null,
    }));
}

module.exports = { detectTech, SIGNATURES, DETECTION_THRESHOLD, CATEGORY_LABELS };
