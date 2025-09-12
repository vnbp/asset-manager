// ====================================
// SERVICE WORKER - ASSET MANAGER PWA
// ====================================

const CACHE_NAME = 'asset-manager-v1.0.0';
const STATIC_CACHE_NAME = 'asset-manager-static-v1';
const DYNAMIC_CACHE_NAME = 'asset-manager-dynamic-v1';

// Files to cache
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.3/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// Cache size limits
const CACHE_LIMITS = {
  static: 50,
  dynamic: 100
};

// ====================================
// INSTALL EVENT
// ====================================

self.addEventListener('install', event => {
  console.log('[SW] Installing Service Worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .catch(error => {
        console.error('[SW] Cache static files failed:', error);
      })
  );
  
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// ====================================
// ACTIVATE EVENT
// ====================================

self.addEventListener('activate', event => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Claim all clients
      self.clients.claim()
    ])
  );
});

// ====================================
// FETCH EVENT
// ====================================

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip Chrome extension requests
  if (request.url.startsWith('chrome-extension://')) {
    return;
  }
  
  // Skip Google Apps Script requests (always go to network)
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful API responses for offline use
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE_NAME)
              .then(cache => {
                cache.put(request, responseClone);
              });
          }
          return response;
        })
        .catch(() => {
          // Return cached API response if available
          return caches.match(request);
        })
    );
    return;
  }
  
  // Handle static files
  if (STATIC_FILES.includes(request.url) || url.pathname === '/') {
    event.respondWith(
      caches.match(request)
        .then(response => {
          return response || fetch(request)
            .then(fetchResponse => {
              return caches.open(STATIC_CACHE_NAME)
                .then(cache => {
                  cache.put(request, fetchResponse.clone());
                  return fetchResponse;
                });
            });
        })
    );
    return;
  }
  
  // Handle external libraries and resources
  if (url.hostname.includes('cdnjs.cloudflare.com') || 
      url.hostname.includes('unpkg.com') ||
      url.hostname.includes('googleapis.com')) {
    
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) {
            return response;
          }
          
          return fetch(request)
            .then(fetchResponse => {
              if (fetchResponse.ok) {
                const responseClone = fetchResponse.clone();
                caches.open(DYNAMIC_CACHE_NAME)
                  .then(cache => {
                    cache.put(request, responseClone);
                    limitCacheSize(DYNAMIC_CACHE_NAME, CACHE_LIMITS.dynamic);
                  });
              }
              return fetchResponse;
            })
            .catch(() => {
              // Return offline fallback if available
              if (request.destination === 'document') {
                return caches.match('/');
              }
            });
        })
    );
    return;
  }
  
  // Default: Network first, then cache
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE_NAME)
            .then(cache => {
              cache.put(request, responseClone);
              limitCacheSize(DYNAMIC_CACHE_NAME, CACHE_LIMITS.dynamic);
            });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

// ====================================
// BACKGROUND SYNC
// ====================================

self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-inventory') {
    event.waitUntil(syncInventoryData());
  }
  
  if (event.tag === 'sync-assets') {
    event.waitUntil(syncAssetData());
  }
});

// ====================================
// PUSH NOTIFICATIONS
// ====================================

self.addEventListener('push', event => {
  console.log('[SW] Push notification received');
  
  let data = {};
  if (event.data) {
    data = event.data.json();
  }
  
  const options = {
    body: data.body || 'Bạn có thông báo mới từ Asset Manager',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-72.png',
    tag: data.tag || 'asset-manager',
    renotify: true,
    requireInteraction: false,
    actions: [
      {
        action: 'view',
        title: 'Xem',
        icon: '/icon-32.png'
      },
      {
        action: 'dismiss',
        title: 'Đóng'
      }
    ],
    data: data
  };
  
  event.waitUntil(
    self.registration.showNotification(
      data.title || 'Asset Manager',
      options
    )
  );
});

// ====================================
// NOTIFICATION CLICK
// ====================================

self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then(clientList => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ====================================
// MESSAGE HANDLING
// ====================================

self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type) {
    switch (event.data.type) {
      case 'SKIP_WAITING':
        self.skipWaiting();
        break;
        
      case 'CACHE_INVENTORY_DATA':
        cacheInventoryData(event.data.data);
        break;
        
      case 'GET_CACHED_DATA':
        getCachedData(event.data.key)
          .then(data => {
            event.ports[0].postMessage({ success: true, data });
          })
          .catch(error => {
            event.ports[0].postMessage({ success: false, error: error.message });
          });
        break;
        
      case 'CLEAR_CACHE':
        clearAllCaches()
          .then(() => {
            event.ports[0].postMessage({ success: true });
          })
          .catch(error => {
            event.ports[0].postMessage({ success: false, error: error.message });
          });
        break;
    }
  }
});

// ====================================
// UTILITY FUNCTIONS
// ====================================

// Limit cache size
function limitCacheSize(cacheName, maxItems) {
  caches.open(cacheName)
    .then(cache => {
      cache.keys()
        .then(keys => {
          if (keys.length > maxItems) {
            const itemsToDelete = keys.slice(0, keys.length - maxItems);
            itemsToDelete.forEach(key => {
              cache.delete(key);
            });
          }
        });
    });
}

// Sync inventory data
async function syncInventoryData() {
  try {
    console.log('[SW] Syncing inventory data...');
    
    // Get pending inventory updates from IndexedDB
    const pendingUpdates = await getPendingUpdates();
    
    for (const update of pendingUpdates) {
      try {
        const response = await fetch(update.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(update.data)
        });
        
        if (response.ok) {
          await removePendingUpdate(update.id);
          console.log('[SW] Synced inventory update:', update.id);
        }
      } catch (error) {
        console.error('[SW] Failed to sync update:', update.id, error);
      }
    }
    
  } catch (error) {
    console.error('[SW] Sync inventory data failed:', error);
  }
}

// Sync asset data
async function syncAssetData() {
  try {
    console.log('[SW] Syncing asset data...');
    
    // Implementation for syncing asset data
    // This would fetch latest asset data and update local cache
    
  } catch (error) {
    console.error('[SW] Sync asset data failed:', error);
  }
}

// Cache inventory data for offline use
function cacheInventoryData(data) {
  return caches.open(DYNAMIC_CACHE_NAME)
    .then(cache => {
      const request = new Request('/api/inventory-data');
      const response = new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=86400' // 24 hours
        }
      });
      return cache.put(request, response);
    });
}

// Get cached data
function getCachedData(key) {
  return caches.open(DYNAMIC_CACHE_NAME)
    .then(cache => {
      return cache.match(`/api/${key}`);
    })
    .then(response => {
      if (response) {
        return response.json();
      }
      throw new Error('Data not found in cache');
    });
}

// Clear all caches
function clearAllCaches() {
  return caches.keys()
    .then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          return caches.delete(cacheName);
        })
      );
    });
}

// IndexedDB helpers for offline sync
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('AssetManagerDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('pendingUpdates')) {
        const store = db.createObjectStore('pendingUpdates', { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('offlineData')) {
        const store = db.createObjectStore('offlineData', { keyPath: 'key' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

function getPendingUpdates() {
  return openDB()
    .then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['pendingUpdates'], 'readonly');
        const store = transaction.objectStore('pendingUpdates');
        const request = store.getAll();
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    });
}

function removePendingUpdate(id) {
  return openDB()
    .then(db => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['pendingUpdates'], 'readwrite');
        const store = transaction.objectStore('pendingUpdates');
        const request = store.delete(id);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    });
}

// Error handling
self.addEventListener('error', event => {
  console.error('[SW] Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[SW] Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

// Periodic background sync (if supported)
if ('periodicsync' in self.registration) {
  self.addEventListener('periodicsync', event => {
    console.log('[SW] Periodic sync:', event.tag);
    
    if (event.tag === 'inventory-sync') {
      event.waitUntil(syncInventoryData());
    }
  });
}

console.log('[SW] Service Worker loaded successfully');