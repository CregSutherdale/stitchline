// STITCHLINE app shell: screens, modes, saves, rewards.
import CAMPAIGN from './data/campaign.json';
import { CHAPTERS, TEACH, ENDLESS } from './core/campaign.js';
import { Session } from './game.js';
import { Board } from './board.js';
import * as store from './store.js';
import { sfx, unlock, setSound, setMusic, buzz } from './audio.js';
import { ICON } from './icons.js';
import { BOARDS, PAL, linenTile, fabricTile, FABRIC_KINDS, FABRIC_COLORS, drawQuiltBlock, pearl, darkButton, woodButton, eyelet, knotMark, pinHead, yarn, roundRect } from './art.js';
import { makeDaily, makeEndless } from './worker.js';

const $ = (sel, root = document) => root.querySelector(sel);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dateKey(d); };
const MAX_HINTS = 10;

const S = store.load();
setSound(S.settings.sound); setMusic(S.settings.music);
const app = $('#app');

// Page background: woven linen generated once.
try { document.body.style.backgroundImage = `url(${linenTile('#efe4d1', 3).toDataURL()})`; } catch (e) { /* no canvas */ }

function haptic(ms) { if (S.settings.haptics) buzz(ms); }
function tap() { unlock(); sfx.tap(); }

// ---------------- campaign helpers ----------------
const LEVELS = CAMPAIGN;
const parFor = (lv) => Math.round(15 + (lv.n * lv.n - lv.pins.length) * 1.5 + lv.score * 1.8) * 1000;
function highestSolved() { let m = 0; for (const k of Object.keys(S.levels)) m = Math.max(m, +k); return m; }
function unlocked(id) { return id <= highestSolved() + 3; }
function nextLevelId() { for (const lv of LEVELS) if (!S.levels[lv.id]) return lv.id; return LEVELS.length; }
function chapterOf(id) { return Math.floor((id - 1) / 10); }
function starsTotal() { let t = 0; for (const v of Object.values(S.levels)) t += v.stars || 0; return t; }

// ---------------- router ----------------
let screen = null, cleanup = null;
function show(name, arg, push = true) {
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  app.innerHTML = '';
  screen = name;
  app.dataset.screen = name;
  const fn = SCREENS[name];
  cleanup = fn(arg) || null;
  if (push) try { history.pushState({ name }, ''); } catch (e) { /* file:// */ }
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => { if (screen !== 'home') show('home', null, false); });

function topbar(title, sub, onBack, right) {
  return h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn', 'aria-label': 'Back', html: ICON.back, onclick: () => { tap(); onBack(); } }),
    h('div', { class: 'tb-title' }, h('h2', {}, title), sub ? h('p', {}, sub) : null),
    right || h('span', { class: 'icon-btn ghost' }));
}

function toast(msg, ms = 2400) {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast' }); document.body.append(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('on'), ms);
}

// ---------------- home ----------------
function heroCanvas() {
  const cv = h('canvas', { class: 'hero-cv', width: 10, height: 10 });
  const sample = LEVELS[6];
  let raf = 0, t0 = performance.now();
  const draw = (now) => {
    raf = requestAnimationFrame(draw);
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, r.width, r.height);
    const per = 5200, a = ((now - t0) % per) / per;
    const prog = Math.min(1, a / 0.72);
    const size = Math.min(r.width, r.height) * 0.86;
    x.save(); x.translate(r.width / 2, r.height / 2); x.rotate(-0.06 + Math.sin(now / 2400) * 0.015);
    x.shadowColor = 'rgba(80,40,30,0.3)'; x.shadowBlur = 18; x.shadowOffsetY = 8;
    drawQuiltBlock(x, -size / 2, -size / 2, size, { key: 'hero' + Math.floor((now - t0) / per) % 6, n: sample.n, path: sample.sol, pins: sample.pins }, prog);
    x.restore();
  };
  raf = requestAnimationFrame(draw);
  return [cv, () => cancelAnimationFrame(raf)];
}

function dailyStreak() {
  const d = S.daily; const today = dateKey();
  if (d.last === today || d.last === yesterdayKey()) return d.streak;
  return 0;
}

const SCREENS = {
  home() {
    const [hero, stopHero] = heroCanvas();
    const next = nextLevelId();
    const doneAll = Object.keys(S.levels).length >= LEVELS.length;
    const streak = dailyStreak();
    const solvedToday = !!S.daily.solved[dateKey()];
    app.append(h('main', { class: 'home' },
      h('div', { class: 'brand' },
        h('h1', {}, 'Stitchline'),
        h('svg', { class: 'brand-stitch', viewBox: '0 0 300 14', html: '<path d="M4 8 C 60 2, 120 13, 170 7 S 260 3, 296 8" />' }),
        h('p', { class: 'tag' }, 'A threading puzzle for patient hands')),
      h('div', { class: 'hero' }, hero),
      h('div', { class: 'menu' },
        h('button', { class: 'card primary', onclick: () => { tap(); openLevel(next); } },
          h('span', { class: 'card-ic', html: ICON.play }),
          h('span', { class: 'card-tx' }, h('b', {}, doneAll ? 'Campaign complete' : (Object.keys(S.levels).length ? 'Continue' : 'Start stitching')),
            h('small', {}, `Level ${next} · ${CHAPTERS[chapterOf(next)]}`)),
          h('span', { class: 'card-meta' }, h('i', { html: ICON.star }), String(starsTotal()))),
        h('div', { class: 'row2' },
          h('button', { class: 'card', onclick: () => { tap(); openDaily(); } },
            h('span', { class: 'card-ic', html: ICON.calendar }),
            h('span', { class: 'card-tx' }, h('b', {}, 'Daily Stitch'), h('small', {}, solvedToday ? 'Solved today' : 'A new hard one each day')),
            streak ? h('span', { class: 'badge' }, `${streak}-day`) : null),
          h('button', { class: 'card', onclick: () => { tap(); show('endless'); } },
            h('span', { class: 'card-ic', html: ICON.infinity }),
            h('span', { class: 'card-tx' }, h('b', {}, 'Endless'), h('small', {}, 'Medium · Hard · Expert')))),
        h('div', { class: 'row2' },
          h('button', { class: 'card', onclick: () => { tap(); show('levels'); } },
            h('span', { class: 'card-ic', html: ICON.spool }),
            h('span', { class: 'card-tx' }, h('b', {}, 'Levels'), h('small', {}, `${Object.keys(S.levels).length} of ${LEVELS.length} stitched`))),
          h('button', { class: 'card', onclick: () => { tap(); show('chest'); } },
            h('span', { class: 'card-ic', html: ICON.chest }),
            h('span', { class: 'card-tx' }, h('b', {}, 'Quilt Chest'), h('small', {}, `${S.quilt.length} block${S.quilt.length === 1 ? '' : 's'}`))))),
      h('footer', { class: 'home-foot' },
        h('button', { class: 'pill', onclick: () => { tap(); show('howto'); } }, h('i', { html: ICON.help }), 'How to play'),
        h('span', { class: 'hint-count', title: 'Hints' }, h('i', { html: ICON.thimble }), `${S.hints} hints`),
        h('button', { class: 'pill', onclick: () => { tap(); show('settings'); } }, h('i', { html: ICON.gear }), 'Settings'))));
    return stopHero;
  },

  levels() {
    const wrap = h('main', { class: 'levels' });
    app.append(topbar('Campaign', `${starsTotal()} of ${LEVELS.length * 3} stars`, () => show('home')), wrap);
    const cur = nextLevelId();
    for (let c = 0; c < 12; c++) {
      const ids = LEVELS.slice(c * 10, c * 10 + 10);
      const solved = ids.filter((l) => S.levels[l.id]).length;
      const fab = fabricTile(FABRIC_KINDS[c % FABRIC_KINDS.length], FABRIC_COLORS[c % FABRIC_COLORS.length], c + 1, 40).toDataURL();
      const sizes = [...new Set(ids.map((l) => l.n))].sort((a, b) => a - b);
      const grid = h('div', { class: 'patches' });
      for (const lv of ids) {
        const rec = S.levels[lv.id];
        const open = unlocked(lv.id);
        const btn = h('button', {
          class: `patch${rec ? ' done' : ''}${open ? '' : ' locked'}${lv.id === cur ? ' current' : ''}`,
          style: `--fab:url(${fab})`, 'aria-label': `Level ${lv.id}`,
          onclick: () => { if (!open) { sfx.clueBad(); toast('Finish an earlier level to unpick this one.'); return; } tap(); openLevel(lv.id); },
        },
        h('span', { class: 'pn' }, String(lv.id)),
        open ? h('span', { class: 'ps' }, [0, 1, 2].map((k) => h('i', { class: rec && rec.stars > k ? 'on' : '', html: ICON.star }))) : h('span', { class: 'pl', html: ICON.lock }));
        grid.append(btn);
      }
      wrap.append(h('section', { class: 'chapter' },
        h('div', { class: 'ch-head' }, h('h3', {}, h('span', {}, String(c + 1)), CHAPTERS[c]), h('p', {}, `${sizes.map((n) => `${n}×${n}`).join(' · ')}  ·  ${solved}/10`)),
        grid));
    }
    requestAnimationFrame(() => { const el = $('.patch.current'); if (el) el.scrollIntoView({ block: 'center' }); });
  },

  endless() {
    app.append(topbar('Endless', 'Fresh puzzles, forever', () => show('home')));
    const box = h('main', { class: 'endless' });
    const desc = { medium: '7×7 · all stitches · warm-up', hard: '8×8 · sparse clues', expert: '10×10 · long deduction chains' };
    for (const k of ['medium', 'hard', 'expert']) {
      const e = S.endless[k];
      box.append(h('button', { class: `card big diff-${k}`, onclick: () => { tap(); openEndless(k); } },
        h('span', { class: 'card-tx' }, h('b', {}, ENDLESS[k].label), h('small', {}, desc[k])),
        h('span', { class: 'card-meta col' }, h('span', {}, `${e.solved} solved`), h('span', {}, e.best ? `best ${fmt(e.best)}` : ''))));
    }
    box.append(h('p', { class: 'note' }, 'Every puzzle has exactly one solution. Each is checked by a solver before you see it.'));
    app.append(box);
  },

  chest() {
    app.append(topbar('Quilt Chest', `${S.quilt.length} block${S.quilt.length === 1 ? '' : 's'} stitched`, () => show('home')));
    const box = h('main', { class: 'chest' });
    if (!S.quilt.length) {
      box.append(h('div', { class: 'empty' }, h('i', { html: ICON.chest }), h('p', {}, 'Every puzzle you solve becomes a quilt block here. Start stitching!')));
      app.append(box); return;
    }
    const quilt = h('div', { class: 'quilt' });
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { paint(e.target); io.unobserve(e.target); }
    }, { rootMargin: '200px' }) : null;
    function paint(cv) {
      const q = S.quilt[+cv.dataset.i]; if (!q) return;
      const r = cv.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
      const sz = Math.max(60, r.width);
      cv.width = Math.round(sz * dpr); cv.height = Math.round(sz * dpr);
      const x = cv.getContext('2d'); x.scale(dpr, dpr);
      drawQuiltBlock(x, 0, 0, sz, { key: q.key, n: q.n, path: store.dec(q.path), pins: store.dec(q.pins) });
    }
    S.quilt.forEach((q, i) => {
      const cv = h('canvas', { 'data-i': i, class: 'qb' });
      const cell = h('button', { class: 'qcell', 'aria-label': 'Quilt block', onclick: () => { tap(); blockModal(q); } }, cv);
      quilt.append(cell);
      if (io) io.observe(cv); else requestAnimationFrame(() => paint(cv));
    });
    box.append(quilt);
    app.append(box);
    return () => io && io.disconnect();
  },

  howto() {
    app.append(topbar('How to play', 'One thread. Every hole. Once.', () => show('home')));
    const box = h('main', { class: 'howto' });
    const rule = (title, text, drawFn) => {
      const cv = h('canvas', { class: 'rule-cv' });
      requestAnimationFrame(() => { const r = cv.getBoundingClientRect(); const dpr = Math.min(3, devicePixelRatio || 1); cv.width = r.width * dpr; cv.height = r.height * dpr; const x = cv.getContext('2d'); x.scale(dpr, dpr); drawFn(x, r.width, r.height); });
      return h('section', { class: 'rule' }, cv, h('div', {}, h('h3', {}, title), h('p', {}, text)));
    };
    const mini = (x, W, H, n, path, deco) => {
      const cs = Math.min(W, H) / (n + 0.6), ox = (W - cs * n) / 2 + cs / 2, oy = (H - cs * n) / 2 + cs / 2;
      roundRect(x, ox - cs * 0.8 / 1, oy - cs * 0.8, cs * (n - 1) + cs * 1.6, cs * (n - 1) + cs * 1.6, cs * 0.3); x.fillStyle = BOARDS[0].base; x.fill();
      const xy = (c) => [ox + (c % n) * cs, oy + Math.floor(c / n) * cs];
      for (let i = 0; i < n * n; i++) { if (deco.pins?.includes(i)) continue; const [a, b] = xy(i); eyelet(x, a, b, cs * 0.09); }
      if (deco.knot != null) { const [a, b] = xy(deco.knot); knotMark(x, a, b, cs * 0.22, PAL.madder); }
      if (path) yarn(x, path.map(xy), cs * 0.2, PAL.madder);
      for (const c of deco.pins || []) { const [a, b] = xy(c); pinHead(x, a - cs * 0.06, b - cs * 0.06, cs * 0.18, '#4f7fb8'); }
      for (const c of deco.s || []) { const [a, b] = xy(c); pearl(x, a, b, cs * 0.25); }
      for (const c of deco.c || []) { const [a, b] = xy(c); darkButton(x, a, b, cs * 0.25); }
      (deco.nums || []).forEach((c, k) => { const [a, b] = xy(c); woodButton(x, a, b, cs * 0.27, k + 1); });
    };
    box.append(
      rule('Thread every hole', 'Drag from the needle. The thread moves up, down, left or right and must pass through every hole exactly once. Drag back along the thread to unpick it.', (x, W, H) => mini(x, W, H, 3, [0, 1, 2, 5, 4, 3, 6, 7, 8], {})),
      rule('The knot', 'If a knot is shown, the thread must finish there. With no knot, it can finish on any hole.', (x, W, H) => mini(x, W, H, 3, [0, 3, 6, 7, 4, 1, 2, 5, 8], { knot: 8 })),
      rule('Pins', 'Pinned holes are closed. Thread around them.', (x, W, H) => mini(x, W, H, 3, [0, 1, 2, 5, 8, 7, 6, 3], { pins: [4] })),
      rule('Straight stitch', 'White bead: the thread goes straight through it, and turns on at least one of the holes right before or after it.', (x, W, H) => mini(x, W, H, 3, [0, 1, 2, 5, 4, 3, 6, 7, 8], { s: [1] })),
      rule('Corner stitch', 'Dark button: the thread turns on it, and goes straight through the next hole on both sides.', (x, W, H) => mini(x, W, H, 3, [2, 1, 0, 3, 6, 7, 8, 5, 4], { c: [0] })),
      rule('Numbered buttons', 'Visit numbered buttons in order: 1, then 2, then 3.', (x, W, H) => mini(x, W, H, 3, [0, 1, 2, 5, 4, 3, 6, 7, 8], { nums: [1, 4, 7] })),
      h('section', { class: 'tips' }, h('h3', {}, 'Tips'),
        h('p', {}, 'Every puzzle has exactly one answer, and you can always reason your way to it. You never need to guess.'),
        h('p', {}, 'Corner holes and pinned pockets force the thread. Start there.'),
        h('p', {}, 'A gold ring means a stitch is satisfied. A red ring means it is broken.'),
        h('p', {}, 'Undo and reset are always free. Hints reveal one correct segment.')));
    app.append(box);
  },

  settings() {
    app.append(topbar('Settings', null, () => show('home')));
    const box = h('main', { class: 'settings' });
    const tog = (key, label, sub, after) => {
      const inp = h('input', { type: 'checkbox', role: 'switch' }); inp.checked = !!S.settings[key];
      inp.addEventListener('change', () => { S.settings[key] = inp.checked; store.save(); after && after(inp.checked); tap(); });
      return h('label', { class: 'set-row' }, h('span', {}, h('b', {}, label), sub ? h('small', {}, sub) : null), inp, h('i', { class: 'sw' }));
    };
    box.append(
      tog('sound', 'Sound effects', null, (v) => setSound(v)),
      tog('music', 'Music', 'Gentle background tunes', (v) => { setMusic(v); if (v) unlock(); }),
      tog('haptics', 'Vibration', 'On phones that support it'),
      tog('timer', 'Show timer'),
      tog('assist', 'Stitch checks', 'Gold and red rings on clues as you go'),
      h('section', { class: 'credits' }, h('h3', {}, 'Credits'),
        h('p', {}, 'Design, code, art and sound effects: made by hand in code for Amanda.'),
        h('p', {}, 'Music: "Peaceful Village" and "Wood Forest Town" by HydroGene (16-bit RPG Music pack).'),
        h('p', {}, 'Fonts: Fraunces and Nunito (SIL Open Font License).')),
      h('button', { class: 'danger', onclick: () => { if (confirm('Erase all progress, stars and quilt blocks?')) { store.reset(); location.reload(); } } }, 'Erase progress'));
    app.append(box);
  },

  play(cfg) { return playScreen(cfg); },
};

// ---------------- opening puzzles ----------------
function openLevel(id) {
  const lv = LEVELS[id - 1];
  show('play', { mode: 'campaign', id, p: lv, title: `Level ${id}`, sub: `${CHAPTERS[chapterOf(id)]} · ${lv.n}×${lv.n}`, board: BOARDS[chapterOf(id) % BOARDS.length], teach: TEACH[id] });
}

let worker = null, wseq = 0;
const pending = new Map();
function gen(msg) {
  return new Promise((resolve, reject) => {
    const id = ++wseq;
    try {
      if (!worker && window.__SL_WORKER) {
        worker = new Worker(window.__SL_WORKER);
        worker.onmessage = (e) => { const q = pending.get(e.data.id); if (!q) return; pending.delete(e.data.id); e.data.error ? q.reject(new Error(e.data.error)) : q.resolve(e.data.p); };
        worker.onerror = () => { for (const q of pending.values()) q.fallback(); pending.clear(); worker = null; window.__SL_WORKER = null; };
      }
    } catch (e) { worker = null; }
    const fallback = () => setTimeout(() => { try { resolve(msg.kind === 'daily' ? makeDaily(msg.key) : makeEndless(msg.diff, msg.seed)); } catch (err) { reject(err); } }, 30);
    if (!worker) { fallback(); return; }
    pending.set(id, { resolve, reject, fallback });
    worker.postMessage({ id, ...msg });
  });
}

function loading(text) {
  app.innerHTML = '';
  app.append(h('div', { class: 'loading-sc' }, h('div', { class: 'spool-spin', html: ICON.spool }), h('p', {}, text)));
}

async function openDaily() {
  const key = dateKey();
  loading("Threading today's puzzle…");
  try {
    const p = await gen({ kind: 'daily', key });
    const nice = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    show('play', { mode: 'daily', id: key, p, title: 'Daily Stitch', sub: `${nice} · ${p.n}×${p.n}`, board: BOARDS[(new Date().getDate()) % BOARDS.length] });
  } catch (e) { console.warn(e); toast('Could not make the daily puzzle. Try again.'); show('home'); }
}

async function openEndless(diff, resumeSeed) {
  // Resume an unfinished endless puzzle of this difficulty (its seed regenerates it exactly).
  if (!resumeSeed && S.current && S.current.mode === 'endless' && S.current.id === diff && S.current.seed) resumeSeed = S.current.seed;
  const seed = resumeSeed || `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  loading(diff === 'expert' ? 'Measuring out a big one…' : 'Cutting fresh fabric…');
  try {
    const p = await gen({ kind: 'endless', diff, seed });
    show('play', { mode: 'endless', id: diff, seed, p, title: `Endless · ${ENDLESS[diff].label}`, sub: `${p.n}×${p.n}`, board: BOARDS[Math.floor(Math.random() * BOARDS.length)] });
  } catch (e) { console.warn(e); toast('Could not make a puzzle. Try again.'); show('endless'); }
}

// ---------------- play screen ----------------
function curKey(cfg) { return `${cfg.mode}:${cfg.id}${cfg.seed ? ':' + cfg.seed : ''}`; }

function playScreen(cfg) {
  const p = cfg.p;
  const saved = S.current && S.current.key === curKey(cfg) ? S.current : null;
  const session = new Session(p, saved);
  let elapsed = saved?.elapsed || 0, last = performance.now(), running = true, finished = false;
  const holes = h('span', { class: 'holes' });
  const clock = h('span', { class: 'clock' });
  const hintBadge = h('b', {}, String(S.hints));
  const cv = h('canvas', { class: 'board-cv' });
  const boardWrap = h('div', { class: 'board-wrap' }, cv);
  const helpBtn = h('button', { class: 'icon-btn', 'aria-label': 'How to play', html: ICON.help, onclick: () => { tap(); teachCard(true); } });
  const teachBox = h('div', { class: 'teach' });
  const btn = (ic, label, fn, extra) => h('button', { class: 'tool', onclick: fn, 'aria-label': label }, h('i', { html: ic }), h('span', {}, label), extra || null);
  const undoB = btn(ICON.undo, 'Undo', () => { if (finished) return; unlock(); if (session.undo()) { sfx.undo(); haptic(6); changed(); } });
  const resetB = btn(ICON.reset, 'Reset', () => { if (finished) return; unlock(); if (session.reset()) { sfx.back(); haptic(10); changed(); } });
  const hintB = btn(ICON.thimble, 'Hint', () => useHint(), hintBadge);
  hintB.classList.add('hint-btn');
  app.append(h('div', { class: 'play' },
    topbar(cfg.title, cfg.sub, () => { persist(true); cfg.mode === 'endless' ? show('endless') : cfg.mode === 'campaign' ? show('levels') : show('home'); }, helpBtn),
    h('div', { class: 'status' }, holes, S.settings.timer ? clock : h('span'), h('span', { class: 'mode-chip' }, cfg.mode === 'campaign' ? `par ${fmt(parFor(p))}` : cfg.mode === 'daily' ? `streak ${dailyStreak()}` : `${S.endless[cfg.id].solved} solved`)),
    h('div', { class: 'stage' }, boardWrap, teachBox),
    h('nav', { class: 'tools' }, undoB, resetB, hintB)));

  const board = new Board(cv, {
    onMove(kind, c) {
      if (kind === 'add') { sfx.stitch(session.path.length / session.open); haptic(7); }
      else { sfx.back(); haptic(4); }
      changed(kind, c);
    },
    onMiss() { haptic(15); },
    onInteract() { unlock(); hideGhost(); },
    onRelease() { persist(); },
  });
  board.thread = PAL.madder;
  board.setSession(session, { board: cfg.board || BOARDS[0] });
  window.__stitch = { board, session, cfg }; // test hook (read-only use by the harness)

  let prevStatus = session.status();
  function changed() {
    const st = session.status();
    if (S.settings.assist || session.full) board.statusCache = st; else board.statusCache = new Map([...st].filter(([, v]) => v === 'bad' && session.full));
    for (const [c, v] of st) if (prevStatus.get(c) !== v) { if (v === 'ok') { sfx.clueOk(); } else if (v === 'bad' && S.settings.assist) { sfx.clueBad(); haptic(20); } }
    prevStatus = st;
    board.dirty = true;
    holes.textContent = `${session.path.length} / ${session.open} holes`;
    if (session.won) win();
    else if (session.full) { sfx.full(); toast('Every hole is threaded, but a stitch is unhappy. Look for the red rings.'); board.statusCache = st; }
    persist();
  }
  function persist(now) {
    if (finished) return;
    S.current = { key: curKey(cfg), path: session.path, elapsed, hinted: [...session.hinted], hintsUsed: session.hintsUsed, mode: cfg.mode, id: cfg.id, seed: cfg.seed };
    store.save(now);
  }
  function useHint() {
    if (finished) return;
    unlock();
    if (S.hints <= 0) { sfx.clueBad(); toast('No hints left. Solve a puzzle without hints to earn one.'); return; }
    const r = session.hint();
    if (!r) return;
    S.hints--; hintBadge.textContent = String(S.hints);
    sfx.hint(); haptic(12);
    board.flash(r.to, PAL.gold, 0.9);
    changed();
  }

  // tutorial card + ghost hand
  const teach = cfg.teach;
  function demoCells() {
    const sol = p.sol;
    const around = (c) => { const i = sol.indexOf(c); return sol.slice(Math.max(0, i - 2), Math.min(sol.length, i + 3)); };
    if (!teach || teach.demo === 'start') return sol.slice(0, Math.min(6, sol.length));
    if (teach.demo === 'straight' && p.straight.length) return around(p.straight.slice().sort((a, b) => sol.indexOf(a) - sol.indexOf(b))[0]);
    if (teach.demo === 'corner' && p.corner.length) return around(p.corner.slice().sort((a, b) => sol.indexOf(a) - sol.indexOf(b))[0]);
    if (teach.demo === 'nums' && p.nums.length) return sol.slice(0, Math.min(sol.length, sol.indexOf(p.nums[0]) + 1));
    return sol.slice(0, 5);
  }
  function teachCard(forceRules) {
    teachBox.innerHTML = '';
    if (forceRules || !teach) {
      teachBox.append(h('div', { class: 'teach-card' },
        h('button', { class: 'x', 'aria-label': 'Close', html: ICON.close, onclick: () => { teachBox.innerHTML = ''; } }),
        h('h4', {}, 'Rules'),
        h('ul', {}, h('li', {}, 'One thread from the needle through every hole, once.'),
          p.knot >= 0 ? h('li', {}, 'Finish on the knot.') : h('li', {}, 'No knot: finish anywhere.'),
          p.straight.length ? h('li', {}, 'White bead: straight through, turn next to it.') : null,
          p.corner.length ? h('li', {}, 'Dark button: turn on it, straight on both sides.') : null,
          p.nums.length ? h('li', {}, 'Numbers in order.') : null)));
      return;
    }
    teachBox.append(h('div', { class: 'teach-card' },
      h('button', { class: 'x', 'aria-label': 'Close', html: ICON.close, onclick: () => { teachBox.innerHTML = ''; } }),
      h('h4', {}, teach.title), h('p', {}, teach.text)));
  }
  let ghostShown = false;
  function hideGhost() { if (ghostShown) { board.showGhost(null); ghostShown = false; } }
  if (teach && session.path.length <= 1) {
    teachCard();
    setTimeout(() => { if (!finished && session.path.length <= 1) { board.showGhost(demoCells()); ghostShown = true; } }, 450);
    S.seen[teach.key] = 1;
  } else if (!teach && p.knot < 0 && !S.seen.noknot) { toast('No knot here: the thread can finish on any hole.'); S.seen.noknot = 1; }

  // timer
  const tick = () => {
    const now = performance.now();
    if (running && !finished && !document.hidden) elapsed += now - last;
    last = now;
    clock.textContent = fmt(elapsed);
  };
  const iv = setInterval(tick, 250);
  const onVis = () => { last = performance.now(); if (document.hidden) persist(true); };
  document.addEventListener('visibilitychange', onVis);
  const onResize = () => board.resize();
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => { board.resize(); changed(); });

  function win() {
    if (finished) return;
    finished = true; tick();
    board.locked = true;
    board.statusCache = new Map();
    sfx.win(); haptic([25, 40, 25, 40, 60]);
    const result = record(cfg, session, elapsed);
    S.current = null; store.save(true);
    board.playWin(() => { board.burst(); setTimeout(() => winSheet(cfg, session, elapsed, result), 350); });
  }
  return () => {
    clearInterval(iv);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('resize', onResize);
    board.session = null;
    if (window.__stitch && window.__stitch.board === board) window.__stitch = null;
  };
}

// ---------------- results ----------------
function record(cfg, session, ms) {
  const res = { stars: 0, best: 0, newBest: false, hintEarned: false, streak: 0 };
  const clean = session.hintsUsed === 0;
  const blockKey = `${cfg.mode}:${cfg.id}:${cfg.seed || ''}`;
  if (cfg.mode === 'campaign') {
    const par = parFor(cfg.p);
    res.stars = clean ? (ms <= par ? 3 : 2) : 1;
    const prev = S.levels[cfg.id];
    if (clean && !prev) res.hintEarned = true;
    const best = prev?.best ? Math.min(prev.best, ms) : ms;
    res.newBest = !prev || ms < prev.best;
    S.levels[cfg.id] = { stars: Math.max(prev?.stars || 0, res.stars), best, hints: session.hintsUsed };
    res.best = best; res.par = par;
  } else if (cfg.mode === 'daily') {
    const d = S.daily, key = cfg.id;
    if (!d.solved[key]) {
      d.streak = d.last === yesterdayKey() ? d.streak + 1 : (d.last === key ? d.streak : 1);
      d.last = key; d.bestStreak = Math.max(d.bestStreak, d.streak);
      if (clean) res.hintEarned = true;
      d.solved[key] = ms;
    } else d.solved[key] = Math.min(d.solved[key], ms);
    res.streak = d.streak; res.best = d.solved[key];
    const keys = Object.keys(d.solved).sort(); while (keys.length > 120) delete d.solved[keys.shift()];
  } else {
    const e = S.endless[cfg.id];
    e.solved++; res.newBest = !e.best || ms < e.best; e.best = e.best ? Math.min(e.best, ms) : ms; res.best = e.best;
    if (clean) res.hintEarned = true;
  }
  if (res.hintEarned && S.hints < MAX_HINTS) S.hints++; else res.hintEarned = false;
  // quilt chest (one block per campaign level / daily; newest first)
  const entry = { k: cfg.mode[0], id: String(cfg.id), key: blockKey, n: cfg.p.n, pins: store.enc(cfg.p.pins), path: store.enc(session.path), t: Math.round(ms), ts: Date.now() };
  const i = S.quilt.findIndex((q) => q.key === blockKey);
  if (i >= 0) S.quilt.splice(i, 1);
  S.quilt.unshift(entry);
  if (S.quilt.length > 400) S.quilt.length = 400;
  store.save(true);
  return res;
}

function winSheet(cfg, session, ms, res) {
  const cv = h('canvas', { class: 'win-cv' });
  const nextBtn = h('button', { class: 'btn primary', onclick: () => { tap(); close(); if (cfg.mode === 'campaign') { if (cfg.id < LEVELS.length) openLevel(cfg.id + 1); else show('levels'); } else if (cfg.mode === 'daily') show('home'); else { S.current = null; openEndless(cfg.id); } } },
    cfg.mode === 'campaign' ? (cfg.id < LEVELS.length ? 'Next level' : 'All levels') : cfg.mode === 'daily' ? 'Done' : 'Next puzzle');
  const starsRow = cfg.mode === 'campaign' ? h('div', { class: 'stars' }, [0, 1, 2].map((k) => h('i', { class: 'st', 'data-on': res.stars > k ? '1' : '', html: ICON.star }))) : null;
  const lines = [];
  lines.push(h('div', { class: 'stat' }, h('small', {}, 'Time'), h('b', {}, fmt(ms))));
  if (cfg.mode === 'campaign') lines.push(h('div', { class: 'stat' }, h('small', {}, res.newBest ? 'New best' : 'Best'), h('b', {}, fmt(res.best))), h('div', { class: 'stat' }, h('small', {}, 'Par'), h('b', {}, fmt(res.par))));
  else if (cfg.mode === 'daily') lines.push(h('div', { class: 'stat' }, h('small', {}, 'Streak'), h('b', {}, `${res.streak} day${res.streak === 1 ? '' : 's'}`)));
  else lines.push(h('div', { class: 'stat' }, h('small', {}, res.newBest ? 'New best' : 'Best'), h('b', {}, fmt(res.best))));
  const sheet = h('div', { class: 'sheet-bg' }, h('div', { class: 'sheet' },
    h('div', { class: 'win-block' }, cv),
    h('h2', {}, 'Block complete!'),
    h('p', { class: 'sub' }, cfg.mode === 'campaign' ? `${cfg.title} · ${CHAPTERS[chapterOf(cfg.id)]}` : cfg.title),
    starsRow,
    h('div', { class: 'stats' }, lines),
    res.hintEarned ? h('p', { class: 'reward' }, h('i', { html: ICON.thimble }), 'Solved without hints: +1 hint') : null,
    h('div', { class: 'sheet-btns' },
      h('button', { class: 'btn', onclick: () => { tap(); close(); show('chest'); } }, 'Quilt Chest'),
      nextBtn),
    h('button', { class: 'link', onclick: () => { tap(); close(); show('home'); } }, 'Home')));
  document.body.append(sheet);
  requestAnimationFrame(() => sheet.classList.add('on'));
  let raf = 0; const t0 = performance.now();
  const block = { key: `${cfg.mode}:${cfg.id}:${cfg.seed || ''}`, n: cfg.p.n, path: session.path.slice(), pins: cfg.p.pins };
  let starShown = 0;
  const draw = (now) => {
    raf = requestAnimationFrame(draw);
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, r.width, r.height);
    const a = (now - t0) / 1000;
    const k = Math.min(1, a / 1.3);
    const ease = 1 - Math.pow(1 - Math.min(1, a / 0.5), 3);
    const size = r.width * (0.8 + 0.12 * ease);
    x.save(); x.translate(r.width / 2, r.height / 2); x.rotate((1 - ease) * -0.25 + 0.03 * Math.sin(a * 1.4) * (1 - k * 0.6));
    x.shadowColor = 'rgba(80,40,30,0.32)'; x.shadowBlur = 16; x.shadowOffsetY = 8;
    drawQuiltBlock(x, -size / 2, -size / 2, size, block, k);
    x.restore();
    if (starsRow) {
      const want = a > 1.0 ? Math.min(3, Math.floor((a - 1.0) / 0.28) + 1) : 0;
      while (starShown < want) {
        const st = starsRow.children[starShown];
        st.classList.add('pop'); if (st.dataset.on) { sfx.clueOk(); haptic(10); }
        starShown++;
      }
    }
  };
  raf = requestAnimationFrame(draw);
  function close() { cancelAnimationFrame(raf); sheet.remove(); }
}

function blockModal(q) {
  const cv = h('canvas', { class: 'win-cv' });
  const label = q.k === 'c' ? `Level ${q.id}` : q.k === 'd' ? `Daily Stitch · ${q.id}` : `Endless · ${ENDLESS[q.id]?.label || q.id}`;
  const bg = h('div', { class: 'sheet-bg on', onclick: (e) => { if (e.target === bg) bg.remove(); } },
    h('div', { class: 'sheet' }, h('div', { class: 'win-block' }, cv), h('h2', {}, label), h('p', { class: 'sub' }, `${q.n}×${q.n} · ${fmt(q.t)} · ${new Date(q.ts).toLocaleDateString()}`),
      h('div', { class: 'sheet-btns' }, h('button', { class: 'btn primary', onclick: () => { tap(); bg.remove(); } }, 'Close'))));
  document.body.append(bg);
  requestAnimationFrame(() => {
    const r = cv.getBoundingClientRect(); const dpr = Math.min(3, devicePixelRatio || 1);
    cv.width = r.width * dpr; cv.height = r.height * dpr; const x = cv.getContext('2d'); x.scale(dpr, dpr);
    const size = r.width * 0.9;
    x.shadowColor = 'rgba(80,40,30,0.3)'; x.shadowBlur = 14; x.shadowOffsetY = 6;
    drawQuiltBlock(x, (r.width - size) / 2, (r.height - size) / 2, size, { key: q.key, n: q.n, path: store.dec(q.path), pins: store.dec(q.pins) });
  });
}

// ---------------- boot ----------------
function boot() {
  const ld = document.getElementById('loading'); if (ld) ld.remove();
  const cur = S.current;
  void cur;
  show('home', null, false);
}
window.__stitchApp = { show, openLevel, openDaily, openEndless, store, levels: LEVELS };
document.addEventListener('pointerdown', () => unlock(), { once: true, capture: true });
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/[?&]nosw/.test(location.search)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
boot();
