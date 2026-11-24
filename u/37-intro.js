    /* ===== POSTER GIỚI THIỆU (Admin > Cài đặt > Quản lý poster giới thiệu, settings/intro_video.isEnabled) =====
       Bật: trang chủ + màn hình đăng nhập chỉ hiện poster "Hệ thống chính thức mở cửa", ẩn Đăng nhập / Đăng ký (ai đã đăng nhập vẫn dùng bình thường).
       Màn dọc (điện thoại): poster dọc; màn ngang (máy tính): poster ngang. Nhạc nền Tết vẫn phát như thường.
       Admin vào test: chạm 5 lần liền vào góc trên bên trái -> nhập mã quản trị (chỉ tab này). */
    (function () {
        var W = window, d = document, html = d.documentElement, GATE = '#auth-gate';
        var POSTER = { doc: 'media/gioi-thieu-poster.jpg?v=2', ngang: 'media/gioi-thieu-poster-ngang.jpg?v=2' };
        function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
        var box, img, bg, cur = '', want = false, shown = false;
        function srcFor() { return W.innerWidth > W.innerHeight * 1.05 ? POSTER.ngang : POSTER.doc; }
        function build() {
            if (box) return;
            box = d.createElement('div'); box.id = 'qd-intro'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Poster giới thiệu');
            box.innerHTML = '<img class="bg" alt="" aria-hidden="true"><img class="pst" alt="Hệ thống chính thức mở cửa — ngày ra mắt 22.01.2027">'
                + '<button type="button" class="adm" tabindex="-1" aria-hidden="true"></button>'
                + '<div class="gate"><form autocomplete="off"><b>🔒 Admin vào test</b>Nhập mã quản trị để vào hệ thống khi poster giới thiệu đang bật (chỉ tab này).'
                + '<input type="password" inputmode="numeric" placeholder="••••••••"><div class="err">Mã không đúng!</div>'
                + '<div class="btns"><button type="button" class="no">Hủy</button><button type="submit" class="yes">Vào hệ thống</button></div></form></div>';
            d.body.appendChild(box);
            img = box.querySelector('.pst'); bg = box.querySelector('.bg');
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
            W.addEventListener('resize', function () { if (shown) render(); });
        }
        function gateOpen() {   // user.html: chỉ hiện khi đang ở màn hình đăng nhập (chưa đăng nhập)
            if (!GATE) return true;
            var g = d.querySelector(GATE); if (!g) return false;
            if (html.classList.contains('qd-boot')) return false;   // đang tự đăng nhập lại phiên cũ
            return g.style.display !== 'none' && g.style.opacity !== '0';
        }
        function render() {
            testPill();
            var on = want && !byp() && gateOpen(), src = on ? srcFor() : '';
            if (on === shown && (!on || cur === src)) return;
            shown = on; W.__qdIntroOn = on;
            if (on) {
                build(); html.classList.add('qd-intro-on'); box.classList.toggle('land', src === POSTER.ngang);
                if (cur !== src) { cur = src; img.src = src; bg.src = src; }
            } else html.classList.remove('qd-intro-on');
        }
        function byp() { try { return sessionStorage.getItem('qd_intro_bypass') === '1'; } catch (e) { return false; } }
        var pill = null;
        function testPill() {   // đang ở chế độ Admin test: nhắc + nút xem lại poster
            var need = want && byp();
            if (need && !pill) {
                pill = d.createElement('div'); pill.id = 'qd-intro-test';
                pill.innerHTML = '<span>🖼️ Admin test · poster giới thiệu đang bật</span><button type="button">Xem poster</button>';
                pill.querySelector('button').addEventListener('click', function () { try { sessionStorage.removeItem('qd_intro_bypass'); } catch (e) {} render(); });
                d.body.appendChild(pill);
            }
            if (pill) pill.classList.toggle('show', need);
        }
        function set(on) { want = on; ls('qd_intro_on', on ? '1' : null); render(); }
        // Chặn mở form đăng ký khi đang hiện poster (index)
        if (typeof W.openRegisterModal === 'function') { var _o = W.openRegisterModal; W.openRegisterModal = function () { if (W.__qdIntroOn) return; return _o.apply(this, arguments); }; }
        if (ls('qd_intro_on') === '1') set(true);   // hiện ngay theo lần trước, không lóe trang đăng nhập
        if (GATE) setInterval(render, 400);   // đăng xuất -> hiện poster; đăng nhập (phiên cũ) -> ẩn
        (function listen(n) {
            try {
                firebase.firestore().collection('settings').doc('intro_video').onSnapshot(function (doc) {
                    var x = doc.exists ? doc.data() : {}; set(x.isEnabled === true);
                }, function (e) { try { console.warn('[QD intro] không đọc được settings/intro_video', e && e.code); } catch (er) {} });
            } catch (e) { setTimeout(function () { listen(n + 1); }, n < 40 ? 250 : 1000); }   // firebase chậm -> thử lại tới khi được
        })(0);
        W.QDIntro = { on: function () { set(true); } };
    })();
