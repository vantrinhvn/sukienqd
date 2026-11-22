    /* Đăng ký ID Game (trang user)
       - Mở từ: thẻ "Đăng Ký ID Game" trang chủ, menu bên, nút trong tab Giải Đấu
       - Trạng thái theo settings/registration_config do Admin chỉnh (Danh sách Đăng ký > Cấu hình Đóng/Mở): đang mở / hạn chót / đã đóng / hết hạn
       - Đã gửi đơn (collection "users", submitter = tài khoản) -> hiện đơn đã gửi thay cho biểu mẫu; Admin "Cho phép nộp lại" -> tự hiện lại biểu mẫu */
    (function () {
        'use strict';
        if (window.RegID) return;
        var R = window.RegID = { cfg: undefined, mine: undefined, user: '', unsub: null };
        var $ = function (id) { return document.getElementById(id); };
        function DB() { try { return typeof db !== 'undefined' ? db : firebase.firestore(); } catch (e) { return null; } }
        function me() { return (window.State && window.State.currentUser) || ''; }
        function lockInfo() {
            var c = R.cfg;
            if (c === undefined) return { s: 'load' };
            if (!c) return { s: 'open' };
            if (c.isEnabled === false) return { s: 'closed' };
            if (c.endDate && c.endTime) {
                var dl = new Date(c.endDate + 'T' + c.endTime).getTime();
                if (!isNaN(dl)) return { s: Date.now() >= dl ? 'expired' : 'open', dl: dl };
            }
            return { s: 'open' };
        }
        function left(ms) {
            var m = Math.max(1, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
            return d ? d + ' ngày ' + h + ' giờ' : h ? h + ' giờ ' + mi + ' phút' : mi + ' phút';
        }
        function fmtDL(dl) { var x = new Date(dl); return x.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ngày ' + x.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
        function inTour() { var l = (window.State && window.State.tournamentData) || []; for (var i = 0; i < l.length; i++) if (l[i].username === R.user) return true; return false; }

        R.paint = function () {
            var L = lockInfo(), m = R.mine, done = !!m, locked = L.s === 'closed' || L.s === 'expired';
            // thẻ trang chủ
            var tab = $('reg-tab');
            if (tab) {
                tab.setAttribute('data-state', done ? 'done' : locked ? 'locked' : 'open');
                $('reg-tab-sub').textContent = done ? 'Đã đăng ký ✓' : L.s === 'load' ? 'Đang tải...' : L.s === 'closed' ? 'Đã đóng' : L.s === 'expired' ? 'Hết hạn' : L.dl ? 'Còn ' + left(L.dl - Date.now()) : 'Đang mở';
                $('reg-tab-go').textContent = done ? 'Xem đơn đã gửi ›' : locked ? 'Đăng ký đang tạm đóng' : 'Chạm để khai báo ID ›';
                $('reg-tab-id').textContent = done ? 'ID ' + (m.gameId || '') : 'ID ••••••';
            }
            var bt = $('btn-reg-open-txt'); if (bt) bt.textContent = done ? 'ID Game Của Tôi' : 'Đăng Ký ID Game';
            // hộp đăng ký
            var st = $('reg-status'); if (!st) return;
            $('reg-done').hidden = !done; $('reg-form').hidden = done;
            $('reg-title').textContent = done ? 'ID Game Của Bạn' : 'Đăng Ký ID Game';
            $('reg-sub').textContent = done ? 'Ban Quản Trị đã nhận đơn khai báo của bạn.' : 'Mỗi tài khoản chỉ được phép đăng ký 1 lần duy nhất.';
            if (done) {
                st.hidden = true;
                $('reg-done-name').textContent = m.name || '---';
                $('reg-done-id').textContent = m.gameId || '---';
                $('reg-done-time').textContent = m.timestamp ? new Date(m.timestamp).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '---';
                var t = inTour(), tt = $('reg-done-tour');
                tt.textContent = t ? 'Đã vào danh sách thi đấu' : 'Chờ BQT xếp vào giải'; tt.className = t ? 'ok' : '';
                return;
            }
            st.hidden = false; st.setAttribute('data-s', L.s);
            st.innerHTML = L.s === 'load' ? '<i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra trạng thái...'
                : L.s === 'open' ? '<i class="fa-solid fa-door-open"></i> <b>Đang mở đăng ký</b>' + (L.dl ? ' · hạn chót ' + fmtDL(L.dl) + ' (còn ' + left(L.dl - Date.now()) + ')' : '')
                : L.s === 'closed' ? '<i class="fa-solid fa-lock"></i> Ban Quản Trị đã <b>đóng</b> đăng ký. Vui lòng quay lại sau.'
                : '<i class="fa-solid fa-hourglass-end"></i> Đã <b>hết hạn</b> đăng ký (' + fmtDL(L.dl) + ').';
            ['reg-name', 'reg-id'].forEach(function (id) { var e = $(id); if (e) e.disabled = locked; });
        };
        function watch() {
            var d = DB(), u = me(); if (!d) return;
            if (u === R.user && (R.unsub || !u)) return;
            if (R.unsub) { try { R.unsub(); } catch (e) {} R.unsub = null; }
            R.user = u; R.mine = undefined;
            if (!u) return R.paint();
            R.unsub = d.collection('users').where('submitter', '==', u).onSnapshot(function (s) {
                R.mine = s.empty ? null : s.docs[0].data(); R.paint();
            }, function () { R.mine = null; R.paint(); });
        }
        R.open = function () {
            watch(); R.paint();
            if (window.UI && window.UI.openModal) window.UI.openModal('modal-registration');
            if (!R.mine && lockInfo().s === 'open' && window.innerWidth > 640) setTimeout(function () { var e = $('reg-name'); if (e && !e.disabled) e.focus(); }, 350);
        };
        function start() {
            var d = DB(); if (!d) return R.paint();
            d.collection('settings').doc('registration_config').onSnapshot(function (doc) { R.cfg = doc.exists ? doc.data() : null; R.paint(); }, function () { R.cfg = null; R.paint(); });
            var t = setInterval(function () { if (me()) { watch(); clearInterval(t); } }, 1000);   // chờ đăng nhập xong
            setInterval(function () { watch(); if (!document.hidden) R.paint(); }, 30000);           // đổi tài khoản / đếm ngược hạn chót
            R.paint();
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    })();
    
