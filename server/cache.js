'use strict';

const crypto = require('node:crypto');

/**
 * In-memory TTL cache with LRU eviction and expired-key purging.
 */
class TtlCache {
  /**
   * @param {object} [options] - Cache options.
   * @param {number} [options.max=50] - Maximum entry count.
   * @param {number} [options.ttlMs=3600000] - Entry TTL in milliseconds.
   * @param {Function} [options.now=Date.now] - Time getter function.
   */
  constructor({ max = 50, ttlMs = 60 * 60 * 1000, now = Date.now } = {}) {
    this.max = max;
    this.ttlMs = ttlMs;
    this.now = now;
    this.store = new Map();
  }

  /**
   * Retrieves an item from cache.
   *
   * @param {string} key - Cache key string.
   * @returns {any} Cached value or undefined.
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Sets a key-value pair in cache, evicting expired or oldest entries if over limit.
   *
   * @param {string} key - Cache key.
   * @param {any} value - Value to cache.
   */
  set(key, value) {
    this.purgeExpired();
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expires: this.now() + this.ttlMs });
    while (this.store.size > this.max) {
      this.store.delete(this.store.keys().next().value);
    }
  }

  /**
   * Removes all expired entries from cache store.
   */
  purgeExpired() {
    const nowTime = this.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expires <= nowTime) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Returns current count of entries in store.
   *
   * @returns {number} Active entry count.
   */
  get size() {
    return this.store.size;
  }
}

/**
 * Generates a SHA-256 cache key from operation kind and inputs.
 *
 * @param {string} kind - Operation type ('analyze', 'compare', 'ask').
 * @param {...any} parts - Dynamic input strings.
 * @returns {string} Hexadecimal SHA-256 hash.
 */
function cacheKey(kind, ...parts) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([kind, ...parts]))
    .digest('hex');
}

module.exports = { TtlCache, cacheKey };
