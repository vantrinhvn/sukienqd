    /* ===== Admin > Quay số > Phần thưởng khi trúng số (settings/lucky_reward_config). Trao thưởng: window.LuckyReward ===== */
    (function () {
        'use strict';
        if (!document.getElementById('lr-card') || typeof db === 'undefined' || !window.LuckyReward) return;
        var $ = function (id) { return document.getElementById(id); };
        var LR = window.LuckyReward, REF = db.collection('settings').doc('lucky_reward_config');
        var toast = function (m, t) { if (typeof Utils !== 'undefined') Utils.toast(m, t || 'success'); };
        var me = function () { return (typeof State !== 'undefined' && State.currentUser) || 'admin'; };
        var A = window.LuckyRewardAdmin = { cfg: LR.norm(null), started: false, tried: {} };
        function fields() {
            document.querySelectorAll('#lr-card .lr-fields').forEach(function (box) {
                if (box.childElementCount) return; var g = box.dataset.g;
                box.innerHTML = LR.KEYS.map(function (k) { return '<label class="lr-f"><span>' + k[1] + '</span><input type="number" class="form-control lr-in" data-g="' + g + '" data-k="' + k[0] + '" min="0" inputmode="numeric" placeholder="0"></label>'; }).join('');
            });
        }
        function read() {
            var o = { main: {}, near: {} };
            document.querySelectorAll('#lr-card input[data-k]').forEach(function (i) { var v = parseInt(i.value, 10); o[i.dataset.g][i.dataset.k] = isNaN(v) || v < 0 ? 0 : v; });
            var n = function (id) { var v = parseInt(($(id) || {}).value, 10); return isNaN(v) || v < 0 ? 0 : v; };
            o.cash = n('lr-cash'); o.nearCash = n('lr-near-cash'); o.nearOn = !!($('lr-near-on') || {}).checked;
            var m = document.querySelector('#lr-card input[name="lr-mode"]:checked'); o.mode = m ? m.value : 'each';
            return o;
        }
        function status() { var st = $('lr-st'), c = A.cfg; $('lr-on').checked = c.on; st.textContent = c.on ? 'ĐANG BẬT' : 'ĐANG TẮT'; st.style.color = c.on ? 'var(--color-success)' : 'var(--text-muted)'; }
        function fill() {
            var c = A.cfg; fields();
            document.querySelectorAll('#lr-card input[data-k]').forEach(function (i) { var v = c[i.dataset.g][i.dataset.k]; i.value = v ? v : ''; });
            $('lr-cash').value = c.cash || ''; $('lr-near-cash').value = c.nearCash || ''; $('lr-near-on').checked = c.nearOn;
            document.querySelectorAll('#lr-card input[name="lr-mode"]').forEach(function (r) { r.checked = r.value === c.mode; });
            document.querySelectorAll('#lr-card .lr-in').forEach(function (i) { i.classList.remove('dirty'); }); $('lr-dirty').classList.add('hidden');
            status(); preview();
        }
        function preview() {
            var o = read(), main = Object.assign({ cash: o.cash }, o.main), near = Object.assign({ cash: o.nearCash }, o.near);
            $('lr-near-box').classList.toggle('off', !o.nearOn);
            var t = LR.text(main), tn = LR.text(near);
            $('lr-pv').innerHTML = (A.cfg.on ? '' : '<span class="text-warning font-bold">Đang tắt — chưa trao thưởng. </span>')
                + (t ? 'Trúng đúng số: <b>' + t + '</b>' + (o.mode === 'split' ? ' (chia đều cho số người trúng)' : ' / người') : '<span class="text-muted">Chưa đặt phần thưởng cho giải chính.</span>')
                + (o.nearOn ? (tn ? ' · Lệch 1 số: <b>' + tn + '</b>' + (o.mode === 'split' ? ' (chia đều)' : ' / người') : ' · <span class="text-muted">Giải phụ chưa có thưởng</span>') : '');
        }
        function clean() { document.querySelectorAll('#lr-card .lr-in.dirty').forEach(function (i) { i.classList.remove('dirty'); }); $('lr-dirty').classList.add('hidden'); }
        function dirty(e) { if (e.target.closest && e.target.closest('#lr-card') && e.target.classList.contains('lr-in')) { e.target.classList.add('dirty'); $('lr-dirty').classList.remove('hidden'); preview(); } }
        document.addEventListener('input', dirty); document.addEventListener('change', dirty);
        A.save = function () {
            var o = read(), b = $('lr-save');
            if (A.cfg.on && LR.empty(o.main, o.cash) && (!o.nearOn || LR.empty(o.near, o.nearCash))) { toast('Phần thưởng đang trống. Nhập ít nhất 1 mục hoặc TẮT trao thưởng.', 'warning'); return; }
            b.disabled = true; o.updatedAt = Date.now(); o.updatedBy = me();
            REF.set(o, { merge: true }).then(function () {
                clean();
                toast('Đã lưu phần thưởng Quay Số May Mắn.' + (A.cfg.on ? '' : ' Nhớ BẬT công tắc để bắt đầu trao thưởng.'));
                db.collection('admin_logs').add({ type: 'lucky_reward', action: 'save', user: '(hệ thống)', by: me(), cfg: o, timestamp: Date.now() }).catch(function () {});
            }).catch(function () { toast('Không lưu được.', 'error'); }).finally(function () { b.disabled = false; });
        };
        A.toggle = function (el) {
            var on = !!el.checked, o = read(), upd = { isEnabled: on, updatedAt: Date.now(), updatedBy: me() };
            if (on && LR.empty(o.main, o.cash) && (!o.nearOn || LR.empty(o.near, o.nearCash))) { el.checked = false; toast('Hãy nhập phần thưởng trước khi bật.', 'warning'); return; }
            if (on) { upd.since = Date.now(); Object.assign(upd, o); }   // chỉ trao cho phiên quay từ lúc bật (không trao bù phiên cũ)
            REF.set(upd, { merge: true }).then(function () {
                if (on) clean();   // bật = lưu luôn phần thưởng đang nhập
                toast(on ? 'Đã BẬT: từ bây giờ, ai trúng số sẽ tự được trao thưởng.' : 'Đã TẮT trao thưởng Quay Số.', on ? 'success' : 'info');
                db.collection('admin_logs').add({ type: 'lucky_reward', action: on ? 'enable' : 'disable', user: '(hệ thống)', by: me(), timestamp: Date.now() }).catch(function () {});
            }).catch(function () { el.checked = !on; toast('Không lưu được.', 'error'); });
        };
        /* Trao bù: phiên quay sau lúc bật, chưa được trao, trong 3 ngày (vd máy tự quay theo giờ bị đóng giữa chừng). Giao dịch đảm bảo không trao 2 lần. */
        A.catchUp = function (records) {
            var c = A.cfg; if (!c.on) return;
            (records || []).forEach(function (h) {
                var age = Date.now() - (h.timestamp || 0);
                if (!h.__id || h.rewarded || A.tried[h.__id] || (h.timestamp || 0) < (c.since || 0) - 60000 || age > 3 * 864e5 || age < 20000) return;
                A.tried[h.__id] = true;
                LR.award(h.__id, h.number, { winners: h.winners || [], ts: h.timestamp, round: h.round || null, source: (h.source || 'admin') + '+catchup' });
            });
        };
        A.start = function () {
            if (A.started) return; A.started = true; fields();
            REF.onSnapshot(function (d) {
                A.cfg = LR.norm(d.exists ? d.data() : null);
                if (!document.querySelector('#lr-card .lr-in.dirty')) fill(); else { status(); preview(); }
            }, function () {});
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fields); else fields();
    })();
    
