// All configuration comes from environment variables. Secrets never leave the server.
export function loadConfig(env = process.env) {
  const num = (v, d) => {
    if (v === undefined || v === '') return d;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const ai = {
    apiKey: env.AI_API_KEY || '',
    model: env.AI_MODEL || 'claude-sonnet-5-5',
    url: env.AI_API_URL || 'https://api.anthropic.com/v1/messages',
    timeoutMs: num(env.AI_TIMEOUT_MS, 20000),
  };
  const weather = {
    provider: (env.WEATHER_PROVIDER || '').toLowerCase(), // only "open-meteo" is implemented
    baseUrl: env.WEATHER_BASE_URL || 'https://api.open-meteo.com/v1/forecast',
    timeoutMs: num(env.WEATHER_TIMEOUT_MS, 8000),
    retries: 2,
    retryDelayMs: num(env.WEATHER_RETRY_DELAY_MS, 400),
  };
  const market = {
    apiKey: env.MANDI_API_KEY || '',
    baseUrl: env.MANDI_BASE_URL || 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070',
    timeoutMs: num(env.MANDI_TIMEOUT_MS, 8000),
  };
  return {
    port: num(env.PORT, 8787),
    clientOrigin: env.CLIENT_ORIGIN || 'http://localhost:5173',
    ai: { ...ai, configured: Boolean(ai.apiKey) },
    weather: { ...weather, configured: weather.provider === 'open-meteo' },
    market: { ...market, configured: Boolean(market.apiKey) },
    // Live satellite processing is not implemented; SATELLITE_API_KEY is reserved for future use.
    satellite: { configured: false },
  };
}
