    /* ===== ĐỔI ĐIỂM LÌ XÌ RA TIỀN (admin) =====
       settings/point_cashout : { isEnabled, per1000, tiers[], dailyLimit, updatedAt, by }   (per1000 = điểm cho 1.000đ; mặc định 1000 -> 10.000 điểm = 10.000đ)
       point_cashout/{mã}     : yêu cầu của thành viên { user, points, amount, result, timestamp, status, bank{}, refunded }
       Trả tiền: Admin > Trả Thưởng (nguồn 💱 Đổi Điểm) — "Không trả" tự hoàn điểm. Báo cáo: QDReport 'cashout'. */
    window.CashoutAdmin = (function () {
        var $ = function (id) { return document.getElementById(id); };
        var fmt = function (n) { return Number(n || 0).toLocaleString('vi-VN'); };
        var vnd = function (n) { return fmt(n) + 'đ'; };
        var p2 = function (x) { return String(x).padStart(2, '0'); };
        var toast = function (m, t) { try { Utils.toast(m, t || 'success'); } catch (e) {} };
        var me = function () { return (typeof State !== 'undefined' && State.currentUser) || 'admin'; };
        var DEF = { on: true, per1000: 1000, tiers: [10000, 20000, 50000, 100000], daily: 0 };
        var C = { cfg: DEF, list: [], started: false, ref: null };
        function norm(c) {
            c = c || {};
            var tiers = (Array.isArray(c.tiers) ? c.tiers : DEF.tiers).map(function (x) { return Math.round(+x); }).filter(function (x) { return x >= 1000; }).sort(function (a, b) { return a - b; });
            return { on: c.isEnabled !== false, per1000: Math.max(1, Math.round(+c.per1000 || DEF.per1000)), tiers: tiers.length ? tiers : DEF.tiers.slice(), daily: Math.max(0, Math.round(+c.dailyLimit || 0)), at: c.updatedAt || 0, by: c.by || '' };
        }
        function parseTiers(v) {
            var out = []; String(v || '').split(/[,;\s]+/).forEach(function (t) { if (!t) return; var k = /k$/i.test(t); var n = Math.round(parseFloat(t.replace(/[^\d.]/g, '').replace(/\.(?=\d{3}\b)/g, '')) * (k ? 1000 : 1)); if (n >= 1000 && out.indexOf(n) < 0) out.push(n); });
            return out.sort(function (a, b) { return a - b; });
        }
        function pay(id) { var P = window.PayoutAdmin; return P && P.pays ? P.pays['point_cashout_' + id] : null; }
        function st(x) { var p = pay(x.id); return p ? p.status : (x.refunded ? 'rejected' : 'pending'); }
        function paint() {
            var c = C.cfg, t = $('pc-on'), s = $('pc-on-st');
            if (t) t.checked = c.on; if (s) { s.textContent = c.on ? 'ĐANG BẬT' : 'ĐANG TẮT'; s.style.color = c.on ? 'var(--color-success)' : 'var(--text-muted)'; }
            var r = $('pc-rate'), d = $('pc-daily'), tr = $('pc-tiers');
            if (r && document.activeElement !== r) r.value = c.per1000 * 10;
            if (d && document.activeElement !== d) d.value = c.daily || 0;
            if (tr && document.activeElement !== tr) tr.value = c.tiers.join(', ');
            preview(); stats();
        }
        function preview() {
            var pv = $('pc-pv'); if (!pv) return;
            var per10k = Math.round(+($('pc-rate') || {}).value || 0), tiers = parseTiers(($('pc-tiers') || {}).value), daily = Math.max(0, Math.round(+($('pc-daily') || {}).value || 0));
            if (!(per10k > 0)) { pv.innerHTML = '<span class="bad">Tỷ lệ phải lớn hơn 0</span>'; return; }
            if (!tiers.length) { pv.innerHTML = '<span class="bad">Cần ít nhất 1 mốc (≥ 1.000đ)</span>'; return; }
            pv.innerHTML = tiers.map(function (a) { return '<span>' + vnd(a) + ' = ' + fmt(Math.round(a * per10k / 10000)) + ' điểm</span>'; }).join('') + (daily ? '<span>Tối đa ' + vnd(daily) + '/người/ngày</span>' : '<span>Không giới hạn mỗi ngày</span>');
        }
        function stats() {
            var el = $('pc-stats'); if (!el) return;
            var w = 0, wn = 0, pd = 0, pn = 0, rj = 0, pts = 0;
            C.list.forEach(function (x) { var s = st(x); if (s === 'paid') { pd += x.amount || 0; pn++; pts += x.points || 0; } else if (s === 'rejected') rj++; else { w += x.amount || 0; wn++; pts += x.points || 0; } });
            el.innerHTML = '<span>Chờ trả: <b>' + vnd(w) + '</b> (' + wn + ' yêu cầu)</span><span>Đã trả: <b>' + vnd(pd) + '</b> (' + pn + ')</span><span>Không duyệt: <b>' + rj + '</b></span><span>Điểm đã quy đổi: <b>' + fmt(pts) + '</b></span>';
        }
        function toggle(el) {
            C.ref.set({ isEnabled: !!el.checked, updatedAt: Date.now(), by: me() }, { merge: true })
                .then(function () { toast(el.checked ? 'Đã BẬT đổi điểm lì xì ra tiền.' : 'Đã TẮT đổi điểm ra tiền — thành viên không đổi được nữa.', el.checked ? 'success' : 'info'); })
                .catch(function () { el.checked = !el.checked; toast('Không lưu được.', 'error'); });
        }
        function save() {
            var per10k = Math.round(+($('pc-rate') || {}).value || 0), tiers = parseTiers(($('pc-tiers') || {}).value), daily = Math.max(0, Math.round(+($('pc-daily') || {}).value || 0));
            if (!(per10k > 0) || !tiers.length) { toast('Kiểm tra lại tỷ lệ và các mốc đổi.', 'warning'); return; }
            if (tiers.length > 8) { toast('Tối đa 8 mốc.', 'warning'); return; }
            C.ref.set({ per1000: per10k / 10, tiers: tiers, dailyLimit: daily, updatedAt: Date.now(), by: me() }, { merge: true })
                .then(function () { toast('Đã lưu: ' + fmt(per10k) + ' điểm = 10.000đ · mốc ' + tiers.map(vnd).join(', ') + '.'); })
                .catch(function () { toast('Không lưu được.', 'error'); });
        }
        function report() {
            if (!window.QDReport || !QDReport.add || C.rep) return; C.rep = true;
            var fDT = function (t) { if (!t) return ''; var x = new Date(t); return p2(x.getHours()) + ':' + p2(x.getMinutes()) + ' ' + p2(x.getDate()) + '/' + p2(x.getMonth() + 1) + '/' + x.getFullYear(); };
            var full = function (u) { var P = window.PayoutAdmin; return P && P.accs && P.accs[u] ? P.accs[u].fullName || '' : ''; };
            var STN = { paid: 'Đã chuyển', rejected: 'Không duyệt (đã hoàn điểm)', pending: 'Chờ chuyển' };
            QDReport.add({ id: 'cashout', view: 'payout', name: 'Đổi Điểm Lì Xì Ra Tiền', icon: 'fa-coins', color: '#d97706', file: 'Doi_Diem_Ra_Tien', col: 'point_cashout',
                load: function () { return Promise.resolve(C.list.slice()); },
                time: function (x) { return x.timestamp; }, who: function (x) { return x.user; },
                cols: [['Thời gian đổi', function (x) { return fDT(x.timestamp); }], ['Tài khoản', function (x) { return x.user; }], ['Họ tên', function (x) { return full(x.user); }],
                    ['Điểm đã đổi', function (x) { return +x.points || 0; }, 'n'], ['Số tiền', function (x) { return +x.amount || 0; }, 'n'], ['Trạng thái', function (x) { return STN[st(x)]; }],
                    ['Xử lý lúc', function (x) { var p = pay(x.id); return p ? fDT(p.paidAt) : ''; }], ['Người xử lý', function (x) { var p = pay(x.id); return p ? p.by || '' : ''; }],
                    ['Ngân hàng', function (x) { return (x.bank || {}).bank || (x.bank || {}).bin || ''; }], ['Số tài khoản', function (x) { return (x.bank || {}).accNo || ''; }, 't'],
                    ['Chủ tài khoản', function (x) { return (x.bank || {}).accName || ''; }], ['Nội dung CK', function (x) { var p = pay(x.id); return p ? p.ref || '' : ''; }], ['Mã yêu cầu', function (x) { return x.id; }, 't']],
                kpi: function (r) {
                    var sum = function (f) { return r.filter(f).reduce(function (a, x) { return a + (+x.amount || 0); }, 0); };
                    var paid = r.filter(function (x) { return st(x) === 'paid'; }), wait = r.filter(function (x) { return st(x) === 'pending'; }), rej = r.filter(function (x) { return st(x) === 'rejected'; });
                    var us = {}; r.forEach(function (x) { us[x.user] = 1; });
                    return [['Tổng yêu cầu', vnd(sum(function () { return true; })), r.length + ' lần · ' + Object.keys(us).length + ' người'],
                        ['Đã chuyển', vnd(sum(function (x) { return st(x) === 'paid'; })), paid.length + ' yêu cầu'],
                        ['Chờ chuyển', vnd(sum(function (x) { return st(x) === 'pending'; })), wait.length + ' yêu cầu'],
                        ['Không duyệt', fmt(rej.length), 'đã hoàn ' + fmt(rej.reduce(function (a, x) { return a + (+x.points || 0); }, 0)) + ' điểm']];
                },
                brk: ['Theo mốc đổi', function (x) { return vnd(x.amount); }, function (x) { return +x.amount || 0; }],
                rank: ['Đổi nhiều nhất', 'đ', function (x) { return st(x) === 'rejected' ? 0 : (+x.amount || 0); }] });
        }
        function start() {
            if (C.started || typeof db === 'undefined') return; C.started = true;
            C.ref = db.collection('settings').doc('point_cashout');
            C.ref.onSnapshot(function (d) { C.cfg = norm(d.exists ? d.data() : {}); paint(); }, function () {});
            db.collection('point_cashout').onSnapshot(function (snap) {
                C.list = snap.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }).sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); }); stats();
            }, function (e) { console.warn('point_cashout', e); });
            setInterval(stats, 3000);
            report();
        }
        (function boot(n) { if (typeof db !== 'undefined' && $('pc-card')) start(); else if (n < 60) setTimeout(function () { boot(n + 1); }, 500); })(0);
        return { toggle: toggle, save: save, preview: preview, _c: C };
    })();
    
