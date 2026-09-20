'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGeminiClient, extractJson } = require('../server/llm');

const prompt = { system: 'sys', user: 'user' };
const noSleep = async () => {};

const okResponse = (text) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
});
const errorResponse = (status, message = '') => ({
  ok: false,
  status,
  json: async () => ({ error: { message } }),
});

test('extractJson handles plain JSON, code fences and surrounding prose', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJson('Here you go: {"a":3} Hope it helps'), { a: 3 });
  assert.throws(() => extractJson('not json at all'), { status: 502 });
  assert.throws(() => extractJson(''), { status: 502 });
});

test('client requires an API key and at least one model', () => {
  assert.throws(() => createGeminiClient({ apiKey: '', models: ['m'] }));
  assert.throws(() => createGeminiClient({ apiKey: 'k', models: [] }));
});

test('client sends the key in a header, not the URL, and returns parsed JSON', async () => {
  let seen;
  const client = createGeminiClient({
    apiKey: 'secret-key',
    models: ['model-a'],
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return okResponse('{"ok":true}');
    },
  });
  assert.deepEqual(await client.generateJson(prompt), { ok: true });
  assert.ok(!seen.url.includes('secret-key'));
  assert.equal(seen.options.headers['x-goog-api-key'], 'secret-key');
  assert.equal(client.lastModelUsed, 'model-a');
});

test('client falls back to the next model when one is not found', async () => {
  const tried = [];
  const client = createGeminiClient({
    apiKey: 'k',
    models: ['retired-model', 'good-model'],
    sleep: noSleep,
    fetchImpl: async (url) => {
      tried.push(url);
      return url.includes('retired-model') ? errorResponse(404, 'model not found') : okResponse('{"ok":1}');
    },
  });
  assert.deepEqual(await client.generateJson(prompt), { ok: 1 });
  assert.equal(tried.length, 2);
  assert.equal(client.lastModelUsed, 'good-model');
});

test('client retries once after a temporary 503', async () => {
  let calls = 0;
  const client = createGeminiClient({
    apiKey: 'k',
    models: ['m'],
    sleep: noSleep,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? errorResponse(503, 'overloaded') : okResponse('{"ok":2}');
    },
  });
  assert.deepEqual(await client.generateJson(prompt), { ok: 2 });
  assert.equal(calls, 2);
});

test('client reports an invalid key without trying other models', async () => {
  let calls = 0;
  const client = createGeminiClient({
    apiKey: 'bad',
    models: ['m1', 'm2'],
    sleep: noSleep,
    fetchImpl: async () => {
      calls += 1;
      return errorResponse(400, 'API key not valid. Please pass a valid API key.');
    },
  });
  await assert.rejects(client.generateJson(prompt), { status: 503, code: 'LLM_AUTH' });
  assert.equal(calls, 1);
});

test('client surfaces a friendly rate-limit error when every attempt is throttled', async () => {
  const client = createGeminiClient({
    apiKey: 'k',
    models: ['m'],
    sleep: noSleep,
    fetchImpl: async () => errorResponse(429, 'quota'),
  });
  await assert.rejects(client.generateJson(prompt), { status: 429 });
});

test('client reports blocked content clearly', async () => {
  const client = createGeminiClient({
    apiKey: 'k',
    models: ['m'],
    sleep: noSleep,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }),
    }),
  });
  await assert.rejects(client.generateJson(prompt), { status: 422, code: 'LLM_BLOCKED' });
});
