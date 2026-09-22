'use strict';

const compression = require('compression');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');

const config = require('./config');
const { AppError } = require('./errors');
const { TtlCache, cacheKey } = require('./cache');
const { validateDocument, validateLanguage, validateQuestion } = require('./validate');
const { extractText } = require('./extract');
const { buildAnalyzePrompt, buildComparePrompt, buildAskPrompt } = require('./prompts');
const { normalizeAnalysis, normalizeComparison, normalizeAnswer } = require('./normalize');

const DISCLAIMER =
  'This is general information to help you understand the document. It is not legal advice. Please consult a qualified lawyer before making decisions.';

/**
 * Builds the Express app instance with middleware, security headers,
 * caching, compression, and error handling.
 *
 * @param {object} [options] - Setup options.
 * @param {object|null} [options.llm=null] - LLM provider object.
 * @param {number} [options.rateLimitMax=config.rateLimit.max] - Max rate limit requests per window.
 * @param {object} [options.limits=config.limits] - Validation size limits.
 * @returns {import('express').Express} Express application.
 */
function createApp({ llm = null, rateLimitMax = config.rateLimit.max, limits = config.limits } = {}) {
  const app = express();
  const cache = new TtlCache();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Payload & HTTP response compression
  app.use(compression());

  // Security headers setup via Helmet & custom policy
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'font-src': ["'self'", 'data:'],
          'img-src': ["'self'", 'data:', 'blob:'],
          'upgrade-insecure-requests': null,
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    })
  );

  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });

  const apiLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a few minutes and try again.' },
  });

  const jsonBody = express.json({ limit: '600kb' });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: limits.maxFileBytes, files: 1 },
  });

  function requireLlm() {
    if (!llm) {
      throw new AppError(503, 'The AI service is not configured on this server yet.', 'LLM_NOT_CONFIGURED');
    }
  }

  async function runCached(kind, inputs, prompt, normalize) {
    const key = cacheKey(kind, ...inputs);
    const hit = cache.get(key);
    if (hit) return hit;
    const result = normalize(await llm.generateJson(prompt));
    cache.set(key, result);
    return result;
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', aiConfigured: Boolean(llm) });
  });

  app.post('/api/extract', apiLimiter, upload.single('file'), async (req, res) => {
    const text = await extractText(req.file);
    const truncated = text.length > limits.maxDocChars;
    res.json({
      text: truncated ? text.slice(0, limits.maxDocChars) : text,
      chars: Math.min(text.length, limits.maxDocChars),
      truncated,
    });
  });

  app.post('/api/analyze', apiLimiter, jsonBody, async (req, res) => {
    const body = req.body || {};
    const text = validateDocument(body.text, 'Document', limits);
    const language = validateLanguage(body.language);
    requireLlm();
    const analysis = await runCached(
      'analyze',
      [language, text],
      buildAnalyzePrompt({ text, language }),
      normalizeAnalysis
    );
    res.json({ ...analysis, disclaimer: DISCLAIMER });
  });

  app.post('/api/compare', apiLimiter, jsonBody, async (req, res) => {
    const body = req.body || {};
    const textA = validateDocument(body.textA, 'Document A', limits);
    const textB = validateDocument(body.textB, 'Document B', limits);
    const language = validateLanguage(body.language);
    requireLlm();
    const comparison = await runCached(
      'compare',
      [language, textA, textB],
      buildComparePrompt({ textA, textB, language }),
      normalizeComparison
    );
    res.json({ ...comparison, disclaimer: DISCLAIMER });
  });

  app.post('/api/ask', apiLimiter, jsonBody, async (req, res) => {
    const body = req.body || {};
    const text = validateDocument(body.text, 'Document', limits);
    const question = validateQuestion(body.question, limits);
    const language = validateLanguage(body.language);
    requireLlm();
    const answer = await runCached(
      'ask',
      [language, text, question],
      buildAskPrompt({ text, question, language }),
      normalizeAnswer
    );
    res.json({ ...answer, disclaimer: DISCLAIMER });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
      maxAge: '1d',
      etag: true,
    })
  );

  // Central error handler: user-safe messages only, never stack traces or document text.
  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({
        error: tooBig
          ? `File is too large (limit ${Math.round(limits.maxFileBytes / 1024 / 1024)} MB).`
          : 'Upload failed. Send a single PDF or TXT file.',
        code: 'UPLOAD_ERROR',
      });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request is too large.', code: 'TOO_LONG' });
    }
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      return res.status(400).json({ error: 'Request body must be valid JSON.', code: 'INVALID_INPUT' });
    }
    console.error('Unhandled error:', err && err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL' });
  });

  return app;
}

module.exports = { createApp, DISCLAIMER };
