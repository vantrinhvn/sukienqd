    window.Cashout = (function () {
        'use strict';
        var $ = function (id) { return document.getElementById(id); };
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var fmt = function (n) { return Number(n || 0).toLocaleString('vi-VN'); };
        var vnd = function (n) { return fmt(n) + 'đ'; };
        var p2 = function (x) { return String(x).padStart(2, '0'); };
        var day = function () { var d = new Date(); return d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()); };
        var DEF = { on: true, per1000: 1000, tiers: [10000, 20000, 50000, 100000], daily: 0 };
        var CO = { cfg: DEF, list: [], today: 0, me: null, unsubs: [], busy: false };
        function norm(c) {
            c = c || {};
            var tiers = (Array.isArray(c.tiers) ? c.tiers : DEF.tiers).map(function (x) { return Math.round(+x); }).filter(function (x) { return x >= 1000; }).sort(function (a, b) { return a - b; });
            return { on: c.isEnabled !== false, per1000: Math.max(1, Math.round(+c.per1000 || DEF.per1000)), tiers: tiers.length ? tiers : DEF.tiers.slice(), daily: Math.max(0, Math.round(+c.dailyLimit || 0)) };
        }
        function need(a) { return Math.round(a * CO.cfg.per1000 / 1000); }
        function pts() { var S = window.State || {}; return Math.max(0, +S.availablePoints || 0); }
        function bank() { var b = window.PayoutUser && window.PayoutUser.bank; return b && b.accNo ? b : null; }
        function status(id) { var P = window.PayoutUser; return P && P.pays ? P.pays['point_cashout_' + id] : null; }
        function stop() { CO.unsubs.forEach(function (u) { try { u(); } catch (e) {} }); CO.unsubs = []; CO.list = []; CO.today = 0; }
        function watch() {
            var me = window.State && window.State.currentUser;
            if (me === CO.me) return; stop(); CO.me = me || null;
            if (!me || typeof db === 'undefined') return render();
            CO.unsubs.push(db.collection('point_cashout').where('user', '==', me).onSnapshot(function (snap) {
                CO.list = snap.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }).sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); }); render();
            }, function (e) { console.warn('point_cashout', e); }));
            CO.unsubs.push(db.collection('point_cashout_daily').doc(me + '_' + day()).onSnapshot(function (d) { CO.today = (d.exists && +d.data().amount) || 0; render(); }, function () {}));
        }
        if (typeof db !== 'undefined') db.collection('settings').doc('point_cashout').onSnapshot(function (d) { CO.cfg = norm(d.exists ? d.data() : {}); render(); }, function () {});
        setInterval(function () { watch(); var m = $('modal-cashout'); if (m && m.classList.contains('active')) render(); }, 1500);
        function render() {
            var c = CO.cfg, p = pts(), b = bank();
            if ($('co2-rate')) $('co2-rate').textContent = fmt(need(10000)) + ' điểm = 10.000đ · chuyển khoản về tài khoản của bạn';
            document.querySelectorAll('.co2-entry-row, .co2-inv').forEach(function (e) { e.style.display = c.on ? '' : 'none'; });
            document.querySelectorAll('.co2-entry-row .co2-entry').forEach(function (e) { e.textContent = '💵 Đổi điểm lì xì ra tiền mặt (' + fmt(need(10000)) + ' điểm = 10.000đ)'; });
            if ($('co2-pts')) $('co2-pts').textContent = fmt(p);
            if ($('co2-closed')) $('co2-closed').classList.toggle('show', !c.on);
            var bk = $('co2-bank');
            if (bk) {
                bk.classList.toggle('warn', !b);
                bk.innerHTML = b ? '🏦 Tiền sẽ chuyển về: <b>' + esc(b.bank || b.bin) + ' · ' + esc(b.accNo) + '</b>' + (b.accName ? ' · ' + esc(b.accName) : '')
                    : '⚠️ Bạn chưa khai <b>tài khoản nhận tiền</b>. Khai 1 lần để Ban Quản Trị chuyển khoản cho bạn.<br><button type="button" onclick="window.Cashout.bank()">🏦 Khai tài khoản nhận tiền</button>';
            }
            var left = c.daily ? Math.max(0, c.daily - CO.today) : Infinity;
            var tg = $('co2-tiers');
            if (tg) tg.innerHTML = c.tiers.map(function (a) {
                var n = need(a), why = !c.on ? 'Đang đóng' : !b ? 'Cần khai TK' : p < n ? 'Thiếu ' + fmt(n - p) + ' điểm' : a > left ? 'Vượt hạn mức hôm nay' : CO.busy ? 'Đang xử lý...' : '';
                return '<button type="button" class="co2-tier"' + (why ? ' disabled' : '') + ' onclick="window.Cashout.ask(' + a + ')"><span class="m">' + vnd(a) + '</span><span class="p">−' + fmt(n) + ' điểm lì xì</span><span class="go">' + (why || 'Đổi ngay') + '</span></button>';
            }).join('');
            var nt = $('co2-note');
            if (nt) nt.innerHTML = '• Điểm bị trừ ngay khi đổi; Ban Quản Trị chuyển khoản trong thời gian sớm nhất (theo dõi ở Lịch sử bên dưới).<br>• Nếu yêu cầu không được duyệt, điểm được <b>hoàn lại đủ</b>.'
                + (c.daily ? '<br>• Hạn mức mỗi ngày: <b>' + vnd(c.daily) + '</b> · hôm nay còn <b>' + vnd(left) + '</b>.' : '');
            var ls = $('co2-list');
            if (ls) ls.innerHTML = CO.list.length ? CO.list.slice(0, 30).map(function (x) {
                var st = status(x.id), t = new Date(x.timestamp || 0), when = p2(t.getHours()) + ':' + p2(t.getMinutes()) + ' ' + p2(t.getDate()) + '/' + p2(t.getMonth() + 1);
                var badge = st && st.status === 'paid' ? '<span class="co2-st ok">✅ Đã chuyển ' + (function (d) { return p2(d.getDate()) + '/' + p2(d.getMonth() + 1); })(new Date(st.paidAt || 0)) + '</span>'
                    : st && st.status === 'rejected' ? '<span class="co2-st no">✖ Không duyệt · đã hoàn điểm</span>' : '<span class="co2-st wait">⏳ Chờ chuyển khoản</span>';
                return '<div class="co2-row"><div><b>' + vnd(x.amount) + '</b><small>−' + fmt(x.points) + ' điểm · ' + when + '</small></div>' + badge + '</div>';
            }).join('') : '<div class="co2-empty">Chưa có lần đổi nào.</div>';
        }
        function pop(cls, html) { var p = $('co2-pop'), c = $('co2-pop-card'); if (!p || !c) return; c.className = 'co2-pop-card ' + (cls || ''); c.innerHTML = html; p.classList.add('show'); }
        function closePop() { var p = $('co2-pop'); if (p && !CO.busy) p.classList.remove('show'); }
        function ask(a) {
            var n = need(a), p = pts(), b = bank();
            if (!CO.cfg.on) return window.Utils.toast('Đổi điểm ra tiền đang tạm đóng.', 'warning');
            if (!b) return window.Utils.toast('Bạn cần khai tài khoản nhận tiền trước.', 'warning');
            if (p < n) return window.Utils.toast('Số dư điểm không đủ.', 'warning');
            pop('', '<div class="co2-pop-ico">💵</div><h3>Xác nhận đổi điểm?</h3><div class="co2-pop-rows"><div class="plus"><span>Bạn nhận</span><b>' + vnd(a) + '</b></div>'
                + '<div class="minus"><span>Trừ điểm</span><b>−' + fmt(n) + '</b></div><div><span>Số dư sau khi đổi</span><b>' + fmt(p - n) + ' điểm</b></div>'
                + '<div><span>Chuyển về</span><b>' + esc((b.bank || b.bin) + ' · ' + b.accNo) + '</b></div></div>'
                + '<div class="co2-pop-btns"><button class="no" onclick="window.Cashout.closePop()">Hủy</button><button class="yes" onclick="window.Cashout.go(' + a + ')">Xác nhận đổi</button></div>');
        }
        function go(a) {
            var S = window.State || {}, me = S.currentUser;
            if (!me || !S.currentDocId || CO.busy) return;
            CO.busy = true; render();
            pop('', '<div class="co2-spin"></div><h3>Đang xử lý...</h3>');
            var got = null;
            // Máy chủ tự kiểm tra mốc / tài khoản nhận tiền / số dư / hạn mức ngày rồi trừ điểm + tạo đơn chờ chuyển khoản
            window.QDdb.act('cashout', { amount: a }).then(function (r) { got = { a: r.a, n: r.n, left: r.left };
            }).then(function () {
                CO.busy = false;
                S.availablePoints = got.left;
                try { if (window.PointShop && window.PointShop.updateUI) window.PointShop.updateUI(got.left); } catch (e) {}
                try { if (window.Inventory && window.Inventory.refresh) window.Inventory.refresh(); } catch (e) {}
                pop('ok', '<div class="co2-pop-ico">🎉</div><h3>Đổi điểm thành công!</h3><div class="co2-pop-rows"><div class="plus"><span>Tiền mặt</span><b>' + vnd(got.a) + '</b></div>'
                    + '<div class="minus"><span>Đã trừ</span><b>−' + fmt(got.n) + ' điểm</b></div><div><span>Số dư còn lại</span><b>' + fmt(got.left) + ' điểm</b></div>'
                    + '<div><span>Trạng thái</span><b>⏳ Chờ BQT chuyển khoản</b></div></div><div class="co2-pop-btns"><button class="yes" onclick="window.Cashout.closePop()">Tuyệt vời!</button></div>');
                window.Utils.toast('💵 Đã gửi yêu cầu đổi ' + fmt(got.n) + ' điểm lấy ' + vnd(got.a) + '. Chờ Ban Quản Trị chuyển khoản!', 'success');
                render();
            }).catch(function (e) {
                CO.busy = false;
                var msg = { CLOSED: 'Đổi điểm ra tiền vừa tạm đóng.', TIER: 'Mốc đổi này không còn áp dụng.', BANK: 'Bạn cần khai tài khoản nhận tiền trước.', POINTS: 'Số dư điểm không đủ.', DAILY: 'Bạn đã đạt hạn mức đổi trong hôm nay.', BLOCKED: 'Tài khoản đang bị khóa.', LOGIN: 'Phiên đăng nhập hết hạn, hãy đăng nhập lại.' }[window.qdCode(e)];
                if (!msg) { console.error(e); msg = window.qdErr ? window.qdErr('cashout', e) : ''; }
                pop('', '<div class="co2-pop-ico">😢</div><h3>Đổi điểm chưa thành công</h3><div class="co2-pop-rows"><div><span>' + (msg || 'Lỗi kết nối máy chủ, vui lòng thử lại.') + '</span></div></div>'
                    + '<p style="font-size:12px;color:#fecaca;margin:-4px 0 12px;">Bạn chưa bị trừ điểm.</p><div class="co2-pop-btns"><button class="yes" onclick="window.Cashout.closePop()">Đã hiểu</button></div>');
                render();
            });
        }
        function open() { watch(); render(); var p = $('co2-pop'); if (p) p.classList.remove('show'); window.UI.openModal('modal-cashout'); }
        function openBank() { try { window.UI.closeModal('modal-cashout'); } catch (e) {} setTimeout(function () { if (window.PayoutUser && window.PayoutUser.openForm) window.PayoutUser.openForm(); }, 250); }
        // Nút vào: Trạm Quy Đổi (cạnh số dư) + Túi đồ (ô Điểm lì xì)
        (function entries() {
            var bal = document.querySelector('#modal-point-shop .ps2-balance');
            if (bal && !document.querySelector('.co2-entry-row')) bal.insertAdjacentHTML('afterend', '<div class="co2-entry-row"><button type="button" class="co2-entry" onclick="window.Cashout.open()">💵 Đổi điểm lì xì ra tiền mặt (10.000 điểm = 10.000đ)</button></div>');
            var inv = document.querySelector('.inv2-act[onclick="window.Inventory.openShop()"]');
            if (inv && !document.querySelector('.co2-inv')) inv.insertAdjacentHTML('afterend', '<button type="button" class="inv2-act co2-inv" onclick="window.UI.closeModal(\'modal-inventory\'); setTimeout(function(){ window.Cashout.open(); }, 250);">Đổi ra tiền</button>');
        })();
        setTimeout(render, 0);
        return { open: open, ask: ask, go: go, closePop: closePop, bank: openBank, render: render, _co: CO };
    })();
    
