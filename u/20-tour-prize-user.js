    /* Trang thành viên: Giải Đấu > khung "Giải Thưởng" (tiền + quà từng hạng, người nhận khi giải kết thúc)
       + Túi đồ: mỗi khoản thưởng giải đấu của mình 1 dòng 🏆, giải có tiền mặt có nhãn Chờ BQT chuyển khoản / Đã chuyển khoản */
    (function () {
        'use strict';
        var TP = window.QDTourPrize; if (!TP) return;
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var me = function () { return (window.State && window.State.currentUser) || ''; };
        // Cột phải: tiền (hoặc vật phẩm đầu tiên) chữ to, phần còn lại (điểm, lượt, quà khác) chữ nhỏ bên dưới
        function valHTML(x, unit) {
            var p = TP.parts(x); if (!p.length) return '';
            return '<b' + (x.cash > 0 ? '' : ' class="it"') + '>' + esc(p[0]) + (x.cash > 0 ? unit : '') + '</b>' + (p.length > 1 ? '<small>' + esc(p.slice(1).join(' · ')) + '</small>' : '');
        }
        function box(fmt, pc, cfg, st) {
            var P = cfg ? TP.places(cfg) : null, status = !cfg ? ['', 'Chưa có sơ đồ'] : P && P.done ? ['done', 'Đã kết thúc'] : P && P.live ? ['live', '● Đang diễn ra'] : ['', 'Chưa bắt đầu'];
            var sl = cfg ? TP.slots(cfg) : null, who = {}, u = me(), total = 0, mult = fmt === 'double' && pc.split === 'each' ? 2 : 1;
            if (P && P.done) P.list.forEach(function (p) { (who[p.k] = who[p.k] || []).push(p.e); });
            var rows = TP.TIERS.filter(function (t) { return TP.has(pc.tiers[t.k]) && (!sl || sl[t.k]); }).map(function (t) {
                var x = pc.tiers[t.k], n = sl ? sl[t.k] : 1, ents = who[t.k] || [];
                total += x.cash * n * mult;
                var mine = !!u && ents.some(function (e) { return (e.members || []).some(function (m) { return m && m.u === u; }); });
                var unit = fmt === 'double' ? (pc.split === 'team' ? ' / đội' : ' / người') : '';
                var sub = ents.length ? (mine ? '<span class="tp-u-me">Bạn</span> ' : '') + '<span class="tp-u-win">' + esc(ents.map(function (e) { return e.name; }).join(' · ')) + '</span>'
                    : (n > 1 ? 'Mỗi ' + (fmt === 'double' ? 'đội' : 'người') + ' · ' + n + ' suất' : (P && P.done ? 'Không có' : 'Chờ kết quả'));
                return '<li class="tp-u-row ' + t.k + (mine ? ' mine' : '') + '"><span class="tp-u-i">' + t.i + '</span>'
                    + '<span class="tp-u-n"><b>' + esc(TP.tierName(t.k, cfg)) + '</b><small>' + sub + '</small></span>'
                    + '<span class="tp-u-v">' + valHTML(x, unit) + '</span></li>';
            });
            if (!rows.length) return '';
            var splitTxt = fmt === 'double' ? (pc.split === 'team' ? 'Thưởng tính cho cả đội, chia đều 2 người' : 'Mỗi thành viên trong đội nhận đủ') : '';
            var itemNote = TP.TIERS.some(function (t) { return TP.hasItems(pc.tiers[t.k]); }) ? '<span>💰 Điểm lì xì + lượt tự cộng vào tài khoản khi giải kết thúc</span>' : '';
            return '<section class="tp-u-box"><div class="tp-u-bh"><b>' + (fmt === 'double' ? '👥 Giải Đôi<small>2 vs 2</small>' : '👤 Giải Đơn<small>1 vs 1</small>') + '</b><span class="tp-u-st ' + status[0] + '">' + status[1] + '</span></div>'
                + (cfg && cfg.title ? '<div class="tp-u-title">' + esc(cfg.title) + '</div>' : '')
                + '<ul class="tp-u-list">' + rows.join('') + '</ul>'
                + ((cfg && total > 0) || splitTxt || itemNote ? '<div class="tp-u-foot"><span>' + (cfg && total > 0 ? 'Tổng tiền thưởng: <b>' + TP.vnd(total) + '</b>' : '') + '</span><span>' + splitTxt + '</span>' + itemNote + '</div>' : '')
                + '</section>';
        }
        function paint(st) {
            var el = document.getElementById('tp-u'); if (!el) return;
            st = st || TP.current(); if (!st) { el.hidden = true; return; }
            var h = '';
            ['single', 'double'].forEach(function (f) {
                var pc = st.prize[f], cfg = st.brackets[f];
                if (!TP.any(pc)) return;
                if (cfg && cfg.enabled === false && !(cfg.entries || []).some(Boolean)) cfg = null;
                h += box(f, pc, cfg, st);
            });
            el.hidden = !h;
            if (!h) return;
            document.getElementById('tp-u-grid').innerHTML = h;
            document.getElementById('tp-u-note').textContent = st.prize.note || 'Ban Quản Trị chuyển khoản tiền thưởng sau khi giải kết thúc. Nhớ khai tài khoản nhận thưởng trong Hồ sơ / Túi đồ.';
        }
        var lastMine = null;
        TP.watch(function (st) {
            paint(st);
            if (window.Inventory && window.Inventory.owner) try { window.Inventory.renderList(); } catch (e) {}
            // Báo khi mình vừa có giải (không báo lần đầu mở trang)
            var u = me(); if (!u) return;
            var mine = st.awards.filter(function (a) { return a.user === u; }), ids = mine.map(function (a) { return a.id; }).join('|');
            if (lastMine !== null && lastMine.u === u && ids && ids !== lastMine.ids) {
                var a = mine[0], pr = TP.parts(a); try { window.Utils.toast('🏆 Chúc mừng! Bạn đạt ' + a.tierName + ' ' + TP.FMT[a.fmt] + (pr.length ? ' — thưởng ' + pr.join(' · ') : '') + '!', 'success'); } catch (e) {}
            }
            lastMine = { u: u, ids: ids };
        });
        // Đổi tài khoản -> vẽ lại (đánh dấu "Bạn")
        // Tự cộng điểm / lượt thưởng của chính mình (khoản nào máy Admin chưa cộng)
        function startAuto(u) { TP.watchGiven(u || ''); TP.watch(); }   // điểm / lượt thưởng Giải Đấu do máy chủ tự cộng (sau 10 phút sơ đồ đứng yên)
        var lastU = null; function tick() { var u = me(); if (u !== lastU) { lastU = u; lastMine = null; startAuto(u); paint(); } }
        tick(); setInterval(tick, 2000);
        window.TourPrizeUser = {
            // Các khoản thưởng giải đấu của mình (Túi đồ dùng)
            mine: function (u) {
                var st = TP.current(); if (!st || !u) return [];
                var g = TP.given();
                return st.awards.filter(function (a) { return a.user === u; }).map(function (a) {
                    var tag = !a.hasItems ? '' : g[a.id] ? '<span class="inv2-pay ok">✅ Đã cộng ' + esc(TP.itemsText(a.items)) + '</span>'
                        : '<span class="inv2-pay wait">⏳ Sắp cộng ' + esc(TP.itemsText(a.items)) + ' (sau khi BQT chốt kết quả)</span>';
                    return { src: 'tour', id: a.id, ts: a.ts, cash: a.cash, tag: tag, prize: TP.parts(a).join(' · ') + ' · ' + a.tierName + ' ' + TP.FMT[a.fmt] };
                });
            },
            paint: paint
        };
    })();
    
