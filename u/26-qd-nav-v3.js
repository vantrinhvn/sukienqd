    /* Menu 5 thẻ: số tin chưa đọc ở "Trò Chuyện", bàn phím (Enter / Space) và aria-current cho thẻ đang mở */
    (function () {
        'use strict';
        var Q = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
        function unread() {
            var n = 0;
            Q('#view-chat .unread-badge').forEach(function (b) { var v = parseInt(b.textContent, 10); if (v > 0) n += v; });
            return n;
        }
        function paint() {
            var n = unread(), t = n > 99 ? '99+' : String(n);
            Q('[data-nv="chat"] .nv-badge').forEach(function (b) { b.textContent = t; b.hidden = n <= 0; });
            Q('[data-nv="chat"]').forEach(function (e) { e.setAttribute('aria-label', 'Trò Chuyện' + (n > 0 ? ', ' + n + ' tin chưa đọc' : '')); });
        }
        function aria() { Q('.nav-item[data-nv], .m-nav-item[data-nv]').forEach(function (e) { if (e.classList.contains('active')) e.setAttribute('aria-current', 'page'); else e.removeAttribute('aria-current'); }); }
        var t1 = null; function later() { clearTimeout(t1); t1 = setTimeout(paint, 250); }
        function start() {
            Q('.nav-item[data-nv], .m-nav-item[data-nv]').forEach(function (e) {
                e.setAttribute('role', 'button'); e.setAttribute('tabindex', '0');
                e.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); e.click(); } });
                if (window.MutationObserver) new MutationObserver(aria).observe(e, { attributes: true, attributeFilter: ['class'] });
            });
            var c = document.getElementById('view-chat');
            if (c && window.MutationObserver) new MutationObserver(later).observe(c, { childList: true, subtree: true, characterData: true });
            aria(); paint(); setInterval(paint, 6000);
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    })();
    
