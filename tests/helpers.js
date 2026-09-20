'use strict';

const { createApp } = require('../server/app');

/** Starts the app on a random port with a fake LLM and returns helpers for the test. */
async function startServer({ llm, ...options } = {}) {
  const app = createApp({ llm, ...options });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    close: () => new Promise((resolve) => server.close(resolve)),
    postJson: (path, body) =>
      fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
  };
}

function fakeLlm(response) {
  const calls = [];
  return {
    calls,
    generateJson: async (prompt) => {
      calls.push(prompt);
      return typeof response === 'function' ? response(prompt) : response;
    },
  };
}

const LONG_TEXT =
  'The Tenant shall pay a monthly rent of Rs. 25,000 and a refundable security deposit of Rs. 75,000 to the Landlord.';

module.exports = { startServer, fakeLlm, LONG_TEXT };
