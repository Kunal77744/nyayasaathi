'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TtlCache, cacheKey } = require('../server/cache');

test('cache returns stored values and expires them', () => {
  let now = 1000;
  const cache = new TtlCache({ ttlMs: 100, now: () => now });
  cache.set('a', 1);
  assert.equal(cache.get('a'), 1);
  now += 101;
  assert.equal(cache.get('a'), undefined);
});

test('cache evicts the oldest entry when full', () => {
  const cache = new TtlCache({ max: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('c'), 3);
  assert.equal(cache.size, 2);
});

test('cacheKey differs by kind and content', () => {
  assert.notEqual(cacheKey('analyze', 'en', 'x'), cacheKey('analyze', 'hi', 'x'));
  assert.notEqual(cacheKey('analyze', 'en', 'x'), cacheKey('ask', 'en', 'x'));
  assert.equal(cacheKey('analyze', 'en', 'x'), cacheKey('analyze', 'en', 'x'));
});
