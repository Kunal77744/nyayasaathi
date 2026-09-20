'use strict';

// Run `npm run check-llm` after setting GEMINI_API_KEY to confirm the key and model work.
const config = require('../server/config');
const { createGeminiClient } = require('../server/llm');

(async () => {
  if (!config.geminiApiKey) {
    console.error('GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.');
    process.exit(1);
  }
  const client = createGeminiClient({ apiKey: config.geminiApiKey, models: config.models });
  try {
    const result = await client.generateJson({
      system: 'Reply with only a JSON object.',
      user: 'Return {"ok": true}',
    });
    console.log('OK. Model used:', client.lastModelUsed, '| reply:', JSON.stringify(result));
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exit(1);
  }
})();
