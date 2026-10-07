// Independent verifier: plain cell-by-cell depth-first search over thread paths from the needle.
// Shares NO code with logic.js (different model, different pruning) so the uniqueness gate is honest.
// Counts solutions up to `limit`.

export function dfsCount(p, limit = 2, nodeLimit = 5e7) {
  const n = p.n, N = n * n;
  const pin = new Uint8Array(N); for (const c of p.pins || []) pin[c] = 1;
  const clue = new Uint8Array(N); for (const c of p.straight || []) clue[c] = 1; for (const c of p.corner || []) clue[c] = 2;
  const numAt = new Int32Array(N); (p.nums || []).forEach((c, i) => { numAt[c] = i + 1; });
  const numTotal = (p.nums || []).length;
  // needle's eyes: required step delta through the hole; seams: crossing edges -> seam ids
  const eyeD = new Int32Array(N);
  const DEL = [-n, 1, n, -1];
  for (const e of p.eyes || []) eyeD[e.c] = DEL[e.d];
  const seamList = (p.seams || []).map((sm) => ({ need: sm.n, got: 0 }));
  const seamOf = new Map(); // "a,b" (a<b) -> [seam idx]
  (p.seams || []).forEach((sm, si) => {
    for (let t = sm.a; t <= sm.b; t++) {
      const a = sm.o === 'h' ? sm.k * n + t : t * n + sm.k, b = sm.o === 'h' ? a + n : a + 1;
      const key = a * N + b; if (!seamOf.has(key)) seamOf.set(key, []); seamOf.get(key).push(si);
    }
  });
  const crossSeams = (u, v) => seamOf.get(Math.min(u, v) * N + Math.max(u, v));
  // Edge u-v still usable by the rest of the thread: no saturated seam on it, and it respects the
  // axis of any needle's eye at either end.
  const eyeAxisOk = (e, x) => { const D = eyeD[e]; return x === e + D || x === e - D; };
  const pass = (u, v) => {
    if (eyeD[u] && !eyeAxisOk(u, v)) return false;
    if (eyeD[v] && !eyeAxisOk(v, u)) return false;
    if (seamOf.size) { const cs = crossSeams(u, v); if (cs) for (const si of cs) if (seamList[si].got >= seamList[si].need) return false; }
    return true;
  };
  const seamEdges = (p.seams || []).map((sm) => { const out = []; for (let t = sm.a; t <= sm.b; t++) { const a = sm.o === 'h' ? sm.k * n + t : t * n + sm.k; const b = sm.o === 'h' ? a + n : a + 1; if (!pin[a] && !pin[b]) out.push([a, b]); } return out; });
  let open = 0; for (let c = 0; c < N; c++) if (!pin[c]) open++;
  const nbr = [];
  for (let c = 0; c < N; c++) {
    const r = Math.floor(c / n), k = c % n, a = [];
    if (!pin[c]) { if (r > 0 && !pin[c - n]) a.push(c - n); if (k < n - 1 && !pin[c + 1]) a.push(c + 1); if (r < n - 1 && !pin[c + n]) a.push(c + n); if (k > 0 && !pin[c - 1]) a.push(c - 1); }
    nbr.push(a);
  }
  const color = (c) => (Math.floor(c / n) + (c % n)) & 1;
  const knot = p.knot ?? -1;
  const vis = new Uint8Array(N);
  const path = new Int32Array(N);
  const inDir = new Int32Array(N).fill(0); // step delta into cell
  const outDir = new Int32Array(N).fill(0);
  let len = 0, nodes = 0, count = 0, aborted = false;
  const sols = [];
  const remColor = [0, 0];
  for (let c = 0; c < N; c++) if (!pin[c]) remColor[color(c)]++;
  const stack = new Int32Array(N), seen = new Int32Array(N); let stamp = 0;

  const turns = (c) => outDir[c] !== 0 && inDir[c] !== 0 && outDir[c] !== inDir[c];
  const straight = (c) => outDir[c] !== 0 && inDir[c] !== 0 && outDir[c] === inDir[c];

  // Validate clues whose status became fully known when cell x got its out-direction.
  function checkLeave(x) {
    const ix = len - 2; // x = path[ix]; its successor path[ix+1] was just pushed
    if (eyeD[x] && (inDir[x] !== eyeD[x] || outDir[x] !== eyeD[x])) return false;
    if (clue[x] === 1 && !straight(x)) return false;
    if (clue[x] === 2 && !turns(x)) return false;
    if (clue[x] === 2) { const pv = ix > 0 ? path[ix - 1] : -1; if (pv < 0 || !straight(pv)) return false; }
    if (ix > 0) {
      const pv = path[ix - 1];
      if (clue[pv] === 2 && !straight(x)) return false;
      if (clue[pv] === 1) { const pp = ix > 1 ? path[ix - 2] : -1; const tp = pp >= 0 && turns(pp); if (!tp && !turns(x)) return false; }
    }
    return true;
  }
  function checkEnd() {
    const e = path[len - 1];
    if (clue[e] || eyeD[e]) return false;
    for (const sm of seamList) if (sm.got !== sm.need) return false;
    if (knot >= 0 && e !== knot) return false;
    if (len >= 2) {
      const pv = path[len - 2];
      if (clue[pv] === 2) return false; // needs straight through the end hole
      if (clue[pv] === 1) { const pp = len >= 3 ? path[len - 3] : -1; if (!(pp >= 0 && turns(pp))) return false; }
    }
    return true;
  }
  // Prune: remaining holes reachable, dead ends, parity.
  function feasible(h) {
    const rem = open - len;
    if (rem === 0) return true;
    // forced dead ends
    let ones = 0;
    for (let c = 0; c < N; c++) {
      if (pin[c] || vis[c]) continue;
      let d = 0;
      for (const x of nbr[c]) if ((!vis[x] || x === h) && pass(c, x)) d++;
      if (d === 0) return false;
      if (d === 1) { ones++; if (knot >= 0 && c !== knot) return false; if (ones > 1) return false; }
    }
    // connectivity of unvisited holes from the head
    stamp++; let sp = 0, reached = 0;
    for (const x of nbr[h]) if (!vis[x] && seen[x] !== stamp && pass(h, x)) { seen[x] = stamp; stack[sp++] = x; }
    while (sp) { const c = stack[--sp]; reached++; for (const x of nbr[c]) if (!vis[x] && seen[x] !== stamp && pass(c, x)) { seen[x] = stamp; stack[sp++] = x; } }
    if (reached !== rem) return false;
    // seams still short of crossings need enough crossable edges left
    for (let si = 0; si < seamList.length; si++) {
      const want = seamList[si].need - seamList[si].got; if (want <= 0) continue;
      let can = 0;
      for (const [a, b] of seamEdges[si]) if ((!vis[a] || a === h) && (!vis[b] || b === h) && !(vis[a] && vis[b])) can++;
      if (can < want) return false;
    }
    // clue forward-check: every unvisited clue hole must still have a legal shape
    for (let i = 0; i < eyeList.length; i++) {
      const c = eyeList[i]; if (vis[c]) continue;
      const D = eyeD[c], a = step(c, -D), b = step(c, D);
      if (a < 0 || b < 0 || !usable(a, h) || (vis[b])) return false;
      if (a !== h && vis[a]) return false;
    }
    for (let i = 0; i < clueList.length; i++) {
      const c = clueList[i];
      if (vis[c]) continue;
      if (!clueShapeOk(c, h)) return false;
    }
    // parity: the remaining run alternates colours starting with the opposite of the head
    const opp = remColor[1 - color(h)], same = remColor[color(h)];
    if (rem % 2 === 0 ? opp !== same : opp !== same + 1) return false;
    return true;
  }

  const clueList = []; for (let c = 0; c < N; c++) if (clue[c]) clueList.push(c);
  const eyeList = []; for (let c = 0; c < N; c++) if (eyeD[c]) eyeList.push(c);
  const D = [-n, 1, n, -1];
  const step = (c, d) => { const r = Math.floor(c / n), k = c % n; if (d === -n && r === 0) return -1; if (d === n && r === n - 1) return -1; if (d === 1 && k === n - 1) return -1; if (d === -1 && k === 0) return -1; const x = c + d; return pin[x] ? -1 : x; };
  // x usable as the neighbour of unvisited clue hole c along direction d (thread passes c -> x or x -> c)
  const usable = (x, h) => x >= 0 && (!vis[x] || x === h);
  // an arm of a corner: c+d and c+2d must be passable straight
  function armOk(c, d, h) {
    const a = step(c, d); if (a < 0 || !usable(a, h)) return false;
    const b = step(a, d); if (b < 0) return false;
    if (a === h) return len >= 2 && path[len - 2] === b; // thread arrives along the arm
    return !vis[b] || b === h;
  }
  function clueShapeOk(c, h) {
    if (clue[c] === 1) {
      for (let o = 0; o < 2; o++) { const a = step(c, D[o]), b = step(c, D[o + 2]); if (usable(a, h) && usable(b, h) && !(a === h && b === h)) return true; }
      return false;
    }
    for (let o = 0; o < 4; o++) { const d1 = D[o], d2 = D[(o + 1) & 3]; if (armOk(c, d1, h) && armOk(c, d2, h)) return true; }
    return false;
  }
  function rec() {
    if (count >= limit || aborted) return;
    if (++nodes > nodeLimit) { aborted = true; return; }
    const h = path[len - 1];
    if (len === open) {
      if (!checkEnd()) return;
      count++; if (sols.length < limit) sols.push(Array.from(path.subarray(0, len)));
      return;
    }
    if (!feasible(h)) return;
    const nextNum = numsSeen + 1;
    for (const x of nbr[h]) {
      if (vis[x]) continue;
      if (knot === x && len + 1 !== open) continue;
      if (numAt[x] && numAt[x] !== nextNum) continue;
      const d = x - h;
      if (eyeD[x] && d !== eyeD[x]) continue;
      if (eyeD[h] && d !== eyeD[h]) continue;
      const cs = seamOf.size ? crossSeams(h, x) : null;
      if (cs) { let over = false; for (const si of cs) if (seamList[si].got >= seamList[si].need) over = true; if (over) continue; }
      if (clue[h] === 1 && inDir[h] !== 0 && d !== inDir[h]) continue;
      if (clue[h] === 2 && (inDir[h] === 0 || d === inDir[h])) continue;
      outDir[h] = d; inDir[x] = d; vis[x] = 1; path[len++] = x; remColor[color(x)]--;
      if (numAt[x]) numsSeen++;
      if (cs) for (const si of cs) seamList[si].got++;
      if (checkLeave(h)) rec();
      if (cs) for (const si of cs) seamList[si].got--;
      if (numAt[x]) numsSeen--;
      len--; vis[x] = 0; inDir[x] = 0; outDir[h] = 0; remColor[color(x)]++;
      if (count >= limit || aborted) return;
    }
  }
  let numsSeen = 0;
  const s = p.start;
  if (pin[s]) return { count: 0, sols, nodes, aborted };
  if (numAt[s]) { if (numAt[s] !== 1) return { count: 0, sols, nodes, aborted }; numsSeen = 1; }
  vis[s] = 1; path[len++] = s; remColor[color(s)]--;
  if (clue[s] || eyeD[s]) return { count: 0, sols, nodes, aborted }; // a clue can never sit on the needle hole
  rec();
  return { count, sols, nodes, aborted, numTotal };
}
