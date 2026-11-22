    window.QDMention = (function () {
        'use strict';
        var R = window.QDReportBot;
        function S() { return window.State || {}; }
        function me() { return S().currentUser || ''; }
        function info() { return S().accInfo || {}; }
        function staff() { var i = info()[me()], r = i && i.role; return r === 'admin' || r === 'manager' || me() === 'admin'; }
        function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase(); }

        /* ---------- Nhận diện tên tài khoản ---------- */
        var lowSrc = null, low = {};
        function resolve(tok, m) {
            var a = info();
            if (lowSrc !== a) { lowSrc = a; low = {}; Object.keys(a).forEach(function (u) { low[u.toLowerCase()] = u; }); }
            if (a[tok]) return tok;
            var t = String(tok).toLowerCase(); if (low[t]) return low[t];
            if (t === String(me()).toLowerCase()) return me();
            var l = m && Array.isArray(m.mentions) ? m.mentions : [];
            for (var i = 0; i < l.length; i++) if (String(l[i]).toLowerCase() === t) return l[i];
            return null;
        }
        function forMe(m) { var u = me(); if (!m || !u || m.from === u || m.revoked) return false; var l = m.mentions; return Array.isArray(l) && (l.indexOf(u) >= 0 || l.indexOf('all') >= 0); }
        function sender(m) { if (!m) return ''; if (m.bot) return '🤖 ' + (m.botName || 'Bot Báo Cáo'); return (S().nicknames || {})[m.from] || m.from; }
        function html(m) { return R.renderText(m.text, { resolve: function (t) { return resolve(t, m); }, me: me() }); }
        function extract(text) { var u0 = me(), st = staff(); return R.mentionsIn(text, function (t) { return resolve(t); }).filter(function (u) { return u !== u0 && (u !== 'all' || st); }); }
        function senderHtml(m) { return '<div class="msg-sender qd-bot-sender">🤖 ' + esc(m.botName || 'Bot Báo Cáo') + ' <span class="qd-bot-badge">BOT</span></div>'; }

        /* ---------- Âm báo tin nhắn ----------
           Tin thường: file thongbao.mp3 (nếu trên host không có / không phát được -> tự dùng tiếng "ting" tạo sẵn).
           Tin của Bot báo cáo: tiếng chuông 3 nốt riêng (không cần file). */
        var actx = null, mp3Bad = false, lastDing = 0;
        try { var ma = window.Sound && window.Sound.msgAudio; if (ma) ma.addEventListener('error', function () { mp3Bad = true; }); } catch (e) {}
        function synth(bot) {
            try {
                var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
                actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
                var t0 = actx.currentTime + 0.02, notes = bot ? [[784, 0], [1047, 0.13], [1319, 0.26]] : [[1047, 0], [1568, 0.11]];
                notes.forEach(function (n) {
                    var o = actx.createOscillator(), g = actx.createGain(), t = t0 + n[1];
                    o.type = 'sine'; o.frequency.setValueAtTime(n[0], t);
                    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
                    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.45);
                });
            } catch (e) {}
        }
        function ding(bot) {
            if (document.hidden && window.QDAppNotif) return;   // app đang chạy nền: thông báo của app tự kêu, trang không kêu thêm
            var now = Date.now(); if (now - lastDing < 700) return; lastDing = now;   // nhiều tin tới cùng lúc: kêu 1 lần
            var a = window.Sound && window.Sound.msgAudio;
            if (bot || !a || mp3Bad || (a.error && a.error.code)) return synth(bot);
            try {
                a.currentTime = 0; var pr = a.play();
                if (pr && pr.catch) pr.catch(function (e) { if (!e || e.name !== 'NotAllowedError') { mp3Bad = true; synth(false); } });
            } catch (e) { synth(false); }
        }
        // Chạm / bấm đầu tiên: mở khóa âm thanh (trình duyệt điện thoại chặn âm thanh khi chưa chạm)
        ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { document.addEventListener(ev, function unlock() {
            try { var AC = window.AudioContext || window.webkitAudioContext; if (AC) { actx = actx || new AC(); if (actx.state === 'suspended') actx.resume(); } } catch (e) {}
            document.removeEventListener(ev, unlock, true);
        }, true); });

        /* ---------- Hộp gợi ý khi gõ @ ---------- */
        var pop = null, list = [], idx = 0, rng = null, blurT = 0, swallow = false;
        function inp() { return document.getElementById('inp-chat-msg'); }
        function inGeneral() { return S().chatTarget === 'general'; }
        function close() { if (pop) { pop.remove(); pop = null; } list = []; rng = null; }
        function online(u) { var p = (S().presence || {})[u]; try { return !!(p && window.Utils && Utils.isOnline(p.lastActive, p.online)); } catch (e) { return false; } }
        function cands(q) {
            var a = info(), u0 = me(), nick = S().nicknames || {}, nq = fold(q);
            var out = Object.keys(a).filter(function (u) { return u !== u0 && !a[u].blocked; }).map(function (u) {
                var name = a[u].fullName || '', n = nick[u] || '', fu = fold(u), fn = fold(name), fk = fold(n);
                var score = !nq ? 1 : fu.indexOf(nq) === 0 ? 4 : (fn.indexOf(nq) === 0 || fk.indexOf(nq) === 0) ? 3 : fu.indexOf(nq) >= 0 ? 2 : (fn.indexOf(nq) >= 0 || fk.indexOf(nq) >= 0) ? 1.5 : 0;
                return { u: u, name: name, nick: n, on: online(u), s: score };
            }).filter(function (x) { return x.s > 0; }).sort(function (x, y) { return (y.s - x.s) || ((y.on ? 1 : 0) - (x.on ? 1 : 0)) || x.u.localeCompare(y.u, 'vi', { sensitivity: 'base' }); }).slice(0, 60);
            if (staff() && (!nq || 'all'.indexOf(nq) === 0 || 'tatca'.indexOf(nq) === 0)) out.unshift({ u: 'all', all: true });
            return out;
        }
        function hi(text, q) {
            text = String(text || ''); if (!q) return esc(text);
            var f = fold(text), i = f.indexOf(fold(q)); if (i < 0) return esc(text);
            return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
        }
        function draw(q) {
            var wrap = document.querySelector('#chat-active-ui .chat-input-wrapper'); if (!wrap) return;
            if (!pop) {
                pop = document.createElement('div'); pop.id = 'qd-at-pop'; pop.setAttribute('role', 'listbox'); pop.setAttribute('aria-label', 'Chọn người để nhắc tên');
                pop.addEventListener('pointerdown', function (e) { e.preventDefault(); });   // giữ bàn phím / con trỏ trong ô soạn tin
                pop.addEventListener('click', function (e) { var it = e.target.closest('.qd-at-it'); if (it) choose(+it.getAttribute('data-i')); });
                wrap.appendChild(pop);
            }
            var av = function (x) {
                if (x.all) return '<span class="qd-at-all">@</span>';
                var dn = x.nick || x.u, inner = window.Avatar && window.Avatar.inner ? window.Avatar.inner((S().avatars || {})[x.u], dn) : esc(dn.charAt(0).toUpperCase());
                return '<div class="avatar-circle">' + inner + (x.on ? '<span class="qd-at-dot"></span>' : '') + '</div>';
            };
            pop.innerHTML = '<div class="qd-at-h">Nhắc tên trong Kênh Chung</div>' + (list.length ? list.map(function (x, i) {
                var main = x.all ? 'Tất cả mọi người' : (x.nick || x.name || x.u), sub = x.all ? '@All · nhắc cả Kênh Chung' : '@' + x.u + (x.name && main !== x.name ? ' · ' + x.name : '') + (x.on ? ' · đang online' : '');
                return '<button type="button" class="qd-at-it' + (i === idx ? ' on' : '') + '" role="option" aria-selected="' + (i === idx) + '" data-i="' + i + '">' + av(x)
                    + '<span class="nm"><b>' + hi(main, q) + '</b><span>' + (x.all ? esc(sub) : hi(sub, q)) + '</span></span></button>';
            }).join('') : '<div class="qd-at-empty">Không có ai tên "' + esc(q) + '"</div>');
            var on = pop.querySelector('.qd-at-it.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
        }
        function detect() {
            var el = inp(); if (!el || !inGeneral() || document.activeElement !== el) return close();
            var pos = el.selectionStart; if (pos == null || pos !== el.selectionEnd) return close();
            var m = /(^|[\s(\[,;:])@([^\s@]{0,30})$/.exec(el.value.slice(0, pos)); if (!m) return close();
            var q = m[2], first = !pop || !rng || rng[0] !== pos - q.length - 1;
            rng = [pos - q.length - 1, pos]; list = cands(q); if (first) idx = 0; if (idx >= list.length) idx = Math.max(0, list.length - 1);
            draw(q);
        }
        function choose(i) {
            var x = list[i], el = inp(); if (!x || !el || !rng) return close();
            var tag = '@' + (x.all ? 'All' : x.u) + ' ', v = el.value;
            el.value = v.slice(0, rng[0]) + tag + v.slice(rng[1]).replace(/^ /, '');
            var c = rng[0] + tag.length; close(); el.focus();
            try { el.setSelectionRange(c, c); } catch (e) {}
            el.dispatchEvent(new Event('input', { bubbles: true }));   // tự giãn chiều cao ô nhập
        }
        function insertAt() {
            var el = inp(); if (!el) return;
            el.focus();
            var s = el.selectionStart == null ? el.value.length : el.selectionStart, e = el.selectionEnd == null ? s : el.selectionEnd, v = el.value;
            var add = (s > 0 && !/\s/.test(v.charAt(s - 1)) ? ' ' : '') + '@';
            el.value = v.slice(0, s) + add + v.slice(e); var c = s + add.length;
            try { el.setSelectionRange(c, c); } catch (er) {}
            detect();
        }
        function bind() {
            var el = inp(); if (!el || el.__qdAt) return; el.__qdAt = true;
            el.addEventListener('keydown', function (e) {
                if (!pop) return;
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!list.length) return; e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length; draw(el.value.slice(rng[0] + 1, rng[1])); }
                else if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { if (!list.length) return close(); e.preventDefault(); e.stopImmediatePropagation(); swallow = e.key === 'Enter'; choose(idx); }
                else if (e.key === 'Escape') { e.preventDefault(); close(); }
            }, true);
            // Enter vừa dùng để chọn tên: không để ô soạn tin hiểu nhầm là "gửi"
            el.addEventListener('keypress', function (e) { if (swallow && e.key === 'Enter') { swallow = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
            el.addEventListener('keyup', function (e) { if (e.key === 'Enter') swallow = false; });
            el.addEventListener('input', detect);
            el.addEventListener('click', detect);
            el.addEventListener('keyup', function (e) { if (/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) detect(); });
            el.addEventListener('focus', function () { clearTimeout(blurT); });
            el.addEventListener('blur', function () { blurT = setTimeout(close, 180); });
            // Nút @ cạnh nút gửi ảnh
            var imgBtn = el.parentNode && el.parentNode.querySelector('button');
            if (imgBtn && !document.getElementById('qd-at-btn')) {
                var b = document.createElement('button'); b.type = 'button'; b.id = 'qd-at-btn'; b.className = 'btn-icon qd-at-btn'; b.title = 'Nhắc tên thành viên (@)'; b.setAttribute('aria-label', 'Nhắc tên thành viên');
                b.textContent = '@'; b.addEventListener('pointerdown', function (e) { e.preventDefault(); }); b.addEventListener('click', insertAt);
                imgBtn.insertAdjacentElement('afterend', b);
            }
            sync();
        }
        function sync() {
            var el = inp(), b = document.getElementById('qd-at-btn'), g = inGeneral();
            if (b) b.style.display = g ? '' : 'none';
            if (el) el.placeholder = g ? (window.innerWidth < 480 ? 'Gõ @ để nhắc tên…' : 'Soạn tin nhắn… gõ @ để nhắc tên') : 'Soạn tin nhắn...';
            if (!g) close();
        }

        /* ---------- Bấm vào tên được nhắc -> mở trò chuyện riêng ---------- */
        function openMention(t) {
            var u = t.getAttribute('data-u');
            if (u === 'all') return;
            if (u === me()) { try { Utils.toast('Đây là bạn đó 😄', 'info'); } catch (e) {} return; }
            if (!info()[u]) { try { Utils.toast('Tài khoản @' + u + ' không còn trên hệ thống.', 'warning'); } catch (e) {} return; }
            if (window.Chat && window.Chat.selectTarget) window.Chat.selectTarget(u);
        }
        document.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('#chat-history-ui .qd-mention'); if (t) openMention(t); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('qd-mention')) openMention(e.target); });

        /* ---------- Theo dõi đổi phòng chat ---------- */
        function hook() {
            if (!window.Chat || window.Chat.__qdAt) return !!(window.Chat && window.Chat.__qdAt);
            var sel = window.Chat.selectTarget, tog = window.Chat.toggleMobile;
            window.Chat.selectTarget = function () { var r = sel.apply(this, arguments); bind(); sync(); return r; };
            window.Chat.toggleMobile = function () { var r = tog.apply(this, arguments); sync(); return r; };
            window.Chat.__qdAt = true; bind(); return true;
        }
        if (!hook()) { var n = 0, w = setInterval(function () { if (hook() || ++n > 40) clearInterval(w); }, 250); }

        /* ---------- Bot báo cáo: máy thành viên KHÔNG gửi (máy chủ bot-server.gs tự gửi đúng giờ) ---------- */

        return { html: html, forMe: forMe, sender: sender, extract: extract, senderHtml: senderHtml, insertAt: insertAt, sync: sync, close: close, ding: ding };
    })();
    
