    /* ===== THƯỞNG VẬT PHẨM ĐIỂM DANH (admin) =====
       settings/attendance_reward_items = {
         isEnabled: bool,                                                         // công tắc tổng
         items: { points | tickets | spins | conThrows: { on, n, from, to } },   // từng món: bật/tắt, số lượng, hẹn giờ (ms, 0 = không giới hạn)
         tickets: số, spins: 0                                                    // (cũ) để bản cũ đọc được
         from, to                                                                 // (bản 13: hẹn giờ chung) -> nay chép vào từng món, lưu lại thì về 0
       } */
    (function () {
        var $ = function (id) { return document.getElementById(id); };
        var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
        function fmtT(t) { var d = new Date(t); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ' ' + p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + (d.getFullYear() !== new Date().getFullYear() ? '/' + d.getFullYear() : ''); }
        function toInp(t) { if (!t) return ''; var d = new Date(t); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
        function fromInp(v) { var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0).getTime() : 0; }
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var toast = function (m, t) { if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast(m, t || 'success'); };
        var TYPES = [
            { k: 'points', name: 'Điểm lì xì', icon: '💰', unit: 'điểm', tone: 'var(--color-success)', note: 'Điểm lì xì cộng mỗi lần điểm danh', def: 10 },
            { k: 'tickets', name: 'Lượt rút lì xì', icon: '🧧', unit: 'lượt rút', tone: 'var(--color-danger)', note: 'Dùng ở trang Rút Lì Xì', def: 1 },
            { k: 'spins', name: 'Lượt vòng quay', icon: '🎡', unit: 'lượt quay', tone: 'var(--color-warning)', note: 'Dùng ở trang Vòng Quay', def: 1 },
            { k: 'conThrows', name: 'Lượt ném còn', icon: '🎯', unit: 'lượt ném', tone: '#f97316', note: 'Dùng ở Sân Ném Còn', def: 3 }
        ];
        function int(v, d) { v = parseInt(v, 10); return isNaN(v) ? d : Math.min(1e6, Math.max(0, v)); }
        function ms(v) { v = Number(v); return isFinite(v) && v > 0 ? Math.floor(v) : 0; }
        function norm(d) {
            d = d || {}; var it = d.items && typeof d.items === 'object' ? d.items : null, out = {}, gf = ms(d.from), gt = ms(d.to);
            TYPES.forEach(function (t) {
                var x = it ? (it[t.k] || {}) : {};
                var o = it ? { on: x.on === true, n: int(x.n, 0) }
                    : (t.k === 'tickets' ? (function (n) { return { on: n > 0, n: n || t.def }; })(int(d.tickets, 0)) : { on: false, n: t.def });
                // món chưa có giờ riêng -> dùng giờ chung cũ (bản 13)
                o.from = x.from !== undefined ? ms(x.from) : gf; o.to = x.to !== undefined ? ms(x.to) : gt;
                out[t.k] = o;
            });
            return out;
        }
        function phase(x, now) { now = now || Date.now(); if (x.from && now < x.from) return 'wait'; if (x.to && now >= x.to) return 'end'; return 'live'; }
        // Vật phẩm phát tại thời điểm now (bỏ qua công tắc tổng): món bật, số > 0, trong giờ
        function giveItems(items, now) { var g = {}; TYPES.forEach(function (t) { var x = items[t.k]; if (x.on && x.n > 0 && phase(x, now) === 'live') g[t.k] = x.n; }); return g; }
        function cfgItems(items) { var g = {}; TYPES.forEach(function (t) { var x = items[t.k]; if (x.on && x.n > 0) g[t.k] = x.n; }); return g; }
        var AS = window.AttSched = { data: {}, items: norm(null), TYPES: TYPES, norm: norm };
        AS.give = function (d, now) { return giveItems(norm(d), now); };
        AS.text = function (items, now) { var g = now === false ? cfgItems(items) : giveItems(items, now); return TYPES.filter(function (t) { return g[t.k]; }).map(function (t) { return t.icon + ' +' + g[t.k].toLocaleString('vi-VN') + ' ' + t.unit; }).join(', '); };
        AS.payload = function (items) {
            var o = { items: {}, spins: 0, tickets: items.tickets.on ? items.tickets.n : 0, from: 0, to: 0, updatedAt: Date.now() };
            TYPES.forEach(function (t) { var x = items[t.k]; o.items[t.k] = { on: !!x.on, n: x.n, from: x.from || 0, to: x.to || 0 }; });
            return o;
        };
        function buildItems() {
            var box = $('att-items'); if (!box || box.childElementCount) return;
            box.innerHTML = TYPES.map(function (t) {
                var when = function (f, lbl) { return '<div class="inv-tm-f"><span>' + lbl + '</span><input type="datetime-local" class="form-control att-when" data-k="' + t.k + '" data-f="' + f + '" aria-label="' + esc(t.name + ' – ' + lbl.toLowerCase()) + '"></div>'; };
                return '<div class="att-it off" data-k="' + t.k + '" style="--tone:' + t.tone + '">' +
                    '<div class="att-it-name"><span class="att-it-ico" aria-hidden="true">' + t.icon + '</span><div><b>' + esc(t.name) + '</b><small>' + esc(t.note) + '</small></div></div>' +
                    '<div class="att-it-n"><input type="number" class="form-control inv-num att-num" data-k="' + t.k + '" min="0" max="1000000" inputmode="numeric" aria-label="' + esc('Số ' + t.name) + '"><span>' + esc(t.unit) + '</span></div>' +
                    '<div class="att-it-sw"><span class="att-it-st">TẮT</span><label class="switch" title="Bật / tắt ' + esc(t.name) + '"><input type="checkbox" data-k="' + t.k + '" aria-label="Bật / tắt ' + esc(t.name) + '"><span class="slider"></span></label></div>' +
                    '<div class="inv-rw-time att-it-time"><span class="inv-tm-lbl">⏰ Hẹn giờ</span>' + when('from', 'Bật từ') + when('to', 'Tắt lúc') +
                        '<span class="inv-tm-st" data-k="' + t.k + '"></span>' +
                        '<button type="button" class="inv-tm-all" data-k="' + t.k + '" title="Chép giờ bật / tắt của món này sang cả 4 món">Áp dụng cho cả 4 món</button></div>' +
                    '</div>';
            }).join('');
            box.addEventListener('input', function (e) { var el = e.target; if (el.classList && (el.classList.contains('att-num') || el.classList.contains('att-when'))) { el.classList.add('dirty'); AS.render(); } });
            box.addEventListener('change', function (e) { var el = e.target; if (el.type === 'checkbox' && el.dataset.k) AS.toggleItem(el.dataset.k, el); });
            box.addEventListener('click', function (e) {
                var b = e.target.closest && e.target.closest('.inv-tm-all'); if (!b) return;
                var src = {}; box.querySelectorAll('.att-when[data-k="' + b.dataset.k + '"]').forEach(function (el) { src[el.dataset.f] = el.value; });
                box.querySelectorAll('.att-when').forEach(function (el) { if (el.dataset.k === b.dataset.k || el.value === (src[el.dataset.f] || '')) return; el.value = src[el.dataset.f] || ''; el.classList.add('dirty'); });
                AS.render(); toast('Đã chép giờ cho cả 4 món — bấm "Lưu Thiết Lập Thưởng" để áp dụng.', 'info');
            });
        }
        // Bật / tắt 1 món: lưu NGAY (giữ số + giờ đã lưu; ô đang sửa vẫn chờ bấm Lưu)
        AS.toggleItem = function (k, cb) {
            var on = !!cb.checked, items = JSON.parse(JSON.stringify(AS.items)), t = TYPES.filter(function (x) { return x.k === k; })[0];
            items[k].on = on;
            if (on && !items[k].n) { var el = document.querySelector('.att-num[data-k="' + k + '"]'); items[k].n = int(el && el.value, 0) || t.def; if (el) el.classList.remove('dirty'); }
            db.collection('settings').doc('attendance_reward_items').set(AS.payload(items), { merge: true })
                .then(function () { toast((on ? 'Đã BẬT thưởng điểm danh: ' : 'Đã TẮT thưởng điểm danh: ') + t.name); })
                .catch(function () { toast('Lỗi lưu cấu hình', 'error'); cb.checked = !on; });
        };
        // Cấu hình đang thấy trên màn hình (bản đã lưu + các ô đang sửa)
        AS.form = function () {
            var items = JSON.parse(JSON.stringify(AS.items)), bad = false;
            document.querySelectorAll('#att-items .att-num').forEach(function (el) { var v = String(el.value).trim(), n = parseInt(v, 10); if (v !== '' && (isNaN(n) || n < 0 || n > 1e6)) bad = true; items[el.dataset.k].n = int(v, 0); });
            document.querySelectorAll('#att-items .att-when').forEach(function (el) { items[el.dataset.k][el.dataset.f] = fromInp(el.value); });
            var badTime = TYPES.filter(function (t) { var x = items[t.k]; return x.from && x.to && x.to <= x.from; }).map(function (t) { return t.name; });
            return { items: items, bad: bad, badTime: badTime };
        };
        AS.load = function (d) {
            AS.data = d || {}; AS.items = norm(AS.data); buildItems();
            TYPES.forEach(function (t) {
                var row = document.querySelector('#att-items .att-it[data-k="' + t.k + '"]'); if (!row) return;
                var x = AS.items[t.k], cb = row.querySelector('input[type="checkbox"]'), n = row.querySelector('.att-num');
                row.classList.toggle('off', !x.on); row.querySelector('.att-it-st').textContent = x.on ? 'BẬT' : 'TẮT';
                if (cb) cb.checked = x.on; if (n && !n.classList.contains('dirty')) n.value = x.n;
                row.querySelectorAll('.att-when').forEach(function (el) { if (!el.classList.contains('dirty')) el.value = toInp(x[el.dataset.f]); });
            });
            AS.render();
        };
        AS.saved = function () { document.querySelectorAll('#att-items .dirty').forEach(function (el) { el.classList.remove('dirty'); }); AS.render(); };
        AS.render = function () {
            if (!$('att-items')) return;
            var sc = AS.form(), items = sc.items, master = AS.data.isEnabled === true, now = Date.now(), lines = [], nxt = 0;
            TYPES.forEach(function (t) {
                var x = items[t.k], st = document.querySelector('#att-items .inv-tm-st[data-k="' + t.k + '"]'), row = st && st.closest('.att-it');
                var ph = phase(x, now), has = x.from || x.to, txt = '', cls = '';
                if (x.from && x.to && x.to <= x.from) { txt = '⚠ Giờ tắt phải sau giờ bật'; cls = 'end'; }
                else if (!has) txt = x.on ? 'Không hẹn giờ · phát ngay' : 'Không hẹn giờ';
                else if (ph === 'wait') { txt = '⏳ Chờ bật lúc ' + fmtT(x.from); cls = 'wait'; }
                else if (ph === 'end') { txt = '⛔ Đã tắt lúc ' + fmtT(x.to); cls = 'end'; }
                else { txt = '🟢 Đang phát' + (x.to ? ' · tắt lúc ' + fmtT(x.to) : ''); cls = 'live'; }
                if (has && !x.on) txt += ' (công tắc TẮT)';
                if (st) { st.textContent = txt; st.className = 'inv-tm-st ' + (x.on ? cls : ''); }
                if (row) row.classList.toggle('sleep', x.on && !!has && ph !== 'live');
                if (x.on && x.n > 0 && ph === 'wait' && (!nxt || x.from < nxt)) nxt = x.from;
                if (x.on && x.n > 0 && has && ph !== 'end') lines.push(t.icon + ' ' + esc(t.name) + ': ' + (ph === 'wait' ? 'từ <b>' + fmtT(x.from) + '</b>' : 'đang phát') + (x.to ? ' → tắt <b>' + fmtT(x.to) + '</b>' : ''));
            });
            var w = $('att-items-warn');
            if (w) {
                var now_ = AS.text(items), all = AS.text(items, false), h = '';
                if (!all) h = '<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Chưa bật vật phẩm nào (hoặc số = 0): điểm danh <b>chỉ ghi nhận</b>, không có thưởng.</span>';
                else {
                    h = now_ ? '<span class="text-muted">Điểm danh <b>lúc này</b> nhận: <b class="text-main">' + esc(now_) + '</b></span>'
                        : '<span class="text-warning"><i class="fa-solid fa-hourglass-half"></i> Lúc này chưa có món nào trong giờ phát: điểm danh <b>chỉ ghi nhận</b>, không có thưởng' + (nxt ? ' — món đầu tiên mở lúc <b>' + fmtT(nxt) + '</b>' : '') + '.</span>';
                    if (lines.length) h += '<div class="text-muted text-xs mt-1">' + lines.join(' · ') + '</div>';
                    if (!master) h += '<div class="text-danger text-xs mt-1"><i class="fa-solid fa-circle-info"></i> Công tắc tổng đang TẮT: điểm danh <b>chỉ ghi nhận</b>, không có thưởng.</div>';
                }
                if (document.querySelector('#att-items .dirty')) h += '<div class="text-warning text-xs mt-1 font-bold"><i class="fa-solid fa-circle-exclamation"></i> Chưa lưu — bấm "Lưu Thiết Lập Thưởng".</div>';
                w.innerHTML = h;
            }
        };
        document.addEventListener('change', function (e) { if (e.target && e.target.id === 'cfg-att-reward-toggle') { AS.data.isEnabled = !!e.target.checked; AS.render(); } });
        setInterval(function () { var b = $('att-items'); if (b && b.offsetParent !== null) AS.render(); }, 15000);
    })();
    
