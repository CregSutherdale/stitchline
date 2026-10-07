// Renders app icons with the game's procedural art in headless Edge -> assets/icons/*.png
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import { launch } from './cdp.mjs';

fs.mkdirSync('.icon', { recursive: true });
await esbuild.build({ entryPoints: ['src/iconpage.js'], bundle: true, outfile: '.icon/icon.js', format: 'iife' });
const b = await launch({ w: 600, h: 600, dpr: 1, mobile: false });
await b.goto('about:blank', 100);
await b.evaluate(fs.readFileSync('.icon/icon.js', 'utf8') + ';1');
fs.mkdirSync('assets/icons', { recursive: true });
for (const [name, size, mask] of [['icon-180.png', 180, false], ['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-512-maskable.png', 512, true]]) {
  const url = await b.evaluate(`drawIcon(${size}, ${mask})`);
  fs.writeFileSync(`assets/icons/${name}`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', name);
}
console.log('errors:', b.errors.length ? b.errors : 'none');
await b.close();
fs.rmSync('.icon', { recursive: true, force: true });
process.exit(b.errors.length ? 1 : 0);
