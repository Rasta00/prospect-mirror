/**
 * Gemini API helpers + 3-tier JSON extraction.
 * Drop-in replacement for claude-utils.js using Google's Gemini API.
 */
const config = require('../../config/default');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Send a prompt to Gemini and return the raw text response.
 */
async function askGemini(prompt, { maxTokens, systemPrompt } = {}) {
  const model = config.gemini.model;
  const url = `${GEMINI_API_URL}/${model}:generateContent?key=${config.gemini.apiKey}`;

  const contents = [{ role: 'user', parts: [{ text: prompt }] }];

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens || config.gemini.maxTokens,
      temperature: 0.3,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.gemini.timeoutMs),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map(p => p.text)
    ?.join('\n') || '';
  return text;
}

/**
 * Send a prompt to Gemini and extract structured JSON from the response.
 * Uses the 3-tier fallback:
 *   1. ```json ... ``` fenced block
 *   2. Direct JSON parse of entire response
 *   3. First { ... } block (greedy)
 */
async function askGeminiJson(prompt, { maxTokens, systemPrompt } = {}) {
  const text = await askGemini(prompt, { maxTokens, systemPrompt });
  return extractJson(text);
}

/**
 * 3-tier JSON extraction.
 *
 * @param {string} text - Raw response text
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

module.exports = { askGemini, askGeminiJson, extractJson };
