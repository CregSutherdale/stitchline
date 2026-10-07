// Campaign schedule: 120 levels in 12 chapters of 10. Each level = generator params + K candidate
// seeds; the build tool keeps the candidate whose measured difficulty is closest to the target curve.
// Mode params for Daily Stitch and Endless live here too (shared by the game, the worker and tests).

export const CHAPTERS = [
  'Calico', 'Gingham', 'Chambray', 'Flannel', 'Seersucker', 'Corduroy',
  'Tweed', 'Damask', 'Brocade', 'Velvet', 'Tartan', 'Silk',
  'Muslin', 'Chiffon', 'Organza', 'Cashmere',
];
export const LEVEL_COUNT = 180;
// Chapters 1-12 hold 10 levels; chapters 13-16 (round 2) hold 15 levels each (121-180).
export function chapterOf(id) { return id <= 120 ? Math.floor((id - 1) / 10) : 12 + Math.floor((id - 121) / 15); }
export function chapterRange(c) { return c < 12 ? [c * 10 + 1, c * 10 + 10] : [121 + (c - 12) * 15, 135 + (c - 12) * 15]; }

// Tutorial cards keyed by level number. `demo` = which part of the solution the ghost hand traces.
export const TEACH = {
  1: { key: 'drag', title: 'Thread the needle', text: 'Drag from the needle through every hole, then finish on the knot.', demo: 'start' },
  2: { key: 'pins', title: 'Pins', text: 'Pins block their holes. Thread around them.', demo: 'start' },
  4: { key: 'noknot', title: 'No knot', text: 'No knot on this one, so the thread can end on any hole.', demo: 'start' },
  5: { key: 'straight', title: 'Straight stitch', text: 'A white bead: go straight through it, and turn on at least one of the holes on either side.', demo: 'straight' },
  9: { key: 'corner', title: 'Corner stitch', text: 'A dark button: turn on it, and go straight through the holes on both sides.', demo: 'corner' },
  15: { key: 'nums', title: 'Numbered buttons', text: 'Visit numbered buttons in order: 1, then 2, then 3...', demo: 'nums' },
  121: { key: 'eye', title: "Needle's eye", text: "Pass straight through a needle's eye, travelling the way its arrow points.", demo: 'eye' },
  126: { key: 'seam', title: 'Seams', text: 'A stitched seam with a tag: the thread must cross it exactly that many times.', demo: 'seam' },
};
export const TEACH_FIXED = [1, 2, 4, 5, 9, 15, 121, 126];
// Generation slot of each teaching level (slot 131 makes the seam tutorial shown at level 126).
export const TEACH_SLOT = { 121: 121, 126: 131 };

const ALL = { s: 1, c: 1, n: 1 };
const EYE = { s: 1, c: 1, e: 1 };
const EYEN = { s: 1, c: 1, e: 1, n: 1 };
const SEAM = { s: 1, c: 1, e: 1, m: 1 };
const SEAMN = { s: 1, c: 1, e: 1, m: 1, n: 1 };
const SC = { s: 1, c: 1 };

// Target difficulty score for slot i (1-based). Grows fast: by level 40 it is firmly in "needs real
// what-if deductions" territory.
export function targetScore(i) {
  if (i === 121 || i === 131) return 40;
  if (i > 121 && i <= 130) return 190 + (i - 122) * 2;   // 190 .. 206
  if (i > 131) return 206 + (i - 132) * 1.6;             // 206 .. 283 (or the hardest found)
  if (i <= 4) return 0;
  if (i <= 20) return 1 + (i - 4) * 1.6;            // 1 .. 26
  if (i <= 40) return 26 + (i - 20) * 2.6;          // 26 .. 78
  if (i <= 80) return 78 + (i - 40) * 1.3;          // 78 .. 130
  return 130 + (i - 80) * 1.0;                      // 130 .. 170
}

export function levelParams(i) {
  // Round 2 chapters 13-16: needle's eyes from 121, seams from 131. Pool A (122-130) has no seams.
  if (i === 121) return { n: 7, pins: [0, 1], types: { e: 1 }, knot: 'always', keep: 0.4, K: 4, pool: 'teach' };
  if (i === 131) return { n: 7, pins: [0, 1], types: { m: 1, s: 1 }, seams: 4, want: ['m'], knot: 'always', keep: 0.2, K: 4, pool: 'teach' };
  if (i > 121 && i <= 130) return { n: 10, pins: [0, 3], types: i % 3 === 0 ? EYEN : EYE, nums: 6, eyeShare: 0.4, knot: 'auto', dropKnot: 1, K: 20, pool: 'A' };
  if (i > 131) return { n: 10, pins: [0, 3], types: i % 4 === 0 ? SEAMN : SEAM, nums: 6, seams: 4, eyeShare: 0.35, knot: 'auto', dropKnot: 1, K: 22, pool: 'B' };
  // Teaching block
  if (i === 1) return { n: 5, pins: [3, 4], types: {}, knot: 'always', K: 3 };
  if (i === 2) return { n: 5, pins: [4, 5], types: {}, knot: 'always', K: 3 };
  if (i === 3) return { n: 5, pins: [3, 5], types: {}, knot: 'always', K: 3 };
  if (i === 4) return { n: 5, pins: [3, 6], types: {}, knot: 'never', K: 3 };
  if (i === 5) return { n: 5, pins: [0, 1], types: { s: 1 }, knot: 'always', keep: 0.5, K: 3 };
  if (i <= 8) return { n: i === 8 ? 6 : 5, pins: [0, 2], types: { s: 1 }, knot: 'auto', dropKnot: 0.5, keep: 0.3, K: 4 };
  if (i === 9) return { n: 6, pins: [0, 1], types: { c: 1 }, knot: 'always', keep: 0.5, K: 3 };
  if (i <= 14) return { n: 6, pins: [0, 2], types: i <= 11 ? { c: 1 } : SC, want: i > 11 ? ['s', 'c'] : null, knot: 'auto', dropKnot: 0.6, keep: 0.2, K: 5 };
  if (i === 15) return { n: 6, pins: [0, 1], types: { n: 1, s: 1 }, nums: 4, want: ['n'], knot: 'always', keep: 0.3, K: 3 };
  if (i <= 20) return { n: i <= 17 ? 6 : 7, pins: [0, 2], types: ALL, nums: 4, knot: 'auto', dropKnot: 0.7, keep: 0.1, K: 6 };
  if (i <= 30) return { n: 7, pins: [0, 2], types: i % 3 === 0 ? ALL : SC, nums: 4, knot: 'auto', dropKnot: 0.8, K: 10 };
  if (i <= 40) return { n: 8, pins: [0, 2], types: i % 3 === 0 ? ALL : SC, nums: 5, knot: 'auto', dropKnot: 0.9, K: 12 };
  if (i <= 60) return { n: i % 2 ? 8 : 9, pins: [0, 3], types: i % 4 === 0 ? ALL : SC, nums: 5, knot: 'auto', dropKnot: 0.9, K: 12 };
  if (i <= 90) return { n: i % 3 === 0 ? 9 : 10, pins: [0, 3], types: i % 4 === 0 ? ALL : SC, nums: 6, knot: 'auto', dropKnot: 0.95, K: 12 };
  return { n: 10, pins: [0, 3], types: i % 4 === 0 ? ALL : SC, nums: 6, knot: 'auto', dropKnot: 1, K: 16 };
}

export const ENDLESS = {
  medium: { label: 'Medium', params: { n: 7, pins: [0, 2], types: ALL, nums: 4, knot: 'auto', dropKnot: 0.6, keep: 0.15 }, K: 1 },
  hard: { label: 'Hard', params: { n: 8, pins: [0, 2], types: ALL, nums: 5, knot: 'auto', dropKnot: 0.9 }, K: 2 },
  expert: { label: 'Expert', params: { n: 10, pins: [0, 3], types: ALL, nums: 6, knot: 'auto', dropKnot: 1 }, K: 3 },
};

// Daily Stitch. From 2026-10-07 every Daily is a 9x9 in a tight HARD band: keep generating
// (deterministic seeds) until the measured difficulty lands inside DAILY_BAND.
export const DAILY_BAND = [115, 175];
export const DAILY_V2_FROM = '2026-10-07';
export function dailyParams(dateKey) {
  if (dateKey >= DAILY_V2_FROM) return { params: { n: 9, pins: [0, 3], types: ALL, nums: 5, knot: 'auto', dropKnot: 1 }, K: 40, band: DAILY_BAND };
  // v1 rule (kept so a Daily started before the update is the same puzzle)
  let h = 0; for (const ch of dateKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const n = h % 2 ? 9 : 8;
  return { params: { n, pins: [0, 3], types: ALL, nums: 5, knot: 'auto', dropKnot: 0.95 }, K: 3 };
}

// Best-of-K: keep the candidate closest to the target (or the hardest when target is 'max').
export function pickCandidate(cands, target) {
  let best = null, bd = Infinity;
  for (const c of cands) {
    if (!c) continue;
    const d = target === 'max' ? -c.diff.score : Math.abs(c.diff.score - target);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
