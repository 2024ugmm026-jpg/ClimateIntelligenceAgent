// Small fetch wrapper: timeout, JSON parsing, retry with back-off. fetch is injectable for tests.
export async function requestJson(fetchImpl, url, { method = 'GET', headers = {}, body, timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method, headers, body, signal: ctrl.signal });
    if (!res.ok) {
      const e = new Error(`HTTP ${res.status}`);
      e.permanent = res.status >= 400 && res.status < 500 && res.status !== 429; // client errors will not fix themselves
      throw e;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function withRetry(fn, { retries = 2, delayMs = 300, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(attempt); } catch (e) {
      last = e;
      if (e && e.permanent) break;
      if (attempt < retries) await sleep(delayMs * (attempt + 1));
    }
  }
  throw last;
}
