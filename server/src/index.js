import { loadConfig } from './config.js';
import { createApp } from './app.js';

try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* .env is optional: demo mode works without it */ }
const config = loadConfig();
createApp(config).listen(config.port, () => {
  const mode = config.weather.configured || config.market.configured ? 'live/partial' : 'demo';
  console.log(`Climate Intelligence Agent API on http://localhost:${config.port} (${mode} mode, AI ${config.ai.configured ? 'on' : 'off'})`);
});
