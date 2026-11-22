    /* ===== LÌ XÌ: rút 1 lần / ngày, cộng "Điểm lì xì", có hiệu ứng + âm thanh =====
       Cấu hình (phần thưởng, đóng/mở, ngân sách) do Admin đặt tại settings/lixi_config. */
    (function () {
        'use strict';
        var DEFAULT_PRIZES = [
            { points: 8, chance: 35 }, { points: 18, chance: 30 }, { points: 28, chance: 20 },
            { points: 38, chance: 10 }, { points: 68, chance: 4 }, { points: 88, chance: 1 }
        ];

        var $ = function (id) { return document.getElementById(id); };
        var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
        var reduced = function () { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        var dateKey = function (d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

        function normCfg(d) {
            d = d || {};
            var prizes = (Array.isArray(d.prizes) ? d.prizes : []).map(function (p) {
                return { points: Math.floor(Number(p && p.points)), chance: Number(p && p.chance) };
            }).filter(function (p) { return p.points >= 1 && isFinite(p.chance) && p.chance >= 0; });
            if (!prizes.some(function (p) { return p.chance > 0; })) prizes = DEFAULT_PRIZES.slice();
            return {
                isEnabled: d.isEnabled !== false, endDate: d.endDate || '', endTime: d.endTime || '', openDate: d.openDate || '', openTime: d.openTime || '',
                closedMessage: d.closedMessage || '', prizes: prizes,
                bigThreshold: Number(d.bigThreshold) > 0 ? Number(d.bigThreshold) : 68,
                dailyBudget: Math.max(0, Math.floor(Number(d.dailyBudget) || 0)),
                allowRedraw: d.allowRedraw === true, maxPerDay: Math.min(50, Math.max(2, Math.floor(Number(d.maxPerDay)) || 3))
            };
        }
        function ts(d, t) { if (!(d && t)) return null; var v = new Date(d + 'T' + t).getTime(); return isNaN(v) ? null : v; }
        // 'closed' (tắt thủ công / quá giờ đóng) | 'upcoming' (chưa tới giờ mở, kèm opensAt) | 'open'
        function cfgPhase(c) {
            if (!c.isEnabled) return { phase: 'closed' };
            var op = ts(c.openDate, c.openTime), dl = ts(c.endDate, c.endTime), n = Date.now();
            if (op && n < op) return { phase: 'upcoming', opensAt: op };
            if (dl && n >= dl) return { phase: 'closed' };
            return { phase: 'open' };
        }
        function cfgOpen(c) { return cfgPhase(c).phase === 'open'; }
        function drawLimit(c) { return c.allowRedraw ? c.maxPerDay : 1; }  // số lượt rút tối đa / ngày
        function countdown(ms) {
            var d = Math.max(0, Math.floor(ms / 1000)), days = Math.floor(d / 86400);
            return (days ? days + ' ngày ' : '') + pad(Math.floor(d % 86400 / 3600)) + ':' + pad(Math.floor(d % 3600 / 60)) + ':' + pad(d % 60);
        }
        function fmtOpen(ms) { var x = new Date(ms); return pad(x.getHours()) + ':' + pad(x.getMinutes()) + ' ' + pad(x.getDate()) + '/' + pad(x.getMonth() + 1) ; }
        function pickWeighted(list) {
            var tot = list.reduce(function (a, p) { return a + p.chance; }, 0), r;
            try { var u = new Uint32Array(1); crypto.getRandomValues(u); r = u[0] / 4294967296 * tot; } catch (e) { r = Math.random() * tot; }
            var sum = 0;
            for (var i = 0; i < list.length; i++) { sum += list[i].chance; if (r < sum) return list[i].points; }
            return list[0].points;
        }

        /* ---- âm thanh tổng hợp bằng Web Audio (không cần file mp3) ---- */
        var FX = {
            ctx: null,
            unlock: function () {
                try {
                    if (!this.ctx) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return; this.ctx = new C(); }
                    if (this.ctx.state === 'suspended') this.ctx.resume();
                } catch (e) {}
            },
            noise: function (t, dur, f0, f1, vol, q) {
                var c = this.ctx, n = Math.max(1, Math.floor(c.sampleRate * dur));
                var buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
                for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
                var src = c.createBufferSource(); src.buffer = buf;
                var f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q || 1.2;
                f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
                var g = c.createGain();
                g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
                src.connect(f); f.connect(g); g.connect(c.destination); src.start(t); src.stop(t + dur);
            },
            tone: function (t, freq, dur, vol, type, freqEnd) {
                var c = this.ctx, o = c.createOscillator(), g = c.createGain();
                o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
                if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
                g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
                o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
            },
            rustle: function () { // tiếng lắc bao lì xì
                try {
                    this.unlock(); var t = this.ctx.currentTime;
                    [0, 0.08, 0.19, 0.3, 0.4, 0.5].forEach(function (o) { FX.noise(t + o, 0.07, 1500 + Math.random() * 1800, 3500 + Math.random() * 1500, 0.16, 1.5); });
                } catch (e) {}
            },
            pop: function () { // bật nắp
                try { this.unlock(); var t = this.ctx.currentTime; this.tone(t, 260, 0.1, 0.22, 'sine', 880); this.noise(t, 0.06, 2500, 5000, 0.1, 1); } catch (e) {}
            },
            whoosh: function () { // tờ tiền trượt lên
                try { this.unlock(); var t = this.ctx.currentTime; this.noise(t, 0.3, 500, 2600, 0.12, 0.8); } catch (e) {}
            },
            coin: function (big) { // tiếng "ting" đồng xu / chuông may mắn
                try {
                    this.unlock(); var t = this.ctx.currentTime;
                    var notes = big ? [1046.5, 1318.5, 1568, 2093, 2637, 3136] : [1318.5, 1760, 2093];
                    notes.forEach(function (f, i) {
                        FX.tone(t + i * 0.09, f, 0.75, 0.2, 'triangle');
                        FX.tone(t + i * 0.09, f * 2, 0.5, 0.06, 'sine');
                    });
                    this.noise(t, 0.5, 5000, 9000, 0.05, 2);
                    if (big) { this.tone(t, 196, 1.5, 0.2, 'sine'); this.tone(t + 0.02, 392, 1.2, 0.1, 'sine'); }
                } catch (e) {}
            }
        };

        window.LiXi = {
            doc: null, loaded: false, busy: false, started: false, justClaimed: null, lastState: '',
            cfg: normCfg(null), cfgLoaded: false, daily: null, dailyKey: null,
            unsub: null, unsubCfg: null, unsubDaily: null, timer: null,

            envs: function () { return Array.prototype.slice.call(document.querySelectorAll('#lixi-stage .lixi-env')); },
            today: function () { return window.Utils.getTodayString(); },
            claimInfo: function () { // đã rút hôm nay chưa? (ưu tiên máy chủ, dự phòng kết quả vừa rút)
                var t = this.today();
                var a = null, b = null, d = this.doc;
                if (d && d.lixiDate === t) a = { count: d.lixiCount != null ? d.lixiCount : 1, total: d.lixiTotal != null ? d.lixiTotal : (d.lixiAmount || 0), last: d.lixiAmount || 0 };
                if (this.justClaimed && this.justClaimed.date === t) b = this.justClaimed;
                return a && b ? (b.count > a.count ? b : a) : (a || b);  // lấy bản mới hơn
            },
            soldOut: function () {
                var c = this.cfg; if (!(c.dailyBudget > 0)) return false;
                var spent = (this.daily && this.daily.points) || 0;
                var min = Math.min.apply(null, c.prizes.filter(function (p) { return p.chance > 0; }).map(function (p) { return p.points; }));
                return c.dailyBudget - spent < min;
            },
            computeState: function () {
                if (!this.loaded || !this.cfgLoaded) return 'loading';
                var info = this.claimInfo();
                if (info && info.count >= drawLimit(this.cfg)) return 'done';
                var ph = cfgPhase(this.cfg);
                if (ph.phase === 'upcoming') return 'upcoming';
                if (ph.phase === 'closed') return 'closed';
                if (this.soldOut()) return 'soldout';
                return 'ready';
            },

            start: function () {
                var self = this;
                if (this.started) return;
                if (!window.State || !window.State.currentDocId || typeof db === 'undefined') return;
                this.started = true;
                try {
                    this.unsub = db.collection('accounts').doc(window.State.currentDocId).onSnapshot(function (snap) {
                        self.doc = snap && snap.exists ? snap.data() : {};
                        self.loaded = true;
                        if (!self.busy) self.render();
                    }, function (e) { console.warn('LiXi listener', e); });
                    this.unsubCfg = db.collection('settings').doc('lixi_config').onSnapshot(function (snap) {
                        self.cfg = normCfg(snap && snap.exists ? snap.data() : null);
                        self.cfgLoaded = true;
                        if (!self.busy) self.render();
                    }, function (e) { console.warn('LiXi config', e); self.cfgLoaded = true; });
                    this.subDaily();
                } catch (e) { console.warn('LiXi start', e); }
                this.timer = setInterval(function () { self.tickUI(); }, 1000);
            },
            subDaily: function () { // bộ đếm điểm đã phát trong ngày (theo ngày hiện tại)
                var self = this, key = dateKey();
                if (this.dailyKey === key) return;
                if (this.unsubDaily) { try { this.unsubDaily(); } catch (e) {} }
                this.dailyKey = key; this.daily = null;
                this.unsubDaily = db.collection('lixi_daily').doc(key).onSnapshot(function (snap) {
                    self.daily = snap && snap.exists ? snap.data() : { points: 0, count: 0 };
                    if (!self.busy) self.render();
                }, function (e) { console.warn('LiXi daily', e); });
            },
            stop: function () {
                this.started = false;
                ['unsub', 'unsubCfg', 'unsubDaily'].forEach(function (k) { if (this[k]) { try { this[k](); } catch (e) {} this[k] = null; } }, this);
                if (this.timer) { clearInterval(this.timer); this.timer = null; }
            },

            render: function () {
                var card = $('lixi-card'); if (!card) return;
                var st = this.computeState(), info = this.claimInfo(), envs = this.envs(), msg = $('lixi-msg'), badge = $('lixi-badge');
                this.lastState = st;
                card.classList.remove('big');
                card.dataset.state = st === 'done' ? 'done' : (st === 'closed' || st === 'soldout' || st === 'upcoming' ? 'closed' : 'ready');
                envs.forEach(function (e) {
                    e.className = 'lixi-env'; e.style.removeProperty('--cx');
                    e.disabled = st !== 'ready';
                    e.querySelector('.lixi-amount').textContent = '';
                });
                msg.classList.remove('win');
                if (st === 'done') {
                    var mid = envs[1]; mid.classList.add('open', 'rise', 'static');
                    mid.querySelector('.lixi-amount').textContent = '+' + info.last;
                    msg.textContent = info.count > 1 ? 'Hôm nay bạn đã rút ' + info.count + ' lần: +' + info.total + ' điểm' : 'Hôm nay bạn đã rút +' + info.total + ' điểm';
                    this.tickUI(true);
                } else if (st === 'closed') {
                    msg.textContent = this.cfg.closedMessage || 'Lì xì đang đóng cửa, vui lòng quay lại sau!';
                    badge.textContent = 'Đóng cửa';
                } else if (st === 'upcoming') {
                    badge.textContent = 'Mở ' + fmtOpen(cfgPhase(this.cfg).opensAt);
                    this.tickUI(true);
                } else if (st === 'soldout') {
                    msg.textContent = 'Lì xì hôm nay đã phát hết, mai quay lại nhé!';
                    badge.textContent = 'Hết quà hôm nay';
                } else if (st === 'ready') {
                    var lim = drawLimit(this.cfg);
                    msg.textContent = info ? 'Đã rút ' + info.count + '/' + lim + ' lần (+' + info.total + ' điểm). Chạm để rút tiếp!' : 'Chạm vào một bao lì xì để rút!';
                    badge.textContent = lim > 1 ? 'Còn ' + (lim - (info ? info.count : 0)) + ' lượt' : '1 lần / ngày';
                } else {
                    msg.textContent = 'Đang tải dữ liệu...';
                }
            },
            tickUI: function (force) {
                if (this.busy || !$('lixi-card')) return;
                if (this.started) { try { this.subDaily(); } catch (e) {} }
                if (force !== true && this.computeState() !== this.lastState) return this.render(); // sang ngày mới / tới giờ đóng cửa...
                if (this.lastState === 'upcoming') {
                    var ph = cfgPhase(this.cfg);
                    if (ph.phase === 'upcoming') $('lixi-msg').textContent = '⏳ Mở cửa sau ' + countdown(ph.opensAt - Date.now());
                }
                if (this.lastState === 'done') {
                    var n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0);
                    var d = Math.max(0, Math.floor((m - n) / 1000));
                    $('lixi-badge').textContent = 'Còn ' + pad(Math.floor(d / 3600)) + ':' + pad(Math.floor(d % 3600 / 60)) + ':' + pad(d % 60);
                }
            },

            burst: function (env, big) {
                if (reduced()) return;
                var fx = $('lixi-fx'), card = $('lixi-card');
                var cr = card.getBoundingClientRect(), er = env.getBoundingClientRect();
                var ox = er.left - cr.left + er.width / 2, oy = er.top - cr.top + er.height * 0.2;
                var glow = document.createElement('div'); glow.className = 'lixi-glow'; glow.style.left = ox + 'px'; glow.style.top = oy + 'px'; fx.appendChild(glow);
                var colors = ['#ffd700', '#ffea00', '#ff4d5a', '#ffffff', '#ff9f1c'];
                var N = big ? 46 : 30;
                for (var i = 0; i < N; i++) {
                    var p = document.createElement('i'), a = Math.random() * Math.PI * 2, dist = 40 + Math.random() * (big ? 110 : 85);
                    p.className = 'lixi-p' + (Math.random() < 0.4 ? ' coin' : '');
                    if (p.className.indexOf('coin') < 0) p.style.background = colors[i % colors.length];
                    p.style.left = ox + 'px'; p.style.top = oy + 'px';
                    p.style.setProperty('--dx', Math.cos(a) * dist + 'px'); p.style.setProperty('--dy', Math.sin(a) * dist * 0.8 - 22 + 'px');
                    p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
                    p.style.setProperty('--dur', (1.1 + Math.random() * 0.7) + 's'); p.style.setProperty('--delay', (Math.random() * 0.12) + 's');
                    fx.appendChild(p);
                }
                setTimeout(function () { fx.innerHTML = ''; }, 2200);
            },

            pick: function (i) {
                var self = this;
                if (this.busy || this.computeState() !== 'ready') return;
                if (!window.State || !window.State.currentDocId || typeof db === 'undefined') return;
                var card = $('lixi-card'), envs = this.envs(), env = envs[i], msg = $('lixi-msg');
                var today = this.today(), key = dateKey();

                this.busy = true; card.dataset.state = 'busy'; FX.unlock();
                var sr = $('lixi-stage').getBoundingClientRect(), er = env.getBoundingClientRect();
                env.style.setProperty('--cx', ((sr.left + sr.width / 2) - (er.left + er.width / 2)) + 'px');
                envs.forEach(function (e, k) { e.disabled = true; if (k !== i) e.classList.add('fade'); });
                env.classList.add('chosen', 'shaking'); FX.rustle();
                msg.classList.remove('win'); msg.textContent = 'Đang rút lì xì...';

                // Mọi kiểm tra (đã rút chưa / đóng cửa / hết ngân sách) và việc chọn phần thưởng
                // diễn ra TRONG giao dịch để không thể rút trùng hay vượt ngân sách ngày.
                // Máy chủ kiểm tra (đã rút chưa / đóng cửa / hết ngân sách ngày), chọn phần thưởng rồi cộng điểm — trang chỉ chạy hiệu ứng
                var big = false;
                var tx = window.QDdb.play('lixi.pick', {}).then(function (r) { big = !!r.big; return r; });

                var prize = 0;
                Promise.all([tx, sleep(650)]).then(function (res) {
                    prize = res[0].prize;
                    self.justClaimed = { date: today, count: res[0].count, total: res[0].total, last: prize };
                    env.classList.remove('shaking');
                    env.querySelector('.lixi-amount').textContent = '+' + prize;
                    env.classList.add('open'); FX.pop();
                    return sleep(200);
                }).then(function () {
                    env.classList.add('rise'); FX.whoosh();
                    return sleep(420);
                }).then(function () {
                    FX.coin(big); self.burst(env, big);
                    if (big) card.classList.add('big');
                    msg.classList.add('win');
                    msg.textContent = (big ? '🎊 Đại cát đại lợi! ' : '🎉 Chúc mừng! ') + '+' + prize + ' điểm';
                    return sleep(1500);
                }).then(function () {
                    self.busy = false; self.render();
                }).catch(function (err) {
                    self.busy = false;
                    var toast = function (m, t) { if (window.Utils && window.Utils.toast) window.Utils.toast(m, t); };
                    var code = err && err.code;
                    if (code === 'LIXI_CLAIMED') { self.justClaimed = { date: today, count: err.count, total: err.total, last: err.last }; toast(drawLimit(self.cfg) > 1 ? 'Bạn đã hết lượt rút hôm nay, mai quay lại nhé!' : 'Hôm nay bạn đã rút lì xì rồi, mai quay lại nhé!', 'warning'); }
                    else if (code === 'LIXI_CLOSED') { toast(err.phase === 'upcoming' ? 'Lì xì chưa tới giờ mở cửa!' : 'Lì xì vừa đóng cửa!', 'warning'); }
                    else if (code === 'LIXI_SOLDOUT') { self.daily = { points: err.spent, count: (self.daily && self.daily.count) || 0 }; toast('Lì xì hôm nay đã phát hết!', 'warning'); }
                    else {
                        console.error('LiXi error', err);
                        var ec = (err && (err.code || err.name)) || 'lỗi lạ', em = String((err && err.message) || err || '').slice(0, 300);
                        toast('Không rút được lì xì: ' + window.qdErr('lixi', err), 'error');
                    }
                    self.render();
                });
            }
        };
    })();
    
