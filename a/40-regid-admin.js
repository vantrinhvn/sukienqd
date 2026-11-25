    /* ===== ADMIN: Phê duyệt đơn Đăng ký ID game =====
       - Đơn mới (users) ở trạng thái "Chờ duyệt". Quản lý bấm Phê duyệt -> hộp hỏi "Thành viên đã vào Quân Đoàn trong Free Fire chưa?"
           Đã vào  -> status: approved (ID được hệ thống xác thực, mới thêm được vào giải đấu)
           Chưa vào -> status: not_in_guild (thành viên được báo để xin vào quân đoàn; duyệt lại sau)
       - Báo thành viên qua thông báo app (push_broadcast) + ghi nhật ký quản trị (admin_logs)
       - Bộ lọc theo trạng thái + số đơn chờ duyệt ở menu (#rga-count)
       - Thẻ "Hệ thống tự kiểm tra quân đoàn" (#rga-auto): máy chủ (qd-vps-22) tự tra hồ sơ Free Fire của ID, đúng quân đoàn thì tự xác thực.
         Cấu hình ở regid_auto/cfg, kết quả lần quét ở regid_auto/state; Thử tra / Kiểm tra ngay qua lệnh quản trị regTest / regSweep / regCheck */
    (function () {
        'use strict';
        var d = document, $ = function (id) { return d.getElementById(id); };
        var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var DOCS = {}, N = { all: 0, pending: 0, not_in_guild: 0, approved: 0 };
        var R = window.RegApprove = { filter: 'all', docs: DOCS };
        function fs() { return firebase.firestore(); }
        function me() { try { return State.currentUser || 'admin'; } catch (e) { return 'admin'; } }
        function toast(m, t) { try { Utils.toast(m, t || 'info'); } catch (e) {} }
        function stOf(x) { return x && x.status === 'approved' ? 'approved' : x && x.status === 'not_in_guild' ? 'not_in_guild' : 'pending'; }
        function when(t) { return t ? new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''; }

        function apply() {
            var tb = $('tb-reg-list'); if (!tb) return;
            tb.setAttribute('data-f', R.filter);
            var em = tb.querySelector('.rga-empty'); if (em) em.hidden = !N.all || (R.filter === 'all' ? N.all : N[R.filter]) > 0;
            var tabs = $('rga-tabs');
            if (tabs) Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) {
                var on = b.dataset.f === R.filter; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
                var n = b.querySelector('b'); if (n) n.textContent = N[b.dataset.f] || 0;
            });
            var wait = N.pending, c = $('rga-count');
            if (c) { c.textContent = wait > 99 ? '99+' : wait; c.style.display = wait ? '' : 'none'; }
        }
        R.sync = function (snap) {
            for (var k in DOCS) delete DOCS[k];
            N = { all: 0, pending: 0, not_in_guild: 0, approved: 0 };
            snap.forEach(function (doc) { var x = doc.data(); DOCS[doc.id] = x; N.all++; N[stOf(x)]++; });
            apply();
        };
        var tabs = $('rga-tabs');
        if (tabs) tabs.addEventListener('click', function (e) { var b = e.target.closest('button[data-f]'); if (b) { R.filter = b.dataset.f; apply(); } });

        /* ---------- Kết quả hệ thống tự tra (dòng nhỏ dưới trạng thái) ---------- */
        function autoText(a) {
            if (!a) return '';
            if (!a.ok) return '🤖 Chưa tra được hồ sơ — duyệt tay';
            var who = a.nick ? '“' + a.nick + '”' : 'Nhân vật';
            if (a.inGuild) return '🤖 ' + who + ' đang ở đúng quân đoàn' + (a.guildName ? ' ' + a.guildName : '') + (a.dup ? ' · ⚠️ ID trùng đơn khác, duyệt tay' : '');
            return '🤖 ' + who + (a.guildId ? ' đang ở quân đoàn khác: ' + (a.guildName || a.guildId) : ' chưa vào quân đoàn nào');
        }
        R.autoLine = function (x) {
            var a = x && x.autoCheck; if (!a) return '';
            return '<small class="rga-auto-line' + (!a.ok ? ' err' : a.inGuild ? ' ok' : ' no') + '" title="' + E((a.ok ? 'Tra qua ' + (a.src || '') : (a.err || '')) + ' · ' + when(a.at)) + '">' + E(autoText(a)) + '</small>';
        };
        function errMsg(e) {
            var m = String(e && (e.message || e.code) || e || '');
            if (/Lệnh quản trị lạ|Chỉ Admin dùng được chức năng quản trị máy chủ/.test(m)) return 'Cần cập nhật máy chủ lên qd-vps-22 (Admin → Máy chủ VPS → Cập nhật máy chủ)';
            return m || 'Lỗi không rõ';
        }

        /* ---------- Hộp phê duyệt ---------- */
        function notify(u, title, body) {
            return fs().collection('push_broadcast').add({ title: title, body: body, image: '', target: u, status: 'pending', createdAt: Date.now(), by: me() }).catch(function () {});
        }
        function log(action, x) {
            return fs().collection('admin_logs').add({ type: 'regid', action: action, user: x.submitter || '', gameId: x.gameId || '', name: x.name || '', by: me(), timestamp: Date.now() }).catch(function () {});
        }
        function decide(id, x, yes) {
            var now = Date.now(), who = me();
            var up = yes ? { status: 'approved', inGuild: true, approvedBy: who, approvedAt: now, checkedBy: who, checkedAt: now }
                : { status: 'not_in_guild', inGuild: false, checkedBy: who, checkedAt: now };
            return fs().collection('users').doc(id).update(up).then(function () {
                log(yes ? 'approve' : 'not_in_guild', x);
                if (yes) notify(x.submitter, '✅ ID game đã được xác thực', 'Ban Quản Trị đã xác nhận bạn trong Quân Đoàn. ID ' + x.gameId + ' (' + (x.name || '') + ') đã được hệ thống xác thực.');
                else notify(x.submitter, '⏳ Chưa thấy bạn trong Quân Đoàn', 'Hãy xin vào Quân Đoàn trong Free Fire bằng nhân vật ' + (x.name || '') + ' (ID ' + x.gameId + '). Ban Quản Trị sẽ kiểm tra và duyệt lại.');
                toast(yes ? 'Đã xác thực ID của @' + x.submitter : 'Đã báo @' + x.submitter + ' chưa vào quân đoàn', yes ? 'success' : 'warning');
            });
        }
        function autoBox(x) {
            var a = x.autoCheck;
            return '<span>' + (a ? E(autoText(a)) + ' <small>(' + E(when(a.at)) + ')</small>' : '🤖 Hệ thống chưa tra ID này.') + '</span><button type="button" class="rga-recheck"><i class="fa-solid fa-rotate"></i> Tra lại</button>';
        }
        R.open = function (id) {
            var x = DOCS[id]; if (!x) return toast('Không tìm thấy đơn — có thể vừa bị xóa', 'error');
            if (stOf(x) === 'approved') return toast('Đơn này đã được xác thực', 'info');
            var prev = d.activeElement, ov = d.createElement('div'); ov.className = 'qa-ov rga-ov';
            var again = stOf(x) === 'not_in_guild';
            ov.innerHTML = '<div class="qa-box rga-box" role="alertdialog" aria-modal="true" aria-labelledby="rga-t" aria-describedby="rga-q" data-tone="info">'
                + '<button type="button" class="rga-x" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button>'
                + '<div class="qa-ic">🛡️</div><h3 id="rga-t">Phê duyệt ID game</h3>'
                + '<div class="rga-card"><div class="rga-av">' + E((x.name || x.submitter || '?').trim().charAt(0).toUpperCase()) + '</div>'
                + '<div class="rga-mid"><b>' + E(x.name || '—') + '</b><small>@' + E(x.submitter) + ' · gửi ' + E(when(x.timestamp)) + '</small></div></div>'
                + '<div class="rga-id"><span>ID game</span><b>' + E(x.gameId) + '</b><button type="button" class="rga-copy"><i class="fa-regular fa-copy"></i> Sao chép</button></div>'
                + '<div class="rga-autobox" id="rga-autobox">' + autoBox(x) + '</div>'
                + (again ? '<div class="rga-prev"><i class="fa-solid fa-clock-rotate-left"></i> Lần kiểm tra trước' + (x.checkedBy ? ' (' + E(x.checkedBy) + ', ' + E(when(x.checkedAt)) + ')' : '') + ': chưa vào quân đoàn.</div>' : '')
                + '<div class="rga-q" id="rga-q"><b>Thành viên này đã vào Quân Đoàn trong Free Fire chưa?</b><small>Mở Free Fire → Quân Đoàn → Thành viên, tìm theo tên nhân vật hoặc ID ở trên.</small></div>'
                + '<div class="qa-btns rga-btns"><button type="button" class="no">⏳ Chưa vào</button><button type="button" class="ok">✅ Đã vào – Phê duyệt</button></div></div>';
            var busy = false;
            function close() { d.removeEventListener('keydown', key, true); ov.remove(); try { prev && prev.focus && prev.focus(); } catch (e) {} }
            function key(e) { if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); close(); } }
            function go(yes) {
                if (busy) return; busy = true;
                var bs = ov.querySelectorAll('.rga-btns button'); Array.prototype.forEach.call(bs, function (b) { b.disabled = true; });
                (yes ? bs[1] : bs[0]).innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu…';
                decide(id, x, yes).then(close, function (e) {
                    busy = false; toast('Không lưu được: ' + (e && (e.message || e.code) || e), 'error');
                    bs[0].textContent = '⏳ Chưa vào'; bs[1].textContent = '✅ Đã vào – Phê duyệt'; Array.prototype.forEach.call(bs, function (b) { b.disabled = false; });
                });
            }
            ov.addEventListener('click', function (e) { if (e.target === ov && !busy) close(); });
            ov.querySelector('.rga-x').onclick = function () { if (!busy) close(); };
            ov.querySelector('.no').onclick = function () { go(false); };
            ov.querySelector('.ok').onclick = function () { go(true); };
            ov.addEventListener('click', function (e) {
                var b = e.target.closest('.rga-recheck'); if (!b || busy) return;
                b.disabled = true; b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tra…';
                QDdb.admin('regCheck', { id: id }).then(function (r) {
                    var cur = DOCS[id] || x;
                    if (r && r.status === 'approved') { close(); toast('Hệ thống đã thấy @' + (cur.submitter || '') + ' trong Quân Đoàn — đã tự xác thực', 'success'); return; }
                    setTimeout(function () { var bx = $('rga-autobox'); if (bx) bx.innerHTML = autoBox(DOCS[id] || cur); }, 300);
                    if (r && !r.ok && r.err) toast('Chưa tra được: ' + r.err, 'warning');
                }, function (e) { toast(errMsg(e), 'error'); var bx = $('rga-autobox'); if (bx) bx.innerHTML = autoBox(DOCS[id] || x); });
            });
            ov.querySelector('.rga-copy').onclick = function () {
                var b = this, t = String(x.gameId || '');
                var ok = function () { b.innerHTML = '<i class="fa-solid fa-check"></i> Đã chép'; setTimeout(function () { b.innerHTML = '<i class="fa-regular fa-copy"></i> Sao chép'; }, 1500); };
                try { navigator.clipboard.writeText(t).then(ok, function () { toast('Không chép được, hãy chép tay: ' + t, 'warning'); }); } catch (e) { toast('Không chép được, hãy chép tay: ' + t, 'warning'); }
            };
            d.addEventListener('keydown', key, true); d.body.appendChild(ov);
            ov.querySelector('.rga-x').focus();   // không đặt sẵn vào nút Phê duyệt: tránh lỡ tay bấm Enter
        };

        /* ---------- Thẻ "Hệ thống tự kiểm tra quân đoàn" ---------- */
        var DEF_URLS = ['https://ffdvinh09-info.vercel.app/player-info?region={region}&uid={uid}', 'https://gst-info.vercel.app/player-info?region={region}&uid={uid}', 'https://free-ff-api-src-5plp.onrender.com/api/v1/account?region={region}&uid={uid}'];
        var OLD_URLS = 'https://ffdvinh09-info.vercel.app/player-info?region={region}&uid={uid}|https://free-ff-api-src-5plp.onrender.com/api/v1/account?region={region}&uid={uid}';
        var CFG = null, STATE = null, dirty = false, started = false;
        function cfgOf(c) { c = c || {}; return { on: c.on !== false, guildId: String(c.guildId == null ? '1011610530' : c.guildId), region: c.region || 'VN', everyMin: +c.everyMin || 30, urls: Array.isArray(c.urls) && c.urls.length && c.urls.join('|') !== OLD_URLS ? c.urls : DEF_URLS }; }
        function fill() {
            var c = cfgOf(CFG);
            $('rga-on').checked = c.on; $('rga-on-txt').textContent = c.on ? 'Đang bật' : 'Đang tắt';
            $('rga-auto').classList.toggle('off', !c.on);
            if (!dirty) { $('rga-guild').value = c.guildId; $('rga-region').value = c.region; $('rga-every').value = c.everyMin; $('rga-urls').value = c.urls.join('\n'); }
            paintState();
        }
        function paintState() {
            var c = cfgOf(CFG), el = $('rga-state'), t = STATE;
            if (!c.on) { el.className = 'rga-state off'; el.textContent = 'Đang tắt — đơn mới chờ Quản lý duyệt tay.'; return; }
            if (!t || !t.lastRun) { el.className = 'rga-state'; el.textContent = 'Chưa quét lần nào. Máy chủ tự tra đơn mới và quét lại mỗi ' + c.everyMin + ' phút.'; return; }
            el.className = 'rga-state' + (t.errs && !t.ok ? ' err' : '');
            el.textContent = 'Quét lúc ' + when(t.lastRun) + ': tra ' + (t.n || 0) + ' đơn · tự xác thực ' + (t.approved || 0) + ' · chưa vào ' + (t.notIn || 0) + (t.errs ? ' · không tra được ' + t.errs : '') + (t.left ? ' · còn ' + t.left + ' đơn lần sau' : '');
            el.title = t.err || '';
        }
        function form() {
            var g = String($('rga-guild').value || '').replace(/\D/g, ''), ev = Math.min(1440, Math.max(5, Math.round(+$('rga-every').value || 30)));
            var urls = String($('rga-urls').value || '').split(/\n+/).map(function (u) { return u.trim(); }).filter(Boolean);
            return { guildId: g, region: $('rga-region').value || 'VN', everyMin: ev, urls: urls };
        }
        function save(extra) {
            var f = Object.assign(form(), extra || {});
            if (!f.guildId) return Promise.reject(new Error('Nhập ID Quân Đoàn (chỉ gồm số)'));
            var bad = f.urls.filter(function (u) { return !/^https?:\/\/\S+$/.test(u) || u.indexOf('{uid}') < 0; });
            if (bad.length) return Promise.reject(new Error('Địa chỉ dịch vụ phải bắt đầu bằng http(s):// và có {uid}: ' + bad[0].slice(0, 60)));
            if (!f.urls.length) f.urls = DEF_URLS.slice();
            f.on = extra && extra.on != null ? extra.on : $('rga-on').checked;
            f.at = Date.now(); f.by = me();
            return fs().collection('regid_auto').doc('cfg').set(f, { merge: true }).then(function () { dirty = false; });
        }
        function verdict(r) {
            if (!r.ok) return '<div class="rga-v err">❌ Không tra được ID này. Kiểm tra lại ID / máy chủ, hoặc dịch vụ tra cứu đang lỗi.</div>';
            var b = r.best, nm = E(b.nick || '—');
            if (r.inGuild) return '<div class="rga-v ok">✅ <b>' + nm + '</b> đang ở đúng Quân Đoàn ' + E(b.guildName ? b.guildName + ' · ' : '') + E(r.guildId) + ' — sẽ được tự xác thực.</div>';
            if (b.guildId) return '<div class="rga-v no">⚠️ <b>' + nm + '</b> đang ở quân đoàn khác: ' + E(b.guildName || '') + ' (ID ' + E(b.guildId) + '), không phải ' + E(r.guildId) + '.</div>';
            return '<div class="rga-v no">⚠️ <b>' + nm + '</b> chưa vào quân đoàn nào (hoặc dịch vụ không trả về quân đoàn).</div>';
        }
        function test() {
            var uid = String($('rga-tuid').value || '').replace(/\D/g, ''), out = $('rga-tout'), b = $('rga-tgo');
            if (!uid) { toast('Nhập ID game để thử', 'warning'); $('rga-tuid').focus(); return; }
            var f = form(); out.hidden = false; out.innerHTML = '<div class="rga-v"><i class="fa-solid fa-spinner fa-spin"></i> Máy chủ đang tra ID ' + E(uid) + '…</div>';
            b.disabled = true;
            QDdb.admin('regTest', { uid: uid, guildId: f.guildId, region: f.region, urls: f.urls.length ? f.urls : null }).then(function (r) {
                out.innerHTML = verdict(r) + '<ul class="rga-tries">' + (r.tries || []).map(function (t) {
                    return '<li class="' + (t.ok ? 'ok' : 'err') + '"><b>' + E(t.host) + '</b> ' + (t.ok ? '✓ tên “' + E(t.nick) + '”' + (t.guildId ? ', quân đoàn ' + E(t.guildName || '') + ' (' + E(t.guildId) + ')' : ', không có quân đoàn') : '✗ ' + E(t.err || 'lỗi')) + (t.ms != null ? ' <small>' + t.ms + ' ms</small>' : '')
                        + (t.raw ? '<details><summary>Dữ liệu trả về</summary><pre>' + E(t.raw) + '</pre></details>' : '') + '</li>';
                }).join('') + '</ul>';
            }, function (e) { out.innerHTML = '<div class="rga-v err">❌ ' + E(errMsg(e)) + '</div>'; }).then(function () { b.disabled = false; });
        }
        function startAuto() {
            if (started || !$('rga-auto') || !window.firebase || !firebase.apps || !firebase.apps.length) return; started = true;
            fs().collection('regid_auto').doc('cfg').onSnapshot(function (x) { CFG = x.exists ? x.data() : null; fill(); }, function () {});
            fs().collection('regid_auto').doc('state').onSnapshot(function (x) { STATE = x.exists ? x.data() : null; paintState(); }, function () {});
            ['rga-guild', 'rga-region', 'rga-every', 'rga-urls'].forEach(function (k) { $(k).addEventListener('input', function () { dirty = true; }); });
            $('rga-on').addEventListener('change', function () {
                var on = this.checked; $('rga-on-txt').textContent = on ? 'Đang bật' : 'Đang tắt';
                save({ on: on }).then(function () { toast(on ? 'Đã bật tự kiểm tra quân đoàn' : 'Đã tắt tự kiểm tra — đơn mới chờ duyệt tay', on ? 'success' : 'info'); }, function (e) { $('rga-on').checked = !on; fill(); toast(errMsg(e), 'error'); });
            });
            $('rga-save').addEventListener('click', function () { save().then(function () { toast('Đã lưu cấu hình tự kiểm tra', 'success'); }, function (e) { toast(errMsg(e), 'error'); }); });
            $('rga-sweep').addEventListener('click', function () {
                var b = this; b.disabled = true;
                QDdb.admin('regSweep', {}).then(function (r) {
                    toast(r && r.busy ? 'Máy chủ đang kiểm tra, đợi lượt này xong' : 'Máy chủ đang kiểm tra ' + ((r && r.due) || 0) + ' đơn, kết quả hiện dưới nút', 'info');
                }, function (e) { toast(errMsg(e), 'error'); }).then(function () { setTimeout(function () { b.disabled = false; }, 3000); });
            });
            $('rga-tgo').addEventListener('click', test);
            $('rga-tuid').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); test(); } });
        }
        var tStart = setInterval(function () { var u = ''; try { u = State.currentUser; } catch (e) {} if (u) { startAuto(); if (started) clearInterval(tStart); } }, 800);
    })();
