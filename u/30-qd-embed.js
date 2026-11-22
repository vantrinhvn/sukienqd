    window.QDEmbed = (function () {
        'use strict';
        var W = window, d = document;
        var PAGES = { 'qt.html': ['🎡', 'Vòng Quay'], 'tranht.html': ['🧧', 'Rút Lì Xì'], 'game.html': ['🎯', 'Ném Còn'], 'quays.html': ['🎰', 'Quay Số Trực Tiếp'] };
        var RE = /(?:^|\/)(qt|tranht|game|quays)\.html$/i;
        var ov = null, frame = null, stage = null, loadEl = null, isOpen = false, pushed = false, leaving = 0, watchT = 0, cur = '';
        // Nhạc nền trang thành viên: VẪN PHÁT TIẾP khi mở trò chơi trong khung (trò chơi không có nhạc riêng).
        // Trình duyệt đang chặn tự phát (vd tự đăng nhập lại) -> chạm / bấm phím bên trong trò chơi cũng bật được nhạc.
        function musicNudge() { var M = W.Music; if (M && M.el && M.enabled && M.active && M.el.paused) { try { M.play(true); } catch (e) {} } }

        function pageOf(u) { var m = RE.exec(u.pathname); return m ? m[1].toLowerCase() + '.html' : ''; }
        function sameOrigin(u) { return u.origin === location.origin; }
        function isExit(u) { return sameOrigin(u) && (/(?:^|\/)(user|index)\.html$/i.test(u.pathname) || /\/$/.test(u.pathname)); }
        function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

        function build() {
            if (ov) return;
            ov = d.createElement('div'); ov.id = 'qd-embed'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
            ov.innerHTML = '<div class="qe-box"><div class="qe-bar">'
                + '<button type="button" class="qe-btn back" data-qe="back" title="Về Trang Chủ" aria-label="Về Trang Chủ">‹<span class="t"> Trang Chủ</span></button>'
                + '<div class="qe-ttl" id="qe-ttl"></div>'
                + '<div class="qe-tabs" role="tablist">' + Object.keys(PAGES).map(function (p) { return '<button type="button" class="qe-tab" role="tab" data-qe-go="' + p + '" title="' + esc(PAGES[p][1]) + '">' + PAGES[p][0] + '<span class="t"> ' + esc(PAGES[p][1]) + '</span></button>'; }).join('') + '</div>'
                + '<button type="button" class="qe-btn x" data-qe="back" title="Đóng" aria-label="Đóng">×</button>'
                + '</div><div class="qe-stage"><div class="qe-load"><div class="qe-spin"></div><span>Đang mở…</span></div></div></div>';
            stage = ov.querySelector('.qe-stage'); loadEl = ov.querySelector('.qe-load');
            ov.addEventListener('click', function (e) {
                var b = e.target.closest('[data-qe],[data-qe-go]'); if (!b) return;
                if (b.hasAttribute('data-qe-go')) { var p = b.getAttribute('data-qe-go'); if (p !== cur) go(p); }
                else close(false);
            });
            d.body.appendChild(ov);
            W.addEventListener('resize', place);
        }
        // Máy tính: chừa menu bên ra (vẫn bấm được); điện thoại: toàn màn hình
        function place() {
            if (!ov) return;
            var sb = d.querySelector('.floating-sidebar'), r = sb && sb.offsetParent !== null ? sb.getBoundingClientRect() : null;
            if (r && r.width > 40 && W.innerWidth >= 1024) { ov.classList.add('side'); ov.style.left = Math.round(r.right + 16) + 'px'; }
            else { ov.classList.remove('side'); ov.style.left = '0px'; }
        }
        function setTitle(p) {
            cur = p; var m = PAGES[p] || ['🎮', 'Trò chơi'];
            d.getElementById('qe-ttl').innerHTML = '<i>' + m[0] + '</i><span>' + esc(m[1]) + '</span>';
            Array.prototype.forEach.call(ov.querySelectorAll('.qe-tab'), function (t) { var on = t.getAttribute('data-qe-go') === p; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
        }
        function newFrame(src) {
            if (frame) { try { frame.src = 'about:blank'; } catch (e) {} frame.remove(); }
            frame = d.createElement('iframe'); frame.title = 'Trò chơi'; frame.setAttribute('allow', 'autoplay; fullscreen; clipboard-write; vibrate');
            frame.addEventListener('load', function () { loadEl.classList.add('off'); watch(); try { frame.contentWindow.focus(); } catch (e) {} });
            loadEl.classList.remove('off');
            frame.src = src; stage.insertBefore(frame, loadEl);
        }
        function go(p) { setTitle(p); newFrame(p); }

        /* ---------- Theo dõi trang trong khung: về user.html -> chỉ đóng khung ---------- */
        function exitTo(u) {
            close(false);
            if (u.hash && /qd-act=/.test(u.hash)) setTimeout(function () { location.hash = u.hash; }, 450);   // vd Quân Sư bảo "mở Điểm Danh"
            if (/[?&]out=/.test(u.search)) { try { W.QDSession && W.QDSession.check(); } catch (e) {} }
        }
        function watch() {
            if (!isOpen || !frame) return;
            var w, href; try { w = frame.contentWindow; href = w.location.href; } catch (e) { return; }
            if (!w || !href || href === 'about:blank') return;
            var u; try { u = new URL(href); } catch (e) { return; }
            if (isExit(u)) return exitTo(u);                                   // trình duyệt cũ: trang chủ đã bắt đầu tải trong khung -> đóng ngay
            if (w.__qdEmbed) return; w.__qdEmbed = true;
            try { w.addEventListener('pointerdown', musicNudge, true); w.addEventListener('touchend', musicNudge, true); w.addEventListener('keydown', musicNudge, true); } catch (e) {}
            var p = pageOf(u); if (p && p !== cur) setTitle(p);
            try {   // trình duyệt mới: chặn trước khi rời trang
                if (w.navigation && w.navigation.addEventListener) w.navigation.addEventListener('navigate', function (e) {
                    try { var dst = new URL(e.destination.url); if (e.navigationType !== 'traverse' && e.cancelable && isExit(dst)) { e.preventDefault(); exitTo(dst); } } catch (er) {}
                });
                w.addEventListener('click', function (e) {
                    if (e.defaultPrevented || e.button !== 0) return;
                    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null; if (!a || (a.target && a.target !== '_self')) return;
                    var dst = new URL(a.getAttribute('href'), w.location.href); if (isExit(dst)) { e.preventDefault(); exitTo(dst); }
                });
            } catch (e) {}
        }

        /* ---------- Mở / đóng ---------- */
        function closeModals() {
            var n = 0;
            Array.prototype.forEach.call(d.querySelectorAll('.modal-overlay.active'), function (m) { if (m.id === 'modal-account-locked') return; n++; try { W.UI.closeModal(m.id); } catch (e) { m.classList.remove('active'); m.style.display = 'none'; } });
            try { if (W.QDHelp) W.QDHelp.close(); } catch (e) {}
            return n;
        }
        function open(url) {
            var u; try { u = new URL(url, location.href); } catch (e) { return false; }
            var p = pageOf(u); if (!p || !sameOrigin(u)) return false;
            build(); place();
            var src = p + u.search + u.hash;
            setTimeout(function () { try { sessionStorage.removeItem('qd_resume'); } catch (e) {} }, 0);   // không rời trang -> không cần "tự đăng nhập lại"
            if (isOpen) { setTitle(p); newFrame(src); return true; }
            var wait = closeModals() ? 380 : 0;
            isOpen = true; ov.classList.add('on'); d.body.classList.add('qd-embed-open');
            setTitle(p); newFrame(src);
            clearInterval(watchT); watchT = setInterval(watch, 120);
            pushed = false;   // chờ hộp vừa đóng trả xong bước "Quay lại" của nó rồi mới thêm bước của khung
            setTimeout(function () { if (isOpen) { try { history.pushState({ qdEmbed: 1 }, ''); pushed = true; } catch (e) {} } }, wait);
            return true;
        }
        function close(fromPop) {
            if (!isOpen) return; isOpen = false; clearInterval(watchT); if (!pushed) fromPop = true; pushed = false;
            ov.classList.remove('on'); d.body.classList.remove('qd-embed-open');
            if (frame) { try { frame.src = 'about:blank'; } catch (e) {} frame.remove(); frame = null; }   // dừng trò chơi + âm thanh trong khung
            cur = '';
            if (!fromPop) cleanHist(0);
            try { if (W.QDSession) W.QDSession.touch(); } catch (e) {}
        }
        // Bỏ các bước "Quay lại" mà khung đã thêm (của khung + của trò chơi bên trong), để nút Quay lại sau đó hoạt động bình thường
        function cleanHist(n) {
            if (isOpen || n > 6 || !(history.state && history.state.qdEmbed)) { leaving = 0; return; }
            leaving = 1; try { history.back(); } catch (e) { leaving = 0; return; }
            setTimeout(function () { cleanHist(n + 1); }, 220);
        }
        W.addEventListener('popstate', function () {
            if (leaving) return;
            if (isOpen && pushed && !(history.state && history.state.qdEmbed)) close(true);
        });
        d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen && !d.querySelector('.modal-overlay.active')) close(false); });

        /* ---------- Bắt mọi cách mở trò chơi trong trang ---------- */
        // Thẻ <a href="qt.html"> ... (chờ các xử lý sẵn có chạy xong, chưa ai chặn thì mở trong khung)
        W.addEventListener('click', function (e) {
            if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
            if (open(a.getAttribute('href'))) e.preventDefault();
        });
        // Nút dùng onclick="location.href='qt.html'" -> đổi thành mở trong khung
        var ON_RE = /(?:window\.)?location\.href\s*=\s*(['"])((?:qt|tranht|game|quays)\.html[^'"]*)\1/;
        function fix(el) { var s = el.getAttribute('onclick'); if (s && ON_RE.test(s)) el.setAttribute('onclick', s.replace(ON_RE, "window.QDEmbed.open('$2')")); }
        d.addEventListener('click', function (e) { var el = e.target && e.target.closest ? e.target.closest('[onclick]') : null; if (el) fix(el); }, true);
        function fixAll() { Array.prototype.forEach.call(d.querySelectorAll('[onclick*=".html"]'), fix); }
        if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', fixAll); else fixAll();

        // Đổi mục ở menu (Trang Chủ, Trò Chuyện...) -> đóng khung trước
        function hookNav() {
            if (!W.UI || !W.UI.navigate || W.UI.__qdEmbed) return !!(W.UI && W.UI.__qdEmbed);
            var nav = W.UI.navigate;
            W.UI.navigate = function () { if (isOpen) close(false); return nav.apply(this, arguments); };
            W.UI.__qdEmbed = true; return true;
        }
        if (!hookNav()) { var n = 0, t = setInterval(function () { if (hookNav() || ++n > 40) clearInterval(t); }, 250); }

        return { open: function (u) { return open(u); }, close: function () { close(false); }, isOpen: function () { return isOpen; } };
    })();
    
