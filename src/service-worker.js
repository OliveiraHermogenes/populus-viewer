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
      cache.add("https://rsms.me/inter/font-files/Inter-roman.var.woff2?v=3.18");
      cache.add("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&display=swap");
      cache.add("https://cdn.jsdelivr.net/npm/katex@0.13.2/dist/katex.min.css");
    })
  );
});

precacheAndRoute(self.__WB_MANIFEST)

// We store the auth token in memory. IndexedDB would provide more
// permanent storage. Would probably be overengineering though. May
// revisit latter.
let authToken = null;

// Listen for auth token from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_AUTH_TOKEN') {
    authToken = event.data.token;
    console.log("Auth token recieved in service worker.");
  }
});

// Function to add authorization header, as per MSC3916
const addAuthorizationHeader = async ({ request }) => {
  if (authToken) {
    const headers = new Headers(request.headers);
    headers.append('Authorization', `Bearer ${authToken}`);
    return new Request(request, {
      mode: 'cors',
      credentials: 'omit',
      headers
    });
  }
  return request; // if authToken is unavailable, we return the request untouched
};

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
  ({ request }) => request.url.includes('_matrix/media/v3/download/'),
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
