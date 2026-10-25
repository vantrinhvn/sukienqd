/* QD Elite Service Worker
   - Bấm thông báo: mở / focus lại web và vào đúng phòng chat
   - Hẹn giờ hiện thông báo theo yêu cầu của trang (nút Test 5s)
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

// Trang nhờ hẹn giờ hiện thông báo (nút Test 5s): trang bị ẩn / đóng băng vẫn hiện đúng giờ
self.addEventListener('message', (event) => {
    const d = event.data || {};
    if (d.type !== 'qd-notify-later') return;
    const ms = Math.min(Math.max(Number(d.delay) || 0, 0), 25000);
    event.waitUntil(new Promise(r => setTimeout(r, ms)).then(() =>
        self.registration.showNotification(String(d.title || 'QD Elite'), d.options || {})
    ));
});

// Bấm thông báo: mở / focus lại web rồi vào đúng phòng chat
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const data = event.notification.data || {};
    const roomId = data.roomId || '';
    event.waitUntil((async () => {
        const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        // Ưu tiên tab đang mở trang user.html, không có thì tab bất kỳ của web
        const target = all.find(c => c.url && /user\.html/i.test(c.url)) || all.find(c => c.url);
        if (target) {
            try { await target.focus(); } catch (e) {}
            try { target.postMessage({ type: 'qd-notif-click', roomId }); } catch (e) {}
            return;
        }
        // Web đang đóng hẳn: mở lại trang đã gửi thông báo (mặc định trang chủ)
        if (clients.openWindow) {
            let url = '/';
            try { const u = new URL(data.url || '/', self.location.href); if (u.origin === self.location.origin) url = u.href; } catch (e) {}
            return clients.openWindow(url);
        }
    })());
});
