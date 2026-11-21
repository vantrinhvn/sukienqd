/* =====================================================================================
   QD-DB — bộ chuyển thay thư viện Firebase Firestore (bản "compat" 10.x) bằng máy chủ riêng trên VPS.
   Trang web vẫn gọi y như cũ: firebase.initializeApp(...), firebase.firestore().collection('x').where(...).onSnapshot(...),
   FieldValue.increment / arrayUnion / arrayRemove / delete / serverTimestamp, batch(), runTransaction()...
   Máy chủ: vps/server.js (WebSocket /ws). Đổi máy chủ để thử: localStorage.qd_server = 'ws://127.0.0.1:8787/ws'
   ===================================================================================== */
(function () {
    'use strict';
    if (window.firebase && window.firebase.__qd) return;
    var DEFAULT = 'wss://103-77-243-172.sslip.io/ws';
    var URL_ = (function () { try { return window.QD_SERVER || localStorage.getItem('qd_server') || DEFAULT; } catch (e) { return window.QD_SERVER || DEFAULT; } })();

    /* ---------------------------------- KẾT NỐI ---------------------------------- */
    var ws = null, open = false, seq = 0, pend = {}, queue = [], subs = {}, sidN = 0, retry = 0, retryT = 0, closedByUser = false, everOpen = false;
    function err(code, message) { var e = new Error(message || code); e.code = code; e.name = 'FirebaseError'; return e; }
    function connect() {
        if (closedByUser || (ws && (ws.readyState === 0 || ws.readyState === 1))) return;
        try { ws = new WebSocket(URL_); } catch (e) { return later(); }
        ws.onopen = function () {
            open = true; retry = 0; everOpen = true; clearTimeout(barT); barT = 0; showBar(false);
            var tk = tok(); if (tk) sendAuth(tk);   // xác thực TRƯỚC mọi lệnh khác (máy chủ xử lý theo thứ tự)
            Object.keys(subs).forEach(function (k) { var s = subs[k]; s.resent = true; raw({ op: 'sub', sid: s.sid, path: s.path, q: s.q }); });   // nghe lại sau khi mất mạng
            var q = queue; queue = []; q.forEach(function (m) { raw(m); });
        };
        ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (x) { return; } onMsg(m); };
        ws.onclose = function () {
            open = false; ws = null;
            watchBar();
            Object.keys(pend).forEach(function (k) { var p = pend[k]; if (p.m.op !== 'commit' || p.m.cid) queue.push(p.m); });   // gửi lại khi có mạng (ghi có mã cid -> máy chủ không ghi trùng)
            later();
        };
        ws.onerror = function () {};
    }
    /* Thanh báo "chưa kết nối được máy chủ" (sau 6 giây vẫn chưa nối được) -> người dùng biết đang lỗi kết nối, bấm để thử lại ngay */
    var barT = 0, bar = null, downAt = Date.now();
    function showBar(on) {
        try {
            if (!on) { if (bar) { bar.remove(); bar = null; } return; }
            if (bar || !document.body) return;
            bar = document.createElement('div'); bar.id = 'qd-net-bar';
            bar.style.cssText = 'position:fixed;left:50%;top:max(8px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483646;background:#7f1d1d;color:#fff;font:600 13px/1.35 system-ui,sans-serif;padding:8px 14px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.35);max-width:92vw;text-align:center;cursor:pointer';
            bar.textContent = (navigator.onLine === false ? '📵 Máy đang mất mạng' : '⚠️ Chưa kết nối được máy chủ QĐ') + ' — đang thử lại… (bấm để thử ngay)';
            if (navigator.onLine !== false) diag();
            bar.onclick = function () { retry = 0; connect(); };
            document.body.appendChild(bar);
        } catch (e) {}
    }
    function diag() {   // phân biệt: không tới được địa chỉ máy chủ (mạng / DNS / chứng chỉ) hay máy chủ chạy mà WebSocket bị chặn
        var http = URL_.replace(/^ws/, 'http').replace(/\/ws$/, ''), t0 = Date.now();
        fetch(http + '/health', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
            if (bar && !open) bar.textContent = '⚠️ Máy chủ QĐ đang chạy (' + (j.ver || '?') + ', ' + (Date.now() - t0) + ' ms) nhưng kênh kết nối trực tiếp (WebSocket) bị chặn — đang thử lại… (bấm để thử ngay)';
            try { console.warn('[qd-db] /health OK nhưng WebSocket không mở được', j); } catch (e) {}
        }).catch(function (e) {
            if (bar && !open) bar.textContent = '⚠️ Không mở được địa chỉ máy chủ QĐ (' + http.replace(/^https?:\/\//, '') + ') — mạng / DNS chặn hoặc máy chủ tắt. Đang thử lại…';
            try { console.warn('[qd-db] không tới được ' + http + '/health', e); } catch (x) {}
        });
    }
    function watchBar() { if (barT || bar) return; barT = setTimeout(function () { barT = 0; if (!open) showBar(true); }, 6000); }
    watchBar();
    function later() { if (closedByUser) return; clearTimeout(retryT); retryT = setTimeout(connect, Math.min(15000, 400 * Math.pow(1.7, retry++))); }
    function raw(m) {
        if (open && ws && ws.readyState === 1) { try { ws.send(JSON.stringify(m)); return; } catch (e) {} }
        if (m.op !== 'sub') queue.push(m);   // lệnh nghe sẽ tự gửi lại khi kết nối xong
        connect();
    }
    /* ---------- Xác thực: đăng nhập đúng -> máy chủ cấp mã (60 ngày), lưu trên máy, tự gửi lại mỗi lần kết nối ---------- */
    var AUTH = { u: '', role: '' };
    function tok(v) { try { if (v === null) localStorage.removeItem('qd_tok'); else if (v) localStorage.setItem('qd_tok', v); return localStorage.getItem('qd_tok') || ''; } catch (e) { return ''; } }
    function link(u) {   // app Android: đưa mã xác thực cho dịch vụ nền của app (nhận tin nhắn / cuộc gọi khi đã tắt app)
        try { var Q = window.QDNative; if (Q && typeof Q.linkSet === 'function' && !(Q.isBubble && Q.isBubble())) Q.linkSet(u ? URL_ : '', u ? tok() : '', u || ''); } catch (e) {}
    }
    function sendAuth(t) {
        var m = { op: 'auth', token: t, r: ++seq };
        pend[m.r] = { ok: function (x) { AUTH.u = x.u; AUTH.role = x.role; link(x.u); }, no: function (e) { if (e && e.code === 'unauthenticated') { tok(null); AUTH.u = AUTH.role = ''; link(''); } }, m: m };
        try { ws.send(JSON.stringify(m)); } catch (e) {}
    }
    function login(u, p) { return req({ op: 'login', u: u, p: p }).then(function (x) { tok(x.token); AUTH.u = x.u; AUTH.role = x.role; link(x.u); return x; }); }
    function req(m) { return new Promise(function (ok, no) { m.r = ++seq; pend[m.r] = { ok: ok, no: no, m: m }; raw(m); }); }
    function onMsg(m) {
        if (m.re) { var p = pend[m.re]; if (!p) return; delete pend[m.re]; if (m.ok) p.ok(m); else p.no(err(m.code || 'unknown', m.message)); return; }
        var s = subs[m.sid]; if (!s) return;
        if (m.ev === 'doc') s.onDoc(m);
        else if (m.ev === 'q') s.onQuery(m);
        else if (m.ev === 'err') { delete subs[m.sid]; s.onErr(err(m.code, m.message)); }
    }
    ['online', 'focus'].forEach(function (ev) { window.addEventListener(ev, function () { retry = 0; connect(); }); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { retry = 0; connect(); } });

    /* ---------------------------------- GIÁ TRỊ ---------------------------------- */
    function FV(o) { this.__fv = o; }
    function enc(v) {   // dữ liệu ghi -> JSON gửi máy chủ
        if (v instanceof FV) return v.__fv;
        if (v === undefined) return undefined;
        if (v instanceof Date) return v.getTime();
        if (v instanceof Timestamp) return v.toMillis();
        if (v instanceof DocRef) return v.path;
        if (Array.isArray(v)) return v.map(function (x) { var e = enc(x); return e === undefined ? null : e; });
        if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { var e = enc(v[k]); if (e !== undefined) o[k] = e; }); return o; }
        if (typeof v === 'number' && !isFinite(v)) return null;
        return v;
    }
    function clone(d) { return d == null ? d : JSON.parse(JSON.stringify(d)); }
    function Timestamp(sec, ns) { this.seconds = sec; this.nanoseconds = ns || 0; }
    Timestamp.prototype.toMillis = function () { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); };
    Timestamp.prototype.toDate = function () { return new Date(this.toMillis()); };
    Timestamp.now = function () { return Timestamp.fromMillis(Date.now()); };
    Timestamp.fromMillis = function (ms) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); };
    Timestamp.fromDate = function (d) { return Timestamp.fromMillis(d.getTime()); };
    var FieldValue = {
        increment: function (n) { return new FV({ $fv: 'inc', n: +n || 0 }); },
        arrayUnion: function () { return new FV({ $fv: 'au', a: enc(Array.prototype.slice.call(arguments)) }); },
        arrayRemove: function () { return new FV({ $fv: 'ar', a: enc(Array.prototype.slice.call(arguments)) }); },
        delete: function () { return new FV({ $fv: 'del' }); },
        serverTimestamp: function () { return new FV({ $fv: 'ts' }); }
    };
    function autoId() { var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = '', a = new Uint8Array(20); try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < 20; i++) a[i] = Math.random() * 256; } for (var j = 0; j < 20; j++) s += c.charAt(a[j] % 62); return s; }
    var META = { fromCache: false, hasPendingWrites: false, isEqual: function (o) { return !!o && o.fromCache === false && o.hasPendingWrites === false; } };
    function cid() { return autoId() + Date.now().toString(36); }

    /* ---------------------------------- SNAPSHOT ---------------------------------- */
    function DocSnap(ref, exists, d, ut) { this.ref = ref; this.id = ref.id; this.exists = !!exists; this._d = exists ? d : undefined; this.metadata = META; this._ut = ut || 0; }
    DocSnap.prototype.data = function () { return this.exists ? clone(this._d) : undefined; };
    DocSnap.prototype.get = function (f) { if (!this.exists) return undefined; var x = this._d; String(f).split('.').forEach(function (k) { x = x == null ? undefined : x[k]; }); return clone(x); };
    DocSnap.prototype.isEqual = function (o) { return o && o.ref && o.ref.path === this.ref.path && JSON.stringify(o._d) === JSON.stringify(this._d); };
    function QuerySnap(query, docs, changes) {
        this.query = query; this.docs = docs; this.size = docs.length; this.empty = !docs.length; this.metadata = META; this._ch = changes;
    }
    QuerySnap.prototype.forEach = function (cb, thisArg) { this.docs.forEach(function (d) { cb.call(thisArg, d); }); };
    QuerySnap.prototype.docChanges = function () { return this._ch; };
    function diff(prevIds, prevV, docs) {   // so với lần trước -> added / modified / removed
        var ch = [], now = {}, idx = {};
        docs.forEach(function (d, i) { now[d.id] = i; });
        (prevIds || []).forEach(function (id, i) { idx[id] = i; });
        (prevIds || []).forEach(function (id, i) { if (!(id in now)) ch.push({ type: 'removed', doc: prevV[id].snap, oldIndex: i, newIndex: -1 }); });
        docs.forEach(function (d, i) {
            if (!(d.id in idx)) ch.push({ type: 'added', doc: d, oldIndex: -1, newIndex: i });
            else if (prevV[d.id].v !== d._v) ch.push({ type: 'modified', doc: d, oldIndex: idx[d.id], newIndex: i });
        });
        return ch;
    }
    function listenArgs(a) {   // onSnapshot(next) | (next, error) | (opts, next, error) | ({ next, error })
        a = Array.prototype.slice.call(a);
        if (a[0] && typeof a[0] === 'object' && typeof a[0].next !== 'function' && typeof a[0] !== 'function') a.shift();
        if (a[0] && typeof a[0] === 'object' && typeof a[0].next === 'function') return { next: a[0].next.bind(a[0]), error: a[0].error ? a[0].error.bind(a[0]) : null };
        return { next: a[0], error: a[1] };
    }

    /* ---------------------------------- THAM CHIẾU ---------------------------------- */
    function DB() {}
    function DocRef(path) { this.path = path; var p = path.split('/'); this.id = p[p.length - 1]; this.firestore = db; }
    Object.defineProperty(DocRef.prototype, 'parent', { get: function () { return new ColRef(this.path.split('/').slice(0, -1).join('/')); } });
    DocRef.prototype.collection = function (c) { return new ColRef(this.path + '/' + c); };
    DocRef.prototype.isEqual = function (o) { return o instanceof DocRef && o.path === this.path; };
    DocRef.prototype.get = function () { var me = this; return req({ op: 'get', path: this.path }).then(function (m) { var o = ov(me.path, m.exists, m.d); return new DocSnap(me, o[0], o[1], m.ut); }); };
    DocRef.prototype.set = function (data, opt) { return commit([{ op: 'set', path: this.path, data: enc(data || {}), merge: !!(opt && (opt.merge || opt.mergeFields)) }]); };
    DocRef.prototype.update = function (a, b) {
        var data = a; if (typeof a === 'string') { data = {}; var args = arguments; for (var i = 0; i < args.length; i += 2) data[args[i]] = args[i + 1]; }
        return commit([{ op: 'update', path: this.path, data: enc(data || {}) }]);
    };
    DocRef.prototype.delete = function () { return commit([{ op: 'delete', path: this.path }]); };
    DocRef.prototype.onSnapshot = function () {
        var L = listenArgs(arguments), me = this, sid = 's' + (++sidN), lastV = -2;
        subs[sid] = { sid: sid, path: this.path,
            onDoc: function (m) { if (m.v === lastV) return; lastV = m.v; var o = ov(me.path, m.exists, m.d); try { L.next(new DocSnap(me, o[0], o[1], m.ut)); } catch (e) { setTimeout(function () { throw e; }); } },
            onErr: function (e) { if (L.error) L.error(e); else console.error('[qd-db]', e); } };
        raw({ op: 'sub', sid: sid, path: this.path });
        return function () { if (subs[sid]) { delete subs[sid]; raw({ op: 'unsub', sid: sid }); } };
    };
    function Query(col, spec) { this._col = col; this._s = spec || { where: [], orderBy: [] }; this.firestore = db; }
    function ext(q, k, v) { var s = { where: q._s.where.slice(), orderBy: q._s.orderBy.slice(), limit: q._s.limit, limitToLast: q._s.limitToLast }; if (k === 'where') s.where.push(v); else if (k === 'orderBy') s.orderBy.push(v); else s[k] = v; return new Query(q._col, s); }
    Query.prototype.where = function (f, op, v) { if (f && f._qdDocId) f = '__name__'; return ext(this, 'where', [String(f), op, enc(v)]); };
    Query.prototype.orderBy = function (f, dir) { if (f && f._qdDocId) f = '__name__'; return ext(this, 'orderBy', [String(f), dir === 'desc' ? 'desc' : 'asc']); };
    Query.prototype.limit = function (n) { var q = ext(this, 'limit', +n); q._s.limitToLast = 0; return q; };
    Query.prototype.limitToLast = function (n) { var q = ext(this, 'limitToLast', +n); q._s.limit = 0; return q; };
    Query.prototype._q = function () { return { col: this._col, where: this._s.where, orderBy: this._s.orderBy, limit: this._s.limit || 0, limitToLast: this._s.limitToLast || 0 }; };
    Query.prototype._snap = function (list) { var col = this._col; return list.map(function (x) { var p = col + '/' + x.id, o = PW[p] ? ov(p, true, x.d) : [true, x.d], s = new DocSnap(new DocRef(p), true, o[1] || {}, x.ut); s._v = x.v; return s; }); };
    Query.prototype.get = function () {
        var me = this, q = this._q(), cu = null, cp = null;
        if (q.col === 'accounts') q.where.forEach(function (w) { if (w[1] === '==' && w[0] === 'user') cu = w[2]; if (w[1] === '==' && w[0] === 'pass') cp = w[2]; });
        return req({ op: 'query', q: q }).then(function (m) {
            var d = me._snap(m.docs), snap = new QuerySnap(me, d, d.map(function (x, i) { return { type: 'added', doc: x, oldIndex: -1, newIndex: i }; }));
            if (cu != null && cp != null && d.length && !(AUTH.u === cu && tok())) return login(String(cu), String(cp)).then(function () { return snap; }, function () { return snap; });
            return snap;
        });
    };
    Query.prototype.onSnapshot = function () {
        var L = listenArgs(arguments), me = this, sid = 's' + (++sidN), cache = {}, prevIds = null, prevV = {};
        subs[sid] = { sid: sid, q: this._q(),
            onQuery: function (m) {
                (m.docs || []).forEach(function (x) { cache[x.id] = x; });
                var list = m.ids.map(function (id) { return cache[id]; }).filter(Boolean), keep = {};
                m.ids.forEach(function (id) { keep[id] = 1; }); Object.keys(cache).forEach(function (id) { if (!keep[id]) delete cache[id]; });
                var docs = me._snap(list), ch = diff(prevIds, prevV, docs);
                if (prevIds && !ch.length && prevIds.length === docs.length) return;   // không đổi gì (vd. nghe lại sau mất mạng)
                prevIds = m.ids.slice(); prevV = {}; docs.forEach(function (d) { prevV[d.id] = { v: d._v, snap: d }; });
                try { L.next(new QuerySnap(me, docs, ch)); } catch (e) { setTimeout(function () { throw e; }); }
            },
            onErr: function (e) { if (L.error) L.error(e); else console.error('[qd-db]', e); } };
        raw({ op: 'sub', sid: sid, q: this._q() });
        return function () { if (subs[sid]) { delete subs[sid]; raw({ op: 'unsub', sid: sid }); } };
    };
    Query.prototype.isEqual = function (o) { return o instanceof Query && JSON.stringify(o._q()) === JSON.stringify(this._q()); };
    function ColRef(path) { Query.call(this, path); this.path = path; this.id = path.split('/').pop(); }
    ColRef.prototype = Object.create(Query.prototype); ColRef.prototype.constructor = ColRef;
    ColRef.prototype.doc = function (id) { return new DocRef(this.path + '/' + (id == null || id === '' ? autoId() : String(id))); };
    ColRef.prototype.add = function (data) { var r = this.doc(); return r.set(data).then(function () { return r; }); };
    Object.defineProperty(ColRef.prototype, 'parent', { get: function () { var p = this.path.split('/'); return p.length > 1 ? new DocRef(p.slice(0, -1).join('/')) : null; } });

    /* ---------------------------------- GHI: lẻ / batch / giao dịch ---------------------------------- */
    /* Ghi đang chờ máy chủ xác nhận -> phủ lên ảnh chụp nhận được (như Firestore "latency compensation").
       Không có cái này, trang nào "thấy dữ liệu -> ghi" trong onSnapshot sẽ ghi lặp vô hạn (ảnh chụp cũ tới trước khi lệnh ghi được xử lý). */
    var PW = {}, pwN = 0;
    function pwAdd(writes) { var id = ++pwN; writes.forEach(function (w) { (PW[w.path] = PW[w.path] || []).push({ id: id, w: w }); }); return id; }
    function pwDel(id) { Object.keys(PW).forEach(function (p) { PW[p] = PW[p].filter(function (e) { return e.id !== id; }); if (!PW[p].length) delete PW[p]; }); }
    function lv(cur, x) {   // giá trị sau khi áp 1 trường (có FieldValue)
        if (x && typeof x === 'object' && x.$fv) {
            if (x.$fv === 'inc') return (typeof cur === 'number' ? cur : 0) + x.n;
            if (x.$fv === 'ts') return Date.now();
            if (x.$fv === 'au') { var a = Array.isArray(cur) ? cur.slice() : []; (x.a || []).forEach(function (v) { if (!a.some(function (y) { return JSON.stringify(y) === JSON.stringify(v); })) a.push(v); }); return a; }
            if (x.$fv === 'ar') return (Array.isArray(cur) ? cur : []).filter(function (y) { return !(x.a || []).some(function (v) { return JSON.stringify(y) === JSON.stringify(v); }); });
            return cur;
        }
        return x;
    }
    function isDel(x) { return x && typeof x === 'object' && x.$fv === 'del'; }
    function deep(dst, src) { Object.keys(src).forEach(function (k) { var x = src[k]; if (isDel(x)) delete dst[k]; else if (x && typeof x === 'object' && !Array.isArray(x) && !x.$fv) { if (!dst[k] || typeof dst[k] !== 'object' || Array.isArray(dst[k])) dst[k] = {}; deep(dst[k], x); } else dst[k] = lv(dst[k], x); }); return dst; }
    function dotted(dst, src) { Object.keys(src).forEach(function (k) { var ks = k.split('.'), o = dst; for (var i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; } var last = ks[ks.length - 1]; if (isDel(src[k])) delete o[last]; else o[last] = lv(o[last], src[k]); }); return dst; }
    function ov(path, exists, d) {   // -> [exists, d] sau khi phủ các lệnh ghi đang chờ
        var L = PW[path]; if (!L) return [exists, d];
        d = exists ? clone(d) : undefined;
        L.forEach(function (e) { var w = e.w;
            if (w.op === 'delete') { exists = false; d = undefined; }
            else if (w.op === 'set' && !w.merge) { exists = true; d = deep({}, w.data || {}); }
            else if (w.op === 'set') { exists = true; d = deep(d || {}, w.data || {}); }
            else if (w.op === 'update' && exists) d = dotted(d, w.data || {});
        });
        return [exists, d];
    }
    function commit(writes, pre) {
        var id = pwAdd(writes);
        return req({ op: 'commit', writes: writes, pre: pre || null, cid: cid() }).then(function () { pwDel(id); }, function (e) { pwDel(id); throw e; });
    }
    function Batch() { this._w = []; }
    Batch.prototype.set = function (ref, data, opt) { this._w.push({ op: 'set', path: ref.path, data: enc(data || {}), merge: !!(opt && (opt.merge || opt.mergeFields)) }); return this; };
    Batch.prototype.update = function (ref, data) { this._w.push({ op: 'update', path: ref.path, data: enc(data || {}) }); return this; };
    Batch.prototype.delete = function (ref) { this._w.push({ op: 'delete', path: ref.path }); return this; };
    Batch.prototype.commit = function () { return this._w.length ? commit(this._w) : Promise.resolve(); };
    function Tx() { Batch.call(this); this._pre = {}; }
    Tx.prototype = Object.create(Batch.prototype);
    Tx.prototype.get = function (ref) {
        var me = this;
        if (!(ref instanceof DocRef)) return Promise.reject(err('invalid-argument', 'Giao dịch chỉ đọc được tài liệu'));
        return req({ op: 'get', path: ref.path }).then(function (m) { if (!(ref.path in me._pre)) me._pre[ref.path] = m.v || 0; return new DocSnap(ref, m.exists, m.d, m.ut); });
    };
    function runTransaction(fn, opt) {
        var max = (opt && opt.maxAttempts) || 5, n = 0;
        function attempt() {
            n++; var t = new Tx();
            return Promise.resolve().then(function () { return fn(t); }).then(function (res) {
                if (!t._w.length) return res;
                return commit(t._w, t._pre).then(function () { return res; });
            }).catch(function (e) {
                if (e && e.code === 'aborted' && n < max) return new Promise(function (r) { setTimeout(r, 30 + Math.random() * 120 * n); }).then(attempt);
                throw e;
            });
        }
        return attempt();
    }

    /* ---------------------------------- firebase.* (bản compat) ---------------------------------- */
    var db = new DB();
    DB.prototype.collection = function (p) { return new ColRef(String(p).replace(/^\/+|\/+$/g, '')); };
    DB.prototype.doc = function (p) { return new DocRef(String(p).replace(/^\/+|\/+$/g, '')); };
    DB.prototype.batch = function () { return new Batch(); };
    DB.prototype.runTransaction = runTransaction;
    DB.prototype.settings = function () {};
    DB.prototype.enablePersistence = function () { return Promise.resolve(); };
    DB.prototype.enableNetwork = function () { connect(); return Promise.resolve(); };
    DB.prototype.disableNetwork = function () { return Promise.resolve(); };
    DB.prototype.terminate = function () { return Promise.resolve(); };
    DB.prototype.clearPersistence = function () { return Promise.resolve(); };
    DB.prototype.waitForPendingWrites = function () { var ids = Object.keys(pend); return Promise.all(ids.map(function (k) { return new Promise(function (r) { var t = setInterval(function () { if (!pend[k]) { clearInterval(t); r(); } }, 50); }); })); };
    function firestore() { connect(); return db; }
    firestore.FieldValue = FieldValue;
    firestore.Timestamp = Timestamp;
    firestore.FieldPath = { documentId: function () { return { _qdDocId: 1, toString: function () { return '__name__'; } }; } };
    firestore.setLogLevel = function () {};
    var apps = [];
    function App(opt) { this.options = Object.assign({}, opt || {}, { projectId: '', apiKey: '' }); this.name = '[DEFAULT]'; }
    App.prototype.firestore = function () { return firestore(); };
    App.prototype.delete = function () { return Promise.resolve(); };
    window.firebase = {
        __qd: true, SDK_VERSION: 'qd-db-1', apps: apps,
        initializeApp: function (opt) { if (!apps.length) apps.push(new App(opt)); return apps[0]; },
        app: function () { if (!apps.length) throw err('app/no-app', 'No Firebase App'); return apps[0]; },
        firestore: firestore
    };
    // Tiện ích riêng: ghi khi đóng trang (sendBeacon, không cần WebSocket còn sống) + địa chỉ máy chủ
    window.QDdb = {
        url: URL_,
        http: URL_.replace(/^ws/, 'http').replace(/\/ws$/, ''),
        beacon: function (writes) { try { var b = new Blob([JSON.stringify({ writes: enc(writes) })], { type: 'text/plain' }); return navigator.sendBeacon(window.QDdb.http + '/api/commit', b); } catch (e) { return false; } },
        status: function () { return { open: open, ever: everOpen, pending: Object.keys(pend).length, subs: Object.keys(subs).length, u: AUTH.u, role: AUTH.role }; },
        login: login,
        logout: function () { tok(null); AUTH.u = AUTH.role = ''; link(''); return req({ op: 'logout' }).catch(function () {}); },
        token: function () { return tok(); },
        who: function () { return { u: AUTH.u, role: AUTH.role }; },
        admin: function (fn, args) { return req(Object.assign({ op: 'admin', fn: fn }, args || {})).then(function (m) { return m.data; }); },
        /* Trò chơi / đổi điểm do máy chủ tính (thành viên không tự cộng trừ điểm). Lỗi: e.message = mã ngắn (POINTS, DAILY...) */
        act: function (fn, args) { return req({ op: 'act', fn: fn, a: args || {}, cid: cid() }).then(function (m) { return m.data; }); },
        ping: function () { var t = performance.now(); return req({ op: 'hello' }).then(function () { return Math.round(performance.now() - t); }); }
    };
})();
