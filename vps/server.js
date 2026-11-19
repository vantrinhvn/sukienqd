#!/usr/bin/env node
/* =====================================================================================
   QD ELITE — MÁY CHỦ RIÊNG (thay Firebase Firestore) · chạy trên VPS
   - Lưu dữ liệu: SQLite (node:sqlite, có sẵn trong Node 22) + bản sao trong RAM để truy vấn nhanh.
   - Trang web / app nói chuyện qua WebSocket bằng đúng kiểu Firestore (bộ chuyển qd-db.js) -> code trang gần như giữ nguyên.
   - Không giới hạn lượt đọc / ghi. Thời gian thực: thay đổi tới mọi người đang nghe trong vài mili-giây.
   - Không cần cài thêm gói npm nào.
   Chạy: node --no-warnings server.js   (biến môi trường: PORT=8787, DATA=./data)
   ===================================================================================== */
'use strict';
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = +process.env.PORT || 8787;
const DATA = process.env.DATA || path.join(__dirname, 'data');
const VER = 'qd-vps-1';
fs.mkdirSync(DATA, { recursive: true });

/* ---------------------------------- LƯU TRỮ ---------------------------------- */
const sql = new DatabaseSync(path.join(DATA, 'qd.db'));
sql.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, v INTEGER NOT NULL, ut INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS docs_col ON docs(col);
  CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);`);
const qPut = sql.prepare('INSERT INTO docs(path, col, id, data, v, ut) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET data = excluded.data, v = excluded.v, ut = excluded.ut');
const qDel = sql.prepare('DELETE FROM docs WHERE path = ?');
const qMetaGet = sql.prepare('SELECT v FROM meta WHERE k = ?'), qMetaSet = sql.prepare('INSERT INTO meta(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v');

const COLS = new Map();          // col -> Map(id -> { d, v, ut })
let SEQ = +((qMetaGet.get('seq') || {}).v || 0);
function col(c) { let m = COLS.get(c); if (!m) COLS.set(c, m = new Map()); return m; }
(function load() {
  let n = 0;
  for (const r of sql.prepare('SELECT col, id, data, v, ut FROM docs').iterate()) { col(r.col).set(r.id, { d: JSON.parse(r.data), v: r.v, ut: r.ut }); if (r.v > SEQ) SEQ = r.v; n++; }
  console.log(`[qd] đã nạp ${n} tài liệu trong ${COLS.size} bộ sưu tập`);
})();
function splitPath(p) {
  const s = String(p || '').replace(/^\/+|\/+$/g, '').split('/');
  if (s.length < 2 || s.length % 2) throw err('invalid-argument', 'Đường dẫn tài liệu sai: ' + p);
  if (s.some(x => !x || x.length > 1500)) throw err('invalid-argument', 'Đường dẫn tài liệu sai: ' + p);
  return { col: s.slice(0, -1).join('/'), id: s[s.length - 1] };
}
function getDoc(p) { const { col: c, id } = splitPath(p); const x = (COLS.get(c) || new Map()).get(id); return x || null; }
function err(code, msg) { const e = new Error(msg || code); e.code = code; return e; }

/* ---------------------------------- GIÁ TRỊ & SO SÁNH (theo thứ tự của Firestore) ---------------------------------- */
function typeRank(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'boolean') return 1;
  if (typeof v === 'number') return 2;
  if (typeof v === 'string') return 4;
  if (Array.isArray(v)) return 8;
  return 9;   // map
}
function cmp(a, b) {
  const ta = typeRank(a), tb = typeRank(b);
  if (ta !== tb) return ta - tb;
  if (ta === 0) return 0;
  if (ta === 1 || ta === 2) return a === b ? 0 : (a < b ? -1 : 1);
  if (ta === 4) return a === b ? 0 : (a < b ? -1 : 1);
  if (ta === 8) { for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = cmp(a[i], b[i]); if (c) return c; } return a.length - b.length; }
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  for (let i = 0; i < Math.min(ka.length, kb.length); i++) { if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1; const c = cmp(a[ka[i]], b[kb[i]]); if (c) return c; }
  return ka.length - kb.length;
}
function eq(a, b) { return typeRank(a) === typeRank(b) && cmp(a, b) === 0; }
function getField(d, f) {
  if (f === '__name__') return undefined;
  if (d == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(d, f)) return d[f];
  const ps = String(f).split('.'); let x = d;
  for (const k of ps) { if (x == null || typeof x !== 'object' || Array.isArray(x)) return undefined; x = x[k]; }
  return x;
}

/* ---------------------------------- TRUY VẤN ---------------------------------- */
// q = { col, where: [[field, op, value]], orderBy: [[field, 'asc'|'desc']], limit, limitToLast }
function matches(d, id, w) {
  const [f, op, val] = w;
  const v = f === '__name__' ? id : getField(d, f);
  switch (op) {
    case '==': return v !== undefined && eq(v, val);
    case '!=': return v !== undefined && v !== null && !eq(v, val);
    case '<': return v !== undefined && typeRank(v) === typeRank(val) && cmp(v, val) < 0;
    case '<=': return v !== undefined && typeRank(v) === typeRank(val) && cmp(v, val) <= 0;
    case '>': return v !== undefined && typeRank(v) === typeRank(val) && cmp(v, val) > 0;
    case '>=': return v !== undefined && typeRank(v) === typeRank(val) && cmp(v, val) >= 0;
    case 'array-contains': return Array.isArray(v) && v.some(x => eq(x, val));
    case 'array-contains-any': return Array.isArray(v) && Array.isArray(val) && v.some(x => val.some(y => eq(x, y)));
    case 'in': return v !== undefined && Array.isArray(val) && val.some(y => eq(v, y));
    case 'not-in': return v !== undefined && v !== null && Array.isArray(val) && !val.some(y => eq(v, y));
    default: throw err('invalid-argument', 'Toán tử không hỗ trợ: ' + op);
  }
}
function runQuery(q) {
  const m = COLS.get(q.col); if (!m) return [];
  const where = q.where || [], ob = (q.orderBy || []).slice();
  // Firestore: có lọc bất đẳng thức mà chưa orderBy trường đó -> tự xếp theo trường đó trước
  const ineq = where.find(w => ['<', '<=', '>', '>=', '!=', 'not-in'].includes(w[1]));
  if (ineq && !ob.some(o => o[0] === ineq[0])) ob.unshift([ineq[0], 'asc']);
  const out = [];
  for (const [id, x] of m) {
    if (!where.every(w => matches(x.d, id, w))) continue;
    if (ob.some(o => o[0] !== '__name__' && getField(x.d, o[0]) === undefined)) continue;   // thiếu trường orderBy -> không có trong kết quả
    out.push([id, x]);
  }
  const lastDir = ob.length ? ob[ob.length - 1][1] : 'asc';
  out.sort((a, b) => {
    for (const [f, dir] of ob) { const c = f === '__name__' ? cmp(a[0], b[0]) : cmp(getField(a[1].d, f), getField(b[1].d, f)); if (c) return dir === 'desc' ? -c : c; }
    const c = a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; return lastDir === 'desc' ? -c : c;
  });
  if (q.limitToLast > 0) return out.slice(Math.max(0, out.length - q.limitToLast));
  if (q.limit > 0) return out.slice(0, q.limit);
  return out;
}

/* ---------------------------------- GHI (set / update / delete + FieldValue) ---------------------------------- */
// Giá trị đặc biệt từ bộ chuyển: { $fv: 'inc', n } · { $fv: 'au', a } · { $fv: 'ar', a } · { $fv: 'del' } · { $fv: 'ts' }
const isFV = v => v && typeof v === 'object' && !Array.isArray(v) && typeof v.$fv === 'string';
function applyFV(cur, fv, now) {
  switch (fv.$fv) {
    case 'inc': return (typeof cur === 'number' ? cur : 0) + (+fv.n || 0);
    case 'au': { const a = Array.isArray(cur) ? cur.slice() : []; for (const x of fv.a || []) if (!a.some(y => eq(x, y))) a.push(x); return a; }
    case 'ar': { const a = Array.isArray(cur) ? cur : []; return a.filter(x => !(fv.a || []).some(y => eq(x, y))); }
    case 'ts': return now;
    case 'del': return undefined;
    default: throw err('invalid-argument', 'FieldValue lạ: ' + fv.$fv);
  }
}
function clean(v, now) {   // giá trị mới (không có giá trị cũ): bỏ FieldValue
  if (isFV(v)) return applyFV(undefined, v, now);
  if (Array.isArray(v)) return v.map(x => clean(x, now));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) { const c = clean(v[k], now); if (c !== undefined) o[k] = c; } return o; }
  return v;
}
function mergeInto(base, patch, now) {   // set(..., { merge: true }): gộp sâu các map
  const o = base && typeof base === 'object' && !Array.isArray(base) ? Object.assign({}, base) : {};
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (isFV(v)) { const r = applyFV(o[k], v, now); if (r === undefined) delete o[k]; else o[k] = r; }
    else if (v && typeof v === 'object' && !Array.isArray(v)) o[k] = mergeInto(o[k], v, now);
    else o[k] = clean(v, now);
  }
  return o;
}
function setPath(o, fieldPath, v, now) {   // update({ 'a.b.c': v })
  const ps = fieldPath.split('.'); let x = o;
  for (let i = 0; i < ps.length - 1; i++) { if (!x[ps[i]] || typeof x[ps[i]] !== 'object' || Array.isArray(x[ps[i]])) x[ps[i]] = {}; else x[ps[i]] = Object.assign({}, x[ps[i]]); x = x[ps[i]]; }
  const k = ps[ps.length - 1];
  const r = isFV(v) ? applyFV(x[k], v, now) : clean(v, now);
  if (r === undefined) delete x[k]; else x[k] = r;
}
function applyWrite(w, now, changed) {
  const { col: c, id } = splitPath(w.path), m = col(c), cur = m.get(id);
  let d;
  if (w.op === 'delete') { if (!cur) return; m.delete(id); changed.push({ col: c, id, del: true }); qDel.run(w.path); return; }
  if (w.op === 'set') d = w.merge ? mergeInto(cur ? cur.d : {}, w.data || {}, now) : clean(w.data || {}, now);
  else if (w.op === 'update') {
    if (!cur) throw err('not-found', 'No document to update: ' + w.path);
    d = JSON.parse(JSON.stringify(cur.d));
    for (const k of Object.keys(w.data || {})) setPath(d, k, w.data[k], now);
  } else throw err('invalid-argument', 'Lệnh ghi lạ: ' + w.op);
  const v = ++SEQ, js = JSON.stringify(d);
  if (js.length > 1048487) throw err('invalid-argument', 'Tài liệu quá lớn (tối đa 1 MB): ' + w.path);
  m.set(id, { d, v, ut: now }); changed.push({ col: c, id });
  qPut.run(w.path, c, id, js, v, now);
}
// Ghi nguyên khối (batch / giao dịch): pre = { path: phiên bản đã đọc (0 = chưa có) } -> lệch thì 'aborted' để bên kia thử lại
function commit(writes, pre) {
  for (const p of Object.keys(pre || {})) { const x = getDoc(p); if ((x ? x.v : 0) !== (pre[p] || 0)) throw err('aborted', 'Dữ liệu vừa bị người khác đổi, thử lại'); }
  // kiểm tra trước để không ghi dở dang
  for (const w of writes) { splitPath(w.path); if (w.op === 'update' && !getDoc(w.path)) throw err('not-found', 'No document to update: ' + w.path); }
  const now = Date.now(), changed = [], backup = new Map();
  for (const w of writes) { const { col: c, id } = splitPath(w.path); const k = c + '/' + id; if (!backup.has(k)) { const x = col(c).get(id); backup.set(k, { c, id, x }); } }
  sql.exec('BEGIN');
  try { for (const w of writes) applyWrite(w, now, changed); qMetaSet.run('seq', String(SEQ)); sql.exec('COMMIT'); }
  catch (e) { try { sql.exec('ROLLBACK'); } catch (x) {} for (const { c, id, x } of backup.values()) { if (x) col(c).set(id, x); else col(c).delete(id); } throw e; }
  notify(changed);
  return { v: SEQ };
}

/* ---------------------------------- NGHE THỜI GIAN THỰC ---------------------------------- */
const SUBS = new Set();   // { conn, sid, kind: 'doc'|'query', path | q, last }
function docPayload(id, x) { return { id, d: x.d, v: x.v, ut: x.ut }; }
function pushDoc(s) {
  const x = getDoc(s.path), v = x ? x.v : 0;
  if (s.last === v) return;
  s.last = v;
  send(s.conn, { ev: 'doc', sid: s.sid, exists: !!x, d: x ? x.d : null, v, ut: x ? x.ut : 0 });
}
function pushQuery(s, force) {
  let res;
  try { res = runQuery(s.q); } catch (e) { send(s.conn, { ev: 'err', sid: s.sid, code: e.code || 'internal', message: e.message }); SUBS.delete(s); return; }
  const ids = res.map(r => r[0]), vers = new Map(res.map(r => [r[0], r[1].v]));
  const prev = s.last || new Map(), docs = [];
  for (const [id, x] of res) if (prev.get(id) !== x.v) docs.push(docPayload(id, x));
  const same = !force && prev.size === vers.size && !docs.length && s.ids && s.ids.length === ids.length && s.ids.every((x, i) => x === ids[i]);
  s.last = vers;
  if (same) return;
  s.ids = ids;
  send(s.conn, { ev: 'q', sid: s.sid, ids, docs });
}
function notify(changed) {
  const cols = new Set(changed.map(c => c.col)), paths = new Set(changed.map(c => c.col + '/' + c.id));
  for (const s of SUBS) {
    if (s.kind === 'doc') { if (paths.has(s.path)) pushDoc(s); }
    else if (cols.has(s.q.col)) pushQuery(s);
  }
}

/* ---------------------------------- WEBSOCKET (tự viết, không cần thư viện) ---------------------------------- */
function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  socket.setNoDelay(true);
  const conn = { socket, buf: Buffer.alloc(0), alive: true, ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(), frag: null };
  socket.on('data', chunk => { conn.buf = Buffer.concat([conn.buf, chunk]); parseFrames(conn); });
  socket.on('close', () => drop(conn)); socket.on('error', () => drop(conn));
  return conn;
}
function parseFrames(conn) {
  for (;;) {
    const b = conn.buf; if (b.length < 2) return;
    const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80; let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > 8 * 1024 * 1024) { conn.socket.destroy(); return; }   // khung quá lớn
    const mk = masked ? 4 : 0; if (b.length < off + mk + len) return;
    let data = b.subarray(off + mk, off + mk + len);
    if (masked) { const m = b.subarray(off, off + 4); data = Buffer.from(data); for (let i = 0; i < data.length; i++) data[i] ^= m[i & 3]; }
    conn.buf = b.subarray(off + mk + len);
    if (op === 0x8) { try { conn.socket.end(Buffer.from([0x88, 0])); } catch (e) {} drop(conn); return; }
    if (op === 0x9) { wsSend(conn, data, 0xA); continue; }
    if (op === 0xA) { conn.alive = true; continue; }
    if (op === 0x0) { if (conn.frag) { conn.frag.push(data); if (fin) { const all = Buffer.concat(conn.frag); conn.frag = null; onText(conn, all.toString('utf8')); } } continue; }
    if (op === 0x1) { if (!fin) { conn.frag = [data]; continue; } onText(conn, data.toString('utf8')); }
  }
}
function wsSend(conn, payload, op) {
  if (!conn.socket.writable) return;
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8'), n = data.length;
  let head;
  if (n < 126) head = Buffer.from([0x80 | (op || 1), n]);
  else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | (op || 1); head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | (op || 1); head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  conn.socket.write(Buffer.concat([head, data]));
}
function send(conn, o) { try { wsSend(conn, JSON.stringify(o)); } catch (e) {} }
const CONNS = new Set();
function drop(conn) { if (!CONNS.has(conn)) return; CONNS.delete(conn); for (const s of SUBS) if (s.conn === conn) SUBS.delete(s); try { conn.socket.destroy(); } catch (e) {} }
setInterval(() => { for (const c of CONNS) { if (!c.alive) { drop(c); continue; } c.alive = false; wsSend(c, '', 0x9); } }, 30000);   // dọn kết nối chết

/* ---------------------------------- XỬ LÝ YÊU CẦU ---------------------------------- */
// Mỗi yêu cầu: { r: số thứ tự, op, ... } -> trả { re: r, ok: true, ... } hoặc { re: r, code, message }
const RATE = 400;
const DONE = new Map();   // cid -> kết quả (nhớ 20.000 lệnh ghi gần nhất)   // tối đa yêu cầu / 10 giây / kết nối (chống phá)
function onText(conn, txt) {
  let m; try { m = JSON.parse(txt); } catch (e) { return; }
  const now = Date.now();
  if (!conn.rt || now - conn.rt > 10000) { conn.rt = now; conn.rn = 0; }
  if (++conn.rn > RATE) return send(conn, { re: m.r, code: 'resource-exhausted', message: 'Gửi yêu cầu quá nhanh' });
  try {
    switch (m.op) {
      case 'hello': return send(conn, { re: m.r, ok: true, ver: VER, now: Date.now() });
      case 'get': { const x = getDoc(m.path); return send(conn, { re: m.r, ok: true, exists: !!x, d: x ? x.d : null, v: x ? x.v : 0, ut: x ? x.ut : 0 }); }
      case 'query': { const res = runQuery(m.q); return send(conn, { re: m.r, ok: true, docs: res.map(([id, x]) => docPayload(id, x)) }); }
      case 'commit': {   // cid: mã lệnh ghi -> mất mạng gửi lại không bị ghi 2 lần
        if (m.cid && DONE.has(m.cid)) return send(conn, Object.assign({ re: m.r }, DONE.get(m.cid)));
        let out; try { const r = commit(m.writes || [], m.pre || null); out = { ok: true, v: r.v }; } catch (e) { out = { code: e.code || 'internal', message: String(e.message || e).slice(0, 300) }; if (!e.code) console.error('[qd]', e); }
        if (m.cid) { DONE.set(m.cid, out); if (DONE.size > 20000) DONE.delete(DONE.keys().next().value); }
        return send(conn, Object.assign({ re: m.r }, out));
      }
      case 'sub': {
        const s = { conn, sid: m.sid, kind: m.path ? 'doc' : 'query', path: m.path, q: m.q, last: m.path ? -1 : null };
        if (s.kind === 'doc') splitPath(s.path); else runQuery(s.q);   // kiểm tra hợp lệ trước
        SUBS.add(s); send(conn, { re: m.r, ok: true });
        if (s.kind === 'doc') pushDoc(s); else pushQuery(s, true);
        return;
      }
      case 'unsub': { for (const s of SUBS) if (s.conn === conn && s.sid === m.sid) SUBS.delete(s); return send(conn, { re: m.r, ok: true }); }
      default: throw err('invalid-argument', 'Lệnh lạ: ' + m.op);
    }
  } catch (e) { send(conn, { re: m.r, code: e.code || 'internal', message: String(e.message || e).slice(0, 300) }); if (!e.code) console.error('[qd]', e); }
}

/* ---------------------------------- HTTP ---------------------------------- */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
function json(res, code, o) { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS)); res.end(JSON.stringify(o)); }
function body(req, max) { return new Promise((ok, no) => { let n = 0; const a = []; req.on('data', c => { n += c.length; if (n > max) { no(err('invalid-argument', 'Quá lớn')); req.destroy(); } else a.push(c); }); req.on('end', () => ok(Buffer.concat(a).toString('utf8'))); req.on('error', no); }); }
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  try {
    if (u.pathname === '/' || u.pathname === '/health') {
      let n = 0; for (const m of COLS.values()) n += m.size;
      return json(res, 200, { ok: true, ver: VER, docs: n, cols: COLS.size, conns: CONNS.size, subs: SUBS.size, uptime: Math.round(process.uptime()) });
    }
    // Ghi nhanh không cần WebSocket (vd. đóng tab gửi "offline" bằng sendBeacon): { writes:[...] }
    if (u.pathname === '/api/commit' && req.method === 'POST') { const m = JSON.parse(await body(req, 1 << 20) || '{}'); const r = commit(m.writes || [], m.pre || null); return json(res, 200, { ok: true, v: r.v }); }
    if (u.pathname === '/api/get' && req.method === 'GET') { const x = getDoc(u.searchParams.get('path')); return json(res, 200, { ok: true, exists: !!x, d: x ? x.d : null, v: x ? x.v : 0 }); }
    if (u.pathname === '/api/query' && req.method === 'POST') { const m = JSON.parse(await body(req, 1 << 16) || '{}'); return json(res, 200, { ok: true, docs: runQuery(m.q).map(([id, x]) => docPayload(id, x)) }); }
    json(res, 404, { ok: false, code: 'not-found' });
  } catch (e) { json(res, e.code === 'not-found' ? 404 : e.code === 'aborted' ? 409 : 400, { ok: false, code: e.code || 'internal', message: String(e.message || e).slice(0, 300) }); }
});
server.on('upgrade', (req, socket) => {
  if (!/^\/ws\b/.test(req.url || '')) { socket.destroy(); return; }
  const c = wsAccept(req, socket); if (c) CONNS.add(c);
});
server.listen(PORT, '127.0.0.1', () => console.log(`[qd] máy chủ ${VER} chạy ở cổng ${PORT}, dữ liệu: ${DATA}`));

// Đóng gọn khi tắt máy chủ
function bye() { try { sql.close(); } catch (e) {} process.exit(0); }
process.on('SIGINT', bye); process.on('SIGTERM', bye);
module.exports = { runQuery, commit, getDoc };
