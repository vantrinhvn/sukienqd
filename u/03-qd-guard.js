    (function () {
        'use strict';
        var W = window, d = document;
        if (W.__qdGuard) return; W.__qdGuard = true;
        var PAGE = (location.pathname.split('/').pop() || 'index.html').slice(0, 60);
        var SESS = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        var DEF = { on: true, err: true, autoBlock: true, script: { on: true, n: 15 }, rhythm: { on: true }, bot: { on: true }, device: { on: true } };
        var CFG = null, DB = null, sent = {}, errSent = {}, errN = 0, flagN = 0, busy = false, devDone = {};
        function me() { try { if (typeof State !== 'undefined' && State && State.currentUser) return String(State.currentUser); } catch (e) {} try { return localStorage.getItem('qd_current_username') || ''; } catch (e) { return ''; } }
        function dev() { try { var v = localStorage.getItem('qd_dev_id'); if (!v) { v = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); localStorage.setItem('qd_dev_id', v); } return v; } catch (e) { return 'khong-luu-duoc'; } }
        function db() { if (DB) return DB; try { if (W.firebase && firebase.apps && firebase.apps.length && firebase.firestore) DB = firebase.firestore(); } catch (e) {} return DB; }
        function norm(c) {
            c = c || {}; var r = c.rules || {}, o = JSON.parse(JSON.stringify(DEF));
            o.on = c.isEnabled !== false; o.err = c.errorReport !== false; o.autoBlock = c.autoBlock !== false;
            ['script', 'rhythm', 'bot', 'device'].forEach(function (k) { if (r[k]) { o[k].on = r[k].on !== false; if (r[k].n != null) o[k].n = Math.max(3, parseInt(r[k].n, 10) || o[k].n || 0); } });
            o.white = {}; (Array.isArray(c.whitelist) ? c.whitelist : []).forEach(function (u) { o.white[String(u)] = 1; });
            o.prot = protNorm(c.protect);
            return o;
        }
        function protNorm(p) {
            p = p || {};
            return { on: p.on === true, keys: p.keys !== false, menu: p.menu !== false, copy: p.copy === true, devtools: p.devtools === true, staff: p.staffExempt !== false,
                msg: String(p.msg || 'Chức năng này đã bị Ban Quản Trị khóa.').slice(0, 160) };
        }
        var listening = false;
        function load() {   // nghe trực tiếp: Admin bật / tắt là trang đang mở đổi theo ngay
            var D = db(); if (!D || listening) return; listening = true;
            D.collection('settings').doc('security_config').onSnapshot(function (s) {
                var first = !CFG; CFG = norm(s.exists ? s.data() : null);
                try { localStorage.setItem('qd_prot', JSON.stringify(s.exists ? (s.data().protect || {}) : {})); } catch (e) {}
                protApply(); if (first) start();
            }, function () { if (!CFG) { CFG = norm(null); start(); } });
        }
        var PROT0 = (function () { try { return protNorm(JSON.parse(localStorage.getItem('qd_prot') || '{}')); } catch (e) { return protNorm(null); } })();   // dùng ngay khi mở trang
        function cfg() { if (CFG) return CFG; var o = norm(null); o.prot = PROT0; return o; }
        function hush(fn) { busy = true; try { return fn(); } finally { busy = false; } }

        /* ---------- Gửi cảnh báo (mỗi loại tối đa 1 lần / 5 phút / phiên, tối đa 12 lần / phiên) ---------- */
        function flag(type, sev, detail, extra) {
            var c = cfg(), u = me(); if (!c.on || (u && c.white[u])) return;
            var now = Date.now(); if (sent[type] && now - sent[type] < 300000) return; if (++flagN > 12) return; sent[type] = now;
            var D = db(); if (!D) return;
            var doc = { type: type, sev: sev, detail: String(detail || '').slice(0, 300), user: u || null, page: PAGE, device: dev(), ua: navigator.userAgent.slice(0, 180), at: now, status: 'new', session: SESS };
            if (extra) Object.keys(extra).forEach(function (k) { doc[k] = extra[k]; });
            hush(function () { D.collection('security_flags').add(doc).catch(function () {}); });
        }
        W.QDGuard = { flag: flag, dev: dev, off: function () { return !cfg().on; } };   // off(): Admin tắt Chống gian lận -> tắt cả chống điểm danh hộ

        /* ---------- 1. Script tự bấm: click không do người bấm (isTrusted = false) dồn dập ---------- */
        var fake = [], blockUntil = 0, CLOSE = '.modal-close-btn, .modal-close, .close-btn, [data-guard-ok], [aria-label="Đóng"], .inv2-x, .rp-x, .gd-x';
        function act(t) { return t && t.closest ? t.closest('button, a, [onclick], [role="button"], .gift-opt, .chip, .act') : null; }
        d.addEventListener('click', function (e) {
            var c = cfg(); if (!c.on || !c.script.on || e.isTrusted || busy) return;
            var el = act(e.target); if (!el || el.closest(CLOSE)) return;
            var now = Date.now();
            if (blockUntil > now && c.autoBlock) { e.preventDefault(); e.stopImmediatePropagation(); return; }
            fake.push(now); while (fake.length && now - fake[0] > 60000) fake.shift();
            if (fake.length >= c.script.n) {
                flag('script', 'high', fake.length + ' lần bấm do mã lệnh tạo ra trong 1 phút (nút: ' + String(el.innerText || el.id || el.className || el.tagName).trim().slice(0, 60) + ')', { count: fake.length });
                if (c.autoBlock) {
                    blockUntil = now + 120000; e.preventDefault(); e.stopImmediatePropagation();
                    try { if (W.Utils && Utils.toast) Utils.toast('Phát hiện thao tác tự động — tạm chặn 2 phút.', 'warning'); } catch (er) {}
                }
            }
        }, true);

        /* ---------- 2. Nhịp bấm đều bất thường (phần mềm auto-click: khoảng cách giữa các lần bấm gần như y hệt) ---------- */
        var taps = [];
        d.addEventListener('pointerdown', function (e) {
            var c = cfg(); if (!c.on || !c.rhythm.on || !e.isTrusted || !act(e.target)) return;
            var now = performance.now(); taps.push(now); if (taps.length > 21) taps.shift();
            if (taps.length < 21) return;
            var gaps = []; for (var i = 1; i < taps.length; i++) gaps.push(taps[i] - taps[i - 1]);
            var mean = gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length; if (mean > 450) return;
            var sd = Math.sqrt(gaps.reduce(function (a, g) { return a + (g - mean) * (g - mean); }, 0) / gaps.length);
            if (sd < 6) { flag('rhythm', 'med', '20 lần bấm liên tiếp cách đều ' + Math.round(mean) + ' ms (lệch ' + sd.toFixed(1) + ' ms) — nghi dùng phần mềm tự bấm', { mean: Math.round(mean), sd: +sd.toFixed(1) }); taps = []; }
        }, true);

        /* ---------- 3 + 4. Trình duyệt tự động hóa + ghi thiết bị (Admin quét: nhiều tài khoản / 1 thiết bị) ---------- */
        var botTry = 0;
        function botCheck() {   // đợi biết tài khoản (tối đa ~1 phút) để cảnh báo ghi đúng tên
            var c = cfg(); if (!c.on || !c.bot.on || navigator.webdriver !== true || sent.bot) return;
            if (me() || ++botTry >= 3) flag('bot', 'high', 'Trình duyệt đang bị điều khiển tự động (webdriver)');
        }
        function start() { var c = cfg(); if (!c.on) return; botCheck(); seen(); }
        function seen() {
            botCheck();
            var c = cfg(), u = me(), D = db(); if (!c.on || !c.device.on || !u || devDone[u] || !D || !firebase.firestore.FieldValue) return;
            devDone[u] = 1;
            hush(function () { D.collection('security_devices').doc(dev()).set({ users: firebase.firestore.FieldValue.arrayUnion(u), lastUser: u, lastAt: Date.now(), page: PAGE, ua: navigator.userAgent.slice(0, 180) }, { merge: true }).catch(function () {}); });
        }
        setInterval(seen, 20000);   // đăng nhập sau khi vào trang

        /* ---------- 5. Bảo vệ mã nguồn (Admin > Chống gian lận > Bảo vệ mã nguồn) ---------- */
        function staff() { try { return Date.now() - (+localStorage.getItem('qd_staff') || 0) < 30 * 864e5; } catch (e) { return false; } }   // thiết bị đã đăng nhập Admin trong 30 ngày
        function prot() { var p = cfg().prot; return p.on && !(p.staff && staff()) ? p : null; }
        var tipAt = 0, tries = [];
        function tip(msg) {
            var now = Date.now(); if (now - tipAt < 1500) return; tipAt = now;
            try { if (W.Utils && Utils.toast) { Utils.toast('🔒 ' + msg, 'warning'); return; } } catch (e) {}
            var t = d.getElementById('qd-prot-tip');
            if (!t) { t = d.createElement('div'); t.id = 'qd-prot-tip'; t.setAttribute('role', 'status');
                t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 32px);padding:11px 18px;border-radius:999px;font:600 14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;background:rgba(20,6,6,.92);border:1px solid rgba(255,213,74,.6);box-shadow:0 12px 30px -12px rgba(0,0,0,.6);transition:opacity .25s;pointer-events:none';
                d.body.appendChild(t); }
            t.textContent = '🔒 ' + msg; t.style.opacity = '1'; clearTimeout(t._h); t._h = setTimeout(function () { t.style.opacity = '0'; }, 2200);
        }
        function tried(what) {   // thử mở mã nguồn nhiều lần -> cảnh báo mức Thấp
            var now = Date.now(); tries.push(now); while (tries.length && now - tries[0] > 60000) tries.shift();
            if (tries.length >= 3) flag('source', 'low', 'Cố mở mã nguồn / công cụ nhà phát triển ' + tries.length + ' lần trong 1 phút (' + what + ')');
        }
        function editable(t) { return t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'); }
        function keyName(e) {
            var k = String(e.key || '').toLowerCase(), c = e.ctrlKey || e.metaKey, s = e.shiftKey, a = e.altKey;
            if (e.key === 'F12' || e.keyCode === 123) return 'F12';
            if (c && !s && !a && (k === 'u' || e.keyCode === 85)) return 'Ctrl+U';
            if (e.metaKey && a && (k === 'u' || e.keyCode === 85)) return 'Cmd+Option+U';
            if (c && s && /^[ijck]$/.test(k)) return 'Ctrl+Shift+' + k.toUpperCase();
            if (e.metaKey && a && /^[ijc]$/.test(k)) return 'Cmd+Option+' + k.toUpperCase();
            if (c && !s && !a && (k === 's' || e.keyCode === 83)) return 'Ctrl+S';
            return '';
        }
        function bind(doc) {
            if (!doc || doc.__qdProt) return; doc.__qdProt = true;
            doc.addEventListener('keydown', function (e) {
                var p = prot(); if (!p || !p.keys) return; var n = keyName(e); if (!n) return;
                e.preventDefault(); e.stopPropagation(); tip(p.msg); tried(n);
            }, true);
            doc.addEventListener('contextmenu', function (e) {
                var p = prot(); if (!p || !p.menu || editable(e.target)) return;
                e.preventDefault(); tip(p.msg); tried('chuột phải');
            }, true);
            ['copy', 'cut'].forEach(function (ev) { doc.addEventListener(ev, function (e) { var p = prot(); if (!p || !p.copy || editable(e.target)) return; e.preventDefault(); tip(p.msg); }, true); });
            doc.addEventListener('dragstart', function (e) { var p = prot(); if (p && p.copy && e.target && /^(IMG|VIDEO|A)$/.test(e.target.tagName)) e.preventDefault(); }, true);
            doc.addEventListener('selectstart', function (e) { var p = prot(); if (p && p.copy && !editable(e.target)) e.preventDefault(); }, true);
        }
        function protApply() {
            var p = prot(), on = !!(p && p.copy);
            [d].concat(frames()).forEach(function (doc) { try { if (doc.documentElement) doc.documentElement.classList.toggle('qd-nosel', on); } catch (e) {} });
            if (!d.getElementById('qd-prot-css')) { var st = d.createElement('style'); st.id = 'qd-prot-css'; st.textContent = 'html.qd-nosel body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}html.qd-nosel input,html.qd-nosel textarea,html.qd-nosel [contenteditable]{-webkit-user-select:text;user-select:text}'; (d.head || d.documentElement).appendChild(st); }
        }
        function frames() {   // khung cùng trang (vd. Quân Sư AI) cũng được bảo vệ
            var out = []; Array.prototype.forEach.call(d.querySelectorAll('iframe'), function (f) { try { var dd = f.contentDocument; if (dd && dd.documentElement) out.push(dd); } catch (e) {} }); return out;
        }
        bind(d); protApply();
        setInterval(function () {
            frames().forEach(function (dd) { bind(dd); if (!dd.getElementById('qd-prot-css')) { try { var st = dd.createElement('style'); st.id = 'qd-prot-css'; st.textContent = d.getElementById('qd-prot-css').textContent; (dd.head || dd.documentElement).appendChild(st); dd.documentElement.classList.toggle('qd-nosel', !!(prot() && prot().copy)); } catch (e) {} } });
            var p = prot(); if (!p || !p.devtools || 'ontouchstart' in W) return;   // DevTools gắn cạnh cửa sổ (máy tính): chênh lệch kích thước lớn
            if (W.outerWidth - W.innerWidth > 200 || W.outerHeight - W.innerHeight > 260) flag('devtools', 'low', 'Có dấu hiệu đang mở công cụ nhà phát triển (DevTools) trên ' + PAGE);
        }, 1500);
        d.addEventListener('DOMContentLoaded', protApply);

        /* ---------- Ghi lỗi: gộp theo (trang + thông báo + vị trí), tối đa 15 lỗi khác nhau / phiên ---------- */
        var IGN = /^Script error\.?$|ResizeObserver loop|Non-Error promise rejection|chrome-extension:|moz-extension:|safari-extension:|AbortError|The play\(\) request was interrupted|play\(\) failed because the user|NotAllowedError/i;
        function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
        function base(u) { u = String(u || ''); try { var x = new URL(u, location.href); return x.origin === location.origin ? x.pathname.split('/').pop() || x.pathname : x.host + x.pathname; } catch (e) { return u.slice(0, 80); } }
        function report(kind, msg, src, line, col, stack) {
            var c = cfg(); if (!c.err || busy) return;
            msg = String(msg == null ? '' : msg).replace(/\s+/g, ' ').trim().slice(0, 300);
            if (!msg || IGN.test(msg) || IGN.test(String(src || '')) || IGN.test(String(stack || ''))) return;
            var D = db(); if (!D || !firebase.firestore.FieldValue) { (W.__qdErrQ = W.__qdErrQ || []).push([kind, msg, src, line, col, stack]); return; }   // chưa kết nối: gửi sau
            var file = base(src), sig = kind + '|' + PAGE + '|' + msg.slice(0, 160) + '|' + file + ':' + (line || 0);
            if (errSent[sig]) return; if (++errN > 15) return; errSent[sig] = 1;
            var u = me(), FV = firebase.firestore.FieldValue, now = Date.now();
            var doc = { kind: kind, msg: msg, file: file, line: line || 0, col: col || 0, stack: String(stack || '').slice(0, 900), page: PAGE, count: FV.increment(1), lastAt: now, lastUser: u || null, lastUa: navigator.userAgent.slice(0, 180), status: 'open' };
            if (u) doc.users = FV.arrayUnion(u);
            hush(function () { D.collection('error_logs').doc('e_' + hash(sig)).set(doc, { merge: true }).catch(function () {}); });
        }
        W.addEventListener('error', function (e) {
            var t = e.target;
            if (t && t !== W && t.tagName) {   // file không tải được: ảnh / nhạc / video / script / css
                var url = t.currentSrc || t.src || t.href || ''; if (!url || /^data:|^blob:/.test(url)) return;
                try { var uu = new URL(url, location.href); if (uu.origin !== location.origin || uu.pathname === location.pathname) return; } catch (er) { return; }   // ảnh để trống đường dẫn -> trỏ về chính trang: bỏ qua
                report('resource', 'Không tải được ' + t.tagName.toLowerCase() + ': ' + base(url), url, 0, 0, '');
                return;
            }
            report('js', e.message || (e.error && e.error.message), e.filename, e.lineno, e.colno, e.error && e.error.stack);
        }, true);
        W.addEventListener('unhandledrejection', function (e) {
            var r = e.reason; report('promise', r && (r.message || r.code) || String(r), '', 0, 0, r && r.stack);
        });
        var ce = console.error;
        console.error = function () {
            try {
                var a = Array.prototype.slice.call(arguments), er = a.filter(function (x) { return x instanceof Error || (x && x.code && x.message); })[0];
                var m = a.map(function (x) { return x instanceof Error ? x.message : (typeof x === 'object' ? (x && (x.message || x.code)) || '' : String(x)); }).join(' ').trim();
                if (!busy) report('console', m, '', 0, 0, er && er.stack);
            } catch (e) {}
            return ce.apply(console, arguments);
        };

        var waitN = 0, wait = setInterval(function () {
            if (db() || ++waitN > 60) { clearInterval(wait); if (DB) { load(); var q = W.__qdErrQ || []; W.__qdErrQ = []; q.forEach(function (a) { report.apply(null, a); }); } }
        }, 500);
    })();
    
