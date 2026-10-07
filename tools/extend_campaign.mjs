// Round 2: append levels 121-180 to src/data/campaign.json WITHOUT touching 1-120 (saves key on ids).
// Generates K seeded candidates per slot on worker threads, picks the candidate nearest the target
// (pool A = 122-130 no seams, pool B = 132-180 with seams, both above level 120's score so the
// curve keeps rising), then proves each pick unique with the independent DFS (falls back to the
// next candidate if the DFS can't finish inside its budget).
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { generate } from '../src/core/gen.js';
import { dfsCount } from '../src/core/dfs.js';
import { levelParams, targetScore } from '../src/core/campaign.js';

const DFS_BUDGET = 1.5e8;
if (!isMainThread) {
  parentPort.on('message', (t) => {
    if (t.kind === 'gen') { const r = generate(levelParams(t.i), `L${t.i}-c${t.j}`); parentPort.postMessage({ ...t, r }); }
    else { const d = dfsCount(t.p, 2, DFS_BUDGET); parentPort.postMessage({ ...t, ok: d.count === 1 && !d.aborted && JSON.stringify(d.sols[0]) === JSON.stringify(t.p.sol), nodes: d.nodes, aborted: d.aborted }); }
  });
} else {
  const W = Math.max(1, Math.min(os.cpus().length - 1, 12));
  const t0 = Date.now();
  const pool = Array.from({ length: W }, () => new Worker(new URL(import.meta.url)));
  async function runAll(tasks, onDone) {
    let next = 0;
    await Promise.all(pool.map((wk) => new Promise((resolve) => {
      const feed = () => { if (next >= tasks.length) { wk.removeAllListeners('message'); resolve(); return; } wk.postMessage(tasks[next++]); };
      wk.on('message', (m) => { onDone(m); feed(); });
      feed();
    })));
  }
  const base = JSON.parse(fs.readFileSync('src/data/campaign.json', 'utf8')).filter((l) => l.id <= 120);
  if (base.length !== 120) throw new Error('expected the frozen 120 levels');
  const floor = Math.max(...base.map((l) => l.score)) + 0.1;
  // Candidates are cached so re-picking never needs a regeneration (each keeps its own seed + slot).
  const CACHE = '.cache/extend_cands.json';
  let all;
  if (fs.existsSync(CACHE) && !process.argv.includes('--regen')) all = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  else {
    all = [];
    const genTasks = [];
    for (let i = 121; i <= 180; i++) for (let j = 0; j < levelParams(i).K; j++) genTasks.push({ kind: 'gen', i, j });
    let done = 0;
    await runAll(genTasks, (m) => { if (m.r) all.push({ ...m.r, src: m.i }); if (++done % 200 === 0) console.log(`${done}/${genTasks.length} candidates ${((Date.now() - t0) / 1000) | 0}s`); });
    fs.mkdirSync('.cache', { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(all));
  }
  console.log(`${all.length} candidates`);
  const used = new Set();
  const key = (c) => c.seed;
  // Pick one verified candidate per target from a pool: nearest unused candidate with score >= min.
  async function pickPool(pool, targets, min) {
    const chosen = new Array(targets.length).fill(null);
    const tried = new Set();
    let todo = targets.map((t, k) => k);
    while (todo.length) {
      const batch = [];
      for (const k of todo) {
        const c = pool.filter((x) => x.diff.score >= min && !used.has(key(x)) && !tried.has(key(x)) && !batch.some((b) => key(b.p) === key(x)))
          .sort((x, y) => Math.abs(x.diff.score - targets[k]) - Math.abs(y.diff.score - targets[k]))[0];
        if (!c) { console.error('NO CANDIDATE LEFT for target', targets[k]); process.exitCode = 1; continue; }
        batch.push({ kind: 'dfs', k, p: c });
      }
      const failed = [];
      await runAll(batch, (m) => { tried.add(key(m.p)); if (m.ok) { chosen[m.k] = m.p; used.add(key(m.p)); } else { failed.push(m.k); console.log(`  candidate ${m.p.seed} (${m.p.diff.score}) rejected by DFS (${m.aborted ? 'budget' : 'not unique'})`); } });
      todo = failed;
    }
    return chosen.filter(Boolean);
  }
  const bySlot = (i) => all.filter((c) => c.src === i);
  const teach121 = (await pickPool(bySlot(121), [targetScore(121)], 0))[0];
  const teach131 = (await pickPool(bySlot(131), [targetScore(131)], 0))[0];
  // Order: 121 eye tutorial, 122-125 eye-only levels just above level 120, 126 seam tutorial,
  // 127-180 everything else sorted by difficulty (picked evenly across the eligible range).
  const poolA = all.filter((c) => c.src > 121 && c.src <= 130).sort((x, y) => x.diff.score - y.diff.score);
  const eligA = poolA.filter((c) => c.diff.score >= floor);
  const A = await pickPool(eligA, eligA.slice(0, 4).map((c) => c.diff.score), floor);
  const maxA = Math.max(...A.map((c) => c.diff.score));
  const rest = all.filter((c) => (c.src > 121 && c.src <= 130) || c.src > 131).filter((c) => c.diff.score >= maxA && !used.has(key(c))).sort((x, y) => x.diff.score - y.diff.score);
  console.log(`eligible after the eye-only block: ${rest.length}`);
  const tB = []; for (let k = 0; k < 54; k++) tB.push(rest[Math.round(k * (rest.length - 1) / 53)].diff.score);
  const B = await pickPool(rest, tB, maxA);
  for (const wk of pool) wk.terminate();
  const rec = (i, c) => ({ src: i, seed: c.seed, n: c.n, pins: c.pins, start: c.start, knot: c.knot, straight: c.straight, corner: c.corner, nums: c.nums, ...(c.eyes ? { eyes: c.eyes } : {}), ...(c.seams ? { seams: c.seams } : {}), sol: c.sol, score: c.diff.score, lvl: c.diff.level, rounds: c.diff.rounds, search: c.diff.searchNodes });
  const sortByScore = (arr) => arr.map((c) => rec(c.src, c)).sort((a, b) => a.score - b.score);
  const out = [...base, rec(121, teach121), ...sortByScore(A), rec(131, teach131), ...sortByScore(B)]; // seam tutorial lands at id 126
  out.forEach((l, k) => { l.id = k + 1; });
  fs.writeFileSync('src/data/campaign.json', JSON.stringify(out));
  console.log(`wrote ${out.length} levels in ${((Date.now() - t0) / 1000) | 0}s; floor ${floor}, pool A max ${maxA}`);
  for (const l of out.slice(120)) console.log(`L${l.id} src ${l.src} ${l.n}x${l.n} E${(l.eyes || []).length} M${(l.seams || []).length} S${l.straight.length} C${l.corner.length} N${l.nums.length} knot ${l.knot >= 0 ? 'Y' : '-'} score ${l.score} lvl ${l.lvl}`);
}
