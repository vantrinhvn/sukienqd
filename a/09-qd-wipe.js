    /* ===== XÓA TẤT CẢ DỮ LIỆU (Admin > Cài đặt Hệ thống + thẻ ở Bảng điều khiển) =====
       - Chỉ tài khoản vai trò "admin" thấy và dùng được (Quản lý không thấy; máy chủ cũng chặn).
       - Máy chủ VPS làm việc xóa (lệnh admin "wipe"): xóa MỌI bộ sưu tập — thành viên, lịch sử, tin nhắn, video, giải đấu,
         quà, cuộc gọi... (kể cả bộ sưu tập thêm sau này) — CHỈ GIỮ tài khoản Quản trị (+ phiên đăng nhập / thiết bị của họ).
       - Tùy chọn: giữ cả tài khoản Quản lý (mặc định: không); giữ cấu hình hệ thống — giải thưởng, lịch mở, bảo trì... (mặc định: giữ).
       - 3 lần nhắc: (1) đọc cảnh báo + tùy chọn  (2) máy chủ đếm chính xác sẽ xóa gì, giữ ai  (3) gõ "XOA TAT CA" + chờ 5 giây.
       - Máy chủ luôn sao lưu toàn bộ trước khi xóa -> khôi phục được ở Máy chủ VPS > Sao lưu. */
    (function () {
        'use strict';
        var $ = function (id) { return document.getElementById(id); };
        var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var fmt = function (n) { return Number(n || 0).toLocaleString('vi-VN'); };
        var S = function () { try { return State; } catch (e) { return window.State || {}; } };
        var toast = function (m, t) { try { Utils.toast(m, t || 'success'); } catch (e) {} };
        var PHRASE = 'XOA TAT CA';
        var NAMES = {
            accounts: 'Tài khoản thành viên', pending_users: 'Đơn đăng ký chờ duyệt', users: 'Đơn đăng ký', acc_sessions: 'Phiên đăng nhập', acc_devices: 'Thiết bị đã gắn',
            point_history: 'Lịch sử điểm', spin_history: 'Lịch sử vòng quay', tranhthuong_history: 'Lịch sử tranh thưởng', lixi_history: 'Lịch sử rút lì xì', lixi_daily: 'Lì xì hằng ngày',
            rps_history: 'Lịch sử kéo búa bao', rps_rooms: 'Phòng kéo búa bao', con_history: 'Lịch sử ném còn', con_stats: 'Bảng xếp hạng ném còn', attendance: 'Điểm danh',
            lucky_numbers: 'Số may mắn', lucky_number_history: 'Lịch sử quay số', lucky_rewards: 'Quà quay số', private_chat: 'Tin nhắn trò chuyện', media: 'Video tin nhắn',
            calls: 'Cuộc gọi', gcalls: 'Cuộc gọi nhóm', gcall_sig: 'Tín hiệu gọi nhóm', bot_reports: 'Bot báo cáo', news: 'Bản tin', tournament: 'Giải đấu', tournament_rewards: 'Thưởng giải đấu',
            wheel_stock: 'Kho giải vòng quay', tranhthuong_stock: 'Kho giải tranh thưởng', point_shop_stock: 'Kho đổi quà', point_shop_daily: 'Đổi quà hằng ngày', shop_orders: 'Đơn đổi quà',
            gifts: 'Quà tặng', gift_claims: 'Nhận quà', invite_history: 'Lịch sử mời bạn', transfer_history: 'Lịch sử chuyển điểm', point_cashout: 'Rút điểm', point_cashout_daily: 'Rút điểm hằng ngày',
            wheel_questions: 'Câu hỏi vòng quay', wheel_question_keys: 'Đáp án vòng quay', ai_unanswered: 'Câu hỏi Quân Sư chưa trả lời', video_share_log: 'Video chia sẻ',
            security_flags: 'Cảnh báo gian lận', push_broadcast: 'Thông báo đã gửi', admin_logs: 'Nhật ký quản trị', settings: 'Cấu hình hệ thống', regid_auto: 'Cấu hình tự kiểm tra quân đoàn'
        };
        var ROLE = { owner: 'Chủ hệ thống', admin: 'Quản trị', manager: 'Quản lý' };
        var W = window.Wipe = { step: 0, keepManagers: false, keepSettings: true, scan: null, busy: false };

        function isAdmin() { var s = S(); var sh = $('app-shell'); return !!(s && s.currentUser && s.currentUserRole === 'admin' && sh && sh.style.display !== 'none'); }
        setInterval(function () { var a = isAdmin(); ['wipe-entry-settings', 'wipe-entry-dash'].forEach(function (id) { var e = $(id); if (e && e.hidden === a) e.hidden = !a; }); }, 1200);

        function norm(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toUpperCase().replace(/\s+/g, ' ').trim(); }
        function dots(n) { [1, 2, 3].forEach(function (i) { $('wd' + i).classList.toggle('on', i <= n); }); $('wipe-step').textContent = n <= 3 ? 'Nhắc nhở ' + n + '/3' : 'Đang xóa'; }
        function btns(list) {
            $('wipe-btns').innerHTML = list.map(function (b, i) { return '<button type="button" class="btn ' + (b.cls || 'btn-outline') + '" data-i="' + i + '"' + (b.dis ? ' disabled' : '') + (b.id ? ' id="' + b.id + '"' : '') + '>' + b.t + '</button>'; }).join('');
            Array.prototype.forEach.call($('wipe-btns').children, function (el, i) { el.onclick = list[i].fn; });
        }
        function api(args) {
            if (!window.QDdb || !QDdb.admin) return Promise.reject(new Error('Cần máy chủ VPS để xóa dữ liệu'));
            return QDdb.admin('wipe', Object.assign({ keepManagers: W.keepManagers, keepSettings: W.keepSettings }, args || {}));
        }
        function errMsg(e) {
            var m = (e && e.message) || String(e || '');
            return /Lệnh quản trị lạ/.test(m) ? 'Máy chủ đang chạy bản cũ — vào Máy chủ VPS → Cập nhật máy chủ (cần qd-vps-20) rồi thử lại.' : m;
        }
        function keptHtml(list) {
            return (list || []).map(function (k) { return '<span class="wipe-chip"><i class="fa-solid fa-user-shield"></i>@' + esc(k.u) + ' <small>' + esc(ROLE[k.role] || k.role) + '</small></span>'; }).join('');
        }

        W.open = function () {
            if (!isAdmin()) return toast('Chỉ Quản trị viên mới dùng được chức năng này.', 'error');
            W.scan = null; W.busy = false; step1(); UI.openModal('modal-wipe');
        };
        W.close = function () { if (W.busy) return toast('Đang xóa dữ liệu, vui lòng chờ hoàn tất.', 'warning'); clearInterval(W._cd); UI.closeModal('modal-wipe'); };
        $('modal-wipe').addEventListener('click', function (e) { if (e.target === this) W.close(); });

        /* ---------- NHẮC NHỞ 1/3: cảnh báo + tùy chọn ---------- */
        function step1() {
            W.step = 1; dots(1); $('wipe-x').disabled = false;
            $('wipe-body').innerHTML = '<div class="wipe-warn">⚠️ Bạn sắp <b>XÓA VĨNH VIỄN TOÀN BỘ</b> dữ liệu của hệ thống Quân Đoàn: tài khoản thành viên, điểm, lượt, lịch sử, điểm danh, tin nhắn, video, giải đấu, quà, cuộc gọi...'
                + '<br>Chỉ <b style="color:var(--color-success)">giữ lại tài khoản Quản trị</b> để vẫn đăng nhập được. Máy chủ sẽ <b>tự sao lưu</b> toàn bộ trước khi xóa.</div>'
                + '<label class="wipe-opt"><input type="checkbox" id="wipe-keep-mgr"' + (W.keepManagers ? ' checked' : '') + '><span>👥 <b>Giữ cả tài khoản Quản lý</b> <small class="text-muted">(bỏ trống = xóa luôn Quản lý)</small></span></label>'
                + '<label class="wipe-opt"><input type="checkbox" id="wipe-keep-cfg"' + (W.keepSettings ? ' checked' : '') + '><span>⚙️ <b>Giữ cấu hình hệ thống</b> — giải thưởng, lịch mở, sơ đồ giải đấu, poster, bảo trì... <small class="text-muted">(bỏ trống = xóa cả cấu hình, hệ thống về mặc định)</small></span></label>';
            $('wipe-keep-mgr').onchange = function () { W.keepManagers = this.checked; };
            $('wipe-keep-cfg').onchange = function () { W.keepSettings = this.checked; };
            btns([{ t: 'Hủy', fn: W.close }, { t: 'Tôi hiểu, tiếp tục (1/3) <i class="fa-solid fa-arrow-right ml-1"></i>', cls: 'btn-danger', fn: step2 }]);
        }

        /* ---------- NHẮC NHỞ 2/3: máy chủ đếm chính xác ---------- */
        function step2() {
            W.step = 2; dots(2); clearInterval(W._cd);
            $('wipe-body').innerHTML = '<div class="wipe-warn">⚠️ <b>Nhắc nhở lần 2:</b> máy chủ đang đếm dữ liệu sẽ bị xóa...</div><div class="wipe-total"><i class="fa-solid fa-spinner fa-spin"></i></div>';
            btns([{ t: '<i class="fa-solid fa-arrow-left mr-1"></i> Quay lại', fn: step1 }, { t: 'Đang đếm...', cls: 'btn-danger', dis: true }]);
            api({ dry: true }).then(function (r) {
                if (W.step !== 2) return;
                W.scan = r;
                $('wipe-body').innerHTML = '<div class="wipe-warn">⚠️ <b>Nhắc nhở lần 2:</b> những dữ liệu dưới đây sẽ bị <b>xóa vĩnh viễn</b>.</div>'
                    + '<div class="wipe-total">Tổng số bản ghi sẽ xóa<b>' + fmt(r.total) + '</b>' + (r.files ? '<small class="text-muted">+ ' + fmt(r.files) + ' tệp video trên máy chủ</small>' : '') + '</div>'
                    + '<div class="wipe-list">' + (r.cols || []).map(function (c) {
                        return '<div class="wipe-row" style="cursor:default"><i class="fa-solid fa-trash-can" style="width:18px;text-align:center;color:var(--color-danger)"></i><span class="wr-t">' + esc(NAMES[c.col] || c.col) + '<small>' + esc(c.col) + '</small></span><span class="wr-n">' + fmt(c.n) + '</span></div>';
                    }).join('') + '</div>'
                    + '<div class="wipe-keep"><b>🛡️ Giữ lại ' + (r.kept || []).length + ' tài khoản:</b>' + keptHtml(r.kept) + '</div>'
                    + '<p class="text-xs text-muted mb-2">' + (r.keepSettings ? '⚙️ Cấu hình hệ thống được giữ nguyên.' : '⚙️ Cấu hình hệ thống <b style="color:var(--color-danger)">cũng bị xóa</b>.') + ' 💾 Máy chủ sao lưu toàn bộ trước khi xóa — khôi phục được ở Máy chủ VPS → Sao lưu.</p>';
                btns([{ t: '<i class="fa-solid fa-arrow-left mr-1"></i> Quay lại', fn: step1 },
                    { t: r.total ? 'Tôi hiểu, tiếp tục (2/3) <i class="fa-solid fa-arrow-right ml-1"></i>' : 'Không có dữ liệu để xóa', cls: 'btn-danger', dis: !r.total, fn: step3 }]);
            }, function (e) {
                if (W.step !== 2) return;
                $('wipe-body').innerHTML = '<div class="wipe-warn">⛔ ' + esc(errMsg(e)) + '</div>';
                btns([{ t: '<i class="fa-solid fa-arrow-left mr-1"></i> Quay lại', fn: step1 }, { t: 'Thử lại', cls: 'btn-danger', fn: step2 }]);
            });
        }

        /* ---------- NHẮC NHỞ 3/3: gõ cụm xác nhận + chờ 5 giây ---------- */
        function step3() {
            W.step = 3; dots(3); clearInterval(W._cd);
            $('wipe-body').innerHTML = '<div class="wipe-warn">⛔ <b>Nhắc nhở lần cuối (3/3):</b> sau bước này <b>' + fmt(W.scan.total) + ' bản ghi</b> bị xóa ngay. Thành viên đang mở trang sẽ bị đăng xuất.</div>'
                + '<label class="form-label" for="wipe-type">Gõ <b style="color:var(--color-danger)">' + PHRASE + '</b> để xác nhận</label>'
                + '<input id="wipe-type" class="form-control wipe-type mb-4" autocomplete="off" spellcheck="false" placeholder="' + PHRASE + '">';
            var left = 5;
            btns([{ t: '<i class="fa-solid fa-arrow-left mr-1"></i> Quay lại', fn: step2 }, { t: 'Xóa vĩnh viễn (' + left + ')', cls: 'btn-solid-danger', id: 'wipe-go', dis: true, fn: run }]);
            function upd() { var ok = norm($('wipe-type').value) === PHRASE; $('wipe-type').classList.toggle('ok', ok); $('wipe-go').disabled = !(ok && left <= 0); }
            $('wipe-type').oninput = upd;
            $('wipe-type').onkeydown = function (e) { if (e.key === 'Enter' && !$('wipe-go').disabled) run(); };
            W._cd = setInterval(function () {
                left--; $('wipe-go').innerHTML = left > 0 ? 'Xóa vĩnh viễn (' + left + ')' : '<i class="fa-solid fa-trash-can mr-1"></i> Xóa vĩnh viễn ' + fmt(W.scan.total) + ' bản ghi';
                if (left <= 0) { clearInterval(W._cd); upd(); }
            }, 1000);
            setTimeout(function () { try { $('wipe-type').focus(); } catch (e) {} }, 200);
        }

        /* ---------- XÓA (máy chủ làm: sao lưu -> xóa -> đăng xuất thành viên) ---------- */
        function run() {
            var t = $('wipe-type');
            if (W.busy || !t || norm(t.value) !== PHRASE) { if (t) { t.classList.remove('wipe-shake'); void t.offsetWidth; t.classList.add('wipe-shake'); } return; }
            if (!isAdmin()) return toast('Chỉ Quản trị viên mới dùng được chức năng này.', 'error');
            clearInterval(W._cd); W.busy = true; W.step = 4; dots(4); $('wipe-x').disabled = true;
            $('wipe-body').innerHTML = '<div class="wipe-warn" id="wipe-warn4">🗑️ Máy chủ đang <b>sao lưu</b> rồi <b>xóa</b> dữ liệu... <b>Không đóng trang</b> cho tới khi xong.</div><div class="wipe-bar"><i id="wipe-bar" class="run"></i></div>';
            btns([{ t: '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang xóa...', cls: 'btn-solid-danger', dis: true }]);
            api({ confirm: PHRASE }).then(function (r) {
                W.busy = false; $('wipe-x').disabled = false; $('wipe-step').textContent = 'Hoàn tất';
                $('wipe-bar').classList.remove('run'); $('wipe-bar').style.width = '100%';
                $('wipe-body').innerHTML = '<div class="wipe-warn" style="border-color:var(--color-success)">✅ Đã xóa <b style="color:var(--color-success)">' + fmt(r.n) + '</b> bản ghi' + (r.files ? ' và ' + fmt(r.files) + ' tệp video' : '') + '.'
                    + (r.kicked ? ' Đã đăng xuất ' + fmt(r.kicked) + ' kết nối của thành viên.' : '') + '</div>'
                    + '<div class="wipe-keep"><b>🛡️ Còn lại ' + (r.kept || []).length + ' tài khoản:</b>' + keptHtml(r.kept) + '</div>'
                    + '<p class="text-xs text-muted mb-2">💾 Bản sao lưu trước khi xóa: <b>' + esc(r.backup || '') + '</b> — khôi phục ở Máy chủ VPS → Sao lưu nếu cần.</p>';
                btns([{ t: 'Đóng', cls: 'btn-primary', fn: W.close }]);
                toast('Đã xóa tất cả dữ liệu, chỉ giữ tài khoản Quản trị.', 'success');
            }, function (e) {
                W.busy = false; $('wipe-x').disabled = false; $('wipe-step').textContent = 'Không xóa được';
                $('wipe-body').innerHTML = '<div class="wipe-warn">⛔ ' + esc(errMsg(e)) + '</div>';
                btns([{ t: '<i class="fa-solid fa-arrow-left mr-1"></i> Làm lại', fn: step1 }, { t: 'Đóng', fn: W.close }]);
                toast('Không xóa được: ' + errMsg(e), 'error');
            });
        }
    })();
