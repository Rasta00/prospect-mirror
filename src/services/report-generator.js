/**
 * Report generation: Handlebars HTML → Puppeteer PDF.
 */
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates');

// Register Handlebars helpers
Handlebars.registerHelper('scoreClass', (v) => {
  if (v >= 90) return 'good';
  if (v >= 50) return 'ok';
  return 'poor';
});

Handlebars.registerHelper('scoreLabel', (v) => {
  if (v >= 90) return 'Excellent';
  if (v >= 70) return 'Good';
  if (v >= 50) return 'Needs Work';
  return 'Poor';
});

Handlebars.registerHelper('ifEquals', function (a, b, options) {
  return a === b ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('formatDate', () => {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
});

/**
 * Generate the HTML report from analysis data.
 */
async function generateReport(data, progress) {
  progress.start('report', 'Generating report');

  try {
    progress.progress('report', 30, 'Rendering HTML');
    const html = renderHtml(data);

    progress.complete('report', { format: 'html', size: html.length });

    return {
      html,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    progress.fail('report', err.message);
    throw err;
  }
}

/**
 * Generate PDF from report HTML.
 */
async function generatePdf(result, url) {
  const html = result.report?.html;
  if (!html) throw new Error('No report HTML available');

  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

/**
 * Render the Handlebars template with data.
 */
function renderHtml(data) {
  const templateSrc = fs.readFileSync(path.join(TEMPLATE_DIR, 'report.hbs'), 'utf-8');
  const styles = fs.readFileSync(path.join(TEMPLATE_DIR, 'report-styles.css'), 'utf-8');

  const template = Handlebars.compile(templateSrc);

  const context = {
    styles,
    url: data.url,
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    title: data.crawlData?.title || new URL(data.url).hostname,
    domain: new URL(data.url).hostname,
    brand: data.brandData || {},
    tech: data.techData || {},
    audit: data.auditData || {},
    content: data.contentAnalysis || {},
    competitive: data.competitiveAnalysis || {},
    drupal: data.drupalResult || null,
  };

  return template(context);
}

module.exports = { generateReport, generatePdf, renderHtml };
