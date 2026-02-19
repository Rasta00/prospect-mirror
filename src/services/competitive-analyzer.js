/**
 * AI Competitive Analysis via Claude.
 * Generates a platform comparison with Acquia strengths highlighted.
 */
const { askGeminiJson } = require('../utils/gemini-utils');

/**
 * Platform-specific talking points for comparison.
 */
const PLATFORM_INTEL = {
  WordPress: {
    weaknesses: [
      'Plugin security vulnerabilities (40% of web, #1 target)',
      'Performance degrades with plugin bloat',
      'Limited enterprise governance and workflows',
      'No native personalization or CDP integration',
      'Multisite management is complex at scale',
    ],
    acquiaAdvantages: [
      'Enterprise-grade security with automated patching',
      'Built-in personalization engine (Acquia Personalization)',
      'Native CDP for unified customer profiles',
      'Drupal\'s granular permissions and content workflows',
      'Acquia Cloud autoscaling for traffic spikes',
    ],
  },
  Sitecore: {
    weaknesses: [
      'Extremely high TCO (licensing + infrastructure)',
      'Slow deployment cycles, heavy .NET dependency',
      'Complex upgrade path between versions',
      'Vendor lock-in on proprietary technology',
      'Developer talent pool is limited and expensive',
    ],
    acquiaAdvantages: [
      'Open source = no licensing fees, lower TCO',
      'Faster deployment with Acquia Cloud IDE',
      'Continuous upgrades with Drupal\'s release cycle',
      'No vendor lock-in — you own your code',
      'Massive Drupal developer community (1M+ developers)',
    ],
  },
  'Adobe Experience Manager': {
    weaknesses: [
      'Highest TCO in the market ($500K+ annually)',
      'Extremely complex implementation (12-18 month projects)',
      'Java/OSGi development is slow and specialized',
      'Cloud migration path is still maturing',
      'Rigid content architecture, difficult to customize',
    ],
    acquiaAdvantages: [
      'Fraction of AEM cost with comparable capabilities',
      'Faster time-to-value (weeks, not months)',
      'Modern API-first architecture for headless delivery',
      'Acquia Cloud Next — true cloud-native platform',
      'Flexible content modeling with paragraphs/layout builder',
    ],
  },
  'HubSpot CMS': {
    weaknesses: [
      'Limited content architecture for complex sites',
      'Tightly coupled to HubSpot marketing ecosystem',
      'No true enterprise content workflows',
      'Limited multilingual and multisite capabilities',
      'Difficult to customize beyond templates',
    ],
    acquiaAdvantages: [
      'Enterprise-grade CMS for complex content needs',
      'Open integrations — connect any marketing stack',
      'Sophisticated content workflows and governance',
      'Native multilingual with 100+ language support',
      'Unlimited customization with Drupal modules',
    ],
  },
  Contentful: {
    weaknesses: [
      'No built-in frontend — requires separate app',
      'Pricing scales aggressively with content volume',
      'Limited preview and visual editing experience',
      'API rate limits can impact high-traffic sites',
      'Content editors need technical knowledge',
    ],
    acquiaAdvantages: [
      'Full CMS experience with visual editing (Layout Builder)',
      'Predictable pricing on Acquia Cloud',
      'Also supports headless via JSON:API — best of both worlds',
      'Editor-friendly drag-and-drop page building',
      'Acquia Site Studio for no-code site building',
    ],
  },
  Unknown: {
    weaknesses: [
      'Custom or legacy platform with limited ecosystem',
      'Maintenance burden falls entirely on internal team',
      'May lack modern features (personalization, headless)',
      'Integration capabilities may be limited',
      'Scalability constraints with custom infrastructure',
    ],
    acquiaAdvantages: [
      'Modern, proven platform with 20+ years of development',
      'Managed cloud infrastructure — focus on content, not servers',
      'Built-in personalization, CDP, and DAM',
      'API-first architecture for any frontend',
      'Continuous innovation backed by Acquia + open source community',
    ],
  },
};

/**
 * Run competitive analysis with Claude.
 */
async function analyzeCompetitive(crawlData, techData, auditData, progress) {
  progress.start('competitiveAI', 'AI competitive analysis');

  const primaryCms = techData?.primaryCms || 'Unknown';
  const intel = PLATFORM_INTEL[primaryCms] || PLATFORM_INTEL.Unknown;

  // Build context for Claude
  const scores = auditData?.scores || {};
  const securityHeaders = auditData?.securityHeaders || {};
  const diagnostics = auditData?.diagnostics || {};

  const prompt = `You are an Acquia solutions engineer preparing a competitive analysis for a sales meeting.

The prospect's website: ${crawlData.url}
Their current CMS: ${primaryCms}
Site title: ${crawlData.title || 'Unknown'}

Performance scores:
- Performance: ${scores.performance ?? 'N/A'}/100
- Accessibility: ${scores.accessibility ?? 'N/A'}/100
- SEO: ${scores.seo ?? 'N/A'}/100
- Best Practices: ${scores.bestPractices ?? 'N/A'}/100
- Security: ${scores.security ?? 'N/A'}/100

Key metrics:
- First Contentful Paint: ${diagnostics.fcp || 'N/A'}
- Largest Contentful Paint: ${diagnostics.lcp || 'N/A'}
- Total Blocking Time: ${diagnostics.tbt || 'N/A'}

Security headers present: ${Object.entries(securityHeaders).filter(([,v]) => v).map(([k]) => k).join(', ') || 'None'}

Known ${primaryCms} weaknesses:
${intel.weaknesses.map(w => '- ' + w).join('\n')}

Acquia advantages over ${primaryCms}:
${intel.acquiaAdvantages.map(a => '- ' + a).join('\n')}

Generate a competitive analysis JSON with these fields:
{
  "narrative": "A 3-4 paragraph executive-friendly narrative about why this prospect should consider Acquia. Reference their specific scores and weaknesses. Be persuasive but factual.",
  "comparison": [
    {
      "capability": "Category name (e.g., Performance, Security, Personalization, Content Management, Developer Experience, Total Cost of Ownership, Scalability)",
      "current": "Brief assessment of their current platform for this capability",
      "acquia": "How Acquia addresses this better"
    }
  ],
  "weaknesses": ["Array of 3-5 specific weaknesses observed on this site based on the audit data"],
  "acquiaAdvantages": ["Array of 4-6 specific Acquia advantages most relevant to THIS prospect"],
  "talkingPoints": ["Array of 3-4 bullet points for the SE to use in conversation"],
  "riskFactors": ["Array of 2-3 potential objections the prospect might raise and how to address them"]
}

Make the comparison table have 6-8 rows covering the most important capabilities.
Tailor everything to this specific prospect — reference their actual scores and tech stack.
Return ONLY the JSON object.`;

  try {
    progress.progress('competitiveAI', 40, 'Generating competitive analysis with Gemini');
    const analysis = await askGeminiJson(prompt, { maxTokens: 4096 });

    if (!analysis) {
      // Fallback to static intel
      progress.progress('competitiveAI', 80, 'Using fallback competitive data');
      const fallback = {
        narrative: `${crawlData.title || 'This site'} appears to run on ${primaryCms}. Based on our analysis, there are several areas where Acquia could provide significant improvements.`,
        comparison: intel.acquiaAdvantages.map((adv, i) => ({
          capability: ['Performance', 'Security', 'Personalization', 'Content Mgmt', 'Developer Experience'][i] || 'Feature',
          current: intel.weaknesses[i] || 'Limited',
          acquia: adv,
        })),
        weaknesses: intel.weaknesses.slice(0, 3),
        acquiaAdvantages: intel.acquiaAdvantages,
        talkingPoints: [
          `Their ${primaryCms} site scores ${scores.performance || '?'}/100 on performance — Acquia Cloud can significantly improve this.`,
          `Security posture could be stronger — Acquia provides enterprise-grade security out of the box.`,
          `Open source means lower TCO and no vendor lock-in.`,
        ],
        riskFactors: [],
      };
      progress.complete('competitiveAI', { source: 'fallback', cms: primaryCms });
      return fallback;
    }

    progress.complete('competitiveAI', {
      source: 'claude',
      cms: primaryCms,
      comparisonRows: analysis.comparison?.length || 0,
    });

    return analysis;
  } catch (err) {
    console.error('[CompetitiveAI] Gemini call failed:', err.message);
    progress.fail('competitiveAI', err.message);
    return null;
  }
}

module.exports = { analyzeCompetitive, PLATFORM_INTEL };
