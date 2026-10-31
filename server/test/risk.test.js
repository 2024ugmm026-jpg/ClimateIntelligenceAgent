import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRisks } from '../src/riskEngine.js';
import { buildActions } from '../src/actions.js';
import { SCENARIOS, buildScenarioWeather, buildScenarioSoil } from '../src/data/sample.js';
import { NOW, TODAY } from './helpers.js';

const run = (id, over = {}) => {
  const s = SCENARIOS.find((x) => x.id === id);
  const soilS = buildScenarioSoil(s, NOW);
  const args = { weather: { records: buildScenarioWeather(s, NOW) }, soil: { moisture: { ...soilS.soil_moisture, origin: 'sample' } }, crop: s.crop, growthStage: s.growth_stage, today: TODAY, ...over };
  return Object.fromEntries(calculateRisks(args).map((r) => [r.risk_id, r]));
};

test('normal scenario: no elevated weather risk', () => {
  const r = run('normal_karnal_wheat');
  for (const k of ['dry_spell', 'heavy_rainfall', 'heat_stress', 'soil_moisture']) assert.equal(r[k].risk_level, 'low', k);
});
test('T4 dry spell: long dry streak is high and dry soil is high', () => {
  const r = run('dry_spell_karnal_wheat');
  assert.equal(r.dry_spell.risk_level, 'high'); assert.equal(r.dry_spell.score, 12);
  assert.equal(r.soil_moisture.risk_level, 'high');
});
test('T5 heavy rain: 3-day forecast total is high and mentions factors', () => {
  const r = run('heavy_rain_ranchi_rice');
  assert.equal(r.heavy_rainfall.risk_level, 'high'); assert.equal(r.heavy_rainfall.score, 122);
  assert.ok(r.heavy_rainfall.factors.some((f) => f.name === 'max_3_day_rainfall'));
});
test('heat risk uses stage-adjusted thresholds', () => {
  const r = run('heatwave_karnal_wheat');
  assert.equal(r.heat_stress.risk_level, 'high');
  const lax = run('heatwave_karnal_wheat', { growthStage: 'vegetative' });
  assert.equal(lax.heat_stress.risk_level, 'high'); // 38.2 >= 38 even without stage adjustment
  assert.equal(r.heat_stress.factors.find((f) => f.name === 'threshold_high').value, 36);
});
test('T6 missing soil data gives unknown, not low', () => {
  const r = run('normal_karnal_wheat', { soil: { moisture: null } });
  assert.equal(r.soil_moisture.risk_level, 'unknown'); assert.deepEqual(r.soil_moisture.missing_inputs, ['soil_moisture']);
});
test('stale soil reading gives unknown', () => {
  const r = run('normal_karnal_wheat', { soil: { moisture: { value: 30, observed_on: '2026-10-01', origin: 'user_input' } } });
  assert.equal(r.soil_moisture.risk_level, 'unknown');
});
test('T11 too little rainfall history gives unknown dry-spell risk, never a confident call', () => {
  const s = SCENARIOS.find((x) => x.id === 'dry_spell_karnal_wheat');
  const few = buildScenarioWeather(s, NOW).filter((r) => r.variable !== 'rainfall' || r.date >= '2026-10-27');
  const r = Object.fromEntries(calculateRisks({ weather: { records: few }, soil: { moisture: null }, crop: 'wheat', today: TODAY }).map((x) => [x.risk_id, x]));
  assert.equal(r.dry_spell.risk_level, 'unknown');
  assert.match(r.dry_spell.summary, /cannot be determined/);
});
test('gaps in rainfall records are not counted as dry days', () => {
  const s = SCENARIOS.find((x) => x.id === 'dry_spell_karnal_wheat');
  const gap = buildScenarioWeather(s, NOW).filter((r) => !(r.variable === 'rainfall' && ['2026-10-26', '2026-10-27'].includes(r.date)));
  const r = calculateRisks({ weather: { records: gap }, soil: { moisture: null }, crop: 'wheat', today: TODAY })[0];
  assert.equal(r.score, 3); // Oct 30, 29, 28; the missing Oct 27 ends the streak
});
test('conflicting sources produce unknown instead of a silent choice', () => {
  const s = SCENARIOS[0];
  const recs = buildScenarioWeather(s, NOW);
  recs.push({ ...recs.find((r) => r.variable === 'rainfall' && r.date === '2026-10-30'), value: 40, source: 'Other source' });
  const r = calculateRisks({ weather: { records: recs }, soil: { moisture: null }, crop: 'wheat', today: TODAY })[0];
  assert.equal(r.risk_level, 'unknown'); assert.match(r.reasons[0], /disagree/);
});
test('weather failure gives unknown weather risks with the reason', () => {
  const r = calculateRisks({ weather: { records: [], error: 'Weather provider did not respond.' }, soil: { moisture: null }, crop: 'wheat', today: TODAY });
  assert.deepEqual(r.map((x) => x.risk_level), ['unknown', 'unknown', 'unknown', 'unknown']);
  assert.match(r[0].reasons[0], /did not respond/);
});
test('risk calculation is deterministic', () => {
  assert.deepEqual(run('heavy_rain_ranchi_rice'), run('heavy_rain_ranchi_rice'));
});
test('actions: categories, ordering and no-irrigation routing', () => {
  const s = SCENARIOS.find((x) => x.id === 'dry_spell_karnal_wheat');
  const risks = calculateRisks({ weather: { records: buildScenarioWeather(s, NOW) }, soil: { moisture: { value: 10.5, observed_on: '2026-10-30', origin: 'sample' } }, crop: 'wheat', growthStage: 'vegetative', today: TODAY });
  const actions = buildActions({ risks, farm: { crop: 'wheat', growth_stage: 'vegetative', irrigation_available: false }, today: TODAY, lang: 'en' });
  assert.equal(actions[0].category, 'do_now');
  assert.ok(actions.some((a) => a.category === 'seek_expert'));
  assert.ok(actions.every((a) => a.reason && a.timing && a.caveat));
});
