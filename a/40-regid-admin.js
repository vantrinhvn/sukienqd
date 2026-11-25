    /* ===== ADMIN: Phê duyệt đơn Đăng ký ID game =====
       - Đơn mới (users) ở trạng thái "Chờ duyệt". Quản lý bấm Phê duyệt -> hộp hỏi "Thành viên đã vào Quân Đoàn trong Free Fire chưa?"
           Đã vào  -> status: approved (ID được hệ thống xác thực, mới thêm được vào giải đấu)
           Chưa vào -> status: not_in_guild (thành viên được báo để xin vào quân đoàn; duyệt lại sau)
       - Báo thành viên qua thông báo app (push_broadcast) + ghi nhật ký quản trị (admin_logs)
       - Bộ lọc theo trạng thái + số đơn chờ duyệt ở menu (#rga-count) */
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
            ov.querySelector('.rga-copy').onclick = function () {
                var b = this, t = String(x.gameId || '');
                var ok = function () { b.innerHTML = '<i class="fa-solid fa-check"></i> Đã chép'; setTimeout(function () { b.innerHTML = '<i class="fa-regular fa-copy"></i> Sao chép'; }, 1500); };
                try { navigator.clipboard.writeText(t).then(ok, function () { toast('Không chép được, hãy chép tay: ' + t, 'warning'); }); } catch (e) { toast('Không chép được, hãy chép tay: ' + t, 'warning'); }
            };
            d.addEventListener('keydown', key, true); d.body.appendChild(ov);
            ov.querySelector('.rga-x').focus();   // không đặt sẵn vào nút Phê duyệt: tránh lỡ tay bấm Enter
        };
    })();
