import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute } from 'workbox-precaching';

// extra precaching
self.addEventListener("install", event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open("static").then(cache => {
      cache.add("https://rsms.me/inter/font-files/InterVariable.woff2?v=4.1");
      cache.add("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&display=swap");
      cache.add("https://cdn.jsdelivr.net/npm/katex@0.13.2/dist/katex.min.css");
    })
  );
});

self.addEventListener("activate", (event) => {
  // bring all browser tabs under our control
  event.waitUntil(clients.claim());
});

precacheAndRoute(self.__WB_MANIFEST)

// we cache auth info in memory
let authInfo = null;
let authInfoPromise = null;

registerRoute(
  // dynamically cache thumbnails
  ({ request }) => request.url.includes('_matrix/client/v1/media/thumbnail/') && request.destination === 'image',
  new CacheFirst({
    // Put all cached files in a cache named 'images'
    cacheName: 'images',
    plugins: [
      {
	requestWillFetch: addAuthorizationHeader
      },
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 30 // 30 Days
      })
    ]
  })
);

// network-first caching of aliases, roomHierarchy, and server data
registerRoute(
  ({ request }) =>
    request.url.includes('_matrix/client/v3/directory/room/') ||
    request.url.includes('_matrix/client/versions') ||
    request.url.includes('_matrix/client/v1/rooms/')
  ,
  new NetworkFirst({
    cacheName: 'aliases',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] })
    ]
  })
);

registerRoute(
  ({ request }) => request.url.includes('_matrix/client/v1/media/download/'),
  new CacheFirst({
    cacheName: 'media',
    plugins: [
      {
	requestWillFetch: addAuthorizationHeader
      },
      new CacheableResponsePlugin({
        statuses: [200],
        headers: { "content-type": "application/pdf" }
      }),
      new ExpirationPlugin({ maxEntries: 10 })
    ]
  })
);

// Function to add authorization header, as per MSC3916
async function addAuthorizationHeader({ request, event }) {
  try {
    const client = await self.clients.get(event.clientId)
    if (client && !authInfo) {
      authInfo = await getAuthInfo(client)
    }
    if (authInfo && authInfo.accessToken && authInfo.baseUrl) {
      const requestUrl = new URL(request.url)
      const baseUrl = new URL(authInfo.baseUrl)
      // only inject access token in requests to the homeserver
      if (requestUrl.origin === baseUrl.origin) {
        const headers = new Headers(request.headers)
        headers.append('Authorization', `Bearer ${authInfo.accessToken}`)
        return new Request(request, {
          mode: 'cors',
          credentials: 'omit',
          headers
        });
      }
    }
  } catch (error) {
    console.warn('Failed to get auth info:', error)
    // fallback to original request without auth header
  }
  return request
}

// Function to request auth token from main thread
async function getAuthInfo(client) {
  if (authInfoPromise) return authInfoPromise;

  authInfoPromise = new Promise((resolve, reject) => {
    const authInfoTimeout = setTimeout(_ => {
      authInfoPromise = null // reset on timeout
      reject(new Error("Auth info request timed out"))
    }, 1000);

    const handler = (event) => {
      if (event.data && event.data.type === "REPLY_AUTH_INFO") {
        clearTimeout(authInfoTimeout)
        self.removeEventListener('message', handler)
        authInfoPromise = null // reset after success
        resolve(event.data.auth)
      }
    };

    self.addEventListener('message', handler);
    client.postMessage({
      type: "ASK_AUTH_INFO"
    });
  });

  return authInfoPromise
}
