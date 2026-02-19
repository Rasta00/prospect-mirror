/**
 * Master pipeline — orchestrates all analysis phases.
 *
 * Phase 1 (Sprint 1): Crawl → Brand + Tech Detection (parallel)
 * Phase 2 (Sprint 2): Audit + AI Analysis (depends on Phase 1)
 * Phase 3 (Sprint 3): Drupal Population + Report Generation
 */
const config = require('../../config/default');
const { jobs, getEmitter } = require('./job-store');
const { dualCrawl } = require('./crawler');
const { extractBrand } = require('./brand-extractor');
const { detectTech } = require('./tech-detector');

/**
 * Run the full analysis pipeline for a given job.
 */
async function runPipeline(jobId, url) {
  const progress = getEmitter(jobId);
  const job = jobs.get(jobId);

  try {
    // ── Phase 1: Crawl ──
    const crawlData = await dualCrawl(url, progress);

    // ── Phase 1b: Brand + Tech in parallel ──
    const [brandData, techData] = await Promise.all([
      extractBrand(crawlData, progress),
      detectTech(crawlData, progress),
    ]);

    // ── Phase 2: Audits + AI Analysis ──
    let auditData = null;
    let contentAnalysis = null;
    let competitiveAnalysis = null;

    try {
      const { runAudits } = require('./audit-runner');
      auditData = await runAudits(url, progress);
    } catch (err) {
      console.error('[Pipeline] Audit failed:', err.message);
      progress.fail('audit', err.message);
    }

    if (config.gemini.enabled && config.gemini.apiKey) {
      try {
        const { analyzeContent } = require('./content-analyzer');
        contentAnalysis = await analyzeContent(crawlData, brandData, techData, progress);
      } catch (err) {
        console.error('[Pipeline] Content analysis failed:', err.message);
        progress.fail('contentAI', err.message);
      }

      try {
        const { analyzeCompetitive } = require('./competitive-analyzer');
        competitiveAnalysis = await analyzeCompetitive(crawlData, techData, auditData, progress);
      } catch (err) {
        console.error('[Pipeline] Competitive analysis failed:', err.message);
        progress.fail('competitiveAI', err.message);
      }
    } else {
      progress.start('contentAI', 'AI content analysis');
      progress.complete('contentAI', { skipped: true, reason: 'No API credits' });
      progress.start('competitiveAI', 'AI competitive analysis');
      // Use static fallback competitive data
      const { PLATFORM_INTEL } = require('./competitive-analyzer');
      const cms = techData?.primaryCms || 'Unknown';
      const intel = PLATFORM_INTEL[cms] || PLATFORM_INTEL.Unknown;
      competitiveAnalysis = {
        narrative: `${crawlData.title || 'This site'} runs on ${cms}. Based on audit scores and tech stack analysis, there are clear opportunities where Acquia's platform would deliver significant improvements.`,
        comparison: intel.acquiaAdvantages.slice(0, 6).map((adv, i) => ({
          capability: ['Performance', 'Security', 'Personalization', 'Content Management', 'Developer Experience', 'Total Cost'][i],
          current: intel.weaknesses[i] || 'Limited',
          acquia: adv,
        })),
        weaknesses: intel.weaknesses.slice(0, 4),
        acquiaAdvantages: intel.acquiaAdvantages,
        talkingPoints: [
          `Their ${cms} site scores ${auditData?.scores?.performance ?? '?'}/100 on performance.`,
          `Accessibility score: ${auditData?.scores?.accessibility ?? '?'}/100 — Acquia provides built-in a11y tools.`,
          `Open source means lower TCO and no vendor lock-in.`,
        ],
        riskFactors: [],
      };
      progress.complete('competitiveAI', { source: 'static-fallback', cms });
    }

    // ── Phase 3: Drupal + Report ──
    let drupalResult = null;
    let reportResult = null;

    if (config.drupal.enabled) {
      try {
        const { populateDrupal } = require('./drupal-populator');
        drupalResult = await populateDrupal(crawlData, brandData, contentAnalysis, progress);
      } catch (err) {
        progress.fail('drupal', err.message);
      }
    }

    try {
      const { generateReport } = require('./report-generator');
      reportResult = await generateReport({
        url, crawlData, brandData, techData, auditData,
        contentAnalysis, competitiveAnalysis, drupalResult,
      }, progress);
    } catch (err) {
      progress.fail('report', err.message);
    }

    // ── Assemble result ──
    const result = {
      url,
      analyzedAt: new Date().toISOString(),
      crawl: {
        title: crawlData.title,
        textLength: crawlData.textContent?.length || 0,
        imageCount: crawlData.images?.length || 0,
        heroes: crawlData.heroes,
        meta: crawlData.meta,
      },
      brand: brandData,
      tech: techData,
      audit: auditData,
      content: contentAnalysis,
      competitive: competitiveAnalysis,
      drupal: drupalResult,
      report: reportResult,
    };

    // Store result
    if (job) {
      job.status = 'done';
      job.result = result;
    }

    progress.done(result);
    return result;

  } catch (err) {
    console.error('Pipeline fatal error:', err);
    if (job) {
      job.status = 'error';
      job.error = err.message;
    }
    progress.fatal(err);
    throw err;
  }
}

module.exports = { runPipeline };
