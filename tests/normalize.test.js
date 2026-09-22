'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAnalysis, normalizeComparison, normalizeAnswer } = require('../server/normalize');

test('normalizeAnalysis sorts flags by severity and fixes unknown severities', () => {
  const result = normalizeAnalysis({
    summary: 'A rent agreement.',
    flags: [
      { severity: 'low', clause: 'Rent is Rs. 25,000', whyItMatters: 'Standard.' },
      { severity: 'HIGH', clause: 'Deposit forfeited', whyItMatters: 'Money at risk.' },
      { severity: 'catastrophic', clause: 'Odd one', whyItMatters: 'Unknown severity.' },
    ],
  });
  assert.deepEqual(
    result.flags.map((f) => f.severity),
    ['high', 'medium', 'low']
  );
  assert.equal(result.documentType, 'Legal document');
  assert.deepEqual(result.checklist, []);
});

test('normalizeAnalysis drops junk items and caps list sizes', () => {
  const result = normalizeAnalysis({
    summary: 'ok',
    keyFacts: [{ label: 'Rent', value: 25000 }, { label: '', value: 'x' }, null, 'text'],
    checklist: Array.from({ length: 30 }, (_, i) => `item ${i}`),
    lawyerQuestions: ['one', 5, {}, ''],
  });
  assert.deepEqual(result.keyFacts, [{ label: 'Rent', value: '25000' }]);
  assert.equal(result.checklist.length, 10);
  assert.deepEqual(result.lawyerQuestions, ['one', '5']);
});

test('normalizeAnalysis rejects output with nothing useful', () => {
  assert.throws(() => normalizeAnalysis(null), { status: 502 });
  assert.throws(() => normalizeAnalysis([]), { status: 502 });
  assert.throws(() => normalizeAnalysis({ summary: '', flags: [] }), { status: 502 });
});

test('normalizeComparison keeps a valid risk marker and defaults the rest', () => {
  const result = normalizeComparison({
    overview: 'Version B is friendlier.',
    differences: [
      { topic: 'Deposit', documentA: '3 months', documentB: '2 months', higherRiskIn: 'a' },
      { topic: 'Notice', higherRiskIn: 'Similar' },
      { topic: 'Repairs', higherRiskIn: 'who knows' },
      { topic: '' },
    ],
  });
  assert.deepEqual(
    result.differences.map((d) => d.higherRiskIn),
    ['A', 'similar', 'unclear']
  );
  assert.equal(result.differences[1].documentA, 'Not mentioned');
  assert.throws(() => normalizeComparison({}), { status: 502 });
});

test('normalizeAnswer requires an answer and treats foundInDocument strictly', () => {
  const result = normalizeAnswer({ answer: 'One month.', foundInDocument: 'yes', quote: '' });
  assert.equal(result.foundInDocument, false);
  assert.equal(result.quote, null);
  assert.throws(() => normalizeAnswer({ answer: '  ' }), { status: 502 });
});
