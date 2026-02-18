/**
 * Claude API helpers + 3-tier JSON extraction — ported from ClaudeProvider.php.
 */
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../../config/default');

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

/**
 * Send a prompt to Claude and return the raw text response.
 */
async function askClaude(prompt, { maxTokens, systemPrompt } = {}) {
  const params = {
    model: config.anthropic.model,
    max_tokens: maxTokens || config.anthropic.maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (systemPrompt) {
    params.system = systemPrompt;
  }

  const response = await getClient().messages.create(params);
  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');
  return text;
}

/**
 * Send a prompt to Claude and extract structured JSON from the response.
 * Uses the 3-tier fallback from ClaudeProvider.php:
 *   1. ```json ... ``` fenced block
 *   2. Direct JSON parse of entire response
 *   3. First { ... } block (greedy)
 */
async function askClaudeJson(prompt, { maxTokens, systemPrompt } = {}) {
  const text = await askClaude(prompt, { maxTokens, systemPrompt });
  return extractJson(text);
}

/**
 * 3-tier JSON extraction.
 *
 * @param {string} text - Raw Claude response text
 * @returns {object|null} Parsed JSON or null
 */
function extractJson(text) {
  if (!text) return null;

  // Tier 1: Extract from ```json ... ``` markdown fences
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch { /* fall through */ }
  }

  // Tier 2: Parse entire response as JSON
  try {
    return JSON.parse(text.trim());
  } catch { /* fall through */ }

  // Tier 3: Extract first { ... } block (greedy — matches outermost braces)
  const braces = text.match(/\{[\s\S]*\}/);
  if (braces) {
    try {
      return JSON.parse(braces[0]);
    } catch { /* fall through */ }
  }

  return null;
}

module.exports = { askClaude, askClaudeJson, extractJson, getClient };
