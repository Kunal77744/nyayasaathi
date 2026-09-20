'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanText, validateDocument, validateLanguage, validateQuestion } = require('../server/validate');

test('cleanText normalises newlines and strips control characters', () => {
  assert.equal(cleanText('a\r\nb\u0000c\n\n\n\nd  \n'), 'a\nbc\n\nd');
  assert.equal(cleanText(42), '');
});

test('validateDocument accepts normal text and trims it', () => {
  const text = validateDocument('  ' + 'x'.repeat(60) + '  ');
  assert.equal(text.length, 60);
});

test('validateDocument rejects missing, short and oversized input', () => {
  assert.throws(() => validateDocument(undefined), { status: 400 });
  assert.throws(() => validateDocument('too short'), { status: 400 });
  assert.throws(() => validateDocument('x'.repeat(40001)), { status: 413 });
});

test('validateLanguage defaults to English and rejects unknown values', () => {
  assert.equal(validateLanguage(undefined), 'en');
  assert.equal(validateLanguage('hi'), 'hi');
  assert.throws(() => validateLanguage('fr'), { status: 400 });
});

test('validateQuestion requires a non-empty, reasonably short question', () => {
  assert.equal(validateQuestion('  What is the notice period?  '), 'What is the notice period?');
  assert.throws(() => validateQuestion('   '), { status: 400 });
  assert.throws(() => validateQuestion('q'.repeat(501)), { status: 400 });
});
