/**
 * AI Content Analysis via Gemini.
 * Determines industry, themes, messaging, target audience, and content types.
 */
const { askGeminiJson } = require('../utils/gemini-utils');

/**
 * Analyze content with Claude.
 */
async function analyzeContent(crawlData, brandData, techData, progress) {
  progress.start('contentAI', 'AI content analysis');
  progress.progress('contentAI', 20, 'Preparing content for analysis');

  // Truncate text to stay within token limits
  const textSample = (crawlData.textContent || '').slice(0, 6000);
  const title = crawlData.title || '';
  const description = crawlData.meta?.description || '';
  const siteName = crawlData.meta?.siteName || '';
  const primaryCms = techData?.primaryCms || 'Unknown';

  const prompt = `You are analyzing a website to understand their business, industry, and digital strategy.

Website: ${crawlData.url}
Title: ${title}
Description: ${description}
Site Name: ${siteName}
CMS: ${primaryCms}
Brand Colors: ${brandData?.colors?.palette?.join(', ') || 'Unknown'}
Fonts: ${brandData?.fonts?.join(', ') || 'Unknown'}

Page content (first 6000 chars):
"""
${textSample}
"""

Analyze this website and return a JSON object with these fields:
{
  "companyName": "The company/organization name",
  "industry": "Primary industry (e.g., Healthcare, Financial Services, Higher Education, Technology, Manufacturing, Retail, Government, Nonprofit, Media, Professional Services)",
  "subIndustry": "More specific category within the industry",
  "themes": ["array of 3-5 key messaging themes found on the site"],
  "messaging": "A 2-3 sentence analysis of their messaging strategy and tone of voice",
  "targetAudience": "Who the website appears to target",
  "valueProposition": "Their main value proposition in one sentence",
  "contentTypes": ["array of content types present: e.g., Blog, Case Studies, Whitepapers, Product Pages, About/Team, Events, Resources"],
  "contentMaturity": "Rating of their content strategy: Basic, Intermediate, or Advanced",
  "personalization": "Whether the site appears to use content personalization (None, Basic, Advanced)",
  "seoSignals": {
    "hasStructuredData": true/false,
    "hasSitemap": true/false,
    "hasCanonical": true/false,
    "metaDescriptionQuality": "Good/Fair/Poor/Missing"
  }
}

Return ONLY the JSON object, no other text.`;

  try {
    progress.progress('contentAI', 50, 'Analyzing with Gemini');
    const analysis = await askGeminiJson(prompt);

    if (!analysis) {
      progress.progress('contentAI', 80, 'AI response could not be parsed, using basic analysis');
      return buildBasicAnalysis(crawlData, techData, 'AI response could not be parsed — showing basic metadata only.');
    }

    progress.complete('contentAI', {
      industry: analysis.industry,
      themes: analysis.themes?.length || 0,
      contentMaturity: analysis.contentMaturity,
    });

    return analysis;
  } catch (err) {
    console.error('[ContentAI] Gemini call failed:', err.message);
    progress.progress('contentAI', 80, 'AI unavailable, using basic analysis');
    const errorMsg = err.code === 'QUOTA_EXHAUSTED'
      ? 'AI credits exhausted — showing basic metadata extracted from the page.'
      : `AI analysis unavailable (${err.message}) — showing basic metadata.`;
    const basic = buildBasicAnalysis(crawlData, techData, errorMsg);
    progress.complete('contentAI', { source: 'basic', industry: basic.industry });
    return basic;
  }
}

/**
 * Build a basic content analysis from crawl metadata when AI is unavailable.
 */
function buildBasicAnalysis(crawlData, techData, errorMsg) {
  const title = crawlData.title || '';
  const description = crawlData.meta?.description || '';
  const siteName = crawlData.meta?.siteName || title;

  return {
    _aiError: errorMsg,
    companyName: siteName || null,
    industry: 'Not determined (AI unavailable)',
    subIndustry: null,
    themes: description ? description.split(/[,.]/).map(s => s.trim()).filter(s => s.length > 3 && s.length < 60).slice(0, 3) : [],
    messaging: description || 'No description available.',
    targetAudience: null,
    valueProposition: description || null,
    contentTypes: [],
    contentMaturity: null,
    personalization: null,
    seoSignals: {
      hasStructuredData: (crawlData.rawHtml || '').includes('application/ld+json'),
      hasSitemap: null,
      hasCanonical: (crawlData.rawHtml || '').includes('rel="canonical"'),
      metaDescriptionQuality: description ? (description.length > 50 ? 'Good' : 'Fair') : 'Missing',
    },
  };
}

module.exports = { analyzeContent };
