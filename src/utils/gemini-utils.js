/**
 * Gemini API helpers + 3-tier JSON extraction.
 * Drop-in replacement for claude-utils.js using Google's Gemini API.
 */
const config = require('../../config/default');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_RETRIES = 3;

/**
 * Send a prompt to Gemini and return the raw text response.
 * Includes retry logic for 429 rate-limit errors.
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

  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.gemini.timeoutMs),
      });

      if (response.status === 429) {
        // Rate limited — parse retry delay or use exponential backoff
        const errBody = await response.json().catch(() => ({}));
        const retryDetail = errBody.error?.details?.find(d => d.retryDelay);
        const delaySec = retryDetail ? parseFloat(retryDetail.retryDelay) : (attempt + 1) * 15;
        const delayMs = Math.min(Math.ceil(delaySec * 1000), 60_000);

        console.warn(`[Gemini] Rate limited (429), retrying in ${Math.ceil(delaySec)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delayMs);
        continue;
      }

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${err.slice(0, 300)}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts
        ?.map(p => p.text)
        ?.join('\n') || '';

      if (!text) {
        const blockReason = data.candidates?.[0]?.finishReason;
        console.warn(`[Gemini] Empty response. finishReason: ${blockReason}`);
      }

      return text;
    } catch (err) {
      lastError = err;
      if (err.name === 'TimeoutError') {
        console.error(`[Gemini] Request timed out (attempt ${attempt + 1}/${MAX_RETRIES})`);
        continue;
      }
      // Non-retryable error
      throw err;
    }
  }

  throw lastError || new Error('Gemini API failed after retries');
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
  const parsed = extractJson(text);
  if (!parsed) {
    console.error('[Gemini] Failed to extract JSON from response:', text.slice(0, 500));
  }
  return parsed;
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { askGemini, askGeminiJson, extractJson };
