// GATE 1: regenerate all 120 campaign levels from their stored seeds + 30 daily seeds, prove each
// has exactly ONE solution with the INDEPENDENT cell-DFS solver (src/core/dfs.js shares no code with
// the generator's solver), check the stored solution obeys every rule, and check difficulty rises.
// Exit 0 = all pass.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { generate } from '../src/core/gen.js';
import { levelParams, CHAPTERS } from '../src/core/campaign.js';
import { dfsCount } from '../src/core/dfs.js';
import { checkPathRules } from '../src/core/logic.js';
import { makeDaily } from '../src/worker.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (!isMainThread) {
  parentPort.on('message', (job) => {
    const t0 = Date.now();
    let p, regenOk = true;
    if (job.kind === 'campaign') {
      const lv = job.lv;
      const r = generate(levelParams(lv.src), lv.seed);
      p = lv;
      regenOk = !!r && ['n', 'pins', 'start', 'knot', 'straight', 'corner', 'nums', 'sol'].every((k) => same(r[k], lv[k]));
    } else {
      p = makeDaily(job.key);
    }
    const d = dfsCount(p, 2, 4e8);
    const rulesOk = checkPathRules(p, p.sol);
    const solMatch = d.count === 1 && same(d.sols[0], p.sol);
    parentPort.postMessage({ ...job, lv: undefined, n: p.n, pins: p.pins.length, knot: p.knot >= 0, S: p.straight.length, C: p.corner.length, N: p.nums.length,
      count: d.count, aborted: d.aborted, nodes: d.nodes, regenOk, rulesOk, solMatch, score: p.score ?? p.diff?.score, ms: Date.now() - t0 });
  });
} else {
  const camp = JSON.parse(fs.readFileSync('src/data/campaign.json', 'utf8'));
  const jobs = camp.map((lv) => ({ kind: 'campaign', id: lv.id, lv }));
  const start = new Date('2026-10-06T12:00:00');
  for (let k = 0; k < 30; k++) { const d = new Date(start); d.setDate(d.getDate() + k); jobs.push({ kind: 'daily', key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }); }
  const W = Math.max(1, Math.min(os.cpus().length - 1, 12));
  const res = []; let next = 0; const t0 = Date.now();
  // longest first for better packing
  jobs.sort((a, b) => (b.lv?.n || 9) - (a.lv?.n || 9));
  await new Promise((resolve) => {
    let live = 0;
    for (let w = 0; w < W; w++) {
      const wk = new Worker(new URL(import.meta.url)); live++;
      const feed = () => { if (next < jobs.length) wk.postMessage(jobs[next++]); else { wk.terminate(); if (--live === 0) resolve(); } };
      wk.on('message', (m) => { res.push(m); feed(); });
      wk.on('error', (e) => { console.error('worker error', e); process.exitCode = 1; });
      feed();
    }
  });
  const fails = [];
  const camps = res.filter((r) => r.kind === 'campaign').sort((a, b) => a.id - b.id);
  const dailies = res.filter((r) => r.kind === 'daily').sort((a, b) => a.key.localeCompare(b.key));
  const pad = (s, n) => String(s).padStart(n);
  console.log('\nCAMPAIGN  (count = solutions found by the independent DFS solver, must be 1)');
  console.log('  id chapter     size pins knot  S  C  N   score  count regen rules  dfs-nodes');
  for (const r of camps) {
    const ok = r.count === 1 && !r.aborted && r.regenOk && r.rulesOk && r.solMatch;
    if (!ok) fails.push(`L${r.id}`);
    console.log(`${pad(r.id, 4)} ${CHAPTERS[Math.floor((r.id - 1) / 10)].padEnd(11)} ${pad(r.n + 'x' + r.n, 5)} ${pad(r.pins, 4)} ${r.knot ? '  Y ' : '  - '} ${pad(r.S, 2)} ${pad(r.C, 2)} ${pad(r.N, 2)} ${pad(r.score, 7)} ${pad(r.aborted ? 'ABORT' : r.count, 6)} ${r.regenOk ? '  ok ' : ' FAIL'} ${r.rulesOk ? ' ok  ' : ' FAIL'} ${pad(r.nodes, 10)}${ok ? '' : '  <-- FAIL'}`);
  }
  console.log('\nDAILY STITCH (30 date seeds)');
  for (const r of dailies) {
    const ok = r.count === 1 && !r.aborted && r.rulesOk && r.solMatch;
    if (!ok) fails.push(`daily ${r.key}`);
    console.log(`  ${r.key} ${r.n}x${r.n} pins ${r.pins} knot ${r.knot ? 'Y' : '-'} S${r.S} C${r.C} N${r.N} score ${pad(r.score, 6)} solutions ${r.aborted ? 'ABORT' : r.count}${ok ? '' : '  <-- FAIL'}`);
  }
  // Difficulty curve
  const chMeans = [];
  for (let c = 0; c < 12; c++) { const xs = camps.filter((r) => r.id > c * 10 && r.id <= c * 10 + 10).map((r) => r.score); chMeans.push(xs.reduce((a, b) => a + b, 0) / xs.length); }
  const rank = (arr) => { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(arr.length); idx.forEach(([, i], k) => { r[i] = k; }); return r; };
  const sc = camps.map((r) => r.score), ra = rank(sc), rb = camps.map((_, i) => i);
  const nn = sc.length; let d2 = 0; for (let i = 0; i < nn; i++) d2 += (ra[i] - rb[i]) ** 2;
  const rho = 1 - (6 * d2) / (nn * (nn * nn - 1));
  let drops = 0; for (let i = 21; i < camps.length; i++) if (camps[i].score < camps[i - 1].score) drops++;
  console.log('\nDIFFICULTY CURVE (chapter mean of measured solver score)');
  chMeans.forEach((m, c) => console.log(`  ch${pad(c + 1, 2)} ${CHAPTERS[c].padEnd(11)} ${m.toFixed(1).padStart(6)}  ${'#'.repeat(Math.round(m / 4))}`));
  const rising = chMeans.every((m, i) => i === 0 || m > chMeans[i - 1]);
  console.log(`  chapter means strictly rising: ${rising ? 'YES' : 'NO'}`);
  console.log(`  Spearman rank correlation (score vs level order): ${rho.toFixed(3)}  (gate >= 0.90)`);
  console.log(`  drops in score after level 21: ${drops}  (gate 0)`);
  console.log(`  level 40: score ${camps[39].score}, ${camps[39].n}x${camps[39].n}; hardest: ${Math.max(...sc)}`);
  if (!rising) fails.push('curve: chapter means');
  if (rho < 0.9) fails.push('curve: spearman');
  if (drops) fails.push('curve: drops');
  console.log(`\n${res.length} puzzles checked in ${((Date.now() - t0) / 1000).toFixed(0)}s on ${W} workers`);
  console.log(fails.length ? `GATE 1 FAIL: ${fails.join(', ')}` : 'GATE 1 PASS: 150/150 unique, regenerated exactly, difficulty rises');
  process.exit(fails.length ? 1 : 0);
}
