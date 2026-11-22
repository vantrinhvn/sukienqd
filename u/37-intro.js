    (function () {
        var W = window, d = document, html = d.documentElement, GATE = '#auth-gate';
        var VIDS = { phonk: 'media/gioi-thieu-phonk', hungtrang: 'media/gioi-thieu-hung-trang' };   // + '.mp4' (dọc, điện thoại) / '-ngang.mp4' (ngang, máy tính)
        function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
        var box, vid, ctl, cur = '', first = true, want = false, key = 'phonk', shown = false, land = false, noLand = false;
        function srcFor() { land = W.innerWidth > W.innerHeight * 1.05 && !noLand; return VIDS[key] + (land ? '-ngang.mp4' : '.mp4'); }
        function build() {
            if (box) return;
            box = d.createElement('div'); box.id = 'qd-intro'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Video giới thiệu');
            box.innerHTML = '<video playsinline webkit-playsinline loop preload="auto" disablepictureinpicture controlslist="nodownload"></video>'
                + '<button type="button" class="ctl" aria-label="Tắt / bật tiếng">🔊</button><button type="button" class="adm" tabindex="-1" aria-hidden="true"></button>'
                + '<div class="gate"><form autocomplete="off"><b>🔒 Admin vào test</b>Nhập mã quản trị để vào hệ thống khi video giới thiệu đang bật (chỉ tab này).'
                + '<input type="password" inputmode="numeric" placeholder="••••••••"><div class="err">Mã không đúng!</div>'
                + '<div class="btns"><button type="button" class="no">Hủy</button><button type="submit" class="yes">Vào hệ thống</button></div></form></div>';
            d.body.appendChild(box);
            vid = box.querySelector('video'); ctl = box.querySelector('.ctl');
            vid.__qdW = vid.__qdIntro = true;   // không để bộ tiết kiệm hiệu ứng / Mức đồ họa tự dừng video này
            // Nút ẩn cho Admin: chạm 5 lần liền vào góc trên bên trái -> nhập mã -> vào hệ thống để test (chỉ tab này)
            var adm = box.querySelector('.adm'), gate = box.querySelector('.gate'), gin = gate.querySelector('input'), gerr = gate.querySelector('.err'), taps = [];
            adm.addEventListener('click', function (e) {
                e.stopPropagation(); var now = Date.now(); taps = taps.filter(function (x) { return now - x < 2500; }); taps.push(now);
                if (taps.length >= 5) { taps = []; gerr.style.display = 'none'; gin.value = ''; gate.classList.add('show'); setTimeout(function () { gin.focus(); }, 50); }
            });
            gate.addEventListener('click', function (e) { e.stopPropagation(); if (e.target === gate || e.target.classList.contains('no')) gate.classList.remove('show'); });
            gate.querySelector('form').addEventListener('submit', function (e) {
                e.preventDefault();
                if (qdGate(gin.value)) {   // cùng mã với Admin Gateway ở trang Bảo trì
                    try { sessionStorage.setItem('qd_intro_bypass', '1'); } catch (er) {}
                    gate.classList.remove('show'); render();
                } else { gerr.style.display = 'block'; gin.select(); }
            });
            box.addEventListener('click', function (e) {
                if (gate.classList.contains('show')) return;
                if (e.target === ctl) { if (vid.muted) unmute(false); else { vid.muted = true; ui(); } return; }
                if (vid.muted) unmute(first); else if (vid.paused) vid.play().catch(function () {});
            });
            vid.addEventListener('volumechange', ui); vid.addEventListener('playing', ui);
            vid.addEventListener('error', function () { if (land && !noLand) { noLand = true; render(); } });   // không có bản ngang -> dùng bản dọc
            // Chạm / bấm / gõ phím ở bất kỳ đâu -> bật tiếng (trình duyệt không cho tự phát có tiếng khi chưa chạm)
            ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) { d.addEventListener(ev, function (e) { if (!shown) return; if (vid.muted && !(e.target && (e.target === ctl || e.target.closest && e.target.closest('.gate')))) unmute(first); setTimeout(hush, 0); setTimeout(hush, 300); }, true); });
            setInterval(function () { if (shown) hush(); }, 1000);
            W.addEventListener('resize', function () { if (shown) render(); });
            d.addEventListener('visibilitychange', function () {
                if (!shown || !vid) return;
                if (d.hidden) vid.pause(); else vid.play().catch(function () {});
            });
        }
        function ui() { if (!vid) return; ctl.textContent = vid.muted ? '🔇' : '🔊'; }
        function unmute(restart) {
            first = false; vid.muted = false;
            if (restart) { try { vid.currentTime = 0; } catch (e) {} }
            var p = vid.play(); if (p && p.catch) p.catch(function () { vid.muted = true; ui(); }); ui();
        }
        function start() {   // thử phát có tiếng; trình duyệt chặn thì phát không tiếng + nút "Chạm để bật nhạc"
            vid.muted = false;
            var p = vid.play();
            if (p && p.then) p.then(function () { first = false; ui(); }, function () { vid.muted = true; vid.play().catch(function () {}); ui(); });
        }
        function hush() {   // dừng mọi nhạc nền / âm thanh khác của trang (chỉ để lại nhạc của video)
            [W.QDMusic, W.Music].forEach(function (M) {   // trình phát nhạc nền (index: QDMusic, user.html: Music)
                if (!M || typeof M !== 'object') return;
                if (!M.__qdIntro) {
                    M.__qdIntro = 1;
                    ['play', 'autoStart'].forEach(function (fn) { if (typeof M[fn] === 'function') { var o = M[fn]; M[fn] = function () { if (W.__qdIntroOn) return; return o.apply(M, arguments); }; } });
                }
                var el = M.el;
                if (el && !el.__qdIntroL && el.addEventListener) { el.__qdIntroL = 1; el.addEventListener('play', function () { if (W.__qdIntroOn) { try { el.pause(); } catch (e) {} } }); }
                if (el && !el.paused) { try { el.pause(); } catch (e) {} }
                try { if (M.ctx && M.ctx.state === 'running' && M.ctx.suspend) M.ctx.suspend(); } catch (e) {}
            });
            Array.prototype.forEach.call(d.querySelectorAll('audio, video'), function (a) { if (a !== vid && !a.paused) { try { a.pause(); } catch (e) {} } });
        }
        // Nhạc nền nào định phát trong lúc đang chiếu video -> dừng ngay
        d.addEventListener('play', function (e) { var a = e.target; if (W.__qdIntroOn && a && a !== vid && (a.tagName === 'AUDIO' || a.tagName === 'VIDEO')) { try { a.pause(); } catch (er) {} } }, true);
        function music(block) {   // nhạc nền của trang: dừng khi đang chiếu video, trả lại khi tắt
            if (block) return hush();
            [W.QDMusic, W.Music].forEach(function (M) { try { if (M && M.ctx && M.ctx.state === 'suspended' && M.ctx.resume) M.ctx.resume(); } catch (e) {} });
            var M = W.QDMusic; if (M && M.enabled && M.el && M.el.paused) M.play();
            var U = W.Music; if (U && U.enabled && U.active && U.el && U.el.paused && typeof U.play === 'function') { try { U.play(true); } catch (e) {} }
        }
        function gateOpen() {   // user.html: chỉ chiếu khi đang ở màn hình đăng nhập (chưa đăng nhập)
            if (!GATE) return true;
            var g = d.querySelector(GATE); if (!g) return false;
            if (html.classList.contains('qd-boot')) return false;   // đang tự đăng nhập lại phiên cũ
            return g.style.display !== 'none' && g.style.opacity !== '0';
        }
        function render() {
            testPill();
            var on = want && !byp() && gateOpen(), src = on ? srcFor() : '';
            if (on === shown && (!on || cur === src)) return;
            var was = shown; shown = on; W.__qdIntroOn = on;
            if (on) {
                build(); html.classList.add('qd-intro-on'); music(true); box.classList.toggle('land', land);
                if (cur !== src) {
                    var same = cur && cur.replace('-ngang', '') === src.replace('-ngang', ''), t0 = same ? vid.currentTime : 0, mu = vid.muted;
                    cur = src; vid.poster = 'media/gioi-thieu-poster' + (land ? '-ngang' : '') + '.jpg'; vid.src = src;
                    if (same) {   // xoay màn hình / đổi cỡ cửa sổ: phát tiếp đúng chỗ
                        vid.addEventListener('loadedmetadata', function f() { vid.removeEventListener('loadedmetadata', f); try { vid.currentTime = t0; } catch (e) {} }, { once: true });
                        vid.muted = mu; vid.play().catch(function () { vid.muted = true; vid.play().catch(function () {}); ui(); });
                    } else { first = true; start(); }
                }
                else if (!was || vid.paused) start();
            } else {
                html.classList.remove('qd-intro-on');
                if (vid) { vid.pause(); vid.removeAttribute('src'); try { vid.load(); } catch (e) {} cur = ''; }
                if (was) music(false);
            }
        }
        function byp() { try { return sessionStorage.getItem('qd_intro_bypass') === '1'; } catch (e) { return false; } }
        var pill = null;
        function testPill() {   // đang ở chế độ Admin test: nhắc + nút xem lại video
            var need = want && byp();
            if (need && !pill) {
                pill = d.createElement('div'); pill.id = 'qd-intro-test';
                pill.innerHTML = '<span>🎬 Admin test · video giới thiệu đang bật</span><button type="button">Xem video</button>';
                pill.querySelector('button').addEventListener('click', function () { try { sessionStorage.removeItem('qd_intro_bypass'); } catch (e) {} render(); });
                d.body.appendChild(pill);
            }
            if (pill) pill.classList.toggle('show', need);
        }
        function set(on, k) {
            want = on; key = VIDS[k] ? k : 'phonk';
            ls('qd_intro_on', on ? '1' : null); if (on) ls('qd_intro_vid', key);
            render();
        }
        // Chặn mở form đăng ký khi đang chiếu video (index)
        if (typeof W.openRegisterModal === 'function') { var _o = W.openRegisterModal; W.openRegisterModal = function () { if (W.__qdIntroOn) return; return _o.apply(this, arguments); }; }
        if (ls('qd_intro_on') === '1') set(true, ls('qd_intro_vid'));   // hiện ngay theo lần trước, không lóe trang đăng nhập
        if (GATE) setInterval(render, 400);   // đăng xuất -> hiện video; đăng nhập (phiên cũ) -> ẩn
        (function listen(n) {
            try {
                firebase.firestore().collection('settings').doc('intro_video').onSnapshot(function (doc) {
                    var x = doc.exists ? doc.data() : {}; set(x.isEnabled === true, x.video);
                }, function (e) { try { console.warn('[QD intro] không đọc được settings/intro_video', e && e.code); } catch (er) {} });
            } catch (e) { setTimeout(function () { listen(n + 1); }, n < 40 ? 250 : 1000); }   // firebase chậm -> thử lại tới khi được (trước đây bỏ cuộc sau 10 giây)
        })(0);
        W.QDIntro = { on: function (k) { set(true, k); } };
    })();
    
