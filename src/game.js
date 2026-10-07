// One puzzle being played: the thread path, undo history, hints and live clue status.
import { checkPathRules, seamCrossings } from './core/logic.js';

export class Session {
  constructor(p, saved) {
    this.p = p;
    this.n = p.n;
    this.pins = new Set(p.pins);
    this.open = p.n * p.n - this.pins.size;
    this.clue = new Map();
    for (const c of p.straight) this.clue.set(c, 's');
    for (const c of p.corner) this.clue.set(c, 'c');
    this.numAt = new Map(p.nums.map((c, i) => [c, i + 1]));
    this.eyes = new Map((p.eyes || []).map((e) => [e.c, e.d]));
    this.seams = p.seams || [];
    this.path = saved && Array.isArray(saved.path) && saved.path[0] === p.start && this.validPrefix(saved.path) ? saved.path.slice() : [p.start];
    this.undoStack = [];
    this.hinted = new Set(Array.isArray(saved?.hinted) ? saved.hinted : []); // indices of revealed segments
    this.hintsUsed = saved?.hintsUsed || 0;
    this.gestureStart = null;
  }
  validPrefix(path) {
    const seen = new Set();
    for (let i = 0; i < path.length; i++) {
      const c = path[i];
      if (!Number.isInteger(c) || c < 0 || c >= this.n * this.n || this.pins.has(c) || seen.has(c)) return false;
      if (i > 0 && !this.adj(path[i - 1], c)) return false;
      seen.add(c);
    }
    return true;
  }
  adj(a, b) { const n = this.n; return Math.abs(((a / n) | 0) - ((b / n) | 0)) + Math.abs((a % n) - (b % n)) === 1; }
  get head() { return this.path[this.path.length - 1]; }
  indexOf(c) { return this.path.indexOf(c); }
  isFree(c) { return c >= 0 && c < this.n * this.n && !this.pins.has(c) && this.path.indexOf(c) < 0; }
  tiedOff() { return this.p.knot >= 0 && this.head === this.p.knot && this.path.length < this.open; }

  // Drag step toward cell c. Returns 'add' | 'back' | null.
  step(c) {
    const L = this.path.length;
    if (c === this.head) return null;
    if (L >= 2 && c === this.path[L - 2]) { this.path.pop(); return 'back'; }
    if (!this.adj(this.head, c) || !this.isFree(c)) return null;
    if (this.head === this.p.knot && L < this.open) return null; // the knot ties the thread off
    this.path.push(c);
    return 'add';
  }
  truncateTo(c) {
    const i = this.path.indexOf(c);
    if (i < 0 || i === this.path.length - 1) return false;
    this.path.length = i + 1;
    return true;
  }
  beginGesture() { this.gestureStart = this.path.slice(); }
  endGesture() {
    if (this.gestureStart && !sameArr(this.gestureStart, this.path)) {
      this.undoStack.push(this.gestureStart);
      if (this.undoStack.length > 300) this.undoStack.shift();
    }
    this.gestureStart = null;
  }
  undo() {
    if (!this.undoStack.length) return false;
    this.path = this.undoStack.pop();
    return true;
  }
  reset() {
    if (this.path.length <= 1) return false;
    this.undoStack.push(this.path.slice());
    this.path = [this.p.start];
    return true;
  }
  // Reveal one more correct segment: keep the correct prefix, add the next solution hole.
  hint() {
    const sol = this.p.sol;
    let k = 0;
    while (k < this.path.length && k < sol.length && this.path[k] === sol[k]) k++;
    if (k >= sol.length) return null;
    this.undoStack.push(this.path.slice());
    this.path = sol.slice(0, k + 1);
    this.hinted.add(k);
    this.hintsUsed++;
    return { from: sol[k - 1], to: sol[k], index: k };
  }
  isHinted(i) { return this.hinted.has(i) && i < this.path.length && this.path[i] === this.p.sol[i] && this.path[i - 1] === this.p.sol[i - 1]; }
  get full() { return this.path.length === this.open; }
  get won() { return this.full && checkPathRules(this.p, this.path); }

  // Clue status for display: Map cell -> 'ok' | 'bad' (pending clues are absent).
  status() {
    const out = new Map();
    const P = this.path, L = P.length, n = this.n, full = this.full;
    const pos = new Map(P.map((c, i) => [c, i]));
    const straightAt = (i) => P[i] - P[i - 1] === P[i + 1] - P[i];
    // known(i): hole i has both neighbours on the thread (or is a finished end)
    const shapeKnown = (i) => i > 0 && i < L - 1;
    const isEnd = (i) => i === 0 || (full && i === L - 1);
    const turnState = (i) => { // true / false / null(unknown)
      if (isEnd(i)) return false;
      if (!shapeKnown(i)) return null;
      return !straightAt(i);
    };
    for (const [c, t] of this.clue) {
      const i = pos.get(c);
      if (i === undefined) continue;
      if (i === 0 || (full && i === L - 1)) { out.set(c, 'bad'); continue; }
      if (!shapeKnown(i)) continue;
      if (t === 's') {
        if (!straightAt(i)) { out.set(c, 'bad'); continue; }
        const a = turnState(i - 1), b = turnState(i + 1);
        if (a === true || b === true) out.set(c, 'ok');
        else if (a === false && b === false) out.set(c, 'bad');
      } else {
        if (straightAt(i)) { out.set(c, 'bad'); continue; }
        const a = turnState(i - 1), b = turnState(i + 1);
        if (a === true || b === true) out.set(c, 'bad');
        else if (a === false && b === false && !isEnd(i - 1) && !isEnd(i + 1)) out.set(c, 'ok');
        else if (isEnd(i - 1) || isEnd(i + 1)) out.set(c, 'bad');
      }
    }
    const D = [-n, 1, n, -1];
    for (const [c, d] of this.eyes) {
      const i = pos.get(c);
      if (i === undefined) continue;
      if (i === 0 || (full && i === L - 1)) { out.set(c, 'bad'); continue; }
      if (P[i] - P[i - 1] !== D[d]) { out.set(c, 'bad'); continue; }
      if (i < L - 1) out.set(c, P[i + 1] - P[i] === D[d] ? 'ok' : 'bad');
    }
    let expect = 1;
    for (let i = 0; i < L; i++) {
      const k = this.numAt.get(P[i]);
      if (!k) continue;
      out.set(P[i], k === expect ? 'ok' : 'bad');
      expect = k + 1;
    }
    if (this.p.knot >= 0) {
      const i = pos.get(this.p.knot);
      if (i !== undefined) out.set(this.p.knot, i === this.open - 1 ? 'ok' : 'bad');
      if (full && P[L - 1] !== this.p.knot) out.set(this.p.knot, 'bad');
    }
    for (const [k, v] of out) if (v === null) out.delete(k);
    return out;
  }
  // Per seam: 'ok' (count reached), 'bad' (over, or finished with the wrong count) or null.
  seamStatus() {
    const full = this.full;
    return this.seams.map((sm) => {
      const k = seamCrossings(this.n, sm, this.path);
      if (k > sm.n || (full && k !== sm.n)) return 'bad';
      return k === sm.n ? 'ok' : null;
    });
  }
}

function sameArr(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
