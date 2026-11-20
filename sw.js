const cacheName = 'yufeng-calorie-v2';
const assets = ['./', './index.html', './styles.css', './app.js', './foods.js', './model.js',
  './storage.js', './vision.js', './manifest.json', './icon.svg'];
const urls = new Set(assets.map(asset => new URL(asset, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(
    assets.map(asset => new Request(asset, { cache: 'reload' }))
  )));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key =>
    key.startsWith('yufeng-calorie-') && key !== cacheName).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  if (!urls.has(url.href)) return;
  event.respondWith(caches.open(cacheName).then(async cache => {
    return await cache.match(url.href) || fetch(event.request);
  }));
});
