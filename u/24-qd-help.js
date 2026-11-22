    (function () {
        'use strict';
        try { if (window.QDHelp || window.top !== window) return; } catch (e) { return; }   // không chèn khi trang nằm trong khung
        var d = document, W = window, PAGE = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
        if (!/\.html$/.test(PAGE)) PAGE = 'index.html';
        if (PAGE === 'al.html') return;
        var ADMIN = PAGE === 'admin.html';
        var btn, ov, box, frame, isOpen = false, after = null;
        var H = W.QDHelp = { open: open, close: function () { close(false); } };
        var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            + '<path d="M12 3a7 7 0 0 0-7 7v2.5"/><path d="M19 12.5V10a7 7 0 0 0-7-7"/><rect x="3" y="11.5" width="4" height="6" rx="1.6" fill="currentColor"/><rect x="17" y="11.5" width="4" height="6" rx="1.6" fill="currentColor"/><path d="M19 17.5v.5a3 3 0 0 1-3 3h-2.5"/></svg>';

        /* ---------- Ẩn nút khi trang đang mở hộp thoại / đang chat ---------- */
        function hiddenNow() {
            if (isOpen) return true;
            if (d.querySelector('.modal-overlay.active, .sheet.on, .mt-gate.show, #ps2-pop.show')) return true;
            if (d.body.classList.contains('in-chat-mode')) return true;
            if (ADMIN) { var g = d.getElementById('auth-gate'); if (g && g.style.display !== 'none' && getComputedStyle(g).display !== 'none') return true; }
            if (PAGE === 'user.html' && innerWidth <= 1023) { var c = d.getElementById('view-chat'); if (c && c.classList.contains('active')) return true; }
            return false;
        }
        function tick() { if (btn) { var h = hiddenNow(); if (btn.classList.contains('qh-hide') !== h) btn.classList.toggle('qh-hide', h); } }

        /* ---------- Mở / đóng khung ---------- */
        // Trạng thái đăng nhập lúc mở khung (user.html): đổi trạng thái (vừa đăng nhập / đổi tài khoản) -> tải lại Quân Sư
        function authKey() { return PAGE === 'user.html' ? (loggedIn() ? 'u:' + W.State.currentUser : 'guest') : ADMIN ? 'adm' : ''; }
        function open(q) {
            if (isOpen) return; isOpen = true;
            var key = authKey();
            if (!frame || frame._auth !== key) {
                if (!frame) { frame = d.createElement('iframe'); frame.title = 'Quân Sư AI - Hỗ trợ'; frame.setAttribute('allow', 'clipboard-write'); box.appendChild(frame); }
                frame._auth = key;
                frame.src = 'al.html?embed=1&from=' + encodeURIComponent(PAGE) + (key.indexOf('u:') === 0 ? '&u=' + encodeURIComponent(key.slice(2)) : key === 'adm' ? '&adm=1' : '') + (q ? '&q=' + encodeURIComponent(q) : '');
            }
            ov.classList.add('on'); tick();
            try { history.pushState({ qdHelp: 1 }, ''); } catch (e) {}
            setTimeout(function () { try { frame.contentWindow.focus(); } catch (e) {} }, 320);
        }
        function close(fromPop) {
            if (!isOpen) return; isOpen = false; ov.classList.remove('on'); tick();
            if (!fromPop && history.state && history.state.qdHelp) { try { history.back(); } catch (e) {} }
        }
        // Đóng khung rồi mới làm việc tiếp (chờ bước "Quay lại" của khung xong, tránh đụng chuyển trang)
        function closeThen(fn) {
            if (isOpen && history.state && history.state.qdHelp) {
                after = fn; isOpen = false; ov.classList.remove('on'); tick();
                try { history.back(); } catch (e) {}
                setTimeout(function () { if (after) { var f = after; after = null; f(); } }, 450);
            } else { close(true); fn(); }
        }
        W.addEventListener('popstate', function () {
            if (after) { var f = after; after = null; setTimeout(f, 0); return; }
            if (isOpen) close(true);
        });
        d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) close(false); });

        /* ---------- Nút hành động gửi từ khung ---------- */
        function getUI() { try { if (typeof UI !== 'undefined' && UI) return UI; } catch (e) {} return W.UI; }   // admin.html khai báo const UI (không nằm trên window)
        function nav(v) {
            var U = getUI(); if (!U || !U.navigate) return false;
            U.navigate(v, d.querySelector('.nav-item[onclick*="\'' + v + '\'"]'));
            try { var w = d.querySelector('.workspace-area'); if (w && w.scrollTo) w.scrollTo({ top: 0 }); W.scrollTo({ top: 0 }); } catch (e) {}
            return true;
        }
        function loggedIn() { var s = d.getElementById('app-shell'); return !!(W.State && W.State.currentUser && s && s.style.display !== 'none'); }
        function doAct(a) {
            var U = getUI();
            switch (a) {
                case 'attendance': case 'news': case 'tournament': case 'chat': return nav(a);
                case 'rps': if (W.RPSGame && W.RPSGame.openFromTab) { W.RPSGame.openFromTab(); return true; } return nav('rps');
                case 'shop': if (W.PointShop && W.PointShop.open) { W.PointShop.open(); return true; } break;
                case 'lucky': if (W.LnTab && W.LnTab.open) { W.LnTab.open(); return true; } break;
                case 'regid': if (W.RegID && W.RegID.open) { W.RegID.open(); return true; } break;
                case 'inventory': case 'transfer': case 'profile': case 'settings': if (U && U.openModal) { U.openModal('modal-' + a); return true; } break;
                case 'lixi': if (nav('dashboard')) { setTimeout(function () { var c = d.getElementById('lixi-card'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 250); return true; } break;
                case 'cashout': if (W.Cashout && W.Cashout.open) { W.Cashout.open(); return true; } break;
                case 'gifts': if (W.QDGift && W.QDGift.show) { W.QDGift.show(); return true; } break;
                case 'bank': if (W.PayoutUser && W.PayoutUser.openForm) { W.PayoutUser.openForm(); return true; } break;
                case 'videos': return nav('videos');
            }
            return false;
        }
        function go(url) {   // qua thẻ <a data-resume>: user.html lưu phiên tạm để khi quay lại tự đăng nhập
            var a = d.createElement('a'); a.href = url; a.setAttribute('data-resume', ''); a.style.display = 'none'; d.body.appendChild(a); a.click();
            setTimeout(function () { a.remove(); }, 1000);
        }
        W.addEventListener('message', function (e) {
            // Chỉ nhận tin từ đúng khung Quân Sư (mở dạng file:// thì origin là 'null' nên kiểm tra theo nguồn gửi)
            if (!frame || e.source !== frame.contentWindow || !e.data || typeof e.data !== 'object') return;
            if (e.origin !== location.origin && e.origin !== 'null') return;
            var m = e.data;
            if (m.type === 'qd-help-close') close(false);
            else if (m.type === 'qd-help-act' && ADMIN) {   // trang Admin: mở đúng mục quản trị, trang thành viên thì mở tab mới
                var v = typeof m.adm === 'string' && /^[a-z]+$/.test(m.adm) ? m.adm : null;
                if (!v && typeof m.go === 'string') v = ADM_GO[m.go.toLowerCase()] || null;
                if (!v && typeof m.act === 'string') v = ADM_DO[m.act] || null;
                if (v) return closeThen(function () { nav(v); });
                var url = typeof m.go === 'string' && /^[a-z0-9_-]+\.html$/i.test(m.go) ? m.go : 'user.html';
                try { W.open(url, '_blank'); } catch (er) {}
            }
            else if (m.type === 'qd-help-act') {
                var go1 = typeof m.go === 'string' && /^[a-z0-9_-]+\.html$/i.test(m.go) ? m.go : null;
                var act = typeof m.act === 'string' && /^[a-z]+$/.test(m.act) ? m.act : null;
                if (go1) return closeThen(function () { if (go1.toLowerCase() !== PAGE) go(go1); });
                // Khách chưa có tài khoản / chưa đăng nhập: mở form đăng ký (index) hoặc ô đăng nhập (user)
                if (act === 'register') return closeThen(function () { if (PAGE === 'index.html') openReg(); else location.href = 'index.html#qd-act=register'; });
                if (act === 'login') return closeThen(function () { if (PAGE === 'user.html') { if (!loggedIn()) focusLogin(); } else location.href = 'user.html'; });
                if (act) closeThen(function () { if (!(PAGE === 'user.html' && loggedIn() && doAct(act))) { if (PAGE === 'user.html') queue(act); else go('user.html#qd-act=' + act); } });
            }
        });

        var ADM_GO = { 'qt.html': 'wheel', 'tranht.html': 'tranhthuong', 'game.html': 'nemcon', 'quays.html': 'luckynumber', 'index.html': 'approvals', 'user.html': 'dashboard' };
        var ADM_DO = { attendance: 'attendance', shop: 'pointshop', lucky: 'luckynumber', rps: 'rps', regid: 'registration', tournament: 'tournament', news: 'news', lixi: 'lixi', inventory: 'accounts', transfer: 'transfer', profile: 'accounts', cashout: 'payout', bank: 'payout', gifts: 'gifts', videos: 'videos' };

        /* ---------- user.html#qd-act=...: chờ đăng nhập xong rồi mở đúng chức năng ---------- */
        var pending = null, pendT = 0;
        function queue(act) {
            pending = { act: act, until: Date.now() + 180000 }; clearInterval(pendT);
            pendT = setInterval(function () {
                if (!pending || Date.now() > pending.until) { clearInterval(pendT); pending = null; return; }
                if (loggedIn()) { var a = pending.act; pending = null; clearInterval(pendT); setTimeout(function () { doAct(a); }, 600); }
            }, 400);
        }
        function readHash() {
            var m = /[#&]qd-act=([a-z]+)/.exec(location.hash || ''); if (!m) return;
            try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) {}
            if (PAGE === 'user.html') queue(m[1]);
            else if (PAGE === 'index.html' && m[1] === 'register') setTimeout(openReg, 400);
        }
        function openReg() { if (typeof W.openRegisterModal === 'function') W.openRegisterModal(); }
        function focusLogin() {
            var u = d.getElementById('login-usr'), p = d.getElementById('login-pwd'), f = u && !u.value.trim() ? u : (p || u);
            if (!f) return;
            try { f.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
            setTimeout(function () { try { f.focus(); } catch (e) {} }, 250);
        }

        /* ---------- Khởi động ---------- */
        function boot() {
            d.body.classList.add('qh-' + PAGE.replace(/\.html$/, ''));
            btn = d.createElement('button');
            btn.type = 'button'; btn.id = 'qd-help-btn'; btn.setAttribute('aria-label', 'Hỗ trợ — hỏi Quân Sư AI'); btn.title = 'Hỗ trợ — hỏi Quân Sư AI';
            btn.innerHTML = '<span class="qh-ico">' + ICON + '</span><span class="qh-txt">Hỗ trợ</span>';
            btn.addEventListener('click', function (e) { e.stopPropagation(); open(); });
            ov = d.createElement('div'); ov.id = 'qd-help-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Quân Sư AI - Hỗ trợ');
            box = d.createElement('div'); box.id = 'qd-help-box'; ov.appendChild(box);
            ov.addEventListener('click', function (e) { if (e.target === ov) close(false); });
            d.body.appendChild(ov); d.body.appendChild(btn);
            try { if (!sessionStorage.getItem('qd_help_seen')) { sessionStorage.setItem('qd_help_seen', '1'); btn.classList.add('qh-ping'); } } catch (e) {}
            var tt = 0; if (W.MutationObserver) new MutationObserver(function () { if (!tt) tt = setTimeout(function () { tt = 0; tick(); }, 60); }).observe(d.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
            setInterval(tick, 1500); tick();
            readHash(); W.addEventListener('hashchange', readHash);
        }
        if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
    })();
    
