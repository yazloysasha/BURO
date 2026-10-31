import fs from 'node:fs';
import path from 'node:path';
import { DATA_FILES, indexData } from '../js/game/data.js';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

export function loadData() {
  const d = {};
  for (const f of DATA_FILES) d[f] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f + '.json'), 'utf8'));
  return indexData(d);
}
