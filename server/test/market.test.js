import test from 'node:test';
import assert from 'node:assert/strict';
import { processPrices } from '../src/services/marketService.js';
import { buildSamplePrices } from '../src/data/sample.js';
import { toPerQuintal } from '../src/units.js';
import { NOW } from './helpers.js';

test('price units are normalised to INR per quintal', () => {
  assert.equal(toPerQuintal(24.1, 'INR/kg'), 2410); assert.equal(toPerQuintal(24000, 'INR/tonne'), 2400); assert.equal(toPerQuintal(2425, 'INR/quintal'), 2425);
  assert.equal(toPerQuintal(5, 'INR/bag'), null);
});
test('stale records are flagged and excluded from comparison', () => {
  const r = processPrices(buildSamplePrices(NOW).filter((p) => p.commodity === 'wheat'), { now: NOW });
  assert.equal(r.status, 'ok'); assert.equal(r.prices.length, 3);
  assert.equal(r.prices.find((p) => p.market === 'Pehowa mandi').freshness, 'stale');
  assert.equal(r.comparison.count, 2); assert.equal(r.comparison.min, 2410); assert.equal(r.comparison.max, 2425);
});
test('T8 no records gives an unavailable state, not an invented price', () => {
  const r = processPrices([], { now: NOW });
  assert.equal(r.status, 'unavailable'); assert.deepEqual(r.prices, []); assert.equal(r.comparison, null); assert.ok(r.message);
});
test('only old records gives stale status with a clear message', () => {
  const r = processPrices(buildSamplePrices(NOW).filter((p) => p.market === 'Pehowa mandi'), { now: NOW });
  assert.equal(r.status, 'stale'); assert.match(r.message, /not current/);
});
test('malformed and duplicate records are rejected or collapsed; as-of date filters', () => {
  const p = buildSamplePrices(NOW)[0];
  const r = processPrices([p, { ...p }, { ...p, price: -5 }, { ...p, unit: 'INR/bag' }, { ...p, date: 'nope' }], { now: NOW });
  assert.equal(r.prices.length, 1); assert.equal(r.rejected_records, 3);
  assert.equal(processPrices([p], { now: NOW, asOf: '2026-10-01' }).status, 'unavailable');
});
