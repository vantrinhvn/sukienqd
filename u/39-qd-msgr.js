    /* ===== TRÒ CHUYỆN KIỂU MESSENGER =====
       - Gom tin liên tiếp của 1 người (cách nhau ≤ 5 phút): góc bong bóng nối liền, ảnh đại diện ở tin cuối, tên ở tin đầu.
       - Mốc thời gian giữa đoạn chat khi cách nhau > 15 phút / sang ngày mới: "17:27", "TH 6 LÚC 21:54", "21 THG 11 LÚC 21:54".
       - Ảnh nhỏ "đã xem" của từng người nằm dưới tin cuối cùng người đó đã xem; tin cuối của mình chưa ai xem -> "Đã gửi".
       - Chạm vào tin: hiện giờ gửi + nút thả tim / xem / thu hồi (máy tính: rê chuột). Nhấp đúp vẫn thả tim. */
    window.QDMsgr = (function () {
        var GAP = 15 * 60e3, JOIN = 5 * 60e3;
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        function day0(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
        function label(t) {
            var d = new Date(t), n = new Date(), hm = pad(d.getHours()) + ':' + pad(d.getMinutes()), days = Math.round((day0(n) - day0(d)) / 864e5);
            if (days <= 0) return hm;
            if (days < 7) return (d.getDay() === 0 ? 'CN' : 'TH ' + (d.getDay() + 1)) + ' LÚC ' + hm;
            return d.getDate() + ' THG ' + (d.getMonth() + 1) + (d.getFullYear() !== n.getFullYear() ? ', ' + d.getFullYear() : '') + ' LÚC ' + hm;
        }
        function prep(ms, start, me, target) {
            var R = { sep: {}, first: {}, last: {}, heads: {}, mine: -1, seenMine: false }, i;
            for (i = start; i < ms.length; i++) {
                var m = ms[i], p = i > start ? ms[i - 1] : null;
                if (!p || m.time - p.time > GAP || day0(new Date(m.time)) !== day0(new Date(p.time))) R.sep[i] = label(m.time);
                var join = !!p && !R.sep[i] && p.from === m.from && !!p.bot === !!m.bot && !p.auto && !m.auto && (m.time - p.time) <= JOIN;
                R.first[i] = !join; if (join) R.last[i - 1] = false; R.last[i] = true;
            }
            var rd = {};
            for (i = start; i < ms.length; i++) {
                var x = ms[i];
                if (target === 'general') { (x.readBy || []).forEach(function (u) { if (u && u !== me) rd[u] = i; }); if (x.from && x.from !== me && !x.bot) rd[x.from] = i; }
                else if (x.from === target) rd[target] = i;
                else if (x.from === me && x.read) rd[target] = i;
            }
            Object.keys(rd).forEach(function (u) { var k = rd[u]; if (ms[k] && ms[k].from !== u) (R.heads[k] = R.heads[k] || []).push(u); });
            for (i = ms.length - 1; i >= start; i--) if (ms[i].from === me && !ms[i].revoked) { R.mine = i; break; }
            if (R.mine >= 0) for (i = R.mine; i < ms.length; i++) if ((R.heads[i] || []).length) { R.seenMine = true; break; }
            return R;
        }
        // Chạm vào tin: hiện / ẩn giờ gửi + nút thao tác
        document.addEventListener('click', function (e) {
            var b = e.target.closest && e.target.closest('#chat-history-ui .msg-bubble'); if (!b) return;
            if (e.target.closest('a, img, button, .qd-mention, video')) return;
            var row = b.closest('.msg-row'); if (!row) return;
            var on = !row.classList.contains('show-meta');
            Array.prototype.forEach.call(document.querySelectorAll('#chat-history-ui .msg-row.show-meta'), function (r) { r.classList.remove('show-meta'); });
            if (on) row.classList.add('show-meta');
        });
        // Khung chat vừa màn hình (máy tính): đo chỗ bắt đầu của khung để chiều cao = phần màn hình còn lại
        function fit() {
            var m = document.querySelector('#view-chat .chat-module'); if (!m || !m.getClientRects().length || innerWidth < 1024) return;
            var sc = document.querySelector('.main-content-wrapper'), top = Math.round(m.getBoundingClientRect().top + (sc ? sc.scrollTop : 0));
            if (top > 0 && top < innerHeight - 200) document.documentElement.style.setProperty('--qd-chat-top', top + 'px');
            if (sc) {   // phần đệm dưới trang còn làm trang cuộn được -> trừ bớt để không cuộn (đầu khung không bị thanh trên che)
                var ex = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--qd-chat-extra'), 10) || 0, over = sc.scrollHeight - sc.clientHeight;
                if (over > 0 && over < 300) document.documentElement.style.setProperty('--qd-chat-extra', (ex + over) + 'px');
                sc.scrollTop = 0;
            }
        }
        window.addEventListener('resize', function () { clearTimeout(fit.t); fit.t = setTimeout(fit, 120); });
        (function hook(n) {
            if (!window.UI || !UI.navigate) { if (n < 60) setTimeout(function () { hook(n + 1); }, 500); return; }
            var nav = UI.navigate; UI.navigate = function (v) { var r = nav.apply(this, arguments); if (v === 'chat') { setTimeout(fit, 30); setTimeout(fit, 400); } return r; };
        })(0);
        return { prep: prep, label: label, fit: fit };
    })();
    
