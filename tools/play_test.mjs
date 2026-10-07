// GATE 2: headless Edge at phone size 390x844 plays the real game with REAL input events
// (CDP Input.dispatchTouchEvent / dispatchMouseEvent -> pointer events on the canvas).
//  - Levels 1, 2, 3 from a fresh save: tap Start, drag the thread along the solution, tap Next.
//  - One 8x8+ level dragged with real touch.
//  - Saves persist across a reload.
//  - Erratic pass on a 10x10: random drags, backtracks, undo/reset spam, then it must still be solvable.
//  - 0 console errors.
// Usage: node tools/play_test.mjs [baseUrl]   (default: local dist server)
import { launch } from './cdp.mjs';

const ext = process.argv[2];
let server = null;
if (!ext) server = (await import('./serve.mjs')).default;
const BASE = ext || 'http://localhost:5317/';
const b = await launch({ w: 390, h: 844, dpr: 2, timeout: 900 });
const results = [];
const ok = (name, pass, info = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };
const sleep = b.sleep;

async function cellPts(cells) {
  return b.evaluate(`(()=>{const bd=__stitch.board, r=bd.cv.getBoundingClientRect(); return ${JSON.stringify(cells)}.map(c=>{const p=bd.cellXY(c); return [r.left+p[0], r.top+p[1]];});})()`);
}
// Drag the finger along hole centres, several move events per segment with a little hand jitter.
async function dragPath(cells, { mouse = false, sub = 4, jitter = 2 } = {}) {
  const pts = await cellPts(cells);
  const down = mouse ? (x, y) => b.mouse('mousePressed', x, y) : (x, y) => b.touch('touchStart', x, y);
  const mv = mouse ? (x, y) => b.mouse('mouseMoved', x, y) : (x, y) => b.touch('touchMove', x, y);
  const up = mouse ? (x, y) => b.mouse('mouseReleased', x, y) : (x, y) => b.touch('touchEnd', x, y);
  await down(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    for (let k = 1; k <= sub; k++) {
      const j = k === sub ? 0 : jitter;
      await mv(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k / sub + (Math.random() - 0.5) * j, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k / sub + (Math.random() - 0.5) * j);
    }
    if (i % 6 === 0) await sleep(8);
  }
  await up(pts.at(-1)[0], pts.at(-1)[1]);
}
const winShown = () => b.waitFor(`(()=>{const h=document.querySelector('.sheet h2'); return h && h.textContent.includes('complete')})()`, 12000).then(() => true, () => false);
const saved = (id) => b.evaluate(`(()=>{try{const d=JSON.parse(localStorage.getItem('stitchline.v1')); return !!(d&&d.levels&&d.levels[${id}]);}catch(e){return false}})()`);

let code = 0;
try {
  await b.goto(BASE + '?nosw', 1500);
  await b.evaluate(`localStorage.clear(); 1`);
  await b.goto(BASE + '?nosw', 1800);
  await b.waitFor('document.querySelector(".card.primary")');
  // ---- Levels 1-3 via the real UI ----
  await b.click('.card.primary');
  for (const id of [1, 2, 3]) {
    await b.waitFor(`window.__stitch && __stitch.cfg.id === ${id}`, 8000);
    await sleep(500);
    const sol = await b.evaluate('__stitch.session.p.sol');
    await dragPath(sol, { mouse: id === 2 }); // level 2 uses mouse pointer events, 1 and 3 touch
    const won = await winShown();
    const sv = await saved(id);
    ok(`level ${id} solved by ${id === 2 ? 'mouse' : 'touch'} drag (${sol.length} holes)`, won && sv, `win=${won} saved=${sv}`);
    await sleep(1200);
    await b.click('.sheet .btn.primary'); // Next level
  }
  // ---- 8x8+ level by touch ----
  const big = await b.evaluate(`__stitchApp.levels.find(l=>l.n>=8).id`);
  await b.evaluate(`document.querySelectorAll('.sheet-bg').forEach(e=>e.remove()); __stitchApp.openLevel(${big}); 1`);
  await b.waitFor(`window.__stitch && __stitch.cfg.id === ${big}`);
  await sleep(500);
  const bsol = await b.evaluate('__stitch.session.p.sol');
  const bn = await b.evaluate('__stitch.session.n');
  await dragPath(bsol, { sub: 3, jitter: 3 });
  const bwon = await winShown();
  ok(`level ${big} (${bn}x${bn}) solved by touch drag`, bwon && await saved(big));
  // ---- persistence across reload ----
  await b.goto(BASE + '?nosw', 1500);
  await b.waitFor('window.__stitchApp');
  const persisted = await b.evaluate(`(()=>{const s=__stitchApp.store.get(); return [1,2,3,${big}].every(i=>s.levels[i]) && s.quilt.length>=4})()`);
  ok('saves persist after reload (levels + quilt blocks)', persisted);
  // ---- erratic input on a 10x10 ----
  const ten = await b.evaluate(`__stitchApp.levels.find(l=>l.n===10).id`);
  await b.evaluate(`__stitchApp.openLevel(${ten}); 1`);
  await b.waitFor(`window.__stitch && __stitch.cfg.id === ${ten}`);
  await sleep(400);
  const geo = await b.evaluate(`(()=>{const bd=__stitch.board, r=bd.cv.getBoundingClientRect(); return {l:r.left+bd.bx, t:r.top+bd.by, S:bd.S, n:__stitch.session.n};})()`);
  const rnd = (a, z) => a + Math.random() * (z - a);
  let actions = 0;
  for (let k = 0; k < 120; k++) {
    const r = Math.random();
    if (r < 0.55) { // random scribble drag (starts anywhere, sometimes on the head)
      let x, y;
      if (Math.random() < 0.6) { const h = await b.evaluate(`(()=>{const bd=__stitch.board, rr=bd.cv.getBoundingClientRect(); const p=bd.cellXY(__stitch.session.head); return [rr.left+p[0], rr.top+p[1]];})()`); [x, y] = h; }
      else { x = rnd(geo.l - 20, geo.l + geo.S + 20); y = rnd(geo.t - 20, geo.t + geo.S + 20); }
      await b.touch('touchStart', x, y);
      const steps = 5 + Math.floor(Math.random() * 40);
      for (let s = 0; s < steps; s++) { x += rnd(-1, 1) * geo.S / geo.n * (Math.random() < 0.2 ? 2.5 : 0.8); y += rnd(-1, 1) * geo.S / geo.n * (Math.random() < 0.2 ? 2.5 : 0.8); await b.touch('touchMove', x, y); }
      await b.touch('touchEnd', x, y);
    } else if (r < 0.7) { for (let u = 0; u < 1 + Math.floor(Math.random() * 12); u++) await b.click('.tools .tool:nth-child(1)'); } // undo spam
    else if (r < 0.75) await b.click('.tools .tool:nth-child(2)'); // reset
    else if (r < 0.8) { // two fingers at once
      await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rnd(geo.l, geo.l + geo.S), y: rnd(geo.t, geo.t + geo.S), id: 1 }, { x: rnd(geo.l, geo.l + geo.S), y: rnd(geo.t, geo.t + geo.S), id: 2 }] });
      await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else { // drag back along the thread (backtrack)
      const P = await b.evaluate('__stitch.session.path');
      if (P.length > 3) { const back = P.slice(Math.max(0, P.length - 1 - Math.floor(Math.random() * 10))).reverse(); await dragPath(back, { sub: 2 }); }
    }
    actions++;
  }
  const state = await b.evaluate(`(()=>{const s=__stitch.session; return {valid: s.validPrefix(s.path) && s.path[0]===s.p.start, drag: __stitch.board.drag, len: s.path.length}})()`);
  ok(`erratic pass: ${actions} random actions, state valid, no stuck drag`, state.valid && state.drag === null, `path=${state.len}`);
  // must still be fully playable: reset and solve with real touch
  await b.click('.tools .tool:nth-child(2)');
  await sleep(200);
  const tsol = await b.evaluate('__stitch.session.p.sol');
  await dragPath(tsol, { sub: 3, jitter: 2 });
  ok(`after the erratic pass, level ${ten} (10x10) still solvable by touch`, await winShown());
  await sleep(1500);
  ok('0 console errors', b.errors.length === 0, b.errors.length ? JSON.stringify(b.errors.slice(0, 5)) : '');
} catch (e) { console.error('PLAY TEST CRASHED', e); code = 2; }
const failed = results.filter((r) => !r.pass).length;
if (!code && failed) code = 1;
console.log(`\nGATE 2 ${code === 0 ? 'PASS' : 'FAIL'}: ${results.length - failed}/${results.length} checks`);
await b.close(); if (server) server.close();
process.exit(code);
