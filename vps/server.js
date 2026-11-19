#!/usr/bin/env node
/* =====================================================================================
   QD ELITE — MÁY CHỦ RIÊNG (thay Firebase Firestore) · chạy trên VPS
   - Lưu dữ liệu: SQLite (node:sqlite, có sẵn trong Node 22) + bản sao trong RAM để truy vấn nhanh.
   - Trang web / app nói chuyện qua WebSocket bằng đúng kiểu Firestore (bộ chuyển qd-db.js) -> code trang gần như giữ nguyên.
   - Không giới hạn lượt đọc / ghi. Thời gian thực: thay đổi tới mọi người đang nghe trong vài mili-giây.
   - Bảo vệ: đăng nhập cấp mã xác thực (token); mật khẩu chỉ Ban Quản Trị thấy; thành viên không tự đổi vai trò / quyền,
     không sửa cài đặt hệ thống, không xóa tài khoản; chức năng quản trị VPS chỉ Admin dùng được.
   - Quản trị từ trang Admin (tab "Máy chủ VPS"): CPU, RAM, ổ đĩa, mạng, dữ liệu (xem / sửa / xóa / xuất),
     sao lưu (tạo / tải về / tải lên khôi phục), nhật ký, khởi động lại, tự cập nhật bản mới từ GitHub.
   Chạy: node --no-warnings server.js   (biến môi trường: PORT=8787, DATA=./data)
   ===================================================================================== */
'use strict';
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const { pipeline } = require('stream/promises'), { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const PORT = +process.env.PORT || 8787;
const DATA = process.env.DATA || path.join(__dirname, 'data');
const BK = path.join(DATA, 'backup');
const VER = 'qd-vps-7';
const SRC_URL = 'https://raw.githubusercontent.com/vantrinhvn/sukienqd/main/vps/server.js';
fs.mkdirSync(BK, { recursive: true });

/* ---------------------------------- NHẬT KÝ (giữ 400 dòng gần nhất để xem trong Admin) ---------------------------------- */
const LOGS = [];
['log', 'warn', 'error'].forEach(k => { const o = console[k].bind(console); console[k] = (...a) => { const line = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' ' + (k === 'log' ? '' : k.toUpperCase() + ' ') + a.map(x => typeof x === 'string' ? x : (x && x.stack) || JSON.stringify(x)).join(' '); LOGS.push(line); if (LOGS.length > 400) LOGS.shift(); o(...a); }; });
process.on('uncaughtException', e => console.error('[qd] uncaught', e));
process.on('unhandledRejection', e => console.error('[qd] unhandled', e));

/* ---------------------------------- KHÓA BÍ MẬT (ký mã xác thực) ---------------------------------- */
const KEYF = path.join(DATA, 'secret.key');
if (!fs.existsSync(KEYF)) fs.writeFileSync(KEYF, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const SECRET = fs.readFileSync(KEYF, 'utf8').trim();

/* ---------------------------------- LƯU TRỮ ---------------------------------- */
const DBF = path.join(DATA, 'qd.db');
let sql, qPut, qDel, qMetaGet, qMetaSet;
function openDb() {
  sql = new DatabaseSync(DBF);
  sql.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, v INTEGER NOT NULL, ut INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS docs_col ON docs(col);
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);`);
  qPut = sql.prepare('INSERT INTO docs(path, col, id, data, v, ut) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET data = excluded.data, v = excluded.v, ut = excluded.ut');
  qDel = sql.prepare('DELETE FROM docs WHERE path = ?');
  qMetaGet = sql.prepare('SELECT v FROM meta WHERE k = ?'); qMetaSet = sql.prepare('INSERT INTO meta(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v');
}
openDb();
const COLS = new Map();          // col -> Map(id -> { d, v, ut })
let SEQ = 0;
function col(c) { let m = COLS.get(c); if (!m) COLS.set(c, m = new Map()); return m; }
function load() {
  COLS.clear(); SEQ = +((qMetaGet.get('seq') || {}).v || 0);
  let n = 0;
  for (const r of sql.prepare('SELECT col, id, data, v, ut FROM docs').iterate()) { col(r.col).set(r.id, { d: JSON.parse(r.data), v: r.v, ut: r.ut }); if (r.v > SEQ) SEQ = r.v; n++; }
  console.log(`[qd] đã nạp ${n} tài liệu trong ${COLS.size} bộ sưu tập`);
  return n;
}
load();
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
  return 9;
}
function cmp(a, b) {
  const ta = typeRank(a), tb = typeRank(b);
  if (ta !== tb) return ta - tb;
  if (ta === 0) return 0;
  if (ta === 1 || ta === 2 || ta === 4) return a === b ? 0 : (a < b ? -1 : 1);
  if (ta === 8) { for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = cmp(a[i], b[i]); if (c) return c; } return a.length - b.length; }
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  for (let i = 0; i < Math.min(ka.length, kb.length); i++) { if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1; const c = cmp(a[ka[i]], b[kb[i]]); if (c) return c; }
  return ka.length - kb.length;
}
function eq(a, b) { return typeRank(a) === typeRank(b) && cmp(a, b) === 0; }
function getField(d, f) {
  if (f === '__name__' || d == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(d, f)) return d[f];
  let x = d;
  for (const k of String(f).split('.')) { if (x == null || typeof x !== 'object' || Array.isArray(x)) return undefined; x = x[k]; }
  return x;
}

/* ---------------------------------- TRUY VẤN ---------------------------------- */
function matches(d, id, w) {
  const [f, op, val] = w, v = f === '__name__' ? id : getField(d, f);
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
  if (!q || typeof q.col !== 'string') throw err('invalid-argument', 'Truy vấn sai');
  const m = COLS.get(q.col); if (!m) return [];
  const where = q.where || [], ob = (q.orderBy || []).slice();
  const ineq = where.find(w => ['<', '<=', '>', '>=', '!=', 'not-in'].includes(w[1]));
  if (ineq && !ob.some(o => o[0] === ineq[0])) ob.unshift([ineq[0], 'asc']);
  const out = [];
  for (const [id, x] of m) {
    if (!where.every(w => matches(x.d, id, w))) continue;
    if (ob.some(o => o[0] !== '__name__' && getField(x.d, o[0]) === undefined)) continue;
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

/* ---------------------------------- NGƯỜI DÙNG & QUYỀN ---------------------------------- */
// conn.u = tên đăng nhập (đã xác thực), conn.role = 'admin' | 'manager' | 'user' | ''  · conn.local = gọi từ chính VPS (lệnh qd)
function findAccount(u) { const m = COLS.get('accounts'); if (!m || !u) return null; for (const [id, x] of m) if (x.d && x.d.user === u) return { id, d: x.d }; return null; }
function roleOf(u) { const a = findAccount(u); if (!a || a.d.isBlocked === true) return ''; return ROLES.has(a.d.role) ? a.d.role : 'user'; }   // vai trò phải ghi rõ (không còn ngoại lệ cho tên 'admin')
const ROLES = new Set(['user', 'manager', 'admin']);
const isStaff = c => !!c && (c.local || c.role === 'admin' || c.role === 'manager');
const isAdmin = c => !!c && (c.local || c.role === 'admin');
function sign(u) { const body = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60 * 864e5 })).toString('base64url'); return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url'); }
function verify(t) {
  const [body, mac] = String(t || '').split('.'); if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try { const o = JSON.parse(Buffer.from(body, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch (e) { return null; }
}
function authConn(conn, u) { conn.u = u; conn.role = roleOf(u); return conn.role; }
// Dữ liệu gửi ra: thành viên không thấy mật khẩu
const HIDE = { accounts: ['pass'], pending_users: ['pass', 'password'] };
function view(conn, c, d) {
  const h = HIDE[c]; if (!h || !d) return d;
  if (isAdmin(conn)) return d;
  if (isStaff(conn)) {   // Quản lý: thấy mật khẩu thành viên (để hỗ trợ), KHÔNG thấy mật khẩu Ban Quản Trị khác
    if (c !== 'accounts' || !(d.role === 'admin' || d.role === 'manager' || d.owner) || d.user === conn.u || d.pass === undefined) return d;
    const o = Object.assign({}, d); delete o.pass; return o;
  }
  let o = null; for (const k of h) if (d[k] !== undefined) { if (!o) o = Object.assign({}, d); delete o[k]; }
  return o || d;
}
// Luật ghi cho thành viên (Ban Quản Trị không bị giới hạn)
const SETTINGS_OPEN = new Set(['ai_config']);   // cài đặt thành viên được ghi
function topKeys(w) { return Object.keys(w.data || {}).map(k => k.split('.')[0]); }
/* Ban Quản Trị: 3 bậc
   - Chủ hệ thống (owner: true, đặt bằng lệnh "qd admin" trên VPS hoặc tự nhận khi hệ thống chưa có chủ): không ai trên web hạ quyền / khóa / xóa / đổi mật khẩu được.
   - Quản trị viên (admin): toàn quyền, cấp / tước quyền người khác (trừ Chủ hệ thống), quản lý máy chủ VPS.
   - Quản lý (manager): chỉ các chức năng được Admin cấp; không đổi vai trò / quyền của ai, không đụng tài khoản Ban Quản Trị khác,
     chỉ tạo được tài khoản thành viên, không xem được mật khẩu Ban Quản Trị. */
const roleNorm = d => (d && ROLES.has(d.role) ? d.role : 'user');
function simAccount(w, cur, now) {   // tài khoản sau khi ghi (null = bị xóa)
  if (w.op === 'delete') return null;
  if (w.op === 'set') return w.merge ? mergeInto(cur ? cur.d : {}, w.data || {}, now) : clean(w.data || {}, now);
  if (!cur) return null;
  const d = JSON.parse(JSON.stringify(cur.d)); for (const k of Object.keys(w.data || {})) setPath(d, k, w.data[k], now); return d;
}
function checkStaffWrites(conn, writes) {
  if (conn.local) return;
  const now = Date.now();
  for (const w of writes) {
    const { col: c, id } = splitPath(w.path);
    if (c !== 'accounts') continue;
    const cur = (COLS.get(c) || new Map()).get(id), b = cur ? cur.d : null, a = simAccount(w, cur, now);
    const self = !!(b && b.user === conn.u);
    if (b && b.owner === true) {   // Chủ hệ thống
      if (!a) throw err('permission-denied', 'Không xóa được tài khoản Chủ hệ thống');
      if (a.owner !== true || roleNorm(a) !== 'admin' || a.isBlocked === true || a.user !== b.user) throw err('permission-denied', 'Không hạ quyền / khóa / đổi tên được Chủ hệ thống (chỉ đổi được bằng lệnh qd admin trên VPS)');
      if (!self && a.pass !== b.pass) throw err('permission-denied', 'Chỉ Chủ hệ thống tự đổi được mật khẩu của mình');
    } else if (a && a.owner === true) throw err('permission-denied', 'Chủ hệ thống chỉ đặt được bằng lệnh qd admin trên VPS');
    if (conn.role === 'admin') continue;
    // Quản lý
    const rb = roleNorm(b), ra = a ? roleNorm(a) : rb;
    if (b && (rb === 'admin' || rb === 'manager') && !self) throw err('permission-denied', 'Quản lý không được sửa / khóa / xóa tài khoản Ban Quản Trị khác');
    if (a && (ra !== rb || JSON.stringify(a.permissions || null) !== JSON.stringify(b ? b.permissions || null : null)) && !(!b && ra === 'user' && !a.permissions))
      throw err('permission-denied', 'Chỉ Quản trị viên được cấp / đổi vai trò và quyền');
    if (!b && a && ra !== 'user') throw err('permission-denied', 'Quản lý chỉ tạo được tài khoản thành viên');
    if (!a && self) throw err('permission-denied', 'Không tự xóa tài khoản của mình');
  }
}
function uniqueUsers(writes) {   // mỗi tên đăng nhập chỉ 1 tài khoản (trước đây tạo tay ở Admin không kiểm tra -> 2 tài khoản cùng tên 'admin')
  const now = Date.now(), m = COLS.get('accounts') || new Map(), mine = new Map();
  for (const w of writes) {
    const { col: c, id } = splitPath(w.path); if (c !== 'accounts' || w.op === 'delete') continue;
    const a = simAccount(w, m.get(id), now); if (!a || typeof a.user !== 'string' || !a.user) continue;
    const u = a.user.toLowerCase(), b = m.get(id);
    if (b && b.d && String(b.d.user || '').toLowerCase() === u) continue;   // không đổi tên
    for (const [oid, x] of m) if (oid !== id && x.d && String(x.d.user || '').toLowerCase() === u) throw err('already-exists', 'Tên đăng nhập "' + a.user + '" đã có tài khoản khác dùng');
    if (mine.has(u) && mine.get(u) !== id) throw err('already-exists', 'Trùng tên đăng nhập trong cùng 1 lần ghi'); mine.set(u, id);
  }
}
function checkWrites(conn, writes) {
  if (isStaff(conn)) return checkStaffWrites(conn, writes);
  for (const w of writes) {
    const { col: c, id } = splitPath(w.path), cur = (COLS.get(c) || new Map()).get(id);
    if (c === 'settings' && !SETTINGS_OPEN.has(id)) throw err('permission-denied', 'Chỉ Ban Quản Trị được sửa cài đặt hệ thống');
    if (c === 'accounts') {
      if (w.op === 'delete') throw err('permission-denied', 'Chỉ Ban Quản Trị được xóa tài khoản');
      if (!cur && w.op === 'set') throw err('permission-denied', 'Tài khoản mới do Ban Quản Trị duyệt tạo');
      const ks = topKeys(w);
      if (ks.some(k => k === 'role' || k === 'permissions')) {
        const d = w.data || {}; const same = (k) => !(k in d) || JSON.stringify(d[k]) === JSON.stringify(cur && cur.d[k]);
        if (!(same('role') && same('permissions'))) throw err('permission-denied', 'Không được tự đổi vai trò / quyền');
      }
      if (ks.includes('pass') && !(cur && conn.u && cur.d.user === conn.u)) throw err('permission-denied', 'Chỉ đổi được mật khẩu của chính mình (đăng nhập lại rồi thử)');
    }
  }
}

/* ---------------------------------- GHI (set / update / delete + FieldValue) ---------------------------------- */
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
function clean(v, now) {
  if (isFV(v)) return applyFV(undefined, v, now);
  if (Array.isArray(v)) return v.map(x => clean(x, now));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) { const c = clean(v[k], now); if (c !== undefined) o[k] = c; } return o; }
  return v;
}
function mergeInto(base, patch, now) {
  const o = base && typeof base === 'object' && !Array.isArray(base) ? Object.assign({}, base) : {};
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (isFV(v)) { const r = applyFV(o[k], v, now); if (r === undefined) delete o[k]; else o[k] = r; }
    else if (v && typeof v === 'object' && !Array.isArray(v)) o[k] = mergeInto(o[k], v, now);
    else o[k] = clean(v, now);
  }
  return o;
}
function setPath(o, fieldPath, v, now) {
  const ps = fieldPath.split('.'); let x = o;
  for (let i = 0; i < ps.length - 1; i++) { if (!x[ps[i]] || typeof x[ps[i]] !== 'object' || Array.isArray(x[ps[i]])) x[ps[i]] = {}; else x[ps[i]] = Object.assign({}, x[ps[i]]); x = x[ps[i]]; }
  const k = ps[ps.length - 1], r = isFV(v) ? applyFV(x[k], v, now) : clean(v, now);
  if (r === undefined) delete x[k]; else x[k] = r;
}
const KEEP = { accounts: ['pass', 'role', 'permissions'] };   // thành viên ghi đè cả tài liệu (set không merge) -> giữ các trường này
function applyWrite(w, now, changed, conn) {
  const { col: c, id } = splitPath(w.path), m = col(c), cur = m.get(id);
  let d;
  if (w.op === 'delete') { if (!cur) return; m.delete(id); changed.push({ col: c, id, del: true }); qDel.run(w.path); return; }
  if (w.op === 'set') {
    d = w.merge ? mergeInto(cur ? cur.d : {}, w.data || {}, now) : clean(w.data || {}, now);
    if (!w.merge && cur && KEEP[c] && !isStaff(conn)) for (const k of KEEP[c]) if (cur.d[k] !== undefined && d[k] === undefined) d[k] = cur.d[k];
  } else if (w.op === 'update') {
    if (!cur) throw err('not-found', 'No document to update: ' + w.path);
    d = JSON.parse(JSON.stringify(cur.d));
    for (const k of Object.keys(w.data || {})) setPath(d, k, w.data[k], now);
  } else throw err('invalid-argument', 'Lệnh ghi lạ: ' + w.op);
  const v = ++SEQ, js = JSON.stringify(d);
  if (js.length > 1048487) throw err('invalid-argument', 'Tài liệu quá lớn (tối đa 1 MB): ' + w.path);
  m.set(id, { d, v, ut: now }); changed.push({ col: c, id });
  qPut.run(w.path, c, id, js, v, now);
}
function commit(writes, pre, conn) {
  if (!Array.isArray(writes) || writes.length > 500) throw err('invalid-argument', 'Tối đa 500 lệnh ghi / lần');
  for (const p of Object.keys(pre || {})) { const x = getDoc(p); if ((x ? x.v : 0) !== (pre[p] || 0)) throw err('aborted', 'Dữ liệu vừa bị người khác đổi, thử lại'); }
  for (const w of writes) { splitPath(w.path); if (w.op === 'update' && !getDoc(w.path)) throw err('not-found', 'No document to update: ' + w.path); }
  checkWrites(conn, writes);
  uniqueUsers(writes);
  const now = Date.now(), changed = [], backup = new Map();
  for (const w of writes) { const { col: c, id } = splitPath(w.path), k = c + '/' + id; if (!backup.has(k)) backup.set(k, { c, id, x: col(c).get(id) }); }
  sql.exec('BEGIN');
  try { for (const w of writes) applyWrite(w, now, changed, conn); qMetaSet.run('seq', String(SEQ)); sql.exec('COMMIT'); }
  catch (e) { try { sql.exec('ROLLBACK'); } catch (x) {} for (const { c, id, x } of backup.values()) { if (x) col(c).set(id, x); else col(c).delete(id); } throw e; }
  STAT.w += writes.length;
  notify(changed);
  for (const c of changed) if (c.col === 'push_broadcast' && !c.del) setTimeout(() => broadcastDone(c.id), 4000);
  return { v: SEQ };
}
/* Thông báo Admin soạn (push_broadcast): app Android đang kết nối (dịch vụ QDLink) tự nhận và hiện.
   Máy chủ đánh dấu đã gửi + đếm số máy đang nhận (thay cho máy chủ Firebase cũ). */
function broadcastDone(id) {
  const x = getDoc('push_broadcast/' + id); if (!x || !x.d || x.d.status !== 'pending') return;
  const t = String(x.d.target || 'all').trim() || 'all', users = new Set(); let dev = 0;
  for (const c of CONNS) if (/^QDLink\//.test(c.ua) && c.u && (t === 'all' || c.u === t)) { dev++; users.add(c.u); }
  try { commit([{ op: 'update', path: 'push_broadcast/' + id, data: { status: 'done', sent: dev, failed: 0, devices: dev, users: users.size, doneAt: Date.now(), by: 'vps' } }], null, { local: true }); } catch (e) {}
}

/* ---------------------------------- NGHE THỜI GIAN THỰC ---------------------------------- */
const SUBS = new Set();
function docPayload(conn, c, id, x) { return { id, d: view(conn, c, x.d), v: x.v, ut: x.ut }; }
function pushDoc(s) {
  const x = getDoc(s.path), v = x ? x.v : 0;
  if (s.last === v) return;
  s.last = v; STAT.r++;
  send(s.conn, { ev: 'doc', sid: s.sid, exists: !!x, d: x ? view(s.conn, splitPath(s.path).col, x.d) : null, v, ut: x ? x.ut : 0 });
}
function pushQuery(s, force) {
  let res;
  try { res = runQuery(s.q); } catch (e) { send(s.conn, { ev: 'err', sid: s.sid, code: e.code || 'internal', message: e.message }); SUBS.delete(s); return; }
  const ids = res.map(r => r[0]), vers = new Map(res.map(r => [r[0], r[1].v]));
  const prev = s.last || new Map(), docs = [];
  for (const [id, x] of res) if (force || prev.get(id) !== x.v) docs.push(docPayload(s.conn, s.q.col, id, x));
  const same = !force && prev.size === vers.size && !docs.length && s.ids && s.ids.length === ids.length && s.ids.every((x, i) => x === ids[i]);
  s.last = vers;
  if (same) return;
  s.ids = ids; STAT.r += docs.length || 1;
  send(s.conn, { ev: 'q', sid: s.sid, ids, docs });
}
let NQ = null;   // gom thay đổi trong 15 ms rồi mới đẩy cho người nghe (nhiều lệnh ghi dồn dập -> 1 lần đẩy)
function notify(changed) {
  if (!NQ) { NQ = { cols: new Set(), paths: new Set() }; setTimeout(flushNotify, 15); }
  for (const c of changed) { NQ.cols.add(c.col); NQ.paths.add(c.col + '/' + c.id); }
}
function flushNotify() {
  const q = NQ; NQ = null; if (!q) return;
  const cols = q.cols, paths = q.paths;
  for (const s of SUBS) {
    try { if (s.kind === 'doc') { if (paths.has(s.path)) pushDoc(s); } else if (cols.has(s.q.col)) pushQuery(s); }
    catch (e) { console.error('[qd] đẩy dữ liệu lỗi', s.sid, e && e.message); }
  }
}
function resendAll() { for (const s of SUBS) { if (s.kind === 'doc') { s.last = -1; pushDoc(s); } else pushQuery(s, true); } }
function reauthAll() { for (const c of CONNS) if (c.u) authConn(c, c.u); }   // vai trò đổi -> cập nhật ngay

/* ---------------------------------- WEBSOCKET (tự viết, không cần thư viện) ---------------------------------- */
function isLocalReq(req) { const ra = req.socket.remoteAddress || ''; return !req.headers['x-forwarded-for'] && /^(::1|127\.|::ffff:127\.)/.test(ra); }
function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  socket.setNoDelay(true);
  const conn = { socket, buf: Buffer.alloc(0), alive: true, ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(), frag: null, u: '', role: '', at: Date.now(), ua: String(req.headers['user-agent'] || '').slice(0, 120) };
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
    if (len > 16 * 1024 * 1024) { conn.socket.destroy(); return; }
    const mk = masked ? 4 : 0; if (b.length < off + mk + len) return;
    let data = b.subarray(off + mk, off + mk + len);
    if (masked) { const m = b.subarray(off, off + 4); data = Buffer.from(data); for (let i = 0; i < data.length; i++) data[i] ^= m[i & 3]; }
    conn.buf = b.subarray(off + mk + len);
    STAT.inB += off + mk + len;
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
  STAT.outB += head.length + n;
  conn.socket.write(Buffer.concat([head, data]));
}
function send(conn, o) { try { wsSend(conn, JSON.stringify(o)); } catch (e) {} }
const CONNS = new Set();
function drop(conn) { if (!CONNS.has(conn)) return; CONNS.delete(conn); for (const s of SUBS) if (s.conn === conn) SUBS.delete(s); try { conn.socket.destroy(); } catch (e) {} }
setInterval(() => { for (const c of CONNS) { if (!c.alive) { drop(c); continue; } c.alive = false; wsSend(c, '', 0x9); } }, 30000);

/* ---------------------------------- THỐNG KÊ TÀI NGUYÊN (lấy mẫu 2 giây / lần, giữ 30 phút) ---------------------------------- */
const STAT = { r: 0, w: 0, req: 0, inB: 0, outB: 0 }, HIST = [];
let lastCpu = null, lastNet = null, lastT = Date.now(), lastStat = Object.assign({}, STAT);
function readCpu() { try { const l = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number); const idle = l[3] + (l[4] || 0), total = l.reduce((a, b) => a + b, 0); return { idle, total }; } catch (e) { return null; } }
function readNet() { try { let rx = 0, tx = 0; for (const ln of fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2)) { const m = ln.trim().split(/[:\s]+/); if (!m[0] || m[0] === 'lo') continue; rx += +m[1] || 0; tx += +m[9] || 0; } return { rx, tx }; } catch (e) { return null; } }
function readMem() { try { const o = {}; for (const ln of fs.readFileSync('/proc/meminfo', 'utf8').split('\n')) { const m = /^(\w+):\s+(\d+)/.exec(ln); if (m) o[m[1]] = +m[2] * 1024; } return { total: o.MemTotal, avail: o.MemAvailable, swapTotal: o.SwapTotal || 0, swapFree: o.SwapFree || 0 }; } catch (e) { return { total: os.totalmem(), avail: os.freemem(), swapTotal: 0, swapFree: 0 }; } }
function sample() {
  const now = Date.now(), dt = Math.max(0.5, (now - lastT) / 1000), cpu = readCpu(), net = readNet(), mem = readMem();
  let cpuPct = null;
  if (cpu && lastCpu && cpu.total > lastCpu.total) cpuPct = Math.max(0, Math.min(100, 100 * (1 - (cpu.idle - lastCpu.idle) / (cpu.total - lastCpu.total))));
  const rx = net && lastNet ? Math.max(0, (net.rx - lastNet.rx) / dt) : 0, tx = net && lastNet ? Math.max(0, (net.tx - lastNet.tx) / dt) : 0;
  HIST.push({ t: now, cpu: cpuPct == null ? null : Math.round(cpuPct * 10) / 10, mem: mem.total ? Math.round((1 - mem.avail / mem.total) * 1000) / 10 : null, rx: Math.round(rx), tx: Math.round(tx),
    r: Math.round((STAT.r - lastStat.r) / dt * 10) / 10, w: Math.round((STAT.w - lastStat.w) / dt * 10) / 10, conns: CONNS.size });
  if (HIST.length > 900) HIST.shift();
  lastCpu = cpu; lastNet = net; lastT = now; lastStat = Object.assign({}, STAT);
}
setInterval(sample, 2000); sample();
function fileSize(f) { try { return fs.statSync(f).size; } catch (e) { return 0; } }
function stats(since) {
  const mem = readMem(), pm = process.memoryUsage(); let disk = null;
  try { const s = fs.statfsSync(DATA); disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; } catch (e) {}
  let docs = 0; for (const m of COLS.values()) docs += m.size;
  const users = new Set(); for (const c of CONNS) if (c.u) users.add(c.u);
  const net = readNet();
  return {
    ver: VER, node: process.version, host: os.hostname(), os: os.type() + ' ' + os.release(), cores: os.cpus().length, cpuModel: (os.cpus()[0] || {}).model || '', load: os.loadavg(),
    mem: { total: mem.total, avail: mem.avail, swapTotal: mem.swapTotal, swapFree: mem.swapFree }, proc: { rss: pm.rss, heap: pm.heapUsed },
    disk, db: { file: fileSize(DBF) + fileSize(DBF + '-wal'), docs, cols: COLS.size, seq: SEQ },
    net: net ? { rxTotal: net.rx, txTotal: net.tx } : null, ws: { inB: STAT.inB, outB: STAT.outB },
    conns: CONNS.size, users: users.size, subs: SUBS.size, uptime: Math.round(process.uptime()), sysUptime: Math.round(os.uptime()), now: Date.now(),
    hist: HIST.filter(h => !since || h.t > since)
  };
}

/* ---------------------------------- SAO LƯU / KHÔI PHỤC / XUẤT ---------------------------------- */
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); };
const safeName = n => /^[\w.\-]+$/.test(String(n || '')) && !String(n).includes('..');
function listBackups() {
  return fs.readdirSync(BK).filter(f => /\.(db|json)(\.gz)?$/.test(f)).map(f => { const st = fs.statSync(path.join(BK, f)); return { name: f, size: st.size, at: st.mtimeMs }; }).sort((a, b) => b.at - a.at);
}
async function makeBackup(tag) {
  const base = 'qd-' + stamp() + (tag ? '-' + String(tag).replace(/[^\w\-]/g, '') : ''), raw = path.join(BK, base + '.db'), gz = raw + '.gz';
  try { fs.unlinkSync(raw); } catch (e) {}
  sql.exec(`VACUUM INTO '${raw.replace(/'/g, "''")}'`);
  await pipeline(fs.createReadStream(raw), zlib.createGzip({ level: 6 }), fs.createWriteStream(gz));
  fs.unlinkSync(raw);
  const all = listBackups();   // bản tự động ban đêm giữ 14 ngày; tổng tối đa 30 bản
  all.filter(b => /-auto\.db\.gz$/.test(b.name) && Date.now() - b.at > 14 * 864e5).forEach(b => { try { fs.unlinkSync(path.join(BK, b.name)); } catch (e) {} });
  listBackups().slice(30).forEach(b => { try { fs.unlinkSync(path.join(BK, b.name)); } catch (e) {} });
  console.log('[qd] đã sao lưu ' + path.basename(gz) + ' (' + fileSize(gz) + ' byte)');
  return path.basename(gz);
}
let lastAutoDay = '';
setInterval(() => { const d = new Date(), key = d.toDateString(); if (d.getHours() === 3 && d.getMinutes() >= 30 && lastAutoDay !== key) { lastAutoDay = key; makeBackup('auto').catch(e => console.error('[qd] sao lưu tự động lỗi', e)); } }, 60000);
function exportObj(onlyCol) {
  const cols = {};
  for (const [c, m] of COLS) { if (onlyCol && c !== onlyCol) continue; const o = {}; for (const [id, x] of m) o[id] = x.d; cols[c] = o; }
  return { format: 'qd-export-1', ver: VER, at: Date.now(), cols };
}
function readBackupFile(f) {   // .db / .db.gz / .json / .json.gz -> [{ col, id, d }]
  let buf = fs.readFileSync(f);
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  if (buf.slice(0, 15).toString('latin1') === 'SQLite format 3') {
    const tmp = path.join(DATA, 'restore-' + process.pid + '.db'); fs.writeFileSync(tmp, buf);
    try {
      const db = new DatabaseSync(tmp, { readOnly: true }), out = [];
      for (const r of db.prepare('SELECT col, id, data FROM docs').iterate()) out.push({ col: r.col, id: r.id, d: JSON.parse(r.data) });
      db.close(); return out;
    } finally { try { fs.unlinkSync(tmp); } catch (e) {} }
  }
  let j; try { j = JSON.parse(buf.toString('utf8')); } catch (e) { throw err('invalid-argument', 'Tệp không phải bản sao lưu QD (.db / .json)'); }
  if (!j || typeof j.cols !== 'object') throw err('invalid-argument', 'Tệp JSON không đúng định dạng xuất của QD');
  const out = []; for (const c of Object.keys(j.cols)) for (const id of Object.keys(j.cols[c] || {})) { splitPath(c + '/' + id); out.push({ col: c, id, d: j.cols[c][id] }); }
  return out;
}
async function restoreFrom(f, mode) {
  const items = readBackupFile(f);
  if (!items.length && mode !== 'merge') throw err('invalid-argument', 'Tệp sao lưu trống');
  const before = await makeBackup('truoc-khoi-phuc'), now = Date.now();
  sql.exec('BEGIN');
  try {
    if (mode !== 'merge') sql.exec('DELETE FROM docs');
    for (const it of items) qPut.run(it.col + '/' + it.id, it.col, it.id, JSON.stringify(it.d), ++SEQ, now);
    qMetaSet.run('seq', String(SEQ)); sql.exec('COMMIT');
  } catch (e) { try { sql.exec('ROLLBACK'); } catch (x) {} throw e; }
  load(); reauthAll(); resendAll();
  console.log(`[qd] đã khôi phục ${items.length} tài liệu (${mode === 'merge' ? 'gộp' : 'thay toàn bộ'}); bản trước khi khôi phục: ${before}`);
  return { n: items.length, before };
}
function dropCollection(c) {
  const m = COLS.get(c); if (!m) return 0;
  const n = m.size, changed = [];
  sql.exec('BEGIN');
  try { sql.prepare('DELETE FROM docs WHERE col = ?').run(c); sql.exec('COMMIT'); } catch (e) { try { sql.exec('ROLLBACK'); } catch (x) {} throw e; }
  for (const id of m.keys()) changed.push({ col: c, id, del: true });
  COLS.delete(c); notify(changed);
  console.log(`[qd] đã xóa bộ sưu tập ${c} (${n} tài liệu)`);
  return n;
}
async function selfUpdate() {
  const r = await fetch(SRC_URL + '?t=' + Date.now()); if (!r.ok) throw err('unavailable', 'Không tải được bản mới (' + r.status + ')');
  const txt = await r.text(), next = path.join(__dirname, 'server.next.js');
  try { fs.writeFileSync(next, txt); } catch (e) { throw err('permission-denied', 'Máy chủ chưa có quyền tự cập nhật — chạy "qd update" trên VPS một lần'); }
  try { execFileSync(process.execPath, ['--check', next], { stdio: 'pipe' }); } catch (e) { fs.unlinkSync(next); throw err('internal', 'Bản mới bị lỗi cú pháp, giữ bản cũ'); }
  const ver = (/const VER = '([^']+)'/.exec(txt) || [])[1] || '?';
  fs.renameSync(next, __filename);
  console.log('[qd] đã tải bản mới ' + ver + ', khởi động lại...');
  setTimeout(() => process.exit(0), 400);   // systemd tự chạy lại
  return ver;
}

/* ---------------------------------- XỬ LÝ YÊU CẦU QUA WEBSOCKET ---------------------------------- */
const RATE = 600, DONE = new Map();
async function admin(conn, m) {
  if (!isAdmin(conn)) throw err('permission-denied', 'Chỉ Admin dùng được chức năng quản trị máy chủ');
  switch (m.fn) {
    case 'stats': return stats(m.since);
    case 'cols': { const out = []; for (const [c, mm] of COLS) { let b = 0, last = 0; for (const x of mm.values()) { b += JSON.stringify(x.d).length; if (x.ut > last) last = x.ut; } out.push({ col: c, n: mm.size, bytes: b, last }); } return out.sort((a, b) => b.bytes - a.bytes); }
    case 'list': {
      const mm = COLS.get(m.col) || new Map(), q = String(m.q || '').toLowerCase(), all = [];
      for (const [id, x] of mm) { const js = JSON.stringify(x.d); if (q && !id.toLowerCase().includes(q) && !js.toLowerCase().includes(q)) continue; all.push({ id, ut: x.ut, v: x.v, size: js.length, preview: js.slice(0, 220) }); }
      all.sort((a, b) => m.sort === 'id' ? (a.id < b.id ? -1 : 1) : b.ut - a.ut);
      const off = Math.max(0, +m.offset || 0), lim = Math.min(500, Math.max(1, +m.limit || 50));
      return { total: all.length, items: all.slice(off, off + lim) };
    }
    case 'doc': { const x = getDoc(m.path); return x ? { exists: true, d: x.d, v: x.v, ut: x.ut } : { exists: false }; }
    case 'dropCol': { if (!m.col || m.confirm !== m.col) throw err('invalid-argument', 'Gõ đúng tên bộ sưu tập để xác nhận'); const bk = await makeBackup('truoc-xoa-' + m.col); return { n: dropCollection(m.col), backup: bk }; }
    case 'backups': return listBackups();
    case 'backup': return { name: await makeBackup('tay') };
    case 'delBackup': { if (!safeName(m.name)) throw err('invalid-argument', 'Tên tệp sai'); fs.unlinkSync(path.join(BK, m.name)); return { ok: true }; }
    case 'restore': { if (!safeName(m.name)) throw err('invalid-argument', 'Tên tệp sai'); return restoreFrom(path.join(BK, m.name), m.mode); }
    case 'logs': return LOGS.slice(-(+m.n || 200));
    case 'conns': return [...CONNS].map(c => ({ u: c.u, role: c.role, ip: c.ip, at: c.at, ua: c.ua, subs: [...SUBS].filter(s => s.conn === c).length }));
    case 'restart': setTimeout(() => process.exit(0), 300); return { ok: true };
    case 'update': return { ver: await selfUpdate() };
    case 'token': return { token: sign(conn.u || 'admin') };
    case 'owner': {   // ai là Chủ hệ thống; claim = true: Admin đang đăng nhập tự nhận khi hệ thống CHƯA có chủ
      const accs = COLS.get('accounts') || new Map(); let own = null;
      for (const [id, x] of accs) if (x.d && x.d.owner === true) { own = { id, u: x.d.user }; break; }
      if (!m.claim) return { owner: own };
      if (own) throw err('failed-precondition', 'Hệ thống đã có Chủ: @' + own.u);
      const me = conn.u && findAccount(conn.u); if (!me || roleOf(conn.u) !== 'admin') throw err('permission-denied', 'Chỉ Quản trị viên tự nhận được');
      commit([{ op: 'update', path: 'accounts/' + me.id, data: { owner: true, ownerAt: Date.now() } }], null, { local: true });
      console.log('[qd] @' + conn.u + ' nhận làm Chủ hệ thống');
      return { owner: { id: me.id, u: conn.u } };
    }   // mã cho đường tải tệp (sao lưu / xuất dữ liệu)
    default: throw err('invalid-argument', 'Lệnh quản trị lạ: ' + m.fn);
  }
}
function onText(conn, txt) {
  let m; try { m = JSON.parse(txt); } catch (e) { return; }
  const now = Date.now(); STAT.req++;
  if (!conn.rt || now - conn.rt > 10000) { conn.rt = now; conn.rn = 0; }
  if (++conn.rn > RATE && !isStaff(conn)) return send(conn, { re: m.r, code: 'resource-exhausted', message: 'Gửi yêu cầu quá nhanh' });
  const fail = e => { send(conn, { re: m.r, code: e.code || 'internal', message: String(e.message || e).slice(0, 300) }); if (!e.code) console.error('[qd]', e); };
  try {
    switch (m.op) {
      case 'hello': return send(conn, { re: m.r, ok: true, ver: VER, now: Date.now() });
      case 'login': {   // đúng tên + mật khẩu -> cấp mã xác thực 60 ngày
        let a = null; const um = COLS.get('accounts'); if (um) for (const [id, x] of um) if (x.d && x.d.user === String(m.u || '') && x.d.pass === m.p) { a = { id, d: x.d }; break; }   // trùng tên (dữ liệu cũ): lấy đúng tài khoản khớp mật khẩu
        if (!a) { conn.u = ''; conn.role = ''; return send(conn, { re: m.r, code: 'unauthenticated', message: 'Sai tên đăng nhập hoặc mật khẩu' }); }
        authConn(conn, a.d.user); return send(conn, { re: m.r, ok: true, token: sign(a.d.user), role: conn.role, u: conn.u });
      }
      case 'auth': { const o = verify(m.token); if (!o) { conn.u = ''; conn.role = ''; return send(conn, { re: m.r, code: 'unauthenticated', message: 'Mã xác thực hết hạn' }); } authConn(conn, o.u); return send(conn, { re: m.r, ok: true, role: conn.role, u: conn.u }); }
      case 'logout': conn.u = ''; conn.role = ''; return send(conn, { re: m.r, ok: true });
      case 'get': { STAT.r++; const x = getDoc(m.path); return send(conn, { re: m.r, ok: true, exists: !!x, d: x ? view(conn, splitPath(m.path).col, x.d) : null, v: x ? x.v : 0, ut: x ? x.ut : 0 }); }
      case 'query': { const res = runQuery(m.q); STAT.r += res.length || 1; return send(conn, { re: m.r, ok: true, docs: res.map(([id, x]) => docPayload(conn, m.q.col, id, x)) }); }
      case 'commit': {
        if (m.cid && DONE.has(m.cid)) return send(conn, Object.assign({ re: m.r }, DONE.get(m.cid)));
        let out; try { const r = commit(m.writes || [], m.pre || null, conn); out = { ok: true, v: r.v }; if ((m.writes || []).some(w => /^accounts\//.test(w.path))) reauthAll(); }
        catch (e) { out = { code: e.code || 'internal', message: String(e.message || e).slice(0, 300) }; if (!e.code) console.error('[qd]', e); }
        if (m.cid) { DONE.set(m.cid, out); if (DONE.size > 20000) DONE.delete(DONE.keys().next().value); }
        return send(conn, Object.assign({ re: m.r }, out));
      }
      case 'sub': {
        const s = { conn, sid: m.sid, kind: m.path ? 'doc' : 'query', path: m.path, q: m.q, last: m.path ? -1 : null };
        if (s.kind === 'doc') splitPath(s.path); else runQuery(s.q);
        for (const o of SUBS) if (o.conn === conn && o.sid === m.sid) SUBS.delete(o);
        SUBS.add(s); send(conn, { re: m.r, ok: true });
        if (s.kind === 'doc') pushDoc(s); else pushQuery(s, true);
        return;
      }
      case 'unsub': { for (const s of SUBS) if (s.conn === conn && s.sid === m.sid) SUBS.delete(s); return send(conn, { re: m.r, ok: true }); }
      case 'admin': return admin(conn, m).then(data => send(conn, { re: m.r, ok: true, data }), fail);
      default: throw err('invalid-argument', 'Lệnh lạ: ' + m.op);
    }
  } catch (e) { fail(e); }
}


/* ==================================================================================================
   BOT BÁO CÁO (chuyển từ máy chủ Google Apps Script bot-server.gs sang VPS): đọc settings/report_bot,
   tới mốc giờ -> giành quyền bot_reports/{ngày_giờ} -> thu số liệu -> gửi tin vào Kênh Chung. Trạng thái: settings/report_bot_server.
   Phần cấu hình / lịch / thu số liệu / soạn tin giữ nguyên như bản Apps Script (srv-12) và bộ máy Bot trên web.
   ================================================================================================== */
const BOT_VER = 'vps-bot-1', BOT_LOCAL = { local: true, u: '', role: '' }, BOT_BUSY_MS = 120 * 1000, BOT_MAX_TRIES = 10;
var VN = 7 * 3600e3, BOT = 'qd_bot', DAY = 864e5;
var WD = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
var DEF = {
  isEnabled: false, enabledAt: 0, schedAt: 0,
  times: ['20:00'], days: [0, 1, 2, 3, 4, 5, 6], from: '', to: '',
  grace: 60,
  botName: 'Bot Báo Cáo',
  title: '📋 BÁO CÁO HOẠT ĐỘNG — {thu}, {ngay}',
  footer: 'Cảm ơn anh em đã có mặt hôm nay! Ai chưa điểm danh nhớ vào đúng giờ nhé 💪',
  sec: { att: true, login: true, loginNoAtt: true, noLogin: false, locked: true, gameId: true, bank: true },
  tag: true, showTime: true, excludeStaff: true, exclude: [], maxNames: 100, skipEmpty: false
};
var ACC_FIELDS = ['user', 'role', 'isBlocked', 'lockReason', 'lastActive', 'online', 'lastLoginDate', 'lastLoginAt'];
function pad(n) { return (n < 10 ? '0' : '') + n; }
function vnParts(t) {
  var d = new Date((t == null ? Date.now() : t) + VN);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
function dateKey(p) { return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
function dateVN(p) { return p.d + '/' + p.m + '/' + p.y; }
function dateShow(p) { return pad(p.d) + '/' + pad(p.m) + '/' + p.y; }
function dayStart(p) { return Date.UTC(p.y, p.m - 1, p.d) - VN; }
function hm(t) { var p = vnParts(t); return pad(p.h) + ':' + pad(p.mi); }

function norm(c) {
  c = c || {};
  var o = JSON.parse(JSON.stringify(DEF)), n = function (v, def, lo, hi) { v = parseInt(v, 10); return isNaN(v) ? def : Math.max(lo, Math.min(hi, v)); };
  o.isEnabled = c.isEnabled === true; o.enabledAt = +c.enabledAt || 0; o.schedAt = +c.schedAt || 0;
  if (Array.isArray(c.times)) {
    var seen = {};
    o.times = c.times.map(function (t) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim()); if (!m || +m[1] > 23 || +m[2] > 59) return null; return pad(+m[1]) + ':' + m[2]; })
      .filter(function (t) { if (!t || seen[t]) return false; seen[t] = 1; return true; }).sort().slice(0, 12);
  }
  if (Array.isArray(c.days)) { var sd = {}; o.days = c.days.map(Number).filter(function (x) { if (!(x >= 0 && x <= 6) || sd[x]) return false; sd[x] = 1; return true; }).sort(); }
  var dk = /^\d{4}-\d{2}-\d{2}$/;
  o.from = dk.test(c.from || '') ? c.from : ''; o.to = dk.test(c.to || '') ? c.to : '';
  o.grace = n(c.grace, DEF.grace, 5, 720);
  ['botName', 'title', 'footer'].forEach(function (k) { if (typeof c[k] === 'string') o[k] = c[k].slice(0, k === 'botName' ? 40 : 300); });
  if (!o.botName.trim()) o.botName = DEF.botName;
  if (c.sec && typeof c.sec === 'object') Object.keys(o.sec).forEach(function (k) { if (typeof c.sec[k] === 'boolean') o.sec[k] = c.sec[k]; });
  ['tag', 'showTime', 'excludeStaff', 'skipEmpty'].forEach(function (k) { if (typeof c[k] === 'boolean') o[k] = c[k]; });
  if (Array.isArray(c.exclude)) o.exclude = c.exclude.map(function (u) { return String(u).replace(/^@/, '').trim(); }).filter(Boolean).slice(0, 300);
  o.maxNames = n(c.maxNames, DEF.maxNames, 10, 500);
  return o;
}
function dayOk(cfg, p) {
  if (cfg.days.indexOf(p.wd) < 0) return false;
  var k = dateKey(p);
  return !(cfg.from && k < cfg.from) && !(cfg.to && k > cfg.to);
}
function slotsFor(cfg, p) {
  if (!dayOk(cfg, p)) return [];
  var k = dateKey(p), st = dayStart(p);
  return cfg.times.map(function (t) { var a = t.split(':'); return { time: t, key: k, ts: st + (+a[0]) * 3600e3 + (+a[1]) * 60e3, runId: k + '_' + a[0] + a[1] }; });
}
function nextRun(cfg, now) {
  if (!cfg.times.length || !cfg.days.length) return null;
  for (var i = 0; i < 400; i++) {
    var p = vnParts(now + i * DAY);
    if (cfg.to && dateKey(p) > cfg.to) return null;
    var s = slotsFor(cfg, p).filter(function (x) { return x.ts > now; })[0];
    if (s) return s;
  }
  return null;
}
function collect(cfg, at) {
  var p = vnParts(at), start = dayStart(p), key = dateKey(p), d1 = dateVN(p), d2 = dateShow(p);
  var ex = {}; cfg.exclude.forEach(function (u) { ex[u.toLowerCase()] = 1; });
  var accDocs = botList('accounts');
  var attDocs = botList('attendance').filter(function (x) { return x.date === d1 || x.date === d2; });
  var accs = [], by = {}, locked = [];
  accDocs.forEach(function (a) {
    var u = String(a.user || '').trim();
    if (!u || u === BOT || ex[u.toLowerCase()]) return;
    var role = a.role || (u === 'admin' ? 'admin' : 'user');
    if (cfg.excludeStaff && (role === 'admin' || role === 'manager')) return;
    if (a.isBlocked === true) { locked.push({ u: u, why: a.lockReason === 'security' ? 'nghi gian lận' : '' }); return; }
    var o = { u: u, role: role, la: +a.lastActive || 0, online: a.online !== false, ll: a.lastLoginDate === key ? (+a.lastLoginAt || 0) : 0 };
    accs.push(o); by[u] = o;
  });
  var att = {};
  attDocs.forEach(function (x) {
    var u = x.userName; if (!u || !by[u]) return;
    var ts = +x.timestamp || 0; if (!att[u] || ts < att[u].ts) att[u] = { ts: ts, time: x.time || '' };
  });
  var cmpName = function (a, b) { return a.u.localeCompare(b.u, 'vi', { sensitivity: 'base' }); };
  // Ai đã khai ID (users) / ngân hàng (bank_info): chỉ lấy tên + giờ khai. Không đọc được -> bỏ qua mục đó, báo cáo vẫn gửi.
  var idTs = {}, bkTs = {}, idOk = true, bkOk = true;
  try {
    botList('users').forEach(function (x) {
      var u = String(x.submitter || '').trim(), ts = +x.timestamp || 0;
      if (u && by[u] && x.gameId && (!idTs[u] || ts > idTs[u].ts)) idTs[u] = { ts: ts };
    });
  } catch (e) { idOk = false; }
  try {
    botList('bank_info').forEach(function (x) {
      var u = String(x.user || x._id || '').trim(), ts = +x.changedAt || +x.updatedAt || 0;
      if (u && by[u] && x.accNo) bkTs[u] = { ts: ts };
    });
  } catch (e) { bkOk = false; }
  var byTs = function (m) { return function (a, b) { return (m[a.u].ts || 0) - (m[b.u].ts || 0); }; };
  var idDone = accs.filter(function (a) { return idTs[a.u]; }), bkDone = accs.filter(function (a) { return bkTs[a.u]; });
  var attended = accs.filter(function (a) { return att[a.u]; }).sort(function (a, b) { return att[a.u].ts - att[b.u].ts; });
  var logged = accs.filter(function (a) { return att[a.u] || a.ll || a.la >= start; }).sort(cmpName);
  var inLog = {}; logged.forEach(function (a) { inLog[a.u] = 1; });
  return {
    at: at, p: p, total: accs.length, att: att, attended: attended, loggedIn: logged,
    loginNoAtt: logged.filter(function (a) { return !att[a.u]; }),
    noLogin: accs.filter(function (a) { return !inLog[a.u]; }).sort(cmpName),
    locked: locked.sort(cmpName),
    idOk: idOk, idTs: idTs, idDone: idDone, idNew: idDone.filter(function (a) { return idTs[a.u].ts >= start; }).sort(byTs(idTs)), idMissing: accs.filter(function (a) { return !idTs[a.u]; }).sort(cmpName),
    bkOk: bkOk, bkTs: bkTs, bkDone: bkDone, bkNew: bkDone.filter(function (a) { return bkTs[a.u].ts >= start; }).sort(byTs(bkTs)), bkMissing: accs.filter(function (a) { return !bkTs[a.u]; }).sort(cmpName),
    online: accs.filter(function (a) { return a.online && at - a.la < 120000; }).length
  };
}

function fill(tpl, v) { return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }
function compose(cfg, d) {
  var men = {};
  function list(arr, withTime, empty) {
    if (!arr.length) return empty || '— Chưa có ai —';
    var shown = arr.slice(0, cfg.maxNames);
    var s = shown.map(function (a) {
      if (cfg.tag) men[a.u] = 1;
      var tm = withTime === true ? d.att : withTime;   // true = giờ điểm danh; hoặc bảng giờ khai báo
      return (cfg.tag ? '@' : '') + a.u + (tm && cfg.showTime && tm[a.u] && tm[a.u].ts ? ' (' + hm(tm[a.u].ts) + ')' : '') + (a.why ? ' (' + a.why + ')' : '');
    }).join(', ');
    if (arr.length > shown.length) s += ' … và ' + (arr.length - shown.length) + ' người khác';
    return s;
  }
  var pct = d.total ? Math.round(d.attended.length * 1000 / d.total) / 10 : 0;
  var v = { ngay: dateShow(d.p), thu: WD[d.p.wd], gio: hm(d.at), diemdanh: d.attended.length, dangnhap: d.loggedIn.length,
    chuadiemdanh: d.loginNoAtt.length, chuavao: d.noLogin.length, bikhoa: d.locked.length, tong: d.total, tile: String(pct).replace('.', ',') + '%', bot: cfg.botName,
    khaiid: d.idDone.length, chuakhaiid: d.idMissing.length, khainh: d.bkDone.length, chuakhainh: d.bkMissing.length };
  var out = [], t = fill(cfg.title, v).trim();
  if (t) out.push(t);
  out.push('⏰ Chốt số liệu lúc ' + v.gio + ' · ' + d.total + ' thành viên');
  if (cfg.sec.att) out.push('', '✅ ĐÃ ĐIỂM DANH: ' + d.attended.length + '/' + d.total + ' (' + v.tile + ')', list(d.attended, true));
  if (cfg.sec.login) out.push('', '🔐 ĐĂNG NHẬP HÔM NAY: ' + d.loggedIn.length + '/' + d.total, list(d.loggedIn));
  if (cfg.sec.loginNoAtt) out.push('', '⚠️ ĐÃ VÀO NHƯNG CHƯA ĐIỂM DANH: ' + d.loginNoAtt.length, list(d.loginNoAtt));
  if (cfg.sec.noLogin) out.push('', '😴 CHƯA ĐĂNG NHẬP: ' + d.noLogin.length, list(d.noLogin));
  if (cfg.sec.locked) out.push('', '🔒 TÀI KHOẢN BỊ KHÓA: ' + d.locked.length, list(d.locked, false, '— Không có tài khoản nào bị khóa —'));
  function decl(on, ok, icon, label, done, fresh, miss, tm) {
    if (!on || !ok) return;
    out.push('', icon + ' ' + label + ': ' + done.length + '/' + d.total + ' đã khai' + (fresh.length ? ' · hôm nay +' + fresh.length : ''));
    if (fresh.length) out.push('🆕 Mới khai hôm nay: ' + list(fresh, tm));
    out.push('⏳ Chưa khai: ' + (miss.length ? miss.length + ' — ' : '') + list(miss, false, 'Tất cả đã khai 🎉'));
  }
  decl(cfg.sec.gameId, d.idOk, '🆔', 'KHAI BÁO ID', d.idDone, d.idNew, d.idMissing, d.idTs);
  decl(cfg.sec.bank, d.bkOk, '🏦', 'KHAI BÁO TÀI KHOẢN NGÂN HÀNG', d.bkDone, d.bkNew, d.bkMissing, d.bkTs);
  var f = fill(cfg.footer, v).trim(); if (f) out.push('', f);
  return {
    text: out.join('\n').slice(0, 30000), mentions: Object.keys(men),
    counts: { total: d.total, att: d.attended.length, login: d.loggedIn.length, loginNoAtt: d.loginNoAtt.length, noLogin: d.noLogin.length, locked: d.locked.length, online: d.online,
      gameId: d.idDone.length, gameIdNew: d.idNew.length, bank: d.bkDone.length, bankNew: d.bkNew.length }
  };
}


function botList(c) { const m = COLS.get(c), out = []; if (m) for (const [id, x] of m) out.push(Object.assign({ _id: id }, x.d)); return out; }
function botAutoId() { return crypto.randomBytes(15).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 20).padEnd(20, 'x'); }
function botCfg() { const x = getDoc('settings/report_bot'); return norm(x ? x.d : null); }
function botFloor(cfg) { return Math.max(cfg.enabledAt || 0, cfg.schedAt || 0) - 60000; }
function botDue(cfg, now) {
  const floor = botFloor(cfg);
  return slotsFor(cfg, vnParts(now - DAY)).concat(slotsFor(cfg, vnParts(now))).filter(s => s.ts <= now && now - s.ts <= cfg.grace * 60000 && s.ts >= floor);
}
function botClaim(path, slot, manual) {
  const cur = getDoc(path), x = cur ? cur.d : null, t = Date.now();
  if (x) {
    if (x.status === 'sent' || x.status === 'skipped') return 'done';
    if (x.status === 'sending' && t - (+x.at || 0) < BOT_BUSY_MS) return 'busy';
    if ((x.tries || 0) >= BOT_MAX_TRIES) return 'giveup';
  }
  const rec = { runId: slot.runId, slot: slot.time, dateKey: slot.key, due: slot.ts, status: 'sending', by: 'máy chủ VPS', byRole: 'server', at: t, tries: ((x && x.tries) || 0) + 1, manual: !!manual };
  try { commit([{ op: 'set', path, data: rec, merge: true }], { [path]: cur ? cur.v : 0 }, BOT_LOCAL); } catch (e) { if (e.code === 'aborted') return 'busy'; throw e; }
  return 'ok';
}
function botSend(slot, cfg, manual) {
  const path = 'bot_reports/' + slot.runId, got = botClaim(path, slot, manual);
  if (got !== 'ok') return { ok: false, reason: got };
  try {
    const data = collect(cfg, Date.now()), comp = compose(cfg, data);
    if (cfg.skipEmpty && !manual && !data.loggedIn.length) {
      commit([{ op: 'set', path, data: { status: 'skipped', note: 'Hôm nay chưa ai đăng nhập', doneAt: Date.now(), counts: comp.counts }, merge: true }], null, BOT_LOCAL);
      return { ok: false, reason: 'done', skipped: true };
    }
    const id = botAutoId(), t = Date.now();
    const msg = { conversationId: 'general_room', from: BOT, to: 'all', text: comp.text, imageUrl: null, time: t, read: false, heart: false, hearts: [], readBy: [], bot: true, botName: cfg.botName, mentions: comp.mentions, reportId: slot.runId };
    const rep = { status: 'sent', msgId: id, sentAt: t, counts: comp.counts, text: comp.text.slice(0, 6000), err: '' };
    commit([{ op: 'set', path: 'private_chat/' + id, data: msg }, { op: 'set', path, data: rep, merge: true }], null, BOT_LOCAL);
    return { ok: true, msgId: id };
  } catch (e) {
    try { commit([{ op: 'set', path, data: { status: 'error', err: String(e.message || e).slice(0, 200), errAt: Date.now() }, merge: true }], null, BOT_LOCAL); } catch (er) {}
    throw e;
  }
}
let BOT_HB = { at: 0, err: '' };
function botTick() {
  const now = Date.now(), st = { note: '', err: '', sent: false };
  let cfg = null;
  try {
    cfg = botCfg();
    if (cfg.isEnabled) for (const s of botDue(cfg, now)) {
      try {
        const r = botSend(s, cfg, false);
        if (r.ok) { st.sent = true; st.note = 'Đã gửi mốc ' + s.time; st.err = ''; console.log('[bot] đã gửi báo cáo mốc ' + s.time); }
        else if (r.skipped) st.note = 'Bỏ qua mốc ' + s.time + ' (đang bật "Không gửi khi chưa ai đăng nhập")';
        else if (r.reason === 'giveup') st.err = 'Mốc ' + s.time + ' thử ' + BOT_MAX_TRIES + ' lần vẫn lỗi, đã dừng (xem Lịch sử gửi)';
      } catch (e) { st.err = 'Mốc ' + s.time + ': ' + String(e.message || e).slice(0, 200); }
    }
  } catch (e) { st.err = String(e.message || e).slice(0, 200); }
  // Báo "còn sống" cho Admin (tối đa 1 lần / 4 phút, hoặc ngay khi có lỗi / vừa gửi)
  if (st.sent || st.err || BOT_HB.err !== '' || now - BOT_HB.at >= 4 * 60000) {
    const n = cfg && cfg.isEnabled ? nextRun(cfg, now) : null;
    const data = { lastRun: now, ok: !st.err, err: st.err, ver: BOT_VER, every: 1, stopped: false, by: 'vps', nextAt: n ? n.ts : 0 };
    if (st.note) { data.note = st.note; data.noteAt = now; }
    try { commit([{ op: 'set', path: 'settings/report_bot_server', data, merge: true }], null, BOT_LOCAL); BOT_HB = { at: now, err: st.err }; } catch (e) {}
  }
  // Mốc giờ sắp tới trong 20 giây -> hẹn đúng giây đó (không phải chờ lượt sau)
  const n2 = cfg && cfg.isEnabled ? nextRun(cfg, Date.now()) : null;
  if (n2 && n2.ts - Date.now() < 20000) setTimeout(botTick, Math.max(0, n2.ts - Date.now() + 500));
}
setInterval(botTick, 20000); setTimeout(botTick, 5000);

/* ---------------------------------- HTTP ---------------------------------- */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Expose-Headers': 'Content-Disposition' };
function json(res, code, o) { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS)); res.end(JSON.stringify(o)); }
function body(req, max) { return new Promise((ok, no) => { let n = 0; const a = []; req.on('data', c => { n += c.length; if (n > max) { no(err('invalid-argument', 'Quá lớn')); req.destroy(); } else a.push(c); }); req.on('end', () => ok(Buffer.concat(a).toString('utf8'))); req.on('error', no); }); }
function httpConn(req, u) {   // người gọi HTTP: lệnh qd trên VPS (local) hoặc có mã xác thực
  const c = { local: isLocalReq(req), u: '', role: '' };
  const t = (String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/) || [])[1] || u.searchParams.get('t');
  const o = t && verify(t); if (o) authConn(c, o.u);
  return c;
}
let speedBuf = null;
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  try {
    if (u.pathname === '/' || u.pathname === '/health') {
      let n = 0; for (const m of COLS.values()) n += m.size;
      return json(res, 200, { ok: true, ver: VER, docs: n, cols: COLS.size, conns: CONNS.size, subs: SUBS.size, uptime: Math.round(process.uptime()) });
    }
    const c = httpConn(req, u);
    if (u.pathname === '/api/commit' && req.method === 'POST') { const m = JSON.parse(await body(req, 1 << 20) || '{}'); const r = commit(m.writes || [], m.pre || null, c); return json(res, 200, { ok: true, v: r.v }); }
    if (u.pathname === '/api/get' && req.method === 'GET') { if (!isAdmin(c)) throw err('permission-denied', 'Chỉ Admin'); const x = getDoc(u.searchParams.get('path')); return json(res, 200, { ok: true, exists: !!x, d: x ? x.d : null, v: x ? x.v : 0 }); }
    if (u.pathname === '/api/query' && req.method === 'POST') { if (!isAdmin(c)) throw err('permission-denied', 'Chỉ Admin'); const m = JSON.parse(await body(req, 1 << 16) || '{}'); return json(res, 200, { ok: true, docs: runQuery(m.q).map(([id, x]) => ({ id, d: x.d, v: x.v, ut: x.ut })) }); }
    if (u.pathname.startsWith('/api/admin/')) {
      if (!isAdmin(c)) throw err('permission-denied', 'Chỉ Admin dùng được chức năng quản trị máy chủ');
      const fn = u.pathname.slice(11);
      if (fn === 'backup-file' && req.method === 'GET') {
        const n = u.searchParams.get('name'); if (!safeName(n)) throw err('invalid-argument', 'Tên tệp sai');
        const f = path.join(BK, n); if (!fs.existsSync(f)) throw err('not-found', 'Không có tệp');
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/octet-stream', 'Content-Length': fileSize(f), 'Content-Disposition': 'attachment; filename="' + n + '"', 'Cache-Control': 'no-store' }, CORS));
        return fs.createReadStream(f).pipe(res);
      }
      if (fn === 'export' && req.method === 'GET') {
        const cc = u.searchParams.get('col') || '', o = JSON.stringify(exportObj(cc || null), null, u.searchParams.get('pretty') ? 1 : 0);
        const name = 'qd-' + (cc ? cc.replace(/[^\w\-]/g, '_') : 'tat-ca') + '-' + stamp() + '.json';
        const gz = u.searchParams.get('gz') === '1', buf = gz ? zlib.gzipSync(o) : Buffer.from(o);
        res.writeHead(200, Object.assign({ 'Content-Type': gz ? 'application/gzip' : 'application/json; charset=utf-8', 'Content-Length': buf.length, 'Content-Disposition': 'attachment; filename="' + name + (gz ? '.gz' : '') + '"', 'Cache-Control': 'no-store' }, CORS));
        return res.end(buf);
      }
      if (fn === 'restore' && req.method === 'POST') {
        const tmp = path.join(BK, 'upload-' + stamp() + '.bin'); let n = 0;
        await new Promise((ok, no) => { const ws = fs.createWriteStream(tmp); req.on('data', ch => { n += ch.length; if (n > 512 * 1024 * 1024) { req.destroy(); no(err('invalid-argument', 'Tệp quá lớn (tối đa 512 MB)')); } }); req.pipe(ws); ws.on('finish', ok); ws.on('error', no); req.on('error', no); });
        try { const r = await restoreFrom(tmp, u.searchParams.get('mode') === 'merge' ? 'merge' : 'replace'); return json(res, 200, Object.assign({ ok: true }, r)); }
        finally { try { fs.unlinkSync(tmp); } catch (e) {} }
      }
      if (fn === 'speed' && req.method === 'GET') {
        const want = Math.min(32 * 1024 * 1024, Math.max(64 * 1024, +u.searchParams.get('bytes') || 4 * 1024 * 1024));
        if (!speedBuf) speedBuf = crypto.randomBytes(1024 * 1024);
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/octet-stream', 'Content-Length': want, 'Cache-Control': 'no-store' }, CORS));
        let left = want; const more = () => { while (left > 0) { const n = Math.min(left, speedBuf.length); left -= n; if (!res.write(n === speedBuf.length ? speedBuf : speedBuf.subarray(0, n))) return res.once('drain', more); } res.end(); }; return more();
      }
      if (fn === 'speed-up' && req.method === 'POST') { let n = 0; req.on('data', ch => { n += ch.length; }); return req.on('end', () => json(res, 200, { ok: true, bytes: n })); }
      throw err('not-found', 'Không có chức năng ' + fn);
    }
    json(res, 404, { ok: false, code: 'not-found' });
  } catch (e) { if (!res.headersSent) json(res, e.code === 'not-found' ? 404 : e.code === 'aborted' ? 409 : e.code === 'permission-denied' ? 403 : 400, { ok: false, code: e.code || 'internal', message: String(e.message || e).slice(0, 300) }); else try { res.end(); } catch (x) {} }
});
server.on('upgrade', (req, socket) => {
  if (!/^\/ws\b/.test(req.url || '')) { socket.destroy(); return; }
  const c = wsAccept(req, socket); if (c) CONNS.add(c);   // WebSocket luôn phải đăng nhập mới có quyền Ban Quản Trị
});
server.listen(PORT, '127.0.0.1', () => console.log(`[qd] máy chủ ${VER} chạy ở cổng ${PORT}, dữ liệu: ${DATA}`));

function bye() { try { sql.close(); } catch (e) {} process.exit(0); }
process.on('SIGINT', bye); process.on('SIGTERM', bye);
module.exports = { runQuery, commit, getDoc };
