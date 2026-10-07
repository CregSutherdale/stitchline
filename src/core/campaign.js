// Campaign schedule: 120 levels in 12 chapters of 10. Each level = generator params + K candidate
// seeds; the build tool keeps the candidate whose measured difficulty is closest to the target curve.
// Mode params for Daily Stitch and Endless live here too (shared by the game, the worker and tests).

export const CHAPTERS = [
  'Calico', 'Gingham', 'Chambray', 'Flannel', 'Seersucker', 'Corduroy',
  'Tweed', 'Damask', 'Brocade', 'Velvet', 'Tartan', 'Silk',
];

// Tutorial cards keyed by level number. `demo` = which part of the solution the ghost hand traces.
export const TEACH = {
  1: { key: 'drag', title: 'Thread the needle', text: 'Drag from the needle through every hole, then finish on the knot.', demo: 'start' },
  2: { key: 'pins', title: 'Pins', text: 'Pins block their holes. Thread around them.', demo: 'start' },
  4: { key: 'noknot', title: 'No knot', text: 'No knot on this one, so the thread can end on any hole.', demo: 'start' },
  5: { key: 'straight', title: 'Straight stitch', text: 'A white bead: go straight through it, and turn on at least one of the holes on either side.', demo: 'straight' },
  9: { key: 'corner', title: 'Corner stitch', text: 'A dark button: turn on it, and go straight through the holes on both sides.', demo: 'corner' },
  15: { key: 'nums', title: 'Numbered buttons', text: 'Visit numbered buttons in order: 1, then 2, then 3...', demo: 'nums' },
};

const ALL = { s: 1, c: 1, n: 1 };
const SC = { s: 1, c: 1 };

// Target difficulty score for slot i (1-based). Grows fast: by level 40 it is firmly in "needs real
// what-if deductions" territory.
export function targetScore(i) {
  if (i <= 4) return 0;
  if (i <= 20) return 1 + (i - 4) * 1.6;            // 1 .. 26
  if (i <= 40) return 26 + (i - 20) * 2.6;          // 26 .. 78
  if (i <= 80) return 78 + (i - 40) * 1.3;          // 78 .. 130
  return 130 + (i - 80) * 1.0;                      // 130 .. 170
}

export function levelParams(i) {
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

export function dailyParams(dateKey) {
  // Alternate 8x8 and 9x9 by day; always the full clue set, usually no knot.
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
