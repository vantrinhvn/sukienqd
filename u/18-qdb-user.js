    /* Trang user: 2 nút "Sơ Đồ Giải Đơn" / "Sơ Đồ Giải Đôi" (Ban quản trị bật/tắt riêng từng sơ đồ),
       xem sơ đồ theo thời gian thực, bấm tên -> thẻ chi tiết.
       Dữ liệu: Giải Đơn = settings/tournament_bracket, Giải Đôi = settings/tournament_bracket_double
       (bản cũ: sơ đồ đôi nằm ở tournament_bracket -> vẫn hiện đúng nút Giải Đôi cho tới khi admin chuyển) */
    (function () {
        'use strict';
        var BTN = { single: document.getElementById('btn-qdb-open'), double: document.getElementById('btn-qdb-open-2') };
        if (!BTN.single || !window.QDB) return;
        var DOCS = { single: 'tournament_bracket', double: 'tournament_bracket_double' };
        var U = window.QDBUser = { cfg: null, raw: { single: null, double: null }, cfgs: { single: null, double: null }, openF: null };
        function DB() { try { return typeof db !== 'undefined' ? db : firebase.firestore(); } catch (e) { return null; } }
        function me() { return (window.State && window.State.currentUser) || ''; }
        var ctx = {
            getAccount: function (u) {
                var d = DB(); if (!d) return Promise.resolve(null);
                return d.collection('accounts').where('user', '==', u).limit(1).get().then(function (s) {
                    if (s.empty) return null; var x = s.docs[0].data();
                    return { fullName: x.fullName, role: x.role, created_at: x.created_at || x.createdAt, lastActive: x.lastActive, online: x.online, isBlocked: x.isBlocked };
                });
            },
            getExtra: function (u) {
                var list = (window.State && window.State.tournamentData) || [];
                for (var i = 0; i < list.length; i++) if (list[i].username === u) return { points: list[i].points, team: list[i].team };
                return {};
            }
        };
        function visible(c) { return !!(c && c.enabled !== false && (c.entries || []).some(Boolean)); }
        U.open = function (f) {
            if (f !== 'double' && f !== 'single') f = visible(U.cfgs.single) ? 'single' : 'double';
            var c = U.cfgs[f];
            if (!visible(c)) { if (window.Utils && window.Utils.toast) window.Utils.toast('Ban Quản Trị chưa công bố sơ đồ ' + (f === 'double' ? 'Giải Đôi' : 'Giải Đơn') + '.', 'info'); return; }
            U.openF = f; U.cfg = c; ctx.me = me();
            QDB.open(c, { me: ctx.me, onEntry: function (e) { ctx.me = me(); QDB.openDetail(e, U.cfgs[U.openF] || c, ctx); } });
        };
        ['single', 'double'].forEach(function (f) { if (BTN[f]) BTN[f].addEventListener('click', function () { U.open(f); }); });
        // Gán dữ liệu cho từng nút (xử lý bản cũ: sơ đồ đôi lưu ở chỗ của Giải Đơn)
        function resolve() {
            var a = U.raw.single, b = U.raw.double;
            U.cfgs.double = b || (a && a.format === 'double' ? a : null);
            U.cfgs.single = a && a.format !== 'double' ? a : null;
            ['single', 'double'].forEach(function (f) {
                var btn = BTN[f], c = U.cfgs[f], show = visible(c);
                if (!btn) return;
                btn.style.display = show ? '' : 'none';
                if (show) {
                    var s = QDB.status(QDB.compute(c));
                    btn.classList.toggle('live', s === 'live');
                    btn.querySelector('small').textContent = s === 'live' ? '● LIVE' : s === 'done' ? 'Đã có vô địch' : (f === 'double' ? '2 vs 2' : '1 vs 1');
                    btn.title = c.title || '';
                }
            });
            if (QDB.isOpen() && U.openF) { var c = U.cfgs[U.openF]; if (visible(c)) { U.cfg = c; QDB.update(c); } else QDB.close(); }
        }
        function start() {
            var d = DB(); if (!d) return;
            ['single', 'double'].forEach(function (f) {
                d.collection('settings').doc(DOCS[f]).onSnapshot(function (doc) {
                    U.raw[f] = doc.exists ? doc.data() : null; resolve();
                }, function () { U.raw[f] = null; resolve(); });
            });
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    })();
    
