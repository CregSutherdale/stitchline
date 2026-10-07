// Save data in localStorage. Every access is wrapped: private mode / blocked storage must never break play.
// The storage key stays 'stitchline.v1' forever; the schema version lives in data.v and is migrated.
const KEY = 'stitchline.v1';
const BACKUP = 'stitchline.backup.v1'; // raw copy of the last pre-migration save (never overwritten once set)
export const VERSION = 2;

export const fresh = () => ({
  v: VERSION,
  levels: {},            // id -> { stars, best (ms), hints }
  hints: 3,
  daily: { last: '', streak: 0, bestStreak: 0, solved: {} },  // solved: dateKey -> ms
  endless: { medium: { solved: 0, best: 0 }, hard: { solved: 0, best: 0 }, expert: { solved: 0, best: 0 } },
  quilt: [],             // { k, id, key, n, pins, path, t, ts, ts0 }
  quiltsSeen: 0,         // finished quilts whose reveal has been shown
  settings: { sound: true, music: true, haptics: true, clock: 'up', assist: true },
  sewing: { thread: 'madder', fabric: 'chapter' },   // chosen unlockables
  unlocked: [],          // ids already announced
  stats: { solves: [] }, // { m, id, n, t, h, ts }  newest last, capped
  current: null,         // in-progress puzzle { key, path, elapsed, hinted, hintsUsed, ... }
  seen: {},              // tutorial keys shown
  dailyCache: null,      // { key, p } generated Daily for today
});

// Pure: any older save object -> current schema. Never drops progress.
export function migrate(d) {
  if (!d || typeof d !== 'object') return fresh();
  const f = fresh();
  const out = { ...f, ...d };
  out.levels = d.levels && typeof d.levels === 'object' ? d.levels : {};
  out.daily = { ...f.daily, ...(d.daily || {}), solved: { ...((d.daily && d.daily.solved) || {}) } };
  out.endless = { ...f.endless };
  for (const k of Object.keys(f.endless)) out.endless[k] = { ...f.endless[k], ...((d.endless || {})[k] || {}) };
  out.settings = { ...f.settings, ...(d.settings || {}) };
  if ((d.v || 1) < 2) {
    // v1 -> v2
    if (d.settings && d.settings.timer === false) out.settings.clock = 'off';
    delete out.settings.timer;
    out.quilt = (Array.isArray(d.quilt) ? d.quilt : []).map((q) => ({ ...q, ts0: q.ts0 || q.ts || 0 }));
    out.stats = { solves: out.quilt.slice().reverse().map((q) => ({ m: q.k, id: q.id, n: q.n, t: q.t, h: q.k === 'c' ? ((out.levels[q.id] && out.levels[q.id].hints) || 0) : null, ts: q.ts })) };
    out.quiltsSeen = Math.floor(out.quilt.length / 9); // don't replay reveals for quilts finished before quilts existed
    out.sewing = { ...f.sewing };
    out.unlocked = [];
  }
  out.sewing = { ...f.sewing, ...(out.sewing || {}) };
  out.stats = out.stats && Array.isArray(out.stats.solves) ? out.stats : { solves: [] };
  out.quilt = Array.isArray(out.quilt) ? out.quilt : [];
  out.v = VERSION;
  return out;
}

let data = fresh();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && (d.v || 1) < VERSION) { try { if (!localStorage.getItem(BACKUP)) localStorage.setItem(BACKUP, raw); } catch (e) { /* full */ } }
      data = migrate(d);
      save(true);
    }
  } catch (e) {
    try { const raw = localStorage.getItem(KEY); if (raw) localStorage.setItem('stitchline.unreadable', raw); } catch (e2) { /* blocked */ }
    data = fresh();
  }
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
