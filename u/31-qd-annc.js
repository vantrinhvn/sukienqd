    window.QDAnnc = (function () {
        'use strict';
        var W = window, d = document, last = '', list = [], idx = 0, ME = '', DOC = '', TODAY = '';
        function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        function rich(t) { return esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>'); }
        function vnKey() { return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); }
        function tsOf(n) { return Number(n.time || n.timestamp || n.createdAt) || 0; }
        function rev(n) { return Number(n.popupRev) || tsOf(n); }

        // Đăng nhập xong (State.currentUser vừa có) -> kiểm tra thông báo
        setInterval(function () {
            var S = W.State || {}, u = S.currentUser || '', id = S.currentDocId || '';
            if (!u || !id) { last = ''; return; }
            if (last === u) return; last = u;
            setTimeout(function () { load(u, id).catch(function (e) { console.warn('[Thông báo nổi]', e && e.message); }); }, 2000);
        }, 1000);

        async function load(u, id) {
            var db = firebase.firestore(); TODAY = vnKey(); ME = u; DOC = id;
            var r = await Promise.all([db.collection('news').where('popup', '==', true).get(), db.collection('accounts').doc(id).get()]);
            var seen = (r[1].exists && r[1].data().newsSeen) || {};
            list = r[0].docs.map(function (x) { var n = x.data() || {}; n.id = x.id; return n; }).filter(function (n) {
                if (!String(n.content || '').trim()) return false;
                if (n.popupUntil && TODAY > n.popupUntil) return false;
                var s = seen[n.id];
                if (n.popupMode === 'once') return !(s && s.rev === rev(n));
                if (n.popupMode === 'daily') return !(s && s.rev === rev(n) && s.day === TODAY);
                return true;   // mỗi lần đăng nhập
            }).sort(function (a, b) { return tsOf(b) - tsOf(a); }).slice(0, 5);
            if (list.length) whenFree(function () { if ((W.State || {}).currentUser === u) open(); });
        }
        // Đợi các hộp khác (Cẩm nang, lì xì...) đóng hết, không đang chơi trò chơi trong khung
        function whenFree(fn) {
            var n = 0, t = setInterval(function () {
                var busy = d.querySelector('.modal-overlay.active') || (W.QDEmbed && W.QDEmbed.isOpen()) || (d.getElementById('auth-gate') && d.getElementById('auth-gate').offsetParent !== null);
                if (!busy || ++n > 120) { clearInterval(t); if (!busy) fn(); }
            }, 700);
        }
        function build() {
            var ov = d.getElementById('qd-annc'); if (ov) return ov;
            ov = d.createElement('div'); ov.id = 'qd-annc'; ov.className = 'modal-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'an-title');
            ov.innerHTML = '<div class="an-box"><div class="an-head"><span class="an-kick">📢 Thông báo từ Ban Quản Trị</span><h3 class="an-title" id="an-title"></h3><div class="an-time" id="an-time"></div>'
                + '<button type="button" class="an-x" aria-label="Đóng" onclick="window.UI.closeModal(\'qd-annc\')">×</button></div>'
                + '<div class="an-body" id="an-body"></div>'
                + '<div class="an-foot"><div class="an-dots" id="an-dots"></div><button type="button" class="an-btn an-all" id="an-all">Xem tất cả bản tin</button><button type="button" class="an-btn an-ok" id="an-ok">Đã hiểu</button></div></div>';
            d.body.appendChild(ov);
            d.getElementById('an-ok').onclick = function () { if (idx < list.length - 1) { idx++; draw(); } else W.UI.closeModal('qd-annc'); };
            d.getElementById('an-all').onclick = function () { W.UI.closeModal('qd-annc'); setTimeout(function () { try { W.UI.navigate('news'); } catch (e) {} }, 320); };
            return ov;
        }
        function draw() {
            var n = list[idx]; if (!n) return;
            var t = tsOf(n);
            d.getElementById('an-title').textContent = String(n.popupTitle || '').trim() || 'Bản tin mới';
            d.getElementById('an-time').textContent = t ? 'Phát hành ' + new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
            d.getElementById('an-body').innerHTML = rich(n.content); d.getElementById('an-body').scrollTop = 0;
            d.getElementById('an-dots').innerHTML = list.length > 1 ? list.map(function (x, i) { return '<i class="' + (i === idx ? 'on' : '') + '"></i>'; }).join('') : '';
            d.getElementById('an-ok').textContent = idx < list.length - 1 ? 'Tiếp theo (' + (idx + 1) + '/' + list.length + ') ›' : 'Đã hiểu';
            mark(n);
        }
        function mark(n) {   // ghi đã xem (chỉ cần cho kiểu 1 lần / ngày và 1 lần / người)
            if (n.popupMode !== 'once' && n.popupMode !== 'daily') return;
            var upd = {}; upd['newsSeen.' + n.id] = { rev: rev(n), day: TODAY, at: Date.now() };
            try { firebase.firestore().collection('accounts').doc(DOC).update(upd).catch(function () {}); } catch (e) {}
        }
        function open() { build(); idx = 0; draw(); W.UI.openModal('qd-annc'); setTimeout(function () { var b = d.getElementById('an-ok'); if (b) b.focus(); }, 60); }

        return { show: function () { if (list.length) open(); }, reload: function () { last = ''; } };
    })();
    
