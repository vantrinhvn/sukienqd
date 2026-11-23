    /* ===== Admin > Máy chủ VPS: tài nguyên (CPU / RAM / ổ đĩa / mạng), dữ liệu (xem / sửa / xóa / xuất),
       sao lưu (tạo / tải về / tải lên khôi phục), kết nối, nhật ký, khởi động lại, cập nhật máy chủ.
       Chỉ hiện khi trang đang chạy máy chủ VPS (QD_BACKEND = 'vps') và chỉ Admin dùng được (máy chủ kiểm tra lại). ===== */
    (function () {
        var $ = function (id) { return document.getElementById(id); }, W = window;
        var E = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var on = W.QD_BACKEND === 'vps';
        document.body.classList.toggle('qvps-on', on);
        if (!on) return;
        var A = function (fn, args) { return W.QDdb.admin(fn, args); };
        var toast = function (m, t) { try { Utils.toast(m, t || 'info'); } catch (e) {} };
        var ask = function (o) { return W.qdAsk ? W.qdAsk(o) : Promise.resolve(confirm(o.text || o.title)); };
        function B(n) { n = +n || 0; var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return (i ? n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) : n) + ' ' + u[i]; }
        function rate(n) { return B(n) + '/s'; }
        function dur(s) { s = +s || 0; var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? d + ' ngày ' : '') + (d || h ? h + ' giờ ' : '') + m + ' phút'; }
        function tm(t) { if (!t) return '—'; var d = new Date(t), p = function (x) { return ('0' + x).slice(-2); }; return p(d.getHours()) + ':' + p(d.getMinutes()) + ' ' + p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(); }
        function tone(p) { return p >= 85 ? '#ef4444' : p >= 65 ? '#f59e0b' : '#22c55e'; }
        function spark(arr, max, color) {
            var v = arr.filter(function (x) { return x != null; }); if (v.length < 2) return '';
            var mx = max || Math.max.apply(null, v.concat([1])), n = arr.length, pts = arr.map(function (x, i) { return (i / (n - 1) * 100).toFixed(2) + ',' + (40 - (x || 0) / mx * 36).toFixed(2); }).join(' ');
            return '<svg viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="1.6" vector-effect="non-scaling-stroke"/><polygon points="0,40 ' + pts + ' 100,40" fill="' + color + '" opacity=".12"/></svg>';
        }

        /* ---------------- Tài nguyên ---------------- */
        var H = [], S = null, lastT = 0, pingMs = null, speed = null, timer = 0, active = false;
        function card(icon, lb, val, sub, meterPct, sp, extra) {
            return '<div class="qv-card"><div class="lb">' + icon + ' ' + lb + '</div><div class="val">' + val + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') +
                (meterPct != null ? '<div class="meter"><i style="width:' + Math.min(100, meterPct).toFixed(1) + '%;background:' + tone(meterPct) + '"></i></div>' : '') + (extra || '') + (sp || '') + '</div>';
        }
        function paint() {
            if (!S) return;
            var last = H[H.length - 1] || {}, mem = S.mem || {}, used = (mem.total || 0) - (mem.avail || 0), memPct = mem.total ? used / mem.total * 100 : 0;
            var disk = S.disk, diskUsed = disk ? disk.total - disk.free : 0, diskPct = disk && disk.total ? diskUsed / disk.total * 100 : null;
            var cpu = last.cpu == null ? 0 : last.cpu, col = function (k) { return H.slice(-90).map(function (h) { return h[k]; }); };
            $('qv-grid').innerHTML = [
                card('<i class="fa-solid fa-microchip"></i>', 'CPU', cpu.toFixed(0) + '<small> %</small>', S.cores + ' nhân · tải ' + S.load.map(function (x) { return x.toFixed(2); }).join(' / '), cpu, spark(col('cpu'), 100, '#06b6d4')),
                card('<i class="fa-solid fa-memory"></i>', 'RAM', B(used) + ' <small>/ ' + B(mem.total) + '</small>', 'Máy chủ QD dùng ' + B(S.proc.rss) + (mem.swapTotal ? ' · swap ' + B(mem.swapTotal - mem.swapFree) + ' / ' + B(mem.swapTotal) : ''), memPct, spark(col('mem'), 100, '#a855f7')),
                card('<i class="fa-solid fa-hard-drive"></i>', 'Ổ đĩa', disk ? B(diskUsed) + ' <small>/ ' + B(disk.total) + '</small>' : '—', disk ? 'Còn trống ' + B(disk.free) : '', diskPct, ''),
                card('<i class="fa-solid fa-network-wired"></i>', 'Mạng', '↓ ' + rate(last.rx) + '<br><small style="font-size:15px">↑ ' + rate(last.tx) + '</small>', S.net ? 'Từ lúc bật VPS: ↓ ' + B(S.net.rxTotal) + ' · ↑ ' + B(S.net.txTotal) : '', null, spark(col('rx'), 0, '#22c55e')),
                card('<i class="fa-solid fa-gauge-high"></i>', 'Tốc độ tới VPS', pingMs == null ? '—' : pingMs + '<small> ms</small>', speed ? 'Tải xuống <b>' + speed.down + ' Mbps</b>' + (speed.up ? ' · tải lên <b>' + speed.up + ' Mbps</b>' : '') : 'Độ trễ từ máy bạn tới VPS', null, '', '<div class="tool"><button type="button" class="qv-btn sm" id="qv-speed"><i class="fa-solid fa-bolt"></i> Đo tốc độ</button></div>'),
                card('<i class="fa-solid fa-database"></i>', 'Dữ liệu', S.db.docs.toLocaleString('vi-VN') + '<small> tài liệu</small>', S.db.cols + ' bộ sưu tập · tệp ' + B(S.db.file), null, ''),
                card('<i class="fa-solid fa-users"></i>', 'Đang kết nối', S.conns + '<small> kết nối</small>', S.users + ' tài khoản · ' + S.subs + ' luồng nghe trực tiếp', null, spark(col('conns'), 0, '#f59e0b')),
                card('<i class="fa-solid fa-arrow-right-arrow-left"></i>', 'Đọc / ghi', (last.r || 0) + '<small> đọc/s</small> · ' + (last.w || 0) + '<small> ghi/s</small>', 'Không giới hạn lượt như Firebase', null, spark(col('r'), 0, '#38bdf8')),
                card('<i class="fa-solid fa-clock"></i>', 'Thời gian chạy', dur(S.uptime), 'VPS bật được ' + dur(S.sysUptime), null, '')
            ].join('');
            $('qv-info').innerHTML = 'Máy chủ <b>' + E(S.ver) + '</b> · ' + E(S.host) + ' · ' + E(S.os) + ' · Node ' + E(S.node) + ' · ' + E(S.cpuModel) + ' · <a href="' + E(W.QDdb.http) + '/health" target="_blank" rel="noopener" style="color:#67e8f9">' + E(W.QDdb.http.replace(/^https?:\/\//, '')) + '</a>';
            var sb = $('qv-speed'); if (sb) sb.onclick = speedTest;
        }
        function pill(ok, txt) { var p = $('qv-pill'); p.className = 'qv-pill ' + (ok ? 'ok' : 'bad'); p.querySelector('b').textContent = txt; }
        function tick() {
            if (!active || document.hidden) return;
            A('stats', { since: lastT }).then(function (s) {
                S = s; (s.hist || []).forEach(function (h) { H.push(h); }); if (H.length > 900) H.splice(0, H.length - 900); if (H.length) lastT = H[H.length - 1].t;
                $('qv-sub').textContent = 'Cập nhật ' + tm(s.now) + ' · tự làm mới 3 giây / lần'; pill(true, 'Đang chạy'); $('qv-alert').hidden = true; paint();
            }).catch(function (e) {
                pill(false, 'Lỗi'); var al = $('qv-alert'); al.hidden = false; al.className = 'qv-alert';
                al.innerHTML = e && /Lệnh lạ/.test(e.message || '') ? '⚠️ Máy chủ VPS đang chạy <b>bản cũ (bản 1)</b>, chưa có phần quản trị, chưa có bảo vệ mật khẩu và nút "Cập nhật máy chủ" chưa dùng được.<br>Vào VPS (Termius) gõ đúng 1 lệnh: <code style="background:#0b1220;padding:2px 8px;border-radius:6px;color:#67e8f9">qd update</code> rồi tải lại trang này.' : e && e.code === 'permission-denied' ? (function () { var w = W.QDdb.who(); return '🔒 Chỉ tài khoản <b>Admin</b> (vai trò admin) dùng được mục này. Máy chủ đang nhận bạn là: <b>' + (w.u ? '@' + E(w.u) + ' · vai trò ' + E(w.role || 'thành viên') : 'chưa đăng nhập (phiên cũ đã hết)') + '</b>.<br>Bấm <a href="#" onclick="try{QDdb.logout()}catch(e){};try{localStorage.removeItem(\'qd_admin_sess\')}catch(e){};setTimeout(function(){location.reload()},300);return false" style="color:#fca5a5;text-decoration:underline;font-weight:700">Đăng nhập lại</a> bằng tài khoản Admin (tạo / đổi mật khẩu trên VPS: <code>qd admin admin MatKhau</code>).'; })() : '❌ Không lấy được thông tin máy chủ: ' + E((e && (e.message || e.code)) || 'mất kết nối') + '. Kiểm tra VPS còn chạy không (gõ <b>qd status</b> trên VPS).';
            });
            W.QDdb.ping().then(function (ms) { pingMs = ms; }).catch(function () {});
        }
        function speedTest() {
            var b = $('qv-speed'); if (b) { b.disabled = true; b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đo…'; }
            A('token').then(function (x) {
                var t0 = performance.now(), url = W.QDdb.http + '/api/admin/speed?bytes=8000000&t=' + encodeURIComponent(x.token);
                return fetch(url, { cache: 'no-store' }).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
                    var down = Math.round(buf.byteLength * 8 / ((performance.now() - t0) / 1000) / 1e5) / 10, up = new Uint8Array(2000000), t1 = performance.now();
                    return fetch(W.QDdb.http + '/api/admin/speed-up', { method: 'POST', headers: { Authorization: 'Bearer ' + x.token }, body: up }).then(function () { speed = { down: down, up: Math.round(up.length * 8 / ((performance.now() - t1) / 1000) / 1e5) / 10 }; });
                });
            }).catch(function (e) { toast('Không đo được: ' + (e && e.message || e), 'error'); }).then(function () { paint(); });
        }

        /* ---------------- Dữ liệu ---------------- */
        var COLS = [], CUR = '', PAGE = 0, PER = 50, TOTAL = 0, qT = 0;
        function loadCols() {
            return A('cols').then(function (c) { COLS = c; renderCols(); }).catch(function (e) { $('qv-collist').innerHTML = '<div class="qv-empty">' + E(e.message || e.code) + '</div>'; });
        }
        function renderCols() {
            var q = ($('qv-colq').value || '').toLowerCase().trim();
            var L = COLS.filter(function (c) { return !q || c.col.toLowerCase().indexOf(q) >= 0; });
            $('qv-collist').innerHTML = L.length ? L.map(function (c) { return '<button type="button" class="qv-col' + (c.col === CUR ? ' on' : '') + '" data-c="' + E(c.col) + '"><b>' + E(c.col) + '</b><small>' + c.n.toLocaleString('vi-VN') + ' · ' + B(c.bytes) + '</small></button>'; }).join('') : '<div class="qv-empty">Chưa có dữ liệu.</div>';
        }
        function pick(c) {
            CUR = c; PAGE = 0; $('qv-q').value = ''; renderCols();
            $('qv-colname').textContent = c; ['qv-q', 'qv-add', 'qv-export', 'qv-drop'].forEach(function (id) { $(id).disabled = false; });
            loadDocs();
        }
        function loadDocs() {
            if (!CUR) return;
            $('qv-doclist').innerHTML = '<div class="qv-empty"><i class="fa-solid fa-spinner fa-spin"></i></div>';
            A('list', { col: CUR, q: $('qv-q').value, offset: PAGE * PER, limit: PER }).then(function (r) {
                TOTAL = r.total;
                $('qv-doclist').innerHTML = r.items.length ? r.items.map(function (x) { return '<div class="qv-doc" data-id="' + E(x.id) + '"><div class="id">' + E(x.id) + '</div><div class="pv">' + E(x.preview) + '</div><div class="mt">' + tm(x.ut) + '<br>' + B(x.size) + '</div></div>'; }).join('') : '<div class="qv-empty">Không có tài liệu nào.</div>';
                var pages = Math.max(1, Math.ceil(TOTAL / PER));
                $('qv-pager').innerHTML = '<span>' + TOTAL.toLocaleString('vi-VN') + ' tài liệu · trang ' + (PAGE + 1) + ' / ' + pages + '</span><span style="display:flex;gap:6px"><button type="button" class="qv-btn sm" data-pg="-1"' + (PAGE ? '' : ' disabled') + '>‹ Trước</button><button type="button" class="qv-btn sm" data-pg="1"' + (PAGE + 1 < pages ? '' : ' disabled') + '>Sau ›</button></span>';
            }).catch(function (e) { $('qv-doclist').innerHTML = '<div class="qv-empty">' + E(e.message || e.code) + '</div>'; });
        }
        var MOD = null;
        function openDoc(id) {
            MOD = { col: CUR, id: id || '' };
            $('qv-mcol').textContent = CUR; $('qv-mid').value = id || ''; $('qv-mid').disabled = !!id; $('qv-merr').textContent = '';
            $('qv-mtitle').textContent = id ? 'Sửa tài liệu' : 'Thêm tài liệu mới'; $('qv-mdel').hidden = !id;
            $('qv-mjson').value = id ? 'Đang tải…' : '{\n  \n}'; $('qv-modal').hidden = false;
            if (id) A('doc', { path: CUR + '/' + id }).then(function (r) { $('qv-mjson').value = r.exists ? JSON.stringify(r.d, null, 2) : '{}'; }).catch(function (e) { $('qv-merr').textContent = e.message || e.code; });
        }
        function saveDoc() {
            var txt = $('qv-mjson').value, obj;
            try { obj = JSON.parse(txt); } catch (e) { $('qv-merr').textContent = 'JSON sai: ' + e.message; return; }
            if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { $('qv-merr').textContent = 'Tài liệu phải là một đối tượng { … }'; return; }
            var id = MOD.id || $('qv-mid').value.trim(), ref = id ? firebase.firestore().collection(MOD.col).doc(id) : firebase.firestore().collection(MOD.col).doc();
            if (id && /\//.test(id)) { $('qv-merr').textContent = 'Mã tài liệu không được có dấu /'; return; }
            $('qv-msave').disabled = true;
            ref.set(obj).then(function () { toast('Đã lưu ' + MOD.col + '/' + ref.id, 'success'); $('qv-modal').hidden = true; loadDocs(); loadCols(); })
                .catch(function (e) { $('qv-merr').textContent = 'Không lưu được: ' + (e.message || e.code); }).then(function () { $('qv-msave').disabled = false; });
        }
        function delDoc() {
            ask({ title: 'Xóa tài liệu?', html: '<b>' + E(MOD.col + '/' + MOD.id) + '</b> sẽ bị xóa vĩnh viễn (có bản sao lưu đêm để khôi phục nếu cần).', ok: 'Xóa', icon: '🗑️' }).then(function (y) {
                if (!y) return;
                firebase.firestore().collection(MOD.col).doc(MOD.id).delete().then(function () { toast('Đã xóa', 'success'); $('qv-modal').hidden = true; loadDocs(); loadCols(); }).catch(function (e) { toast('Không xóa được: ' + (e.message || e.code), 'error'); });
            });
        }
        function download(url, name) { var a = document.createElement('a'); a.href = url; if (name) a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1000); }
        function withToken(fn) { return A('token').then(function (x) { return fn(encodeURIComponent(x.token), x.token); }).catch(function (e) { toast('Lỗi: ' + (e.message || e.code), 'error'); }); }
        function exportCol(c) { withToken(function (t) { download(W.QDdb.http + '/api/admin/export?' + (c ? 'col=' + encodeURIComponent(c) + '&' : '') + 'pretty=1&t=' + t); toast('Đang tải ' + (c || 'toàn bộ dữ liệu') + ' về máy…', 'info'); }); }
        function dropCol() {
            var c = CUR; if (!c) return;
            ask({ title: 'Xóa cả bộ sưu tập?', icon: '⚠️', ok: 'Xóa hết', html: 'Xóa <b>toàn bộ ' + (COLS.filter(function (x) { return x.col === c; })[0] || { n: '?' }).n + ' tài liệu</b> trong <b>' + E(c) + '</b>.\nMáy chủ sẽ tự sao lưu trước khi xóa.' }).then(function (y) {
                if (!y) return; var typed = prompt('Gõ đúng tên bộ sưu tập để xác nhận: ' + c); if (typed !== c) { if (typed != null) toast('Tên không khớp, không xóa', 'warning'); return; }
                A('dropCol', { col: c, confirm: typed }).then(function (r) { toast('Đã xóa ' + r.n + ' tài liệu. Bản sao lưu: ' + r.backup, 'success'); CUR = ''; $('qv-doclist').innerHTML = '<div class="qv-empty">Đã xóa.</div>'; $('qv-pager').innerHTML = ''; loadCols(); loadBackups(); })
                    .catch(function (e) { toast('Không xóa được: ' + (e.message || e.code), 'error'); });
            });
        }

        /* ---------------- Sao lưu ---------------- */
        function kind(n) { return /-auto\./.test(n) ? ['auto', 'Tự động (đêm)'] : /-tay\./.test(n) ? ['tay', 'Thủ công'] : /truoc-/.test(n) ? ['safe', n.indexOf('truoc-khoi-phuc') >= 0 ? 'Trước khi khôi phục' : 'Trước khi xóa'] : ['', 'Khác']; }
        function loadBackups() {
            return A('backups').then(function (L) {
                $('qv-bklist').innerHTML = L.length ? L.map(function (b) { var k = kind(b.name);
                    return '<tr><td style="font:12.5px ui-monospace,monospace;word-break:break-all">' + E(b.name) + '</td><td><span class="qv-tag ' + k[0] + '">' + k[1] + '</span></td><td style="white-space:nowrap">' + tm(b.at) + '</td><td>' + B(b.size) + '</td>' +
                        '<td><div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="qv-btn sm" data-dl="' + E(b.name) + '"><i class="fa-solid fa-download"></i> Tải về</button><button type="button" class="qv-btn sm warn" data-rs="' + E(b.name) + '"><i class="fa-solid fa-clock-rotate-left"></i> Khôi phục</button><button type="button" class="qv-btn sm danger" data-del="' + E(b.name) + '" title="Xóa bản sao lưu"><i class="fa-solid fa-trash"></i></button></div></td></tr>'; }).join('')
                    : '<tr><td colspan="5" class="text-muted">Chưa có bản sao lưu. Bấm "Sao lưu ngay".</td></tr>';
            }).catch(function (e) { $('qv-bklist').innerHTML = '<tr><td colspan="5" style="color:#f87171">' + E(e.message || e.code) + '</td></tr>'; });
        }
        function backupNow() {
            var b = $('qv-bk-now'); b.disabled = true;
            A('backup').then(function (r) { toast('Đã sao lưu: ' + r.name, 'success'); loadBackups(); }).catch(function (e) { toast('Lỗi sao lưu: ' + (e.message || e.code), 'error'); }).then(function () { b.disabled = false; });
        }
        function restore(name) {
            var mode = $('qv-bk-mode').value;
            ask({ title: 'Khôi phục bản sao lưu?', icon: '⏪', ok: 'Khôi phục', tone: 'warn', html: '<b>' + E(name) + '</b>\n' + (mode === 'merge' ? 'Gộp thêm vào dữ liệu đang có.' : '<b>Thay toàn bộ</b> dữ liệu hiện tại bằng bản này.') + '\nMáy chủ tự sao lưu dữ liệu hiện tại trước khi khôi phục.' }).then(function (y) {
                if (!y) return; toast('Đang khôi phục…', 'info');
                A('restore', { name: name, mode: mode }).then(function (r) { toast('Đã khôi phục ' + r.n + ' tài liệu. Bản dữ liệu cũ: ' + r.before, 'success'); loadBackups(); loadCols(); }).catch(function (e) { toast('Không khôi phục được: ' + (e.message || e.code), 'error'); });
            });
        }
        function upload(file) {
            if (!file) return; var mode = $('qv-bk-mode').value;
            ask({ title: 'Khôi phục từ tệp tải lên?', icon: '⬆️', ok: 'Tải lên & khôi phục', tone: 'warn', html: '<b>' + E(file.name) + '</b> (' + B(file.size) + ')\n' + (mode === 'merge' ? 'Gộp thêm vào dữ liệu đang có.' : '<b>Thay toàn bộ</b> dữ liệu hiện tại.') + '\nMáy chủ tự sao lưu dữ liệu hiện tại trước.' }).then(function (y) {
                if (!y) { $('qv-bk-file').value = ''; return; }
                A('token').then(function (x) {
                    var xhr = new XMLHttpRequest(); $('qv-up').hidden = false; $('qv-upbar').style.width = '0'; $('qv-uptxt').textContent = 'Đang tải lên…';
                    xhr.open('POST', W.QDdb.http + '/api/admin/restore?mode=' + mode); xhr.setRequestHeader('Authorization', 'Bearer ' + x.token);
                    xhr.upload.onprogress = function (e) { if (e.lengthComputable) { var p = e.loaded / e.total * 100; $('qv-upbar').style.width = p + '%'; $('qv-uptxt').textContent = p < 100 ? 'Đang tải lên ' + p.toFixed(0) + '%' : 'Máy chủ đang khôi phục…'; } };
                    xhr.onload = function () { var r = {}; try { r = JSON.parse(xhr.responseText); } catch (e) {} $('qv-up').hidden = true; $('qv-bk-file').value = '';
                        if (r.ok) { toast('Đã khôi phục ' + r.n + ' tài liệu từ ' + file.name, 'success'); loadBackups(); loadCols(); } else toast('Không khôi phục được: ' + (r.message || xhr.status), 'error'); };
                    xhr.onerror = function () { $('qv-up').hidden = true; toast('Tải lên lỗi (mất mạng?)', 'error'); };
                    xhr.send(file);
                }).catch(function (e) { toast('Lỗi: ' + (e.message || e.code), 'error'); });
            });
        }

        /* ---------------- Kết nối & nhật ký ---------------- */
        function loadConns() {
            A('conns').then(function (L) {
                L.sort(function (a, b) { return (b.u ? 1 : 0) - (a.u ? 1 : 0) || a.at - b.at; });
                $('qv-connlist').innerHTML = L.length ? L.map(function (c) { return '<tr><td><b>' + (c.u ? '@' + E(c.u) : '<span class="text-muted">chưa đăng nhập</span>') + '</b></td><td>' + E(c.role || '—') + '</td><td>' + E(c.ip) + '</td><td style="white-space:nowrap">' + tm(c.at) + '</td><td>' + c.subs + '</td><td class="text-sm text-muted" style="max-width:280px;word-break:break-word">' + E(c.ua) + '</td></tr>'; }).join('') : '<tr><td colspan="6" class="text-muted">Không có kết nối.</td></tr>';
            }).catch(function () {});
        }
        function loadLogs() { A('logs', { n: 200, prev: !!$('qv-logwhich').value }).then(function (L) { var el = $('qv-logs'); el.textContent = L.join('\n') || '(trống)'; el.scrollTop = el.scrollHeight; }).catch(function (e) { $('qv-logs').textContent = e.message || e.code; }); }

        /* ---------------- Gắn sự kiện ---------------- */
        var TAB = 'data';
        function showTab(t) {
            TAB = t; Array.prototype.forEach.call($('qv-tabs').children, function (b) { b.classList.toggle('on', b.dataset.t === t); });
            Array.prototype.forEach.call(document.querySelectorAll('#view-vps .qv-pane'), function (p) { p.hidden = p.dataset.p !== t; });
            if (t === 'data') loadCols(); if (t === 'backup') loadBackups(); if (t === 'conns') loadConns(); if (t === 'logs') loadLogs(); if (t === 'alert') loadAlert();
        }
        $('qv-tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) showTab(b.dataset.t); });
        $('qv-colq').addEventListener('input', renderCols);
        $('qv-collist').addEventListener('click', function (e) { var b = e.target.closest('.qv-col'); if (b) pick(b.dataset.c); });
        $('qv-q').addEventListener('input', function () { clearTimeout(qT); qT = setTimeout(function () { PAGE = 0; loadDocs(); }, 300); });
        $('qv-doclist').addEventListener('click', function (e) { var d = e.target.closest('.qv-doc'); if (d) openDoc(d.dataset.id); });
        $('qv-pager').addEventListener('click', function (e) { var b = e.target.closest('[data-pg]'); if (b && !b.disabled) { PAGE += +b.dataset.pg; loadDocs(); } });
        $('qv-add').onclick = function () { openDoc(''); };
        $('qv-export').onclick = function () { exportCol(CUR); };
        $('qv-export-all').onclick = function () { exportCol(''); };
        $('qv-drop').onclick = dropCol;
        $('qv-mclose').onclick = function () { $('qv-modal').hidden = true; };
        $('qv-modal').addEventListener('click', function (e) { if (e.target.id === 'qv-modal') $('qv-modal').hidden = true; });
        $('qv-msave').onclick = saveDoc; $('qv-mdel').onclick = delDoc;
        $('qv-mfmt').onclick = function () { try { $('qv-mjson').value = JSON.stringify(JSON.parse($('qv-mjson').value), null, 2); $('qv-merr').textContent = ''; } catch (e) { $('qv-merr').textContent = 'JSON sai: ' + e.message; } };
        $('qv-mjson').addEventListener('keydown', function (e) { if (e.key === 'Tab') { e.preventDefault(); var t = this, s0 = t.selectionStart; t.value = t.value.slice(0, s0) + '  ' + t.value.slice(t.selectionEnd); t.selectionStart = t.selectionEnd = s0 + 2; } if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveDoc(); } });
        $('qv-bk-now').onclick = backupNow;
        $('qv-bk-file').addEventListener('change', function () { upload(this.files[0]); });
        $('qv-bklist').addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            if (b.dataset.dl) withToken(function (t) { download(W.QDdb.http + '/api/admin/backup-file?name=' + encodeURIComponent(b.dataset.dl) + '&t=' + t, b.dataset.dl); });
            if (b.dataset.rs) restore(b.dataset.rs);
            if (b.dataset.del) ask({ title: 'Xóa bản sao lưu?', ok: 'Xóa', html: '<b>' + E(b.dataset.del) + '</b>' }).then(function (y) { if (y) A('delBackup', { name: b.dataset.del }).then(function () { toast('Đã xóa bản sao lưu', 'success'); loadBackups(); }).catch(function (e) { toast(e.message || e.code, 'error'); }); });
        });
        $('qv-logref').onclick = loadLogs; $('qv-logwhich').onchange = loadLogs;
        $('qv-restart').onclick = function () {
            ask({ title: 'Khởi động lại máy chủ?', icon: '🔄', ok: 'Khởi động lại', tone: 'warn', html: 'Mọi người mất kết nối khoảng 2–5 giây rồi tự nối lại. Dữ liệu không mất.' }).then(function (y) {
                if (y) A('restart').then(function () { toast('Đang khởi động lại máy chủ…', 'info'); pill(false, 'Đang khởi động lại'); }).catch(function (e) { toast(e.message || e.code, 'error'); });
            });
        };
        $('qv-update').onclick = function () {
            ask({ title: 'Cập nhật máy chủ?', icon: '⬇️', ok: 'Cập nhật', tone: 'info', html: 'Tải bản máy chủ mới nhất từ GitHub, kiểm tra lỗi rồi tự khởi động lại (mất kết nối vài giây). Bản đang chạy: <b>' + E(S ? S.ver : '?') + '</b>.' }).then(function (y) {
                if (!y) return; var b = $('qv-update'); b.disabled = true;
                A('update').then(function (r) { toast('Đã tải bản ' + r.ver + ', máy chủ đang khởi động lại…', 'success'); H = []; lastT = 0; }).catch(function (e) { toast('Không cập nhật được: ' + (e.message || e.code), 'error'); }).then(function () { setTimeout(function () { b.disabled = false; }, 4000); });
            });
        };

        /* ---------------- Cảnh báo sớm ---------------- */
        var AL = null, AKEYS = [['ram', '🧠', 'RAM của VPS'], ['heap', '📦', 'Bộ nhớ máy chủ QĐ'], ['disk', '💽', 'Ổ cứng'], ['cpu', '⚙️', 'CPU (trung bình 5 phút)']];
        var LVTXT = ['✅ Bình thường', '⚠️ Đang cao', '🚨 Sắp quá tải'];
        function pctTxt(v) { return v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('vi-VN') + '%'; }
        function paintAlert() {
            if (!AL) return;
            var st = AL.state || {}, cfg = AL.cfg || {}, items = st.items || [], lv = $('qva-lv');
            lv.className = 'qva-lv ' + (cfg.on === false ? 'off' : 'l' + (st.level || 0)); lv.textContent = cfg.on === false ? '🔕 Đang tắt' : LVTXT[st.level || 0];
            $('qva-sub').textContent = st.updatedAt ? 'Đo lúc ' + tm(st.updatedAt) + (st.since ? ' · cao từ ' + tm(st.since) : '') + (st.notifiedAt ? ' · báo gần nhất ' + tm(st.notifiedAt) : '') : '';
            $('qva-rows').innerHTML = items.map(function (x) {
                var col = x.lv === 2 ? '#ef4444' : x.lv === 1 ? '#f59e0b' : '#22c55e';
                return '<div class="qva-row"><div class="nm">' + E(x.icon + ' ' + x.name) + '<small>' + E(x.detail || (x.v == null ? 'chưa đủ số liệu (cần ~2 phút)' : '')) + '</small></div>'
                    + '<div class="qva-meter"><i style="width:' + Math.max(1, Math.min(100, x.v || 0)) + '%;background:' + col + '"></i><b style="left:' + x.th + '%" title="Ngưỡng ' + x.th + '%"></b><b class="c" style="left:' + x.crit + '%" title="Mức nguy hiểm ' + x.crit + '%"></b></div>'
                    + '<div class="v" style="color:' + col + '">' + pctTxt(x.v) + '</div></div>';
            }).join('') + (st.restart ? '<div class="qv-alert info" style="margin:0">🔁 Máy chủ bị tắt đột ngột (lần cuối còn chạy khoảng ' + tm(st.restart.lastSeen) + ') và đã tự bật lại lúc ' + tm(st.restart.at) + '. ' + E(st.restart.why || '') + ' Xem tab <b>Nhật ký</b> → <b>Lần chạy trước</b>.</div>' : '');
            var to = AL.recipients || [];
            $('qva-to').innerHTML = to.length ? 'Gửi vào app của: <b>' + to.map(E).join('</b>, <b>') + '</b> (cần mở app QD Elite trên Android ít nhất 1 lần sau khi đăng nhập)' : '⚠️ Chưa có ai nhận: cần tài khoản Chủ hệ thống / Quản trị viên.';
            $('qva-dot').hidden = !(cfg.on !== false && st.level > 0);
        }
        function fillAlert() {
            var c = AL && AL.cfg || {};
            $('qva-on').checked = c.on !== false; $('qva-mgr').checked = !!c.managers; $('qva-remind').value = c.remindH == null ? 6 : c.remindH;
            AKEYS.forEach(function (k) { $('qva-' + k[0]).value = c[k[0]] || ''; });
        }
        function loadAlert(keepForm) {
            return A('alertState').then(function (r) { AL = r; paintAlert(); if (!keepForm) fillAlert(); }).catch(function (e) {
                $('qva-lv').className = 'qva-lv off'; $('qva-lv').textContent = 'Chưa dùng được';
                $('qva-rows').innerHTML = '<div class="qv-alert">' + (e && /Lệnh lạ/.test(e.message || '') ? 'Máy chủ đang chạy bản cũ — bấm <b>Cập nhật máy chủ</b> ở trên để có cảnh báo sớm.' : E(e && (e.message || e.code) || e)) + '</div>';
            });
        }
        $('qva-save').onclick = function () {
            var o = { isEnabled: $('qva-on').checked, managers: $('qva-mgr').checked, remindH: Math.max(0, Math.min(72, Math.round(+$('qva-remind').value || 0))), updatedAt: Date.now() }, bad = '';
            AKEYS.forEach(function (k) { var v = Math.round(+$('qva-' + k[0]).value); if (!(v >= 30 && v <= 99)) bad = k[2]; o[k[0]] = v; });
            if (bad) return toast('Ngưỡng "' + bad + '" phải từ 30 đến 99%', 'warning');
            var b = this; b.disabled = true;
            W.firebase.firestore().collection('settings').doc('vps_alert_config').set(o, { merge: true })
                .then(function () { toast('Đã lưu cảnh báo sớm', 'success'); return loadAlert(); })
                .catch(function (e) { toast('Không lưu được: ' + (e && e.message || e), 'error'); }).then(function () { b.disabled = false; });
        };
        $('qva-test').onclick = function () {
            var b = this; b.disabled = true;
            A('alertTest').then(function (r) { toast(r.to && r.to.length ? 'Đã gửi thử tới app của: ' + r.to.join(', ') : 'Chưa có ai để gửi', r.to && r.to.length ? 'success' : 'warning'); })
                .catch(function (e) { toast('Không gửi được: ' + (e && e.message || e), 'error'); }).then(function () { b.disabled = false; });
        };
        /* Dải cảnh báo đầu trang Admin (mọi mục) khi máy chủ đang cao / vừa tự khởi động lại */
        (function () {
            var unsub = null, who = '';
            function paintBanner(d) {
                var el = $('qva-banner'); if (!el) return;
                var role = typeof State !== 'undefined' ? State.currentUserRole : '', show = role === 'admin' || (role === 'manager' && d && d.managers);
                var bad = d && d.on !== false ? (d.items || []).filter(function (x) { return x.lv > 0; }).sort(function (a, b) { return b.lv - a.lv || b.v - a.v; }) : [];
                var rs = d && d.restart && Date.now() - d.restart.at < 6 * 3600e3 ? d.restart : null;
                if (!show || (!bad.length && !rs)) { el.hidden = true; return; }
                el.className = 'qva-banner qvps-only ' + (bad.length ? (d.level === 2 ? 'l2' : '') : 'info'); el.hidden = false;
                el.innerHTML = (bad.length ? '<span>' + (d.level === 2 ? '🚨 <b>Máy chủ sắp quá tải:</b> ' : '⚠️ <b>Máy chủ đang cao:</b> ') + bad.map(function (x) { return E(x.name) + ' <b>' + pctTxt(x.v) + '</b> (ngưỡng ' + x.th + '%)'; }).join(' · ') + '</span>'
                    : '<span>🔁 Máy chủ vừa bị tắt đột ngột và đã tự bật lại lúc <b>' + tm(rs.at) + '</b>.</span>') + '<span class="go">Xem chi tiết</span>';
            }
            $('qva-banner').onclick = function () { try { UI.navigate('vps'); setTimeout(function () { showTab('alert'); }, 50); } catch (e) {} };
            setInterval(function () {
                var u = typeof State !== 'undefined' && State.currentUser || '';
                if (u === who) return; who = u;
                if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
                if (!u) return paintBanner(null);
                unsub = W.firebase.firestore().collection('settings').doc('vps_alert').onSnapshot(function (x) { var d = x.exists ? x.data() : null; paintBanner(d); if (d && AL && TAB === 'alert') { AL.state = d; paintAlert(); } }, function () { paintBanner(null); });
            }, 1500);
        })();
        function start() { if (active) return; active = true; H = []; lastT = 0; tick(); timer = setInterval(tick, 3000); showTab(TAB); }
        function stop() { active = false; clearInterval(timer); }
        (function hook(n) {
            if (typeof UI === 'undefined' || !UI.navigate) { if (n < 240) setTimeout(function () { hook(n + 1); }, 500); return; }
            var nav = UI.navigate; UI.navigate = function (v) { var r = nav.apply(this, arguments); if (v === 'vps') start(); else stop(); return r; };
        })(0);
        document.addEventListener('visibilitychange', function () { if (!document.hidden && active) tick(); });
        W.QDVps = { start: start, stop: stop, tick: tick };
    })();
    
