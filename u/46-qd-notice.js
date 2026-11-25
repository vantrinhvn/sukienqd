    /* ===== Hộp Thông báo (trang thành viên) =====
       - Nút chuông trên thanh trên cùng (#qn-bell) + số chưa đọc; bấm mở hộp #modal-notice
       - Nguồn: push_broadcast gửi riêng cho mình (target = tài khoản) hoặc gửi chung (target = 'all'), 30 ngày gần nhất
         (máy chủ ẩn thông báo riêng của người khác). Thông báo hệ thống: xác thực ID game, cảnh báo cuộc gọi, Ban Quản Trị soạn...
       - Có thông báo riêng mới (chưa đọc) khi vừa vào trang hoặc vừa tới lúc đang mở trang -> tự mở hộp (nếu không có hộp khác đang mở)
       - Đã đọc: lưu mốc thời gian trên máy (localStorage) theo từng tài khoản */
    (function () {
        'use strict';
        if (window.QDNotice) return;
        var N = window.QDNotice = { items: [], user: '', filter: 'all' };
        var d = document, $ = function (id) { return d.getElementById(id); }, unsub = null, ready = false, topAt = 0;
        var DAY = 864e5, KEEP = 30 * DAY;
        function DB() { try { return typeof db !== 'undefined' ? db : firebase.firestore(); } catch (e) { return null; } }
        function me() { return (window.State && window.State.currentUser) || ''; }
        function E(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        function seenKey() { return 'qd_notice_seen:' + N.user; }
        function seen() { try { return +localStorage.getItem(seenKey()) || 0; } catch (e) { return 0; } }
        function setSeen(t) { try { localStorage.setItem(seenKey(), String(t)); } catch (e) {} }
        function ago(t) {
            var m = Math.round((Date.now() - t) / 60000);
            if (m < 1) return 'vừa xong'; if (m < 60) return m + ' phút trước'; if (m < 1440) return Math.round(m / 60) + ' giờ trước';
            var x = new Date(t); return x.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' + x.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }
        var EMO = /^\s*(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)\s*/u;
        function split(title) { var m = EMO.exec(title || ''); return m ? [m[1], title.slice(m[0].length)] : ['🔔', title || 'Thông báo']; }
        function mine(x) { return x.target === N.user; }

        function badge() {
            var b = $('qn-dot'), btn = $('qn-bell'); if (!b) return;
            var s = seen(), n = N.items.filter(function (x) { return x.at > s; }).length;
            b.hidden = !n; b.textContent = n > 9 ? '9+' : n;
            if (btn) btn.setAttribute('aria-label', n ? 'Thông báo, ' + n + ' chưa đọc' : 'Thông báo');
        }
        function render() {
            var ul = $('qn-list'); if (!ul) return;
            var s = +(ul.getAttribute('data-seen') || 0), L = N.items.filter(function (x) { return N.filter === 'all' || mine(x); });
            Array.prototype.forEach.call(d.querySelectorAll('#qn-tabs button'), function (b) { var on = b.getAttribute('data-f') === N.filter; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
            ul.innerHTML = L.length ? L.map(function (x) {
                var t = split(x.title), img = /^https:\/\//.test(x.image || '') ? '<img src="' + E(x.image) + '" alt="" loading="lazy">' : '';
                return '<li class="qn-item' + (mine(x) ? ' me' : '') + (x.at > s ? ' new' : '') + '"><div class="qn-ic" aria-hidden="true">' + E(t[0]) + '</div><div class="qn-mid">'
                    + '<b>' + E(t[1]) + '</b>' + (x.body ? '<p>' + E(x.body) + '</p>' : '') + img
                    + '<small>' + E(ago(x.at)) + ' · ' + (mine(x) ? 'Gửi riêng bạn' : 'Thông báo chung') + '</small>'
                    + (x.act === 'regid' ? '<button type="button" class="qn-act" data-act="regid"><i class="fa-solid fa-id-card"></i> Xem ID game của tôi</button>' : '')
                    + '</div></li>';
            }).join('') : '<li class="qn-empty"><i class="fa-regular fa-bell-slash"></i><span>' + (N.filter === 'me' ? 'Chưa có thông báo nào gửi riêng bạn.' : 'Chưa có thông báo nào.') + '</span></li>';
        }
        function anyModal() { return !!d.querySelector('.modal-overlay.active:not(#modal-notice)'); }
        N.open = function () {
            var ul = $('qn-list'); if (!ul) return;
            ul.setAttribute('data-seen', String(seen()));   // giữ đánh dấu "mới" trong lúc đang xem
            render();
            if (N.items.length) setSeen(Math.max(seen(), N.items[0].at));
            badge();
            if (window.UI && window.UI.openModal) window.UI.openModal('modal-notice');
        };
        function onList(list, live) {
            N.items = list; badge();
            var box = $('modal-notice'); if (box && box.classList.contains('active')) { render(); if (list.length) setSeen(Math.max(seen(), list[0].at)); badge(); }
            // thông báo riêng chưa đọc: vừa vào trang (1 lần / phiên) hoặc vừa tới khi đang mở trang -> tự mở hộp
            var s = seen(), fresh = list.filter(function (x) { return mine(x) && x.at > s && Date.now() - x.at < 7 * DAY; });
            var newest = list.length ? list[0].at : 0, k = 'qd_notice_auto:' + N.user, shown = 0;
            try { shown = +sessionStorage.getItem(k) || 0; } catch (e) {}
            if (fresh.length && fresh[0].at > shown && !(box && box.classList.contains('active')) && !anyModal() && !d.body.classList.contains('qd-out')) {
                try { sessionStorage.setItem(k, String(fresh[0].at)); } catch (e) {}
                setTimeout(function () { if (!anyModal()) N.open(); }, live ? 400 : 1500);
            }
            topAt = Math.max(topAt, newest);
        }
        function watch() {
            var D = DB(), u = me(); if (!D) return;
            if (u === N.user && (unsub || !u)) return;
            if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
            N.user = u; N.items = []; ready = false; topAt = 0; badge();
            if (!u) return;
            unsub = D.collection('push_broadcast').where('target', 'in', [u, 'all']).where('createdAt', '>', Date.now() - KEEP).onSnapshot(function (q) {
                var L = [];
                q.forEach(function (doc) {
                    var x = doc.data() || {}; if (!x.title && !x.body) return;
                    if (x.target !== 'all' && x.target !== u) return;
                    L.push({ id: doc.id, title: String(x.title || ''), body: String(x.body || ''), at: +x.createdAt || 0, target: x.target, act: x.act || '', image: x.image || '' });
                });
                L.sort(function (a, b) { return b.at - a.at; });
                var live = ready; ready = true;
                onList(L.slice(0, 60), live);
            }, function () {});
        }
        function start() {
            var ul = $('qn-list');
            if (ul) ul.addEventListener('click', function (e) {
                var b = e.target.closest('.qn-act'); if (!b) return;
                if (b.getAttribute('data-act') === 'regid' && window.RegID) { window.UI.closeModal('modal-notice'); setTimeout(function () { window.RegID.open(); }, 250); }
            });
            var tabs = $('qn-tabs');
            if (tabs) tabs.addEventListener('click', function (e) { var b = e.target.closest('button[data-f]'); if (b) { N.filter = b.getAttribute('data-f'); render(); } });
            var t = setInterval(function () { if (me()) { watch(); clearInterval(t); } }, 1000);
            setInterval(function () { watch(); if (!d.hidden && $('modal-notice') && $('modal-notice').classList.contains('active')) render(); }, 30000);   // đổi tài khoản / cập nhật "x phút trước"
        }
        if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
    })();
