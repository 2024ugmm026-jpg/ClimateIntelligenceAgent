import { ApiError } from '../errors.js';
import { calculateRisks, seriesFor } from '../riskEngine.js';
import { buildActions } from '../actions.js';
import { thresholds } from '../thresholds.js';
import { t } from '../i18n.js';
import { addDays, round1, toDateString } from '../units.js';
import { resolveScenario, getLocation, buildScenarioSoil, buildScenarioSatellite } from '../data/sample.js';

export function summarizeWeather(records, today) {
  const f = (variable, types, from, to) => seriesFor(records, variable, types, from, to).series;
  const fmax = f('temperature_max', ['forecast'], today, addDays(today, 6));
  const fmin = f('temperature_min', ['forecast'], today, addDays(today, 6));
  const frain = f('rainfall', ['forecast'], today, addDays(today, 6));
  const orain = f('rainfall', ['observed', 'historical'], addDays(today, -13), today);
  const sum = (s) => (s.length ? round1(s.reduce((a, r) => a + r.value, 0)) : null);
  return {
    forecast_max_temp_c: fmax.length ? Math.max(...fmax.map((r) => r.value)) : null,
    forecast_min_temp_c: fmin.length ? Math.min(...fmin.map((r) => r.value)) : null,
    forecast_rain_total_mm: sum(frain), forecast_rain_days_with_data: frain.length,
    observed_rain_total_mm: sum(orain), observed_rain_days_with_data: orain.length,
  };
}

function buildSoil(farm, scenario, now) {
  const soil = { soil_type: null, soil_ph: null, moisture: null };
  if (farm.soil_type) soil.soil_type = { value: farm.soil_type, origin: 'user_input' };
  if (farm.soil_ph !== null) soil.soil_ph = { value: farm.soil_ph, origin: 'user_input' };
  if (farm.soil_moisture) soil.moisture = { ...farm.soil_moisture, origin: 'user_input' };
  if (farm.use_sample_soil && scenario && farm.data_mode === 'demo') {
    const s = buildScenarioSoil(scenario, now);
    soil.soil_type ||= { value: s.soil_type, origin: 'sample' };
    soil.soil_ph ||= { value: s.soil_ph, origin: 'sample' };
    soil.moisture ||= { ...s.soil_moisture, origin: 'sample' };
  }
  soil.unavailable = ['soil_type', 'soil_ph', 'moisture'].filter((k) => !soil[k]).map((k) => (k === 'moisture' ? 'soil_moisture' : k));
  return soil;
}

export async function buildAdvisory(farm, { weatherService, marketService }, now = new Date()) {
  const today = toDateString(now);
  const lang = farm.language;
  const trace = [];
  const step = (name, status, detail = {}) => trace.push({ step: name, status, at: new Date().toISOString(), ...detail });
  step('validate_input', 'ok');

  let scenario = null;
  if (farm.data_mode === 'demo') {
    scenario = resolveScenario(farm);
    if (!scenario) {
      throw new ApiError(400, 'Demo mode has sample weather only for Karnal and Ranchi. Pick a sample scenario, or switch to live data.', { errors: [{ field: 'scenario', message: 'Pick a sample scenario, or switch to live data.' }] });
    }
  }
  const loc = scenario ? getLocation(scenario.location_id) : null;
  const latitude = farm.latitude ?? loc?.latitude ?? null;
  const longitude = farm.longitude ?? loc?.longitude ?? null;
  const region = farm.region ?? loc?.region ?? null;

  const [w, m] = await Promise.allSettled([
    weatherService.get({ data_mode: farm.data_mode, scenario: scenario?.id, latitude, longitude, now }),
    marketService.get({ crop: farm.crop, region, data_mode: farm.data_mode, now, lang }),
  ]);
  const weather = w.status === 'fulfilled' ? w.value : { status: 'unavailable', origin: farm.data_mode === 'live' ? 'live' : 'sample', source: null, retrieved_at: null, stale: false, records: [], error: 'The weather service failed unexpectedly.' };
  const market = m.status === 'fulfilled' ? m.value : { status: 'unavailable', origin: 'live', prices: [], comparison: null, message: t(lang, 'market.unavailable') };
  step('fetch_weather', weather.status, { source: weather.source, origin: weather.origin, records: weather.records.length, error: weather.error });
  step('fetch_market_prices', market.status, { source: market.source ?? null, origin: market.origin, records: (market.prices || []).length });

  const soil = buildSoil(farm, scenario, now);
  step('prepare_soil', soil.unavailable.length ? 'partial' : 'ok', { missing: soil.unavailable });
  const satellite = scenario
    ? { status: 'sample', records: buildScenarioSatellite(scenario, now), note: 'Sample NDVI value for demonstration. No real satellite imagery was processed.' }
    : { status: 'unavailable', records: [], note: 'Live satellite processing is not implemented in this version.' };
  step('satellite', satellite.status);

  const risks = calculateRisks({ weather, soil, crop: farm.crop, growthStage: farm.growth_stage, today, lang });
  step('calculate_risks', 'ok', { levels: Object.fromEntries(risks.map((r) => [r.risk_id, r.risk_level])), thresholds: 'demonstration assumptions' });
  const actions = buildActions({ risks, farm, today, lang });
  step('build_actions', 'ok', { count: actions.length });

  const demo = farm.data_mode === 'demo';
  const data_origin = demo ? 'demo' : weather.status === 'ok' && market.status === 'ok' ? 'live' : 'partial';
  const sources = [
    { name: weather.source || 'Weather', kind: 'weather', origin: weather.origin, status: weather.status, retrieved_at: weather.retrieved_at },
    { name: market.source || 'Market prices', kind: 'market', origin: market.origin, status: market.status },
    { name: 'Soil values', kind: 'soil', origin: soil.moisture?.origin || soil.soil_type?.origin || 'none', status: soil.unavailable.length ? 'partial' : 'ok' },
    { name: 'Satellite (NDVI)', kind: 'satellite', origin: satellite.status === 'sample' ? 'sample' : 'none', status: satellite.status },
    { name: 'Deterministic risk engine', kind: 'calculation', origin: 'code', status: 'ok', note: 'Thresholds are demonstration assumptions.' },
  ];
  return {
    generated_at: now.toISOString(), language: lang, data_mode: farm.data_mode, data_origin,
    sample_label: demo ? t(lang, 'label.sample') : null,
    scenario: scenario ? { id: scenario.id, label: scenario.label } : null,
    location: { name: farm.location_name || loc?.name || null, region, latitude, longitude },
    crop: farm.crop, growth_stage: farm.growth_stage, sowing_date: farm.sowing_date, irrigation_available: farm.irrigation_available,
    weather: { status: weather.status, origin: weather.origin, source: weather.source, retrieved_at: weather.retrieved_at, stale: weather.stale, error: weather.error, records: weather.records, summary: summarizeWeather(weather.records, today) },
    risks, actions, soil, satellite, market, sources,
    disclaimer: t(lang, 'disclaimer'), trace,
  };
}
