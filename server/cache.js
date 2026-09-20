'use strict';

const crypto = require('node:crypto');

/** Tiny in-memory cache with a size cap and expiry, so repeat requests skip the LLM call. */
class TtlCache {
  constructor({ max = 50, ttlMs = 60 * 60 * 1000, now = Date.now } = {}) {
    this.max = max;
    this.ttlMs = ttlMs;
    this.now = now;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expires: this.now() + this.ttlMs });
    while (this.store.size > this.max) {
      this.store.delete(this.store.keys().next().value);
    }
  }

  get size() {
    return this.store.size;
  }
}

function cacheKey(kind, ...parts) {
  return crypto.createHash('sha256').update(JSON.stringify([kind, ...parts])).digest('hex');
}

module.exports = { TtlCache, cacheKey };
