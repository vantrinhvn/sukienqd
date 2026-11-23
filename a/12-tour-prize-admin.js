    /* Admin > Giải đấu > "Tiền Thưởng Giải Đấu": đặt tiền mặt + quà kèm cho từng hạng (Giải Đơn / Giải Đôi riêng),
       bật / tắt hiện cho thành viên, Giải Đôi chọn "mỗi người nhận đủ" hoặc "chia đều cả đội".
       Danh sách người đạt giải (khi sơ đồ có Nhà Vô Địch) + trạng thái chuyển khoản lấy từ Trả thưởng. Ghi admin_logs (type: tournament_prize). */
    (function () {
        'use strict';
        var TP = window.QDTourPrize, card = document.getElementById('tp-card');
        if (!TP || !card || typeof db === 'undefined') return;
        var $ = function (id) { return document.getElementById(id); };
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var toast = function (m, t) { if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast(m, t || 'success'); };
        var me = function () { return (typeof State !== 'undefined' && State.currentUser) || 'admin'; };
        var REF = db.collection('settings').doc('tournament_prize');
        var HINT = { champ: '', second: '', third: 'Không có trận hạng 3: 2 đội thua Bán Kết đồng hạng', fourth: 'Chỉ khi có trận tranh Hạng 3', top8: 'Mỗi đội dừng ở Tứ Kết · sơ đồ từ 8' };
        var GIFT_PH = { champ: 'VD: Cúp + Áo đấu', second: 'VD: Danh hiệu Á Quân', third: 'Không bắt buộc', fourth: 'Không bắt buộc', top8: 'Không bắt buộc' };
        var A = window.TourPrizeAdmin = { saved: TP.norm(null), st: null };
        // Ô nhập mỗi hạng: tiền mặt, điểm lì xì, 3 loại lượt, quà khác (chữ)
        var FIELDS = [{ x: 'cash', h: '💵 Tiền mặt (VNĐ)', s: 1000, ph: '0' }].concat(TP.ITEMS.map(function (it) { return { x: it.k, h: it.i + ' ' + it.l, s: 1, ph: '0' }; }))
            .concat([{ x: 'gift', h: '🎁 Quà khác (chữ)' }]);

        // Dựng ô nhập cho 2 thể thức
        card.querySelectorAll('.tp-box').forEach(function (bx) {
            var f = bx.getAttribute('data-f'), h = '<div class="tp-row hd"><span>Hạng</span>' + FIELDS.map(function (c) { return '<span>' + c.h + '</span>'; }).join('') + '</div>';
            TP.TIERS.forEach(function (t) {
                h += '<div class="tp-row"><span class="tp-t">' + t.i + ' ' + t.l + (HINT[t.k] ? '<small>' + HINT[t.k] + '</small>' : '') + '</span>';
                FIELDS.forEach(function (c) {
                    var lab = c.h + ' — ' + t.l + ' ' + TP.FMT[f];
                    h += '<label' + (c.x === 'gift' ? ' class="g"' : '') + '><i>' + c.h + '</i>' + (c.x === 'gift'
                        ? '<input type="text" class="form-control tp-in" data-f="' + f + '" data-t="' + t.k + '" data-x="gift" maxlength="80" placeholder="' + GIFT_PH[t.k] + '" aria-label="' + lab + '">'
                        : '<input type="number" class="form-control tp-in" data-f="' + f + '" data-t="' + t.k + '" data-x="' + c.x + '" min="0" step="' + c.s + '" inputmode="numeric" placeholder="0" aria-label="' + lab + '">') + '</label>';
                });
                h += '</div>';
            });
            bx.querySelector('.tp-rows').innerHTML = h;
        });

        function read() {
            var o = { single: { tiers: {} }, double: { tiers: {} }, note: ($('tp-note').value || '').trim().slice(0, 200) };
            ['single', 'double'].forEach(function (f) {
                o[f].on = !!card.querySelector('.tp-box[data-f="' + f + '"] input[data-k="on"]').checked;
                var sp = card.querySelector('input[name="tp-split"]:checked'); o[f].split = f === 'double' && sp ? sp.value : 'each';
                TP.TIERS.forEach(function (t) {
                    var o2 = {};
                    FIELDS.forEach(function (c) { var el = card.querySelector('input[data-f="' + f + '"][data-t="' + t.k + '"][data-x="' + c.x + '"]'); o2[c.x] = c.x === 'gift' ? el.value : Math.max(0, Math.floor(+el.value || 0)); });
                    o[f].tiers[t.k] = o2;
                });
            });
            return TP.norm(o);
        }
        function fill(c) {
            ['single', 'double'].forEach(function (f) {
                card.querySelector('.tp-box[data-f="' + f + '"] input[data-k="on"]').checked = c[f].on;
                TP.TIERS.forEach(function (t) {
                    var x = c[f].tiers[t.k];
                    FIELDS.forEach(function (fd) { card.querySelector('input[data-f="' + f + '"][data-t="' + t.k + '"][data-x="' + fd.x + '"]').value = x[fd.x] || ''; });
                });
            });
            var r = card.querySelector('input[name="tp-split"][value="' + c.double.split + '"]'); if (r) r.checked = true;
            $('tp-note').value = c.note || '';
            changed();
        }
        // Tổng tiền 1 giải theo sơ đồ hiện tại (hoặc 8 đội có trận hạng 3 nếu chưa tạo sơ đồ)
        function total(f, pc, cfg) {
            var sl = TP.slots(cfg || { size: 8, third: true }), mult = f === 'double' && pc.split === 'each' ? 2 : 1, s = 0;
            TP.TIERS.forEach(function (t) { if (sl[t.k]) s += pc.tiers[t.k].cash * sl[t.k] * mult; });
            return s;
        }
        function changed() {
            var cur = read(), sv = A.saved, dirty = JSON.stringify(cur) !== JSON.stringify(sv);
            card.querySelectorAll('.tp-in').forEach(function (el) {
                var f = el.getAttribute('data-f'), t = el.getAttribute('data-t'), x = el.getAttribute('data-x'), d = false;
                if (f && t && x) d = String(cur[f].tiers[t][x] || '') !== String(sv[f].tiers[t][x] || '');
                else if (el.id === 'tp-note') d = cur.note !== sv.note;
                el.classList.toggle('dirty', d);
            });
            $('tp-dirty').classList.toggle('hidden', !dirty);
            var br = A.st ? A.st.brackets : {};
            ['single', 'double'].forEach(function (f) {
                var bx = card.querySelector('.tp-box[data-f="' + f + '"]'); bx.classList.toggle('off', !cur[f].on);
                var cfg = br[f], s = total(f, cur[f], cfg);
                bx.querySelector('.tp-sum').innerHTML = !cur[f].on ? 'Đang ẩn với thành viên.' : !TP.any(cur[f]) ? 'Chưa nhập tiền / quà cho hạng nào.'
                    : 'Tổng tiền thưởng ' + (cfg ? '(sơ đồ ' + (+cfg.size || 8) + ' ' + (f === 'double' ? 'đội' : 'người') + (TP.hasThirdMatch(cfg) ? ', có tranh hạng 3' : ', không tranh hạng 3') + ')' : '(ước tính sơ đồ 8, có tranh hạng 3)') + ': <b>' + TP.vnd(s) + '</b>'
                    + (f === 'double' ? ' · ' + (cur[f].split === 'team' ? 'chia đều 2 người (tiền làm tròn xuống bội 1.000đ, điểm / lượt lấy phần nguyên)' : 'mỗi thành viên nhận đủ') : '')
                    + (f === 'double' && cur[f].split === 'team' && TP.TIERS.some(function (t) { return TP.ITEMS.some(function (x) { return cur[f].tiers[t.k][x.k] % 2 === 1; }); }) ? ' · <b style="color:#f59e0b">⚠ Có số lượt / điểm lẻ: chia đôi mất phần lẻ (vd 1 lượt → mỗi người 0)</b>' : '')
                    + (TP.TIERS.some(function (t) { return TP.hasItems(cur[f].tiers[t.k]); }) ? ' · Điểm lì xì + lượt <b>tự cộng</b> vào tài khoản ' + Math.round(TP.GRACE / 60000) + ' phút sau khi sơ đồ chốt kết quả.' : '');
            });
            var on = ['single', 'double'].filter(function (f) { return cur[f].on && TP.any(cur[f]); }).map(function (f) { return TP.FMT[f]; });
            $('tp-pv').innerHTML = on.length ? '✅ Thành viên đang thấy bảng giải thưởng: <b>' + on.join(' · ') + '</b>' + (dirty ? ' (sau khi lưu)' : '') : '<span class="text-muted">Thành viên chưa thấy bảng giải thưởng (bật "Hiện cho thành viên" và nhập tiền / điểm / lượt / quà).</span>';
        }
        card.addEventListener('input', changed); card.addEventListener('change', changed);

        A.save = function () {
            var c = read(), btn = $('tp-save');
            var bad = ['single', 'double'].some(function (f) { return c[f].on && !TP.any(c[f]); });
            if (bad) { toast('Thể thức đang bật nhưng chưa có hạng nào có tiền / điểm / lượt / quà.', 'warning'); return; }
            btn.disabled = true;
            REF.set({ single: c.single, double: c.double, note: c.note, updatedAt: Date.now(), updatedBy: me() }).then(function () {
                toast('Đã lưu tiền thưởng giải đấu. Thành viên thấy ngay ở trang Giải Đấu.');
                try { db.collection('admin_logs').add({ type: 'tournament_prize', action: 'save', by: me(), timestamp: Date.now(), single: c.single, double: c.double }).catch(function () {}); } catch (e) {}
            }).catch(function (e) { console.error(e); toast('Không lưu được tiền thưởng.', 'error'); }).then(function () { btn.disabled = false; });
        };

        // Người đạt giải + trạng thái chuyển khoản
        var hm = function (t) { var d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
        function itemOf(a) {
            if (!a.hasItems) return '';
            var g = TP.given()[a.id];
            if (g) return '<span class="tp-pay ok">✅ Đã cộng điểm / lượt</span>';
            return '<span class="tp-pay wait">⏳ ' + (Date.now() >= a.readyAt ? 'Đang cộng điểm / lượt...' : 'Tự cộng lúc ' + hm(a.readyAt)) + '</span>';
        }
        function payOf(a) {
            if (!(a.cash > 0)) return a.gift && !a.hasItems ? '<span class="tp-pay gift">🎁 Quà — BQT tự trao</span>' : '';
            var p = window.PayoutAdmin && PayoutAdmin.pays ? PayoutAdmin.pays['tournament_prize_' + a.id] : null;
            if (p && p.status === 'paid') return '<span class="tp-pay ok">✅ Đã chuyển</span>';
            if (p && p.status === 'rejected') return '<span class="tp-pay no">✖ Không trả</span>';
            return '<span class="tp-pay wait">⏳ Chờ chuyển</span>';
        }
        function renderRes() {
            var box = $('tp-res'); if (!box || !A.st) return;
            var list = A.st.awards.slice(), order = {}; TP.TIERS.forEach(function (t, i) { order[t.k] = i; });
            list.sort(function (a, b) { return (a.fmt === b.fmt ? 0 : a.fmt === 'single' ? -1 : 1) || order[a.tier] - order[b.tier]; });
            if (!list.length) {
                var br = A.st.brackets, st = ['single', 'double'].map(function (f) { var P = br[f] ? TP.places(br[f]) : null; return TP.FMT[f] + ': ' + (!br[f] ? 'chưa có sơ đồ' : P && P.done ? (A.st.prize[f].on ? 'đã kết thúc' : 'đã kết thúc (tiền thưởng đang tắt)') : 'chưa có Nhà Vô Địch'); });
                box.innerHTML = '<div class="tp-res-empty">Chưa có người đạt giải. Danh sách tự hiện khi sơ đồ có <b>Nhà Vô Địch</b>.<br><small>' + esc(st.join(' · ')) + '</small></div>';
                return;
            }
            var ico = {}; TP.TIERS.forEach(function (t) { ico[t.k] = t.i; });
            var sum = list.reduce(function (s, a) { return s + (a.cash || 0); }, 0), g = TP.given();
            var wait = list.filter(function (a) { return a.hasItems && !g[a.id]; });
            var giveBar = wait.length ? '<div class="tp-give"><span>⏳ <b>' + wait.length + '</b> khoản điểm / lượt chưa cộng'
                + (wait.some(function (a) { return Date.now() < a.readyAt; }) ? ' — tự cộng 10 phút sau lần sửa kết quả cuối (để kịp sửa nhầm)' : '') + '.</span>'
                + '<button type="button" class="btn btn-warning" id="tp-give-now" onclick="TourPrizeAdmin.giveNow(this)"><i class="fa-solid fa-gift mr-2"></i>Trao ngay</button></div>' : '';
            box.innerHTML = giveBar + '<div class="tp-res-list">' + list.map(function (a) {
                var pr = TP.parts(a), first = a.cash > 0 ? pr.shift() : '';
                return '<div class="tp-res-row"><span class="i">' + ico[a.tier] + '</span><span><b>' + esc(a.user) + '</b><small>' + esc(a.tierName + ' · ' + TP.FMT[a.fmt] + (a.fmt === 'double' ? ' · đội ' + a.team : '')) + '</small></span>'
                    + '<span class="amt">' + esc(first) + (pr.length ? '<small>' + esc(pr.join(' · ')) + '</small>' : '') + '</span><span class="st">' + payOf(a) + itemOf(a) + '</span></div>';
            }).join('') + '</div><p class="text-sm text-muted" style="margin: 10px 0 0;">Tổng tiền mặt: <b>' + TP.vnd(sum) + '</b> · ' + list.length + ' khoản. Chuyển khoản ở mục <a href="javascript:void(0)" onclick="UI.navigate(\'payout\')" style="color:#f59e0b;font-weight:700;">Trả thưởng</a> (nguồn 🏆 Giải Đấu).</p>';
        }
        A.giveNow = function (btn) {
            if (!A.st) return; if (btn) btn.disabled = true;
            TP.give(A.st.awards, me(), true).then(function (n) {
                toast(n ? 'Đã cộng điểm / lượt thưởng cho ' + n + ' khoản.' : 'Không có khoản nào cần cộng (máy khác đã cộng).', n ? 'success' : 'info');
                if (n) try { db.collection('admin_logs').add({ type: 'tournament_prize', action: 'give', by: me(), count: n, timestamp: Date.now() }).catch(function () {}); } catch (e) {}
                renderRes();
            }).catch(function () { toast('Không cộng được — kiểm tra kết nối.', 'error'); }).then(function () { if (btn) btn.disabled = false; });
        };
        // Tự cộng điểm / lượt cho mọi người đạt giải khi Ban Quản Trị đã đăng nhập trang này
        var autoOn = setInterval(function () {
            if (typeof State === 'undefined' || !State.currentUser) return;
            clearInterval(autoOn);
            TP.autoGive({ user: null, by: me, done: function (n) { toast('🏆 Đã tự cộng điểm / lượt thưởng Giải Đấu cho ' + n + ' khoản.'); renderRes(); } });
        }, 2000);
        var first = true;
        TP.watch(function (st) {
            A.st = st;
            var wasDirty = JSON.stringify(read()) !== JSON.stringify(A.saved);
            A.saved = st.prize;
            if (first || !wasDirty) fill(st.prize); else changed();   // đang sửa dở thì không ghi đè ô nhập
            first = false;
            renderRes();
        });
        setInterval(function () { if (card.offsetParent) renderRes(); }, 4000);   // trạng thái chuyển khoản (Trả thưởng)
    })();
    
