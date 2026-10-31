import { randomUUID } from 'node:crypto';
// In-memory sessions. Nothing is written to disk; sessions vanish on restart.
export function createSessionStore(max = 200) {
  const map = new Map();
  return {
    save(entry) {
      const id = randomUUID();
      entry.advisory.session_id = id;
      map.set(id, entry);
      if (map.size > max) map.delete(map.keys().next().value);
      return id;
    },
    get: (id) => map.get(id) || null,
    update(id, entry) { entry.advisory.session_id = id; map.set(id, entry); },
  };
}
