    /* ===== Admin > Cài đặt > QUẢN LÝ POSTER GIỚI THIỆU (settings/intro_video.isEnabled) =====
       Bật: trang chủ + màn hình đăng nhập chỉ hiện poster "Hệ thống chính thức mở cửa" (dọc / ngang), ẩn Đăng nhập / Đăng ký. */
    window.QDIntroAdmin = (function () {
        var d = document, st = { isEnabled: false }, ref = null;
        function $(id) { return d.getElementById(id); }
        function toast(m, t) { try { Utils.toast(m, t); } catch (e) { alert(m); } }
        function R() { if (!ref && window.firebase && firebase.apps && firebase.apps.length) ref = firebase.firestore().collection('settings').doc('intro_video'); return ref; }
        function fmt(ms) { if (!ms) return ''; var x = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(x.getHours()) + ':' + p(x.getMinutes()) + ' ' + p(x.getDate()) + '/' + p(x.getMonth() + 1); }
        function paint() {
            var tg = $('cfg-iv-toggle'), s = $('cfg-iv-status');
            if (tg) tg.checked = st.isEnabled;
            if (s) s.innerHTML = (st.isEnabled ? '<b style="color:#22c55e">● Đang BẬT</b> — trang chủ và màn hình đăng nhập đang hiện poster'
                : '<b>○ Đang TẮT</b> — trang chủ và màn hình đăng nhập hiện bình thường') + (st.updatedAt ? ' · ' + fmt(st.updatedAt) : '');
        }
        function toggle(cb) {
            var on = cb.checked;
            if (!R()) { toast('Chưa kết nối máy chủ, thử lại sau.', 'error'); cb.checked = !on; return; }
            R().set({ isEnabled: on, updatedAt: Date.now() }, { merge: true })
                .then(function () { toast(on ? 'Đã BẬT poster giới thiệu! Trang chủ chỉ hiện poster, ẩn Đăng nhập / Đăng ký.' : 'Đã TẮT poster giới thiệu. Trang chủ hiện lại Đăng nhập / Đăng ký.', 'success'); })
                .catch(function (e) { toast('Lỗi lưu cài đặt poster' + (e && e.code ? ' (' + e.code + ')' : ''), 'error'); cb.checked = !on; });
        }
        (function boot(n) {
            if (!R()) { if (n < 120) setTimeout(function () { boot(n + 1); }, 500); return; }
            R().onSnapshot(function (doc) {
                var x = doc.exists ? doc.data() : {};
                st.isEnabled = x.isEnabled === true; st.updatedAt = x.updatedAt || 0; paint();
            }, function () { var s = $('cfg-iv-status'); if (s) s.textContent = 'Không đọc được cài đặt poster (kiểm tra kết nối).'; });
        })(0);
        if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', paint); else paint();
        return { toggle: toggle };
    })();
