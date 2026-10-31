// Synthetic demo dataset. Every record is labelled origin "sample". Nothing here is a real observation or forecast.
import { addDays, toDateString } from '../units.js';

export const SAMPLE_SOURCE = 'Demo dataset (synthetic)';

export const LOCATIONS = [
  { id: 'karnal', name: 'Karnal', district: 'Karnal', region: 'Haryana', latitude: 29.69, longitude: 76.99 },
  { id: 'ranchi', name: 'Ranchi', district: 'Ranchi', region: 'Jharkhand', latitude: 23.34, longitude: 85.31 },
];

export const CROPS = [
  { id: 'wheat', name: 'Wheat', name_hi: 'गेहूँ', season: 'Rabi' },
  { id: 'rice', name: 'Rice (paddy)', name_hi: 'चावल (धान)', season: 'Kharif' },
  { id: 'maize', name: 'Maize', name_hi: 'मक्का', season: 'Kharif / Rabi' },
];

export const SCENARIOS = [
  { id: 'normal_karnal_wheat', label: 'Normal week — Karnal, wheat', label_hi: 'सामान्य सप्ताह — करनाल, गेहूँ', description: 'Mild weather with light, scattered rain.', location_id: 'karnal', crop: 'wheat', growth_stage: 'vegetative', pattern: 'normal', base: { tmax: 26, tmin: 11 }, irrigation_available: true, soil: { soil_type: 'alluvial', soil_ph: 7.6, moisture_pct: 27 }, ndvi: 0.66 },
  { id: 'dry_spell_karnal_wheat', label: 'Long dry spell — Karnal, wheat', label_hi: 'लंबा सूखा दौर — करनाल, गेहूँ', description: 'About twelve dry days with little rain forecast.', location_id: 'karnal', crop: 'wheat', growth_stage: 'vegetative', pattern: 'dry_spell', base: { tmax: 27, tmin: 12 }, irrigation_available: false, soil: { soil_type: 'alluvial', soil_ph: 7.8, moisture_pct: 10.5 }, ndvi: 0.38 },
  { id: 'heavy_rain_ranchi_rice', label: 'Heavy rain ahead — Ranchi, rice', label_hi: 'भारी वर्षा आने वाली — राँची, धान', description: 'Three very wet days in the forecast.', location_id: 'ranchi', crop: 'rice', growth_stage: 'vegetative', pattern: 'heavy_rain', base: { tmax: 30, tmin: 23 }, irrigation_available: true, soil: { soil_type: 'red', soil_ph: 5.8, moisture_pct: 41 }, ndvi: 0.68 },
  { id: 'heatwave_karnal_wheat', label: 'Heat spell — Karnal, wheat at grain filling', label_hi: 'गर्मी का दौर — करनाल, दाना भरने की अवस्था में गेहूँ', description: 'Daytime highs climbing for several days.', location_id: 'karnal', crop: 'wheat', growth_stage: 'grain_filling', pattern: 'heat', base: { tmax: 30, tmin: 15 }, irrigation_available: true, soil: { soil_type: 'alluvial', soil_ph: 7.4, moisture_pct: 17 }, ndvi: 0.51 },
  { id: 'normal_ranchi_rice', label: 'Normal week — Ranchi, rice', label_hi: 'सामान्य सप्ताह — राँची, धान', description: 'Warm and humid with light showers.', location_id: 'ranchi', crop: 'rice', growth_stage: 'vegetative', pattern: 'normal', base: { tmax: 31, tmin: 23 }, irrigation_available: true, soil: { soil_type: 'red', soil_ph: 6.1, moisture_pct: 33 }, ndvi: 0.64 },
];

// Rain by day offset from today (negative = past). Unlisted days default to 0 mm.
const RAIN = {
  normal: { '-11': 6.2, '-6': 2.4, '-3': 8.8, '2': 4.0, '5': 7.5 },
  dry_spell: { '-14': 5.0, '-13': 3.0, '4': 1.2 },
  heavy_rain: { '-2': 12, '-1': 18, '0': 6, '1': 22.5, '2': 58, '3': 41.5, '4': 9, '5': 3 },
  heat: { '-9': 3.5, '-4': 1.8 },
};
const HEAT_TMAX = { '1': 34, '2': 36.5, '3': 38.2, '4': 37, '5': 35, '6': 33.8 };

export const getScenario = (id) => SCENARIOS.find((s) => s.id === id) || null;
export const getLocation = (id) => LOCATIONS.find((l) => l.id === id) || null;

// Used when demo mode is requested without an explicit scenario: match by place name, then by crop.
export function resolveScenario(farm) {
  if (farm.scenario) return getScenario(farm.scenario);
  const name = (farm.location_name || '').toLowerCase();
  const loc = LOCATIONS.find((l) => name.includes(l.name.toLowerCase()));
  if (!loc) return null;
  const mine = SCENARIOS.filter((s) => s.location_id === loc.id);
  return mine.find((s) => s.crop === farm.crop && s.pattern === 'normal') || mine.find((s) => s.crop === farm.crop) || mine[0];
}

export function buildScenarioWeather(scenario, now = new Date()) {
  const today = toDateString(now);
  const retrieved_at = now.toISOString();
  const records = [];
  for (let o = -14; o <= 6; o++) {
    const i = o + 14;
    const date = addDays(today, o);
    const record_type = o < 0 ? 'observed' : 'forecast';
    const wobble = ((i * 7) % 5) - 2; // deterministic variation, no randomness
    let tmax = scenario.base.tmax + wobble * 0.6;
    if (scenario.pattern === 'heat' && HEAT_TMAX[o] !== undefined) tmax = HEAT_TMAX[o];
    const tmin = scenario.base.tmin + wobble * 0.4;
    const rain = RAIN[scenario.pattern][String(o)] ?? 0;
    const common = { date, record_type, source: SAMPLE_SOURCE, retrieved_at, origin: 'sample', quality: 'synthetic' };
    records.push({ ...common, variable: 'temperature_max', value: Math.round(tmax * 10) / 10, unit: '°C' });
    records.push({ ...common, variable: 'temperature_min', value: Math.round(tmin * 10) / 10, unit: '°C' });
    records.push({ ...common, variable: 'rainfall', value: rain, unit: 'mm' });
  }
  return records;
}

export function buildScenarioSoil(scenario, now = new Date()) {
  return { soil_type: scenario.soil.soil_type, soil_ph: scenario.soil.soil_ph, soil_moisture: { value: scenario.soil.moisture_pct, unit: '%', observed_on: addDays(toDateString(now), -1) } };
}

export function buildScenarioSatellite(scenario, now = new Date()) {
  const today = toDateString(now);
  return [{
    indicator: 'NDVI', value: scenario.ndvi, unit: 'index (−1 to 1)', date: addDays(today, -3), origin: 'sample', source: SAMPLE_SOURCE,
    processing_method: 'Pre-computed sample value. No real satellite imagery was processed.', quality: { cloud_cover_pct: 12, flag: 'good' },
    coverage: 'Area of about 10 km around the location centre (illustrative)', is_proxy: true,
  }];
}

export function buildSamplePrices(now = new Date()) {
  const today = toDateString(now);
  const base = { currency: 'INR', price_type: 'modal', source: SAMPLE_SOURCE, retrieved_at: now.toISOString(), origin: 'sample' };
  return [
    { ...base, commodity: 'wheat', market: 'Karnal mandi', region: 'Haryana', price: 2425, unit: 'INR/quintal', date: addDays(today, -1) },
    { ...base, commodity: 'wheat', market: 'Ambala mandi', region: 'Haryana', price: 24.1, unit: 'INR/kg', date: addDays(today, -2) },
    { ...base, commodity: 'wheat', market: 'Pehowa mandi', region: 'Haryana', price: 2390, unit: 'INR/quintal', date: addDays(today, -10) },
    { ...base, commodity: 'rice', market: 'Ranchi market', region: 'Jharkhand', price: 2183, unit: 'INR/quintal', date: addDays(today, -1) },
    { ...base, commodity: 'rice', market: 'Hazaribagh market', region: 'Jharkhand', price: 2160, unit: 'INR/quintal', date: addDays(today, -3) },
  ]; // no maize records on purpose, so the "price unavailable" state can be demonstrated
}

export function buildSampleResponse(now = new Date()) {
  return {
    origin: 'sample',
    label: 'Demo data — not a live forecast',
    generated_at: now.toISOString(),
    locations: LOCATIONS,
    crops: CROPS,
    scenarios: SCENARIOS.map((s) => {
      const loc = getLocation(s.location_id);
      return {
        id: s.id, label: s.label, label_hi: s.label_hi, description: s.description, pattern: s.pattern,
        farm_profile: {
          location_name: loc.name, region: loc.region, latitude: loc.latitude, longitude: loc.longitude, crop: s.crop, growth_stage: s.growth_stage,
          irrigation_available: s.irrigation_available, ...buildScenarioSoil(s, now),
        },
        weather_records: buildScenarioWeather(s, now),
        satellite_records: buildScenarioSatellite(s, now),
      };
    }),
    market_prices: buildSamplePrices(now),
  };
}
