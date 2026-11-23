    /* ===== TẶNG QUÀ ĐỒNG ĐỘI (admin) =====
       settings/transfer_config = { isEnabled, types: { spins | tickets | conThrows: { on } }, maxPerTransfer, dailyLimit, from, to, closedMsg, updatedAt }
       (chưa cấu hình = ĐÓNG; loại mặc định: lượt quay + lượt rút BẬT, lượt ném TẮT — giống user.html)
       transfer_history: { from, to, type, amount, timestamp, day } — user.html ghi trong cùng giao dịch chuyển lượt */
    (function () {
        'use strict';
        if (!document.getElementById('view-transfer') || typeof db === 'undefined') return;
        var $ = function (id) { return document.getElementById(id); };
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var toast = function (m, t) { if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast(m, t || 'success'); };
        var REF = db.collection('settings').doc('transfer_config');
        var TYPES = [
            { k: 'spins', name: 'Lượt vòng quay', short: 'lượt quay', icon: '🎡', tone: 'var(--color-warning)', note: 'Dùng ở trang Vòng Quay' },
            { k: 'tickets', name: 'Lượt rút lì xì', short: 'lượt rút', icon: '🧧', tone: 'var(--color-danger)', note: 'Dùng ở trang Rút Lì Xì' },
            { k: 'conThrows', name: 'Lượt ném còn', short: 'lượt ném', icon: '🎯', tone: '#f97316', note: 'Dùng ở Sân Ném Còn' }
        ];
        var TMAP = {}; TYPES.forEach(function (t) { TMAP[t.k] = t; });
        var int = function (v, d, lo, hi) { v = parseInt(v, 10); if (isNaN(v)) v = d; return Math.min(hi, Math.max(lo, v)); };
        var ms = function (v) { v = Number(v); return isFinite(v) && v > 0 ? Math.floor(v) : 0; };
        var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
        var fmt = function (n) { return Number(n || 0).toLocaleString('vi-VN'); };
        function fmtT(t) { var d = new Date(t); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ' ' + p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + (d.getFullYear() !== new Date().getFullYear() ? '/' + d.getFullYear() : ''); }
        function toLocalInput(t) { if (!t) return ''; var d = new Date(t); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
        function fromLocalInput(v) { var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0).getTime() : 0; }
        function norm(c) {
            c = c || {};
            var t = c.types && typeof c.types === 'object' ? c.types : null, types = {};
            TYPES.forEach(function (x) { types[x.k] = t ? !!(t[x.k] && t[x.k].on === true) : x.k !== 'conThrows'; });
            return { on: c.isEnabled === true, types: types, max: int(c.maxPerTransfer, 0, 0, 1e6), daily: int(c.dailyLimit, 0, 0, 1000), from: ms(c.from), to: ms(c.to), msg: String(c.closedMsg || '') };
        }
        function state(c, now) {
            now = now || Date.now();
            if (!c.on) return 'off'; if (c.from && now < c.from) return 'wait'; if (c.to && now >= c.to) return 'end';
            if (!TYPES.some(function (t) { return c.types[t.k]; })) return 'none'; return 'open';
        }
        function typesPayload(types) { var o = {}; TYPES.forEach(function (t) { o[t.k] = { on: !!types[t.k] }; }); return o; }
        function chip(k, n) { var t = TMAP[k] || { icon: '🎁', short: k || 'lượt', tone: 'var(--text-muted)' }; return '<span class="inv-chip" style="--tone:' + t.tone + '">' + t.icon + ' ' + fmt(n) + ' <small style="font-weight:600">' + esc(t.short) + '</small></span>'; }

        var GA = window.GiftAdmin = { cfg: norm(null), hist: [], started: false, norm: norm, state: state };

        function buildTypes() {
            var box = $('gift-types'); if (!box || box.childElementCount) return;
            box.innerHTML = TYPES.map(function (t) {
                return '<div class="gift-ty off" data-k="' + t.k + '" style="--tone:' + t.tone + '">' +
                    '<div class="inv-rw-name"><span class="inv-rw-ico" aria-hidden="true">' + t.icon + '</span><div><b>' + esc(t.name) + '</b><small>' + esc(t.note) + '</small></div></div>' +
                    '<span class="gift-ty-sum" data-sum="' + t.k + '"></span>' +
                    '<div class="inv-rw-sw"><span class="inv-rw-st">TẮT</span><label class="switch" title="Bật / tắt tặng ' + esc(t.name) + '"><input type="checkbox" data-k="' + t.k + '" aria-label="Cho phép tặng ' + esc(t.name) + '"><span class="slider"></span></label></div>' +
                    '</div>';
            }).join('');
            box.addEventListener('change', function (e) { var el = e.target; if (el.type === 'checkbox' && el.dataset.k) GA.toggleType(el.dataset.k, el); });
            document.querySelectorAll('#view-transfer .gift-in').forEach(function (el) {
                el.addEventListener('input', function () { el.classList.add('dirty'); markDirty(); renderPv(); });
            });
        }
        function markDirty() { var d = $('gift-dirty'); if (d) d.classList.toggle('hidden', !document.querySelector('#view-transfer .gift-in.dirty')); }
        function formCfg() {
            var c = JSON.parse(JSON.stringify(GA.cfg));
            c.max = int(($('gift-max') || {}).value, 0, 0, 1e6); c.daily = int(($('gift-daily') || {}).value, 0, 0, 1000);
            c.from = fromLocalInput(($('gift-from') || {}).value); c.to = fromLocalInput(($('gift-to') || {}).value);
            c.msg = String(($('gift-msg') || {}).value || '').trim().slice(0, 300);
            return c;
        }
        function setVal(id, v) { var el = $(id); if (el && !el.classList.contains('dirty')) el.value = v; }

        function renderCfg() {
            var c = GA.cfg, tg = $('gift-toggle'), st = $('gift-status-text'), m = $('gift-master');
            if (tg) tg.checked = c.on;
            if (st) { st.textContent = c.on ? 'ĐANG BẬT' : 'ĐANG TẮT'; st.style.color = c.on ? 'var(--color-success)' : 'var(--text-muted)'; }
            if (m) m.classList.toggle('is-on', c.on);
            TYPES.forEach(function (t) {
                var row = document.querySelector('#gift-types .gift-ty[data-k="' + t.k + '"]'); if (!row) return;
                var on = !!c.types[t.k]; row.classList.toggle('off', !on);
                row.querySelector('.inv-rw-st').textContent = on ? 'BẬT' : 'TẮT';
                var cb = row.querySelector('input[type="checkbox"]'); if (cb) cb.checked = on;
            });
            setVal('gift-max', c.max); setVal('gift-daily', c.daily); setVal('gift-from', toLocalInput(c.from)); setVal('gift-to', toLocalInput(c.to)); setVal('gift-msg', c.msg);
            markDirty(); renderPv();
        }
        // Thành viên đang thấy gì (theo số trên màn hình, kể cả ô chưa lưu)
        function renderPv() {
            var c = formCfg(), st = state(c), pv = $('gift-pv'), sub = $('gift-master-sub');
            var on = TYPES.filter(function (t) { return c.types[t.k]; }).map(function (t) { return t.icon + ' ' + t.short; }).join(', ');
            var lim = []; if (c.max > 0) lim.push('tối đa <b>' + fmt(c.max) + '</b>/lần'); if (c.daily > 0) lim.push('<b>' + c.daily + '</b> lần/người/ngày');
            var txt = '';
            if (c.from && c.to && c.to <= c.from) txt = '<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Giờ đóng phải sau giờ mở.</span>';
            else if (st === 'off') txt = '<span class="text-muted"><i class="fa-solid fa-circle-info"></i> Đang <b>tắt</b>: thành viên không thấy nút tặng quà.</span>';
            else if (st === 'wait') txt = '<span class="text-warning"><i class="fa-solid fa-hourglass-half"></i> Chờ mở lúc <b>' + fmtT(c.from) + '</b>' + (c.to ? ', đóng lúc <b>' + fmtT(c.to) + '</b>' : '') + '.</span>';
            else if (st === 'end') txt = '<span class="text-danger"><i class="fa-solid fa-circle-stop"></i> Đã hết giờ (đóng lúc <b>' + fmtT(c.to) + '</b>) — thành viên không tặng được.</span>';
            else if (st === 'none') txt = '<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Đang bật nhưng chưa có loại nào được tặng.</span>';
            else txt = '<span class="text-success"><i class="fa-solid fa-circle-check"></i> Đang mở: tặng được ' + on + (lim.length ? ' · ' + lim.join(' · ') : ' · không giới hạn') + (c.to ? ' · đóng lúc <b>' + fmtT(c.to) + '</b>' : '') + '.</span>';
            if (pv) pv.innerHTML = txt;
            if (sub) sub.textContent = st === 'open' ? 'Thành viên mở Túi đồ → "Tặng lượt cho đồng đội".' : st === 'wait' ? 'Đã bật, chờ tới giờ mở.' : 'Tắt = thành viên không thấy nút tặng, không chuyển được lượt.';
        }

        GA.toggleMaster = function (cb) {
            var on = !!cb.checked;
            var p = { isEnabled: on, updatedAt: Date.now() };
            if (on && !GA.raw) p.types = typesPayload(GA.cfg.types);   // lần đầu bật: ghi luôn loại mặc định
            REF.set(p, { merge: true })
                .then(function () { toast(on ? 'Đã MỞ tặng quà đồng đội!' : 'Đã ĐÓNG tặng quà đồng đội'); logAdmin(on ? 'Mở tặng quà' : 'Đóng tặng quà'); })
                .catch(function () { toast('Lỗi lưu cấu hình', 'error'); cb.checked = !on; });
        };
        GA.toggleType = function (k, cb) {
            var on = !!cb.checked, types = JSON.parse(JSON.stringify(GA.cfg.types)); types[k] = on;
            REF.set({ types: typesPayload(types), updatedAt: Date.now() }, { merge: true })
                .then(function () { toast((on ? 'Cho phép tặng ' : 'Đã tắt tặng ') + TMAP[k].name); })
                .catch(function () { toast('Lỗi lưu cấu hình', 'error'); cb.checked = !on; });
        };
        GA.save = function () {
            var c = formCfg(), btn = $('gift-save-btn');
            if (c.from && c.to && c.to <= c.from) { toast('⏰ Giờ đóng phải sau giờ mở.', 'error'); return; }
            var p = { maxPerTransfer: c.max, dailyLimit: c.daily, from: c.from || 0, to: c.to || 0, closedMsg: c.msg, types: typesPayload(GA.cfg.types), updatedAt: Date.now() };
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...'; }
            REF.set(p, { merge: true }).then(function () {
                document.querySelectorAll('#view-transfer .gift-in.dirty').forEach(function (el) { el.classList.remove('dirty'); });
                GA.cfg = norm(Object.assign({ isEnabled: GA.cfg.on }, p)); renderCfg();
                toast('Đã lưu thiết lập tặng quà!');
            }).catch(function () { toast('Lỗi lưu cấu hình', 'error'); })
              .then(function () { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-save"></i> Lưu thiết lập'; } });
        };
        function logAdmin(action) {
            try { db.collection('admin_logs').add({ type: 'transfer_config', action: action, user: '(hệ thống)', by: (typeof State !== 'undefined' && State.currentUser) || 'admin', timestamp: Date.now() }).catch(function () {}); } catch (e) {}
        }

        /* ---- Lịch sử ---- */
        function filtered() {
            var q = String(($('gift-search') || {}).value || '').trim().toLowerCase(), ft = ($('gift-ftype') || {}).value || '', fd = ($('gift-fday') || {}).value || '';
            var since = 0; if (fd === 'today') { var d0 = new Date(); d0.setHours(0, 0, 0, 0); since = d0.getTime(); } else if (fd) since = Date.now() - Number(fd) * 864e5;
            return GA.hist.filter(function (d) {
                if (ft && d.type !== ft) return false;
                if (since && (d.timestamp || 0) < since) return false;
                return !q || String(d.from || '').toLowerCase().indexOf(q) >= 0 || String(d.to || '').toLowerCase().indexOf(q) >= 0;
            });
        }
        GA.renderHistory = function () {
            var tb = $('tb-gift-history'); if (!tb) return;
            if (!GA.hist.length) { tb.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-8">Chưa có lượt tặng quà nào.</td></tr>'; return; }
            var list = filtered();
            if (!list.length) { tb.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-8">Không có lượt tặng nào khớp bộ lọc.</td></tr>'; return; }
            var LIM = 400, lastDay = '', html = '';
            list.slice(0, LIM).forEach(function (d) {
                var t = d.timestamp ? new Date(d.timestamp) : null, day = t ? t.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Không rõ ngày';
                if (day !== lastDay) { lastDay = day; html += '<tr class="gift-day-sep"><td colspan="4">📅 ' + esc(day) + '</td></tr>'; }
                html += '<tr><td><b class="text-main">' + esc(d.from) + '</b></td><td><b class="text-info">' + esc(d.to) + '</b></td><td>' + chip(d.type, d.amount) + '</td>' +
                    '<td class="text-right text-muted text-sm" style="white-space:nowrap">' + (t ? p2(t.getHours()) + ':' + p2(t.getMinutes()) + ':' + p2(t.getSeconds()) : '') + '</td></tr>';
            });
            tb.innerHTML = html + (list.length > LIM ? '<tr><td colspan="4" class="text-center text-muted text-sm py-4">Hiện ' + LIM + ' / ' + fmt(list.length) + ' lượt gần nhất — lọc hoặc tải CSV để xem đủ.</td></tr>' : '');
        };
        GA.exportCsv = function () {
            var list = filtered(); if (!list.length) { toast('Không có dữ liệu để tải.', 'warning'); return; }
            var q = function (v) { v = String(v == null ? '' : v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
            var rows = [['Thời gian', 'Người tặng', 'Người nhận', 'Loại', 'Số lượng']].concat(list.map(function (d) {
                return [d.timestamp ? new Date(d.timestamp).toLocaleString('vi-VN') : '', d.from, d.to, (TMAP[d.type] || {}).name || d.type, d.amount];
            }));
            var blob = new Blob(['﻿' + rows.map(function (r) { return r.map(q).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
            var a = document.createElement('a'), dd = new Date(); a.href = URL.createObjectURL(blob);
            a.download = 'lich-su-tang-qua-' + dd.getFullYear() + p2(dd.getMonth() + 1) + p2(dd.getDate()) + '.csv';
            document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        };
        function renderStats() {
            var box = $('gift-stats'); if (!box) return;
            var d0 = new Date(); d0.setHours(0, 0, 0, 0);
            var today = 0, tot = {}, totToday = {}, by = {}, people = {};
            GA.hist.forEach(function (d) {
                var n = Number(d.amount) || 0, k = d.type || '?';
                tot[k] = (tot[k] || 0) + n;
                if ((d.timestamp || 0) >= d0.getTime()) { today++; totToday[k] = (totToday[k] || 0) + n; }
                if (d.from) { by[d.from] = (by[d.from] || 0) + 1; people[d.from] = 1; }
            });
            var chips = function (o) { var h = Object.keys(o).filter(function (k) { return o[k] > 0; }).map(function (k) { return chip(k, o[k]); }).join(''); return h || '<span class="inv-none">Chưa có</span>'; };
            var top = Object.keys(by).map(function (u) { return [u, by[u]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
            var card = function (lbl, num, sub, cls) { return '<div class="card inv-stat ' + (cls || '') + '"><div class="inv-stat-lbl">' + lbl + '</div>' + num + (sub ? '<div class="inv-stat-sub">' + sub + '</div>' : '') + '</div>'; };
            box.innerHTML =
                card('Tổng lượt tặng', '<div class="inv-stat-num">' + fmt(GA.hist.length) + '</div>', Object.keys(people).length + ' người đã tặng') +
                card('Hôm nay', '<div class="inv-stat-num">' + fmt(today) + '</div>', '<div class="inv-chips" style="margin-top:6px">' + chips(totToday) + '</div>') +
                card('Đã chuyển (tổng)', '<div class="inv-chips" style="margin-top:8px">' + chips(tot) + '</div>', '') +
                card('🏆 Tặng nhiều nhất', top.length ? '<ol class="inv-top">' + top.map(function (x, i) { return '<li><b>' + (i + 1) + '. ' + esc(x[0]) + '</b><span>' + x[1] + ' lần</span></li>'; }).join('') + '</ol>' : '<div class="inv-none" style="margin-top:8px">Chưa có</div>', '', 'inv-stat-top');
            TYPES.forEach(function (t) { var el = document.querySelector('#gift-types [data-sum="' + t.k + '"]'); if (el) el.textContent = tot[t.k] ? 'Đã chuyển ' + fmt(tot[t.k]) + ' ' + t.short : ''; });
        }

        GA.start = function () {
            if (GA.started) return; GA.started = true;
            buildTypes(); renderCfg();
            setInterval(function () { var v = $('view-transfer'); if (v && v.offsetParent !== null) renderPv(); }, 15000);
            REF.onSnapshot(function (doc) { GA.raw = doc.exists; GA.cfg = norm(doc.exists ? doc.data() : null); renderCfg(); }, function (e) { console.warn('transfer_config', e); });
            db.collection('transfer_history').orderBy('timestamp', 'desc').limit(3000).onSnapshot(function (snap) {
                GA.hist = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
                GA.renderHistory(); renderStats();
            }, function (e) {
                console.warn('transfer_history', e);
                var tb = $('tb-gift-history'); if (tb) tb.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-8">Không tải được lịch sử tặng quà.</td></tr>';
            });
        };
    })();
    
