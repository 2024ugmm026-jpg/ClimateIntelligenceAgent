const BASE = import.meta.env.VITE_API_BASE || '/api';

export class ApiFailure extends Error {
  constructor(message, { status = 0, errors = [] } = {}) { super(message); this.status = status; this.errors = errors; }
}

async function call(path, options) {
  let res;
  try { res = await fetch(BASE + path, { headers: { 'content-type': 'application/json' }, ...options }); }
  catch { throw new ApiFailure('network'); }
  const isText = (res.headers.get('content-type') || '').includes('markdown');
  const data = isText ? await res.text() : await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiFailure(data.detail || 'Request failed.', { status: res.status, errors: data.errors || [] });
  return data;
}

export const api = {
  health: () => call('/health'),
  sample: () => call('/sample'),
  advisory: (payload) => call('/advisory', { method: 'POST', body: JSON.stringify(payload) }),
  chat: (payload) => call('/chat', { method: 'POST', body: JSON.stringify(payload) }),
  exportReport: (session_id) => call('/reports/export', { method: 'POST', body: JSON.stringify({ session_id, format: 'markdown' }) }),
};
