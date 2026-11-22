    (function () {
        'use strict';
        var $ = function (id) { return document.getElementById(id); };
        var T = window.ConTab = { n: null, cfg: null, doc: null, unsub: null, unsubCfg: null, free: '' };
        function today() { var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
        T.render = function () {
            var tab = $('con-tab'); if (!tab) return;
            var c = T.cfg || {}, lock = c.enabled === false, n = T.n, freeN = c.freePerDay == null ? 3 : Number(c.freePerDay) || 0, canFree = !lock && freeN > 0 && T.free !== today();
            tab.dataset.state = lock ? 'locked' : 'open';
            $('con-tab-sub').textContent = n == null ? 'Lượt ném: --' : 'Lượt ném: ' + n;
            $('con-tab-go').textContent = lock ? '🔒 Sân đang đóng' : (n > 0 ? 'Chạm để ra sân ném ›' : (canFree ? '🎁 Nhận ' + freeN + ' lượt miễn phí ›' : 'Hết lượt · chạm để xem ›'));
        };
        // tự bắt đầu khi đã đăng nhập (State.currentDocId), tự dừng khi đăng xuất
        function tick() {
            var id = window.State && window.State.currentDocId;
            if (id === T.doc) return;
            if (T.unsub) { try { T.unsub(); } catch (e) {} T.unsub = null; }
            if (T.unsubCfg) { try { T.unsubCfg(); } catch (e) {} T.unsubCfg = null; }
            T.doc = id || null; T.n = null; T.render();
            if (!id || typeof db === 'undefined') return;
            try {
                T.unsub = db.collection('accounts').doc(id).onSnapshot(function (s) { var d = s && s.exists ? s.data() : {}; T.n = Number(d.conThrows) || 0; T.free = d.conFreeDate || ''; T.render(); }, function (e) { console.warn('ConTab acc', e); });
                T.unsubCfg = db.collection('settings').doc('con_config').onSnapshot(function (s) { T.cfg = s && s.exists ? s.data() : {}; T.render(); }, function (e) { console.warn('ConTab cfg', e); T.cfg = {}; T.render(); });
            } catch (e) { console.warn('ConTab', e); }
        }
        setInterval(tick, 1000);
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick); else tick();
    })();
    
