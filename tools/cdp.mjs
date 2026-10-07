// Minimal headless Edge/Chrome driver over the DevTools protocol (no window ever opens).
// const b = await launch({ w: 390, h: 844, dpr: 3, mobile: true }); await b.goto(url); ... await b.close();
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync, execFileSync } from 'node:child_process';

export async function launch({ w = 390, h = 844, dpr = 3, mobile = true, timeout = 600 } = {}) {
  const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
  if (!exe) throw new Error('no Edge/Chrome found');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stitch-edge-'));
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-extensions', '--disable-sync', '--disable-component-update',
    '--disable-background-networking', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let closed = false;
  const ownPids = [];
  const kill = () => {
    if (closed) return; closed = true;
    try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch (e) { /* gone */ }
    // Edge's launcher exits and leaves the real browser detached: kill the browser PIDs we recorded
    // right after launch (processes carrying OUR unique profile dir). Never kill by name/pattern.
    for (const pid of ownPids) { try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch (e) { /* gone */ } }
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 }); } catch (e) { /* locked */ }
  };
  process.on('exit', kill);
  const hard = setTimeout(() => { console.error('CDP HARD TIMEOUT'); kill(); process.exit(3); }, timeout * 1000); hard.unref();
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = ''; const to = setTimeout(() => reject(new Error('browser did not start')), 30000);
    proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(to); resolve(m[1]); } });
    // Newer Edge builds print nothing on stderr: read the port file it writes into the profile.
    const poll = setInterval(() => {
      try {
        const [port, p] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(String.fromCharCode(10)).map((x) => x.trim());
        if (port && p) { clearInterval(poll); clearTimeout(to); resolve(`ws://127.0.0.1:${port}${p}`); }
      } catch (e) { /* not yet */ }
    }, 200);
    setTimeout(() => clearInterval(poll), 31000);
  });
  try {
    const tag = path.basename(profile);
    const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${tag}*' -and $_.CommandLine -notlike '*--type=*' } | ForEach-Object { $_.ProcessId }`], { encoding: 'utf8' });
    for (const l of out.split(/\s+/)) if (/^\d+$/.test(l)) ownPids.push(+l);
  } catch (e) { /* query failed: fall back to launcher PID only */ }
  const tab = await (await fetch(`http://127.0.0.1:${new URL(wsUrl).port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(); const errors = []; const logs = []; const listeners = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push(`${d.exception?.description || d.text} @ ${d.url || ''}:${d.lineNumber}:${d.columnNumber}`); }
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = m.params.args.map((a) => a.value ?? a.description).join(' ');
      if (m.params.type === 'error') errors.push('console.error: ' + txt); else logs.push(`[${m.params.type}] ${txt}`);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`log: ${m.params.entry.text} ${m.params.entry.url || ''}`);
    for (const l of listeners) l(m);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const api = {
    send, evaluate, sleep, errors, logs,
    async goto(url, waitMs = 1500) {
      const loaded = new Promise((r) => { const f = (m) => { if (m.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(f), 1); r(); } }; listeners.push(f); });
      await send('Page.navigate', { url }); await Promise.race([loaded, sleep(20000)]); await sleep(waitMs);
    },
    async waitFor(expr, ms = 15000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return true; } catch (e) { /* not yet */ } await sleep(100); }
      throw new Error('waitFor timed out: ' + expr);
    },
    async shot(file, clip) {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    // Real touch input
    async touch(type, x, y) { await send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] }); },
    async mouse(type, x, y, buttons = 1) { await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : buttons, clickCount: 1, pointerType: 'mouse' }); },
    async tapAt(x, y) { await api.touch('touchStart', x, y); await sleep(40); await api.touch('touchEnd', x, y); await sleep(60); },
    async click(selector) {
      const box = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2];})()`);
      if (!box) throw new Error('no element ' + selector);
      await sleep(60); await api.tapAt(box[0], box[1]);
    },
    close: async () => { try { ws.close(); } catch (e) { /* ignore */ } kill(); },
  };
  return api;
}
