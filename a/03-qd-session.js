    (function () {
        'use strict';
        var W = window, d = document;
        if (W.QDSession) return;
        var cs = d.currentScript, KIND = (cs && cs.getAttribute('data-kind')) || 'mem';   // user | mem | public | adm
        var ADM = KIND === 'adm', KEY = ADM ? 'qd_sess_adm' : 'qd_sess';
        var TAB = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        var ONLINE_MS = 330000, PING_MS = 240000, IDLE_MS = 300000, WARN_MS = 60000;   // báo online 4 phút / lần (trước 45 giây: mỗi lần ghi tốn 1 lượt ĐỌC cho MỌI người đang mở app -> hết hạn mức Firebase)
        var STAFF = { admin: 1, manager: 1 };
        var MSG = {
            expired: 'Phiên đăng nhập đã hết hạn do bạn không thao tác trong thời gian dài.',
            logout: 'Tài khoản đã đăng xuất ở một trang khác.',
            'switch': 'Một tài khoản khác vừa đăng nhập trên trình duyệt này.',
            admin: 'Ban Quản Trị đã đăng xuất tài khoản của bạn khỏi hệ thống.',
            all: 'Ban Quản Trị vừa đăng xuất toàn bộ thành viên.',
            locked: 'Tài khoản của bạn đã bị khóa.',
            deleted: 'Tài khoản không còn tồn tại trên hệ thống.',
            device: 'Tài khoản vừa được đăng nhập trên một thiết bị khác (mỗi tài khoản chỉ dùng 1 thiết bị cùng lúc). Nếu không phải bạn, hãy đổi mật khẩu và báo Ban Quản Trị.'
        };
        function now() { return Date.now(); }
        function ls(k, v) {
            try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
            catch (e) { return null; }
        }
        function jget(k) { try { return JSON.parse(ls(k) || 'null'); } catch (e) { return null; } }
        function jset(k, o) { ls(k, o == null ? null : JSON.stringify(o)); }
        var DB = null;
        function db() { if (DB) return DB; try { if (W.firebase && firebase.apps && firebase.apps.length && firebase.firestore) DB = firebase.firestore(); } catch (e) {} return DB; }

        /* ---------- Cấu hình (settings/account_config), nhớ trên máy để kiểm tra ngay khi mở trang ---------- */
        function norm(c) {
            c = c || {};
            var n = function (v, def) { v = parseInt(v, 10); return isNaN(v) ? def : Math.max(0, Math.min(v, 525600)); };
            return { mem: n(c.sessionMinutes, 360), adm: n(c.staffSessionMinutes, 360), epoch: +c.sessionEpoch || 0 };
        }
        var CFG = norm(jget('qd_sess_cfg'));
        function limit(s) { var m = (ADM || (s && STAFF[s.role])) ? CFG.adm : CFG.mem; return m > 0 ? m * 60000 : 0; }

        /* ---------- Phiên ---------- */
        function sess() { var s = jget(KEY); return s && s.u ? s : null; }
        function lastAct() { return +ls('qd_act') || 0; }
        function since(s) { return Math.max(lastAct(), (s && s.s) || 0); }
        var had = null;   // phiên mà trang này đang chạy theo
        (function boot() {
            var s = sess();
            if (!ADM && !s && ls('qd_current_username')) { ls('qd_current_username', null); s = null; if (KIND === 'mem') go('expired'); return; }   // phiên bản cũ (không có hạn) -> đăng nhập lại 1 lần
            if (!s) return;
            var lim = limit(s);
            if (lim && now() - since(s) > lim) { clear(s, 'expired'); if (KIND === 'mem') go('expired'); else if (KIND !== 'public') note('expired'); return; }
            if (KIND !== 'user' && !ADM) had = s;   // user.html / admin.html: chỉ theo phiên sau khi đăng nhập trên trang (QDSession.start)
        })();
        function pageState() { try { if (typeof State !== 'undefined' && State) return State; } catch (e) {} return W.State || null; }
        function active() {
            if (!had) return false;
            if (KIND === 'user') { var P = pageState(); return !!(P && P.currentDocId); }
            if (ADM) { var A = pageState(); return !!(A && A.currentUser); }
            return true;
        }
        function clear(s, reason) {
            jset('qd_sess_end', { r: reason, at: now(), u: s && s.u, k: ADM ? 'adm' : 'mem' });
            ls(KEY, null);
            if (!ADM) { if (!s || ls('qd_current_username') === s.u) ls('qd_current_username', null); try { sessionStorage.removeItem('qd_resume'); } catch (e) {} }
            else {
                ls('qd_adm_autologin', 'false');
                var m = jget('qd_sess');   // Admin hết phiên / thoát -> phiên thành viên của cùng tài khoản (các trang mở từ Admin) thoát theo
                if (m && s && m.u === s.u) { ls('qd_sess', null); if (ls('qd_current_username') === s.u) ls('qd_current_username', null); }
            }
        }
        function endReason() { var e = jget('qd_sess_end'); return e && now() - e.at < 30000 && e.k === (ADM ? 'adm' : 'mem') ? e.r : ''; }

        function start(o, opt) {
            o = o || {};
            var t = now(), rec = { u: String(o.u || ''), id: o.id || null, role: o.role || '', s: t, kack: +o.kickAt || 0, eack: CFG.epoch, sid: TAB };
            if (!rec.u) return;
            jset(KEY, rec); ls('qd_act', String(t));
            if (!ADM) ls('qd_current_username', rec.u);
            if (ADM && !(opt && opt.member === false)) { var m = {}; for (var k in rec) m[k] = rec[k]; jset('qd_sess', m); ls('qd_current_username', rec.u); }
            had = rec; idleSent = false; hideWarn(); listen(); ping(true);
        }
        function end(reason, silent) {
            var s = sess() || had; reason = reason || 'logout';
            if (s) offline(s, true);
            clear(s, reason); had = null; unlisten(); hideWarn();
            if (!silent) kicked(reason);
        }

        /* ---------- Thao tác của người dùng (dùng chung mọi tab) ---------- */
        var actW = 0;
        function touch(force) {
            if (!active() || d.visibilityState === 'hidden') return;
            var s = sess(); if (!s) return check();
            var lim = limit(s); if (lim && now() - since(s) > lim) return check();   // đã quá hạn khi tab bị đóng băng: không được "hồi sinh"
            var t = now(); if (!force && !warnEl && t - actW < 10000) return;
            actW = t; ls('qd_act', String(t)); hideWarn();
            if (idleSent && !force) ping(true);   // quay lại sau khi để yên: báo online ngay
        }
        ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'mousemove'].forEach(function (ev) {
            d.addEventListener(ev, function (e) { if (e.isTrusted !== false) touch(false); }, { capture: true, passive: true });
        });

        /* ---------- Kiểm tra phiên mỗi giây + khi tab khác đổi phiên ---------- */
        function check() {
            if (!had) return;
            var s = sess();
            if (!s) return gone(endReason() || 'logout');
            if (s.u !== had.u) return gone('switch');
            if (s.s !== had.s || s.id !== had.id) { var oldId = had.id; had = s; if (s.id !== oldId) { unlisten(); listen(); } }
            if (!active()) return;
            var lim = limit(s); if (!lim) return hideWarn();
            var left = since(s) + lim - now();
            if (left <= 0) return end('expired');
            if (left <= WARN_MS && d.visibilityState === 'visible') showWarn(left); else hideWarn();
        }
        function gone(reason) {   // phiên đã bị kết thúc ở trang khác
            var wasActive = active(); had = null; unlisten(); hideWarn();
            if (ADM || KIND === 'mem' || wasActive) kicked(reason);
        }
        setInterval(check, 1000);
        W.addEventListener('storage', function (e) { if (!e.key || e.key === KEY || e.key === 'qd_sess_cfg') { if (e.key === 'qd_sess_cfg') CFG = norm(jget('qd_sess_cfg')); check(); } });

        /* ---------- Nghe máy chủ: cấu hình phiên + tài khoản (bị đá / khóa / xóa) ---------- */
        var unCfg = null, unAcc = null, lookup = false;
        function listen() {
            var D = db(); if (!D) return;
            if (!had && KIND !== 'user' && !ADM) return;   // chưa đăng nhập: trang đăng nhập vẫn nghe cấu hình để có số mới nhất
            if (!unCfg) unCfg = D.collection('settings').doc('account_config').onSnapshot(function (doc) {
                var raw = doc.exists ? doc.data() : {};
                CFG = norm(raw); jset('qd_sess_cfg', { sessionMinutes: raw.sessionMinutes, staffSessionMinutes: raw.staffSessionMinutes, sessionEpoch: raw.sessionEpoch });
                var s = had; if (!s || ADM || STAFF[s.role] || !active()) return check();
                if (CFG.epoch && CFG.epoch > Math.max(s.s, s.eack || 0)) return end('all');
                check();
            }, function () { unCfg = null; });
            var s = had; if (!s || unAcc) return;
            if (!s.id) {
                if (lookup) return; lookup = true;
                D.collection('accounts').where('user', '==', s.u).limit(1).get().then(function (q) {
                    lookup = false; var cur = sess(); if (!cur || cur.u !== s.u || q.empty) return;
                    cur.id = q.docs[0].id; cur.role = q.docs[0].data().role || cur.role || ''; jset(KEY, cur); had = cur; listen(); ping(true);
                }, function () { lookup = false; });
                return;
            }
            var id = s.id;
            unAcc = D.collection('accounts').doc(id).onSnapshot(function (doc) {
                var c = had; if (!c || c.id !== id) return;
                if (!doc.exists) {   // không thấy theo mã cũ -> tìm lại theo tên đăng nhập (tài khoản được tạo lại / đổi mã) rồi mới kết luận đã bị xóa
                    if (doc.metadata.fromCache || c.relook) return; c.relook = true;
                    D.collection('accounts').where('user', '==', c.u).limit(1).get().then(function (q) {
                        var cur = sess(); if (!cur || cur.u !== c.u) return;
                        if (q.empty || q.docs[0].id === id) return end('deleted');
                        cur.id = q.docs[0].id; jset(KEY, cur); had = cur; unlisten(); listen();
                    }, function () { c.relook = false; });
                    return;
                }
                var a = doc.data() || {};
                if (a.role !== undefined && (a.role || '') !== (c.role || '')) { c.role = a.role || ''; var cur = sess(); if (cur && cur.u === c.u) { cur.role = c.role; jset(KEY, cur); } }
                if (+a.kickAt && +a.kickAt > Math.max(c.s, c.kack || 0)) return end('admin');
                if (!ADM && a.isBlocked === true) return end('locked');
            }, function () { unAcc = null; });
        }
        function unlisten() { if (unAcc) { try { unAcc(); } catch (e) {} unAcc = null; } }
        var waitN = 0, wait = setInterval(function () { if (db() || ++waitN > 80) { clearInterval(wait); if (DB) { listen(); ping(true); setTimeout(function () { ping(true); }, 5000); } } }, 400);

        /* ---------- Trạng thái hoạt động (online / "hoạt động x phút trước") ---------- */
        var idleSent = false, lastPing = 0, offT = 0, offSent = false;
        var noOnline = false;   // Firestore Rules chưa cho ghi trường online -> chỉ ghi lastActive
        function write(s, data) {
            var D = db(); if (!D || !s || !s.id) return;
            if (noOnline) delete data.online;
            try {
                D.collection('accounts').doc(s.id).update(data).catch(function (er) {
                    if (noOnline || !er || er.code !== 'permission-denied' || !('online' in data)) return;
                    noOnline = true; delete data.online; D.collection('accounts').doc(s.id).update(data).catch(function () {});
                });
            } catch (e) {}
        }
        function ping(force) {
            if (!active() || d.visibilityState !== 'visible') return;
            var s = had, t = now(); if (!s || !s.id) return;
            if (!force && t - lastPing < PING_MS - 2000) return;
            var la = since(s);
            if (t - la > IDLE_MS) { if (!idleSent) { idleSent = true; write(s, { online: false, lastActive: la }); } return; }   // để yên 5 phút: offline, giữ đúng giờ thao tác cuối
            idleSent = false; lastPing = t; jset('qd_vis', { t: TAB, at: t });
            write(s, { online: true, lastActive: t });
        }
        setInterval(function () { ping(false); }, 15000);
        function otherTabVisible() { var v = jget('qd_vis'); return !!(v && v.t !== TAB && now() - v.at < PING_MS + 15000); }
        function offline(s, force) {
            if (!s || !s.id) return;
            if (!force && otherTabVisible()) return;   // còn tab khác đang mở -> vẫn online
            var v = jget('qd_vis'); if (v && v.t === TAB) ls('qd_vis', null);
            if (idleSent && !force) return;
            write(s, { online: false, lastActive: idleSent ? since(s) : now() });
        }
        d.addEventListener('visibilitychange', function () {
            if (d.visibilityState === 'visible') { check(); clearTimeout(offT); if (active()) { touch(true); if (offSent || now() - lastPing > PING_MS - 2000) ping(true); offSent = false; } tick(); }
            else if (active()) { clearTimeout(offT); offT = setTimeout(function () { if (d.visibilityState !== 'visible') { offSent = true; offline(had, false); } }, 45000); }   // chuyển app qua lại nhanh: không ghi gì (tiết kiệm lượt đọc / ghi)
        });
        W.addEventListener('pagehide', function (e) {   // đóng tab / rời trang: gửi kèm bản "keepalive" để chắc chắn tới máy chủ
            if (e.persisted || !active() || otherTabVisible() || !had || !had.id) return;
            try {
                if (W.QDdb && W.QDdb.beacon) { W.QDdb.beacon([{ op: 'update', path: 'accounts/' + had.id, data: { online: false, lastActive: idleSent ? since(had) : now() } }]); return; }   // máy chủ VPS
            } catch (er) {}
        });
        W.addEventListener('pageshow', function (e) { if (e.persisted) { check(); ping(true); } });

        function pres(a) {   // a: dữ liệu tài khoản (lastActive, online)
            var t = +(a && a.lastActive) || 0;
            if (!t) return { on: false, t: 0, text: 'Chưa từng hoạt động', short: 'Chưa từng hoạt động' };
            var age = now() - t, on = a.online !== false && age < ONLINE_MS;
            var sh = on ? 'Đang trực tuyến' : ago(t);
            return { on: on, t: t, text: on ? sh : (/^Truy cập/.test(sh) ? sh : 'Hoạt động ' + sh), short: sh };
        }
        function ago(t) {
            var s = Math.max(0, Math.floor((now() - t) / 1000));
            if (s < 60) return 'vừa xong';
            if (s < 3600) return Math.floor(s / 60) + ' phút trước';
            if (s < 86400) return Math.floor(s / 3600) + ' giờ trước';
            if (s < 7 * 86400) return Math.floor(s / 86400) + ' ngày trước';
            return 'Truy cập ' + new Date(t).toLocaleDateString('vi-VN');
        }
        function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        /* Gắn vào phần tử để tự cập nhật: QDSession.attrs(acc, { fmt: 'full'|'short'|'none', on: 'lớp khi online', off: 'lớp khi offline' }) */
        function attrs(a, o) {
            o = o || {};
            return ' data-qd-t="' + (+(a && a.lastActive) || 0) + '" data-qd-o="' + (a && a.online === false ? 0 : 1) + '" data-qd-fmt="' + esc(o.fmt || 'full') + '"'
                + (o.on ? ' data-qd-on="' + esc(o.on) + '"' : '') + (o.off ? ' data-qd-off="' + esc(o.off) + '"' : '');
        }
        function cls(el, list, add) { String(list || '').split(/\s+/).forEach(function (c) { if (c) el.classList.toggle(c, add); }); }
        function tick(root) {
            var els = (root || d).querySelectorAll ? (root || d).querySelectorAll('[data-qd-t]') : [];
            for (var i = 0; i < els.length; i++) {
                var el = els[i], p = pres({ lastActive: +el.getAttribute('data-qd-t'), online: el.getAttribute('data-qd-o') !== '0' });
                var f = el.getAttribute('data-qd-fmt') || 'full';
                if (f !== 'none') { var txt = f === 'short' ? (p.on ? '● Đang hoạt động' : p.short) : p.text; if (el.textContent !== txt) el.textContent = txt; }
                cls(el, el.getAttribute('data-qd-off'), !p.on); cls(el, el.getAttribute('data-qd-on'), p.on);
            }
        }
        setInterval(function () { if (d.visibilityState !== 'hidden') tick(); }, 5000);

        /* ---------- Giao diện: nhắc sắp hết phiên · màn hình bị đá ra · thông báo ở trang đăng nhập ---------- */
        function css() {
            if (d.getElementById('qd-sess-css')) return;
            var st = d.createElement('style'); st.id = 'qd-sess-css';
            st.textContent = '#qd-sess-warn{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483646;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);padding:10px 12px 10px 18px;border-radius:999px;font:600 14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;background:rgba(24,8,8,.94);border:1px solid rgba(255,213,74,.65);box-shadow:0 14px 34px -12px rgba(0,0,0,.65)}'
                + '#qd-sess-warn b{color:#ffd54a;font-variant-numeric:tabular-nums}#qd-sess-warn button{flex-shrink:0;border:0;border-radius:999px;padding:8px 14px;font:700 13px system-ui,sans-serif;background:#ffd54a;color:#3b0a0a;cursor:pointer}'
                + '#qd-sess-kick{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,4,4,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}'
                + '#qd-sess-kick .k{width:100%;max-width:380px;border-radius:20px;padding:28px 24px 22px;text-align:center;background:#fff;color:#2a0d0d;border-top:5px solid #c1121f;box-shadow:0 30px 60px -20px rgba(0,0,0,.6)}'
                + '#qd-sess-kick .i{font-size:40px;line-height:1;margin-bottom:10px}#qd-sess-kick h3{margin:0 0 8px;font-size:19px;color:#a10f1a}#qd-sess-kick p{margin:0 0 18px;font-size:15px;line-height:1.5;color:#4a2a2a}'
                + '#qd-sess-kick a{display:block;padding:12px;border-radius:12px;background:#c1121f;color:#fff;font-weight:700;text-decoration:none}#qd-sess-kick small{display:block;margin-top:12px;color:#8a6a6a;font-size:12.5px}'
                + '#qd-sess-note{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483646;display:flex;align-items:flex-start;gap:10px;width:calc(100vw - 32px);max-width:440px;padding:14px 14px 14px 16px;border-radius:14px;font:600 14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#5c1010;background:#fff5f5;border:1px solid #f0a3a3;box-shadow:0 16px 36px -14px rgba(0,0,0,.45)}'
                + '#qd-sess-note span{flex:1}#qd-sess-note button{border:0;background:none;font-size:20px;line-height:1;color:#a10f1a;cursor:pointer;padding:0 2px}';
            (d.head || d.documentElement).appendChild(st);
        }
        var warnEl = null;
        function showWarn(left) {
            if (!d.body) return; css();
            if (!warnEl) {
                warnEl = d.createElement('div'); warnEl.id = 'qd-sess-warn'; warnEl.setAttribute('role', 'alert');
                warnEl.innerHTML = '<span>⏳ Phiên đăng nhập sẽ hết sau <b></b> do không thao tác</span><button type="button">Tiếp tục</button>';
                warnEl.querySelector('button').onclick = function () { touch(true); };
                d.body.appendChild(warnEl);
            }
            warnEl.querySelector('b').textContent = Math.ceil(left / 1000) + ' giây';
        }
        function hideWarn() { if (warnEl) { warnEl.remove(); warnEl = null; } }
        function target(reason) { return (ADM ? 'admin.html' : 'user.html') + '?out=' + encodeURIComponent(reason); }
        function go(reason) { try { location.replace(target(reason)); } catch (e) { location.href = target(reason); } }
        var kickedOnce = false;
        function kicked(reason) {
            if (kickedOnce) return;
            if (KIND === 'public') return;
            if (KIND === 'user' && reason === 'locked') return;   // user.html tự hiện hộp "tài khoản bị khóa"
            kickedOnce = true;
            try { Array.prototype.forEach.call(d.querySelectorAll('audio,video'), function (m) { try { m.pause(); } catch (e) {} }); } catch (e) {}
            try { if (W.Music && W.Music.el) W.Music.el.pause(); } catch (e) {}
            var show = function () {
                css();
                var k = d.createElement('div'); k.id = 'qd-sess-kick'; k.setAttribute('role', 'alertdialog'); k.setAttribute('aria-modal', 'true');
                k.innerHTML = '<div class="k"><div class="i">' + (reason === 'expired' ? '⏰' : reason === 'locked' ? '🔒' : '🚪') + '</div><h3>Phiên đăng nhập đã kết thúc</h3><p>' + esc(MSG[reason] || MSG.expired)
                    + '</p><a href="' + target(reason) + '">Đăng nhập lại</a><small>Tự chuyển sau <b>5</b> giây…</small></div>';
                d.body.appendChild(k);
                var n = 5, b = k.querySelector('small b'), h = setInterval(function () { if (--n <= 0) { clearInterval(h); go(reason); } else b.textContent = n; }, 1000);
            };
            if (d.body) show(); else d.addEventListener('DOMContentLoaded', show);
        }
        function note(reason) {   // hiện ở trang đăng nhập (user.html / admin.html) sau khi bị đá ra
            var t = MSG[reason]; if (!t) return;
            var show = function () {
                if (d.getElementById('qd-sess-note')) return; css();
                var n = d.createElement('div'); n.id = 'qd-sess-note'; n.setAttribute('role', 'status');
                n.innerHTML = '<span>' + (reason === 'expired' ? '⏰ ' : '🚪 ') + esc(t) + ' Vui lòng đăng nhập lại.</span><button type="button" aria-label="Đóng">×</button>';
                n.querySelector('button').onclick = function () { n.remove(); };
                d.body.appendChild(n); setTimeout(function () { if (n.parentNode) n.remove(); }, 12000);
            };
            if (d.body) show(); else d.addEventListener('DOMContentLoaded', show);
        }
        if (KIND === 'user' || ADM) {
            try {
                var q = new URLSearchParams(location.search), r = q.get('out');
                if (r) { note(r); q.delete('out'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); }
            } catch (e) {}
        }

        W.QDSession = {
            kind: KIND, start: start, end: end, touch: function () { touch(true); }, ping: function () { ping(true); }, check: check,
            get: function () { return had; }, cfg: function () { return CFG; }, minutes: function () { var s = had || sess(); return limit(s) / 60000; },
            pres: pres, ago: ago, attrs: attrs, tick: tick, ONLINE_MS: ONLINE_MS
        };
    })();
    
