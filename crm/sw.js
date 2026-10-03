/**
 * sw.js — TurboFix CRM service worker
 *
 * Network-first for everything it handles: when online, users always get the
 * latest deploy; the cache is only a fallback when the network is unavailable.
 * API calls, cross-origin requests and non-GET requests are never intercepted,
 * so no customer/order data is ever stored by the service worker.
 *
 * Bump CACHE_VERSION whenever PRECACHE changes.
 */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `turbofix-crm-${CACHE_VERSION}`;
const OFFLINE_URL = './offline.html';

const PRECACHE = [
  './login.html',
  './index.html',
  './telecaller-dashboard.html',
  './orders.html',
  './workdone.html',
  './schedules.html',
  './customers.html',
  './technicians.html',
  './payments.html',
  './analysis.html',
  './customer-care-report.html',
  OFFLINE_URL,
  './css/crm.css',
  './js/config.js',
  './js/utils.js',
  './js/auth.js',
  './js/brands.js',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
];

const STATIC_ASSET = /\.(?:css|js|png|svg|ico|webmanifest|woff2?)$/i;

// Hosts that redirect (e.g. Netlify "pretty URLs": /orders.html -> /orders) hand
// back responses flagged as redirected, which browsers refuse to use for a
// navigation. Re-wrap them as plain responses before caching.
async function cacheable(response) {
  if (!response.redirected) return response;
  const body = await response.blob();
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(PRECACHE.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' });
      if (!response.ok) throw new Error(`Precache failed for ${url}: ${response.status}`);
      await cache.put(url, await cacheable(response));
    }));
    // Safe to activate straight away: every strategy below is network-first,
    // so a new worker never serves older files than the network would.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('turbofix-crm-') && k !== CACHE_NAME).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

function shouldHandle(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;       // API host, fonts, CDNs
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return false;
  if (/\/(api|uploads)\//.test(url.pathname)) return false;     // same-origin API in local dev
  return request.mode === 'navigate' || STATIC_ASSET.test(url.pathname);
}

async function putInCache(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, await cacheable(response.clone()));
}

// Offline lookup for a page, tolerating pretty URLs ("/orders" -> "orders.html")
// and the site root ("/" -> "index.html").
async function cachedPage(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const url = new URL(request.url);
  const path = url.pathname.endsWith('/') ? `${url.pathname}index.html` : `${url.pathname}.html`;
  return caches.match(new URL(path, url.origin).href, { ignoreSearch: true });
}

async function handleNavigation(event) {
  try {
    const response = (await event.preloadResponse) || (await fetch(event.request));
    event.waitUntil(putInCache(event.request, response.clone()));
    return response;
  } catch {
    return (await cachedPage(event.request)) || caches.match(OFFLINE_URL);
  }
}

async function handleAsset(event) {
  try {
    const response = await fetch(event.request);
    event.waitUntil(putInCache(event.request, response.clone()));
    return response;
  } catch {
    const hit = await caches.match(event.request, { ignoreSearch: true });
    return hit || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  if (!shouldHandle(event.request)) return;
  event.respondWith(event.request.mode === 'navigate' ? handleNavigation(event) : handleAsset(event));
});
