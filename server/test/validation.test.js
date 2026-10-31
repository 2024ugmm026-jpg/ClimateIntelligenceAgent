import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFarmProfile, validateQuestion, validateSoilInput } from '../src/validation.js';
import { NOW } from './helpers.js';

const v = (b) => validateFarmProfile(b, { now: NOW });
const fields = (r) => r.errors.map((e) => e.field);

test('valid minimal profile passes and keeps optional values null', () => {
  const r = v({ location_name: 'Karnal', crop: 'Wheat' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.value.crop, 'wheat'); assert.equal(r.value.soil_ph, null); assert.equal(r.value.soil_moisture, null); assert.equal(r.value.data_mode, 'demo');
});
test('T2 missing crop is rejected with a clear message', () => {
  const r = v({ location_name: 'Karnal' });
  assert.deepEqual(fields(r), ['crop']); assert.match(r.errors[0].message, /Select a crop/);
});
test('missing location is rejected', () => assert.ok(fields(v({ crop: 'wheat' })).includes('location_name')));
test('T3 invalid coordinates are rejected', () => {
  assert.ok(fields(v({ crop: 'wheat', latitude: 120, longitude: 10 })).includes('latitude'));
  assert.ok(fields(v({ crop: 'wheat', latitude: 'abc', longitude: 10 })).includes('latitude'));
  assert.ok(fields(v({ crop: 'wheat', latitude: 20 })).includes('longitude'));
});
test('invalid dates, pH, moisture and enums are rejected', () => {
  const r = v({ location_name: 'X', crop: 'wheat', sowing_date: '2026-02-30', soil_ph: 14, growth_stage: 'bloom', soil_type: 'rock', soil_moisture: { value: 140, unit: '%', observed_on: '2026-10-30' }, data_mode: 'cloud' });
  for (const f of ['sowing_date', 'soil_ph', 'growth_stage', 'soil_type', 'soil_moisture.value', 'data_mode']) assert.ok(fields(r).includes(f), f);
});
test('soil moisture needs a measurement date and cannot be in the future', () => {
  assert.ok(fields(v({ location_name: 'X', crop: 'wheat', soil_moisture: { value: 20, unit: '%' } })).includes('soil_moisture.observed_on'));
  assert.ok(fields(v({ location_name: 'X', crop: 'wheat', soil_moisture: { value: 20, unit: '%', observed_on: '2026-12-01' } })).includes('soil_moisture.observed_on'));
});
test('fraction soil moisture is converted to percent', () => {
  const r = v({ location_name: 'X', crop: 'wheat', soil_moisture: { value: 0.25, unit: 'fraction', observed_on: '2026-10-30' } });
  assert.equal(r.value.soil_moisture.value, 25); assert.equal(r.value.soil_moisture.unit, '%');
});
test('unsupported language lists the available ones', () => {
  const r = v({ location_name: 'X', crop: 'wheat', language: 'ta' });
  assert.match(r.errors[0].message, /en, hi/);
});
test('non-object body and bad question', () => {
  assert.equal(v(null).errors[0].field, 'body'); assert.equal(v([]).errors[0].field, 'body');
  assert.ok(validateQuestion('   ').error); assert.ok(validateQuestion('x'.repeat(501)).error); assert.equal(validateQuestion('  Will it rain?  ').value, 'Will it rain?');
});
test('soil endpoint needs at least one value', () => {
  assert.equal(validateSoilInput({}, { now: NOW }).errors.length, 1);
  assert.deepEqual(validateSoilInput({ soil_ph: 6.5 }, { now: NOW }).errors, []);
});
