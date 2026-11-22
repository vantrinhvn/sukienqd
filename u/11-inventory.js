    /* ===== TÚI QUÀ CÁ NHÂN v2 =====
       - Điểm & lượt rút lì xì: tài khoản (accounts.points / tickets), cập nhật realtime theo State
       - Lượt vòng quay: câu hỏi đã trả lời đúng mà chưa quay (wheel_questions.claimedBy == mình && ticketUsed != true), giống qt.html
       - Lịch sử: tranhthuong_history (Rút lì xì), spin_history (Vòng quay), lixi_history (Lì xì điểm hằng ngày) */
    (function () {
        'use strict';
        var $ = function (id) { return document.getElementById(id); };
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var money = function (t) {   // "10.000 VNĐ" -> 10000 ; "20K" -> 20000 ; không phải tiền -> 0
            var m = String(t || '').match(/(\d[\d.,]*)\s*(k(?!\p{L})|nghìn|ngàn)?\s*(vnđ|vnd|đồng|đ(?!\p{L}))?/iu);
            if (!m || (!m[2] && !m[3])) return 0;
            var n = parseInt(m[1].replace(/[.,]/g, ''), 10) || 0;
            return m[2] ? n * 1000 : n;
        };
        var isWish = function (t) { return !t || /chuc may man|loi chuc|chuc tet|ti nua|them ti/.test(String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()); };
        var fmtMoney = function (n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; };
        var fmtTime = function (ts) {
            if (!ts) return '';
            var d = new Date(ts), p = function (x) { return String(x).padStart(2, '0'); };
            return p(d.getHours()) + ':' + p(d.getMinutes()) + ' · ' + p(d.getDate()) + '/' + p(d.getMonth() + 1);
        };
        var SRC = { lixi: '🧧 Rút lì xì', wheel: '🎡 Vòng quay', daily: '💰 Lì xì hằng ngày', lucky: '🎯 Quay số may mắn', tour: '🏆 Giải đấu' };

        window.Inventory = {
            owner: null, unsubs: [], data: { lixi: [], wheel: [], daily: [], lucky: [] }, spinTickets: 0, f: 'all', limit: 30, last: {},
            // Bắt đầu nghe dữ liệu của tài khoản đang đăng nhập (tự khởi động lại khi đổi tài khoản)
            ensure: function () {
                var me = window.State && window.State.currentUser;
                if (me === this.owner) return;
                this.stop(); this.owner = me;
                if (!me || typeof db === 'undefined') return;
                var self = this, ok = function () { var d = $('inv2-dot'); if (d) d.classList.remove('off'); }, bad = function (e) { console.warn('Inventory', e); var d = document.querySelector('.inv2-dot'); if (d) d.classList.add('off'); };
                var listen = function (q, key, map) {
                    self.unsubs.push(q.onSnapshot(function (snap) { self.data[key] = snap.docs.map(function (d) { var o = map(d.data()); o.id = d.id; return o; }); ok(); self.renderList(); }, bad));   // o.id: tra trạng thái chuyển khoản (payouts)
                };
                listen(db.collection('tranhthuong_history').where('userId', '==', me), 'lixi', function (d) { return { src: 'lixi', prize: d.result, wish: d.wish, ts: d.timestamp }; });
                listen(db.collection('spin_history').where('userId', '==', me), 'wheel', function (d) { return { src: 'wheel', prize: d.result, wish: d.wish, ts: d.timestamp }; });
                // Quay Số May Mắn: phần thưởng đã trao (lucky_rewards, có thể nhiều người trúng 1 phiên)
                self.unsubs.push(db.collection('lucky_rewards').where('all', 'array-contains', me).onSnapshot(function (snap) {
                    var LRw = window.LuckyReward; self.data.lucky = [];
                    snap.docs.forEach(function (x) {
                        var r = x.data() || {}, near = (r.near || []).indexOf(me) >= 0 && (r.winners || []).indexOf(me) < 0, part = near ? r.eachNear : r.each;
                        if (!part) return;
                        self.data.lucky.push({ src: 'lucky', id: x.id + '_' + me, ts: r.at || r.wonAt, prize: LRw ? LRw.prize(part, r.number, near) : ('Quay Số May Mắn (số ' + r.number + ')') });
                    });
                    ok(); self.renderList();
                }, bad));
                listen(db.collection('lixi_history').where('user', '==', me), 'daily', function (d) { return { src: 'daily', prize: '+' + (d.amount || 0) + ' điểm lì xì', ts: d.timestamp, revoked: d.status === 'revoked' }; });
                this.unsubs.push(db.collection('wheel_questions').where('claimedBy', '==', me).onSnapshot(function (snap) {
                    self.spinTickets = snap.docs.filter(function (d) { return d.data().ticketUsed !== true; }).length; self.refresh();
                }, bad));
            },
            stop: function () { this.unsubs.forEach(function (u) { try { u(); } catch (e) {} }); this.unsubs = []; this.data = { lixi: [], wheel: [], daily: [], lucky: [] }; this.spinTickets = 0; this.last = {}; },
            setNum: function (id, v) {
                var el = $(id); if (!el) return;
                if (this.last[id] !== undefined && this.last[id] !== v) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
                this.last[id] = v; el.textContent = Number(v || 0).toLocaleString('vi-VN');
            },
            // Gọi mỗi khi tài khoản thay đổi (điểm / lượt)
            refresh: function () {
                this.ensure();
                var S = window.State || {};
                this.setNum('inv-points', S.availablePoints || 0);
                this.setNum('inv-tickets', S.availableTickets || 0);
                const spins = this.spinTickets + (Number(S.availableSpins) || 0);   // câu hỏi đã trả lời đúng + lượt quay trong tài khoản (giống trang Vòng Quay)
                this.setNum('inv-spins', spins);
                if (window.WheelTab && window.WheelTab.render) try { window.WheelTab.render(); } catch (e) {}
                var u = $('inv2-user'); if (u) u.textContent = S.currentUser ? ('Chủ túi: ' + S.currentUser) : 'Xuân Đinh Mùi 2027';
                document.querySelectorAll('#modal-inventory .inv2-item').forEach(function (it, i) {
                    var n = [S.availablePoints, S.availableTickets, spins][i] || 0, a = it.querySelector('.inv2-act');
                    if (a && i > 0) a.classList.toggle('off', n <= 0);
                });
            },
            all: function () {
                var d = this.data, tour = window.TourPrizeUser ? window.TourPrizeUser.mine(this.owner) : [];   // thưởng giải đấu (bản 24)
                var arr = d.lixi.concat(d.wheel, d.daily, d.lucky || [], tour);
                arr.forEach(function (r) { if (r.src === 'tour') { r.money = r.cash || 0; r.isWish = false; return; } r.money = isWish(r.prize) ? 0 : money(r.prize); r.isWish = r.src !== 'daily' && isWish(r.prize); });
                return arr.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
            },
            renderList: function () {
                if (window.PayoutUser) try { window.PayoutUser.render(); } catch (e) {}
                var list = $('inv2-list'); if (!list) return;
                var arr = this.all(), f = this.f;
                var rows = arr.filter(function (r) { return f === 'all' || (f === 'money' ? r.money > 0 : r.src === f); });
                if (!rows.length) {
                    list.innerHTML = '<div class="inv2-empty">' + (f === 'all' ? '🎁 Túi quà còn trống.<br>Rút lì xì hoặc quay vòng quay để nhận quà nhé!' : 'Chưa có quà nào ở mục này.') + '</div>';
                    return;
                }
                var shown = rows.slice(0, this.limit);
                list.innerHTML = shown.map(function (r) {
                    var ico = r.money > 0 ? '💵' : (r.isWish ? '🎊' : (r.src === 'daily' ? '💰' : (r.src === 'wheel' ? '🎡' : (r.src === 'lucky' ? '🎯' : (r.src === 'tour' ? '🏆' : '🎁')))));
                    var title = r.isWish ? 'Lời Chúc Tết' : r.prize;
                    return '<div class="inv2-row' + (r.money > 0 ? ' money' : '') + (r.revoked ? ' revoked' : '') + '">' +
                        '<div class="inv2-row-ico">' + ico + '</div><div class="inv2-row-main">' +
                        '<div class="inv2-row-top"><span class="inv2-row-prize">' + esc(title) + '</span><span class="inv2-row-time">' + esc(fmtTime(r.ts)) + '</span></div>' +
                        '<div class="inv2-row-src">' + SRC[r.src] + (r.revoked ? ' · đã bị thu hồi' : '') + '</div>' +
                        (r.wish ? '<div class="inv2-row-wish">“' + esc(r.wish) + '”</div>' : '') +
                        (r.money > 0 && window.PayoutUser ? window.PayoutUser.badge(r) : '') + (r.tag || '') +
                        '</div></div>';
                }).join('') + (rows.length > shown.length ? '<button class="inv2-more" onclick="window.Inventory.more()">Xem thêm (' + (rows.length - shown.length) + ')</button>' : '');
            },
            filter: function (f) {
                this.f = f; this.limit = 30;
                document.querySelectorAll('#modal-inventory .inv2-chip').forEach(function (c) { c.classList.toggle('active', c.dataset.f === f); });
                this.renderList();
            },
            more: function () { this.limit += 30; this.renderList(); },
            openShop: function () { window.UI.closeModal('modal-inventory'); setTimeout(function () { window.PointShop.open(); }, 250); }
        };

        // Tương thích với code cũ
        window.SyncInventoryUI = function () { window.Inventory.refresh(); };
        // Mở túi -> đảm bảo đã nghe dữ liệu + vẽ lại
        document.addEventListener('click', function (e) {
            var t = e.target && e.target.closest ? e.target.closest('[onclick*="modal-inventory"]') : null;
            if (t && !t.closest('#modal-inventory')) { window.Inventory.refresh(); window.Inventory.renderList(); }
        }, true);
    })();
    
