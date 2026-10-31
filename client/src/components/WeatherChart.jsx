import React from 'react';

const W = 640, H = 270, L = 42, R = 46, T = 14, B = 44;

// Rainfall bars (left axis) + daily max/min temperature lines (right axis).
// Days with no value are left blank and break the lines. Missing is never drawn as zero.
export default function WeatherChart({ records, today, ui }) {
  const days = [...new Set(records.map((r) => r.date))].sort();
  if (!days.length) return null;
  const pick = (variable) => Object.fromEntries(records.filter((r) => r.variable === variable).map((r) => [r.date, r.value]));
  const rain = pick('rainfall'), tmax = pick('temperature_max'), tmin = pick('temperature_min');
  const isFc = (d) => records.some((r) => r.date === d && r.record_type === 'forecast');
  const pw = W - L - R, ph = H - T - B, step = pw / days.length;
  const rainMax = Math.max(10, ...Object.values(rain));
  const temps = [...Object.values(tmax), ...Object.values(tmin)];
  const tLo = Math.floor(Math.min(...temps, 10) / 5) * 5, tHi = Math.ceil(Math.max(...temps, 30) / 5) * 5;
  const x = (i) => L + step * i + step / 2;
  const yr = (v) => T + ph - (v / rainMax) * ph;
  const yt = (v) => T + ph - ((v - tLo) / (tHi - tLo)) * ph;
  const line = (series) => {
    let d = '', pen = false;
    days.forEach((day, i) => { const v = series[day]; if (typeof v !== 'number') { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${yt(v).toFixed(1)}`; pen = true; });
    return d;
  };
  const todayIdx = days.indexOf(today);
  const label = (d) => `${d.slice(8)}/${d.slice(5, 7)}`;

  return (
    <div>
      <div className="chart-wrap">
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${ui.rainfall}, ${ui.tempMax}, ${ui.tempMin}`}>
          <defs>
            <pattern id="fc" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff" /><rect width="3" height="6" fill="#2a5d8f" /></pattern>
          </defs>
          {[0, 0.5, 1].map((f) => (<g key={f}><line x1={L} x2={W - R} y1={T + ph * (1 - f)} y2={T + ph * (1 - f)} stroke="#d5dccf" /><text x={L - 6} y={T + ph * (1 - f) + 4} textAnchor="end">{Math.round(rainMax * f)}</text><text x={W - R + 6} y={T + ph * (1 - f) + 4}>{Math.round(tLo + (tHi - tLo) * f)}</text></g>))}
          <text x={L - 6} y={10} textAnchor="end">mm</text><text x={W - R + 6} y={10}>°C</text>
          {days.map((d, i) => typeof rain[d] === 'number' && rain[d] > 0 && (
            <rect key={d} x={x(i) - step * 0.32} width={step * 0.64} y={yr(rain[d])} height={T + ph - yr(rain[d])} fill={isFc(d) ? 'url(#fc)' : '#2a5d8f'} stroke="#2a5d8f" />
          ))}
          <path d={line(tmax)} fill="none" stroke="#a35f00" strokeWidth="2.5" />
          <path d={line(tmin)} fill="none" stroke="#a35f00" strokeWidth="2" strokeDasharray="5 3" />
          {todayIdx >= 0 && (<g><line x1={x(todayIdx) - step / 2} x2={x(todayIdx) - step / 2} y1={T} y2={T + ph} stroke="#1b2a22" strokeWidth="1.5" /><text x={x(todayIdx) - step / 2 + 4} y={T + 10} fontWeight="700">{ui.today}</text></g>)}
          {days.map((d, i) => (i % 3 === 0 ? <text key={d} x={x(i)} y={H - B + 16} textAnchor="middle">{label(d)}</text> : null))}
        </svg>
      </div>
      <div className="legend">
        <span><i className="sw" style={{ background: '#2a5d8f', borderColor: '#2a5d8f' }} />{ui.rainfall} — {ui.observed}</span>
        <span><i className="sw" style={{ background: 'repeating-linear-gradient(45deg,#2a5d8f 0 3px,#fff 3px 6px)', borderColor: '#2a5d8f' }} />{ui.rainfall} — {ui.forecast}</span>
        <span><i className="sw" style={{ background: '#a35f00', borderColor: '#a35f00' }} />{ui.tempMax}</span>
        <span><i className="sw" style={{ background: '#fff', borderColor: '#a35f00', borderStyle: 'dashed' }} />{ui.tempMin}</span>
      </div>
      <p className="meta">{ui.gapNote}</p>
      <details>
        <summary>{ui.chartTable}</summary>
        <div className="tablewrap"><table>
          <thead><tr><th>{ui.date}</th><th>{ui.rainfall}</th><th>{ui.tempMax}</th><th>{ui.tempMin}</th><th /></tr></thead>
          <tbody>{days.map((d) => (<tr key={d}><td>{d}</td><td>{rain[d] ?? '–'}</td><td>{tmax[d] ?? '–'}</td><td>{tmin[d] ?? '–'}</td><td>{isFc(d) ? ui.forecast : ui.observed}</td></tr>))}</tbody>
        </table></div>
      </details>
    </div>
  );
}
