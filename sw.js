// はるにれの丘：一度開いたら、電波が弱くても遊べるように（B1。0.9.64）
// build.js が版の数字を入れて dist/sw.js にする（版が変わるたびに、この文が変わり、新しい仕組みに入れかわる）
// ・ゲームのページ（index.html）と本当のお知らせ（news.json）は、いつも新しい版を先に読む。
//   読めない時と、WAIT をすぎても届かない時だけ、しまっておいた写しを出す（届いたら、次のために写しを新しくする）
// ・three.js・字体・アイコンは、しまっておいた写しを先に使う
const VER = '0.9.64';
const CACHE = 'harunire-' + VER;
const PAGE = new URL('./', self.location).href;
const CORE = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const WAIT = 4000;
const FONT = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

async function keepOne(c, url) {
  try { const r = await fetch(url, { cache: 'reload', mode: 'cors' }); if (r.ok) { await c.put(url, r); return; } } catch (e) { /* 次の手で */ }
  try { const r = await fetch(url, { cache: 'reload', mode: 'no-cors' }); if (r.ok || r.type === 'opaque') await c.put(url, r); } catch (e) { /* 開いた時に、しまう */ }
}
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // ページだけは必ず。しまえなければ、前の仕組みのまま（前の写しを消さない）
    const page = await fetch(PAGE, { cache: 'reload', credentials: 'same-origin' });
    if (!page.ok) throw new Error('page ' + page.status);
    await c.put(PAGE, page);
    await Promise.all(CORE.map((u) => keepOne(c, new URL(u, self.location).href)).concat([keepOne(c, THREE_URL)]));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('harunire-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
// 新しい版を先に。WAIT をすぎたら写しを出し、ネットの返事は裏で待って写しを新しくする
async function fresh(e, url, key) {
  const c = await caches.open(CACHE);
  const net = fetch(url, { cache: 'no-cache', credentials: 'same-origin' }).then((r) => { if (r && r.ok) return c.put(key, r.clone()).then(() => r, () => r); return r; });
  e.waitUntil(net.catch(() => {}));
  const first = await Promise.race([net.catch(() => null), new Promise((ok) => setTimeout(() => ok(undefined), WAIT))]);
  if (first) return first;
  const old = await c.match(key);
  if (old) return old;
  try { return await net; } catch (err) { return Response.error(); }
}
// 写しを先に。ない時はネットから読んで、しまう（同じ所の小さなファイルと字体の CSS は、裏で新しくする）
async function kept(e, req, quiet) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, { ignoreVary: true });
  const net = () => fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) return c.put(req, r.clone()).then(() => r, () => r); return r; });
  if (hit) { if (!quiet) e.waitUntil(net().catch(() => {})); return hit; }
  try { return await net(); } catch (err) { return Response.error(); }
}
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url), same = url.origin === self.location.origin;
  if (req.mode === 'navigate' || (same && (url.href === PAGE || url.pathname.endsWith('/index.html')))) { e.respondWith(fresh(e, req.url, PAGE)); return; }
  if (same && url.pathname.endsWith('/news.json')) { e.respondWith(fresh(e, req.url, url.origin + url.pathname)); return; }
  if (url.href === THREE_URL || /^https:\/\/fonts\.gstatic\.com\//.test(url.href)) { e.respondWith(kept(e, req, true)); return; }
  if (same || FONT.test(url.href)) { e.respondWith(kept(e, req, false)); return; }
});
