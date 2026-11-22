/* =====================================================================
   QĐ — GỌI NHÓM (thoại / có hình), dùng trong trang thành viên (user.html)
   ---------------------------------------------------------------------
   - Các máy nối thẳng với nhau từng cặp (WebRTC), tiếng / hình không qua máy chủ. Tối đa 8 người;
     bật hình được khi cuộc gọi có từ 4 người trở xuống (Admin chỉnh được: settings/gcall_config).
   - Hai cách bắt đầu:
       1. Phòng gọi Kênh Chung (gcalls/general): ai muốn thì vào, không đổ chuông ai.
       2. Chọn người để gọi: tạo gcalls/{mã}; mỗi người được mời có 1 cuộc gọi đến calls/{mã} (group = mã nhóm)
          -> điện thoại người đó đổ chuông như cuộc gọi thường (kể cả app đã thoát, app bản cũ).
   - Dữ liệu:
       gcalls/{id}   = { room: 'general'|'invite', host, hostName, type: 'audio'|'video', status: 'live'|'ended', created, updatedAt,
                         members: { <tên đăng nhập>: { at, ping, mic, cam, name } } }
       gcall_sig/{x} = { call, from, to, gen, created, offer, answer, cFrom: [], cTo: [] }  — báo hiệu cho 1 cặp máy.
     Người vào sau gửi lời mời kết nối cho từng người vào trước (không bao giờ 2 bên cùng mời nhau).
     Mỗi máy báo "còn trong cuộc gọi" 15 giây / lần; quá 45 giây không báo = đã rời (máy hỏng / mất mạng).
   ===================================================================== */
window.QDGroupCall = (function () {
    'use strict';
    var d = document, W = window, Q = W.QDNative || null;
    var CFG = { on: true, general: true, max: 8, vmax: 4, screen: true };
    var PING_MS = 15000, STALE_MS = 45000, RING_MS = 45000, CONN_MS = 25000;
    var ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }];
    var cfgIce = null, G = null, IN = null, room = { members: {} }, booted = false;

    /* ---------- tiện ích ---------- */
    function db() { return firebase.firestore(); }
    function FV() { return firebase.firestore.FieldValue; }
    function me() { return (W.State && State.currentUser) || ''; }
    function $(id) { return d.getElementById(id); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function nameOf(u) {
        var N = (W.State && State.nicknames) || {}; if (N[u]) return N[u];
        if (u === me() && W.State && State.fullName) return State.fullName;
        var a = (W.State && State.accInfo) || {}; return (a[u] && a[u].fullName) || u;
    }
    function avatar(u) { var n = nameOf(u); try { if (W.Avatar && Avatar.inner) return Avatar.inner(((W.State && State.avatars) || {})[u], n); } catch (e) {} return esc(String(n || '?').charAt(0).toUpperCase()); }
    function toast(m, t) { try { Utils.toast(m, t || 'info'); } catch (e) {} }
    function supported() { return !!(W.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
    function iceCfg() { return { iceServers: cfgIce && cfgIce.length ? [ICE[0], ICE[1]].concat(cfgIce) : ICE, iceCandidatePoolSize: 1 }; }
    function fmt(ms) { var s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; s %= 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s; }
    function live(m, now) { return !!m && (now || Date.now()) - (+m.ping || +m.at || 0) < STALE_MS; }
    function liveList(members) { var now = Date.now(); return Object.keys(members || {}).filter(function (u) { return live(members[u], now); }).sort(function (a, b) { return (+members[a].at || 0) - (+members[b].at || 0) || (a < b ? -1 : 1); }); }
    function oneOneBusy() { try { return !!(W.QDCall && QDCall.active && QDCall.active()); } catch (e) { return false; } }
    function hush(on) { try { if (W.QDHush) QDHush[on ? 'on' : 'off']('gcall'); } catch (e) {} }
    function json(x) { try { return JSON.stringify(x.toJSON ? x.toJSON() : x); } catch (e) { return ''; } }

    /* ---------- âm báo ---------- */
    var AC = null, ringAu = null, nativeRing = false, beepT = 0;
    function ac() { try { AC = AC || new (W.AudioContext || W.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) {} return AC; }
    function beep(f, dur, vol) { var a = ac(); if (!a) return; var t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .03); g.gain.setValueAtTime(vol, t + dur - .05); g.gain.linearRampToValueAtTime(0, t + dur); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + .02); }
    function ringStart() {
        ringStop();
        if (Q && typeof Q.ringStart === 'function') { try { Q.ringStart(); nativeRing = true; return; } catch (e) {} }
        try { if (!ringAu) { ringAu = new Audio('media/qd-ring.mp3?v=3'); ringAu.loop = true; } ringAu.currentTime = 0; var p = ringAu.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
        try { if (navigator.vibrate) { navigator.vibrate([400, 300, 400]); beepT = setInterval(function () { navigator.vibrate([400, 300, 400]); }, 2500); } } catch (e) {}
    }
    function ringStop() {
        if (nativeRing) { nativeRing = false; try { Q.ringStop(); } catch (e) {} }
        try { if (ringAu) { ringAu.pause(); ringAu.currentTime = 0; } } catch (e) {}
        clearInterval(beepT); beepT = 0; try { navigator.vibrate && navigator.vibrate(0); } catch (e) {}
    }
    var backT = 0;
    function ringback(on) {   // đang chờ người được mời: "tút... tút"
        clearInterval(backT); backT = 0;
        if (on) { beep(425, 1.0, .07); backT = setInterval(function () { beep(425, 1.0, .07); }, 3500); }
    }
    function joinSound() { beep(660, .12, .08); setTimeout(function () { beep(880, .14, .08); }, 120); }
    function leaveSound() { beep(660, .12, .07); setTimeout(function () { beep(495, .16, .07); }, 120); }

    /* ---------- giao diện ---------- */
    var CSS = '\
#qd-gcall{position:fixed;inset:0;z-index:2147482600;display:none;flex-direction:column;background:radial-gradient(120% 80% at 50% 0%,#3a0d10 0%,#140b0a 60%);color:#f7efe6;font-family:inherit;padding:max(10px,env(safe-area-inset-top)) 10px max(12px,env(safe-area-inset-bottom))}\
#qd-gcall.on{display:flex}\
#qd-gcall [hidden],#gc-in [hidden],#gc-sheet [hidden]{display:none!important}\
#qd-gcall .gc-top{display:flex;align-items:center;gap:10px;padding:4px 4px 10px}\
#qd-gcall .gc-top h3{margin:0;font-size:16px;font-weight:800;color:#ffd96b;line-height:1.2}\
#qd-gcall .gc-top small{display:block;font-size:12.5px;color:#d9c3b0;font-weight:600;margin-top:2px;font-variant-numeric:tabular-nums}\
#qd-gcall .gc-tt{flex:1;min-width:0}\
#qd-gcall .gc-ib{width:40px;height:40px;border-radius:50%;border:1px solid rgba(233,185,73,.45);background:rgba(255,255,255,.06);color:#ffe7a8;display:grid;place-items:center;font-size:16px;cursor:pointer;flex:0 0 auto}\
#qd-gcall .gc-grid{flex:1;min-height:0;display:grid;gap:8px;grid-template-columns:repeat(var(--gc-c,1),minmax(0,1fr));grid-auto-rows:minmax(0,1fr)}\
#qd-gcall .gc-t{position:relative;min-height:0;border-radius:18px;overflow:hidden;background:linear-gradient(160deg,#2a1714,#1b0f0d);border:1px solid rgba(233,185,73,.22);display:grid;place-items:center;transition:box-shadow .15s}\
#qd-gcall .gc-t.spk{box-shadow:0 0 0 2px #ffd54a,0 0 18px rgba(255,213,74,.35)}\
#qd-gcall .gc-t video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;display:none}\
#qd-gcall .gc-t.vid video{display:block}\
#qd-gcall .gc-t.me video{transform:scaleX(-1)}\
#qd-gcall .gc-t.scr video{transform:none;object-fit:contain;background:#000}\
#qd-gcall .gc-t.scr{border-color:rgba(74,163,255,.55);cursor:zoom-in}\
#qd-gcall .gc-t.scr .gc-zoom{display:block}\
#qd-gcall .gc-zoom{display:none;position:absolute;top:8px;right:8px;font-size:11.5px;font-weight:700;color:#fff;background:rgba(0,0,0,.5);border-radius:999px;padding:3px 9px;z-index:2}\
#qd-gcall .gc-t:fullscreen{border-radius:0;border:0;background:#000;cursor:zoom-out}\
#qd-gcall .gc-t:fullscreen .gc-zoom{display:none}\
#qd-gcall .gc-t.big{position:fixed;inset:0;z-index:5;border-radius:0;border:0;background:#000;cursor:zoom-out}\
#qd-gcall .gc-b.sharing i{background:#4aa3ff;border-color:#9fd0ff;color:#fff}\
#qd-gcall .gc-t .gc-av{width:min(34%,96px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;font-size:clamp(20px,6vw,34px);font-weight:800;color:#fff;background:linear-gradient(150deg,#b81d27,#7d0c15);border:2px solid rgba(255,213,74,.6);overflow:hidden}\
#qd-gcall .gc-t .gc-av img{width:100%;height:100%;object-fit:cover}\
#qd-gcall .gc-t.vid .gc-av{display:none}\
#qd-gcall .gc-t .gc-nm{position:absolute;left:8px;bottom:8px;right:8px;display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.7);white-space:nowrap;overflow:hidden}\
#qd-gcall .gc-t .gc-nm span{overflow:hidden;text-overflow:ellipsis}\
#qd-gcall .gc-t .gc-nm i{color:#ff8a8a;font-size:12px}\
#qd-gcall .gc-t .gc-st{position:absolute;top:8px;left:8px;font-size:11.5px;font-weight:700;color:#ffe7a8;background:rgba(0,0,0,.45);border-radius:999px;padding:2px 8px}\
#qd-gcall .gc-t .gc-st:empty{display:none}\
#qd-gcall .gc-pend{display:flex;gap:6px;flex-wrap:wrap;padding:8px 2px 0;min-height:0}\
#qd-gcall .gc-pend:empty{display:none}\
#qd-gcall .gc-pend span{font-size:12px;font-weight:700;color:#ffe7a8;background:rgba(233,185,73,.14);border:1px solid rgba(233,185,73,.3);border-radius:999px;padding:3px 10px}\
#qd-gcall .gc-bar{display:flex;justify-content:space-evenly;gap:6px;flex-wrap:nowrap;padding-top:12px;max-width:560px;width:100%;margin:0 auto}\
#qd-gcall .gc-b{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;flex:1 1 0;max-width:76px;background:none;border:0;color:#f3e6d8;font:600 11px/1.2 inherit;cursor:pointer;white-space:nowrap}\
#qd-gcall .gc-b i{width:50px;height:50px;border-radius:50%;display:grid;place-items:center;font-size:18px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14)}\
@media(max-width:360px){#qd-gcall .gc-b i{width:44px;height:44px;font-size:16px}#qd-gcall .gc-b{font-size:10px}}\
#qd-gcall .gc-b.off i{background:#f3e6d8;color:#2a1405}\
#qd-gcall .gc-b.end i{background:#d63a3a;border-color:#ff9c9c;color:#fff}\
#qd-gcall .gc-b[disabled]{opacity:.4;cursor:default}\
#qd-gcall .gc-b:active:not([disabled]) i{transform:scale(.93)}\
#gc-pill{position:fixed;left:50%;transform:translateX(-50%);top:max(10px,env(safe-area-inset-top));z-index:2147482500;display:none;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:linear-gradient(150deg,#16a34a,#0f7a37);color:#fff;font:700 13px/1.2 inherit;box-shadow:0 10px 24px -10px rgba(0,0,0,.6);cursor:pointer;border:1px solid rgba(255,255,255,.35)}\
#gc-pill.on{display:flex}\
#gc-in{position:fixed;inset:0;z-index:2147482700;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:radial-gradient(120% 80% at 50% 0%,#3a0d10 0%,#140b0a 65%);color:#f7efe6}\
#gc-in.on{display:flex}\
#gc-in .gc-av{width:96px;height:96px;border-radius:50%;display:grid;place-items:center;font-size:36px;font-weight:800;color:#fff;background:linear-gradient(150deg,#b81d27,#7d0c15);border:2px solid rgba(255,213,74,.7);overflow:hidden;animation:gcPulse 1.6s ease-in-out infinite}\
#gc-in .gc-av img{width:100%;height:100%;object-fit:cover}\
@keyframes gcPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,213,74,.45)}50%{box-shadow:0 0 0 16px rgba(255,213,74,0)}}\
#gc-in h3{margin:0;font-size:20px;font-weight:800;color:#ffd96b}\
#gc-in p{margin:0;color:#e5d3c2;font-size:14.5px}\
#gc-in .gc-in-b{display:flex;gap:28px;margin-top:18px}\
#gc-in .gc-b{display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:0;color:#f3e6d8;font:700 12.5px inherit;cursor:pointer}\
#gc-in .gc-b i{width:62px;height:62px;border-radius:50%;display:grid;place-items:center;font-size:22px;color:#fff}\
#gc-in .gc-b.no i{background:#d63a3a}#gc-in .gc-b.ok i{background:#16a34a}\
#gc-sheet{position:fixed;inset:0;z-index:2147482400;display:none;align-items:flex-end;justify-content:center;background:rgba(20,4,4,.55)}\
#gc-sheet.on{display:flex}\
#gc-sheet .gs{width:100%;max-width:520px;max-height:88dvh;overflow:auto;background:#fff8ea;color:#2a1405;border-radius:22px 22px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom));border:1px solid #e9c46a;box-shadow:0 -20px 40px -20px rgba(0,0,0,.5)}\
@media(min-width:640px){#gc-sheet{align-items:center}#gc-sheet .gs{border-radius:22px}}\
#gc-sheet .gs h3{margin:0 0 4px;font-size:18px;font-weight:800;color:#8f0a12!important;display:flex;align-items:center;gap:8px;text-shadow:none!important}\
#gc-sheet h3 button{margin-left:auto;width:34px;height:34px;border-radius:50%;border:1px solid #e9c46a;background:#fff;color:#8a5a2b;font-size:16px;cursor:pointer}\
#gc-sheet .gs-sec{margin-top:14px;padding:14px;border-radius:16px;background:#fff;border:1px solid #f0dcaa}\
#gc-sheet .gs-sec b{font-size:14.5px;font-weight:800;color:#2a1405}\
#gc-sheet .gs-sec p{margin:4px 0 10px;font-size:13px;color:#7a5a40;text-shadow:none;font-weight:500}\
#gc-sheet .gs-ppl{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}\
#gc-sheet .gs-ppl span{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;background:#fff3d1;border:1px solid #f0dcaa;border-radius:999px;padding:3px 10px 3px 3px;color:#5c2a04;text-shadow:none}\
#gc-sheet .gs-ppl .avatar-circle{width:24px;height:24px;min-width:24px;font-size:11px}\
#gc-sheet .gs-go{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:14px;border:0;font:800 14.5px inherit;cursor:pointer;color:#fff;background:linear-gradient(150deg,#16a34a,#0f7a37)}\
#gc-sheet .gs-go.red{background:linear-gradient(150deg,#c8202b,#8e0e17)}\
#gc-sheet .gs-go[disabled]{opacity:.5;cursor:default}\
#gc-sheet input.gs-q{width:100%;padding:10px 14px;border-radius:12px;border:1px solid #e9c46a;font:inherit;font-size:14px;margin-bottom:8px;background:#fffdf6;color:#2a1405}\
#gc-sheet .gs-list{max-height:40dvh;overflow:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:10px}\
#gc-sheet .gs-it{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:12px;cursor:pointer;border:1px solid transparent}\
#gc-sheet .gs-it.on{background:#fff3d1;border-color:#e9c46a}\
#gc-sheet .gs-it .avatar-circle{width:36px;height:36px;min-width:36px;font-size:14px;position:relative}\
#gc-sheet .gs-it .nm{flex:1;min-width:0;font-size:14px;font-weight:700;color:#2a1405;text-shadow:none}\
#gc-sheet .gs-it .nm small{display:block;font-size:12px;color:#8a6a50;font-weight:600}\
#gc-sheet .gs-it .ck{width:22px;height:22px;border-radius:7px;border:2px solid #d9b46a;display:grid;place-items:center;color:#fff;font-size:12px}\
#gc-sheet .gs-it.on .ck{background:#16a34a;border-color:#16a34a}\
#gc-sheet .gs-seg{display:flex;gap:6px;margin-bottom:10px}\
#gc-sheet .gs-seg button{flex:1;padding:9px;border-radius:12px;border:1px solid #e9c46a;background:#fff;font:700 13.5px inherit;color:#5c2a04;cursor:pointer}\
#gc-sheet .gs-seg button.on{background:#8f0a12;color:#ffd96b;border-color:#8f0a12}\
#gc-live{display:none;align-items:center;gap:10px;margin:8px 10px 0;padding:9px 12px;border-radius:14px;background:linear-gradient(150deg,#16a34a,#0f7a37);color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;border:1px solid rgba(255,255,255,.35)}\
#gc-live.on{display:flex}#gc-live span{flex:1;min-width:0;text-shadow:none!important;color:#fff!important}\
#gc-live b{background:#fff;color:#0f7a37;border-radius:999px;padding:4px 12px;font-size:12.5px;text-shadow:none}\
.gc-hb{position:relative}.gc-hb .gc-n{position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;border-radius:999px;background:#16a34a;color:#fff;font:800 10px/17px system-ui;padding:0 4px;box-shadow:0 0 0 2px #fff}\
.gc-hb .gc-n:empty{display:none}\
.qd-gc-kc{display:inline-block;margin-left:6px;font-size:11px;font-weight:800;color:#fff;background:#16a34a;border-radius:999px;padding:1px 7px;vertical-align:middle;text-shadow:none}\
@media (prefers-reduced-motion: reduce){#gc-in .gc-av{animation:none}}';

    function injectCSS() { if ($('qd-gcall-css')) return; var st = d.createElement('style'); st.id = 'qd-gcall-css'; st.textContent = CSS; (d.head || d.documentElement).appendChild(st); }
    function ensureUI() {
        injectCSS();
        if ($('qd-gcall')) return;
        var o = d.createElement('div'); o.id = 'qd-gcall'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Cuộc gọi nhóm');
        o.innerHTML = '<div class="gc-top"><button type="button" class="gc-ib" data-k="min" title="Thu nhỏ" aria-label="Thu nhỏ"><i class="fa-solid fa-chevron-down"></i></button>'
            + '<div class="gc-tt"><h3 id="gc-title">Gọi nhóm</h3><small id="gc-sub">Đang kết nối…</small></div></div>'
            + '<div class="gc-grid" id="gc-grid"></div><div class="gc-pend" id="gc-pend"></div>'
            + '<div class="gc-bar">'
            + '<button type="button" class="gc-b" data-k="mic"><i class="fa-solid fa-microphone"></i><span>Micro</span></button>'
            + '<button type="button" class="gc-b" data-k="cam"><i class="fa-solid fa-video"></i><span>Bật hình</span></button>'
            + '<button type="button" class="gc-b" data-k="share" hidden><i class="fa-solid fa-display"></i><span>Màn hình</span></button>'
            + '<button type="button" class="gc-b" data-k="flip" hidden><i class="fa-solid fa-camera-rotate"></i><span>Đổi cam</span></button>'
            + '<button type="button" class="gc-b" data-k="spk" hidden><i class="fa-solid fa-volume-high"></i><span>Loa ngoài</span></button>'
            + '<button type="button" class="gc-b" data-k="add"><i class="fa-solid fa-user-plus"></i><span>Mời thêm</span></button>'
            + '<button type="button" class="gc-b end" data-k="leave"><i class="fa-solid fa-phone-slash"></i><span>Rời</span></button></div>';
        d.body.appendChild(o);
        o.querySelector('.gc-bar').addEventListener('click', function (e) { var b = e.target.closest('.gc-b'); if (!b || b.disabled) return; act(b.dataset.k); });
        o.querySelector('[data-k="min"]').addEventListener('click', function () { minimize(true); });
        o.querySelector('#gc-grid').addEventListener('click', function (e) { var t = e.target.closest('.gc-t'); if (t && (t.classList.contains('scr') || t.classList.contains('big') || d.fullscreenElement === t)) zoom(t); });
        var pill = d.createElement('div'); pill.id = 'gc-pill'; pill.setAttribute('role', 'button'); pill.innerHTML = '<i class="fa-solid fa-users"></i><span id="gc-pill-t">Gọi nhóm</span>';
        pill.addEventListener('click', function () { minimize(false); }); d.body.appendChild(pill);
        var inc = d.createElement('div'); inc.id = 'gc-in'; inc.setAttribute('role', 'alertdialog');
        inc.innerHTML = '<div class="gc-av" id="gc-in-av"></div><h3 id="gc-in-t"></h3><p id="gc-in-s"></p><div class="gc-in-b">'
            + '<button type="button" class="gc-b no" data-k="no"><i class="fa-solid fa-phone-slash"></i>Từ chối</button>'
            + '<button type="button" class="gc-b ok" data-k="ok"><i class="fa-solid fa-phone"></i><span>Tham gia</span></button>'
            + '<button type="button" class="gc-b ok" data-k="okv" hidden><i class="fa-solid fa-video"></i>Có hình</button></div>';
        inc.addEventListener('click', function (e) { var b = e.target.closest('.gc-b'); if (!b) return; if (b.dataset.k === 'no') inDecline(); else inAccept(b.dataset.k === 'okv'); });
        d.body.appendChild(inc);
        var sh = d.createElement('div'); sh.id = 'gc-sheet'; sh.innerHTML = '<div class="gs" role="dialog" aria-label="Gọi nhóm"></div>';
        sh.addEventListener('click', function (e) { if (e.target === sh) sheetClose(); }); d.body.appendChild(sh);
    }
    function minimize(on) {
        var o = $('qd-gcall'), p = $('gc-pill'); if (!o) return;
        if (!G) { o.classList.remove('on'); p.classList.remove('on'); return; }
        o.classList.toggle('on', !on); p.classList.toggle('on', !!on); G.min = !!on; paintTop();
    }

    /* ---------- cấu hình ---------- */
    function loadCfg() {
        db().collection('settings').doc('gcall_config').onSnapshot(function (x) {
            var c = x.exists ? x.data() : {}, n = function (v, def, lo, hi) { v = parseInt(v, 10); return isNaN(v) ? def : Math.max(lo, Math.min(hi, v)); };
            CFG = { on: c.isEnabled !== false, general: c.general !== false, max: n(c.max, 8, 2, 8), vmax: n(c.videoMax, 4, 0, 4), screen: c.screen !== false };
            if (!CFG.screen && G && G.share) { stopShare(); toast('Ban Quản Trị vừa tắt chia sẻ màn hình.', 'warning'); }
            paintEntry(); if (G) paintAll();
        }, function () {});
        db().collection('settings').doc('call_config').onSnapshot(function (x) { var c = x.exists ? x.data() : {}; cfgIce = Array.isArray(c.iceServers) && c.iceServers.length ? c.iceServers : null; }, function () {});
    }

    /* ---------- phòng Kênh Chung: ai đang trong phòng ---------- */
    function watchRoom() {
        db().collection('gcalls').doc('general').onSnapshot(function (x) { room = x.exists ? x.data() : { members: {} }; paintEntry(); if (sheetOpen()) sheetPaint(); }, function () {});
        setInterval(function () { paintEntry(); }, 20000);   // người mất kết nối quá 45 giây thì thôi hiện
    }
    function roomPeople() { return liveList(room && room.members); }
    function paintEntry() {
        var ppl = CFG.on && CFG.general ? roomPeople() : [], n = ppl.length, mine = !!(G && G.id === 'general');
        var badge = $('gc-btn-n'); if (badge) badge.textContent = n ? String(n) : '';
        var lv = $('gc-live');
        if (lv) {
            var show = n > 0 && !mine && W.State && State.chatTarget === 'general';
            lv.classList.toggle('on', !!show);
            if (show) lv.querySelector('span').textContent = '🔊 Phòng gọi Kênh Chung · ' + n + ' người đang nói chuyện (' + ppl.slice(0, 3).map(nameOf).join(', ') + (n > 3 ? '…' : '') + ')';
        }
        var kc = d.querySelector('#contact-general .qd-ct-nm');
        if (kc) { var t = kc.querySelector('.qd-gc-kc'); if (n && !t) { t = d.createElement('span'); t.className = 'qd-gc-kc'; kc.appendChild(t); } if (t) { if (n) t.textContent = '🔊 ' + n; else t.remove(); } }
        var hb = $('gc-btn'); if (hb) hb.style.display = CFG.on && W.State && State.chatTarget === 'general' ? '' : 'none';
    }

    /* ---------- tấm chọn: vào phòng Kênh Chung / chọn người để gọi ---------- */
    var pick = { sel: {}, type: 'audio', q: '', mode: 'home' };
    function sheetOpen() { var s = $('gc-sheet'); return !!(s && s.classList.contains('on')); }
    function sheetClose() { var s = $('gc-sheet'); if (s) s.classList.remove('on'); }
    function openSheet(mode) {
        if (!CFG.on) return toast('Ban Quản Trị đang tắt gọi nhóm.', 'warning');
        ensureUI(); pick = { sel: {}, type: 'audio', q: '', mode: mode || 'home' };
        $('gc-sheet').classList.add('on'); sheetPaint();
    }
    function people() {
        var a = (W.State && State.accInfo) || {}, u0 = me(), P = (W.State && State.presence) || {};
        return Object.keys(a).filter(function (u) { return u !== u0 && !a[u].blocked; }).map(function (u) {
            var p = P[u] || {}, on = false; try { on = !!(W.Utils && Utils.isOnline && Utils.isOnline(p.lastActive, p.online)); } catch (e) {}
            return { u: u, name: nameOf(u), on: on };
        }).sort(function (x, y) { return (y.on - x.on) || x.name.localeCompare(y.name, 'vi', { sensitivity: 'base' }); });
    }
    function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase(); }
    function sheetPaint() {
        var box = $('gc-sheet').querySelector('.gs'), inCall = !!G;
        var head = '<h3><i class="fa-solid fa-users"></i> ' + (pick.mode === 'pick' ? (inCall ? 'Mời thêm người' : 'Chọn người để gọi') : 'Gọi nhóm') + '<button type="button" data-a="x" aria-label="Đóng">×</button></h3>';
        if (pick.mode === 'pick') {
            var cap = CFG.max - (inCall ? liveList(G.members).length + Object.keys(G.inv).length : 1), n = Object.keys(pick.sel).length, q = fold(pick.q);
            var list = people().filter(function (x) { return !q || fold(x.name).indexOf(q) >= 0 || fold(x.u).indexOf(q) >= 0; }).filter(function (x) { return !(inCall && (G.members[x.u] || G.inv[x.u])); });
            box.innerHTML = head + '<p style="margin:2px 0 10px;font-size:13px;color:#7a5a40">Chọn tối đa ' + Math.max(0, cap) + ' người. Điện thoại họ sẽ đổ chuông như cuộc gọi thường.</p>'
                + (inCall ? '' : '<div class="gs-seg"><button type="button" data-t="audio" class="' + (pick.type === 'audio' ? 'on' : '') + '"><i class="fa-solid fa-phone"></i> Thoại</button><button type="button" data-t="video" class="' + (pick.type === 'video' ? 'on' : '') + '"' + (CFG.vmax < 2 ? ' disabled' : '') + '><i class="fa-solid fa-video"></i> Có hình' + (CFG.vmax >= 2 ? ' (≤ ' + CFG.vmax + ' người)' : '') + '</button></div>')
                + '<input class="gs-q" type="search" placeholder="Tìm tên…" value="' + esc(pick.q) + '">'
                + '<div class="gs-list">' + (list.length ? list.map(function (x) {
                    return '<div class="gs-it' + (pick.sel[x.u] ? ' on' : '') + '" data-u="' + esc(x.u) + '"><div class="avatar-circle">' + avatar(x.u) + '</div><div class="nm">' + esc(x.name) + '<small>@' + esc(x.u) + (x.on ? ' · 🟢 đang online' : '') + '</small></div><span class="ck">✓</span></div>';
                }).join('') : '<p>Không có ai phù hợp.</p>') + '</div>'
                + '<button type="button" class="gs-go" data-a="call"' + (n ? '' : ' disabled') + '><i class="fa-solid fa-phone"></i> ' + (inCall ? 'Mời' : 'Gọi') + (n ? ' ' + n + ' người' : '') + '</button>';
            var inp = box.querySelector('.gs-q'); inp.addEventListener('input', function () { pick.q = inp.value; var pos = inp.selectionStart; sheetPaint(); var i2 = $('gc-sheet').querySelector('.gs-q'); i2.focus(); try { i2.setSelectionRange(pos, pos); } catch (e) {} });
        } else {
            var ppl = roomPeople(), full = ppl.length >= CFG.max;
            box.innerHTML = head
                + (CFG.general ? '<div class="gs-sec"><b>🔊 Phòng gọi Kênh Chung</b><p>Ai muốn thì vào, không đổ chuông ai. Tối đa ' + CFG.max + ' người' + (CFG.vmax >= 2 ? '; bật hình được khi có ≤ ' + CFG.vmax + ' người' : '') + '.</p>'
                    + (ppl.length ? '<div class="gs-ppl">' + ppl.map(function (u) { return '<span><span class="avatar-circle">' + avatar(u) + '</span>' + esc(nameOf(u)) + '</span>'; }).join('') + '</div>' : '<p style="margin-top:-4px">Chưa có ai trong phòng — bạn vào trước, người khác sẽ thấy và vào cùng.</p>')
                    + '<button type="button" class="gs-go" data-a="room"' + (full || (G && G.id === 'general') ? ' disabled' : '') + '><i class="fa-solid fa-right-to-bracket"></i> ' + (G && G.id === 'general' ? 'Bạn đang ở trong phòng' : full ? 'Phòng đã đủ ' + CFG.max + ' người' : 'Vào phòng') + '</button></div>' : '')
                + '<div class="gs-sec"><b>📞 Gọi riêng vài người</b><p>Chọn người, điện thoại họ đổ chuông. Ai nghe máy sẽ vào cùng cuộc gọi.</p><button type="button" class="gs-go red" data-a="pick"><i class="fa-solid fa-user-plus"></i> Chọn người để gọi</button></div>';
        }
        box.onclick = function (e) {
            var a = e.target.closest('[data-a]'), it = e.target.closest('.gs-it'), t = e.target.closest('[data-t]');
            if (it) { var u = it.dataset.u, cap = CFG.max - (G ? liveList(G.members).length + Object.keys(G.inv).length : 1); if (pick.sel[u]) delete pick.sel[u]; else if (Object.keys(pick.sel).length < cap) pick.sel[u] = 1; else toast('Cuộc gọi nhóm tối đa ' + CFG.max + ' người.', 'warning'); return sheetPaint(); }
            if (t && !t.disabled) { pick.type = t.dataset.t; return sheetPaint(); }
            if (!a) return;
            if (a.dataset.a === 'x') return sheetClose();
            if (a.dataset.a === 'pick') { pick.mode = 'pick'; return sheetPaint(); }
            if (a.dataset.a === 'room') { sheetClose(); return join('general', { room: 'general', type: 'audio' }); }
            if (a.dataset.a === 'call') { var us = Object.keys(pick.sel); sheetClose(); if (G) return invite(us); return startInvite(us, pick.type); }
        };
    }

    /* ---------- vào / rời cuộc gọi ---------- */
    function media(video) {
        var a = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        return navigator.mediaDevices.getUserMedia({ audio: a, video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } } : false })
            .catch(function (e) { if (video) return navigator.mediaDevices.getUserMedia({ audio: a, video: false }).then(function (s) { toast('Không mở được camera — vào bằng giọng nói.', 'warning'); return s; }); throw e; });
    }
    function mediaErr(e) {
        var n = e && e.name || '';
        toast(n === 'NotAllowedError' || n === 'SecurityError' ? 'Bạn chưa cho phép dùng micro. Bấm "Cho phép" rồi thử lại.' : n === 'NotFoundError' ? 'Máy không có micro.' : n === 'NotReadableError' ? 'Micro đang bị ứng dụng khác dùng.' : 'Không mở được micro.', 'error');
    }
    function camAllowed(n) { return CFG.vmax >= 2 && (n || liveList(G ? G.members : {}).length || 1) <= CFG.vmax; }

    function join(id, o) {
        o = o || {};
        if (!CFG.on) return toast('Ban Quản Trị đang tắt gọi nhóm.', 'warning');
        if (G) { if (G.id === id) return minimize(false); return toast('Bạn đang trong một cuộc gọi nhóm khác.', 'warning'); }
        if (oneOneBusy()) return toast('Bạn đang trong một cuộc gọi.', 'warning');
        if (!supported()) return toast('Máy / trình duyệt này chưa hỗ trợ gọi. Hãy dùng app QD Elite hoặc Chrome.', 'error');
        if (!W.isSecureContext) return toast('Cần mở trang bằng https để gọi.', 'error');
        ensureUI();
        var gen = Date.now(), wantCam = o.type === 'video' && o.cam !== false;
        G = { id: id, room: o.room || 'invite', type: o.type === 'video' ? 'video' : 'audio', gen: gen, members: {}, peers: {}, inv: {}, local: null, cam: false, mic: true, speaker: true, startedAt: 0, min: false, unsub: [], invites: o.invites || [] };
        hush(true);
        $('qd-gcall').classList.add('on'); paintAll(); $('gc-sub').textContent = 'Đang mở micro…';
        var g0 = G;
        return db().collection('gcalls').doc(id).get().then(function (x) {
            if (G !== g0) return;
            var c = x.exists ? x.data() : null, ppl = c && c.status !== 'ended' ? liveList(c.members) : [];
            if (ppl.length >= CFG.max) { toast('Cuộc gọi đã đủ ' + CFG.max + ' người.', 'warning'); return cleanup(); }
            if (o.must && (!c || c.status === 'ended' || !ppl.length)) { toast('Cuộc gọi nhóm đã kết thúc.', 'info'); return cleanup(); }
            if (c && c.type) G.type = c.type === 'video' ? 'video' : 'audio';
            var cam = wantCam && camAllowed(ppl.length + 1);
            return media(cam).then(function (stm) {
                if (G !== g0) { stm.getTracks().forEach(function (t) { t.stop(); }); return; }
                G.local = stm; G.cam = !!stm.getVideoTracks().length;
                if (Q && Q.callMode) try { Q.callMode(true, G.speaker); } catch (e) {}
                var mine = { at: gen, ping: gen, mic: true, cam: G.cam, screen: false, name: (W.State && State.fullName) || me() }, data = { members: {}, status: 'live', updatedAt: gen };
                data.members[me()] = mine;
                if (!c || c.status === 'ended') { data.room = G.room; data.type = G.type; data.created = gen; data.host = me(); data.hostName = mine.name; if (c && c.status === 'ended') data.members = Object.assign({}, data.members); }
                return db().collection('gcalls').doc(id).set(data, { merge: true }).then(function () {
                    if (G !== g0) return;
                    G.startedAt = Date.now(); joinSound(); nativeInfo();
                    G.unsub.push(db().collection('gcalls').doc(id).onSnapshot(onDoc, function () {}));
                    G.unsub.push(db().collection('gcall_sig').where('to', '==', me()).where('call', '==', id).onSnapshot(onSig, function () {}));
                    G.pingT = setInterval(ping, PING_MS); G.tickT = setInterval(tick, 1000);
                    if (G.invites.length) invite(G.invites);
                    paintAll();
                });
            });
        }).catch(function (e) { if (G !== g0) return; if (e && /NotAllowed|NotFound|NotReadable|Security/.test(e.name || '')) mediaErr(e); else toast('Chưa vào được cuộc gọi nhóm, thử lại sau.', 'error'); cleanup(); });
    }
    function ping() {
        if (!G) return; var up = { members: {}, updatedAt: Date.now() }; up.members[me()] = { ping: Date.now(), mic: G.mic, cam: G.cam, screen: !!G.share };
        db().collection('gcalls').doc(G.id).set(up, { merge: true }).catch(function () {});
    }
    function leave(silent) {
        if (!G) return; var g = G, id = g.id, others = liveList(g.members).filter(function (u) { return u !== me(); });
        var up = { members: {}, updatedAt: Date.now() }; up.members[me()] = FV().delete();
        if (!others.length && g.room !== 'general') { up.status = 'ended'; up.endedAt = Date.now(); }
        try { db().collection('gcalls').doc(id).set(up, { merge: true }).catch(function () {}); } catch (e) {}
        Object.keys(g.inv).forEach(function (u) { var cid = g.inv[u]; if (cid) db().collection('calls').doc(cid).update({ status: 'missed', endedAt: Date.now() }).catch(function () {}); });   // còn đang đổ chuông -> tắt chuông máy họ
        Object.keys(g.peers).forEach(function (u) { var p = g.peers[u]; if (p.sig && p.side === 'off') db().collection('gcall_sig').doc(p.sig).delete().catch(function () {}); });
        if (!silent) leaveSound();
        cleanup();
    }
    function cleanup() {
        var g = G; G = null; ringback(false);
        if (g) {
            clearInterval(g.pingT); clearInterval(g.tickT); clearInterval(g.vadT);
            g.unsub.forEach(function (f) { try { f(); } catch (e) {} });
            Object.keys(g.peers).forEach(function (u) { closePeer(g, u); });
            try { g.share && g.share.st.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
            try { if (g.mix) { g.mix.track.stop(); g.mix.ctx.close(); } } catch (e) {}
            try { if (d.fullscreenElement) d.exitFullscreen(); } catch (e) {}
            try { g.local && g.local.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
            if (Q && Q.callMode) try { Q.callMode(false, false); } catch (e) {}
        }
        var o = $('qd-gcall'); if (o) { o.classList.remove('on'); $('gc-grid').innerHTML = ''; $('gc-pend').innerHTML = ''; }
        var p = $('gc-pill'); if (p) p.classList.remove('on');
        setTimeout(function () { if (!G) hush(false); }, 400);
        paintEntry();
    }
    function nativeInfo() { if (G && Q && Q.callInfo) try { Q.callInfo('Gọi nhóm · ' + Math.max(1, liveList(G.members).length) + ' người', G.cam, G.startedAt || 0); } catch (e) {} }

    /* ---------- danh sách người trong cuộc gọi ---------- */
    function onDoc(x) {
        if (!G) return; var c = x.exists ? x.data() : null;
        if (!c || (c.status === 'ended' && G.room !== 'general')) { toast('Cuộc gọi nhóm đã kết thúc.', 'info'); return cleanup(); }
        G.members = c.members || {}; G.type = c.type || G.type;
        if (!G.members[me()]) { if (Date.now() - G.gen > 5000) { toast('Bạn đã rời cuộc gọi nhóm.', 'info'); return cleanup(); } }
        sync();
    }
    function sync() {
        if (!G) return; var now = Date.now(), ppl = liveList(G.members), u0 = me();
        // người mới vào: người vào sau (at lớn hơn) gửi lời mời kết nối cho người vào trước
        ppl.forEach(function (u) {
            if (u === u0) return; var m = G.members[u], p = G.peers[u];
            if (G.inv[u]) { delete G.inv[u]; }
            var iAmNewer = G.gen > (+m.at || 0) || (G.gen === (+m.at || 0) && u0 > u);
            if (iAmNewer) { if (!p || p.gen !== +m.at) offer(u, +m.at); }
            else if (p && (p.side === 'off' || p.gen !== +m.at)) closePeer(G, u);   // họ vừa vào lại (sau mình): chờ họ gửi lời mời mới
        });
        // người đã rời / mất kết nối
        Object.keys(G.peers).forEach(function (u) { if (ppl.indexOf(u) < 0) { closePeer(G, u); } });
        // nhiều người hơn mức cho bật hình -> tự tắt hình
        if (G.cam && !camAllowed(ppl.length)) { camOff(); toast('Cuộc gọi đã có ' + ppl.length + ' người — hình tạm tắt để cuộc gọi mượt.', 'info'); }
        ringback(ppl.length <= 1 && Object.keys(G.inv).length > 0);
        paintAll(); nativeInfo();
        void now;
    }

    /* ---------- kết nối từng cặp ---------- */
    function newPC(u, gen, side) {
        var pc = new RTCPeerConnection(iceCfg()), p = { pc: pc, gen: gen, side: side, ms: new MediaStream(), rc: 0, q: [], ready: false, at: Date.now() };
        pc.ontrack = function (e) {
            try { if (p.ms.getTracks().indexOf(e.track) < 0) p.ms.addTrack(e.track); } catch (x) {}
            e.track.onunmute = function () { paintTile(u); }; e.track.onmute = function () { paintTile(u); };
            attach(u);
        };
        var st = function () {
            if (!G || G.peers[u] !== p) return; var cs = pc.connectionState || pc.iceConnectionState;
            p.state = cs; paintTile(u);
            if (cs === 'connected' || cs === 'completed') { clearTimeout(p.connT); if (!G.connectedOnce) { G.connectedOnce = true; } tune(pc); }
            else if (cs === 'failed') retry(u, p);
            else if (cs === 'disconnected') { clearTimeout(p.dropT); p.dropT = setTimeout(function () { if (G && G.peers[u] === p && (pc.connectionState === 'disconnected' || pc.connectionState === 'failed')) retry(u, p); }, 8000); }
        };
        pc.onconnectionstatechange = st; pc.oniceconnectionstatechange = st;
        p.connT = setTimeout(function () { if (G && G.peers[u] === p && !/connected|completed/.test(pc.connectionState || pc.iceConnectionState)) retry(u, p); }, CONN_MS);
        return p;
    }
    function retry(u, p) {   // nối lại: chỉ người vào sau gửi lời mời mới
        if (!G || G.peers[u] !== p) return; p.tries = (p.tries || 0) + 1;
        var m = G.members[u]; if (!m || !live(m)) return closePeer(G, u);
        if (p.side === 'off' && p.tries <= 3) { var gen = p.gen; setTimeout(function () { if (G && G.peers[u] === p) offer(u, gen, true); }, 1500 * p.tries); }
    }
    function addLocal(pc, p) {
        var a = outAudio(), v = outVideo();
        if (p.side === 'off') {
            p.ta = pc.addTransceiver(a || 'audio', { direction: 'sendrecv', streams: G.local ? [G.local] : [] });
            p.tv = pc.addTransceiver(v || 'video', { direction: 'sendrecv', streams: G.local ? [G.local] : [] });
            if (!v) try { p.tv.sender.replaceTrack(null); } catch (e) {}
        } else {
            var tr = pc.getTransceivers();
            p.ta = tr.filter(function (t) { return t.receiver.track && t.receiver.track.kind === 'audio'; })[0];
            p.tv = tr.filter(function (t) { return t.receiver.track && t.receiver.track.kind === 'video'; })[0];
            [p.ta, p.tv].forEach(function (t) { if (t) try { t.direction = 'sendrecv'; } catch (e) {} });
            if (p.ta && a) { p.ta.sender.replaceTrack(a); try { p.ta.sender.setStreams && p.ta.sender.setStreams(G.local); } catch (e) {} }
            if (p.tv) { p.tv.sender.replaceTrack(v || null); try { p.tv.sender.setStreams && p.tv.sender.setStreams(G.local); } catch (e) {} }
        }
    }
    function trickle(p, field) {
        p.pc.onicecandidate = function (e) {
            if (!e.candidate || !e.candidate.candidate) return; var s = json(e.candidate); if (!s) return; p.q.push(s);
            if (!p.qT) p.qT = setTimeout(function () { flush(p, field); }, 60);
        };
    }
    function flush(p, field) {
        p.qT = 0; if (!p.ready || !p.q.length || !p.sig) return; var b = p.q.splice(0), o = {};
        o[field] = FV().arrayUnion.apply(null, b); db().collection('gcall_sig').doc(p.sig).update(o).catch(function () {});
    }
    function addRemote(p, list) {
        if (!list || !p.pc.remoteDescription || !p.pc.remoteDescription.type) return;
        for (; p.rc < list.length; p.rc++) { try { p.pc.addIceCandidate(JSON.parse(list[p.rc])).catch(function () {}); } catch (e) {} }
    }
    function offer(u, theirGen, again) {
        if (!G) return; if (G.peers[u]) closePeer(G, u, true);
        var p = G.peers[u] = newPC(u, theirGen, 'off'), pc = p.pc, g0 = G; if (again) p.tries = (again === true ? 1 : again);
        addLocal(pc, p); trickle(p, 'cFrom');
        var ref = db().collection('gcall_sig').doc(); p.sig = ref.id;
        pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () {
            if (G !== g0 || G.peers[u] !== p) return;
            return ref.set({ call: G.id, from: me(), to: u, gen: G.gen, peerGen: theirGen, created: Date.now(), offer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp }, cFrom: [], cTo: [] }).then(function () {
                p.ready = true; flush(p, 'cFrom');
                p.unsub = ref.onSnapshot(function (x) {
                    if (!G || G.peers[u] !== p || !x.exists) return; var s = x.data();
                    if (s.answer && !p.answered) { p.answered = true; pc.setRemoteDescription(s.answer).then(function () { addRemote(p, s.cTo); }).catch(function () {}); }
                    else addRemote(p, s.cTo);
                }, function () {});
            });
        }).catch(function () {});
        paintAll();
    }
    function onSig(q) {
        if (!G) return;
        (q.docChanges ? q.docChanges() : []).forEach(function (ch) {
            if (ch.type === 'removed') return; var id = ch.doc.id, s = ch.doc.data(), u = s.from;
            if (!u || u === me() || s.call !== G.id || +s.peerGen !== G.gen) return;   // lời mời gửi cho lần vào cũ của mình
            var p = G.peers[u];
            if (p && p.sig === id) return addRemote(p, s.cFrom);
            if (p && p.side === 'off' && +s.gen <= p.gen) return;   // mình là người vào sau: không nhận lời mời ngược (trừ khi họ vừa vào lại)
            answer(u, id, s);
        });
    }
    function answer(u, sigId, s) {
        if (G.peers[u]) closePeer(G, u, true);
        var p = G.peers[u] = newPC(u, +s.gen, 'ans'), pc = p.pc, g0 = G; p.sig = sigId;
        trickle(p, 'cTo');
        pc.setRemoteDescription(s.offer).then(function () { addLocal(pc, p); return pc.createAnswer(); }).then(function (a) { return pc.setLocalDescription(a); }).then(function () {
            if (G !== g0 || G.peers[u] !== p) return;
            return db().collection('gcall_sig').doc(sigId).update({ answer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }).then(function () {
                p.ready = true; flush(p, 'cTo'); addRemote(p, s.cFrom);
                p.unsub = db().collection('gcall_sig').doc(sigId).onSnapshot(function (x) { if (G && G.peers[u] === p && x.exists) addRemote(p, x.data().cFrom); }, function () {});
            });
        }).catch(function () {});
        paintAll();
    }
    function closePeer(g, u, keepTile) {
        var p = g.peers[u]; if (!p) return; delete g.peers[u];
        clearTimeout(p.connT); clearTimeout(p.dropT); clearTimeout(p.qT);
        try { p.unsub && p.unsub(); } catch (e) {}
        try { p.pc.close(); } catch (e) {}
        if (p.vad) try { p.vad.src.disconnect(); } catch (e) {}
        var a = $('gc-a-' + safe(u)); if (a) { a.srcObject = null; a.remove(); }
        if (!keepTile && G === g) paintAll();
    }
    function tune(pc) {
        try { pc.getSenders().forEach(function (sd) {
            if (!sd.track || sd.track.kind !== 'video' || !sd.getParameters) return; var p = sd.getParameters(); if (!p.encodings || !p.encodings.length) return;
            var scr = !!(G && G.share && sd.track === G.share.vt), n = Math.max(1, G ? Object.keys(G.peers).length : 1);
            p.encodings[0].maxBitrate = scr ? Math.max(350000, Math.min(2500000, Math.round(4000000 / n))) : 600000;   // màn hình: chia băng thông tải lên cho số người xem
            p.encodings[0].maxFramerate = scr ? 15 : 24;
            if (scr) p.degradationPreference = 'maintain-resolution';   // mạng yếu: giảm số khung hình, giữ chữ rõ
            sd.setParameters(p).catch(function () {});
        }); } catch (e) {}
    }

    /* ---------- tiếng / hình người khác ---------- */
    function safe(u) { return String(u).replace(/[^A-Za-z0-9_-]/g, '_'); }
    function attach(u) {
        var p = G && G.peers[u]; if (!p) return;
        var a = $('gc-a-' + safe(u));
        if (!a) { a = d.createElement('audio'); a.id = 'gc-a-' + safe(u); a.autoplay = true; a.setAttribute('playsinline', ''); d.body.appendChild(a); }
        if (a.srcObject !== p.ms) { a.srcObject = p.ms; var pr = a.play(); if (pr && pr.catch) pr.catch(function () {}); }
        vad(u, p); paintTile(u);
    }
    var VC = null;
    function vad(u, p) {   // ai đang nói -> viền vàng
        if (p.vad || !p.ms.getAudioTracks().length) return;
        try { VC = VC || new (W.AudioContext || W.webkitAudioContext)(); var src = VC.createMediaStreamSource(new MediaStream(p.ms.getAudioTracks())), an = VC.createAnalyser(); an.fftSize = 256; src.connect(an); p.vad = { src: src, an: an, buf: new Uint8Array(an.fftSize) }; } catch (e) {}
        if (G && !G.vadT) G.vadT = setInterval(vadTick, 220);
    }
    function level(v) { if (!v) return 0; v.an.getByteTimeDomainData(v.buf); var s = 0; for (var i = 0; i < v.buf.length; i++) { var x = (v.buf[i] - 128) / 128; s += x * x; } return Math.sqrt(s / v.buf.length); }
    function vadTick() {
        if (!G) return;
        Object.keys(G.peers).forEach(function (u) { var t = $('gc-t-' + safe(u)), p = G.peers[u]; if (t && p) t.classList.toggle('spk', level(p.vad) > 0.04 && (G.members[u] || {}).mic !== false); });
        if (!G.myVad && G.local && G.local.getAudioTracks().length) { try { VC = VC || new (W.AudioContext || W.webkitAudioContext)(); var src = VC.createMediaStreamSource(new MediaStream(G.local.getAudioTracks())), an = VC.createAnalyser(); an.fftSize = 256; src.connect(an); G.myVad = { src: src, an: an, buf: new Uint8Array(256) }; } catch (e) {} }
        var mt = $('gc-t-' + safe(me())); if (mt) mt.classList.toggle('spk', G.mic && level(G.myVad) > 0.04);
    }

    /* ---------- vẽ ---------- */
    function paintAll() {
        if (!G) return; var grid = $('gc-grid'); if (!grid) return;
        var ppl = liveList(G.members); if (ppl.indexOf(me()) < 0) ppl.unshift(me());
        var n = ppl.length, cols = n <= 1 ? 1 : n <= 4 ? 2 : (W.innerWidth > 900 ? 4 : 2);
        if (n === 2 && W.innerHeight > W.innerWidth) cols = 1;
        var sh = sharer();
        if (sh) {   // có người chia sẻ màn hình: ô màn hình to ở trên, người khác hàng nhỏ bên dưới
            ppl = [sh].concat(ppl.filter(function (u) { return u !== sh; }));
            var others = n - 1; cols = Math.max(1, Math.min(others, W.innerWidth > 900 ? 4 : 3));
            var rows = others ? Math.ceil(others / cols) : 0;
            grid.style.gridTemplateRows = 'minmax(0,' + (rows ? (rows > 1 ? 3 : 4) : 1) + 'fr)' + (rows ? ' repeat(' + rows + ',minmax(0,1fr))' : '');
        } else grid.style.gridTemplateRows = '';
        grid.style.setProperty('--gc-c', cols);
        var keep = {};
        ppl.forEach(function (u) {
            keep[safe(u)] = 1; var t = $('gc-t-' + safe(u));
            if (!t) { t = d.createElement('div'); t.className = 'gc-t' + (u === me() ? ' me' : ''); t.id = 'gc-t-' + safe(u); t.innerHTML = '<video autoplay playsinline muted></video><div class="gc-av"></div><span class="gc-st"></span><span class="gc-zoom">⛶ Chạm để phóng to</span><div class="gc-nm"><i class="fa-solid fa-microphone-slash" hidden></i><span></span></div>'; grid.appendChild(t); }
            paintTile(u);
        });
        Array.prototype.forEach.call(grid.children, function (t) { if (!keep[t.id.replace(/^gc-t-/, '')]) t.remove(); });
        ppl.forEach(function (u) { var t = $('gc-t-' + safe(u)); t.style.gridColumn = u === sh ? '1 / -1' : ''; if (u !== sh) t.classList.remove('big'); grid.appendChild(t); });   // giữ đúng thứ tự
        var pend = Object.keys(G.inv);
        $('gc-pend').innerHTML = pend.map(function (u) { return '<span>📞 Đang gọi ' + esc(nameOf(u)) + '…</span>'; }).join('');
        paintTop(); paintBar();
    }
    function paintTile(u) {
        if (!G) return; var t = $('gc-t-' + safe(u)); if (!t) return;
        var mine = u === me(), m = G.members[u] || {}, p = G.peers[u], v = t.querySelector('video');
        var scr = mine ? !!G.share : m.screen === true;
        var stream = mine ? (G.share ? G.share.st : G.local) : p && p.ms, vt = stream && stream.getVideoTracks()[0];
        var camOn = mine ? (G.cam || !!G.share) : (m.cam === true || scr) && !!vt && !vt.muted;
        t.classList.toggle('scr', !!scr);
        if (camOn && v.srcObject !== stream) { v.srcObject = stream; var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
        if (!camOn && v.srcObject) v.srcObject = null;
        t.classList.toggle('vid', !!camOn);
        var av = t.querySelector('.gc-av'), html = avatar(u); if (av.__h !== html) { av.innerHTML = html; av.__h = html; }
        t.querySelector('.gc-nm span').textContent = (mine ? 'Bạn' : nameOf(u)) + (scr ? (mine ? ' đang chia sẻ màn hình' : ' · đang chia sẻ màn hình') : '');
        t.querySelector('.gc-nm i').hidden = (mine ? G.mic : m.mic !== false);
        var s = mine ? '' : !p ? 'Đang chờ…' : /connected|completed/.test(p.state || '') ? '' : p.state === 'failed' ? 'Mất kết nối' : 'Đang kết nối…';
        t.querySelector('.gc-st').textContent = s;
    }
    function paintTop() {
        if (!G) return; var n = Math.max(1, liveList(G.members).length);
        $('gc-title').textContent = G.room === 'general' ? 'Phòng gọi Kênh Chung' : 'Gọi nhóm' + (G.type === 'video' ? ' có hình' : '');
        $('gc-sub').textContent = (G.startedAt ? fmt(Date.now() - G.startedAt) + ' · ' : '') + n + '/' + CFG.max + ' người';
        $('gc-pill-t').textContent = 'Gọi nhóm · ' + (G.startedAt ? fmt(Date.now() - G.startedAt) : '') + ' · ' + n + ' người — chạm để mở';
    }
    function paintBar() {
        var o = $('qd-gcall'); if (!G || !o) return; var b = function (k) { return o.querySelector('[data-k="' + k + '"]'); };
        var mic = b('mic'); mic.classList.toggle('off', !G.mic); mic.querySelector('i').className = 'fa-solid ' + (G.mic ? 'fa-microphone' : 'fa-microphone-slash'); mic.querySelector('span').textContent = G.mic ? 'Tắt micro' : 'Bật micro';
        var cam = b('cam'), ok = camAllowed(); cam.disabled = !G.cam && !ok; cam.classList.toggle('off', G.cam); cam.querySelector('i').className = 'fa-solid ' + (G.cam ? 'fa-video-slash' : 'fa-video');
        cam.querySelector('span').textContent = G.cam ? 'Tắt hình' : ok ? 'Bật hình' : 'Hình (≤ ' + CFG.vmax + ' người)';
        cam.hidden = CFG.vmax < 2;
        b('flip').hidden = !G.cam || (G.cams || 1) < 2;
        var sb = b('share'), other = sharer(); other = other && other !== me() ? other : '';
        sb.hidden = !CFG.screen || !canShare(); sb.disabled = !!other && !G.share; sb.classList.toggle('sharing', !!G.share);
        sb.querySelector('i').className = 'fa-solid ' + (G.share ? 'fa-rectangle-xmark' : 'fa-display');
        sb.querySelector('span').textContent = G.share ? 'Dừng chia sẻ' : 'Màn hình'; sb.title = other ? nameOf(other) + ' đang chia sẻ màn hình' : G.share ? '' : 'Chia sẻ màn hình (kèm tiếng)';
        cam.disabled = cam.disabled || !!G.share;
        var spk = b('spk'); spk.hidden = !(Q && Q.callMode); spk.classList.toggle('off', !G.speaker); spk.querySelector('span').textContent = G.speaker ? 'Loa ngoài' : 'Loa trong';
        b('add').disabled = liveList(G.members).length + Object.keys(G.inv).length >= CFG.max;
    }
    function tick() { if (!G) return; paintTop(); var now = Date.now(); if (Object.keys(G.members).some(function (u) { return G.peers[u] && !live(G.members[u], now); })) sync(); }

    /* ---------- nút trong cuộc gọi ---------- */
    function act(k) {
        if (!G) return;
        if (k === 'leave') return leave();
        if (k === 'mic') { G.mic = !G.mic; try { G.local.getAudioTracks().forEach(function (t) { t.enabled = G.mic; }); } catch (e) {} ping(); return paintAll(); }
        if (k === 'cam') return G.cam ? camOff() : camOn();
        if (k === 'flip') return flip();
        if (k === 'spk') { G.speaker = !G.speaker; try { Q.callMode(true, G.speaker); } catch (e) {} return paintBar(); }
        if (k === 'add') return openSheet('pick');
        if (k === 'share') return G.share ? stopShare() : startShare();
    }

    /* ---------- chia sẻ màn hình (kèm tiếng) ----------
       Máy tính (Chrome / Edge / Firefox): chọn tab / cửa sổ / cả màn hình; tick "Chia sẻ âm thanh" để người khác nghe được tiếng.
       Hình màn hình đi vào chỗ của camera (không phải nối lại); tiếng màn hình trộn chung với micro thành 1 đường tiếng.
       Điện thoại (app / trình duyệt Android) chưa chia sẻ được (Android không cho trang web quay màn hình) nhưng XEM được. */
    function canShare() { return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia); }
    function sharer() {
        if (!G) return ''; if (G.share) return me();
        var ppl = liveList(G.members); for (var i = 0; i < ppl.length; i++) if (ppl[i] !== me() && G.members[ppl[i]].screen === true) return ppl[i];
        return '';
    }
    function outAudio() { return G.mix ? G.mix.track : (G.local && G.local.getAudioTracks()[0]) || null; }
    function outVideo() { return G.share ? G.share.vt : (G.cam && G.local && G.local.getVideoTracks()[0]) || null; }
    function setAudio(track) { if (!track) return; Object.keys(G.peers).forEach(function (u) { var p = G.peers[u]; if (p.ta) try { p.ta.sender.replaceTrack(track); } catch (e) {} }); }
    function mixStart(at) {
        try {
            var ctx = new (W.AudioContext || W.webkitAudioContext)(), dest = ctx.createMediaStreamDestination(), mic = G.local && G.local.getAudioTracks()[0];
            if (mic) ctx.createMediaStreamSource(new MediaStream([mic])).connect(dest);
            ctx.createMediaStreamSource(new MediaStream([at])).connect(dest);
            if (ctx.state === 'suspended') ctx.resume();
            G.mix = { ctx: ctx, track: dest.stream.getAudioTracks()[0] };
        } catch (e) { G.mix = null; }
    }
    function mixStop() { if (G && G.mix) { try { G.mix.track.stop(); G.mix.ctx.close(); } catch (e) {} G.mix = null; } }
    function startShare() {
        if (!G) return;
        if (!CFG.screen) return toast('Ban Quản Trị đang tắt chia sẻ màn hình.', 'warning');
        if (!canShare()) return toast('Chia sẻ màn hình cần máy tính (Chrome / Edge). Điện thoại vẫn xem được màn hình người khác chia sẻ.', 'info');
        var s0 = sharer(); if (s0 && s0 !== me()) return toast(nameOf(s0) + ' đang chia sẻ màn hình.', 'warning');
        var g0 = G;
        navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 15, max: 30 }, width: { max: 1920 }, height: { max: 1080 } },
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true },   // restrictOwnAudio: chia sẻ cả màn hình thì bỏ tiếng của chính cuộc gọi (không vọng lại tiếng người khác)
            systemAudio: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'include'
        }).then(function (st) {
            if (G !== g0) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
            var vt = st.getVideoTracks()[0], at = st.getAudioTracks()[0] || null;
            try { vt.contentHint = 'detail'; } catch (e) {}
            if (G.cam) camOff();
            G.share = { st: st, vt: vt, at: at };
            vt.addEventListener('ended', function () { if (G && G.share && G.share.vt === vt) stopShare(); });   // bấm "Dừng chia sẻ" trên thanh của trình duyệt
            if (at) mixStart(at);
            setVideo(vt); setAudio(outAudio()); ping(); paintAll(); nativeInfo();
            toast(at ? '🖥️ Đang chia sẻ màn hình kèm tiếng.' : '🖥️ Đang chia sẻ màn hình (chưa có tiếng — lần sau tick "Chia sẻ âm thanh" khi chọn).', 'success');
        }).catch(function (e) { if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return; toast('Không chia sẻ được màn hình.', 'error'); });
    }
    function stopShare() {
        if (!G || !G.share) return; var sh = G.share; G.share = null;
        try { sh.st.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        mixStop(); setVideo(null); setAudio(outAudio()); ping(); paintAll(); nativeInfo();
        try { if (d.fullscreenElement) d.exitFullscreen(); } catch (e) {}
    }
    /* chạm vào ô màn hình: phóng to cả màn hình (điện thoại: xoay ngang cho dễ xem) */
    function zoom(t) {
        if (d.fullscreenElement) { d.exitFullscreen().catch(function () {}); return; }
        if (t.classList.contains('big')) { t.classList.remove('big'); return; }
        var go = t.requestFullscreen ? t.requestFullscreen() : null;
        if (go && go.then) go.then(function () { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(function () {}); } catch (e) {} }, function () { t.classList.add('big'); });
        else t.classList.add('big');
    }
    d.addEventListener('fullscreenchange', function () { if (!d.fullscreenElement) try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) {} });
    function setVideo(track) {
        Object.keys(G.peers).forEach(function (u) { var p = G.peers[u]; if (p.tv) try { p.tv.sender.replaceTrack(track || null); } catch (e) {} if (track) tune(p.pc); });
    }
    function camOn() {
        if (G.share) return toast('Đang chia sẻ màn hình — dừng chia sẻ rồi mới bật camera.', 'warning');
        if (!camAllowed()) return toast('Chỉ bật hình được khi cuộc gọi có từ ' + CFG.vmax + ' người trở xuống.', 'warning');
        navigator.mediaDevices.getUserMedia({ video: { facingMode: G.facing || 'user', width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } } }).then(function (s) {
            if (!G) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
            var t = s.getVideoTracks()[0]; G.local.getVideoTracks().forEach(function (x) { x.stop(); G.local.removeTrack(x); }); G.local.addTrack(t);
            G.cam = true; setVideo(t); ping(); paintAll(); nativeInfo();
            try { navigator.mediaDevices.enumerateDevices().then(function (l) { if (G) { G.cams = l.filter(function (x) { return x.kind === 'videoinput'; }).length; paintBar(); } }); } catch (e) {}
        }).catch(function () { toast('Không mở được camera.', 'error'); });
    }
    function camOff() {
        if (!G) return; G.local.getVideoTracks().forEach(function (x) { x.stop(); G.local.removeTrack(x); });
        G.cam = false; setVideo(G.share ? G.share.vt : null); ping(); paintAll(); nativeInfo();
    }
    function flip() { if (!G || !G.cam) return; G.facing = G.facing === 'environment' ? 'user' : 'environment'; camOff(); camOn(); }

    /* ---------- mời người (máy họ đổ chuông) ---------- */
    function startInvite(users, type) {
        if (!users.length) return;
        var id = db().collection('gcalls').doc().id;
        join(id, { room: 'invite', type: type, invites: users });
    }
    function invite(users) {
        if (!G) return; var myName = (W.State && State.fullName) || me(), n = liveList(G.members).length;
        users.forEach(function (u) {
            if (G.inv[u] || (G.members[u] && live(G.members[u]))) return;
            var ref = db().collection('calls').doc(); G.inv[u] = ref.id;
            ref.set({ from: me(), to: u, fromName: myName + ' · gọi nhóm', toName: nameOf(u), type: G.type, status: 'ringing', created: Date.now(), group: G.id, groupN: n, groupRoom: G.room }).catch(function () { delete G.inv[u]; paintAll(); });
            var g0 = G, un = ref.onSnapshot(function (x) {
                if (G !== g0 || !x.exists) return un && un(); var c = x.data();
                if (c.status === 'ringing') return;
                un && un();
                if (G.inv[u] !== ref.id) return; delete G.inv[u];
                if (c.status === 'declined') toast(nameOf(u) + ' đã từ chối cuộc gọi nhóm.', 'info');
                else if (c.status === 'busy') toast(nameOf(u) + ' đang bận cuộc gọi khác.', 'info');
                else if (c.status === 'missed') toast(nameOf(u) + ' không nghe máy.', 'info');
                sync();
            }, function () {});
            setTimeout(function () { if (G === g0 && G.inv[u] === ref.id) { delete G.inv[u]; ref.update({ status: 'missed', endedAt: Date.now() }).catch(function () {}); try { un && un(); } catch (e) {} toast(nameOf(u) + ' không nghe máy.', 'info'); sync(); } }, RING_MS);
        });
        sync();
    }

    /* ---------- được mời: màn hình cuộc gọi đến ---------- */
    function invited(callId, c, actNow) {
        if (!CFG.on) return;
        if (IN && IN.id === callId) { if (actNow === 'accept') inAccept(c.type === 'video'); else if (actNow === 'decline') inDecline(); return; }
        if (G || oneOneBusy() || IN) { db().collection('calls').doc(callId).update({ status: 'busy', endedAt: Date.now() }).catch(function () {}); return; }
        if (!supported()) { db().collection('calls').doc(callId).update({ status: 'declined', endedAt: Date.now(), reason: 'unsupported' }).catch(function () {}); return; }
        ensureUI();
        IN = { id: callId, c: c, gid: c.group };
        var host = c.from;
        $('gc-in-av').innerHTML = avatar(host);
        $('gc-in-t').textContent = nameOf(host) + ' mời bạn vào cuộc gọi nhóm';
        $('gc-in-s').textContent = (c.type === 'video' ? 'Cuộc gọi có hình' : 'Cuộc gọi thoại') + (c.groupN > 1 ? ' · ' + c.groupN + ' người đang trong cuộc gọi' : '');
        $('gc-in').querySelector('[data-k="okv"]').hidden = !(c.type === 'video' && CFG.vmax >= 2);
        $('gc-in').querySelector('[data-k="ok"] span').textContent = c.type === 'video' ? 'Chỉ nghe' : 'Tham gia';
        $('gc-in').classList.add('on'); hush(true); ringStart();
        db().collection('calls').doc(callId).update({ seen: Date.now() }).catch(function () {});
        var i0 = IN;
        IN.unsub = db().collection('calls').doc(callId).onSnapshot(function (x) { if (IN !== i0) return; var s = x.exists ? x.data() : null; if (!s || (s.status !== 'ringing' && !i0.acting)) inClose(s && s.status === 'accepted' ? 'Đã nghe máy trên thiết bị khác' : ''); }, function () {});
        IN.t = setTimeout(function () { if (IN === i0) inClose(''); }, Math.max(3000, RING_MS - (Date.now() - (c.created || Date.now()))));
        if (d.hidden && W.Notif && Notif.show) try { Notif.show('👥 ' + nameOf(host) + ' mời bạn vào cuộc gọi nhóm', 'Chạm để tham gia', 'call:' + callId, host); } catch (e) {}
        if (actNow === 'accept') setTimeout(function () { inAccept(c.type === 'video'); }, 300); else if (actNow === 'decline') inDecline();
    }
    function inClose(msg) {
        var i = IN; IN = null; ringStop(); if (!i) return;
        clearTimeout(i.t); try { i.unsub && i.unsub(); } catch (e) {}
        $('gc-in').classList.remove('on'); if (Q && Q.cancelCallNotif) try { Q.cancelCallNotif('call:' + i.id); } catch (e) {}
        if (msg) toast(msg, 'info'); if (!G) setTimeout(function () { if (!G && !IN) hush(false); }, 300);
    }
    function inAccept(withVideo) {
        if (!IN) return; var i = IN; i.acting = true;
        db().collection('calls').doc(i.id).update({ status: 'accepted', acceptedAt: Date.now() }).catch(function () {});
        inClose(''); join(i.gid, { room: i.c.groupRoom || 'invite', type: i.c.type, cam: !!withVideo, must: true });
    }
    function inDecline() {
        if (!IN) return; var i = IN; i.acting = true;
        db().collection('calls').doc(i.id).update({ status: 'declined', endedAt: Date.now(), endedBy: me() }).catch(function () {});
        inClose('');
    }

    /* ---------- gắn vào trang ---------- */
    function hookChat() {
        injectCSS();
        var hdr = d.querySelector('#chat-active-ui .chat-header .flex.gap-2.flex-shrink-0');
        if (hdr && !$('gc-btn')) hdr.insertAdjacentHTML('afterbegin', '<button type="button" class="btn-icon qc-hbtn gc-hb" id="gc-btn" title="Gọi nhóm" aria-label="Gọi nhóm" style="display:none;color:#16a34a"><i class="fa-solid fa-users"></i><span class="gc-n" id="gc-btn-n"></span></button>');
        var b = $('gc-btn'); if (b && !b.__h) { b.__h = 1; b.addEventListener('click', function () { openSheet('home'); }); }
        var hist = $('chat-history-ui');
        if (hist && !$('gc-live')) { hist.insertAdjacentHTML('beforebegin', '<div id="gc-live" role="button"><span></span><b>Vào</b></div>'); $('gc-live').addEventListener('click', function () { join('general', { room: 'general', type: 'audio' }); }); }
        (function hook(n) {
            if (!W.Chat || !Chat.updateHeader) { if (n < 120) setTimeout(function () { hook(n + 1); }, 500); return; }
            if (Chat.updateHeader.__gc) return;
            var uh = Chat.updateHeader; Chat.updateHeader = function () { var r = uh.apply(this, arguments); paintEntry(); return r; }; Chat.updateHeader.__gc = 1; paintEntry();
        })(0);
    }
    function boot() {
        if (booted) return; booted = true;
        try { if (W.QDNative && QDNative.isBubble && QDNative.isBubble()) return; } catch (e) {}
        hookChat();
        W.addEventListener('pagehide', function () { if (G) leave(true); });
        (function wait(n) { if (W.firebase && firebase.apps && firebase.apps.length && me()) { loadCfg(); watchRoom(); } else if (n < 2000) setTimeout(function () { wait(n + 1); }, 1500); })(0);
    }
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();

    return {
        active: function () { return !!G; }, ringing: function () { return !!IN; },
        open: openSheet, join: join, leave: function () { leave(); }, show: function () { minimize(false); },
        invited: invited, cfg: function () { return CFG; },
        _state: function () { return G; }
    };
})();
