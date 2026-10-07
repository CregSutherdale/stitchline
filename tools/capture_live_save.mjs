// Make a REAL v1 save with the currently-live build (before round 2 deploys): solve levels 1-3 and
// today's Daily with real touch drags, leave level 4 half-threaded with a hint used, turn music off.
import fs from 'node:fs';
import { launch } from './cdp.mjs';
const URL_ = process.argv[2] || 'https://cregsutherdale.github.io/stitchline/';
const b = await launch({ w: 390, h: 844, dpr: 2 });
const drag = async (cells) => {
  const pts = await b.evaluate(`(()=>{const bd=__stitch.board, r=bd.cv.getBoundingClientRect(); return ${JSON.stringify(cells)}.map(c=>{const p=bd.cellXY(c); return [r.left+p[0], r.top+p[1]];});})()`);
  await b.touch('touchStart', ...pts[0]);
  for (let i = 1; i < pts.length; i++) for (let k = 1; k <= 3; k++) await b.touch('touchMove', pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k / 3, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k / 3);
  await b.touch('touchEnd', ...pts.at(-1));
};
await b.goto(URL_ + '?nosw', 2000); await b.evaluate('localStorage.clear();1'); await b.goto(URL_ + '?nosw', 2000);
const build = await b.evaluate('window.__SL_BUILD');
await b.click('.card.primary');
for (const id of [1, 2, 3]) {
  await b.waitFor(`window.__stitch && __stitch.cfg.id===${id}`); await b.sleep(400);
  await drag(await b.evaluate('__stitch.session.p.sol'));
  await b.waitFor(`!!document.querySelector('.sheet h2')`); await b.sleep(1200);
  await b.click('.sheet .btn.primary');
}
await b.waitFor('window.__stitch && __stitch.cfg.id===4'); await b.sleep(400);
const s4 = await b.evaluate('__stitch.session.p.sol');
await drag(s4.slice(0, 8)); await b.sleep(300);
await b.click('.tools .tool:nth-child(3)'); await b.sleep(500); // real hint tap
await b.click('.topbar .icon-btn'); await b.sleep(600);
await b.evaluate(`__stitchApp.show('home');1`); await b.sleep(300);
await b.click('.row2 .card'); // Daily Stitch
await b.waitFor(`window.__stitch && __stitch.cfg.mode==='daily'`, 60000); await b.sleep(500);
await drag(await b.evaluate('__stitch.session.p.sol'));
await b.waitFor(`!!document.querySelector('.sheet h2')`); await b.sleep(1200);
await b.evaluate(`document.querySelectorAll('.sheet-bg').forEach(e=>e.remove()); __stitchApp.openLevel(4);1`);
await b.waitFor('window.__stitch && __stitch.cfg.id===4'); await b.sleep(400);
await drag(s4.slice(0, 8)); await b.sleep(300);
await b.click('.tools .tool:nth-child(3)'); await b.sleep(500);
await b.click('.topbar .icon-btn'); await b.sleep(600);
await b.evaluate(`__stitchApp.show('settings');1`); await b.sleep(400);
await b.evaluate(`(()=>{const rows=[...document.querySelectorAll('.set-row')]; const m=rows.find(r=>r.textContent.includes('Music')); m.click(); return 1})()`); await b.sleep(400);
const raw = await b.evaluate(`localStorage.getItem('stitchline.v1')`);
fs.writeFileSync('tests/fixtures/save_v1_live.json', JSON.stringify({ capturedFrom: URL_, build, capturedAt: new Date().toISOString(), raw }, null, 1));
const d = JSON.parse(raw);
console.log('build', build, '| levels', Object.keys(d.levels), '| quilt', d.quilt.length, '| hints', d.hints, '| daily', JSON.stringify(d.daily), '| current', d.current && d.current.key, d.current && d.current.path.length, '| music', d.settings.music, '| errors', b.errors);
await b.close(); process.exit(b.errors.length ? 1 : 0);
