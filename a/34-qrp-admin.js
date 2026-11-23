    /* ===== Admin > Cuộc gọi > Báo cáo vi phạm (call_reports) + Lịch sử cảnh báo / khóa gọi (call_warnings) ===== */
    window.QDCallReports = (function () {
        var $ = function (id) { return document.getElementById(id); }, H = window.qdH, booted = false, REP = [], WRN = [], F = 'new';
        function fs() { return firebase.firestore(); }
        function me() { try { return State.currentUser || 'admin'; } catch (e) { return 'admin'; } }
        function fmt(t) { var d = new Date(t || 0); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ' ' + d.getDate() + '/' + (d.getMonth() + 1); }
        function toast(m, t) { try { Utils.toast(m, t || 'info'); } catch (e) {} }
        var ST = { 'new': ['Chưa xử lý', '#ef4444'], warned: ['Đã cảnh báo', '#f59e0b'], banned: ['Đã khóa gọi', '#a855f7'], dismissed: ['Bỏ qua', '#94a3b8'] };
        function render() {
            var cnt = {}; REP.forEach(function (r) { cnt[r.reported] = (cnt[r.reported] || 0) + 1; });
            var nNew = REP.filter(function (r) { return r.status === 'new'; }).length, nb = $('qrp-new'); nb.hidden = !nNew; nb.textContent = nNew + ' mới';
            var top = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 3).map(function (u) { return H(u) + ' (' + cnt[u] + ')'; }).join(', ');
            $('qrp-stats').innerHTML = '<span>Chưa xử lý: <b>' + nNew + '</b></span><span>Tổng báo cáo: <b>' + REP.length + '</b></span>' + (top ? '<span>Bị báo cáo nhiều nhất: <b>' + top + '</b></span>' : '');
            var L = REP.filter(function (r) { return !F || (F === 'new' ? r.status === 'new' : r.status !== 'new'); });
            $('qrp-list').innerHTML = L.length ? L.slice(0, 300).map(function (r) {
                var st = ST[r.status] || [r.status, '#94a3b8'], id = qdJ(r.id);
                return '<tr><td style="white-space:nowrap">' + fmt(r.at) + '<small class="text-muted" style="display:block">' + (r.type === 'video' ? '🎥 video' : '📞 thoại') + (r.dur ? ' · ' + Math.round(r.dur / 60) + ' phút' : '') + '</small></td>' +
                    '<td class="vsh-who"><b>' + H(r.reporterName || r.reporter) + '</b> → <b style="color:#ef4444">' + H(r.reportedName || r.reported) + '</b><small>@' + H(r.reporter) + ' → @' + H(r.reported) + ' · bị báo cáo ' + (cnt[r.reported] || 1) + ' lần' + (r.blocked ? ' · đã chặn' : '') + '</small></td>' +
                    '<td><span class="qrp-chip">' + H(r.reasonLabel || r.reason) + '</span>' + (r.note ? '<div class="text-sm" style="margin-top:4px;max-width:260px">“' + H(r.note) + '”</div>' : '') + '</td>' +
                    '<td>' + (/^data:image\/jpeg;base64,/.test(r.snap || '') ? '<img class="qrp-thumb" src="' + H(r.snap) + '" onclick="QDCallReports.big(this.src)">' : '<span class="text-muted">—</span>') + '</td>' +
                    '<td style="white-space:nowrap"><b style="color:' + st[1] + '">' + st[0] + '</b>' + (r.handledBy ? '<small class="text-muted" style="display:block">' + H(r.handledBy) + ' · ' + fmt(r.handledAt) + '</small>' : '') + (r.bot ? '<span class="qgd-k" style="margin-top:4px">🤖 Bot đã ' + H(r.bot) + '</span>' : '') + '</td>' +
                    '<td><div class="qrp-acts">' + (r.status === 'new' ? '<button class="w" onclick="QDCallReports.act(\'' + id + '\',\'warn\')">⚠ Cảnh báo</button><button class="b" onclick="QDCallReports.act(\'' + id + '\',\'ban\',1)">🔒 Khóa 1 ngày</button><button class="b" onclick="QDCallReports.act(\'' + id + '\',\'ban\',7)">🔒 7 ngày</button><button onclick="QDCallReports.act(\'' + id + '\',\'dismiss\')">Bỏ qua</button>' : '<span class="text-muted text-sm">' + H(r.action || '') + '</span>') + '</div></td></tr>';
            }).join('') : '<tr><td colspan="6" class="text-muted">' + (F === 'new' ? 'Không có báo cáo nào chờ xử lý 👍' : 'Chưa có báo cáo.') + '</td></tr>';
            $('qwn-list').innerHTML = WRN.length ? WRN.slice(0, 300).map(function (w) {
                var act = w.banUntil && w.banUntil > Date.now();
                return '<tr><td style="white-space:nowrap">' + fmt(w.at) + '</td><td><b>' + H(w.name || w.user) + '</b><small class="text-muted" style="display:block">@' + H(w.user) + '</small></td><td><span class="qrp-chip">' + H(w.label || w.reason || '') + '</span></td>' +
                    '<td style="white-space:nowrap">' + (w.banUntil ? (act ? '<b style="color:#a855f7">' + fmt(w.banUntil) + '</b>' : '<span class="text-muted">' + fmt(w.banUntil) + ' (hết)</span>') : '<span class="text-muted">Chỉ cảnh báo</span>') + '</td>' +
                    '<td>' + (w.seen ? '<span style="color:#22c55e">✓ ' + fmt(w.seen) + '</span>' : '<span class="text-muted">Chưa</span>') + '</td><td>' + H(w.by || '') + '</td>' +
                    '<td>' + (act ? '<div class="qrp-acts"><button onclick="QDCallReports.unban(\'' + qdJ(w.user) + '\',\'' + qdJ(w.id) + '\')">Mở khóa</button></div>' : '') + '</td></tr>';
            }).join('') : '<tr><td colspan="7" class="text-muted">Chưa gửi cảnh báo nào.</td></tr>';
        }
        var GD0 = { on: true, winDays: 30, warnAt: 1, ban1At: 2, ban7At: 3, missMax: 3, missMin: 30, spamWarn: 3, spamBanH: 3, rateMax: 8, rateMin: 10, loud: true }, NUM = ['winDays', 'warnAt', 'ban1At', 'ban7At', 'missMax', 'missMin', 'spamWarn', 'spamBanH', 'rateMax', 'rateMin'];
        var KIND = { pardon: '🛡️ Admin gỡ chặn', exempt: '🛡️ Miễn bot', unexempt: '↩️ Bỏ miễn bot', unblock: '🔓 Gỡ chặn', report: '🚩 Báo cáo', spam: '📵 Gọi dồn dập', 'spam-ban': '📵 Làm phiền nhiều lần', rate: '⏱️ Gọi quá nhiều', loud: '🔊 La hét to' };
        var BL = [], NAMES = {};
        var RS = { harass: '😠 Quấy rối', violence: '👊 Bạo lực', threat: '🔪 Đe dọa', sexual: '🔞 Khiêu dâm / nhạy cảm', abuse: '🤬 Xúc phạm, lăng mạ', other: '❓ Khác' };
        function nm(u) { return NAMES[u] ? '<b>' + H(NAMES[u]) + '</b><small>@' + H(u) + '</small>' : '<b>@' + H(u) + '</b>'; }
        function renderBlocks() {
            var q = String($('qbl-q').value || '').trim().toLowerCase(), by = {};
            BL.forEach(function (b) { by[b.blocked] = (by[b.blocked] || 0) + 1; });
            var top = Object.keys(by).filter(function (u) { return by[u] > 1; }).sort(function (a, b) { return by[b] - by[a]; }).slice(0, 5);
            $('qbl-stats').innerHTML = '<span>Đang chặn: <b>' + BL.length + '</b></span>' + (top.length ? '<span>Bị nhiều người chặn: <b>' + top.map(function (u) { return '@' + H(u) + ' (' + by[u] + ')'; }).join(', ') + '</b></span>' : '');
            var L = BL.filter(function (b) { return !q || [b.by, b.blocked, NAMES[b.by], NAMES[b.blocked]].join(' ').toLowerCase().indexOf(q) >= 0; });
            $('qbl-list').innerHTML = L.length ? L.map(function (b) {
                return '<tr><td style="white-space:nowrap">' + fmt(b.at) + '</td><td class="vsh-who">' + nm(b.by) + '</td><td class="vsh-who">' + nm(b.blocked) + (by[b.blocked] > 1 ? '<small style="color:#ef4444">bị ' + by[b.blocked] + ' người chặn</small>' : '') + '</td>' +
                    '<td>' + (b.reason ? '<span class="qrp-chip">' + H(RS[b.reason] || b.reason) + '</span>' : '<span class="text-muted">—</span>') + '</td>' +
                    '<td><div class="qrp-acts"><button onclick="QDCallReports.unblock(\'' + qdJ(b.id) + '\')">🔓 Gỡ chặn</button></div></td></tr>';
            }).join('') : '<tr><td colspan="5" class="text-muted">' + (q ? 'Không tìm thấy.' : 'Chưa có ai chặn ai 👍') + '</td></tr>';
        }
        function bootBlocks() {
            fs().collection('accounts').get().then(function (q) { q.forEach(function (d) { var x = d.data(); if (x.user) NAMES[x.user] = x.fullName || x.displayName || ''; }); renderBlocks(); }).catch(function () {});
            fs().collection('call_blocks').onSnapshot(function (q) { BL = []; q.forEach(function (d) { var x = d.data(); x.id = d.id; if (x.by && x.blocked) BL.push(x); }); BL.sort(function (a, b) { return (b.at || 0) - (a.at || 0); }); renderBlocks(); }, function (e) { $('qbl-list').innerHTML = '<tr><td colspan="5" style="color:#ef4444">Không đọc được (' + H(e && e.code || '') + ')</td></tr>'; });
            $('qbl-q').addEventListener('input', renderBlocks);
        }
        function unblock(id) {
            var b = BL.filter(function (x) { return x.id === id; })[0]; if (!b) return;
            qdAsk({ title: 'Gỡ chặn cuộc gọi?', tone: 'success', icon: '🔓', ok: 'Gỡ chặn', html: qdPair(b.by, NAMES[b.by], b.blocked, NAMES[b.blocked]) + 'Sau khi gỡ, <b>' + H(NAMES[b.blocked] || '@' + b.blocked) + '</b> gọi được cho <b>' + H(NAMES[b.by] || '@' + b.by) + '</b> trở lại.' + (b.reason ? '\nLý do chặn: ' + H(RS[b.reason] || b.reason) : '') }).then(function (y) { if (y) doUnblock(b); });
        }
        function doUnblock(b) { var id = b.id;
            fs().collection('call_blocks').doc(id).delete().then(function () {
                fs().collection('call_bot_log').add({ kind: 'unblock', user: b.blocked, target: b.by, action: 'Admin gỡ chặn (' + me() + ')', detail: '@' + b.by + ' đã chặn từ ' + fmt(b.at) + (b.reason ? ' · ' + (RS[b.reason] || b.reason) : ''), at: Date.now(), by: me() }).catch(function () {});
                toast('Đã gỡ chặn — @' + b.blocked + ' gọi được cho @' + b.by, 'success');
            }).catch(function (e) { toast('Không gỡ được: ' + (e && e.code || e), 'error'); });
        }
        function bootGuard() {
            var dirty = false; $('qgd-card').addEventListener('input', function () { dirty = true; });
            fs().collection('settings').doc('call_guard').onSnapshot(function (d) {
                var c = Object.assign({}, GD0, d.exists ? d.data() : {}); GDC = c; renderHit();
                $('qgd-on').checked = c.on !== false; $('qgd-on').nextElementSibling.textContent = c.on !== false ? 'Bot đang bật' : 'Bot đang tắt';
                if (dirty) return; $('qgd-loud').checked = c.loud !== false;
                NUM.forEach(function (k) { var el = $('qgd-' + k); if (el) el.value = c[k]; });
            }, function () {});
            $('qgd-save').addEventListener('click', function () {
                var o = { on: $('qgd-on').checked, loud: $('qgd-loud').checked, updatedAt: Date.now(), updatedBy: me() };
                NUM.forEach(function (k) { o[k] = Math.max(0, Math.round(+$('qgd-' + k).value || 0)); });
                if (o.winDays < 1) o.winDays = 1; if (o.missMin < 5) o.missMin = 5; if (o.rateMin < 1) o.rateMin = 1;
                fs().collection('settings').doc('call_guard').set(o, { merge: true }).then(function () { dirty = false; $('qgd-st').textContent = '✓ Đã lưu — áp dụng ngay cho mọi thành viên.'; toast('Đã lưu cài đặt bot', 'success'); }).catch(function (e) { $('qgd-st').textContent = 'Lỗi: ' + (e && e.code || e); });
            });
            $('qgd-on').addEventListener('change', function () { $('qgd-save').click(); });
            fs().collection('call_bot_log').orderBy('at', 'desc').limit(300).onSnapshot(function (q) {
                var L = []; q.forEach(function (d) { L.push(d.data()); }); L.sort(function (a, b) { return (b.at || 0) - (a.at || 0); }); LOG = L; renderHit();
                var day = Date.now() - 864e5, c = {}; L.forEach(function (o) { if ((o.at || 0) > day) c[o.kind] = (c[o.kind] || 0) + 1; });
                $('qgd-stats').innerHTML = '<span>24 giờ qua:</span>' + (Object.keys(c).length ? Object.keys(c).map(function (k) { return '<span>' + (KIND[k] || H(k)) + ': <b>' + c[k] + '</b></span>'; }).join('') : '<span><b>yên bình 👍</b></span>');
                $('qgd-log').innerHTML = L.length ? L.slice(0, 200).map(function (o) {
                    return '<tr><td style="white-space:nowrap">' + fmt(o.at) + '</td><td><span class="qgd-k">' + (KIND[o.kind] || H(o.kind)) + '</span></td><td class="vsh-who"><b>@' + H(o.user || '') + '</b>' + (o.target ? '<small>' + (o.kind === 'unblock' ? 'đã bị @' + H(o.target) + ' chặn' : 'gọi cho @' + H(o.target)) + '</small>' : '') + '</td><td>' + H(o.action || '') + '</td><td class="text-sm">' + H(o.detail || '') + '</td><td>' + (o.user && BOTK[o.kind] ? acts(o.user) : '') + '</td></tr>';
                }).join('') : '<tr><td colspan="6" class="text-muted">Bot chưa phải xử lý việc gì.</td></tr>';
            }, function () {});
        }
        /* ---------- Admin can thiệp việc bot làm ---------- */
        var GDC = {}, LOG = [], BOTK = { report: 1, spam: 1, 'spam-ban': 1, rate: 1, loud: 1 };
        function exL() { return Array.isArray(GDC.exempt) ? GDC.exempt : []; }
        function acts(u) {
            var j = qdJ(u), isEx = exL().indexOf(u) >= 0;
            return '<div class="qgd-acts"><button type="button" class="ok" onclick="QDCallReports.pardon(\'' + j + '\')">🔓 Gỡ chặn</button><button type="button" class="ex" onclick="QDCallReports.exempt(\'' + j + '\',' + (isEx ? 'false' : 'true') + ')">' + (isEx ? '↩️ Bỏ miễn' : '🛡️ Miễn bot') + '</button></div>';
        }
        function renderHit() {
            var el = $('qgd-hit'); if (!el) return;
            var now = Date.now(), wk = now - 7 * 864e5, P = GDC.pardon || {}, by = {};
            LOG.forEach(function (o) { if (!o.user || !BOTK[o.kind] || (o.at || 0) < wk || (o.at || 0) <= (+P[o.user] || 0)) return; var x = by[o.user] = by[o.user] || { u: o.user, n: 0, last: o, ban: 0 }; x.n++; if ((o.at || 0) > (x.last.at || 0)) x.last = o; });
            WRN.forEach(function (w) { if (!w.bot || !w.user || (+w.banUntil || 0) <= now) return; var x = by[w.user] = by[w.user] || { u: w.user, n: 0, last: { at: w.at, kind: w.rule === 'spam' ? 'spam-ban' : 'report', action: w.label }, ban: 0 }; x.ban = Math.max(x.ban, +w.banUntil); });
            var L = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return (b.ban ? 1 : 0) - (a.ban ? 1 : 0) || (b.last.at || 0) - (a.last.at || 0); });
            el.innerHTML = L.length ? L.map(function (x) {
                return '<tr><td class="vsh-who">' + nm(x.u) + (exL().indexOf(x.u) >= 0 ? '<small style="color:#22c55e">🛡️ đã miễn bot</small>' : '') + '</td><td><span class="qgd-k">' + (KIND[x.last.kind] || H(x.last.kind || '')) + '</span> <span class="text-sm">' + H(x.last.action || '') + '</span><br><small class="text-muted">' + fmt(x.last.at) + '</small></td><td>' + x.n + '</td><td>' + (x.ban ? '<span style="color:#ef4444;font-weight:700">🔒 đến ' + fmt(x.ban) + '</span>' : '<span class="text-muted">—</span>') + '</td><td>' + acts(x.u) + '</td></tr>';
            }).join('') : '<tr><td colspan="5" class="text-muted">Không ai đang bị bot chặn 👍</td></tr>';
            var ex = exL(); $('qgd-exl').innerHTML = ex.length ? ex.map(function (u) { return '<span class="chip">@' + H(u) + '<button type="button" title="Bỏ miễn" onclick="QDCallReports.exempt(\'' + qdJ(u) + '\',false)">✕</button></span>'; }).join(' ') : 'chưa có ai';
        }
        function guardLog(o) { o.at = Date.now(); o.by = me(); return fs().collection('call_bot_log').add(o).catch(function () {}); }
        function pardon(u) {
            qdAsk({ title: 'Gỡ chặn cho @' + u + '?', tone: 'success', icon: '🔓', ok: 'Gỡ chặn', html: '<b>@' + H(u) + '</b> gọi được ngay: mở mọi lần khóa gọi (kể cả do 🤖 Bot), xóa các lần bị chặn gọi lại / tạm dừng gọi.\nBot bỏ qua các vi phạm trước lúc này (không tự khóa lại vì báo cáo cũ).' }).then(function (y) {
                if (!y) return; var p = {}; p[u] = Date.now();
                Promise.all([qdUnbanCalls(u, me()), fs().collection('settings').doc('call_guard').set({ pardon: p, updatedAt: Date.now(), updatedBy: me() }, { merge: true }), guardLog({ kind: 'pardon', user: u, action: 'Admin @' + me() + ' gỡ chặn', detail: 'Mở khóa gọi + xóa chặn của bot' })])
                    .then(function () { toast('Đã gỡ chặn cho @' + u, 'success'); }).catch(function (e) { toast('Không gỡ được: ' + (e && (e.message || e.code) || e), 'error'); });
            });
        }
        function exempt(u, on) {
            u = String(u || '').trim().replace(/^@/, ''); if (!u) return toast('Nhập tên đăng nhập', 'warning');
            var FV = firebase.firestore.FieldValue;
            fs().collection('settings').doc('call_guard').set({ exempt: on ? FV.arrayUnion(u) : FV.arrayRemove(u), updatedAt: Date.now(), updatedBy: me() }, { merge: true })
                .then(function () { guardLog({ kind: on ? 'exempt' : 'unexempt', user: u, action: on ? 'Admin @' + me() + ' cho miễn bot' : 'Admin @' + me() + ' bỏ miễn bot' }); toast(on ? '@' + u + ' được miễn bot' : 'Đã bỏ miễn bot cho @' + u, 'success'); if (on) { var p = $('qgd-exu'); if (p) p.value = ''; } })
                .catch(function (e) { toast('Không lưu được: ' + (e && (e.message || e.code) || e), 'error'); });
        }
        function accRef(user) { return fs().collection('accounts').where('user', '==', user).limit(1).get().then(function (q) { return q.empty ? null : q.docs[0].ref; }); }
        function act(id, kind, days) {
            var r = REP.filter(function (x) { return x.id === id; })[0]; if (!r) return;
            var up = { handledBy: me(), handledAt: Date.now() };
            if (kind === 'dismiss') { up.status = 'dismissed'; up.action = 'Bỏ qua'; return fs().collection('call_reports').doc(id).update(up).then(function () { toast('Đã bỏ qua báo cáo'); }); }
            var ban = kind === 'ban' ? Date.now() + (days || 1) * 86400000 : 0;
            if (ban && !qdOk('', function () { act(id, kind, days); }, { title: 'Khóa gọi ' + days + ' ngày?', icon: '🔒', ok: '🔒 Khóa gọi', html: '<b>' + H(r.reportedName || '@' + r.reported) + '</b> (@' + H(r.reported) + ') sẽ không gọi thoại / video được đến <b>' + fmt(ban) + '</b>.\nLý do: ' + H(r.reasonLabel || r.reason) })) return;
            var w = { user: r.reported, name: r.reportedName || r.reported, reason: r.reason, label: r.reasonLabel || r.reason, note: r.note ? 'Nội dung báo cáo: “' + r.note + '”' : '', by: me(), at: Date.now(), seen: false, reportId: id };
            if (ban) w.banUntil = ban;
            up.status = ban ? 'banned' : 'warned'; up.action = ban ? 'Khóa gọi ' + days + ' ngày' : 'Đã gửi cảnh báo';
            var jobs = [fs().collection('call_warnings').add(w), fs().collection('call_reports').doc(id).update(up),
                fs().collection('push_broadcast').add({ title: '⚠️ Cảnh báo từ Ban Quản Trị', body: 'Bạn bị báo cáo vì ' + (r.reasonLabel || r.reason) + ' khi gọi' + (ban ? '. Tài khoản bị khóa gọi ' + days + ' ngày.' : '. Tái phạm sẽ bị khóa gọi.'), target: r.reported, status: 'pending', createdAt: Date.now(), by: me() })];
            if (ban) jobs.push(accRef(r.reported).then(function (ref) { if (ref) return ref.update({ callBanUntil: ban }); }));
            Promise.all(jobs).then(function () { toast(ban ? 'Đã khóa gọi @' + r.reported + ' ' + days + ' ngày' : 'Đã gửi cảnh báo cho @' + r.reported, 'success');
            }).catch(function (e) { toast('Lỗi: ' + (e && e.code || e), 'error'); });
        }
        function unban(user, wid) {
            qdAsk({ title: 'Mở khóa gọi?', tone: 'success', icon: '📵', ok: 'Mở khóa gọi', html: '<b>@' + H(user) + '</b> sẽ gọi thoại / video được ngay.\nGỡ luôn mọi lần khóa gọi còn hạn (kể cả do 🤖 Bot).' }).then(function (y) { if (y) qdUnbanCalls(user, me())
                .then(function () { toast('Đã mở khóa gọi cho @' + user, 'success'); }).catch(function () { toast('Không mở khóa được', 'error'); }); });
        }
        function boot() {
            if (booted || !window.firebase || !firebase.apps || !firebase.apps.length) return; booted = true;
            fs().collection('call_reports').orderBy('at', 'desc').limit(500).onSnapshot(function (q) { REP = []; q.forEach(function (d) { var x = d.data(); x.id = d.id; REP.push(x); }); REP.sort(function (a, b) { return (b.at || 0) - (a.at || 0); }); render(); }, function (e) { $('qrp-list').innerHTML = '<tr><td colspan="6" style="color:#ef4444">Không đọc được (' + H(e && e.code || '') + ')</td></tr>'; });
            fs().collection('call_warnings').orderBy('at', 'desc').limit(500).onSnapshot(function (q) { WRN = []; q.forEach(function (d) { var x = d.data(); x.id = d.id; WRN.push(x); }); WRN.sort(function (a, b) { return (b.at || 0) - (a.at || 0); }); render(); renderHit(); }, function () {});
            bootGuard(); bootBlocks();
            $('qgd-exbtn').addEventListener('click', function () { exempt($('qgd-exu').value, true); });
            $('qgd-exu').addEventListener('keydown', function (e) { if (e.key === 'Enter') exempt(this.value, true); });
            fs().collection('accounts').get().then(function (q) { var h = []; q.forEach(function (d) { var a = d.data(); if (a.user) h.push('<option value="' + H(a.user) + '">' + H(a.fullName || '') + '</option>'); }); $('qgd-exdl').innerHTML = h.join(''); }).catch(function () {});
            $('qrp-filt').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; F = b.dataset.f || ''; Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); }); render(); });
        }
        (function hook(n) {
            if (typeof UI === 'undefined' || !UI.navigate) { if (n < 120) setTimeout(function () { hook(n + 1); }, 500); return; }
            var nav = UI.navigate; UI.navigate = function (v) { var r = nav.apply(this, arguments); if (v === 'calls') boot(); return r; };
        })(0);
        return { act: act, unban: unban, unblock: unblock, pardon: pardon, exempt: exempt, big: function (src) { var o = $('qrp-img'); o.querySelector('img').src = src; o.hidden = false; } };
    })();
    
