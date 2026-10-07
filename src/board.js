// Board view: renders the fabric, holes, clues and the thread, and turns pointer/touch drags into
// thread moves (snap to holes, interpolate fast swipes, drag back along the thread to unpick).
import { BOARDS, PAL, linenTile, eyelet, pinHead, pearl, darkButton, woodButton, knotMark, needle, sparkle, yarn, roundRect, PIN_COLORS, shade } from './art.js';
import { makeRng } from './core/rng.js';

export class Board {
  constructor(canvas, cb) {
    this.cv = canvas; this.cx = canvas.getContext('2d');
    this.cb = cb;
    this.session = null;
    this.parts = [];
    this.flashes = [];   // {cell, t0, color}
    this.pops = new Map(); // cell -> t0
    this.drag = null;
    this.ghost = null;
    this.winAnim = null;
    this.dirty = true;
    this.statusCache = new Map();
    this.time = 0;
    this.thread = PAL.madder;
    this.bindInput();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  setSession(session, style) {
    this.session = session;
    this.style = style || { board: BOARDS[0] };
    this.parts.length = 0; this.flashes.length = 0; this.pops.clear();
    this.winAnim = null; this.drag = null; this.ghost = null;
    this.statusCache = session.status();
    this.resize();
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.dpr = dpr; this.W = r.width; this.H = r.height;
    this.cv.width = Math.max(1, Math.round(r.width * dpr)); this.cv.height = Math.max(1, Math.round(r.height * dpr));
    if (!this.session) return;
    const n = this.session.n;
    const S = Math.min(r.width, r.height);
    this.S = S; this.bx = (r.width - S) / 2; this.by = (r.height - S) / 2;
    const pad = S * 0.055 + S / n * 0.08;
    this.cs = (S - 2 * pad) / n;
    this.ox = this.bx + pad + this.cs / 2; this.oy = this.by + pad + this.cs / 2;
    this.buildStatic();
    this.dirty = true;
  }

  cellXY(c) { const n = this.session.n; return [this.ox + (c % n) * this.cs, this.oy + Math.floor(c / n) * this.cs]; }

  buildStatic() {
    const s = this.session, p = s.p, n = s.n, cs = this.cs, dpr = this.dpr;
    const mk = () => { const c = document.createElement('canvas'); c.width = this.cv.width; c.height = this.cv.height; const x = c.getContext('2d'); x.scale(dpr, dpr); return [c, x]; };
    const [low, lx] = mk();
    const [top, tx] = mk();
    const B = this.style.board;
    // board: rounded fabric swatch with drop shadow, stitched border
    const { bx, by, S } = this;
    const rr = S * 0.045;
    lx.save();
    lx.shadowColor = 'rgba(60,35,30,0.35)'; lx.shadowBlur = S * 0.04; lx.shadowOffsetY = S * 0.012;
    roundRect(lx, bx + 2, by + 2, S - 4, S - 4, rr); lx.fillStyle = B.base; lx.fill();
    lx.restore();
    lx.save();
    roundRect(lx, bx + 2, by + 2, S - 4, S - 4, rr); lx.clip();
    lx.fillStyle = lx.createPattern(linenTile(B.base, 7), 'repeat'); lx.fillRect(bx, by, S, S);
    // soft vignette
    const vg = lx.createRadialGradient(bx + S / 2, by + S * 0.42, S * 0.2, bx + S / 2, by + S / 2, S * 0.75);
    vg.addColorStop(0, 'rgba(255,255,255,0.08)'); vg.addColorStop(1, 'rgba(40,20,20,0.18)');
    lx.fillStyle = vg; lx.fillRect(bx, by, S, S);
    lx.restore();
    // stitched border
    lx.save();
    const inset = S * 0.022;
    roundRect(lx, bx + inset, by + inset, S - 2 * inset, S - 2 * inset, rr * 0.7);
    lx.strokeStyle = 'rgba(255,248,235,0.75)'; lx.lineWidth = Math.max(1.2, S * 0.0045);
    lx.setLineDash([S * 0.016, S * 0.011]); lx.stroke();
    lx.restore();
    // faint grid guide threads between holes
    lx.save(); lx.strokeStyle = shade(B.base, -0.12); lx.globalAlpha = 0.35; lx.lineWidth = 1;
    lx.setLineDash([2, 4]);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = r * n + c; if (s.pins.has(i)) continue;
      const [x, y] = this.cellXY(i);
      if (c + 1 < n && !s.pins.has(i + 1)) { lx.beginPath(); lx.moveTo(x, y); lx.lineTo(x + cs, y); lx.stroke(); }
      if (r + 1 < n && !s.pins.has(i + n)) { lx.beginPath(); lx.moveTo(x, y); lx.lineTo(x, y + cs); lx.stroke(); }
    }
    lx.restore();
    // holes
    const hr = Math.max(2.5, cs * 0.1);
    for (let i = 0; i < n * n; i++) { if (s.pins.has(i)) continue; const [x, y] = this.cellXY(i); eyelet(lx, x, y, hr); }
    if (p.knot >= 0) { const [x, y] = this.cellXY(p.knot); knotMark(lx, x, y, cs * 0.24, this.thread); }
    // pins sit on the top layer so they read as objects
    const rng = makeRng('pins' + p.start);
    for (const c of p.pins) { const [x, y] = this.cellXY(c); pinHead(tx, x - cs * 0.08, y - cs * 0.08, cs * 0.2, PIN_COLORS[rng.int(PIN_COLORS.length)]); }
    const cr = cs * 0.27;
    for (const c of p.straight) { const [x, y] = this.cellXY(c); pearl(tx, x, y, cr); }
    for (const c of p.corner) { const [x, y] = this.cellXY(c); darkButton(tx, x, y, cr); }
    p.nums.forEach((c, k) => { const [x, y] = this.cellXY(c); woodButton(tx, x, y, cs * 0.3, k + 1); });
    this.low = low; this.top = top;
  }

  // ---------- input ----------
  bindInput() {
    const cv = this.cv;
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', (e) => {
      if (!this.session || this.winAnim || this.locked) return;
      e.preventDefault();
      if (this.drag) return; // ignore extra fingers
      const [x, y] = pt(e);
      const c = this.nearest(x, y, 0.62);
      this.cb.onInteract?.();
      this.ghost = null;
      const s = this.session;
      if (c < 0) return;
      s.beginGesture();
      if (c === s.head) { /* continue */ }
      else if (s.indexOf(c) >= 0) { s.truncateTo(c); this.cb.onMove?.('back'); }
      else if (s.adj(s.head, c) && s.isFree(c)) { if (s.step(c) === 'add') this.added(c); }
      else { s.endGesture(); this.flash(s.head, PAL.gold); this.cb.onMiss?.(); return; }
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
      this.drag = { id: e.pointerId, x, y, lx: x, ly: y };
      this.dirty = true;
    });
    const move = (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      e.preventDefault();
      const [x, y] = pt(e);
      this.track(this.drag.lx, this.drag.ly, x, y);
      if (!this.drag) return; // the move finished the puzzle
      this.drag.lx = x; this.drag.ly = y; this.drag.x = x; this.drag.y = y;
      this.dirty = true;
    };
    cv.addEventListener('pointermove', move);
    const end = (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      this.drag = null;
      this.session.endGesture();
      this.dirty = true;
      this.cb.onRelease?.();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('lostpointercapture', end);
  }

  nearest(x, y, tol) {
    const s = this.session, n = s.n, cs = this.cs;
    const c = Math.round((x - this.ox) / cs), r = Math.round((y - this.oy) / cs);
    if (c < 0 || r < 0 || c >= n || r >= n) return -1;
    const cx = this.ox + c * cs, cy = this.oy + r * cs;
    if (Math.hypot(x - cx, y - cy) > tol * cs) return -1;
    return r * n + c;
  }

  // Walk the finger's motion in small steps so quick swipes still visit every hole in order.
  track(x0, y0, x1, y1) {
    const s = this.session, n = s.n;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / (this.cs / 6)));
    for (let k = 1; k <= steps; k++) {
      const x = x0 + (x1 - x0) * k / steps, y = y0 + (y1 - y0) * k / steps;
      const c = this.nearest(x, y, 0.47);
      if (c < 0 || c === s.head) continue;
      const h = s.head;
      const dr = Math.floor(c / n) - Math.floor(h / n), dc = (c % n) - (h % n);
      if (Math.abs(dr) + Math.abs(dc) === 1) { this.apply(c); continue; }
      if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
        // diagonal: go through whichever corner hole makes a legal two-step move, nearer the finger first
        const a = h + dc, b = h + dr * n;
        const opts = [a, b].sort((u, v) => { const [ux, uy] = this.cellXY(u), [vx, vy] = this.cellXY(v); return Math.hypot(ux - x, uy - y) - Math.hypot(vx - x, vy - y); });
        for (const m of opts) {
          const L = s.path.length;
          if (m === s.path[L - 2]) { this.apply(m); if (s.head === m) this.apply(c); break; }
          if (s.isFree(m) && (s.isFree(c) || c === h)) { this.apply(m); if (s.head === m) this.apply(c); break; }
        }
      }
    }
  }
  apply(c) {
    const r = this.session.step(c);
    if (r === 'add') this.added(c);
    else if (r === 'back') { this.cb.onMove?.('back'); this.pops.delete(c); }
    else if (this.session.pins.has(c) || (this.session.indexOf(c) >= 0 && c !== this.session.head)) this.flash(c, '#ffffff', 0.5);
  }
  added(c) {
    const [x, y] = this.cellXY(c);
    this.pops.set(c, this.time);
    const cs = this.cs;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, sp = cs * (1.2 + Math.random() * 1.6);
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.35 + Math.random() * 0.2, r: cs * (0.03 + Math.random() * 0.03), type: 'fluff', color: k % 2 ? '#fff6e6' : this.thread });
    }
    this.parts.push({ x, y, life: 0, max: 0.35, r: cs * 0.2, type: 'ring' });
    if (Math.random() < 0.5) this.parts.push({ x: x + (Math.random() - 0.5) * cs * 0.6, y: y - cs * 0.3, vx: 0, vy: -cs * 0.4, life: 0, max: 0.5, r: cs * 0.12, type: 'spark' });
    this.cb.onMove?.('add', c);
  }
  flash(c, color, dur = 0.6) { this.flashes.push({ c, t0: this.time, color, dur }); this.dirty = true; }

  showGhost(cells) { this.ghost = cells && cells.length > 1 ? { cells, t0: this.time } : null; this.dirty = true; }

  playWin(done) {
    this.winAnim = { t0: this.time, done, fired: false };
    this.drag = null;
    this.dirty = true;
  }

  // ---------- render ----------
  loop(ts) {
    requestAnimationFrame(this.loop);
    const t = ts / 1000;
    const dt = Math.min(0.05, t - (this.time || t));
    this.time = t;
    if (!this.session || !this.low) return;
    const animating = this.parts.length || this.flashes.length || this.ghost || this.winAnim || this.drag || this.pops.size || this.sparkleOn;
    if (!this.dirty && !animating) return;
    this.dirty = false;
    this.render(dt);
  }

  render(dt) {
    const cx = this.cx, dpr = this.dpr, s = this.session, cs = this.cs, t = this.time;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(0, 0, this.cv.width, this.cv.height);
    cx.drawImage(this.low, 0, 0);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = s.path;
    const pts = P.map((c) => this.cellXY(c));
    // thread tail at the needle hole
    const [sx, sy] = pts[0];
    cx.save(); cx.strokeStyle = shade(this.thread, -0.2); cx.lineWidth = Math.max(2, cs * 0.12); cx.lineCap = 'round';
    cx.beginPath(); cx.moveTo(sx, sy); cx.bezierCurveTo(sx - cs * 0.25, sy + cs * 0.15, sx - cs * 0.15, sy + cs * 0.42, sx - cs * 0.38, sy + cs * 0.4); cx.stroke(); cx.restore();
    // live thread to the finger
    let livePts = pts;
    let tipX = null, tipY = null;
    if (this.drag && !this.winAnim) {
      const [hx, hy] = pts[pts.length - 1];
      let dx = this.drag.x - hx, dy = this.drag.y - hy; const d = Math.hypot(dx, dy), mx = cs * 0.6;
      if (d > mx) { dx *= mx / d; dy *= mx / d; }
      tipX = hx + dx; tipY = hy + dy;
      livePts = pts.concat([[tipX, tipY]]);
    }
    const w = Math.max(4, cs * 0.21);
    if (livePts.length > 1) yarn(cx, livePts, w, this.thread, { dashOffset: -t * 0 });
    // hint segments in gold thread
    for (let i = 1; i < P.length; i++) if (s.isHinted(i)) { yarn(cx, [pts[i - 1], pts[i]], w * 0.55, PAL.gold); }
    // stitch pops (a little knot that pops then settles)
    for (const [c, t0] of this.pops) {
      const a = t - t0; if (a > 0.4) { this.pops.delete(c); continue; }
      const [x, y] = this.cellXY(c); const k = a / 0.4;
      const r = cs * (0.14 + 0.12 * Math.sin(k * Math.PI) * (1 - k));
      cx.fillStyle = shade(this.thread, 0.15); cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill();
    }
    // win glow travelling along the thread
    if (this.winAnim) {
      const a = t - this.winAnim.t0, dur = Math.min(1.4, 0.3 + P.length * 0.012);
      const k = Math.min(1, a / dur);
      const upto = Math.floor(k * (P.length - 1));
      cx.save(); cx.globalCompositeOperation = 'lighter';
      for (let i = Math.max(0, upto - 6); i <= upto; i++) {
        const [x, y] = pts[i]; const f = 1 - (upto - i) / 7;
        const g = cx.createRadialGradient(x, y, 0, x, y, cs * 0.6);
        g.addColorStop(0, `rgba(255,230,170,${0.55 * f})`); g.addColorStop(1, 'rgba(255,230,170,0)');
        cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, cs * 0.6, 0, 7); cx.fill();
      }
      cx.restore();
      if (k >= 1 && !this.winAnim.fired && a > dur + 0.25) { this.winAnim.fired = true; const d = this.winAnim.done; setTimeout(() => d && d(), 0); }
    }
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.drawImage(this.top, 0, 0);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // clue status rings
    const st = this.statusCache;
    for (const [c, v] of st) {
      const [x, y] = this.cellXY(c);
      cx.lineWidth = Math.max(2, cs * 0.05);
      if (v === 'ok') { cx.strokeStyle = 'rgba(255,226,140,0.95)'; cx.beginPath(); cx.arc(x, y, cs * 0.36, 0, 7); cx.stroke(); }
      else if (v === 'bad') {
        const pulse = 0.6 + 0.4 * Math.sin(t * 8);
        cx.strokeStyle = `rgba(214,58,48,${pulse})`; cx.lineWidth = Math.max(2.5, cs * 0.065);
        cx.beginPath(); cx.arc(x, y, cs * 0.37, 0, 7); cx.stroke();
        this.dirty = true;
      }
    }
    // flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]; const a = (t - f.t0) / f.dur;
      if (a >= 1) { this.flashes.splice(i, 1); continue; }
      const [x, y] = this.cellXY(f.c);
      cx.strokeStyle = f.color; cx.globalAlpha = 1 - a; cx.lineWidth = 3;
      cx.beginPath(); cx.arc(x, y, cs * (0.3 + a * 0.25), 0, 7); cx.stroke(); cx.globalAlpha = 1;
    }
    // needle
    if (!this.winAnim || t - this.winAnim.t0 < 0.2) {
      const [hx, hy] = pts[pts.length - 1];
      let ang, nx, ny;
      if (tipX !== null && Math.hypot(tipX - hx, tipY - hy) > cs * 0.08) { ang = Math.atan2(tipY - hy, tipX - hx); nx = tipX + Math.cos(ang) * cs * 0.55; ny = tipY + Math.sin(ang) * cs * 0.55; }
      else {
        if (P.length > 1) { const [px, py] = pts[pts.length - 2]; ang = Math.atan2(hy - py, hx - px); } else ang = -Math.PI / 4;
        const bob = Math.sin(t * 3) * cs * 0.03;
        nx = hx + Math.cos(ang) * cs * 0.62 + bob; ny = hy + Math.sin(ang) * cs * 0.62 + bob;
        this.sparkleOn = true;
      }
      needle(cx, nx, ny, ang, cs * 0.72, Math.max(2.2, cs * 0.075));
      // occasional sparkle at the needle tip
      if (Math.random() < dt * 2.2) this.parts.push({ x: nx + (Math.random() - 0.5) * cs * 0.3, y: ny + (Math.random() - 0.5) * cs * 0.3, vx: 0, vy: -cs * 0.25, life: 0, max: 0.6, r: cs * (0.08 + Math.random() * 0.06), type: 'spark' });
    } else this.sparkleOn = false;
    // ghost hand (tutorial)
    if (this.ghost) this.drawGhost();
    // particles
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i]; q.life += dt;
      if (q.life >= q.max) { this.parts.splice(i, 1); continue; }
      const k = q.life / q.max;
      if (q.type === 'fluff') { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy = q.vy * 0.9 + cs * 2 * dt; cx.fillStyle = q.color; cx.globalAlpha = 1 - k; cx.beginPath(); cx.arc(q.x, q.y, q.r, 0, 7); cx.fill(); cx.globalAlpha = 1; }
      else if (q.type === 'ring') { cx.strokeStyle = `rgba(255,248,230,${0.8 * (1 - k)})`; cx.lineWidth = 2; cx.beginPath(); cx.arc(q.x, q.y, q.r + k * cs * 0.35, 0, 7); cx.stroke(); }
      else if (q.type === 'spark') { q.y += (q.vy || 0) * dt; sparkle(cx, q.x, q.y, q.r * Math.sin(k * Math.PI), 0.9); }
      else if (q.type === 'confetti') { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += cs * 6 * dt; q.rot += q.vr * dt; cx.save(); cx.translate(q.x, q.y); cx.rotate(q.rot); cx.globalAlpha = 1 - k * k; cx.fillStyle = q.color; cx.fillRect(-q.r, -q.r * 0.6, q.r * 2, q.r * 1.2); cx.restore(); }
    }
  }

  drawGhost() {
    const g = this.ghost, cx = this.cx, cs = this.cs;
    const per = 0.42, hold = 0.9;
    const L = g.cells.length;
    const cyc = (L - 1) * per + hold * 2;
    const a = (this.time - g.t0) % cyc;
    const k = Math.max(0, Math.min(L - 1, (a - hold * 0.5) / per));
    const i = Math.floor(k), f = k - i;
    const pts = g.cells.map((c) => this.cellXY(c));
    const cur = i >= L - 1 ? pts[L - 1] : [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
    cx.save();
    cx.globalAlpha = 0.85;
    cx.strokeStyle = 'rgba(255,250,235,0.9)'; cx.lineWidth = Math.max(3, cs * 0.1); cx.lineCap = 'round'; cx.lineJoin = 'round';
    cx.setLineDash([cs * 0.12, cs * 0.14]);
    cx.beginPath(); cx.moveTo(pts[0][0], pts[0][1]);
    for (let j = 1; j <= i; j++) cx.lineTo(pts[j][0], pts[j][1]);
    cx.lineTo(cur[0], cur[1]); cx.stroke(); cx.setLineDash([]);
    // fingertip
    const press = a < hold * 0.5 ? a / (hold * 0.5) : 1;
    const fade = a > cyc - hold * 0.6 ? Math.max(0, (cyc - a) / (hold * 0.6)) : 1;
    cx.globalAlpha = 0.9 * fade;
    const fx = cur[0] + cs * 0.18, fy = cur[1] + cs * 0.22;
    cx.fillStyle = 'rgba(255,255,255,0.35)'; cx.beginPath(); cx.arc(cur[0], cur[1], cs * 0.34 * press, 0, 7); cx.fill();
    // stylised hand: finger + palm
    cx.fillStyle = '#fff7ef'; cx.strokeStyle = 'rgba(80,50,50,0.55)'; cx.lineWidth = 1.5;
    cx.beginPath(); roundRect(cx, fx - cs * 0.09, fy - cs * 0.12, cs * 0.18, cs * 0.5, cs * 0.09); cx.fill(); cx.stroke();
    cx.beginPath(); roundRect(cx, fx - cs * 0.12, fy + cs * 0.22, cs * 0.48, cs * 0.42, cs * 0.16); cx.fill(); cx.stroke();
    cx.restore();
    this.dirty = true;
  }

  burst() {
    const cs = this.cs, cols = [PAL.madder, PAL.mustard, PAL.sage, PAL.denim, PAL.rose, '#fff6e6'];
    for (let k = 0; k < 70; k++) {
      const x = this.bx + Math.random() * this.S, y = this.by + this.S * 0.35;
      this.parts.push({ type: 'confetti', x, y, vx: (Math.random() - 0.5) * cs * 8, vy: -cs * (4 + Math.random() * 6), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, life: 0, max: 1.4 + Math.random() * 0.8, r: cs * (0.07 + Math.random() * 0.06), color: cols[k % cols.length] });
    }
    this.dirty = true;
  }
}
