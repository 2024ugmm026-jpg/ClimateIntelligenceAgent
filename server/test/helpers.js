import { loadConfig } from '../src/config.js';
import { createHandlers } from '../src/handlers.js';
import { createWeatherService } from '../src/services/weatherService.js';
import { createMarketService } from '../src/services/marketService.js';
import { createAiService } from '../src/services/aiService.js';
import { createSessionStore } from '../src/services/sessionStore.js';
import { createCache } from '../src/services/cache.js';

export const NOW = new Date('2026-10-31T06:00:00Z');
export const TODAY = '2026-10-31';

export function makeHandlers(env = {}, fetchImpl = async () => { throw new Error('network disabled in tests'); }) {
  const config = loadConfig({ WEATHER_RETRY_DELAY_MS: '0', ...env });
  const sleep = async () => {};
  return createHandlers({
    config, sessions: createSessionStore(), now: () => NOW,
    weatherService: createWeatherService({ config, cache: createCache(), fetchImpl, sleep }),
    marketService: createMarketService({ config, fetchImpl, sleep }),
    aiService: createAiService({ config, fetchImpl }),
  });
}
export const demoBody = (scenario, extra = {}) => ({ data_mode: 'demo', scenario, location_name: 'Karnal', crop: scenario.includes('rice') ? 'rice' : 'wheat', growth_stage: 'vegetative', use_sample_soil: true, language: 'en', ...extra });
