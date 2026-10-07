// STITCHLINE app shell: screens, modes, saves, rewards.
import CAMPAIGN from './data/campaign.json';
import { CHAPTERS, TEACH, ENDLESS, chapterOf, chapterRange } from './core/campaign.js';
import { Session } from './game.js';
import { Board } from './board.js';
import * as store from './store.js';
import { sfx, unlock, setSound, setMusic, buzz } from './audio.js';
import { ICON } from './icons.js';
import { BOARDS, PAL, linenTile, fabricTile, FABRIC_KINDS, FABRIC_COLORS, drawQuiltBlock, pearl, darkButton, woodButton, eyelet, knotMark, pinHead, yarn, roundRect, needleEye, seamLine, seamTag, THREADS, FABRICS, shade, sparkle } from './art.js';
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
const QUILT_SIZE = 9;

const S = store.load();
setSound(S.settings.sound); setMusic(S.settings.music);
const app = $('#app');
try { document.body.style.backgroundImage = `url(${linenTile('#efe4d1', 3).toDataURL()})`; } catch (e) { /* no canvas */ }

function haptic(ms) { if (S.settings.haptics) buzz(ms); }
function tap() { unlock(); sfx.tap(); }
function sizeCanvas(cv, maxDpr = 3) {
  const r = cv.getBoundingClientRect(); const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); return [x, r.width, r.height];
}

// ---------------- campaign / rewards helpers ----------------
const LEVELS = CAMPAIGN;
const NCH = CHAPTERS.length;
const parFor = (lv) => Math.round(15 + (lv.n * lv.n - lv.pins.length) * 1.5 + lv.score * 1.8) * 1000;
function highestSolved() { let m = 0; for (const k of Object.keys(S.levels)) m = Math.max(m, +k); return m; }
function unlocked(id) { return id <= highestSolved() + 3; }
function nextLevelId() { for (const lv of LEVELS) if (!S.levels[lv.id]) return lv.id; return LEVELS.length; }
function starsTotal() { let t = 0; for (const v of Object.values(S.levels)) t += v.stars || 0; return t; }
function threadColor() { const st = starsTotal(); const t = THREADS.find((x) => x.id === S.sewing.thread && st >= x.stars); return (t || THREADS[0]).color; }
function boardStyle(def) {
  const f = FABRICS.find((x) => x.id === S.sewing.fabric);
  if (!f || f.id === 'chapter' || starsTotal() < f.stars) return def;
  if (f.board != null) return BOARDS[f.board];
  return { name: f.id, base: f.base, dark: shade(f.base, -0.2), light: shade(f.base, 0.3) };
}
function allUnlockables() { return [...THREADS.map((t) => ({ kind: 'thread', ...t })), ...FABRICS.filter((f) => f.stars > 0).map((f) => ({ kind: 'fabric', ...f }))]; }
function quiltGroups() { // finished blocks in the order they were first sewn
  const blocks = S.quilt.slice().sort((a, b) => (a.ts0 || a.ts) - (b.ts0 || b.ts));
  const full = Math.floor(blocks.length / QUILT_SIZE);
  const quilts = []; for (let q = 0; q < full; q++) quilts.push(blocks.slice(q * QUILT_SIZE, q * QUILT_SIZE + QUILT_SIZE));
  return { quilts, partial: blocks.slice(full * QUILT_SIZE) };
}

// ---------------- router ----------------
let screen = null, cleanup = null;
function show(name, arg, push = true) {
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  app.innerHTML = '';
  screen = name;
  app.dataset.screen = name;
  cleanup = SCREENS[name](arg) || null;
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

// ---------------- quilts ----------------
// A finished quilt: 3x3 blocks, cream sashing with running stitches, striped binding.
function drawQuilt(x, X, Y, size, blocks, anim = null) {
  const bw = size * 0.05, sash = size * 0.025;
  const inner = size - 2 * bw, cell = (inner - 4 * sash) / 3;
  const a = anim == null ? 99 : anim;
  const borderK = Math.max(0, Math.min(1, (a - 2.6) / 0.6));
  x.save();
  x.globalAlpha = anim == null ? 1 : Math.min(1, a / 0.3);
  // sashing base
  x.fillStyle = '#f7efdf'; roundRect(x, X, Y, size, size, size * 0.03); x.fill();
  if (anim == null || borderK > 0) {
    x.globalAlpha = anim == null ? 1 : borderK;
    x.fillStyle = x.createPattern(fabricTile('stripe', FABRIC_COLORS[(blocks.length + 2) % FABRIC_COLORS.length], 3, 30), 'repeat');
    roundRect(x, X, Y, size, size, size * 0.03); x.fill();
    x.fillStyle = '#f7efdf'; x.fillRect(X + bw, Y + bw, inner, inner);
    x.strokeStyle = 'rgba(255,250,240,0.9)'; x.lineWidth = Math.max(1, size * 0.004); x.setLineDash([size * 0.014, size * 0.01]);
    x.strokeRect(X + bw * 0.5, Y + bw * 0.5, size - bw, size - bw); x.setLineDash([]);
    x.globalAlpha = 1;
  }
  blocks.forEach((q, i) => {
    const t = anim == null ? 1 : Math.max(0, Math.min(1, (a - 0.2 - i * 0.22) / 0.45));
    if (t <= 0) return;
    const cx = X + bw + sash + (i % 3) * (cell + sash), cy = Y + bw + sash + Math.floor(i / 3) * (cell + sash);
    const e = 1 - Math.pow(1 - t, 3), sc = 0.6 + 0.4 * e, off = (1 - e) * -size * 0.08;
    x.save(); x.globalAlpha = Math.min(1, t * 1.5);
    x.translate(cx + cell / 2, cy + cell / 2 + off); x.scale(sc, sc);
    drawQuiltBlock(x, -cell / 2, -cell / 2, cell, { key: q.key, n: q.n, path: store.dec(q.path), pins: store.dec(q.pins) });
    x.restore();
  });
  // sashing stitches
  const st = anim == null ? 1 : Math.max(0, Math.min(1, (a - 2.3) / 0.5));
  if (st > 0) {
    x.strokeStyle = `rgba(160,110,90,${0.55 * st})`; x.lineWidth = Math.max(1, size * 0.003); x.setLineDash([size * 0.012, size * 0.009]);
    for (let k = 0; k <= 3; k++) {
      const o = bw + sash / 2 + k * (cell + sash);
      x.beginPath(); x.moveTo(X + o, Y + bw); x.lineTo(X + o, Y + size - bw); x.stroke();
      x.beginPath(); x.moveTo(X + bw, Y + o); x.lineTo(X + size - bw, Y + o); x.stroke();
    }
    x.setLineDash([]);
  }
  x.restore();
}

function quiltReveal(index) {
  const { quilts } = quiltGroups(); const blocks = quilts[index]; if (!blocks) return;
  const cv = h('canvas', { class: 'quilt-cv' });
  const title = h('h2', { class: 'qr-title' }, `Quilt No. ${index + 1}`);
  const bg = h('div', { class: 'reveal-bg' }, h('div', { class: 'reveal' }, title, cv,
    h('p', { class: 'sub' }, 'Nine solved puzzles, sewn together.'),
    h('button', { class: 'btn primary', onclick: () => { tap(); close(); } }, 'Lovely')));
  document.body.append(bg);
  requestAnimationFrame(() => bg.classList.add('on'));
  S.quiltsSeen = Math.max(S.quiltsSeen || 0, index + 1); store.save();
  let raf = 0; const t0 = performance.now(); const sparks = []; let chimed = 0;
  const draw = (now) => {
    raf = requestAnimationFrame(draw);
    const [x, W, H] = sizeCanvas(cv); x.clearRect(0, 0, W, H);
    const a = (now - t0) / 1000, size = Math.min(W, H) * 0.94;
    x.shadowColor = 'rgba(70,35,25,0.35)'; x.shadowBlur = 20; x.shadowOffsetY = 10;
    drawQuilt(x, (W - size) / 2, (H - size) / 2, size, blocks, a);
    x.shadowColor = 'transparent';
    const landed = Math.min(9, Math.floor((a - 0.2) / 0.22) + 1);
    while (chimed < landed && a > 0.2) { chimed++; sfx.stitch(chimed / 9, chimed); haptic(6); }
    if (a > 2.9 && !sparks.length) { sfx.win(); haptic([20, 40, 30]); for (let k = 0; k < 40; k++) sparks.push({ x: Math.random() * W, y: Math.random() * H, t: a + Math.random() * 0.8, r: 4 + Math.random() * 7 }); }
    for (const s of sparks) { const k = (a - s.t) / 0.9; if (k > 0 && k < 1) sparkle(x, s.x, s.y, s.r * Math.sin(k * Math.PI), 0.95); }
  };
  raf = requestAnimationFrame(draw);
  function close() { cancelAnimationFrame(raf); bg.remove(); if (screen === 'chest') show('chest', null, false); }
}

// ---------------- home ----------------
function heroCanvas() {
  const cv = h('canvas', { class: 'hero-cv' });
  const sample = LEVELS[6];
  let raf = 0; const t0 = performance.now();
  const draw = (now) => {
    raf = requestAnimationFrame(draw);
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, r.width, r.height);
    const per = 5200, a = ((now - t0) % per) / per;
    const size = Math.min(r.width, r.height) * 0.86;
    x.save(); x.translate(r.width / 2, r.height / 2); x.rotate(-0.06 + Math.sin(now / 2400) * 0.015);
    x.shadowColor = 'rgba(80,40,30,0.3)'; x.shadowBlur = 18; x.shadowOffsetY = 8;
    drawQuiltBlock(x, -size / 2, -size / 2, size, { key: 'hero' + Math.floor((now - t0) / per) % 6, n: sample.n, path: sample.sol, pins: sample.pins }, Math.min(1, a / 0.72));
    x.restore();
  };
  raf = requestAnimationFrame(draw);
  return [cv, () => cancelAnimationFrame(raf)];
}
function dailyStreak() { const d = S.daily; return (d.last === dateKey() || d.last === yesterdayKey()) ? d.streak : 0; }

const SCREENS = {
  home() {
    const [hero, stopHero] = heroCanvas();
    const next = nextLevelId();
    const doneAll = Object.keys(S.levels).length >= LEVELS.length;
    const streak = dailyStreak();
    const solvedToday = !!S.daily.solved[dateKey()];
    const { quilts } = quiltGroups();
    const chip = (ic, label, fn) => h('button', { class: 'chipbtn', onclick: () => { tap(); fn(); } }, h('i', { html: ic }), h('span', {}, label));
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
          h('button', { class: 'card', onclick: () => { tap(); show('daily'); } },
            h('span', { class: 'card-ic', html: ICON.calendar }),
            h('span', { class: 'card-tx' }, h('b', {}, 'Daily Stitch'), h('small', {}, solvedToday ? 'Solved today' : 'A hard one each day')),
            streak ? h('span', { class: 'badge' }, `${streak}-day`) : null),
          h('button', { class: 'card', onclick: () => { tap(); show('endless'); } },
            h('span', { class: 'card-ic', html: ICON.infinity }),
            h('span', { class: 'card-tx' }, h('b', {}, 'Endless'), h('small', {}, 'Medium to Expert')))),
        h('div', { class: 'row2' },
          h('button', { class: 'card', onclick: () => { tap(); show('levels'); } },
            h('span', { class: 'card-ic', html: ICON.spool }),
            h('span', { class: 'card-tx' }, h('b', {}, 'Levels'), h('small', {}, `${Object.keys(S.levels).length} of ${LEVELS.length} stitched`))),
          h('button', { class: 'card', onclick: () => { tap(); show('chest'); } },
            h('span', { class: 'card-ic', html: ICON.chest }),
            h('span', { class: 'card-tx' }, h('b', {}, 'Quilt Chest'), h('small', {}, `${S.quilt.length} block${S.quilt.length === 1 ? '' : 's'} · ${quilts.length} quilt${quilts.length === 1 ? '' : 's'}`))))),
      h('footer', { class: 'home-foot' },
        chip(ICON.help, 'How to', () => show('howto')),
        chip(ICON.chart, 'Stats', () => show('stats')),
        chip(ICON.box, 'Sewing box', () => show('sewing')),
        chip(ICON.gear, 'Settings', () => show('settings')))));
    return stopHero;
  },

  levels() {
    const wrap = h('main', { class: 'levels' });
    app.append(topbar('Campaign', `${starsTotal()} of ${LEVELS.length * 3} stars`, () => show('home')), wrap);
    const cur = nextLevelId();
    for (let c = 0; c < NCH; c++) {
      const [lo, hi] = chapterRange(c);
      const ids = LEVELS.slice(lo - 1, hi);
      const solved = ids.filter((l) => S.levels[l.id]).length;
      const fab = fabricTile(FABRIC_KINDS[c % FABRIC_KINDS.length], FABRIC_COLORS[c % FABRIC_COLORS.length], c + 1, 40).toDataURL();
      const sizes = [...new Set(ids.map((l) => l.n))].sort((a, b) => a - b);
      const grid = h('div', { class: 'patches' });
      for (const lv of ids) {
        const rec = S.levels[lv.id];
        const open = unlocked(lv.id);
        grid.append(h('button', {
          class: `patch${rec ? ' done' : ''}${open ? '' : ' locked'}${lv.id === cur ? ' current' : ''}`,
          style: `--fab:url(${fab})`, 'aria-label': `Level ${lv.id}`,
          onclick: () => { if (!open) { sfx.clueBad(); toast('Finish an earlier level to unpick this one.'); return; } tap(); openLevel(lv.id); },
        },
        h('span', { class: 'pn' }, String(lv.id)),
        open ? h('span', { class: 'ps' }, [0, 1, 2].map((k) => h('i', { class: rec && rec.stars > k ? 'on' : '', html: ICON.star }))) : h('span', { class: 'pl', html: ICON.lock })));
      }
      const isNew = c >= 12;
      wrap.append(h('section', { class: 'chapter' },
        h('div', { class: 'ch-head' }, h('h3', {}, h('span', {}, String(c + 1)), CHAPTERS[c], isNew ? h('em', { class: 'new' }, 'new') : null), h('p', {}, `${sizes.map((n) => `${n}×${n}`).join(' · ')} · ${solved}/${ids.length}`)),
        grid));
    }
    requestAnimationFrame(() => { const el = $('.patch.current'); if (el) el.scrollIntoView({ block: 'center' }); });
  },

  daily(arg) {
    const today = dateKey();
    const view = arg && arg.month ? new Date(arg.month) : new Date();
    view.setDate(1);
    const d = S.daily, solvedToday = d.solved[today];
    app.append(topbar('Daily Stitch', 'One hard 9×9 every day', () => show('home')));
    const box = h('main', { class: 'daily' });
    box.append(h('div', { class: 'streak-card' },
      h('div', { class: 'sc-main' }, h('i', { html: ICON.thimble }), h('b', {}, String(dailyStreak())), h('span', {}, 'day streak')),
      h('div', { class: 'sc-side' }, h('span', {}, `Best ${d.bestStreak || 0}`), h('span', {}, `${Object.keys(d.solved).length} solved`))));
    // calendar
    const y = view.getFullYear(), m = view.getMonth();
    const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), lead = (first.getDay() + 6) % 7; // Monday first
    const grid = h('div', { class: 'cal-grid' }, ...['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w) => h('span', { class: 'cal-dow' }, w)));
    for (let k = 0; k < lead; k++) grid.append(h('span'));
    const thread = threadColor();
    for (let day = 1; day <= days; day++) {
      const key = dateKey(new Date(y, m, day));
      const done = d.solved[key];
      const cls = `cal-day${done ? ' done' : ''}${key === today ? ' today' : ''}${key > today ? ' future' : ''}`;
      grid.append(h('span', { class: cls, title: done ? `Solved in ${fmt(done)}` : '' },
        done ? h('i', { html: `<svg viewBox="0 0 24 24"><path d="M6 6L18 18M18 6L6 18" stroke="${thread}" stroke-width="3.2" stroke-linecap="round"/></svg>` }) : null,
        h('b', {}, String(day))));
    }
    const prev = new Date(y, m - 1, 1), nextM = new Date(y, m + 1, 1);
    box.append(h('section', { class: 'cal' },
      h('div', { class: 'cal-head' },
        h('button', { class: 'icon-btn sm', 'aria-label': 'Previous month', html: ICON.left, onclick: () => { tap(); show('daily', { month: prev.toISOString() }, false); } }),
        h('h3', {}, view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
        h('button', { class: 'icon-btn sm', 'aria-label': 'Next month', html: ICON.right, disabled: nextM > new Date() ? true : null, onclick: () => { tap(); show('daily', { month: nextM.toISOString() }, false); } })),
      grid));
    box.append(solvedToday
      ? h('div', { class: 'daily-done' }, h('p', {}, `Today's Daily: solved in ${fmt(solvedToday)}. A new one arrives at midnight.`),
        h('button', { class: 'btn', onclick: () => { tap(); const q = S.quilt.find((b) => b.key === `daily:${today}:`); if (q) blockModal(q); } }, "See today's block"))
      : h('button', { class: 'btn primary wide', onclick: () => { tap(); openDaily(); } }, "Play today's Daily"));
    box.append(h('p', { class: 'note' }, 'Every Daily is a 9×9 checked to sit in the same hard band, so each day is a real challenge.'));
    app.append(box);
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
    const { quilts, partial } = quiltGroups();
    app.append(topbar('Quilt Chest', `${S.quilt.length} block${S.quilt.length === 1 ? '' : 's'} · ${quilts.length} quilt${quilts.length === 1 ? '' : 's'}`, () => show('home')));
    const box = h('main', { class: 'chest' });
    if (!S.quilt.length) {
      box.append(h('div', { class: 'empty' }, h('i', { html: ICON.chest }), h('p', {}, 'Every puzzle you solve becomes a quilt block. Every nine blocks are sewn into a quilt.')));
      app.append(box); return;
    }
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.__paint(); io.unobserve(e.target); } }, { rootMargin: '200px' }) : null;
    const lazy = (cv, paint) => { cv.__paint = paint; if (io) io.observe(cv); else requestAnimationFrame(paint); };
    // progress toward the next quilt
    const slots = h('div', { class: 'next-slots' });
    for (let i = 0; i < QUILT_SIZE; i++) {
      const q = partial[i];
      const cv = q ? h('canvas', { width: 8, height: 8 }) : null;
      slots.append(h('div', { class: 'slot' + (q ? '' : ' empty') }, cv));
      if (q) lazy(cv, () => { const [x, W] = sizeCanvas(cv, 2); drawQuiltBlock(x, 0, 0, W, { key: q.key, n: q.n, path: store.dec(q.path), pins: store.dec(q.pins) }); });
    }
    box.append(h('section', { class: 'next-quilt' }, h('div', { class: 'nq-head' }, h('h3', {}, `Quilt No. ${quilts.length + 1}`), h('span', {}, `${partial.length} of ${QUILT_SIZE} blocks`)),
      h('div', { class: 'bar' }, h('i', { style: `width:${(partial.length / QUILT_SIZE) * 100}%` })), slots));
    if (quilts.length) {
      const qs = h('div', { class: 'quilts' });
      quilts.slice().reverse().forEach((blocks, ri) => {
        const idx = quilts.length - 1 - ri;
        const cv = h('canvas', { class: 'quilt-thumb', width: 8, height: 8 });
        qs.append(h('button', { class: 'qwrap', onclick: () => { tap(); quiltReveal(idx); } }, cv, h('span', {}, `Quilt No. ${idx + 1}`)));
        lazy(cv, () => { const [x, W] = sizeCanvas(cv, 2); drawQuilt(x, 0, 0, W, blocks); });
      });
      box.append(h('h3', { class: 'sec' }, 'Finished quilts'), qs);
    }
    box.append(h('h3', { class: 'sec' }, 'All blocks'));
    const grid = h('div', { class: 'quilt' });
    S.quilt.forEach((q) => {
      const cv = h('canvas', { class: 'qb', width: 8, height: 8 });
      grid.append(h('button', { class: 'qcell', 'aria-label': 'Quilt block', onclick: () => { tap(); blockModal(q); } }, cv));
      lazy(cv, () => { const [x, W] = sizeCanvas(cv, 2); drawQuiltBlock(x, 0, 0, Math.max(40, W), { key: q.key, n: q.n, path: store.dec(q.path), pins: store.dec(q.pins) }); });
    });
    box.append(grid);
    app.append(box);
    if (quilts.length > (S.quiltsSeen || 0)) setTimeout(() => quiltReveal(quilts.length - 1), 500);
    return () => io && io.disconnect();
  },

  stats() {
    app.append(topbar('Stats', 'Your sewing record', () => show('home')));
    const box = h('main', { class: 'stats-sc' });
    const sol = S.stats.solves;
    const known = sol.filter((x) => x.h != null);
    const clean = known.filter((x) => x.h === 0).length;
    const tile = (big, label) => h('div', { class: 'tile' }, h('b', {}, big), h('small', {}, label));
    box.append(h('div', { class: 'tiles' },
      tile(String(sol.length), 'puzzles solved'),
      tile(String(clean), `solved with no hints${known.length ? ` (${Math.round(100 * clean / known.length)}%)` : ''}`),
      tile(`${starsTotal()}`, `of ${LEVELS.length * 3} stars`),
      tile(`${Object.keys(S.levels).length}`, `of ${LEVELS.length} levels`),
      tile(`${dailyStreak()} / ${S.daily.bestStreak || 0}`, 'daily streak / best'),
      tile(String(quiltGroups().quilts.length), 'quilts sewn')));
    // recent solves chart
    const recent = sol.slice(-30);
    if (recent.length) {
      const cv = h('canvas', { class: 'chart' });
      box.append(h('section', { class: 'panel' }, h('h3', {}, 'Recent solve times'), cv, h('p', { class: 'legend' }, h('i', { class: 'lg gold' }), 'no hints ', h('i', { class: 'lg muted' }), 'hints used')));
      requestAnimationFrame(() => {
        const [x, W, H] = sizeCanvas(cv);
        const maxT = Math.max(...recent.map((r) => r.t)), bw = W / 30;
        x.strokeStyle = 'rgba(58,43,51,0.15)'; x.beginPath(); x.moveTo(0, H - 14.5); x.lineTo(W, H - 14.5); x.stroke();
        recent.forEach((r, i) => {
          const hgt = Math.max(3, (H - 22) * Math.sqrt(r.t / maxT));
          x.fillStyle = r.h === 0 ? '#e0a83a' : r.h == null ? '#c9b9a6' : '#b9a7b3';
          roundRect(x, i * bw + bw * 0.18, H - 15 - hgt, bw * 0.64, hgt, Math.min(4, bw * 0.3)); x.fill();
        });
        x.fillStyle = '#6b5862'; x.font = '700 11px Nunito, system-ui'; x.textAlign = 'right'; x.fillText(`longest ${fmt(maxT)}`, W, 10);
      });
    }
    // by board size
    const bySize = new Map();
    for (const r of sol) { if (!bySize.has(r.n)) bySize.set(r.n, []); bySize.get(r.n).push(r.t); }
    const rows = [...bySize.entries()].sort((a, b) => a[0] - b[0]).map(([n, ts]) => {
      const s2 = ts.slice().sort((a, b) => a - b), med = s2[Math.floor(s2.length / 2)];
      return h('tr', {}, h('td', {}, `${n}×${n}`), h('td', {}, String(ts.length)), h('td', {}, fmt(s2[0])), h('td', {}, fmt(med)));
    });
    if (rows.length) box.append(h('section', { class: 'panel' }, h('h3', {}, 'Times by board size'),
      h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Size'), h('th', {}, 'Solved'), h('th', {}, 'Best'), h('th', {}, 'Typical'))), h('tbody', {}, rows))));
    box.append(h('section', { class: 'panel' }, h('h3', {}, 'Endless'),
      h('table', { class: 'tbl' }, h('tbody', {}, ['medium', 'hard', 'expert'].map((k) => h('tr', {}, h('td', {}, ENDLESS[k].label), h('td', {}, `${S.endless[k].solved} solved`), h('td', {}, S.endless[k].best ? `best ${fmt(S.endless[k].best)}` : '-')))))));
    if (!sol.length) box.append(h('p', { class: 'note' }, 'Solve a puzzle to start your record.'));
    app.append(box);
  },

  sewing() {
    const st = starsTotal();
    app.append(topbar('Sewing box', `${st} stars earned`, () => show('home')));
    const box = h('main', { class: 'sewing' });
    const prev = h('canvas', { class: 'sew-preview' });
    const paintPrev = () => {
      const [x, W, H] = sizeCanvas(prev);
      const B = boardStyle(BOARDS[0]);
      roundRect(x, 4, 4, W - 8, H - 8, 14); x.fillStyle = B.base; x.fill();
      x.save(); roundRect(x, 4, 4, W - 8, H - 8, 14); x.clip(); x.fillStyle = x.createPattern(linenTile(B.base, 7), 'repeat'); x.fillRect(0, 0, W, H); x.restore();
      const n = 4, cs = (H - 30) / (n - 1), ox = (W - cs * (n - 1)) / 2, oy = 15;
      const xy = (c) => [ox + (c % n) * cs, oy + Math.floor(c / n) * cs];
      for (let i = 0; i < 16; i++) { const [a, b] = xy(i); eyelet(x, a, b, cs * 0.1); }
      yarn(x, [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14, 13, 12].map(xy), cs * 0.21, threadColor());
      const [px, py] = xy(5); pearl(x, px, py, cs * 0.27);
    };
    box.append(prev);
    const sec = (title, items, kind) => {
      const grid = h('div', { class: 'sew-grid' });
      for (const it of items) {
        const open = st >= it.stars, sel = (kind === 'thread' ? S.sewing.thread : S.sewing.fabric) === it.id;
        const sw = h('canvas', { class: 'sw-cv' });
        grid.append(h('button', { class: `swatch${sel ? ' sel' : ''}${open ? '' : ' locked'}`, 'aria-label': it.name, onclick: () => {
          if (!open) { sfx.clueBad(); toast(`Earn ${it.stars} stars to unlock ${it.name}.`); return; }
          tap(); S.sewing[kind] = it.id; store.save(); show('sewing', null, false);
        } }, sw, h('span', {}, it.name), open ? null : h('small', {}, h('i', { html: ICON.star }), String(it.stars))));
        requestAnimationFrame(() => {
          const [x, W, H] = sizeCanvas(sw);
          if (kind === 'thread') { // a spool
            x.fillStyle = '#d9c3a0'; roundRect(x, W * 0.2, H * 0.08, W * 0.6, H * 0.12, 3); x.fill(); roundRect(x, W * 0.2, H * 0.8, W * 0.6, H * 0.12, 3); x.fill();
            x.fillStyle = it.color; roundRect(x, W * 0.27, H * 0.2, W * 0.46, H * 0.6, 4); x.fill();
            x.strokeStyle = shade(it.color, -0.3); x.lineWidth = 1;
            for (let k = 0; k < 7; k++) { const yy = H * 0.24 + k * H * 0.08; x.beginPath(); x.moveTo(W * 0.27, yy); x.lineTo(W * 0.73, yy + H * 0.03); x.stroke(); }
          } else {
            const base = it.id === 'chapter' ? BOARDS[0].base : it.board != null ? BOARDS[it.board].base : it.base;
            roundRect(x, 3, 3, W - 6, H - 6, 8); x.fillStyle = base; x.fill();
            x.save(); roundRect(x, 3, 3, W - 6, H - 6, 8); x.clip(); x.fillStyle = x.createPattern(linenTile(base, 7), 'repeat'); x.fillRect(0, 0, W, H); x.restore();
            if (it.id === 'chapter') { x.fillStyle = 'rgba(255,255,255,0.75)'; x.font = '800 11px Nunito'; x.textAlign = 'center'; x.fillText('auto', W / 2, H / 2 + 4); }
          }
        });
      }
      return h('section', { class: 'panel' }, h('h3', {}, title), grid);
    };
    box.append(sec('Thread', THREADS, 'thread'), sec('Board fabric', FABRICS, 'fabric'));
    box.append(h('p', { class: 'note' }, 'New colours unlock as you earn stars in the campaign.'));
    app.append(box);
    requestAnimationFrame(paintPrev);
  },

  howto() {
    app.append(topbar('How to play', 'One thread. Every hole. Once.', () => show('home')));
    const box = h('main', { class: 'howto' });
    const rule = (title, text, drawFn) => {
      const cv = h('canvas', { class: 'rule-cv' });
      requestAnimationFrame(() => { const [x, W, H] = sizeCanvas(cv); drawFn(x, W, H); });
      return h('section', { class: 'rule' }, cv, h('div', {}, h('h3', {}, title), h('p', {}, text)));
    };
    box.append(
      rule('Thread every hole', 'Drag from the needle. The thread moves up, down, left or right and must pass through every hole exactly once. Drag back along the thread to unpick it.', (x, W, H) => miniBoard(x, W, H, 3, [0, 1, 2, 5, 4, 3, 6, 7, 8], {})),
      rule('The knot', 'If a knot is shown, the thread must finish there. With no knot, it can finish on any hole.', (x, W, H) => miniBoard(x, W, H, 3, [0, 3, 6, 7, 4, 1, 2, 5, 8], { knot: 8 })),
      rule('Pins', 'Pinned holes are closed. Thread around them.', (x, W, H) => miniBoard(x, W, H, 3, [0, 1, 2, 5, 8, 7, 6, 3], { pins: [4] })),
      rule('Straight stitch', 'White bead: the thread goes straight through it, and turns on at least one of the holes right before or after it.', (x, W, H) => miniBoard(x, W, H, 3, [0, 1, 2, 5, 4, 3, 6, 7, 8], { s: [1] })),
      rule('Corner stitch', 'Dark button: the thread turns on it, and goes straight through the next hole on both sides.', (x, W, H) => miniBoard(x, W, H, 3, [2, 1, 0, 3, 6, 7, 8, 5, 4], { c: [0] })),
      rule('Numbered buttons', 'Visit numbered buttons in order: 1, then 2, then 3.', (x, W, H) => miniBoard(x, W, H, 3, [0, 1, 2, 5, 4, 3, 6, 7, 8], { nums: [1, 4, 7] })),
      rule("Needle's eye", "Pass straight through the eye, travelling the way its arrow points. The direction matters!", (x, W, H) => miniBoard(x, W, H, 3, [0, 1, 2, 5, 4, 3, 6, 7, 8], { eyes: [{ c: 4, d: 3 }] })),
      rule('Seams', 'A stitched seam with a tag: the thread must cross that seam exactly as many times as the tag says.', (x, W, H) => miniBoard(x, W, H, 3, [0, 1, 2, 5, 4, 3, 6, 7, 8], { seams: [{ o: 'h', k: 0, a: 0, b: 2, n: 1 }] })),
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
    const seg = h('div', { class: 'seg' }, [['up', 'Time taken'], ['par', 'Par countdown'], ['off', 'Hidden']].map(([v, l]) =>
      h('button', { class: S.settings.clock === v ? 'on' : '', onclick: () => { tap(); S.settings.clock = v; store.save(); show('settings', null, false); } }, l)));
    box.append(
      tog('sound', 'Sound effects', null, (v) => setSound(v)),
      tog('music', 'Music', 'Gentle background tunes', (v) => { setMusic(v); if (v) unlock(); }),
      tog('haptics', 'Vibration', 'On phones that support it'),
      h('div', { class: 'set-row col' }, h('span', {}, h('b', {}, 'Clock'), h('small', {}, 'Show how long you have taken, count down to par, or hide it')), seg),
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

// Small illustrative board for rules + legend chips.
function miniBoard(x, W, H, n, path, deco) {
  const cs = Math.min(W, H) / (n + 0.6), ox = (W - cs * n) / 2 + cs / 2, oy = (H - cs * n) / 2 + cs / 2;
  roundRect(x, ox - cs * 0.8, oy - cs * 0.8, cs * (n - 1) + cs * 1.6, cs * (n - 1) + cs * 1.6, cs * 0.3); x.fillStyle = BOARDS[0].base; x.fill();
  const xy = (c) => [ox + (c % n) * cs, oy + Math.floor(c / n) * cs];
  for (const sm of deco.seams || []) {
    const y = oy + (sm.k + 0.5) * cs; seamLine(x, ox - cs * 0.5, y, ox + (sm.b + 0.5) * cs, y, cs * 0.07, '#3f3550');
  }
  for (let i = 0; i < n * n; i++) { if (deco.pins?.includes(i)) continue; const [a, b] = xy(i); eyelet(x, a, b, cs * 0.09); }
  if (deco.knot != null) { const [a, b] = xy(deco.knot); knotMark(x, a, b, cs * 0.22, PAL.madder); }
  if (path) yarn(x, path.map(xy), cs * 0.2, PAL.madder);
  for (const c of deco.pins || []) { const [a, b] = xy(c); pinHead(x, a - cs * 0.06, b - cs * 0.06, cs * 0.18, '#4f7fb8'); }
  for (const c of deco.s || []) { const [a, b] = xy(c); pearl(x, a, b, cs * 0.25); }
  for (const c of deco.c || []) { const [a, b] = xy(c); darkButton(x, a, b, cs * 0.25); }
  (deco.nums || []).forEach((c, k) => { const [a, b] = xy(c); woodButton(x, a, b, cs * 0.27, k + 1); });
  for (const e of deco.eyes || []) { const [a, b] = xy(e.c); needleEye(x, a, b, cs * 0.26, e.d); }
  for (const sm of deco.seams || []) seamTag(x, ox - cs * 0.5, oy + (sm.k + 0.5) * cs, cs * 0.38, sm.n, null);
}

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
// Today's Daily is made once (in the worker, ahead of time) and cached in the save.
let dailyPromise = null;
function getDaily(key) {
  if (S.dailyCache && S.dailyCache.key === key && S.dailyCache.p) return Promise.resolve(S.dailyCache.p);
  if (!dailyPromise || dailyPromise.key !== key) {
    dailyPromise = gen({ kind: 'daily', key }).then((p) => { S.dailyCache = { key, p }; store.save(); return p; });
    dailyPromise.key = key;
  }
  return dailyPromise;
}
async function openDaily() {
  const key = dateKey();
  loading("Threading today's puzzle…");
  try {
    const p = await getDaily(key);
    const nice = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    show('play', { mode: 'daily', id: key, p, title: 'Daily Stitch', sub: `${nice} · ${p.n}×${p.n}`, board: BOARDS[(new Date().getDate()) % BOARDS.length] });
  } catch (e) { console.warn(e); toast('Could not make the daily puzzle. Try again.'); show('home'); }
}
async function openEndless(diff, resumeSeed) {
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
const RULES = {
  knot: ['The knot', 'The thread must finish on the knot.'],
  noknot: ['No knot', 'The thread can finish on any hole.'],
  s: ['Straight stitch', 'White bead: straight through, and turn on a hole right next to it.'],
  c: ['Corner stitch', 'Dark button: turn on it, and go straight through the holes on both sides.'],
  n: ['Numbered buttons', 'Visit them in order: 1, 2, 3...'],
  e: ["Needle's eye", 'Straight through, travelling the way the arrow points.'],
  m: ['Seams', 'Cross each seam exactly as many times as its tag says.'],
};

function playScreen(cfg) {
  const p = cfg.p;
  const saved = S.current && S.current.key === curKey(cfg) ? S.current : null;
  const session = new Session(p, saved);
  let elapsed = saved?.elapsed || 0, last = performance.now(), finished = false;
  const holes = h('span', { class: 'holes' });
  const clock = h('span', { class: 'clock' });
  const hintBadge = h('b', {}, String(S.hints));
  const cv = h('canvas', { class: 'board-cv' });
  const boardWrap = h('div', { class: 'board-wrap' }, cv);
  const helpBtn = h('button', { class: 'icon-btn', 'aria-label': 'Rules', html: ICON.help, onclick: () => { tap(); rulesCard(); } });
  const teachBox = h('div', { class: 'teach' });
  // legend chips: what's on this board
  const legend = h('div', { class: 'legend-chips' });
  const chipDefs = [];
  chipDefs.push(p.knot >= 0 ? ['knot', 'Knot', (x, s) => knotMark(x, s / 2, s / 2, s * 0.3, threadColor())] : ['noknot', 'No knot', null]);
  if (p.straight.length) chipDefs.push(['s', `× ${p.straight.length}`, (x, s) => pearl(x, s / 2, s / 2, s * 0.36)]);
  if (p.corner.length) chipDefs.push(['c', `× ${p.corner.length}`, (x, s) => darkButton(x, s / 2, s / 2, s * 0.36)]);
  if ((p.eyes || []).length) chipDefs.push(['e', `× ${p.eyes.length}`, (x, s) => needleEye(x, s / 2, s / 2, s * 0.34, 1)]);
  if ((p.seams || []).length) chipDefs.push(['m', `× ${p.seams.length}`, (x, s) => { seamLine(x, s * 0.1, s * 0.5, s * 0.9, s * 0.5, s * 0.08, '#3f3550'); }]);
  if (p.nums.length) chipDefs.push(['n', `1–${p.nums.length}`, (x, s) => woodButton(x, s / 2, s / 2, s * 0.38, 1)]);
  for (const [key, label, draw] of chipDefs) {
    const icv = draw ? h('canvas', { class: 'chip-ic' }) : null;
    legend.append(h('button', { class: 'lchip', onclick: () => { tap(); ruleCard(key); } }, icv, h('span', {}, label)));
    if (icv) requestAnimationFrame(() => { const [x, W] = sizeCanvas(icv); draw(x, W); });
  }
  const barFill = h('i'), barTxt = h('span', { class: 'tb-txt' });
  const threadBar = h('div', { class: 'thread-bar' }, h('span', { class: 'tb-ic', html: ICON.spool }), h('div', { class: 'tb-track' }, barFill), barTxt);
  const info = h('div', { class: 'info' }, threadBar, teachBox, legend);
  const btn = (ic, label, fn, extra) => h('button', { class: 'tool', onclick: fn, 'aria-label': label }, h('i', { html: ic }), h('span', {}, label), extra || null);
  const undoB = btn(ICON.undo, 'Undo', () => { if (finished) return; unlock(); if (session.undo()) { sfx.undo(); haptic(6); changed(); } });
  const resetB = btn(ICON.reset, 'Reset', () => { if (finished) return; unlock(); if (session.reset()) { sfx.back(); haptic(10); changed(); } });
  const hintB = btn(ICON.thimble, 'Hint', () => useHint(), hintBadge);
  hintB.classList.add('hint-btn');
  const stage = h('div', { class: 'stage' }, info, boardWrap);
  const modeChip = cfg.mode === 'campaign' ? (S.settings.clock === 'par' ? `${p.n}×${p.n}` : `par ${fmt(parFor(p))}`) : cfg.mode === 'daily' ? `streak ${dailyStreak()}` : `${S.endless[cfg.id].solved} solved`;
  app.append(h('div', { class: 'play' },
    topbar(cfg.title, cfg.sub, () => { persist(true); cfg.mode === 'endless' ? show('endless') : cfg.mode === 'campaign' ? show('levels') : show('daily'); }, helpBtn),
    h('div', { class: 'status' }, holes, S.settings.clock !== 'off' ? clock : h('span'), h('span', { class: 'mode-chip' }, modeChip)),
    stage,
    h('nav', { class: 'tools' }, undoB, resetB, hintB)));

  const board = new Board(cv, {
    onMove(kind) {
      if (kind === 'add') { sfx.stitch(session.path.length / session.open, session.path.length); haptic(7); }
      else { sfx.back(); haptic(4); }
      changed();
    },
    onMiss() { haptic(15); },
    onInteract() { unlock(); hideGhost(); },
    onRelease() { persist(); },
  });
  board.thread = threadColor();
  barFill.style.backgroundColor = board.thread;
  board.setSession(session, { board: boardStyle(cfg.board || BOARDS[0]) });
  window.__stitch = { board, session, cfg };

  // Size the board to the space: as big as fits, anchored low for thumbs; the band above holds
  // the legend + tutorial card (which overlays the board top on short phones).
  function layout() {
    stage.classList.remove('tight');
    const r = stage.getBoundingClientRect();
    const need = (legend.offsetHeight || 0) + (teachBox.offsetHeight ? teachBox.offsetHeight + 8 : 0) + 8;
    let side = Math.floor(Math.min(r.width - 8, r.height - need));
    stage.classList.toggle('roomy', r.height - side - need > 64);
    if (side < Math.min(r.width - 8, r.height - 4) * 0.9) {
      // not enough room: the board takes the whole stage and the card floats over its top edge
      stage.classList.add('tight');
      side = Math.floor(Math.min(r.width - 8, r.height - 4));
    }
    boardWrap.style.width = boardWrap.style.height = `${Math.max(120, side)}px`;
    board.resize();
  }
  // re-layout when the tutorial card opens/closes
  new MutationObserver(() => layout()).observe(teachBox, { childList: true });

  let prevStatus = session.status();
  function changed() {
    const st = session.status();
    if (S.settings.assist || session.full) board.statusCache = st; else board.statusCache = new Map();
    board.seamCache = (S.settings.assist || session.full) ? session.seamStatus() : null;
    for (const [c, v] of st) if (prevStatus.get(c) !== v) { if (v === 'ok') sfx.clueOk(); else if (v === 'bad' && S.settings.assist) { sfx.clueBad(); haptic(20); } }
    prevStatus = st;
    board.dirty = true;
    holes.textContent = `${session.path.length} / ${session.open} holes`;
    barFill.style.width = `${(100 * session.path.length / session.open).toFixed(1)}%`;
    barTxt.textContent = `${Math.round(100 * session.path.length / session.open)}%`;
    if (session.won) win();
    else if (session.full) { sfx.full(); toast('Every hole is threaded, but a stitch is unhappy. Look for the red rings.'); board.statusCache = st; board.seamCache = session.seamStatus(); }
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

  const teach = cfg.teach;
  function card(title, text, extra) {
    teachBox.innerHTML = '';
    teachBox.append(h('div', { class: 'teach-card' },
      h('button', { class: 'x', 'aria-label': 'Close', html: ICON.close, onclick: () => { teachBox.innerHTML = ''; } }),
      h('h4', {}, title), text ? h('p', {}, text) : null, extra || null));
  }
  function ruleCard(key) { const [t, x] = RULES[key]; card(t, x); }
  function rulesCard() {
    card('Rules', null, h('ul', {}, h('li', {}, 'One thread from the needle through every hole, once.'),
      ...chipDefs.map(([k]) => h('li', {}, RULES[k][1]))));
  }
  function demoCells() {
    const sol = p.sol;
    const around = (c) => { const i = sol.indexOf(c); return sol.slice(Math.max(0, i - 2), Math.min(sol.length, i + 3)); };
    const firstOf = (cells) => cells.slice().sort((a, b) => sol.indexOf(a) - sol.indexOf(b))[0];
    if (!teach || teach.demo === 'start') return sol.slice(0, Math.min(6, sol.length));
    if (teach.demo === 'straight' && p.straight.length) return around(firstOf(p.straight));
    if (teach.demo === 'corner' && p.corner.length) return around(firstOf(p.corner));
    if (teach.demo === 'eye' && (p.eyes || []).length) return around(firstOf(p.eyes.map((e) => e.c)));
    if (teach.demo === 'seam' && (p.seams || []).length) {
      const sm = p.seams[0];
      for (let i = 1; i < sol.length; i++) {
        const a = Math.min(sol[i - 1], sol[i]), b = Math.max(sol[i - 1], sol[i]), n = p.n;
        const hit = sm.o === 'h' ? (b - a === n && Math.floor(a / n) === sm.k && a % n >= sm.a && a % n <= sm.b) : (b - a === 1 && a % n === sm.k && Math.floor(a / n) >= sm.a && Math.floor(a / n) <= sm.b);
        if (hit) return sol.slice(Math.max(0, i - 3), Math.min(sol.length, i + 3));
      }
    }
    if (teach.demo === 'nums' && p.nums.length) return sol.slice(0, Math.min(sol.length, sol.indexOf(p.nums[0]) + 1));
    return sol.slice(0, 5);
  }
  let ghostShown = false;
  function hideGhost() { if (ghostShown) { board.showGhost(null); ghostShown = false; } }
  if (teach && session.path.length <= 1) {
    card(teach.title, teach.text);
    setTimeout(() => { if (!finished && session.path.length <= 1) { board.showGhost(demoCells()); ghostShown = true; } }, 450);
    S.seen[teach.key] = 1;
  } else if (!teach && p.knot < 0 && !S.seen.noknot) { toast('No knot here: the thread can finish on any hole.'); S.seen.noknot = 1; }

  const par = cfg.mode === 'campaign' ? parFor(p) : 0;
  const tick = () => {
    const now = performance.now();
    if (!finished && !document.hidden) elapsed += now - last;
    last = now;
    if (S.settings.clock === 'par' && par) {
      const left = par - elapsed;
      clock.textContent = left >= 0 ? fmt(left) : `+${fmt(-left)}`;
      clock.classList.toggle('over', left < 0);
    } else clock.textContent = fmt(elapsed);
  };
  const iv = setInterval(tick, 250); tick();
  const onVis = () => { last = performance.now(); if (document.hidden) persist(true); };
  document.addEventListener('visibilitychange', onVis);
  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => { layout(); changed(); });

  function win() {
    if (finished) return;
    finished = true; tick();
    board.locked = true;
    board.statusCache = new Map(); board.seamCache = null;
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
  const res = { stars: 0, best: 0, newBest: false, hintEarned: false, streak: 0, unlocks: [], quiltDone: -1 };
  const clean = session.hintsUsed === 0;
  const blockKey = `${cfg.mode}:${cfg.id}:${cfg.seed || ''}`;
  const starsBefore = starsTotal();
  if (cfg.mode === 'campaign') {
    const par = parFor(cfg.p);
    res.stars = clean ? (ms <= par ? 3 : 2) : 1;
    const prev = S.levels[cfg.id];
    if (clean && !prev) res.hintEarned = true;
    const best = prev?.best ? Math.min(prev.best, ms) : ms;
    res.newBest = !prev || ms < prev.best;
    S.levels[cfg.id] = { stars: Math.max(prev?.stars || 0, res.stars), best, hints: prev ? Math.min(prev.hints ?? 99, session.hintsUsed) : session.hintsUsed };
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
    const keys = Object.keys(d.solved).sort(); while (keys.length > 400) delete d.solved[keys.shift()];
  } else {
    const e = S.endless[cfg.id];
    e.solved++; res.newBest = !e.best || ms < e.best; e.best = e.best ? Math.min(e.best, ms) : ms; res.best = e.best;
    if (clean) res.hintEarned = true;
  }
  if (res.hintEarned && S.hints < MAX_HINTS) S.hints++; else res.hintEarned = false;
  // stats
  S.stats.solves.push({ m: cfg.mode[0], id: String(cfg.id), n: cfg.p.n, t: Math.round(ms), h: session.hintsUsed, ts: Date.now() });
  if (S.stats.solves.length > 1000) S.stats.solves.splice(0, S.stats.solves.length - 1000);
  // quilt chest (one block per campaign level / daily; first-sewn time kept so quilts stay stable)
  const i = S.quilt.findIndex((q) => q.key === blockKey);
  const ts0 = i >= 0 ? (S.quilt[i].ts0 || S.quilt[i].ts) : Date.now();
  const quiltsBefore = Math.floor(S.quilt.length / QUILT_SIZE);
  if (i >= 0) S.quilt.splice(i, 1);
  S.quilt.unshift({ k: cfg.mode[0], id: String(cfg.id), key: blockKey, n: cfg.p.n, pins: store.enc(cfg.p.pins), path: store.enc(session.path), t: Math.round(ms), ts: Date.now(), ts0 });
  if (S.quilt.length > 900) S.quilt.length = 900;
  const quiltsAfter = Math.floor(S.quilt.length / QUILT_SIZE);
  if (quiltsAfter > quiltsBefore) res.quiltDone = quiltsAfter - 1;
  // sewing box unlocks
  const starsAfter = starsTotal();
  for (const u of allUnlockables()) if (u.stars > starsBefore && u.stars <= starsAfter && !S.unlocked.includes(u.kind + ':' + u.id)) { res.unlocks.push(u); S.unlocked.push(u.kind + ':' + u.id); }
  store.save(true);
  return res;
}

function winSheet(cfg, session, ms, res) {
  const cv = h('canvas', { class: 'win-cv' });
  const nextBtn = h('button', { class: 'btn primary', onclick: () => { tap(); close(); if (cfg.mode === 'campaign') { if (cfg.id < LEVELS.length) openLevel(cfg.id + 1); else show('levels'); } else if (cfg.mode === 'daily') show('daily'); else { S.current = null; openEndless(cfg.id); } } },
    cfg.mode === 'campaign' ? (cfg.id < LEVELS.length ? 'Next level' : 'All levels') : cfg.mode === 'daily' ? 'Done' : 'Next puzzle');
  const starsRow = cfg.mode === 'campaign' ? h('div', { class: 'stars' }, [0, 1, 2].map((k) => h('i', { class: 'st', 'data-on': res.stars > k ? '1' : '', html: ICON.star }))) : null;
  const lines = [h('div', { class: 'stat' }, h('small', {}, 'Time'), h('b', {}, fmt(ms)))];
  if (cfg.mode === 'campaign') lines.push(h('div', { class: 'stat' }, h('small', {}, res.newBest ? 'New best' : 'Best'), h('b', {}, fmt(res.best))), h('div', { class: 'stat' }, h('small', {}, 'Par'), h('b', {}, fmt(res.par))));
  else if (cfg.mode === 'daily') lines.push(h('div', { class: 'stat' }, h('small', {}, 'Streak'), h('b', {}, `${res.streak} day${res.streak === 1 ? '' : 's'}`)));
  else lines.push(h('div', { class: 'stat' }, h('small', {}, res.newBest ? 'New best' : 'Best'), h('b', {}, fmt(res.best))));
  const second = res.quiltDone >= 0
    ? h('button', { class: 'btn gold', onclick: () => { tap(); close(); show('chest'); } }, 'Sew the quilt!')
    : h('button', { class: 'btn', onclick: () => { tap(); close(); show('chest'); } }, 'Quilt Chest');
  const { partial } = quiltGroups();
  const sheet = h('div', { class: 'sheet-bg' }, h('div', { class: 'sheet' },
    h('div', { class: 'win-block' }, cv),
    h('h2', {}, 'Block complete!'),
    h('p', { class: 'sub' }, cfg.mode === 'campaign' ? `${cfg.title} · ${CHAPTERS[chapterOf(cfg.id)]}` : cfg.title),
    starsRow,
    h('div', { class: 'stats' }, lines),
    res.hintEarned ? h('p', { class: 'reward' }, h('i', { html: ICON.thimble }), 'Solved without hints: +1 hint') : null,
    res.unlocks.length ? h('p', { class: 'reward unlock' }, h('i', { html: ICON.box }), `New in your sewing box: ${res.unlocks.map((u) => u.name + (u.kind === 'thread' ? ' thread' : ' fabric')).join(', ')}`) : null,
    res.quiltDone >= 0 ? h('p', { class: 'reward quiltdone' }, h('i', { html: ICON.quilt }), `Nine blocks! Quilt No. ${res.quiltDone + 1} is ready to sew.`) : h('p', { class: 'qprog' }, `${partial.length} of ${QUILT_SIZE} blocks toward your next quilt`),
    h('div', { class: 'sheet-btns' }, second, nextBtn),
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
      while (starShown < want) { const st = starsRow.children[starShown]; st.classList.add('pop'); if (st.dataset.on) { sfx.clueOk(); haptic(10); } starShown++; }
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
      h('div', { class: 'sheet-btns one' }, h('button', { class: 'btn primary', onclick: () => { tap(); bg.remove(); } }, 'Close'))));
  document.body.append(bg);
  requestAnimationFrame(() => {
    const [x, W, H] = sizeCanvas(cv); const size = W * 0.9;
    x.shadowColor = 'rgba(80,40,30,0.3)'; x.shadowBlur = 14; x.shadowOffsetY = 6;
    drawQuiltBlock(x, (W - size) / 2, (H - size) / 2, size, { key: q.key, n: q.n, path: store.dec(q.path), pins: store.dec(q.pins) });
  });
}

// ---------------- boot ----------------
function boot() {
  const ld = document.getElementById('loading'); if (ld) ld.remove();
  show('home', null, false);
  // Make today's Daily in the background so it opens instantly.
  const key = dateKey();
  if (!(S.dailyCache && S.dailyCache.key === key) && !S.daily.solved[key]) setTimeout(() => { getDaily(key).catch(() => {}); }, 1500);
}
window.__stitchApp = { show, openLevel, openDaily, openEndless, store, levels: LEVELS, quiltReveal };
document.addEventListener('pointerdown', () => unlock(), { once: true, capture: true });
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/[?&]nosw/.test(location.search)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
boot();
