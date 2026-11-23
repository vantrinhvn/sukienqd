    /* settings/con_config, con_stats, con_history, accounts.conThrows (xem chú thích trong game.html) */
    (function () {
        'use strict';
        if (!document.getElementById('view-nemcon') || typeof db === 'undefined') return;
        var $ = function (id) { return document.getElementById(id); };
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var toast = function (m, t) { if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast(m, t || 'success'); };
        var FV = firebase.firestore.FieldValue, CFG = db.collection('settings').doc('con_config');
        var DEF = { enabled: true, difficulty: 'normal', wind: true, hitPoints: 20, rimPoints: 5, streakEvery: 3, streakBonus: 30, freePerDay: 3, closedMsg: '' };
        function int(v, def, min, max) { v = parseInt(v, 10); if (isNaN(v)) v = def; return Math.min(max, Math.max(min, v)); }
        function norm(c) {
            c = c || {};
            return { enabled: c.enabled !== false, difficulty: ['easy', 'normal', 'hard'].indexOf(c.difficulty) >= 0 ? c.difficulty : 'normal', wind: c.wind !== false,
                hitPoints: int(c.hitPoints, DEF.hitPoints, 0, 100000), rimPoints: int(c.rimPoints, DEF.rimPoints, 0, 100000), streakEvery: int(c.streakEvery, DEF.streakEvery, 0, 100),
                streakBonus: int(c.streakBonus, DEF.streakBonus, 0, 100000), freePerDay: int(c.freePerDay, DEF.freePerDay, 0, 100), closedMsg: String(c.closedMsg || '').slice(0, 200), shopEnabled: c.shopEnabled !== false };
        }
        var NC = window.NemConAdmin = { cfg: null, diff: 'normal', dirty: false, started: false, stats: [], users: [] };
        function me() { try { return (typeof State !== 'undefined' && State.currentUser) || 'admin'; } catch (e) { return 'admin'; } }

        /* ---------- Cấu hình ---------- */
        function setDiff(v) { NC.diff = v; document.querySelectorAll('#nc-diff button').forEach(function (b) { var on = b.getAttribute('data-v') === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); }
        function statusText(on) { var s = $('nc-status-text'); s.textContent = on ? 'ĐANG MỞ SÂN' : 'ĐANG ĐÓNG'; s.style.color = on ? 'var(--color-success)' : 'var(--color-danger)'; }
        function fill() {
            var c = norm(NC.cfg);
            $('nc-enabled').checked = c.enabled; statusText(c.enabled); setDiff(c.difficulty); $('nc-wind').checked = c.wind;
            $('nc-hit').value = c.hitPoints; $('nc-rim').value = c.rimPoints; $('nc-severy').value = c.streakEvery; $('nc-sbonus').value = c.streakBonus;
            $('nc-free').value = c.freePerDay; $('nc-closed').value = c.closedMsg; dirty(false);
            $('nc-shop-on').checked = c.shopEnabled; shopStatus(c.shopEnabled);
        }
        function dirty(on) { NC.dirty = on; $('nc-dirty').innerHTML = on ? '<span class="text-warning font-bold"><i class="fa-solid fa-triangle-exclamation"></i> Có thay đổi chưa lưu</span>' : ''; }
        function read() {
            return norm({ enabled: $('nc-enabled').checked, difficulty: NC.diff, wind: $('nc-wind').checked, hitPoints: $('nc-hit').value, rimPoints: $('nc-rim').value,
                streakEvery: $('nc-severy').value, streakBonus: $('nc-sbonus').value, freePerDay: $('nc-free').value, closedMsg: $('nc-closed').value.trim(), shopEnabled: $('nc-shop-on').checked });
        }
        $('nc-diff').addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (b) { setDiff(b.getAttribute('data-v')); dirty(true); } });
        ['nc-wind', 'nc-hit', 'nc-rim', 'nc-severy', 'nc-sbonus', 'nc-free', 'nc-closed'].forEach(function (id) { $(id).addEventListener('input', function () { dirty(true); }); $(id).addEventListener('change', function () { dirty(true); }); });
        // Bật / tắt sân: lưu ngay
        $('nc-enabled').addEventListener('change', function () {
            var on = this.checked; statusText(on);
            CFG.set({ enabled: on, updatedAt: Date.now() }, { merge: true }).then(function () { toast(on ? 'Đã mở sân Ném Còn.' : 'Đã đóng sân Ném Còn.', on ? 'success' : 'warning'); })
                .catch(function () { toast('Lỗi lưu trạng thái sân.', 'error'); });
        });
        $('nc-save').onclick = function () {
            var c = read(); c.updatedAt = Date.now();
            CFG.set(c, { merge: true }).then(function () { dirty(false); toast('Đã lưu cấu hình Ném Còn!', 'success'); }).catch(function () { toast('Lỗi lưu cấu hình.', 'error'); });
        };

        /* ---------- Tặng lượt ---------- */
        $('nc-g-user').addEventListener('input', function () {
            var u = this.value.trim(), x = NC.users.filter(function (a) { return a.user === u; })[0];
            $('nc-g-info').innerHTML = x ? '<span class="text-muted">Đang có <b class="text-main">' + (x.conThrows || 0) + '</b> lượt ném · ' + (x.points || 0).toLocaleString('vi-VN') + ' điểm</span>' : '';
        });
        $('nc-g-one').onclick = function () {
            var u = $('nc-g-user').value.trim(), n = parseInt($('nc-g-n').value, 10), btn = this;
            if (!u) return toast('Nhập tên đăng nhập của thành viên.', 'warning');
            if (isNaN(n) || n === 0) return toast('Số lượt không hợp lệ.', 'warning');
            btn.disabled = true;
            db.collection('accounts').where('user', '==', u).limit(1).get().then(function (s) {
                if (s.empty) throw { code: 'NOUSER' };
                var ref = s.docs[0].ref;
                return db.runTransaction(function (t) {
                    return t.get(ref).then(function (d) {
                        var cur = Number(d.data().conThrows) || 0, nv = Math.max(0, cur + n);
                        t.update(ref, { conThrows: nv });
                        t.set(db.collection('admin_logs').doc(), { user: u, type: 'conThrows', action: 'add', amount: n, by: me(), timestamp: Date.now() });
                        return nv;
                    });
                });
            }).then(function (nv) {
                toast((n > 0 ? 'Đã tặng ' + n : 'Đã trừ ' + (-n)) + ' lượt ném còn cho ' + u + ' (còn ' + nv + ' lượt).', 'success');
                var x = NC.users.filter(function (a) { return a.user === u; })[0]; if (x) x.conThrows = nv; $('nc-g-user').dispatchEvent(new Event('input'));
            }).catch(function (e) { toast(e && e.code === 'NOUSER' ? 'Không tìm thấy tài khoản "' + u + '".' : 'Lỗi tặng lượt.', 'error'); })
              .then(function () { btn.disabled = false; });
        };
        $('nc-g-all').onclick = function () {
            var n = parseInt($('nc-g-alln').value, 10), btn = this;
            if (isNaN(n) || n < 1) return toast('Số lượt phải từ 1 trở lên.', 'warning');
            if (!qdOk('Tặng ' + n + ' lượt ném còn cho TẤT CẢ thành viên (trừ tài khoản đang bị khóa)?', function () { btn.click(); }, { title: 'Tặng lượt cho tất cả?', tone: 'info', icon: '🎯', ok: 'Tặng ' + n + ' lượt' })) return;
            btn.disabled = true;
            db.collection('accounts').get().then(function (snap) {
                var refs = []; snap.forEach(function (d) { if (d.data().isBlocked !== true) refs.push(d.ref); });
                var chunks = []; for (var i = 0; i < refs.length; i += 450) chunks.push(refs.slice(i, i + 450));
                return Promise.all(chunks.map(function (ch) { var b = db.batch(); ch.forEach(function (r) { b.update(r, { conThrows: FV.increment(n) }); }); return b.commit(); }))   // NHANH: các lô ghi cùng lúc
                    .then(function () { return db.collection('admin_logs').add({ user: '(tất cả)', type: 'conThrows', action: 'add', amount: n, count: refs.length, by: me(), timestamp: Date.now() }); })
                    .then(function () { return refs.length; });
            }).then(function (k) { toast('Đã tặng ' + n + ' lượt ném còn cho ' + k + ' thành viên!', 'success'); loadUsers(); })
              .catch(function (e) { console.error(e); toast('Lỗi tặng lượt hàng loạt (có thể đã tặng một phần).', 'error'); })
              .then(function () { btn.disabled = false; });
        };
        function loadUsers() {
            db.collection('accounts').get().then(function (snap) {
                NC.users = []; snap.forEach(function (d) { var x = d.data(); if (x.user) NC.users.push({ user: x.user, conThrows: Number(x.conThrows) || 0, points: Number(x.points) || 0 }); });
                NC.users.sort(function (a, b) { return a.user.localeCompare(b.user); });
                $('nc-users').innerHTML = NC.users.map(function (a) { return '<option value="' + esc(a.user) + '">'; }).join('');
            }).catch(function () {});
        }

        /* ---------- Thống kê, bảng xếp hạng, lịch sử ---------- */
        function renderStats() {
            var rows = NC.stats.filter(function (x) { return (x.throws || 0) > 0; }), T = 0, Hh = 0, Pp = 0;
            rows.forEach(function (x) { T += x.throws || 0; Hh += x.hits || 0; Pp += x.points || 0; });
            $('nc-s-players').textContent = rows.length; $('nc-s-throws').textContent = T.toLocaleString('vi-VN');
            $('nc-s-hits').textContent = Hh.toLocaleString('vi-VN') + (T ? ' (' + Math.round(Hh / T * 100) + '%)' : ''); $('nc-s-points').textContent = Pp.toLocaleString('vi-VN');
            rows.sort(function (a, b) { return (b.hits || 0) - (a.hits || 0) || (b.best || 0) - (a.best || 0) || (a.throws || 0) - (b.throws || 0); });
            $('nc-tb-lb').innerHTML = rows.length ? rows.map(function (x, i) {
                return '<tr><td class="font-bold">' + (i + 1) + '</td><td><b>' + esc(x.user) + '</b></td><td class="text-center">' + (x.throws || 0) + '</td><td class="text-center font-bold text-success">' + (x.hits || 0) + '</td>'
                    + '<td class="text-center">' + (x.rims || 0) + '</td><td class="text-center">' + (x.throws ? Math.round((x.hits || 0) / x.throws * 100) : 0) + '%</td><td class="text-center">' + (x.best || 0) + '</td>'
                    + '<td class="text-right font-bold" style="font-family: var(--font-family-mono);">' + (x.points || 0).toLocaleString('vi-VN') + '</td></tr>';
            }).join('') : '<tr><td colspan="8" class="text-center text-muted py-8">Chưa có ai ném còn.</td></tr>';
        }
        $('nc-reset').onclick = function () {
            if (!qdOk('Thống kê lượt ném / lọt vòng / chuỗi của mọi người về 0.\nĐiểm đã thưởng và lượt ném trong tài khoản giữ nguyên.', function () { $('nc-reset').click(); }, { title: 'Làm mới BXH Ném Còn?', ok: 'Làm mới' })) return;
            db.collection('con_stats').get().then(function (snap) {
                var refs = []; snap.forEach(function (d) { refs.push(d.ref); });
                var chunks = []; for (var i = 0; i < refs.length; i += 450) chunks.push(refs.slice(i, i + 450));
                return Promise.all(chunks.map(function (ch) { var b = db.batch(); ch.forEach(function (r) { b.delete(r); }); return b.commit(); }));   // NHANH: các lô xóa cùng lúc
            }).then(function () { toast('Đã làm mới bảng xếp hạng Ném Còn.', 'success'); }).catch(function () { toast('Lỗi làm mới bảng xếp hạng.', 'error'); });
        };
        var RES = { hit: '🎯 Lọt vòng', rim: '🥏 Chạm vành', miss: '💨 Trượt', free: '🎁 Nhận lượt miễn phí' };
        function renderHist(list) {
            $('nc-tb-hist').innerHTML = list.length ? list.map(function (x) {
                return '<tr><td class="text-muted text-sm">' + esc(new Date(x.ts).toLocaleString('vi-VN')) + '</td><td><b>' + esc(x.user) + '</b></td>'
                    + '<td class="text-center"><span class="nc-res ' + esc(x.result === 'free' ? 'hit' : x.result) + '">' + (RES[x.result] || esc(x.result)) + (x.result === 'free' ? ' +' + (x.amount || 0) + ' lượt' : '') + (x.bonus ? ' · 🔥 chuỗi ' + x.streak : '') + '</span></td>'
                    + '<td class="text-center text-muted">' + (x.wind ? (x.wind > 0 ? '→ ' : '← ') + Math.abs(x.wind).toFixed(1) : '—') + '</td>'
                    + '<td class="text-right font-bold ' + (x.points > 0 ? 'text-success' : 'text-muted') + '">' + (x.result === 'free' ? '—' : x.points > 0 ? '+' + x.points : '0') + '</td></tr>';
            }).join('') : '<tr><td colspan="5" class="text-center text-muted py-8">Chưa có lượt ném nào.</td></tr>';
        }


        /* ---------- Gói đổi lượt ném: sửa các vật phẩm loại 'conThrows' trong settings/point_shop_config.items ---------- */
        var SHOP = db.collection('settings').doc('point_shop_config');
        var PK_DEF = [
            { id: 'nc_def1', icon: '🎯', name: '1 Lượt ném còn', type: 'conThrows', amount: 1, cost: 25, stock: null, dailyLimit: null, active: true },
            { id: 'nc_def5', icon: '🎯', name: 'Combo 5 lượt ném còn', type: 'conThrows', amount: 5, cost: 110, stock: null, dailyLimit: null, active: true },
            { id: 'nc_def10', icon: '🎯', name: 'Combo 10 lượt ném còn', type: 'conThrows', amount: 10, cost: 200, stock: null, dailyLimit: null, active: true }
        ];
        NC.pk = { cfg: null, counts: {}, dirty: false, isDef: false };
        function pkFromCfg(cfg) {
            var l = ((cfg && Array.isArray(cfg.items)) ? cfg.items : []).filter(function (x) { return x && x.type === 'conThrows'; });
            NC.pk.isDef = !l.length;
            return (l.length ? l : PK_DEF).map(function (x) { return JSON.parse(JSON.stringify(x)); });
        }
        function pkRow(x) {
            var v = function (n) { return n == null ? '' : n; };
            return '<tr data-id="' + esc(x.id) + '" class="' + (x.active === false ? 'off' : '') + '">'
                + '<td><input class="form-control pk-icon" maxlength="4" value="' + esc(x.icon || '🎯') + '"></td>'
                + '<td><input class="form-control pk-name" maxlength="50" value="' + esc(x.name || '') + '" placeholder="Tên gói"></td>'
                + '<td><input type="number" class="form-control pk-amount" min="1" step="1" value="' + esc(x.amount || 1) + '"></td>'
                + '<td><input type="number" class="form-control pk-cost" min="0" step="1" value="' + esc(x.cost == null ? 0 : x.cost) + '" style="font-weight: 700; color: var(--color-success);"></td>'
                + '<td><input type="number" class="form-control pk-stock" min="0" step="1" value="' + esc(v(x.stock)) + '" placeholder="∞"></td>'
                + '<td class="text-center pk-sold">' + (NC.pk.counts[x.id] || 0) + '</td>'
                + '<td><input type="number" class="form-control pk-daily" min="0" step="1" value="' + esc(v(x.dailyLimit)) + '" placeholder="∞"></td>'
                + '<td class="text-center"><input type="checkbox" class="pk-active"' + (x.active !== false ? ' checked' : '') + '></td>'
                + '<td class="text-center"><button class="btn-icon" style="width: 34px; height: 34px; color: var(--color-danger); border-color: rgba(239,68,68,.3);" title="Xóa gói" data-del><i class="fa-solid fa-trash-can"></i></button></td></tr>';
        }
        function pkRender(list) {
            $('nc-pk-body').innerHTML = list.length ? list.map(pkRow).join('') : '<tr><td colspan="9" class="text-center text-muted py-6">Chưa có gói nào: sân sẽ không bán lượt ném. Bấm "Thêm gói" hoặc "Gói mặc định".</td></tr>';
            pkDirty(NC.pk.dirty);
        }
        function pkDirty(on) {
            NC.pk.dirty = on;
            $('nc-pk-dirty').innerHTML = on ? '<span class="text-warning font-bold"><i class="fa-solid fa-triangle-exclamation"></i> Có thay đổi chưa lưu</span>'
                : NC.pk.isDef ? '<span class="text-muted">Đang dùng 3 gói mặc định (chưa lưu vào danh mục). Sửa rồi bấm "Lưu Gói" để dùng giá riêng.</span>' : '';
        }
        function pkNum(v) { v = String(v == null ? '' : v).trim(); if (v === '') return null; var n = parseInt(v, 10); return isNaN(n) || n < 0 ? NaN : n; }
        function pkRead() {
            var out = [], err = null;
            document.querySelectorAll('#nc-pk-body tr[data-id]').forEach(function (tr, i) {
                if (err) return;
                var g = function (c) { return tr.querySelector(c).value; };
                var x = { id: tr.getAttribute('data-id'), icon: (g('.pk-icon').trim() || '🎯').slice(0, 4), name: g('.pk-name').trim(), type: 'conThrows', amount: parseInt(g('.pk-amount'), 10),
                    cost: parseInt(g('.pk-cost'), 10), stock: pkNum(g('.pk-stock')), dailyLimit: pkNum(g('.pk-daily')), active: tr.querySelector('.pk-active').checked };
                if (!x.name) err = 'Tên gói dòng ' + (i + 1) + ' đang trống.';
                else if (isNaN(x.amount) || x.amount < 1) err = 'Số lượt dòng ' + (i + 1) + ' phải từ 1 trở lên.';
                else if (isNaN(x.cost) || x.cost < 0) err = 'Giá dòng ' + (i + 1) + ' không hợp lệ.';
                else if (Number.isNaN(x.stock) || Number.isNaN(x.dailyLimit)) err = 'Kho / giới hạn dòng ' + (i + 1) + ' không hợp lệ (để trống = không giới hạn).';
                out.push(x);
            });
            return err ? { err: err } : { list: out };
        }
        $('nc-pk-body').addEventListener('input', function () { pkDirty(true); });
        $('nc-pk-body').addEventListener('change', function (e) { if (e.target.classList.contains('pk-active')) e.target.closest('tr').classList.toggle('off', !e.target.checked); pkDirty(true); });
        $('nc-pk-body').addEventListener('click', function (e) {
            var b = e.target.closest('[data-del]'); if (!b) return;
            b.closest('tr').remove(); if (!document.querySelector('#nc-pk-body tr[data-id]')) pkRender([]); pkDirty(true);
        });
        $('nc-pk-add').onclick = function () {
            var body = $('nc-pk-body'); if (!body.querySelector('tr[data-id]')) body.innerHTML = '';
            body.insertAdjacentHTML('beforeend', pkRow({ id: 'nc' + Date.now().toString(36), icon: '🎯', name: '', type: 'conThrows', amount: 3, cost: 60, stock: null, dailyLimit: null, active: true }));
            pkDirty(true); var last = body.querySelector('tr[data-id]:last-child .pk-name'); if (last) last.focus();
        };
        $('nc-pk-def').onclick = function () { if (!qdOk('Đưa các gói về 3 gói mặc định? Bấm "Lưu Gói" để áp dụng.', function () { $('nc-pk-def').click(); }, { title: 'Về mặc định?', tone: 'warn', ok: 'Về mặc định' })) return; pkRender(PK_DEF.map(function (x) { return Object.assign({}, x); })); pkDirty(true); };
        $('nc-pk-save').onclick = function () {
            var r = pkRead(); if (r.err) return toast(r.err, 'warning');
            var btn = this; btn.disabled = true;
            db.runTransaction(function (t) {
                return t.get(SHOP).then(function (d) {
                    var items = ((d.exists && Array.isArray(d.data().items)) ? d.data().items : []).filter(function (x) { return x && x.type !== 'conThrows'; });
                    t.set(SHOP, { items: items.concat(r.list) }, { merge: true });
                });
            }).then(function () { NC.pk.isDef = false; pkDirty(false); toast('Đã lưu ' + r.list.length + ' gói đổi lượt ném!', 'success'); })
              .catch(function (e) { console.error(e); toast('Lỗi lưu gói đổi lượt ném.', 'error'); })
              .then(function () { btn.disabled = false; });
        };
        function shopStatus(on) { var s = $('nc-shop-status'); s.textContent = on ? 'SÂN ĐANG BÁN' : 'SÂN ĐANG ẨN CỬA HÀNG'; s.style.color = on ? 'var(--color-success)' : 'var(--color-danger)'; }
        $('nc-shop-on').addEventListener('change', function () {
            var on = this.checked; shopStatus(on);
            CFG.set({ shopEnabled: on, updatedAt: Date.now() }, { merge: true }).then(function () { toast(on ? 'Sân Ném Còn đã mở cửa hàng đổi lượt.' : 'Đã ẩn cửa hàng trong sân Ném Còn.', on ? 'success' : 'warning'); })
                .catch(function () { toast('Lỗi lưu trạng thái cửa hàng.', 'error'); });
        });
        NC.startShop = function () {
            SHOP.onSnapshot(function (d) { NC.pk.cfg = d.exists ? d.data() : {}; if (!NC.pk.dirty) pkRender(pkFromCfg(NC.pk.cfg)); }, function (e) { console.warn('point_shop_config', e); });
            db.collection('point_shop_stock').doc('counts').onSnapshot(function (d) {
                NC.pk.counts = (d.exists && d.data().counts) || {};
                document.querySelectorAll('#nc-pk-body tr[data-id]').forEach(function (tr) { tr.querySelector('.pk-sold').textContent = NC.pk.counts[tr.getAttribute('data-id')] || 0; });
            }, function () {});
        };

        /* ---------- Khởi động khi mở mục ---------- */
        NC.start = function () {
            if (NC.started) return; NC.started = true;
            NC.startShop();
            CFG.onSnapshot(function (d) { NC.cfg = d.exists ? d.data() : null; if (!NC.dirty) fill(); else { $('nc-enabled').checked = norm(NC.cfg).enabled; statusText(norm(NC.cfg).enabled); $('nc-shop-on').checked = norm(NC.cfg).shopEnabled; shopStatus(norm(NC.cfg).shopEnabled); } },
                function (e) { console.warn('con_config', e); fill(); });
            db.collection('con_stats').onSnapshot(function (snap) { NC.stats = []; snap.forEach(function (d) { NC.stats.push(d.data()); }); renderStats(); }, function (e) { console.warn('con_stats', e); });
            db.collection('con_history').orderBy('ts', 'desc').limit(60).onSnapshot(function (snap) { var l = []; snap.forEach(function (d) { l.push(d.data()); }); renderHist(l); },
                function (e) { console.warn('con_history', e); $('nc-tb-hist').innerHTML = '<tr><td colspan="5" class="text-center text-muted py-8">Không tải được lịch sử.</td></tr>'; });
            loadUsers();
        };
        function hook() {
            if (typeof UI === 'undefined' || !UI.navigate || UI.navigate.__nc) return;
            var base = UI.navigate;
            UI.navigate = function (v) { var r = base.apply(this, arguments); if (v === 'nemcon' && document.getElementById('view-nemcon').classList.contains('active')) NC.start(); return r; };
            UI.navigate.__nc = true;
        }
        hook(); document.addEventListener('DOMContentLoaded', hook); setInterval(hook, 3000);   // các lớp khác có thể bọc lại UI.navigate sau khi đăng nhập
        if (document.getElementById('view-nemcon').classList.contains('active')) NC.start();
    })();
    
