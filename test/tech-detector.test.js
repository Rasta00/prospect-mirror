const { describe, it } = require('node:test');
const assert = require('node:assert');
const { detectTech, SIGNATURES, DETECTION_THRESHOLD } = require('../src/services/tech-detector');

// Minimal progress emitter stub
const stubProgress = {
  start() {},
  progress() {},
  complete() {},
  fail() {},
};

describe('Tech Detector', () => {

  it('detects WordPress from typical patterns', () => {
    const crawlData = {
      rawHtml: `
        <html>
          <head><meta name="generator" content="WordPress 6.4"></head>
          <body>
            <link rel="stylesheet" href="/wp-content/themes/mytheme/style.css">
            <script src="/wp-includes/js/jquery.min.js"></script>
          </body>
        </html>`,
      headers: {},
      meta: { generator: 'WordPress 6.4' },
    };

    const result = detectTech(crawlData, stubProgress);
    assert.strictEqual(result.primaryCms, 'WordPress');
    assert.ok(result.detected.some(d => d.name === 'WordPress'));
    const wp = result.detected.find(d => d.name === 'WordPress');
    assert.ok(wp.score >= DETECTION_THRESHOLD, `Score ${wp.score} should be >= ${DETECTION_THRESHOLD}`);
  });

  it('detects Drupal from headers and HTML', () => {
    const crawlData = {
      rawHtml: `
        <html>
          <body>
            <script src="/core/misc/drupal.js"></script>
            <div data-drupal-selector="page">Content</div>
          </body>
        </html>`,
      headers: { 'x-drupal-cache': 'HIT' },
      meta: { generator: '' },
    };

    const result = detectTech(crawlData, stubProgress);
    assert.strictEqual(result.primaryCms, 'Drupal');
  });

  it('detects Sitecore patterns', () => {
    const crawlData = {
      rawHtml: `
        <html>
          <body>
            <link href="/-/media/images/logo.png" />
            <input name="scf123" />
            <script>Sitecore.Context = {};</script>
          </body>
        </html>`,
      headers: {},
      meta: { generator: '' },
    };

    const result = detectTech(crawlData, stubProgress);
    assert.strictEqual(result.primaryCms, 'Sitecore');
  });

  it('detects AEM from clientlibs and DAM paths', () => {
    const crawlData = {
      rawHtml: `
        <html>
          <head>
            <link rel="stylesheet" href="/etc.clientlibs/mysite/components.css">
          </head>
          <body>
            <img src="/content/dam/images/hero.jpg" />
          </body>
        </html>`,
      headers: {},
      meta: { generator: '' },
    };

    const result = detectTech(crawlData, stubProgress);
    assert.strictEqual(result.primaryCms, 'Adobe Experience Manager');
  });

  it('detects Cloudflare from headers', () => {
    const crawlData = {
      rawHtml: '<html><body>Hello</body></html>',
      headers: { 'cf-ray': '123abc', 'server': 'cloudflare' },
      meta: { generator: '' },
    };

    const result = detectTech(crawlData, stubProgress);
    assert.ok(result.detected.some(d => d.name === 'Cloudflare'));
  });

  it('detects Google Analytics + GTM', () => {
    const crawlData = {
      rawHtml: `
        <html>
          <head>
            <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script>
          </head>
          <body>
            <script>gtag('config', 'G-XYZ789');</script>
          </body>
        </html>`,
      headers: {},
      meta: { generator: '' },
    };

    const result = detectTech(crawlData, stubProgress);
    assert.ok(result.detected.some(d => d.name === 'Google Analytics'));
    assert.ok(result.detected.some(d => d.name === 'Google Tag Manager'));
  });

  it('detects React/Next.js patterns', () => {
    const crawlData = {
      rawHtml: `
        <html>
          <body>
            <div id="__next">
              <div data-reactroot>App content</div>
            </div>
            <script src="/_next/static/chunks/main.js"></script>
          </body>
        </html>`,
      headers: {},
      meta: { generator: '' },
    };

    const result = detectTech(crawlData, stubProgress);
    assert.ok(result.detected.some(d => d.name === 'React'));
  });

  it('returns Unknown primaryCms when nothing is detected', () => {
    const crawlData = {
      rawHtml: '<html><body><p>Simple static page</p></body></html>',
      headers: {},
      meta: { generator: '' },
    };

    const result = detectTech(crawlData, stubProgress);
    assert.strictEqual(result.primaryCms, 'Unknown');
  });

  it('detects multiple technologies simultaneously', () => {
    const crawlData = {
      rawHtml: `
        <html>
          <head>
            <meta name="generator" content="WordPress 6.4">
            <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC"></script>
          </head>
          <body>
            <link rel="stylesheet" href="/wp-content/themes/theme/style.css">
            <script>gtag('config', 'UA-1234-1');</script>
          </body>
        </html>`,
      headers: { 'cf-ray': '123', 'server': 'cloudflare' },
      meta: { generator: 'WordPress 6.4' },
    };

    const result = detectTech(crawlData, stubProgress);
    assert.ok(result.detected.length >= 3, `Expected >= 3 detections, got ${result.detected.length}`);
    assert.ok(result.summary.cms.length >= 1);
    assert.ok(result.summary.analytics.length >= 1);
  });

  it('has complete signature coverage', () => {
    // Verify all signatures have required fields
    for (const sig of SIGNATURES) {
      assert.ok(sig.name, 'Signature must have a name');
      assert.ok(sig.category, `${sig.name} must have a category`);
      assert.ok(sig.patterns.length > 0, `${sig.name} must have patterns`);
      for (const p of sig.patterns) {
        assert.ok(p.check, `${sig.name} pattern must have a check type`);
        assert.ok(p.regex, `${sig.name} pattern must have a regex`);
        assert.ok(typeof p.weight === 'number', `${sig.name} pattern must have a numeric weight`);
      }
    }
  });
});
