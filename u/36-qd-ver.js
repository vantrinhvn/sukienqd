    window.QDVersion = (function () {
        'use strict';
        /* Phiên bản hệ thống + BẮT BUỘC CẬP NHẬT:
           - Đọc app-update.json (GitHub tự tạo mỗi lần đẩy file), hiện "Phiên bản v1.1.0.x" vào các ô [data-qd-ver]
           - Kiểm tra lại mỗi 2 phút + khi quay lại tab / có mạng lại. Đang dùng bản cũ -> lớp phủ "Cập nhật ngay" (không có Để sau)
           - Trang web: tải lại đúng bản mới (?v=... để không dính bộ nhớ đệm). Trong app: nhờ app áp dụng bản mới (QDNative.updateNow) */
        var REPO = 'vantrinhvn/sukienqd', info = null, loaded = null, waiting = [], timer = 0;
        var ua = navigator.userAgent || '', app = /QDEliteApp\/([\d.]+)/.exec(ua), webInApp = /QDWeb\/(\w+)/.exec(ua);
        function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        function getJson(u, h) { return fetch(u, { cache: 'no-store', headers: h || {} }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
        function load() {
            return getJson('app-update.json?t=' + Date.now())
                .catch(function () { return getJson('https://raw.githubusercontent.com/' + REPO + '/main/app-update.json?t=' + Date.now()); })
                .catch(function () { return getJson('https://api.github.com/repos/' + REPO + '/contents/app-update.json?ref=main', { Accept: 'application/vnd.github.raw' }); })
                .then(function (j) { return j && j.version ? j : null; }, function () { return null; });
        }
        function bridge() { try { return window.QDNative && typeof window.QDNative.webVersion === 'function' ? window.QDNative : null; } catch (e) { return null; } }
        // Mã bản web ĐANG CHẠY: trang web = bản lúc mở trang; trong app = app báo (bản mới) / User-Agent (app cũ)
        function runningId() {
            if (!app) return loaded;
            var b = bridge(); if (b) { try { return String(b.webVersion() || ''); } catch (e) {} }
            return webInApp ? webInApp[1] : '';
        }
        function num(j) { return j ? (j.name ? 'v' + j.name : j.number ? String(j.number) : j.version) : ''; }
        function isStale() { var r = runningId(); return !!(info && r !== null && r !== info.version); }
        function link(v) { return info && info.commit && /^(v[\d.]+|\d+)$/.test(v) ? '<a href="https://github.com/' + REPO + '/commit/' + esc(info.commit) + '" target="_blank" rel="noopener"><b>' + esc(v) + '</b></a>' : '<b>' + esc(v) + '</b>'; }
        function paint() {
            var txt = !info ? '' : isStale() ? 'cũ (bản mới: ' + num(info) + ')' : num(info);
            Array.prototype.forEach.call(document.querySelectorAll('[data-qd-ver]'), function (el) {
                if (!txt) { el.innerHTML = ''; return; }
                el.innerHTML = el.getAttribute('data-qd-ver') === 'full'
                    ? '<div class="qv-r"><span><i class="fa-solid fa-circle-info"></i> Phiên bản hệ thống</span>' + link(txt) + '</div>'
                    : 'Phiên bản ' + link(txt);
            });
        }
        /* ---------- Lớp phủ bắt buộc cập nhật ---------- */
        function reloadFresh() {
            try { var u = new URL(location.href); u.searchParams.set('v', info.version); location.replace(u.toString()); } catch (e) { location.reload(); }
        }
        // Lớp phủ "Cập nhật ngay" (kiểu Tết). name: tên phiên bản mới; oldApp: app chưa có cầu nối -> hướng dẫn mở lại app
        function overlay(name, oldApp) {
            var d = document.getElementById('qd-force-upd'); if (d) return d;
            var b = bridge();
            d = document.createElement('div'); d.id = 'qd-force-upd'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true');
            d.innerHTML = '<div class="box"><div class="ic">🔄</div><h3>Đã có phiên bản mới' + (name ? ' ' + esc(name) : '') + '</h3>'
                + (oldApp
                    ? '<p>Bạn đang dùng bản cũ. Hãy <b>tắt hẳn app QD Elite</b> (vuốt app khỏi danh sách đa nhiệm) rồi <b>mở lại</b> để cập nhật.</p><p class="sm">Nếu app hỏi "Cập nhật", hãy chọn Cập nhật.</p>'
                    : '<p>Bạn đang dùng bản cũ. Vui lòng cập nhật để tiếp tục sử dụng.</p>')
                + (oldApp ? '' : '<button type="button" class="go">Cập nhật ngay</button>') + '</div>';
            document.body.appendChild(d);
            var go = d.querySelector('.go');
            if (go) go.onclick = function () {
                go.disabled = true; go.textContent = 'Đang cập nhật...';
                if (app && b) { try { b.updateNow(); } catch (e) { location.reload(); } setTimeout(function () { go.disabled = false; go.textContent = 'Cập nhật ngay'; }, 15000); }
                else reloadFresh();
            };
            return d;
        }
        function gate() {
            var old = document.getElementById('qd-force-upd');
            if (!isStale()) { if (old && !old.__app) old.remove(); return; }
            overlay(num(info), app && !bridge());
        }
        // App (v1.0.24+) báo đã tải xong bản web mới -> hiện lớp phủ Tết thay cho hộp thoại trắng của Android
        function appUpdateReady(version, message) {
            if (!app || !bridge()) return false;
            var d = overlay(info && info.version === version ? num(info) : '', false); d.__app = true;
            return true;
        }
        function refresh() {
            return load().then(function (j) {
                if (!j) return;
                info = j;
                if (loaded === null && !app) loaded = j.version;   // trang web: bản lúc vừa mở trang
                paint(); gate();
                waiting.forEach(function (f) { try { f(info); } catch (e) {} }); waiting = [];
            });
        }
        function start() {
            // Vừa tải lại bằng ?v=...: bỏ tham số khỏi thanh địa chỉ cho gọn (giữ các tham số khác)
            try { var u = new URL(location.href); if (u.searchParams.has('v')) { u.searchParams.delete('v'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } } catch (e) {}
            paint(); refresh();
            timer = setInterval(function () { if (!document.hidden) refresh(); }, 120000);
            document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
            window.addEventListener('online', refresh);
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
        return { paint: paint, refresh: refresh, appUpdateReady: appUpdateReady, get: function () { return info; }, stale: isStale, onLoad: function (f) { if (info) f(info); else waiting.push(f); } };
    })();
    
