export const DAY_MS = 86400000;

export function isValidDateString(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const toDateString = (d) => d.toISOString().slice(0, 10);
export function addDays(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateString(d);
}
// a - b in whole days
export const diffDays = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
export const round1 = (n) => Math.round(n * 10) / 10;
export const round2 = (n) => Math.round(n * 100) / 100;

// Price unit -> multiplier that converts a price in that unit into INR per quintal (100 kg).
const QUINTAL_FACTORS = { quintal: 1, kg: 100, tonne: 0.1, ton: 0.1 };
export function priceUnitFactor(unit) {
  if (typeof unit !== 'string') return null;
  const part = unit.toLowerCase().replace(/\s+/g, '').split('/').pop();
  return Object.prototype.hasOwnProperty.call(QUINTAL_FACTORS, part) ? QUINTAL_FACTORS[part] : null;
}
export const toPerQuintal = (price, unit) => {
  const f = priceUnitFactor(unit);
  return f === null ? null : round2(price * f);
};
