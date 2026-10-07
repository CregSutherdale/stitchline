// STITCHLINE logic engine (edge-based constraint propagation + search + difficulty grader).
//
// The thread is a Hamiltonian path from the needle S. We model it as a Hamiltonian CYCLE through
// every open hole plus one virtual node V: V-S is forced on, and V's second edge goes to the end
// hole (to the knot only, when a knot is shown). Then every node has degree exactly 2.
//
// Clue rules (all clues sit on interior holes of the solution, never on an end):
//   straight (white bead): passes straight through, and turns at >=1 of its two neighbours
//            (a neighbour that is a thread end does not count as a turn).
//   corner   (dark button): turns here, and goes straight through both neighbours.
//   numbers: numbered holes are visited in order 1,2,3...
//
// Puzzle object: { n, pins:[cell], start, knot (-1 = none), straight:[cell], corner:[cell], nums:[cell in order] }

export const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1]; // 0 up, 1 right, 2 down, 3 left

export function buildModel(p) {
  const n = p.n, NC = n * n, V = NC, NN = NC + 1;
  const pin = new Uint8Array(NC);
  for (const c of p.pins || []) pin[c] = 1;
  const ea = [], eb = [], virt = [];
  const dirEdge = new Int32Array(NC * 4).fill(-1);
  const vEdge = new Int32Array(NC).fill(-1);
  const nodeEdges = Array.from({ length: NN }, () => []);
  const add = (a, b, isV) => { const id = ea.length; ea.push(a); eb.push(b); virt.push(isV ? 1 : 0); nodeEdges[a].push(id); nodeEdges[b].push(id); return id; };
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const i = r * n + c; if (pin[i]) continue;
    if (c + 1 < n && !pin[i + 1]) { const e = add(i, i + 1, 0); dirEdge[i * 4 + 1] = e; dirEdge[(i + 1) * 4 + 3] = e; }
    if (r + 1 < n && !pin[i + n]) { const e = add(i, i + n, 0); dirEdge[i * 4 + 2] = e; dirEdge[(i + n) * 4 + 0] = e; }
  }
  const start = p.start ?? -1, knot = p.knot ?? -1;
  let open = 0; for (let i = 0; i < NC; i++) if (!pin[i]) open++;
  const forced = [];
  if (start >= 0) { const e = add(V, start, 1); vEdge[start] = e; forced.push(e); }
  if (knot >= 0) { const e = add(V, knot, 1); vEdge[knot] = e; forced.push(e); }
  else for (let i = 0; i < NC; i++) if (!pin[i] && i !== start) vEdge[i] = add(V, i, 1);
  const clue = new Uint8Array(NC); // 1 straight, 2 corner
  for (const c of p.straight || []) clue[c] = 1;
  for (const c of p.corner || []) clue[c] = 2;
  const num = new Int32Array(NC);
  (p.nums || []).forEach((c, k) => { num[c] = k + 1; });
  const clueCells = [];
  for (let i = 0; i < NC; i++) if (clue[i]) clueCells.push(i);
  const nb = (c, d) => { const r = (c / n) | 0, cc = c % n, rr = r + DR[d], c2 = cc + DC[d]; return (rr < 0 || rr >= n || c2 < 0 || c2 >= n) ? -1 : rr * n + c2; };
  const m0 = { n, dirEdge, vEdge, clue, nb };
  const blank = new Int8Array(ea.length).fill(-1);
  for (const e of forced) blank[e] = 1;
  // Static per-clue combos, flattened as (edge<<1 | value); validity is checked against the live state.
  const clueCombosStatic = clueCells.map((c) => clueCombos(m0, blank, c, []).map((cb) => {
    const mp = new Map();
    for (let i = 0; i < cb.length; i += 2) mp.set(cb[i], cb[i + 1]); // dedupe (shared edge clue<->neighbour)
    return Int32Array.from([...mp].map(([e, v]) => (e << 1) | v));
  }));
  return {
    clueCombosStatic, cntOn: new Int32Array(ea.length), cntOff: new Int32Array(ea.length),
    p, n, NC, V, NN, pin, open, E: ea.length, ea: Int32Array.from(ea), eb: Int32Array.from(eb), virt: Uint8Array.from(virt),
    dirEdge, vEdge, nodeEdges: nodeEdges.map((a) => Int32Array.from(a)), start, knot, forced, clue, clueCells, num,
    numCount: (p.nums || []).length, nb,
  };
}

export function initState(m) {
  const s = new Int8Array(m.E).fill(-1);
  for (const e of m.forced) s[e] = 1;
  return s;
}

// ---------- propagation ----------
// Returns false on contradiction. Mutates s.
const scratch = { parent: null, size: null, cnt: null, stack: null, seen: null };
function uf(m) {
  if (!scratch.parent || scratch.parent.length < m.NN) {
    scratch.parent = new Int32Array(m.NN * 2); scratch.size = new Int32Array(m.NN * 2);
    scratch.stack = new Int32Array(m.NN * 2); scratch.seen = new Uint8Array(m.NN * 2);
  }
  return scratch;
}
function find(par, x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }

// Per-clue local enumeration: each combo = list of [edge, value]; edges set to whatever all valid combos agree on.
function clueCombos(m, s, c, out) {
  out.length = 0;
  const t = m.clue[c], de = m.dirEdge, ve = m.vEdge;
  if (t === 1) {
    for (let o = 0; o < 2; o++) {
      const d1 = o, d2 = o + 2;
      const e1 = de[c * 4 + d1], e2 = de[c * 4 + d2];
      if (e1 < 0 || e2 < 0 || s[e1] === 0 || s[e2] === 0) continue;
      const base = [];
      for (let d = 0; d < 4; d++) { const e = de[c * 4 + d]; if (e >= 0) base.push(e, (d === d1 || d === d2) ? 1 : 0); }
      if (ve[c] >= 0) base.push(ve[c], 0);
      if (!comboOk(s, base)) continue;
      const A = m.nb(c, d1), B = m.nb(c, d2);
      const optA = neighOpts(m, s, A, e1, d1), optB = neighOpts(m, s, B, e2, d2);
      for (const a of optA) for (const b of optB) {
        if (!a.turn && !b.turn) continue;
        out.push(base.concat(a.as, b.as));
      }
    }
  } else if (t === 2) {
    for (let d1 = 0; d1 < 4; d1++) {
      const d2 = (d1 + 1) & 3;
      const e1 = de[c * 4 + d1], e2 = de[c * 4 + d2];
      if (e1 < 0 || e2 < 0 || s[e1] === 0 || s[e2] === 0) continue;
      const base = [];
      for (let d = 0; d < 4; d++) { const e = de[c * 4 + d]; if (e >= 0) base.push(e, (d === d1 || d === d2) ? 1 : 0); }
      if (ve[c] >= 0) base.push(ve[c], 0);
      if (!comboOk(s, base)) continue;
      const A = m.nb(c, d1), B = m.nb(c, d2);
      const sa = straightThrough(m, s, A, d1), sb = straightThrough(m, s, B, d2);
      if (!sa || !sb) continue;
      out.push(base.concat(sa, sb));
    }
  }
  return out;
}
function comboOk(s, as) {
  for (let i = 0; i < as.length; i += 2) { const v = s[as[i]]; if (v !== -1 && v !== as[i + 1]) return false; }
  return true;
}
// Options for neighbour X entered from direction d (edge back toward the clue is eBack): its other edge.
function neighOpts(m, s, X, eBack, d) {
  const res = [];
  const de = m.dirEdge, ve = m.vEdge;
  const back = (d + 2) & 3;
  const edges = [];
  for (let k = 0; k < 4; k++) { const e = de[X * 4 + k]; if (e >= 0) edges.push([e, k]); }
  if (ve[X] >= 0) edges.push([ve[X], -1]);
  for (const [x, k] of edges) {
    if (x === eBack) continue;
    const as = [];
    for (const [e] of edges) as.push(e, (e === x || e === eBack) ? 1 : 0);
    if (!comboOk(s, as)) continue;
    // X continues in direction k; it "turns" if k is a real direction perpendicular to d.
    const turn = k >= 0 && k !== d && k !== back;
    res.push({ as, turn });
  }
  return res;
}
function straightThrough(m, s, X, d) {
  const de = m.dirEdge, ve = m.vEdge;
  const back = (d + 2) & 3;
  const eb = de[X * 4 + back], ef = de[X * 4 + d];
  if (eb < 0 || ef < 0) return null;
  const as = [];
  for (let k = 0; k < 4; k++) { const e = de[X * 4 + k]; if (e >= 0) as.push(e, (k === d || k === back) ? 1 : 0); }
  if (ve[X] >= 0) as.push(ve[X], 0);
  return comboOk(s, as) ? as : null;
}

export function propagate(m, s, stats) {
  const { NN, nodeEdges, ea, eb, E, clueCells } = m;
  let changed = true, guard = 0;
  const st = uf(m);
  while (changed) {
    changed = false;
    if (++guard > 10000) return false;
    // 1. degree
    for (let v = 0; v < NN; v++) {
      const es = nodeEdges[v];
      if (v < m.NC && m.pin[v]) continue;
      let on = 0, unk = 0;
      for (let i = 0; i < es.length; i++) { const x = s[es[i]]; if (x === 1) on++; else if (x === -1) unk++; }
      if (on > 2 || on + unk < 2) return false;
      if (unk > 0 && (on === 2 || on + unk === 2)) {
        const val = on === 2 ? 0 : 1;
        for (let i = 0; i < es.length; i++) if (s[es[i]] === -1) s[es[i]] = val;
        changed = true;
      }
    }
    if (changed) continue;
    // 2. clues (precomputed local combos; set every edge all valid combos agree on)
    {
      const CC = m.clueCombosStatic, on = m.cntOn, off = m.cntOff;
      for (let k = 0; k < CC.length && !changed; k++) {
        const combos = CC[k];
        let M = 0;
        for (let j = 0; j < combos.length; j++) {
          const cb = combos[j]; let ok = true;
          for (let i = 0; i < cb.length; i++) { const x = s[cb[i] >> 1]; if (x !== -1 && x !== (cb[i] & 1)) { ok = false; break; } }
          if (!ok) continue;
          M++;
          for (let i = 0; i < cb.length; i++) { const e = cb[i] >> 1; if (s[e] === -1) { if (cb[i] & 1) on[e]++; else off[e]++; } }
        }
        if (M === 0) return false;
        for (let j = 0; j < combos.length; j++) {
          const cb = combos[j];
          for (let i = 0; i < cb.length; i++) {
            const e = cb[i] >> 1;
            if (s[e] === -1 && (on[e] === M || off[e] === M)) { s[e] = on[e] === M ? 1 : 0; changed = true; }
          }
        }
        for (let j = 0; j < combos.length; j++) { const cb = combos[j]; for (let i = 0; i < cb.length; i++) { const e = cb[i] >> 1; on[e] = 0; off[e] = 0; } }
      }
    }
    if (changed) continue;
    // 3. cycles: union on-edges; premature cycle = contradiction; closing edges -> off
    const par = st.parent, sz = st.size;
    for (let v = 0; v < NN; v++) { par[v] = v; sz[v] = 1; }
    let onCount = 0, total = m.open + 1;
    for (let e = 0; e < E; e++) if (s[e] === 1) {
      onCount++;
      const a = find(par, ea[e]), b = find(par, eb[e]);
      if (a === b) { if (onCount !== total) return false; }
      else { if (sz[a] < sz[b]) { par[a] = b; sz[b] += sz[a]; } else { par[b] = a; sz[a] += sz[b]; } }
    }
    if (onCount < total) {
      for (let e = 0; e < E; e++) if (s[e] === -1) {
        const a = find(par, ea[e]), b = find(par, eb[e]);
        if (a === b) { s[e] = 0; changed = true; }
      }
    }
    if (changed) continue;
    // 4. connectivity over non-off edges
    {
      const seen = st.seen, stack = st.stack;
      seen.fill(0, 0, NN);
      let sp = 0, cnt = 1; stack[sp++] = m.V; seen[m.V] = 1;
      while (sp) {
        const v = stack[--sp]; const es = nodeEdges[v];
        for (let i = 0; i < es.length; i++) {
          const e = es[i]; if (s[e] === 0) continue;
          const w = ea[e] === v ? eb[e] : ea[e];
          if (!seen[w]) { seen[w] = 1; cnt++; stack[sp++] = w; }
        }
      }
      if (cnt !== total) return false;
    }
    // 5. numbers (chain order)
    if (m.numCount > 0 && !checkNumbers(m, s)) return false;
  }
  if (stats) stats.props++;
  return true;
}

// Walk the chains of real on-edges and check numbered holes appear as consecutive, monotone runs.
function checkNumbers(m, s) {
  const { NC, pin, dirEdge, vEdge, num, ea, eb } = m;
  const st = uf(m); const seen = st.seen; seen.fill(0, 0, NC);
  const realDeg = (c) => { let d = 0; for (let k = 0; k < 4; k++) { const e = dirEdge[c * 4 + k]; if (e >= 0 && s[e] === 1) d++; } return d; };
  for (let c0 = 0; c0 < NC; c0++) {
    if (pin[c0] || seen[c0] || realDeg(c0) > 1) continue;
    // c0 is a chain end (or isolated); walk
    const chain = [];
    let prev = -1, cur = c0;
    while (cur >= 0) {
      seen[cur] = 1; chain.push(cur);
      let nx = -1;
      for (let k = 0; k < 4; k++) { const e = dirEdge[cur * 4 + k]; if (e >= 0 && s[e] === 1) { const w = ea[e] === cur ? eb[e] : ea[e]; if (w !== prev) { nx = w; break; } } }
      prev = cur; cur = nx;
    }
    const ns = []; for (const c of chain) if (num[c]) ns.push(num[c]);
    if (ns.length === 0) continue;
    const headIsS = chain[0] === m.start, tailIsS = chain[chain.length - 1] === m.start;
    const isEnd = (c) => c !== m.start && vEdge[c] >= 0 && s[vEdge[c]] === 1;
    let inc = ns.length > 1 ? ns[1] > ns[0] : null;
    if (ns.length > 1) for (let i = 1; i < ns.length; i++) if (ns[i] !== ns[i - 1] + (inc ? 1 : -1)) return false;
    if (headIsS || tailIsS) {
      const seq = headIsS ? ns : ns.slice().reverse();
      if (seq[0] !== 1) return false;
      for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1] + 1) return false;
    }
    const hEnd = isEnd(chain[0]), tEnd = isEnd(chain[chain.length - 1]);
    if ((hEnd || tEnd) && chain.length > 0) {
      const seq = tEnd ? ns : ns.slice().reverse(); // ordered toward the end cell
      if (seq[seq.length - 1] !== m.numCount) return false;
      for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1] + 1) return false;
    }
  }
  // a fully closed chain without ends would be a cycle; caught elsewhere
  return true;
}

export function isSolved(m, s) {
  let on = 0;
  for (let e = 0; e < m.E; e++) { if (s[e] === -1) return false; if (s[e] === 1) on++; }
  return on === m.open + 1;
}

export function pathFromState(m, s) {
  const path = [];
  let prev = -1, cur = m.start;
  if (cur < 0) { // free start: find an end
    for (let c = 0; c < m.NC; c++) if (m.vEdge[c] >= 0 && s[m.vEdge[c]] === 1) { cur = c; break; }
  }
  while (cur >= 0 && path.length <= m.NC) {
    path.push(cur);
    let nx = -1;
    for (let k = 0; k < 4; k++) { const e = m.dirEdge[cur * 4 + k]; if (e >= 0 && s[e] === 1) { const w = m.ea[e] === cur ? m.eb[e] : m.ea[e]; if (w !== prev) { nx = w; break; } } }
    prev = cur; cur = nx;
  }
  return path;
}

// Pick a branching edge: an unknown edge at a node that already has one on-edge, fewest unknowns.
function pickEdge(m, s, rng) {
  let best = -1, bestScore = 1e9;
  for (let v = 0; v < m.NC; v++) {
    if (m.pin[v]) continue;
    const es = m.nodeEdges[v];
    let on = 0, unk = 0, first = -1;
    for (let i = 0; i < es.length; i++) { const x = s[es[i]]; if (x === 1) on++; else if (x === -1) { unk++; if (first < 0 || (rng && rng.next() < 0.5)) first = es[i]; } }
    if (unk === 0) continue;
    const score = (on === 1 ? 0 : 10) + unk + (m.clue[v] ? -0.5 : 0);
    if (score < bestScore) { bestScore = score; best = first; }
  }
  if (best < 0) for (let e = 0; e < m.E; e++) if (s[e] === -1) return e;
  return best;
}

// Count solutions up to `limit`. Returns { count, sols:[path], nodes, aborted }.
export function solve(m, opts = {}) {
  const limit = opts.limit ?? 2, nodeLimit = opts.nodeLimit ?? 2e6, rng = opts.rng || null;
  const res = { count: 0, sols: [], nodes: 0, aborted: false };
  const s0 = opts.state ? opts.state.slice() : initState(m);
  const rec = (s) => {
    if (res.count >= limit || res.aborted) return;
    if (++res.nodes > nodeLimit) { res.aborted = true; return; }
    if (!propagate(m, s)) return;
    if (isSolved(m, s)) {
      // numbers final check on the whole path
      const path = pathFromState(m, s);
      if (path.length !== m.open) return;
      if (!checkPathRules(m.p, path)) return;
      res.count++; res.sols.push(path); return;
    }
    const e = pickEdge(m, s, rng);
    const first = rng ? (rng.next() < 0.5 ? 1 : 0) : 1;
    for (const v of [first, 1 - first]) {
      const t = s.slice(); t[e] = v; rec(t);
      if (res.count >= limit || res.aborted) return;
    }
  };
  rec(s0);
  return res;
}

// Direct rule check of a complete path against a puzzle (used by solver, game and tests).
export function checkPathRules(p, path) {
  const n = p.n;
  const pins = new Set(p.pins || []);
  let open = n * n - pins.size;
  if (path.length !== open) return false;
  if (p.start >= 0 && path[0] !== p.start) return false;
  if (p.knot >= 0 && path[path.length - 1] !== p.knot) return false;
  const pos = new Map(); path.forEach((c, i) => pos.set(c, i));
  if (pos.size !== path.length) return false;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (pins.has(b)) return false;
    const dr = Math.abs(((a / n) | 0) - ((b / n) | 0)), dc = Math.abs((a % n) - (b % n));
    if (dr + dc !== 1) return false;
  }
  const turnAt = (i) => (i <= 0 || i >= path.length - 1) ? false : !isStraightAt(path, i, n);
  for (const c of p.straight || []) {
    const i = pos.get(c); if (i === undefined || i === 0 || i === path.length - 1) return false;
    if (!isStraightAt(path, i, n)) return false;
    if (!turnAt(i - 1) && !turnAt(i + 1)) return false;
  }
  for (const c of p.corner || []) {
    const i = pos.get(c); if (i === undefined || i === 0 || i === path.length - 1) return false;
    if (isStraightAt(path, i, n)) return false;
    if (i - 1 <= 0 || i + 1 >= path.length - 1) return false;
    if (!isStraightAt(path, i - 1, n) || !isStraightAt(path, i + 1, n)) return false;
  }
  let last = -1;
  for (const c of p.nums || []) { const i = pos.get(c); if (i === undefined || i <= last) return false; last = i; }
  return true;
}
export function isStraightAt(path, i, n) {
  const a = path[i - 1], b = path[i], c = path[i + 1];
  return (b - a) === (c - b);
}

// ---------- difficulty grader ----------
// Simulates a strong human: local propagation; when stuck, single-edge "what if" probes (one level of
// contradiction search). Each probing round is one deduction step. If probes can't progress, fall back
// to search and measure its size.
export function grade(m, opts = {}) {
  const s = initState(m);
  const g = { props: 0, rounds: 0, probes: 0, found: 0, hidden: 0, searchNodes: 0, level: 0, score: 0 };
  if (!propagate(m, s)) return { ...g, error: 'contradiction' };
  const maxRounds = opts.maxRounds ?? 400;
  while (!isSolved(m, s) && g.rounds < maxRounds) {
    const unk = [];
    for (let e = 0; e < m.E; e++) if (s[e] === -1) unk.push(e);
    let found = 0;
    for (const e of unk) {
      if (s[e] !== -1) continue;
      for (const v of [1, 0]) {
        const t = s.slice(); t[e] = v; g.probes++;
        if (!propagate(m, t)) { s[e] = 1 - v; found++; break; }
      }
      if (found >= 3) break; // a human acts on the first few findings, then re-propagates
    }
    if (!found) {
      g.level = 2;
      const r = solve(m, { state: s, limit: 2, nodeLimit: opts.nodeLimit ?? 300000 });
      g.searchNodes = r.nodes;
      break;
    }
    g.rounds++; g.level = Math.max(g.level, 1);
    g.hidden += Math.log2(1 + unk.length / found);
    if (!propagate(m, s)) return { ...g, error: 'contradiction2' };
  }
  // Score: deduction steps weighted by how hidden each was, plus a heavy term if search was needed.
  g.score = Math.round(10 * (g.hidden + (g.level === 2 ? 25 + 6 * Math.log2(1 + g.searchNodes) : 0) + 0.02 * m.open)) / 10;
  return g;
}
