import React from 'react';
import WeatherChart from './WeatherChart.jsx';

const GLYPH = { low: '●', moderate: '◆', high: '▲', unknown: '?' };
const origin = (ui, o) => ui.origin[o] || o || ui.origin.none;
const freshLabel = (ui, s) => ui[s] || s;

function RiskCard({ r, ui }) {
  return (
    <article className={`risk ${r.risk_level}`}>
      <h3>{r.label}</h3>
      <p className="lvl"><span className="glyph" aria-hidden="true">{GLYPH[r.risk_level]}</span>{ui.level[r.risk_level]}</p>
      <p>{r.summary}</p>
      {r.reasons.length > 0 && <p><b>{ui.whyUnknown}:</b> {r.reasons.join(' ')}</p>}
      <p className="meta">{ui.freshness}: {freshLabel(ui, r.data_freshness.status)}{r.data_freshness.latest_data_date ? ` · ${r.data_freshness.latest_data_date}` : ''}{r.data_freshness.origin ? ` · ${origin(ui, r.data_freshness.origin)}` : ''}</p>
      <details>
        <summary>{ui.confidence}</summary>
        <p className="meta">{r.confidence_note}</p>
        {r.factors.length > 0 && <ul className="meta">{r.factors.map((f, i) => <li key={i}>{f.name.replace(/_/g, ' ')}: {f.value} {f.unit}{f.from ? ` (${f.from} → ${f.to})` : f.date ? ` (${f.date})` : ''}</li>)}</ul>}
      </details>
    </article>
  );
}

export default function Dashboard({ a, ui, onCopy, copyMsg }) {
  const today = a.generated_at.slice(0, 10);
  const w = a.weather; const s = w.summary;
  return (
    <div>
      <div className="panel">
        <h2>{a.location.name}{a.location.region ? `, ${a.location.region}` : ''} · {ui.crops[a.crop]}</h2>
        <p className="meta">{a.generated_at.replace('T', ' ').slice(0, 16)} UTC · {origin(ui, a.data_origin === 'partial' ? 'live' : a.data_origin)}{a.scenario ? ` · ${a.scenario.label}` : ''}</p>
        <button type="button" className="btn secondary small" onClick={onCopy}>{ui.copy}</button>
        {copyMsg && <span className="meta" role="status"> {copyMsg}</span>}
      </div>

      <section className="panel" aria-labelledby="risks-h"><h2 id="risks-h">{ui.risks}</h2>
        <div className="risks">{a.risks.map((r) => <RiskCard key={r.risk_id} r={r} ui={ui} />)}</div>
      </section>

      <section className="panel" aria-labelledby="act-h"><h2 id="act-h">{ui.actions}</h2>
        <ul className="actions">{a.actions.map((x) => (
          <li key={x.id} className={`action ${x.category}`}>
            <p className="cat">{x.category_label}</p>
            <p>{x.action}</p>
            <p className="meta">{x.reason}</p>
            <p className="meta">{ui.timing}: {x.timing}</p>
            <p className="meta">{x.caveat}</p>
          </li>))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="w-h"><h2 id="w-h">{ui.weather}</h2>
        {w.status === 'unavailable' && <div className="banner err" role="alert">{ui.weatherDown}{w.error ? `: ${w.error}` : ''}</div>}
        {w.status === 'stale' && <div className="banner warn" role="status">{ui.weatherStale} {w.error}</div>}
        {w.records.length > 0 && (
          <>
            <div className="stats">
              <div className="stat">{ui.maxTemp}<b>{s.forecast_max_temp_c ?? '–'} °C</b><span className="meta">{ui.summary7}</span></div>
              <div className="stat">{ui.minTemp}<b>{s.forecast_min_temp_c ?? '–'} °C</b><span className="meta">{ui.summary7}</span></div>
              <div className="stat">{ui.rainTotal}<b>{s.forecast_rain_total_mm ?? '–'} mm</b><span className="meta">{s.forecast_rain_days_with_data} {ui.daysWithData}</span></div>
              <div className="stat">{ui.rainPast}<b>{s.observed_rain_total_mm ?? '–'} mm</b><span className="meta">{s.observed_rain_days_with_data} {ui.daysWithData}</span></div>
            </div>
            <WeatherChart records={w.records} today={today} ui={ui} />
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="s-h"><h2 id="s-h">{ui.soil}</h2>
        <div className="stats">
          <div className="stat">{ui.soilMoisture.replace(/ \(optional\)| \(वैकल्पिक\)/, '')}<b>{a.soil.moisture ? `${a.soil.moisture.value}%` : ui.notEntered}</b><span className="meta">{a.soil.moisture ? `${a.soil.moisture.observed_on} · ${origin(ui, a.soil.moisture.origin)}` : ''}</span></div>
          <div className="stat">pH<b>{a.soil.soil_ph ? a.soil.soil_ph.value : ui.notEntered}</b><span className="meta">{a.soil.soil_ph ? origin(ui, a.soil.soil_ph.origin) : ''}</span></div>
          <div className="stat">{ui.soilType.replace(/ \(optional\)| \(वैकल्पिक\)/, '')}<b>{a.soil.soil_type ? ui.soils[a.soil.soil_type.value] : ui.notEntered}</b><span className="meta">{a.soil.soil_type ? origin(ui, a.soil.soil_type.origin) : ''}</span></div>
        </div>
        <h3>{ui.satellite}</h3>
        {a.satellite.records.length ? a.satellite.records.map((r, i) => (
          <p key={i}><b>{r.value}</b> · {r.date} · {origin(ui, r.origin)}<br /><span className="meta">{ui.satNote} {r.processing_method}</span></p>
        )) : <p className="meta">{a.satellite.note}</p>}
      </section>

      <section className="panel" aria-labelledby="m-h"><h2 id="m-h">{ui.market}</h2>
        {a.market.message && <div className={`banner ${a.market.status === 'unavailable' ? 'info' : 'warn'}`} role="status">{a.market.message}</div>}
        {a.market.prices && a.market.prices.length > 0 && (
          <div className="tablewrap"><table>
            <thead><tr><th>{ui.mandi}</th><th>₹/q</th><th>{ui.date}</th></tr></thead>
            <tbody>{a.market.prices.map((p, i) => (
              <tr key={i}><td>{p.market}{p.freshness === 'stale' && <span className="badge">{ui.staleBadge}</span>}</td><td>{p.price_per_quintal}</td><td>{p.date}</td></tr>))}
            </tbody>
          </table></div>
        )}
        {a.market.comparison && <p className="meta">{ui.highest}: {a.market.comparison.max} ({a.market.comparison.highest_market}) · {ui.average}: {a.market.comparison.average}</p>}
      </section>

      <section className="panel">
        <details>
          <summary>{ui.traceOpen}</summary>
          <h3>{ui.sources}</h3>
          <ul>{a.sources.map((src, i) => <li key={i}>{src.name} — {origin(ui, src.origin)} ({src.status}){src.note ? ` — ${src.note}` : ''}</li>)}</ul>
          <div className="tablewrap"><table>
            <thead><tr><th>{ui.step}</th><th>{ui.status}</th></tr></thead>
            <tbody>{a.trace.map((t, i) => <tr key={i}><td>{t.step}</td><td>{t.status}{t.error ? ` — ${t.error}` : ''}</td></tr>)}</tbody>
          </table></div>
        </details>
      </section>

      <p className="disclaimer"><b>{ui.disclaimer}:</b> {a.disclaimer}</p>
    </div>
  );
}
