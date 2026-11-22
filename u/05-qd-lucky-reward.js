    /* ===== THƯỞNG QUAY SỐ MAY MẮN (dùng chung admin.html / user.html / quays.html) =====
       settings/lucky_reward_config = { isEnabled, since, mode: 'each' | 'split', main: { points, spins, tickets, conThrows }, cash,
                                        nearOn, near: { ... }, nearCash, updatedAt, updatedBy }
       Mỗi phiên quay (lucky_number_history/{id}) được trao ĐÚNG 1 LẦN trong 1 giao dịch:
         lucky_rewards/{id} = { number, histId, winners[], near[], all[], each{}, eachNear{}, cash, nearCash, mode, at, wonAt, round, source }
         + cộng điểm / lượt vào accounts, ghi point_history, đánh dấu lucky_number_history.rewarded
       Tiền mặt không cộng tự động: hiện ở Admin > Trả thưởng (nguồn "Quay Số") để BQT chuyển khoản. */
    window.LuckyReward = (function () {
        'use strict';
        var KEYS = [['points', 'Điểm lì xì', 'điểm lì xì'], ['spins', 'Lượt vòng quay', 'lượt quay'], ['tickets', 'Lượt rút lì xì', 'lượt rút lì xì'], ['conThrows', 'Lượt ném còn', 'lượt ném còn']];
        function D() { try { if (typeof db !== 'undefined' && db) return db; } catch (e) {} try { if (window.firebase && firebase.apps.length) return firebase.firestore(); } catch (e) {} return null; }
        var n0 = function (v) { v = parseInt(v, 10); return isNaN(v) || v < 0 ? 0 : Math.min(v, 1e9); };
        var pad = function (x) { return String(x).padStart(2, '0'); };
        var vnd = function (x) { return Number(x || 0).toLocaleString('vi-VN'); };
        function norm(c) {
            c = c || {}; var main = {}, near = {};
            KEYS.forEach(function (k) { main[k[0]] = n0((c.main || {})[k[0]]); near[k[0]] = n0((c.near || {})[k[0]]); });
            return { on: c.isEnabled === true, since: +c.since || 0, mode: c.mode === 'split' ? 'split' : 'each', main: main, cash: n0(c.cash), nearOn: c.nearOn === true, near: near, nearCash: n0(c.nearCash) };
        }
        function empty(r, cash) { return !cash && KEYS.every(function (k) { return !(r[k[0]] > 0); }); }
        /* Chia giải: 'each' = mỗi người nhận đủ · 'split' = chia đều tổng giải (tiền làm tròn xuống bội 1.000đ) */
        function share(part, cash, count, mode) {
            var o = {}; KEYS.forEach(function (k) { var v = part[k[0]] || 0; o[k[0]] = mode === 'split' && count > 1 ? Math.floor(v / count) : v; });
            var c = cash || 0; if (mode === 'split' && count > 1) { var e = Math.floor(c / count); c = e >= 1000 ? Math.floor(e / 1000) * 1000 : e; }
            o.cash = c; return o;
        }
        function text(r, sep) {
            if (!r) return ''; var a = [];
            if (r.cash > 0) a.push(vnd(r.cash) + 'đ tiền mặt');
            KEYS.forEach(function (k) { if (r[k[0]] > 0) a.push('+' + vnd(r[k[0]]) + ' ' + k[2]); });
            return a.join(sep || ' · ');
        }
        /* Tên giải cho Túi đồ / Trả thưởng: tiền đứng đầu để đọc được số tiền */
        function prize(r, num, near) {
            var tail = (near ? 'Quay Số (giải phụ, số ' : 'Quay Số May Mắn (số ') + pad(num) + ')';
            if (r && r.cash > 0) { var rest = text(Object.assign({}, r, { cash: 0 })); return vnd(r.cash) + ' VNĐ · ' + tail + (rest ? ' · ' + rest : ''); }
            return tail + ': ' + (text(r) || 'không có thưởng');
        }
        function accountRefs(users) {
            var d = D(), out = {}, chunks = [];
            for (var i = 0; i < users.length; i += 10) chunks.push(users.slice(i, i + 10));
            return Promise.all(chunks.map(function (c) { return d.collection('accounts').where('user', 'in', c).get().then(function (q) { q.forEach(function (x) { out[x.data().user] = x.ref; }); }); })).then(function () { return out; });
        }
        /* Trao thưởng cho 1 phiên quay. opt = { winners (đúng danh sách đã ghi lịch sử), ts, round, source } */
        function award(histId, num, opt) {
            opt = opt || {}; var d = D(); num = parseInt(num, 10);
            if (!d || !histId || !(num >= 1 && num <= 100) || !firebase.firestore.FieldValue) return Promise.resolve(null);
            var FV = firebase.firestore.FieldValue;
            return d.collection('settings').doc('lucky_reward_config').get().then(function (s) {
                var c = norm(s.exists ? s.data() : null), ts = +opt.ts || Date.now();
                if (!c.on || (c.since && ts < c.since - 60000)) return null;
                if (empty(c.main, c.cash) && (!c.nearOn || empty(c.near, c.nearCash))) return null;
                return d.collection('lucky_numbers').get().then(function (ls) {
                    var main = [], near = [];
                    ls.forEach(function (x) { var v = x.data(), k = parseInt(v.number, 10); if (!v.user || isNaN(k)) return; if (k === num) main.push(v.user); else if (c.nearOn && Math.abs(k - num) === 1) near.push(v.user); });
                    if (Array.isArray(opt.winners)) main = opt.winners.slice();
                    near = near.filter(function (u) { return main.indexOf(u) < 0; });
                    var users = main.concat(near);
                    return accountRefs(users).then(function (refs) {
                        var rref = d.collection('lucky_rewards').doc(histId);
                        return d.runTransaction(function (tx) {
                            return tx.get(rref).then(function (ex) {
                                if (ex.exists) return null;   // đã trao rồi (máy khác trao trước)
                                var now = Date.now(), each = share(c.main, c.cash, main.length, c.mode), eachNear = share(c.near, c.nearCash, near.length, c.mode);
                                var rec = { number: num, histId: histId, winners: main, near: near, all: users, each: each, eachNear: c.nearOn ? eachNear : null,
                                    cash: main.length ? each.cash : 0, nearCash: near.length ? eachNear.cash : 0, mode: c.mode, at: now, wonAt: ts, round: opt.round || null, source: opt.source || '' };
                                tx.set(rref, rec);
                                tx.set(d.collection('lucky_number_history').doc(histId), { rewarded: true, rewardText: text(each), nearUsers: near, nearText: c.nearOn ? text(eachNear) : '' }, { merge: true });
                                var give = function (u, r, isNear) {
                                    var ref = refs[u]; if (!ref) return; var up = {}, any = false;
                                    KEYS.forEach(function (k) { if (r[k[0]] > 0) { up[k[0]] = FV.increment(r[k[0]]); any = true; } });
                                    if (any) tx.update(ref, up);
                                    if (r.points > 0) tx.set(d.collection('point_history').doc(), { user: u, action: 'add', detail: 'Quay Số May Mắn: ' + (isNear ? 'giải phụ (lệch 1 số) — số ' : 'trúng số ') + pad(num), pointsChanged: r.points, timestamp: now });
                                };
                                main.forEach(function (u) { give(u, each, false); });
                                near.forEach(function (u) { give(u, eachNear, true); });
                                return rec;
                            });
                        });
                    });
                });
            }).catch(function (e) { console.warn('LuckyReward', e); return null; });
        }
        return { KEYS: KEYS, norm: norm, share: share, text: text, prize: prize, award: award, empty: empty };
    })();
    
