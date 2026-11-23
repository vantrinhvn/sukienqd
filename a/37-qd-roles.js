    /* ===== Phân quyền 3 bậc: Thành viên · Quản lý (chỉ mục được chọn) · Quản trị viên (toàn quyền) + Chủ hệ thống (qd admin trên VPS).
       Máy chủ VPS kiểm tra lại mọi lệnh ghi (vps/server.js: checkStaffWrites) — giao diện chỉ để dễ dùng. ===== */
    (function () {
        var $ = function (id) { return document.getElementById(id); }, W = window;
        var E = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        function toast(m, t) { try { Utils.toast(m, t || 'info'); } catch (e) {} }
        function views() {   // các mục Admin lấy từ menu (tự có mục mới), bỏ Tổng quan (luôn có) và Máy chủ VPS (chỉ Quản trị viên)
            var out = [], seen = {};
            document.querySelectorAll('.nav-item[onclick*="UI.navigate("]').forEach(function (n) {
                var m = /UI\.navigate\('([a-z0-9_]+)'/.exec(n.getAttribute('onclick') || ''); if (!m || seen[m[1]] || m[1] === 'dashboard' || m[1] === 'vps') return;
                seen[m[1]] = 1; var c = n.cloneNode(true); c.querySelectorAll('[class*=badge],[class*=cnt],[class*=count],[id]').forEach(function (x) { if (x.children.length === 0 && /^\s*\d*\s*$/.test(x.textContent)) x.remove(); }); out.push({ v: m[1], t: (c.textContent || m[1]).replace(/\s+/g, ' ').trim().replace(/\s*\d+$/, '') });
            });
            return out;
        }
        var CUR = { role: 'user' };
        function pick(r) {
            CUR.role = r; $('role-select').value = r;
            document.querySelectorAll('#qr-roles .qr-role').forEach(function (b) { b.classList.toggle('on', b.dataset.r === r); });
            $('permission-box').hidden = r !== 'manager';
        }
        function waitAA(fn, n) { if (typeof AdminActions !== 'undefined') return fn(); if ((n || 0) < 200) setTimeout(function () { waitAA(fn, (n || 0) + 1); }, 100); }
        waitAA(function () {
            var AA = AdminActions;
            AA.togglePermissionBox = function () { pick($('role-select').value); };
            AA.openRoleModal = function (docId, username, currentRole, currentPerms) {
                if (State.currentUserRole !== 'admin') return toast('Chỉ Quản trị viên được phân quyền.', 'error');
                if (username === State.currentUser) return toast('Không tự đổi quyền của chính mình — nhờ Quản trị viên khác.', 'warning');
                $('role-target-id').value = docId; $('role-target-name').textContent = username;
                var perms = String(currentPerms || '').split(',').filter(Boolean);
                $('qr-grid').innerHTML = views().map(function (x) { return '<label><input type="checkbox" class="perm-cb" value="' + E(x.v) + '"' + (perms.indexOf(x.v) >= 0 ? ' checked' : '') + '> ' + E(x.t) + '</label>'; }).join('');
                pick(currentRole === 'admin' || currentRole === 'manager' ? currentRole : 'user');
                UI.openModal('modal-edit-role');
            };
            AA.saveRole = function () {
                var id = $('role-target-id').value, r = CUR.role, u = $('role-target-name').textContent, btn = $('btn-save-role');
                if (!id) return toast('ID tài khoản không hợp lệ.', 'error');
                var perms = r === 'admin' ? ['all'] : r === 'manager' ? ['dashboard'].concat([].map.call(document.querySelectorAll('#qr-grid .perm-cb:checked'), function (c) { return c.value; })) : [];
                if (r === 'manager' && perms.length < 2) return toast('Chọn ít nhất 1 mục cho Quản lý.', 'warning');
                var go = function () {
                    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang lưu…';
                    db.collection('accounts').doc(id).update({ role: r, permissions: perms, roleBy: State.currentUser, roleAt: Date.now() })
                        .then(function () { toast('Đã đặt @' + u + ' là ' + (r === 'admin' ? 'Quản trị viên (toàn quyền)' : r === 'manager' ? 'Quản lý (' + (perms.length - 1) + ' mục)' : 'Thành viên'), 'success'); UI.closeModal('modal-edit-role'); })
                        .catch(function (e) { toast('Không lưu được: ' + (e && e.message || e), 'error'); })
                        .then(function () { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-2"></i> Lưu phân quyền'; });
                };
                if (r === 'admin' && W.qdAsk) W.qdAsk({ title: 'Cấp TOÀN QUYỀN?', icon: '🛡️', tone: 'warn', ok: 'Cấp toàn quyền', html: '<b>@' + E(u) + '</b> sẽ làm được mọi thứ như bạn: cấp / tước quyền, xóa dữ liệu, sao lưu / khôi phục máy chủ.' }).then(function (y) { if (y) go(); });
                else go();
            };
            AA.openAdminProfile = function () {
                var u = State.currentUser || '', r = State.currentUserRole, perms = State.currentUserPerms || [];
                $('admin-greeting').textContent = 'Xin chào, ' + u + '!'; $('admin-profile-name').textContent = u;
                var badge = $('admin-role-badge'), rt = $('admin-profile-role-text'), ow = $('qr-owner');
                if (State.isOwner) { badge.innerHTML = '👑 Chủ hệ thống'; badge.className = 'badge badge-danger mb-6 px-4 py-2 text-sm'; rt.textContent = 'Toàn quyền · không ai hạ quyền được'; rt.className = 'text-danger font-bold'; }
                else if (r === 'admin') { badge.innerHTML = '<i class="fa-solid fa-shield-check mr-1"></i> Quản trị viên'; badge.className = 'badge badge-danger mb-6 px-4 py-2 text-sm'; rt.textContent = 'Toàn quyền hệ thống'; rt.className = 'text-danger font-bold'; }
                else { badge.innerHTML = '<i class="fa-solid fa-user-tie mr-1"></i> Quản lý'; badge.className = 'badge badge-online mb-6 px-4 py-2 text-sm'; rt.textContent = 'Quản lý · ' + Math.max(0, perms.filter(function (p) { return p !== 'dashboard'; }).length) + ' mục được cấp'; rt.className = 'text-primary font-bold'; }
                ow.hidden = true;
                if (r === 'admin' && !State.isOwner && W.QDdb && W.QDdb.admin) W.QDdb.admin('owner').then(function (x) {
                    if (x && x.owner) { ow.hidden = false; ow.innerHTML = '👑 Chủ hệ thống: <b>@' + E(x.owner.u) + '</b>'; return; }
                    ow.hidden = false; ow.innerHTML = '👑 Hệ thống <b>chưa có Chủ</b>. Chủ hệ thống luôn toàn quyền, không ai trên web hạ quyền / khóa / xóa được.<br><button type="button" class="qr-mini" id="qr-claim" style="margin-top:8px">👑 Nhận tôi làm Chủ hệ thống</button>';
                    $('qr-claim').onclick = function () {
                        W.QDdb.admin('owner', { claim: true }).then(function () { State.isOwner = true; toast('Bạn là Chủ hệ thống', 'success'); AA.openAdminProfile(); }).catch(function (e) { toast(e.message || e.code, 'error'); });
                    };
                }).catch(function () {});
                UI.openModal('modal-admin-profile');
            };
        });
        document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('#qr-roles .qr-role'); if (b) pick(b.dataset.r); });
        document.addEventListener('click', function (e) {
            if (!e.target.closest) return;
            if (e.target.closest('#qr-all')) document.querySelectorAll('#qr-grid .perm-cb').forEach(function (c) { c.checked = true; });
            if (e.target.closest('#qr-none')) document.querySelectorAll('#qr-grid .perm-cb').forEach(function (c) { c.checked = false; });
        });
    })();
    
