// GATE 3 capture: full-resolution phone screenshots of every key screen at a given size.
// node tools/shots.mjs [--w 390 --h 844 --dpr 3] [--only a,b] [--url base]  -> docs/shots/<w>x<h>/*.png
import { launch } from './cdp.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const W = +arg('--w', 390), H = +arg('--h', 844), DPR = +arg('--dpr', 3);
const only = arg('--only', null)?.split(',');
const ext = arg('--url', null);
const server = ext ? null : (await import('./serve.mjs')).default;
const base = (ext || 'http://localhost:5317/') + '?nosw';
const dir = `docs/shots/${W}x${H}`;
const b = await launch({ w: W, h: H, dpr: DPR });
const want = (n) => !only || only.includes(n);
const clean = `document.querySelectorAll('.sheet-bg,.reveal-bg').forEach(e=>e.remove());`;
let code = 0;
try {
  await b.goto(base, 1500);
  await b.evaluate('localStorage.clear();1');
  await b.goto(base, 1800);
  await b.waitFor('window.__stitchApp && document.querySelector(".home")');
  // A lived-in save: 40 levels solved, 14 blocks, a streak, stars for unlocks.
  await b.evaluate(`(()=>{const st=__stitchApp.store.get(), L=__stitchApp.levels, enc=__stitchApp.store.enc;
    for(let i=1;i<=40;i++){ st.levels[i]={stars: i%5?3:2, best: 40000+i*4000, hints: i%7?0:1}; }
    const now=Date.now(); const day=86400000;
    for(const [k,i] of [1,7,12,18,25,33,40,9,15,22,28,36,3,5].entries()){const l=L[i-1]; st.quilt.push({k:'c',id:String(i),key:'campaign:'+i+':',n:l.n,pins:enc(l.pins),path:enc(l.sol),t:60000+i*3000,ts:now-k*day,ts0:now-(20-k)*day}); st.stats.solves.push({m:'c',id:String(i),n:l.n,t:50000+i*4100+(k%3)*20000,h:k%4?0:1,ts:now-(20-k)*day});}
    const dk=(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    for(const o of [1,2,3,5,6,8,9,10]){const d=new Date(now-o*day); st.daily.solved[dk(d)]=200000+o*9000;}
    st.daily.last=dk(new Date(now-day)); st.daily.streak=3; st.daily.bestStreak=5; st.quiltsSeen=1; st.hints=4;
    __stitchApp.store.save(true); return 1})()`);
  await b.goto(base, 1500);
  await b.waitFor('window.__stitchApp && document.querySelector(".home")');
  if (want('menu')) { await b.sleep(1500); await b.shot(`${dir}/01_menu.png`); }
  if (want('tutorial')) { await b.evaluate('__stitchApp.openLevel(5)'); await b.sleep(1800); await b.shot(`${dir}/02_tutorial_L5.png`); }
  if (want('eye')) { await b.evaluate('__stitchApp.openLevel(121)'); await b.sleep(1900); await b.shot(`${dir}/03_tutorial_eye_L121.png`); await b.evaluate('__stitchApp.openLevel(126)'); await b.sleep(1900); await b.shot(`${dir}/03b_tutorial_seam_L126.png`); }
  if (want('hard')) {
    const id = await b.evaluate(`__stitchApp.levels.find(l=>l.id>131 && l.seams && l.seams.length>=3).id`);
    await b.evaluate(`__stitchApp.openLevel(${id})`); await b.sleep(900);
    await b.evaluate(`(()=>{const s=__stitch.session; s.path=s.p.sol.slice(0, Math.floor(s.p.sol.length*0.4)); __stitch.board.statusCache=s.status(); __stitch.board.seamCache=s.seamStatus(); __stitch.board.dirty=true; return 1})()`);
    await b.sleep(300); await b.click('.tools .tool:nth-child(3)'); await b.sleep(800);
    await b.shot(`${dir}/04_hard_seams_L${id}.png`);
    await b.evaluate('__stitchApp.openLevel(40)'); await b.sleep(900); await b.shot(`${dir}/05_hard_L40.png`);
  }
  if (want('win')) {
    await b.evaluate(`${clean} __stitchApp.openLevel(41)`); await b.sleep(700);
    await b.evaluate(`(()=>{const s=__stitch.session; s.path=s.p.sol.slice(0,-1); return 1})()`);
    const [ax, ay, bx, by] = await b.evaluate(`(()=>{const bd=__stitch.board, s=__stitch.session, r=bd.cv.getBoundingClientRect(); const a=bd.cellXY(s.p.sol.at(-2)), c=bd.cellXY(s.p.sol.at(-1)); return [r.left+a[0], r.top+a[1], r.left+c[0], r.top+c[1]];})()`);
    await b.touch('touchStart', ax, ay); for (let k = 1; k <= 8; k++) { await b.touch('touchMove', ax + (bx - ax) * k / 8, ay + (by - ay) * k / 8); await b.sleep(16); } await b.touch('touchEnd', bx, by);
    await b.sleep(3500); await b.shot(`${dir}/06_win.png`);
  }
  if (want('quilt')) {
    await b.evaluate(`${clean} __stitchApp.show('chest');1`); await b.sleep(1200); await b.shot(`${dir}/07_quilt_chest.png`);
    await b.evaluate(`__stitchApp.quiltReveal(0);1`); await b.sleep(1300); await b.shot(`${dir}/08_quilt_reveal_mid.png`);
    await b.sleep(2600); await b.shot(`${dir}/09_quilt_reveal_done.png`);
    await b.evaluate(`${clean}1`);
  }
  if (want('daily')) { await b.evaluate(`__stitchApp.show('daily');1`); await b.sleep(800); await b.shot(`${dir}/10_daily_calendar.png`); }
  if (want('stats')) { await b.evaluate(`__stitchApp.show('stats');1`); await b.sleep(900); await b.shot(`${dir}/11_stats.png`); }
  if (want('sewing')) { await b.evaluate(`__stitchApp.show('sewing');1`); await b.sleep(900); await b.shot(`${dir}/12_sewing_box.png`); }
  if (want('levels')) { await b.evaluate(`__stitchApp.show('levels');1`); await b.sleep(900); await b.evaluate(`document.querySelectorAll('.chapter')[12].scrollIntoView();1`); await b.sleep(300); await b.shot(`${dir}/13_levels_new_chapters.png`); }
  if (want('howto')) { await b.evaluate(`__stitchApp.show('howto');1`); await b.sleep(900); await b.evaluate(`window.scrollTo(0, document.body.scrollHeight);1`); await b.sleep(300); await b.shot(`${dir}/14_howto_new_rules.png`); }
  if (want('dailyplay')) { await b.evaluate(`__stitchApp.openDaily()`); await b.waitFor('document.querySelector(".board-cv")', 90000); await b.sleep(900); await b.shot(`${dir}/15_daily_play.png`); }
  console.log(`${W}x${H} console errors:`, b.errors.length ? b.errors : 'none');
  if (b.errors.length) code = 1;
} catch (e) { console.error('SHOTS FAILED', e); code = 2; }
await b.close(); if (server) server.close();
process.exit(code);
