    (function () {
        'use strict';
        if (typeof db === 'undefined') return;
        var d = document, $ = function (id) { return d.getElementById(id); };
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var toast = function (m, t) { if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast(m, t || 'success'); };
        var fold = function (v) { return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase(); };
        var fmt = function (n) { return Number(n || 0).toLocaleString('vi-VN'); };
        var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
        var dKey = function (t) { var x = new Date(t); return x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate()); };
        var dLbl = function (k) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k); return m ? m[3] + '/' + m[2] : k; };
        var fDT = function (t) { if (!t) return ''; var x = new Date(t); return p2(x.getHours()) + ':' + p2(x.getMinutes()) + ' ' + p2(x.getDate()) + '/' + p2(x.getMonth() + 1) + '/' + x.getFullYear(); };
        var fD = function (t) { var x = new Date(t); return p2(x.getDate()) + '/' + p2(x.getMonth() + 1) + '/' + x.getFullYear(); };
        var isWish = function (t) { var n = fold(t); return !t || /chuc|may man lan sau|ti nua|them ti/.test(n); };
        var S = function () { try { return typeof State !== 'undefined' ? State : (window.State || {}); } catch (e) { return {}; } };   // State là const toàn cục của trang Admin

        /* ---------- Đọc bộ sưu tập (mới nhất trước), lỗi orderBy thì đọc thường rồi tự sắp xếp ---------- */
        function grab(col, tsf, lim, where) {
            var base = db.collection(col); if (where) base = base.where(where[0], where[1], where[2]);
            var fin = function (snap) { var a = []; snap.forEach(function (x) { var v = x.data(); v.__id = x.id; a.push(v); }); a.sort(function (x, y) { return (Number(y[tsf]) || 0) - (Number(x[tsf]) || 0); }); return a; };
            var q = where ? base : base.orderBy(tsf, 'desc').limit(lim || 5000);
            return q.get().then(fin, function () { return base.get().then(fin); });
        }
        var RES = { hit: 'Lọt vòng', rim: 'Chạm vành', miss: 'Trượt', free: 'Nhận lượt miễn phí' };
        var CHOICE = { rock: 'Búa', paper: 'Bao', scissors: 'Kéo', bua: 'Búa', bao: 'Bao', keo: 'Kéo' };
        var TYPE = { points: 'Điểm lì xì', tickets: 'Lượt rút lì xì', spins: 'Lượt vòng quay', conThrows: 'Lượt ném còn' };
        var giveTxt = function (g) { return Object.keys(g || {}).filter(function (k) { return Number(g[k]) > 0; }).map(function (k) { return '+' + g[k] + ' ' + (TYPE[k] || k).toLowerCase(); }).join(', '); };
        var invGive = function (x, side) { return window.InviteAdmin && InviteAdmin.histGive ? InviteAdmin.histGive(x, side) : ((x.rewards && x.rewards[side]) || (x.rewardAmount ? { tickets: x.rewardAmount } : {})); };
        var sum = function (rows, f) { return rows.reduce(function (a, x) { return a + (Number(f(x)) || 0); }, 0); };
        var uniq = function (rows, f) { var s = {}; rows.forEach(function (x) { [].concat(f(x) || []).forEach(function (u) { if (u) s[u] = 1; }); }); return Object.keys(s).length; };

        /* ---------- Nguồn báo cáo ---------- */
        var SRC = [
            { id: 'wheel', view: 'wheel', name: 'Vòng Quay', icon: 'fa-dharmachakra', color: '#f59e0b', file: 'Vong_Quay', col: 'spin_history',
              load: function () { return grab('spin_history', 'timestamp'); }, time: function (x) { return x.timestamp; }, who: function (x) { return x.userId; },
              cols: [['Thời gian', function (x) { return fDT(x.timestamp); }], ['Tài khoản', function (x) { return x.userId; }], ['Phần thưởng', function (x) { return x.result; }], ['Lượt còn lại', function (x) { return x.remain != null ? x.remain : ''; }, 'n']],
              kpi: function (r) { var m = r.filter(function (x) { return !isWish(x.result); }); return [['Trúng giải tiền', fmt(m.length), r.length ? (m.length / r.length * 100).toFixed(1) + '% số lượt quay' : '']]; },
              brk: ['Theo phần thưởng', function (x) { return x.result || '—'; }], rank: ['Quay nhiều nhất', 'lượt'] },
            { id: 'tranh', view: 'tranhthuong', name: 'Rút Lì Xì', icon: 'fa-envelope', color: '#ef4444', file: 'Rut_Li_Xi', col: 'tranhthuong_history',
              load: function () { return grab('tranhthuong_history', 'timestamp'); }, time: function (x) { return x.timestamp; }, who: function (x) { return x.userId; },
              cols: [['Thời gian', function (x) { return fDT(x.timestamp); }], ['Tài khoản', function (x) { return x.userId; }], ['Phần thưởng', function (x) { return x.result; }], ['Lượt còn lại', function (x) { return x.remain != null ? x.remain : ''; }, 'n']],
              kpi: function (r) { var m = r.filter(function (x) { return !isWish(x.result); }); return [['Trúng tiền mặt', fmt(m.length), r.length ? (m.length / r.length * 100).toFixed(1) + '% số lượt rút' : '']]; },
              brk: ['Theo phần thưởng', function (x) { return x.result || '—'; }], rank: ['Rút nhiều nhất', 'lượt'] },
            { id: 'lixi', view: 'lixi', name: 'Lì Xì Điểm', icon: 'fa-envelope-open-text', color: '#f43f5e', file: 'Li_Xi_Diem', col: 'lixi_history',
              load: function () { return grab('lixi_history', 'timestamp'); }, time: function (x) { return x.timestamp; }, who: function (x) { return x.user; },
              cols: [['Thời gian', function (x) { return fDT(x.timestamp); }], ['Tài khoản', function (x) { return x.user; }], ['Điểm', function (x) { return x.amount || 0; }, 'n'], ['Trạng thái', function (x) { return x.status === 'revoked' ? 'Đã thu hồi' : 'Hợp lệ'; }], ['Điểm bị trừ', function (x) { return x.status === 'revoked' ? (x.deducted != null ? x.deducted : x.amount || 0) : ''; }, 'n']],
              kpi: function (r) { var ok = r.filter(function (x) { return x.status !== 'revoked'; }), p = sum(ok, function (x) { return x.amount; }); return [['Điểm đã phát', fmt(p), 'TB ' + (ok.length ? (p / ok.length).toFixed(1) : 0) + ' điểm/lượt'], ['Đã thu hồi', fmt(r.length - ok.length), 'lượt']]; },
              brk: ['Theo mệnh giá', function (x) { return x.status === 'revoked' ? 'Đã thu hồi' : '+' + (x.amount || 0) + ' điểm'; }], rank: ['Nhận nhiều điểm nhất', 'điểm', function (x) { return x.status === 'revoked' ? 0 : x.amount || 0; }] },
            { id: 'lucky', view: 'luckynumber', name: 'Quay Số May Mắn', icon: 'fa-gem', color: '#ec4899', file: 'Quay_So', col: 'lucky_number_history',
              load: function () { return grab('lucky_number_history', 'timestamp'); }, time: function (x) { return x.timestamp; }, who: function (x) { return x.winners || []; },
              cols: [['Thời gian', function (x) { return fDT(x.timestamp); }], ['Số trúng', function (x) { return x.number != null ? String(x.number).padStart(2, '0') : ''; }, 't'], ['Số người trúng', function (x) { return (x.winners || []).length; }, 'n'], ['Người trúng', function (x) { return (x.winners || []).join(', ') || 'Không có ai'; }]],
              kpi: function (r) { return [['Lượt có người trúng', fmt(r.filter(function (x) { return (x.winners || []).length; }).length), fmt(sum(r, function (x) { return (x.winners || []).length; })) + ' lượt trúng']]; },
              brk: ['Số hay về', function (x) { return x.number != null ? 'Số ' + String(x.number).padStart(2, '0') : '—'; }], rank: ['Trúng nhiều nhất', 'lần'] },
            { id: 'shop', view: 'pointshop', name: 'Cửa Hàng Điểm', icon: 'fa-store', color: '#10b981', file: 'Cua_Hang_Diem', col: 'point_history',
              load: function () { return grab('point_history', 'timestamp', 0, ['action', '==', 'exchange']); }, time: function (x) { return x.timestamp; }, who: function (x) { return x.user; },
              cols: [['Thời gian', function (x) { return fDT(x.timestamp); }], ['Thành viên', function (x) { return x.user; }], ['Vật phẩm', function (x) { return x.detail || x.itemName || ''; }], ['Điểm', function (x) { return x.pointsChanged || 0; }, 'n']],
              kpi: function (r) { return [['Điểm đã dùng', fmt(Math.abs(sum(r, function (x) { return x.pointsChanged; }))), 'qua ' + fmt(r.length) + ' giao dịch']]; },
              brk: ['Theo vật phẩm', function (x) { return x.detail || x.itemName || '—'; }], rank: ['Đổi nhiều điểm nhất', 'điểm', function (x) { return Math.abs(Number(x.pointsChanged) || 0); }] },
            { id: 'attendance', view: 'attendance', name: 'Điểm Danh', icon: 'fa-calendar-check', color: '#22c55e', file: 'Diem_Danh', col: 'attendance',
              load: function () { return grab('attendance', 'timestamp'); }, time: function (x) { return x.timestamp; }, who: function (x) { return x.userName; },
              cols: [['Thời gian', function (x) { return x.timestamp ? fDT(x.timestamp) : (x.time || '') + ' ' + (x.date || ''); }], ['Thành viên', function (x) { return x.userName; }], ['Mã tài khoản', function (x) { return x.userId || ''; }, 't']],
              kpi: function (r) { var days = uniq(r, function (x) { return dKey(x.timestamp); }); return [['Số ngày có điểm danh', fmt(days), 'TB ' + (days ? (r.length / days).toFixed(1) : 0) + ' người/ngày']]; },
              rank: ['Chuyên cần nhất', 'buổi'] },
            { id: 'registration', view: 'registration', name: 'Đăng Ký ID Game', icon: 'fa-id-card', color: '#eab308', file: 'Dang_Ky_ID', col: 'users',
              load: function () { return grab('users', 'timestamp'); }, time: function (x) { return x.timestamp; }, who: function (x) { return x.submitter || x.name; },
              cols: [['Thời gian gửi', function (x) { return fDT(x.timestamp); }], ['Tên nhân vật', function (x) { return x.name; }], ['ID Game', function (x) { return x.gameId; }, 't'], ['Tài khoản gửi', function (x) { return x.submitter || ''; }],
                  ['Xác thực', function (x) { return x.status === 'approved' ? 'Đã xác thực (đã vào quân đoàn)' : x.status === 'not_in_guild' ? 'Chưa vào quân đoàn' : 'Chờ duyệt'; }],
                  ['Người duyệt', function (x) { return x.status === 'approved' ? (x.approvedBy || '') : (x.checkedBy || ''); }]],
              kpi: function (r) { return [['Đơn trong kỳ', fmt(r.length), 'tổng đơn đã lọc'], ['Đã xác thực', fmt(r.filter(function (x) { return x.status === 'approved'; }).length), 'đã vào quân đoàn'], ['Chờ duyệt', fmt(r.filter(function (x) { return x.status !== 'approved' && x.status !== 'not_in_guild'; }).length), 'đơn chưa kiểm tra']]; } },
            { id: 'rps', view: 'rps', name: 'Kéo Búa Bao', icon: 'fa-hand-scissors', color: '#fb7185', file: 'Keo_Bua_Bao', col: 'rps_history',
              load: function () { return grab('rps_history', 'timestamp'); }, time: function (x) { return x.timestamp; }, who: function (x) { return [x.player1, x.player2]; },
              cols: [['Thời gian', function (x) { return fDT(x.timestamp); }], ['Người chơi 1', function (x) { return x.player1; }], ['Người chơi 2', function (x) { return x.player2; }],
                  ['Chiêu cuối', function (x) { return (CHOICE[x.p1Choice] || x.p1Choice || '?') + ' – ' + (CHOICE[x.p2Choice] || x.p2Choice || '?'); }],
                  ['Tỉ số', function (x) { return (x.p1Score != null ? x.p1Score : '?') + ' - ' + (x.p2Score != null ? x.p2Score : '?'); }, 't'],
                  ['Kết quả', function (x) { return x.winner ? x.winner + ' thắng' : 'Hòa'; }]],
              kpi: function (r) { return [['Trận hòa', fmt(r.filter(function (x) { return !x.winner; }).length), 'trận']]; },
              rank: ['Thắng nhiều nhất', 'trận thắng', null, function (x) { return x.winner; }] },
            { id: 'nemcon', view: 'nemcon', name: 'Ném Còn', icon: 'fa-bullseye', color: '#f97316', file: 'Nem_Con', col: 'con_history',
              load: function () { return grab('con_history', 'ts'); }, time: function (x) { return x.ts; }, who: function (x) { return x.user; },
              cols: [['Thời gian', function (x) { return fDT(x.ts); }], ['Thành viên', function (x) { return x.user; }], ['Kết quả', function (x) { return (RES[x.result] || x.result || '') + (x.result === 'free' ? ' (+' + (x.amount || 0) + ' lượt)' : ''); }],
                  ['Chuỗi', function (x) { return x.bonus ? x.streak : ''; }, 'n'], ['Điểm', function (x) { return x.result === 'free' ? '' : (x.points || 0); }, 'n']],
              kpi: function (r) { var th = r.filter(function (x) { return x.result !== 'free'; }), h = th.filter(function (x) { return x.result === 'hit'; }).length; return [['Tỉ lệ lọt vòng', th.length ? (h / th.length * 100).toFixed(1) + '%' : '—', fmt(h) + ' / ' + fmt(th.length) + ' lượt ném'], ['Điểm đã phát', fmt(sum(th, function (x) { return x.points; })), 'điểm lì xì']]; },
              brk: ['Theo kết quả', function (x) { return RES[x.result] || x.result || '—'; }], rank: ['Nhiều điểm nhất', 'điểm', function (x) { return x.points || 0; }] },
            { id: 'invite', view: 'invite', name: 'Mã Mời', icon: 'fa-handshake', color: '#6366f1', file: 'Ma_Moi', col: 'invite_history',
              load: function () { return grab('invite_history', 'timestamp'); }, time: function (x) { return x.timestamp; }, who: function (x) { return [x.invitee, x.inviter]; },
              cols: [['Thời gian', function (x) { return fDT(x.timestamp); }], ['Người nhập mã', function (x) { return x.invitee; }], ['Người mời', function (x) { return x.inviter; }],
                  ['Người nhập nhận', function (x) { return giveTxt(invGive(x, 'invitee')) || '—'; }], ['Người mời nhận', function (x) { return (giveTxt(invGive(x, 'inviter')) || '—') + (x.inviterCapped ? ' (đã đạt giới hạn)' : ''); }]],
              kpi: function (r) { return [['Người mời khác nhau', fmt(uniq(r, function (x) { return x.inviter; })), 'người']]; },
              rank: ['Mời nhiều nhất', 'người', null, function (x) { return x.inviter; }] },
            { id: 'gift', view: 'transfer', name: 'Tặng Quà', icon: 'fa-gift', color: '#0ea5e9', file: 'Tang_Qua', col: 'transfer_history',
              load: function () { return grab('transfer_history', 'timestamp'); }, time: function (x) { return x.timestamp; }, who: function (x) { return [x.from, x.to]; },
              cols: [['Thời gian', function (x) { return fDT(x.timestamp); }], ['Người tặng', function (x) { return x.from; }], ['Người nhận', function (x) { return x.to; }], ['Loại', function (x) { return TYPE[x.type] || x.type; }], ['Số lượng', function (x) { return x.amount || 0; }, 'n']],
              kpi: function (r) { var by = {}; r.forEach(function (x) { by[x.type] = (by[x.type] || 0) + (Number(x.amount) || 0); }); return [['Đã chuyển', fmt(sum(r, function (x) { return x.amount; })), Object.keys(by).map(function (k) { return fmt(by[k]) + ' ' + (TYPE[k] || k).replace(/^Lượt /, '').toLowerCase(); }).join(' · ') || 'lượt']]; },
              brk: ['Theo loại', function (x) { return TYPE[x.type] || x.type || '—'; }, function (x) { return x.amount || 0; }], rank: ['Tặng nhiều nhất', 'lượt', function (x) { return x.amount || 0; }, function (x) { return x.from; }] },
            { id: 'ledger', view: 'accounts', name: 'Biến Động Tài Khoản', icon: 'fa-clock-rotate-left', color: '#0891b2', file: 'Bien_Dong', col: 'nhiều nguồn', only: true,
              load: function () { return Promise.resolve((S().currentUserHistoryCache || []).slice()); }, time: function (x) { return x.time; }, who: function () { return S().historyTargetUser; },
              cols: [['Thời gian', function (x) { return fDT(x.time); }], ['Loại tài sản', function (x) { return TYPE[x.type] || 'Điểm lì xì'; }], ['Biến động', function (x) { return x.amount > 0 ? '+' + x.amount : x.amount; }, 't'], ['Số dư sau', function (x) { return x.balanceAfter; }, 'n'], ['Nguồn / Lý do', function (x) { return x.reason; }]],
              kpi: function (r) { var plus = r.filter(function (x) { return x.amount > 0; }).length; return [['Cộng / Trừ', fmt(plus) + ' / ' + fmt(r.length - plus), 'lần biến động']]; },
              brk: ['Theo loại tài sản', function (x) { return TYPE[x.type] || 'Điểm lì xì'; }] }
        ];
        var SMAP = {}; SRC.forEach(function (s) { SMAP[s.id] = s; });
        var VIEW_SRC = { wheel: 'wheel', tranhthuong: 'tranh', lixi: 'lixi', luckynumber: 'lucky', pointshop: 'shop', attendance: 'attendance', registration: 'registration', rps: 'rps', nemcon: 'nemcon', invite: 'invite', transfer: 'gift', accounts: 'ledger', security: 'security' };

        var R = window.QDReport = { src: null, raw: [], rows: [], range: '30', from: '', to: '', q: '', fmt: 'xls', inc: { sum: true, day: true, rank: true }, side: 'rank', loading: 0 };

        function allowed(s) {
            if (s.only && s.id === 'ledger' && !(S().currentUserHistoryCache || []).length) return false;
            var st = S(); if (st.currentUserRole !== 'manager') return true;
            return (st.currentUserPerms || []).indexOf(s.view) >= 0;
        }
        function build() {
            if ($('modal-report')) return;
            var m = d.createElement('div'); m.className = 'modal-overlay'; m.id = 'modal-report';
            m.innerHTML = '<div class="modal-content rp" role="dialog" aria-labelledby="rp-title">'
                + '<div class="rp-head"><span class="rp-ico" id="rp-ico"><i class="fa-solid fa-file-export"></i></span><div class="rp-ttl"><h2 id="rp-title">Xuất báo cáo</h2><p id="rp-sub">Chọn nguồn dữ liệu</p></div>'
                + '<button class="modal-close-btn rp-x" onclick="UI.closeModal(\'modal-report\')" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button></div>'
                + '<div class="rp-body">'
                + '<div class="rp-src" id="rp-src" role="tablist" aria-label="Nguồn báo cáo"></div>'
                + '<div class="rp-filter"><div class="rp-seg" id="rp-range">'
                + [['today', 'Hôm nay'], ['7', '7 ngày'], ['30', '30 ngày'], ['month', 'Tháng này'], ['all', 'Tất cả'], ['custom', 'Tùy chọn']].map(function (x) { return '<button type="button" data-r="' + x[0] + '">' + x[1] + '</button>'; }).join('')
                + '</div><div class="rp-dates" id="rp-dates"><input type="date" class="form-control" id="rp-from" aria-label="Từ ngày"><span class="text-muted">→</span><input type="date" class="form-control" id="rp-to" aria-label="Đến ngày"></div>'
                + '<div class="rp-q"><i class="fa-solid fa-magnifying-glass"></i><input type="search" class="form-control" id="rp-q" placeholder="Lọc theo tên thành viên..."></div></div>'
                + '<div id="rp-view"></div>'
                + '<div class="rp-sec-t">Định dạng tải về</div>'
                + '<div class="rp-fmt" id="rp-fmt">'
                + '<label style="--ft:#16a34a"><input type="radio" name="rp-fmt" value="xls" checked><span class="fi"><i class="fa-solid fa-file-excel"></i></span><span><b>Excel (.xlsx)</b><small>2 trang Tổng quan + Chi tiết, bảng màu, có nút lọc — mở bằng Excel / Google Sheets</small></span></label>'
                + '<label style="--ft:#0ea5e9"><input type="radio" name="rp-fmt" value="csv"><span class="fi"><i class="fa-solid fa-file-csv"></i></span><span><b>CSV</b><small>Dữ liệu thô từng dòng, nhập vào phần mềm khác</small></span></label>'
                + '<label style="--ft:#e11d48"><input type="radio" name="rp-fmt" value="pdf"><span class="fi"><i class="fa-solid fa-print"></i></span><span><b>In / Lưu PDF</b><small>Trang báo cáo A4 có biểu đồ — chọn "Lưu dạng PDF" khi in</small></span></label>'
                + '</div>'
                + '<div class="rp-opts" id="rp-opts"><label><input type="checkbox" data-o="sum" checked> Trang tóm tắt</label><label><input type="checkbox" data-o="day" checked> Thống kê theo ngày</label><label><input type="checkbox" data-o="rank" checked> Xếp hạng &amp; phân bổ</label></div>'
                + '</div>'
                + '<div class="rp-foot"><div class="rp-sum" id="rp-sum"></div><button type="button" class="btn btn-outline" onclick="UI.closeModal(\'modal-report\')">Đóng</button>'
                + '<button type="button" class="btn rp-go" id="rp-go"><i class="fa-solid fa-download"></i> <span>Tải báo cáo</span></button></div>'
                + '</div>';
            d.body.appendChild(m);
            m.addEventListener('click', function (e) { if (e.target === m) UI.closeModal('modal-report'); });
            $('rp-src').addEventListener('click', function (e) { var b = e.target.closest('.rp-chip'); if (b) R.pick(b.dataset.s); });
            $('rp-range').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; R.range = b.dataset.r; if (R.range === 'custom' && !$('rp-from').value) { $('rp-from').value = dKey(Date.now() - 6 * 864e5); $('rp-to').value = dKey(Date.now()); } apply(); });
            ['rp-from', 'rp-to'].forEach(function (id) { $(id).addEventListener('change', apply); });
            var qt = 0; $('rp-q').addEventListener('input', function () { clearTimeout(qt); qt = setTimeout(apply, 150); });
            $('rp-fmt').addEventListener('change', function (e) { if (e.target.name === 'rp-fmt') { R.fmt = e.target.value; foot(); } });
            $('rp-opts').addEventListener('change', function (e) { var o = e.target.dataset.o; if (o) R.inc[o] = e.target.checked; });
            $('rp-view').addEventListener('click', function (e) { var b = e.target.closest('[data-side]'); if (b) { R.side = b.dataset.side; render(); } });
            $('rp-go').addEventListener('click', R.download);
        }
        function chips() {
            $('rp-src').innerHTML = SRC.filter(allowed).map(function (s) {
                return '<button type="button" class="rp-chip' + (R.src === s ? ' on' : '') + '" data-s="' + s.id + '" role="tab" aria-selected="' + (R.src === s) + '" style="--tone:' + s.color + '"><i class="fa-solid ' + s.icon + '"></i>' + esc(s.id === 'ledger' && S().historyTargetUser ? 'Biến động: ' + S().historyTargetUser : s.name) + '</button>';
            }).join('');
            var on = $('rp-src').querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
        }
        function bounds() {
            var now = new Date(), t0 = new Date(now); t0.setHours(0, 0, 0, 0);
            if (R.range === 'today') return [t0.getTime(), Infinity];
            if (R.range === '7') return [t0.getTime() - 6 * 864e5, Infinity];
            if (R.range === '30') return [t0.getTime() - 29 * 864e5, Infinity];
            if (R.range === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), Infinity];
            if (R.range === 'custom') {
                var a = $('rp-from').value, b = $('rp-to').value, pa = a ? a.split('-') : null, pb = b ? b.split('-') : null;
                return [pa ? new Date(+pa[0], +pa[1] - 1, +pa[2]).getTime() : 0, pb ? new Date(+pb[0], +pb[1] - 1, +pb[2], 23, 59, 59, 999).getTime() : Infinity];
            }
            return [0, Infinity];
        }
        function rangeText() {
            var b = bounds(), L = { today: 'Hôm nay', '7': '7 ngày gần nhất', '30': '30 ngày gần nhất', month: 'Tháng này', all: 'Toàn bộ dữ liệu' };
            if (R.range === 'custom') return (b[0] ? fD(b[0]) : '…') + ' – ' + (b[1] !== Infinity ? fD(b[1]) : 'nay');
            return L[R.range] + (R.range !== 'all' ? ' (' + fD(b[0]) + ' – ' + fD(Date.now()) + ')' : '');
        }
        function apply() {
            var s = R.src; if (!s) return;
            d.querySelectorAll('#rp-range button').forEach(function (b) { b.classList.toggle('on', b.dataset.r === R.range); });
            $('rp-dates').classList.toggle('show', R.range === 'custom');
            var b = bounds(), q = fold(($('rp-q').value || '').trim());
            R.q = q;
            R.rows = R.raw.filter(function (x) {
                var t = Number(s.time(x)) || 0; if (t < b[0] || t > b[1]) return false;
                if (!q) return true;
                return [].concat(s.who(x) || []).some(function (u) { return fold(u).indexOf(q) >= 0; }) || (s.id === 'registration' && fold(x.name).indexOf(q) >= 0);
            });
            render();
        }
        // Thống kê dùng chung cho xem trước + Excel + PDF
        function stats(s, rows) {
            var days = {}, rk = {}, bk = {};
            rows.forEach(function (x) {
                var t = Number(s.time(x)) || 0; if (t) { var k = dKey(t); days[k] = (days[k] || 0) + 1; }
                if (s.rank) { var key = s.rank[3] ? s.rank[3](x) : s.who(x); [].concat(key || []).forEach(function (u) { if (!u) return; rk[u] = (rk[u] || 0) + (s.rank[2] ? Number(s.rank[2](x)) || 0 : 1); }); }
                if (s.brk) { var bkey = s.brk[1](x); bk[bkey] = (bk[bkey] || 0) + (s.brk[2] ? Number(s.brk[2](x)) || 0 : 1); }
            });
            var rank = Object.keys(rk).map(function (u) { return [u, rk[u]]; }).filter(function (x) { return x[1] > 0; }).sort(function (a, b) { return b[1] - a[1]; });
            var brk = Object.keys(bk).map(function (k) { return [k, bk[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
            var dk = Object.keys(days).sort(), people = uniq(rows, s.who);
            var best = dk.slice().sort(function (a, b) { return days[b] - days[a]; })[0];
            var kpis = [['Số bản ghi', fmt(rows.length), rangeText()], ['Thành viên', fmt(people), 'người có trong báo cáo']].concat(s.kpi ? s.kpi(rows) : []);
            if (kpis.length < 4 && best) kpis.push(['Ngày cao điểm', dLbl(best), fmt(days[best]) + ' bản ghi']);
            return { days: days, dk: dk, rank: rank, brk: brk, kpis: kpis.slice(0, 4), people: people };
        }
        function chartDays(st) {   // tối đa 31 cột: lấy theo khoảng đang chọn (đủ ngày trống), quá dài thì gộp các ngày cuối
            var b = bounds(), end = new Date(); end.setHours(0, 0, 0, 0);
            if (b[1] !== Infinity) { end = new Date(b[1]); end.setHours(0, 0, 0, 0); }
            var start = b[0] ? new Date(b[0]) : (st.dk[0] ? new Date(st.dk[0] + 'T00:00:00') : end); start.setHours(0, 0, 0, 0);
            var out = [], cur = new Date(end), n = 0;
            while (cur >= start && n < 31) { var k = dKey(cur.getTime()); out.unshift([k, st.days[k] || 0]); cur.setDate(cur.getDate() - 1); n++; }
            return out;
        }
        function render() {
            var s = R.src, v = $('rp-view'); if (!s || !v) return;
            if (R.loading) { v.innerHTML = '<div class="rp-load"><i class="fa-solid fa-spinner fa-spin"></i> Đang tổng hợp dữ liệu ' + esc(s.name) + '...</div>'; foot(); return; }
            var rows = R.rows, st = stats(s, rows);
            var h = '<div class="rp-kpis">' + st.kpis.map(function (k) { return '<div class="rp-kpi"><span>' + esc(k[0]) + '</span><b>' + esc(k[1]) + '</b>' + (k[2] ? '<small title="' + esc(k[2]) + '">' + esc(k[2]) + '</small>' : '') + '</div>'; }).join('') + '</div>';
            var cd = chartDays(st), mx = Math.max.apply(null, cd.map(function (x) { return x[1]; }).concat(1)), every = cd.length > 16 ? Math.ceil(cd.length / 8) : 1;
            var shown = false, lab = function (n) { if (cd.length <= 16) return n; if (n === mx && !shown) { shown = true; return n; } return ''; };
            var chart = rows.length ? '<div class="rp-chart">' + cd.map(function (x, i) { return '<div class="rp-bar" title="' + dLbl(x[0]) + ': ' + x[1] + '"><i style="height:' + Math.max(2, Math.round(x[1] / mx * 100)) + '%" data-n="' + lab(x[1]) + '"></i><em>' + ((cd.length - 1 - i) % every === 0 ? dLbl(x[0]) : '&nbsp;') + '</em></div>'; }).join('') + '</div>' : '<div class="rp-empty">Không có dữ liệu trong khoảng này.</div>';
            var hasR = s.rank && st.rank.length, hasB = s.brk && st.brk.length, side = R.side === 'brk' && hasB ? 'brk' : hasR ? 'rank' : hasB ? 'brk' : '';
            var list = side === 'brk' ? st.brk : st.rank, lmx = list.length ? list[0][1] : 1;
            var unit = side === 'brk' ? (s.brk[2] ? 'lượt' : 'lần') : (s.rank ? s.rank[1] : '');
            var sideBox = side ? '<div class="rp-box"><h4><i class="fa-solid ' + (side === 'brk' ? 'fa-chart-pie' : 'fa-ranking-star') + '" style="color:var(--rc)"></i> ' + esc(side === 'brk' ? s.brk[0] : s.rank[0])
                + (hasR && hasB ? '<span class="rp-tabs2"><button type="button" data-side="rank" class="' + (side === 'rank' ? 'on' : '') + '">Xếp hạng</button><button type="button" data-side="brk" class="' + (side === 'brk' ? 'on' : '') + '">Phân bổ</button></span>' : '') + '</h4>'
                + '<ol class="rp-rank">' + list.slice(0, 6).map(function (x, i) { return '<li><b>' + (i + 1) + '</b><span class="nm"><span title="' + esc(x[0]) + '">' + esc(x[0]) + '</span><i style="width:' + Math.max(4, Math.round(x[1] / lmx * 100)) + '%"></i></span><span class="v">' + fmt(x[1]) + ' <small class="text-muted" style="font-weight:600">' + esc(unit) + '</small></span></li>'; }).join('') + '</ol>'
                + (list.length > 6 ? '<p class="text-muted text-xs" style="margin:10px 0 0">+ ' + (list.length - 6) + ' mục khác trong file tải về</p>' : '') + '</div>'
                : '<div class="rp-box"><h4><i class="fa-solid fa-circle-info" style="color:var(--rc)"></i> Ghi chú</h4><p class="text-muted text-sm m-0">Báo cáo gồm toàn bộ dòng đã lọc. Dùng ô tìm tên để xuất riêng 1 thành viên.</p></div>';
            h += '<div class="rp-grid"><div class="rp-box"><h4><i class="fa-solid fa-chart-column" style="color:var(--rc)"></i> Theo ngày<small>' + (cd.length ? dLbl(cd[0][0]) + ' – ' + dLbl(cd[cd.length - 1][0]) : '') + '</small></h4>' + chart + '</div>' + sideBox + '</div>';
            var PV = 6;
            h += '<div class="rp-prev"><div class="rp-prev-head"><i class="fa-solid fa-table" style="color:var(--rc)"></i> Xem trước dữ liệu<small>' + (rows.length > PV ? PV + ' / ' + fmt(rows.length) + ' dòng' : fmt(rows.length) + ' dòng') + '</small></div>'
                + '<div class="table-responsive"><table><thead><tr>' + s.cols.map(function (c) { return '<th' + (c[2] === 'n' ? ' class="text-right"' : '') + '>' + esc(c[0]) + '</th>'; }).join('') + '</tr></thead><tbody>'
                + (rows.length ? rows.slice(0, PV).map(function (x) { return '<tr>' + s.cols.map(function (c) { var val = c[1](x); return '<td' + (c[2] === 'n' ? ' class="text-right font-bold"' : '') + ' title="' + esc(val) + '">' + esc(c[2] === 'n' && val !== '' ? fmt(val) : val) + '</td>'; }).join('') + '</tr>'; }).join('')
                    : '<tr><td colspan="' + s.cols.length + '" class="text-center text-muted py-8">Không có dòng nào khớp bộ lọc.</td></tr>')
                + '</tbody></table></div></div>';
            v.innerHTML = h; foot();
        }
        function foot() {
            var s = R.src, n = R.rows.length, go = $('rp-go'); if (!s || !go) return;
            $('rp-sum').innerHTML = R.loading ? 'Đang tải...' : '<b>' + fmt(n) + '</b> dòng · <b>' + fmt(uniq(R.rows, s.who)) + '</b> thành viên · ' + esc(rangeText()) + (R.q ? ' · lọc “' + esc($('rp-q').value.trim()) + '”' : '');
            go.disabled = !!R.loading || !n;
            go.querySelector('span').textContent = R.fmt === 'pdf' ? 'In / Lưu PDF' : R.fmt === 'csv' ? 'Tải CSV' : 'Tải Excel';
            go.querySelector('i').className = 'fa-solid ' + (R.fmt === 'pdf' ? 'fa-print' : 'fa-download');
            $('rp-opts').classList.toggle('dis', R.fmt === 'csv');
        }

        R.pick = function (id) {
            var s = SMAP[id] || R.src || SRC.filter(allowed)[0]; if (!s) return;
            if (!allowed(s)) { toast('Bạn không có quyền xuất báo cáo mục này.', 'error'); s = SRC.filter(allowed)[0]; if (!s) return; }
            R.src = s; R.side = 'rank';
            var box = d.querySelector('#modal-report .rp'); box.style.setProperty('--rc', s.color);
            $('rp-ico').innerHTML = '<i class="fa-solid ' + s.icon + '"></i>';
            $('rp-title').textContent = 'Báo cáo ' + (s.id === 'ledger' && S().historyTargetUser ? 'biến động · ' + S().historyTargetUser : s.name);
            $('rp-sub').textContent = 'Nguồn dữ liệu: ' + s.col + ' · cập nhật lúc ' + fDT(Date.now());
            chips();
            var tk = ++R.loading; R.raw = []; R.rows = []; render();
            s.load().then(function (rows) { if (tk !== R.loading) return; R.raw = rows || []; R.loading = 0; apply(); },
                function (e) { console.warn('QDReport', s.col, e); if (tk !== R.loading) return; R.loading = 0; R.raw = []; apply(); $('rp-view').insertAdjacentHTML('afterbegin', '<p class="text-danger text-sm m-0"><i class="fa-solid fa-triangle-exclamation"></i> Không đọc được ' + esc(s.col) + ' — kiểm tra quyền Firestore.</p>'); });
        };
        R.open = function (id) {
            build();
            if (!id) { var act = d.querySelector('.view-section.active'), vid = act ? act.id.replace(/^view-/, '') : ''; id = VIEW_SRC[vid] || (R.src && R.src.id) || 'wheel'; }
            if (id === 'ledger' && !(S().currentUserHistoryCache || []).length) { toast('Không có dữ liệu lịch sử để xuất.', 'warning'); return; }
            if (id === 'ledger') R.range = 'all';
            $('rp-q').value = ''; UI.openModal('modal-report'); R.pick(id);
        };

        /* ---------- Tạo file ---------- */
        function fileName(s, ext) {
            var b = bounds(), a = b[0] ? dKey(b[0]).replace(/-/g, '') : 'dau', z = dKey(b[1] === Infinity ? Date.now() : b[1]).replace(/-/g, '');
            var who = s.id === 'ledger' ? '_' + (S().historyTargetUser || '') : (R.q ? '_' + $('rp-q').value.trim().replace(/[^\w\-]+/g, '') : '');
            return 'Bao_Cao_' + s.file + who + '_' + a + '-' + z + '.' + ext;
        }
        function save(blob, name) {
            var a = d.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; d.body.appendChild(a); a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
        }
        function meta(s) {
            var st = S();
            return [['Nội dung', 'Báo cáo ' + (s.id === 'ledger' ? 'biến động tài khoản ' + (st.historyTargetUser || '') : s.name)], ['Khoảng thời gian', rangeText()],
                R.q ? ['Lọc thành viên', $('rp-q').value.trim()] : null, ['Thời điểm xuất', new Date().toLocaleString('vi-VN')], ['Người xuất', (st.currentUser || 'admin')], ['Nguồn dữ liệu', s.col]].filter(Boolean);
        }
        function toCSV(s, rows) {
            var q = function (v) { v = String(v == null ? '' : v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
            var out = [['STT'].concat(s.cols.map(function (c) { return c[0]; }))].concat(rows.map(function (x, i) { return [i + 1].concat(s.cols.map(function (c) { return c[1](x); })); }));
            return '﻿' + out.map(function (r) { return r.map(q).join(','); }).join('\r\n');
        }
        function toXLS(s, rows) {
            var st = stats(s, rows), C = s.color, N = s.cols.length + 1, x = esc;
            var css = 'td,th{font-family:Calibri,Arial,sans-serif;font-size:11pt;padding:4px 8px;vertical-align:middle}'
                + '.b td,.b th{border:.5pt solid #d6d9de}.hd th{background:' + C + ';color:#fff;font-weight:700;text-align:center;border:.5pt solid ' + C + '}'
                + '.ti{font-size:18pt;font-weight:700;color:' + C + '}.st{font-size:10pt;color:#6b7280}.sec{font-size:12.5pt;font-weight:700;color:#111827;border-bottom:1.5pt solid ' + C + '}'
                + '.mk{color:#6b7280;font-weight:700;background:#f8fafc}.kv{font-size:14pt;font-weight:700;color:#111827}.kl{font-size:9pt;color:#6b7280;text-transform:uppercase}'
                + '.z td{background:#f9fafb}.n{mso-number-format:"\\#\\,\\#\\#0";text-align:right}.t{mso-number-format:"\\@"}.c{text-align:center}.tot td{font-weight:700;background:#eef2ff}';
            var h = '<table>';
            var blank = '<tr><td colspan="' + N + '" style="height:10px"></td></tr>';
            h += '<tr><td colspan="' + N + '" class="ti">BÁO CÁO ' + x((s.id === 'ledger' ? 'BIẾN ĐỘNG · ' + (S().historyTargetUser || '') : s.name).toUpperCase()) + '</td></tr>';
            h += '<tr><td colspan="' + N + '" class="st">Quân Đoàn T"L"Headshot · Hệ thống QD Elite</td></tr>' + blank;
            if (R.inc.sum) {
                h += '<tr><td colspan="' + N + '" class="sec">Thông tin báo cáo</td></tr>';
                meta(s).forEach(function (m) { h += '<tr class="b"><td class="mk" colspan="2">' + x(m[0]) + '</td><td colspan="' + Math.max(1, N - 2) + '">' + x(m[1]) + '</td></tr>'; });
                h += blank + '<tr><td colspan="' + N + '" class="sec">Số liệu tóm tắt</td></tr><tr class="b">';
                st.kpis.forEach(function (k) { h += '<td class="kl" style="background:#f8fafc">' + x(k[0]) + '</td>'; }); h += '</tr><tr class="b">';
                st.kpis.forEach(function (k) { h += '<td class="kv">' + x(k[1]) + '<br><span class="st">' + x(k[2] || '') + '</span></td>'; }); h += '</tr>' + blank;
            }
            if (R.inc.day && st.dk.length) {
                h += '<tr><td colspan="' + N + '" class="sec">Thống kê theo ngày</td></tr><tr class="b hd"><th>Ngày</th><th>Số bản ghi</th><th>Tỉ lệ</th></tr>';
                st.dk.slice().reverse().forEach(function (k, i) { h += '<tr class="b' + (i % 2 ? ' z' : '') + '"><td class="c">' + x(k.split('-').reverse().join('/')) + '</td><td class="n">' + st.days[k] + '</td><td class="c">' + (st.days[k] / rows.length * 100).toFixed(1) + '%</td></tr>'; });
                h += '<tr class="b tot"><td class="c">Tổng</td><td class="n">' + rows.length + '</td><td class="c">100%</td></tr>' + blank;
            }
            if (R.inc.rank && s.rank && st.rank.length) {
                h += '<tr><td colspan="' + N + '" class="sec">' + x(s.rank[0]) + '</td></tr><tr class="b hd"><th>Hạng</th><th>Thành viên</th><th>' + x(s.rank[1].charAt(0).toUpperCase() + s.rank[1].slice(1)) + '</th></tr>';
                st.rank.slice(0, 50).forEach(function (r, i) { h += '<tr class="b' + (i % 2 ? ' z' : '') + '"><td class="c">' + (i + 1) + '</td><td>' + x(r[0]) + '</td><td class="n">' + r[1] + '</td></tr>'; });
                h += blank;
            }
            if (R.inc.rank && s.brk && st.brk.length) {
                h += '<tr><td colspan="' + N + '" class="sec">' + x(s.brk[0]) + '</td></tr><tr class="b hd"><th colspan="2">Mục</th><th>Số lượng</th><th>Tỉ lệ</th></tr>';
                var tb = st.brk.reduce(function (a, r) { return a + r[1]; }, 0) || 1;
                st.brk.forEach(function (r, i) { h += '<tr class="b' + (i % 2 ? ' z' : '') + '"><td colspan="2">' + x(r[0]) + '</td><td class="n">' + r[1] + '</td><td class="c">' + (r[1] / tb * 100).toFixed(1) + '%</td></tr>'; });
                h += blank;
            }
            h += '<tr><td colspan="' + N + '" class="sec">Chi tiết (' + rows.length + ' dòng)</td></tr><tr class="b hd"><th>STT</th>' + s.cols.map(function (c) { return '<th>' + x(c[0]) + '</th>'; }).join('') + '</tr>';
            rows.forEach(function (r, i) {
                h += '<tr class="b' + (i % 2 ? ' z' : '') + '"><td class="c">' + (i + 1) + '</td>' + s.cols.map(function (c) { var v = c[1](r); return '<td class="' + (c[2] === 'n' && v !== '' ? 'n' : c[2] === 't' ? 't c' : '') + '">' + x(v) + '</td>'; }).join('') + '</tr>';
            });
            h += '</table>';
            var cols = '<col width="60">' + s.cols.map(function (c, i) { return '<col width="' + (i === 0 ? 150 : c[2] === 'n' ? 110 : 190) + '">'; }).join('');
            h = h.replace('<table>', '<table>' + cols);
            return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">'
                + '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>' + x(s.name.slice(0, 30)) + '</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->'
                + '<style>' + css + '</style></head><body>' + h + '</body></html>';
        }
        // Excel .xlsx thật: trang "Tổng quan" (thông tin, chỉ số, theo ngày, xếp hạng, phân bổ) + trang "Chi tiết" (cố định tiêu đề, có nút lọc)
        function toXLSX(s, rows) {
            var st = stats(s, rows), name = s.id === 'ledger' ? 'Biến động tài khoản · ' + (S().historyTargetUser || '') : s.name;
            var sub = 'Quân Đoàn T"L"Headshot · QD Elite · ' + rangeText() + ' · Xuất lúc ' + new Date().toLocaleString('vi-VN');
            var sheets = [], over = [];
            if (R.inc.sum) {
                over.push({ type: 'meta', title: 'Thông tin báo cáo', rows: meta(s) });
                over.push({ type: 'kpi', title: 'Số liệu tóm tắt', items: st.kpis });
            }
            if (R.inc.day && st.dk.length) {
                over.push({ type: 'table', title: 'Thống kê theo ngày', cols: [{ h: 'Ngày', t: 'c' }, { h: 'Số bản ghi', t: 'n' }, { h: 'Tỉ lệ', t: 'p' }],
                    rows: st.dk.slice().reverse().map(function (k) { return [k.split('-').reverse().join('/'), st.days[k], st.days[k] / (rows.length || 1)]; }),
                    total: ['Tổng', rows.length, 1] });
            }
            if (R.inc.rank && s.rank && st.rank.length) {
                over.push({ type: 'table', title: s.rank[0] + (st.rank.length > 200 ? ' (top 200)' : ''), cols: [{ h: 'Hạng', t: 'c' }, { h: 'Thành viên' }, { h: s.rank[1].charAt(0).toUpperCase() + s.rank[1].slice(1), t: 'n' }],
                    rows: st.rank.slice(0, 200).map(function (r, i) { return [i + 1, r[0], r[1]]; }) });
            }
            if (R.inc.rank && s.brk && st.brk.length) {
                var tb = st.brk.reduce(function (a, r) { return a + r[1]; }, 0) || 1;
                over.push({ type: 'table', title: s.brk[0], cols: [{ h: 'Mục' }, { h: 'Số lượng', t: 'n' }, { h: 'Tỉ lệ', t: 'p' }],
                    rows: st.brk.map(function (r) { return [r[0], r[1], r[1] / tb]; }), total: ['Tổng', tb, 1] });
            }
            if (over.length) sheets.push({ name: 'Tổng quan', title: 'BÁO CÁO ' + name.toUpperCase(), subtitle: sub, blocks: over });
            var dt = detailTable(s, rows);
            sheets.push({ name: 'Chi tiết', title: (over.length ? 'CHI TIẾT · ' : 'BÁO CÁO ') + name.toUpperCase(), subtitle: (over.length ? rangeText() : sub) + ' · ' + fmt(rows.length) + ' dòng', freezeCols: dt.freeze,
                blocks: [{ type: 'table', main: true, cols: dt.cols, rows: dt.rows }] });
            return { color: s.color, title: 'Báo cáo ' + name, sheets: sheets };
        }
        // Bảng "Chi tiết" mở rộng cho Excel: Ngày / Giờ / Thứ tách riêng, Họ tên cạnh mỗi cột tài khoản,
        // Nhóm quyền + Trạng thái tài khoản + Lần thứ mấy trong ngày (khi mỗi dòng gắn với 1 thành viên), Mã bản ghi
        function detailTable(s, rows) {
            var WD = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
            var acc = {}; (S().accountsCache || []).forEach(function (a) { if (a && a.user) acc[a.user] = a; });
            var hasAcc = Object.keys(acc).length > 0;
            var tm = function (x) { return Number(s.time(x)) || 0; };
            var src = s.cols.slice(), dropFirst = src.length && /^thời gian/i.test(src[0][0]) && rows.some(tm);
            if (dropFirst) src.shift();
            // Cột nào chứa tên tài khoản (đa số giá trị trùng tên tài khoản có thật)?
            var sample = rows.slice(0, 400), isMem = src.map(function (c) {
                if (!hasAcc || c[2] === 'n') return false;
                var n = 0, hit = 0; sample.forEach(function (x) { var v = c[1](x); if (v === '' || v == null) return; n++; if (acc[String(v)]) hit++; });
                return n > 0 && hit / n >= 0.6;
            });
            var memCount = isMem.filter(Boolean).length;
            var one = function (x) { var w = [].concat(s.who(x) || []).filter(Boolean); return w.length === 1 ? String(w[0]) : ''; };
            var single = hasAcc && (memCount === 1 || (memCount === 0 && sample.every(function (x) { return [].concat(s.who(x) || []).filter(Boolean).length <= 1; }) && sample.some(function (x) { return acc[one(x)]; })));
            var primary = function (x) { if (memCount === 1) { var i = isMem.indexOf(true); return String(src[i][1](x) || ''); } return one(x); };
            if (single) { var seenU = {}; sample.forEach(function (x) { seenU[primary(x)] = 1; }); if (Object.keys(seenU).length < 2 && memCount === 0) single = false; }   // cả bảng chỉ 1 người (vd. Biến động) -> đã ghi ở tiêu đề
            var role = function (u) { var a = acc[u]; if (!a) return ''; var r = a.role || (u === 'admin' ? 'admin' : 'user'); return r === 'admin' ? 'Quản trị viên' : r === 'manager' ? 'Quản lý' : 'Thành viên'; };
            var state = function (u) { var a = acc[u]; if (!a) return u ? 'Không còn tài khoản' : ''; return a.isBlocked === true ? 'Bị khóa' + (a.lockReason === 'security' ? ' (nghi gian lận)' : '') : 'Đang hoạt động'; };
            // Lần thứ mấy trong ngày của thành viên đó (tính theo giờ tăng dần)
            var nth = new Map();
            if (single) {
                var cnt = {};
                rows.slice().sort(function (a, b) { return tm(a) - tm(b); }).forEach(function (x) { var u = primary(x), t = tm(x); if (!u || !t) return; var k = u + '|' + dKey(t); cnt[k] = (cnt[k] || 0) + 1; nth.set(x, cnt[k]); });
            }
            var cols = [{ h: 'STT', t: 'c' }], getters = [function (x, i) { return i + 1; }];
            var add = function (h, t, f) { cols.push({ h: h, t: t || '' }); getters.push(f); };
            if (dropFirst || !src.length || rows.some(tm)) {
                add('Ngày', 'c', function (x) { var t = tm(x); return t ? fD(t) : ''; });
                add('Giờ', 'c', function (x) { var t = tm(x); if (!t) return ''; var z = new Date(t); return p2(z.getHours()) + ':' + p2(z.getMinutes()) + ':' + p2(z.getSeconds()); });
                add('Thứ', 'c', function (x) { var t = tm(x); return t ? WD[new Date(t).getDay()] : ''; });
            }
            var freeze = cols.length;
            src.forEach(function (c, i) {
                add(c[0], c[2] === 'n' ? 'n' : c[2] === 't' ? 't' : '', function (x) { return c[1](x); });
                if (isMem[i]) {
                    add(memCount > 1 ? 'Họ tên ' + c[0].charAt(0).toLowerCase() + c[0].slice(1) : 'Họ tên', '', function (x) { var a = acc[String(c[1](x) || '')]; return a ? (a.fullName || a.name || '') : ''; });
                    if (freeze === cols.length - 2 && freeze < 6) freeze = cols.length;   // cố định tới cột Họ tên đầu tiên
                }
            });
            if (single) {
                if (!memCount) add('Họ tên', '', function (x) { var a = acc[primary(x)]; return a ? (a.fullName || a.name || '') : ''; });
                add('Nhóm quyền', 'c', function (x) { return role(primary(x)); });
                add('Trạng thái tài khoản', 'c', function (x) { return state(primary(x)); });
                add('Lần trong ngày', 'n', function (x) { return nth.get(x) || ''; });
            }
            if (s.id === 'lixi') add('Thời gian thu hồi', 'c', function (x) { return x.revokedAt ? fDT(x.revokedAt) : ''; });
            if (rows.some(function (x) { return x && x.__id; })) add('Mã bản ghi', 't', function (x) { return x.__id || ''; });
            return { cols: cols, freeze: freeze, rows: rows.map(function (x, i) { return getters.map(function (g) { var v = g(x, i); return v == null ? '' : v; }); }) };
        }
        function toPrint(s, rows) {
            var st = stats(s, rows), C = s.color, x = esc, cd = chartDays(st), mx = Math.max.apply(null, cd.map(function (r) { return r[1]; }).concat(1)), every = cd.length > 16 ? Math.ceil(cd.length / 8) : 1;
            var LIM = 2000, title = s.id === 'ledger' ? 'Biến động tài khoản · ' + (S().historyTargetUser || '') : s.name;
            var css = '@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box}body{font-family:"Plus Jakarta Sans",Inter,Segoe UI,Roboto,Arial,sans-serif;color:#111827;margin:0;font-size:11.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
                + '.hd{display:flex;align-items:center;gap:14px;padding:16px 18px;border-radius:14px;background:' + C + ';color:#fff}.hd .ic{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.2);display:grid;place-items:center;font-size:22px;font-weight:800}'
                + '.hd h1{margin:0;font-size:20px}.hd p{margin:2px 0 0;opacity:.9;font-size:12px}.hd .r{margin-left:auto;text-align:right;font-size:11px;opacity:.95}'
                + '.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 16px;margin:14px 2px;font-size:11px;color:#4b5563}.meta b{color:#111827}'
                + '.k{display:grid;grid-template-columns:repeat(' + st.kpis.length + ',1fr);gap:10px;margin:10px 0 16px}.k div{border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px}.k div:first-child{border-color:' + C + ';background:' + C + '12}'
                + '.k span{display:block;font-size:9.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#6b7280}.k b{display:block;font-size:19px;margin-top:3px}.k small{color:#6b7280;font-size:10px}'
                + '.row{display:grid;grid-template-columns:1.4fr 1fr;gap:12px;margin-bottom:16px}.bx{border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;break-inside:avoid}.bx h3{margin:0 0 8px;font-size:12px}'
                + '.ch{display:flex;align-items:flex-end;gap:3px;height:110px;padding-top:14px}.ch div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:3px}.ch i{display:block;width:100%;max-width:22px;background:' + C + ';border-radius:4px 4px 1px 1px;position:relative}'
                + '.ch i b{position:absolute;top:-13px;left:50%;transform:translateX(-50%);font-size:8.5px;font-style:normal}.ch em{font-style:normal;font-size:8px;color:#6b7280;white-space:nowrap}'
                + 'ol{margin:0;padding:0;list-style:none}ol li{display:grid;grid-template-columns:16px 1fr auto;gap:6px;align-items:center;padding:3px 0;font-size:11px}ol li i{display:block;height:4px;border-radius:2px;background:' + C + ';opacity:.7;margin-top:2px}ol li>b:first-child{color:#9ca3af;font-size:10px}'
                + 'h2{font-size:13px;margin:16px 0 8px;padding-bottom:5px;border-bottom:2px solid ' + C + '}table{width:100%;border-collapse:collapse;font-size:10.5px}th{background:' + C + ';color:#fff;text-align:left;padding:6px 7px;font-weight:700}'
                + 'td{padding:5px 7px;border-bottom:1px solid #eef0f3;vertical-align:top}tr:nth-child(even) td{background:#f9fafb}td.n{text-align:right;font-variant-numeric:tabular-nums}thead{display:table-header-group}tr{break-inside:avoid}'
                + '.ft{margin-top:14px;font-size:9.5px;color:#9ca3af;text-align:center}';
            var h = '<div class="hd"><div class="ic">' + x(title.charAt(0)) + '</div><div><h1>Báo cáo ' + x(title) + '</h1><p>Quân Đoàn T"L"Headshot · QD Elite</p></div><div class="r">' + x(rangeText()) + '<br>Xuất lúc ' + x(new Date().toLocaleString('vi-VN')) + '</div></div>';
            if (R.inc.sum) {
                h += '<div class="meta">' + meta(s).map(function (m) { return '<div>' + x(m[0]) + ': <b>' + x(m[1]) + '</b></div>'; }).join('') + '</div>';
                h += '<div class="k">' + st.kpis.map(function (k) { return '<div><span>' + x(k[0]) + '</span><b>' + x(k[1]) + '</b><small>' + x(k[2] || '') + '</small></div>'; }).join('') + '</div>';
            }
            var side = '';
            if (R.inc.rank) {
                var list = s.rank && st.rank.length ? st.rank : st.brk, lbl = s.rank && st.rank.length ? s.rank[0] : s.brk ? s.brk[0] : '';
                if (list.length) { var lm = list[0][1] || 1; side = '<div class="bx"><h3>' + x(lbl) + '</h3><ol>' + list.slice(0, 8).map(function (r, i) { return '<li><b>' + (i + 1) + '</b><span>' + x(r[0]) + '<i style="width:' + Math.max(4, Math.round(r[1] / lm * 100)) + '%"></i></span><b>' + fmt(r[1]) + '</b></li>'; }).join('') + '</ol></div>'; }
            }
            if (R.inc.day && cd.length) {
                var pShown = false;
                var ch = '<div class="bx"><h3>Theo ngày</h3><div class="ch">' + cd.map(function (r, i) { return '<div><i style="height:' + Math.max(2, Math.round(r[1] / mx * 100)) + '%">' + (r[1] && (cd.length <= 16 || (r[1] === mx && !pShown && (pShown = true))) ? '<b>' + r[1] + '</b>' : '') + '</i><em>' + ((cd.length - 1 - i) % every === 0 ? dLbl(r[0]) : '&nbsp;') + '</em></div>'; }).join('') + '</div></div>';
                h += '<div class="row" style="' + (side ? '' : 'grid-template-columns:1fr') + '">' + ch + side + '</div>';
            } else if (side) h += '<div class="row" style="grid-template-columns:1fr">' + side + '</div>';
            h += '<h2>Chi tiết' + (rows.length > LIM ? ' (' + LIM + ' / ' + fmt(rows.length) + ' dòng mới nhất — tải Excel để có đủ)' : ' (' + fmt(rows.length) + ' dòng)') + '</h2>';
            h += '<table><thead><tr><th>#</th>' + s.cols.map(function (c) { return '<th' + (c[2] === 'n' ? ' style="text-align:right"' : '') + '>' + x(c[0]) + '</th>'; }).join('') + '</tr></thead><tbody>'
                + rows.slice(0, LIM).map(function (r, i) { return '<tr><td>' + (i + 1) + '</td>' + s.cols.map(function (c) { var v = c[1](r); return '<td' + (c[2] === 'n' ? ' class="n"' : '') + '>' + x(c[2] === 'n' && v !== '' ? fmt(v) : v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
            h += '<div class="ft">QD Elite · Báo cáo tạo tự động từ dữ liệu hệ thống</div>';
            return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>' + x(fileName(s, 'pdf').replace(/\.pdf$/, '')) + '</title><style>' + css + '</style></head><body>' + h + '</body></html>';
        }
        function printHTML(html) {
            var f = d.createElement('iframe'); f.setAttribute('aria-hidden', 'true');
            f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
            d.body.appendChild(f);
            var w = f.contentWindow; w.document.open(); w.document.write(html); w.document.close();
            setTimeout(function () { try { w.focus(); w.print(); } catch (e) { toast('Trình duyệt chặn in, hãy thử lại.', 'error'); } setTimeout(function () { f.remove(); }, 60000); }, 300);
        }
        R.download = function () {
            var s = R.src, rows = R.rows; if (!s || !rows.length) return;
            try {
                if (R.fmt === 'csv') { save(new Blob([toCSV(s, rows)], { type: 'text/csv;charset=utf-8' }), fileName(s, 'csv')); toast('Đã tải CSV (' + fmt(rows.length) + ' dòng).'); }
                else if (R.fmt === 'pdf') { printHTML(toPrint(s, rows)); toast('Đang mở hộp in — chọn "Lưu dạng PDF" để lưu file.', 'info'); }
                else if (window.QDXlsx) { QDXlsx.download(fileName(s, 'xlsx'), toXLSX(s, rows)); toast('Đã tải báo cáo Excel (' + fmt(rows.length) + ' dòng).'); }
                else { save(new Blob(['﻿' + toXLS(s, rows)], { type: 'application/vnd.ms-excel;charset=utf-8' }), fileName(s, 'xls')); toast('Đã tải báo cáo Excel (' + fmt(rows.length) + ' dòng).'); }
                try { db.collection('admin_logs').add({ type: 'report', action: 'export', source: s.id, format: R.fmt, rows: rows.length, user: '(hệ thống)', by: S().currentUser || 'admin', timestamp: Date.now() }).catch(function () {}); } catch (e) {}
            } catch (e) { console.error('QDReport', e); toast('Lỗi tạo báo cáo.', 'error'); }
        };
        R._toXLS = toXLS; R._toXLSX = toXLSX; R._toPrint = toPrint; R.SRC = SRC;
        R.add = function (src) { if (!SMAP[src.id]) { SRC.push(src); SMAP[src.id] = src; } };   // mục khác đăng ký thêm nguồn (vd. Chống gian lận)
    })();
    
