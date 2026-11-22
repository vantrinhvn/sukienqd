    window.LuckySchedule = (function () {
        /* ===== QUAY SỐ THEO GIỜ - NHIỀU LƯỢT (dùng chung admin.html / user.html / quays.html) =====
           settings/lucky_live.rounds = { r1: { label: 'Lượt 1', order: 1, at: ms, done, missed, doneAt, number }, r2: {...} }
           settings/lucky_round_presets.byId = { r1: 27, ... }  (số Admin chốt sẵn cho từng lượt, để trống = ngẫu nhiên)
           Tới giờ một lượt, trang nào đang mở cũng thử "nhận" lượt đó bằng transaction -> chỉ 1 máy quay.
           Kết quả ghi vào rollId/rollNumber/rollLabel + bật isLive -> mọi màn hình quays.html quay ra cùng một số. */
        var MISS_MS = 10 * 60 * 1000;   // trễ quá 10 phút (không ai online) -> bỏ lượt
        var rounds = {}, tried = {}, timer = null, unsub = null, subs = [];
        function getDb() { return (typeof db !== 'undefined') ? db : null; }
        function list() {
            return Object.keys(rounds || {}).map(function (id) { var r = Object.assign({ id: id }, rounds[id]); return r; })
                .filter(function (r) { return r && r.at; })
                .sort(function (a, b) { return a.at - b.at; });
        }
        function isPending(r) { return r && r.at && !r.done; }

        function claim(id, at) {
            var d = getDb(); if (!d) return Promise.resolve(null);
            var ref = d.collection('settings').doc('lucky_live'), preRef = d.collection('settings').doc('lucky_round_presets');
            return d.runTransaction(function (tx) {
                return Promise.all([tx.get(ref), tx.get(preRef)]).then(function (res) {
                    var data = res[0].exists ? res[0].data() : {}, r = (data.rounds || {})[id], now = Date.now();
                    if (!r || r.done || r.at !== at || now < r.at) return null;
                    var upd = {}; upd[id] = { done: true, doneAt: now };
                    if (now - r.at > MISS_MS) { upd[id].missed = true; tx.set(ref, { rounds: upd }, { merge: true }); return null; }
                    var pre = res[1].exists ? ((res[1].data().byId || {})[id]) : null;
                    pre = (pre != null && pre !== '') ? parseInt(pre, 10) : null;
                    var num = (pre >= 1 && pre <= 100) ? pre : (Math.floor(Math.random() * 100) + 1);
                    upd[id].missed = false; upd[id].number = num;
                    tx.set(ref, {
                        isLive: true, startedAt: data.isLive ? (data.startedAt || now) : now,
                        rollId: now, rollAt: now, rollNumber: num, rollLabel: r.label || null, rollRound: id,
                        rounds: upd
                    }, { merge: true });
                    return { num: num, label: r.label };
                });
            }).then(function (r) { if (r) return window.LuckySchedule.logHistory(r.num, 'schedule', r.label); });
        }

        function tick() {
            var now = Date.now();
            list().forEach(function (r) {
                var key = r.id + '@' + r.at;
                if (isPending(r) && now >= r.at + 20000 && !tried[key]) {   // máy chủ tự quay đúng giờ; trang chỉ quay dự phòng khi máy chủ trễ quá 20 giây
                    tried[key] = true;
                    claim(r.id, r.at).catch(function (e) { console.warn('LuckySchedule claim', e); setTimeout(function () { tried[key] = false; }, 2000); });
                }
            });
        }

        return {
            start: function () {
                var d = getDb(); if (!d || unsub) return;
                unsub = d.collection('settings').doc('lucky_live').onSnapshot(function (snap) {
                    rounds = snap && snap.exists ? (snap.data().rounds || {}) : {};
                    subs.forEach(function (f) { try { f(); } catch (e) {} });
                    tick();
                }, function (e) { console.warn('LuckySchedule', e); });
                timer = setInterval(tick, 1000);
            },
            stop: function () { if (unsub) { try { unsub(); } catch (e) {} unsub = null; } if (timer) { clearInterval(timer); timer = null; } },
            onChange: function (f) { subs.push(f); if (unsub) f(); },
            all: list,
            get: function () { return list().filter(isPending)[0] || null; },          // lượt sắp tới
            pending: function () { return !!this.get(); },
            remaining: function () { var r = this.get(); return r ? r.at - Date.now() : null; },
            total: function () { return list().length; },
            logHistory: function (num, source, label) {
                var d = getDb(); if (!d) return Promise.resolve();
                return d.collection('lucky_numbers').get().then(function (snap) {
                    var w = []; snap.forEach(function (doc) { var x = doc.data(); if (parseInt(x.number, 10) === num) w.push(x.user); });
                    var rec = { number: num, winners: w, timestamp: Date.now(), source: source || 'live' };
                    if (label) rec.round = label;
                    return d.collection('lucky_number_history').add(rec).then(function (ref) {   // trao thưởng theo cấu hình Admin (1 lần / phiên)
                        if (window.LuckyReward) window.LuckyReward.award(ref.id, num, { winners: w, ts: rec.timestamp, round: label || null, source: rec.source });
                        return ref;
                    });
                }).catch(function (e) { console.warn('LuckySchedule history', e); });
            },
            fmtTime: function (at) {
                var t = new Date(at), today = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
                var hm = p(t.getHours()) + ':' + p(t.getMinutes());
                return t.toDateString() === today.toDateString() ? hm + ' hôm nay' : hm + ' · ' + p(t.getDate()) + '/' + p(t.getMonth() + 1) + '/' + t.getFullYear();
            },
            fmtLeft: function (ms) {
                if (ms == null) return '';
                var s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60, p = function (n) { return String(n).padStart(2, '0'); };
                if (h >= 24) return Math.floor(h / 24) + ' ngày ' + (h % 24) + ' giờ';
                return (h ? h + ':' + p(m) : m) + ':' + p(x);
            }
        };
    })();
    
