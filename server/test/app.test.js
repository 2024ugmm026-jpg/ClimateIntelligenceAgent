// HTTP-level tests. They need `npm install` (express). Without it they are skipped, not failed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

let createApp = null;
try { ({ createApp } = await import('../src/app.js')); } catch { /* express not installed */ }

async function withServer(fn, overrides = {}) {
  const server = createApp(loadConfig({}), overrides).listen(0);
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}
const post = (base, path, body, raw) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body) });

test('HTTP: health, sample, advisory, chat, export', { skip: !createApp && 'express is not installed' }, () => withServer(async (base) => {
  assert.equal((await (await fetch(`${base}/api/health`)).json()).mode, 'demo');
  assert.ok((await (await fetch(`${base}/api/sample`)).json()).scenarios.length);
  const adv = await (await post(base, '/api/advisory', { data_mode: 'demo', scenario: 'normal_karnal_wheat', location_name: 'Karnal', crop: 'wheat', use_sample_soil: true })).json();
  assert.ok(adv.session_id);
  const chat = await (await post(base, '/api/chat', { session_id: adv.session_id, question: 'Summary?' })).json();
  assert.equal(chat.mode, 'template');
  const exp = await post(base, '/api/reports/export', { session_id: adv.session_id });
  assert.match(exp.headers.get('content-type'), /markdown/);
}));

test('T12 HTTP: malformed JSON, wrong types and unknown routes get safe errors', { skip: !createApp && 'express is not installed' }, () => withServer(async (base) => {
  const bad = await post(base, '/api/advisory', null, '{not json');
  assert.equal(bad.status, 400); assert.match((await bad.json()).detail, /valid JSON/);
  const wrong = await post(base, '/api/advisory', null, '"just a string"');
  assert.equal(wrong.status, 400);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  assert.equal((await fetch(`${base}/api/sessions/unknown`)).status, 404);
  const big = await post(base, '/api/chat', { question: 'x'.repeat(100000) });
  assert.equal(big.status, 413);
}));

test('HTTP: rate limit returns 429 with a plain message', { skip: !createApp && 'express is not installed' }, () => withServer(async (base) => {
  let last;
  for (let i = 0; i < 4; i++) last = await post(base, '/api/chat', { question: 'hi' });
  assert.equal(last.status, 429);
}, { rateLimit: 3 }));
