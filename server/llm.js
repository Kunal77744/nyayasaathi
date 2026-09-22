'use strict';

const { AppError } = require('./errors');

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Pulls a JSON object out of model text, tolerating code fences or stray prose.
 *
 * @param {unknown} text - Raw model string output.
 * @returns {object} Parsed JSON object.
 */
function extractJson(text) {
  const bad = () =>
    new AppError(502, 'The AI returned a response we could not read. Please try again.', 'BAD_LLM_OUTPUT');
  if (typeof text !== 'string' || !text.trim()) throw bad();
  let body = text.trim();
  const fenced = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) body = fenced[1];
  try {
    return JSON.parse(body);
  } catch (_) {
    /* fall through to brace search */
  }
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch (_) {
      /* ignore */
    }
  }
  throw bad();
}

/**
 * Minimal Gemini REST client (no SDK, so nothing extra to install or break).
 * Tries each model in order; a retired model (404) or transient failure moves on to the next.
 *
 * @param {object} options - Client setup options.
 * @param {string} options.apiKey - Gemini API key.
 * @param {string[]} options.models - Priority list of Gemini model names.
 * @param {number} [options.timeoutMs=45000] - Request timeout in ms.
 * @param {Function} [options.fetchImpl=globalThis.fetch] - Fetch implementation.
 * @param {Function} [options.sleep] - Sleep helper function.
 * @returns {object} Gemini API client instance.
 */
function createGeminiClient({
  apiKey,
  models,
  timeoutMs = 45000,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is required');
  if (!models || models.length === 0) throw new Error('At least one model is required');

  const client = { lastModelUsed: null };

  async function callModel(model, { system, user, maxOutputTokens = 4096 }) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens },
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const message =
        err && err.name === 'AbortError'
          ? 'The AI took too long to respond. Please try again.'
          : 'Could not reach the AI service. Please try again.';
      return { retryable: new AppError(504, message, 'LLM_UNREACHABLE') };
    } finally {
      clearTimeout(timer);
    }

    let payload = null;
    try {
      payload = await res.json();
    } catch (_) {
      /* non-JSON body */
    }
    const apiMessage = (payload && payload.error && payload.error.message) || '';

    if (res.ok) {
      const candidate = payload && payload.candidates && payload.candidates[0];
      const text =
        candidate && candidate.content && Array.isArray(candidate.content.parts)
          ? candidate.content.parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('')
          : '';
      if (text.trim()) return { text };
      if (payload && payload.promptFeedback && payload.promptFeedback.blockReason) {
        throw new AppError(
          422,
          'The AI could not process this document. Try a different section of it.',
          'LLM_BLOCKED'
        );
      }
      return { retryable: new AppError(502, 'The AI returned an empty response. Please try again.', 'BAD_LLM_OUTPUT') };
    }

    if (res.status === 404) return { skipModel: true };
    if (res.status === 400) {
      if (/api key/i.test(apiMessage)) {
        throw new AppError(
          503,
          'The AI service key is invalid. Ask the site owner to check GEMINI_API_KEY.',
          'LLM_AUTH'
        );
      }
      if (/not found|not supported|unsupported|invalid model/i.test(apiMessage)) return { skipModel: true };
      throw new AppError(502, 'The AI could not handle this request. Please try again.', 'LLM_BAD_REQUEST');
    }
    if (res.status === 401 || res.status === 403) {
      throw new AppError(
        503,
        'The AI service key is invalid or not authorised. Ask the site owner to check GEMINI_API_KEY.',
        'LLM_AUTH'
      );
    }
    if (res.status === 429) {
      return {
        retryable: new AppError(
          429,
          'The AI is receiving too many requests. Please wait a minute and try again.',
          'LLM_RATE_LIMIT'
        ),
      };
    }
    return {
      retryable: new AppError(503, 'The AI service is busy right now. Please try again shortly.', 'LLM_UNAVAILABLE'),
    };
  }

  client.generateJson = async function generateJson(prompt) {
    let lastError = null;
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await callModel(model, prompt);
        if (result.text) {
          client.lastModelUsed = model;
          return extractJson(result.text);
        }
        if (result.skipModel) {
          lastError = new AppError(
            503,
            'No available AI model responded. Ask the site owner to set GEMINI_MODEL.',
            'LLM_NO_MODEL'
          );
          break;
        }
        lastError = result.retryable;
        if (attempt === 0) await sleep(200);
      }
    }
    throw lastError || new AppError(503, 'The AI service is unavailable.', 'LLM_UNAVAILABLE');
  };

  return client;
}

module.exports = { createGeminiClient, extractJson };
