    /* ===== POSTER GIỚI THIỆU (Admin > Cài đặt > Quản lý poster giới thiệu, settings/intro_video.isEnabled) =====
       Bật: trang chủ + màn hình đăng nhập chỉ hiện poster "Hệ thống chính thức mở cửa", ẩn Đăng nhập / Đăng ký (ai đã đăng nhập vẫn dùng bình thường).
       Poster dựng bằng HTML (không phải ảnh): nền Tết phủ kín MỌI tỉ lệ màn hình, chữ + logo tự co giãn vừa khít (không cắt, luôn nét).
       Màn dọc (điện thoại): bố cục dọc; màn ngang (máy tính): bố cục ngang. Nhạc nền Tết vẫn phát như thường.
       Admin vào test: chạm 5 lần liền vào góc trên bên trái -> nhập mã quản trị (chỉ tab này). */
    (function () {
        var W = window, d = document, html = d.documentElement, GATE = '#auth-gate';
        var CSS = '#qd-intro{container-type:size}'
            + '#qd-intro .qp{position:absolute;inset:0;overflow:hidden;display:flex;align-items:center;justify-content:center;text-align:center;font-family:"Be Vietnam Pro",system-ui,sans-serif;color:#4a0a12;background:#fff0cf url(media/nen-tet-doc.jpg) center/cover no-repeat;--u:min(.94vh,1.67vw);-webkit-user-select:none;user-select:none}'
            + '#qd-intro.land .qp{background-image:url(media/nen-tet-ngang.jpg);--u:min(1.08vh,.7vw)}'
            + '@supports (width:1cqw){#qd-intro .qp{--u:min(.94cqh,1.67cqw)}#qd-intro.land .qp{--u:min(1.08cqh,.7cqw)}}'
            + '#qd-intro .qp-glow{position:absolute;left:50%;top:50%;width:min(140cqw,140vw);aspect-ratio:1;transform:translate(-50%,-50%);background:radial-gradient(closest-side,rgba(255,250,235,.92),rgba(255,248,230,.55) 45%,rgba(255,246,226,0) 72%);pointer-events:none}'
            + '#qd-intro.land .qp-glow{width:min(80cqw,80vw);aspect-ratio:1.3}'
            + '#qd-intro .qp-in{position:relative;display:flex;flex-direction:column;align-items:center}'
            + '#qd-intro .qp-logo{border-radius:24%;padding:calc(var(--u)*.9);background:linear-gradient(160deg,#ffe7a3,#f2c14e 45%,#c98d1c);box-shadow:0 calc(var(--u)*2) calc(var(--u)*5) rgba(120,10,20,.35),0 0 0 calc(var(--u)*.5) rgba(255,255,255,.7) inset}'
            + '#qd-intro .qp-logo img{display:block;width:calc(var(--u)*12.8);height:calc(var(--u)*12.8)}'
            + '#qd-intro.land .qp-logo img{width:calc(var(--u)*10.2);height:calc(var(--u)*10.2)}'
            + '#qd-intro .qp-team{font-weight:900;letter-spacing:.12em;color:#8e0b1e;font-size:calc(var(--u)*1.9);margin-top:calc(var(--u)*2.2)}#qd-intro .qp-team span{color:#c98d1c}'
            + '#qd-intro .qp-rib{position:relative;margin-top:calc(var(--u)*3);padding:calc(var(--u)*1.1) calc(var(--u)*4.2);background:linear-gradient(180deg,#d71e35,#8e0b1e);color:#ffe39a;font-weight:900;font-size:calc(var(--u)*2.4);letter-spacing:.14em;border:calc(var(--u)*.3) solid #f2c14e;border-radius:calc(var(--u)*.8);box-shadow:0 calc(var(--u)*.8) calc(var(--u)*2) rgba(120,10,20,.3)}'
            + '#qd-intro .qp-rib:before,#qd-intro .qp-rib:after{content:"";position:absolute;top:50%;width:calc(var(--u)*2.4);height:calc(var(--u)*.3);background:#c98d1c}#qd-intro .qp-rib:before{right:100%;margin-right:calc(var(--u)*1.2)}#qd-intro .qp-rib:after{left:100%;margin-left:calc(var(--u)*1.2)}'
            + '#qd-intro .qp h1{margin:calc(var(--u)*2.2) 0 0;font-weight:900;line-height:.98}'
            + '#qd-intro .qp h1 b{display:block;font-size:calc(var(--u)*6.2);background:linear-gradient(180deg,#ef2a3d 0%,#c8102e 52%,#85091b 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 calc(var(--u)*.5) 0 #ffe3a0) drop-shadow(0 calc(var(--u)*1) calc(var(--u)*1.4) rgba(130,10,20,.35))}'
            + '#qd-intro .qp h1 b.big{font-size:calc(var(--u)*9.2)}#qd-intro.land .qp h1 b{font-size:calc(var(--u)*6.5)}#qd-intro.land .qp h1 b.big{font-size:calc(var(--u)*11.4)}'
            + '#qd-intro .qp h1 .l1{display:none}#qd-intro.land .qp h1 .l1{display:block}#qd-intro.land .qp h1 .l2{display:none}'
            + '#qd-intro .qp-sub{font-family:"Playfair Display",serif;font-weight:600;font-size:calc(var(--u)*2.6);margin-top:calc(var(--u)*2)}'
            + '#qd-intro .qp-date{display:inline-flex;align-items:center;gap:calc(var(--u)*2);margin-top:calc(var(--u)*3);padding:calc(var(--u)*1.3) calc(var(--u)*3.2);border-radius:calc(var(--u)*2.2);background:linear-gradient(180deg,#d71e35,#8e0b1e);border:calc(var(--u)*.35) solid #f2c14e;box-shadow:0 calc(var(--u)*1) calc(var(--u)*2.6) rgba(120,10,20,.3);color:#fff;text-align:left}'
            + '#qd-intro .qp-date i{font-size:calc(var(--u)*3.6);color:#f2c14e}#qd-intro .qp-date small{display:block;font-size:calc(var(--u)*1.6);font-weight:800;letter-spacing:.12em;color:#ffe39a;line-height:1.25}#qd-intro .qp-date strong{display:block;font-size:calc(var(--u)*5.2);font-weight:900;line-height:1}'
            + '#qd-intro .qp-feat{display:flex;flex-wrap:wrap;justify-content:center;gap:calc(var(--u)*1.2);margin-top:calc(var(--u)*3);max-width:calc(var(--u)*55)}#qd-intro.land .qp-feat{max-width:none}'
            + '#qd-intro .qp-feat span{display:inline-flex;align-items:center;gap:calc(var(--u)*.9);padding:calc(var(--u)*1) calc(var(--u)*1.8);border-radius:999px;background:rgba(255,252,244,.94);border:calc(var(--u)*.22) solid rgba(201,141,28,.55);font-weight:800;font-size:calc(var(--u)*1.9);box-shadow:0 calc(var(--u)*.5) calc(var(--u)*1.2) rgba(120,60,10,.12)}#qd-intro .qp-feat i{color:#c8102e;font-size:calc(var(--u)*2)}'
            + '#qd-intro .qp-url{display:inline-flex;align-items:center;gap:calc(var(--u)*1);margin-top:calc(var(--u)*3);padding:calc(var(--u)*1) calc(var(--u)*2.4);border-radius:999px;background:#4a0a12;color:#ffe39a;font-weight:800;font-size:calc(var(--u)*2)}#qd-intro .qp-url i{color:#f2c14e}';
        var QP = '<div class="qp" aria-label="Hệ thống chính thức mở cửa — ngày ra mắt 22.01.2027"><div class="qp-glow"></div><div class="qp-in">'
            + '<div class="qp-logo"><img src="media/qd-logo-512.webp?v=1" alt=""></div>'
            + '<div class="qp-team">TEAM T"L"HEADSHOT <span>·</span> QUÂN ĐOÀN</div>'
            + '<div class="qp-rib">THÔNG BÁO CHÍNH THỨC</div>'
            + '<h1><b class="l1">HỆ THỐNG CHÍNH THỨC</b><b class="l2">HỆ THỐNG</b><b class="l2">CHÍNH THỨC</b><b class="big">MỞ CỬA</b></h1>'
            + '<div class="qp-sub">Cùng anh em đón Tết Đinh Mùi 2027</div>'
            + '<div class="qp-date"><i class="fa-solid fa-calendar-days"></i><div><small>NGÀY RA MẮT</small><strong>22.01.2027</strong></div></div>'
            + '<div class="qp-feat"><span><i class="fa-solid fa-envelope-open-text"></i>Lì xì may mắn</span><span><i class="fa-solid fa-dharmachakra"></i>Vòng quay</span><span><i class="fa-solid fa-ticket"></i>Quay số trực tiếp</span><span><i class="fa-solid fa-trophy"></i>Giải đấu</span></div>'
            + '<div class="qp-url"><i class="fa-solid fa-globe"></i>vantrinhvn.github.io/sukienqd</div>'
            + '</div></div>';
        function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
        var box, cur = '', want = false, shown = false;
        function srcFor() { return W.innerWidth > W.innerHeight * 1.05 ? 'land' : 'doc'; }
        function build() {
            if (box) return;
            box = d.createElement('div'); box.id = 'qd-intro'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Poster giới thiệu');
            if (!d.getElementById('qd-intro-poster-css')) { var st = d.createElement('style'); st.id = 'qd-intro-poster-css'; st.textContent = CSS; d.head.appendChild(st); }
            box.innerHTML = QP
                + '<button type="button" class="adm" tabindex="-1" aria-hidden="true"></button>'
                + '<div class="gate"><form autocomplete="off"><b>🔒 Admin vào test</b>Nhập mã quản trị để vào hệ thống khi poster giới thiệu đang bật (chỉ tab này).'
                + '<input type="password" inputmode="numeric" placeholder="••••••••"><div class="err">Mã không đúng!</div>'
                + '<div class="btns"><button type="button" class="no">Hủy</button><button type="submit" class="yes">Vào hệ thống</button></div></form></div>';
            d.body.appendChild(box);
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
                build(); html.classList.add('qd-intro-on'); box.classList.toggle('land', src === 'land'); cur = src;
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
