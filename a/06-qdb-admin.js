    /* Thiết lập sơ đồ giải đấu (admin): thể thức Đơn/Đôi, quy mô 4-64, cách xếp cặp, tranh hạng 3, hiện nút cho thành viên
       - Nguồn tuyển thủ: danh sách giải đấu (collection "tournament"); Giải Đôi lấy các đội đã "Gộp Đội", người lẻ tự ghép đôi
       - 2 sơ đồ độc lập: Giải Đơn = settings/tournament_bracket, Giải Đôi = settings/tournament_bracket_double
         (sơ đồ đôi cũ nằm ở tournament_bracket tự chuyển sang tournament_bracket_double). Trang user tự cập nhật theo thời gian thực */
    (function () {
        'use strict';
        var root = document.getElementById('qdb-admin');
        if (!root || !window.QDB || typeof db === 'undefined') return;
        var REFS = { single: db.collection('settings').doc('tournament_bracket'), double: db.collection('settings').doc('tournament_bracket_double') };
        var FN = { single: 'Giải Đơn', double: 'Giải Đôi' };
        var $ = function (id) { return document.getElementById(id); };
        var esc = QDB.esc, toast = function (m, t) { if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast(m, t || 'success'); };
        var A = window.QDBAdmin = { cfg: null, cfgs: { single: null, double: null }, got: {}, loaded: {}, parts: [], fmt: 'single', dirty: false, draft: null };
        function ref() { return REFS[A.fmt]; }
        var SIZES = [4, 8, 16, 32, 64];
        var NO_TEAM = /^\s*(chưa phân đội|---|)\s*$/i;

        function ask(html, fn) {
            $('qdb-cf-msg').innerHTML = html;
            $('qdb-cf-ok').onclick = function () { UI.closeModal('modal-qdb-confirm'); fn(); };
            UI.openModal('modal-qdb-confirm');
        }
        function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
        function member(p) { return { u: p.username || '', ign: p.ingame || p.username || '', gid: p.gameId || '' }; }

        // Danh sách ứng viên (chưa xếp vị trí), sắp theo cách xếp cặp
        function buildPool(fmt, mode) {
            var ps = A.parts.slice(), warn = [];
            var byTime = function (a, b) { return (a.timestamp || 0) - (b.timestamp || 0); };
            var order = function (list, pts, time) {
                if (mode === 'random') return shuffle(list);
                if (mode === 'points') return list.sort(function (a, b) { return pts(b) - pts(a) || time(a) - time(b); });
                return list.sort(function (a, b) { return time(a) - time(b); });
            };
            if (fmt !== 'double') {
                ps = order(ps, function (p) { return +p.points || 0; }, function (p) { return p.timestamp || 0; });
                return { pool: ps.map(function (p) { return { id: 's_' + p.username, name: p.ingame || p.username, sub: '@' + p.username, members: [member(p)] }; }), warn: warn, players: ps.length };
            }
            var teams = {}, solo = [];
            ps.forEach(function (p) { var t = String(p.team || ''); if (NO_TEAM.test(t)) solo.push(p); else (teams[t] = teams[t] || []).push(p); });
            var list = Object.keys(teams).map(function (t) {
                var ms = teams[t].sort(byTime);
                if (ms.length !== 2) warn.push('Đội <b>' + esc(t) + '</b> có ' + ms.length + ' người (giải đôi cần 2).');
                return { id: 'd_' + t, name: t, sub: ms.map(function (m) { return m.ingame || m.username; }).join(' · '), members: ms.map(member),
                    _p: ms.reduce(function (s, m) { return s + (+m.points || 0); }, 0), _t: ms[0].timestamp || 0 };
            });
            solo = order(solo, function (p) { return +p.points || 0; }, function (p) { return p.timestamp || 0; });
            for (var i = 0; i < solo.length; i += 2) {
                var a = solo[i], b = solo[i + 1];
                if (!b) { warn.push('<b>' + esc(a.username) + '</b> chưa có đồng đội (người lẻ) — sẽ thi đấu 1 mình.'); }
                var ms = b ? [a, b] : [a];
                list.push({ id: 'd_' + ms.map(function (m) { return m.username; }).join('+'), name: ms.map(function (m) { return m.ingame || m.username; }).join(' & '),
                    sub: ms.map(function (m) { return '@' + m.username; }).join(' · '), members: ms.map(member), _p: ms.reduce(function (s, m) { return s + (+m.points || 0); }, 0), _t: a.timestamp || 0 });
            }
            list = order(list, function (e) { return e._p; }, function (e) { return e._t; });
            list.forEach(function (e) { delete e._p; delete e._t; });
            return { pool: list, warn: warn, players: ps.length, paired: solo.length };
        }
        function seedEntries(pool, size) {
            return QDB.seedOrder(size).map(function (s) { return s <= pool.length ? Object.assign({}, pool[s - 1], { seed: s }) : null; });
        }

        /* ---------- Biểu mẫu ---------- */
        function fillSizes() {
            var dbl = A.fmt === 'double', sel = $('qdb-a-size'), cur = +sel.value || (A.cfg && A.cfg.size) || 8;
            $('qdb-a-size-lbl').textContent = dbl ? 'Quy mô giải (số đội, mỗi đội 2 người)' : 'Quy mô giải (số người)';
            sel.innerHTML = SIZES.map(function (n) { return '<option value="' + n + '">' + (dbl ? n + ' đội (' + n * 2 + ' người)' : n + ' người') + '</option>'; }).join('');
            sel.value = String(SIZES.indexOf(cur) >= 0 ? cur : 8);
        }
        // Chuyển giữa 2 sơ đồ độc lập (Đơn / Đôi)
        function tabUI() {
            root.querySelectorAll('#qdb-a-tabs button').forEach(function (b) { var on = b.getAttribute('data-f') === A.fmt; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
            $('qdb-a-fmt-lbl').textContent = FN[A.fmt] + (A.fmt === 'double' ? ' · 2 vs 2' : ' · 1 vs 1');
            $('qdb-a-en-lbl').textContent = '"Sơ Đồ ' + FN[A.fmt] + '"';
            $('qdb-a-title').placeholder = A.fmt === 'double' ? 'VD: Giải Đôi Xuân Đinh Mùi 2027' : 'VD: Giải Đơn Xuân Đinh Mùi 2027';
        }
        function tabBadges() {
            ['single', 'double'].forEach(function (f) {
                var el = $('qdb-a-tab-' + f), c = A.cfgs[f]; if (!el) return;
                el.className = '';
                if (!A.got[f]) { el.textContent = 'Đang tải...'; return; }
                if (!c) { el.textContent = 'Chưa tạo'; return; }
                if (!(c.entries || []).some(Boolean)) { el.textContent = 'Chưa xếp cặp'; return; }
                var C = QDB.compute(c), st = QDB.status(C);
                el.textContent = C.N + ' suất · ' + QDB.STATUS_TXT[st] + (c.enabled === false ? ' · đang ẩn' : '');
                if (st === 'live' || st === 'done') el.className = st;
            });
        }
        function setFmt(f, force) {
            f = f === 'double' ? 'double' : 'single';
            if (f === A.fmt && !force) return;
            var go = function () {
                A.fmt = f; A.cfg = A.cfgs[f]; A.dirty = false; A.picked = true;
                try { localStorage.setItem('qdb_admin_tab', f); } catch (e) {}
                $('qdb-a-slotbox').hidden = true;
                tabUI(); fillForm(); paint(); info(); advPanel();
            };
            if (A.dirty && !force) ask('Cài đặt sơ đồ <b>' + FN[A.fmt] + '</b> chưa lưu. Chuyển sang <b>' + FN[f] + '</b> và bỏ các thay đổi này?', go);
            else go();
        }
        function fillForm() {
            var c = A.cfg || {};
            $('qdb-a-title').value = c.title || '';
            $('qdb-a-seed').value = c.seedMode || 'random';
            $('qdb-a-third').checked = c.third !== false;
            $('qdb-a-enabled').checked = c.enabled !== false;
            fillSizes();
            $('qdb-a-size').value = String(SIZES.indexOf(+c.size) >= 0 ? c.size : 8);
            A.dirty = false;
        }
        function form() {
            return { title: $('qdb-a-title').value.trim() || (A.fmt === 'double' ? 'Giải Đôi Xuân' : 'Giải Đơn Xuân'), format: A.fmt, size: +$('qdb-a-size').value || 8, seedMode: $('qdb-a-seed').value,
                third: $('qdb-a-third').checked, enabled: $('qdb-a-enabled').checked };
        }
        function info() {
            var f = form(), bp = buildPool(f.format, 'order'), n = bp.pool.length, unit = f.format === 'double' ? 'đội' : 'người';
            var fit = SIZES.filter(function (s) { return s >= n; })[0] || 64;
            var h = 'Danh sách giải đấu hiện có <b>' + bp.players + ' người</b>';
            if (f.format === 'double') h += ' → <b>' + n + ' đội đôi</b>' + (bp.paired ? ' (trong đó ' + Math.ceil(bp.paired / 2) + ' đội tự ghép từ người chưa phân đội)' : '');
            h += '. Quy mô <b>' + f.size + ' ' + unit + '</b>: ';
            if (n > f.size) h += '<span class="warn">chỉ ' + f.size + ' ' + unit + ' đầu tiên được xếp vào sơ đồ, ' + (n - f.size) + ' ' + unit + ' còn lại không có suất.</span>';
            else if (n < 2) h += '<span class="warn">cần ít nhất 2 ' + unit + ' để tạo sơ đồ.</span>';
            else h += (f.size - n) + ' suất <b>miễn đấu</b> (tự đi tiếp vòng sau).' + (fit < f.size ? ' <span class="warn">Gợi ý: chọn quy mô ' + fit + ' ' + unit + ' cho gọn.</span>' : '');
            if (bp.warn.length) h += '<br><span class="warn">⚠ ' + bp.warn.join('<br>⚠ ') + '</span>';
            $('qdb-a-info').innerHTML = h;
        }

        /* ---------- Sơ đồ xem trước ---------- */
        function paint() {
            var c = A.cfg, st = $('qdb-a-status'), tree = $('qdb-a-tree');
            tabBadges();
            if (!c || !(c.entries || []).some(Boolean)) {
                st.textContent = FN[A.fmt] + ' · ' + (!A.got[A.fmt] ? 'đang tải...' : c ? 'đã lưu cài đặt · chưa xếp cặp' : 'chưa tạo');
                st.style.color = 'var(--text-muted)';
                tree.innerHTML = '<div class="qdb-empty">' + (!A.got[A.fmt] ? 'Đang tải sơ đồ...' : 'Chưa có sơ đồ ' + FN[A.fmt] + '. Chọn quy mô, cách xếp cặp rồi bấm "Tạo / Xếp Lại Sơ Đồ".') + '</div>';
                return;
            }
            var C = QDB.compute(c), s = QDB.status(C);
            st.textContent = FN[A.fmt] + ' · ' + C.N + ' suất · ' + QDB.STATUS_TXT[s] + (c.enabled === false ? ' · đang ẩn với thành viên' : '');
            st.style.color = s === 'done' ? '#eab308' : s === 'live' ? 'var(--color-success)' : 'var(--text-muted)';
            var sl = tree.scrollLeft, stp = tree.scrollTop, first = !tree.querySelector('.qdb-tree');
            tree.innerHTML = QDB.treeHTML(c, { admin: true });
            if (first) { tree.scrollLeft = Math.max(0, (tree.scrollWidth - tree.clientWidth) / 2); tree.scrollTop = 0; }   // mở giữa sơ đồ (chung kết)
            else { tree.scrollLeft = sl; tree.scrollTop = stp; }
            if (QDB.isOpen() && A.full === A.fmt) QDB.update(c);
        }
        var ctx = {
            getAccount: function (u) {
                return db.collection('accounts').where('user', '==', u).limit(1).get().then(function (s) {
                    if (s.empty) return null; var x = s.docs[0].data();
                    return { fullName: x.fullName, role: x.role, created_at: x.created_at || x.createdAt, lastActive: x.lastActive, online: x.online, isBlocked: x.isBlocked };
                });
            },
            getExtra: function (u) { var p = A.parts.filter(function (x) { return x.username === u; })[0]; return p ? { points: p.points, team: p.team } : {}; }
        };
        function detail(e) { QDB.openDetail(e, A.cfg, ctx); }

        /* ---------- Nhập kết quả ---------- */
        function clearDown(res, r, m, R) {
            if (r === 't') return;
            for (var rr = r + 1, mm = m >> 1; rr < R; rr++, mm >>= 1) delete res[rr + '-' + mm];
            if (r <= R - 2) delete res.third;
        }
        function openMatch(key) {
            var c = A.cfg; if (!c) return;
            var C = QDB.compute(c), mt = QDB.findMatch(C, key);
            if (!mt || mt.sides[0].t !== 'e' || mt.sides[1].t !== 'e') return toast('Trận này chưa đủ 2 bên để nhập kết quả.', 'warning');
            $('qdb-mm-title').textContent = (mt.no ? 'Trận ' + mt.no + ' · ' : '') + mt.label;
            $('qdb-mm-sub').textContent = c.title || '';
            var r = mt.res || {}, h = '';
            [0, 1].forEach(function (i) {
                var e = mt.sides[i].e;
                h += '<label class="qdb-mm-row' + (mt.w === i ? ' on' : '') + '"><input type="radio" name="qdb-mm-w" value="' + i + '"' + (mt.w === i ? ' checked' : '') + '>'
                    + '<span class="qdb-mm-nm"><b>' + esc(e.name) + '</b><small>' + esc(e.sub || '') + '</small><span class="qdb-mm-win"' + (mt.w === i ? '' : ' hidden') + '>✅ ĐI TIẾP</span></span>'
                    + '<input type="number" min="0" max="999" inputmode="numeric" placeholder="-" data-s="' + i + '" value="' + esc(r['s' + i] != null ? r['s' + i] : '') + '">'
                    + '<button type="button" class="qdb-mm-info" data-i="' + i + '" title="Xem chi tiết"><i class="fa-solid fa-id-card"></i></button></label>';
            });
            var body = $('qdb-mm-body'); body.innerHTML = h;
            var wy = QDB.whyOf(mt); document.querySelectorAll('#qdb-mm-why input').forEach(function (x) { x.checked = x.value === wy; });
            var sync = function () { body.querySelectorAll('.qdb-mm-row').forEach(function (row) { var on = row.querySelector('input[type=radio]').checked; row.classList.toggle('on', on); row.querySelector('.qdb-mm-win').hidden = !on; }); };
            body.onchange = sync;
            body.oninput = function (ev) {
                if (!ev.target.getAttribute('data-s')) return;
                var a = body.querySelector('[data-s="0"]').value, b = body.querySelector('[data-s="1"]').value;
                if (a !== '' && b !== '' && +a !== +b) { body.querySelectorAll('input[type=radio]')[+a > +b ? 0 : 1].checked = true; sync(); }
            };
            body.onclick = function (ev) {
                var b = ev.target.closest && ev.target.closest('.qdb-mm-info');
                if (b) { ev.preventDefault(); detail(mt.sides[+b.getAttribute('data-i')].e); }
            };
            $('qdb-mm-save').onclick = function () {
                var w = body.querySelector('input[type=radio]:checked');
                if (!w) return toast('Vui lòng chọn người/đội đi tiếp.', 'warning');
                var why = (document.querySelector('#qdb-mm-why input:checked') || {}).value || 'win';
                var wi = +w.value;
                UI.closeModal('modal-qdb-match');
                setAdvance(key, wi, { s0: body.querySelector('[data-s="0"]').value.trim(), s1: body.querySelector('[data-s="1"]').value.trim(), why: why });
            };
            $('qdb-mm-clear').onclick = function () { UI.closeModal('modal-qdb-match'); setAdvance(key, null); };
            UI.openModal('modal-qdb-match');
        }
        // Đặt người đi tiếp (w = 0/1) hoặc hủy (w = null). Trận sau đã có kết quả bị ảnh hưởng -> hỏi trước khi xóa.
        function setAdvance(key, w, extra) {
            var c = A.cfg; if (!c) return;
            var C = QDB.compute(c), mt = QDB.findMatch(C, key); if (!mt) return;
            var res = JSON.parse(JSON.stringify(c.results || {})), old = res[key];
            var changed = w === null ? !!old : (!old || old.w !== w);
            var before = Object.keys(res).filter(function (k) { return k !== key; });
            if (w === null) delete res[key];
            else res[key] = Object.assign({ w: w, s0: '', s1: '', why: 'win' }, (old && old.w === w) ? { s0: old.s0, s1: old.s1, why: old.why || 'win' } : {}, extra || {});
            if (changed) clearDown(res, mt.r, mt.m, C.R);
            var lost = before.filter(function (k) { return !(k in res); }).length;   // số trận sau bị xóa kết quả
            var label = mt.no ? 'trận ' + mt.no : mt.label;
            var msg = w === null ? 'Đã hủy kết quả ' + label + '.' : '✅ ' + mt.sides[w].e.name + ' đi tiếp (' + label + (res[key].why !== 'win' ? ' · ' + QDB.WHY[res[key].why] : '') + ').';
            var go = function () { save({ results: res }, msg); };
            if (lost > 0) ask((w === null ? 'Hủy kết quả' : 'Đổi người đi tiếp ở') + ' <b>' + esc(label) + '</b> sẽ xóa kết quả của <b>' + lost + ' trận sau</b> có liên quan. Tiếp tục?', go);
            else go();
        }
        function advPanel() {
            var box = $('qdb-a-adv'); if (!box || box.hidden) return;
            var c = A.cfg;
            if (!c || !(c.entries || []).some(Boolean)) { box.innerHTML = '<div class="text-muted text-sm">Hãy tạo sơ đồ trước.</div>'; return; }
            var C = QDB.compute(c), all = [];
            C.rounds.forEach(function (row) { row.forEach(function (mt) { all.push(mt); }); });
            if (C.third) all.push(C.third);
            var ready = all.filter(function (mt) { return mt.sides[0].t === 'e' && mt.sides[1].t === 'e'; });
            var todo = ready.filter(function (mt) { return mt.decided !== 'play'; });
            var f = A.advFilter || 'todo', list = f === 'todo' ? todo : ready;
            var h = '<div class="qdb-adv-head"><h4><i class="fa-solid fa-forward-step mr-2" style="color: #eab308;"></i>Thiết Lập Đi Tiếp</h4>'
                + '<div class="qdb-adv-f"><button type="button" data-f="todo" class="' + (f === 'todo' ? 'on' : '') + '">Cần quyết định <b>' + todo.length + '</b></button><button type="button" data-f="all" class="' + (f === 'all' ? 'on' : '') + '">Tất cả trận <b>' + ready.length + '</b></button></div></div>'
                + '<div class="text-xs text-muted" style="margin-bottom: 10px;">Bấm <b>"Cho đi tiếp"</b> ở người/đội bạn chọn — lưu ngay. Bấm ✎ để thêm tỉ số hoặc lý do (bỏ cuộc, bị loại, đặc cách). Trận vòng sau sẽ hiện khi đủ 2 bên.</div>';
            if (!list.length) h += '<div class="qdb-adv-empty">' + (C.champion ? '🏆 Giải đã có Nhà Vô Địch: <b>' + esc(C.champion.e.name) + '</b>' : f === 'todo' ? 'Không có trận nào đang chờ quyết định. Các trận vòng sau sẽ hiện khi vòng trước có kết quả.' : 'Chưa có trận nào đủ 2 bên.') + '</div>';
            var lastLabel = '';
            list.forEach(function (mt) {
                if (mt.label !== lastLabel) { lastLabel = mt.label; h += '<div class="qdb-adv-r">' + esc(mt.label) + '</div>'; }
                var done = mt.decided === 'play', wy = QDB.whyOf(mt);
                h += '<div class="qdb-adv-row' + (done ? ' done' : '') + '" data-key="' + mt.key + '"><span class="qdb-adv-no">' + (mt.no ? 'Trận ' + mt.no : '') + '</span>';
                [0, 1].forEach(function (i) {
                    var e = mt.sides[i].e, win = mt.w === i, sc = done && mt.res && mt.res['s' + i] !== '' && mt.res['s' + i] != null ? mt.res['s' + i] : '';
                    h += (i === 1 ? '<span class="qdb-adv-vs">VS</span>' : '') + '<button type="button" class="qdb-adv-s' + (win ? ' win' : done ? ' lose' : '') + '" data-w="' + i + '">'
                        + '<span class="qdb-adv-nm"><b>' + esc(e.name) + '</b><small>' + esc(e.sub || '') + '</small></span>' + (sc !== '' ? '<span class="qdb-adv-sc">' + esc(sc) + '</span>' : '')
                        + '<em>' + (win ? '✅ Đi tiếp' : 'Cho đi tiếp') + '</em></button>';
                });
                h += '<div class="qdb-adv-act">' + (done && wy !== 'win' ? '<span class="qdb-adv-why">' + esc(QDB.WHY[wy]) + '</span>' : '')
                    + '<button type="button" data-act="edit" title="Tỉ số / lý do"><i class="fa-solid fa-pen"></i> Tỉ số / lý do</button>'
                    + (done ? '<button type="button" data-act="undo" class="undo"><i class="fa-solid fa-rotate-left"></i> Hủy</button>' : '') + '</div></div>';
            });
            box.innerHTML = h;
        }
        function save(patch, msg) {
            patch.updatedAt = Date.now();
            return ref().update(patch).then(function () { if (msg) toast(msg, 'success'); }).catch(function (e) { console.error(e); toast('Lỗi lưu sơ đồ giải đấu.', 'error'); });
        }

        /* ---------- Chỉnh tay vị trí ---------- */
        function slotEditor() {
            var box = $('qdb-a-slotbox'), c = A.cfg;
            if (!c || !(c.entries || []).length) { box.hidden = true; return toast('Hãy tạo sơ đồ trước.', 'warning'); }
            A.draft = (c.entries || []).map(function (e) { return e ? JSON.parse(JSON.stringify(e)) : null; });
            var pool = buildPool(c.format, 'order').pool, map = {};
            pool.concat(A.draft.filter(Boolean)).forEach(function (e) { if (!map[e.id]) map[e.id] = e; });
            A.slotMap = map;
            var opts = '<option value="">— Miễn đấu (BYE) —</option>' + Object.keys(map).map(function (id) { return '<option value="' + esc(id) + '">' + esc(map[id].name) + (map[id].sub ? ' (' + esc(map[id].sub) + ')' : '') + '</option>'; }).join('');
            var h = '<h4><i class="fa-solid fa-pen-to-square mr-2 text-primary"></i>Chỉnh Vị Trí Vòng Đầu</h4><div class="text-xs text-muted">Đổi người/đội ở từng vị trí. Lưu vị trí sẽ <b>xóa toàn bộ kết quả</b> đã nhập.</div><div class="qdb-a-sl">';
            var C = QDB.compute({ size: c.size, entries: A.draft });
            for (var i = 0; i < A.draft.length; i += 2) {
                h += '<div class="qdb-a-pair"><div>' + esc(C.rounds[0][i / 2].label) + ' · cặp ' + (i / 2 + 1) + '</div>';
                [i, i + 1].forEach(function (k) { h += '<select data-k="' + k + '" aria-label="Vị trí ' + (k + 1) + '">' + opts + '</select>'; });
                h += '</div>';
            }
            h += '</div><div class="flex gap-3"><button type="button" class="btn btn-outline" id="qdb-a-sl-cancel">Đóng</button><button type="button" class="btn btn-primary" id="qdb-a-sl-save"><i class="fa-solid fa-floppy-disk mr-2"></i>Lưu Vị Trí</button></div>';
            box.innerHTML = h; box.hidden = false;
            box.querySelectorAll('select').forEach(function (s) { var e = A.draft[+s.getAttribute('data-k')]; s.value = e ? e.id : ''; });
            var dupCheck = function () {
                var cnt = {}; box.querySelectorAll('select').forEach(function (s) { if (s.value) cnt[s.value] = (cnt[s.value] || 0) + 1; });
                var bad = false; box.querySelectorAll('select').forEach(function (s) { var d = s.value && cnt[s.value] > 1; s.classList.toggle('dup', !!d); if (d) bad = true; });
                return bad;
            };
            dupCheck();
            box.onchange = function (ev) {
                var s = ev.target; if (!s.getAttribute('data-k')) return;
                var k = +s.getAttribute('data-k'), e = s.value ? map[s.value] : null;
                A.draft[k] = e ? Object.assign({}, e, { seed: e.seed || '' }) : null;
                dupCheck();
            };
            $('qdb-a-sl-cancel').onclick = function () { box.hidden = true; };
            $('qdb-a-sl-save').onclick = function () {
                if (dupCheck()) return toast('Có người/đội bị xếp trùng 2 vị trí (ô viền đỏ).', 'error');
                if (A.draft.filter(Boolean).length < 2) return toast('Cần ít nhất 2 người/đội trên sơ đồ.', 'warning');
                ask('Lưu vị trí mới và <b>xóa toàn bộ kết quả</b> đã nhập?', function () {
                    save({ entries: A.draft, results: {} }, 'Đã lưu vị trí sơ đồ.').then(function () { box.hidden = true; });
                });
            };
            box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        /* ---------- Nút chức năng ---------- */
        function build() {
            var f = form(), bp = buildPool(f.format, f.seedMode), unit = f.format === 'double' ? 'đội' : 'người';
            if (bp.pool.length < 2) return toast('Cần ít nhất 2 ' + unit + ' trong danh sách giải đấu (bấm "Thêm Người Chơi").', 'warning');
            var go = function () {
                var doc = Object.assign(f, { entries: seedEntries(bp.pool.slice(0, f.size), f.size), results: {}, updatedAt: Date.now(), createdAt: (A.cfg && A.cfg.createdAt) || Date.now() });
                ref().set(doc).then(function () {
                    A.dirty = false; $('qdb-a-slotbox').hidden = true;
                    toast('Đã tạo sơ đồ ' + (f.format === 'double' ? 'Giải Đôi' : 'Giải Đơn') + ' ' + f.size + ' ' + unit + (bp.pool.length > f.size ? ' (' + (bp.pool.length - f.size) + ' ' + unit + ' không có suất)' : '') + '.', 'success');
                }).catch(function (e) { console.error(e); toast('Lỗi tạo sơ đồ giải đấu.', 'error'); });
            };
            var hasRes = A.cfg && A.cfg.results && Object.keys(A.cfg.results).length;
            if (A.cfg && (A.cfg.entries || []).some(Boolean)) ask('Xếp lại sơ đồ' + (f.seedMode === 'random' ? ' (bốc thăm lại)' : '') + '?' + (hasRes ? '<br><b>Toàn bộ kết quả đã nhập sẽ bị xóa.</b>' : ''), go);
            else go();
        }
        function saveSettings() {
            var f = form();
            if (!A.cfg) {
                return ref().set(Object.assign(f, { entries: [], results: {}, updatedAt: Date.now() })).then(function () { A.dirty = false; toast('Đã lưu cài đặt. Bấm "Tạo / Xếp Lại Sơ Đồ" để xếp cặp.', 'success'); });
            }
            var changed = (A.cfg.format || 'single') !== f.format || +A.cfg.size !== f.size;
            save({ title: f.title, seedMode: f.seedMode, third: f.third, enabled: f.enabled }, changed ? null : 'Đã lưu cài đặt sơ đồ ' + FN[A.fmt] + '.').then(function () {
                A.dirty = false;
                if (changed) toast('Đã lưu tên/tùy chọn. Đổi thể thức hoặc quy mô cần bấm "Tạo / Xếp Lại Sơ Đồ".', 'warning');
            });
        }

        root.querySelector('#qdb-a-tabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-f]'); if (b) setFmt(b.getAttribute('data-f')); });
        ['qdb-a-title', 'qdb-a-size', 'qdb-a-seed', 'qdb-a-third', 'qdb-a-enabled'].forEach(function (id) {
            $(id).addEventListener('input', function () { A.dirty = true; if (id === 'qdb-a-size') info(); });
            $(id).addEventListener('change', function () { A.dirty = true; info(); });
        });
        $('qdb-a-build').onclick = build;
        $('qdb-a-save').onclick = saveSettings;
        $('qdb-a-advbtn').onclick = function () {
            var b = $('qdb-a-adv'); b.hidden = !b.hidden;
            if (!b.hidden) { if (!A.cfg || !(A.cfg.entries || []).some(Boolean)) { b.hidden = true; return toast('Hãy tạo sơ đồ trước.', 'warning'); } $('qdb-a-slotbox').hidden = true; advPanel(); b.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        };
        $('qdb-a-adv').addEventListener('click', function (e) {
            var t = e.target.closest ? e.target : null; if (!t) return;
            var fb = t.closest('[data-f]'); if (fb) { A.advFilter = fb.getAttribute('data-f'); return advPanel(); }
            var row = t.closest('.qdb-adv-row'); if (!row) return;
            var key = row.getAttribute('data-key'), sb = t.closest('.qdb-adv-s'), act = t.closest('[data-act]');
            if (sb) { var w = +sb.getAttribute('data-w'), cur = QDB.findMatch(QDB.compute(A.cfg), key); if (cur && cur.w === w && cur.decided === 'play') return toast('Người này đã được cho đi tiếp.', 'info'); return setAdvance(key, w); }
            if (act && act.getAttribute('data-act') === 'edit') return openMatch(key);
            if (act && act.getAttribute('data-act') === 'undo') return setAdvance(key, null);
        });
        $('qdb-a-slots').onclick = function () { var b = $('qdb-a-slotbox'); if (!b.hidden) { b.hidden = true; return; } slotEditor(); };
        $('qdb-a-full').onclick = function () {
            if (!A.cfg || !(A.cfg.entries || []).some(Boolean)) return toast('Chưa có sơ đồ để xem.', 'warning');
            A.full = A.fmt; QDB.open(A.cfg, { admin: true, onEntry: detail, onMatch: openMatch });
        };
        $('qdb-a-reset').onclick = function () {
            if (!A.cfg || !Object.keys(A.cfg.results || {}).length) return toast('Chưa có kết quả nào để xóa.', 'info');
            ask('Xóa <b>toàn bộ kết quả</b> của sơ đồ <b>' + FN[A.fmt] + '</b>? Các cặp đấu vòng đầu được giữ nguyên. Sơ đồ ' + FN[A.fmt === 'double' ? 'single' : 'double'] + ' không bị ảnh hưởng.', function () { save({ results: {} }, 'Đã xóa toàn bộ kết quả ' + FN[A.fmt] + '.'); });
        };
        $('qdb-a-del').onclick = function () {
            if (!A.cfg) return toast('Chưa có sơ đồ.', 'info');
            var f = A.fmt;
            ask('Xóa hẳn <b>sơ đồ ' + FN[f] + '</b>? Thành viên sẽ không còn thấy nút "Sơ Đồ ' + FN[f] + '". Sơ đồ ' + FN[f === 'double' ? 'single' : 'double'] + ' giữ nguyên.', function () {
                REFS[f].delete().then(function () { toast('Đã xóa sơ đồ ' + FN[f] + '.', 'success'); }).catch(function () { toast('Không thể xóa sơ đồ.', 'error'); });
            });
        };
        QDB.bind($('qdb-a-tree'), function () { return A.cfg; }, { admin: true, onEntry: detail, onMatch: openMatch });

        // Mở lại đúng tab lần trước; lần đầu: tab nào đã có sơ đồ thì mở tab đó
        try { var lt = localStorage.getItem('qdb_admin_tab'); if (lt === 'double' || lt === 'single') { A.fmt = lt; A.picked = true; } } catch (e) {}
        tabUI(); fillSizes();
        // Sơ đồ Giải Đôi tạo từ bản cũ (chung 1 chỗ) -> chuyển sang chỗ riêng của Giải Đôi
        function migrate() {
            if (A.migrated || !A.got.single || !A.got.double) return;
            A.migrated = true;
            var old = A.cfgs.single;
            if (old && old.format === 'double' && !A.cfgs.double) {
                REFS.double.set(old).then(function () { return REFS.single.delete(); })
                    .then(function () { toast('Đã chuyển sơ đồ Giải Đôi cũ sang mục "Sơ Đồ Giải Đôi" riêng.', 'info'); })
                    .catch(function (e) { console.error(e); A.migrated = false; });
            }
            var noSingle = !A.cfgs.single || A.cfgs.single.format === 'double';
            if (!A.picked && noSingle && (A.cfgs.double || (old && old.format === 'double'))) setFmt('double', true);
        }
        ['single', 'double'].forEach(function (f) {
            REFS[f].onSnapshot(function (doc) {
                A.cfgs[f] = doc.exists ? doc.data() : null;
                A.got[f] = true;
                migrate();
                if (f !== A.fmt) { tabBadges(); return; }
                A.cfg = A.cfgs[f];
                if (!A.loaded[f] || !A.dirty) fillForm();
                A.loaded[f] = true;
                paint(); info(); advPanel();
                if (QDB.isOpen() && A.full === f) { if (A.cfg && (A.cfg.entries || []).some(Boolean)) QDB.update(A.cfg); else QDB.close(); }
            }, function (e) { console.error(e); A.got[f] = true; tabBadges(); if (f === A.fmt) $('qdb-a-info').textContent = 'Không đọc được dữ liệu sơ đồ ' + FN[f] + ' (không đủ quyền hoặc mất kết nối máy chủ).'; });
        });
        db.collection('tournament').onSnapshot(function (snap) {
            A.parts = []; snap.forEach(function (d) { var x = d.data(); x._id = d.id; A.parts.push(x); });
            info();
        });
    })();
    
