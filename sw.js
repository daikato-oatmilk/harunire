// はるにれの丘：一度開いたら、電波が弱くても遊べるように（B1。0.9.64、0.9.65 で直した）
// build.js が版の数字を入れて dist/sw.js にする（版が変わるたびに、この文が変わり、新しい仕組みに入れかわる）
// ・ゲームのページ（index.html）と本当のお知らせ（news.json）は、いつも新しい版を先に読む。
//   読めない時と、WAIT をすぎても届かない時だけ、しまっておいた写しを出す（届いたら、次のために写しを新しくする）
// ・three.js・字体・アイコンは、しまっておいた写しを先に使う
const VER = '0.9.86';
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
// 新しい版を先に。WAIT をすぎたら写しを出す。ネットの返事は、届いたらすぐページへ渡し、写しは裏でしまう
// （0.9.65：しまい終わるまで渡さない作りだと、iPhone の WebKit で止まり、画面の頭の字体の CSS を待って真っ白になることがあった）
function fresh(e, url, key) {
  const net = fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
  // 写しのための複製は、ページが読みはじめる前に（この then が、下の race より先に呼ばれる）
  e.waitUntil(net.then((r) => { if (r && r.ok) { const cp = r.clone(); return caches.open(CACHE).then((c) => c.put(key, cp)); } }).catch(() => {}));
  const timer = new Promise((ok) => setTimeout(() => ok(null), WAIT));
  return Promise.race([net.catch(() => null), timer]).then((r) => r || caches.match(key).then((old) => old || net));
}
// 写しを先に。ない時はネットから読んで、すぐ渡す（写しは裏でしまう。同じ所の小さなファイルと字体の CSS は、裏で新しくする）
function kept(e, req, quiet) {
  return caches.match(req, { ignoreVary: true }).then((hit) => {
    if (hit && quiet) return hit;
    const net = fetch(req);
    e.waitUntil(net.then((r) => { if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); return caches.open(CACHE).then((c) => c.put(req, cp)); } }).catch(() => {}));
    return hit || net;
  });
}
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url), same = url.origin === self.location.origin;
  let p = null;
  if (req.mode === 'navigate' || (same && (url.href === PAGE || url.pathname.endsWith('/index.html')))) p = fresh(e, req.url, PAGE);
  else if (same && url.pathname.endsWith('/news.json')) p = fresh(e, req.url, url.origin + url.pathname);
  else if (url.href === THREE_URL || /^https:\/\/fonts\.gstatic\.com\//.test(url.href)) p = kept(e, req, true);
  else if (same || FONT.test(url.href)) p = kept(e, req, false);
  if (!p) return;
  // どこかでつまずいても、ふつうにネットから読む（仕組みのせいで開けない、ということがないように）
  e.respondWith(p.then((r) => r || fetch(req)).catch(() => fetch(req)));
});
