'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, LONG_TEXT } = require('./helpers');

function upload(base, name, content, type = 'text/plain') {
  const form = new FormData();
  form.append('file', new Blob([content], { type }), name);
  return fetch(base + '/api/extract', { method: 'POST', body: form });
}

test('TXT upload returns cleaned text', async (t) => {
  const s = await startServer({ llm: null });
  t.after(() => s.close());
  const res = await upload(s.base, 'agreement.txt', LONG_TEXT + '\r\n');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.text, LONG_TEXT);
  assert.equal(body.truncated, false);
});

test('a real PDF is parsed into text', async (t) => {
  const s = await startServer({ llm: null });
  t.after(() => s.close());
  const res = await upload(
    s.base,
    'agreement.pdf',
    fs.readFileSync(path.join(__dirname, 'fixtures', 'rent.pdf')),
    'application/pdf'
  );
  assert.equal(res.status, 200);
  const { text } = await res.json();
  assert.match(text, /Monthly rent is Rs 25000/);
  assert.doesNotMatch(text, /-- 1 of 1 --/);
});

test('a broken PDF gives a friendly error', async (t) => {
  const s = await startServer({ llm: null });
  t.after(() => s.close());
  const res = await upload(s.base, 'bad.pdf', '%PDF-1.4 this is not really a pdf', 'application/pdf');
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /could not read/i);
});

test('unsupported and disguised files are rejected', async (t) => {
  const s = await startServer({ llm: null });
  t.after(() => s.close());
  assert.equal((await upload(s.base, 'photo.png', 'binary', 'image/png')).status, 415);
  assert.equal((await upload(s.base, 'evil.txt', 'abc\u0000def' + 'x'.repeat(60))).status, 415);
  const none = await fetch(s.base + '/api/extract', { method: 'POST' });
  assert.equal(none.status, 400);
});

test('files over the size limit are refused', async (t) => {
  const s = await startServer({
    llm: null,
    limits: { minDocChars: 40, maxDocChars: 40000, maxQuestionChars: 500, maxFileBytes: 1024 },
  });
  t.after(() => s.close());
  const res = await upload(s.base, 'big.txt', 'x'.repeat(5000));
  assert.equal(res.status, 413);
});

test('very long uploads are truncated to the analysis limit', async (t) => {
  const s = await startServer({ llm: null });
  t.after(() => s.close());
  const res = await upload(s.base, 'long.txt', 'word '.repeat(12000));
  const body = await res.json();
  assert.equal(body.truncated, true);
  assert.equal(body.text.length, 40000);
});
