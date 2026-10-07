const V='stitchline-6e33e5ad5a';
const CORE=['./','./app.6e33e5ad5a.js','./gen.6e33e5ad5a.js','./manifest.webmanifest','./icon-180.png','./icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('stitchline-')&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET') return;
  const u=new URL(r.url);
  if(u.origin!==location.origin){
    if(/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) e.respondWith(caches.open(V).then(c=>c.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok||res.type==='opaque')c.put(r,res.clone());return res;}))));
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
  if(/^(app|gen)\.[0-9a-f]+\.js$/.test(f)){
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(V).then(x=>x.put(r,c));}return res;})));
    return;
  }
  if(/\.m4a$/.test(f)) return; // music streams (range requests); not cached
  e.respondWith(caches.open(V).then(c=>c.match(r).then(m=>{const net=fetch(r).then(res=>{if(res.ok)c.put(r,res.clone());return res;}).catch(()=>m);return m||net;})));
});
