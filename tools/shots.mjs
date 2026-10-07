// Full-resolution phone screenshots (390x844 @3x) of the key screens -> docs/shots/*.png
// node tools/shots.mjs [--only name,name]
import { launch } from './cdp.mjs';
import server from './serve.mjs';

const port = 5317;
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const b = await launch({ w: 390, h: 844, dpr: 3 });
const base = `http://localhost:${port}/?nosw`;
const want = (n) => !only || only.includes(n);
let code = 0;
try {
  await b.goto(base, 1800);
  await b.waitFor('window.__stitchApp && document.querySelector(".home")');
  // seed some progress so the menu + chest look lived-in
  await b.evaluate(`(()=>{const st=__stitchApp.store.get(); return 1})()`);
  if (want('menu')) { await b.sleep(1600); await b.shot('docs/shots/01_menu.png'); }
  if (want('tutorial')) {
    await b.evaluate('__stitchApp.openLevel(5)'); await b.sleep(1700);
    await b.shot('docs/shots/02_tutorial_L5.png');
  }
  if (want('hard')) {
    await b.evaluate('__stitchApp.openLevel(40)'); await b.sleep(900);
    // thread part of the solution so the board shows play in progress
    await b.evaluate(`(()=>{const s=__stitch.session; s.path=s.p.sol.slice(0, Math.floor(s.p.sol.length*0.45)); __stitch.board.statusCache=s.status(); __stitch.board.dirty=true; return 1})()`);
    await b.sleep(300);
    await b.evaluate(`(()=>{const s=__stitch.session; s.path=s.path.slice(0,-3); return 1})()`);
    await b.click('.tools .tool:nth-child(3)'); // real tap on Hint
    await b.sleep(700);
    await b.shot('docs/shots/03_hard_L40.png');
    await b.evaluate('__stitchApp.openLevel(110)'); await b.sleep(900);
    await b.shot('docs/shots/04_expert_L110.png');
  }
  if (want('win')) {
    await b.evaluate('__stitchApp.openLevel(3)'); await b.sleep(700);
    await b.evaluate(`(()=>{const s=__stitch.session; s.path=s.p.sol.slice(0,-1); return 1})()`);
    // final segment by real touch drag
    const [ax, ay, bx, by] = await b.evaluate(`(()=>{const bd=__stitch.board, s=__stitch.session, r=bd.cv.getBoundingClientRect(); const a=bd.cellXY(s.p.sol.at(-2)), c=bd.cellXY(s.p.sol.at(-1)); return [r.left+a[0], r.top+a[1], r.left+c[0], r.top+c[1]];})()`);
    await b.touch('touchStart', ax, ay); for (let k = 1; k <= 8; k++) { await b.touch('touchMove', ax + (bx - ax) * k / 8, ay + (by - ay) * k / 8); await b.sleep(16); } await b.touch('touchEnd', bx, by);
    await b.sleep(3400);
    await b.shot('docs/shots/05_win.png');
  }
  if (want('chest')) {
    await b.evaluate(`(()=>{document.querySelectorAll('.sheet-bg').forEach(e=>e.remove()); const st=__stitchApp.store.get(); const L=__stitchApp.levels; const enc=__stitchApp.store.enc; for(const i of [1,7,12,18,25,33,41,52,64,77,88,99]){const l=L[i-1]; st.quilt.push({k:'c',id:String(i),key:'c:'+i+':',n:l.n,pins:enc(l.pins),path:enc(l.sol),t:60000+i*1000,ts:Date.now()});} __stitchApp.show('chest'); return 1})()`);
    await b.sleep(1200);
    await b.shot('docs/shots/06_quilt_chest.png');
  }
  if (want('levels')) { await b.evaluate(`__stitchApp.show('levels')`); await b.sleep(900); await b.shot('docs/shots/07_levels.png'); }
  if (want('howto')) { await b.evaluate(`__stitchApp.show('howto')`); await b.sleep(900); await b.shot('docs/shots/08_howto.png'); }
  if (want('daily')) { await b.evaluate(`__stitchApp.openDaily()`); await b.waitFor('document.querySelector(".board-cv")', 60000); await b.sleep(900); await b.shot('docs/shots/09_daily.png'); }
  console.log('console errors:', b.errors.length ? b.errors : 'none');
  if (b.errors.length) code = 1;
} catch (e) { console.error('SHOTS FAILED', e); code = 2; }
await b.close(); server.close();
process.exit(code);
