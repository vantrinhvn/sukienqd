    /* Phát hiện mất mạng: sự kiện online/offline của trình duyệt + kiểm tra thật định kỳ
       (navigator.onLine có thể báo "có mạng" khi Wi-Fi đã kết nối nhưng không ra được Internet) */
    (function () {
        'use strict';
        if (window.__qdNetGuard) return; window.__qdNetGuard = true;
        var box = document.getElementById('qd-net'), title = document.getElementById('qd-net-title'), sub = document.getElementById('qd-net-sub'), btn = document.getElementById('qd-net-retry');
        var PROBES = ['https://www.gstatic.com/generate_204', 'https://103-77-243-172.sslip.io/health', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2'];
        var offline = false, fails = 0, okTimer = null, checking = false;

        function probe(url) {
            return new Promise(function (resolve, reject) {
                var ctrl = window.AbortController ? new AbortController() : null;
                var t = setTimeout(function () { if (ctrl) ctrl.abort(); reject(new Error('timeout')); }, 6000);
                fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now(), { mode: 'no-cors', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
                    .then(function () { clearTimeout(t); resolve(true); }, function (e) { clearTimeout(t); reject(e); });
            });
        }
        function anyOk() {   // chỉ cần 1 máy chủ phản hồi là có mạng
            return new Promise(function (resolve) {
                var left = PROBES.length;
                PROBES.forEach(function (u) { probe(u).then(function () { resolve(true); }, function () { if (--left === 0) resolve(false); }); });
            });
        }
        function show() {
            if (offline) return; offline = true;
            clearTimeout(okTimer);
            box.classList.remove('ok');
            title.textContent = 'Không có kết nối Internet';
            sub.textContent = 'Vui lòng kiểm tra Wi-Fi hoặc 4G. Hệ thống sẽ tự kết nối lại.';
            box.hidden = false;
        }
        function hide() {
            if (!offline) return; offline = false;
            box.classList.add('ok');
            title.textContent = 'Đã kết nối lại Internet';
            sub.textContent = 'Dữ liệu đang được đồng bộ lại.';
            clearTimeout(okTimer);
            okTimer = setTimeout(function () { box.hidden = true; box.classList.remove('ok'); }, 2500);
        }
        function check() {
            if (checking) return; checking = true;
            if (navigator.onLine === false) { checking = false; fails = 2; show(); return; }
            anyOk().then(function (ok) {
                checking = false;
                if (ok) { fails = 0; hide(); }
                else if (++fails >= 2 || offline) show();   // lỗi 2 lần liên tiếp mới báo, tránh báo nhầm
                else setTimeout(check, 3000);
            });
        }

        window.addEventListener('offline', function () { fails = 2; show(); });
        window.addEventListener('online', function () { setTimeout(check, 500); });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
        btn.addEventListener('click', function () {
            btn.disabled = true; btn.textContent = 'Đang thử...';
            sub.textContent = 'Đang kiểm tra kết nối...';
            fails = 1; checking = false;
            check();
            setTimeout(function () {
                btn.disabled = false; btn.textContent = 'Thử lại';
                if (offline) sub.textContent = 'Vẫn chưa có mạng. Vui lòng kiểm tra Wi-Fi hoặc 4G.';
            }, 2500);
        });
        // Kiểm tra định kỳ: mất mạng thì 5 giây/lần để báo có mạng lại nhanh; bình thường 20 giây/lần
        (function loop() { setTimeout(function () { if (!document.hidden || offline) check(); loop(); }, offline ? 5000 : 20000); })();
        if (navigator.onLine === false) show();
    })();
    
