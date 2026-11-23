    /* ===== Admin > Chia sẻ video > TIN NHẮN VIDEO (settings/video_msg) =====
       Bật / tắt, ai được gửi, Kênh Chung, dung lượng + thời lượng tối đa, số video / ngày, tự xóa sau N ngày, tổng dung lượng trên máy chủ.
       Số liệu (số video, dung lượng, ổ đĩa) lấy từ máy chủ VPS bằng lệnh media.stats; "Xóa tất cả video" = media.clear. */
    window.QDVMsgAdmin = (function () {
        'use strict';
        var d = document, $ = function (id) { return d.getElementById(id); };
        var DEF = { on: true, who: 'all', general: true, maxMB: 30, maxSec: 120, perDay: 20, keepDays: 30, quotaGB: 5 };
        var NUM = { maxMB: [1, 200], maxSec: [5, 600], perDay: [0, 500], keepDays: [0, 3650], quotaGB: [0.1, 2000] };
        var cur = Object.assign({}, DEF), booted = false, timer = 0, timer2 = 0;
        function db() { return firebase.firestore(); }
        function toast(m, t) { try { Utils.toast(m, t || 'success'); } catch (e) {} }
        function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        function size(n) { n = +n || 0; if (n >= 1073741824) return (n / 1073741824).toFixed(n >= 10737418240 ? 0 : 1).replace('.', ',') + ' GB'; var m = n / 1048576; return (m < 10 ? m.toFixed(1).replace('.', ',') : Math.round(m).toLocaleString('vi-VN')) + ' MB'; }
        function fill(s) {
            cur = Object.assign({}, DEF, s || {});
            cur.on = !s || s.on !== false; cur.general = !s || s.general !== false; cur.who = s && s.who === 'staff' ? 'staff' : 'all';
            $('vma-on').checked = cur.on; $('vma-general').checked = cur.general; $('vma-who').value = cur.who;
            Object.keys(NUM).forEach(function (k) { var el = $('vma-' + k); if (el && d.activeElement !== el) el.value = cur[k]; });
            $('vma-card').classList.toggle('off', !cur.on);
        }
        function read() {
            var o = { on: $('vma-on').checked, general: $('vma-general').checked, who: $('vma-who').value === 'staff' ? 'staff' : 'all' }, bad = '';
            Object.keys(NUM).forEach(function (k) {
                var el = $('vma-' + k), v = +String(el.value).replace(',', '.'), r = NUM[k];
                if (!isFinite(v) || String(el.value).trim() === '' || v < r[0] || v > r[1]) { bad = bad || (el.previousElementSibling ? el.previousElementSibling.textContent : k) + ': từ ' + r[0] + ' đến ' + r[1]; return; }
                o[k] = k === 'quotaGB' || k === 'maxMB' ? Math.round(v * 10) / 10 : Math.round(v);
            });
            return { o: o, bad: bad };
        }
        function save(manual) {
            clearTimeout(timer2);
            var r = read();
            if (r.bad) { toast(r.bad, 'error'); return; }
            r.o.updatedAt = Date.now();
            try { r.o.updatedBy = (window.State && State.currentUser) || ''; } catch (e) {}
            db().collection('settings').doc('video_msg').set(r.o, { merge: true })
                .then(function () { if (manual) toast('Đã lưu cài đặt tin nhắn video'); else toast(r.o.on ? 'Đã cập nhật tin nhắn video' : 'Đã tắt tin nhắn video'); setTimeout(stats, 400); })
                .catch(function (e) { toast('Không lưu được: ' + ((e && e.message) || e), 'error'); });
        }
        function stats() {
            var box = $('vma-use'); if (!box || !window.QDdb) return;
            window.QDdb.act('media.stats', {}).then(function (s) {
                var q = (+cur.quotaGB || 5) * 1073741824, pct = Math.min(100, Math.round(s.bytes / q * 100));
                var top = (s.top || []).map(function (x) { return '<b>' + esc(x.u) + '</b> ' + x.n; }).join(' · ');
                box.innerHTML =
                    '<div class="vma-meter"><i style="width: ' + pct + '%"></i></div>' +
                    '<div class="vma-nums"><span>Đang lưu <b>' + (s.count || 0).toLocaleString('vi-VN') + '</b> video · <b>' + size(s.bytes) + '</b> / ' + size(q) + '</span>' +
                    '<span>Hôm nay: <b>' + (s.today || 0) + '</b> video</span>' +
                    (s.disk ? '<span>Ổ đĩa máy chủ còn trống: <b>' + size(s.disk.free) + '</b> / ' + size(s.disk.total) + '</span>' : '') +
                    (s.oldest ? '<span>Video cũ nhất: ' + new Date(s.oldest).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</span>' : '') + '</div>' +
                    (top ? '<div class="vma-top text-muted">Gửi nhiều nhất: ' + top + '</div>' : '');
            }).catch(function (e) {
                var m = (e && e.message) || '';
                box.innerHTML = /Lệnh lạ/.test(m)
                    ? '<span class="vma-warn"><i class="fa-solid fa-triangle-exclamation"></i> Máy chủ đang chạy bản cũ, chưa nhận được video. Vào <b>Máy chủ VPS → Cập nhật máy chủ</b> (cần bản qd-vps-19 trở lên).</span>'
                    : '<span class="text-muted">Chưa lấy được số liệu (' + esc(m || 'mất kết nối') + ').</span>';
            });
        }
        function clear() {
            var go = function () {
                window.QDdb.act('media.clear', { confirm: 'XOA' }).then(function (r) { toast('Đã xóa ' + (r.n || 0) + ' video trên máy chủ'); stats(); })
                    .catch(function (e) { toast('Không xóa được: ' + ((e && e.message) || e), 'error'); });
            };
            var ask = window.qdAsk ? window.qdAsk({ title: 'Xóa tất cả video?', text: 'Mọi video đã gửi trong chat sẽ bị xóa khỏi máy chủ, tin nhắn cũ hiện "Video đã hết hạn". Không hoàn tác được.', ok: 'Xóa hết', cancel: 'Thôi', tone: 'danger' }) : Promise.resolve(confirm('Xóa tất cả video?'));
            ask.then(function (y) { if (y) go(); });
        }
        function boot() {
            if (booted || !$('vma-card') || typeof firebase === 'undefined') return; booted = true;
            fill(null);
            db().collection('settings').doc('video_msg').onSnapshot(function (doc) { fill(doc.exists ? doc.data() : null); }, function () {});
            Object.keys(NUM).forEach(function (k) { $('vma-' + k).addEventListener('change', function () { clearTimeout(timer2); timer2 = setTimeout(function () { save(); }, 700); }); });
            var tick = function () { var c = $('vma-card'); if (c && c.offsetParent && !d.hidden) stats(); };
            setTimeout(tick, 1500); timer = setInterval(tick, 60000);
            try { var nav = UI.navigate; UI.navigate = function (v) { var r = nav.apply(this, arguments); if (v === 'videos') setTimeout(stats, 300); return r; }; } catch (e) {}
        }
        if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
        return { save: save, stats: stats, clear: clear };
    })();
