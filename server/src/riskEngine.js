// Deterministic climate-risk calculations. No AI, no randomness, no network.
// Rules: missing data is never treated as zero; insufficient data gives "unknown", never a guess.
import { addDays, diffDays, round1 } from './units.js';
import { t } from './i18n.js';
import { thresholds as defaultThresholds } from './thresholds.js';

const levelFor = (value, moderate, high) => (value >= high ? 'high' : value >= moderate ? 'moderate' : 'low');

// One record per date for a variable. Conflicting values for the same date are reported, never silently resolved.
export function seriesFor(records, variable, types, from, to) {
  const byDate = new Map();
  for (const r of records || []) {
    if (r.variable !== variable || !types.includes(r.record_type)) continue;
    if (typeof r.value !== 'number' || !Number.isFinite(r.value)) continue;
    if (r.date < from || r.date > to) continue;
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  const series = []; const conflicts = [];
  for (const [date, list] of [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const distinct = [...new Set(list.map((r) => r.value))];
    if (distinct.length > 1) conflicts.push({ date, values: distinct });
    series.push(list[0]);
  }
  return { series, conflicts };
}

const freshnessOf = (ctx, used) => ({
  status: ctx.weather.stale ? 'stale' : 'current',
  latest_data_date: used.length ? used[used.length - 1].date : null,
  origin: used.length ? used[0].origin : null,
});

function unknownRisk(type, lang, reasons, missing = []) {
  return {
    risk_id: type, risk_type: type, label: t(lang, `type.${type}`), risk_level: 'unknown', score: null, score_unit: null,
    summary: t(lang, 'unknown.summary'), reasons, factors: [], missing_inputs: missing,
    data_freshness: { status: 'unavailable', latest_data_date: null, origin: null },
    confidence_note: reasons.join(' '), metrics: {},
  };
}

function weatherGate(ctx, type) {
  const w = ctx.weather;
  if ((!w.records || w.records.length === 0) && w.error) return unknownRisk(type, ctx.lang, [t(ctx.lang, 'why.weather_unavailable', { reason: w.error })], ['weather']);
  return null;
}

function conflictGate(ctx, type, variable, conflicts) {
  if (!conflicts.length) return null;
  return unknownRisk(type, ctx.lang, [t(ctx.lang, 'why.conflict', { variable, date: conflicts[0].date })], [`${variable} (conflicting sources)`]);
}

function drySpell(ctx) {
  const { th, today, lang } = ctx; const cfg = th.dry_spell; const dryMm = th.weather.dry_day_mm;
  const gate = weatherGate(ctx, 'dry_spell'); if (gate) return gate;
  const from = addDays(today, -(th.weather.observed_window_days - 1));
  const { series, conflicts } = seriesFor(ctx.weather.records, 'rainfall', ['observed', 'historical'], from, today);
  const cg = conflictGate(ctx, 'dry_spell', 'rainfall', conflicts); if (cg) return cg;
  if (series.length < cfg.min_observed_days) {
    return unknownRisk('dry_spell', lang, [t(lang, 'why.insufficient_rain', { have: series.length, window: th.weather.observed_window_days, need: cfg.min_observed_days })], ['rainfall_history']);
  }
  const latest = series[series.length - 1];
  if (diffDays(today, latest.date) > cfg.max_observation_age_days) {
    return unknownRisk('dry_spell', lang, [t(lang, 'why.stale_obs', { date: latest.date })], ['recent_rainfall']);
  }
  const streak = [];
  for (let i = series.length - 1; i >= 0; i--) {
    const r = series[i];
    if (streak.length && diffDays(streak[streak.length - 1].date, r.date) !== 1) break; // gap in records ends the count
    if (r.value < dryMm) streak.push(r); else break;
  }
  const days = streak.length;
  const level = levelFor(days, cfg.moderate_days, cfg.high_days);
  const fc = seriesFor(ctx.weather.records, 'rainfall', ['forecast'], today, addDays(today, 2)).series;
  const factors = [
    { name: 'consecutive_dry_days', value: days, unit: 'days', from: days ? streak[days - 1].date : null, to: days ? streak[0].date : null, source: latest.source, origin: latest.origin },
    { name: 'dry_day_threshold', value: dryMm, unit: 'mm', note: 'A day counts as dry below this rainfall' },
  ];
  if (fc.length) factors.push({ name: 'forecast_rain_next_3_days', value: round1(fc.reduce((a, r) => a + r.value, 0)), unit: 'mm', days_with_data: fc.length, source: fc[0].source, origin: fc[0].origin });
  return {
    risk_id: 'dry_spell', risk_type: 'dry_spell', label: t(lang, 'type.dry_spell'), risk_level: level, score: days, score_unit: 'consecutive dry days',
    summary: t(lang, 'sum.dry_spell', { days, mm: dryMm, date: latest.date }), reasons: [], factors, missing_inputs: [],
    data_freshness: freshnessOf(ctx, series), confidence_note: `${t(lang, 'conf.dry_spell')} ${t(lang, 'conf.thresholds')}`,
    metrics: { days, latest_date: latest.date },
  };
}

function heavyRain(ctx) {
  const { th, today, lang } = ctx; const cfg = th.heavy_rainfall;
  const gate = weatherGate(ctx, 'heavy_rainfall'); if (gate) return gate;
  const to = addDays(today, th.weather.forecast_window_days - 1);
  const { series, conflicts } = seriesFor(ctx.weather.records, 'rainfall', ['forecast'], today, to);
  const cg = conflictGate(ctx, 'heavy_rainfall', 'rainfall', conflicts); if (cg) return cg;
  if (series.length < cfg.min_forecast_days) return unknownRisk('heavy_rainfall', lang, [t(lang, 'why.no_forecast', { have: series.length, need: cfg.min_forecast_days })], ['rainfall_forecast']);
  let best = null;
  for (let i = 0; i + 2 < series.length; i++) {
    if (diffDays(series[i + 1].date, series[i].date) !== 1 || diffDays(series[i + 2].date, series[i].date) !== 2) continue;
    const sum = round1(series[i].value + series[i + 1].value + series[i + 2].value);
    if (!best || sum > best.sum) best = { sum, from: series[i].date, to: series[i + 2].date };
  }
  if (!best) return unknownRisk('heavy_rainfall', lang, [t(lang, 'why.no_consecutive', { need: 3 })], ['rainfall_forecast']);
  const maxDay = series.reduce((m, r) => (r.value > m.value ? r : m), series[0]);
  return {
    risk_id: 'heavy_rainfall', risk_type: 'heavy_rainfall', label: t(lang, 'type.heavy_rainfall'), risk_level: levelFor(best.sum, cfg.moderate_mm, cfg.high_mm),
    score: best.sum, score_unit: 'mm in 3 days', summary: t(lang, 'sum.heavy_rainfall', { mm: best.sum, from: best.from, to: best.to }), reasons: [],
    factors: [
      { name: 'max_3_day_rainfall', value: best.sum, unit: 'mm', from: best.from, to: best.to, source: series[0].source, origin: series[0].origin },
      { name: 'max_single_day_rainfall', value: maxDay.value, unit: 'mm', date: maxDay.date, source: maxDay.source, origin: maxDay.origin },
      { name: 'forecast_days_available', value: series.length, unit: 'days' },
    ],
    missing_inputs: [], data_freshness: freshnessOf(ctx, series), confidence_note: `${t(lang, 'conf.forecast')} ${t(lang, 'conf.thresholds')}`,
    metrics: { mm: best.sum, from: best.from, to: best.to },
  };
}

function heat(ctx) {
  const { th, today, lang, crop, growthStage } = ctx; const cfg = th.heat_stress;
  const gate = weatherGate(ctx, 'heat_stress'); if (gate) return gate;
  const to = addDays(today, th.weather.forecast_window_days - 1);
  const { series, conflicts } = seriesFor(ctx.weather.records, 'temperature_max', ['forecast'], today, to);
  const cg = conflictGate(ctx, 'heat_stress', 'temperature_max', conflicts); if (cg) return cg;
  if (series.length < cfg.min_forecast_days) return unknownRisk('heat_stress', lang, [t(lang, 'why.no_forecast', { have: series.length, need: cfg.min_forecast_days })], ['temperature_forecast']);
  const cropCfg = cfg.crops[crop];
  const base = cropCfg || cfg.default;
  const sensitive = Boolean(cropCfg && growthStage && cropCfg.sensitive_stages.includes(growthStage));
  const adj = sensitive ? cropCfg.sensitive_offset_c : 0;
  const moderate = base.moderate_c - adj; const high = base.high_c - adj;
  const hottest = series.reduce((m, r) => (r.value > m.value ? r : m), series[0]);
  return {
    risk_id: 'heat_stress', risk_type: 'heat_stress', label: t(lang, 'type.heat_stress'), risk_level: levelFor(hottest.value, moderate, high),
    score: hottest.value, score_unit: '°C forecast maximum', summary: t(lang, 'sum.heat_stress', { c: hottest.value, date: hottest.date }), reasons: [],
    factors: [
      { name: 'forecast_max_temperature', value: hottest.value, unit: '°C', date: hottest.date, source: hottest.source, origin: hottest.origin },
      { name: 'threshold_moderate', value: moderate, unit: '°C', stage_adjusted: sensitive },
      { name: 'threshold_high', value: high, unit: '°C', stage_adjusted: sensitive },
    ],
    missing_inputs: growthStage ? [] : ['growth_stage (stage-specific thresholds not applied)'],
    data_freshness: freshnessOf(ctx, series),
    confidence_note: `${t(lang, cropCfg ? 'conf.heat_crop' : 'conf.heat_generic')} ${t(lang, 'conf.forecast')} ${t(lang, 'conf.thresholds')}`,
    metrics: { c: hottest.value, date: hottest.date },
  };
}

function soil(ctx) {
  const { th, today, lang } = ctx; const cfg = th.soil_moisture;
  const m = ctx.soil && ctx.soil.moisture;
  if (!m) return unknownRisk('soil_moisture', lang, [t(lang, 'why.no_soil')], ['soil_moisture']);
  const age = diffDays(today, m.observed_on);
  if (age > cfg.max_age_days) return unknownRisk('soil_moisture', lang, [t(lang, 'why.soil_stale', { date: m.observed_on, max: cfg.max_age_days })], ['soil_moisture (recent)']);
  const level = m.value < cfg.high_below_pct ? 'high' : m.value < cfg.moderate_below_pct ? 'moderate' : 'low';
  return {
    risk_id: 'soil_moisture', risk_type: 'soil_moisture', label: t(lang, 'type.soil_moisture'), risk_level: level, score: m.value, score_unit: '% moisture (lower = higher risk)',
    summary: t(lang, 'sum.soil_moisture', { pct: m.value, date: m.observed_on }), reasons: [],
    factors: [
      { name: 'soil_moisture', value: m.value, unit: '%', date: m.observed_on, origin: m.origin },
      { name: 'threshold_moderate_below', value: cfg.moderate_below_pct, unit: '%' },
      { name: 'threshold_high_below', value: cfg.high_below_pct, unit: '%' },
    ],
    missing_inputs: [], data_freshness: { status: age > 3 ? 'aging' : 'current', latest_data_date: m.observed_on, origin: m.origin },
    confidence_note: `${t(lang, 'conf.soil')} ${t(lang, 'conf.thresholds')}`, metrics: { pct: m.value, date: m.observed_on },
  };
}

// weather: { records, stale, error }, soil: { moisture: { value, observed_on, origin } | null }, today: 'YYYY-MM-DD'
export function calculateRisks({ weather, soil: soilData, crop, growthStage = null, today, lang = 'en', thresholds = defaultThresholds }) {
  const ctx = { weather: weather || { records: [] }, soil: soilData, crop, growthStage, today, lang, th: thresholds };
  return [drySpell(ctx), heavyRain(ctx), heat(ctx), soil(ctx)];
}
