'use strict';

require('dotenv').config({ quiet: true });

const positiveNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const config = {
  port: positiveNumber(process.env.PORT, 3000),
  geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),
  // Preferred model first, then fallbacks used automatically if a model is retired/unavailable.
  models: [
    ...new Set(
      [process.env.GEMINI_MODEL, 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest']
        .map((m) => (m || '').trim())
        .filter(Boolean)
    ),
  ],
  limits: {
    minDocChars: 40,
    maxDocChars: 40000,
    maxQuestionChars: 500,
    maxFileBytes: 5 * 1024 * 1024,
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: positiveNumber(process.env.RATE_LIMIT_MAX, 60),
  },
  llmTimeoutMs: 45000,
};

module.exports = config;
