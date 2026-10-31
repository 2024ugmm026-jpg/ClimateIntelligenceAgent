export function createCache() {
  const map = new Map();
  return {
    get: (key) => map.get(key) || null,
    set(key, value, ttlMs, now = new Date()) {
      map.set(key, { value, stored_at: now.toISOString(), expires_at: new Date(now.getTime() + ttlMs).toISOString() });
      if (map.size > 200) map.delete(map.keys().next().value);
    },
    isExpired: (entry, now = new Date()) => now.toISOString() >= entry.expires_at,
  };
}
