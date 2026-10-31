import { readFileSync } from 'node:fs';
export const thresholds = JSON.parse(readFileSync(new URL('./thresholds.json', import.meta.url), 'utf8'));
