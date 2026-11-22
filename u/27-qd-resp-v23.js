    /* Bản 23 — phần JS của lớp giao diện:
       1. Cân hàng thẻ trò chơi ở Trang Chủ (thay bản 22.1): lưới 12 rãnh, 2 / 3 / 4 thẻ mỗi hàng theo bề rộng màn hình.
          Số thẻ hiện thay đổi theo Admin ẩn / hiện / khóa mục nên hàng cuối có thể lẻ -> chia lại cho đầy hàng. Ném Còn luôn ngang cả hàng.
       2. Trò Chuyện 2 cột trên máy tính bảng dọc (QDChat2Pane), xoay / đổi cỡ cửa sổ thì tự chuyển đúng kiểu.
       3. Đổi mục ở menu -> cuộn về đầu trang; body[data-qd-view] = mục đang mở; body.qd-out = đang ở màn đăng nhập. */
    (function () {
        'use strict';
        var W = window, d = document;
        var mm = function (q) { return !!(W.matchMedia && W.matchMedia(q).matches); };
        W.QDChat2Pane = function () { return W.innerWidth > 1023 || (W.innerWidth >= 768 && W.innerHeight >= 560); };

        /* ---------- 1. Cân hàng thẻ ---------- */
        function seen(el) { return el.getClientRects().length > 0; }
        function setSpan(el, v) {
            var cur = el.style.getPropertyValue('grid-column');
            if (v) { if (cur !== v) el.style.setProperty('grid-column', v, 'important'); }
            else if (cur) el.style.removeProperty('grid-column');
        }
        // Trả về số rãnh (trên 12) cho từng thẻ
        function plan(n, per) {
            var base = 12 / per, s = [], i;
            for (i = 0; i < n; i++) s.push(base);
            var r = n % per;
            if (!r) return s;
            if (n < per) { for (i = 0; i < n; i++) s[i] = 12 / n; return s; }            // ít thẻ hơn 1 hàng: chia đều cả hàng
            if (per === 2) { s[n - 1] = 12; return s; }                                    // 2 thẻ / hàng: thẻ lẻ cuối ngang cả hàng
            if (per === 3) {
                if (r === 2) { s[n - 1] = s[n - 2] = 6; }                                  // 3 + 2
                else { for (i = n - 4; i < n; i++) s[i] = 6; }                             // dư 1: 4 thẻ cuối xếp 2 + 2
                return s;
            }
            // 4 thẻ / hàng
            if (r === 2) { s[n - 1] = s[n - 2] = 6; }
            else if (r === 3) { s[n - 1] = s[n - 2] = s[n - 3] = 4; }
            else { for (i = n - 5; i < n; i++) s[i] = i < n - 2 ? 4 : 6; }                 // dư 1: 5 thẻ cuối xếp 3 + 2
            return s;
        }
        var busy = false;
        function fix() {
            var g = d.querySelector('#view-dashboard .bento-grid'); if (!g || !seen(g) || busy) return;
            busy = true;
            var all = Array.prototype.slice.call(g.querySelectorAll(':scope > .wheel-tab'));
            var tabs = all.filter(function (t) { return !t.classList.contains('con-tab') && seen(t); });
            var per = mm('(min-width: 1500px)') ? 4 : mm('(min-width: 768px)') ? 3 : 2;
            var sp = plan(tabs.length, per), base = 12 / per;
            all.forEach(function (t) {
                var i = tabs.indexOf(t);
                if (t.classList.contains('con-tab')) setSpan(t, '1 / -1');
                else setSpan(t, i < 0 || sp[i] === base ? '' : (sp[i] === 12 ? '1 / -1' : 'span ' + sp[i]));
                if (t.classList.contains('qd-span')) t.classList.remove('qd-span');   // lớp của bản 22.1, không dùng nữa
                if (t.classList.contains('qd-half')) t.classList.remove('qd-half');
            });
            setTimeout(function () { busy = false; }, 0);
        }
        var t1 = 0; function later() { clearTimeout(t1); t1 = setTimeout(fix, 60); }

        /* ---------- 2. Trò Chuyện: đổi kiểu 1 cột / 2 cột khi xoay máy, đổi cỡ cửa sổ ---------- */
        var lastPane = null;
        function chatMode() {
            var two = W.QDChat2Pane(); if (two === lastPane) return; lastPane = two;
            var v = d.getElementById('view-chat'); if (!v || !v.classList.contains('active') || !W.Chat || !W.Chat.toggleMobile) return;
            try { W.Chat.toggleMobile(!(W.State && W.State.chatTarget)); } catch (e) {}
        }

        /* ---------- 3. Mục đang mở, cuộn về đầu trang, trạng thái đăng nhập ---------- */
        function setView(v) { if (v && d.body.getAttribute('data-qd-view') !== v) d.body.setAttribute('data-qd-view', v); }
        function wrapNav() {
            if (!W.UI || !W.UI.navigate || W.UI.navigate.__v23) return;
            var nav = W.UI.navigate;
            W.UI.navigate = function (vid) {
                var before = d.body.getAttribute('data-qd-view');
                var r = nav.apply(this, arguments);
                var tgt = d.getElementById('view-' + vid);
                if (tgt && tgt.classList.contains('active')) {
                    setView(vid);
                    if (before && before !== vid) {
                        var m = d.querySelector('.main-content-wrapper'), ws = d.querySelector('.workspace-area');
                        try { if (m) m.scrollTop = 0; if (ws) ws.scrollTop = 0; W.scrollTo(0, 0); } catch (e) {}
                    }
                    later();
                }
                return r;
            };
            W.UI.navigate.__v23 = true;
        }
        function authState() {
            var g = d.getElementById('auth-gate');
            var out = !!g && g.style.display !== 'none' && g.style.opacity !== '0' && getComputedStyle(g).display !== 'none';
            if (d.body.classList.contains('qd-out') !== out) d.body.classList.toggle('qd-out', out);
            if (authState.last !== out) {   // Màn đăng nhập che kín: tạm dừng hạt nền chạy ngầm phía sau, vào app thì chạy lại
                authState.last = out;
                try { var PS = W.ParticleSystem; if (PS && PS.setRunning && PS.canvas) PS.setRunning(!out && !d.hidden && !(W.QDSmooth && W.QDSmooth.lite)); } catch (e) {}
            }
        }

        function start() {
            wrapNav();
            var act = d.querySelector('.view-section.active'); setView(act ? act.id.replace('view-', '') : 'dashboard');
            authState(); lastPane = W.QDChat2Pane();
            var g = d.getElementById('auth-gate'), sh = d.getElementById('app-shell');
            if (W.MutationObserver) {
                var mo = new MutationObserver(authState);
                if (g) mo.observe(g, { attributes: true, attributeFilter: ['style'] });
                if (sh) mo.observe(sh, { attributes: true, attributeFilter: ['style'] });
                var grid = d.querySelector('#view-dashboard .bento-grid');
                if (grid) new MutationObserver(later).observe(grid, { attributes: true, subtree: true, childList: true, attributeFilter: ['style', 'hidden', 'class'] });
            }
            W.addEventListener('resize', function () { later(); chatMode(); });
            W.addEventListener('orientationchange', function () { setTimeout(function () { later(); chatMode(); }, 250); });
            later(); setInterval(fix, 3000);
        }
        if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
    })();
    
