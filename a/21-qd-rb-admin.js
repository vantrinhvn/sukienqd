    /* ===== ADMIN > BOT BÁO CÁO: bật / tắt, ngày giờ, nội dung (bật / tắt từng mục), xem trước tức thì, gửi ngay, lịch sử.
       Trang Admin đang mở cũng trực gửi theo lịch. ===== */
    window.RBAdmin = (function () {
        'use strict';
        var R = window.QDReportBot, $ = function (id) { return document.getElementById(id); }, esc = R.esc;
        var SCHED = ['times', 'days', 'from', 'to', 'grace'];
        var KEYS = SCHED.concat(['botName', 'title', 'footer', 'sec', 'tag', 'showTime', 'excludeStaff', 'skipEmpty', 'exclude', 'maxNames']);
        var DAYS = [[1, 'T2'], [2, 'T3'], [3, 'T4'], [4, 'T5'], [5, 'T6'], [6, 'T7'], [0, 'CN']];
        var VARS = [['{thu}', 'Thứ'], ['{ngay}', 'Ngày'], ['{gio}', 'Giờ chốt'], ['{diemdanh}', 'Số đã điểm danh'], ['{dangnhap}', 'Số đăng nhập'], ['{chuadiemdanh}', 'Số chưa điểm danh'], ['{khaiid}', 'Số đã khai ID'], ['{chuakhaiid}', 'Số chưa khai ID'], ['{khainh}', 'Số đã khai ngân hàng'], ['{chuakhainh}', 'Số chưa khai ngân hàng'], ['{tong}', 'Tổng thành viên'], ['{tile}', 'Tỉ lệ %'], ['{bikhoa}', 'Số bị khóa'], ['{bot}', 'Tên bot']];
        var C = null, F = null, DATA = null, LASTX = null, started = false, armT = 0, pvT = 0;
        function me() { try { return (typeof State !== 'undefined' && State.currentUser) || ''; } catch (e) { return ''; } }
        function toast(m, k) { try { Utils.toast(m, k); } catch (e) {} }
        function pick(o) { var r = {}; KEYS.forEach(function (k) { r[k] = JSON.parse(JSON.stringify(o[k])); }); return r; }
        function dirty() { return !!(C && F) && JSON.stringify(pick(F)) !== JSON.stringify(pick(C)); }
        function live() { return R.norm(Object.assign({}, C || {}, F || {})); }
        function when(ts) { var p = R.vnParts(ts); return R.WD[p.wd] + ', ' + R.pad(p.d) + '/' + R.pad(p.m) + ' lúc ' + R.hm(ts); }
        function left(ms) {
            if (ms <= 0) return 'đang tới giờ';
            var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
            return 'còn ' + (d ? d + ' ngày ' : '') + (d || h ? h + ' giờ ' : '') + (d ? '' : m + ' phút') + (!d && !h && m < 1 ? (s % 60) + ' giây' : '');
        }
        function viewOn() { var v = $('view-reportbot'); return !!(v && v.classList.contains('active')) && !document.hidden; }

        /* ---------- Cấu hình từ máy chủ ---------- */
        function onCfg(ev, cfg) {
            if (!cfg || ev.type !== 'cfg') return;
            var wd = dirty(); C = cfg;
            if (!F || !wd) { F = pick(cfg); fill(); }
            else toast('Thiết lập Bot vừa được đổi ở máy khác — bấm Hoàn tác để lấy bản mới.', 'info');
            status(); mark(); preview();
        }
        function status() {
            if (!C) return;
            var on = C.isEnabled;
            $('rb-sw').checked = on;
            $('rb-sw-txt').textContent = on ? 'ĐANG BẬT' : 'ĐANG TẮT'; $('rb-sw-txt').style.color = on ? 'var(--color-success)' : 'var(--text-muted)';
            $('rb-status').classList.toggle('on', on);
            clock();
        }
        function clock() {
            if (!C || !$('rb-next')) return;
            if (!C.isEnabled) { $('rb-next').textContent = 'Đang tắt'; $('rb-next-sub').textContent = 'Bật công tắc để gửi theo lịch'; return; }
            var n = R.nextRun(C, Date.now());
            if (!n) { $('rb-next').textContent = 'Không có'; $('rb-next-sub').textContent = !C.times.length ? 'Chưa có giờ gửi' : !C.days.length ? 'Chưa chọn ngày' : 'Đã hết khoảng ngày áp dụng'; return; }
            $('rb-next').textContent = when(n.ts); $('rb-next-sub').textContent = left(n.ts - Date.now());
        }

        /* ---------- Biểu mẫu ---------- */
        function fill() {
            if (!F) return;
            $('rb-times').innerHTML = F.times.length ? F.times.map(function (t) { return '<span class="rb-chip">' + t + '<button type="button" aria-label="Bỏ ' + t + '" onclick="RBAdmin.delTime(\'' + t + '\')"><i class="fa-solid fa-xmark"></i></button></span>'; }).join('') : '<span class="rb-empty">Chưa có giờ gửi nào.</span>';
            $('rb-days').innerHTML = DAYS.map(function (d) { var on = F.days.indexOf(d[0]) >= 0; return '<button type="button" class="rb-day' + (on ? ' on' : '') + '" aria-pressed="' + on + '" onclick="RBAdmin.toggleDay(' + d[0] + ')">' + d[1] + '</button>'; }).join('');
            $('rb-exclude').innerHTML = F.exclude.length ? F.exclude.map(function (u, i) { return '<span class="rb-chip sm">@' + esc(u) + '<button type="button" aria-label="Bỏ" onclick="RBAdmin.delEx(' + i + ')"><i class="fa-solid fa-xmark"></i></button></span>'; }).join('') : '<span class="text-muted text-sm">Chưa loại trừ tài khoản nào.</span>';
            var sv = function (id, v) { var el = $(id); if (el && document.activeElement !== el) el.value = v; };
            sv('rb-from', F.from); sv('rb-to', F.to); sv('rb-grace', F.grace); sv('rb-botName', F.botName); sv('rb-maxNames', F.maxNames); sv('rb-title', F.title); sv('rb-footer', F.footer);
            ['tag', 'showTime', 'excludeStaff', 'skipEmpty'].forEach(function (k) { $('rb-' + k).checked = !!F[k]; });
            Object.keys(F.sec).forEach(function (k) { $('rb-sec-' + k).checked = !!F.sec[k]; });
        }
        function mark() {
            var d = dirty(); $('rb-savebar').style.display = d ? '' : 'none';
            if (d) {
                var sched = SCHED.some(function (k) { return JSON.stringify(F[k]) !== JSON.stringify(C[k]); });
                $('rb-sb-sub').textContent = sched ? 'Lịch mới chỉ áp dụng cho các mốc giờ từ lúc lưu.' : 'Nội dung mới dùng cho lần gửi kế tiếp.';
            }
        }
        function changed(refill) { if (refill) fill(); mark(); preview(); }
        function set(k, v) { if (F) { F[k] = v; changed(false); } }
        function setSec(k, v) { if (F) { F.sec[k] = v; changed(false); } }
        function addTime(t) {
            if (!F) return; t = t || $('rb-time-new').value; var m = /^(\d{1,2}):(\d{2})/.exec(t || ''); if (!m) return toast('Chọn giờ hợp lệ.', 'warning');
            t = R.pad(+m[1]) + ':' + m[2];
            if (F.times.indexOf(t) >= 0) return toast('Đã có mốc ' + t + '.', 'info');
            if (F.times.length >= 12) return toast('Tối đa 12 mốc giờ mỗi ngày.', 'warning');
            F.times = F.times.concat(t).sort(); changed(true);
        }
        function delTime(t) { F.times = F.times.filter(function (x) { return x !== t; }); changed(true); }
        function toggleDay(d) { var i = F.days.indexOf(d); if (i >= 0) F.days.splice(i, 1); else F.days.push(d); F.days.sort(); changed(true); }
        function setDays(a) { F.days = a.slice().sort(); changed(true); }
        function addEx() {
            var el = $('rb-ex-new'), u = el.value.replace(/^@/, '').trim(); if (!u || !F) return;
            if (F.exclude.some(function (x) { return x.toLowerCase() === u.toLowerCase(); })) return toast('Đã có trong danh sách.', 'info');
            F.exclude = F.exclude.concat(u); el.value = ''; changed(true);
        }
        function delEx(i) { F.exclude = F.exclude.filter(function (x, j) { return j !== i; }); changed(true); }
        function revert() { F = pick(C); fill(); mark(); preview(); }
        function valid(f) {
            if (!f.times.length) return 'Thêm ít nhất 1 giờ gửi.';
            if (!f.days.length) return 'Chọn ít nhất 1 ngày trong tuần.';
            if (f.from && f.to && f.from > f.to) return '"Từ ngày" đang sau "Đến ngày".';
            if (!Object.keys(f.sec).some(function (k) { return f.sec[k]; })) return 'Bật ít nhất 1 mục báo cáo.';
            return '';
        }
        async function save() {
            var err = valid(F); if (err) return toast(err, 'warning');
            var b = $('rb-save'); b.disabled = true;
            try { await R.save(pick(live()), me(), 'save'); toast('Đã lưu thiết lập Bot báo cáo.', 'success'); }
            catch (e) { toast('Lưu không được: ' + (e.message || e.code || e), 'error'); }
            finally { b.disabled = false; }
        }
        async function toggle(el) {
            var on = el.checked;
            if (on) { var err = valid(dirty() ? F : C); if (err) { el.checked = false; return toast(err, 'warning'); } }
            el.disabled = true;
            try {
                var patch = { isEnabled: on };
                if (on && dirty()) Object.assign(patch, pick(live()));   // bật kèm lưu luôn phần đang sửa
                await R.save(patch, me(), on ? 'enable' : 'disable');
                toast(on ? 'Đã BẬT Bot báo cáo.' : 'Đã TẮT Bot báo cáo.', on ? 'success' : 'info');
            } catch (e) { el.checked = !on; toast('Không đổi được: ' + (e.message || e.code || e), 'error'); }
            finally { el.disabled = false; }
        }

        /* ---------- Xem trước (đổi ngay theo biểu mẫu, chưa cần lưu) ---------- */
        async function refresh(manual) {
            var sp = $('rb-pv-spin'); if (sp) sp.classList.add('fa-spin');
            try {
                DATA = await R.collect(live(), Date.now()); LASTX = null;
                $('rb-dl-users').innerHTML = (DATA.allUsers || []).map(function (u) { return '<option value="' + esc(u) + '">'; }).join('');
                preview(true);
                if (manual) toast('Đã cập nhật số liệu lúc ' + R.hm(DATA.at) + '.', 'success');
            } catch (e) { $('rb-pv').innerHTML = '<div class="rb-pv-empty">⚠️ Không lấy được số liệu: ' + esc(e.message || e.code || e) + '</div>'; }
            finally { if (sp) sp.classList.remove('fa-spin'); }
        }
        function preview(now) {
            clearTimeout(pvT);
            pvT = setTimeout(function () {
                if (!C || !F) return;
                if (!DATA) { if (started) refresh(false); return; }
                var cfg = live(), d = DATA, ex = {}, x = JSON.stringify([cfg.exclude, cfg.excludeStaff]);
                // Bỏ bớt người khỏi danh sách -> lọc ngay trên số liệu có sẵn; thêm lại người đã bỏ -> đọc lại máy chủ
                if (LASTX && x !== LASTX) {
                    var prev = JSON.parse(LASTX), grew = prev[0].some(function (u) { return cfg.exclude.indexOf(u) < 0; }) || (prev[1] && !cfg.excludeStaff);
                    if (grew) { LASTX = x; return refresh(false); }
                }
                LASTX = x;
                cfg.exclude.forEach(function (u) { ex[u.toLowerCase()] = 1; });
                var keep = function (a) { return !ex[a.u.toLowerCase()] && !(cfg.excludeStaff && (a.role === 'admin' || a.role === 'manager')); };
                var dd = { at: d.at, p: d.p, att: d.att, online: d.online, attended: d.attended.filter(keep), loggedIn: d.loggedIn.filter(keep), loginNoAtt: d.loginNoAtt.filter(keep), noLogin: d.noLogin.filter(keep), locked: (d.locked || []).filter(keep),
                    idOk: d.idOk, idTs: d.idTs, idDone: (d.idDone || []).filter(keep), idNew: (d.idNew || []).filter(keep), idMissing: (d.idMissing || []).filter(keep),
                    bkOk: d.bkOk, bkTs: d.bkTs, bkDone: (d.bkDone || []).filter(keep), bkNew: (d.bkNew || []).filter(keep), bkMissing: (d.bkMissing || []).filter(keep) };
                dd.total = dd.loggedIn.length + dd.noLogin.length;
                var c = R.compose(cfg, dd), known = {};
                Object.keys(d.by).forEach(function (u) { known[u.toLowerCase()] = u; });
                var st = function (id, n, on) { var el = $(id); el.textContent = n; el.parentNode.classList.toggle('rb-pv-off', !on); };
                st('rb-s-att', c.counts.att, cfg.sec.att); st('rb-s-login', c.counts.login, cfg.sec.login); st('rb-s-lna', c.counts.loginNoAtt, cfg.sec.loginNoAtt); st('rb-s-no', c.counts.noLogin, cfg.sec.noLogin); st('rb-s-lock', c.counts.locked, cfg.sec.locked);
                $('rb-pv').innerHTML = '<div class="rb-bubble"><div class="snd">🤖 ' + esc(cfg.botName) + ' <span class="bdg">BOT</span></div>'
                    + R.renderText(c.text, { resolve: function (t) { return known[t.toLowerCase()] || null; } })
                    + '<div class="tm">' + R.hm(Date.now()) + ' · Kênh Chung</div></div>';
                $('rb-pv-sub').textContent = 'Số liệu thật hôm nay, tính tới ' + R.hm(d.at) + ' (tự cập nhật 5 phút / lần khi đang mở mục này).';
                $('rb-pv-note').innerHTML = cfg.tag ? '📣 Lần gửi này sẽ nhắc tên <b>' + c.mentions.length + '</b> tài khoản — mỗi người nhận 1 thông báo.' : 'Đang tắt gắn @ — tên chỉ hiện dạng chữ, không ai nhận thông báo riêng.';
            }, now === true ? 0 : 80);
        }
        function bindVars() {
            Array.prototype.forEach.call(document.querySelectorAll('#view-reportbot .rb-vars'), function (box) {
                var inputId = box.getAttribute('data-for'), key = box.getAttribute('data-key');
                box.innerHTML = VARS.map(function (v) { return '<button type="button" title="' + v[1] + '" data-v="' + v[0] + '">' + v[0] + '</button>'; }).join('');
                box.addEventListener('click', function (e) {
                    var b = e.target.closest('button'); if (!b) return;
                    var el = $(inputId), s = el.selectionStart == null ? el.value.length : el.selectionStart, en = el.selectionEnd == null ? s : el.selectionEnd, v = b.getAttribute('data-v');
                    el.value = el.value.slice(0, s) + v + el.value.slice(en); el.focus();
                    try { el.setSelectionRange(s + v.length, s + v.length); } catch (er) {}
                    set(key, el.value);
                });
            });
        }

        /* ---------- Gửi ngay (bấm 2 lần) — gửi đúng như khung Xem trước ---------- */
        async function sendNow(b) {
            var now = Date.now();
            if (!(armT && now - armT < 4000)) {
                armT = now; b.classList.add('arm'); b.innerHTML = '<i class="fa-solid fa-hand-pointer mr-2"></i> Bấm lần nữa để gửi';
                setTimeout(function () { if (armT === now) { armT = 0; b.classList.remove('arm'); b.innerHTML = '<i class="fa-solid fa-paper-plane mr-2"></i> Gửi báo cáo ngay'; } }, 4000);
                return;
            }
            var err = valid(live()); if (err) return toast(err, 'warning');
            armT = 0; b.classList.remove('arm'); b.disabled = true; b.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang gửi...';
            try {
                var r = await R.sendNow(me(), 'admin', live());
                if (r.ok) { toast('Đã gửi báo cáo vào Kênh Chung.', 'success'); firebase.firestore().collection('admin_logs').add({ type: 'report_bot', action: 'send_now', user: '(bot báo cáo)', by: me(), timestamp: Date.now() }).catch(function () {}); }
                else toast('Chưa gửi được, thử lại.', 'error');
            } catch (e) { toast('Gửi không được: ' + (e.message || e.code || e), 'error'); }
            finally { b.disabled = false; b.innerHTML = '<i class="fa-solid fa-paper-plane mr-2"></i> Gửi báo cáo ngay'; }
        }

        /* ---------- Máy chủ tự gửi (bot-server.gs): settings/report_bot_server = { lastRun, ok, err, note, noteAt, stopped } ---------- */
        var SRV = null, fixedMember = false;
        function server() {
            firebase.firestore().collection('settings').doc('report_bot_server').onSnapshot(function (s) { SRV = s.exists ? s.data() : null; srvShow(); }, function () {});
            setInterval(srvShow, 30000);
        }
        function srvShow() {
            var pill = $('rb-srv-pill'), sub = $('rb-srv-sub'); if (!pill) return;
            var t = SRV && +SRV.lastRun || 0, age = Date.now() - t, st, txt, info;
            if (SRV && SRV.by === 'vps') {   // máy chủ VPS tự gửi (không cần Apps Script)
                if (age > 3 * 60000) { st = 'error'; txt = 'Ngưng'; info = 'Máy chủ VPS không báo từ ' + when(t) + '. Vào Admin > Máy chủ VPS kiểm tra (hoặc gõ qd status trên VPS).'; }
                else if (SRV.ok === false) { st = 'error'; txt = 'Có lỗi'; info = 'Lần chạy lúc ' + R.hm(t) + ' bị lỗi: ' + (SRV.err || 'không rõ'); }
                else { st = 'sent'; txt = 'Đang chạy'; info = 'Máy chủ VPS tự gửi đúng giờ, không cần ai mở web · kiểm tra lần gần nhất ' + R.hm(t) + (SRV.nextAt ? ' · mốc tới: ' + when(SRV.nextAt) : '') + (SRV.note && SRV.noteAt ? ' · ' + SRV.note + ' (' + when(SRV.noteAt) + ')' : ''); }
            } else { st = 'error'; txt = 'Chưa chạy'; info = 'Chưa nhận được tín hiệu từ máy chủ VPS. Vào Admin > Máy chủ VPS kiểm tra (hoặc gõ qd status trên VPS).'; }
            pill.className = 'rb-pill ' + st; pill.textContent = txt; sub.textContent = info;
            // Tắt hẳn "máy thành viên gửi thay" trên dữ liệu (bản web cũ còn mở ở máy thành viên cũng thôi gửi)
            var raw = R.raw();
            if (!fixedMember && raw && raw.memberRun !== false) { fixedMember = true; firebase.firestore().collection('settings').doc('report_bot').set({ memberRun: false }, { merge: true }).catch(function () { fixedMember = false; }); }
        }

        /* ---------- Lịch sử ---------- */
        var ST = { sent: ['sent', '✅ Đã gửi'], sending: ['sending', '⏳ Đang gửi'], error: ['error', '⚠️ Lỗi'], skipped: ['skipped', '⏭ Bỏ qua'] };
        var WHO = { server: '🖥️ Máy chủ', bot: '🤖 Trạm Bot', admin: '🛡️ Trang Admin', member: '📱 Thành viên' };
        var openRow = {};
        function history() {
            firebase.firestore().collection('bot_reports').orderBy('at', 'desc').limit(20).onSnapshot(function (snap) {
                var rows = snap.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }), last = rows.filter(function (x) { return x.status === 'sent'; })[0];
                $('rb-last').textContent = last ? when(last.sentAt || last.at) : 'Chưa có';
                $('rb-last-sub').textContent = last ? (last.manual ? 'Gửi tay' : 'Theo lịch') + ' · ' + (last.by || '?') : '';
                $('rb-hist').innerHTML = rows.length ? rows.map(function (x) {
                    var st = ST[x.status] || ['sending', esc(x.status || '?')], c = x.counts || {}, ok = x.status === 'sent' || x.status === 'skipped';
                    var body = x.text ? esc(x.text) : esc(x.err || x.note || 'Không có nội dung.');
                    return '<tr class="rb-row" data-id="' + esc(x.id) + '" title="Bấm để xem nội dung đã gửi"><td>' + esc(when(x.sentAt || x.at || x.due || 0)) + '</td><td>' + (x.manual ? '✋ Gửi tay' : '⏰ ' + esc(x.slot || '')) + '</td>'
                        + '<td><span class="rb-pill ' + st[0] + '" title="' + esc(x.err || x.note || '') + '">' + st[1] + '</span></td>'
                        + '<td>' + (ok ? (c.att || 0) + '/' + (c.total || 0) : '—') + '</td><td>' + (ok ? (c.login || 0) : '—') + '</td><td>' + (ok ? (c.loginNoAtt || 0) : '—') + '</td>'
                        + '<td>' + (WHO[x.byRole] || '') + (x.by ? ' · ' + esc(x.by) : '') + '</td></tr>'
                        + '<tr data-for="' + esc(x.id) + '"' + (openRow[x.id] ? '' : ' style="display:none"') + '><td colspan="7" class="rb-text">' + body + '</td></tr>';
                }).join('') : '<tr><td colspan="7" class="text-center text-muted py-8">Chưa gửi báo cáo nào.</td></tr>';
            }, function (e) { $('rb-hist').innerHTML = '<tr><td colspan="7" class="text-center text-muted py-8">Không đọc được lịch sử: ' + esc(e.message || e.code) + '</td></tr>'; });
            $('rb-hist').addEventListener('click', function (e) {
                var tr = e.target.closest('tr.rb-row'); if (!tr) return;
                var id = tr.getAttribute('data-id'), row = tr.nextElementSibling; if (!row) return;
                openRow[id] = row.style.display === 'none'; row.style.display = openRow[id] ? '' : 'none';
            });
        }

        function start() {
            if (started || !me()) return; started = true;
            bindVars();
            R.start({ role: 'admin', me: me });   // trang Admin đang mở gửi dự phòng (máy chủ là nơi gửi chính)
            R.on(onCfg); history(); server();
            setInterval(function () { if (viewOn()) clock(); }, 1000);
            setInterval(function () { if (viewOn() && DATA && Date.now() - DATA.at > 5 * 60000) refresh(false); }, 30000);
            if (typeof UI !== 'undefined' && UI.navigate) {   // mở mục Bot -> lấy số liệu mới cho khung Xem trước
                var nav = UI.navigate;
                UI.navigate = function (v) { var r = nav.apply(this, arguments); if (v === 'reportbot' && (!DATA || Date.now() - DATA.at > 60000)) refresh(false); return r; };
            }
            window.addEventListener('beforeunload', function (e) { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
        }
        // Chờ đăng nhập Admin xong rồi mới bắt đầu
        var w = setInterval(function () { var sh = $('app-shell'); if (me() && sh && sh.style.display === 'flex') { start(); if (started) clearInterval(w); } }, 1000);

        function jump() { var c = $('rb-pv-card'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

        return { jump: jump, start: start, toggle: toggle, save: save, revert: revert, set: set, setSec: setSec, addTime: addTime, delTime: delTime, toggleDay: toggleDay, setDays: setDays,
            addEx: addEx, delEx: delEx, refresh: refresh, sendNow: sendNow };
    })();
    
