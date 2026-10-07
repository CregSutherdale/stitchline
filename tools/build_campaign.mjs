// Builds src/data/campaign.json: for each of 120 slots, generate K seeded candidates in parallel
// worker threads, keep the one closest to the target difficulty, then order each chapter (21+) by
// measured difficulty. Each stored level records the slot whose params made it (`src`) and its seed,
// so tools/test_puzzles.mjs can regenerate it exactly.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { generate } from '../src/core/gen.js';
import { levelParams, targetScore, pickCandidate } from '../src/core/campaign.js';

if (!isMainThread) {
  parentPort.on('message', ({ i, j }) => {
    const seed = `L${i}-c${j}`;
    const r = generate(levelParams(i), seed);
    parentPort.postMessage({ i, j, r });
  });
} else {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',').map(Number) : null;
  const tasks = [];
  for (let i = 1; i <= 120; i++) { if (only && !only.includes(i)) continue; const K = levelParams(i).K; for (let j = 0; j < K; j++) tasks.push({ i, j }); }
  const W = Math.max(1, Math.min(os.cpus().length - 1, 12));
  const results = new Map();
  const t0 = Date.now();
  let next = 0, done = 0;
  await new Promise((resolve) => {
    let live = 0;
    for (let w = 0; w < W; w++) {
      const wk = new Worker(new URL(import.meta.url)); live++;
      const feed = () => { if (next < tasks.length) wk.postMessage(tasks[next++]); else { wk.terminate(); if (--live === 0) resolve(); } };
      wk.on('message', ({ i, j, r }) => {
        if (!results.has(i)) results.set(i, []);
        results.get(i)[j] = r; done++;
        if (done % 50 === 0) console.log(`${done}/${tasks.length} candidates, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        feed();
      });
      feed();
    }
  });
  const path = 'src/data/campaign.json';
  const prev = only && fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : [];
  const bySrc = new Map(prev.map((l) => [l.src, l]));
  for (const [i, cands] of results) {
    const best = pickCandidate(cands, targetScore(i));
    if (!best) { console.error('NO CANDIDATE for level', i); process.exitCode = 1; continue; }
    const d = best.diff;
    bySrc.set(i, { src: i, seed: best.seed, n: best.n, pins: best.pins, start: best.start, knot: best.knot, straight: best.straight, corner: best.corner, nums: best.nums, sol: best.sol, score: d.score, lvl: d.level, rounds: d.rounds, search: d.searchNodes });
  }
  const slots = [...bySrc.values()].sort((a, b) => a.src - b.src);
  // Teaching levels (1,2,4,5,9,15) stay put; the gaps between them and all of 21-120 are ordered by
  // measured difficulty, so the curve rises monotonically outside the teaching beats.
  const out = [];
  const fixed = [1, 2, 4, 5, 9, 15, 21];
  for (let k = 0; k < fixed.length - 1; k++) {
    out.push(slots.find((l) => l.src === fixed[k]));
    out.push(...slots.filter((l) => l.src > fixed[k] && l.src < fixed[k + 1]).sort((a, b) => a.score - b.score));
  }
  out.push(...slots.filter((l) => l.src >= 21).sort((a, b) => a.score - b.score));
  out.forEach((l, k) => { l.id = k + 1; });
  fs.writeFileSync(path, JSON.stringify(out));
  console.log(`wrote ${out.length} levels in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  for (const l of out) console.log(`L${String(l.id).padStart(3)} src ${String(l.src).padStart(3)} ${l.n}x${l.n} pins ${l.pins.length} knot ${l.knot >= 0 ? 'Y' : '-'} S${l.straight.length} C${l.corner.length} N${l.nums.length} score ${l.score} lvl ${l.lvl} search ${l.search}`);
}
