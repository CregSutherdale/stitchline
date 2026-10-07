// Generation worker for Daily Stitch and Endless (keeps the UI at 60fps while puzzles are made).
import { generate } from './core/gen.js';
import { dailyParams, ENDLESS, pickCandidate } from './core/campaign.js';

export function makeDaily(key) {
  const d = dailyParams(key);
  const cands = [];
  for (let k = 0; k < d.K; k++) cands.push(generate(d.params, `daily:${key}:${k}`));
  return pickCandidate(cands, 'max');
}
export function makeEndless(diff, seed) {
  const e = ENDLESS[diff];
  const cands = [];
  for (let k = 0; k < e.K; k++) cands.push(generate(e.params, `endless:${diff}:${seed}:${k}`));
  return pickCandidate(cands, 'max');
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof window === 'undefined') {
  self.onmessage = (ev) => {
    const { id, kind, key, diff, seed } = ev.data;
    try {
      const p = kind === 'daily' ? makeDaily(key) : makeEndless(diff, seed);
      self.postMessage({ id, p });
    } catch (e) {
      self.postMessage({ id, error: String(e && e.message || e) });
    }
  };
}
