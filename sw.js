/* QD Elite Service Worker
   - Bấm thông báo: mở / focus lại web (giữ nguyên như cũ)
   - Bộ nhớ đệm: thư viện CDN (Font Awesome, Firebase SDK, Google Fonts) + ảnh lưu sẵn -> mở lại trang gần như tức thì
   - Trang HTML: luôn lấy bản mới nhất từ mạng, chỉ dùng bản lưu khi mất mạng
   - Không đụng tới: Firestore / API (dữ liệu thời gian thực), nhạc / video (yêu cầu theo đoạn), kiểm tra mạng (cache: no-store) */
const VERSION = 'qd-smooth-v1';
const STATIC_CACHE = VERSION + '-static';
const PAGE_CACHE = VERSION + '-pages';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
        if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (e) {} }
        await self.clients.claim();
    })());
});

const CDN = /^https:\/\/(cdnjs\.cloudflare\.com|www\.gstatic\.com\/firebasejs|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET' || req.cache === 'no-store' || req.headers.has('range')) return;
    const url = new URL(req.url);
    if (req.destination === 'video' || req.destination === 'audio') return;

    // Thư viện CDN có số phiên bản trong URL: lấy từ bộ nhớ đệm, không có mới tải
    if (CDN.test(req.url)) {
        event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
            const hit = await cache.match(req);
            if (hit) return hit;
            const res = await fetch(req);
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
        }));
        return;
    }
    if (url.origin !== self.location.origin) return;

    // Trang HTML: mạng trước, mất mạng thì dùng bản đã lưu
    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const res = (await event.preloadResponse) || await fetch(req);
                if (res && res.ok) { const copy = res.clone(); caches.open(PAGE_CACHE).then(c => c.put(req, copy)); }
                return res;
            } catch (e) {
                const hit = await caches.match(req, { ignoreSearch: true });
                if (hit) return hit;
                throw e;
            }
        })());
        return;
    }

    // Ảnh cùng trang: trả bản lưu ngay, cập nhật ngầm
    if (req.destination === 'image') {
        event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
            const hit = await cache.match(req);
            const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
            return hit || net;
        }));
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({type: 'window', includeUncontrolled: true}).then(windowClients => {
            // Focus vào tab đang mở nếu web đang chạy ngầm
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            // Mở tab mới nếu web đang bị đóng hẳn
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
