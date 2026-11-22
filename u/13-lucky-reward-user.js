    /* Quay Số May Mắn (user): hiện phần thưởng Admin đặt trong hộp chọn số + báo "Chúc mừng" khi mình trúng (sau khi màn quay kịp hiện số) */
    (function () {
        'use strict';
        if (typeof db === 'undefined' || !window.LuckyReward) return;
        var LR = window.LuckyReward, $ = function (id) { return document.getElementById(id); }, pad = function (x) { return String(x).padStart(2, '0'); };
        var cfg = LR.norm(null), owner = null, unsub = null, seen = {}, first = true;
        db.collection('settings').doc('lucky_reward_config').onSnapshot(function (d) { cfg = LR.norm(d.exists ? d.data() : null); prizeLine(); }, function () {});
        function prizeLine() {
            var el = $('ln2-prize'); if (!el) return;
            var t = LR.text(Object.assign({ cash: cfg.cash }, cfg.main)), tn = cfg.nearOn ? LR.text(Object.assign({ cash: cfg.nearCash }, cfg.near)) : '';
            el.hidden = !cfg.on || !t;
            el.innerHTML = '🎁 Trúng đúng số: <b>' + t + '</b>' + (cfg.mode === 'split' ? ' (chia đều nếu nhiều người trúng)' : '') + (tn ? '<br>🥈 Lệch 1 số: <b>' + tn + '</b>' : '');
        }
        function show(r, near) {
            var part = near ? r.eachNear : r.each, old = $('lr-win'); if (old) old.remove();
            var w = document.createElement('div'); w.id = 'lr-win'; w.setAttribute('role', 'alert');
            w.innerHTML = '<div class="lr-ball">' + pad(r.number) + '</div><div><b class="t">🎉 ' + (near ? 'Bạn trúng giải phụ Quay Số!' : 'Chúc mừng! Bạn trúng Quay Số May Mắn!') + '</b>'
                + (near ? 'Số của bạn chỉ lệch 1 so với số ' + pad(r.number) + '. ' : 'Số ' + pad(r.number) + ' đã về. ') + 'Phần thưởng: <span class="g">' + (LR.text(part) || '—') + '</span>'
                + (part && part.cash > 0 ? '<br><small>Tiền mặt: Ban Quản Trị sẽ chuyển khoản (xem trong Túi đồ).</small>' : '') + '</div><button type="button" aria-label="Đóng">×</button>';
            w.querySelector('button').onclick = function () { w.remove(); };
            document.body.appendChild(w); setTimeout(function () { if (w.parentNode) w.remove(); }, 20000);
            try { if (window.Sound && window.Sound.rewardAudio) { window.Sound.rewardAudio.currentTime = 0; window.Sound.rewardAudio.play().catch(function () {}); } } catch (e) {}
        }
        setInterval(function () {
            var me = window.State && window.State.currentUser; if (me === owner) return;
            if (unsub) { try { unsub(); } catch (e) {} unsub = null; } owner = me || null; seen = {}; first = true; if (!me) return;
            unsub = db.collection('lucky_rewards').where('all', 'array-contains', me).onSnapshot(function (snap) {
                snap.docChanges().forEach(function (c) {
                    var id = c.doc.id, r = c.doc.data() || {}; if (c.type !== 'added' || seen[id]) return; seen[id] = 1;
                    if (first || Date.now() - (r.at || 0) > 10 * 60000) return;   // phiên cũ: không báo lại
                    var near = (r.winners || []).indexOf(me) < 0;
                    setTimeout(function () { show(r, near); }, Math.max(0, (r.at || 0) + 15000 - Date.now()));   // chờ màn quay hiện số rồi mới báo
                });
                first = false;
            }, function () {});
        }, 1500);
        document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#ln-tab')) setTimeout(prizeLine, 50); }, true);
    })();
    
