// Puzzle generator: pins -> random Hamiltonian path (search seed + backbite shuffle) -> derive every
// clue the path supports -> strip clues in random order while the solver keeps the solution unique.
// Fully deterministic for a given seed (no wall-clock cutoffs, only node budgets), so Node and every
// browser produce byte-identical puzzles.
import { makeRng } from './rng.js';
import { buildModel, solve, grade, checkPathRules, isStraightAt } from './logic.js';

function neighbors(n, c) {
  const r = (c / n) | 0, k = c % n, out = [];
  if (r > 0) out.push(c - n); if (k + 1 < n) out.push(c + 1); if (r + 1 < n) out.push(c + n); if (k > 0) out.push(c - 1);
  return out;
}

function choosePins(n, count, rng) {
  for (let tries = 0; tries < 200; tries++) {
    const pins = new Set();
    const cells = rng.shuffle([...Array(n * n).keys()]);
    for (const c of cells) { if (pins.size >= count) break; pins.add(c); }
    // bipartite balance for a Hamiltonian path
    let b = 0, w = 0;
    for (let c = 0; c < n * n; c++) if (!pins.has(c)) { (((c / n) | 0) + (c % n)) % 2 ? b++ : w++; }
    if (Math.abs(b - w) > 1) continue;
    // connectivity + at most 2 dead-end (degree-1) holes, none isolated
    let ones = 0, bad = false;
    for (let c = 0; c < n * n; c++) {
      if (pins.has(c)) continue;
      const d = neighbors(n, c).filter((x) => !pins.has(x)).length;
      if (d === 0) bad = true; if (d === 1) ones++;
    }
    if (bad || ones > 2) continue;
    const open = [...Array(n * n).keys()].filter((c) => !pins.has(c));
    const seen = new Set([open[0]]), st = [open[0]];
    while (st.length) { const c = st.pop(); for (const x of neighbors(n, c)) if (!pins.has(x) && !seen.has(x)) { seen.add(x); st.push(x); } }
    if (seen.size !== open.length) continue;
    return [...pins].sort((a, b2) => a - b2);
  }
  return null;
}

// Randomised Warnsdorff DFS (go where the fewest onward moves remain) finds a Hamiltonian path fast.
function warnsdorff(n, pinSet, rng, budget) {
  const N = n * n, open = N - pinSet.size;
  const deg = (c, vis) => neighbors(n, c).filter((x) => !pinSet.has(x) && !vis[x]).length;
  const ones = [];
  for (let c = 0; c < N; c++) if (!pinSet.has(c) && neighbors(n, c).filter((x) => !pinSet.has(x)).length === 1) ones.push(c);
  let nodes = 0;
  for (let t = 0; t < 30; t++) {
    let start;
    if (ones.length) start = ones[rng.int(ones.length)];
    else { do { start = rng.int(N); } while (pinSet.has(start)); }
    const vis = new Uint8Array(N), path = [start]; vis[start] = 1;
    const rec = () => {
      if (path.length === open) return true;
      if (++nodes > budget) return false;
      const h = path[path.length - 1];
      const nb = neighbors(n, h).filter((x) => !pinSet.has(x) && !vis[x]);
      const scored = nb.map((x) => [deg(x, vis) + rng.next() * 0.9, x]).sort((a, b) => a[0] - b[0]);
      for (const [, x] of scored) {
        vis[x] = 1; path.push(x);
        if (rec()) return true;
        vis[x] = 0; path.pop();
        if (nodes > budget) return false;
      }
      return false;
    };
    if (rec()) return path;
    if (nodes > budget) return null;
  }
  return null;
}

function randomPath(n, pins, rng) {
  let path = warnsdorff(n, new Set(pins), rng, 4000);
  if (!path) return null;
  const pinSet = new Set(pins);
  // Backbite shuffle: pick an end, link it to a random neighbour, reverse the tail.
  const steps = 30 * path.length;
  const pos = new Int32Array(n * n).fill(-1);
  path.forEach((c, i) => { pos[c] = i; });
  for (let s = 0; s < steps; s++) {
    if (rng.next() < 0.5) { path.reverse(); path.forEach((c, i) => { pos[c] = i; }); }
    const L = path.length, head = path[L - 1];
    const nb = neighbors(n, head).filter((x) => !pinSet.has(x) && x !== path[L - 2]);
    if (!nb.length) continue;
    const x = rng.pick(nb), i = pos[x];
    // reverse path[i+1 .. L-1]
    for (let a = i + 1, b = L - 1; a < b; a++, b--) { const t = path[a]; path[a] = path[b]; path[b] = t; }
    for (let a = i + 1; a < L; a++) pos[path[a]] = a;
  }
  return path;
}

// Every clue the path satisfies.
function candidates(n, path) {
  const straight = [], corner = [];
  const L = path.length;
  const turn = (i) => i > 0 && i < L - 1 && !isStraightAt(path, i, n);
  for (let i = 1; i < L - 1; i++) {
    if (isStraightAt(path, i, n)) { if (turn(i - 1) || turn(i + 1)) straight.push(path[i]); }
    else if (i - 1 > 0 && i + 1 < L - 1 && isStraightAt(path, i - 1, n) && isStraightAt(path, i + 1, n)) corner.push(path[i]);
  }
  return { straight, corner };
}

function puzzleOf(base, set) {
  const p = { n: base.n, pins: base.pins, start: base.start, knot: set.knot ? base.end : -1, straight: [], corner: [], nums: [] };
  for (const k of set.items) {
    if (k.t === 's') p.straight.push(k.c); else if (k.t === 'c') p.corner.push(k.c); else if (k.t === 'n') p.nums.push(k);
  }
  p.nums.sort((a, b) => a.i - b.i);
  p.nums = p.nums.map((k) => k.c);
  p.straight.sort((a, b) => a - b); p.corner.sort((a, b) => a - b);
  return p;
}

export const genStats = { calls: 0, aborted: 0, multi: 0, uniq: 0, nodes: 0 };
function unique(p, budget) {
  const r = solve(buildModel(p), { limit: 2, nodeLimit: budget });
  genStats.calls++; genStats.nodes += r.nodes;
  if (r.aborted) genStats.aborted++; else if (r.count > 1) genStats.multi++; else genStats.uniq++;
  return !r.aborted && r.count === 1;
}

// params: { n, pins:[lo,hi] (counts), types:{s,c,n} booleans, knot:'always'|'auto'|'never', nums:max, keep:0..1, budget }
export function generate(params, seed) {
  const rng = makeRng('stitchline:' + seed);
  const n = params.n;
  const budget = params.budget ?? 60000;
  const types = params.types || {};
  for (let attempt = 0; attempt < (params.attempts ?? 400); attempt++) {
    const pc = params.pins ? params.pins[0] + rng.int(params.pins[1] - params.pins[0] + 1) : 0;
    const pins = pc ? choosePins(n, pc, rng) : [];
    if (!pins) { genStats.noPins = (genStats.noPins || 0) + 1; continue; }
    const path = randomPath(n, pins, rng);
    if (!path) { genStats.noPath = (genStats.noPath || 0) + 1; continue; }
    // Endpoints never next to the edge-only? Keep the needle off a pin pocket: fine either way.
    const base = { n, pins, start: path[0], end: path[path.length - 1], path };
    const cand = candidates(n, path);
    const items = [];
    if (types.s) for (const c of cand.straight) items.push({ t: 's', c });
    if (types.c) for (const c of cand.corner) items.push({ t: 'c', c });
    if (types.n && params.nums) {
      const k = Math.min(params.nums, Math.max(2, Math.floor(path.length / 8)));
      const used = new Set(items.map((x) => x.c));
      for (let j = 0; j < k; j++) {
        let i = 1 + Math.floor(((j + 0.5) / k) * (path.length - 2)) + rng.int(3) - 1;
        i = Math.max(1, Math.min(path.length - 2, i));
        if (used.has(path[i])) continue;
        used.add(path[i]); items.push({ t: 'n', c: path[i], i });
      }
    }
    const set = { knot: params.knot !== 'never', items: items.slice() };
    if (!unique(puzzleOf(base, set), budget)) { genStats.notU = (genStats.notU || 0) + 1; continue; }
    // Strip in random order (knot is strippable only in 'auto').
    const order = rng.shuffle(set.items.slice());
    const removed = [];
    if (params.knot === 'auto' && rng.next() < (params.dropKnot ?? 0.7)) {
      set.knot = false;
      if (!unique(puzzleOf(base, set), budget)) set.knot = true;
    }
    for (const it of order) {
      const trial = { knot: set.knot, items: set.items.filter((x) => x !== it) };
      if (unique(puzzleOf(base, trial), budget)) { set.items = trial.items; removed.push(it); }
    }
    // Mixed-type levels should actually show each allowed type when it can.
    if (params.want) for (const t of params.want) {
      if (!set.items.some((x) => x.t === t)) { const back = removed.find((x) => x.t === t); if (back) { set.items.push(back); removed.splice(removed.indexOf(back), 1); } }
    }
    if (params.minClues && set.items.length < params.minClues) {
      rng.shuffle(removed);
      while (set.items.length < params.minClues && removed.length) set.items.push(removed.pop());
    }
    // Gentler levels keep a share of the redundant clues.
    const keep = params.keep ?? 0;
    if (keep > 0) { rng.shuffle(removed); const k = Math.round(removed.length * keep); for (let j = 0; j < k; j++) set.items.push(removed[j]); }
    const p = puzzleOf(base, set);
    if (!checkPathRules(p, path)) continue; // paranoia
    if (!unique(p, budget * 4)) continue;
    const g = params.grade === false ? null : grade(buildModel(p));
    return { ...p, sol: path, seed: String(seed), attempt, diff: g };
  }
  return null;
}
