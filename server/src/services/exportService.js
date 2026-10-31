import { t } from '../i18n.js';

export function advisoryToMarkdown(a) {
  const l = a.language;
  const out = [`# ${t(l, 'export.title')}`, ''];
  if (a.sample_label) out.push(`**${a.sample_label}**`, '');
  out.push(`${a.location.name || ''}${a.location.region ? `, ${a.location.region}` : ''} · ${a.crop}`, `${t(l, 'export.generated')}: ${a.generated_at}`, '');
  out.push(`## ${t(l, 'export.risks')}`);
  for (const r of a.risks) out.push(`- **${r.label}: ${t(l, `level.${r.risk_level}`)}** — ${r.summary} ${r.reasons.join(' ')}`.trim());
  out.push('', `## ${t(l, 'export.actions')}`);
  for (const x of a.actions) out.push(`- [${x.category_label}] ${x.action} (${x.timing}) — ${x.reason}`);
  out.push('', `## ${t(l, 'export.market')}`);
  if (a.market.prices && a.market.prices.length) for (const p of a.market.prices) out.push(`- ${p.market}: ${p.price_per_quintal} ${p.normalized_unit} (${p.date}${p.freshness === 'stale' ? ', stale' : ''})`);
  else out.push(`- ${a.market.message || ''}`);
  out.push('', `## ${t(l, 'export.sources')}`);
  for (const s of a.sources) out.push(`- ${s.name} (${s.origin}, ${s.status})`);
  out.push('', `> ${a.disclaimer}`, '');
  return out.join('\n');
}
