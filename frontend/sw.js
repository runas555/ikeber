let APP_SHELL_CACHE_NAME;
let DATA_CACHE_NAME;
let CURRENT_VERSION = '$env:VERCEL_GIT_COMMIT_SHA'; // Будет заменено Vercel'ом

// Инициализация имен кэшей сразу с CURRENT_VERSION
APP_SHELL_CACHE_NAME = `ikeber-app-shell-${CURRENT_VERSION}`;
DATA_CACHE_NAME = `ikeber-data-cache-${CURRENT_VERSION}`;

const urlsToCache = [
  '/demo/', // Добавим корневой путь для подпапки /demo
  '/demo/index.html',
  '/demo/manifest.json'
  // Внешние ресурсы убраны для надежности установки.
  // Они будут кэшироваться при первом использовании через обработчик 'fetch'.
];

// 1. Установка Service Worker и кэширование оболочки приложения
self.addEventListener('install', event => {
  console.log('[SW] Установка...');
  event.waitUntil(
    caches.open(APP_SHELL_CACHE_NAME)
      .then(cache => {
        console.log('[SW] Кэширование основных файлов приложения...');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('[SW] Ошибка при кэшировании оболочки приложения:', err);
      })
  );
});

// 2. Активация Service Worker и очистка старых кэшей
self.addEventListener('activate', event => {
  console.log('[SW] Активация...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      const cacheWhitelist = [APP_SHELL_CACHE_NAME, DATA_CACHE_NAME];
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log(`[SW] Удаление старого кэша: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      ).then(() => self.clients.claim());
    })
  );
});

// 3. Перехват запросов (Fetch) - максимально оптимизированная версия
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Игнорируем запросы, которые не являются http или https
  if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') {
    return;
  }

  // Игнорируем запросы к внешним ресурсам (CDN)
  if (requestUrl.hostname !== self.location.hostname) {
    return;
  }

  // Обрабатываем только основные файлы приложения
  if (requestUrl.pathname === '/demo/' ||
      requestUrl.pathname === '/demo/index.html') {
    
    event.respondWith(
      (async () => {
        try {
          // Сначала пытаемся получить из кэша
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Если нет в кэше, идем в сеть
          const networkResponse = await fetch(event.request);
          if (networkResponse.ok) {
            const cache = await caches.open(APP_SHELL_CACHE_NAME);
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          console.log(`[SW] Ошибка при загрузке ${requestUrl.pathname}:`, error);
          return Response.error();
        }
      })()
    );
  }
  
  // Для всех остальных запросов - пропускаем без обработки
  // для максимальной производительности
});


// 4. Слушатель для принудительной очистки кэша данных
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_DATA_CACHE') {
    console.log('[SW] Получена команда на очистку кэша данных.');
    caches.delete(DATA_CACHE_NAME).then(() => {
      console.log(`[SW] Кэш данных (${DATA_CACHE_NAME}) успешно удален.`);
      // Оповещаем клиента, что кэш очищен
      event.ports[0].postMessage({ status: 'cache_cleared' });
    });
  }
});
