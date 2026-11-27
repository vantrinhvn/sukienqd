    /* ===== THƯỞNG VẬT PHẨM ĐIỂM DANH (admin) =====
       settings/attendance_reward_items = {
         isEnabled: bool,                                                                  // công tắc tổng
         items: { points | tickets | spins | conThrows: { on, n, ds, de, from: 0, to: 0 } },
             ds / de = GIỜ PHÁT MỖI NGÀY 'HH:MM' (giờ Việt Nam, '' = từ đầu ngày / tới cuối ngày; de < ds = qua nửa đêm),
             lặp lại mỗi ngày mới. Máy chủ (qd-vps-28+) đọc ds / de.
         tickets: số, spins: 0                                                             // (cũ) để bản cũ đọc được
         from / to (ms)                                                                    // (cũ) ngày giờ cố định: chỉ phát 1 lần trong khoảng đó.
       }   Cấu hình cũ (from / to) được đổi sang giờ mỗi ngày trên màn hình -> bấm Lưu để áp dụng. */
    (function () {
        var $ = function (id) { return document.getElementById(id); };
        var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
        var HM = /^([01]\d|2[0-3]):[0-5]\d$/;
        function vnMin(t) { var d = new Date((t || Date.now()) + 7 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); }   // phút trong ngày, giờ Việt Nam
        function vnHM(t) { var d = new Date(t + 7 * 3600e3); return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()); }
        function mins(hm) { var p = String(hm || '').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); }
        function fmtT(t) { var d = new Date(t + 7 * 3600e3); return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ' ' + p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1); }
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
        function hm(v) { return HM.test(String(v || '')) ? String(v) : ''; }
        function norm(d) {
            d = d || {}; var it = d.items && typeof d.items === 'object' ? d.items : null, out = {}, gf = ms(d.from), gt = ms(d.to);
            TYPES.forEach(function (t) {
                var x = it ? (it[t.k] || {}) : {};
                var o = it ? { on: x.on === true, n: int(x.n, 0) }
                    : (t.k === 'tickets' ? (function (n) { return { on: n > 0, n: n || t.def }; })(int(d.tickets, 0)) : { on: false, n: t.def });
                if (typeof x.ds === 'string' || typeof x.de === 'string') { o.ds = hm(x.ds); o.de = hm(x.de); o.from = 0; o.to = 0; }
                else {   // cấu hình cũ: ngày giờ cố định (món chưa có giờ riêng dùng giờ chung bản 13)
                    o.from = x.from !== undefined ? ms(x.from) : gf; o.to = x.to !== undefined ? ms(x.to) : gt;
                    o.legacy = !!(o.from || o.to);
                    o.ds = o.from ? vnHM(o.from) : ''; o.de = o.to ? vnHM(o.to) : '';   // đổi sang giờ mỗi ngày để hiện trên màn hình
                    if ((o.from && o.to && o.to - o.from >= 864e5) || (o.ds && o.ds === o.de)) { o.ds = ''; o.de = ''; }   // kéo dài từ 1 ngày trở lên = cả ngày
                }
                out[t.k] = o;
            });
            return out;
        }
        // Trạng thái 1 món lúc now: live (đang phát) · wait (hôm nay chưa tới giờ) · done (hôm nay hết giờ, mai phát lại) · end (cũ: đã hết hạn hẳn)
        function phase(x, now) {
            now = now || Date.now();
            if (x.legacy && x.saved) { if (x.from && now < x.from) return 'wait'; if (x.to && now >= x.to) return 'end'; return 'live'; }
            if (!x.ds && !x.de) return 'live';
            var c = vnMin(now), a = x.ds ? mins(x.ds) : 0, b = x.de ? mins(x.de) : 1440;
            if (a === b) return 'live';
            if (a < b) return c >= a && c < b ? 'live' : c < a ? 'wait' : 'done';
            return c >= a || c < b ? 'live' : 'wait';
        }
        // Vật phẩm phát tại thời điểm now (bỏ qua công tắc tổng): món bật, số > 0, trong giờ
        function giveItems(items, now) { var g = {}; TYPES.forEach(function (t) { var x = items[t.k]; if (x.on && x.n > 0 && phase(x, now) === 'live') g[t.k] = x.n; }); return g; }
        function cfgItems(items) { var g = {}; TYPES.forEach(function (t) { var x = items[t.k]; if (x.on && x.n > 0) g[t.k] = x.n; }); return g; }
        function winTxt(x) { return x.ds && x.de ? x.ds + ' – ' + x.de : x.ds ? 'từ ' + x.ds : x.de ? 'tới ' + x.de : 'cả ngày'; }
        var AS = window.AttSched = { data: {}, items: norm(null), TYPES: TYPES, norm: norm, att: { start: '09:00', end: '10:00' } };
        // Ước vật phẩm của 1 lần điểm danh cũ theo cấu hình hiện tại: cấu hình cũ (ngày giờ cố định) thì theo đúng ngày giờ đó
        AS.give = function (d, now) { var it = norm(d); TYPES.forEach(function (t) { it[t.k].saved = true; }); return giveItems(it, now); };
        AS.text = function (items, now) { var g = now === false ? cfgItems(items) : giveItems(items, now); return TYPES.filter(function (t) { return g[t.k]; }).map(function (t) { return t.icon + ' +' + g[t.k].toLocaleString('vi-VN') + ' ' + t.unit; }).join(', '); };
        AS.payload = function (items) {
            var o = { items: {}, spins: 0, tickets: items.tickets.on ? items.tickets.n : 0, from: 0, to: 0, updatedAt: Date.now() };
            TYPES.forEach(function (t) { var x = items[t.k]; o.items[t.k] = { on: !!x.on, n: x.n, ds: hm(x.ds), de: hm(x.de), from: 0, to: 0 }; });
            return o;
        };
        function buildItems() {
            var box = $('att-items'); if (!box || box.childElementCount) return;
            box.innerHTML = TYPES.map(function (t) {
                var when = function (f, lbl) { return '<div class="inv-tm-f"><span>' + lbl + '</span><input type="time" class="form-control att-when" data-k="' + t.k + '" data-f="' + f + '" aria-label="' + esc(t.name + ' – ' + lbl.toLowerCase() + ' (mỗi ngày)') + '"></div>'; };
                return '<div class="att-it off" data-k="' + t.k + '" style="--tone:' + t.tone + '">' +
                    '<div class="att-it-name"><span class="att-it-ico" aria-hidden="true">' + t.icon + '</span><div><b>' + esc(t.name) + '</b><small>' + esc(t.note) + '</small></div></div>' +
                    '<div class="att-it-n"><input type="number" class="form-control inv-num att-num" data-k="' + t.k + '" min="0" max="1000000" inputmode="numeric" aria-label="' + esc('Số ' + t.name) + '"><span>' + esc(t.unit) + '</span></div>' +
                    '<div class="att-it-sw"><span class="att-it-st">TẮT</span><label class="switch" title="Bật / tắt ' + esc(t.name) + '"><input type="checkbox" data-k="' + t.k + '" aria-label="Bật / tắt ' + esc(t.name) + '"><span class="slider"></span></label></div>' +
                    '<div class="inv-rw-time att-it-time"><span class="inv-tm-lbl">⏰ Giờ phát mỗi ngày</span>' + when('ds', 'Từ') + when('de', 'Đến') +
                        '<span class="inv-tm-st" data-k="' + t.k + '"></span>' +
                        '<button type="button" class="inv-tm-clr" data-k="' + t.k + '" title="Xóa giờ: phát suốt giờ điểm danh">Cả ngày</button>' +
                        '<button type="button" class="inv-tm-all" data-k="' + t.k + '" title="Chép giờ phát của món này sang cả 4 món">Áp dụng cho cả 4 món</button></div>' +
                    '</div>';
            }).join('');
            box.addEventListener('input', function (e) { var el = e.target; if (el.classList && (el.classList.contains('att-num') || el.classList.contains('att-when'))) { el.classList.add('dirty'); AS.render(); } });
            box.addEventListener('change', function (e) { var el = e.target; if (el.type === 'checkbox' && el.dataset.k) AS.toggleItem(el.dataset.k, el); else if (el.classList && el.classList.contains('att-when')) { el.classList.add('dirty'); AS.render(); } });
            box.addEventListener('click', function (e) {
                var c = e.target.closest && e.target.closest('.inv-tm-clr');
                if (c) { box.querySelectorAll('.att-when[data-k="' + c.dataset.k + '"]').forEach(function (el) { if (el.value) { el.value = ''; el.classList.add('dirty'); el.dispatchEvent(new Event('change', { bubbles: false })); } }); AS.render(); return; }
                var b = e.target.closest && e.target.closest('.inv-tm-all'); if (!b) return;
                var src = {}; box.querySelectorAll('.att-when[data-k="' + b.dataset.k + '"]').forEach(function (el) { src[el.dataset.f] = el.value; });
                box.querySelectorAll('.att-when').forEach(function (el) { if (el.dataset.k === b.dataset.k || el.value === (src[el.dataset.f] || '')) return; el.value = src[el.dataset.f] || ''; el.classList.add('dirty'); });
                AS.render(); toast('Đã chép giờ phát cho cả 4 món — bấm "Lưu Thiết Lập Thưởng" để áp dụng.', 'info');
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
            document.querySelectorAll('#att-items .att-when').forEach(function (el) { items[el.dataset.k][el.dataset.f] = hm(String(el.value || '').slice(0, 5)); });
            TYPES.forEach(function (t) { items[t.k].legacy = false; items[t.k].from = 0; items[t.k].to = 0; });   // trên màn hình luôn là giờ mỗi ngày
            var badTime = TYPES.filter(function (t) { var x = items[t.k]; return x.ds && x.de && x.ds === x.de; }).map(function (t) { return t.name; });
            return { items: items, bad: bad, badTime: badTime };
        };
        AS.load = function (d) {
            AS.data = d || {}; AS.items = norm(AS.data); buildItems(); watchAtt();
            TYPES.forEach(function (t) {
                var row = document.querySelector('#att-items .att-it[data-k="' + t.k + '"]'); if (!row) return;
                var x = AS.items[t.k], cb = row.querySelector('input[type="checkbox"]'), n = row.querySelector('.att-num');
                row.classList.toggle('off', !x.on); row.querySelector('.att-it-st').textContent = x.on ? 'BẬT' : 'TẮT';
                if (cb) cb.checked = x.on; if (n && !n.classList.contains('dirty')) n.value = x.n;
                row.querySelectorAll('.att-when').forEach(function (el) {
                    if (el.classList.contains('dirty')) return;
                    el.value = x[el.dataset.f] || '';
                    if (x.legacy) el.classList.add('dirty');   // cấu hình cũ đã đổi sang giờ mỗi ngày: cần bấm Lưu
                    el.dispatchEvent(new Event('change', { bubbles: false }));   // ô chọn giờ 24h (qd-time24) cập nhật theo
                });
            });
            AS.render();
        };
        var attWatched = false;
        function watchAtt() {   // giờ mở cổng điểm danh: để cảnh báo món có giờ phát nằm ngoài giờ điểm danh
            if (attWatched || typeof db === 'undefined') return; attWatched = true;
            db.collection('settings').doc('attendance').onSnapshot(function (x) { var a = x.exists ? x.data() || {} : {}; AS.att = { start: a.start || '09:00', end: a.end || '10:00' }; AS.render(); }, function () {});
        }
        function overlap(x) {   // khung giờ phát của món có chạm khung giờ điểm danh không
            if (!x.ds && !x.de) return true;
            var s = mins(AS.att.start), e = mins(AS.att.end);
            for (var m = s; m <= e; m++) { var a = x.ds ? mins(x.ds) : 0, b = x.de ? mins(x.de) : 1440; if (a === b || (a < b ? m >= a && m < b : m >= a || m < b)) return true; }
            return false;
        }
        AS.saved = function () { document.querySelectorAll('#att-items .dirty').forEach(function (el) { el.classList.remove('dirty'); }); AS.render(); };
        AS.render = function () {
            if (!$('att-items')) return;
            var sc = AS.form(), items = sc.items, master = AS.data.isEnabled === true, now = Date.now(), lines = [], outside = [], legacy = false;
            TYPES.forEach(function (t) {
                var x = items[t.k], st = document.querySelector('#att-items .inv-tm-st[data-k="' + t.k + '"]'), row = st && st.closest('.att-it');
                var ph = phase(x, now), has = x.ds || x.de, txt = '', cls = '';
                if (AS.items[t.k].legacy && x.on) legacy = true;
                if (x.ds && x.de && x.ds === x.de) { txt = '⚠ Giờ "Từ" và "Đến" không được trùng nhau'; cls = 'end'; }
                else if (!has) txt = x.on ? 'Phát suốt giờ điểm danh · mỗi ngày' : 'Cả ngày';
                else if (ph === 'live') { txt = '🟢 Đang phát · tới ' + (x.de || '24:00') + ' hôm nay'; cls = 'live'; }
                else if (ph === 'wait') { txt = '⏳ Hôm nay phát từ ' + (x.ds || '00:00'); cls = 'wait'; }
                else { txt = '🌙 Hôm nay đã hết giờ · mai phát lại lúc ' + (x.ds || '00:00'); cls = 'wait'; }
                if (has && !x.on) txt += ' (công tắc TẮT)';
                if (st) { st.textContent = txt; st.className = 'inv-tm-st ' + (x.on ? cls : ''); }
                if (row) row.classList.toggle('sleep', x.on && !!has && ph !== 'live');
                if (x.on && x.n > 0 && has) lines.push(t.icon + ' ' + esc(t.name) + ': <b>' + esc(winTxt(x)) + '</b>');
                if (x.on && x.n > 0 && !overlap(x)) outside.push(t.name);
            });
            var w = $('att-items-warn');
            if (w) {
                var now_ = AS.text(items), all = AS.text(items, false), h = '';
                if (!all) h = '<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Chưa bật vật phẩm nào (hoặc số = 0): điểm danh <b>chỉ ghi nhận</b>, không có thưởng.</span>';
                else {
                    h = now_ ? '<span class="text-muted">Điểm danh <b>lúc này</b> nhận: <b class="text-main">' + esc(now_) + '</b></span>'
                        : '<span class="text-warning"><i class="fa-solid fa-hourglass-half"></i> Lúc này chưa có món nào trong giờ phát: điểm danh lúc này <b>chỉ ghi nhận</b>, không có thưởng.</span>';
                    if (lines.length) h += '<div class="text-muted text-xs mt-1">Giờ phát mỗi ngày (lặp lại mỗi ngày mới): ' + lines.join(' · ') + '</div>';
                    if (outside.length) h += '<div class="text-danger text-xs mt-1"><i class="fa-solid fa-triangle-exclamation"></i> ' + esc(outside.join(', ')) + ': giờ phát nằm ngoài giờ điểm danh (<b>' + esc(AS.att.start) + ' – ' + esc(AS.att.end) + '</b>) nên sẽ không bao giờ phát.</div>';
                    if (!master) h += '<div class="text-danger text-xs mt-1"><i class="fa-solid fa-circle-info"></i> Công tắc tổng đang TẮT: điểm danh <b>chỉ ghi nhận</b>, không có thưởng.</div>';
                }
                if (legacy) h += '<div class="text-warning text-xs mt-1 font-bold"><i class="fa-solid fa-clock-rotate-left"></i> Cấu hình cũ hẹn theo ngày giờ cố định (hết giờ là tắt hẳn). Đã đổi sang giờ phát mỗi ngày ở các ô trên — bấm "Lưu Thiết Lập Thưởng" để áp dụng.</div>';
                else if (document.querySelector('#att-items .dirty')) h += '<div class="text-warning text-xs mt-1 font-bold"><i class="fa-solid fa-circle-exclamation"></i> Chưa lưu — bấm "Lưu Thiết Lập Thưởng".</div>';
                w.innerHTML = h;
            }
        };
        document.addEventListener('change', function (e) { if (e.target && e.target.id === 'cfg-att-reward-toggle') { AS.data.isEnabled = !!e.target.checked; AS.render(); } });
        setInterval(function () { var b = $('att-items'); if (b && b.offsetParent !== null) AS.render(); }, 15000);
    })();
