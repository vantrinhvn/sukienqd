    (function () {
        'use strict';
        if (typeof db === 'undefined') return;
        var d = document, $ = function (id) { return d.getElementById(id); };
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var toast = function (m, t) { if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast(m, t || 'success'); };
        var S = function () { try { return typeof State !== 'undefined' ? State : {}; } catch (e) { return {}; } };
        var num = function (v, dft) { var x = parseInt(v, 10); return isNaN(x) ? dft : x; };
        var fmt = function (n) { return Number(n || 0).toLocaleString('vi-VN'); };
        var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
        var ts = function (dd, t) { if (!(dd && t)) return 0; var v = new Date(dd + 'T' + t).getTime(); return isNaN(v) ? 0 : v; };
        var fDT = function (t) { var x = new Date(t); return p2(x.getHours()) + ':' + p2(x.getMinutes()) + ' ' + p2(x.getDate()) + '/' + p2(x.getMonth() + 1) + '/' + x.getFullYear(); };
        var isWish = function (t) { var n = String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); return !t || /chuc|may man lan sau|ti nua|them ti/.test(n); };
        var LOGO = 'data:image/jpeg;base64,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';
        var DOCS = ['task_config', 'attendance', 'attendance_reward_items', 'lixi_config', 'wheel_config', 'tranhthuong_config', 'point_shop_config', 'rps_config', 'con_config',
            'invite_config', 'transfer_config', 'account_config', 'registration_config', 'lucky_live', 'guide_config', 'security_config'];
        var THEMES = { do: { name: 'Đỏ Lì Xì', a: '#d42330', b: '#8f0a12', ink: '#9b0d19', soft: '#fff1f1', gold: '#f2b705' },
            dao: { name: 'Hoa Đào', a: '#e0457b', b: '#8e1442', ink: '#9d1748', soft: '#fff0f5', gold: '#f2b705' },
            chung: { name: 'Bánh Chưng', a: '#16a061', b: '#06553a', ink: '#0b6b40', soft: '#effbf4', gold: '#e3a008' } };
        var SECS = [['intro', '🗺️', 'Giới thiệu & tài sản'], ['start', '📝', 'Bắt đầu trong 3 bước'], ['daily', '📅', 'Việc mỗi ngày'], ['games', '🎮', 'Trò chơi & giải thưởng'],
            ['shop', '🏪', 'Trạm Quy Đổi (bảng giá)'], ['social', '🤝', 'Mã mời & tặng quà'], ['tour', '🏆', 'Giải đấu & ID game'], ['claim', '💵', 'Nhận thưởng tiền mặt'],
            ['rules', '📜', 'Quy định cần nhớ'], ['faq', '❓', 'Hỏi đáp nhanh'], ['help', '🙋', 'Cần hỗ trợ?']];
        var DEF = { title: 'Cẩm Nang Tân Binh', greeting: 'Chào mừng bạn gia nhập Quân Đoàn T"L"Headshot! 🧧 Cẩm nang này giúp bạn làm quen hệ thống sự kiện Tết Đinh Mùi 2027 chỉ trong 5 phút: tạo tài khoản, nhận lộc mỗi ngày và chơi các trò trúng thưởng.',
            contact: 'Nhắn Ban Quản Trị qua mục Trò Chuyện Nội Bộ trên web', group: '', site: '', theme: 'do', secs: {} };
        SECS.forEach(function (x) { DEF.secs[x[0]] = true; });

        var G = window.QDGuide = { cfg: {}, opt: JSON.parse(JSON.stringify(DEF)), at: 0, view: 'pc', html: '' };
        function defaultSite() { return /^https?:/.test(location.protocol) ? location.origin + location.pathname.replace(/[^/]*$/, '') + 'index.html' : ''; }

        /* ---------- Cấu hình đã chuẩn hóa (cùng mặc định với các trang thành viên / Quân Sư AI) ---------- */
        function data() {
            var C = G.cfg, now = Date.now(), o = {};
            var t = C.task_config || {}; o.login = num(t.loginReward, 10); o.att = num(t.attendanceReward, 20);
            var a = C.attendance || {}; o.attStart = a.start || '09:00'; o.attEnd = a.end || '10:00'; o.anti = a.antiProxyEnabled !== false && (C.security_config || {}).isEnabled !== false;
            var U = { points: 'điểm lì xì', tickets: 'lượt rút lì xì', spins: 'lượt vòng quay', conThrows: 'lượt ném còn' };
            var r = C.attendance_reward_items || {}, it = r.items && typeof r.items === 'object' ? r.items : null, give = [];
            if (r.isEnabled === true) Object.keys(U).forEach(function (k) {
                var x = it ? (it[k] || {}) : (k === 'tickets' ? { on: num(r.tickets, 0) > 0, n: num(r.tickets, 0) } : {}), n = num(x.n, 0);
                var daily = typeof x.ds === 'string' || typeof x.de === 'string', hm = function (v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? v : ''; };
                var to = daily ? 0 : num(x.to !== undefined ? x.to : r.to, 0), ds = daily ? hm(x.ds) : '', de = daily ? hm(x.de) : '';
                if (x.on === true && n > 0 && !(to && now >= to)) give.push('+' + n + ' ' + U[k] + (ds || de ? ' (' + (ds && de ? ds + '–' + de : ds ? 'từ ' + ds : 'tới ' + de) + ' mỗi ngày)' : ''));
            });
            o.attOn = give.length > 0; o.attItems = give;
            var l = C.lixi_config || {}, pr = (Array.isArray(l.prizes) ? l.prizes : []).map(function (p) { return { points: Math.floor(Number(p && p.points)), chance: Number(p && p.chance) }; }).filter(function (p) { return p.points >= 1 && p.chance > 0; });
            if (!pr.length) pr = [8, 18, 28, 38, 68, 88].map(function (x) { return { points: x }; });
            var lp = pr.map(function (p) { return p.points; });
            o.lixi = { on: l.isEnabled !== false && !(ts(l.endDate, l.endTime) && now >= ts(l.endDate, l.endTime)), min: Math.min.apply(null, lp), max: Math.max.apply(null, lp),
                limit: l.allowRedraw === true ? Math.min(50, Math.max(2, num(l.maxPerDay, 3))) : 1, open: ts(l.openDate, l.openTime), budget: num(l.dailyBudget, 0) };
            var pz = function (list, def) { var src = (list && list.length) ? list : def, seen = {}; return src.filter(function (p) { return parseFloat(p.chance) > 0 && !isWish(p.text) && !seen[p.text] && (seen[p.text] = 1); }).map(function (p) { return String(p.text); }); };
            var w = C.wheel_config || {}, q = w.quiz || {};
            o.wheel = { on: w.isEnabled !== false && !(ts(w.endDate, w.endTime) && now >= ts(w.endDate, w.endTime)), prizes: pz(w.prizes, [{ text: '10.000 VNĐ', chance: 1 }, { text: '20.000 VNĐ', chance: 1 }, { text: '50.000 VNĐ', chance: 1 }]),
                qStart: q.start || '', qEnd: q.end || '', end: ts(w.endDate, w.endTime) };
            var tr = C.tranhthuong_config || {};
            o.tranh = { on: tr.isEnabled !== false && !(ts(tr.endDate, tr.endTime) && now >= ts(tr.endDate, tr.endTime)), prizes: pz(tr.prizes, [{ text: '10.000 VNĐ', chance: 1 }, { text: '20.000 VNĐ', chance: 1 }, { text: '50.000 VNĐ', chance: 1 }]), end: ts(tr.endDate, tr.endTime) };
            var sh = C.point_shop_config || {}, items = Array.isArray(sh.items) && sh.items.length ? sh.items : [
                { icon: '🧧', name: '1 Lượt rút lì xì', type: 'tickets', amount: 1, cost: sh.ticketCost != null ? sh.ticketCost : 50 }, { icon: '🧧', name: 'Combo 5 lượt rút lì xì', type: 'tickets', amount: 5, cost: 220, dailyLimit: 2 }, { icon: '🧧', name: 'Combo 10 lượt rút lì xì', type: 'tickets', amount: 10, cost: 400, dailyLimit: 1 }];
            o.shop = { on: sh.isEnabled !== false, items: items.filter(function (x) { return x && x.active !== false && ['tickets', 'conThrows'].indexOf(x.type || 'tickets') >= 0; }).map(function (x) {
                return { icon: x.icon || (x.type === 'conThrows' ? '🎯' : '🧧'), name: String(x.name || ''), type: x.type || 'tickets', amount: Math.max(1, num(x.amount, 1)), cost: Math.max(0, num(x.cost, 0)), daily: x.dailyLimit == null || x.dailyLimit === '' ? 0 : num(x.dailyLimit, 0) }; }) };
            var rp = C.rps_config || {};
            o.rps = { on: rp.isEnabled !== false, start: rp.start || '00:00', end: rp.end || '23:59', fee: num(rp.fee, 5), win: num(rp.winReward, 10), lose: num(rp.loseReward, -5), limit: Math.max(3, num(rp.timeLimit, 10)) };
            var cn = C.con_config || {};
            o.con = { on: cn.enabled !== false, free: num(cn.freePerDay, 3), hit: num(cn.hitPoints, 20), rim: num(cn.rimPoints, 5), every: num(cn.streakEvery, 3), bonus: num(cn.streakBonus, 30), wind: cn.wind !== false };
            var iv = C.invite_config || {}, rw = iv.rewards && typeof iv.rewards === 'object' ? iv.rewards : null, me = [], inv = [];
            Object.keys(U).forEach(function (k) {
                var x = rw ? (rw[k] || {}) : (k === 'tickets' ? { on: true, invitee: num(iv.rewardTickets, 1), inviter: num(iv.rewardTickets, 1) } : {});
                if (x.on !== true || (num(x.to, 0) && now >= num(x.to, 0))) return;
                if (num(x.invitee, 0) > 0) me.push('+' + num(x.invitee, 0) + ' ' + U[k]); if (num(x.inviter, 0) > 0) inv.push('+' + num(x.inviter, 0) + ' ' + U[k]);
            });
            o.invite = { on: !!iv.isEnabled && (me.length || inv.length) > 0, me: me, inv: inv, max: num(iv.maxPerInviter, 0) };
            var gf = C.transfer_config || {}, gt = gf.types && typeof gf.types === 'object' ? gf.types : null, gty = [];
            ['spins', 'tickets', 'conThrows'].forEach(function (k) { if (gt ? (gt[k] && gt[k].on === true) : k !== 'conThrows') gty.push(U[k]); });
            o.gift = { on: gf.isEnabled === true && !(num(gf.to, 0) && now >= num(gf.to, 0)), types: gty, max: num(gf.maxPerTransfer, 0), daily: num(gf.dailyLimit, 0) };
            var ac = C.account_config || {}; o.inact = ac.inactivityMinutes !== undefined ? num(ac.inactivityMinutes, 1440) : 1440;
            var rg = C.registration_config || {}; o.reg = { on: rg.isEnabled !== false && !(ts(rg.endDate, rg.endTime) && now >= ts(rg.endDate, rg.endTime)), deadline: ts(rg.endDate, rg.endTime) };
            var lk = C.lucky_live || {}, rs = lk.rounds || {}, next = Object.keys(rs).map(function (k) { return rs[k]; }).filter(function (x) { return x && x.at && !x.done && x.at > now; }).sort(function (x, y) { return x.at - y.at; })[0];
            o.lucky = { next: next ? next.at : 0, label: next ? next.label || '' : '' };
            return o;
        }
        var fmin = function (m) { return m >= 1440 && m % 1440 === 0 ? (m / 1440) + ' ngày' : m >= 60 && m % 60 === 0 ? (m / 60) + ' giờ' : m + ' phút'; };
        var whole = function (s, e) { return /^0?0:00/.test(s) && /^23:5\d/.test(e); };

        /* ---------- Dựng file cẩm nang (1 file HTML tự chứa, đọc tốt trên điện thoại, in A4 đẹp) ---------- */
        function buildDoc(op) {
            var o = data(), T = THEMES[op.theme] || THEMES.do, on = op.secs, x = esc, n = 0, toc = [], body = '';
            var site = (op.site || '').trim(), group = (op.group || '').trim();
            var sec = function (id, icon, title, html) { if (!on[id]) return; n++; toc.push([id, icon, title]); body += '<section id="' + id + '"><h2><span class="no">' + n + '</span>' + icon + ' ' + x(title) + '</h2>' + html + '</section>'; };
            var card = function (icon, title, rows, tag) { return '<div class="card"><div class="ch"><b>' + icon + ' ' + x(title) + '</b>' + (tag || '') + '</div>' + rows.filter(Boolean).map(function (r) { return '<p class="r"><i>' + r[0] + '</i><span>' + r[1] + '</span></p>'; }).join('') + '</div>'; };
            var tag = function (ok, a, b) { return '<span class="tg ' + (ok ? 'ok' : 'no') + '">' + (ok ? a || 'Đang mở' : b || 'Tạm đóng') + '</span>'; };
            var B = function (v) { return '<b>' + x(v) + '</b>'; };

            sec('intro', '🗺️', 'Hệ thống Quân Đoàn là gì?',
                '<p><b>QĐ TLH</b> là cổng sự kiện Tết của team: làm nhiệm vụ mỗi ngày để tích <b>điểm lì xì</b>, đổi điểm lấy lượt chơi, rồi dùng lượt để <b>trúng thưởng tiền mặt</b> và quà Tết. Mọi thứ bạn có nằm trong <b>Túi đồ</b>:</p>'
                + '<div class="grid4">' + [['💰', 'Điểm lì xì', 'Tiền tệ chính — kiếm mỗi ngày, dùng để đổi lượt.'], ['🧧', 'Lượt rút lì xì', 'Mở 1 trong 6 bao ở trang Rút Lì Xì.'], ['🎡', 'Lượt vòng quay', 'Quay Vòng Quay may mắn.'], ['🎯', 'Lượt ném còn', 'Chơi Ném Còn để kiếm thêm điểm.']]
                    .map(function (a) { return '<div class="asset"><em>' + a[0] + '</em><b>' + a[1] + '</b><small>' + a[2] + '</small></div>'; }).join('') + '</div>'
                + '<div class="flow"><span>📅 Nhiệm vụ mỗi ngày</span><i>→</i><span>💰 Tích điểm</span><i>→</i><span>🎟️ Đổi lượt</span><i>→</i><span>🎁 Trúng thưởng</span></div>');

            sec('start', '📝', 'Bắt đầu trong 3 bước',
                '<ol class="steps"><li><b>Đăng ký tài khoản</b>' + (site ? ' tại <a href="' + x(site) + '">' + x(site.replace(/^https?:\/\//, '')) + '</a>' : ' ở Trang sự kiện') + ' → bấm <b>Đăng ký tài khoản</b>. Điền <b>tên đăng nhập</b> (viết liền, không dấu, từ 4 ký tự — vd. <i>tuanpro99</i>), <b>mật khẩu</b> và <b>họ tên hiển thị</b>.</li>'
                + '<li><b>Chờ Ban Quản Trị duyệt</b> — đơn vào hàng chờ, thường được duyệt trong ngày. Hỏi "đơn duyệt chưa" với Quân Sư AI để kiểm tra.</li>'
                + '<li><b>Đăng nhập</b> bằng tên + mật khẩu vừa tạo (tích <b>Ghi nhớ</b> để lần sau khỏi gõ). Lần đầu trong ngày nhận ngay <b>+' + o.login + ' điểm</b>.</li></ol>'
                + '<p class="tip">💡 Ghi nhớ mật khẩu cẩn thận — hệ thống không có nút tự lấy lại. Quên thì nhắn Ban Quản Trị để được cấp lại.</p>');

            var daily = [['🔑', 'Đăng nhập lần đầu trong ngày', 'Cả ngày', '+' + o.login + ' điểm'],
                ['✅', 'Điểm danh — bấm "Xác nhận có mặt"', o.attStart + ' – ' + o.attEnd, o.attOn ? '+' + o.att + ' điểm, ' + o.attItems.join(', ') : 'Ghi nhận chuyên cần'],
                ['🧧', 'Mở lì xì hằng ngày (thẻ ở Trang chủ)', o.lixi.on ? 'Cả ngày' : 'Tạm đóng', o.lixi.min + '–' + o.lixi.max + ' điểm × ' + o.lixi.limit + ' lần'],
                o.con.on && o.con.free > 0 ? ['🎯', 'Nhận lượt ném còn miễn phí tại sân', 'Cả ngày', o.con.free + ' lượt ném'] : null,
                ['🧠', 'Canh câu hỏi ở trang Vòng Quay', o.wheel.qStart && o.wheel.qEnd && o.wheel.qStart !== o.wheel.qEnd ? o.wheel.qStart + ' – ' + o.wheel.qEnd : 'Cả ngày', '+1 lượt quay / câu đúng sớm nhất']].filter(Boolean);
            sec('daily', '📅', 'Việc mỗi ngày (làm mới lúc 0 giờ)',
                '<table class="tb"><thead><tr><th>Việc</th><th>Giờ</th><th>Nhận được</th></tr></thead><tbody>' + daily.map(function (r) { return '<tr><td>' + r[0] + ' ' + x(r[1]) + '</td><td class="nw">' + x(r[2]) + '</td><td><b>' + x(r[3]) + '</b></td></tr>'; }).join('') + '</tbody></table>'
                + '<p class="tip">💡 Làm đủ việc mỗi ngày là cách nhanh nhất để tích điểm. Điểm danh 7 ngày liên tiếp mở thành tựu <b>Chuỗi Ngày Chăm Chỉ</b>.</p>');

            var cash = function (l) { return l.length ? l.slice(0, 5).map(x).join(' · ') : 'Lời chúc Tết'; };
            sec('games', '🎮', 'Trò chơi & giải thưởng',
                '<div class="cards">'
                + card('🎡', 'Vòng Quay', [['⏰', o.wheel.on ? 'Mở cả ngày' + (o.wheel.end ? ', đến ' + fDT(o.wheel.end) : '') : 'Tạm đóng'], ['🎮', 'Trả lời <b>đúng sớm nhất</b> câu hỏi trên trang để nhận lượt; mỗi lần quay tốn 1 lượt.'], ['🎁', cash(o.wheel.prizes) + ' hoặc lời chúc Tết']], tag(o.wheel.on))
                + card('🧧', 'Rút Lì Xì May Mắn', [['⏰', o.tranh.on ? 'Mở cả ngày' + (o.tranh.end ? ', đến ' + fDT(o.tranh.end) : '') : 'Tạm đóng'], ['🎮', 'Dùng 1 lượt rút lì xì, chọn <b>1 trong 6 bao</b>.'], ['🎁', cash(o.tranh.prizes) + ' hoặc lời chúc Tết']], tag(o.tranh.on))
                + card('⚔️', 'Kéo Búa Bao', [['⏰', !o.rps.on ? 'Tạm đóng' : whole(o.rps.start, o.rps.end) ? 'Mở cả ngày' : 'Mỗi ngày ' + o.rps.start + ' – ' + o.rps.end], ['🎮', 'Ghép ngẫu nhiên 1 chọi 1, thắng <b>2 hiệp</b> trước là thắng; ' + o.rps.limit + ' giây mỗi lượt. Cần ≥ ' + o.rps.fee + ' điểm để vào.'], ['🎁', 'Thắng <b>+' + o.rps.win + '</b>, thua <b>' + o.rps.lose + '</b> điểm']], tag(o.rps.on))
                + card('🎯', 'Ném Còn', [['⏰', o.con.on ? 'Mở cả ngày' + (o.con.free ? ' · ' + o.con.free + ' lượt miễn phí/ngày' : '') : 'Tạm đóng'], ['🎮', 'Vuốt lên để ném quả còn qua vòng' + (o.con.wind ? ', nhớ canh <b>gió</b>' : '') + '.'], ['🎁', 'Lọt vòng <b>+' + o.con.hit + '</b>, chạm vành <b>+' + o.con.rim + '</b>' + (o.con.every > 1 && o.con.bonus ? ', ' + o.con.every + ' lần lọt liên tiếp <b>+' + o.con.bonus + '</b>' : '') + ' điểm']], tag(o.con.on))
                + card('🔢', 'Quay Số May Mắn', [['⏰', o.lucky.next ? 'Lượt quay tới: <b>' + fDT(o.lucky.next) + '</b>' + (o.lucky.label ? ' (' + x(o.lucky.label) + ')' : '') : 'Theo lịch Ban Quản Trị thông báo'], ['🎮', 'Chọn <b>1 số từ 01 đến 100</b> (chọn xong bị khóa). Đến giờ, cả team xem quay trực tiếp.'], ['🎁', 'Trùng số là trúng thưởng']])
                + card('🧧', 'Lì xì hằng ngày', [['⏰', o.lixi.on ? 'Mở cả ngày' : 'Tạm đóng'], ['🎮', 'Chọn 1 trong 3 bao ở Trang chủ, miễn phí.'], ['🎁', o.lixi.min + '–' + o.lixi.max + ' điểm lì xì, ' + o.lixi.limit + ' lần/ngày']], tag(o.lixi.on))
                + '</div>');

            if (o.shop.items.length) sec('shop', '🏪', 'Trạm Quy Đổi — đổi điểm lấy lượt',
                '<p>Mở thẻ <b>🏪 Trạm Quy Đổi</b> ở Trang chủ (hoặc nút "Đổi quà" trong Túi đồ). Chọn số lượng → kiểm tra bảng xác nhận → <b>Xác nhận</b>. Lỗi hay hết hàng thì không bị trừ điểm.</p>'
                + '<table class="tb"><thead><tr><th>Vật phẩm</th><th>Nhận</th><th class="rt">Giá</th></tr></thead><tbody>' + o.shop.items.map(function (it) { return '<tr><td>' + x(it.icon) + ' ' + x(it.name) + (it.daily ? ' <small>(tối đa ' + it.daily + '/ngày)</small>' : '') + '</td><td class="nw">+' + it.amount + ' ' + (it.type === 'conThrows' ? 'lượt ném' : 'lượt rút') + '</td><td class="rt nw"><b>' + fmt(it.cost) + ' điểm</b></td></tr>'; }).join('') + '</tbody></table>'
                + (o.shop.on ? '' : '<p class="tip">⏸ Trạm Quy Đổi hiện đang tạm đóng.</p>'));

            sec('social', '🤝', 'Mã mời & tặng quà đồng đội',
                '<div class="cards">' + card('🤝', 'Mã mời bạn bè', [['📍', 'Mã của bạn nằm trong <b>Hồ sơ</b> (bấm tên / ảnh đại diện), có nút sao chép.'],
                    o.invite.on ? ['🎁', 'Người nhập mã nhận ' + (o.invite.me.length ? '<b>' + x(o.invite.me.join(', ')) + '</b>' : 'không có') + '; người mời nhận ' + (o.invite.inv.length ? '<b>' + x(o.invite.inv.join(', ')) + '</b>' : 'không có') + (o.invite.max ? ' (tối đa ' + o.invite.max + ' lần)' : '') + '.'] : ['⏸', 'Hiện Ban Quản Trị đang tạm tắt phần thưởng mã mời.'],
                    ['ℹ️', 'Mỗi tài khoản chỉ nhập mã <b>1 lần</b>.']], tag(o.invite.on, 'Đang bật', 'Tạm tắt'))
                + card('🎁', 'Tặng lượt cho đồng đội', [['📍', 'Túi đồ → <b>Tặng lượt cho đồng đội</b>: gõ tên hoặc họ tên, chọn người trong danh sách gợi ý.'],
                    o.gift.on ? ['🎟️', 'Tặng được: <b>' + x(o.gift.types.join(', ')) + '</b>' + (o.gift.max ? ' · tối đa ' + o.gift.max + '/lần' : '') + (o.gift.daily ? ' · ' + o.gift.daily + ' lần/ngày' : '') + '.'] : ['⏸', 'Chức năng tặng quà đang tạm đóng.'],
                    ['ℹ️', 'Điểm lì xì không chuyển được; mọi lần tặng đều lưu lịch sử.']], tag(o.gift.on)) + '</div>');

            sec('tour', '🏆', 'Giải đấu & Đăng ký ID Game',
                '<ul class="ul"><li><b>Đăng ký ID Game</b> (thẻ 🪪 ở Trang chủ): nhập tên nhân vật + ID (chỉ số), gửi 1 lần. ' + (o.reg.on ? (o.reg.deadline ? 'Hạn chót <b>' + fDT(o.reg.deadline) + '</b>.' : 'Đang mở đăng ký.') : 'Hiện đang khóa, chờ Ban Quản Trị mở vòng mới.') + '</li>'
                + '<li>Tab <b>Giải Đấu Máy Chủ</b>: sơ đồ thi đấu kiểu World Cup, xem theo vòng trên điện thoại, tab <b>⭐ Trận Của Tôi</b>.</li>'
                + '<li>Ban Quản Trị nhập tỉ số, người thắng tự vào vòng sau. Bấm tên tuyển thủ để xem thẻ chi tiết.</li></ul>');

            sec('claim', '💵', 'Trúng tiền mặt thì nhận thế nào?',
                '<ul class="ul"><li>Kết quả trúng thưởng được <b>ghi tự động</b> (thời gian, tên giải) — Ban Quản Trị đối soát theo dữ liệu này.</li><li>Xem lại ở nút <b>Lịch sử</b> trên trang trò chơi hoặc mục 💵 Tiền trong Túi đồ.</li>'
                + '<li>Ban Quản Trị sẽ liên hệ và <b>trao thưởng trực tiếp</b>. Nên chụp màn hình kết quả để đối chiếu khi cần.</li></ul>');

            sec('rules', '📜', 'Quy định cần nhớ',
                '<ul class="ul rules"><li>Mỗi người <b>1 tài khoản</b>, dùng thiết bị của chính mình.</li>'
                + (o.anti ? '<li>Bật <b>chống điểm danh hộ</b>: mỗi thiết bị / mỗi mạng chỉ điểm danh cho 1 tài khoản mỗi ngày.</li>' : '')
                + (o.inact > 0 ? '<li>Không hoạt động quá <b>' + fmin(o.inact) + '</b>, tài khoản sẽ tự khóa để bảo mật — đăng nhập và bấm <b>Yêu cầu mở khóa</b>.</li>' : '')
                + '<li><b>Không gian lận</b>, dùng tool hay lợi dụng lỗi: mọi thao tác điểm / lượt đều được máy chủ kiểm tra và ghi lịch sử. Phát hiện lỗi hãy báo Ban Quản Trị.</li>'
                + '<li>Tôn trọng đồng đội khi trò chuyện trong Kênh Chung và tin nhắn riêng.</li></ul>');

            sec('faq', '❓', 'Hỏi đáp nhanh',
                [['Đăng nhập báo "thông tin không chính xác"?', 'Kiểm tra chữ hoa / thường, khoảng trắng thừa, hoặc tài khoản chưa được duyệt.'],
                    ['Lì xì hằng ngày khác Rút Lì Xì thế nào?', 'Lì xì hằng ngày: miễn phí, nhận <b>điểm</b>. Rút Lì Xì: tốn 1 lượt rút, trúng <b>tiền mặt</b>.'],
                    ['Làm sao có thêm lượt quay?', 'Trả lời đúng sớm nhất câu hỏi ở trang Vòng Quay' + (o.invite.on ? ', nhập mã mời' : '') + ', hoặc được đồng đội / BQT tặng.'],
                    ['Hết điểm thì sao?', 'Làm nhiệm vụ mỗi ngày, chơi Ném Còn / Kéo Búa Bao để kiếm thêm.'],
                    ['Mất mạng giữa chừng có mất lượt không?', 'Không. Thao tác lỗi giữa chừng thì không bị trừ điểm / lượt.'],
                    ['Không nhận được thông báo?', 'Cài đặt → Kiểm tra Thông báo → Bật. Trên iPhone cần "Thêm vào Màn hình chính".']]
                    .map(function (q) { return '<details open><summary>' + x(q[0]) + '</summary><p>' + q[1] + '</p></details>'; }).join(''));

            sec('help', '🙋', 'Cần hỗ trợ?',
                '<div class="help"><div><b>🤖 Quân Sư AI</b><span>Bấm nút <b>Hỗ trợ</b> (góc phải dưới) trên mọi trang, hỏi bằng tiếng Việt có dấu hay không dấu đều được — luôn trả lời theo luật hiện hành.</span></div>'
                + '<div><b>🛡️ Ban Quản Trị</b><span>' + x(op.contact || DEF.contact) + '</span></div>'
                + (group ? '<div><b>👥 Nhóm cộng đồng</b><span><a href="' + x(group) + '">' + x(group.replace(/^https?:\/\//, '')) + '</a></span></div>' : '') + '</div>');

            var css = ':root{--a:' + T.a + ';--b:' + T.b + ';--ink:' + T.ink + ';--soft:' + T.soft + ';--gold:' + T.gold + '}*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}'
                + 'body{margin:0;font-family:"Be Vietnam Pro","Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#2b1a12;background:#fbf6ec;line-height:1.6;font-size:15px;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
                + '.wrap{max-width:820px;margin:0 auto;padding:0 0 40px;background:#fff;min-height:100vh}a{color:var(--ink);font-weight:700}'
                + '.cover{position:relative;overflow:hidden;padding:34px 28px 30px;color:#fff;background:radial-gradient(120% 90% at 85% 0%,rgba(255,213,74,.35),transparent 55%),linear-gradient(150deg,var(--a),var(--b))}'
                + '.cover:after{content:"";position:absolute;right:-60px;bottom:-60px;width:220px;height:220px;border-radius:50%;border:26px solid rgba(255,213,74,.18)}'
                + '.brand{display:flex;align-items:center;gap:14px;position:relative;z-index:1}.brand img{width:64px;height:64px;border-radius:18px;border:3px solid var(--gold);background:#2a0000;object-fit:cover}'
                + '.brand small{display:block;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.85}.brand b{font-size:15px}'
                + '.cover h1{position:relative;z-index:1;margin:22px 0 6px;font-size:34px;line-height:1.15;letter-spacing:-.5px;color:#fff}.cover h1 span{color:#ffd54a}'
                + '.cover p.sub{position:relative;z-index:1;margin:0;font-size:15px;opacity:.92}'
                + '.cta{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;margin-top:18px;padding:11px 18px;border-radius:999px;background:#ffd54a;color:#5a0a00;font-weight:800;text-decoration:none;box-shadow:0 10px 24px -10px rgba(0,0,0,.5)}'
                + '.meta{position:relative;z-index:1;margin-top:16px;font-size:12px;opacity:.8}'
                + '.hello{margin:-18px 20px 0;position:relative;z-index:2;background:#fff;border-radius:16px;padding:16px 18px;box-shadow:0 14px 34px -18px rgba(90,20,0,.45);border:1px solid #f1e3c5;font-size:15px}'
                + '.toc{margin:22px 20px 0;padding:14px 16px;border-radius:14px;background:var(--soft);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 14px}.toc b{grid-column:1/-1;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--ink);margin-bottom:4px}'
                + '.toc a{text-decoration:none;color:#3b2516;font-weight:600;font-size:14px;padding:3px 0}.toc a span{display:inline-block;min-width:22px;color:var(--ink);font-weight:800}'
                + 'section{padding:6px 20px 4px;margin-top:22px;break-inside:auto}h2{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:21px;line-height:1.25;color:var(--ink);padding-bottom:8px;border-bottom:2px solid var(--soft)}'
                + 'h2 .no{flex:0 0 auto;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-size:15px;color:#fff;background:linear-gradient(150deg,var(--a),var(--b))}'
                + 'p{margin:0 0 10px}.tip{padding:10px 14px;border-radius:12px;background:#fff8e1;border:1px solid #f6dc8f;font-size:14px}'
                + '.grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0}.asset{padding:14px 12px;border-radius:14px;background:var(--soft);text-align:center}.asset em{display:block;font-style:normal;font-size:28px}.asset b{display:block;margin-top:4px;color:var(--ink)}.asset small{display:block;font-size:12.5px;color:#6b5546;line-height:1.4;margin-top:2px}'
                + '.flow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px;font-size:13.5px;font-weight:700}.flow span{padding:7px 12px;border-radius:999px;background:#fff;border:1.5px solid var(--soft);box-shadow:0 0 0 1px #eee}.flow i{font-style:normal;color:var(--ink)}'
                + '.steps{counter-reset:s;list-style:none;padding:0;margin:0 0 12px;display:grid;gap:10px}.steps li{counter-increment:s;position:relative;padding:12px 14px 12px 56px;border-radius:14px;background:#fffaf2;border:1px solid #f3e6cd}'
                + '.steps li:before{content:counter(s);position:absolute;left:14px;top:12px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff;background:var(--a)}'
                + '.tb{width:100%;border-collapse:separate;border-spacing:0;font-size:14px;border:1px solid #efe2c9;border-radius:14px;overflow:hidden;margin:4px 0 12px}.tb th{background:var(--a);color:#fff;text-align:left;padding:9px 12px;font-size:12.5px;letter-spacing:.3px}'
                + '.tb td{padding:9px 12px;border-top:1px solid #f3e9d6;vertical-align:top}.tb tr:nth-child(even) td{background:#fffaf2}.tb small{color:#8a6a55}.nw{white-space:nowrap}.rt{text-align:right}'
                + '.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{border-radius:16px;border:1px solid #f0e2c6;background:#fffdf8;padding:12px 14px;break-inside:avoid}'
                + '.ch{display:flex;align-items:center;gap:8px;margin-bottom:6px}.ch b{font-size:16px;color:var(--ink)}.tg{margin-left:auto;font-size:11px;font-weight:800;padding:2px 9px;border-radius:999px;white-space:nowrap}.tg.ok{color:#065f46;background:#d1fae5}.tg.no{color:#991b1b;background:#fee2e2}'
                + '.r{display:flex;gap:8px;margin:4px 0 0;font-size:14px;line-height:1.5}.r i{font-style:normal;flex:0 0 auto}'
                + '.ul{margin:0 0 10px;padding-left:20px}.ul li{margin:6px 0}.rules li::marker{color:var(--a)}'
                + 'details{border:1px solid #f0e2c6;border-radius:12px;padding:10px 14px;margin-bottom:8px;background:#fffdf8;break-inside:avoid}summary{font-weight:800;cursor:pointer;color:#3b2516}details p{margin:6px 0 0;font-size:14px}'
                + '.help{display:grid;gap:10px}.help div{padding:12px 14px;border-radius:14px;background:var(--soft)}.help div>b{display:block;color:var(--ink)}.help span b{color:var(--ink)}.help span{font-size:14px}'
                + '.end{margin:26px 20px 0;padding:18px;border-radius:16px;text-align:center;color:#fff;background:linear-gradient(150deg,var(--a),var(--b))}.end b{display:block;font-size:19px;color:#ffd54a}.end small{display:block;margin-top:6px;opacity:.85;font-size:12px}'
                + '@media(max-width:600px){body{font-size:14.5px}.cover{padding:26px 18px 28px}.cover h1{font-size:27px}.hello,.toc{margin-left:12px;margin-right:12px}section{padding-left:12px;padding-right:12px}.grid4{grid-template-columns:repeat(2,minmax(0,1fr))}.cards{grid-template-columns:1fr}.toc{grid-template-columns:1fr}.end{margin-left:12px;margin-right:12px}.tb{font-size:13px}.tb th,.tb td{padding:8px}}'
                + '@media print{@page{size:A4;margin:12mm}body{background:#fff;font-size:12.5px}.wrap{max-width:none}.cta{box-shadow:none}.cover{border-radius:16px}section{margin-top:14px}h2{break-after:avoid}details{display:block}summary{list-style:none}summary::-webkit-details-marker{display:none}.toc{break-inside:avoid}}';
            var ttl = (op.title || DEF.title).trim();
            var html = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="' + T.a + '">'
                + '<title>' + x(ttl) + ' · Quân Đoàn T"L"Headshot</title><link rel="icon" href="' + LOGO + '"><style>' + css + '</style></head><body><div class="wrap">'
                + '<header class="cover"><div class="brand"><img src="' + LOGO + '" alt=""><div><small>Quân Đoàn</small><b>T"L"Headshot · QĐ TLH</b></div></div>'
                + '<h1>' + x(ttl) + '<br><span>Xuân Đinh Mùi 2027</span></h1><p class="sub">Hướng dẫn nhanh cho thành viên mới của cổng sự kiện Tết.</p>'
                + (site ? '<a class="cta" href="' + x(site) + '">🏮 Vào cổng sự kiện ›</a>' : '')
                + '<div class="meta">Cập nhật theo cấu hình hệ thống lúc ' + fDT(G.at || Date.now()) + '</div></header>'
                + (op.greeting && op.greeting.trim() ? '<div class="hello">' + x(op.greeting.trim()).replace(/\n/g, '<br>') + '</div>' : '')
                + (toc.length > 2 ? '<nav class="toc"><b>Nội dung</b>' + toc.map(function (t, i) { return '<a href="#' + t[0] + '"><span>' + (i + 1) + '.</span>' + t[1] + ' ' + x(t[2]) + '</a>'; }).join('') + '</nav>' : '')
                + body
                + '<div class="end"><b>Chúc bạn năm mới an khang, nhiều lộc! 🧧</b>Headshot liên tục — hẹn gặp ở Quân Đoàn!<small>Số liệu trong cẩm nang lấy từ cấu hình lúc ' + fDT(G.at || Date.now()) + ' và có thể thay đổi theo sự kiện. Hỏi Quân Sư AI để xem luật mới nhất.</small></div>'
                + '</div></body></html>';
            return html;
        }
        function shortMsg(op) {
            var o = data(), site = (op.site || '').trim(), L = [];
            L.push('🏮 ' + (op.title || DEF.title).toUpperCase() + ' — QUÂN ĐOÀN T"L"HEADSHOT');
            if (site) L.push('👉 Vào web: ' + site);
            L.push('1️⃣ Đăng ký tài khoản → chờ BQT duyệt → đăng nhập (+' + o.login + ' điểm mỗi ngày)');
            L.push('📅 Mỗi ngày: điểm danh ' + o.attStart + '–' + o.attEnd + (o.attOn ? ' (+' + o.att + ' điểm)' : '') + ' · mở lì xì ' + o.lixi.limit + ' lần (' + o.lixi.min + '–' + o.lixi.max + ' điểm)' + (o.con.on && o.con.free ? ' · ' + o.con.free + ' lượt ném còn miễn phí' : ''));
            L.push('🎮 Vòng Quay · Rút Lì Xì · Kéo Búa Bao' + (o.rps.on && !whole(o.rps.start, o.rps.end) ? ' (' + o.rps.start + '–' + o.rps.end + ')' : '') + ' · Ném Còn · Quay Số May Mắn');
            if (o.shop.items.length) { var c = Math.min.apply(null, o.shop.items.map(function (i) { return i.cost; })); L.push('🏪 Đổi điểm lấy lượt ở Trạm Quy Đổi (từ ' + fmt(c) + ' điểm)'); }
            if (o.invite.on && o.invite.me.length) L.push('🤝 Nhập mã mời của người giới thiệu: nhận ' + o.invite.me.join(', '));
            L.push('❓ Thắc mắc: bấm nút "Hỗ trợ" (Quân Sư AI) trên web');
            L.push('🛡️ Liên hệ BQT: ' + (op.contact || DEF.contact));
            if ((op.group || '').trim()) L.push('👥 Nhóm: ' + op.group.trim());
            return L.join('\n');
        }

        /* ---------- Giao diện hộp tạo cẩm nang ---------- */
        function build() {
            if ($('modal-guide')) return;
            var m = d.createElement('div'); m.className = 'modal-overlay'; m.id = 'modal-guide';
            m.innerHTML = '<div class="modal-content gd" role="dialog" aria-labelledby="gd-title">'
                + '<div class="gd-head"><span class="gd-ico"><img src="' + LOGO + '" alt=""></span><div class="gd-ttl"><h2 id="gd-title">Tạo cẩm nang tân binh</h2><p id="gd-sub">File giới thiệu hệ thống cho người mới — số liệu lấy trực tiếp từ cấu hình</p></div>'
                + '<button class="modal-close-btn gd-x" onclick="UI.closeModal(\'modal-guide\')" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button></div>'
                + '<div class="gd-tabs"><button type="button" data-t="form" class="on">✏️ Thiết lập</button><button type="button" data-t="pv">👁 Xem trước</button></div>'
                + '<div class="gd-main" id="gd-main" data-tab="form"><div class="gd-form">'
                + '<label class="gd-f"><span>Tiêu đề</span><input class="form-control" id="gd-in-title" maxlength="80"></label>'
                + '<label class="gd-f"><span>Lời chào</span><textarea class="form-control" id="gd-in-greeting" maxlength="600"></textarea></label>'
                + '<label class="gd-f"><span>Liên hệ Ban Quản Trị</span><input class="form-control" id="gd-in-contact" maxlength="200" placeholder="VD: Zalo 09xx xxx xxx (anh Tuấn)"></label>'
                + '<label class="gd-f"><span>Link nhóm cộng đồng</span><input class="form-control" id="gd-in-group" maxlength="300" placeholder="https://zalo.me/g/... (để trống nếu không có)" inputmode="url"></label>'
                + '<label class="gd-f"><span>Địa chỉ web</span><input class="form-control" id="gd-in-site" maxlength="300" placeholder="https://.../index.html" inputmode="url"><small>Hiện thành nút "Vào cổng sự kiện" trên bìa.</small></label>'
                + '<div class="gd-f"><span>Màu chủ đề</span><div class="gd-themes" id="gd-themes">' + Object.keys(THEMES).map(function (k) { return '<button type="button" class="gd-th" data-k="' + k + '" style="--a:' + THEMES[k].a + ';--b:' + THEMES[k].b + '"><i></i>' + THEMES[k].name + '</button>'; }).join('') + '</div></div>'
                + '<div class="gd-f"><span style="display:flex;align-items:center">Các mục trong cẩm nang<span class="gd-all" style="margin-left:auto;text-transform:none;letter-spacing:0"><button type="button" data-all="1">Chọn hết</button><button type="button" data-all="0">Bỏ hết</button></span></span><div class="gd-secs" id="gd-secs">'
                + SECS.map(function (x, i) { return '<label class="gd-sec"><input type="checkbox" data-s="' + x[0] + '"><em>' + x[1] + '</em>' + esc(x[2]) + '<small>Mục ' + (i + 1) + '</small></label>'; }).join('') + '</div></div>'
                + '<button type="button" class="btn btn-outline" id="gd-save" style="justify-content:center"><i class="fa-solid fa-floppy-disk"></i> Lưu thiết lập cho lần sau</button>'
                + '</div><div class="gd-pv"><div class="gd-pv-bar"><i class="fa-regular fa-eye"></i> Xem trước · <b id="gd-pv-n">0 mục</b><span class="seg"><button type="button" data-v="pc" class="on">Máy tính</button><button type="button" data-v="phone">Điện thoại</button></span></div>'
                + '<div class="gd-frame-wrap" id="gd-wrap"><iframe id="gd-frame" title="Xem trước cẩm nang" sandbox="allow-same-origin"></iframe></div></div></div>'
                + '<div class="gd-foot"><div class="gd-note" id="gd-note"></div>'
                + '<button type="button" class="btn btn-outline" id="gd-copy"><i class="fa-regular fa-copy"></i> Sao chép tin nhắn</button>'
                + '<button type="button" class="btn btn-outline" id="gd-print"><i class="fa-solid fa-print"></i> In / Lưu PDF</button>'
                + '<button type="button" class="btn gd-go" id="gd-dl"><i class="fa-solid fa-download"></i> Tải file HTML</button></div></div>';
            d.body.appendChild(m);
            m.addEventListener('click', function (e) { if (e.target === m) UI.closeModal('modal-guide'); });
            var deb = 0, again = function () { clearTimeout(deb); deb = setTimeout(refresh, 250); };
            ['title', 'greeting', 'contact', 'group', 'site'].forEach(function (k) { $('gd-in-' + k).addEventListener('input', function () { G.opt[k] = this.value; again(); }); });
            $('gd-themes').addEventListener('click', function (e) { var b = e.target.closest('.gd-th'); if (!b) return; G.opt.theme = b.dataset.k; paint(); refresh(); });
            $('gd-secs').addEventListener('change', function (e) { var k = e.target.dataset.s; if (k) { G.opt.secs[k] = e.target.checked; refresh(); } });
            m.querySelector('.gd-all').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; SECS.forEach(function (x) { G.opt.secs[x[0]] = b.dataset.all === '1'; }); fill(); refresh(); });
            m.querySelector('.gd-tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; $('gd-main').dataset.tab = b.dataset.t; m.querySelectorAll('.gd-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); }); });
            m.querySelector('.gd-pv-bar .seg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; G.view = b.dataset.v; $('gd-wrap').classList.toggle('phone', G.view === 'phone'); m.querySelectorAll('.gd-pv-bar .seg button').forEach(function (x) { x.classList.toggle('on', x === b); }); });
            $('gd-dl').addEventListener('click', G.download); $('gd-print').addEventListener('click', G.print); $('gd-copy').addEventListener('click', G.copy); $('gd-save').addEventListener('click', G.save);
        }
        function paint() {
            var T = THEMES[G.opt.theme] || THEMES.do;
            d.querySelector('#modal-guide .gd').style.setProperty('--gc', T.a);
            d.querySelectorAll('#gd-themes .gd-th').forEach(function (b) { b.classList.toggle('on', b.dataset.k === G.opt.theme); });
        }
        function fill() {
            ['title', 'greeting', 'contact', 'group', 'site'].forEach(function (k) { $('gd-in-' + k).value = G.opt[k] || ''; });
            d.querySelectorAll('#gd-secs input').forEach(function (c) { c.checked = G.opt.secs[c.dataset.s] !== false; });
            paint();
        }
        function refresh() {
            G.html = buildDoc(G.opt);
            var f = $('gd-frame'), keep = 0; try { keep = f.contentWindow.scrollY || 0; } catch (e) {}
            f.onload = function () { try { f.contentWindow.scrollTo(0, keep); } catch (e) {} };
            f.srcdoc = G.html;
            var cnt = SECS.filter(function (x) { return G.opt.secs[x[0]] !== false; }).length;
            $('gd-pv-n').textContent = cnt + ' mục';
            $('gd-note').innerHTML = '<i class="fa-solid fa-circle-info"></i> File HTML gửi thẳng qua Zalo / Messenger, mở được trên điện thoại không cần mạng. Số liệu theo cấu hình lúc ' + fDT(G.at);
            $('gd-dl').disabled = $('gd-print').disabled = !cnt;
        }
        G.open = function () {
            build(); UI.openModal('modal-guide');
            $('gd-frame').srcdoc = '<p style="font-family:sans-serif;color:#888;text-align:center;margin-top:80px">Đang đọc cấu hình hệ thống...</p>';
            Promise.all(DOCS.map(function (id) { return db.collection('settings').doc(id).get().then(function (s) { return [id, s.exists ? s.data() : null]; }, function () { return [id, null]; }); }))
                .then(function (list) {
                    G.cfg = {}; list.forEach(function (x) { G.cfg[x[0]] = x[1]; }); G.at = Date.now();
                    var sv = G.cfg.guide_config || {};
                    G.opt = JSON.parse(JSON.stringify(DEF));
                    ['title', 'greeting', 'contact', 'group', 'site', 'theme'].forEach(function (k) { if (typeof sv[k] === 'string' && (sv[k] || k === 'group')) G.opt[k] = sv[k]; });
                    if (sv.secs && typeof sv.secs === 'object') SECS.forEach(function (x) { if (typeof sv.secs[x[0]] === 'boolean') G.opt.secs[x[0]] = sv.secs[x[0]]; });
                    if (!G.opt.site) G.opt.site = defaultSite();
                    fill(); refresh();
                });
        };
        function stamp() { var dd = new Date(G.at || Date.now()); return dd.getFullYear() + p2(dd.getMonth() + 1) + p2(dd.getDate()); }
        function log(action) { try { db.collection('admin_logs').add({ type: 'guide', action: action, user: '(hệ thống)', by: S().currentUser || 'admin', timestamp: Date.now() }).catch(function () {}); } catch (e) {} }
        G.download = function () {
            var a = d.createElement('a'); a.href = URL.createObjectURL(new Blob([G.html], { type: 'text/html;charset=utf-8' }));
            a.download = 'Cam_Nang_Tan_Binh_QD_TLH_' + stamp() + '.html'; d.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
            toast('Đã tải cẩm nang (.html) — gửi file này cho thành viên mới.'); log('download_html');
        };
        G.print = function () {
            var f = d.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'; d.body.appendChild(f);
            var w = f.contentWindow; w.document.open(); w.document.write(G.html); w.document.close();
            setTimeout(function () { try { w.focus(); w.print(); } catch (e) { toast('Trình duyệt chặn in, hãy thử lại.', 'error'); } setTimeout(function () { f.remove(); }, 60000); }, 400);
            toast('Đang mở hộp in — chọn "Lưu dạng PDF" để có file PDF.', 'info'); log('print');
        };
        G.copy = function () {
            var t = shortMsg(G.opt), done = function () { toast('Đã sao chép tin nhắn giới thiệu — dán vào nhóm Zalo / Messenger.'); log('copy_message'); };
            if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
            function fallback() { var ta = d.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; d.body.appendChild(ta); ta.select(); try { d.execCommand('copy'); done(); } catch (e) { toast('Không sao chép được.', 'error'); } ta.remove(); }
        };
        G.save = function () {
            var b = $('gd-save'); b.disabled = true;
            db.collection('settings').doc('guide_config').set({ title: G.opt.title || '', greeting: G.opt.greeting || '', contact: G.opt.contact || '', group: G.opt.group || '', site: G.opt.site || '', theme: G.opt.theme, secs: G.opt.secs, updatedAt: Date.now(), by: S().currentUser || 'admin' }, { merge: true })
                .then(function () { toast('Đã lưu thiết lập cẩm nang.'); }, function () { toast('Lỗi lưu thiết lập.', 'error'); }).then(function () { b.disabled = false; });
        };
        G._build = buildDoc; G._msg = shortMsg;
    })();
    
