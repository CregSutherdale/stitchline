// SAVE MIGRATION GATE: a save made by the v1 LIVE build (tests/fixtures/save_v1_live.json, captured
// with real touch play on the live site) must survive the update with progress, stars, quilt blocks,
// hints, daily streak, the in-progress level and settings intact.
//   node tools/test_migration.mjs [baseUrl]   (default: local dist; pass the live URL after deploy)
import fs from 'node:fs';
import { migrate } from '../src/store.js';
import { launch } from './cdp.mjs';

const fx = JSON.parse(fs.readFileSync('tests/fixtures/save_v1_live.json', 'utf8'));
const v1 = JSON.parse(fx.raw);
const checks = [];
const ok = (name, pass, info = '') => { checks.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1. pure migration
const m = migrate(JSON.parse(fx.raw));
ok('unit: schema bumped to v2', m.v === 2);
ok('unit: every level record (stars, best, hints) kept', same(m.levels, v1.levels), Object.keys(m.levels).join(','));
ok('unit: quilt blocks kept (path, pins, time) + first-sewn time added', m.quilt.length === v1.quilt.length && m.quilt.every((q, i) => q.path === v1.quilt[i].path && q.key === v1.quilt[i].key && q.t === v1.quilt[i].t && q.ts0 === v1.quilt[i].ts));
ok('unit: hints, daily streak + solved days kept', m.hints === v1.hints && same(m.daily, v1.daily));
ok('unit: in-progress level kept', same(m.current, v1.current), m.current && `${m.current.key} path ${m.current.path.length}`);
ok('unit: settings kept (music off), clock defaults to time taken', m.settings.music === v1.settings.music && m.settings.sound === v1.settings.sound && m.settings.clock === 'up');
ok('unit: stats seeded from existing solves', m.stats.solves.length === v1.quilt.length);
ok('unit: migrating twice is stable', same(migrate(JSON.parse(JSON.stringify(m))), m));

// 2. real browser: new build boots on the old save
let server = null;
const ext = process.argv[2];
if (!ext) server = (await import('./serve.mjs')).default;
const BASE = ext || 'http://localhost:5317/';
const b = await launch({ w: 390, h: 844, dpr: 2 });
try {
  await b.goto(BASE + '?nosw', 1200);
  await b.evaluate(`localStorage.clear(); localStorage.setItem('stitchline.v1', ${JSON.stringify(fx.raw)}); 1`);
  await b.goto(BASE + '?nosw', 2000);
  await b.waitFor('window.__stitchApp && document.querySelector(".home")');
  const st = await b.evaluate(`(()=>{const s=__stitchApp.store.get(); return {v:s.v, levels:s.levels, quilt:s.quilt.length, hints:s.hints, daily:s.daily, cur:s.current&&s.current.key, curLen:s.current&&s.current.path.length, music:s.settings.music, backup:!!localStorage.getItem('stitchline.backup.v1'), stored: JSON.parse(localStorage.getItem('stitchline.v1')).v}})()`);
  ok('browser: save loaded + migrated in place (v2 written back)', st.v === 2 && st.stored === 2);
  ok('browser: raw v1 backup kept', st.backup);
  ok('browser: levels/stars/best times intact', same(st.levels, v1.levels));
  ok('browser: quilt blocks + hints + daily intact', st.quilt === v1.quilt.length && st.hints === v1.hints && same(st.daily, v1.daily));
  const homeTxt = await b.evaluate(`document.querySelector('.home').innerText`);
  ok('browser: home shows the old progress', homeTxt.includes(`${Object.keys(v1.levels).length} of 180 stitched`) && homeTxt.includes(`${v1.quilt.length} blocks`), homeTxt.replace(/\s+/g, ' ').slice(0, 160));
  await b.evaluate(`__stitchApp.openLevel(4);1`); await b.sleep(800);
  const resumed = await b.evaluate(`__stitch.session.path.length`);
  ok('browser: half-threaded level 4 resumes where she left it', resumed === v1.current.path.length, `path ${resumed}`);
  await b.evaluate(`__stitchApp.show('chest');1`); await b.sleep(900);
  ok('browser: Quilt Chest renders her blocks', (await b.evaluate(`document.querySelectorAll('.qcell').length`)) === v1.quilt.length);
  await b.evaluate(`__stitchApp.show('stats');1`); await b.sleep(500);
  await b.evaluate(`__stitchApp.show('daily');1`); await b.sleep(500);
  ok('browser: Daily calendar marks the solved day', (await b.evaluate(`document.querySelectorAll('.cal-day.done').length`)) >= 1);
  await b.sleep(800);
  ok('browser: 0 console errors', b.errors.length === 0, b.errors.slice(0, 3).join(' | '));
} catch (e) { console.error('MIGRATION BROWSER TEST CRASHED', e); checks.push(false); }
await b.close(); if (server) server.close();
const failed = checks.filter((x) => !x).length;
console.log(`\nMIGRATION GATE ${failed ? 'FAIL' : 'PASS'}: ${checks.length - failed}/${checks.length} (fixture from live build ${fx.build}, captured ${fx.capturedAt})`);
process.exit(failed ? 1 : 0);
