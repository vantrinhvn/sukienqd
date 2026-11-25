    /* ===== ADMIN: hộp thoại đẹp (qdAsk) + nút menu nổi "Truy cập nhanh" + ngăn "Tài khoản bị khóa" =====
       qdAsk({ title, text | html, ok, cancel, tone: danger|success|warn|info, icon }) -> Promise<true|false>
       qdOk(text, again, opt): dùng thay "if (!confirm(..)) return;" -> hiện hộp thoại, đồng ý thì chạy lại again() và lần đó cho qua. */
    (function () {
        var d = document, $ = function (id) { return d.getElementById(id); };
        var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var ICON = { danger: '⚠️', success: '🔓', warn: '⚠️', info: '❔' };
        window.qdAsk = function (o) {
            if (typeof o === 'string') o = { text: o };
            o = o || {}; var tone = o.tone || 'danger';
            return new Promise(function (res) {
                var prev = d.activeElement, ov = d.createElement('div'); ov.className = 'qa-ov';
                ov.innerHTML = '<div class="qa-box" role="alertdialog" aria-modal="true" data-tone="' + E(tone) + '"><div class="qa-ic">' + (o.icon || ICON[tone] || '⚠️') + '</div>' +
                    '<h3>' + E(o.title || 'Xác nhận') + '</h3><div class="qa-msg">' + (o.html != null ? o.html : E(o.text || '')) + '</div>' +
                    '<div class="qa-btns"><button type="button" class="no">' + E(o.cancel || 'Hủy') + '</button><button type="button" class="ok">' + E(o.ok || 'Đồng ý') + '</button></div></div>';
                function done(v) { d.removeEventListener('keydown', key, true); ov.remove(); try { prev && prev.focus && prev.focus(); } catch (e) {} res(v); }
                function key(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); } }
                ov.addEventListener('click', function (e) { if (e.target === ov) done(false); });
                ov.querySelector('.no').onclick = function () { done(false); }; ov.querySelector('.ok').onclick = function () { done(true); };
                d.addEventListener('keydown', key, true); d.body.appendChild(ov); ov.querySelector('.ok').focus();
            });
        };
        window.qdOk = function (text, again, opt) {
            if (qdOk.pass) { qdOk.pass = false; return true; }
            var t = window.event && window.event.target && window.event.target.closest ? window.event.target.closest('button, a, [onclick]') : null;
            again = again || (t ? function () { t.click(); } : null);
            var o = Object.assign({ text: text }, opt || {});
            qdAsk(o).then(function (y) { if (y && again) { qdOk.pass = true; try { again(); } finally { qdOk.pass = false; } } });
            return false;
        };
        // Avatar 2 người: "A đang chặn B"
        window.qdPair = function (a, an, b, bn, mid) {
            function who(u, n) { return '<div class="qa-who"><div class="qa-av">' + E((n || u || '?').trim().charAt(0).toUpperCase()) + '</div><b>' + E(n || '@' + u) + '</b>' + (n ? '<small>@' + E(u) + '</small>' : '') + '</div>'; }
            return '<div class="qa-pair">' + who(a, an) + '<div class="qa-arr"><i class="fa-solid fa-ban"></i>' + E(mid || 'đang chặn') + '</div>' + who(b, bn) + '</div>';
        };

        /* ---------- Mở khóa gọi (gỡ hết: tài khoản + mọi cảnh báo còn hạn khóa, kể cả của bot) ---------- */
        window.qdUnbanCalls = function (user, by) {
            var fs = firebase.firestore(), now = Date.now();
            return Promise.all([
                fs.collection('accounts').where('user', '==', user).limit(1).get().then(function (q) { if (!q.empty) return q.docs[0].ref.update({ callBanUntil: 0 }); }),
                fs.collection('call_warnings').where('user', '==', user).get().then(function (q) { var ps = []; q.forEach(function (x) { if ((+x.data().banUntil || 0) > now) ps.push(x.ref.update({ banUntil: now, unbannedBy: by || 'admin', unbannedAt: now })); }); return Promise.all(ps); })
            ]);
        };

        /* ---------- Dữ liệu sống cho menu ---------- */
        var fs, started = false, LOCK = [], CBAN = [], N = { blocks: 0, reports: 0 }, REG = null, CFG = {}, NAMES = {};
        function me() { try { return State.currentUser || 'admin'; } catch (e) { return 'admin'; } }
        function toast(m, t) { try { Utils.toast(m, t || 'info'); } catch (e) {} }
        function fmt(t) { if (!t) return '—'; var x = new Date(t); return ('0' + x.getHours()).slice(-2) + ':' + ('0' + x.getMinutes()).slice(-2) + ' ' + x.getDate() + '/' + (x.getMonth() + 1); }
        function ago(t) { if (!t) return 'chưa rõ'; var m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'vừa xong' : m < 60 ? m + ' phút trước' : m < 1440 ? Math.round(m / 60) + ' giờ trước' : Math.round(m / 1440) + ' ngày trước'; }
        function kind(a) {   // lý do khóa
            if (a.lockReason === 'security') return 'sec';
            if (a.lockReason === 'manual') return 'man';
            if (a.lockReason === 'idle') return 'idle';
            var inact = (CFG.inactivityMinutes !== undefined ? +CFG.inactivityMinutes : 1440) * 60000, temp = (+CFG.tempUnlockMinutes || 0) * 60000, ref = Math.max(+a.lastActive || 0, +a.created_at || 0, +a.unlockedAt || 0);
            if (a.lockedAt && ((inact > 0 && a.lockedAt - ref >= inact - 120000) || (temp > 0 && a.unlockedAt && a.lockedAt - a.unlockedAt >= temp - 120000))) return 'idle';
            return 'man';
        }
        var KL = { idle: ['idle', '⏰ Quá giờ không hoạt động'], sec: ['sec', '🛡️ Nghi gian lận'], man: ['man', '✋ Admin khóa tay'] };
        function start() {
            if (started || !window.firebase || !firebase.apps || !firebase.apps.length) return; started = true; fs = firebase.firestore();
            fs.collection('settings').doc('account_config').onSnapshot(function (x) { CFG = x.exists ? x.data() : {}; paint(); }, function () {});
            fs.collection('accounts').where('isBlocked', '==', true).onSnapshot(function (q) { LOCK = []; q.forEach(function (x) { var a = x.data(); a.docId = x.id; LOCK.push(a); }); paint(); }, function () {});
            fs.collection('accounts').where('callBanUntil', '>', Date.now()).onSnapshot(function (q) { CBAN = []; q.forEach(function (x) { var a = x.data(); a.docId = x.id; if (a.callBanUntil > Date.now()) CBAN.push(a); }); paint(); }, function () {});
            fs.collection('call_blocks').onSnapshot(function (q) { N.blocks = q.size; paint(); }, function () {});
            fs.collection('call_reports').where('status', '==', 'new').onSnapshot(function (q) { N.reports = q.size; paint(); }, function () {});
            fs.collection('settings').doc('registration_config').onSnapshot(function (x) { REG = x.exists ? x.data() : {}; paint(); }, function () {});
        }
        function regText() {
            if (!REG) return 'Đang tải…'; if (REG.isEnabled === false) return '🔴 Đang đóng';
            if (REG.endDate && REG.endTime) { var t = new Date(REG.endDate + 'T' + REG.endTime).getTime(); if (t && t < Date.now()) return '🔴 Đã quá hạn ' + fmt(t); if (t) return '🟢 Mở · đóng lúc ' + fmt(t); }
            return '🟢 Đang mở · chưa hẹn giờ đóng';
        }
        function allowed(v) { var n = d.querySelector('.nav-item[onclick*="\'' + v + '\'"]'); return !!n && n.style.display !== 'none'; }
        function tiles() {
            var idle = LOCK.filter(function (a) { return kind(a) === 'idle'; }).length, req = LOCK.filter(function (a) { return a.unlockRequestedAt; }).length;
            var pend = +(($('pending-count') || {}).textContent || 0) || 0;
            return [
                { k: 'locked', v: 'accounts', e: '🔒', t: 'Tài khoản bị khóa', s: LOCK.length ? idle + ' quá giờ' + (req ? ' · ' + req + ' xin mở' : '') : 'Không có ai bị khóa', n: LOCK.length, tone: '#f59e0b', act: function () { openDrawer(idle ? 'idle' : 'all'); } },
                (function () { var c = $('rga-count'), n = c && c.style.display !== 'none' ? +c.textContent || 0 : 0; return { k: 'regid', v: 'registration', e: '🆔', t: 'Duyệt ID game', s: n ? n + ' đơn chờ duyệt' : 'Không có đơn chờ', n: n, tone: '#eab308', act: function () { go('registration', 'rga-tabs'); } }; })(),
                { k: 'reg', v: 'registration', e: '⏰', t: 'Thời gian đăng ký', s: regText(), tone: '#eab308', act: function () { go('registration', 'cfg-reg-toggle'); } },
                { k: 'blocks', v: 'calls', e: '🚫', t: 'Thành viên chặn nhau', s: N.blocks ? N.blocks + ' lượt chặn' : 'Không ai chặn ai', n: N.blocks, tone: '#ef4444', act: function () { go('calls', 'qbl-card'); } },
                { k: 'cban', v: 'calls', e: '📵', t: 'Đang bị khóa gọi', s: CBAN.length ? CBAN.length + ' thành viên' : 'Không có', n: CBAN.length, tone: '#a855f7', act: function () { openDrawer('call'); } },
                { k: 'reports', v: 'calls', e: '🚩', t: 'Báo cáo khi gọi', s: N.reports ? N.reports + ' chờ xử lý' : 'Không có báo cáo mới', n: N.reports, tone: '#ef4444', act: function () { go('calls', 'qrp-card'); } },
                { k: 'pend', v: 'approvals', e: '🧾', t: 'Phê duyệt tài khoản', s: pend ? pend + ' chờ duyệt' : 'Không có đơn chờ', n: pend, tone: '#6366f1', act: function () { go('approvals'); } },
                { k: 'idlecfg', v: 'accounts', e: '⏱️', t: 'Tự khóa khi không hoạt động', s: (CFG.inactivityMinutes !== undefined ? +CFG.inactivityMinutes : 1440) ? 'Sau ' + hrs(CFG.inactivityMinutes !== undefined ? +CFG.inactivityMinutes : 1440) + ' không vào' : 'Đang tắt', tone: '#38bdf8', act: function () { go('accounts', 'cfg-acc-inactivity'); } },
                window.QD_BACKEND === 'vps' ? { k: 'vps', v: 'vps', e: '🖥️', t: 'Máy chủ VPS', s: window.__vpsBrief || 'CPU · RAM · ổ đĩa · sao lưu', tone: '#06b6d4', act: function () { go('vps'); } } : null,
                { k: 'bot', v: 'calls', e: '🤖', t: 'Bot kiểm soát cuộc gọi', s: 'Ngưỡng & nhật ký bot', tone: '#38bdf8', act: function () { go('calls', 'qgd-card'); } }
            ].filter(function (x) { return x && allowed(x.v); });
        }
        function hrs(m) { m = +m || 0; return m >= 1440 && m % 1440 === 0 ? (m / 1440) + ' ngày' : m >= 60 ? Math.round(m / 6) / 10 + ' giờ' : m + ' phút'; }
        var TT = [];
        function paint() {
            if (!$('qk-fab')) return;
            var urgent = N.reports + LOCK.filter(function (a) { return a.unlockRequestedAt; }).length, dot = $('qk-fab').querySelector('.qk-dot');
            dot.hidden = !urgent; dot.textContent = urgent > 99 ? '99+' : urgent;
            if (!$('qk-menu').hidden) renderMenu();
            if (!$('qk-drw').hidden) renderDrawer();
        }
        function renderMenu() {
            var q = String($('qk-q').value || '').trim().toLowerCase(); TT = tiles();
            var T = TT.filter(function (x) { return !q || (x.t + ' ' + x.s).toLowerCase().indexOf(q) >= 0; });
            $('qk-tiles').innerHTML = T.map(function (x, i) { return '<button type="button" class="qk-t" data-i="' + TT.indexOf(x) + '" style="--tone:' + x.tone + '"><span class="e">' + x.e + '</span><b>' + E(x.t) + '</b><small>' + E(x.s) + '</small>' + (x.n != null ? '<span class="n' + (x.n ? '' : ' z') + '">' + x.n + '</span>' : '') + '</button>'; }).join('');
            var navs = Array.prototype.filter.call(d.querySelectorAll('.sidebar .nav-item[onclick]'), function (n) { return n.style.display !== 'none' && (!q || n.textContent.toLowerCase().indexOf(q) >= 0); });
            $('qk-allh').hidden = !navs.length;
            $('qk-all').innerHTML = navs.map(function (n) { var m = /navigate\('([\w-]+)'/.exec(n.getAttribute('onclick')) || []; var ic = n.querySelector('i'); return '<button type="button" data-v="' + E(m[1] || '') + '"><i class="' + E(ic ? ic.className : 'fa-solid fa-angle-right') + '"></i>' + E((n.querySelector('span') || n).textContent.trim()) + '</button>'; }).join('');
        }
        function menu(open) {
            var m = $('qk-menu'), f = $('qk-fab'); open = open == null ? m.hidden : open; m.hidden = !open; f.classList.toggle('open', open);
            if (open) { start(); $('qk-q').value = ''; renderMenu(); setTimeout(function () { if (window.matchMedia('(pointer:fine)').matches) $('qk-q').focus(); }, 30); }
        }
        function go(view, id) {
            menu(false);
            try { var nav = d.querySelector('.nav-item[onclick*="\'' + view + '\'"]'); UI.navigate(view, nav); } catch (e) {}
            if (!id) return;
            setTimeout(function () {
                var el = $(id); if (!el) return; var card = el.closest('.card') || el;
                card.scrollIntoView({ behavior: 'smooth', block: 'start' }); card.classList.remove('qk-flash'); void card.offsetWidth; card.classList.add('qk-flash');
                setTimeout(function () { card.classList.remove('qk-flash'); }, 1800);
            }, 350);
        }

        /* ---------- Ngăn "Tài khoản bị khóa" ---------- */
        var TAB = 'all';
        function rows() {
            if (TAB === 'call') return CBAN.slice().sort(function (a, b) { return b.callBanUntil - a.callBanUntil; });
            return LOCK.filter(function (a) { return TAB === 'all' || (TAB === 'req' ? a.unlockRequestedAt : kind(a) === TAB); })
                .sort(function (a, b) { return (b.unlockRequestedAt ? 1 : 0) - (a.unlockRequestedAt ? 1 : 0) || (b.lockedAt || 0) - (a.lockedAt || 0); });
        }
        function renderDrawer() {
            var c = { all: LOCK.length, idle: 0, req: 0, sec: 0, man: 0, call: CBAN.length };
            LOCK.forEach(function (a) { c[kind(a)]++; if (a.unlockRequestedAt) c.req++; });
            $('qk-tabs').innerHTML = [['all', 'Tất cả'], ['idle', '⏰ Quá giờ'], ['req', '🙋 Xin mở'], ['sec', '🛡️ Gian lận'], ['man', '✋ Khóa tay'], ['call', '📵 Khóa gọi']].map(function (t) { return '<button type="button" data-t="' + t[0] + '" class="' + (TAB === t[0] ? 'on' : '') + '">' + t[1] + ' · ' + c[t[0]] + '</button>'; }).join('');
            var q = String($('qk-s').value || '').trim().toLowerCase(), L = rows().filter(function (a) { return !q || ((a.user || '') + ' ' + (a.fullName || '')).toLowerCase().indexOf(q) >= 0; });
            var bulkN = TAB === 'call' ? L.length : L.filter(function (a) { return kind(a) !== 'sec'; }).length, b = $('qk-bulk');
            b.disabled = !bulkN; b.textContent = TAB === 'call' ? '📵 Mở khóa gọi tất cả (' + bulkN + ')' : TAB === 'idle' ? '🔓 Mở tất cả TK quá giờ (' + bulkN + ')' : '🔓 Mở tất cả (' + bulkN + ')';
            b.title = TAB === 'call' || TAB === 'sec' ? '' : 'Không mở các tài khoản nghi gian lận';
            if (TAB === 'sec') { b.disabled = true; b.textContent = 'Mở từng tài khoản'; }
            $('qk-list').innerHTML = L.length ? L.map(function (a) {
                var nm = a.fullName || a.name || '', chips;
                if (TAB === 'call') chips = '<span class="qk-chip call">📵 Khóa gọi đến ' + fmt(a.callBanUntil) + '</span>';
                else { var k = KL[kind(a)]; chips = '<span class="qk-chip ' + k[0] + '">' + k[1] + '</span>' + (a.unlockRequestedAt ? '<span class="qk-chip req">🙋 Xin mở ' + ago(a.unlockRequestedAt) + '</span>' : '') + (a.lockNote ? '<span class="qk-chip sec">' + E(String(a.lockNote).slice(0, 60)) + '</span>' : ''); }
                return '<div class="qk-row"><div class="av">' + E((nm || a.user || '?').charAt(0).toUpperCase()) + '</div><div class="mid"><b>' + E(nm || '@' + a.user) + '</b><small>@' + E(a.user) + (TAB === 'call' ? '' : ' · khóa ' + ago(a.lockedAt) + ' · vào lần cuối ' + ago(a.lastActive)) + '</small>' + chips + '</div>' +
                    '<button type="button" class="go" data-id="' + E(a.docId) + '">' + (TAB === 'call' ? '📵 Mở gọi' : '🔓 Mở khóa') + '</button></div>';
            }).join('') : '<div class="qk-empty">' + (q ? 'Không tìm thấy.' : TAB === 'call' ? 'Không ai đang bị khóa gọi 👍' : 'Không có tài khoản nào ở mục này 👍') + '</div>';
        }
        function openDrawer(tab) { menu(false); start(); TAB = tab || 'all'; $('qk-s').value = ''; $('qk-drw').hidden = false; renderDrawer(); }
        function unlockAcc(a) {
            return fs.collection('accounts').doc(a.docId).update({ isBlocked: false, unlockedAt: Date.now(), lockedAt: null, unlockRequestedAt: null, lockReason: null, lockNote: null })
                .then(function () { fs.collection('admin_logs').add({ type: 'lock', action: 'unlock', user: a.user, reason: kind(a), by: me(), timestamp: Date.now() }).catch(function () {}); });
        }
        function one(id) {
            var call = TAB === 'call', a = (call ? CBAN : LOCK).filter(function (x) { return x.docId === id; })[0]; if (!a) return;
            var nm = a.fullName || a.name || '', sec = !call && kind(a) === 'sec';
            qdAsk(call ? { title: 'Mở khóa gọi?', tone: 'success', icon: '📵', ok: 'Mở khóa gọi', html: '<b>' + E(nm || '@' + a.user) + '</b> (@' + E(a.user) + ') đang bị khóa gọi đến <b>' + fmt(a.callBanUntil) + '</b>.\nMở khóa thì gọi thoại / video được ngay.' }
                : { title: sec ? 'Mở tài khoản nghi gian lận?' : 'Mở khóa tài khoản?', tone: sec ? 'warn' : 'success', icon: sec ? '🛡️' : '🔓', ok: 'Mở khóa',
                    html: '<b>' + E(nm || '@' + a.user) + '</b> (@' + E(a.user) + ')\n' + KL[kind(a)][1] + ' · khóa ' + ago(a.lockedAt) + (sec ? '\n\nTài khoản này bị khóa vì nghi gian lận' + (a.lockNote ? ': “' + E(a.lockNote) + '”' : '') + '. Bạn chắc chắn đã kiểm tra?' : '\nThành viên đăng nhập lại được ngay.') })
                .then(function (y) {
                    if (!y) return;
                    (call ? qdUnbanCalls(a.user, me()) : unlockAcc(a)).then(function () { toast((call ? 'Đã mở khóa gọi cho @' : 'Đã mở khóa @') + a.user, 'success'); }).catch(function (e) { toast('Không mở được: ' + (e && e.code || e), 'error'); });
                });
        }
        function bulk() {
            var call = TAB === 'call', q = String($('qk-s').value || '').trim().toLowerCase();
            var L = rows().filter(function (a) { return (!q || ((a.user || '') + ' ' + (a.fullName || '')).toLowerCase().indexOf(q) >= 0) && (call || kind(a) !== 'sec'); });
            if (!L.length) return;
            qdAsk({ title: call ? 'Mở khóa gọi cho ' + L.length + ' người?' : 'Mở khóa ' + L.length + ' tài khoản?', tone: 'success', icon: '🔓', ok: 'Mở tất cả',
                html: L.slice(0, 6).map(function (a) { return '<b>' + E(a.fullName || '@' + a.user) + '</b>'; }).join(', ') + (L.length > 6 ? ' và ' + (L.length - 6) + ' người khác' : '') + '.' + (call ? '' : '\n\nKhông gồm tài khoản nghi gian lận.') })
                .then(function (y) {
                    if (!y) return; var b = $('qk-bulk'); b.disabled = true;
                    Promise.all(L.map(function (a) { return (call ? qdUnbanCalls(a.user, me()) : unlockAcc(a)).then(function () { return 1; }, function () { return 0; }); }))
                        .then(function (r) { var ok = r.reduce(function (s, x) { return s + x; }, 0); toast('Đã mở ' + ok + '/' + L.length + (call ? ' khóa gọi' : ' tài khoản'), ok === L.length ? 'success' : 'warning'); });
                });
        }

        /* ---------- Gắn sự kiện ---------- */
        function shown() { var s = $('app-shell'); return !!s && s.style.display !== 'none' && getComputedStyle(s).display !== 'none'; }
        setInterval(function () { var on = shown(); d.body.classList.toggle('qk-on', on); if (on) start(); else { $('qk-menu').hidden = true; } }, 1000);
        $('qk-fab').addEventListener('click', function (e) { e.stopPropagation(); menu(); });
        $('qk-q').addEventListener('input', renderMenu);
        $('qk-tiles').addEventListener('click', function (e) { var t = e.target.closest('.qk-t'); if (t && TT[+t.dataset.i]) TT[+t.dataset.i].act(); });
        $('qk-all').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && b.dataset.v) go(b.dataset.v); });
        d.addEventListener('click', function (e) { if (!$('qk-menu').hidden && !e.target.closest('#qk-menu, #qk-fab, .qa-ov')) menu(false); });
        d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (!$('qk-drw').hidden && !d.querySelector('.qa-ov')) $('qk-drw').hidden = true; else if (!$('qk-menu').hidden) menu(false); } });
        $('qk-x').addEventListener('click', function () { $('qk-drw').hidden = true; });
        $('qk-drw').addEventListener('click', function (e) { if (e.target.id === 'qk-drw') $('qk-drw').hidden = true; });
        $('qk-tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { TAB = b.dataset.t; renderDrawer(); } });
        $('qk-s').addEventListener('input', renderDrawer);
        $('qk-list').addEventListener('click', function (e) { var b = e.target.closest('.go'); if (b) one(b.dataset.id); });
        $('qk-bulk').addEventListener('click', bulk);
        window.QDQuick = { open: function () { menu(true); }, locked: openDrawer, go: go };
    })();
    
