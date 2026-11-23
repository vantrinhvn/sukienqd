    /* ===== ADMIN > QUÀ TOÀN HỆ THỐNG =====
       gifts/{id}: title, icon, msg, items{points,tickets,spins,conThrows}, startAt, endAt (ms), enabled, maxClaims, who ('all'|'old'),
                   claimCount, sum{...}, createdAt, createdBy, updatedAt, updatedBy
       gift_claims/{giftId__accountId}: giftId, giftTitle, user, userId, fullName, items, at  (thành viên tự tạo khi mở quà, mỗi người 1 lần) */
    window.SysGiftAdmin = (function () {
        'use strict';
        var $ = function (id) { return document.getElementById(id); }, VN = 7 * 3600e3;
        var ICONS = ['🎁', '🧧', '🏮', '🎆', '🌸', '💰', '🏆', '🎉'];
        var ITEMS = [['points', '💰', 'điểm lì xì'], ['tickets', '🧧', 'lượt rút lì xì'], ['spins', '🎡', 'lượt vòng quay'], ['conThrows', '🎯', 'lượt ném còn']];
        var G = [], icon = '🎁', started = false, armDel = {}, RP = { id: null, tab: 'got', claims: [], accs: null, unsub: null };
        function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        function me() { try { return (typeof State !== 'undefined' && State.currentUser) || 'admin'; } catch (e) { return 'admin'; } }
        function toast(m, k) { try { Utils.toast(m, k); } catch (e) {} }
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        function toInput(ts) { var d = new Date(ts + VN); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
        function fromInput(v) { var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || ''); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) - VN : 0; }
        function fmt(ts) { if (!ts) return '—'; var d = new Date(ts + VN); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' ' + pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); }
        function dayStart(ts) { var d = new Date(ts + VN); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - VN; }
        function itemsOf(o) { var r = {}; ITEMS.forEach(function (it) { var n = Math.max(0, Math.floor(+((o || {})[it[0]]) || 0)); if (n) r[it[0]] = n; }); return r; }
        function chips(items) { var h = ITEMS.filter(function (it) { return items[it[0]]; }).map(function (it) { return '<span class="gf-chip">' + it[1] + ' +' + Number(items[it[0]]).toLocaleString('vi-VN') + ' ' + it[2] + '</span>'; }).join(''); return h || '<span class="text-muted text-sm">Chưa có vật phẩm</span>'; }
        function state(g, now) {
            now = now || Date.now();
            if (g.enabled === false) return ['off', 'Đã tắt'];
            if (g.maxClaims && (g.claimCount || 0) >= g.maxClaims) return ['full', 'Hết quà'];
            if (now < g.startAt) return ['soon', 'Sắp mở'];
            if (now > g.endAt) return ['done', 'Đã kết thúc'];
            return ['live', 'Đang phát'];
        }
        function log(action, g) { try { db.collection('admin_logs').add({ type: 'gift', action: action, user: '(quà toàn hệ thống)', detail: (g && g.title) || '', by: me(), timestamp: Date.now() }).catch(function () {}); } catch (e) {} }

        /* ---------- Danh sách ---------- */
        function draw() {
            var now = Date.now(), live = 0, soon = 0, all = 0;
            G.forEach(function (g) { var s = state(g, now)[0]; if (s === 'live') live++; if (s === 'soon') soon++; all += g.claimCount || 0; });
            $('gf-s-live').textContent = live; $('gf-s-soon').textContent = soon; $('gf-s-all').textContent = all.toLocaleString('vi-VN');
            if (!G.length) { $('gf-list').innerHTML = '<div class="card text-center text-muted py-8 gf-empty">Chưa có món quà nào. Bấm <b>Tạo quà mới</b> để tặng quà cho toàn hệ thống.</div>'; return; }
            $('gf-list').innerHTML = G.map(function (g) {
                var st = state(g, now), n = g.claimCount || 0, pct = g.maxClaims ? Math.min(100, Math.round(n * 100 / g.maxClaims)) : 0;
                return '<div class="card gf-card ' + st[0] + '"><div class="top"><span class="ic">' + esc(g.icon || '🎁') + '</span><div style="min-width:0;flex:1"><h4>' + esc(g.title || 'Quà') + '</h4>'
                    + '<div class="when">🕘 ' + fmt(g.startAt) + ' → ' + fmt(g.endAt) + (g.who === 'old' ? ' · tài khoản cũ' : '') + '</div></div><span class="gf-st ' + st[0] + '">' + st[1] + '</span></div>'
                    + (g.msg ? '<div class="text-sm text-muted" style="line-height:1.5">' + esc(g.msg) + '</div>' : '')
                    + '<div class="gf-chips">' + chips(g.items || {}) + '</div>'
                    + '<div class="gf-meta"><span>🎉 ' + n.toLocaleString('vi-VN') + ' người đã nhận</span><span>' + (g.maxClaims ? 'giới hạn ' + g.maxClaims.toLocaleString('vi-VN') : 'không giới hạn') + '</span></div>'
                    + (g.maxClaims ? '<div class="gf-bar"><i style="width:' + pct + '%"></i></div>' : '')
                    + '<div class="gf-acts"><button type="button" class="btn btn-primary" onclick="SysGiftAdmin.report(\'' + g.id + '\')"><i class="fa-solid fa-chart-column mr-1"></i> Báo cáo</button>'
                    + '<button type="button" class="btn btn-outline" onclick="SysGiftAdmin.edit(\'' + g.id + '\')"><i class="fa-solid fa-pen mr-1"></i> Sửa</button>'
                    + '<button type="button" class="btn btn-outline" onclick="SysGiftAdmin.toggle(\'' + g.id + '\')">' + (g.enabled === false ? '▶ Bật' : '⏸ Tắt') + '</button>'
                    + '<button type="button" class="btn btn-outline" data-del="' + g.id + '" onclick="SysGiftAdmin.del(\'' + g.id + '\', this)"><i class="fa-solid fa-trash mr-1"></i> Xóa</button></div></div>';
            }).join('');
        }
        function listen() {
            db.collection('gifts').onSnapshot(function (snap) {
                G = snap.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }).sort(function (a, b) { return (b.startAt || 0) - (a.startAt || 0); });
                draw(); if (RP.id) rpSum();
            }, function (e) { $('gf-list').innerHTML = '<div class="card text-center text-muted py-8 gf-empty">Không đọc được danh sách quà: ' + esc(e.message || e.code) + '</div>'; });
            db.collection('gift_claims').where('at', '>=', dayStart(Date.now())).onSnapshot(function (s) { $('gf-s-today').textContent = s.size.toLocaleString('vi-VN'); }, function () {});
            setInterval(function () { var v = $('view-gifts'); if (v && v.classList.contains('active')) draw(); }, 30000);
        }

        /* ---------- Soạn / sửa ---------- */
        function drawIcons() { $('gf-icons').innerHTML = ICONS.map(function (i) { return '<button type="button" class="' + (i === icon ? 'on' : '') + '" onclick="SysGiftAdmin.icon(\'' + i + '\')" aria-label="Biểu tượng ' + i + '">' + i + '</button>'; }).join(''); }
        function readForm() {
            var items = {}; ITEMS.forEach(function (it) { items[it[0]] = $('gf-i-' + it[0]).value; });
            return { title: $('gf-title').value.trim().slice(0, 60), msg: $('gf-msg').value.trim().slice(0, 240), icon: icon, items: itemsOf(items),
                startAt: fromInput($('gf-start').value), endAt: fromInput($('gf-end').value), maxClaims: Math.max(0, parseInt($('gf-max').value, 10) || 0), who: $('gf-who').value, enabled: $('gf-on').checked };
        }
        function preview() {
            var f = readForm();
            $('gf-preview').innerHTML = '<div class="h"><i>' + esc(f.icon) + '</i><span>' + esc(f.title || 'Tên món quà') + '</span></div>' + (f.msg ? '<p>' + esc(f.msg) + '</p>' : '<p>Thành viên thấy hộp quà này ở Trang Chủ.</p>') + '<div class="gf-chips">' + chips(f.items) + '</div>';
        }
        function edit(id) {
            var g = id ? G.filter(function (x) { return x.id === id; })[0] : null, now = Date.now();
            $('gf-id').value = g ? g.id : '';
            $('gf-ed-title').textContent = g ? 'Sửa quà: ' + (g.title || '') : 'Tạo quà mới';
            $('gf-ed-note').innerHTML = g && g.claimCount ? '⚠️ Đã có <b>' + g.claimCount + '</b> người nhận. Đổi vật phẩm chỉ áp dụng cho người nhận sau; người đã nhận không nhận lại.' : 'Thành viên thấy nút quà 🎁 ở Trang Chủ trong khoảng thời gian bạn đặt, mỗi người nhận đúng 1 lần.';
            $('gf-title').value = g ? g.title || '' : ''; $('gf-msg').value = g ? g.msg || '' : '';
            icon = g && g.icon ? g.icon : '🎁'; drawIcons();
            ITEMS.forEach(function (it) { $('gf-i-' + it[0]).value = g && g.items ? g.items[it[0]] || 0 : (it[0] === 'points' ? 100 : 0); });
            $('gf-start').value = toInput(g ? g.startAt : Math.ceil(now / 300000) * 300000);
            $('gf-end').value = toInput(g ? g.endAt : dayStart(now) + 7 * 864e5 + 86340000);
            $('gf-max').value = g ? g.maxClaims || 0 : 0; $('gf-who').value = g && g.who === 'old' ? 'old' : 'all'; $('gf-on').checked = !g || g.enabled !== false;
            $('gf-save').innerHTML = g ? '<i class="fa-solid fa-save mr-2"></i> Lưu thay đổi' : '<i class="fa-solid fa-paper-plane mr-2"></i> Lưu &amp; phát quà';
            $('gf-editor').style.display = ''; preview();
            $('gf-editor').scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(function () { $('gf-title').focus(); }, 350);
        }
        function cancel() { $('gf-editor').style.display = 'none'; }
        function preset(k) {
            var now = Date.now(), ds = dayStart(now);
            if (k === 'now') { $('gf-start').value = toInput(Math.floor(now / 60000) * 60000); if (fromInput($('gf-end').value) <= now) $('gf-end').value = toInput(ds + 86340000); }
            else if (k === 'today') { $('gf-start').value = toInput(Math.floor(now / 60000) * 60000); $('gf-end').value = toInput(ds + 86340000); }
            else if (k === '3d' || k === '7d') { $('gf-start').value = toInput(Math.floor(now / 60000) * 60000); $('gf-end').value = toInput(ds + (k === '3d' ? 2 : 6) * 864e5 + 86340000); }
            else if (k === 'tet') { var t = Date.UTC(2027, 1, 6) - VN; $('gf-start').value = toInput(t); $('gf-end').value = toInput(t + 2 * 864e5 + 86340000); }   // Mùng 1 Tết Đinh Mùi = 06/02/2027
            preview();
        }
        async function save() {
            var f = readForm(), id = $('gf-id').value;
            if (!f.title) return toast('Nhập tên món quà.', 'warning');
            if (!Object.keys(f.items).length) return toast('Quà cần ít nhất 1 vật phẩm (điểm hoặc lượt).', 'warning');
            if (!f.startAt || !f.endAt) return toast('Chọn đủ thời gian mở và đóng.', 'warning');
            if (f.endAt <= f.startAt) return toast('Thời gian đóng phải sau thời gian mở.', 'warning');
            if (f.endAt < Date.now()) return toast('Thời gian đóng đã qua — quà sẽ không ai nhận được.', 'warning');
            var b = $('gf-save'); b.disabled = true;
            try {
                f.updatedAt = Date.now(); f.updatedBy = me();
                if (id) await db.collection('gifts').doc(id).update(f);
                else { f.createdAt = f.updatedAt; f.createdBy = me(); f.claimCount = 0; await db.collection('gifts').add(f); }
                log(id ? 'update' : 'create', f);
                toast(id ? 'Đã lưu thay đổi quà.' : (f.startAt <= Date.now() ? '🎁 Đã phát quà — thành viên đang online thấy ngay.' : '🎁 Đã hẹn giờ phát quà lúc ' + fmt(f.startAt) + '.'), 'success');
                cancel();
            } catch (e) { toast('Lưu không được: ' + (e.message || e.code || e), 'error'); }
            finally { b.disabled = false; }
        }
        async function toggle(id) {
            var g = G.filter(function (x) { return x.id === id; })[0]; if (!g) return;
            try { await db.collection('gifts').doc(id).update({ enabled: g.enabled === false, updatedAt: Date.now(), updatedBy: me() }); log(g.enabled === false ? 'enable' : 'disable', g); toast(g.enabled === false ? 'Đã bật quà.' : 'Đã tắt quà.', 'success'); }
            catch (e) { toast('Không đổi được: ' + (e.message || e.code), 'error'); }
        }
        async function del(id, b) {
            var g = G.filter(function (x) { return x.id === id; })[0]; if (!g) return;
            var now = Date.now();
            if (!(armDel[id] && now - armDel[id] < 4000)) {
                armDel[id] = now; b.classList.add('arm'); b.innerHTML = 'Bấm lần nữa để xóa';
                setTimeout(function () { if (armDel[id] === now) { armDel[id] = 0; b.classList.remove('arm'); b.innerHTML = '<i class="fa-solid fa-trash mr-1"></i> Xóa'; } }, 4000);
                return;
            }
            try { await db.collection('gifts').doc(id).delete(); log('delete', g); toast('Đã xóa quà. Lịch sử nhận quà vẫn giữ trong báo cáo xuất trước đó.', 'success'); if (RP.id === id) closeReport(); }
            catch (e) { toast('Không xóa được: ' + (e.message || e.code), 'error'); }
        }

        /* ---------- Báo cáo ---------- */
        function report(id) {
            if (RP.unsub) { RP.unsub(); RP.unsub = null; }
            RP.id = id; RP.claims = []; RP.tab = 'got'; $('gf-rp-q').value = '';
            $('gf-report').style.display = ''; rpSum(); rpDraw();
            RP.unsub = db.collection('gift_claims').where('giftId', '==', id).onSnapshot(function (s) {
                RP.claims = s.docs.map(function (d) { return d.data(); }).sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
                rpSum(); rpDraw();
            }, function (e) { $('gf-rp-body').innerHTML = '<tr><td colspan="6" class="text-center text-muted py-8">Không đọc được: ' + esc(e.message || e.code) + '</td></tr>'; });
            if (!RP.accs) db.collection('accounts').get().then(function (s) { RP.accs = s.docs.map(function (d) { var a = d.data() || {}; return { u: a.user, name: a.fullName || a.name || '', role: a.role || '', blocked: a.isBlocked === true, created: +a.created_at || 0, la: +a.lastActive || 0 }; }).filter(function (a) { return a.u; }); rpSum(); rpDraw(); });
            setTimeout(function () { $('gf-report').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
        }
        function closeReport() { if (RP.unsub) { RP.unsub(); RP.unsub = null; } RP.id = null; $('gf-report').style.display = 'none'; }
        function eligible(g) {
            return (RP.accs || []).filter(function (a) { return !a.blocked && !(g.who === 'old' && a.created && a.created >= g.startAt); });   // mọi tài khoản đang hoạt động (kể cả BQT) — giống bên thành viên
        }
        function rpSum() {
            var g = G.filter(function (x) { return x.id === RP.id; })[0]; if (!g) return;
            var c = RP.claims, tot = {}; c.forEach(function (x) { Object.keys(x.items || {}).forEach(function (k) { tot[k] = (tot[k] || 0) + (+x.items[k] || 0); }); });
            var el = RP.accs ? eligible(g) : null, got = {}; c.forEach(function (x) { got[x.user] = 1; });
            var notN = el ? el.filter(function (a) { return !got[a.u]; }).length : null;
            $('gf-rp-title').textContent = 'Báo cáo: ' + (g.icon || '🎁') + ' ' + (g.title || '');
            $('gf-rp-sum').innerHTML = '<div><small>Đã nhận</small><b>' + c.length.toLocaleString('vi-VN') + (el ? ' / ' + el.length.toLocaleString('vi-VN') : '') + '</b></div>'
                + '<div><small>Chưa nhận</small><b>' + (notN == null ? '…' : notN.toLocaleString('vi-VN')) + '</b></div>'
                + '<div><small>Người nhận đầu tiên</small><b style="font-size:15px">' + (c[0] ? esc(c[0].user) + ' · ' + fmt(c[0].at).slice(0, 5) : '—') + '</b></div>'
                + ITEMS.filter(function (it) { return tot[it[0]]; }).map(function (it) { return '<div><small>Đã phát ' + it[2] + '</small><b>' + it[1] + ' ' + tot[it[0]].toLocaleString('vi-VN') + '</b></div>'; }).join('');
            $('gf-rp-tab-got').classList.toggle('on', RP.tab === 'got'); $('gf-rp-tab-not').classList.toggle('on', RP.tab === 'not');
            $('gf-rp-tab-got').textContent = '✅ Đã nhận (' + c.length + ')'; $('gf-rp-tab-not').textContent = '⏳ Chưa nhận' + (notN == null ? '' : ' (' + notN + ')');
        }
        function rows() {
            var g = G.filter(function (x) { return x.id === RP.id; })[0]; if (!g) return [];
            var q = $('gf-rp-q').value.trim().toLowerCase(), m = function (u, n) { return !q || String(u).toLowerCase().indexOf(q) >= 0 || String(n || '').toLowerCase().indexOf(q) >= 0; };
            if (RP.tab === 'got') return RP.claims.filter(function (x) { return m(x.user, x.fullName); }).map(function (x, i) { return [i + 1, fmt(x.at), x.user, x.fullName || '', ITEMS.filter(function (it) { return (x.items || {})[it[0]]; }).map(function (it) { return it[1] + ' +' + x.items[it[0]]; }).join('  '), '']; });
            var got = {}; RP.claims.forEach(function (x) { got[x.user] = 1; });
            return eligible(g).filter(function (a) { return !got[a.u] && m(a.u, a.name); }).sort(function (a, b) { return b.la - a.la; }).map(function (a, i) { return [i + 1, '', a.u, a.name, '', a.la ? fmt(a.la) : 'Chưa từng hoạt động']; });
        }
        function rpDraw() {
            if (!RP.id) return;
            var got = RP.tab === 'got';
            $('gf-rp-head').innerHTML = got ? '<tr><th>#</th><th>Thời gian nhận</th><th>Tài khoản</th><th>Họ tên</th><th>Vật phẩm đã nhận</th></tr>' : '<tr><th>#</th><th>Tài khoản</th><th>Họ tên</th><th>Hoạt động gần nhất</th></tr>';
            if (!got && !RP.accs) { $('gf-rp-body').innerHTML = '<tr><td colspan="4" class="text-center text-muted py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang tải danh sách thành viên...</td></tr>'; return; }
            var r = rows();
            $('gf-rp-body').innerHTML = r.length ? r.map(function (x) { return got ? '<tr><td>' + x[0] + '</td><td>' + esc(x[1]) + '</td><td><b>' + esc(x[2]) + '</b></td><td>' + esc(x[3]) + '</td><td>' + esc(x[4]) + '</td></tr>' : '<tr><td>' + x[0] + '</td><td><b>' + esc(x[2]) + '</b></td><td>' + esc(x[3]) + '</td><td>' + esc(x[5]) + '</td></tr>'; }).join('')
                : '<tr><td colspan="5" class="text-center text-muted py-8">' + (got ? 'Chưa có ai nhận quà này.' : 'Tất cả thành viên đã nhận quà 🎉') + '</td></tr>';
        }
        function rpTab(t) { RP.tab = t; rpSum(); rpDraw(); }
        function exportCsv() {
            var g = G.filter(function (x) { return x.id === RP.id; })[0]; if (!g) return;
            var got = RP.tab === 'got', r = rows(), q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
            var head = got ? ['STT', 'Thời gian nhận', 'Tài khoản', 'Họ tên', 'Vật phẩm'] : ['STT', 'Tài khoản', 'Họ tên', 'Hoạt động gần nhất'];
            if (window.QDXlsx) {   // Excel .xlsx đẹp: tiêu đề màu, tóm tắt, bảng có nút lọc
                var fnm = 'qua_' + (g.title || 'qua').replace(/[^\wÀ-ỹ]+/g, '_').slice(0, 40) + '_' + (got ? 'da_nhan' : 'chua_nhan');
                QDXlsx.download(fnm, { color: got ? '#16a34a' : '#d97706', sheets: [{ name: got ? 'Đã nhận' : 'Chưa nhận', title: (got ? 'DANH SÁCH ĐÃ NHẬN QUÀ · ' : 'DANH SÁCH CHƯA NHẬN QUÀ · ') + String(g.title || 'Quà').toUpperCase(),
                    subtitle: 'Quân Đoàn T"L"Headshot · QD Elite · Xuất lúc ' + new Date().toLocaleString('vi-VN'),
                    blocks: [{ type: 'kpi', items: [[got ? 'Đã nhận' : 'Chưa nhận', r.length.toLocaleString('vi-VN'), 'thành viên' + ($('gf-rp-q').value.trim() ? ' (lọc “' + $('gf-rp-q').value.trim() + '”)' : '')]] },
                        { type: 'table', main: true, cols: got ? [{ h: 'STT', t: 'c' }, { h: 'Thời gian nhận', t: 'c' }, { h: 'Tài khoản' }, { h: 'Họ tên' }, { h: 'Vật phẩm' }] : [{ h: 'STT', t: 'c' }, { h: 'Tài khoản' }, { h: 'Họ tên' }, { h: 'Hoạt động gần nhất', t: 'c' }],
                            rows: r.map(function (x) { return got ? [x[0], x[1], x[2], x[3], x[4]] : [x[0], x[2], x[3], x[5]]; }) }] }] });
                toast('Đã xuất file Excel ' + (got ? 'danh sách đã nhận' : 'danh sách chưa nhận') + '.', 'success');
                return;
            }
            var lines = [head.map(q).join(',')].concat(r.map(function (x) { return (got ? [x[0], x[1], x[2], x[3], x[4]] : [x[0], x[2], x[3], x[5]]).map(q).join(','); }));
            var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = 'qua_' + (g.title || 'qua').replace(/[^\wÀ-ỹ]+/g, '_').slice(0, 40) + '_' + (got ? 'da_nhan' : 'chua_nhan') + '.csv';
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
            toast('Đã xuất file ' + (got ? 'danh sách đã nhận' : 'danh sách chưa nhận') + '.', 'success');
        }

        function start() {
            if (started) return; started = true; listen(); drawIcons();
            ['gf-title', 'gf-msg', 'gf-i-points', 'gf-i-tickets', 'gf-i-spins', 'gf-i-conThrows'].forEach(function (id) { $(id).addEventListener('input', preview); });
        }
        var w = setInterval(function () { var sh = $('app-shell'); try { if (State.currentUser && sh && sh.style.display === 'flex') { clearInterval(w); start(); } } catch (e) {} }, 1000);

        /* ---------- Hộp "Xuất Báo Cáo" dùng chung (giống các mục quản lý khác): lọc ngày, tìm thành viên, tóm tắt, biểu đồ, xếp hạng, Excel / CSV / PDF ---------- */
        if (window.QDReport && QDReport.add) {
            var n0 = function (v) { return Number(v) || 0; }, fv = function (n) { return Number(n || 0).toLocaleString('vi-VN'); };
            var sumK = function (r, k) { return r.reduce(function (a, x) { return a + n0((x.items || {})[k]); }, 0); };
            QDReport.add({ id: 'giftsys', view: 'gifts', name: 'Quà Toàn Hệ Thống', icon: 'fa-box-open', color: '#e11d48', file: 'Qua_Toan_He_Thong', col: 'gift_claims',
                load: function () { return db.collection('gift_claims').get().then(function (s) { var a = []; s.forEach(function (x) { var v = x.data(); v.__id = x.id; a.push(v); }); return a.sort(function (x, y) { return n0(y.at) - n0(x.at); }); }); },
                time: function (x) { return x.at; }, who: function (x) { return x.user; },
                cols: [['Thời gian nhận', function (x) { return fmt(x.at); }], ['Thành viên', function (x) { return x.user; }], ['Họ tên', function (x) { return x.fullName || ''; }], ['Món quà', function (x) { return x.giftTitle || ''; }],
                    ['Điểm lì xì', function (x) { return n0((x.items || {}).points); }, 'n'], ['Lượt rút lì xì', function (x) { return n0((x.items || {}).tickets); }, 'n'],
                    ['Lượt vòng quay', function (x) { return n0((x.items || {}).spins); }, 'n'], ['Lượt ném còn', function (x) { return n0((x.items || {}).conThrows); }, 'n']],
                kpi: function (r) {
                    var gifts = {}; r.forEach(function (x) { gifts[x.giftId] = 1; });
                    return [['Điểm lì xì đã phát', fv(sumK(r, 'points')), 'qua ' + fv(r.length) + ' lượt nhận'],
                        ['Lượt đã phát', fv(sumK(r, 'tickets') + sumK(r, 'spins') + sumK(r, 'conThrows')), fv(sumK(r, 'tickets')) + ' rút · ' + fv(sumK(r, 'spins')) + ' quay · ' + fv(sumK(r, 'conThrows')) + ' ném'],
                        ['Số món quà', fv(Object.keys(gifts).length), 'có người nhận trong kỳ']];
                },
                brk: ['Theo món quà', function (x) { return x.giftTitle || '—'; }], rank: ['Nhận nhiều quà nhất', 'lần'] });
        }

        return { edit: edit, cancel: cancel, save: save, toggle: toggle, del: del, preset: preset, report: report, closeReport: closeReport, rpTab: rpTab, rpDraw: rpDraw, exportCsv: exportCsv,
            icon: function (i) { icon = i; drawIcons(); preview(); } };
    })();
    
