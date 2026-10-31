// Rule-based action plan. Categories: do_now, seek_expert, monitor. No chemical doses or equipment control.
import { t } from './i18n.js';
import { addDays } from './units.js';

const ORDER = { do_now: 0, seek_expert: 1, monitor: 2 };

export function buildActions({ risks, farm, today, lang }) {
  const out = [];
  const risk = (id) => risks.find((r) => r.risk_id === id);
  const add = (id, category, actionKey, reasonKey, params, timing, supports) =>
    out.push({ id, category, category_label: t(lang, `cat.${category}`), action: t(lang, actionKey, params), reason: t(lang, reasonKey, params), timing, supporting_risks: supports, caveat: t(lang, 'caveat.default') });

  const heavy = risk('heavy_rainfall');
  if (heavy.risk_level === 'high') {
    const p = { mm: heavy.metrics.mm, date: heavy.metrics.from };
    add('heavy_rain_prepare', 'do_now', 'act.heavy_high', 'act.heavy_high.reason', p, t(lang, 'act.heavy_high.timing', p), ['heavy_rainfall']);
    if (farm.growth_stage === 'harvesting') add('heavy_rain_harvest', 'seek_expert', 'act.harvest', 'act.harvest.reason', p, t(lang, 'timing.next_days'), ['heavy_rainfall']);
  } else if (heavy.risk_level === 'moderate') {
    add('heavy_rain_watch', 'monitor', 'act.heavy_moderate', 'act.heavy_moderate.reason', { mm: heavy.metrics.mm }, t(lang, 'timing.next_days'), ['heavy_rainfall']);
  }

  const dry = risk('dry_spell');
  if (dry.risk_level === 'high') {
    const p = { days: dry.metrics.days, date: dry.metrics.latest_date };
    if (farm.irrigation_available === true) add('dry_irrigate_check', 'do_now', 'act.dry_high_irr', 'act.dry_high.reason', p, t(lang, 'timing.now'), ['dry_spell']);
    else add('dry_no_irrigation', 'seek_expert', 'act.dry_high_noirr', 'act.dry_high.reason', p, t(lang, 'timing.next_days'), ['dry_spell']);
  } else if (dry.risk_level === 'moderate') {
    add('dry_watch', 'monitor', 'act.dry_moderate', 'act.dry_moderate.reason', { days: dry.metrics.days, date: dry.metrics.latest_date }, t(lang, 'timing.next_days'), ['dry_spell']);
  }

  const heat = risk('heat_stress');
  if (heat.risk_level === 'high') {
    const p = { c: heat.metrics.c, date: heat.metrics.date, crop: farm.crop };
    add('heat_inspect', 'do_now', 'act.heat_high', 'act.heat_high.reason', p, p.date, ['heat_stress']);
    add('heat_expert', 'seek_expert', 'act.heat_high_expert', 'act.heat_high_expert.reason', p, t(lang, 'timing.next_days'), ['heat_stress']);
  } else if (heat.risk_level === 'moderate') {
    add('heat_watch', 'monitor', 'act.heat_moderate', 'act.heat_moderate.reason', { c: heat.metrics.c, date: heat.metrics.date }, t(lang, 'timing.next_days'), ['heat_stress']);
  }

  const soil = risk('soil_moisture');
  if (soil.risk_level === 'high') add('soil_check', 'do_now', 'act.soil_high', 'act.soil_high.reason', soil.metrics, t(lang, 'timing.now'), ['soil_moisture']);
  else if (soil.risk_level === 'moderate') add('soil_recheck', 'monitor', 'act.soil_moderate', 'act.soil_moderate.reason', soil.metrics, t(lang, 'timing.next_days'), ['soil_moisture']);

  const unknown = risks.filter((r) => r.risk_level === 'unknown');
  if (unknown.length) {
    const items = [...new Set(unknown.flatMap((r) => r.missing_inputs))].map((m) => (m === 'soil_moisture' ? t(lang, 'missing.soil_moisture') : m === 'weather' ? t(lang, 'missing.weather') : m)).join(', ');
    add('provide_missing_data', 'monitor', 'act.missing', 'act.missing.reason', { items }, t(lang, 'timing.tomorrow'), unknown.map((r) => r.risk_id));
  }
  if (!out.length) add('all_low', 'monitor', 'act.all_low', 'act.all_low.reason', {}, addDays(today, 1), risks.map((r) => r.risk_id));

  return out.map((a, i) => ({ a, i })).sort((x, y) => ORDER[x.a.category] - ORDER[y.a.category] || x.i - y.i).map((x) => x.a);
}
