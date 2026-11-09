// Service Worker for the Mahin portfolio PWA
// NOTE: bump CACHE_NAME whenever HTML/CSS/JS changes so clients drop stale assets.
const CACHE_NAME = 'mahin-portfolio-v5';
const ASSETS = [
    './',
    './index.html',
    './admin.html',
    './admin/',
    './style.css',
    './admin.css',
    './admin/cms.css',
    './config.js',
    './supabase.config.js',
    './supabase-client.js',
    './cms.js',
    './render.js',
    './script.js',
    './admin.js',
    './admin/cms.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            // Never let one 404 abort the whole install.
            .then(cache => Promise.allSettled(ASSETS.map(url => cache.add(url))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    // Let cross-origin requests (fonts, etc.) go straight to the network.
    if (url.origin !== self.location.origin) return;

    // Network-first: a stale cache can never pin an old stylesheet or script.
    // The cache is only used as an offline fallback.
    event.respondWith(
        fetch(req)
            .then(response => {
                if (response && response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(req, clone))
                        .catch(() => {});
                }
                return response;
            })
            .catch(() =>
                caches.match(req).then(hit => {
                    if (hit) return hit;
                    if (req.mode === 'navigate') return caches.match('./index.html');
                    return new Response('', { status: 504, statusText: 'Offline' });
                })
            )
    );
});
