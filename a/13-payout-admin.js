    /* ===== TRẢ THƯỞNG TIỀN MẶT (admin, bán tự động) =====
       Nguồn giải tiền: spin_history (Vòng Quay), tranhthuong_history (Rút Lì Xì), lucky_rewards (Quay Số, mỗi người trúng 1 khoản),
                        tournament_prize (Giải Đấu, bản 24: tính từ sơ đồ + settings/tournament_prize, không có bộ sưu tập riêng) — số tiền đọc từ tên giải.
       bank_info/{tên đăng nhập} : thành viên tự khai trong Túi đồ { bin, bank, accNo, accName, updatedAt, changedAt, history[] }
       payouts/{bộ sưu tập}_{mã} : { user, col, histId, prize, amount, wonAt, status: 'paid'|'rejected', paidAt, by, method: 'qr'|'batch'|'manual', ref, bank{}, note, batch }
       settings/payout_config    : { isEnabled (mặc định BẬT), prefix (mã sự kiện), tpl (mẫu nội dung CK, vd "{MA} {USER} THUONG TET") }
       Không giữ khóa API ngân hàng trên trang (trang chạy ở trình duyệt, ai cũng xem được mã). Chuyển tiền thật: quét VietQR bằng app ngân hàng
       hoặc tải "File chuyển theo lô" lên Internet Banking doanh nghiệp, xong mới bấm "Đã chuyển". */
    (function () {
        'use strict';
        if (!document.getElementById('view-payout') || typeof db === 'undefined') return;
        var $ = function (id) { return document.getElementById(id); };
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var toast = function (m, t) { if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast(m, t || 'success'); };
        var vnd = function (n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; };
        var p2 = function (x) { return String(x).padStart(2, '0'); };
        var fold = function (s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D'); };
        var money = function (t) {   // giống Túi đồ ở user.html: "10.000 VNĐ" -> 10000 ; "20K" -> 20000 ; không phải tiền -> 0
            var m = String(t || '').match(/(\d[\d.,]*)\s*(k(?!\p{L})|nghìn|ngàn)?\s*(vnđ|vnd|đồng|đ(?!\p{L}))?/iu);
            if (!m || (!m[2] && !m[3])) return 0;
            var n = parseInt(m[1].replace(/[.,]/g, ''), 10) || 0;
            return m[2] ? n * 1000 : n;
        };
        var isWish = function (t) { return !t || /chuc may man|loi chuc|chuc tet|ti nua|them ti/.test(fold(t).toLowerCase()); };
        var me = function () { return (typeof State !== 'undefined' && State.currentUser) || 'admin'; };
        var agoS = function (t) { var m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'vừa xong' : m < 60 ? m + ' phút trước' : Math.round(m / 60) + ' giờ trước'; };
        var SRCS = [{ col: 'spin_history', name: '🎡 Vòng Quay' }, { col: 'tranhthuong_history', name: '🧧 Rút Lì Xì' }, { col: 'lucky_rewards', name: '🎯 Quay Số' }, { col: 'tournament_prize', name: '🏆 Giải Đấu' }, { col: 'point_cashout', name: '💱 Đổi Điểm' }];
        var SRCN = { spin_history: '🎡 Vòng Quay', tranhthuong_history: '🧧 Rút Lì Xì', lucky_rewards: '🎯 Quay Số', tournament_prize: '🏆 Giải Đấu', point_cashout: '💱 Đổi Điểm' };
        var BIN = { '970436': 'Vietcombank', '970415': 'VietinBank', '970418': 'BIDV', '970405': 'Agribank', '970422': 'MB Bank', '970407': 'Techcombank', '970416': 'ACB', '970432': 'VPBank', '970423': 'TPBank', '970403': 'Sacombank', '970437': 'HDBank', '970441': 'VIB', '970443': 'SHB', '970431': 'Eximbank', '970426': 'MSB', '970448': 'OCB', '970440': 'SeABank', '970449': 'LPBank', '970428': 'Nam A Bank', '970409': 'Bac A Bank', '970425': 'ABBANK', '970427': 'VietABank', '970412': 'PVcomBank', '970452': 'Kienlongbank', '970454': 'BVBank', '970438': 'BaoViet Bank', '970400': 'Saigonbank', '970419': 'NCB', '970414': 'OceanBank', '970430': 'PG Bank', '970408': 'GPBank', '970406': 'DongA Bank', '970429': 'SCB', '970421': 'VRB', '970442': 'Hong Leong', '970424': 'Shinhan Bank', '970457': 'Woori Bank', '546034': 'Cake by VPBank', '963388': 'Timo' };
        var bankOf = function (b) { return b ? (b.bank || BIN[b.bin] || b.bin) : ''; };
        var PA = window.PayoutAdmin = { wins: {}, got: {}, pays: {}, banks: {}, accs: {}, cfg: { on: true, prefix: 'QDTLH', tpl: '{MA} {USER} THUONG TET' }, sel: {}, open: {}, arm: null, tab: 'wait', started: false, lastExport: null };
        var REF = db.collection('settings').doc('payout_config');
        function log(action, extra) {
            var d = { type: 'payout', action: action, by: me(), timestamp: Date.now() }; for (var k in extra || {}) d[k] = extra[k];
            try { db.collection('admin_logs').add(d).catch(function () {}); } catch (e) {}
        }
        /* Bấm 2 lần để chắc chắn (nhớ theo khóa vì danh sách có thể vẽ lại giữa 2 lần bấm) */
        function armed(key, btn, label) {
            var a = PA.arm;
            if (a && a.key === key && Date.now() - a.at < 5000) { PA.arm = null; return true; }
            PA.arm = { key: key, at: Date.now() };
            if (btn) { btn.dataset.txt = btn.dataset.txt || btn.innerHTML; btn.classList.add('po-btn-arm'); btn.innerHTML = label || 'Bấm lần nữa'; setTimeout(function () { if (btn.isConnected) { btn.classList.remove('po-btn-arm'); btn.innerHTML = btn.dataset.txt; } }, 5000); }
            return false;
        }
        /* Nội dung chuyển khoản theo mẫu: {MA} mã sự kiện · {USER} tên đăng nhập · {SOGIAI} số giải · {TIEN} tổng tiền (70K) · {NGAY} ngày chuyển (ddmm) · {NGUON} VQ / RLX */
        var DEF_TPL = '{MA} {USER} THUONG TET';
        var TOKENS = [['{MA}', 'Mã sự kiện'], ['{USER}', 'Tên đăng nhập'], ['{SOGIAI}', 'Số giải'], ['{TIEN}', 'Tổng tiền'], ['{NGAY}', 'Ngày chuyển'], ['{NGUON}', 'Nguồn giải'], ['{MAGD}', 'Mã giải (đối soát)']];
        var SUGGEST = [
            ['{MA} {USER} THUONG TET', 'Ngắn gọn, dễ nhận (khuyên dùng)'],
            ['{MA} {USER}', 'Ngắn nhất'],
            ['{MA} TRA THUONG {USER}', 'Rõ mục đích'],
            ['{MA} {USER} {SOGIAI} GIAI {TIEN}', 'Kèm số giải + số tiền, dễ đối soát'],
            ['{MA} {USER} {NGAY}', 'Kèm ngày chuyển'],
            ['{MA} {USER} {NGUON}', 'Kèm nguồn: VQ = Vòng Quay, RLX = Rút Lì Xì, QS = Quay Số, GD = Giải Đấu, DD = Đổi Điểm'],
            ['LI XI TET {USER} {MA}', 'Thân thiện, đúng không khí Tết'],
            ['{MA} {USER} {MAGD}', 'Mỗi giải 1 mã riêng — đối soát từng lệnh chuyển']
        ];
        function refBuild(tpl, prefix, x) {
            x = x || {}; var wins = x.wins || [], tot = +x.total || 0, d = new Date();
            var src = {}; wins.forEach(function (w) { src[w.col === 'spin_history' ? 'VQ' : w.col === 'lucky_rewards' ? 'QS' : w.col === 'tournament_prize' ? 'GD' : w.col === 'point_cashout' ? 'DD' : 'RLX'] = 1; });
            var h = 2166136261, idk = wins.map(function (w) { return w.id || ''; }).join('|'); for (var i = 0; i < idk.length; i++) { h ^= idk.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 2246822507); h ^= h >>> 16;   // FNV-1a + trộn: mã khác hẳn nhau
            var magd = (Object.keys(src).length === 1 ? Object.keys(src)[0] : 'TG') + (h >>> 0).toString(36).toUpperCase().slice(-4).padStart(4, '0');   // vd VQ7F2A: cùng 1 giải luôn ra cùng mã
            var v = { MA: prefix || 'QDTLH', USER: x.user || '', SOGIAI: wins.length || 1, TIEN: tot >= 1000 ? Math.round(tot / 1000) + 'K' : String(tot), NGAY: p2(d.getDate()) + p2(d.getMonth() + 1), NGUON: Object.keys(src).join(' ') || 'VQ', MAGD: magd };
            var out = String(tpl || DEF_TPL).replace(/\{(MA|USER|SOGIAI|TIEN|NGAY|NGUON|MAGD)\}/gi, function (m, k) { return v[k.toUpperCase()]; });
            return fold(out).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
        }
        function refOf(x) { if (typeof x === 'string') x = groups().filter(function (g) { return g.user === x; })[0] || { user: x }; return refBuild(PA.cfg.tpl, PA.cfg.prefix, x); }
        function sample() { var g = groups().filter(function (x) { return x.wins.length; }); return g[0] || { user: 'binh', wins: [{ col: 'spin_history' }, { col: 'tranhthuong_history' }], total: 70000 }; }
        var BAD_WORDS = /\b(CA CUOC|DANH BAC|CO BAC|THANG CUOC|XO SO|LO DE|NAP TIEN GAME|VAY|NO|CHUYEN NHAM|LUA DAO)\b/;
        function badTpl(tpl, pf) { return BAD_WORDS.test(fold(String(tpl || '').replace(/\{[A-Za-z]+\}/g, ' ') + ' ' + (pf || '')).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ')); }   // chỉ xét chữ BQT gõ, không xét tên thành viên
        PA.refPreview = function () {
            var tpl = ($('po-tpl') || {}).value || DEF_TPL, pf = fold(($('po-prefix') || {}).value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'QDTLH';
            var x = sample(), out = refBuild(tpl, pf, x), n = out.length, el = $('po-ref-len'), pv = $('po-ref-pv'), sub = $('po-ref-pv-sub');
            if (pv) pv.textContent = out || '(trống)';
            if (sub) sub.textContent = 'Ví dụ với ' + x.user + ' · ' + (x.wins || []).length + ' giải · ' + vnd(x.total || 0) + (/\{USER\}/i.test(tpl) ? '' : ' — ⚠ mẫu chưa có {USER}, khó đối soát');
            if (el) {
                var bad = badTpl(tpl, pf);
                el.className = 'po-ref-len ' + (bad || !n ? 'bad' : n <= 25 ? 'ok' : 'warn');
                el.textContent = bad ? '⛔ Có từ dễ bị ngân hàng giữ lệnh' : !n ? 'Trống' : n + ' ký tự · ' + (n <= 25 ? 'an toàn mọi ngân hàng' : 'có ngân hàng sẽ cắt bớt');
            }
            document.querySelectorAll('#po-sug .po-chip').forEach(function (c) { c.classList.toggle('on', c.dataset.tpl === tpl.trim()); });
        };
        function refChips() {
            var tk = $('po-tok'), sg = $('po-sug'); if (!tk || !sg || tk.childElementCount) return;
            tk.innerHTML = TOKENS.map(function (t) { return '<button type="button" class="po-chip tok" data-tok="' + t[0] + '"><code>' + t[0] + '</code>' + esc(t[1]) + '</button>'; }).join('');
            sg.innerHTML = SUGGEST.map(function (t) { return '<button type="button" class="po-chip" data-tpl="' + esc(t[0]) + '">' + esc(refBuild(t[0], PA.cfg.prefix, sample())) + '<small>' + esc(t[1]) + '</small></button>'; }).join('');
            tk.addEventListener('click', function (e) {
                var b = e.target.closest('[data-tok]'); if (!b) return; var inp = $('po-tpl'), v = inp.value, a = inp.selectionStart != null ? inp.selectionStart : v.length, z = inp.selectionEnd != null ? inp.selectionEnd : v.length;
                var ins = (a > 0 && v[a - 1] !== ' ' ? ' ' : '') + b.dataset.tok + (v[z] && v[z] !== ' ' ? ' ' : '');
                inp.value = (v.slice(0, a) + ins + v.slice(z)).slice(0, 60); inp.focus(); var c = Math.min(inp.value.length, a + ins.length); inp.setSelectionRange(c, c); PA.refPreview();
            });
            sg.addEventListener('click', function (e) { var b = e.target.closest('[data-tpl]'); if (!b) return; $('po-tpl').value = b.dataset.tpl; PA.refPreview(); });
        }
        function refRefreshSug() { document.querySelectorAll('#po-sug .po-chip').forEach(function (c, i) { var t = SUGGEST[i]; if (t) c.innerHTML = esc(refBuild(t[0], PA.cfg.prefix, sample())) + '<small>' + esc(t[1]) + '</small>'; }); }
        function qrUrl(b, amount, ref) {
            return 'https://img.vietqr.io/image/' + encodeURIComponent(b.bin) + '-' + encodeURIComponent(b.accNo) + '-compact2.png?amount=' + Math.round(amount)
                + '&addInfo=' + encodeURIComponent(ref) + '&accountName=' + encodeURIComponent(b.accName || '');
        }

        /* ---------- Dữ liệu ---------- */
        function pending() {
            var out = [];
            SRCS.forEach(function (s) {
                (PA.wins[s.col] || []).forEach(function (w) {
                    if (!w.user || isWish(w.prize)) return; var amt = money(w.prize); if (!(amt > 0)) return;
                    var id = s.col + '_' + w.id, p = PA.pays[id]; if (p && (p.status === 'paid' || p.status === 'rejected')) return;
                    out.push({ id: id, col: s.col, histId: w.id, user: w.user, prize: w.prize, amount: amt, wonAt: w.ts || 0 });
                });
            });
            return out.sort(function (a, b) { return a.wonAt - b.wonAt; });
        }
        function dupMap() { var m = {}; Object.keys(PA.banks).forEach(function (u) { var b = PA.banks[u]; if (b && b.accNo) { var k = b.bin + ':' + b.accNo; (m[k] = m[k] || []).push(u); } }); return m; }
        function groups() {
            var g = {}, dups = dupMap(), now = Date.now();
            pending().forEach(function (w) { (g[w.user] = g[w.user] || { user: w.user, wins: [], total: 0 }); g[w.user].wins.push(w); g[w.user].total += w.amount; });
            return Object.keys(g).map(function (u) {
                var x = g[u], b = PA.banks[u] || null, a = PA.accs[u], fl = [];
                x.bank = b && b.accNo ? b : null; x.acc = a;
                if (!a) fl.push(['bad', 'Không tìm thấy tài khoản']);
                else if (a.isBlocked) fl.push(['bad', a.lockReason === 'security' ? 'Bị khóa (nghi gian lận)' : 'Tài khoản đang bị khóa']);
                if (x.bank) {
                    if (x.bank.allowEdit === true) fl.push(['', 'Đang cho sửa STK — chờ thành viên sửa xong']);
                    var ch = +x.bank.changedAt || 0;
                    if (ch && (x.bank.history || []).length > 1 && now - ch < 864e5) fl.push(['', 'Vừa đổi STK ' + agoS(ch) + ' — hỏi lại']);
                    var d = (dups[x.bank.bin + ':' + x.bank.accNo] || []).filter(function (o) { return o !== u; });
                    if (d.length) fl.push(['bad', 'Trùng STK với: ' + d.join(', ')]);
                }
                x.flags = fl; x.ready = !!x.bank && !fl.some(function (f) { return f[0] === 'bad'; });
                return x;
            }).sort(function (a, b) { return (b.ready - a.ready) || (b.total - a.total); });
        }
        PA.groups = groups;

        /* ---------- Vẽ ---------- */
        function flagsHtml(fl) { return fl.length ? '<div class="po-fl">' + fl.map(function (f) { return '<span class="' + f[0] + '">⚠ ' + esc(f[1]) + '</span>'; }).join('') + '</div>' : ''; }
        function bankHtml(x) {
            if (!x.bank) return '<span class="none">Chưa khai số tài khoản</span><div class="text-xs text-muted">Nhắn thành viên vào Túi đồ → "Khai tài khoản nhận thưởng"</div>';
            return '<b>' + esc(bankOf(x.bank)) + '</b> · <span class="mono">' + esc(x.bank.accNo) + '</span><div class="text-xs text-muted">' + esc(x.bank.accName || '') + '</div>';
        }
        function fdt(t) { if (!t) return ''; var d = new Date(t); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ' ' + p2(d.getDate()) + '/' + p2(d.getMonth() + 1); }
        function match(x, q) { if (!q) return true; var acc = x.acc || {}, b = x.bank || {}; return fold([x.user, acc.fullName, b.accName, b.accNo].join(' ')).toLowerCase().indexOf(q) >= 0; }
        function stats(gs) {
            var box = $('po-stats'); if (!box) return;
            var wait = 0, nob = 0, nobSum = 0; gs.forEach(function (x) { wait += x.total; if (!x.bank) { nob++; nobSum += x.total; } });
            var d0 = new Date(); d0.setHours(0, 0, 0, 0); var tod = 0, todN = 0, all = 0;
            Object.keys(PA.pays).forEach(function (k) { var p = PA.pays[k]; if (p.status !== 'paid') return; all += +p.amount || 0; if ((p.paidAt || 0) >= d0.getTime()) { tod += +p.amount || 0; todN++; } });
            var c = function (cls, l, n, s) { return '<div class="card po-stat ' + cls + '"><div class="po-stat-lbl">' + l + '</div><div class="po-stat-num">' + n + '</div><div class="po-stat-sub">' + s + '</div></div>'; };
            box.innerHTML = c(wait ? 'warn' : '', 'Chờ trả', vnd(wait), gs.length + ' người · ' + gs.reduce(function (a, x) { return a + x.wins.length; }, 0) + ' giải')
                + c(nob ? 'warn' : '', 'Chưa khai STK', nob + ' người', nob ? vnd(nobSum) + ' đang chờ' : 'Mọi người đã khai')
                + c('ok', 'Đã trả hôm nay', vnd(tod), todN + ' giải')
                + c('', 'Tổng đã trả', vnd(all), Object.keys(PA.pays).filter(function (k) { return PA.pays[k].status === 'paid'; }).length + ' giải');
        }
        /* Danh sách chờ trả: 'split' = TÁCH TỪNG GIẢI (mỗi giải 1 lần chuyển, dễ đối soát) · 'group' = gộp theo người (1 lần chuyển / người) */
        PA.mode = (function () { try { return localStorage.getItem('po_mode') === 'group' ? 'group' : 'split'; } catch (e) { return 'split'; } })();
        function units() {
            var gs = groups();
            if (PA.mode === 'group') return gs.map(function (g) { g.key = g.user; return g; });
            var out = [];
            gs.forEach(function (g) { g.wins.forEach(function (w, i) { out.push({ key: w.id, user: g.user, wins: [w], total: w.amount, bank: g.bank, acc: g.acc, flags: g.flags, ready: g.ready, single: true, idx: i + 1, of: g.wins.length }); }); });
            return out.sort(function (a, b) { return (b.ready - a.ready) || (a.user < b.user ? -1 : a.user > b.user ? 1 : 0) || (a.wins[0].wonAt - b.wins[0].wonAt); });
        }
        function unitOf(key) {   // key = tên đăng nhập (gộp) hoặc mã giải (tách)
            var gs = groups(), g = gs.filter(function (x) { return x.user === key; })[0];
            if (g) { g.key = g.user; return g; }
            for (var i = 0; i < gs.length; i++) { var w = gs[i].wins.filter(function (x) { return x.id === key; })[0]; if (w) { var o = gs[i]; return { key: w.id, user: o.user, wins: [w], total: w.amount, bank: o.bank, acc: o.acc, flags: o.flags, ready: o.ready, single: true }; } }
            return null;
        }
        PA.setMode = function (m) {
            PA.mode = m === 'group' ? 'group' : 'split'; PA.sel = {}; PA.open = {};
            try { localStorage.setItem('po_mode', PA.mode); } catch (e) {}
            document.querySelectorAll('#po-mode button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === PA.mode); });
            PA.render();
        };
        function actBtns(key, x) {
            return (x.bank ? '<button type="button" class="btn btn-outline" data-k="' + esc(key) + '" onclick="PayoutAdmin.qr(this.dataset.k)"><i class="fa-solid fa-qrcode mr-1"></i> Mã QR</button>' : '')
                + '<button type="button" class="btn btn-primary" data-k="' + esc(key) + '" onclick="PayoutAdmin.mark(this.dataset.k, this)"><i class="fa-solid fa-check mr-1"></i> Đã chuyển</button>';
        }
        PA.render = function () {
            var list = $('po-list'); if (!list) return;
            var gs = groups(); stats(gs);
            var done = Object.keys(PA.pays).length, nWins = gs.reduce(function (a, x) { return a + x.wins.length; }, 0);
            $('po-n-wait').textContent = gs.length ? '(' + (PA.mode === 'split' ? nWins + ' giải' : gs.length) + ')' : ''; $('po-n-done').textContent = done ? '(' + done + ')' : '';
            $('po-f').style.display = PA.tab === 'wait' ? '' : 'none';
            $('po-bar').hidden = PA.tab !== 'wait';
            document.querySelectorAll('#po-mode button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === PA.mode); });
            if (!SRCS.every(function (s) { return PA.got[s.col]; })) return;
            var q = fold(($('po-q') || {}).value || '').toLowerCase().trim();
            $('po-n-bank').textContent = Object.keys(PA.banks).length ? '(' + Object.keys(PA.banks).length + ')' : '';
            if (PA.tab === 'done') return renderDone(q);
            if (PA.tab === 'bank') return renderBanks(q);
            var f = ($('po-f') || {}).value || '', us = units(), split = PA.mode === 'split';
            Object.keys(PA.sel).forEach(function (k) { if (!us.some(function (x) { return x.key === k && x.ready; })) delete PA.sel[k]; });
            var rows = us.filter(function (x) { return (match(x, q) || (split && fold(x.wins[0].prize).toLowerCase().indexOf(q) >= 0)) && (!f || (f === 'ready' ? !!x.bank : f === 'nobank' ? !x.bank : x.flags.length)); });
            var sel = us.filter(function (x) { return PA.sel[x.key]; }), selSum = sel.reduce(function (a, x) { return a + x.total; }, 0), selPeople = {}; sel.forEach(function (x) { selPeople[x.user] = 1; });
            $('po-selinfo').textContent = sel.length ? 'Đã chọn ' + (split ? sel.length + ' giải · ' + Object.keys(selPeople).length + ' người' : sel.length + ' người') + ' · ' + vnd(selSum) : (split ? 'Mỗi giải là 1 lần chuyển riêng — chọn giải để xuất file / đánh dấu đã chuyển' : 'Chọn người để xuất file chuyển theo lô / đánh dấu đã chuyển');
            $('po-all').checked = us.some(function (x) { return x.ready; }) && us.filter(function (x) { return x.ready; }).every(function (x) { return PA.sel[x.key]; });
            if (!rows.length) { list.innerHTML = '<div class="po-empty">' + (gs.length ? 'Không có giải nào khớp bộ lọc.' : '🎉 Không còn giải tiền mặt nào chờ trả.') + '</div>'; return; }
            var lastU = '';
            list.innerHTML = rows.map(function (x) {
                var k = esc(x.key), u = esc(x.user), acc = x.acc || {}, w0 = x.wins[0];
                var cb = '<input type="checkbox" data-k="' + k + '" ' + (x.ready ? '' : 'disabled title="Chưa khai STK hoặc có cảnh báo nặng"') + (PA.sel[x.key] ? ' checked' : '') + ' onchange="PayoutAdmin.pick(this.dataset.k, this.checked)">';
                if (split) {
                    var head = x.user !== lastU; lastU = x.user;
                    return '<div class="po-g po-one' + (PA.sel[x.key] ? ' sel' : '') + (head ? ' first' : '') + '" data-k="' + k + '">' + cb
                        + '<div class="po-u"><b>' + u + '</b><small>' + esc(acc.fullName || '') + (x.of > 1 ? (acc.fullName ? ' · ' : '') + 'giải ' + x.idx + '/' + x.of : '') + '</small></div>'
                        + '<div class="po-bk"><div class="po-prz"><span class="src">' + SRCN[w0.col] + '</span> <b>' + esc(w0.prize) + '</b> <span class="text-muted">· ' + fdt(w0.wonAt) + '</span></div>' + bankHtml(x) + flagsHtml(x.flags) + '</div>'
                        + '<div class="po-amt"><b>' + vnd(x.total) + '</b><button type="button" data-id="' + esc(w0.id) + '" onclick="PayoutAdmin.reject(this.dataset.id, this)">Không trả</button></div>'
                        + '<div class="po-act">' + actBtns(x.key, x) + '</div></div>';
                }
                var op = !!PA.open[x.user];
                return '<div class="po-g' + (PA.sel[x.key] ? ' sel' : '') + '" data-k="' + k + '">' + cb
                    + '<div class="po-u"><b>' + u + '</b><small>' + esc(acc.fullName || '') + (acc.fullName ? ' · ' : '') + x.wins.length + ' giải · từ ' + fdt(w0.wonAt) + '</small></div>'
                    + '<div class="po-bk">' + bankHtml(x) + flagsHtml(x.flags) + '</div>'
                    + '<div class="po-amt"><b>' + vnd(x.total) + '</b><button type="button" data-k="' + k + '" onclick="PayoutAdmin.toggleOpen(this.dataset.k)">' + (op ? 'Ẩn chi tiết' : 'Xem ' + x.wins.length + ' giải') + '</button></div>'
                    + '<div class="po-act">' + actBtns(x.key, x) + '</div>'
                    + (op ? '<div class="po-det">' + x.wins.map(function (w) {   // gộp nhưng vẫn chuyển được từng giải
                        return '<div class="po-w"><span><b>' + esc(w.prize) + '</b> <span class="text-muted">· ' + SRCN[w.col] + '</span></span><span class="t">' + fdt(w.wonAt) + '</span>'
                            + (x.bank ? '<button type="button" data-k="' + esc(w.id) + '" onclick="PayoutAdmin.qr(this.dataset.k)">QR riêng</button>' : '')
                            + '<button type="button" data-k="' + esc(w.id) + '" onclick="PayoutAdmin.mark(this.dataset.k, this)">Đã chuyển</button>'
                            + '<button type="button" data-id="' + esc(w.id) + '" onclick="PayoutAdmin.reject(this.dataset.id, this)">Không trả</button></div>';
                    }).join('') + '</div>' : '')
                    + '</div>';
            }).join('');
        };
        function renderDone(q) {
            var list = $('po-list');
            var arr = Object.keys(PA.pays).map(function (k) { var p = PA.pays[k]; p._id = k; return p; })
                .filter(function (p) { return !q || fold([p.user, p.prize, p.ref, p.bank && p.bank.accNo, p.by].join(' ')).toLowerCase().indexOf(q) >= 0; })
                .sort(function (a, b) { return (b.paidAt || 0) - (a.paidAt || 0); });
            if (!arr.length) { list.innerHTML = '<div class="po-empty">Chưa có giải nào được xử lý.</div>'; return; }
            var LIM = 300, last = '', h = '';
            arr.slice(0, LIM).forEach(function (p) {
                var t = new Date(p.paidAt || 0), day = t.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
                if (day !== last) { last = day; h += '<div class="po-day">📅 ' + esc(day) + '</div>'; }
                var M = { qr: 'Quét VietQR', batch: 'Chuyển theo lô', manual: 'Đánh dấu tay' };
                h += '<div class="po-h" data-id="' + esc(p._id) + '"><span class="text-muted">' + p2(t.getHours()) + ':' + p2(t.getMinutes()) + '</span>'
                    + '<span><b class="text-main">' + esc(p.user) + '</b><div class="text-xs text-muted">' + esc(p.prize || '') + ' · ' + (SRCN[p.col] || '') + '</div></span>'
                    + '<span class="bkx text-sm">' + (p.status === 'paid' ? (p.bank ? esc(bankOf(p.bank)) + ' · ' + esc(p.bank.accNo) + ' · ' : '') + esc(M[p.method] || '') + (p.ref ? ' · ND: <b>' + esc(p.ref) + '</b>' : '') + ' · bởi ' + esc(p.by || '') : esc(p.note || 'Không trả') + ' · bởi ' + esc(p.by || '')) + '</span>'
                    + '<span class="st ' + esc(p.status) + '">' + (p.status === 'paid' ? '✅ ' + vnd(p.amount) : '✖ Không trả') + '</span>'
                    + '<button type="button" onclick="PayoutAdmin.undo(this.closest(\'.po-h\').dataset.id, this)">Hoàn tác</button></div>';
            });
            list.innerHTML = h + (arr.length > LIM ? '<div class="po-empty">Hiện ' + LIM + ' / ' + arr.length + ' bản ghi gần nhất — dùng ô tìm kiếm để lọc.</div>' : '');
        }
        function renderBanks(q) {
            var list = $('po-list'), dups = dupMap(), now = Date.now();
            var arr = Object.keys(PA.banks).map(function (u) { return PA.banks[u]; }).filter(function (b) { return b && b.accNo; })
                .filter(function (b) { var a = PA.accs[b.user] || {}; return !q || fold([b.user, a.fullName, b.accName, b.accNo, bankOf(b)].join(' ')).toLowerCase().indexOf(q) >= 0; })
                .sort(function (a, b) { return (b.allowEdit === true) - (a.allowEdit === true) || (b.updatedAt || 0) - (a.updatedAt || 0); });
            if (!arr.length) { list.innerHTML = '<div class="po-empty">Chưa có thành viên nào khai số tài khoản.</div>'; return; }
            list.innerHTML = arr.map(function (b) {
                var a = PA.accs[b.user] || {}, d = (dups[b.bin + ':' + b.accNo] || []).filter(function (o) { return o !== b.user; }), open = b.allowEdit === true;
                var fl = []; if (d.length) fl.push(['bad', 'Trùng STK với: ' + d.join(', ')]);
                if (b.changedAt && (b.history || []).length > 1 && now - b.changedAt < 864e5) fl.push(['', 'Vừa đổi STK ' + agoS(b.changedAt)]);
                return '<div class="po-b" data-u="' + esc(b.user) + '"><span><b class="text-main">' + esc(b.user) + '</b><div class="text-xs text-muted">' + esc(a.fullName || '') + '</div></span>'
                    + '<span class="bkx"><b>' + esc(bankOf(b)) + '</b> · <span style="font-family:var(--font-family-mono,monospace)">' + esc(b.accNo) + '</span><div class="text-xs text-muted">' + esc(b.accName || '') + ' · khai ' + fdt(b.firstAt || b.updatedAt) + ((+b.editCount || 0) ? ' · đã sửa ' + b.editCount + ' lần (gần nhất ' + fdt(b.changedAt) + ')' : '') + '</div>' + flagsHtml(fl) + '</span>'
                    + '<span>' + (open ? '<span class="lk open">✏️ Đang cho sửa' + (b.allowEditBy ? ' · ' + esc(b.allowEditBy) : '') + '</span>' : '<span class="lk lock">🔒 Đã khóa</span>') + '</span>'
                    + '<span>' + (open ? '<button type="button" class="btn btn-outline" onclick="PayoutAdmin.setEdit(this.closest(\'.po-b\').dataset.u, false, this)"><i class="fa-solid fa-lock mr-1"></i> Khóa lại</button>'
                        : '<button type="button" class="btn btn-primary" onclick="PayoutAdmin.setEdit(this.closest(\'.po-b\').dataset.u, true, this)"><i class="fa-solid fa-pen-to-square mr-1"></i> Cho sửa lại</button>') + '</span></div>';
            }).join('');
        }
        PA.setEdit = function (u, on, btn) {
            if (on && !armed('edit:' + u, btn, 'Bấm lần nữa: cho ' + esc(u) + ' sửa')) return;
            if (btn) btn.disabled = true;
            db.collection('bank_info').doc(u).set(on ? { allowEdit: true, allowEditAt: Date.now(), allowEditBy: me() } : { allowEdit: false }, { merge: true })
                .then(function () { toast(on ? 'Đã cho <b>' + esc(u) + '</b> sửa số tài khoản 1 lần (sửa xong tự khóa lại).' : 'Đã khóa lại số tài khoản của <b>' + esc(u) + '</b>.', on ? 'success' : 'info'); log(on ? 'allow_edit' : 'lock_bank', { user: u }); })
                .catch(function () { toast('Không lưu được (không đủ quyền hoặc mất kết nối máy chủ).', 'error'); if (btn) btn.disabled = false; });
        };
        PA.setTab = function (t) { PA.tab = t; document.querySelectorAll('#view-payout .po-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === t); }); PA.render(); };
        PA.toggleOpen = function (u) { PA.open[u] = !PA.open[u]; PA.render(); };
        PA.pick = function (k, on) { if (on) PA.sel[k] = 1; else delete PA.sel[k]; PA.render(); };
        PA.selectAll = function (on) { PA.sel = {}; if (on) units().forEach(function (x) { if (x.ready) PA.sel[x.key] = 1; }); PA.render(); };

        /* ---------- Ghi nhận đã chuyển / không trả / hoàn tác ---------- */
        function write(gs, method) {
            var t = Date.now(), batchId = 'b' + t.toString(36), ops = [];
            gs.forEach(function (x) {
                var bk = x.bank ? { bin: x.bank.bin, bank: bankOf(x.bank), accNo: x.bank.accNo, accName: x.bank.accName || '' } : null, ref = refOf(x);
                x.wins.forEach(function (w) { ops.push([db.collection('payouts').doc(w.id), { user: x.user, col: w.col, histId: w.histId, prize: w.prize, amount: w.amount, wonAt: w.wonAt, status: 'paid', paidAt: t, by: me(), method: method, ref: ref, bank: bk, batch: batchId }]); });
            });
            var chunks = []; for (var i = 0; i < ops.length; i += 400) chunks.push(ops.slice(i, i + 400));
            return chunks.reduce(function (pr, ch) { return pr.then(function () { var b = db.batch(); ch.forEach(function (o) { b.set(o[0], o[1]); }); return b.commit(); }); }, Promise.resolve()).then(function () {
                var sum = gs.reduce(function (a, x) { return a + x.total; }, 0);
                log('paid', { user: gs.length === 1 ? gs[0].user : '(' + gs.length + ' người)', users: gs.map(function (x) { return x.user; }).slice(0, 200), amount: sum, count: ops.length, method: method, batch: batchId });
                try {   // Bot báo "Đã chuyển tiền thưởng": nhắn riêng cho từng người nhận bằng tài khoản BQT (Trả thưởng > thẻ Bot báo)
                    if (window.QDPayNotify) QDPayNotify.send(gs.map(function (x) {
                        return { user: x.user, total: x.total, ref: refOf(x), bank: x.bank ? { bank: bankOf(x.bank), accNo: x.bank.accNo, accName: x.bank.accName || '' } : null,
                            wins: x.wins.map(function (w) { return { col: w.col, prize: w.prize, amount: w.amount, wonAt: w.wonAt }; }) };
                    }), { method: method, paidAt: t, by: me(), batch: batchId });
                } catch (e) { console.warn('[Bot báo chuyển tiền]', e); }
                return { n: ops.length, sum: sum };
            });
        }
        PA.mark = function (key, btn, method) {   // key = mã giải (chỉ giải đó) hoặc tên đăng nhập (mọi giải của người đó)
            var x = unitOf(key); if (!x) return;
            var warn = x.flags.length ? ' (có cảnh báo!)' : '';
            if (btn && !armed('pay:' + key, btn, 'Chắc chắn đã chuyển ' + vnd(x.total) + warn + '?')) return;
            if (btn) btn.disabled = true;
            write([x], method || (x.bank ? 'qr' : 'manual')).then(function (r) { toast('Đã ghi nhận chuyển ' + vnd(r.sum) + ' cho <b>' + esc(x.user) + '</b>' + (x.single ? ' (' + esc(x.wins[0].prize) + ')' : '') + '.'); delete PA.sel[key]; UI.closeModal('modal-payout-qr'); })
                .catch(function (e) { console.warn(e); toast('Không ghi được (không đủ quyền hoặc mất kết nối máy chủ).', 'error'); if (btn) btn.disabled = false; });
        };
        PA.markSelected = function (btn) {
            var gs = units().filter(function (x) { return PA.sel[x.key]; });
            if (!gs.length) { toast('Chưa chọn giải nào. Tích ô ở đầu mỗi dòng (chỉ người đã khai STK).', 'warning'); return; }
            var sum = gs.reduce(function (a, x) { return a + x.total; }, 0), lbl = PA.mode === 'split' ? gs.length + ' giải' : gs.length + ' người';
            if (!armed('paysel', btn, 'Đã chuyển xong ' + lbl + ' · ' + vnd(sum) + '? Bấm lần nữa')) return;
            btn.disabled = true;
            var ex = PA.lastExport, viaFile = ex && Date.now() - ex.at < 6 * 36e5 && gs.every(function (x) { return ex.keys[x.key]; });
            write(gs, viaFile ? 'batch' : 'manual').then(function (r) { toast('Đã ghi nhận ' + lbl + ' · ' + vnd(r.sum) + '.'); PA.sel = {}; })
                .catch(function () { toast('Không ghi được (không đủ quyền hoặc mất kết nối máy chủ).', 'error'); }).finally(function () { btn.disabled = false; });
        };
        PA.reject = function (id, btn) {
            var w = pending().filter(function (x) { return x.id === id; })[0]; if (!w) return;
            if (!armed('rej:' + id, btn, 'Bấm lần nữa: không trả')) return;
            db.collection('payouts').doc(id).set({ user: w.user, col: w.col, histId: w.histId, prize: w.prize, amount: w.amount, wonAt: w.wonAt, status: 'rejected', paidAt: Date.now(), by: me(), note: 'Ban Quản Trị không duyệt giải này' })
                .then(function () { toast('Đã đánh dấu không trả: ' + esc(w.prize) + ' của ' + esc(w.user) + '.', 'warning'); log('reject', { user: w.user, amount: w.amount, id: id }); })
                .then(function () { if (w.col === 'point_cashout') return cashoutPoints(w.user, w.histId, +1); })
                .catch(function () { toast('Không ghi được.', 'error'); });
        };
        /* Đổi điểm ra tiền: "Không trả" -> HOÀN điểm cho thành viên; hoàn tác lệnh "Không trả" -> trừ lại (mỗi chiều chỉ 1 lần nhờ cờ refunded) */
        function cashoutPoints(user, histId, sign) {
            var acc = PA.accs[user]; if (!acc || !acc.__id) { toast('Không tìm thấy tài khoản ' + esc(user) + ' để ' + (sign > 0 ? 'hoàn' : 'trừ lại') + ' điểm.', 'error'); return; }
            var FV = firebase.firestore.FieldValue, oRef = db.collection('point_cashout').doc(histId), aRef = db.collection('accounts').doc(acc.__id);
            return db.runTransaction(function (t) {
                return t.get(oRef).then(function (o) {
                    if (!o.exists) return 0; var x = o.data(), n = +x.points || 0; if (!n) return 0;
                    if (sign > 0 && x.refunded) return 0; if (sign < 0 && !x.refunded) return 0;
                    t.update(aRef, { points: FV.increment(sign * n) });
                    t.set(oRef, { refunded: sign > 0, status: sign > 0 ? 'rejected' : 'pending', refundAt: Date.now(), refundBy: me() }, { merge: true });
                    t.set(db.collection('point_history').doc(), { user: user, action: sign > 0 ? 'cashout_refund' : 'cashout', detail: sign > 0 ? 'Hoàn ' + n.toLocaleString('vi-VN') + ' điểm: yêu cầu đổi tiền không được duyệt' : 'Trừ lại ' + n.toLocaleString('vi-VN') + ' điểm: BQT hoàn tác lệnh không duyệt', pointsChanged: sign * n, cashoutId: histId, timestamp: Date.now() });
                    return n;
                });
            }).then(function (n) { if (n) toast((sign > 0 ? 'Đã hoàn ' : 'Đã trừ lại ') + n.toLocaleString('vi-VN') + ' điểm lì xì cho ' + esc(user) + '.', 'info'); })
              .catch(function (e) { console.warn(e); toast('Không ' + (sign > 0 ? 'hoàn' : 'trừ lại') + ' được điểm (không đủ quyền hoặc mất kết nối máy chủ).', 'error'); });
        }
        PA.undo = function (id, btn) {
            var p = PA.pays[id]; if (!p) return;
            if (!armed('undo:' + id, btn, 'Bấm lần nữa')) return;
            db.collection('payouts').doc(id).delete().then(function () { toast('Đã hoàn tác — giải quay lại danh sách Chờ trả.', 'info'); log('undo', { user: p.user, amount: p.amount, id: id, was: p.status }); if (p.col === 'point_cashout' && p.status === 'rejected') return cashoutPoints(p.user, p.histId, -1); })
                .catch(function () { toast('Không hoàn tác được.', 'error'); });
        };

        /* ---------- Mã VietQR ---------- */
        PA.qr = function (key) {
            var x = unitOf(key); if (!x || !x.bank) return; var u = x.user;
            var ref = refOf(x), b = x.bank, url = qrUrl(b, x.total, ref);
            var kv = function (k, v, copy) { return '<div class="po-kv"><span>' + k + '</span><b>' + esc(v) + '</b>' + (copy ? '<button type="button" data-copy="' + esc(v) + '">Chép</button>' : '') + '</div>'; };
            $('po-qr-body').innerHTML = '<h3>Chuyển thưởng cho ' + esc(u) + '</h3><div class="sub">' + (x.single ? '1 giải (chuyển riêng): ' + SRCN[x.wins[0].col] + ' · ' : x.wins.length + ' giải: ') + esc(x.wins.map(function (w) { return w.prize; }).join(', ')) + '</div>'
                + '<div class="po-qr-img"><img alt="Mã VietQR chuyển ' + esc(vnd(x.total)) + '" src="' + esc(url) + '" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'po-empty\',textContent:\'Không tải được ảnh QR (cần mạng). Chuyển tay theo thông tin bên dưới.\'}))"></div>'
                + kv('Ngân hàng', bankOf(b)) + kv('Số tài khoản', b.accNo, 1) + kv('Chủ tài khoản', b.accName || '', 1) + kv('Số tiền', String(x.total), 1) + kv('Nội dung', ref, 1)
                + flagsHtml(x.flags)
                + '<div class="po-qr-foot"><button type="button" class="btn btn-outline" onclick="UI.closeModal(\'modal-payout-qr\')">Đóng</button>'
                + '<button type="button" class="btn btn-primary" id="po-qr-done"><i class="fa-solid fa-check mr-2"></i>Đã chuyển xong</button></div>';
            $('po-qr-done').onclick = function () { PA.mark(key, this, 'qr'); };
            UI.openModal('modal-payout-qr');
        };
        document.addEventListener('click', function (e) {
            var b = e.target && e.target.closest ? e.target.closest('#po-qr-body [data-copy]') : null; if (!b) return;
            var v = b.getAttribute('data-copy'), ok = function () { b.textContent = 'Đã chép'; setTimeout(function () { b.textContent = 'Chép'; }, 1500); };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(ok, function () {}); else { var t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (er) {} t.remove(); }
        });

        /* ---------- File chuyển theo lô (Internet Banking doanh nghiệp) ---------- */
        PA.exportBatch = function (fmtx) {
            var gs = units().filter(function (x) { return PA.sel[x.key] && x.bank; });
            if (!gs.length) { toast('Chưa chọn giải nào (chỉ chọn được người đã khai STK, không có cảnh báo nặng).', 'warning'); return; }
            var head = ['STT', 'Số tài khoản', 'Tên người thụ hưởng', 'Ngân hàng', 'Mã ngân hàng (BIN)', 'Số tiền', 'Nội dung', 'Tài khoản web', 'Giải thưởng'];
            var rows = gs.map(function (x, i) { return [i + 1, x.bank.accNo, x.bank.accName || '', bankOf(x.bank), x.bank.bin, x.total, refOf(x), x.user, x.single ? x.wins[0].prize : x.wins.length + ' giải']; });
            var sum = gs.reduce(function (a, x) { return a + x.total; }, 0), d = new Date(), stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes());
            var blob;
            if (fmtx !== 'csv' && window.QDXlsx) {
                // .xlsx thật: dòng 1 là tiêu đề cột (để tải lên Internet Banking), số TK / mã ngân hàng giữ dạng chữ, có dòng TỔNG
                QDXlsx.download('Chuyen_thuong_theo_lo_' + stamp, { color: '#0f766e', minCols: 1, sheets: [{ name: 'Chuyển theo lô', noTitle: true, blocks: [{
                    type: 'table', main: true,
                    cols: [{ h: head[0], t: 'c' }, { h: head[1], t: 't' }, { h: head[2], t: 't' }, { h: head[3], t: 't' }, { h: head[4], t: 't' }, { h: head[5], t: 'n' }, { h: head[6], t: 't' }, { h: head[7], t: 't' }, { h: head[8], t: 't' }],
                    rows: rows, total: ['', 'TỔNG ' + gs.length + (PA.mode === 'split' ? ' lệnh chuyển' : ' người'), '', '', '', sum, '', '', '']
                }] }] });
            } else if (fmtx === 'csv') {
                var q = function (v) { v = String(v == null ? '' : v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
                blob = new Blob(['\ufeff' + [head].concat(rows).map(function (r) { return r.map(q).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
            } else {
                var td = function (v, txt) { return '<td' + (txt ? ' style="mso-number-format:\'\\@\'"' : '') + '>' + esc(v) + '</td>'; };
                var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">'
                    + '<tr>' + head.map(function (h) { return '<th style="background:#0f766e;color:#fff">' + esc(h) + '</th>'; }).join('') + '</tr>'
                    + rows.map(function (r) { return '<tr>' + td(r[0]) + td(r[1], 1) + td(r[2], 1) + td(r[3], 1) + td(r[4], 1) + td(r[5]) + td(r[6], 1) + td(r[7], 1) + td(r[8], 1) + '</tr>'; }).join('')
                    + '<tr><td></td><td colspan="4"><b>TỔNG ' + gs.length + (PA.mode === 'split' ? ' lệnh chuyển' : ' người') + '</b></td><td><b>' + sum + '</b></td><td colspan="3"></td></tr></table></body></html>';
                blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
            }
            if (blob) {
                var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Chuyen_thuong_theo_lo_' + stamp + (fmtx === 'csv' ? '.csv' : '.xls');
                document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
            }
            var ks = {}; gs.forEach(function (x) { ks[x.key] = 1; }); PA.lastExport = { at: Date.now(), keys: ks };
            log('export', { user: '(' + gs.length + ' người)', amount: sum, count: gs.length, format: fmtx });
            toast('Đã xuất ' + gs.length + (PA.mode === 'split' ? ' giải' : ' người') + ' · ' + vnd(sum) + '. Tải file lên Internet Banking (chuyển theo lô / chi lương), chuyển xong bấm <b>Đánh dấu đã chuyển</b>.', 'info');
        };

        /* ---------- Cấu hình ---------- */
        function renderCfg() {
            var t = $('po-on'), s = $('po-on-st'), pf = $('po-prefix');
            if (t) t.checked = PA.cfg.on; if (s) { s.textContent = PA.cfg.on ? 'ĐANG BẬT' : 'ĐANG TẮT'; s.style.color = PA.cfg.on ? 'var(--color-success)' : 'var(--text-muted)'; }
            if (pf && document.activeElement !== pf) pf.value = PA.cfg.prefix;
            var tp = $('po-tpl'); if (tp && document.activeElement !== tp) tp.value = PA.cfg.tpl;
            refChips(); refRefreshSug(); PA.refPreview();
        }
        PA.toggle = function (el) {
            REF.set({ isEnabled: !!el.checked, updatedAt: Date.now() }, { merge: true }).then(function () { toast(el.checked ? 'Đã BẬT thu thập tài khoản nhận thưởng.' : 'Đã TẮT — thành viên không thấy mục tài khoản nhận thưởng.'); log(el.checked ? 'enable' : 'disable', { user: '(hệ thống)' }); })
                .catch(function () { el.checked = !el.checked; toast('Không lưu được.', 'error'); });
        };
        PA.savePrefix = function () {
            var v = fold(($('po-prefix') || {}).value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'QDTLH';
            var tpl = String(($('po-tpl') || {}).value || '').trim().replace(/\s+/g, ' ').slice(0, 60) || DEF_TPL;
            var ex = refBuild(tpl, v, sample());
            if (!ex) { toast('Mẫu nội dung đang trống.', 'warning'); return; }
            if (badTpl(tpl, v)) { toast('Mẫu có từ dễ bị ngân hàng giữ lệnh — hãy đổi mẫu khác.', 'warning'); return; }
            REF.set({ prefix: v, tpl: tpl, updatedAt: Date.now() }, { merge: true }).then(function () { toast('Đã lưu nội dung chuyển khoản. Ví dụ: <b>' + esc(ex) + '</b>'); log('ref_template', { user: '(hệ thống)', tpl: tpl, prefix: v }); }).catch(function () { toast('Không lưu được.', 'error'); });
        };

        var rt = null; function later() { clearTimeout(rt); rt = setTimeout(function () { PA.render(); refRefreshSug(); if (document.activeElement !== $('po-tpl')) PA.refPreview(); }, 120); }
        PA.start = function () {
            if (PA.started) return; PA.started = true;
            REF.onSnapshot(function (d) { var c = d.exists ? d.data() : {}; PA.cfg = { on: c.isEnabled !== false, prefix: c.prefix || 'QDTLH', tpl: c.tpl || (c.prefix ? '{MA} {USER}' : DEF_TPL) }; renderCfg(); later(); }, function () {});
            /* Quay Số: 1 phiên có thể nhiều người trúng -> mỗi người 1 khoản (mã = {phiên}_{tài khoản}), chỉ khoản có tiền mặt */
            db.collection('lucky_rewards').onSnapshot(function (snap) {
                var out = [];
                snap.docs.forEach(function (d) {
                    var r = d.data() || {}, LRw = window.LuckyReward;
                    [[r.winners || [], r.each, false], [r.near || [], r.eachNear, true]].forEach(function (g) {
                        if (!g[1] || !(g[1].cash > 0)) return;
                        g[0].forEach(function (u) { out.push({ id: d.id + '_' + u, user: u, prize: LRw ? LRw.prize(g[1], r.number, g[2]) : (Number(g[1].cash).toLocaleString('vi-VN') + ' VNĐ · Quay Số (số ' + r.number + ')'), ts: r.at || r.wonAt }); });
                    });
                });
                PA.wins.lucky_rewards = out; PA.got.lucky_rewards = true; later();
            }, function (e) { console.warn('lucky_rewards', e); PA.got.lucky_rewards = true; later(); });
            /* Giải Đấu (bản 24): người đạt giải có tiền mặt, tính từ sơ đồ + settings/tournament_prize */
            if (window.QDTourPrize) QDTourPrize.watch(function (st) {
                PA.wins.tournament_prize = st.awards.filter(function (a) { return a.cash > 0; }).map(function (a) { return { id: a.id, user: a.user, prize: a.prize, ts: a.ts }; });
                PA.got.tournament_prize = true; later();
            });
            else PA.got.tournament_prize = true;
            setTimeout(function () { if (!PA.got.tournament_prize) { PA.got.tournament_prize = true; later(); } }, 8000);   // không đọc được cấu hình -> vẫn hiện các nguồn khác
            SRCS.forEach(function (s) {
                if (s.col === 'lucky_rewards' || s.col === 'tournament_prize') return;
                db.collection(s.col).onSnapshot(function (snap) {
                    PA.wins[s.col] = snap.docs.map(function (d) { var x = d.data(); return { id: d.id, user: x.userId || x.user, prize: x.result, ts: x.timestamp }; });
                    PA.got[s.col] = true; later();
                }, function (e) { console.warn(s.col, e); PA.got[s.col] = true; later(); });
            });
            db.collection('payouts').onSnapshot(function (snap) { PA.pays = {}; snap.docs.forEach(function (d) { PA.pays[d.id] = d.data(); }); later(); }, function (e) { console.warn('payouts', e); });
            db.collection('bank_info').onSnapshot(function (snap) { PA.banks = {}; snap.docs.forEach(function (d) { var b = d.data(); PA.banks[b.user || d.id] = b; }); later(); }, function (e) { console.warn('bank_info', e); });
            db.collection('accounts').onSnapshot(function (snap) { PA.accs = {}; snap.docs.forEach(function (d) { var a = d.data(); if (a && a.user) { a.__id = d.id; PA.accs[a.user] = a; } }); later(); }, function () {});
            renderCfg();
            reportSources();
        };

        /* ---------- Nguồn cho hộp "Xuất Báo Cáo" (Excel / CSV / In PDF, lọc theo ngày + tên) ---------- */
        function reportSources() {
            if (!window.QDReport || !QDReport.add || PA.repAdded) return; PA.repAdded = true;
            var fmt = function (n) { return Number(n || 0).toLocaleString('vi-VN'); };
            var fDT = function (t) { if (!t) return ''; var x = new Date(t); return p2(x.getHours()) + ':' + p2(x.getMinutes()) + ' ' + p2(x.getDate()) + '/' + p2(x.getMonth() + 1) + '/' + x.getFullYear(); };
            var M = { qr: 'Quét VietQR', batch: 'Chuyển theo lô', manual: 'Đánh dấu tay' };
            var full = function (u) { return (PA.accs[u] || {}).fullName || ''; };
            var paid = function (r) { return r.filter(function (x) { return x.status === 'paid'; }); };
            QDReport.add({ id: 'payout', view: 'payout', name: 'Chuyển Tiền Thưởng', icon: 'fa-money-bill-transfer', color: '#059669', file: 'Chuyen_Tien_Thuong', col: 'payouts',
                load: function () { return Promise.resolve(Object.keys(PA.pays).map(function (k) { var p = PA.pays[k], o = {}; for (var f in p) o[f] = p[f]; o.__id = k; return o; }).sort(function (a, b) { return (b.paidAt || 0) - (a.paidAt || 0); })); },
                time: function (x) { return x.paidAt; }, who: function (x) { return x.user; },
                cols: [['Thời gian xử lý', function (x) { return fDT(x.paidAt); }], ['Tài khoản', function (x) { return x.user; }], ['Họ tên', function (x) { return full(x.user); }],
                    ['Giải thưởng', function (x) { return x.prize; }], ['Nguồn', function (x) { return (SRCN[x.col] || '').replace(/^\S+\s/, ''); }], ['Trúng lúc', function (x) { return fDT(x.wonAt); }],
                    ['Số tiền', function (x) { return x.status === 'paid' ? (+x.amount || 0) : 0; }, 'n'], ['Trạng thái', function (x) { return x.status === 'paid' ? 'Đã chuyển' : 'Không trả'; }],
                    ['Ngân hàng', function (x) { return x.bank ? bankOf(x.bank) : ''; }], ['Số tài khoản', function (x) { return x.bank ? x.bank.accNo : ''; }, 't'], ['Chủ tài khoản', function (x) { return x.bank ? x.bank.accName : ''; }],
                    ['Cách chuyển', function (x) { return x.status === 'paid' ? (M[x.method] || x.method || '') : ''; }], ['Nội dung CK', function (x) { return x.ref || ''; }], ['Người thực hiện', function (x) { return x.by || ''; }],
                    ['Mã lô', function (x) { return x.batch || ''; }, 't'], ['Ghi chú', function (x) { return x.note || ''; }]],
                kpi: function (r) {
                    var pd = paid(r), s = pd.reduce(function (a, x) { return a + (+x.amount || 0); }, 0), us = {}; pd.forEach(function (x) { us[x.user] = 1; });
                    return [['Đã chuyển', fmt(s) + 'đ', pd.length + ' giải · ' + Object.keys(us).length + ' người'], ['Không trả', fmt(r.length - pd.length), 'giải bị từ chối']];
                },
                brk: ['Theo cách chuyển', function (x) { return x.status === 'paid' ? (M[x.method] || 'Khác') : 'Không trả'; }, function (x) { return x.status === 'paid' ? (+x.amount || 0) : 0; }],
                rank: ['Nhận nhiều tiền nhất', 'đ', function (x) { return x.status === 'paid' ? (+x.amount || 0) : 0; }] });
            QDReport.add({ id: 'payoutwait', view: 'payout', name: 'Giải Tiền Chờ Trả', icon: 'fa-hourglass-half', color: '#d97706', file: 'Giai_Cho_Tra', col: 'spin_history + tranhthuong_history',
                load: function () { return Promise.resolve(pending().slice().reverse()); }, time: function (x) { return x.wonAt; }, who: function (x) { return x.user; },
                cols: [['Trúng lúc', function (x) { return fDT(x.wonAt); }], ['Tài khoản', function (x) { return x.user; }], ['Họ tên', function (x) { return full(x.user); }], ['Giải thưởng', function (x) { return x.prize; }],
                    ['Nguồn', function (x) { return SRCN[x.col].replace(/^\S+\s/, ''); }], ['Số tiền', function (x) { return x.amount; }, 'n'],
                    ['Ngân hàng', function (x) { var b = PA.banks[x.user]; return b && b.accNo ? bankOf(b) : 'Chưa khai'; }], ['Số tài khoản', function (x) { var b = PA.banks[x.user]; return b && b.accNo ? b.accNo : ''; }, 't'],
                    ['Chủ tài khoản', function (x) { var b = PA.banks[x.user]; return b ? b.accName || '' : ''; }], ['Nội dung CK', function (x) { return refOf(x.user); }]],
                kpi: function (r) { var s = r.reduce(function (a, x) { return a + x.amount; }, 0), nob = {}; r.forEach(function (x) { if (!(PA.banks[x.user] || {}).accNo) nob[x.user] = 1; }); return [['Cần trả', fmt(s) + 'đ', r.length + ' giải'], ['Chưa khai STK', fmt(Object.keys(nob).length), 'người']]; },
                brk: ['Theo giải', function (x) { return x.prize; }, function (x) { return x.amount; }], rank: ['Chờ nhận nhiều nhất', 'đ', function (x) { return x.amount; }] });
        }
    })();
    
