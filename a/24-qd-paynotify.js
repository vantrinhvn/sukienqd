    /* ===== TRẢ THƯỞNG: BOT BÁO "ĐÃ CHUYỂN TIỀN THƯỞNG" =====
       settings/payout_notify: { on, sender ('@me' = tài khoản đang bấm "Đã chuyển" | tên tài khoản BQT), tpl, updatedAt, updatedBy }
       Gọi từ PayoutAdmin (hàm ghi "đã chuyển") sau khi lưu thành công: QDPayNotify.send(danh sách, { method, paidAt, by, batch })
       Mỗi người nhận 1 tin riêng (gộp mọi giải vừa chuyển của người đó) trong private_chat, from = tài khoản BQT, auto: 'payout'. */
    window.PayNotify = window.QDPayNotify = (function () {
        'use strict';
        var $ = function (id) { return document.getElementById(id); }, VN = 7 * 3600e3;
        var DEF_TPL = '🎉 Chúc mừng {HOTEN}!\nBan Quản Trị đã chuyển tiền thưởng cho bạn:\n💵 Số tiền: {TIEN}\n🏆 Giải thưởng:\n{DSGIAI}\n🏦 Tài khoản nhận: {NGANHANG} · {STK} · {CHUTK}\n📝 Nội dung chuyển khoản: {NOIDUNG}\n🕘 Thời gian: {GIO} {NGAY}\nBạn kiểm tra tài khoản ngân hàng giúp BQT nhé. Có sai sót gì nhắn lại ngay tại đây! 🧧';
        var VARS = [['{HOTEN}', 'Họ tên (không có thì tên đăng nhập)'], ['{USER}', 'Tên đăng nhập'], ['{TIEN}', 'Tổng tiền'], ['{SOGIAI}', 'Số giải'], ['{DSGIAI}', 'Danh sách giải (mỗi giải 1 dòng)'],
            ['{GIAI}', 'Tên giải (gộp 1 dòng)'], ['{NGANHANG}', 'Ngân hàng'], ['{STK}', 'Số TK (che, 4 số cuối)'], ['{CHUTK}', 'Chủ tài khoản'], ['{NOIDUNG}', 'Nội dung chuyển khoản'],
            ['{CACH}', 'Cách chuyển'], ['{GIO}', 'Giờ chuyển'], ['{NGAY}', 'Ngày chuyển'], ['{NGUOICHUYEN}', 'Người bấm Đã chuyển']];
        var SRC = { spin_history: '🎡 Vòng Quay', tranhthuong_history: '🧧 Rút Lì Xì', lucky_rewards: '🎯 Quay Số', tournament_prize: '🏆 Giải Đấu' };
        var METHOD = { qr: 'Quét mã VietQR', batch: 'Chuyển theo lô', manual: 'Chuyển tay' };
        var CFG = { on: true, sender: '@me', tpl: DEF_TPL }, STAFF = [], staffLoaded = false, LOADED = false, started = false, isDirty = false;
        function me() { try { return (typeof State !== 'undefined' && State.currentUser) || 'admin'; } catch (e) { return 'admin'; } }
        function toast(m, k) { try { Utils.toast(m, k); } catch (e) {} }
        function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        function vnd(n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; }
        function hm(t) { var d = new Date(t + VN); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
        function dmy(t) { var d = new Date(t + VN); return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); }
        function dm(t) { var d = new Date(t + VN); return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1); }
        function mask(no) { no = String(no || '').replace(/\s+/g, ''); return no ? (no.length > 4 ? '••••' + no.slice(-4) : no) : '(chưa khai)'; }
        function room(a, b) { return [a, b].sort().join('_'); }

        /* ---------- Soạn nội dung ---------- */
        function compose(tpl, x, meta, acc) {
            var wins = x.wins || [];
            var v = {
                HOTEN: (acc && (acc.fullName || acc.name)) || x.user, USER: x.user, TIEN: vnd(x.total), SOGIAI: wins.length,
                DSGIAI: wins.map(function (w) { return '• ' + (SRC[w.col] || 'Giải') + ': ' + (w.prize || '') + (w.amount && !/\d/.test(w.prize || '') ? ' — ' + vnd(w.amount) : '') + (w.wonAt ? ' (trúng ' + dm(w.wonAt) + ')' : ''); }).join('\n'),
                GIAI: wins.map(function (w) { return w.prize || ''; }).join(', '),
                NGANHANG: (x.bank && x.bank.bank) || '(chưa khai)', STK: mask(x.bank && x.bank.accNo), CHUTK: (x.bank && x.bank.accName) || '',
                NOIDUNG: x.ref || '', CACH: METHOD[meta.method] || meta.method || '', GIO: hm(meta.paidAt), NGAY: dmy(meta.paidAt), NGUOICHUYEN: meta.by || ''
            };
            return String(tpl || DEF_TPL).replace(/\{([A-Z]+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }).slice(0, 3000);
        }
        function senderFor(meta) {
            var s = CFG.sender || '@me';
            if (s === '@me') return meta.by || me();
            return !staffLoaded || STAFF.some(function (a) { return a.u === s; }) ? s : (meta.by || me());   // tài khoản đã chọn không còn là BQT -> dùng người bấm
        }

        /* ---------- Gửi sau khi ghi "Đã chuyển" ---------- */
        async function send(list, meta) {
            if (!LOADED) { try { var cs = await db.collection('settings').doc('payout_notify').get(), cd = cs.exists ? cs.data() : {}; CFG.on = cd.on !== false; CFG.sender = cd.sender || '@me'; CFG.tpl = cd.tpl || DEF_TPL; } catch (e) {} }
            if (!CFG.on || !list || !list.length) return;
            meta = meta || {}; meta.paidAt = meta.paidAt || Date.now(); meta.by = meta.by || me();
            var by = {};   // gộp theo người nhận
            list.forEach(function (x) {
                var g = by[x.user] = by[x.user] || { user: x.user, total: 0, wins: [], bank: x.bank, ref: x.ref };
                g.total += +x.total || 0; g.wins = g.wins.concat(x.wins || []); if (!g.bank && x.bank) g.bank = x.bank; if (!g.ref && x.ref) g.ref = x.ref;
            });
            var users = Object.keys(by), from = senderFor(meta), accs = {};
            try {
                for (var i = 0; i < users.length; i += 10) {   // đọc họ tên (truy vấn "in" tối đa 10 tên / lần)
                    var q = await db.collection('accounts').where('user', 'in', users.slice(i, i + 10)).get();
                    q.forEach(function (d) { var a = d.data() || {}; accs[a.user] = a; });
                }
            } catch (e) {}
            var ops = users.filter(function (u) { return u !== from; }).map(function (u) {
                var x = by[u], t = Date.now();
                return [db.collection('private_chat').doc(), { conversationId: room(from, u), from: from, to: u, text: compose(CFG.tpl, x, meta, accs[u]), imageUrl: null, time: t, read: false, heart: false, hearts: [], readBy: [],
                    auto: 'payout', autoBy: meta.by, payoutBatch: meta.batch || '', amount: x.total }];
            });
            if (!ops.length) return;
            try {
                for (var j = 0; j < ops.length; j += 400) { var b = db.batch(); ops.slice(j, j + 400).forEach(function (o) { b.set(o[0], o[1]); }); await b.commit(); }
                db.collection('admin_logs').add({ type: 'payout', action: 'notify', user: ops.length === 1 ? ops[0][1].to : '(' + ops.length + ' người)', users: ops.map(function (o) { return o[1].to; }).slice(0, 200), from: from, by: meta.by, batch: meta.batch || '', timestamp: Date.now() }).catch(function () {});
                db.collection('settings').doc('payout_notify').set({ lastAt: Date.now(), lastCount: ops.length, lastBy: meta.by }, { merge: true }).catch(function () {});
                toast('🤖 Bot đã nhắn báo chuyển tiền cho ' + (ops.length === 1 ? '<b>' + esc(ops[0][1].to) + '</b>' : ops.length + ' người') + ' (từ tài khoản <b>' + esc(from) + '</b>).', 'info');
            } catch (e) { console.warn('[Bot báo chuyển tiền]', e); toast('Đã ghi nhận chuyển tiền, nhưng bot chưa nhắn được tin báo (không đủ quyền hoặc mất kết nối máy chủ).', 'warning'); }
        }

        /* ---------- Giao diện thiết lập ---------- */
        function fill() {
            $('pn-on').checked = CFG.on; $('pn-on-st').textContent = CFG.on ? 'ĐANG BẬT' : 'ĐANG TẮT'; $('pn-on-st').style.color = CFG.on ? 'var(--color-success)' : 'var(--text-muted)';
            $('pn-card').classList.toggle('off', !CFG.on);
            if (!isDirty) { $('pn-tpl').value = CFG.tpl || DEF_TPL; opts(); }
            $('pn-last').textContent = CFG.lastAt ? 'Lần gửi gần nhất: ' + hm(CFG.lastAt) + ' ' + dmy(CFG.lastAt) + ' · ' + CFG.lastCount + ' người · bởi ' + (CFG.lastBy || '?') : 'Chưa gửi tin báo nào.';
            preview();
        }
        function opts() {
            var sel = $('pn-sender'), cur = isDirty ? sel.value : (CFG.sender || '@me');
            sel.innerHTML = '<option value="@me">Tài khoản đang bấm "Đã chuyển"</option>' + STAFF.map(function (a) { return '<option value="' + esc(a.u) + '">' + esc(a.u) + (a.name ? ' — ' + esc(a.name) : '') + (a.role === 'admin' ? ' (Quản trị viên)' : ' (Quản lý)') + '</option>'; }).join('');
            if (cur !== '@me' && !STAFF.some(function (a) { return a.u === cur; })) sel.insertAdjacentHTML('beforeend', '<option value="' + esc(cur) + '">' + esc(cur) + ' (không còn là BQT → dùng người bấm)</option>');
            sel.value = cur;
        }
        function preview() {
            var from = $('pn-sender').value === '@me' ? me() : $('pn-sender').value, t = Date.now();
            $('pn-from').textContent = from; $('pn-avt').textContent = String(from || '?').charAt(0).toUpperCase();
            var sample = { user: 'binh', total: 70000, ref: 'QDTLH BINH THUONG TET', bank: { bank: 'Vietcombank', accNo: '0123456789', accName: 'NGUYEN VAN BINH' },
                wins: [{ col: 'spin_history', prize: '50.000 VNĐ', amount: 50000, wonAt: t - 864e5 }, { col: 'tranhthuong_history', prize: 'Lì xì 20K', amount: 20000, wonAt: t - 3600e3 }] };
            $('pn-pv').innerHTML = esc(compose($('pn-tpl').value, sample, { method: 'qr', paidAt: t, by: me() }, { fullName: 'Nguyễn Văn Bình' })).replace(/\n/g, '<br>');
        }
        function dirty() { isDirty = true; $('pn-dirty').style.display = ''; preview(); }
        async function save() {
            var tpl = $('pn-tpl').value.trim(); if (!tpl) return toast('Nội dung tin nhắn không được để trống.', 'warning');
            var b = $('pn-save'); b.disabled = true;
            try {
                await db.collection('settings').doc('payout_notify').set({ sender: $('pn-sender').value, tpl: tpl, updatedAt: Date.now(), updatedBy: me() }, { merge: true });
                isDirty = false; $('pn-dirty').style.display = 'none'; toast('Đã lưu tin báo chuyển tiền.', 'success');
                db.collection('admin_logs').add({ type: 'payout', action: 'notify_cfg', user: '(bot báo chuyển tiền)', by: me(), timestamp: Date.now() }).catch(function () {});
            } catch (e) { toast('Lưu không được: ' + (e.message || e.code), 'error'); }
            finally { b.disabled = false; }
        }
        async function toggle(el) {
            var on = el.checked; el.disabled = true;
            try {
                var p = { on: on, updatedAt: Date.now(), updatedBy: me() };
                if (on && isDirty) { p.sender = $('pn-sender').value; p.tpl = $('pn-tpl').value.trim() || DEF_TPL; }
                await db.collection('settings').doc('payout_notify').set(p, { merge: true });
                if (on && isDirty) { isDirty = false; $('pn-dirty').style.display = 'none'; }
                toast(on ? '🤖 Đã BẬT: bấm "Đã chuyển" là bot nhắn báo cho người nhận.' : 'Đã TẮT bot báo chuyển tiền.', on ? 'success' : 'info');
                db.collection('admin_logs').add({ type: 'payout', action: on ? 'notify_on' : 'notify_off', user: '(bot báo chuyển tiền)', by: me(), timestamp: Date.now() }).catch(function () {});
            } catch (e) { el.checked = !on; toast('Không đổi được: ' + (e.message || e.code), 'error'); }
            finally { el.disabled = false; }
        }
        function reset() { $('pn-tpl').value = DEF_TPL; dirty(); }

        function start() {
            if (started || !$('pn-card')) return; started = true;
            $('pn-vars').innerHTML = VARS.map(function (v) { return '<button type="button" title="' + esc(v[1]) + '" data-v="' + v[0] + '">' + v[0] + '</button>'; }).join('');
            $('pn-vars').addEventListener('click', function (e) {
                var b = e.target.closest('button'); if (!b) return;
                var el = $('pn-tpl'), s = el.selectionStart == null ? el.value.length : el.selectionStart, en = el.selectionEnd == null ? s : el.selectionEnd, v = b.getAttribute('data-v');
                el.value = el.value.slice(0, s) + v + el.value.slice(en); el.focus(); try { el.setSelectionRange(s + v.length, s + v.length); } catch (er) {} dirty();
            });
            db.collection('settings').doc('payout_notify').onSnapshot(function (s) {
                var d = s.exists ? s.data() : {};
                LOADED = true; CFG = { on: d.on !== false, sender: d.sender || '@me', tpl: d.tpl || DEF_TPL, lastAt: d.lastAt || 0, lastCount: d.lastCount || 0, lastBy: d.lastBy || '' }; fill();
            }, function () { fill(); });
            db.collection('accounts').where('role', 'in', ['admin', 'manager']).onSnapshot(function (s) {
                STAFF = s.docs.map(function (d) { var a = d.data() || {}; return { u: a.user, name: a.fullName || a.name || '', role: a.role }; }).filter(function (a) { return a.u && !a.blocked; }).sort(function (a, b) { return a.role === b.role ? a.u.localeCompare(b.u) : a.role === 'admin' ? -1 : 1; });
                staffLoaded = true; opts(); preview();
            }, function () {});
        }
        var w = setInterval(function () { var sh = $('app-shell'); try { if (State.currentUser && sh && sh.style.display === 'flex') { clearInterval(w); start(); } } catch (e) {} }, 1000);

        return { send: send, toggle: toggle, save: save, reset: reset, dirty: dirty, compose: compose, cfg: function () { return CFG; } };
    })();
    
