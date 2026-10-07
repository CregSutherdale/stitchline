// Procedural art: fabrics, eyelets, pins, beads, buttons, yarn, needle, quilt blocks.
// Everything is drawn with Canvas 2D code. No image assets.
import { makeRng } from './core/rng.js';

export const PAL = {
  cream: '#f6eedf', linen: '#efe3cf', ink: '#3a2b33', inkSoft: '#6b5862',
  madder: '#c9473e', madderDark: '#8f2c27', madderLight: '#ec7a6c',
  mustard: '#e3a63c', sage: '#93ab8f', denim: '#5f7d9c', plum: '#7a4c6a', rose: '#e7a3a0', gold: '#e9b949',
};

// Chapter boards (mid-tone so white beads and dark buttons both read) and thread colours.
export const BOARDS = [
  { name: 'sage', base: '#8fa88b', dark: '#6e8a6b', light: '#b3c7ad' },
  { name: 'denim', base: '#6f8cab', dark: '#536f8e', light: '#9db3c9' },
  { name: 'heather', base: '#a08aa6', dark: '#7f6987', light: '#c3b2c6' },
  { name: 'ochre', base: '#c39a5a', dark: '#a07b40', light: '#dcc08e' },
  { name: 'teal', base: '#6f9d9a', dark: '#527d7a', light: '#9fc2bf' },
  { name: 'rosewood', base: '#b0827a', dark: '#8d6159', light: '#d0aaa2' },
];

const cache = new Map();
function tile(key, w, h, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  cache.set(key, c);
  return c;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; } else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export { shade };

// Woven texture overlay: fine warp/weft threads with jitter.
function weave(ctx, w, h, seed, strength = 1) {
  const rng = makeRng('weave' + seed);
  for (let y = 0; y < h; y += 2) {
    ctx.fillStyle = `rgba(255,255,255,${(0.025 + rng.next() * 0.05) * strength})`;
    ctx.fillRect(0, y, w, 1);
    ctx.fillStyle = `rgba(0,0,0,${(0.02 + rng.next() * 0.04) * strength})`;
    ctx.fillRect(0, y + 1, w, 1);
  }
  for (let x = 0; x < w; x += 2) {
    ctx.fillStyle = `rgba(255,255,255,${(0.02 + rng.next() * 0.04) * strength})`;
    ctx.fillRect(x, 0, 1, h);
    ctx.fillStyle = `rgba(0,0,0,${(0.015 + rng.next() * 0.03) * strength})`;
    ctx.fillRect(x + 1, 0, 1, h);
  }
  for (let i = 0; i < (w * h) / 60; i++) { // slubs
    const x = rng.next() * w, y = rng.next() * h, l = 2 + rng.next() * 7;
    ctx.fillStyle = rng.next() < 0.5 ? `rgba(255,255,255,${0.06 * strength})` : `rgba(0,0,0,${0.05 * strength})`;
    if (rng.next() < 0.5) ctx.fillRect(x, y, l, 1); else ctx.fillRect(x, y, 1, l);
  }
}

export function linenTile(color, seed = 1) {
  return tile(`linen${color}${seed}`, 128, 128, (ctx, w, h) => { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); weave(ctx, w, h, seed, 1); });
}

// Quilt fabrics: return a pattern tile canvas.
export const FABRIC_KINDS = ['gingham', 'polka', 'calico', 'stripe', 'plaid', 'herring', 'star', 'solid'];
export const FABRIC_COLORS = [
  ['#e9a6a1', '#c9473e', '#fbf3e6'], ['#a9c4a4', '#5e8a5a', '#f5f0e2'], ['#9fb7d2', '#4f6f93', '#f4f0e6'],
  ['#efcf86', '#c58f2a', '#fbf5e5'], ['#c8b3d0', '#7a5689', '#f7f1ea'], ['#f1bf9a', '#c46a3a', '#fbf2e7'],
  ['#9ccbc6', '#3f8580', '#f2f1e6'], ['#e3c4b4', '#9a5f4c', '#fbf4ec'],
];
export function fabricTile(kind, colors, seed = 1, s = 48) {
  const [mid, deep, light] = colors;
  return tile(`fab${kind}${colors.join()}${seed}${s}`, s, s, (ctx, w, h) => {
    const rng = makeRng('fab' + seed + kind);
    ctx.fillStyle = light; ctx.fillRect(0, 0, w, h);
    if (kind === 'gingham') {
      ctx.fillStyle = mid; ctx.globalAlpha = 0.55;
      ctx.fillRect(0, 0, w / 2, h); ctx.fillRect(0, 0, w, h / 2);
      ctx.globalAlpha = 1; ctx.fillStyle = deep; ctx.globalAlpha = 0.55; ctx.fillRect(0, 0, w / 2, h / 2); ctx.globalAlpha = 1;
    } else if (kind === 'polka') {
      ctx.fillStyle = mid; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = light;
      for (const [x, y] of [[w * 0.25, h * 0.25], [w * 0.75, h * 0.75]]) { ctx.beginPath(); ctx.arc(x, y, w * 0.09, 0, 7); ctx.fill(); }
    } else if (kind === 'calico') {
      ctx.fillStyle = mid; ctx.globalAlpha = 0.35; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        const x = ((i % 2) + 0.5 + (rng.next() - 0.5) * 0.3) * w / 2, y = (((i / 2) | 0) + 0.5 + (rng.next() - 0.5) * 0.3) * h / 2;
        ctx.fillStyle = deep;
        for (let k = 0; k < 5; k++) { const a = k * 1.2566 + rng.next(); ctx.beginPath(); ctx.arc(x + Math.cos(a) * w * 0.045, y + Math.sin(a) * w * 0.045, w * 0.035, 0, 7); ctx.fill(); }
        ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(x, y, w * 0.025, 0, 7); ctx.fill();
        ctx.strokeStyle = shade(mid, -0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + w * 0.06, y + w * 0.05); ctx.quadraticCurveTo(x + w * 0.14, y + w * 0.02, x + w * 0.16, y + w * 0.12); ctx.stroke();
      }
    } else if (kind === 'stripe') {
      ctx.fillStyle = mid; for (let x = 0; x < w; x += w / 4) ctx.fillRect(x, 0, w / 8, h);
      ctx.fillStyle = deep; ctx.globalAlpha = 0.6; for (let x = w / 8; x < w; x += w / 2) ctx.fillRect(x + w / 32, 0, w / 32, h); ctx.globalAlpha = 1;
    } else if (kind === 'plaid') {
      ctx.fillStyle = mid; ctx.globalAlpha = 0.5; ctx.fillRect(0, h * 0.1, w, h * 0.35); ctx.fillRect(w * 0.1, 0, w * 0.35, h);
      ctx.fillStyle = deep; ctx.globalAlpha = 0.5; ctx.fillRect(0, h * 0.7, w, h * 0.06); ctx.fillRect(w * 0.7, 0, w * 0.06, h);
      ctx.globalAlpha = 0.25; ctx.fillRect(0, h * 0.25, w, h * 0.05); ctx.fillRect(w * 0.25, 0, w * 0.05, h); ctx.globalAlpha = 1;
    } else if (kind === 'herring') {
      ctx.strokeStyle = mid; ctx.lineWidth = w / 10;
      for (let y = -h; y < 2 * h; y += h / 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w / 2, y + h / 4); ctx.lineTo(w, y); ctx.stroke(); }
    } else if (kind === 'star') {
      ctx.fillStyle = mid; ctx.globalAlpha = 0.3; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
      ctx.fillStyle = deep;
      const star = (x, y, r) => { ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.fill(); };
      star(w * 0.25, h * 0.3, w * 0.09); star(w * 0.75, h * 0.78, w * 0.07);
    } else { ctx.fillStyle = mid; ctx.fillRect(0, 0, w, h); }
    weave(ctx, w, h, seed, 0.8);
  });
}

// ---- small objects ----
export function eyelet(ctx, x, y, r, visited) {
  // brass grommet ring
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.2, x, y, r * 1.5);
  g.addColorStop(0, '#fff3cf'); g.addColorStop(0.45, '#d8b56a'); g.addColorStop(1, '#8d6a2e');
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.arc(x, y + r * 0.25, r * 1.45, 0, 7); ctx.fill();
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 1.4, 0, 7); ctx.fill();
  // hole
  const h = ctx.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
  h.addColorStop(0, '#1c1412'); h.addColorStop(1, '#3d2c22');
  ctx.fillStyle = h; ctx.beginPath(); ctx.arc(x, y, r * 0.82, 0, 7); ctx.fill();
}

export function pinHead(ctx, x, y, r, color) {
  // shaft (leans to the lower right) + glossy ball head
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = Math.max(1.5, r * 0.22); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + r * 0.2, y + r * 0.5); ctx.lineTo(x + r * 1.65, y + r * 1.75); ctx.stroke();
  const sg = ctx.createLinearGradient(x, y, x + r * 1.5, y + r * 1.5);
  sg.addColorStop(0, '#f4f6f8'); sg.addColorStop(1, '#8c949c');
  ctx.strokeStyle = sg; ctx.lineWidth = Math.max(1.2, r * 0.16);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + r * 1.5, y + r * 1.5); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x + r * 0.15, y + r * 0.35, r * 0.95, r * 0.8, 0, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(color, 0.6)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.45));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.25, r * 0.17, -0.6, 0, 7); ctx.fill();
  ctx.restore();
}

export function pearl(ctx, x, y, r) { // straight stitch: white bead
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(x + r * 0.08, y + r * 0.22, r * 1.02, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f6f1ea'); g.addColorStop(1, '#c9bfb5');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(90,70,60,0.35)'; ctx.lineWidth = Math.max(1, r * 0.07); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.42, r * 0.28, r * 0.18, -0.7, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(110,90,80,0.55)'; ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, 7); ctx.fill();
}

export function darkButton(ctx, x, y, r) { // corner stitch: dark sewing button
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x + r * 0.08, y + r * 0.22, r * 1.02, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, '#6c5560'); g.addColorStop(0.6, '#3a2930'); g.addColorStop(1, '#22161b');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,235,220,0.35)'; ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, 7); ctx.stroke();
  ctx.fillStyle = '#140c10';
  const o = r * 0.24;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(x + dx * o, y + dy * o, r * 0.11, 0, 7); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.ellipse(x - r * 0.38, y - r * 0.45, r * 0.25, r * 0.13, -0.7, 0, 7); ctx.fill();
}

export function woodButton(ctx, x, y, r, label) { // numbered button
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.arc(x + r * 0.08, y + r * 0.22, r * 1.02, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, '#f6d9a5'); g.addColorStop(0.6, '#d5a35e'); g.addColorStop(1, '#a8743a');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(120,70,30,0.5)'; ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, 7); ctx.stroke();
  ctx.fillStyle = '#5a3418';
  ctx.font = `800 ${Math.round(r * 1.05)}px Nunito, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(label), x, y + r * 0.06);
}

export function knotMark(ctx, x, y, r, color) { // the KNOT hole: a tied loop of thread
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = r * 0.42; ctx.lineCap = 'round';
  const loop = (ox, oy) => {
    ctx.beginPath();
    ctx.moveTo(x + ox - r * 0.9, y + oy + r * 0.55);
    ctx.bezierCurveTo(x + ox - r * 1.2, y + oy - r * 0.9, x + ox + r * 0.9, y + oy - r * 1.1, x + ox + r * 0.35, y + oy + r * 0.05);
    ctx.bezierCurveTo(x + ox, y + oy + r * 0.5, x + ox - r * 0.6, y + oy, x + ox - r * 0.05, y + oy - r * 0.35);
    ctx.moveTo(x + ox + r * 0.35, y + oy + r * 0.05); ctx.lineTo(x + ox + r * 1.0, y + oy + r * 0.75);
    ctx.stroke();
  };
  loop(r * 0.06, r * 0.16);
  ctx.strokeStyle = color; ctx.lineWidth = r * 0.36; loop(0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = r * 0.1; ctx.setLineDash([r * 0.25, r * 0.3]); loop(0, -r * 0.03);
  ctx.restore();
}

// Silver needle: tip at (x,y) pointing along angle a.
export function needle(ctx, x, y, a, len, w) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.moveTo(w * 0.3, w * 0.9); ctx.lineTo(-len + w * 0.3, w * 0.9 - w * 0.55); ctx.lineTo(-len + w * 0.3, w * 0.9 + w * 0.55); ctx.fill();
  const g = ctx.createLinearGradient(0, -w * 0.6, 0, w * 0.6);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#c9d1d8'); g.addColorStop(1, '#7b858f');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-len * 0.25, -w * 0.5); ctx.lineTo(-len, -w * 0.55);
  ctx.arc(-len, 0, w * 0.55, -Math.PI / 2, Math.PI / 2, true); ctx.lineTo(-len * 0.25, w * 0.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(60,70,80,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  // eye
  ctx.fillStyle = '#3a3f46'; ctx.beginPath(); ctx.ellipse(-len * 0.9, 0, w * 0.55 * 0.9, w * 0.16, 0, 0, 7); ctx.fill();
  ctx.restore();
}

export function sparkle(ctx, x, y, r, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = '#fffbe8';
  ctx.beginPath();
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, rr = k % 2 ? r * 0.28 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.fill(); ctx.restore();
}

// Twisted yarn along a polyline (points in px). Optional partial progress 0..1 (for animation).
export function yarn(ctx, pts, w, color, opts = {}) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
  ctx.translate(0, w * 0.28); path(); ctx.strokeStyle = 'rgba(30,15,15,0.28)'; ctx.lineWidth = w * 1.05; ctx.stroke(); ctx.translate(0, -w * 0.28);
  path(); ctx.strokeStyle = shade(color, -0.35); ctx.lineWidth = w; ctx.stroke();
  path(); ctx.strokeStyle = color; ctx.lineWidth = w * 0.78; ctx.stroke();
  // twist highlights
  ctx.setLineDash([w * 0.45, w * 0.55]); ctx.lineDashOffset = opts.dashOffset || 0;
  path(); ctx.strokeStyle = shade(color, 0.35); ctx.lineWidth = w * 0.26; ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// Offset an orthogonal polyline sideways by d (positive = left of travel).
export function offsetPolyline(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    let nx = 0, ny = 0;
    if (i > 0) { const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], l = Math.hypot(dx, dy) || 1; nx += dy / l; ny += -dx / l; }
    if (i < pts.length - 1) { const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dy) || 1; nx += dy / l; ny += -dx / l; }
    const both = i > 0 && i < pts.length - 1;
    const l = Math.hypot(nx, ny) || 1;
    // straight: n1+n2 = 2n -> scale 1/2; corner: |n1+n2| = sqrt2 -> scale 1 gives offset d on both legs
    const sc = both ? (Math.abs(l - 2) < 0.01 ? 0.5 : 1) : (1 / l);
    out.push([pts[i][0] + nx * d * sc, pts[i][1] + ny * d * sc]);
  }
  return out;
}

// Stable look for a quilt block from a key.
export function blockStyle(key) {
  const rng = makeRng('block' + key);
  const kind = rng.pick(FABRIC_KINDS);
  const ci = rng.int(FABRIC_COLORS.length);
  let ti = rng.int(FABRIC_COLORS.length - 1); if (ti >= ci) ti++;
  const bi = (ci + 3 + rng.int(3)) % FABRIC_COLORS.length;
  return { kind, colors: FABRIC_COLORS[ci], thread: FABRIC_COLORS[ti][1], binding: FABRIC_COLORS[bi], seed: rng.int(1000) };
}

// Quilt block: fabric + binding + couched thread with echo quilting. progress 0..1 animates stitching.
export function drawQuiltBlock(ctx, x, y, size, block, progress = 1, opts = {}) {
  const st = blockStyle(block.key);
  const n = block.n;
  const bw = size * 0.075;
  ctx.save();
  // binding
  const bt = fabricTile('stripe', st.binding, st.seed, 32);
  ctx.fillStyle = ctx.createPattern(bt, 'repeat');
  roundRect(ctx, x, y, size, size, size * 0.04); ctx.fill();
  // field
  const ft = fabricTile(st.kind, st.colors, st.seed, Math.max(24, Math.round(size / 5)));
  const pat = ctx.createPattern(ft, 'repeat');
  ctx.fillStyle = pat;
  ctx.fillRect(x + bw, y + bw, size - 2 * bw, size - 2 * bw);
  // binding stitches
  ctx.strokeStyle = 'rgba(255,250,240,0.85)'; ctx.lineWidth = Math.max(1, size * 0.008);
  ctx.setLineDash([size * 0.025, size * 0.018]);
  ctx.strokeRect(x + bw * 0.5, y + bw * 0.5, size - bw, size - bw);
  ctx.setLineDash([]);
  // inner shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2; ctx.strokeRect(x + bw + 1, y + bw + 1, size - 2 * bw - 2, size - 2 * bw - 2);
  const inner = size - 2 * bw, cs = inner / n, ox = x + bw + cs / 2, oy = y + bw + cs / 2;
  const P = block.path;
  const cnt = Math.max(1, Math.round(P.length * progress));
  const pts = P.slice(0, cnt).map((c) => [ox + (c % n) * cs, oy + Math.floor(c / n) * cs]);
  // echo quilting (running stitch both sides)
  if (pts.length > 1) {
    ctx.strokeStyle = 'rgba(255,252,245,0.8)'; ctx.lineWidth = Math.max(0.8, cs * 0.045);
    ctx.setLineDash([cs * 0.16, cs * 0.12]); ctx.lineCap = 'round';
    for (const d of [cs * 0.3, -cs * 0.3]) {
      const o = offsetPolyline(pts, d);
      ctx.beginPath(); ctx.moveTo(o[0][0], o[0][1]); for (const p of o) ctx.lineTo(p[0], p[1]); ctx.stroke();
    }
    ctx.setLineDash([]);
    yarn(ctx, pts, Math.max(2, cs * 0.2), st.thread);
  }
  // pins become French knots
  for (const c of block.pins || []) {
    const px = ox + (c % n) * cs, py = oy + Math.floor(c / n) * cs;
    ctx.fillStyle = shade(st.thread, -0.2);
    for (let k = 0; k < 5; k++) { const a = k * 1.2566; ctx.beginPath(); ctx.arc(px + Math.cos(a) * cs * 0.07, py + Math.sin(a) * cs * 0.07, cs * 0.06, 0, 7); ctx.fill(); }
  }
  if (opts.label) {
    ctx.font = `700 ${Math.round(size * 0.075)}px Nunito, system-ui, sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(opts.label, x + size - bw * 1.3, y + size - bw * 1.2);
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export const PIN_COLORS = ['#d9534a', '#e6b53d', '#4f7fb8', '#6aa86b', '#b45fa0', '#f08a5d'];
