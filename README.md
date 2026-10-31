# Climate Intelligence Agent

A climate-smart farming assistant. Pick a location and crop, optionally add soil and growth-stage details, and get a dashboard with weather, climate-risk levels, soil and satellite indicators, mandi prices and a prioritised action list, explained in English or Hindi.

**Design rule:** deterministic server code does every calculation (units, freshness, risk scores, price comparison). The AI only explains validated results and answers questions about them. It never supplies measurements, prices, forecasts or official warnings.

## Run it (demo mode, no credentials)

Requires Node.js 20.12 or newer.

```bash
npm run install:all
npm run dev:server     # API on http://localhost:8787
npm run dev:client     # UI  on http://localhost:5173 (proxies /api to the server)
```

Open http://localhost:5173 and press **Load demo data**. Everything works with no API keys. Demo results always carry the label "Demo data — not a live forecast".

## Tests

```bash
npm test
```

Core logic and API handlers are covered by tests that need no network or install. The three HTTP-level tests (malformed JSON, 413, 429, routing) run once `npm run install:all` has installed Express, and are skipped otherwise.

## Optional live integrations

Copy `.env.example` to `server/.env`.

| Setting | Effect |
|---|---|
| `WEATHER_PROVIDER=open-meteo` | Live weather for entered coordinates. Failures are retried twice, cached 30 minutes, and served as clearly marked stale data if the provider later goes down. |
| `MANDI_API_KEY` | Live mandi prices from data.gov.in. |
| `AI_API_KEY`, `AI_MODEL` | AI-written explanations in chat (Anthropic Messages API). Without a key, chat returns a template summary. |

`GET /api/health` reports `demo`, `partial` or `live`. "Configured" means settings are present; connectivity is checked on each request.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Mode and integration status (no secrets) |
| `GET /api/sample` | Demo locations, crops, five scenarios with weather, soil, satellite and prices |
| `GET /api/weather?mode=demo&scenario=…` or `?mode=live&lat=…&lon=…` | Weather records |
| `GET /api/markets/prices?crop=wheat&region=Haryana` | Prices normalised to INR/quintal with freshness flags |
| `POST /api/data/soil` | Validate soil values |
| `POST /api/advisory` | Full advisory: risks, actions, sources, trace |
| `POST /api/chat` | Question answered from a stored advisory (`session_id`) |
| `GET /api/sessions/:id` | Stored advisory and processing trace |
| `POST /api/reports/export` | Markdown summary |

Errors always look like `{ "detail": "…", "errors": [{ "field", "message" }] }`.

## Data rules

- Missing optional values stay `null`. A missing weather day is never treated as 0 mm.
- Too little data gives risk level `unknown` with the message "Risk cannot be determined from the available data", never a confident guess.
- Conflicting values for the same date from different sources give `unknown`; the engine does not pick one.
- Old mandi prices are flagged "stale", excluded from comparisons and never shown as current.
- One failing source (for example prices) does not break the dashboard, and demo values are never substituted into live results.
- Risk thresholds live in `server/src/thresholds.json` and are **demonstration assumptions**, not validated agronomy.

## Layout

```
server/src/   riskEngine, actions, validation, i18n, thresholds, handlers, app (Express)
server/src/services/   weather, market, ai, advisory, sessions, export
server/src/data/       synthetic demo dataset
server/test/           node:test suites
client/src/           React + Vite UI (form, dashboard, chart, chat with voice)
```

## Known limitations

- Live weather (Open-Meteo), live mandi prices (data.gov.in) and the AI call are implemented against their documented APIs but were **not exercised against the real services** in the build environment (no network there). Their request building, parsing, retry, cache and fallback paths are tested with simulated responses. Check them with real credentials before relying on them.
- Live satellite processing is not implemented; satellite values exist only in demo data and are labelled as samples.
- The React client was syntax-checked but not built or run in a browser in the build environment. Run `npm run build` first on your machine.
- Sessions and caches are in memory and reset on restart. No database or login.
- "Today" is the server's UTC date; around midnight in India it can differ from the local date by up to a day.
- Only English and Hindi are available. Crops: wheat, rice, maize (maize has no demo prices on purpose).

## Not provided

No yield, income, rainfall or price guarantees. This does not replace official weather warnings, extension workers or lab soil tests, and it never controls irrigation, chemicals or purchases.
