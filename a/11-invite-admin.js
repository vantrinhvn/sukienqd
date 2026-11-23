    /* ===== HỆ THỐNG MÃ MỜI (admin) =====
       settings/invite_config = {
         isEnabled: bool,                       // công tắc tổng: cho phép nhập mã
         rewards: { points | tickets | spins | conThrows: { on: bool, invitee: số, inviter: số, from: ms, to: ms } },   // bật/tắt + mức thưởng + hẹn giờ (0 = không giới hạn) từng loại
         maxPerInviter: số,                     // 0 = không giới hạn số lần người mời được thưởng
         rewardTickets: số                      // (cũ) giữ để tương thích, = mức lượt rút lì xì của người nhập
       }
       Cấu hình cũ chưa có "rewards" -> hiểu là chỉ thưởng lượt rút lì xì = rewardTickets cho cả 2 bên.
       invite_history: { inviter, invitee, rewards: { invitee: {loại: số}, inviter: {loại: số} }, inviterCapped, rewardAmount (cũ), timestamp } */
    (function () {
        'use strict';
        if (!document.getElementById('view-invite') || typeof db === 'undefined') return;
        var $ = function (id) { return document.getElementById(id); };
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var toast = function (m, t) { if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast(m, t || 'success'); };
        var REF = db.collection('settings').doc('invite_config');
        var TYPES = [
            { k: 'points', name: 'Điểm lì xì', icon: '💰', unit: 'điểm', tone: 'var(--color-success)', note: 'Dùng đổi lượt ở Trạm Quy Đổi', def: 20 },
            { k: 'tickets', name: 'Lượt rút lì xì', icon: '🧧', unit: 'lượt rút', tone: 'var(--color-danger)', note: 'Dùng ở trang Rút Lì Xì', def: 1 },
            { k: 'spins', name: 'Lượt vòng quay', icon: '🎡', unit: 'lượt quay', tone: 'var(--color-warning)', note: 'Dùng ở trang Vòng Quay', def: 1 },
            { k: 'conThrows', name: 'Lượt ném còn', icon: '🎯', unit: 'lượt ném', tone: '#f97316', note: 'Dùng ở Sân Ném Còn', def: 3 }
        ];
        var TMAP = {}; TYPES.forEach(function (t) { TMAP[t.k] = t; });
        function int(v, d, lo, hi) { v = parseInt(v, 10); if (isNaN(v)) v = d; return Math.min(hi, Math.max(lo, v)); }
        function norm(c) {
            c = c || {};
            var r = c.rewards && typeof c.rewards === 'object' ? c.rewards : null, out = { on: !!c.isEnabled, max: int(c.maxPerInviter, 0, 0, 10000), rewards: {} };
            TYPES.forEach(function (t) {
                if (r) { var x = r[t.k] || {}; out.rewards[t.k] = { on: x.on === true, invitee: int(x.invitee, 0, 0, 1e6), inviter: int(x.inviter, 0, 0, 1e6), from: ms(x.from), to: ms(x.to) }; }
                else if (t.k === 'tickets') { var n = int(c.rewardTickets, 1, 1, 1e6); out.rewards[t.k] = { on: true, invitee: n, inviter: n, from: 0, to: 0 }; }
                else out.rewards[t.k] = { on: false, invitee: t.def, inviter: t.def, from: 0, to: 0 };
            });
            return out;
        }
        function ms(v) { v = Number(v); return isFinite(v) && v > 0 ? Math.floor(v) : 0; }
        // Hẹn giờ: 'wait' chưa tới giờ bật · 'end' đã qua giờ tắt · 'live' trong giờ (hoặc không hẹn giờ)
        function phase(x, now) { now = now || Date.now(); if (x.from && now < x.from) return 'wait'; if (x.to && now >= x.to) return 'end'; return 'live'; }
        function active(x, now) { return !!x.on && phase(x, now) === 'live'; }
        // Phần thưởng thực nhận của 1 bên theo cấu hình, TẠI THỜI ĐIỂM now: { loại: số } (chỉ loại đang bật, trong giờ và > 0)
        function give(cfg, side, now) { var g = {}; TYPES.forEach(function (t) { var x = cfg.rewards[t.k]; if (active(x, now) && x[side] > 0) g[t.k] = x[side]; }); return g; }
        var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
        function fmtT(t) { var d = new Date(t); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ' ' + p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + (d.getFullYear() !== new Date().getFullYear() ? '/' + d.getFullYear() : ''); }
        function toLocalInput(t) { if (!t) return ''; var d = new Date(t); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
        function fromLocalInput(v) { var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0).getTime() : 0; }
        function chips(g, empty) {
            var h = TYPES.filter(function (t) { return g && Number(g[t.k]) > 0; }).map(function (t) {
                return '<span class="inv-chip" style="--tone:' + t.tone + '" title="' + esc(t.name) + '">' + t.icon + ' +' + Number(g[t.k]).toLocaleString('vi-VN') + ' <small style="font-weight:600">' + esc(t.unit) + '</small></span>';
            }).join('');
            return h || '<span class="inv-none">' + (empty || '—') + '</span>';
        }
        // Lịch sử: bản ghi mới có rewards; bản cũ chỉ có rewardAmount (lượt rút lì xì cho cả 2)
        function histGive(d, side) {
            if (d.rewards && d.rewards[side]) return d.rewards[side];
            var n = Number(d.rewardAmount) || 0; return n > 0 ? { tickets: n } : {};
        }

        var IA = window.InviteAdmin = { cfg: norm(null), saved: null, hist: [], started: false };

        function buildRows() {
            var box = $('inv-rewards'); if (!box || box.childElementCount) return;
            box.innerHTML = TYPES.map(function (t) {
                var f = function (side, lbl) {
                    return '<label class="inv-rw-f" data-side="' + side + '"><span class="inv-rw-flbl">' + lbl + '</span>' +
                        '<input type="number" class="form-control inv-num" data-k="' + t.k + '" data-side="' + side + '" min="0" max="1000000" inputmode="numeric" aria-label="' + esc(t.name + ' – ' + lbl) + '"></label>';
                };
                return '<div class="inv-rw off" data-k="' + t.k + '" style="--tone:' + t.tone + '">' +
                    '<div class="inv-rw-name"><span class="inv-rw-ico" aria-hidden="true">' + t.icon + '</span><div><b>' + esc(t.name) + '</b><small>' + esc(t.note) + '</small></div></div>' +
                    f('invitee', 'Người nhập mã') + f('inviter', 'Người mời') +
                    '<div class="inv-rw-sw"><span class="inv-rw-st">TẮT</span><label class="switch" title="Bật / tắt ' + esc(t.name) + '"><input type="checkbox" data-k="' + t.k + '" aria-label="Bật / tắt ' + esc(t.name) + '"><span class="slider"></span></label></div>' +
                    '<div class="inv-rw-time"><span class="inv-tm-lbl">⏰ Hẹn giờ</span>' +
                        '<div class="inv-tm-f"><span>Bật từ</span><input type="datetime-local" class="form-control inv-when" data-k="' + t.k + '" data-f="from" aria-label="' + esc(t.name + ' – bật từ') + '"></div>' +
                        '<div class="inv-tm-f"><span>Tắt lúc</span><input type="datetime-local" class="form-control inv-when" data-k="' + t.k + '" data-f="to" aria-label="' + esc(t.name + ' – tắt lúc') + '"></div>' +
                        '<span class="inv-tm-st" data-k="' + t.k + '"></span>' +
                        '<button type="button" class="inv-tm-all" data-k="' + t.k + '" title="Chép giờ bật / tắt của dòng này sang cả 4 loại">Áp dụng cho cả 4 loại</button>' +
                    '</div>' +
                    '</div>';
            }).join('');
            box.addEventListener('input', function (e) {
                var el = e.target; if (!el.classList || !(el.classList.contains('inv-num') || el.classList.contains('inv-when'))) return;
                el.classList.add('dirty'); markDirty(); renderPreview();
            });
            box.addEventListener('click', function (e) {
                var b = e.target.closest && e.target.closest('.inv-tm-all'); if (!b) return;
                var src = {}; box.querySelectorAll('.inv-when[data-k="' + b.dataset.k + '"]').forEach(function (el) { src[el.dataset.f] = el.value; });
                box.querySelectorAll('.inv-when').forEach(function (el) { if (el.dataset.k === b.dataset.k || el.value === (src[el.dataset.f] || '')) return; el.value = src[el.dataset.f] || ''; el.classList.add('dirty'); });
                markDirty(); renderPreview(); toast('Đã chép giờ cho cả 4 loại — bấm "Lưu thiết lập" để áp dụng.', 'info');
            });
            box.addEventListener('change', function (e) {
                var el = e.target; if (el.type === 'checkbox' && el.dataset.k) IA.toggleReward(el.dataset.k, el);
            });
            var mx = $('inv-max');
            if (mx) mx.addEventListener('input', function () { mx.classList.add('dirty'); markDirty(); renderPreview(); });
        }
        function markDirty() { var d = $('inv-dirty'); if (d) d.classList.toggle('hidden', !document.querySelector('#view-invite .inv-num.dirty, #view-invite .inv-when.dirty')); }

        // Cấu hình đang thấy trên màn hình (bản đã lưu + các ô đang sửa chưa lưu)
        function formCfg() {
            var c = JSON.parse(JSON.stringify(IA.cfg));
            document.querySelectorAll('#inv-rewards .inv-num').forEach(function (el) { c.rewards[el.dataset.k][el.dataset.side] = int(el.value, 0, 0, 1e6); });
            document.querySelectorAll('#inv-rewards .inv-when').forEach(function (el) { c.rewards[el.dataset.k][el.dataset.f] = fromLocalInput(el.value); });
            var mx = $('inv-max'); if (mx) c.max = int(mx.value, 0, 0, 10000);
            return c;
        }
        function payload(c) {
            var rw = {}; TYPES.forEach(function (t) { var x = c.rewards[t.k]; rw[t.k] = { on: !!x.on, invitee: x.invitee, inviter: x.inviter, from: x.from || 0, to: x.to || 0 }; });
            var tk = c.rewards.tickets;
            return { rewards: rw, maxPerInviter: c.max, rewardTickets: Math.max(1, tk.on ? tk.invitee : 1), updatedAt: Date.now() };
        }

        function renderCfg() {
            var c = IA.cfg;
            var master = $('inv-master'), st = $('invite-status-text'), tg = $('cfg-invite-toggle');
            if (tg) tg.checked = c.on;
            if (st) { st.textContent = c.on ? 'ĐANG BẬT' : 'ĐANG TẮT'; st.style.color = c.on ? 'var(--color-success)' : 'var(--text-muted)'; }
            if (master) master.classList.toggle('is-on', c.on);
            TYPES.forEach(function (t) {
                var row = document.querySelector('#inv-rewards .inv-rw[data-k="' + t.k + '"]'); if (!row) return;
                var x = c.rewards[t.k];
                row.classList.toggle('off', !x.on);
                row.querySelector('.inv-rw-st').textContent = x.on ? 'BẬT' : 'TẮT';
                var cb = row.querySelector('input[type="checkbox"]'); if (cb) cb.checked = x.on;
                row.querySelectorAll('.inv-num').forEach(function (el) { if (!el.classList.contains('dirty')) el.value = x[el.dataset.side]; });
                row.querySelectorAll('.inv-when').forEach(function (el) { if (!el.classList.contains('dirty')) el.value = toLocalInput(x[el.dataset.f]); });
            });
            var mx = $('inv-max'); if (mx && !mx.classList.contains('dirty')) mx.value = c.max;
            markDirty(); renderPreview();
        }
        // Trạng thái hẹn giờ từng dòng (theo số đang thấy trên màn hình) + lịch trong khung xem trước
        function renderTimes(c) {
            var now = Date.now(), lines = [];
            TYPES.forEach(function (t) {
                var x = c.rewards[t.k], st = document.querySelector('#inv-rewards .inv-tm-st[data-k="' + t.k + '"]'), row = st && st.closest('.inv-rw');
                var ph = phase(x, now), has = x.from || x.to, txt = '', cls = '';
                if (x.from && x.to && x.to <= x.from) { txt = '⚠ Giờ tắt phải sau giờ bật'; cls = 'end'; }
                else if (!has) txt = x.on ? 'Không hẹn giờ · phát ngay' : 'Không hẹn giờ';
                else if (ph === 'wait') { txt = '⏳ Chờ bật lúc ' + fmtT(x.from); cls = 'wait'; }
                else if (ph === 'end') { txt = '⛔ Đã tắt lúc ' + fmtT(x.to); cls = 'end'; }
                else { txt = '🟢 Đang phát' + (x.to ? ' · tắt lúc ' + fmtT(x.to) : ''); cls = 'live'; }
                if (has && !x.on) txt += ' (công tắc đang TẮT)';
                if (st) { st.textContent = txt; st.className = 'inv-tm-st ' + (x.on ? cls : ''); }
                if (row) row.classList.toggle('sleep', x.on && has && ph !== 'live');
                if (x.on && has && (x.invitee > 0 || x.inviter > 0) && ph !== 'end')
                    lines.push('<div>' + t.icon + ' <b>' + esc(t.name) + '</b>: ' + (x.from && ph === 'wait' ? 'bật lúc <b>' + fmtT(x.from) + '</b>' : 'đang phát') + (x.to ? ' → tắt lúc <b>' + fmtT(x.to) + '</b>' : '') + '</div>');
            });
            var box = $('inv-sched');
            if (!box) { var w = $('inv-pv-warn'); if (w) { box = document.createElement('div'); box.id = 'inv-sched'; box.className = 'inv-sched'; w.parentNode.insertBefore(box, w); } }
            if (box) box.innerHTML = lines.length ? '<div class="text-muted" style="font-weight:700"><i class="fa-regular fa-clock"></i> Lịch hẹn giờ</div>' + lines.join('') : '';
        }
        function renderPreview() {
            var c = formCfg(), a = give(c, 'invitee'), b = give(c, 'inviter');
            renderTimes(c);
            var pa = $('inv-pv-invitee'), pb = $('inv-pv-inviter'), w = $('inv-pv-warn'), sub = $('inv-master-sub');
            if (pa) pa.innerHTML = chips(a, 'Không nhận gì');
            if (pb) pb.innerHTML = chips(b, 'Không nhận gì') + (c.max > 0 ? '<div class="inv-none" style="width:100%;margin-top:4px">Tối đa ' + c.max + ' lần thưởng / người mời</div>' : '');
            var nothing = !Object.keys(a).length && !Object.keys(b).length, msg = '';
            if (!c.on) msg = '<span class="text-muted"><i class="fa-solid fa-circle-info"></i> Hệ thống mã mời đang <b>tắt</b>: thành viên thấy ô nhập mã bị khóa.</span>';
            else if (nothing) {
                var nxt = 0; TYPES.forEach(function (t) { var x = c.rewards[t.k]; if (x.on && (x.invitee > 0 || x.inviter > 0) && phase(x) === 'wait' && (!nxt || x.from < nxt)) nxt = x.from; });
                msg = nxt ? '<span class="text-warning"><i class="fa-solid fa-hourglass-half"></i> Chưa tới giờ phát thưởng: thành viên nhập mã được từ <b>' + fmtT(nxt) + '</b>.</span>'
                    : '<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Chưa có phần thưởng nào đang bật / trong giờ (hoặc mức = 0): thành viên sẽ không nhập mã được.</span>';
            }
            if (w) w.innerHTML = msg;
            if (sub) sub.textContent = c.on ? (nothing ? 'Đang bật nhưng chưa có phần thưởng nào.' : 'Thành viên nhập mã trong Hồ sơ để nhận thưởng.') : 'Tắt = thành viên không nhập mã được (phần thưởng giữ nguyên cấu hình).';
        }

        IA.toggleMaster = function (cb) {
            var on = !!cb.checked;
            REF.set({ isEnabled: on }, { merge: true })
                .then(function () { toast(on ? 'Đã BẬT hệ thống Mã Mời!' : 'Đã TẮT hệ thống Mã Mời'); })
                .catch(function () { toast('Lỗi lưu cấu hình', 'error'); cb.checked = !on; });
        };
        // Bật / tắt 1 phần thưởng: lưu NGAY (giữ nguyên mức đã lưu, các ô đang sửa vẫn chờ bấm Lưu)
        IA.toggleReward = function (k, cb) {
            var on = !!cb.checked, c = JSON.parse(JSON.stringify(IA.cfg)), t = TMAP[k];
            c.rewards[k].on = on;
            // Bật loại đang có mức 0 ở cả 2 bên -> lấy mức đang gõ trên ô (nếu có) hoặc mức gợi ý
            if (on && !c.rewards[k].invitee && !c.rewards[k].inviter) {
                var f = formCfg().rewards[k];
                c.rewards[k].invitee = f.invitee || t.def; c.rewards[k].inviter = f.inviter || t.def;
                document.querySelectorAll('#inv-rewards .inv-num[data-k="' + k + '"]').forEach(function (el) { el.classList.remove('dirty'); });
            }
            var p = payload(c); delete p.maxPerInviter;   // chỉ đổi phần thưởng, không đụng giới hạn
            REF.set(p, { merge: true })
                .then(function () { toast((on ? 'Đã BẬT thưởng ' : 'Đã TẮT thưởng ') + t.name); })
                .catch(function () { toast('Lỗi lưu cấu hình', 'error'); cb.checked = !on; });
        };
        IA.save = function () {
            var c = formCfg(), btn = $('inv-save-btn');
            var bad = TYPES.filter(function (t) { var x = c.rewards[t.k]; return x.from && x.to && x.to <= x.from; });
            if (bad.length) { toast('⏰ ' + bad.map(function (t) { return t.name; }).join(', ') + ': giờ tắt phải sau giờ bật.', 'error'); return; }
            var p = payload(c);
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...'; }
            REF.set(p, { merge: true }).then(function () {
                document.querySelectorAll('#view-invite .inv-num.dirty, #view-invite .inv-when.dirty').forEach(function (el) { el.classList.remove('dirty'); });
                IA.cfg = norm(Object.assign({ isEnabled: IA.cfg.on }, p)); renderCfg();
                var a = give(c, 'invitee');
                toast(c.on && !Object.keys(a).length && !Object.keys(give(c, 'inviter')).length ? 'Đã lưu. Lưu ý: chưa có phần thưởng nào đang bật.' : 'Đã lưu mức thưởng mã mời!', 'success');
            }).catch(function () { toast('Lỗi lưu cấu hình', 'error'); })
              .then(function () { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-save"></i> Lưu thiết lập'; } });
        };

        IA.renderHistory = function () {
            var tb = $('tb-invite-history'); if (!tb) return;
            var q = String(($('inv-search') || {}).value || '').trim().toLowerCase();
            var list = q ? IA.hist.filter(function (d) { return String(d.invitee || '').toLowerCase().indexOf(q) >= 0 || String(d.inviter || '').toLowerCase().indexOf(q) >= 0; }) : IA.hist;
            if (!IA.hist.length) { tb.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-8">Chưa có ai sử dụng mã mời.</td></tr>'; return; }
            if (!list.length) { tb.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-8">Không tìm thấy "' + esc(q) + '".</td></tr>'; return; }
            var LIM = 300;
            tb.innerHTML = list.slice(0, LIM).map(function (d) {
                var t = d.timestamp ? new Date(d.timestamp).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
                return '<tr><td><b class="text-main">' + esc(d.invitee) + '</b></td><td><b class="text-warning">' + esc(d.inviter) + '</b></td>' +
                    '<td><div class="inv-chips">' + chips(histGive(d, 'invitee')) + '</div></td>' +
                    '<td><div class="inv-chips">' + chips(histGive(d, 'inviter')) + '</div>' + (d.inviterCapped ? '<span class="inv-cap">⚠ Đã đạt giới hạn thưởng</span>' : '') + '</td>' +
                    '<td class="text-right text-muted text-sm" style="white-space:nowrap">' + esc(t) + '</td></tr>';
            }).join('') + (list.length > LIM ? '<tr><td colspan="5" class="text-center text-muted text-sm py-4">Hiện ' + LIM + ' / ' + list.length + ' lượt gần nhất — gõ tên để tìm.</td></tr>' : '');
        };
        function renderStats() {
            var box = $('inv-stats'); if (!box) return;
            var d0 = new Date(); d0.setHours(0, 0, 0, 0);
            var today = 0, by = {}, tot = {};
            IA.hist.forEach(function (d) {
                if ((d.timestamp || 0) >= d0.getTime()) today++;
                if (d.inviter) by[d.inviter] = (by[d.inviter] || 0) + 1;
                ['invitee', 'inviter'].forEach(function (s) { var g = histGive(d, s); Object.keys(g).forEach(function (k) { tot[k] = (tot[k] || 0) + (Number(g[k]) || 0); }); });
            });
            var top = Object.keys(by).map(function (u) { return [u, by[u]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
            var card = function (lbl, num, sub, cls) { return '<div class="card inv-stat ' + (cls || '') + '"><div class="inv-stat-lbl">' + lbl + '</div>' + num + (sub ? '<div class="inv-stat-sub">' + sub + '</div>' : '') + '</div>'; };
            box.innerHTML =
                card('Tổng lượt mời', '<div class="inv-stat-num">' + IA.hist.length.toLocaleString('vi-VN') + '</div>', Object.keys(by).length + ' người mời khác nhau') +
                card('Hôm nay', '<div class="inv-stat-num">' + today.toLocaleString('vi-VN') + '</div>', 'lượt nhập mã') +
                card('Đã phát', '<div class="inv-chips" style="margin-top:8px">' + chips(tot, 'Chưa phát') + '</div>', 'cộng cả 2 bên') +
                card('🏆 Top người mời', top.length ? '<ol class="inv-top">' + top.map(function (x, i) { return '<li><b>' + (i + 1) + '. ' + esc(x[0]) + '</b><span>' + x[1] + ' người</span></li>'; }).join('') + '</ol>' : '<div class="inv-none" style="margin-top:8px">Chưa có</div>', '', 'inv-stat-top');
        }

        IA.start = function () {
            if (IA.started) return; IA.started = true;
            buildRows(); renderCfg();
            setInterval(function () { var v = $('view-invite'); if (v && v.offsetParent !== null) renderPreview(); }, 15000);   // hẹn giờ: tự đổi trạng thái khi tới giờ
            REF.onSnapshot(function (doc) { IA.cfg = norm(doc.exists ? doc.data() : null); renderCfg(); }, function (e) { console.warn('invite_config', e); });
            db.collection('invite_history').orderBy('timestamp', 'desc').onSnapshot(function (snap) {
                IA.hist = snap.docs.map(function (d) { return d.data(); });
                IA.renderHistory(); renderStats();
            }, function (e) {
                console.warn('invite_history', e);
                var tb = $('tb-invite-history'); if (tb) tb.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-8">Không tải được lịch sử mã mời.</td></tr>';
            });
        };
        // Dùng chung cho Lịch sử biến động / Ví giải trí của 1 tài khoản
        IA.histGive = histGive; IA.TYPES = TYPES; IA.active = active;
    })();
    
