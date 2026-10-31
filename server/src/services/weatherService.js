import { requestJson, withRetry } from './http.js';
import { buildScenarioWeather, getScenario, SAMPLE_SOURCE } from '../data/sample.js';
import { isValidDateString, toDateString } from '../units.js';

const unavailable = (error, origin = 'live') => ({ status: 'unavailable', origin, source: null, retrieved_at: null, stale: false, records: [], error });

// Drop malformed provider values. Missing values stay missing; they are never turned into zero.
export function sanitizeRecords(records) {
  return records.filter((r) => isValidDateString(r.date) && typeof r.value === 'number' && Number.isFinite(r.value) && (r.variable !== 'rainfall' || r.value >= 0));
}

// Parses an Open-Meteo "daily" payload (documented API; not exercised against the live service in the build environment).
export function parseOpenMeteo(json, now) {
  const d = json && json.daily;
  if (!d || !Array.isArray(d.time)) throw new Error('Unexpected weather response');
  const today = toDateString(now);
  const retrieved_at = now.toISOString();
  const records = [];
  const vars = [['temperature_2m_max', 'temperature_max', '°C'], ['temperature_2m_min', 'temperature_min', '°C'], ['precipitation_sum', 'rainfall', 'mm']];
  d.time.forEach((date, i) => {
    for (const [field, variable, unit] of vars) {
      const value = d[field] ? d[field][i] : null;
      if (typeof value !== 'number') continue;
      records.push({ date, variable, value, unit, record_type: date < today ? 'historical' : 'forecast', source: 'Open-Meteo', retrieved_at, origin: 'live', quality: date < today ? 'model analysis' : 'forecast model' });
    }
  });
  return sanitizeRecords(records);
}

export function createWeatherService({ config, cache, fetchImpl = fetch, sleep }) {
  async function fetchLive(lat, lon, now) {
    const url = `${config.weather.baseUrl}?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&past_days=14&forecast_days=7&timezone=auto`;
    const json = await withRetry(() => requestJson(fetchImpl, url, { timeoutMs: config.weather.timeoutMs }), { retries: config.weather.retries, delayMs: config.weather.retryDelayMs, sleep });
    return parseOpenMeteo(json, now);
  }

  return {
    async get({ data_mode, scenario, latitude, longitude, now = new Date() }) {
      if (data_mode !== 'live') {
        const s = getScenario(scenario);
        if (!s) return unavailable('Unknown demo scenario.', 'sample');
        return { status: 'ok', origin: 'sample', source: SAMPLE_SOURCE, retrieved_at: now.toISOString(), stale: false, records: buildScenarioWeather(s, now), error: null };
      }
      if (!config.weather.configured) return unavailable('Live weather is not configured on this server.');
      if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return unavailable('Live weather needs latitude and longitude.');
      const key = `${Number(latitude).toFixed(2)},${Number(longitude).toFixed(2)}`;
      const cached = cache.get(key);
      if (cached && !cache.isExpired(cached, now)) return { status: 'ok', origin: 'live', source: 'Open-Meteo', retrieved_at: cached.stored_at, stale: false, cached: true, records: cached.value, error: null };
      try {
        const records = await fetchLive(latitude, longitude, now);
        if (!records.length) return unavailable('The weather provider returned no usable values.');
        cache.set(key, records, config.weatherCacheTtlMs ?? 30 * 60 * 1000, now);
        return { status: 'ok', origin: 'live', source: 'Open-Meteo', retrieved_at: now.toISOString(), stale: false, records, error: null };
      } catch (e) {
        if (cached) return { status: 'stale', origin: 'live', source: 'Open-Meteo', retrieved_at: cached.stored_at, stale: true, records: cached.value, error: `Could not refresh weather. Showing data saved at ${cached.stored_at}.` };
        return unavailable('The weather provider did not respond. Try again shortly.');
      }
    },
  };
}
