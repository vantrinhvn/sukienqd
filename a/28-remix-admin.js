    window.QDRemixAdmin = (function () {
        var d = document, st = { remix: false, updatedAt: 0 }, ref = null;
        var NAMES = ['Xuân Về Phơi Phới', 'Xuân Rộn Ràng', 'Lân Về Phố', 'Sum Vầy Ngày Xuân', 'Phố Xuân Rộn Rã', 'Chợ Hoa Ngày Tết', 'Pháo Hoa Giao Thừa', 'Én Liệng Mùa Xuân'];
        function $(id) { return d.getElementById(id); }
        function toast(m, t) { try { Utils.toast(m, t); } catch (e) { alert(m); } }
        function R() { if (!ref && window.firebase && firebase.apps && firebase.apps.length) ref = firebase.firestore().collection('settings').doc('music_config'); return ref; }
        function fmt(ms) { if (!ms) return ''; var x = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(x.getHours()) + ':' + p(x.getMinutes()) + ' ' + p(x.getDate()) + '/' + p(x.getMonth() + 1); }
        function src(i, rmx) { var n = i ? '-' + (i + 1) : ''; return 'media/nhac-tet' + (rmx ? '-remix' : '') + n + '.mp3'; }
        function preview() {
            var t = $('cfg-mx-track'), v = $('cfg-mx-ver'), au = $('cfg-mx-audio'); if (!t || !au) return;
            var u = src(+t.value || 0, v.value === 'remix'); if (au.dataset.u === u) return;
            var was = !au.paused; au.dataset.u = u; au.src = u; if (was) { var p = au.play(); if (p && p.catch) p.catch(function () {}); }
        }
        function paint() {
            var tg = $('cfg-mx-toggle'), s = $('cfg-mx-status'), t = $('cfg-mx-track');
            if (t && !t.options.length) { t.innerHTML = NAMES.map(function (n, i) { return '<option value="' + i + '">' + (i + 1) + '. ' + n + '</option>'; }).join(''); preview(); }
            if (tg) tg.checked = st.remix;
            if (s) s.innerHTML = (st.remix ? '<b style="color:#22c55e">● Đang BẬT</b> — mọi trang đang phát 8 bài bản remix' : '<b>○ Đang TẮT</b> — mọi trang phát 8 bài bình thường') + (st.updatedAt ? ' · ' + fmt(st.updatedAt) : '');
        }
        function toggle(cb) {
            var on = cb.checked;
            if (!R()) { toast('Chưa kết nối máy chủ, thử lại sau.', 'error'); cb.checked = !on; return; }
            R().set({ remix: on, updatedAt: Date.now() }, { merge: true })
                .then(function () { toast(on ? 'Đã BẬT nhạc Remix! 8 bài nhạc nền chuyển sang bản remix.' : 'Đã TẮT nhạc Remix. 8 bài nhạc nền về bản bình thường.', 'success'); })
                .catch(function (e) { toast('Lỗi lưu cài đặt nhạc' + (e && e.code ? ' (' + e.code + ')' : ''), 'error'); cb.checked = !on; });
        }
        (function boot(n) {
            if (!R()) { if (n < 120) setTimeout(function () { boot(n + 1); }, 500); return; }
            R().onSnapshot(function (doc) { var x = doc.exists ? doc.data() : {}; st.remix = x.remix === true; st.updatedAt = x.updatedAt || 0; paint(); },
                function () { var s = $('cfg-mx-status'); if (s) s.textContent = 'Không đọc được cài đặt nhạc (kiểm tra kết nối).'; });
        })(0);
        if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', paint); else paint();
        return { toggle: toggle, preview: preview };
    })();
    
