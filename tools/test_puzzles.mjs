// GATE 1: regenerate all campaign levels from their stored seeds + 60 Daily dates, prove each has
// exactly ONE solution with the INDEPENDENT cell-DFS solver (src/core/dfs.js shares no code with the
// generator's solver), check the stored solution obeys every rule, every Daily sits in the hard
// band, levels 1-120 are unchanged from the live v1 campaign, and difficulty rises. Exit 0 = pass.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { generate } from '../src/core/gen.js';
import { levelParams, CHAPTERS, TEACH_FIXED, DAILY_BAND, chapterOf, chapterRange } from '../src/core/campaign.js';
import { dfsCount } from '../src/core/dfs.js';
import { checkPathRules } from '../src/core/logic.js';
import { makeDaily } from '../src/worker.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const FIELDS = ['n', 'pins', 'start', 'knot', 'straight', 'corner', 'nums', 'eyes', 'seams', 'sol'];

if (!isMainThread) {
  parentPort.on('message', (job) => {
    const t0 = Date.now();
    let p, regenOk = true;
    if (job.kind === 'campaign') {
      const lv = job.lv;
      const r = generate(levelParams(lv.src), lv.seed);
      p = lv;
      regenOk = !!r && FIELDS.every((k) => same(r[k], lv[k]));
    } else p = makeDaily(job.key);
    const d = dfsCount(p, 2, 6e8);
    parentPort.postMessage({ kind: job.kind, id: job.id, key: job.key, n: p.n, pins: p.pins.length, knot: p.knot >= 0, S: p.straight.length, C: p.corner.length, N: p.nums.length,
      E: (p.eyes || []).length, M: (p.seams || []).length, tries: p.tries, count: d.count, aborted: d.aborted, nodes: d.nodes, regenOk,
      rulesOk: checkPathRules(p, p.sol), solMatch: d.count === 1 && same(d.sols[0], p.sol), score: p.score ?? p.diff?.score, ms: Date.now() - t0 });
  });
} else {
  const camp = JSON.parse(fs.readFileSync('src/data/campaign.json', 'utf8'));
  const jobs = camp.map((lv) => ({ kind: 'campaign', id: lv.id, lv }));
  const start = new Date('2026-10-07T12:00:00');
  for (let k = 0; k < 60; k++) { const d = new Date(start); d.setDate(d.getDate() + k); jobs.push({ kind: 'daily', key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }); }
  const W = Math.max(1, Math.min(os.cpus().length - 1, 12));
  const res = []; let next = 0; const t0 = Date.now();
  jobs.sort((a, b) => (b.lv?.n || 9) - (a.lv?.n || 9) || (b.lv?.score || 0) - (a.lv?.score || 0));
  await new Promise((resolve) => {
    let live = 0;
    for (let w = 0; w < W; w++) {
      const wk = new Worker(new URL(import.meta.url)); live++;
      const feed = () => { if (next < jobs.length) wk.postMessage(jobs[next++]); else { wk.terminate(); if (--live === 0) resolve(); } };
      wk.on('message', (m) => { res.push(m); if (res.length % 40 === 0) console.error(`  ${res.length}/${jobs.length} checked`); feed(); });
      wk.on('error', (e) => { console.error('worker error', e); process.exitCode = 1; });
      feed();
    }
  });
  const fails = [];
  const camps = res.filter((r) => r.kind === 'campaign').sort((a, b) => a.id - b.id);
  const dailies = res.filter((r) => r.kind === 'daily').sort((a, b) => a.key.localeCompare(b.key));
  const pad = (s, n) => String(s).padStart(n);
  console.log('\nCAMPAIGN  (count = solutions found by the independent DFS solver, must be 1)');
  console.log('  id chapter     size pins knot  S  C  N  E  M   score  count regen rules  dfs-nodes');
  for (const r of camps) {
    const ok = r.count === 1 && !r.aborted && r.regenOk && r.rulesOk && r.solMatch;
    if (!ok) fails.push(`L${r.id}`);
    console.log(`${pad(r.id, 4)} ${CHAPTERS[chapterOf(r.id)].padEnd(11)} ${pad(r.n + 'x' + r.n, 5)} ${pad(r.pins, 4)} ${r.knot ? '  Y ' : '  - '} ${pad(r.S, 2)} ${pad(r.C, 2)} ${pad(r.N, 2)} ${pad(r.E, 2)} ${pad(r.M, 2)} ${pad(r.score, 7)} ${pad(r.aborted ? 'ABORT' : r.count, 6)} ${r.regenOk ? '  ok ' : ' FAIL'} ${r.rulesOk ? ' ok  ' : ' FAIL'} ${pad(r.nodes, 10)}${ok ? '' : '  <-- FAIL'}`);
  }
  console.log(`\nDAILY STITCH (60 dates, hard band ${DAILY_BAND[0]}-${DAILY_BAND[1]})`);
  console.log('  date        size pins knot  S  C  N   score tries  band  solutions');
  for (const r of dailies) {
    const inBand = r.score >= DAILY_BAND[0] && r.score <= DAILY_BAND[1];
    const ok = r.count === 1 && !r.aborted && r.rulesOk && r.solMatch && inBand;
    if (!ok) fails.push(`daily ${r.key}`);
    console.log(`  ${r.key} ${pad(r.n + 'x' + r.n, 5)} ${pad(r.pins, 4)} ${r.knot ? '  Y ' : '  - '} ${pad(r.S, 2)} ${pad(r.C, 2)} ${pad(r.N, 2)} ${pad(r.score, 7)} ${pad(r.tries, 5)} ${inBand ? '  in ' : ' OUT '} ${pad(r.aborted ? 'ABORT' : r.count, 6)}${ok ? '' : '  <-- FAIL'}`);
  }
  const ds = dailies.map((r) => r.score);
  console.log(`  daily scores: min ${Math.min(...ds)}, max ${Math.max(...ds)}, mean ${(ds.reduce((a, b) => a + b, 0) / ds.length).toFixed(1)}; tries max ${Math.max(...dailies.map((r) => r.tries))}`);
  // Levels 1-120 must be identical to the live v1 campaign (her saves key on level ids).
  const frozen = JSON.parse(fs.readFileSync('tests/fixtures/campaign_v1_120.json', 'utf8'));
  const frozenOk = frozen.length === 120 && frozen.every((l, i) => same(l, camp[i]));
  console.log(`\nLEVELS 1-120 identical to the live v1 campaign: ${frozenOk ? 'YES' : 'NO'}`);
  if (!frozenOk) fails.push('levels 1-120 changed');
  // Difficulty curve
  const NCH = CHAPTERS.length, chMeans = [];
  for (let c = 0; c < NCH; c++) { const [lo, hi] = chapterRange(c); const xs = camps.filter((r) => r.id >= lo && r.id <= hi).map((r) => r.score); chMeans.push(xs.reduce((a, b) => a + b, 0) / xs.length); }
  const sc = camps.map((r) => r.score);
  const order = sc.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const ra = new Array(sc.length); order.forEach(([, i], k) => { ra[i] = k; });
  let d2 = 0; for (let i = 0; i < sc.length; i++) d2 += (ra[i] - i) ** 2;
  const rho = 1 - (6 * d2) / (sc.length * (sc.length ** 2 - 1));
  let drops = 0, prev = -1;
  for (const r of camps) { if (r.id <= 20 || TEACH_FIXED.includes(r.id)) continue; if (r.score < prev) drops++; prev = r.score; }
  console.log('\nDIFFICULTY CURVE (chapter mean of measured solver score)');
  chMeans.forEach((m, c) => console.log(`  ch${pad(c + 1, 2)} ${CHAPTERS[c].padEnd(11)} ${m.toFixed(1).padStart(6)}  ${'#'.repeat(Math.round(m / 5))}`));
  const rising = chMeans.every((m, i) => i === 0 || m > chMeans[i - 1]);
  console.log(`  chapter means strictly rising: ${rising ? 'YES' : 'NO'}`);
  console.log(`  Spearman rank correlation (score vs level order): ${rho.toFixed(3)}  (gate >= 0.90)`);
  console.log(`  drops after level 20 (teaching levels ${TEACH_FIXED.join(',')} exempt): ${drops}  (gate 0)`);
  console.log(`  level 40: ${sc[39]}; level 120: ${sc[119]}; level 180: ${sc[sc.length - 1]}; hardest ${Math.max(...sc)}`);
  if (!rising) fails.push('curve: chapter means');
  if (rho < 0.9) fails.push('curve: spearman');
  if (drops) fails.push('curve: drops');
  console.log(`\n${res.length} puzzles checked in ${((Date.now() - t0) / 1000).toFixed(0)}s on ${W} workers`);
  console.log(fails.length ? `GATE 1 FAIL: ${fails.join(', ')}` : `GATE 1 PASS: ${res.length}/${res.length} unique (independent DFS), regenerated exactly, 60/60 dailies in band, levels 1-120 frozen, difficulty rises`);
  process.exit(fails.length ? 1 : 0);
}
