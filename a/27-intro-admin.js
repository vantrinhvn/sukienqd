    window.QDIntroAdmin = (function () {
        var d = document, VIDS = { phonk: 'media/gioi-thieu-phonk.mp4', hungtrang: 'media/gioi-thieu-hung-trang.mp4' };
        var NAMES = { phonk: 'Tết Phonk', hungtrang: 'Trống Hội Xuân' }, st = { isEnabled: false, video: 'phonk' }, ref = null;
        function $(id) { return d.getElementById(id); }
        function toast(m, t) { try { Utils.toast(m, t); } catch (e) { alert(m); } }
        function R() { if (!ref && window.firebase && firebase.apps && firebase.apps.length) ref = firebase.firestore().collection('settings').doc('intro_video'); return ref; }
        function fmt(ms) { if (!ms) return ''; var x = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(x.getHours()) + ':' + p(x.getMinutes()) + ' ' + p(x.getDate()) + '/' + p(x.getMonth() + 1); }
        function preview(key) { var v = $('cfg-iv-preview'); if (v && v.dataset.k !== key) { v.dataset.k = key; v.src = VIDS[key]; v.preload = 'none'; } }
        function paint() {
            var tg = $('cfg-iv-toggle'), sel = $('cfg-iv-video'), s = $('cfg-iv-status');
            if (tg) tg.checked = st.isEnabled; if (sel) sel.value = st.video; preview(st.video);
            if (s) s.innerHTML = (st.isEnabled ? '<b style="color:#22c55e">● Đang BẬT</b> — trang chủ đang phát “' + NAMES[st.video] + '”'
                : '<b>○ Đang TẮT</b> — trang chủ và màn hình đăng nhập hiện bình thường') + (st.updatedAt ? ' · ' + fmt(st.updatedAt) : '');
        }
        function save(patch, ok, revert) {
            if (!R()) { toast('Chưa kết nối máy chủ, thử lại sau.', 'error'); if (revert) revert(); return; }
            patch.updatedAt = Date.now();
            R().set(patch, { merge: true }).then(function () { toast(ok, 'success'); })
                .catch(function (e) { toast('Lỗi lưu cài đặt video' + (e && e.code ? ' (' + e.code + ')' : ''), 'error'); if (revert) revert(); });
        }
        function toggle(cb) {
            var on = cb.checked, v = ($('cfg-iv-video') || {}).value || st.video;
            save({ isEnabled: on, video: v }, on ? 'Đã BẬT video giới thiệu! Trang chủ đang phát video, ẩn Đăng nhập / Đăng ký.'
                : 'Đã TẮT video giới thiệu. Trang chủ hiện lại Đăng nhập / Đăng ký.', function () { cb.checked = !on; });
        }
        function pick(v) {
            if (!VIDS[v]) return; preview(v);
            save({ video: v }, st.isEnabled ? 'Đã đổi video trên trang chủ sang “' + NAMES[v] + '”.' : 'Đã chọn “' + NAMES[v] + '” (phát khi bật).', function () { $('cfg-iv-video').value = st.video; preview(st.video); });
        }
        (function boot(n) {
            if (!R()) { if (n < 120) setTimeout(function () { boot(n + 1); }, 500); return; }
            R().onSnapshot(function (doc) {
                var x = doc.exists ? doc.data() : {};
                st.isEnabled = x.isEnabled === true; st.video = VIDS[x.video] ? x.video : 'phonk'; st.updatedAt = x.updatedAt || 0; paint();
            }, function () { var s = $('cfg-iv-status'); if (s) s.textContent = 'Không đọc được cài đặt video (kiểm tra kết nối).'; });
        })(0);
        if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', paint); else paint();
        return { toggle: toggle, pick: pick };
    })();
    
