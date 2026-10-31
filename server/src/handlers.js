// Framework-independent handlers: ({ query, body, params }) -> { status, body | text }.
import { ApiError, validationError } from './errors.js';
import { validateFarmProfile, validateLanguage, validateQuestion, validateSoilInput, validateDateRange, validateCoordinates, SUPPORTED_CROPS } from './validation.js';
import { buildAdvisory } from './services/advisoryService.js';
import { advisoryToMarkdown } from './services/exportService.js';
import { buildSampleResponse, getScenario } from './data/sample.js';

export function createHandlers({ config, weatherService, marketService, aiService, sessions, now = () => new Date() }) {
  const ok = (body) => ({ status: 200, body });
  const configured = (c) => (c ? 'configured' : 'not_configured');

  async function createAdvisory(farm) {
    const advisory = await buildAdvisory(farm, { weatherService, marketService }, now());
    sessions.save({ advisory, farm });
    return advisory;
  }

  return {
    health() {
      const w = config.weather.configured; const m = config.market.configured;
      return ok({
        status: 'ok', time: now().toISOString(), mode: w && m ? 'live' : w || m ? 'partial' : 'demo',
        integrations: {
          weather: { status: configured(w), provider: w ? config.weather.provider : null },
          market_prices: { status: configured(m) },
          satellite: { status: 'sample_only', note: 'Live satellite processing is not implemented.' },
          ai: { status: configured(config.ai.configured), fallback: 'template summary' },
        },
        note: 'Configured means settings are present. Connectivity is checked on each request.',
        languages: ['en', 'hi'], crops: SUPPORTED_CROPS,
      });
    },

    sample() { return ok(buildSampleResponse(now())); },

    async weather({ query }) {
      const mode = query.mode === 'live' ? 'live' : 'demo';
      const errors = validateDateRange(query.start, query.end);
      let lat = null; let lon = null;
      if (mode === 'live') {
        const c = validateCoordinates(query.lat, query.lon); errors.push(...c.errors); lat = c.latitude; lon = c.longitude;
      } else if (!getScenario(query.scenario)) errors.push({ field: 'scenario', message: 'Pick a valid demo scenario.' });
      if (errors.length) throw validationError(errors);
      const r = await weatherService.get({ data_mode: mode, scenario: query.scenario, latitude: lat, longitude: lon, now: now() });
      if (r.status === 'unavailable') throw new ApiError(503, r.error || 'Weather data is unavailable.', { status: 'unavailable' });
      const records = r.records.filter((x) => (!query.start || x.date >= query.start) && (!query.end || x.date <= query.end));
      return ok({ ...r, records, count: records.length });
    },

    async marketPrices({ query }) {
      const lang = validateLanguage(query.language);
      const errors = lang.error ? [lang.error] : [];
      const crop = String(query.crop || '').toLowerCase();
      if (!SUPPORTED_CROPS.includes(crop)) errors.push({ field: 'crop', message: `Choose a crop: ${SUPPORTED_CROPS.join(', ')}.` });
      errors.push(...validateDateRange(undefined, query.date));
      if (errors.length) throw validationError(errors);
      const r = await marketService.get({ crop, region: query.region || null, market: query.market || null, date: query.date || null, data_mode: query.mode === 'live' ? 'live' : 'demo', now: now(), lang: lang.value });
      return ok(r);
    },

    soil({ body }) {
      const { value, errors } = validateSoilInput(body, { now: now() });
      if (errors.length) throw validationError(errors);
      return ok({ valid: true, soil: { ...value, origin: 'user_input' } });
    },

    async advisory({ body }) {
      const { value, errors } = validateFarmProfile(body, { now: now() });
      if (errors.length) throw validationError(errors);
      return ok(await createAdvisory(value));
    },

    async chat({ body }) {
      if (!body || typeof body !== 'object') throw validationError([{ field: 'body', message: 'Request body must be a JSON object.' }]);
      const q = validateQuestion(body.question);
      const lang = validateLanguage(body.language);
      const errors = [q.error, lang.error].filter(Boolean);
      if (errors.length) throw validationError(errors);
      let advisory;
      if (body.session_id) {
        const entry = sessions.get(String(body.session_id));
        if (!entry) throw new ApiError(404, 'That advisory session was not found. Run the risk check again.');
        advisory = entry.advisory;
        if (advisory.language !== lang.value) { // rebuild so risk text and answer share one language
          advisory = await buildAdvisory({ ...entry.farm, language: lang.value }, { weatherService, marketService }, now());
          sessions.update(String(body.session_id), { advisory, farm: { ...entry.farm, language: lang.value } });
        }
      } else {
        const f = validateFarmProfile({ ...(body.farm || {}), language: lang.value }, { now: now() });
        if (f.errors.length) throw validationError(f.errors);
        advisory = await createAdvisory(f.value);
      }
      const r = await aiService.answer({ question: q.value, language: lang.value, advisory });
      return ok({ session_id: advisory.session_id, language: lang.value, mode: r.mode, answer: r.answer, uncertainty_note: r.uncertainty_note, data_origin: advisory.data_origin });
    },

    session({ params }) {
      const entry = sessions.get(params.id);
      if (!entry) throw new ApiError(404, 'Session not found.');
      return ok({ session_id: params.id, advisory: entry.advisory, trace: entry.advisory.trace });
    },

    exportReport({ body }) {
      const entry = body && body.session_id ? sessions.get(String(body.session_id)) : null;
      if (!entry) throw new ApiError(404, 'Session not found. Run the risk check first.');
      if (body.format && body.format !== 'markdown') throw validationError([{ field: 'format', message: "Only 'markdown' export is available." }]);
      return { status: 200, text: advisoryToMarkdown(entry.advisory), contentType: 'text/markdown; charset=utf-8' };
    },
  };
}
