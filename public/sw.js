const CACHE_NAME = 'driverwise-pwa-v5';
const MAP_TILES_CACHE = 'driverwise-map-tiles-v2';
const MAX_MAP_TILES = 2000; // Lisboa + Porto, dia e noite, sem truncar pré-carregamentos

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pwa-192.svg',
  '/pwa-512.svg',
];

// Limpeza de cache LRU para blocos de mapa
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let index = 0; index < keys.length - maxItems; index += 1) {
    await cache.delete(keys[index]);
  }
}

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== MAP_TILES_CACHE) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estratégia de Cache Inteligente para Mapas e Aplicação
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isTrustedMapHost = url.hostname === 'tile.openstreetmap.org';
  // Never cache cross-origin APIs, fonts, streams or user data. Only the two
  // tile styles used by the map are allowed off-origin.
  if (url.origin !== self.location.origin && !isTrustedMapHost) return;

  // 1. ESTRATÉGIA PARA TILES OpenStreetMap -> Cache First / Stale-While-Revalidate
  const isMapTile =
    isTrustedMapHost &&
    /^\/\d+\/\d+\/\d+\.png$/.test(url.pathname);

  if (isMapTile) {
    event.respondWith(
      caches.open(MAP_TILES_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          // Atualiza em background de forma assíncrona se houver rede
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
                trimCache(MAP_TILES_CACHE, MAX_MAP_TILES);
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        // Se não tiver na cache, procura na rede
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
              trimCache(MAP_TILES_CACHE, MAX_MAP_TILES);
            }
            return networkResponse;
          })
          .catch(() => {
            // Em caso de falha total offline, retorna vazio limpo sem quebrar o mapa
            return new Response('', { status: 408, statusText: 'Tile Offline' });
          });
      })
    );
    return;
  }

  const isOwnAppAsset = url.origin === self.location.origin && (
    event.request.mode === 'navigate'
    || ['script', 'style', 'image', 'font', 'manifest'].includes(event.request.destination)
    || url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/models/')
    || ASSETS_TO_CACHE.includes(url.pathname)
  );
  if (!isOwnAppAsset) return;

  // 2. ESTRATÉGIA PARA ASSETS DA APP -> Network First com Fallback para Cache
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => {
          return cache.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            if (event.request.mode === 'navigate') {
              return cache.match('/');
            }
            return new Response('Offline - Conteúdo não disponível', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' }),
            });
          });
        });
    })
  );
});

// 3. BACKGROUND SYNC API: Sincronização automática em segundo plano quando recupera 4G/5G
self.addEventListener('sync', (event) => {
  if (event.tag === 'driverwise-sync-records') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'DRIVERWISE_FLUSH_SYNC_QUEUE' });
        });
      })
    );
  }
});
