// Renders the app icon with the game's own procedural art (used by tools/make_icons.mjs).
import { linenTile, eyelet, yarn, needle, roundRect, pearl, darkButton, shade } from './art.js';

window.drawIcon = (size, maskable) => {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const x = c.getContext('2d');
  const s = size / 512;
  x.fillStyle = '#efe4d1'; x.fillRect(0, 0, size, size);
  const pad = maskable ? 0 : 0;
  // fabric swatch
  x.save();
  roundRect(x, pad, pad, size - 2 * pad, size - 2 * pad, maskable ? 0 : 110 * s); x.clip();
  x.fillStyle = '#8fa88b'; x.fillRect(0, 0, size, size);
  x.fillStyle = x.createPattern(linenTile('#8fa88b', 9), 'repeat'); x.fillRect(0, 0, size, size);
  const g = x.createRadialGradient(size / 2, size * 0.4, size * 0.1, size / 2, size / 2, size * 0.75);
  g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(40,20,20,0.22)'); x.fillStyle = g; x.fillRect(0, 0, size, size);
  x.restore();
  // stitched border
  x.save(); x.strokeStyle = 'rgba(255,248,235,0.8)'; x.lineWidth = 9 * s; x.setLineDash([26 * s, 18 * s]);
  const ins = maskable ? 70 * s : 34 * s;
  roundRect(x, ins, ins, size - 2 * ins, size - 2 * ins, 80 * s); x.stroke(); x.restore();
  // 3x3 holes + a thread
  const n = 3, inner = maskable ? 300 * s : 340 * s, cs = inner / (n - 1), o = (size - inner) / 2;
  const xy = (cIdx) => [o + (cIdx % n) * cs, o + Math.floor(cIdx / n) * cs];
  for (let i = 0; i < 9; i++) { const [a, b] = xy(i); eyelet(x, a, b, 15 * s); }
  const path = [6, 3, 0, 1, 4, 7, 8, 5, 2];
  yarn(x, path.map(xy), 46 * s, '#c9473e');
  const [px, py] = xy(4); pearl(x, px, py, 44 * s);
  const [qx, qy] = xy(0); darkButton(x, qx, qy, 44 * s);
  const [ex, ey] = xy(2);
  x.strokeStyle = shade('#c9473e', -0.2); x.lineWidth = 0;
  needle(x, ex + 70 * s, ey - 70 * s, -Math.PI / 4, 150 * s, 15 * s);
  return c.toDataURL('image/png');
};
document.title = 'icon-ready';
