import { requestJson, withRetry } from './http.js';
import { buildSamplePrices } from '../data/sample.js';
import { diffDays, isValidDateString, priceUnitFactor, round2, toDateString } from '../units.js';
import { t } from '../i18n.js';
import { thresholds } from '../thresholds.js';

// Pure processing step: normalise units to INR/quintal, mark freshness, compare only current records.
export function processPrices(raw, { now = new Date(), staleAfterDays = thresholds.freshness.market_stale_after_days, asOf = null, lang = 'en' } = {}) {
  const today = toDateString(now);
  const limit = asOf || today;
  const seen = new Set(); const prices = []; let rejected = 0;
  for (const r of raw || []) {
    const factor = r ? priceUnitFactor(r.unit) : null;
    if (!r || !(Number.isFinite(r.price) && r.price > 0) || factor === null || !isValidDateString(r.date)) { rejected++; continue; }
    if (r.date > limit) continue;
    const key = [r.commodity, r.market, r.date, r.price, r.unit, r.source].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const age = diffDays(today, r.date);
    prices.push({ ...r, price_per_quintal: round2(r.price * factor), normalized_unit: 'INR/quintal', age_days: age, freshness: age > staleAfterDays ? 'stale' : 'current' });
  }
  prices.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.market.localeCompare(b.market)));
  const current = prices.filter((p) => p.freshness === 'current');
  let comparison = null;
  if (current.length) {
    const vals = current.map((p) => p.price_per_quintal);
    comparison = {
      count: current.length, unit: 'INR/quintal', min: Math.min(...vals), max: Math.max(...vals), average: round2(vals.reduce((a, b) => a + b, 0) / vals.length),
      highest_market: current.reduce((m, p) => (p.price_per_quintal > m.price_per_quintal ? p : m)).market,
    };
  }
  const status = !prices.length ? 'unavailable' : current.length ? 'ok' : 'stale';
  const message = status === 'unavailable' ? t(lang, 'market.unavailable') : status === 'stale' ? t(lang, 'market.stale', { date: prices[0].date }) : null;
  return { status, prices, comparison, message, rejected_records: rejected };
}

const COMMODITY = { wheat: 'Wheat', rice: 'Paddy(Dhan)(Common)', maize: 'Maize' };
const parseDmy = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '')); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

export function createMarketService({ config, fetchImpl = fetch, sleep }) {
  return {
    // Returns a result object even when data is missing, so one failing source never breaks the dashboard.
    async get({ crop, region = null, market = null, date = null, data_mode = 'demo', now = new Date(), lang = 'en' }) {
      const common = { crop, region, market };
      const filter = (list) => list.filter((p) => p.commodity === crop && (!region || String(p.region).toLowerCase() === region.toLowerCase()) && (!market || String(p.market).toLowerCase().includes(market.toLowerCase())));
      if (data_mode !== 'live') {
        return { ...common, origin: 'sample', source: 'Demo dataset (synthetic)', ...processPrices(filter(buildSamplePrices(now)), { now, asOf: date, lang }) };
      }
      if (!config.market.configured) return { ...common, origin: 'live', source: null, status: 'unavailable', prices: [], comparison: null, message: t(lang, 'market.not_configured') };
      try {
        const params = new URLSearchParams({ 'api-key': config.market.apiKey, format: 'json', limit: '100', 'filters[commodity]': COMMODITY[crop] || crop });
        if (region) params.set('filters[state]', region);
        const json = await withRetry(() => requestJson(fetchImpl, `${config.market.baseUrl}?${params}`, { timeoutMs: config.market.timeoutMs }), { retries: 1, delayMs: 300, sleep });
        const raw = (json.records || []).map((r) => ({
          commodity: crop, market: `${r.market}${r.district ? `, ${r.district}` : ''}`, region: r.state, price: Number(r.modal_price), unit: 'INR/quintal', currency: 'INR', price_type: 'modal',
          date: parseDmy(r.arrival_date), source: 'data.gov.in (Agmarknet)', retrieved_at: now.toISOString(), origin: 'live',
        }));
        return { ...common, origin: 'live', source: 'data.gov.in (Agmarknet)', ...processPrices(filter(raw), { now, asOf: date, lang }) };
      } catch {
        return { ...common, origin: 'live', source: null, status: 'unavailable', prices: [], comparison: null, message: t(lang, 'market.unavailable') };
      }
    },
  };
}
