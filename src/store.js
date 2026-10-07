// Save data in localStorage. Every access is wrapped: private mode / blocked storage must never break play.
const KEY = 'stitchline.v1';

const fresh = () => ({
  v: 1,
  levels: {},            // id -> { stars, best (ms), hints }
  hints: 3,
  daily: { last: '', streak: 0, bestStreak: 0, solved: {} },  // solved: dateKey -> ms
  endless: { medium: { solved: 0, best: 0 }, hard: { solved: 0, best: 0 }, expert: { solved: 0, best: 0 } },
  quilt: [],             // { k, id, n, pins, path, t, ts }
  settings: { sound: true, music: true, haptics: true, timer: true, assist: true },
  current: null,         // in-progress puzzle { mode, id, path, elapsed, hintCells }
  seen: {},              // tutorial keys shown
});

let data = fresh();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.v === 1) {
        const f = fresh();
        data = { ...f, ...d, settings: { ...f.settings, ...(d.settings || {}) }, daily: { ...f.daily, ...(d.daily || {}) }, endless: { ...f.endless, ...(d.endless || {}) } };
      }
    }
  } catch (e) { data = fresh(); }
  return data;
}

let timer = 0;
export function save(now = false) {
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage blocked or full */ } };
  clearTimeout(timer);
  if (now) write(); else timer = setTimeout(write, 250);
}

export function get() { return data; }
export function reset() { data = fresh(); save(true); }

// Compact path encoding for the quilt chest: two base-36 chars per hole.
export const enc = (arr) => arr.map((c) => c.toString(36).padStart(2, '0')).join('');
export const dec = (s) => { const out = []; for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 36)); return out; };
