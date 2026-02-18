/**
 * Dual crawl: Cheerio (fast ~200ms) + Puppeteer (full render ~3s).
 * Cheerio results appear first in the UI; Puppeteer fills in JS-rendered content.
 */
const cheerio = require('cheerio');
const config = require('../../config/default');
const { resolveUrl } = require('../utils/url-utils');
const { stripAndExtract, extractImages, extractHeroImages } = require('../utils/html-utils');

/**
 * Fast crawl with plain HTTP + Cheerio (no JS rendering).
 */
async function crawlCheerio(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.crawler.cheerioTimeoutMs);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': config.crawler.userAgent },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const html = await res.text();
    const finalUrl = res.url; // may differ from input after redirects
    const $ = cheerio.load(html);

    const { cleanHtml, textContent, title, meta } = stripAndExtract(html, finalUrl);
    const images = extractImages($, finalUrl);
    const heroes = extractHeroImages($, finalUrl);

    return {
      source: 'cheerio',
      url: finalUrl,
      rawHtml: html,
      cleanHtml,
      textContent,
      title,
      meta,
      images,
      heroes,
      headers: Object.fromEntries(res.headers),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Full crawl with Puppeteer (headless Chrome — renders JS).
 */
async function crawlPuppeteer(url) {
  let browser;
  try {
    const puppeteer = require('puppeteer');
    const launchOpts = {
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer', '--no-zygote'],
    };
    // Use system Chromium on Railway/Docker, Puppeteer's bundled Chrome locally
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    browser = await puppeteer.launch(launchOpts);

    const page = await browser.newPage();
    await page.setUserAgent(config.crawler.userAgent);
    await page.setViewport({ width: 1440, height: 900 });

    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: config.crawler.puppeteerTimeoutMs,
    });

    // Wait a moment for late-binding JS
    await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));

    const html = await page.content();
    const finalUrl = page.url();

    // Grab computed styles from the live DOM
    const computedData = await page.evaluate(() => {
      const body = document.body;
      const computed = getComputedStyle(body);
      const root = getComputedStyle(document.documentElement);

      // Extract CSS custom properties from :root
      const customProps = {};
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText === ':root' || rule.selectorText === 'html') {
              for (const prop of rule.style) {
                if (prop.startsWith('--')) {
                  customProps[prop] = rule.style.getPropertyValue(prop).trim();
                }
              }
            }
          }
        } catch { /* cross-origin sheets */ }
      }

      return {
        bodyBg: computed.backgroundColor,
        bodyColor: computed.color,
        bodyFont: computed.fontFamily,
        customProps,
      };
    });

    // Take a screenshot for color extraction
    const screenshot = await page.screenshot({ type: 'png', fullPage: false });

    const $ = cheerio.load(html);
    const { cleanHtml, textContent, title, meta } = stripAndExtract(html, finalUrl);
    const images = extractImages($, finalUrl);
    const heroes = extractHeroImages($, finalUrl);

    return {
      source: 'puppeteer',
      url: finalUrl,
      rawHtml: html,
      cleanHtml,
      textContent,
      title,
      meta,
      images,
      heroes,
      headers: response ? Object.fromEntries(Object.entries(response.headers())) : {},
      computedData,
      screenshot,
    };
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Dual crawl: run both in parallel; Cheerio returns fast, Puppeteer fills gaps.
 * Returns merged result.
 */
async function dualCrawl(url, progress) {
  progress.start('crawl', 'Crawling website');

  // Start Cheerio immediately
  let cheerioResult, puppeteerResult;

  try {
    progress.progress('crawl', 20, 'Fast crawl (Cheerio)');
    cheerioResult = await crawlCheerio(url);
    progress.progress('crawl', 50, 'Fast crawl complete, waiting for full render');
  } catch (err) {
    progress.progress('crawl', 30, `Fast crawl failed: ${err.message}`);
  }

  try {
    progress.progress('crawl', 60, 'Full render (Puppeteer)');
    puppeteerResult = await crawlPuppeteer(url);
    progress.progress('crawl', 90, 'Full render complete');
  } catch (err) {
    progress.progress('crawl', 80, `Full render failed: ${err.message}`);
  }

  if (!cheerioResult && !puppeteerResult) {
    progress.fail('crawl', 'Both crawl methods failed');
    throw new Error('Failed to crawl URL with both Cheerio and Puppeteer');
  }

  // Merge: prefer Puppeteer (more complete) but fill from Cheerio
  const primary = puppeteerResult || cheerioResult;
  const secondary = cheerioResult || {};

  const merged = {
    url: primary.url,
    rawHtml: primary.rawHtml,
    cleanHtml: primary.cleanHtml || secondary.cleanHtml,
    textContent: primary.textContent || secondary.textContent,
    title: primary.title || secondary.title,
    meta: { ...secondary.meta, ...primary.meta },
    images: primary.images.length > secondary.images?.length ? primary.images : (secondary.images || primary.images),
    heroes: [...(primary.heroes || []), ...(secondary.heroes || [])].filter(
      (h, i, arr) => arr.findIndex(x => x.src === h.src) === i
    ),
    headers: { ...secondary.headers, ...primary.headers },
    computedData: primary.computedData || null,
    screenshot: primary.screenshot || null,
  };

  progress.complete('crawl', {
    title: merged.title,
    textLength: merged.textContent.length,
    imageCount: merged.images.length,
    heroCount: merged.heroes.length,
  });

  return merged;
}

module.exports = { crawlCheerio, crawlPuppeteer, dualCrawl };
