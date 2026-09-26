'use strict';
const serverless = require('serverless-http');
const config = require('../../server/config');
const { createApp } = require('../../server/app');
const { createGeminiClient } = require('../../server/llm');

const llm = config.geminiApiKey
  ? createGeminiClient({
      apiKey: config.geminiApiKey,
      models: config.models,
      timeoutMs: 9000,
    })
  : null;

const app = createApp({ llm });

module.exports.handler = serverless(app);
