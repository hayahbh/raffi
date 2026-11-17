/* رفّي — يخلي التطبيق يفتح بدون نت */
const SHELL = 'raffi-shell-v2';
const CDN = 'raffi-cdn-v1';
const IMG = 'raffi-img-v1';
const KEEP = [SHELL, CDN, IMG];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './manifest.json', './icon-navy.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))));
  self.clients.claim();
});

function keep(res) { return res && (res.ok || res.type === 'opaque'); }

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);

  // الأغلفة من Supabase: الرابط يتغيّر كل مرة، فنحفظها بالمسار بدون التوكن
  if (u.hostname.endsWith('.supabase.co') && u.pathname.includes('/storage/v1/object/')) {
    const key = u.origin + u.pathname;
    e.respondWith(caches.open(IMG).then((c) => c.match(key).then((hit) => hit || fetch(req).then((res) => {
      if (keep(res)) c.put(key, res.clone());
      return res;
    }))));
    return;
  }
  // بيانات Supabase والبحث: دايم من النت
  if (u.hostname.endsWith('.supabase.co') || u.pathname.startsWith('/books/v1/') || u.hostname === 'openlibrary.org') return;

  // صفحة التطبيق: من النت أول (عشان التحديثات)، وإذا ما فيه نت من الجهاز
  if (req.mode === 'navigate' || (u.origin === location.origin && /\/(index\.html)?$/.test(u.pathname))) {
    e.respondWith(fetch(new Request(req.url, {cache: 'no-cache', credentials: 'same-origin'})).then((res) => {
      if (res.ok) caches.open(SHELL).then((c) => c.put('./index.html', res.clone()));
      return res;
    }).catch(() => caches.match('./index.html', {ignoreSearch: true})));
    return;
  }

  // المكتبات والخطوط وأغلفة النت وملفات التطبيق: من الجهاز إذا موجودة
  const store = u.origin === location.origin ? SHELL : (/\.(png|jpe?g|webp|gif)$/i.test(u.pathname) || u.hostname.includes('books.google') || u.hostname.includes('covers.openlibrary') ? IMG : CDN);
  e.respondWith(caches.open(store).then((c) => c.match(req, {ignoreSearch: u.origin === location.origin}).then((hit) => {
    const net = fetch(req).then((res) => { if (keep(res)) c.put(req, res.clone()); return res; }).catch(() => hit || Response.error());
    return hit || net;
  })));
});
