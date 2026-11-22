    /* Sơ đồ giải đấu loại trực tiếp kiểu World Cup: 2 nhánh trái / phải gặp nhau ở Chung kết giữa sơ đồ
       Dữ liệu (Firestore settings/tournament_bracket):
         { title, format: 'single' | 'double', size: 4|8|16|32|64, third: bool, enabled: bool, seedMode,
           entries: [ { id, name, sub, seed, members: [ { u, ign, gid } ] } | null (miễn đấu) ]  -> theo vị trí trên sơ đồ
           results: { 'vòng-trận': { w: 0|1, s0, s1 }, third: {...} }, updatedAt } */
    (function () {
        'use strict';
        if (window.QDB) return;
        var d = document;
        function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        function seedOrder(n) { var a = [1, 2]; while (a.length < n) { var len = a.length * 2, b = []; a.forEach(function (s) { b.push(s, len + 1 - s); }); a = b; } return a.slice(0, n); }
        function roundName(teams) { return teams === 2 ? 'Chung Kết' : teams === 4 ? 'Bán Kết' : teams === 8 ? 'Tứ Kết' : 'Vòng 1/' + (teams / 2); }
        function sideOf(e, slot) { return e && (e.name || (e.members && e.members.length)) ? { t: 'e', e: e, slot: slot } : { t: 'bye' }; }
        function mk(r, m, sides, rs, no, label) {
            var o = { r: r, m: m, key: r + '-' + m, sides: sides, no: no, label: label, w: -1, res: rs || null, decided: '' };
            var a = sides[0].t, b = sides[1].t;
            if (a === 'e' && b === 'e') { if (rs && (rs.w === 0 || rs.w === 1)) { o.w = rs.w; o.decided = 'play'; } }
            else if (a === 'e' && b === 'bye') { o.w = 0; o.decided = 'bye'; }
            else if (a === 'bye' && b === 'e') { o.w = 1; o.decided = 'bye'; }
            else if (a === 'bye' && b === 'bye') o.decided = 'void';
            return o;
        }
        function adv(mt) { if (mt.decided === 'void') return { t: 'bye' }; return mt.w >= 0 ? mt.sides[mt.w] : { t: 'tbd' }; }
        function lose(mt) { if (mt.decided === 'play') return mt.sides[1 - mt.w]; if (mt.decided) return { t: 'bye' }; return { t: 'tbd' }; }
        function validSize(n) { return [4, 8, 16, 32, 64].indexOf(n) >= 0 ? n : 8; }

        function compute(cfg) {
            var N = validSize(+cfg.size), R = Math.round(Math.log(N) / Math.LN2), res = cfg.results || {}, ent = cfg.entries || [];
            var rounds = [], no = 0;
            for (var r = 0; r < R; r++) {
                var cnt = N >> (r + 1), row = [];
                for (var m = 0; m < cnt; m++) {
                    var sides = r === 0 ? [sideOf(ent[2 * m], 2 * m), sideOf(ent[2 * m + 1], 2 * m + 1)] : [adv(rounds[r - 1][2 * m]), adv(rounds[r - 1][2 * m + 1])];
                    var mt = mk(r, m, sides, res[r + '-' + m], 0, roundName(N >> r));
                    if (mt.decided !== 'void' && !(mt.decided === 'bye' && r === 0)) mt.no = ++no;
                    row.push(mt);
                }
                rounds.push(row);
            }
            var third = null;
            if (cfg.third && R >= 2) {
                var sf = rounds[R - 2];
                third = mk('t', 0, [lose(sf[0]), lose(sf[1])], res.third, ++no, 'Tranh Hạng 3'); third.key = 'third';
            }
            var fin = rounds[R - 1][0], played = 0, total = 0;
            rounds.forEach(function (row) { row.forEach(function (x) { if (x.sides[0].t === 'e' && x.sides[1].t === 'e' || !x.decided) { total++; if (x.decided === 'play') played++; } }); });
            return {
                N: N, R: R, rounds: rounds, third: third, final: fin, played: played, total: total,
                champion: fin.w >= 0 ? fin.sides[fin.w] : null,
                runnerUp: fin.decided === 'play' ? fin.sides[1 - fin.w] : null,
                thirdPlace: third && third.w >= 0 ? third.sides[third.w] : null
            };
        }
        function status(C) { return C.champion ? 'done' : C.played ? 'live' : 'wait'; }
        var STATUS_TXT = { done: 'Đã kết thúc', live: 'Đang diễn ra', wait: 'Chưa bắt đầu' };
        // Lý do đi tiếp (Admin chọn): thắng trận / đối thủ bỏ cuộc / đối thủ bị loại / BQT đặc cách
        var WHY = { win: 'Thắng trận', wo: 'Đối thủ bỏ cuộc (W.O)', dq: 'Đối thủ bị loại', bq: 'BQT đặc cách' };
        var WHY_W = { wo: 'W.O', dq: '✓', bq: '★' }, WHY_L = { wo: 'BỎ', dq: 'LOẠI', bq: '' };
        function whyOf(mt) { return mt && mt.decided === 'play' && mt.res && WHY[mt.res.why] ? mt.res.why : 'win'; }

        function sideHTML(s, mt, i, o) {
            if (s.t === 'e') {
                var e = s.e, cls = 'qdb-s', win = mt.w === i, lost = mt.decided === 'play' && mt.w !== i;
                if (win) cls += ' win'; if (lost) cls += ' lose';
                if (o.me && e.members && e.members.some(function (x) { return x.u === o.me; })) cls += ' me';
                if (o.hl && e.id === o.hl) cls += ' hl';
                var sc = '';
                if (mt.decided === 'play' && mt.res) {
                    var v = mt.res['s' + i], wy = whyOf(mt);
                    if (v !== undefined && v !== null && v !== '') sc = v;
                    else if (wy !== 'win') sc = (win ? WHY_W : WHY_L)[wy] || '';
                }
                return '<button type="button" class="' + cls + '" data-eid="' + esc(e.id) + '"><span class="qdb-seed">' + esc(e.seed || '') + '</span><span class="qdb-nm"><b>' + esc(e.name) + '</b><small>' + esc(e.sub || '') + '</small></span><span class="qdb-sc">' + esc(sc) + '</span></button>';
            }
            return '<div class="qdb-s ' + s.t + '"><span class="qdb-seed"></span><span class="qdb-nm"><i>' + (s.t === 'bye' ? 'Miễn đấu' : 'Chờ xác định') + '</i></span></div>';
        }
        function matchHTML(mt, o, extra) {
            var editable = o.admin && mt.sides[0].t === 'e' && mt.sides[1].t === 'e';
            var lbl = mt.no ? 'Trận ' + mt.no : (mt.decided === 'bye' ? 'Đi tiếp' : '—');
            return '<div class="qdb-m' + (editable ? ' edit' : '') + (extra || '') + '" data-key="' + mt.key + '"><span class="qdb-mno">' + lbl + '</span>' + sideHTML(mt.sides[0], mt, 0, o) + sideHTML(mt.sides[1], mt, 1, o) + '</div>';
        }
        function cell(mt, o) { return '<div class="qdb-cell' + (mt.w >= 0 && mt.decided !== 'void' ? ' adv' : '') + '">' + matchHTML(mt, o) + '</div>'; }

        // Dựng HTML sơ đồ. o: { admin, me (username đang đăng nhập), hl (id cần tô) }
        function treeHTML(cfg, o) {
            o = o || {};
            var C = compute(cfg), R = C.R, N = C.N, dbl = cfg.format === 'double';
            var H = 92, body = Math.max(N / 4, 1) * H; if (body < 400) body = 400;
            function half(side) {
                var h = '', rs = [];
                for (var r = 0; r < R - 1; r++) rs.push(r);
                if (side === 'R') rs.reverse();
                rs.forEach(function (r) {
                    var row = C.rounds[r], hl = row.length / 2, list = side === 'L' ? row.slice(0, hl) : row.slice(hl);
                    h += '<div class="qdb-col"><div class="qdb-rh"><span>' + esc(row[0].label) + '</span></div><div class="qdb-colb">';
                    if (list.length === 1) h += cell(list[0], o);
                    else for (var i = 0; i < list.length; i += 2) h += '<div class="qdb-pair">' + cell(list[i], o) + cell(list[i + 1], o) + '</div>';
                    h += '</div></div>';
                });
                return h;
            }
            var ch = C.champion && C.champion.t === 'e' ? C.champion.e : null;
            var mid = '<div class="qdb-col qdb-mid"><div class="qdb-rh"><span>Chung Kết</span></div><div class="qdb-colb"><div class="qdb-cell fin">'
                + '<div class="qdb-champ' + (ch ? ' has' : '') + '"><div class="qdb-trophy">🏆</div><div class="qdb-ct">NHÀ VÔ ĐỊCH</div>'
                + (ch ? '<div class="qdb-cn" data-eid="' + esc(ch.id) + '">' + esc(ch.name) + '</div>' : '<div class="qdb-cn">Chưa xác định</div>') + '</div>'
                + matchHTML(C.final, o, ' final')
                + (C.third ? '<div class="qdb-third"><div class="qdb-rh"><span>Tranh Hạng 3</span></div>' + matchHTML(C.third, o) + '</div>' : '')
                + '</div></div></div>';
            return '<div class="qdb-tree" style="--qdb-body:' + body + 'px' + (dbl ? ';--qdb-w:188px' : '') + '">' + (R > 1 ? '<div class="qdb-half qdb-left">' + half('L') + '</div>' : '') + mid + (R > 1 ? '<div class="qdb-half qdb-right">' + half('R') + '</div>' : '') + '</div>';
        }

        function findEntry(cfg, id) { var es = cfg.entries || []; for (var i = 0; i < es.length; i++) if (es[i] && es[i].id === id) return es[i]; return null; }
        function findMatch(C, key) {
            if (key === 'third') return C.third;
            var p = String(key).split('-'); return C.rounds[+p[0]] && C.rounds[+p[0]][+p[1]];
        }
        // Gắn sự kiện bấm: tên tuyển thủ -> onEntry(entry), thẻ trận (admin) -> onMatch(key)
        function bind(root, getCfg, o) {
            root.addEventListener('click', function (ev) {
                var t = ev.target; if (!t.closest) return;
                var s = t.closest('[data-eid]'), m = t.closest('.qdb-m');
                if (o.admin && m && m.classList.contains('edit') && o.onMatch) { o.onMatch(m.getAttribute('data-key')); return; }
                if (s && o.onEntry) { var e = findEntry(getCfg(), s.getAttribute('data-eid')); if (e) o.onEntry(e); }
            });
        }

        /* ---------- Lớp xem toàn màn hình: 2 chế độ, tự chọn theo màn hình ----------
           'tree'   : sơ đồ cây kiểu World Cup (máy tính, máy tính bảng, điện thoại xoay ngang) - tự vừa màn hình,
                      Ctrl + lăn chuột / chụm 2 ngón để phóng to, kéo chuột để di chuyển
           'rounds' : theo từng vòng (điện thoại dọc) - thẻ trận chữ to, vuốt trái/phải để đổi vòng, tab "Trận của tôi"
           Người xem đổi chế độ bằng nút trên đầu -> nhớ lựa chọn (localStorage qd_bracket_view) */
        var OV = null, ovCfg = null, ovOpt = null, scale = 1, lastFocus = null, mode = 'tree', rtab = null, userMode = null;
        var NARROW = 720, TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
        try { userMode = localStorage.getItem('qd_bracket_view'); } catch (e) {}
        // Mặc định: sơ đồ cây khi màn hình đủ rộng (>= 72% bề rộng thật của sơ đồ) hoặc màn ngang từ 700px (điện thoại xoay ngang);
        // còn lại (điện thoại dọc, máy tính bảng dọc với giải lớn) -> theo vòng
        function autoMode() {
            if (userMode === 'tree' || userMode === 'rounds') return userMode;
            var c = ovCfg || {}, N = [4, 8, 16, 32, 64].indexOf(+c.size) >= 0 ? +c.size : 8, R = Math.round(Math.log(N) / Math.LN2);
            var natW = (2 * R - 1) * ((c.format === 'double' ? 188 : 158) + 36) + 44, w = window.innerWidth, h = window.innerHeight;
            return w >= natW * 0.72 || (w > h && w >= 700) ? 'tree' : 'rounds';
        }
        function metaHTML(cfg) {
            var C = compute(cfg), st = status(C), dbl = cfg.format === 'double', n = (cfg.entries || []).filter(Boolean).length;
            return '<span class="qdb-chip">' + (dbl ? 'Giải Đôi · 2 vs 2' : 'Giải Đơn · 1 vs 1') + '</span><span class="qdb-chip">' + n + (dbl ? ' đội' : ' tuyển thủ') + ' / ' + C.N + ' suất</span>'
                + '<span class="qdb-chip ' + st + '">' + STATUS_TXT[st] + (st === 'live' ? ' · ' + C.played + '/' + C.total + ' trận' : '') + '</span>';
        }
        function isMine(s, me) { return !!(me && s && s.t === 'e' && s.e.members && s.e.members.some(function (x) { return x.u === me; })); }
        function myEntry(cfg, me) { var es = cfg.entries || []; for (var i = 0; i < es.length; i++) if (es[i] && es[i].members && es[i].members.some(function (x) { return x.u === me; })) return es[i]; return null; }

        /* ----- chế độ theo vòng ----- */
        function cardHTML(mt, C, o, withRound) {
            if (!mt || mt.decided === 'void') return '';
            var both = mt.sides[0].t === 'e' && mt.sides[1].t === 'e', editable = o.admin && both;
            var st = mt.decided === 'play' ? ['done', 'Đã đấu'] : mt.decided === 'bye' ? ['bye', 'Đi tiếp'] : both ? ['wait', 'Sắp đấu'] : ['tbd', 'Chờ đối thủ'];
            var mine = isMine(mt.sides[0], o.me) || isMine(mt.sides[1], o.me), nx = '';
            if (mt.decided === 'bye') {   // được miễn đấu: thẻ gọn 1 dòng
                var nb = mt.r < C.R - 1 ? C.rounds[mt.r + 1][mt.m >> 1] : null;
                return '<div class="qdb-mc bye' + (mine ? ' mine' : '') + '" data-key="' + mt.key + '">' + sideHTML(mt.sides[mt.w], mt, mt.w, o)
                    + '<div class="qdb-mc-f">Miễn đấu → ' + (nb ? 'Trận ' + nb.no + ' (' + nb.label + ')' : 'vòng sau') + '</div></div>';
            }
            if (mt.key === 'third') nx = 'Thắng → 🥉 Hạng Ba';
            else if (mt.r === C.R - 1) nx = 'Thắng → 🏆 Vô Địch';
            else { var n = C.rounds[mt.r + 1][mt.m >> 1]; nx = 'Thắng → Trận ' + n.no + ' (' + n.label + ')' + (mt.r === C.R - 2 && C.third ? ' · Thua → Tranh Hạng 3' : ''); }
            return '<div class="qdb-mc' + (editable ? ' edit' : '') + (mine ? ' mine' : '') + (mt.r === C.R - 1 ? ' final' : '') + '" data-key="' + mt.key + '">'
                + '<div class="qdb-mc-h"><span class="qdb-mc-no">' + (mt.no ? 'Trận ' + mt.no : 'Miễn đấu') + (withRound ? ' · ' + esc(mt.label) : '') + (mine ? ' · <b>Bạn</b>' : '') + '</span><span class="qdb-mc-st ' + st[0] + '">' + st[1] + '</span></div>'
                + sideHTML(mt.sides[0], mt, 0, o) + sideHTML(mt.sides[1], mt, 1, o)
                + '<div class="qdb-mc-f">' + (whyOf(mt) !== 'win' ? '<span class="qdb-why">' + esc(WHY[whyOf(mt)]) + '</span>' : '') + nx + (editable ? '<b>✎ Thiết lập đi tiếp</b>' : '') + '</div></div>';
        }
        function tabsOf(C, cfg, o) {
            var t = [];
            for (var r = 0; r < C.R - 1; r++) {
                var row = C.rounds[r], n = row.filter(function (x) { return x.decided !== 'void'; }).length;
                t.push({ k: 'r' + r, l: row[0].label, n: n });
            }
            t.push({ k: 'f', l: '🏆 Chung Kết', n: 0 });
            if (o.me && myEntry(cfg, o.me)) t.push({ k: 'me', l: '⭐ Trận Của Tôi', n: 0 });
            return t;
        }
        function currentTab(C) {
            for (var r = 0; r < C.R; r++) if (C.rounds[r].some(function (x) { return !x.decided; })) return r === C.R - 1 ? 'f' : 'r' + r;
            return 'f';
        }
        function roundsPanel(cfg, o) {
            var C = compute(cfg), h = '', k = rtab;
            if (k === 'f') {
                var ch = C.champion && C.champion.t === 'e' ? C.champion.e : null;
                h += '<div class="qdb-bigchamp' + (ch ? ' has' : '') + '"><div class="qdb-trophy">🏆</div><div class="qdb-ct">NHÀ VÔ ĐỊCH</div>'
                    + (ch ? '<div class="qdb-cn" data-eid="' + esc(ch.id) + '">' + esc(ch.name) + '</div>' + (ch.sub ? '<small>' + esc(ch.sub) + '</small>' : '') : '<div class="qdb-cn">Chưa xác định</div>') + '</div>';
                if (C.runnerUp || C.thirdPlace) {
                    h += '<div class="qdb-podium">' + (C.runnerUp ? '<span data-eid="' + esc(C.runnerUp.e.id) + '">🥈 ' + esc(C.runnerUp.e.name) + '</span>' : '') + (C.thirdPlace ? '<span data-eid="' + esc(C.thirdPlace.e.id) + '">🥉 ' + esc(C.thirdPlace.e.name) + '</span>' : '') + '</div>';
                }
                h += '<div class="qdb-mcs one">' + cardHTML(C.final, C, o) + (C.third ? cardHTML(C.third, C, o) : '') + '</div>';
            } else if (k === 'me') {
                var e = myEntry(cfg, o.me), list = [];
                C.rounds.concat(C.third ? [[C.third]] : []).forEach(function (row) { row.forEach(function (mt) { if (isMine(mt.sides[0], o.me) || isMine(mt.sides[1], o.me)) list.push(mt); }); });
                var rd = e ? road(cfg, e) : null;
                h += '<div class="qdb-rh2"><b>' + esc(e ? e.name : '') + '</b><span class="qdb-badge' + (rd && rd.out ? ' out' : '') + '">' + esc(rd ? rd.badge : '') + '</span></div>';
                h += '<div class="qdb-mcs">' + list.map(function (mt) { return cardHTML(mt, C, o, true); }).join('') + '</div>';
            } else {
                var r = +String(k).slice(1), row = C.rounds[r] || [], live = row.filter(function (x) { return x.decided !== 'void'; });
                var played = live.filter(function (x) { return x.decided === 'play'; }).length, playable = live.filter(function (x) { return x.decided !== 'bye'; }).length;
                var byes = live.filter(function (x) { return x.decided === 'bye'; });
                h += '<div class="qdb-rh2"><b>' + esc(row[0] ? row[0].label : '') + '</b><span>' + played + '/' + playable + ' trận đã đấu</span></div>';
                h += '<div class="qdb-mcs">' + live.filter(function (x) { return x.decided !== 'bye'; }).map(function (mt) { return cardHTML(mt, C, o); }).join('') + '</div>';
                if (byes.length) h += '<div class="qdb-rh2 sub"><span>🎟️ Được miễn đấu — đi thẳng vào vòng sau</span></div><div class="qdb-mcs">' + byes.map(function (mt) { return cardHTML(mt, C, o); }).join('') + '</div>';
            }
            return h;
        }
        function paintRounds(dir) {
            var C = compute(ovCfg), o = viewOpt(), tabs = tabsOf(C, ovCfg, o);
            if (!rtab || !tabs.some(function (t) { return t.k === rtab; })) rtab = currentTab(C);
            var cur = currentTab(C);
            OV.querySelector('.qdb-ov-rt').innerHTML = tabs.map(function (t) {
                return '<button type="button" role="tab" data-rt="' + t.k + '" class="' + (t.k === rtab ? 'on' : '') + (t.k === 'me' ? ' me' : '') + '" aria-selected="' + (t.k === rtab) + '">'
                    + esc(t.l) + (t.n ? ' <small>' + t.n + '</small>' : '') + (t.k === cur && t.k !== rtab ? ' <i class="qdb-dot"></i>' : '') + '</button>';
            }).join('');
            var p = OV.querySelector('.qdb-rp');
            p.innerHTML = roundsPanel(ovCfg, o);
            if (dir) { p.classList.remove('in-l', 'in-r'); void p.offsetWidth; p.classList.add(dir > 0 ? 'in-r' : 'in-l'); }
            var on = OV.querySelector('.qdb-ov-rt .on');
            if (on && on.scrollIntoView) { var bar = OV.querySelector('.qdb-ov-rt'); bar.scrollLeft = on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2; }
        }
        function stepTab(dir) {
            var tabs = tabsOf(compute(ovCfg), ovCfg, viewOpt()).map(function (t) { return t.k; }), i = tabs.indexOf(rtab), j = i + dir;
            if (i < 0 || j < 0 || j >= tabs.length) return;
            rtab = tabs[j]; paintRounds(dir); OV.querySelector('.qdb-ov-body').scrollTop = 0;
        }
        function viewOpt() { return { admin: !!(ovOpt && ovOpt.admin), me: ovOpt && ovOpt.me }; }

        /* ----- khung lớp phủ ----- */
        function ensureOV() {
            if (OV) return OV;
            OV = d.createElement('div'); OV.className = 'qdb-ov qdb-root'; OV.hidden = true; OV.setAttribute('role', 'dialog'); OV.setAttribute('aria-modal', 'true');
            OV.innerHTML = '<div class="qdb-ov-top"><div class="qdb-ov-tt"><h3></h3><div></div></div>'
                + '<button type="button" class="qdb-ib wide qdb-mode" data-z="mode"></button>'
                + '<button type="button" class="qdb-ib x" data-z="x" aria-label="Đóng">✕</button></div>'
                + '<div class="qdb-ov-rt" role="tablist" aria-label="Chọn vòng đấu"></div>'
                + '<div class="qdb-zb"><button type="button" class="qdb-ib" data-z="+" aria-label="Phóng to" title="Phóng to">+</button><button type="button" class="qdb-ib" data-z="fit" aria-label="Xem toàn bộ sơ đồ" title="Xem toàn bộ">⤢</button><button type="button" class="qdb-ib" data-z="-" aria-label="Thu nhỏ" title="Thu nhỏ">−</button></div>'
                + '<div class="qdb-ov-body"><div class="qdb-zw"><div class="qdb-z"></div></div><div class="qdb-rp"></div></div>'
                + '<div class="qdb-ov-ft"></div>';
            d.body.appendChild(OV);
            var body = OV.querySelector('.qdb-ov-body');
            OV.addEventListener('click', function (e) {
                var t = e.target.closest ? e.target : null; if (!t) return;
                var rt = t.closest('[data-rt]');
                if (rt) { var tabs = tabsOf(compute(ovCfg), ovCfg, viewOpt()).map(function (x) { return x.k; }); var dir = tabs.indexOf(rt.getAttribute('data-rt')) - tabs.indexOf(rtab); rtab = rt.getAttribute('data-rt'); paintRounds(dir); body.scrollTop = 0; return; }
                var b = t.closest('.qdb-ov-top [data-z], .qdb-zb [data-z]'); if (!b) return;
                var z = b.getAttribute('data-z');
                if (z === 'x') return QDB.close();
                if (z === 'mode') return setMode(mode === 'tree' ? 'rounds' : 'tree', true);
                if (z === 'fit') return fit(true);
                zoomAt(scale * (z === '+' ? 1.25 : 0.8));
            });
            bind(body, function () { return ovCfg; }, {
                admin: false,
                onEntry: function (e) { if (ovOpt && ovOpt.onEntry) ovOpt.onEntry(e); }
            });
            body.addEventListener('click', function (ev) {   // admin: bấm trận để nhập kết quả
                var m = ev.target.closest && ev.target.closest('.qdb-m.edit, .qdb-mc.edit');
                if (m && ovOpt && ovOpt.admin && ovOpt.onMatch) { ev.stopPropagation(); ovOpt.onMatch(m.getAttribute('data-key')); }
            }, true);
            // kéo chuột để di chuyển sơ đồ
            var drag = null;
            body.addEventListener('pointerdown', function (e) {
                if (mode !== 'tree' || e.pointerType !== 'mouse' || e.button !== 0 || (e.target.closest && e.target.closest('button, .qdb-m.edit, [data-eid]'))) return;
                drag = { x: e.clientX, y: e.clientY, l: body.scrollLeft, t: body.scrollTop, moved: false };
            });
            window.addEventListener('pointermove', function (e) {
                if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
                if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; body.classList.add('drag'); }
                if (drag.moved) { body.scrollLeft = drag.l - dx; body.scrollTop = drag.t - dy; }
            });
            window.addEventListener('pointerup', function () { drag = null; body.classList.remove('drag'); });
            // Ctrl + lăn chuột (hoặc chụm 2 ngón trên touchpad) để phóng to quanh con trỏ
            body.addEventListener('wheel', function (e) {
                if (mode !== 'tree' || !(e.ctrlKey || e.metaKey)) return;
                e.preventDefault(); zoomAt(scale * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
            }, { passive: false });
            // cảm ứng: chụm 2 ngón (sơ đồ) / vuốt ngang đổi vòng (theo vòng)
            var pinch = null, sw = null;
            body.addEventListener('touchstart', function (e) {
                if (mode === 'tree' && e.touches.length === 2) {
                    var a = e.touches[0], b = e.touches[1];
                    pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), s: scale }; sw = null; return;
                }
                if (mode === 'rounds' && e.touches.length === 1) sw = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
            }, { passive: true });
            body.addEventListener('touchmove', function (e) {
                if (!pinch || e.touches.length !== 2) return;
                e.preventDefault();
                var a = e.touches[0], b = e.touches[1], dd = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
                zoomAt(pinch.s * dd / pinch.d, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
            }, { passive: false });
            body.addEventListener('touchend', function (e) {
                if (pinch && e.touches.length < 2) pinch = null;
                if (!sw || mode !== 'rounds') return;
                var t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y, dt = Date.now() - sw.t; sw = null;
                if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && dt < 700) stepTab(dx < 0 ? 1 : -1);
            }, { passive: true });
            d.addEventListener('keydown', function (e) {
                if (!OV || OV.hidden) return;
                if (e.key === 'Escape') { if (DT && !DT.hidden) closeDetail(); else QDB.close(); return; }
                if (DT && !DT.hidden) return;
                if (mode === 'rounds' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) stepTab(e.key === 'ArrowRight' ? 1 : -1);
                if (mode === 'tree' && (e.key === '+' || e.key === '=' || e.key === '-')) zoomAt(scale * (e.key === '-' ? 0.8 : 1.25));
            });
            var rsT = 0;
            window.addEventListener('resize', function () {
                if (!OV || OV.hidden) return;
                clearTimeout(rsT); rsT = setTimeout(function () { var m = autoMode(); if (m !== mode) setMode(m, false); else if (mode === 'tree') zoomAt(scale); }, 120);
            });
            return OV;
        }
        // phóng to / thu nhỏ quanh 1 điểm trên màn hình (mặc định: giữa vùng xem)
        function zoomAt(s, cx, cy) {
            if (!OV) return;
            var z = OV.querySelector('.qdb-z'), w = OV.querySelector('.qdb-zw'), body = OV.querySelector('.qdb-ov-body');
            s = Math.min(1.8, Math.max(0.25, s));
            var rb = body.getBoundingClientRect(), rw = w.getBoundingClientRect();
            if (cx == null) { cx = rb.left + body.clientWidth / 2; cy = rb.top + body.clientHeight / 2; }
            var px = (cx - rw.left) / scale, py = (cy - rw.top) / scale;   // điểm trên sơ đồ (kích thước gốc)
            scale = s;
            z.style.transform = 'scale(' + s + ')';
            w.style.width = Math.ceil(z.offsetWidth * s) + 'px'; w.style.height = Math.ceil(z.offsetHeight * s) + 'px';
            var rw2 = w.getBoundingClientRect();
            body.scrollLeft += (rw2.left + px * s) - cx; body.scrollTop += (rw2.top + py * s) - cy;
        }
        function fit(all) {
            var z = OV.querySelector('.qdb-z'), body = OV.querySelector('.qdb-ov-body');
            var bw = body.clientWidth - 16, bh = body.clientHeight - 16, nw = z.offsetWidth || 1, nh = z.offsetHeight || 1;
            var both = Math.min(bw / nw, bh / nh, 1.15), s;
            if (all) s = Math.max(0.25, both);
            else s = both >= 0.6 ? both : Math.max(0.6, Math.min(1, bw / nw));   // mở lần đầu: không nhỏ hơn 60% để còn đọc được
            scale = s; z.style.transform = 'scale(' + s + ')';
            var w = OV.querySelector('.qdb-zw'); w.style.width = Math.ceil(nw * s) + 'px'; w.style.height = Math.ceil(nh * s) + 'px';
            body.scrollLeft = Math.max(0, (body.scrollWidth - body.clientWidth) / 2); body.scrollTop = 0;
        }
        function setMode(m, save) {
            mode = m === 'rounds' ? 'rounds' : 'tree';
            if (save) { userMode = mode; try { localStorage.setItem('qd_bracket_view', mode); } catch (e) {} }
            paintOV(true);
        }
        function paintOV(first) {
            if (!OV || !ovCfg) return;
            OV.setAttribute('data-mode', mode);
            OV.querySelector('.qdb-ov-tt h3').textContent = '🏆 ' + (ovCfg.title || 'Sơ Đồ Giải Đấu');
            OV.querySelector('.qdb-ov-tt div').innerHTML = metaHTML(ovCfg);
            var mb = OV.querySelector('.qdb-mode');
            mb.innerHTML = mode === 'tree' ? '📋 <span>Theo vòng</span>' : '🌳 <span>Sơ đồ</span>';
            mb.setAttribute('aria-label', mode === 'tree' ? 'Xem theo từng vòng' : 'Xem sơ đồ cây'); mb.title = mb.getAttribute('aria-label');
            OV.querySelector('.qdb-ov-ft').textContent = mode === 'rounds'
                ? (TOUCH ? '👈 Vuốt ngang để đổi vòng · Bấm tên để xem chi tiết 👉' : '← → đổi vòng · Bấm tên tuyển thủ để xem chi tiết')
                : (TOUCH ? 'Chụm 2 ngón để phóng to · Bấm tên để xem chi tiết' : 'Bấm tên để xem chi tiết · Ctrl + lăn chuột để phóng to · kéo để di chuyển');
            var body = OV.querySelector('.qdb-ov-body'), has = (ovCfg.entries || []).some(Boolean);
            var sl = body.scrollLeft, st = body.scrollTop;
            if (!has) {
                OV.querySelector('.qdb-z').innerHTML = OV.querySelector('.qdb-rp').innerHTML = '<div class="qdb-empty">Ban quản trị chưa xếp cặp đấu.</div>';
                OV.querySelector('.qdb-ov-rt').innerHTML = ''; return;
            }
            if (mode === 'rounds') {
                if (first) rtab = null;
                paintRounds(0);
                if (first) body.scrollTop = 0; else body.scrollTop = st;
                return;
            }
            var z = OV.querySelector('.qdb-z');
            z.innerHTML = treeHTML(ovCfg, viewOpt());
            if (first) fit(false);
            else { zoomAt(scale); body.scrollLeft = sl; body.scrollTop = st; }
        }

        /* ---------- Thẻ chi tiết tuyển thủ (tab: Cá nhân / ID Game / Tài khoản / Thành tích) ---------- */
        var DT = null, dtState = null;
        function ensureDT() {
            if (DT) return DT;
            DT = d.createElement('div'); DT.className = 'qdb-dt qdb-root'; DT.hidden = true;
            DT.innerHTML = '<div class="qdb-dc" role="dialog" aria-modal="true"><div class="qdb-dh"><div class="qdb-av"></div><div class="qdb-dn"><b></b><small></small></div><button type="button" class="qdb-ib x qdb-dx" aria-label="Đóng">✕</button></div>'
                + '<div class="qdb-mem"></div><div class="qdb-tabs" role="tablist">'
                + '<button type="button" data-t="me" class="on">Cá Nhân</button><button type="button" data-t="gid">ID Game</button><button type="button" data-t="acc">Tài Khoản</button><button type="button" data-t="road">Thành Tích</button></div>'
                + '<div class="qdb-pane"></div></div>';
            d.body.appendChild(DT);
            DT.addEventListener('click', function (e) {
                if (e.target === DT || (e.target.closest && e.target.closest('.qdb-dx'))) return closeDetail();
                var tb = e.target.closest && e.target.closest('.qdb-tabs button');
                if (tb) { dtState.tab = tb.getAttribute('data-t'); return paintDT(); }
                var mb = e.target.closest && e.target.closest('.qdb-mem button');
                if (mb) { dtState.mi = +mb.getAttribute('data-i'); return paintDT(); }
                var cp = e.target.closest && e.target.closest('[data-copy]');
                if (cp) copy(cp.getAttribute('data-copy'), cp);
            });
            return DT;
        }
        function copy(text, btn) {
            var ok = function () { var o = btn.textContent; btn.textContent = '✓ Đã sao chép'; setTimeout(function () { btn.textContent = o; }, 1500); };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
            function fallback() { var t = d.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; d.body.appendChild(t); t.select(); try { d.execCommand('copy'); ok(); } catch (e) {} t.remove(); }
        }
        function fmtDate(ms) { if (!ms) return 'Chưa có dữ liệu'; var x = new Date(+ms); return isNaN(x) ? 'Chưa có dữ liệu' : x.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
        function fmtAgo(ms, online) {
            if (window.QDSession) { var pq = window.QDSession.pres({ lastActive: ms, online: online }); return { t: pq.on ? '● Đang hoạt động' : pq.short, on: pq.on }; }
            if (!ms) return { t: 'Chưa từng hoạt động', on: false };
            var s = (Date.now() - ms) / 1000;
            if (s < 300) return { t: '● Đang hoạt động', on: true };
            if (s < 3600) return { t: Math.round(s / 60) + ' phút trước', on: false };
            if (s < 86400) return { t: Math.round(s / 3600) + ' giờ trước', on: false };
            return { t: Math.round(s / 86400) + ' ngày trước', on: false };
        }
        var ROLE = { admin: 'Quản trị viên', manager: 'Quản lý' };
        function road(cfg, e) {
            var C = compute(cfg), list = [], out = null;
            C.rounds.concat(C.third ? [[C.third]] : []).forEach(function (row) {
                row.forEach(function (mt) {
                    var i = mt.sides[0].t === 'e' && mt.sides[0].e.id === e.id ? 0 : mt.sides[1].t === 'e' && mt.sides[1].e.id === e.id ? 1 : -1;
                    if (i < 0) return;
                    var op = mt.sides[1 - i], opn = op.t === 'e' ? op.e.name : op.t === 'bye' ? 'Miễn đấu' : 'Chờ xác định', r;
                    if (mt.decided === 'bye') r = { c: 'w', t: 'Đi tiếp' };
                    else if (mt.decided === 'play') {
                        var sc = mt.res && mt.res.s0 !== undefined && mt.res.s0 !== '' && mt.res.s0 !== null ? ' ' + (i === 0 ? mt.res.s0 + '-' + mt.res.s1 : mt.res.s1 + '-' + mt.res.s0) : '';
                        var wy = whyOf(mt), tag = wy === 'wo' ? (mt.w === i ? ' (W.O)' : ' (bỏ cuộc)') : wy === 'dq' ? (mt.w === i ? '' : ' (bị loại)') : wy === 'bq' ? (mt.w === i ? ' (đặc cách)' : '') : '';
                        r = mt.w === i ? { c: 'w', t: 'Thắng' + sc + tag } : { c: 'l', t: 'Thua' + sc + tag };
                        if (mt.w !== i && mt.key !== 'third' && !out) out = mt.label;
                    } else r = { c: 'p', t: 'Chưa đấu' };
                    list.push({ label: mt.label, op: opn, r: r });
                });
            });
            var me = function (s) { return s && s.t === 'e' && s.e.id === e.id; };
            var badge = me(C.champion) ? '🏆 Nhà Vô Địch' : me(C.runnerUp) ? '🥈 Á Quân' : me(C.thirdPlace) ? '🥉 Hạng Ba' : out ? 'Dừng bước ở ' + out : 'Đang thi đấu';
            return { list: list, badge: badge, out: !!out && !me(C.thirdPlace) && !me(C.runnerUp) };
        }
        function paintDT() {
            var s = dtState, e = s.e, mem = (e.members && e.members[s.mi]) || {}, dbl = (e.members || []).length > 1;
            DT.querySelector('.qdb-av').textContent = String(e.name || '?').charAt(0).toUpperCase();
            DT.querySelector('.qdb-dn b').textContent = e.name || '---';
            DT.querySelector('.qdb-dn small').textContent = (s.cfg.format === 'double' ? 'Giải Đôi' : 'Giải Đơn') + (e.seed ? ' · Hạt giống #' + e.seed : '') + (e.sub ? ' · ' + e.sub : '');
            var mh = '';
            if (dbl) e.members.forEach(function (x, i) { mh += '<button type="button" data-i="' + i + '" class="' + (i === s.mi ? 'on' : '') + '">' + esc(x.ign || x.u) + '</button>'; });
            DT.querySelector('.qdb-mem').innerHTML = mh; DT.querySelector('.qdb-mem').style.display = dbl ? '' : 'none';
            DT.querySelectorAll('.qdb-tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-t') === s.tab); b.setAttribute('aria-selected', b.getAttribute('data-t') === s.tab); });
            var acc = s.acc[mem.u], ex = (s.ctx.getExtra && s.ctx.getExtra(mem.u)) || {}, p = DT.querySelector('.qdb-pane'), h = '';
            var row = function (k, v, cls) { return '<div class="qdb-row"><span>' + k + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(v) + '</b></div>'; };
            if (s.tab === 'road') {
                var rd = road(s.cfg, e);
                h = '<div class="qdb-badge' + (rd.out ? ' out' : '') + '">' + esc(rd.badge) + '</div>';
                rd.list.forEach(function (x) { h += '<div class="qdb-jr"><em>' + esc(x.label) + '</em><span>vs ' + esc(x.op) + '</span><b class="' + x.r.c + '">' + esc(x.r.t) + '</b></div>'; });
                if (!rd.list.length) h += '<div class="qdb-load">Chưa có trận đấu.</div>';
            } else if (s.tab === 'gid') {
                h = '<div class="qdb-gid"><small>Mã ID Game</small><div>' + esc(mem.gid || 'Chưa cập nhật') + '</div>' + (mem.gid ? '<button type="button" data-copy="' + esc(mem.gid) + '">📋 Sao chép ID</button>' : '') + '</div>'
                    + row('Tên Ingame', mem.ign || '---') + row('Tài khoản', mem.u || '---');
            } else if (acc === undefined) {
                h = '<div class="qdb-load">Đang tải thông tin...</div>';
                if (!s.loading[mem.u] && mem.u && s.ctx.getAccount) {
                    s.loading[mem.u] = true;
                    Promise.resolve(s.ctx.getAccount(mem.u)).then(function (a) { s.acc[mem.u] = a || null; }, function () { s.acc[mem.u] = null; }).then(function () { if (dtState === s && !DT.hidden) paintDT(); });
                } else if (!mem.u) s.acc[mem.u] = null;
            } else if (s.tab === 'me') {
                var a1 = acc || {};
                h = row('Họ và tên', a1.fullName || 'Chưa cập nhật') + row('Tên Ingame', mem.ign || '---') + row('Đội', ex.team || (dbl ? e.name : 'Chưa phân đội'))
                    + row('Điểm tích lũy giải', String(ex.points || 0) + ' điểm') + row('Vị trí', s.cfg.format === 'double' ? 'Thành viên ' + (s.mi + 1) + '/' + e.members.length : 'Tuyển thủ');
            } else {
                var a = acc || {}, ag = fmtAgo(a.lastActive, a.online);
                h = row('Tên tài khoản', mem.u || '---') + row('Vai trò', ROLE[a.role] || 'Thành viên') + row('Ngày tham gia', fmtDate(a.created_at || a.createdAt))
                    + row('Hoạt động', acc ? ag.t : 'Không tìm thấy tài khoản', ag.on ? 'on' : '') + row('Trạng thái', a.isBlocked ? 'Đang bị khóa' : 'Bình thường');
            }
            p.innerHTML = h;
        }
        function openDetail(e, cfg, ctx) {
            ensureDT();
            dtState = { e: e, cfg: cfg, ctx: ctx || {}, tab: 'me', mi: 0, acc: {}, loading: {} };
            if (ctx && ctx.me && e.members) e.members.forEach(function (x, i) { if (x.u === ctx.me) dtState.mi = i; });
            lastFocus = d.activeElement;
            DT.hidden = false; paintDT();
            requestAnimationFrame(function () { DT.classList.add('show'); var b = DT.querySelector('.qdb-tabs button.on'); if (b) b.focus({ preventScroll: true }); });
        }
        function closeDetail() { if (!DT) return; DT.classList.remove('show'); setTimeout(function () { DT.hidden = true; }, 200); if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }

        var bodyOverflow = '';
        var QDB = window.QDB = {
            esc: esc, seedOrder: seedOrder, compute: compute, status: status, STATUS_TXT: STATUS_TXT, treeHTML: treeHTML, metaHTML: metaHTML, cardHTML: cardHTML, WHY: WHY, whyOf: whyOf,
            bind: bind, findEntry: findEntry, findMatch: findMatch, roundName: roundName, openDetail: openDetail, closeDetail: closeDetail,
            // Mở toàn màn hình. opt: { admin, me, onEntry(e), onMatch(key) }
            open: function (cfg, opt) {
                ensureOV(); ovCfg = cfg; ovOpt = opt || {};
                var first = OV.hidden;
                OV.hidden = false;
                if (first) { bodyOverflow = d.body.style.overflow; d.body.style.overflow = 'hidden'; mode = autoMode(); }
                paintOV(first);
            },
            update: function (cfg) { ovCfg = cfg; if (OV && !OV.hidden) paintOV(false); if (DT && !DT.hidden && dtState) { dtState.cfg = cfg; paintDT(); } },
            isOpen: function () { return !!(OV && !OV.hidden); },
            close: function () { if (!OV) return; closeDetail(); OV.hidden = true; d.body.style.overflow = bodyOverflow; }
        };
    })();
    
