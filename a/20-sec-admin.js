    /* ===== CHỐNG GIAN LẬN & PHÁT HIỆN LỖI (admin) =====
       settings/security_config = { isEnabled, errorReport, autoBlock, whitelist: [user],
         rules: { script{on,n} rhythm{on} bot{on} device{on,n} | neg{on} lixi{on} attDup{on} burst{on,n} win{on,x,min} rps{on,min,pct} funnel{on,n} ip{on,n} } }
       settings/security_state = { lastScanAt, lastScanBy, lastCount, resolved: { khóa phát hiện: { at, by } } }
       security_flags (máy thành viên gửi: type, sev, detail, user, page, device, ua, at, status 'new'|'resolved')
       security_devices/{mã thiết bị} = { users: [..], lastUser, lastAt, ua }   ·   error_logs/{mã lỗi} = { kind, msg, file, line, page, count, users, lastAt, lastUser, status 'open'|'fixed' }
       Khóa từ đây: accounts.isBlocked = true + lockReason 'security' -> không tự mở khóa (user.html + vòng tự mở khóa của Admin bỏ qua). */
    (function () {
        'use strict';
        if (!document.getElementById('view-security') || typeof db === 'undefined') return;
        var d = document, $ = function (id) { return d.getElementById(id); };
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var toast = function (m, t) { if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast(m, t || 'success'); };
        var S = function () { try { return typeof State !== 'undefined' ? State : {}; } catch (e) { return {}; } };
        var fmt = function (n) { return Number(n || 0).toLocaleString('vi-VN'); };
        var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
        var fDT = function (t) { if (!t) return ''; var x = new Date(t); return p2(x.getHours()) + ':' + p2(x.getMinutes()) + ' ' + p2(x.getDate()) + '/' + p2(x.getMonth() + 1); };
        var ago = function (t) { var s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? 'vừa xong' : s < 3600 ? Math.floor(s / 60) + ' phút trước' : s < 86400 ? Math.floor(s / 3600) + ' giờ trước' : Math.floor(s / 86400) + ' ngày trước'; };
        var dKey = function (t) { var x = new Date(t); return x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate()); };
        var isWish = function (t) { var n = String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); return !t || /chuc|may man lan sau|ti nua|them ti/.test(n); };
        var CFG = db.collection('settings').doc('security_config'), STATE = db.collection('settings').doc('security_state');
        var SEV = { high: ['Cao', 'sev-high', '🔴'], med: ['Trung bình', 'sev-med', '🟠'], low: ['Thấp', 'sev-low', '🟡'] };
        var RULES = [
            { k: 'proxy', g: 'client', ic: '🛡️', name: 'Chống điểm danh hộ (Thiết bị & IP mạng)', sev: 'med', ext: true, desc: 'Chặn dùng chung thiết bị (trình duyệt) hoặc chung mạng (IP) để điểm danh cho nhiều tài khoản trong cùng ngày. Mỗi lần chặn gửi 1 cảnh báo về đây.' },
            { k: 'script', g: 'client', ic: '🤖', name: 'Script tự bấm', sev: 'high', desc: 'Click do mã lệnh / tiện ích tạo ra (không phải tay người) dồn dập. Bật "Tự chặn" để tạm khóa thao tác 2 phút.', nums: [['n', 'lần / phút', 15, 3, 200]] },
            { k: 'autoBlock', g: 'client', ic: '⛔', name: 'Tự chặn khi phát hiện script', sev: '', desc: 'Chặn các cú bấm giả lập trong 2 phút ngay trên máy thành viên (người bấm tay không bị ảnh hưởng).', top: true },
            { k: 'rhythm', g: 'client', ic: '🎯', name: 'Nhịp bấm đều bất thường', sev: 'med', desc: '20 lần bấm liên tiếp cách đều nhau gần như tuyệt đối — dấu hiệu phần mềm auto-click.' },
            { k: 'bot', g: 'client', ic: '🕹️', name: 'Trình duyệt tự động hóa', sev: 'high', desc: 'Trình duyệt đang bị điều khiển bằng công cụ (webdriver / bot).' },
            { k: 'device', g: 'client', ic: '📱', name: 'Nhiều tài khoản trên 1 thiết bị', sev: 'med', desc: 'Ghi mã thiết bị khi đăng nhập; khi quét, báo thiết bị dùng cho nhiều tài khoản.', nums: [['n', 'tài khoản trở lên', 3, 2, 50]] },
            { k: 'oneDevice', g: 'server', ic: '📲', name: '1 tài khoản – 1 thiết bị', sev: 'high', def: false, desc: 'Đăng nhập ở thiết bị mới thì thiết bị cũ bị đăng xuất ngay. Máy cũ còn đang dùng (có thao tác trong 10 phút) mà vẫn đăng nhập máy mới = 1 lần vi phạm; đủ số lần trong khoảng giờ thì tự khóa tài khoản (0 = không khóa). Miễn: Quản lý, Quản trị viên, danh sách Bỏ qua.', nums: [['n', 'lần vi phạm thì khóa', 3, 0, 50], ['h', 'giờ (khoảng đếm)', 24, 1, 720]] },
            { k: 'oneAccount', g: 'server', ic: '👥', name: '1 thiết bị – 1 tài khoản', sev: 'high', def: false, desc: 'Thiết bị gắn với tài khoản đầu tiên dùng nó; tài khoản khác đăng nhập trên thiết bị đó bị chặn. Cố đủ số lần thì tự khóa tài khoản đó (0 = không khóa). Thiết bị bỏ không quá số ngày thì được dùng cho tài khoản khác (0 = giữ mãi). Miễn: Quản lý, Quản trị viên, danh sách Bỏ qua.', nums: [['n', 'lần cố đăng nhập thì khóa', 2, 0, 50], ['days', 'ngày thì nhả thiết bị', 30, 0, 3650]] },
            { k: 'neg', g: 'scan', ic: '➖', name: 'Số dư âm', sev: 'high', desc: 'Điểm / lượt nhỏ hơn 0 — lỗi dữ liệu hoặc khai thác lỗi trừ lượt.' },
            { k: 'lixi', g: 'scan', ic: '🧧', name: 'Vượt giới hạn lì xì / ngày', sev: 'high', desc: 'Mở lì xì hằng ngày nhiều hơn số lần cấu hình cho phép.' },
            { k: 'attDup', g: 'scan', ic: '✅', name: 'Điểm danh trùng ngày', sev: 'med', desc: 'Hơn 1 lần điểm danh trong cùng một ngày.' },
            { k: 'burst', g: 'scan', ic: '⚡', name: 'Thao tác dồn dập', sev: 'med', desc: 'Quay / rút lì xì / ném còn / đổi quà quá nhiều lần trong 60 giây — nghi dùng tool.', nums: [['n', 'lượt / 60 giây', 12, 3, 500]] },
            { k: 'win', g: 'scan', ic: '🎰', name: 'Tỉ lệ trúng tiền bất thường', sev: 'med', desc: 'Vòng Quay & Rút Lì Xì: tỉ lệ trúng giải tiền cao gấp nhiều lần mặt bằng chung.', nums: [['x', '× trung bình', 3, 2, 50], ['min', 'lượt tối thiểu', 10, 3, 1000]] },
            { k: 'rps', g: 'scan', ic: '⚔️', name: 'Thắng Kéo Búa Bao bất thường', sev: 'low', desc: 'Tỉ lệ thắng gần như tuyệt đối sau nhiều trận.', nums: [['min', 'trận tối thiểu', 10, 3, 1000], ['pct', '% thắng', 90, 50, 100]] },
            { k: 'funnel', g: 'scan', ic: '🎁', name: 'Dồn lượt qua tặng quà', sev: 'med', desc: 'Một tài khoản nhận lượt từ nhiều người khác nhau trong 7 ngày — nghi nuôi tài khoản phụ.', nums: [['n', 'người tặng trở lên', 3, 2, 100]] },
            { k: 'ip', g: 'scan', ic: '🌐', name: 'Nhiều tài khoản / 1 mạng', sev: 'low', desc: 'Nhiều tài khoản điểm danh từ cùng một địa chỉ mạng (có thể là Wi-Fi chung, cần xem xét).', nums: [['n', 'tài khoản trở lên', 4, 2, 100]] }
        ];
        var RMAP = {}; RULES.forEach(function (r) { RMAP[r.k] = r; });
        var FLAG_T = { source: ['🔒', 'Cố mở mã nguồn'], devtools: ['🛠️', 'Đang mở DevTools'], proxy: ['🛡️', 'Bị chặn điểm danh hộ'], script: ['🤖', 'Script tự bấm'], rhythm: ['🎯', 'Nhịp bấm đều bất thường'], bot: ['🕹️', 'Trình duyệt tự động hóa'], multi_device: ['📲', '1 tài khoản dùng nhiều thiết bị'], multi_account: ['👥', 'Nhiều tài khoản trên 1 thiết bị (bị chặn)'], auto_lock: ['🔒', 'Máy chủ tự khóa tài khoản'] };
        var KIND = { js: 'Lỗi trang (JS)', promise: 'Lỗi xử lý ngầm', console: 'Lỗi đã bắt', resource: 'File không tải được' };

        function norm(c) {
            c = c || {}; var r = c.rules || {}, o = { on: c.isEnabled !== false, err: c.errorReport !== false, autoBlock: c.autoBlock !== false, rules: {}, white: Array.isArray(c.whitelist) ? c.whitelist.map(String) : [] };
            var pp = c.protect || {};   // Bảo vệ mã nguồn (mặc định TẮT; các tùy chọn: phím + chuột phải + miễn BQT bật, sao chép + DevTools tắt)
            o.prot = { on: pp.on === true, keys: pp.keys !== false, menu: pp.menu !== false, copy: pp.copy === true, devtools: pp.devtools === true, staffExempt: pp.staffExempt !== false, msg: String(pp.msg || '') };
            RULES.forEach(function (R) {
                if (R.top || R.ext) return; var x = r[R.k] || {}, v = { on: R.def === false ? x.on === true : x.on !== false };
                (R.nums || []).forEach(function (n) { var t = parseInt(x[n[0]], 10); v[n[0]] = isNaN(t) ? n[2] : Math.min(n[4], Math.max(n[3], t)); });
                o.rules[R.k] = v;
            });
            return o;
        }
        var SA = window.SecAdmin = { cfg: norm(null), anti: true, state: {}, flags: [], errors: [], scanF: [], tab: 'flags', started: false, scanning: false, armed: '' };
        function white(u) { return u && SA.cfg.white.indexOf(u) >= 0; }

        /* ---------- Cấu hình ---------- */
        function rulesPayload(c) { var o = {}; Object.keys(c.rules).forEach(function (k) { o[k] = c.rules[k]; }); return o; }
        function buildRules() {
            if ($('sec-rules-client').childElementCount) return;
            ['client', 'scan', 'server'].forEach(function (g) {
                $('sec-rules-' + g).innerHTML = RULES.filter(function (R) { return R.g === g; }).map(function (R) {
                    return '<div class="sec-rule" data-k="' + R.k + '"><span class="ic">' + R.ic + '</span><div><b>' + esc(R.name) + (R.sev ? '<span class="sev ' + SEV[R.sev][1] + '">' + SEV[R.sev][0] + '</span>' : '') + '</b><small>' + esc(R.desc) + '</small></div>'
                        + '<div class="sw"><label class="switch"><input type="checkbox" data-rule="' + R.k + '" aria-label="Bật / tắt ' + esc(R.name) + '"><span class="slider"></span></label></div>'
                        + (R.nums ? '<div class="nums">' + R.nums.map(function (n) { return '<label><input type="number" class="form-control" data-k="' + R.k + '" data-n="' + n[0] + '" min="' + n[3] + '" max="' + n[4] + '" inputmode="numeric"> ' + esc(n[1]) + '</label>'; }).join('') + '</div>' : '') + '</div>';
                }).join('');
            });
            var box = $('view-security');
            box.addEventListener('change', function (e) { var k = e.target.dataset.rule; if (k) SA.toggleRule(k, e.target); });
            box.addEventListener('input', function (e) { if (e.target.dataset.n) { e.target.classList.add('dirty'); $('sec-dirty').classList.remove('hidden'); } });
            $('sec-cheat-on').addEventListener('change', function () { SA.setTop('isEnabled', this); });
            $('sec-prot').addEventListener('change', function (e) { var k = e.target.dataset.prot; if (k) SA.setProt(k, e.target); });
            $('sec-prot-msg').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); SA.saveProtMsg(); } });
            $('sec-err-on').addEventListener('change', function () { SA.setTop('errorReport', this); });
            d.querySelectorAll('#view-security .sec-tabs button').forEach(function (b) { b.addEventListener('click', function () { SA.tab = b.dataset.t; render(); }); });
            ['sec-f-sev', 'sec-f-st', 'sec-e-st', 'sec-e-kind'].forEach(function (id) { $(id).addEventListener('change', render); });
            var qt = 0; $('sec-f-q').addEventListener('input', function () { clearTimeout(qt); qt = setTimeout(render, 150); });
            $('sec-d-q').addEventListener('input', function () { clearTimeout(qt); qt = setTimeout(render, 150); });
            d.querySelectorAll('#view-security .sec-tabs button[data-t="devices"]').forEach(function (b) { b.addEventListener('click', function () { SA.loadDevices(); }); });
            $('sec-white-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); SA.addWhite(); } });
            $('sec-list').addEventListener('click', onAct);
            $('sec-white').addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (b) SA.rmWhite(b.dataset.rm); });
        }
        function renderCfg() {
            var c = SA.cfg;
            $('sec-cheat-on').checked = c.on; $('sec-err-on').checked = c.err;
            $('sec-cheat-st').textContent = c.on ? 'ĐANG BẬT' : 'ĐANG TẮT'; $('sec-cheat-st').style.color = c.on ? 'var(--color-success)' : 'var(--text-muted)';
            $('sec-err-st').textContent = c.err ? 'ĐANG BẬT' : 'ĐANG TẮT'; $('sec-err-st').style.color = c.err ? 'var(--color-success)' : 'var(--text-muted)';
            $('sec-m-cheat').classList.toggle('is-on', c.on); $('sec-m-err').classList.toggle('is-on', c.err);
            $('sec-m-cheat-sub').textContent = c.on ? 'Đang theo dõi trên máy thành viên và khi quét dữ liệu.' : 'Đã tắt: máy thành viên không gửi cảnh báo, không tự chặn.';
            RULES.forEach(function (R) {
                var row = d.querySelector('.sec-rule[data-k="' + R.k + '"]'); if (!row) return;
                var on = R.ext ? SA.anti : R.top ? c.autoBlock && c.rules.script.on : c.rules[R.k].on;
                row.classList.toggle('off', !on || !c.on);
                var cb = row.querySelector('[data-rule]'); cb.checked = R.ext ? SA.anti : R.top ? c.autoBlock : c.rules[R.k].on;
                row.querySelectorAll('input[data-n]').forEach(function (i) { if (!i.classList.contains('dirty')) i.value = c.rules[R.k][i.dataset.n]; });
            });
            var P = c.prot, pb = $('sec-prot');
            d.querySelectorAll('#sec-prot [data-prot]').forEach(function (i) { i.checked = !!P[i.dataset.prot]; });
            pb.classList.toggle('off', !P.on); pb.querySelector('.inv-master').classList.toggle('is-on', P.on);
            $('sec-prot-st').textContent = P.on ? 'ĐANG BẬT' : 'ĐANG TẮT'; $('sec-prot-st').style.color = P.on ? 'var(--color-success)' : 'var(--text-muted)';
            $('sec-prot-sub').textContent = P.on ? 'Đang chặn ' + [P.keys && 'phím xem mã', P.menu && 'chuột phải', P.copy && 'sao chép'].filter(Boolean).join(', ') + ' trên mọi trang thành viên' + (P.staffExempt ? ' (thiết bị BQT được miễn).' : '.') : 'Chặn Ctrl+U (xem mã trang), F12 và các phím mở công cụ nhà phát triển trên mọi trang thành viên.';
            var mi = $('sec-prot-msg'); if (d.activeElement !== mi) mi.value = P.msg;
            $('sec-white').innerHTML = c.white.length ? c.white.map(function (u) { return '<span class="sec-chip">' + esc(u) + '<button type="button" data-rm="' + esc(u) + '" title="Bỏ khỏi danh sách" aria-label="Bỏ ' + esc(u) + '">✕</button></span>'; }).join('') : '<span class="text-muted text-sm">Chưa có — mọi tài khoản đều được theo dõi.</span>';
        }
        function save(p, okMsg, cb) {
            p.updatedAt = Date.now(); p.updatedBy = S().currentUser || 'admin';
            return CFG.set(p, { merge: true }).then(function () { if (okMsg) toast(okMsg); }, function () { toast('Lỗi lưu cấu hình', 'error'); if (cb) cb.checked = !cb.checked; });
        }
        SA.setTop = function (k, cb) { var o = {}; o[k] = !!cb.checked; save(o, (k === 'isEnabled' ? 'Chống gian lận: ' : 'Tự ghi lỗi: ') + (cb.checked ? 'ĐÃ BẬT' : 'ĐÃ TẮT'), cb); log(k + (cb.checked ? '_on' : '_off')); };
        SA.toggleRule = function (k, cb) {
            if (k === 'autoBlock') return save({ autoBlock: !!cb.checked }, cb.checked ? 'Đã bật tự chặn' : 'Đã tắt tự chặn', cb);
            if (k === 'proxy') {   // lưu ở settings/attendance.antiProxyEnabled (trang Điểm danh của thành viên đọc trường này)
                var on = !!cb.checked;
                return db.collection('settings').doc('attendance').set({ antiProxyEnabled: on }, { merge: true })
                    .then(function () { toast(on ? 'Đã BẬT chống điểm danh hộ' : 'Đã TẮT chống điểm danh hộ'); log(on ? 'antiproxy_on' : 'antiproxy_off'); }, function () { toast('Lỗi lưu cấu hình', 'error'); cb.checked = !on; });
            }
            var r = JSON.parse(JSON.stringify(SA.cfg.rules)); r[k].on = !!cb.checked;
            save({ rules: rulesPayload({ rules: r }) }, (cb.checked ? 'Đã bật: ' : 'Đã tắt: ') + RMAP[k].name, cb);
        };
        SA.saveThresholds = function () {
            var r = JSON.parse(JSON.stringify(SA.cfg.rules));
            d.querySelectorAll('#view-security input[data-n]').forEach(function (i) {
                var R = RMAP[i.dataset.k], n = R.nums.filter(function (x) { return x[0] === i.dataset.n; })[0], v = parseInt(i.value, 10);
                r[i.dataset.k][i.dataset.n] = isNaN(v) ? n[2] : Math.min(n[4], Math.max(n[3], v));
            });
            save({ rules: rulesPayload({ rules: r }) }, 'Đã lưu ngưỡng phát hiện').then(function () {
                d.querySelectorAll('#view-security input[data-n].dirty').forEach(function (i) { i.classList.remove('dirty'); }); $('sec-dirty').classList.add('hidden');
                SA.cfg.rules = r; renderCfg(); SA.scan(true);
            });
        };
        var PROT_N = { on: 'Bảo vệ mã nguồn', keys: 'Chặn phím xem mã', menu: 'Chặn chuột phải', copy: 'Chặn sao chép', devtools: 'Báo khi mở DevTools', staffExempt: 'Miễn cho thiết bị BQT' };
        SA.setProt = function (k, cb) {
            var o = {}; o[k] = !!cb.checked;
            save({ protect: o }, PROT_N[k] + ': ' + (cb.checked ? 'ĐÃ BẬT' : 'ĐÃ TẮT'), cb); log('protect_' + k + (cb.checked ? '_on' : '_off'));
        };
        SA.saveProtMsg = function () { var v = String($('sec-prot-msg').value || '').trim().slice(0, 160); save({ protect: { msg: v } }, 'Đã lưu lời nhắn'); $('sec-prot-msg').blur(); };
        SA.addWhite = function (u) {
            u = String(u || $('sec-white-in').value || '').trim(); if (!u) return;
            if (white(u)) { toast(u + ' đã có trong danh sách bỏ qua.', 'info'); return; }
            var w = SA.cfg.white.concat([u]); $('sec-white-in').value = '';
            save({ whitelist: w }, 'Đã bỏ qua cảnh báo cho ' + u); SA.cfg.white = w; renderCfg(); render();
        };
        SA.rmWhite = function (u) { var w = SA.cfg.white.filter(function (x) { return x !== u; }); save({ whitelist: w }, 'Đã theo dõi lại ' + u); SA.cfg.white = w; renderCfg(); render(); };
        function log(action, extra) { try { var o = { type: 'security', action: action, user: '(hệ thống)', by: S().currentUser || 'admin', timestamp: Date.now() }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); db.collection('admin_logs').add(o).catch(function () {}); } catch (e) {} }

        /* ---------- Quét dữ liệu ---------- */
        function grab(col, tsf, where) {
            var q = db.collection(col); if (where) q = q.where(where[0], where[1], where[2]);
            return q.get().then(function (s) { var a = []; s.forEach(function (x) { a.push(x.data()); }); if (tsf) a.sort(function (x, y) { return (x[tsf] || 0) - (y[tsf] || 0); }); return a; }, function (e) { console.warn('sec scan', col, e); return []; });
        }
        SA.scan = function (quiet) {
            if (SA.scanning) return; SA.scanning = true;
            var btn = $('sec-scan'); if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang quét...'; }
            var t0 = Date.now(), R = SA.cfg.rules;
            Promise.all([grab('accounts'), grab('lixi_history', 'timestamp'), db.collection('settings').doc('lixi_config').get().then(function (s) { return s.exists ? s.data() : {}; }, function () { return {}; }),
                grab('attendance', 'timestamp'), grab('spin_history', 'timestamp'), grab('tranhthuong_history', 'timestamp'), grab('con_history', 'ts'), grab('point_history', 'timestamp', ['action', '==', 'exchange']),
                grab('transfer_history', 'timestamp'), grab('rps_history', 'timestamp'), grab('security_devices')])
            .then(function (L) {
                var acc = L[0], lx = L[1], lxc = L[2], att = L[3], spin = L[4], tt = L[5], con = L[6], shop = L[7], gift = L[8], rps = L[9], devs = L[10], F = [];
                var add = function (k, sev, users, title, detail, at, extra) { users = [].concat(users).filter(Boolean); if (users.length && users.every(white)) return; F.push(Object.assign({ key: k, sev: sev, users: users, title: title, detail: detail, at: at || Date.now(), src: 'scan', rule: k.split(':')[0] }, extra || {})); };
                // Số dư âm
                if (R.neg.on) acc.forEach(function (a) { var bad = [['points', 'điểm'], ['spins', 'lượt quay'], ['tickets', 'lượt rút'], ['conThrows', 'lượt ném']].filter(function (f) { return Number(a[f[0]]) < 0; }); if (bad.length) add('neg:' + a.user, 'high', a.user, 'Số dư âm', bad.map(function (f) { return f[1] + ' = ' + fmt(a[f[0]]); }).join(', ') + ' — kiểm tra lịch sử biến động để tìm thao tác trừ sai.'); });
                // Vượt giới hạn lì xì / ngày
                if (R.lixi.on) { var lim = lxc.allowRedraw === true ? Math.min(50, Math.max(2, parseInt(lxc.maxPerDay, 10) || 3)) : 1, by = {};
                    lx.forEach(function (h) { if (h.status === 'revoked' || !h.user) return; var k = h.user + '|' + (h.dateKey || h.date || dKey(h.timestamp)); (by[k] = by[k] || []).push(h); });
                    Object.keys(by).forEach(function (k) { var a = by[k]; if (a.length > lim) add('lixi:' + k, 'high', a[0].user, 'Vượt giới hạn lì xì hằng ngày', 'Mở ' + a.length + ' lần trong ngày ' + (a[0].date || k.split('|')[1]) + ' (giới hạn ' + lim + ' lần), tổng ' + fmt(a.reduce(function (s, h) { return s + (h.amount || 0); }, 0)) + ' điểm.', a[a.length - 1].timestamp); }); }
                // Điểm danh trùng ngày
                if (R.attDup.on) { var ad = {}; att.forEach(function (x) { if (!x.userName) return; var k = x.userName + '|' + (x.date || dKey(x.timestamp)); (ad[k] = ad[k] || []).push(x); });
                    Object.keys(ad).forEach(function (k) { var a = ad[k]; if (a.length > 1) add('attDup:' + k, 'med', a[0].userName, 'Điểm danh trùng ngày', a.length + ' lần điểm danh ngày ' + (a[0].date || k.split('|')[1]) + ': ' + a.map(function (x) { return x.time || fDT(x.timestamp); }).join(', ') + '.', a[a.length - 1].timestamp); }); }
                // Thao tác dồn dập
                if (R.burst.on) [[spin, 'userId', 'timestamp', 'lượt quay'], [tt, 'userId', 'timestamp', 'lượt rút lì xì'], [con, 'user', 'ts', 'lượt ném còn'], [shop, 'user', 'timestamp', 'lần đổi quà']].forEach(function (S2) {
                    var by = {}; S2[0].forEach(function (x) { var u = x[S2[1]], t = Number(x[S2[2]]); if (u && t) (by[u] = by[u] || []).push(t); });
                    Object.keys(by).forEach(function (u) { var ts = by[u].sort(function (a, b) { return a - b; }), j = 0, best = 0, at = 0;
                        for (var i = 0; i < ts.length; i++) { while (ts[i] - ts[j] > 60000) j++; if (i - j + 1 > best) { best = i - j + 1; at = ts[i]; } }
                        if (best >= R.burst.n) add('burst:' + S2[3] + ':' + u + ':' + dKey(at), 'med', u, 'Thao tác dồn dập', best + ' ' + S2[3] + ' trong 60 giây (lúc ' + fDT(at) + ') — vượt ngưỡng ' + R.burst.n + '. Nghi dùng tool / tự động.', at); });
                });
                // Tỉ lệ trúng tiền bất thường
                if (R.win.on) [[spin, 'Vòng Quay', 'lượt quay'], [tt, 'Rút Lì Xì', 'lượt rút']].forEach(function (S2) {
                    var all = S2[0].filter(function (x) { return x.userId; }); if (all.length < R.win.min) return;
                    var cash = all.filter(function (x) { return !isWish(x.result); }).length, p = cash / all.length; if (!p) return;
                    var by = {}; all.forEach(function (x) { var o = by[x.userId] = by[x.userId] || { n: 0, c: 0, last: 0 }; o.n++; if (!isWish(x.result)) o.c++; o.last = Math.max(o.last, x.timestamp || 0); });
                    Object.keys(by).forEach(function (u) { var o = by[u], r = o.c / o.n; if (o.n >= R.win.min && o.c >= 2 && r >= p * R.win.x && r > p) add('win:' + S2[1] + ':' + u, 'med', u, 'Tỉ lệ trúng tiền bất thường · ' + S2[1], 'Trúng ' + o.c + '/' + o.n + ' ' + S2[2] + ' (' + (r * 100).toFixed(0) + '%) so với mặt bằng ' + (p * 100).toFixed(1) + '% — gấp ' + (r / p).toFixed(1) + ' lần.', o.last); });
                });
                // Kéo Búa Bao
                if (R.rps.on) { var pl = {}; rps.forEach(function (m) { [m.player1, m.player2].forEach(function (u) { if (!u) return; var o = pl[u] = pl[u] || { n: 0, w: 0, last: 0 }; o.n++; if (m.winner === u) o.w++; o.last = Math.max(o.last, m.timestamp || 0); }); });
                    Object.keys(pl).forEach(function (u) { var o = pl[u]; if (o.n >= R.rps.min && o.w / o.n * 100 >= R.rps.pct) add('rps:' + u, 'low', u, 'Thắng Kéo Búa Bao bất thường', 'Thắng ' + o.w + '/' + o.n + ' trận (' + Math.round(o.w / o.n * 100) + '%).', o.last); }); }
                // Dồn lượt qua tặng quà (7 ngày)
                if (R.funnel.on) { var since = Date.now() - 7 * 864e5, rc = {};
                    gift.forEach(function (g) { if ((g.timestamp || 0) < since || !g.to) return; var o = rc[g.to] = rc[g.to] || { from: {}, amt: 0, last: 0 }; o.from[g.from] = (o.from[g.from] || 0) + (Number(g.amount) || 0); o.amt += Number(g.amount) || 0; o.last = Math.max(o.last, g.timestamp || 0); });
                    Object.keys(rc).forEach(function (u) { var o = rc[u], fr = Object.keys(o.from); if (fr.length >= R.funnel.n) add('funnel:' + u + ':' + dKey(o.last), 'med', [u].concat(fr), 'Dồn lượt qua tặng quà', u + ' nhận ' + fmt(o.amt) + ' lượt từ ' + fr.length + ' người trong 7 ngày: ' + fr.map(function (f) { return f + ' (' + o.from[f] + ')'; }).join(', ') + '.', o.last); }); }
                // Nhiều tài khoản / 1 thiết bị
                if (R.device.on) devs.forEach(function (dv) { var us = (dv.users || []).filter(Boolean); if (us.length >= R.device.n) add('device:' + us.slice().sort().join(','), 'med', us, 'Nhiều tài khoản trên 1 thiết bị', us.length + ' tài khoản đăng nhập trên cùng 1 thiết bị: ' + us.join(', ') + '.', dv.lastAt, { ua: dv.ua }); });
                // Nhiều tài khoản / 1 mạng (điểm danh)
                if (R.ip.on) { var ip = {}; att.forEach(function (x) { if (!x.ipAddress || !x.userName) return; var o = ip[x.ipAddress] = ip[x.ipAddress] || { u: {}, last: 0 }; o.u[x.userName] = 1; o.last = Math.max(o.last, x.timestamp || 0); });
                    Object.keys(ip).forEach(function (k) { var us = Object.keys(ip[k].u); if (us.length >= R.ip.n) add('ip:' + k, 'low', us, 'Nhiều tài khoản / 1 mạng', us.length + ' tài khoản điểm danh từ cùng địa chỉ mạng ' + k + ': ' + us.join(', ') + '. Có thể là Wi-Fi chung — cần xem xét thêm.', ip[k].last); }); }

                SA.scanF = F; SA.lastScan = Date.now();
                STATE.set({ lastScanAt: SA.lastScan, lastScanBy: S().currentUser || 'admin', lastCount: F.length, lastMs: Date.now() - t0 }, { merge: true }).catch(function () {});
                render();
                if (!quiet) toast('Quét xong: ' + F.length + ' dấu hiệu' + (F.length ? ' — xem danh sách Cảnh báo.' : ', dữ liệu sạch.'), F.length ? 'warning' : 'success');
            }).catch(function (e) { console.error('sec scan', e); toast('Lỗi khi quét dữ liệu.', 'error'); })
              .then(function () { SA.scanning = false; if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-magnifying-glass-chart"></i> Quét dữ liệu ngay'; } });
        };

        /* ---------- Danh sách ---------- */
        function findings() {
            var res = (SA.state.resolved || {});
            var fl = SA.flags.map(function (f) { var t = FLAG_T[f.type] || ['⚠️', f.type];
                return { key: 'flag:' + f.id, id: f.id, sev: f.sev || 'med', users: f.user ? [f.user] : [], title: t[1], icon: t[0], detail: f.detail || '', at: f.at || 0, src: f.by === 'server' ? 'server' : 'client', page: f.page, device: f.device, ua: f.ua, done: f.status === 'resolved', rule: f.type }; });
            var sc = SA.scanF.map(function (f) { return Object.assign({}, f, { icon: (RMAP[f.rule] || {}).ic || '⚠️', done: !!res[f.key] }); });
            return fl.concat(sc).filter(function (f) { return !(f.users.length && f.users.every(white)); }).sort(function (a, b) { return (a.done - b.done) || ({ high: 0, med: 1, low: 2 }[a.sev] - { high: 0, med: 1, low: 2 }[b.sev]) || (b.at - a.at); });
        }
        SA.findings = findings;
        function accOf(u) { return (S().accountsCache || []).filter(function (a) { return a.user === u; })[0]; }
        function render() {
            if (!$('sec-list')) return;
            d.querySelectorAll('#view-security .sec-tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === SA.tab); });
            $('sec-tools-flags').classList.toggle('hidden', SA.tab !== 'flags'); $('sec-tools-errors').classList.toggle('hidden', SA.tab !== 'errors'); $('sec-tools-devices').classList.toggle('hidden', SA.tab !== 'devices');
            var all = findings(), open = all.filter(function (f) { return !f.done; }), errOpen = SA.errors.filter(function (e) { return e.status !== 'fixed'; });
            var bf = $('sec-b-flags'), be = $('sec-b-errors'); bf.textContent = open.length; bf.classList.toggle('zero', !open.length); be.textContent = errOpen.length; be.classList.toggle('zero', !errOpen.length);
            stats(all, open, errOpen);
            d.querySelectorAll('.js-sec-badge').forEach(function (x) { x.textContent = open.length > 99 ? '99+' : open.length; x.style.display = open.length ? '' : 'none'; });
            $('sec-scan-info').innerHTML = SA.tab === 'flags' ? (SA.lastScan ? '<i class="fa-solid fa-clock-rotate-left"></i> Quét dữ liệu lần cuối: ' + fDT(SA.lastScan) + ' (' + ago(SA.lastScan) + ') · ' + SA.scanF.length + ' dấu hiệu từ dữ liệu, ' + SA.flags.length + ' cảnh báo từ máy thành viên' : 'Chưa quét dữ liệu — bấm <b>Quét dữ liệu ngay</b>.') + (SA.cfg.on ? '' : ' · <b class="text-warning">Chống gian lận đang TẮT</b>')
                : (SA.cfg.err ? 'Lỗi gửi về từ máy thành viên, gộp theo từng lỗi. Bấm "Đã sửa" sau khi khắc phục — nếu lỗi xuất hiện lại sẽ tự mở lại.' : '<b class="text-warning">Tự ghi lỗi đang TẮT</b> — chỉ hiện các lỗi đã ghi trước đó.');
            if (SA.tab === 'devices') { $('sec-scan-info').innerHTML = devInfo(); return renderDevices(); }
            if (SA.tab === 'errors') return renderErrors();
            var sev = $('sec-f-sev').value, st = $('sec-f-st').value, q = ($('sec-f-q').value || '').trim().toLowerCase();
            var list = all.filter(function (f) { return (!sev || f.sev === sev) && (!st || (st === 'open' ? !f.done : f.done)) && (!q || f.users.some(function (u) { return u.toLowerCase().indexOf(q) >= 0; })); });
            if (!list.length) { $('sec-list').innerHTML = '<div class="sec-empty">' + (all.length ? 'Không có cảnh báo nào khớp bộ lọc.' : '🛡️ Chưa phát hiện dấu hiệu bất thường nào.') + '</div>'; return; }
            $('sec-list').innerHTML = list.slice(0, 300).map(function (f) {
                var s = SEV[f.sev] || SEV.med, u0 = f.users[0], a0 = accOf(u0), locked = a0 && a0.isBlocked;
                return '<div class="sf ' + f.sev + (f.done ? ' done' : '') + '"><div class="sf-ic">' + f.icon + '</div><div style="min-width:0">'
                    + '<div class="sf-t"><b>' + esc(f.title) + '</b><span class="sev ' + s[1] + '">' + s[0] + '</span><span class="sf-src">' + (f.src === 'client' ? '📱 Máy thành viên' : f.src === 'server' ? '🖥️ Máy chủ' : '🔍 Quét dữ liệu') + '</span>' + (f.done ? '<span class="sf-src">✓ Đã xử lý</span>' : '') + '</div>'
                    + '<p>' + esc(f.detail) + '</p>'
                    + (f.users.length ? '<div class="sf-users">' + f.users.slice(0, 12).map(function (u) { var a = accOf(u); return '<button type="button" class="sf-u' + (a && a.isBlocked ? ' lk' : '') + '" data-hist="' + esc(u) + '" title="Xem lịch sử biến động của ' + esc(u) + '">' + (a && a.isBlocked ? '🔒' : '👤') + ' ' + esc(u) + '</button>'; }).join('') + (f.users.length > 12 ? '<span class="text-muted text-sm">+' + (f.users.length - 12) + '</span>' : '') + '</div>' : '')
                    + '<small class="m">' + (f.at ? fDT(f.at) + ' · ' + ago(f.at) : '') + (f.page ? ' · trang ' + esc(f.page) : '') + (f.device ? ' · thiết bị ' + esc(String(f.device).slice(0, 10)) : '') + (f.ua ? ' · ' + esc(String(f.ua).replace(/^Mozilla\/5\.0 /, '').slice(0, 70)) : '') + '</small></div>'
                    + '<div class="sf-act">'
                    + (u0 && f.users.length === 1 ? (locked ? '<button class="btn btn-outline" disabled>🔒 Đã khóa</button>' : '<button class="btn btn-outline" data-lock="' + esc(u0) + '" data-why="' + esc(f.title) + '"><i class="fa-solid fa-lock"></i> Khóa</button>') : '')
                    + '<button class="btn btn-outline" data-done="' + esc(f.key) + '">' + (f.done ? '<i class="fa-solid fa-rotate-left"></i> Mở lại' : '<i class="fa-solid fa-check"></i> Đã xử lý') + '</button>'
                    + (f.users.length ? '<button class="btn btn-outline" data-white="' + esc(f.users.join(',')) + '" title="Không cảnh báo các tài khoản này nữa"><i class="fa-solid fa-eye-slash"></i> Bỏ qua</button>' : '')
                    + '</div></div>';
            }).join('') + (list.length > 300 ? '<div class="sec-empty">Hiện 300 / ' + list.length + ' — dùng bộ lọc để thu hẹp.</div>' : '');
        }
        /* ---------- Đa thiết bị (máy chủ ghi khi đăng nhập) ---------- */
        SA.dev = null;
        function devInfo() {
            var r = SA.cfg.rules, A = r.oneDevice || {}, B = r.oneAccount || {}, on = function (x) { return x && x.on && SA.cfg.on ? '<b style="color:var(--color-success)">BẬT</b>' : '<b class="text-muted">TẮT</b>'; };
            return '📲 1 tài khoản – 1 thiết bị: ' + on(A) + (A.on ? ' (khóa sau ' + (A.n ? A.n + ' lần / ' + A.h + ' giờ' : '— không khóa') + ')' : '') + ' · 👥 1 thiết bị – 1 tài khoản: ' + on(B) + (B.on ? ' (khóa sau ' + (B.n ? B.n + ' lần cố' : '— không khóa') + ')' : '')
                + '<br>Danh sách dưới đây do máy chủ ghi mỗi lần đăng nhập (kể cả khi đang tắt, để bật lên là có dữ liệu ngay).';
        }
        SA.loadDevices = function () {
            if (!window.QDdb || !QDdb.admin) { $('sec-list').innerHTML = '<div class="sec-empty">Cần máy chủ VPS.</div>'; return; }
            $('sec-list').innerHTML = '<div class="sec-empty"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>';
            QDdb.admin('secDevices').then(function (r) { SA.dev = r; var n = r.devs.filter(function (x) { return Object.keys(x.denied || {}).length; }).length + r.sess.filter(function (x) { return x.kicks; }).length;
                var b = $('sec-b-devices'); b.textContent = n; b.classList.toggle('zero', !n); if (SA.tab === 'devices') renderDevices(); },
                function (e) { $('sec-list').innerHTML = '<div class="sec-empty">' + (e && /Lệnh lạ/.test(e.message || '') ? 'Máy chủ đang chạy bản cũ — vào Máy chủ VPS bấm <b>Cập nhật máy chủ</b>.' : esc(e && e.message || e)) + '</div>'; });
        };
        function devName(id) { id = String(id || ''); return (id.indexOf('a:') === 0 ? '📱 App Android ' : id.indexOf('w:') === 0 ? '🌐 Trình duyệt ' : '❔ ') + '<code>' + esc(id.slice(2, 12)) + '…</code>'; }
        function uaShort(ua) { ua = String(ua || ''); var m = ua.match(/\(([^)]+)\)/); return esc((m ? m[1] : ua).slice(0, 70)); }
        function renderDevices() {
            var r = SA.dev; if (!r) { SA.loadDevices(); return; }
            var q = ($('sec-d-q').value || '').trim().toLowerCase(), hit = function (u) { return !q || String(u || '').toLowerCase().indexOf(q) >= 0; };
            var ss = r.sess.filter(function (x) { return hit(x.user); }), dv = r.devs.filter(function (x) { return hit(x.user) || (x.users || []).some(hit) || Object.keys(x.denied || {}).some(hit); });
            var h = '<div class="sd-sec"><h4>📲 Tài khoản đăng nhập nhiều thiết bị <span class="sd-tag mu">' + ss.length + '</span></h4>' + (ss.length ? ss.map(function (x) {
                var a = accOf(x.user), lk = a && a.isBlocked;
                return '<div class="sd-row"><div><b>' + esc(x.user) + '</b>' + (x.kicks ? '<span class="sd-tag">' + x.kicks + ' lần vi phạm / ' + r.cfg.A.h + ' giờ</span>' : '') + (x.live > 1 ? '<span class="sd-tag">đang mở ' + x.live + ' thiết bị</span>' : '') + (lk ? '<span class="sd-tag">🔒 đã khóa</span>' : '')
                    + '<small>Thiết bị hiện tại: ' + devName(x.dev) + ' · đăng nhập ' + fDT(x.at) + (x.lastKick ? ' · vi phạm gần nhất ' + ago(x.lastKick) : '') + (x.ip ? ' · IP ' + esc(x.ip) : '') + '<br>' + uaShort(x.ua) + '</small></div>'
                    + '<div class="sd-act"><button class="btn btn-outline" data-hist="' + esc(x.user) + '"><i class="fa-solid fa-clock-rotate-left"></i> Lịch sử</button><button class="btn btn-outline" data-kick="' + esc(x.user) + '"><i class="fa-solid fa-right-from-bracket"></i> Đăng xuất mọi nơi</button>'
                    + (x.kicks ? '<button class="btn btn-outline" data-dclear="' + esc(x.user) + '"><i class="fa-solid fa-eraser"></i> Xóa đếm</button>' : '') + (lk ? '' : '<button class="btn btn-outline" data-lock="' + esc(x.user) + '" data-why="Dùng 1 tài khoản trên nhiều thiết bị"><i class="fa-solid fa-lock"></i> Khóa</button>') + '</div></div>';
            }).join('') : '<div class="sec-empty">Chưa có tài khoản nào đăng nhập nhiều thiết bị.</div>') + '</div>';
            h += '<div class="sd-sec"><h4>👥 Thiết bị có nhiều tài khoản <span class="sd-tag mu">' + dv.length + '</span></h4>' + (dv.length ? dv.map(function (x) {
                var den = Object.keys(x.denied || {}), others = (x.users || []).filter(function (u) { return u !== x.user && !(u in (x.denied || {})); });
                return '<div class="sd-row"><div><b>' + devName(x.id) + '</b> → <b>' + esc(x.user || '(chưa gắn)') + '</b>' + (den.length ? '<span class="sd-tag">' + den.length + ' tài khoản bị chặn</span>' : '')
                    + '<small>' + (den.length ? 'Bị chặn: ' + den.map(function (u) { var a = accOf(u); return esc(u) + ' (' + x.denied[u] + ' lần' + (a && a.isBlocked ? ', 🔒' : '') + ')'; }).join(', ') + '<br>' : '') + (others.length ? 'Từng đăng nhập: ' + others.map(esc).join(', ') + '<br>' : '')
                    + 'Dùng lần cuối ' + fDT(x.last) + (x.ip ? ' · IP ' + esc(x.ip) : '') + ' · ' + uaShort(x.ua) + '</small></div>'
                    + '<div class="sd-act"><button class="btn btn-outline" data-unbind="' + esc(x.id) + '" title="Cho thiết bị này dùng được cho tài khoản khác"><i class="fa-solid fa-link-slash"></i> Gỡ gắn thiết bị</button>'
                    + den.map(function (u) { return '<button class="btn btn-outline" data-white="' + esc(u) + '" title="Miễn kiểm tra cho ' + esc(u) + '"><i class="fa-solid fa-user-check"></i> Miễn ' + esc(u) + '</button>'; }).join('') + '</div></div>';
            }).join('') : '<div class="sec-empty">Chưa có thiết bị nào dùng cho nhiều tài khoản.</div>') + '</div>';
            $('sec-list').innerHTML = h;
        }
        function devAct(b) {
            if (b.dataset.kick) return QDdb.admin('secKick', { u: b.dataset.kick }).then(function (r) { toast('Đã đăng xuất ' + b.dataset.kick + ' trên ' + r.kicked + ' kết nối'); SA.loadDevices(); }, function (e) { toast(e.message || 'Lỗi', 'error'); });
            if (b.dataset.dclear) return QDdb.admin('secClear', { u: b.dataset.dclear }).then(function () { toast('Đã xóa đếm vi phạm của ' + b.dataset.dclear); SA.loadDevices(); }, function (e) { toast(e.message || 'Lỗi', 'error'); });
            if (b.dataset.unbind) return QDdb.admin('secUnbind', { dev: b.dataset.unbind }).then(function () { toast('Đã gỡ gắn thiết bị — tài khoản khác đăng nhập được'); SA.loadDevices(); }, function (e) { toast(e.message || 'Lỗi', 'error'); });
        }
        function renderErrors() {
            var st = $('sec-e-st').value, k = $('sec-e-kind').value;
            var list = SA.errors.filter(function (e) { return (!st || (st === 'open' ? e.status !== 'fixed' : e.status === 'fixed')) && (!k || e.kind === k); });
            if (!list.length) { $('sec-list').innerHTML = '<div class="sec-empty">' + (SA.errors.length ? 'Không có lỗi nào khớp bộ lọc.' : '✅ Chưa ghi nhận lỗi nào.') + '</div>'; return; }
            $('sec-list').innerHTML = list.slice(0, 200).map(function (e) {
                var us = Array.isArray(e.users) ? e.users : [];
                return '<div class="sf ' + (e.kind === 'resource' ? 'low' : e.kind === 'console' ? 'med' : 'high') + (e.status === 'fixed' ? ' done' : '') + '"><div class="sf-ic">' + (e.kind === 'resource' ? '📁' : e.kind === 'console' ? '⚠️' : '🐞') + '</div><div style="min-width:0">'
                    + '<div class="sf-t"><span class="se-kind ' + esc(e.kind) + '">' + esc(KIND[e.kind] || e.kind) + '</span><b>Trang ' + esc(e.page || '?') + '</b>' + (e.file ? '<span class="sf-src">' + esc(e.file) + (e.line ? ':' + e.line : '') + '</span>' : '') + (e.status === 'fixed' ? '<span class="sf-src">✓ Đã sửa</span>' : '') + '</div>'
                    + '<div class="se-msg">' + esc(e.msg) + '</div>'
                    + '<small class="m">Lần gần nhất: ' + fDT(e.lastAt) + ' (' + ago(e.lastAt || 0) + ')' + (e.lastUser ? ' · ' + esc(e.lastUser) : '') + (us.length ? ' · ' + us.length + ' người gặp: ' + esc(us.slice(0, 8).join(', ')) + (us.length > 8 ? '…' : '') : '') + '</small>'
                    + ((e.stack || e.lastUa) ? '<details><summary>Chi tiết kỹ thuật</summary><pre>' + esc((e.stack || '') + (e.lastUa ? '\n\nTrình duyệt: ' + e.lastUa : '')) + '</pre></details>' : '')
                    + '</div><div class="sf-act"><div class="se-cnt">' + fmt(e.count || 1) + '<small>lần</small></div>'
                    + '<button class="btn btn-outline" data-fix="' + esc(e.id) + '" data-st="' + (e.status === 'fixed' ? 'open' : 'fixed') + '">' + (e.status === 'fixed' ? '<i class="fa-solid fa-rotate-left"></i> Mở lại' : '<i class="fa-solid fa-check"></i> Đã sửa') + '</button>'
                    + '<button class="btn btn-outline" data-del="' + esc(e.id) + '"><i class="fa-solid fa-trash"></i> Xóa</button></div></div>';
            }).join('');
        }
        function stats(all, open, errOpen) {
            var users = {}; open.forEach(function (f) { f.users.forEach(function (u) { users[u] = 1; }); });
            var hi = open.filter(function (f) { return f.sev === 'high'; }).length, day = Date.now() - 864e5;
            var e24 = SA.errors.filter(function (e) { return (e.lastAt || 0) >= day; }).length;
            var card = function (lbl, n, sub, color) { return '<div class="card inv-stat"><div class="inv-stat-lbl">' + lbl + '</div><div class="inv-stat-num"' + (color && n ? ' style="color:' + color + '"' : '') + '>' + fmt(n) + '</div><div class="inv-stat-sub">' + sub + '</div></div>'; };
            $('sec-stats').innerHTML = card('Cảnh báo chưa xử lý', open.length, 'trên tổng ' + all.length, 'var(--color-warning)') + card('Mức cao', hi, 'cần xem ngay', 'var(--color-danger)')
                + card('Tài khoản bị nghi', Object.keys(users).length, 'chưa xử lý') + card('Lỗi đang mở', errOpen.length, e24 + ' lỗi xuất hiện trong 24 giờ', 'var(--color-danger)');
        }

        /* ---------- Xử lý ---------- */
        function onAct(e) {
            var b = e.target.closest('button'); if (!b) return;
            if (b.dataset.kick || b.dataset.dclear || b.dataset.unbind) return devAct(b);
            if (b.dataset.hist) { if (typeof AdminActions !== 'undefined' && AdminActions.viewUserHistory) AdminActions.viewUserHistory(b.dataset.hist); return; }
            if (b.dataset.done) return SA.resolve(b.dataset.done);
            if (b.dataset.white) { b.dataset.white.split(',').forEach(function (u) { if (!white(u)) SA.cfg.white.push(u); }); save({ whitelist: SA.cfg.white }, 'Đã bỏ qua cảnh báo cho ' + b.dataset.white.replace(/,/g, ', ')); renderCfg(); render(); return; }
            if (b.dataset.lock) {
                if (SA.armed !== b.dataset.lock) { SA.armed = b.dataset.lock; b.classList.add('arm'); b.innerHTML = '<i class="fa-solid fa-lock"></i> Bấm lần nữa để khóa'; setTimeout(function () { if (SA.armed === b.dataset.lock) { SA.armed = ''; render(); } }, 4000); return; }
                SA.armed = ''; return SA.lock(b.dataset.lock, b.dataset.why);
            }
            if (b.dataset.fix) { db.collection('error_logs').doc(b.dataset.fix).set({ status: b.dataset.st, fixedAt: b.dataset.st === 'fixed' ? Date.now() : null, fixedBy: S().currentUser || 'admin' }, { merge: true }).then(function () { toast(b.dataset.st === 'fixed' ? 'Đã đánh dấu đã sửa.' : 'Đã mở lại lỗi.'); }, function () { toast('Lỗi cập nhật.', 'error'); }); return; }
            if (b.dataset.del) { db.collection('error_logs').doc(b.dataset.del).delete().then(function () { toast('Đã xóa lỗi.'); }, function () { toast('Không xóa được (không đủ quyền hoặc mất kết nối máy chủ).', 'error'); }); }
        }
        SA.resolve = function (key) {
            var f = findings().filter(function (x) { return x.key === key; })[0]; if (!f) return;
            var by = S().currentUser || 'admin';
            if (f.src === 'client') return db.collection('security_flags').doc(f.id).set({ status: f.done ? 'new' : 'resolved', resolvedAt: Date.now(), resolvedBy: by }, { merge: true }).then(function () { toast(f.done ? 'Đã mở lại cảnh báo.' : 'Đã đánh dấu đã xử lý.'); }, function () { toast('Lỗi cập nhật.', 'error'); });
            var r = Object.assign({}, SA.state.resolved || {}), patch = {};
            if (f.done) { delete r[key]; patch[key] = firebase.firestore.FieldValue.delete(); } else { r[key] = patch[key] = { at: Date.now(), by: by }; }
            SA.state.resolved = r; render();
            STATE.set({ resolved: patch }, { merge: true }).then(function () { toast(f.done ? 'Đã mở lại cảnh báo.' : 'Đã đánh dấu đã xử lý.'); }, function () { toast('Lỗi lưu trạng thái.', 'error'); });
        };
        SA.lock = function (u, why) {
            var a = accOf(u);
            var go = function (id) {
                return db.collection('accounts').doc(id).update({ isBlocked: true, lockedAt: Date.now(), unlockRequestedAt: null, lockReason: 'security', lockNote: String(why || 'Nghi vấn gian lận').slice(0, 200) })
                    .then(function () { toast('Đã khóa ' + u + ' — thành viên không tự mở khóa được, phải liên hệ BQT.', 'warning'); log('lock', { target: u, reason: why || '' }); render(); }, function () { toast('Không khóa được tài khoản.', 'error'); });
            };
            if (a && a.docId) return go(a.docId);
            db.collection('accounts').where('user', '==', u).limit(1).get().then(function (s) { if (s.empty) toast('Không tìm thấy tài khoản ' + u, 'error'); else go(s.docs[0].id); });
        };
        SA.clearFixed = function () {
            var fx = SA.errors.filter(function (e) { return e.status === 'fixed'; }); if (!fx.length) return toast('Không có lỗi nào đã sửa.', 'info');
            var b = db.batch(); fx.slice(0, 400).forEach(function (e) { b.delete(db.collection('error_logs').doc(e.id)); });
            b.commit().then(function () { toast('Đã xóa ' + Math.min(400, fx.length) + ' lỗi đã sửa.'); }, function () { toast('Không xóa được (không đủ quyền hoặc mất kết nối máy chủ).', 'error'); });
        };

        SA.start = function () {
            if (SA.started) return; SA.started = true;
            try { localStorage.setItem('qd_staff', String(Date.now())); } catch (e) {}   // trình duyệt này đã đăng nhập Admin -> được miễn Bảo vệ mã nguồn (nếu bật)
            buildRules(); renderCfg(); render();
            CFG.onSnapshot(function (s) { SA.cfg = norm(s.exists ? s.data() : null); renderCfg(); render(); }, function (e) { console.warn('security_config', e); });
            db.collection('settings').doc('attendance').onSnapshot(function (s) { SA.anti = !(s.exists && s.data().antiProxyEnabled === false); renderCfg(); }, function () {});
            STATE.onSnapshot(function (s) { SA.state = s.exists ? s.data() : {}; if (!SA.lastScan && SA.state.lastScanAt) SA.lastScanPrev = SA.state.lastScanAt; render(); }, function () {});
            db.collection('security_flags').orderBy('at', 'desc').limit(500).onSnapshot(function (snap) { SA.flags = snap.docs.map(function (x) { return Object.assign({ id: x.id }, x.data()); }); render(); }, function (e) { console.warn('security_flags', e); });
            db.collection('error_logs').orderBy('lastAt', 'desc').limit(300).onSnapshot(function (snap) { SA.errors = snap.docs.map(function (x) { return Object.assign({ id: x.id }, x.data()); }); render(); }, function (e) { console.warn('error_logs', e); });
            setInterval(function () { var v = $('view-security'); if (v && v.classList.contains('active')) render(); }, 60000);
            // Mở mục: tự quét nếu lần quét gần nhất đã quá 10 phút
            var base = UI.navigate;
            UI.navigate = function (v) { var r = base.apply(this, arguments); if (v === 'security' && $('view-security').classList.contains('active') && (!SA.lastScan || Date.now() - SA.lastScan > 600000)) SA.scan(true); return r; };
        };

        /* ---------- Nguồn cho hộp Xuất Báo Cáo ---------- */
        if (window.QDReport && QDReport.add) {
            QDReport.add({ id: 'security', view: 'security', name: 'Cảnh Báo Gian Lận', icon: 'fa-shield-halved', color: '#dc2626', file: 'Canh_Bao_Gian_Lan', col: 'security_flags + quét dữ liệu',
                load: function () { return Promise.resolve(findings()); }, time: function (x) { return x.at; }, who: function (x) { return x.users; },
                cols: [['Thời gian', function (x) { return x.at ? new Date(x.at).toLocaleString('vi-VN') : ''; }], ['Mức độ', function (x) { return (SEV[x.sev] || SEV.med)[0]; }], ['Loại', function (x) { return x.title; }],
                    ['Tài khoản', function (x) { return x.users.join(', '); }], ['Chi tiết', function (x) { return x.detail; }], ['Nguồn', function (x) { return x.src === 'client' ? 'Máy thành viên' : 'Quét dữ liệu'; }], ['Trạng thái', function (x) { return x.done ? 'Đã xử lý' : 'Chưa xử lý'; }]],
                kpi: function (r) { return [['Mức cao', fmt(r.filter(function (x) { return x.sev === 'high'; }).length), 'cảnh báo'], ['Chưa xử lý', fmt(r.filter(function (x) { return !x.done; }).length), 'cảnh báo']]; },
                brk: ['Theo loại', function (x) { return x.title; }], rank: ['Bị cảnh báo nhiều nhất', 'lần'] });
            QDReport.add({ id: 'errors', view: 'security', name: 'Lỗi Hệ Thống', icon: 'fa-bug', color: '#7c3aed', file: 'Loi_He_Thong', col: 'error_logs',
                load: function () { return Promise.resolve(SA.errors.slice()); }, time: function (x) { return x.lastAt; }, who: function (x) { return Array.isArray(x.users) ? x.users : []; },
                cols: [['Lần gần nhất', function (x) { return x.lastAt ? new Date(x.lastAt).toLocaleString('vi-VN') : ''; }], ['Loại', function (x) { return KIND[x.kind] || x.kind; }], ['Trang', function (x) { return x.page; }],
                    ['Vị trí', function (x) { return (x.file || '') + (x.line ? ':' + x.line : ''); }], ['Thông báo lỗi', function (x) { return x.msg; }], ['Số lần', function (x) { return x.count || 1; }, 'n'], ['Số người gặp', function (x) { return (x.users || []).length; }, 'n'], ['Trạng thái', function (x) { return x.status === 'fixed' ? 'Đã sửa' : 'Đang mở'; }]],
                kpi: function (r) { return [['Tổng lượt lỗi', fmt(r.reduce(function (a, x) { return a + (x.count || 1); }, 0)), 'lần xảy ra'], ['Đang mở', fmt(r.filter(function (x) { return x.status !== 'fixed'; }).length), 'lỗi']]; },
                brk: ['Theo trang', function (x) { return x.page || '?'; }, function (x) { return x.count || 1; }] });
        }
    })();
    
