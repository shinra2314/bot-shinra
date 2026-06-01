class MemoryCache {
  constructor() {
    this.store = new Map();
    this.rateLog = new Map();
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, ttlMs) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async del(key) {
    this.store.delete(key);
  }

  async checkCooldown(key, ttlMs) {
    const entry = this.store.get(key);
    const now = Date.now();
    if (entry && entry.expiresAt > now) return entry.expiresAt - now;
    this.store.set(key, { value: 1, expiresAt: now + ttlMs });
    return 0;
  }

  async checkGlobalRate(key, limit, windowMs) {
    const now = Date.now();
    const cutoff = now - windowMs;
    const log = this.rateLog.get(key) || [];
    const recent = log.filter((ts) => ts > cutoff);
    if (recent.length >= limit) {
      const oldest = recent[0];
      return Math.max(1, oldest + windowMs - now);
    }
    recent.push(now);
    this.rateLog.set(key, recent);
    return 0;
  }

  async close() {}
}

class RedisCache {
  constructor(redisUrl) {
    const Redis = require('ioredis');
    this.client = new Redis(redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false
    });
    this.client.on('error', (err) => console.warn('[redis]', err.message));
  }

  async get(key) {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }

  async set(key, value, ttlMs) {
    await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
  }

  async del(key) {
    await this.client.del(key);
  }

  async checkCooldown(key, ttlMs) {
    const ok = await this.client.set(key, '1', 'PX', ttlMs, 'NX');
    if (ok === 'OK') return 0;
    const pttl = await this.client.pttl(key);
    return pttl > 0 ? pttl : 0;
  }

  async checkGlobalRate(key, limit, windowMs) {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.pexpire(key, windowMs);
    }
    if (count > limit) {
      const pttl = await this.client.pttl(key);
      return pttl > 0 ? pttl : windowMs;
    }
    return 0;
  }

  async close() {
    try { await this.client.quit(); } catch {}
  }
}

function createCache(redisUrl) {
  if (redisUrl) {
    try {
      const cache = new RedisCache(redisUrl);
      console.log('[cache] using Redis backend');
      return cache;
    } catch (error) {
      console.warn('[cache] Redis init failed, falling back to memory:', error.message);
    }
  }
  console.log('[cache] using in-memory backend');
  return new MemoryCache();
}

async function wrap(cache, key, ttlMs, factory) {
  const cached = await cache.get(key);
  if (cached !== null && cached !== undefined) return cached;
  const fresh = await factory();
  if (fresh !== null && fresh !== undefined) {
    await cache.set(key, fresh, ttlMs);
  }
  return fresh;
}

module.exports = { createCache, wrap, MemoryCache, RedisCache };
