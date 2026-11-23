    /* ===== QD ADMIN LAYOUT: đồng bộ menu bên / thanh dưới / menu chức năng, tiêu đề trang,
       nút giao diện sáng-tối, số đơn chờ duyệt và ẩn nhóm trống khi Quản lý bị giới hạn quyền ===== */
    (function () {
        'use strict';
        var VIEWS = {
            dashboard: ['Tổng quan', 'Bảng điều khiển'],
            approvals: ['Thành viên', 'Phê duyệt tài khoản'],
            accounts: ['Thành viên', 'Quản trị tài khoản'],
            attendance: ['Thành viên', 'Điểm danh'],
            registration: ['Thành viên', 'Đăng ký ID game'],
            tranhthuong: ['Sự kiện Tết', 'Rút lì xì'],
            lixi: ['Sự kiện Tết', 'Lì xì điểm'],
            wheel: ['Sự kiện Tết', 'Vòng quay'],
            luckynumber: ['Sự kiện Tết', 'Quay số may mắn'],
            pointshop: ['Giải trí & thưởng', 'Cửa hàng điểm'],
            rps: ['Giải trí & thưởng', 'Kéo búa bao'],
            nemcon: ['Giải trí & thưởng', 'Ném còn'],
            invite: ['Giải trí & thưởng', 'Mã mời'],
            tournament: ['Thi đấu & tin tức', 'Giải đấu'],
            news: ['Thi đấu & tin tức', 'Bản tin'],
            reportbot: ['Thi đấu & tin tức', 'Bot báo cáo'],
            apppush: ['Thi đấu & tin tức', 'Thông báo app'],
            videos: ['Thi đấu & tin tức', 'Chia sẻ video'],
            calls: ['Thi đấu & tin tức', 'Cuộc gọi'],
            gifts: ['Giải trí & thưởng', 'Quà toàn hệ thống'],
            transfer: ['Giải trí & thưởng', 'Tặng lượt'],
            payout: ['Giải trí & thưởng', 'Trả thưởng tiền mặt'],
            security: ['Thành viên', 'Chống gian lận'],
            vps: ['Hệ thống', 'Máy chủ VPS']
        };
        function $(s, r) { return (r || document).querySelector(s); }
        function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
        function viewOf(el) { var m = /navigate\('([a-z]+)'/.exec(el.getAttribute('onclick') || ''); return m ? m[1] : null; }
        function current() { var s = $('.view-section.active'); return s ? s.id.replace('view-', '') : 'dashboard'; }

        /* 1. Menu đang chọn + tiêu đề trang */
        function syncNav() {
            var v = current(), meta = VIEWS[v] || VIEWS.dashboard, hit = false;
            $$('.nav-item, .m-menu-item').forEach(function (el) { el.classList.toggle('active', viewOf(el) === v); });
            $$('.m-nav-item').forEach(function (el) { var on = viewOf(el) === v; if (on) hit = true; el.classList.toggle('active', on); });
            var menu = $('.m-nav-item[data-nav="menu"]'); if (menu) menu.classList.toggle('active', !hit);
            var t = $('#page-title'), c = $('#page-crumb');
            if (t) t.textContent = meta[1];
            if (c) c.textContent = v === 'dashboard' ? 'QD Admin' : meta[0];
            document.title = meta[1] + ' - QD Admin';
        }
        if (typeof UI !== 'undefined' && UI.navigate) {
            var baseNav = UI.navigate;
            UI.navigate = function (viewId, el, isMobile) { baseNav(viewId, el, isMobile); syncNav(); };
        }

        /* 2. Giao diện sáng / tối: đồng bộ mọi nút */
        function syncTheme() {
            var dark = document.documentElement.getAttribute('data-theme') !== 'light';
            $$('.js-theme-ico').forEach(function (i) { i.className = 'js-theme-ico fa-solid ' + (dark ? 'fa-moon' : 'fa-sun'); });
            $$('.js-theme-txt').forEach(function (s) { s.textContent = dark ? 'Giao diện tối' : 'Giao diện sáng'; });
            var m = $('meta[name="theme-color"]'); if (m) m.setAttribute('content', dark ? '#121217' : '#ffffff');
        }
        if (typeof Theme !== 'undefined') {
            var tInit = Theme.init, tToggle = Theme.toggle;
            Theme.init = function () { tInit(); syncTheme(); };
            Theme.toggle = function () { tToggle(); syncTheme(); };
        }

        /* 3. Thông tin người đăng nhập (sau khi xác thực) */
        function fillUser() {
            var u = (typeof State !== 'undefined' && State.currentUser) || 'admin';
            var role = (typeof State !== 'undefined' && State.currentUserRole === 'manager') ? 'Quản lý' : 'Quản trị viên';
            $$('.js-user').forEach(function (e) { e.textContent = u; });
            $$('.js-role').forEach(function (e) { e.textContent = role; });
            $$('.js-avatar').forEach(function (e) { e.textContent = u.charAt(0).toUpperCase(); });
            var d = $('#dash-date');
            if (d) { var s = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }); d.textContent = s.charAt(0).toUpperCase() + s.slice(1); }
        }
        if (typeof AdminCore !== 'undefined' && AdminCore.init) {
            var coreInit = AdminCore.init;
            AdminCore.init = function () { coreInit.apply(this, arguments); fillUser(); syncNav(); syncGroups(); syncPending(); };
        }

        /* 4. Số đơn chờ duyệt: hiện ở thẻ thống kê, nút nhanh, menu chức năng */
        function syncPending() {
            var n = 0, a = $('#pending-count'), b = $('#mobile-pending-badge');
            if (a && a.style.display !== 'none') n = parseInt(a.textContent, 10) || 0;
            if (b && b.style.display !== 'none') n = Math.max(n, parseInt(b.textContent, 10) || 0);
            var s = $('#stat-pending'); if (s && s.textContent !== String(n)) s.textContent = n;
            $$('.js-pending').forEach(function (x) { var t = String(n), d = n ? '' : 'none'; if (x.textContent !== t) x.textContent = t; if (x.style.display !== d) x.style.display = d; });
        }

        /* 5. Quản lý bị giới hạn quyền: ẩn cả nhóm khi mọi mục trong nhóm đều bị ẩn */
        function syncGroups() {
            $$('.mod-group, .nav-group, .menu-group').forEach(function (g) {
                var items = $$('.mod-card, .nav-item, .m-menu-item', g);
                var want = items.length && !items.some(function (i) { return i.style.display !== 'none'; }) ? 'none' : '';
                if (g.style.display !== want) g.style.display = want;
            });
        }

        document.addEventListener('DOMContentLoaded', function () {
            try { Theme.init(); } catch (e) { syncTheme(); }   // trang đăng nhập cũng theo giao diện đã lưu
            syncNav(); syncPending();
            if (window.MutationObserver) {
                var pc = $('#pending-count');
                if (pc) new MutationObserver(syncPending).observe(pc, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style'] });
                var raf = 0, mo = new MutationObserver(function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(syncGroups); });
                ['#view-dashboard', '#sidebar', '#modal-mobile-menu'].forEach(function (s) { var el = $(s); if (el) mo.observe(el, { attributes: true, attributeFilter: ['style'], subtree: true }); });
            }
            // Esc: đóng hộp thoại đang mở trên cùng
            document.addEventListener('keydown', function (e) {
                if (e.key !== 'Escape') return;
                var open = $$('.modal-overlay.active'); if (!open.length) return;
                UI.closeModal(open[open.length - 1].id);
            });
            // phím Enter / Space trên logo thanh bên
            var sb = $('.sb-brand'); if (sb) sb.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); UI.navigate('dashboard'); } });
        });
    })();
    
