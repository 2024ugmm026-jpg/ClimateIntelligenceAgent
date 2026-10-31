import { isValidDateString, toDateString, addDays, round2 } from './units.js';

export const SUPPORTED_LANGUAGES = ['en', 'hi'];
export const SUPPORTED_CROPS = ['wheat', 'rice', 'maize'];
export const GROWTH_STAGES = ['pre_sowing', 'sowing', 'vegetative', 'flowering', 'grain_filling', 'harvesting'];
export const SOIL_TYPES = ['alluvial', 'black', 'red', 'laterite', 'sandy', 'loam', 'clay'];
export const DATA_MODES = ['demo', 'live'];
export const MAX_QUESTION_LENGTH = 500;

const CTRL = /[\u0000-\u001f\u007f]/g;
const blank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const short = (v) => String(v).replace(CTRL, ' ').slice(0, 30);

// null = not provided, NaN = provided but not a finite number
function num(v) {
  if (blank(v)) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : NaN; }
  return NaN;
}

export function validateLanguage(input) {
  if (blank(input)) return { value: 'en', error: null };
  const v = String(input).toLowerCase();
  if (!SUPPORTED_LANGUAGES.includes(v)) {
    return { value: null, error: { field: 'language', message: `Language '${short(input)}' is not available yet. Available: ${SUPPORTED_LANGUAGES.join(', ')}.` } };
  }
  return { value: v, error: null };
}

function validateSoilFields(input, today, errors) {
  const out = { soil_type: null, soil_ph: null, soil_moisture: null };
  if (!blank(input.soil_type)) {
    const v = String(input.soil_type).toLowerCase();
    if (!SOIL_TYPES.includes(v)) errors.push({ field: 'soil_type', message: `Soil type must be one of: ${SOIL_TYPES.join(', ')}.` });
    else out.soil_type = v;
  }
  const ph = num(input.soil_ph);
  if (Number.isNaN(ph) || (ph !== null && (ph < 3 || ph > 10))) errors.push({ field: 'soil_ph', message: 'Soil pH must be a number between 3 and 10.' });
  else out.soil_ph = ph;

  const m = input.soil_moisture;
  if (!blank(m)) {
    if (typeof m !== 'object' || Array.isArray(m)) errors.push({ field: 'soil_moisture', message: 'Soil moisture must include a value, a unit and the date it was measured.' });
    else {
      const value = num(m.value);
      if (value === null) { /* not provided */ }
      else {
        const unit = blank(m.unit) ? '%' : String(m.unit).toLowerCase();
        let ok = true;
        if (Number.isNaN(value)) { errors.push({ field: 'soil_moisture.value', message: 'Soil moisture must be a number.' }); ok = false; }
        else if (!['%', 'fraction'].includes(unit)) { errors.push({ field: 'soil_moisture.unit', message: "Soil moisture unit must be '%' or 'fraction'." }); ok = false; }
        else if (unit === '%' && (value < 0 || value > 100)) { errors.push({ field: 'soil_moisture.value', message: 'Soil moisture must be between 0 and 100 %.' }); ok = false; }
        else if (unit === 'fraction' && (value < 0 || value > 1)) { errors.push({ field: 'soil_moisture.value', message: 'Soil moisture as a fraction must be between 0 and 1.' }); ok = false; }
        if (!isValidDateString(m.observed_on)) { errors.push({ field: 'soil_moisture.observed_on', message: 'Enter the date the soil moisture was measured (YYYY-MM-DD).' }); ok = false; }
        else if (m.observed_on > today) { errors.push({ field: 'soil_moisture.observed_on', message: 'The soil measurement date cannot be in the future.' }); ok = false; }
        if (ok) out.soil_moisture = { value: round2(unit === 'fraction' ? value * 100 : value), unit: '%', observed_on: m.observed_on };
      }
    }
  }
  return out;
}

export function validateSoilInput(input, { now = new Date() } = {}) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { value: null, errors: [{ field: 'body', message: 'Request body must be a JSON object.' }] };
  const value = validateSoilFields(input, toDateString(now), errors);
  if (!errors.length && value.soil_type === null && value.soil_ph === null && value.soil_moisture === null) {
    errors.push({ field: 'body', message: 'Enter at least one soil value: type, pH or moisture.' });
  }
  return { value, errors };
}

export function validateFarmProfile(input, { now = new Date() } = {}) {
  const errors = [];
  const err = (field, message) => errors.push({ field, message });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { value: null, errors: [{ field: 'body', message: 'Request body must be a JSON object.' }] };
  const today = toDateString(now);
  const v = {};

  if (blank(input.location_name)) v.location_name = null;
  else if (typeof input.location_name !== 'string') { err('location_name', 'Location must be text.'); v.location_name = null; }
  else {
    const s = input.location_name.replace(CTRL, ' ').trim();
    if (s.length > 100) err('location_name', 'Location must be 100 characters or fewer.');
    v.location_name = s;
  }
  const lat = num(input.latitude); const lon = num(input.longitude);
  if (Number.isNaN(lat) || (lat !== null && (lat < -90 || lat > 90))) err('latitude', 'Latitude must be a number between -90 and 90.');
  if (Number.isNaN(lon) || (lon !== null && (lon < -180 || lon > 180))) err('longitude', 'Longitude must be a number between -180 and 180.');
  if (!Number.isNaN(lat) && !Number.isNaN(lon) && (lat === null) !== (lon === null)) err('longitude', 'Enter both latitude and longitude, or leave both empty.');
  v.latitude = Number.isNaN(lat) ? null : lat; v.longitude = Number.isNaN(lon) ? null : lon;
  if (!v.location_name && (v.latitude === null || v.longitude === null)) err('location_name', 'Select or enter a location (village or district).');

  if (blank(input.crop)) err('crop', 'Select a crop before generating crop-specific advice.');
  else {
    const c = String(input.crop).toLowerCase();
    if (!SUPPORTED_CROPS.includes(c)) err('crop', `Crop '${short(input.crop)}' is not supported. Supported crops: ${SUPPORTED_CROPS.join(', ')}.`);
    else v.crop = c;
  }
  v.region = null;
  if (!blank(input.region)) {
    if (typeof input.region !== 'string' || input.region.length > 60) err('region', 'Region must be text of 60 characters or fewer.');
    else v.region = input.region.replace(CTRL, ' ').trim();
  }
  v.sowing_date = null;
  if (!blank(input.sowing_date)) {
    if (!isValidDateString(input.sowing_date)) err('sowing_date', 'Sowing date must be a real date in YYYY-MM-DD format.');
    else if (input.sowing_date < '2000-01-01' || input.sowing_date > addDays(today, 30)) err('sowing_date', 'Sowing date is outside the accepted range.');
    else v.sowing_date = input.sowing_date;
  }
  v.growth_stage = null;
  if (!blank(input.growth_stage)) {
    const g = String(input.growth_stage).toLowerCase();
    if (!GROWTH_STAGES.includes(g)) err('growth_stage', `Growth stage must be one of: ${GROWTH_STAGES.join(', ')}.`);
    else v.growth_stage = g;
  }
  Object.assign(v, validateSoilFields(input, today, errors));

  v.irrigation_available = null;
  if (!blank(input.irrigation_available)) {
    if (typeof input.irrigation_available !== 'boolean') err('irrigation_available', 'Irrigation must be yes, no or left empty.');
    else v.irrigation_available = input.irrigation_available;
  }
  const lang = validateLanguage(input.language);
  if (lang.error) err(lang.error.field, lang.error.message); else v.language = lang.value;

  const mode = blank(input.data_mode) ? 'demo' : String(input.data_mode).toLowerCase();
  if (!DATA_MODES.includes(mode)) err('data_mode', "Data mode must be 'demo' or 'live'."); else v.data_mode = mode;

  v.scenario = null;
  if (!blank(input.scenario)) {
    if (typeof input.scenario !== 'string' || !/^[a-z0-9_]{1,60}$/.test(input.scenario)) err('scenario', 'Scenario id is not valid.');
    else v.scenario = input.scenario;
  }
  if (!blank(input.use_sample_soil) && typeof input.use_sample_soil !== 'boolean') err('use_sample_soil', 'use_sample_soil must be true or false.');
  v.use_sample_soil = input.use_sample_soil === true;
  return { value: v, errors };
}

export function validateQuestion(q) {
  if (typeof q !== 'string' || q.replace(CTRL, ' ').trim() === '') return { value: null, error: { field: 'question', message: 'Type a question first.' } };
  const s = q.replace(CTRL, ' ').trim();
  if (s.length > MAX_QUESTION_LENGTH) return { value: null, error: { field: 'question', message: `Questions can be up to ${MAX_QUESTION_LENGTH} characters.` } };
  return { value: s, error: null };
}

export function validateDateRange(start, end) {
  const errors = [];
  if (!blank(start) && !isValidDateString(start)) errors.push({ field: 'start', message: 'start must be a date in YYYY-MM-DD format.' });
  if (!blank(end) && !isValidDateString(end)) errors.push({ field: 'end', message: 'end must be a date in YYYY-MM-DD format.' });
  if (!errors.length && !blank(start) && !blank(end) && start > end) errors.push({ field: 'start', message: 'start must not be after end.' });
  return errors;
}

export function validateCoordinates(latitude, longitude) {
  const lat = num(latitude); const lon = num(longitude); const errors = [];
  if (lat === null || Number.isNaN(lat) || lat < -90 || lat > 90) errors.push({ field: 'latitude', message: 'Latitude must be a number between -90 and 90.' });
  if (lon === null || Number.isNaN(lon) || lon < -180 || lon > 180) errors.push({ field: 'longitude', message: 'Longitude must be a number between -180 and 180.' });
  return { latitude: lat, longitude: lon, errors };
}
