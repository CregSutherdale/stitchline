// Production build (GitHub Pages, same pattern as Gulp):
//   dist/index.html          shell with inline CSS + loading screen
//   dist/app.<hash>.js       game bundle (campaign data inlined)
//   dist/gen.<hash>.js       generator worker (Daily / Endless)
//   dist/music/*             lazily streamed background music
//   dist/sw.js               offline cache (network-first page, cache-first hashed files)
//   dist/manifest + icons    Add to Home Screen as a full-screen app
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import crypto from 'node:crypto';

const common = { bundle: true, minify: true, target: ['es2020', 'safari15'], write: false, legalComments: 'none', loader: { '.json': 'json' } };
const app = await esbuild.build({ ...common, entryPoints: ['src/main.js'], format: 'iife' });
const wk = await esbuild.build({ ...common, entryPoints: ['src/worker.js'], format: 'iife' });
const css = fs.readFileSync('src/style.css', 'utf8') + fs.readFileSync('src/style2.css', 'utf8');
const js = app.outputFiles[0].text, wjs = wk.outputFiles[0].text;
const hash = crypto.createHash('sha1').update(js).update(wjs).update(css).digest('hex').slice(0, 10);
const appName = `app.${hash}.js`, wName = `gen.${hash}.js`;

fs.mkdirSync('dist', { recursive: true });
for (const f of fs.readdirSync('dist')) fs.rmSync(`dist/${f}`, { recursive: true, force: true });
fs.writeFileSync(`dist/${appName}`, js);
fs.writeFileSync(`dist/${wName}`, wjs);
fs.cpSync('public', 'dist', { recursive: true });
for (const f of fs.readdirSync('assets/icons')) fs.copyFileSync(`assets/icons/${f}`, `dist/${f}`);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>Stitchline</title>
<meta name="description" content="A cozy, genuinely hard threading puzzle. One thread, every hole, once.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Stitchline">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#efe4d1">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" href="icon-180.png">
<link rel="manifest" href="manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,600..700,100,1&family=Nunito:wght@700;800&display=swap">
<style>${css}</style>
</head><body>
<div id="app"></div>
<div id="loading" class="loading"><div class="ld-title">Stitchline</div><p>Threading the needle…</p></div>
<script>window.__SL_BUILD='${hash}';window.__SL_WORKER='${wName}';</script>
<script>function slLoadFailed(){var l=document.getElementById('loading');if(l){l.innerHTML='<div class="ld-title">Stitchline</div><p>Couldn&rsquo;t load. Tap to try again.</p>';l.onclick=function(){location.reload();};}}</script>
<script src="${appName}" defer onerror="slLoadFailed()"></script>
</body></html>
`;
fs.writeFileSync('dist/index.html', html);
fs.writeFileSync('dist/manifest.webmanifest', JSON.stringify({
  name: 'Stitchline', short_name: 'Stitchline', description: 'A cozy, genuinely hard threading puzzle.',
  start_url: './', scope: './', display: 'standalone', orientation: 'portrait',
  background_color: '#efe4d1', theme_color: '#efe4d1',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 1));

// Service worker: page network-first (3 s), hashed files cache-first, everything else stale-while-revalidate.
// Google Fonts are cached too so the app looks right offline.
const sw = `const V='stitchline-${hash}';
const CORE=['./','./${appName}','./${wName}','./manifest.webmanifest','./icon-180.png','./icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('stitchline-')&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET') return;
  const u=new URL(r.url);
  if(u.origin!==location.origin){
    if(/fonts\\.(googleapis|gstatic)\\.com$/.test(u.hostname)) e.respondWith(caches.open(V).then(c=>c.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok||res.type==='opaque')c.put(r,res.clone());return res;}))));
    return;
  }
  if(r.mode==='navigate'){
    e.respondWith((async()=>{
      const cached=await caches.match('./');
      const net=fetch(r).then(res=>{if(res.ok)caches.open(V).then(c=>c.put('./',res.clone()));return res;}).catch(()=>null);
      if(!cached){const res=await net;return res||new Response('<p style="font:20px system-ui;padding:40px">You are offline. Open Stitchline once while online.</p>',{headers:{'Content-Type':'text/html'}});}
      const res=await Promise.race([net,new Promise(ok=>setTimeout(()=>ok(null),3000))]);
      return (res&&res.ok)?res:cached;
    })());
    return;
  }
  const f=u.pathname.slice(u.pathname.lastIndexOf('/')+1);
  if(/^(app|gen)\\.[0-9a-f]+\\.js$/.test(f)){
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(V).then(x=>x.put(r,c));}return res;})));
    return;
  }
  if(/\\.m4a$/.test(f)) return; // music streams (range requests); not cached
  e.respondWith(caches.open(V).then(c=>c.match(r).then(m=>{const net=fetch(r).then(res=>{if(res.ok)c.put(r,res.clone());return res;}).catch(()=>m);return m||net;})));
});
`;
fs.writeFileSync('dist/sw.js', sw);
fs.writeFileSync('dist/.nojekyll', '');
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
console.log(`dist/${appName} ${kb(`dist/${appName}`)} KB, dist/${wName} ${kb(`dist/${wName}`)} KB, index.html ${kb('dist/index.html')} KB`);
