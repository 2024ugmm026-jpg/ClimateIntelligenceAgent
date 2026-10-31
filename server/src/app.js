import express from 'express';
import cors from 'cors';
import { ApiError } from './errors.js';
import { createHandlers } from './handlers.js';
import { createWeatherService } from './services/weatherService.js';
import { createMarketService } from './services/marketService.js';
import { createAiService } from './services/aiService.js';
import { createSessionStore } from './services/sessionStore.js';
import { createCache } from './services/cache.js';

export function createApp(config, overrides = {}) {
  const fetchImpl = overrides.fetchImpl || fetch;
  const handlers = createHandlers({
    config, sessions: createSessionStore(),
    weatherService: overrides.weatherService || createWeatherService({ config, cache: createCache(), fetchImpl, sleep: overrides.sleep }),
    marketService: overrides.marketService || createMarketService({ config, fetchImpl, sleep: overrides.sleep }),
    aiService: overrides.aiService || createAiService({ config, fetchImpl }),
    now: overrides.now,
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.clientOrigin }));
  app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); next(); });
  app.use(express.json({ limit: '50kb' }));

  // Minimal per-IP rate limit for the endpoints that do the most work.
  const hits = new Map();
  const limit = overrides.rateLimit ?? 60;
  app.use(['/api/chat', '/api/advisory'], (req, res, next) => {
    const key = `${req.ip}:${Math.floor(Date.now() / 60000)}`;
    const n = (hits.get(key) || 0) + 1; hits.set(key, n);
    if (hits.size > 5000) hits.clear();
    if (n > limit) return next(new ApiError(429, 'Too many requests. Please wait a minute and try again.'));
    next();
  });

  const wrap = (fn) => async (req, res, next) => {
    try {
      const out = await fn({ query: req.query, body: req.body, params: req.params });
      res.status(out.status || 200);
      if (out.text !== undefined) res.type(out.contentType || 'text/plain').send(out.text); else res.json(out.body);
    } catch (e) { next(e); }
  };

  app.get('/api/health', wrap(handlers.health));
  app.get('/api/sample', wrap(handlers.sample));
  app.get('/api/weather', wrap(handlers.weather));
  app.get('/api/markets/prices', wrap(handlers.marketPrices));
  app.post('/api/data/soil', wrap(handlers.soil));
  app.post('/api/advisory', wrap(handlers.advisory));
  app.post('/api/chat', wrap(handlers.chat));
  app.get('/api/sessions/:id', wrap(handlers.session));
  app.post('/api/reports/export', wrap(handlers.exportReport));
  app.use('/api', (req, res) => res.status(404).json({ detail: 'Not found.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) return res.status(err.status).json({ detail: err.detail, ...err.extra });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ detail: 'Request body must be valid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ detail: 'Request is too large.' });
    console.error('Unhandled error:', err.message); // message only: no request bodies, no secrets
    res.status(500).json({ detail: 'Something went wrong on the server. Please try again.' });
  });
  return app;
}
