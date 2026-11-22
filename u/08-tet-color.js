    /* ===== TET COLOUR VARIANTS / HOME VIDEO / BACKGROUND MUSIC ===== */
    (function () {
        window.TetColor = {
            list: {
                'do':    { label: 'Đỏ Lì Xì',   meta: '#fdebc0' },
                'dao':   { label: 'Hoa Đào',    meta: '#fde4e4' },
                'chung': { label: 'Bánh Chưng', meta: '#fdebc0' }
            },
            current: 'do',
            apply: function (key, notify) {
                if (!this.list[key]) key = 'do';
                this.current = key;
                var root = document.documentElement;
                if (key === 'do') root.removeAttribute('data-tet-color'); else root.setAttribute('data-tet-color', key);
                try { localStorage.setItem('qd_tet_color', key); } catch (e) {}
                var meta = document.querySelector('meta[name="theme-color"]');
                if (meta) meta.setAttribute('content', this.list[key].meta);
                document.querySelectorAll('.tet-color-opt').forEach(function (b) {
                    b.classList.toggle('active', b.getAttribute('data-tet-opt') === key);
                });
                if (notify && window.Utils && window.Utils.toast) window.Utils.toast('Đã đổi sang màu ' + this.list[key].label + '!', 'success');
            },
            set: function (key) { this.apply(key, true); },
            init: function () {
                var k = 'do';
                try { k = localStorage.getItem('qd_tet_color') || 'do'; } catch (e) {}
                this.apply(k, false);
            }
        };

        window.HomeVideo = {
            el: null, started: false,
            init: function () {
                var self = this, v = document.getElementById('home-video');
                if (!v) return;
                this.el = v;
                v.muted = true; v.defaultMuted = true; v.volume = 0; v.loop = true; v.controls = false; v.playsInline = true;
                v.addEventListener('ended', function () { v.currentTime = 0; self.play(); });
                v.addEventListener('volumechange', function () { if (!v.muted) v.muted = true; });
                v.addEventListener('contextmenu', function (e) { e.preventDefault(); });
                var src = v.querySelector('source');
                if (src) src.addEventListener('error', function () { if (v.parentNode) v.parentNode.style.display = 'none'; });
                document.addEventListener('visibilitychange', function () { if (!document.hidden && self.started) self.play(); });
                ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
                    document.addEventListener(ev, function () { if (self.started && v.paused) self.play(); }, { passive: true });
                });
            },
            play: function () {
                var v = this.el; if (!v) return;
                v.muted = true;
                var p = v.play(); if (p && p.catch) p.catch(function () {});
            },
            start: function () { this.started = true; this.play(); },
            stop: function () { this.started = false; if (this.el) this.el.pause(); }
        };

        /* Nhạc nền hệ thống (nhac-tet.mp3 - nhạc Tết dùng chung mọi trang, trừ admin)
           - Lưu trên máy: qd_music_on ('1' bật / '0' tắt, mặc định bật), qd_music_vol (0-100, mặc định 50) - dùng chung với các trang khác
           - Vào trang -> tự phát (nếu đang để Bật). Trình duyệt chặn tự phát -> phát ở lần chạm đầu tiên
           - Chuyển trang -> phát tiếp đúng đoạn đang nghe (qd_music_pos trong sessionStorage); ẩn tab -> tạm dừng, quay lại -> phát tiếp
           - iPhone/iPad không cho chỉnh audio.volume bằng JS -> dùng Web Audio (GainNode) để thanh âm lượng vẫn có tác dụng */
        window.Music = {
            // Danh sách nhạc Tết (dùng chung với các trang khác: index, tranht, quays, qt, baotri)
            TRACKS: [
                { src: 'media/nhac-tet.mp3',   name: 'Xuân Về Phơi Phới', desc: 'Sáo trúc · đàn tranh' },
                { src: 'media/nhac-tet-2.mp3', name: 'Xuân Rộn Ràng',     desc: 'Pop sôi động · đàn bầu' },
                { src: 'media/nhac-tet-3.mp3', name: 'Lân Về Phố',        desc: 'Trống lân · kèn · pháo' },
                { src: 'media/nhac-tet-4.mp3', name: 'Sum Vầy Ngày Xuân', desc: 'Đàn tranh · đàn bầu' },
                { src: 'media/nhac-tet-5.mp3', name: 'Phố Xuân Rộn Rã',   desc: 'Sáo trúc · đàn tranh · trống cơm' },
                { src: 'media/nhac-tet-6.mp3', name: 'Chợ Hoa Ngày Tết', desc: 'Đàn tranh · vỗ tay · trống cơm' },
                { src: 'media/nhac-tet-7.mp3', name: 'Pháo Hoa Giao Thừa', desc: "Đàn t'rưng · đàn bầu · trống" },
                { src: 'media/nhac-tet-8.mp3', name: 'Én Liệng Mùa Xuân', desc: 'Sáo trúc · đàn nguyệt · nhịp 6/8' }
            ],
            remix: false,   // bản Remix do admin bật (settings/music_config.remix), nhớ trong qd_music_remix
            srcOf: function (i) { var s = this.TRACKS[i].src; return this.remix ? s.replace('nhac-tet', 'nhac-tet-remix') : s; },
            setRemix: function (on) {
                on = !!on; try { localStorage.setItem('qd_music_remix', on ? '1' : '0'); } catch (e) {}
                if (on === this.remix) return; this.remix = on;
                var b = document.getElementById('music-tracks'); if (b) b.__built = false;
                if (!this.el) return;
                var el = this.el, playing = !el.paused, du = el.duration, t = el.currentTime;
                this.setTrack(this.idx);
                if (du && isFinite(du) && t > 0) el.addEventListener('loadedmetadata', function () { try { el.currentTime = Math.min(t / du * el.duration, el.duration - 0.5); } catch (e) {} }, { once: true });
                if (playing) this.play(true);
            },
            watchRemix: function () {
                var self = this, n = 0;
                window.addEventListener('storage', function (e) { if (e.key === 'qd_music_remix') self.setRemix(e.newValue === '1'); });
                (function w() {
                    var fb = window.firebase;
                    if (fb && fb.apps && fb.apps.length && fb.firestore) { try { fb.firestore().collection('settings').doc('music_config').onSnapshot(function (s) { self.setRemix(!!(s.exists && s.data().remix)); }, function () {}); } catch (e) {} }
                    else if (n++ < 60) setTimeout(w, 500);
                })();
            },
            mode: 'auto', idx: 0,   // mode: 'auto' = tự chuyển bài lần lượt, '0'..'7' = lặp 1 bài
            el: null, vol: 50, lastVol: 50, enabled: true, active: false,
            ctx: null, gain: null, useGain: false, _waitGesture: false, _fadeT: 0,
            load: function () {
                try {
                    var on = localStorage.getItem('qd_music_on'); this.enabled = on !== '0';
                    var v = parseInt(localStorage.getItem('qd_music_vol'), 10); this.vol = isNaN(v) ? 50 : Math.min(100, Math.max(0, v));
                    var lv = parseInt(localStorage.getItem('qd_music_lastvol'), 10); this.lastVol = isNaN(lv) || lv <= 0 ? (this.vol || 50) : lv;
                    this.remix = localStorage.getItem('qd_music_remix') === '1';
                    var md = localStorage.getItem('qd_music_track'); this.mode = md != null && this.TRACKS[+md] && md !== '' ? String(+md) : 'auto';
                } catch (e) {}
            },
            save: function () {
                try {
                    localStorage.setItem('qd_music_on', this.enabled ? '1' : '0');
                    localStorage.setItem('qd_music_vol', String(this.vol));
                    localStorage.setItem('qd_music_lastvol', String(this.lastVol));
                    localStorage.setItem('qd_music_track', this.mode);
                } catch (e) {}
            },
            // Gán bài thứ i cho trình phát (không tự phát)
            setTrack: function (i) {
                var n = this.TRACKS.length; i = ((i % n) + n) % n;
                this.idx = i; this.el.loop = this.mode !== 'auto';
                var url = new URL(this.srcOf(i), location.href).href;
                if (this.el.src !== url) { this.el.src = url; }
                try { localStorage.setItem('qd_music_last', String(i)); } catch (e) {}
                this.renderTracks();
            },
            // Bài tiếp theo (nút "Bài tiếp" hoặc hết bài ở chế độ tự chuyển)
            next: function (byUser) {
                if (!this.el) return;
                var wasOn = !this.el.paused || this.active;
                if (byUser && this.mode !== 'auto') this.mode = String((this.idx + 1) % this.TRACKS.length);   // đang lặp 1 bài -> chuyển sang lặp bài kế
                this.setTrack(this.idx + 1);
                if (byUser) { this.enabled = true; this.save(); this.play(false); if (window.Utils && window.Utils.toast) window.Utils.toast('🎵 ' + this.TRACKS[this.idx].name + (this.remix ? ' (Remix)' : ''), 'info'); }
                else if (wasOn && this.enabled) this.play(true);
                this.updateUI();
            },
            // Chọn chế độ: 'auto' hoặc số thứ tự bài (lặp bài đó)
            pick: function (m) {
                if (!this.el) return;
                this.mode = m === 'auto' ? 'auto' : String(+m);
                this.enabled = true; this.save();
                if (this.mode === 'auto') { this.el.loop = false; this.renderTracks(); if (this.el.paused) this.play(false); return this.updateUI(); }
                if (+this.mode !== this.idx) this.setTrack(+this.mode); else this.el.loop = true;
                this.play(false);
                this.updateUI();
            },
            renderTracks: function () {
                var box = document.getElementById('music-tracks'); if (!box) return;
                var self = this, playing = !!(this.el && !this.el.paused);
                if (!box.__built) {
                    box.__built = true;
                    var h = '<button type="button" class="qd-trk auto" data-m="auto"><span class="qd-trk-n"><i class="fa-solid fa-shuffle"></i></span><span class="qd-trk-t"><b>Tự động chuyển bài</b><small>Phát lần lượt cả ' + self.TRACKS.length + ' bài</small></span></button>';
                    this.TRACKS.forEach(function (t, i) {
                        h += '<button type="button" class="qd-trk" data-m="' + i + '"><span class="qd-trk-n">' + (i + 1) + '</span><span class="qd-trk-t"><b>' + t.name + (self.remix ? ' <span class="qd-trk-rmx">Remix</span>' : '') + '</b><small>' + (self.remix ? 'Bản remix sôi động · ' : '') + t.desc + '</small></span><span class="qd-trk-eq" aria-hidden="true"><i></i><i></i><i></i></span></button>';
                    });
                    box.innerHTML = h;
                    box.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.qd-trk'); if (b) self.pick(b.getAttribute('data-m')); });
                }
                var btns = box.children;
                for (var k = 0; k < btns.length; k++) {
                    var m = btns[k].getAttribute('data-m');
                    btns[k].classList.toggle('sel', m === this.mode);
                    btns[k].classList.toggle('now', m !== 'auto' && +m === this.idx && playing);
                    btns[k].setAttribute('aria-pressed', m === this.mode ? 'true' : 'false');
                }
            },
            init: function () {
                if (this.el) return;
                var self = this;
                this.el = document.getElementById('bg-music');
                this.load();
                if (this.el) {
                    // Kiểm tra trình duyệt có cho chỉnh volume không (iOS luôn trả về 1)
                    try { var t = new Audio(); t.volume = 0.5; this.useGain = Math.abs(t.volume - 0.5) > 0.01 && !!(window.AudioContext || window.webkitAudioContext); } catch (e) {}
                    // Chọn bài: nghe tiếp bài của trang trước; lần đầu vào ở chế độ tự động -> bài sau bài nghe lần trước
                    var start = 0, sp = null;
                    try { sp = JSON.parse(sessionStorage.getItem('qd_music_pos') || 'null'); } catch (e) {}
                    if (this.mode !== 'auto') start = +this.mode;
                    else if (sp && this.TRACKS[sp.i] && Date.now() - sp.at < 15000) start = sp.i;
                    else { var last = parseInt(localStorage.getItem('qd_music_last'), 10); start = isNaN(last) ? 0 : last + 1; }
                    this.setTrack(start);
                    this.el.addEventListener('ended', function () { if (self.mode === 'auto') self.next(false); });
                    this.applyVolume(this.vol);
                    this.el.addEventListener('play', function () { self.updateUI(); });
                    this.el.addEventListener('pause', function () { self.updateUI(); });
                    // Đăng nhập bằng tay: "mở khóa" âm thanh ngay trong cú bấm để phát được sau khi xác thực xong
                    document.addEventListener('click', function (e) {
                        var b = e.target && e.target.closest ? e.target.closest('#btn-login') : null;
                        if (b && e.isTrusted) self.unlock();
                    }, true);
                    document.addEventListener('keydown', function (e) {
                        if (e.key === 'Enter' && e.target && (e.target.id === 'login-usr' || e.target.id === 'login-pwd')) self.unlock();
                    }, true);
                    document.addEventListener('visibilitychange', function () {
                        if (document.hidden) { if (!self.el.paused) { self._hidPause = true; self.el.pause(); } return; }
                        if (self.ctx && self.ctx.state !== 'running') { try { self.ctx.resume(); } catch (e) {} }
                        if (self._hidPause) { self._hidPause = false; if (self.enabled && self.active) self.play(true); }
                    });
                    // Nghe tiếp đoạn nhạc từ trang trước
                    this.el.addEventListener('loadedmetadata', function () {
                        try {
                            var s = JSON.parse(sessionStorage.getItem('qd_music_pos') || 'null'), d = self.el.duration;
                            if (s && s.i === self.idx && !s.r === !self.remix && d && isFinite(d) && Date.now() - s.at < 15000) self.el.currentTime = Math.min(s.t + (Date.now() - s.at) / 1000, d - 0.5);
                        } catch (e) {}
                    }, { once: true });
                    window.addEventListener('pagehide', function () {
                        try { if (!self.el.paused) sessionStorage.setItem('qd_music_pos', JSON.stringify({ i: self.idx, r: self.remix ? 1 : 0, t: self.el.currentTime, at: Date.now() })); else sessionStorage.removeItem('qd_music_pos'); } catch (e) {}
                    });
                    this.watchRemix();
                    // Vào trang là bật nhạc (mặc định Bật)
                    this.enter();
                }
                this.updateUI();
            },
            // Tự phát khi vào trang; máy cần Web Audio (iPhone) hoặc trình duyệt chặn -> phát ở lần chạm đầu tiên
            enter: function () {
                if (!this.el || !this.enabled) return;
                this.active = true;
                if (document.hidden) { this._hidPause = true; return; }
                if (this.useGain && !this.gain) return this.waitGesture();
                this.play(true);
            },
            // Tạo đường Web Audio (chỉ trên máy không chỉnh được volume, ví dụ iPhone) - phải gọi trong lúc người dùng bấm
            setupGain: function () {
                if (!this.useGain || this.gain || !this.el) return;
                try {
                    var AC = window.AudioContext || window.webkitAudioContext;
                    this.ctx = new AC();
                    var src = this.ctx.createMediaElementSource(this.el);
                    this.gain = this.ctx.createGain();
                    src.connect(this.gain); this.gain.connect(this.ctx.destination);
                    this.applyVolume(this.vol);
                } catch (e) { this.useGain = false; this.gain = null; }
            },
            unlock: function () {
                if (!this.el || !this.enabled) return;
                this.setupGain();
                if (this.ctx && this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) {} }
                if (!this.el.paused) return;
                // Phát tắt tiếng rồi dừng ngay: đủ để trình duyệt cho phép phát sau khi đăng nhập xong
                var el = this.el; el.muted = true;
                var p = el.play();
                var done = function () { if (!window.Music.active) el.pause(); el.muted = false; };
                if (p && p.then) p.then(done, function () { el.muted = false; }); else done();
            },
            applyVolume: function (v) {
                var x = Math.min(100, Math.max(0, v)) / 100;
                x = x * x;   // cảm nhận âm lượng tự nhiên hơn (kéo 50% không quá to)
                if (this.gain) { try { this.gain.gain.setTargetAtTime(x, this.ctx.currentTime, 0.03); } catch (e) { this.gain.gain.value = x; } if (this.el) this.el.volume = 1; }
                else if (this.el) this.el.volume = x;
            },
            fadeIn: function () {
                var self = this, target = this.vol, t0 = performance.now(), dur = 1200;
                clearInterval(this._fadeT);
                this.applyVolume(0);
                this._fadeT = setInterval(function () {
                    var k = Math.min(1, (performance.now() - t0) / dur);
                    self.applyVolume(target * k);
                    if (k >= 1) clearInterval(self._fadeT);
                }, 50);
            },
            play: function (quiet) {
                var self = this;
                if (!this.el) return;
                this.setupGain();
                if (this.ctx && this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) {} }
                this.active = true; this.el.muted = false;
                if (!this.el.paused) return this.updateUI();
                this.fadeIn();
                var p = this.el.play();
                if (p && p.then) p.then(function () { self._waitGesture = false; self.updateUI(); }).catch(function (err) {
                    if (err && err.name === 'NotAllowedError') return self.waitGesture();
                    self.active = false; self.updateUI();
                    if (!quiet && window.Utils && window.Utils.toast) window.Utils.toast('Không thể phát nhạc nền trên thiết bị này.', 'warning');
                });
            },
            // Trình duyệt chặn tự phát (vd: tự đăng nhập lại không có cú bấm) -> phát ở lần chạm/bấm phím đầu tiên
            waitGesture: function () {
                var self = this;
                if (this._waitGesture) return; this._waitGesture = true;
                var evs = ['pointerdown', 'touchend', 'keydown', 'click'];
                var go = function (e) {
                    var tg = e && e.target && e.target.closest ? e.target.closest('#music-toggle-btn, .qd-trk, .qd-trk-next') : null;
                    evs.forEach(function (ev) { document.removeEventListener(ev, go, true); });
                    self._waitGesture = false;
                    if (tg) return;   // bấm nút Bật/Tắt: để nút tự xử lý
                    if (self.enabled && self.active && self.el && self.el.paused) self.play(true);
                };
                evs.forEach(function (ev) { document.addEventListener(ev, go, true); });
            },
            // Gọi khi đăng nhập thành công: bật nhạc nếu người dùng đang để chế độ Bật (mặc định)
            autoStart: function () {
                if (!this.el) this.init();
                if (this.enabled) this.play(true); else this.updateUI();
            },
            toggle: function () {
                if (!this.el) return;
                if (this.el.paused) { this.enabled = true; this.save(); this.play(false); }
                else { this.enabled = false; this.active = false; this.save(); this.el.pause(); this.updateUI(); }
            },
            setVolume: function (v, commit) {
                v = Math.min(100, Math.max(0, parseInt(v, 10) || 0));
                this.vol = v; if (v > 0) this.lastVol = v;
                clearInterval(this._fadeT);
                this.applyVolume(v);
                if (commit !== false) this.save();
                this.updateUI();
            },
            toggleMute: function () {
                if (this.vol > 0) { this.lastVol = this.vol; this.setVolume(0); }
                else this.setVolume(this.lastVol || 50);
            },
            updateUI: function () {
                var on = !!(this.el && !this.el.paused);
                var t = document.getElementById('music-text'); if (t) t.textContent = on ? 'Đang bật' : 'Đang tắt';
                this.renderTracks();
                var i = document.getElementById('music-icon'); if (i) i.className = on ? 'fa-solid fa-music text-primary' : 'fa-solid fa-music text-muted';
                var r = document.getElementById('music-vol');
                if (r) { if (String(r.value) !== String(this.vol)) r.value = this.vol; r.style.setProperty('--p', this.vol + '%'); }
                var lb = document.getElementById('music-vol-val'); if (lb) lb.textContent = this.vol + '%';
                var ic = document.getElementById('music-vol-ico');
                if (ic) {
                    var cls = this.vol === 0 ? 'fa-volume-xmark' : this.vol < 50 ? 'fa-volume-low' : 'fa-volume-high';
                    if (ic.__cls !== cls) { ic.__cls = cls; ic.innerHTML = '<i class="fa-solid ' + cls + '"></i>'; }
                }
            }
        };

        /* Nhận thông báo mới (tin nhắn riêng, Kênh Chung, quay số trực tiếp...)
           - Lưu trên máy: qd_notif_state ('false' = tắt, còn lại = bật; mặc định bật)
           - Hiện thông báo qua Service Worker (chạy được cả khi web đang ẩn trên Android/Chrome), lỗi mới dùng new Notification
           - Bấm vào thông báo -> mở lại web và vào đúng phòng chat */
        window.Notif = {
            _swReady: null, _bound: false,
            supported: function () { return 'Notification' in window; },
            isIOS: function () { return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); },
            standalone: function () { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; },
            enabled: function () { try { return localStorage.getItem('qd_notif_state') !== 'false'; } catch (e) { return true; } },
            setEnabled: function (on) { try { localStorage.setItem('qd_notif_state', on ? 'true' : 'false'); } catch (e) {} this.updateUI(); },
            perm: function () { return this.supported() ? Notification.permission : 'unsupported'; },
            toast: function (m, t) { if (window.Utils && window.Utils.toast) window.Utils.toast(m, t || 'info'); },
            sw: function () {
                if (!('serviceWorker' in navigator)) return Promise.resolve(null);
                if (!this._swReady) {
                    this._swReady = navigator.serviceWorker.register('./sw.js').then(function () {
                        return Promise.race([navigator.serviceWorker.ready, new Promise(function (r) { setTimeout(function () { r(null); }, 4000); })]);
                    }).catch(function (err) { console.log('Service Worker registration failed:', err); return null; });
                }
                return this._swReady;
            },
            bind: function () {
                var self = this;
                if (this._bound) return; this._bound = true;
                if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) {
                    var d = e.data || {};
                    if (d.type === 'qd-notif-click' && window.Chat && window.Chat.openFromNotif) window.Chat.openFromNotif(d.roomId);
                });
                document.addEventListener('visibilitychange', function () { if (!document.hidden) self.updateUI(); });
                try { navigator.permissions.query({ name: 'notifications' }).then(function (st) { st.onchange = function () { self.updateUI(); }; }).catch(function () {}); } catch (e) {}
            },
            // Gọi sau khi đăng nhập
            boot: function () {
                this.bind(); this.sw();
                if (this.enabled() && this.perm() === 'default') { try { Notification.requestPermission().then(this.updateUI.bind(this), function () {}); } catch (e) {} }
                this.updateUI();
            },
            // Bật nhận thông báo + xin quyền. Trả về { ok }
            ensure: async function () {
                this.bind();
                if (!this.supported()) {
                    if (this.isIOS() && !this.standalone()) this.toast('iPhone/iPad: bấm nút Chia sẻ → "Thêm vào MH chính", mở web từ biểu tượng đó rồi bật lại thông báo.', 'warning');
                    else this.toast('Trình duyệt này không hỗ trợ thông báo. Hãy dùng Chrome, Edge, Firefox hoặc Safari mới.', 'warning');
                    this.updateUI(); return { ok: false };
                }
                if (!this.enabled()) this.setEnabled(true);
                var p = Notification.permission, p0 = p;
                if (p === 'default') {
                    try { p = await Notification.requestPermission(); } catch (e) { p = Notification.permission; }
                }
                this.updateUI();
                if (p !== 'granted' && window.QDAppNotif) {
                    this.toast(p === 'denied' ? 'Thông báo của app đang bị tắt. Đang mở Cài đặt → bật "Hiện thông báo" cho QD Elite rồi quay lại.' : 'Bạn chưa cho phép thông báo. Bấm lại và chọn "Cho phép".', 'warning');
                    if (p0 === 'denied') setTimeout(function () { window.QDAppNotif.open(); }, 900);   // vừa bấm "Không cho phép" thì thôi, chặn từ trước mới mở Cài đặt
                    return { ok: false };
                }
                if (p !== 'granted') {
                    this.toast(p === 'denied'
                        ? 'Thông báo đang bị chặn. Bấm biểu tượng ổ khóa cạnh địa chỉ web → Quyền → Thông báo → Cho phép, rồi tải lại trang.'
                        : 'Bạn chưa cho phép thông báo. Bấm lại và chọn "Cho phép".', 'warning');
                    return { ok: false };
                }
                await this.sw();
                return { ok: true };
            },
            toggle: async function () {
                if (this.enabled() && this.perm() === 'granted') {
                    this.setEnabled(false);
                    this.toast('Đã tắt nhận thông báo mới.', 'info');
                    return;
                }
                var r = await this.ensure();
                if (r.ok) this.toast('Đã bật nhận thông báo mới!', 'success');
            },
            options: function (body, roomId) {
                var url = location.href.split('#')[0].split('?')[0];
                return {
                    body: body,
                    icon: 'https://cdn-icons-png.flaticon.com/512/1041/1041916.png',
                    badge: 'https://cdn-icons-png.flaticon.com/512/1041/1041916.png',
                    vibrate: [200, 100, 200, 100, 200],
                    tag: roomId || 'qd', renotify: true, requireInteraction: true,
                    data: { roomId: roomId || '', url: url }
                };
            },
            show: function (title, body, roomId, from) {
                if (!this.supported() || Notification.permission !== 'granted') return;
                var self = this, opts = this.options(body, roomId);
                if (from) { opts.data = opts.data || {}; opts.data.from = from; }
                var direct = function () {
                    try {
                        var n = new Notification(title, opts);
                        n.onclick = function () { n.close(); if (window.Chat && window.Chat.openFromNotif) window.Chat.openFromNotif(roomId); };
                    } catch (err) {}
                };
                this.sw().then(function (reg) {
                    if (reg && reg.showNotification) return reg.showNotification(title, opts).catch(direct);
                    direct();
                }, direct);
            },
            // Nhờ Service Worker hẹn giờ (trang bị ẩn/đóng băng vẫn hiện thông báo). Trả về false nếu không làm được
            showLater: async function (title, body, roomId, ms) {
                if (window.QDAppNotif) return false;   // app Android: trang tự hẹn giờ rồi gọi thông báo của app
                var reg = await this.sw();
                var sw = reg && (reg.active || navigator.serviceWorker.controller);
                if (!sw) return false;
                sw.postMessage({ type: 'qd-notify-later', delay: ms, title: title, options: this.options(body, roomId) });
                return true;
            },
            updateUI: function () {
                var on = this.enabled(), p = this.perm(), active = on && p === 'granted';
                var t = document.getElementById('notif-text'); if (t) t.textContent = active ? 'Đang bật' : 'Đang tắt';
                var i = document.getElementById('notif-icon'); if (i) i.className = active ? 'fa-solid fa-bell text-primary' : 'fa-solid fa-bell-slash text-muted';
                var el = document.getElementById('notif-perm'); if (!el) return;
                var msg, cls;
                if (p === 'unsupported') { msg = this.isIOS() && !this.standalone() ? 'iPhone/iPad: cần "Thêm vào MH chính" và mở web từ biểu tượng đó mới nhận được thông báo.' : 'Trình duyệt này không hỗ trợ thông báo.'; cls = 'text-warning'; }
                else if (!on) { msg = 'Bạn sẽ không nhận được thông báo tin nhắn mới.'; cls = 'text-muted'; }
                else if (p === 'granted') { msg = '✓ Đã cho phép - sẽ báo khi có tin nhắn mới.'; cls = 'text-main'; }
                else if (p === 'denied' && window.QDAppNotif) { msg = 'Thông báo của app đang bị tắt. Bấm Bật / Tắt để mở Cài đặt và cho phép.'; cls = 'text-danger'; }
                else if (p === 'denied') { msg = 'Trình duyệt đang chặn thông báo. Bấm ổ khóa cạnh địa chỉ web → Thông báo → Cho phép.'; cls = 'text-danger'; }
                else { msg = 'Chưa cấp quyền - bấm Bật / Tắt rồi chọn "Cho phép".'; cls = 'text-warning'; }
                el.textContent = msg; el.className = 'text-sm font-bold ' + cls;
            }
        };

        /* Thông báo app: app Android tự giữ kết nối nền tới máy chủ VPS (QDLink) — không còn mã Firebase / máy chủ trung chuyển */

        document.addEventListener('DOMContentLoaded', function () {
            window.TetColor.init();
            window.HomeVideo.init();
            window.Notif.updateUI();
        });
    })();
    
