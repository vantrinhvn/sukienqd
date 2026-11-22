    /* ===== Tab "Vòng Quay": hiện số lượt quay + trạng thái đóng/mở, bấm để mở qt.html ===== */
    (function () {
        'use strict';
        var $ = function (id) { return document.getElementById(id); };
        function ts(d, t) { if (!(d && t)) return null; var v = new Date(d + 'T' + t).getTime(); return isNaN(v) ? null : v; }
        /* Mở qt.html ngay trong tab này: lưu phiên tạm (sessionStorage, chỉ tab này, tự hết hạn sau 10 phút)
           để khi quay lại user.html thì tự đăng nhập lại, không phải gõ lại mật khẩu. */
        document.addEventListener('click', function (e) {
            var a = e.target && e.target.closest ? e.target.closest('#wheel-tab, #rx-tab, [data-resume]') : null;
            if (!a || e.defaultPrevented) return;
            try {
                var u = window.State && window.State.currentUser, p = ($('login-pwd') || {}).value;
                if (u && p) sessionStorage.setItem('qd_resume', JSON.stringify({ u: u, p: p, t: Date.now() }));
            } catch (err) {}
        }, true);
        window.addEventListener('pageshow', function (e) { if (e.persisted) { try { sessionStorage.removeItem('qd_resume'); } catch (err) {} } });
        document.addEventListener('DOMContentLoaded', function () {
            try {
                var raw = sessionStorage.getItem('qd_resume'); if (!raw) return;
                sessionStorage.removeItem('qd_resume');                       // dùng một lần
                var r = JSON.parse(raw);
                if (!r || !r.u || !r.p || Date.now() - r.t > 600000) return;
                $('login-usr').value = r.u; $('login-pwd').value = r.p;
                setTimeout(function () { var b = $('btn-login'); if (b && !b.disabled) b.click(); }, 700);
            } catch (err) {}
        });
        /* ===== QVis: quyết định câu hỏi nào đang HIỆN cho người dùng (dùng chung admin.html & qt.html) =====
           settings/wheel_config.quiz = { mode: 'all' (lần lượt theo thứ tự) | 'random', count (0 = tất cả), rotateMin, start: 'HH:MM', end: 'HH:MM' }
           wheel_questions/{id}.showAt / hideAt (ms, tùy chọn) = hẹn giờ hiện / ẩn từng câu */
        const QVis = {
            cfg(q) {
                q = q || {}; const mode = q.mode === 'random' ? 'random' : 'all', n = parseInt(q.count);
                // count: số câu hiện cùng lúc, áp dụng cho CẢ 2 chế độ; 0 = hiện tất cả (mặc định: lần lượt = tất cả, ngẫu nhiên = 3)
                return { mode, count: isNaN(n) ? (mode === 'random' ? 3 : 0) : Math.min(50, Math.max(0, n)), rotateMin: Math.max(0, parseInt(q.rotateMin) || 0), start: q.start || '', end: q.end || '' };
            },
            KEEP_MS: 5000,    // câu vừa có NGƯỜI KHÁC trả lời đúng còn hiện 5 giây (thấy kết quả "đã có người xác thực") rồi nhường chỗ cho câu mới
            mins(hhmm) { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; },
            // Khung giờ hiện câu hỏi hằng ngày -> { open, next: thời điểm đóng/mở kế tiếp (ms) }
            win(c, now) {
                const s = this.mins(c.start), e = this.mins(c.end);
                if (s == null || e == null || s === e) return { open: true, next: null };
                const d = new Date(now), cur = d.getHours() * 60 + d.getMinutes();
                const open = s < e ? (cur >= s && cur < e) : (cur >= s || cur < e);
                const target = open ? e : s, t = new Date(now);
                t.setHours(Math.floor(target / 60), target % 60, 0, 0);
                if (t.getTime() <= now) t.setDate(t.getDate() + 1);
                return { open, next: t.getTime() };
            },
            // Phiên đổi câu: mỗi rotateMin phút (hoặc mỗi ngày nếu = 0) -> mọi người cùng thấy 1 bộ câu hỏi
            slot(c, now) {
                if (c.rotateMin > 0) { const ms = c.rotateMin * 60000, k = Math.floor(now / ms); return { key: 'r' + k, idx: k, start: k * ms, end: (k + 1) * ms }; }
                const d = new Date(now); d.setHours(0, 0, 0, 0); const st = d.getTime(), e = new Date(st); e.setDate(e.getDate() + 1);
                return { key: 'd' + d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(), idx: Math.round(st / 86400000), start: st, end: e.getTime() };
            },
            inTime(q, now) { return q.active !== false && (!q.showAt || now >= q.showAt) && (!q.hideAt || now < q.hideAt); },
            h(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; },
            compute(all, quizCfg, now, me) {
                const c = this.cfg(quizCfg), w = this.win(c, now), sl = this.slot(c, now);
                let up = Infinity;
                all.forEach(q => { if (q.active !== false && !q.claimedBy && q.showAt && q.showAt > now && (!q.hideAt || q.hideAt > q.showAt)) up = Math.min(up, q.showAt); });
                let list = [];
                if (w.open) {
                    const pool = all.filter(q => this.inTime(q, now));
                    let sorted;
                    if (c.mode === 'random') {
                        // VÒNG XOAY: mọi câu xếp theo 1 thứ tự trộn cố định (cả câu đã có người trả lời, để vòng không bị xô lệch),
                        // mỗi phiên dịch sang nhóm câu KẾ TIẾP -> câu không ai trả lời được sẽ được thay bằng câu khác, đi hết 1 vòng mới lặp lại.
                        // Ô nào trong nhóm đã có người trả lời -> lấy bù câu ở GIỮA vòng (xa các phiên sắp tới nhất, tránh lặp lại ngay phiên sau).
                        // (trước đây cách trộn theo phiên quá yếu nên đổi phiên hay ra lại đúng câu cũ)
                        const ring = pool.slice().sort((a, b) => this.h(a.id) - this.h(b.id) || (a.id < b.id ? -1 : 1));
                        const N = ring.length, step = c.count > 0 ? Math.min(c.count, N) : N, off = N ? (sl.idx * step) % N : 0;
                        const win = [], rest = [];
                        for (let k = 0; k < N; k++) (k < step ? win : rest).push(ring[(off + k) % N]);
                        const mid = Math.floor(rest.length / 2);
                        sorted = win.concat(rest.slice(mid), rest.slice(0, mid));
                    } else sorted = pool.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));   // lần lượt: theo thứ tự tạo
                    // Chỗ hiện câu hỏi LUÔN dành cho câu CHƯA ai trả lời: câu đã có người xác thực (kể cả chính mình) không chiếm chỗ
                    // -> trả lời xong / bị người khác trả lời trước là có ngay câu kế tiếp hiện lên thay
                    let open = sorted.filter(q => !q.claimedBy);
                    if (c.count > 0) open = open.slice(0, c.count);
                    const keep = new Set(open);
                    sorted.forEach(q => { if (q.claimedBy && q.claimedBy !== me && now - (q.claimedAt || 0) < this.KEEP_MS) keep.add(q); });
                    list = sorted.filter(q => keep.has(q));
                }
                // Câu mình đã trả lời đúng: ẨN khỏi danh sách (lượt quay đã cộng vào bộ đếm, không hiện lại câu hỏi)
                return { list, cfg: c, open: w.open, next: w.next, slotEnd: c.mode === 'random' ? sl.end : null, upcoming: isFinite(up) ? up : null };
            },
            fmtClock(ms) { const d = new Date(ms), n = new Date(), p = x => String(x).padStart(2, '0'); const hm = p(d.getHours()) + ':' + p(d.getMinutes()); return d.toDateString() === n.toDateString() ? hm : hm + ' ' + p(d.getDate()) + '/' + p(d.getMonth() + 1); },
            fmtLeft(ms) { ms = Math.max(0, ms); const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60, p = v => String(v).padStart(2, '0'); return (h ? h + ':' + p(m) : m) + ':' + p(x); }
        };
        window.WheelTab = {
            qs: null, cfg: null, started: false, unsub: null, unsubCfg: null, timer: null,
            start: function () {
                var self = this;
                if (this.started) return;
                if (!window.State || !window.State.currentDocId || typeof db === 'undefined') return;
                this.started = true;
                try {
                    this.unsub = db.collection('wheel_questions').onSnapshot(function (snap) {
                        self.qs = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); self.render();
                    }, function (e) { console.warn('WheelTab questions', e); self.qs = []; self.render(); });
                    this.unsubCfg = db.collection('settings').doc('wheel_config').onSnapshot(function (snap) {
                        self.cfg = snap && snap.exists ? snap.data() : {}; self.render();
                    }, function (e) { console.warn('WheelTab cfg', e); self.cfg = {}; self.render(); });
                } catch (e) { console.warn('WheelTab start', e); }
                this.timer = setInterval(function () { self.render(); }, 5000);
            },
            stop: function () {
                this.started = false;
                ['unsub', 'unsubCfg'].forEach(function (k) { if (this[k]) { try { this[k](); } catch (e) {} this[k] = null; } }, this);
                if (this.timer) { clearInterval(this.timer); this.timer = null; }
            },
            locked: function () {
                var c = this.cfg || {};
                if (c.isEnabled === false) return true;
                var dl = ts(c.endDate, c.endTime);
                return !!(dl && Date.now() >= dl);
            },
            render: function () {
                var tab = $('wheel-tab'); if (!tab) return;
                var lock = this.locked(), me = window.State && window.State.currentUser, qs = this.qs, tickets = 0, open = 0;
                (qs || []).forEach(function (q) { if (q.claimedBy === me && q.ticketUsed !== true) tickets++; });
                tickets += Number(window.State && window.State.availableSpins) || 0;   // lượt quay trong tài khoản (mã mời / đổi điểm...)

                // Chỉ đếm câu người dùng đang thực sự thấy (theo cài đặt hiển thị trong admin: số câu, ngẫu nhiên, hẹn giờ, khung giờ)
                if (qs) QVis.compute(qs, this.cfg && this.cfg.quiz, Date.now(), null).list.forEach(function (q) { if (!q.claimedBy) open++; });
                tab.dataset.state = lock ? 'locked' : 'open';
                $('wheel-tab-sub').textContent = lock ? 'Đang khóa' : (qs == null ? 'Đang tải...' : (tickets > 0 ? 'Lượt quay: ' + tickets : (open > 0 ? open + ' câu hỏi đang mở' : 'Chưa có câu hỏi')));
                $('wheel-tab-go').textContent = lock ? '🔒 Vòng quay đang đóng' : (tickets > 0 ? 'Chạm để quay thưởng ›' : (open > 0 ? 'Trả lời câu hỏi để nhận lượt quay ›' : 'Chạm để xem vòng quay ›'));
            },
            syncHeight: function () { // luôn cao bằng thẻ lì xì (đọc layout 1 lần, chỉ ghi khi chiều cao đổi)
                var lx = $('lixi-card'); if (!lx || !$('wheel-tab')) return;
                var h = lx.offsetHeight + 'px', k = h + '|' + document.querySelectorAll('#wheel-tab, #rx-tab, #shop-tab, #ln-tab').length; if (k === this._h) return; this._h = k;
                var e0 = $('wheel-tab'); if (e0) e0.style.minHeight = h; var e1 = $('rx-tab'); if (e1) e1.style.minHeight = h; var e2 = $('shop-tab'); if (e2) e2.style.minHeight = h; var e3 = $('ln-tab'); if (e3) e3.style.minHeight = h;
            }
        };

        /* ===== Tab "Rút Lì Xì": hiện số lượt rút (tickets) + trạng thái đóng/mở (settings/tranhthuong_config), bấm để mở tranht.html ===== */
        window.RxTab = {
            n: null, cfg: null, started: false, unsub: null, unsubCfg: null, timer: null,
            start: function () {
                var self = this;
                if (this.started) return;
                if (!window.State || !window.State.currentDocId || typeof db === 'undefined') return;
                this.started = true;
                try {
                    this.unsub = db.collection('accounts').doc(window.State.currentDocId).onSnapshot(function (snap) {
                        var d = snap && snap.exists ? snap.data() : {};
                        self.n = Number(d.tickets) || 0; self.render();
                    }, function (e) { console.warn('RxTab acc', e); });
                    this.unsubCfg = db.collection('settings').doc('tranhthuong_config').onSnapshot(function (snap) {
                        self.cfg = snap && snap.exists ? snap.data() : {}; self.render();
                    }, function (e) { console.warn('RxTab cfg', e); self.cfg = {}; self.render(); });
                } catch (e) { console.warn('RxTab start', e); }
                this.timer = setInterval(function () { self.render(); }, 15000);   // bắt kịp giờ hẹn đóng
            },
            stop: function () {
                this.started = false;
                ['unsub', 'unsubCfg'].forEach(function (k) { if (this[k]) { try { this[k](); } catch (e) {} this[k] = null; } }, this);
                if (this.timer) { clearInterval(this.timer); this.timer = null; }
            },
            locked: function () {
                var c = this.cfg || {};
                if (c.isEnabled === false) return true;
                var dl = ts(c.endDate, c.endTime);
                return !!(dl && Date.now() >= dl);
            },
            render: function () {
                var tab = $('rx-tab'); if (!tab) return;
                var lock = this.locked(), n = this.n;
                tab.dataset.state = lock ? 'locked' : 'open';
                $('rx-tab-sub').textContent = n == null ? 'Lượt rút: --' : 'Lượt rút: ' + n;
                $('rx-tab-go').textContent = lock ? '🔒 Đang đóng' : (n > 0 ? 'Chạm để mở lì xì ›' : 'Hết lượt rút · chạm để xem ›');
            }
        };
        function bindSync() {
            var lx = $('lixi-card'); if (!lx) return;
            window.WheelTab.syncHeight();
            if (window.ResizeObserver) new ResizeObserver(function () { window.WheelTab.syncHeight(); }).observe(lx);
            window.addEventListener('resize', function () { window.WheelTab.syncHeight(); });
            setInterval(function () { window.WheelTab.syncHeight(); }, 1000);   // dự phòng
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindSync); else bindSync();
    })();
    
