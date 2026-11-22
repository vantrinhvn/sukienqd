    /* ===== QD FAST: thao tác dữ liệu nhanh (dùng chung mọi trang) =====
       1. Đọc tức thì: trang đang nghe trực tiếp (onSnapshot) cả 1 bộ sưu tập hoặc 1 tài liệu và đã đồng bộ với máy chủ
          -> các lệnh .get() trên chính dữ liệu đó lấy ngay trong bộ nhớ (~0 ms) thay vì hỏi lại máy chủ (~200-400 ms).
          Bộ nhớ chỉ giữ dữ liệu của các kênh đang nghe nên luôn là bản mới nhất. Không có trong bộ nhớ -> hỏi máy chủ như cũ.
       2. Đo thời gian mọi thao tác ghi (giao dịch / batch / set / update / add / delete), chậm hơn 1 giây -> cảnh báo trong Console.
          Xem thống kê: QDFast.stats()      Nhật ký từng thao tác: localStorage.setItem('qd_fast_log', '1')
       3. QDFast.ip(): lấy sẵn địa chỉ IP (điểm danh), nhớ 10 phút
       4. QDFast.pick(): chọn phần thưởng theo tỉ lệ (dùng chung Vòng Quay / Rút Lì Xì) */
    (function () {
        'use strict';
        if (window.QDFast || !window.firebase || !firebase.firestore) return;
        var F = firebase.firestore, W = window;
        var QF = W.QDFast = { live: Object.create(null), hits: 0, ops: [] };
        var verbose = false; try { verbose = localStorage.getItem('qd_fast_log') === '1'; } catch (e) {}
        var now = function () { return W.performance && performance.now ? performance.now() : Date.now(); };

        /* ---------- 1. Theo dõi kênh nghe trực tiếp ---------- */
        function reg(key) { var st = { key: key, ok: false }; (QF.live[key] = QF.live[key] || []).push(st); return st; }
        function unreg(st) {
            st.ok = false; var a = QF.live[st.key]; if (!a) return;
            var i = a.indexOf(st); if (i >= 0) a.splice(i, 1); if (!a.length) delete QF.live[st.key];
        }
        function isLive(key) { var a = QF.live[key]; if (a) for (var i = 0; i < a.length; i++) if (a[i].ok) return true; return false; }
        QF.isLive = isLive;
        function isObs(o) { return !!o && typeof o === 'object' && (typeof o.next === 'function' || typeof o.error === 'function' || typeof o.complete === 'function'); }
        function uncaught(err) { console.error('Uncaught Error in snapshot listener:', err); }
        function track(orig, keyOf) {
            return function () {
                var key = null; try { key = keyOf(this); } catch (e) {}
                if (!key) return orig.apply(this, arguments);
                var args = Array.prototype.slice.call(arguments);
                var i = (args[0] && typeof args[0] === 'object' && !isObs(args[0])) ? 1 : 0, a = args[i];
                var st = reg(key);
                var seen = function (s) { try { st.ok = !(s && s.metadata && s.metadata.fromCache); } catch (e) {} };
                if (typeof a === 'function') {
                    args[i] = function (s) { seen(s); return a.apply(this, arguments); };
                    var e = args[i + 1];
                    args[i + 1] = function (err) { unreg(st); if (typeof e === 'function') return e.apply(this, arguments); uncaught(err); };
                } else if (isObs(a)) {
                    var o = a;
                    args[i] = {
                        next: function (s) { seen(s); if (o.next) return o.next(s); },
                        error: function (err) { unreg(st); if (o.error) return o.error(err); uncaught(err); },
                        complete: function () { if (o.complete) return o.complete(); }
                    };
                } else { unreg(st); return orig.apply(this, arguments); }
                var un;
                try { un = orig.apply(this, args); } catch (ex) { unreg(st); throw ex; }
                return function () { unreg(st); return un.apply(this, arguments); };
            };
        }
        var CR = F.CollectionReference, QP = F.Query && F.Query.prototype, DP = F.DocumentReference && F.DocumentReference.prototype;
        function colPath(q) { return (CR && q instanceof CR) ? q.path : q.__qdP; }
        try {
            if (QP && CR && DP) {
                // Truy vấn tạo từ 1 bộ sưu tập (where / orderBy / limit ...) nhớ đường dẫn bộ sưu tập gốc
                ['where', 'orderBy', 'limit', 'limitToLast', 'startAt', 'startAfter', 'endAt', 'endBefore'].forEach(function (m) {
                    [QP, CR.prototype].forEach(function (P) {
                        if (!Object.prototype.hasOwnProperty.call(P, m) || typeof P[m] !== 'function') return;
                        var o = P[m];
                        P[m] = function () {
                            var r = o.apply(this, arguments);
                            try { var p = colPath(this); if (p && r && typeof r === 'object') r.__qdP = p; } catch (e) {}
                            return r;
                        };
                    });
                });
                // Chỉ kênh nghe CẢ bộ sưu tập (không lọc) mới chứa đủ dữ liệu để trả lời mọi truy vấn trên bộ sưu tập đó
                [QP, CR.prototype].forEach(function (P) {
                    var own = function (m) { return Object.prototype.hasOwnProperty.call(P, m) && typeof P[m] === 'function'; };
                    if (own('onSnapshot')) P.onSnapshot = track(P.onSnapshot, function (q) { return (q instanceof CR) ? 'c:' + q.path : null; });
                    if (own('get')) {
                        var qGet = P.get;
                        P.get = function (opt) {
                            if (opt && opt.source) return qGet.apply(this, arguments);
                            var self = this, p = null; try { p = colPath(this); } catch (e) {}
                            if (p && isLive('c:' + p)) {
                                return qGet.call(this, { source: 'cache' }).then(function (s) { QF.hits++; return s; }, function () { return qGet.call(self, opt); });
                            }
                            return qGet.apply(this, arguments);
                        };
                    }
                });
                DP.onSnapshot = track(DP.onSnapshot, function (d) { return 'd:' + d.path; });
                var dGet = DP.get;
                DP.get = function (opt) {
                    if (opt && opt.source) return dGet.apply(this, arguments);
                    var self = this, path = this.path, par = path.slice(0, path.lastIndexOf('/'));
                    if (isLive('d:' + path) || isLive('c:' + par)) {
                        return dGet.call(this, { source: 'cache' }).then(function (s) { QF.hits++; return s; }, function () { return dGet.call(self, opt); });
                    }
                    return dGet.apply(this, arguments);
                };
            }
        } catch (e) { console.warn('QDFast cache', e); }

        /* ---------- 2. Đo thời gian thao tác ghi ---------- */
        function note(label, t0, ok, err) {
            var ms = Math.round(now() - t0);
            QF.ops.push({ op: label, ms: ms, ok: ok, at: Date.now() }); if (QF.ops.length > 300) QF.ops.shift();
            if (!ok) console.warn('[QD Fast] ' + label + ' lỗi sau ' + ms + ' ms', err);
            else if (ms > 1000) console.warn('[QD Fast] ' + label + ' chậm: ' + ms + ' ms');
            else if (verbose) console.log('[QD Fast] ' + label + ': ' + ms + ' ms');
        }
        function timed(P, m, label) {
            if (!P || typeof P[m] !== 'function') return;
            var o = P[m];
            P[m] = function () {
                var t0 = now(), r = o.apply(this, arguments), lb = label(this, arguments);
                if (r && typeof r.then === 'function') r.then(function () { note(lb, t0, true); }, function (e) { note(lb, t0, false, e); });
                return r;
            };
            P[m].__qdOrig = o;   // bản gốc không đo giờ (dùng cho giao dịch mở sẵn chờ người dùng bấm)
        }
        try {
            var path = function (x) { try { return x.path; } catch (e) { return '?'; } };
            timed(F.Firestore && F.Firestore.prototype, 'runTransaction', function () { return 'giao dịch'; });
            timed(F.WriteBatch && F.WriteBatch.prototype, 'commit', function () { return 'batch'; });
            ['set', 'update', 'delete'].forEach(function (m) { timed(DP, m, function (d) { return m + ' ' + path(d); }); });
            timed(CR && CR.prototype, 'add', function (c) { return 'add ' + path(c); });
        } catch (e) { console.warn('QDFast timing', e); }
        QF.stats = function () {
            var g = {};
            QF.ops.forEach(function (o) { var k = o.op.split(' ')[0] === 'giao' ? 'giao dịch' : o.op.split(' ')[0]; (g[k] = g[k] || []).push(o.ms); });
            var rows = Object.keys(g).map(function (k) {
                var a = g[k].slice().sort(function (x, y) { return x - y; }), sum = a.reduce(function (s, x) { return s + x; }, 0);
                return { 'thao tác': k, 'số lần': a.length, 'trung bình (ms)': Math.round(sum / a.length), 'chậm nhất (ms)': a[a.length - 1], 'quá 1 giây': a.filter(function (x) { return x > 1000; }).length };
            });
            if (console.table) console.table(rows);
            return { reads_from_memory: QF.hits, ops: rows };
        };

        /* ---------- 3. IP lấy sẵn (điểm danh) ---------- */
        var ipVal = null, ipAt = 0, ipP = null;
        QF.ip = function (fresh) {
            if (!fresh && ipVal && Date.now() - ipAt < 600000) return Promise.resolve(ipVal);
            if (ipP) return ipP;
            var ctrl = W.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 5000);
            ipP = fetch('https://api.ipify.org?format=json', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
                .then(function (r) { return r.json(); })
                .then(function (j) { ipVal = j.ip; ipAt = Date.now(); return ipVal; })
                .finally(function () { clearTimeout(to); ipP = null; });
            return ipP;
        };

        /* ---------- 4. Chọn phần thưởng theo tỉ lệ (chỉ trong các ô còn số lượng) ---------- */
        QF.pick = function (prizes, counts) {
            counts = counts || {};
            var avail = []; (prizes || []).forEach(function (p, i) { if (p.chance > 0 && (p.qty == null || (counts[p.id] || 0) < p.qty)) avail.push(i); });
            if (!avail.length) return -1;
            var total = 0; avail.forEach(function (i) { total += prizes[i].chance; });
            var r = Math.random() * total, sum = 0;
            for (var k = 0; k < avail.length; k++) { sum += prizes[avail[k]].chance; if (r <= sum) return avail[k]; }
            return avail[avail.length - 1];
        };
        // Ô có số lượng mà còn ít (<= dư) -> cần đọc số đã trúng chính xác trên máy chủ để không phát vượt
        QF.nearOut = function (p, counts, extra) { return !!p && p.qty != null && p.qty - ((counts || {})[p.id] || 0) <= (extra == null ? 3 : extra); };
    })();
    
