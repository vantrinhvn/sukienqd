    /* Đăng ký ID Game (trang user)
       - Mở từ: thẻ "Đăng Ký ID Game" trang chủ, menu bên, nút trong tab Giải Đấu
       - Trạng thái theo settings/registration_config do Admin chỉnh (Danh sách Đăng ký > Cấu hình Đóng/Mở): đang mở / hạn chót / đã đóng / hết hạn
       - Đã gửi đơn (collection "users", submitter = tài khoản) -> hiện đơn đã gửi thay cho biểu mẫu; Admin "Cho phép nộp lại" -> tự hiện lại biểu mẫu
       - Xác thực: đơn mới "Chờ duyệt"; Quản lý phê duyệt khi đã thấy thành viên trong Quân Đoàn FF (status approved) / báo chưa vào (not_in_guild) */
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

        function stOf(m) { return !m ? '' : m.status === 'approved' ? 'ok' : m.status === 'not_in_guild' ? 'no' : 'wait'; }
        var ST = { ok: ['fa-circle-check', 'ID đã được xác thực'], wait: ['fa-hourglass-half', 'Đang chờ Ban Quản Trị xác thực'], no: ['fa-user-xmark', 'Chưa thấy bạn trong Quân Đoàn'] };
        R.paint = function () {
            var L = lockInfo(), m = R.mine, done = !!m, locked = L.s === 'closed' || L.s === 'expired', sk = stOf(m);
            // thẻ trang chủ
            var tab = $('reg-tab');
            if (tab) {
                tab.setAttribute('data-state', done ? (sk === 'ok' ? 'done' : 'wait') : locked ? 'locked' : 'open');
                $('reg-tab-sub').textContent = done ? (sk === 'ok' ? 'Đã xác thực ✓' : sk === 'no' ? 'Chưa vào quân đoàn' : 'Chờ xác thực') : L.s === 'load' ? 'Đang tải...' : L.s === 'closed' ? 'Đã đóng' : L.s === 'expired' ? 'Hết hạn' : L.dl ? 'Còn ' + left(L.dl - Date.now()) : 'Đang mở';
                $('reg-tab-go').textContent = done ? (sk === 'no' ? 'Vào quân đoàn rồi chờ duyệt lại ›' : 'Xem đơn đã gửi ›') : locked ? 'Đăng ký đang tạm đóng' : 'Chạm để khai báo ID ›';
                $('reg-tab-id').textContent = done ? 'ID ' + (m.gameId || '') : 'ID ••••••';
            }
            var bt = $('btn-reg-open-txt'); if (bt) bt.textContent = done ? 'ID Game Của Tôi' : 'Đăng Ký ID Game';
            // hộp đăng ký
            var st = $('reg-status'); if (!st) return;
            $('reg-done').hidden = !done; $('reg-form').hidden = done;
            $('reg-title').textContent = done ? 'ID Game Của Bạn' : 'Đăng Ký ID Game';
            $('reg-sub').textContent = !done ? 'Mỗi tài khoản chỉ được phép đăng ký 1 lần duy nhất.' : stOf(m) === 'ok' ? 'Ban Quản Trị đã xác nhận bạn trong Quân Đoàn.'
                : stOf(m) === 'no' ? 'Ban Quản Trị chưa thấy bạn trong Quân Đoàn Free Fire.' : 'Ban Quản Trị đã nhận đơn, đang kiểm tra bạn đã vào Quân Đoàn chưa.';
            if (done) {
                st.hidden = true;
                var k = stOf(m), bd = $('reg-done-badge'), vf = $('reg-done-verify'), nt = $('reg-done-note');
                if (bd) { bd.setAttribute('data-s', k); bd.innerHTML = '<i class="fa-solid ' + ST[k][0] + '"></i> ' + ST[k][1]; }
                if (vf) { vf.className = k === 'ok' ? 'ok' : k === 'no' ? 'no' : 'wait'; vf.textContent = k === 'ok' ? 'Đã xác thực' + (m.approvedAt ? ' · ' + new Date(m.approvedAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '') : k === 'no' ? 'Chưa vào quân đoàn' : 'Chờ duyệt'; }
                if (nt) nt.innerHTML = k === 'no' ? 'Hãy <b>xin vào Quân Đoàn</b> trong Free Fire bằng đúng nhân vật này. Ban Quản Trị sẽ kiểm tra và duyệt lại.'
                    : k === 'wait' ? 'Ban Quản Trị sẽ kiểm tra bạn đã ở trong <b>Quân Đoàn Free Fire</b> chưa rồi mới xác thực ID. Cần sửa thông tin? Nhờ BQT <b>"Cho phép nộp lại"</b>.'
                    : 'Cần sửa thông tin? Liên hệ Ban Quản Trị để được <b>"Cho phép nộp lại"</b>.';
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
                var was = R.mine; R.mine = s.empty ? null : s.docs[0].data(); R.paint();
                if (was && R.mine && was.status !== R.mine.status && window.Utils && Utils.toast) {   // BQT vừa duyệt khi đang mở trang
                    if (R.mine.status === 'approved') Utils.toast('✅ ID game của bạn đã được Ban Quản Trị xác thực!', 'success');
                    else if (R.mine.status === 'not_in_guild') Utils.toast('Ban Quản Trị chưa thấy bạn trong Quân Đoàn — hãy xin vào quân đoàn trong Free Fire.', 'warning');
                }
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
    
