    /* ===== THƯỞNG GIẢI ĐẤU (bản 24 + 25, dùng chung admin + user) =====
       settings/tournament_prize : { single: { on, split, tiers }, double: { on, split, tiers }, note, updatedAt, updatedBy }
         tiers = { champ, second, third, fourth, top8 } mỗi hạng { cash (VNĐ), points, spins, tickets, conThrows, gift (quà khác, chữ) }
         split (Giải Đôi): 'each' = mỗi thành viên nhận đủ · 'team' = tính cho cả đội, chia đều (tiền làm tròn xuống bội 1.000đ, lượt / điểm lấy phần nguyên)
       Người nhận lấy từ sơ đồ (settings/tournament_bracket, tournament_bracket_double), chỉ chốt khi đã có Nhà Vô Địch:
         Vô Địch · Á Quân · Hạng Ba (thắng trận tranh hạng 3; không có trận này thì 2 đội thua Bán Kết đồng Hạng Ba) · Hạng Tư · Tứ Kết (4 đội dừng ở Tứ Kết)
       Mã mỗi khoản = {thể thức}_{createdAt sơ đồ}_{hạng}_{tài khoản}
       - Tiền mặt -> Admin > Trả thưởng (nguồn "🏆 Giải Đấu", {NGUON} = GD), payouts/tournament_prize_{mã}
       - Điểm lì xì + lượt (bản 25) -> TỰ CỘNG vào accounts sau khi sơ đồ không đổi kết quả 10 phút (để BQT kịp sửa nhầm; Admin bấm "Trao ngay" để cộng luôn).
         Mỗi khoản cộng ĐÚNG 1 LẦN trong 1 giao dịch: tournament_rewards/{mã} = { user, fmt, tier, items{}, prize, at, by } + point_history (nếu có điểm).
         Máy chạy: trang Admin (mọi người đạt giải) và trang thành viên (chỉ khoản của chính mình). */
    (function () {
        'use strict';
        if (window.QDTourPrize) return;
        var TIERS = [
            { k: 'champ', i: '🏆', l: 'Vô Địch' },
            { k: 'second', i: '🥈', l: 'Á Quân' },
            { k: 'third', i: '🥉', l: 'Hạng Ba' },
            { k: 'fourth', i: '🎖️', l: 'Hạng Tư' },
            { k: 'top8', i: '🎗️', l: 'Tứ Kết' }
        ];
        // Vật phẩm cộng thẳng vào tài khoản (cùng tên trường với accounts)
        var ITEMS = [
            { k: 'points', i: '💰', l: 'Điểm lì xì', u: 'điểm lì xì' },
            { k: 'spins', i: '🎡', l: 'Lượt vòng quay', u: 'lượt quay' },
            { k: 'tickets', i: '🧧', l: 'Lượt rút lì xì', u: 'lượt rút lì xì' },
            { k: 'conThrows', i: '🎯', l: 'Lượt ném còn', u: 'lượt ném còn' }
        ];
        var GRACE = 10 * 60000;   // kết quả sơ đồ đứng yên 10 phút mới tự cộng lượt / điểm
        var TM = {}; TIERS.forEach(function (t) { TM[t.k] = t; });
        var FMT = { single: 'Giải Đơn', double: 'Giải Đôi' };
        function num(v, max) { v = Math.floor(Number(v) || 0); return v > 0 ? Math.min(v, max || 1000000000) : 0; }
        function normTier(o) {
            o = o || {}; var t = { cash: num(o.cash), gift: String(o.gift || '').replace(/\s+/g, ' ').trim().slice(0, 80) };
            ITEMS.forEach(function (x) { t[x.k] = num(o[x.k], 1000000); });
            return t;
        }
        function normFmt(c) {
            c = c || {}; var src = c.tiers || {}, t = {};
            TIERS.forEach(function (x) { t[x.k] = normTier(src[x.k]); });
            return { on: c.on === true, split: c.split === 'team' ? 'team' : 'each', tiers: t };
        }
        function norm(d) { d = d || {}; return { single: normFmt(d.single), double: normFmt(d.double), note: String(d.note || '').trim().slice(0, 200), updatedAt: d.updatedAt || 0 }; }
        function hasItems(t) { return !!t && ITEMS.some(function (x) { return t[x.k] > 0; }); }
        function has(t) { return !!t && (t.cash > 0 || !!t.gift || hasItems(t)); }
        function any(pc) { return !!pc && pc.on && TIERS.some(function (x) { return has(pc.tiers[x.k]); }); }
        function vnd(n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; }
        function share(cash, n, split) { return split === 'team' && n > 1 ? Math.floor(cash / n / 1000) * 1000 : cash; }
        function shareTier(t, n, split) {   // phần của 1 người
            var o = { cash: share(t.cash, n, split), gift: t.gift };
            ITEMS.forEach(function (x) { o[x.k] = split === 'team' && n > 1 ? Math.floor(t[x.k] / n) : t[x.k]; });
            return o;
        }
        // "+100 điểm lì xì · +2 lượt quay"
        function itemsText(t, sep) { var a = []; ITEMS.forEach(function (x) { if (t && t[x.k] > 0) a.push('+' + Number(t[x.k]).toLocaleString('vi-VN') + ' ' + x.u); }); return a.join(sep || ' · '); }
        // Các phần của 1 hạng để hiện: [tiền, vật phẩm..., quà khác]
        function parts(t) {
            var a = []; if (!t) return a;
            if (t.cash > 0) a.push(vnd(t.cash));
            ITEMS.forEach(function (x) { if (t[x.k] > 0) a.push('+' + Number(t[x.k]).toLocaleString('vi-VN') + ' ' + x.u); });
            if (t.gift) a.push('🎁 ' + t.gift);
            return a;
        }
        function size(cfg) { var n = +(cfg && cfg.size) || 8; return [4, 8, 16, 32, 64].indexOf(n) >= 0 ? n : 8; }
        function hasThirdMatch(cfg) { return !!(cfg && cfg.third) && size(cfg) >= 4; }
        function slots(cfg) {
            var n = size(cfg), t3 = hasThirdMatch(cfg), o = { champ: 1, second: 1, third: t3 ? 1 : 2 };
            if (t3) o.fourth = 1;
            if (n >= 8) o.top8 = 4;
            return o;
        }
        function tierName(k, cfg) { return k === 'third' && cfg && !hasThirdMatch(cfg) ? 'Đồng Hạng Ba' : (TM[k] || {}).l || k; }
        function places(cfg) {
            var Q = window.QDB; if (!Q || !cfg || !(cfg.entries || []).some(Boolean)) return null;
            var C; try { C = Q.compute(cfg); } catch (e) { return null; }
            var out = { done: !!(C.champion && C.champion.t === 'e'), live: C.played > 0, list: [] };
            var put = function (k, s) { if (s && s.t === 'e' && s.e) out.list.push({ k: k, e: s.e }); };
            if (!out.done) return out;
            put('champ', C.champion); put('second', C.runnerUp);
            if (C.third) { put('third', C.thirdPlace); if (C.third.decided === 'play') put('fourth', C.third.sides[1 - C.third.w]); }
            else if (C.R >= 2) C.rounds[C.R - 2].forEach(function (m) { if (m.decided === 'play') put('third', m.sides[1 - m.w]); });
            if (C.R >= 3) C.rounds[C.R - 3].forEach(function (m) { if (m.decided === 'play') put('top8', m.sides[1 - m.w]); });
            return out;
        }
        // Tên giải (Trả thưởng đọc số tiền ở đầu chuỗi)
        function prizeText(fmt, cfg, k, p) {
            var head = p.cash > 0 ? p.cash.toLocaleString('vi-VN') + ' VNĐ' : '', rest = itemsText(p), extra = [head, rest, p.gift].filter(Boolean).join(' + ');
            return extra + ' · Giải Đấu: ' + tierName(k, cfg) + ' ' + FMT[fmt] + (cfg && cfg.title ? ' (' + cfg.title + ')' : '');
        }
        function awards(fmt, cfg, pc) {
            if (!pc || !pc.on) return [];
            var P = places(cfg); if (!P || !P.done) return [];
            var res = [], key = fmt + '_' + (cfg.createdAt || 0), ts = cfg.doneAt || cfg.updatedAt || 0;
            P.list.forEach(function (p) {
                var t = pc.tiers[p.k]; if (!has(t)) return;
                var mem = (p.e.members || []).filter(function (m) { return m && m.u; }), my = shareTier(t, mem.length, pc.split), items = {};
                ITEMS.forEach(function (x) { if (my[x.k] > 0) items[x.k] = my[x.k]; });
                mem.forEach(function (m) {
                    var o = { id: key + '_' + p.k + '_' + m.u, user: m.u, fmt: fmt, tier: p.k, tierName: tierName(p.k, cfg), team: p.e.name || m.u,
                        cash: my.cash, gift: my.gift, items: items, hasItems: Object.keys(items).length > 0, ts: ts, readyAt: (cfg.updatedAt || 0) + GRACE,
                        prize: prizeText(fmt, cfg, p.k, my) };
                    ITEMS.forEach(function (x) { o[x.k] = my[x.k]; });   // để parts() đọc được
                    res.push(o);
                });
            });
            return res;
        }

        /* ---------- Nghe dữ liệu (1 lần cho cả trang) ---------- */
        var W = { prize: null, raw: {}, seen: {}, subs: [], cbs: [], last: null, given: {}, givenFor: undefined };
        function D() { try { return typeof db !== 'undefined' ? db : firebase.firestore(); } catch (e) { return null; } }
        function brackets() { var a = W.raw.single, b = W.raw.double; return { single: a && a.format !== 'double' ? a : null, double: b || (a && a.format === 'double' ? a : null) }; }
        function emit() {
            if (!(W.seen.prize && W.seen.single && W.seen.double)) return;
            var br = brackets(), pc = norm(W.prize), all = [];
            ['single', 'double'].forEach(function (f) { if (br[f]) all = all.concat(awards(f, br[f], pc[f])); });
            W.last = { prize: pc, brackets: br, awards: all, given: W.given };
            W.cbs.forEach(function (cb) { try { cb(W.last); } catch (e) { console.error('QDTourPrize', e); } });
            autoRun();
        }
        function watch(cb) {
            if (cb) { W.cbs.push(cb); if (W.last) try { cb(W.last); } catch (e) {} }
            if (W.subs.length) return;
            var d = D();
            if (!d) { W.seen = { prize: 1, single: 1, double: 1 }; emit(); return; }
            var on = function (k, doc) {
                W.subs.push(d.collection('settings').doc(doc).onSnapshot(function (s) {
                    var v = s.exists ? s.data() : null; if (k === 'prize') W.prize = v; else W.raw[k] = v; W.seen[k] = 1; emit();
                }, function (e) { console.warn('tournament_prize', doc, e); W.seen[k] = 1; emit(); }));
            };
            on('prize', 'tournament_prize'); on('single', 'tournament_bracket'); on('double', 'tournament_bracket_double');
        }

        /* ---------- Cộng điểm / lượt (bản 25) ---------- */
        // Theo dõi khoản đã cộng: user = null -> tất cả (Admin) · 'abc' -> chỉ của tài khoản đó
        var gsub = null;
        function watchGiven(user) {
            if (W.givenFor === user) return; W.givenFor = user;
            if (gsub) { try { gsub(); } catch (e) {} gsub = null; }
            W.given = {}; var d = D(); if (!d || user === '') { emit(); return; }
            var q = d.collection('tournament_rewards'); if (user) q = q.where('user', '==', user);
            gsub = q.onSnapshot(function (s) { var g = {}; s.forEach(function (x) { g[x.id] = x.data(); }); W.given = g; emit(); }, function (e) { console.warn('tournament_rewards', e); });
        }
        var busy = {}, fail = {}, auto = null;
        function giveOne(a, by) {
            var d = D(), FV = window.firebase && firebase.firestore && firebase.firestore.FieldValue;
            if (!d || !FV || !a || !a.hasItems || busy[a.id] || W.given[a.id] || Date.now() - (fail[a.id] || 0) < 300000) return Promise.resolve(false);
            busy[a.id] = true;
            return d.collection('accounts').where('user', '==', a.user).limit(1).get().then(function (q) {
                if (q.empty) throw new Error('Không tìm thấy tài khoản ' + a.user);
                var aref = q.docs[0].ref, rref = d.collection('tournament_rewards').doc(a.id);
                return d.runTransaction(function (tx) {
                    return tx.get(rref).then(function (ex) {
                        if (ex.exists) return false;   // máy khác đã cộng
                        var now = Date.now(), up = {};
                        ITEMS.forEach(function (x) { if (a.items[x.k] > 0) up[x.k] = FV.increment(a.items[x.k]); });
                        tx.set(rref, { user: a.user, fmt: a.fmt, tier: a.tier, team: a.team, items: a.items, prize: a.prize, at: now, by: by || '' });
                        tx.update(aref, up);
                        if (a.items.points > 0) tx.set(d.collection('point_history').doc(), { user: a.user, action: 'add', detail: 'Giải Đấu: ' + a.tierName + ' ' + FMT[a.fmt], pointsChanged: a.items.points, timestamp: now });
                        return true;
                    });
                });
            }).then(function (ok) { busy[a.id] = false; if (ok) W.given[a.id] = { at: Date.now() }; return ok; }, function (e) { busy[a.id] = false; fail[a.id] = Date.now(); console.warn('Trao thưởng giải đấu', a.id, e); throw e; });
        }
        // Cộng tuần tự các khoản (force = bỏ qua 10 phút chờ)
        function give(list, by, force) {
            var now = Date.now(), todo = (list || []).filter(function (a) { return a.hasItems && !W.given[a.id] && (force || now >= a.readyAt); }), n = 0;
            return todo.reduce(function (p, a) { return p.then(function () { return giveOne(a, by).then(function (ok) { if (ok) n++; }, function () {}); }); }, Promise.resolve()).then(function () { return n; });
        }
        function autoRun() {
            if (!auto || !W.last || W.givenFor === undefined) return;
            var u = auto.user; if (u === '') return;
            var list = W.last.awards.filter(function (a) { return a.hasItems && (!u || a.user === u); });
            if (list.length) give(list, auto.by()).then(function (n) { if (n && auto.done) auto.done(n); });
        }
        // Bật tự cộng: opt = { user: null (Admin, mọi người) | 'tên' (chỉ mình), by: fn -> tên máy chạy, done: fn(n) }
        function autoGive(opt) {
            auto = opt; watchGiven(opt.user == null ? null : opt.user);
            if (!auto.timer) auto.timer = setInterval(autoRun, 60000);
            watch(); autoRun();
        }

        window.QDTourPrize = { TIERS: TIERS, ITEMS: ITEMS, FMT: FMT, GRACE: GRACE, norm: norm, has: has, hasItems: hasItems, any: any, vnd: vnd, share: share, shareTier: shareTier,
            itemsText: itemsText, parts: parts, slots: slots, tierName: tierName, hasThirdMatch: hasThirdMatch, places: places, awards: awards,
            watch: watch, watchGiven: watchGiven, give: give, autoGive: autoGive, given: function () { return W.given; }, current: function () { return W.last; } };
    })();
    
