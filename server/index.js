'use strict';

const config = require('./config');
const { createApp } = require('./app');
const { createGeminiClient } = require('./llm');

const llm = config.geminiApiKey
  ? createGeminiClient({
      apiKey: config.geminiApiKey,
      models: config.models,
      timeoutMs: config.llmTimeoutMs,
    })
  : null;

if (!llm) {
  console.warn('GEMINI_API_KEY is not set: the site will load but AI features will return an error.');
}

const app = createApp({ llm });
app.listen(config.port, () => {
  console.log(`NyayaSaathi running on port ${config.port}`);
});
