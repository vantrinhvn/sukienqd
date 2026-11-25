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
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), v8 = require('v8');
const { pipeline } = require('stream/promises'), { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const PORT = +process.env.PORT || 8787;
const DATA = process.env.DATA || path.join(__dirname, 'data');
const BK = path.join(DATA, 'backup');
const VER = 'qd-vps-23';
const SRC_URL = 'https://raw.githubusercontent.com/vantrinhvn/sukienqd/main/vps/server.js';
fs.mkdirSync(BK, { recursive: true });

/* ---------------------------------- NHẬT KÝ (giữ 400 dòng gần nhất để xem trong Admin) ---------------------------------- */
const LOGS = [], RUNLOG = path.join(DATA, 'run.log'), PREVLOG = path.join(DATA, 'run.prev.log');
try { if (fs.existsSync(RUNLOG)) fs.renameSync(RUNLOG, PREVLOG); } catch (e) {}   // nhật ký lần chạy trước
['log', 'warn', 'error'].forEach(k => { const o = console[k].bind(console); console[k] = (...a) => { const line = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' ' + (k === 'log' ? '' : k.toUpperCase() + ' ') + a.map(x => typeof x === 'string' ? x : (x && x.stack) || JSON.stringify(x)).join(' '); LOGS.push(line); if (LOGS.length > 400) LOGS.shift(); try { fs.appendFileSync(RUNLOG, line + '\n'); } catch (e) {} o(...a); }; });
function tailFile(f, n) { try { const st = fs.statSync(f), len = Math.min(st.size, 256 * 1024), fd = fs.openSync(f, 'r'), b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, st.size - len); fs.closeSync(fd); return b.toString('utf8').split('\n').filter(Boolean).slice(-n); } catch (e) { return []; } }
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
function err(code, msg, x) { const e = new Error(msg || code); e.code = code; if (x) e.x = x; return e; }

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
function sign(u, sid, dev) { const body = Buffer.from(JSON.stringify(Object.assign({ u, exp: Date.now() + 60 * 864e5 }, sid ? { s: sid } : {}, dev ? { d: dev } : {}))).toString('base64url'); return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url'); }
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
  if ((c === 'acc_sessions' || c === 'acc_devices') && !isStaff(conn)) return {};
  if (c === 'regid_auto' && !isStaff(conn)) return {};   // cấu hình tự kiểm tra quân đoàn (có thể chứa mã dịch vụ): chỉ Ban Quản Trị
  if (c === 'media' && !isStaff(conn)) return d && d.u === conn.u ? d : {};   // video trong tin nhắn: thành viên chỉ thấy của mình   // phiên / thiết bị: chỉ Ban Quản Trị xem
  if (c === 'push_broadcast' && d && d.kind === 'vps_alert' && !isStaff(conn) && d.target !== conn.u) return { kind: d.kind, target: d.target, status: d.status, createdAt: d.createdAt };
  if (c === 'rps_rooms' && d && d.status === 'playing') {
    const o = Object.assign({}, d), u = conn.u || '';
    if (o.p1Choice && d.player1 !== u) o.p1Choice = 'hidden';
    if (o.p2Choice && d.player2 !== u) o.p2Choice = 'hidden';
    return o;
  }
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
const SETTINGS_OPEN = new Set([]);   // cài đặt thành viên được ghi (không còn: dạy Quân Sư AI chỉ Ban Quản Trị; chia sẻ video đi qua lệnh act)
// Chỉ máy chủ (lệnh act) hoặc Ban Quản Trị được ghi: thành viên tự ghi = tự tạo đơn rút tiền / đơn quà / tặng lượt không trừ gì
const SERVER_ONLY = new Set(['point_cashout', 'point_cashout_daily', 'shop_orders', 'point_shop_stock', 'point_shop_daily', 'transfer_history',
  'lixi_history', 'lixi_daily', 'spin_history', 'wheel_stock', 'wheel_questions', 'tranhthuong_history', 'tranhthuong_stock', 'lucky_numbers', 'lucky_number_history', 'lucky_rewards',
  'attendance', 'invite_history', 'gifts', 'gift_claims', 'tournament_rewards', 'con_stats', 'con_history', 'rps_rooms', 'rps_history', 'point_history', 'video_share_log',
  'acc_sessions', 'acc_devices', 'media', 'regid_auto']);
/* Đợt 4: trường trong tài khoản chỉ máy chủ (lệnh act) / Ban Quản Trị được đổi -> thành viên không tự cộng điểm, lượt, mở khóa, đổi tên... */
const ACC_LOCK = new Set(['points', 'spins', 'tickets', 'conThrows', 'conStreak', 'conFreeDate', 'lixiDate', 'lixiAmount', 'lixiCount', 'lixiTotal', 'lastLoginRewardDate',
  'giftDay', 'giftCount', 'hasUsedInvite', 'invitedBy', 'invitedAt', 'inviteCount', 'inviteRewardCount', 'inviteCode', 'isBlocked', 'lockedAt', 'lockReason', 'unlockedAt', 'unlockRequestedAt',
  'role', 'permissions', 'owner', 'user', 'created_at', 'callBanUntil', 'kickAt']);
const UNAUTH_OK = new Set(['pending_users', 'error_logs', 'app_errors', 'security_flags', 'ai_unanswered']);   // chưa đăng nhập: chỉ gửi đơn đăng ký / báo lỗi
const AUDIT = process.env.QD_AUDIT === '1';   // chạy thử: chỉ ghi nhận vi phạm, không chặn
function deny(code, msg, w) { if (AUDIT) { console.error('[audit] ' + code + ' ' + w.op + ' ' + w.path + ' ' + JSON.stringify(w.data || {}).slice(0, 160)); return; } throw err(code, msg); }
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
  const now = Date.now(), m = COLS.get('accounts') || new Map(), mine = new Map(), gone = new Set();
  for (const w of writes) { const p = splitPath(w.path); if (p.col === 'accounts' && w.op === 'delete') gone.add(p.id); }   // xóa + đổi tên trong cùng 1 lần ghi
  for (const w of writes) {
    const { col: c, id } = splitPath(w.path); if (c !== 'accounts' || w.op === 'delete') continue;
    const a = simAccount(w, m.get(id), now); if (!a || typeof a.user !== 'string' || !a.user) continue;
    const u = a.user.toLowerCase(), b = m.get(id);
    if (b && b.d && String(b.d.user || '').toLowerCase() === u) continue;   // không đổi tên
    for (const [oid, x] of m) if (oid !== id && !gone.has(oid) && x.d && String(x.d.user || '').toLowerCase() === u) throw err('already-exists', 'Tên đăng nhập "' + a.user + '" đã có tài khoản khác dùng');
    if (mine.has(u) && mine.get(u) !== id) throw err('already-exists', 'Trùng tên đăng nhập trong cùng 1 lần ghi'); mine.set(u, id);
  }
}
function checkWrites(conn, writes) {
  if (isStaff(conn)) return checkStaffWrites(conn, writes);
  for (const w of writes) {
    const { col: c, id } = splitPath(w.path), cur = (COLS.get(c) || new Map()).get(id);
    if (!conn.u && !UNAUTH_OK.has(c)) { deny('unauthenticated', 'Phiên đăng nhập đã hết, vui lòng đăng nhập lại', w); continue; }
    if (c === 'settings' && !SETTINGS_OPEN.has(id)) throw err('permission-denied', 'Chỉ Ban Quản Trị được sửa cài đặt hệ thống');
    if (SERVER_ONLY.has(c)) throw err('permission-denied', 'Thao tác này do máy chủ xử lý — tải lại trang rồi thử lại');
    if (c === 'users') { regRule(conn, w, cur); continue; }
    if (c === 'gcalls') { gcallRule(conn, w, cur); continue; }
    if (c === 'gcall_sig') { sigRule(conn, w, cur); continue; }
    if (c === 'accounts') {
      if (w.op === 'delete') throw err('permission-denied', 'Chỉ Ban Quản Trị được xóa tài khoản');
      if (!cur && w.op === 'set') throw err('permission-denied', 'Tài khoản mới do Ban Quản Trị duyệt tạo');
      const ks = topKeys(w), d = w.data || {}, own = !!(cur && conn.u && cur.d.user === conn.u);
      const same = (k) => !(k in d) || JSON.stringify(d[k]) === JSON.stringify(cur && cur.d[k]);
      if (ks.some(k => k === 'role' || k === 'permissions') && !(same('role') && same('permissions'))) throw err('permission-denied', 'Không được tự đổi vai trò / quyền');
      if (ks.includes('pass') && !own) throw err('permission-denied', 'Chỉ đổi được mật khẩu của chính mình (đăng nhập lại rồi thử)');
      if (!own) {
        // Tài khoản người khác: chỉ được ghi "khóa gọi" do bot chống quấy rối (chỉ tăng, tối đa 31 ngày)
        const okBan = ks.length && ks.every(k => k === 'callBanUntil') && typeof d.callBanUntil === 'number' && d.callBanUntil > (+(cur && cur.d.callBanUntil) || 0) && d.callBanUntil <= Date.now() + 31 * 864e5;
        if (!okBan) deny('permission-denied', 'Chỉ sửa được tài khoản của chính mình', w);
        continue;
      }
      for (const k of ks) {
        if (!ACC_LOCK.has(k) || k === 'role' || k === 'permissions' || same(k)) continue;
        if (k === 'inviteCode' && !cur.d.inviteCode && typeof d.inviteCode === 'string' && /^[A-Z0-9]{1,20}$/.test(d.inviteCode) && !findInvite(d.inviteCode)) continue;   // lần đầu tạo mã mời
        deny('permission-denied', 'Trường "' + k + '" do máy chủ quản lý — tải lại trang rồi thử lại', w);
      }
    }
  }
}
/* Đăng ký ID game (users): thành viên chỉ gửi được 1 đơn của chính mình, ở trạng thái chờ duyệt.
   Phê duyệt (status: approved = đã vào quân đoàn FF) / báo chưa vào quân đoàn chỉ Ban Quản Trị làm; thành viên không tự sửa / xóa đơn. */
const REG_KEYS = new Set(['name', 'gameId', 'submitter', 'timestamp']);
function regRule(conn, w, cur) {
  if (w.op === 'delete') return deny('permission-denied', 'Muốn sửa đơn, hãy nhờ Ban Quản Trị "Cho phép nộp lại"', w);
  if (cur || w.op !== 'set' || w.merge) return deny('permission-denied', 'Đơn đã gửi không tự sửa được — liên hệ Ban Quản Trị', w);
  const d = w.data || {};
  if (d.submitter !== conn.u) return deny('permission-denied', 'Chỉ gửi được đơn của chính mình', w);
  if (Object.keys(d).some(k => !REG_KEYS.has(k))) return deny('permission-denied', 'Đơn chỉ gồm tên nhân vật và ID game — việc xác thực do Ban Quản Trị làm', w);
  if (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 60 || !/^\d{3,20}$/.test(String(d.gameId || ''))) return deny('invalid-argument', 'Tên nhân vật hoặc ID game không hợp lệ', w);
  for (const [, x] of COLS.get('users') || new Map()) {
    if (x.d && x.d.submitter === conn.u) return deny('already-exists', 'Bạn đã nộp đơn định danh rồi', w);
    if (x.d && String(x.d.gameId) === String(d.gameId)) return deny('already-exists', 'ID game này đã được tài khoản khác đăng ký. Nếu đúng là ID của bạn, hãy báo Ban Quản Trị', w);
  }
}
/* Gọi nhóm: thành viên chỉ đổi được phần của mình trong danh sách người gọi; phần người khác chỉ được gỡ khi họ đã mất kết nối */
function gcallRule(conn, w, cur) {
  if (w.op === 'delete') return deny('permission-denied', 'Không xóa được cuộc gọi nhóm', w);
  if (w.op === 'set' && !w.merge && cur) return deny('permission-denied', 'Cuộc gọi nhóm đã có, chỉ được vào / rời', w);
  const d = w.data || {}, me = conn.u, now = Date.now(), cm = (cur && cur.d && cur.d.members) || {}, who = new Set();
  for (const k of Object.keys(d)) {
    if (k === 'members' && d.members && typeof d.members === 'object' && !isFV(d.members)) Object.keys(d.members).forEach(u => who.add(u));
    else if (k === 'members') return deny('permission-denied', 'Không ghi đè được danh sách người gọi', w);
    else if (k.indexOf('members.') === 0) who.add(k.split('.')[1]);
    else if (cur && ['host', 'room', 'created'].includes(k) && JSON.stringify(d[k]) !== JSON.stringify(cur.d[k]) && cur.d.status !== 'ended') return deny('permission-denied', 'Không đổi được chủ phòng', w);
  }
  for (const u of who) {
    if (u === me) continue;
    const m = cm[u], v = d.members ? d.members[u] : d['members.' + u];
    if (!(m && isFV(v) && v.$fv === 'del' && now - (+m.ping || +m.at || 0) > 60000)) return deny('permission-denied', 'Chỉ vào / rời cuộc gọi nhóm cho chính mình', w);
  }
}
function sigRule(conn, w, cur) {
  const me = conn.u, doc = cur ? cur.d : (w.data || {});
  if (!cur && w.op !== 'delete' && doc.from !== me) return deny('permission-denied', 'Báo hiệu cuộc gọi không đúng người gửi', w);
  if (cur && doc.from !== me && doc.to !== me) return deny('permission-denied', 'Không phải cuộc gọi của bạn', w);
}
/* Dọn cuộc gọi nhóm: gỡ người mất kết nối quá 90 giây; cuộc gọi không còn ai -> kết thúc; báo hiệu cũ quá 10 phút -> xóa */
function gcallTick() {
  try {
    const now = Date.now(), W = [], gm = COLS.get('gcalls'), sm = COLS.get('gcall_sig');
    if (gm) for (const [id, x] of gm) {
      const c = x.d || {}; if (c.status === 'ended') { if (now - (+c.endedAt || +c.updatedAt || 0) > 7 * 864e5 && id !== 'general') W.push({ op: 'delete', path: 'gcalls/' + id }); continue; }
      const ms = c.members || {}, gone = Object.keys(ms).filter(u => now - (+ms[u].ping || +ms[u].at || 0) > 90000);
      if (!gone.length && Object.keys(ms).length) continue;
      const left = Object.keys(ms).length - gone.length, up = { updatedAt: now, members: {} };
      gone.forEach(u => { up.members[u] = { $fv: 'del' }; });
      if (left <= 0 && id !== 'general') { up.status = 'ended'; up.endedAt = now; }
      if (gone.length || up.status) W.push({ op: 'set', merge: true, path: 'gcalls/' + id, data: up });
    }
    if (sm) for (const [id, x] of sm) if (now - (+(x.d && x.d.created) || 0) > 600000) W.push({ op: 'delete', path: 'gcall_sig/' + id });
    if (W.length) commit(W.slice(0, 400), null, ACT_LOCAL);
  } catch (e) { console.error('[gọi nhóm]', e); }
}

function findInvite(code) { const m = COLS.get('accounts'); if (m) for (const [, x] of m) if (x.d && String(x.d.inviteCode || '').toUpperCase() === code) return true; return false; }

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
const KEEP = { accounts: ['pass'].concat(Array.from(ACC_LOCK)) };   // thành viên ghi đè cả tài liệu (set không merge) -> giữ các trường này
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
  for (const c of changed) if (c.col === 'users' && !c.del) { try { ffSoon(c.id); } catch (e) {} }   // đơn ID game mới -> tự tra quân đoàn
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
const SECRET_DOCS = new Set(['settings/lucky_round_presets', 'settings/vps_alert', 'settings/vps_alert_config']);
function viewAt(conn, path, d) { const { col: c, id } = splitPath(path); if (d && !isStaff(conn) && SECRET_DOCS.has(c + '/' + id)) return {}; return view(conn, c, d); }
function docPayload(conn, c, id, x) { return { id, d: SECRET_DOCS.has(c + '/' + id) ? viewAt(conn, c + '/' + id, x.d) : view(conn, c, x.d), v: x.v, ut: x.ut }; }
function pushDoc(s) {
  const x = getDoc(s.path), v = x ? x.v : 0;
  if (s.last === v) return;
  s.last = v; STAT.r++;
  send(s.conn, { ev: 'doc', sid: s.sid, exists: !!x, d: x ? viewAt(s.conn, s.path, x.d) : null, v, ut: x ? x.ut : 0 });
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
    mem: { total: mem.total, avail: mem.avail, swapTotal: mem.swapTotal, swapFree: mem.swapFree }, proc: { rss: pm.rss, heap: pm.heapUsed, heapLimit: v8.getHeapStatistics().heap_size_limit },
    disk, db: { file: fileSize(DBF) + fileSize(DBF + '-wal'), docs, cols: COLS.size, seq: SEQ },
    net: net ? { rxTotal: net.rx, txTotal: net.tx } : null, ws: { inB: STAT.inB, outB: STAT.outB },
    conns: CONNS.size, users: users.size, subs: SUBS.size, uptime: Math.round(process.uptime()), sysUptime: Math.round(os.uptime()), now: Date.now(),
    hist: HIST.filter(h => !since || h.t > since)
  };
}


/* ==================================================================================================
   CẢNH BÁO SỚM: máy chủ tự đo RAM, bộ nhớ máy chủ QĐ, ổ cứng, CPU mỗi phút. Vượt ngưỡng Admin đặt -> gửi thông báo vào app
   của Chủ hệ thống + Quản trị viên (tùy chọn thêm Quản lý), nhắc lại sau N giờ nếu vẫn cao, báo khi trở lại bình thường.
   Bị tắt đột ngột (vd hết RAM) rồi tự bật lại -> cũng báo.
   Cấu hình: settings/vps_alert_config · trạng thái: settings/vps_alert (chỉ Ban Quản Trị đọc được)
   ================================================================================================== */
const ALERT_KEYS = [
  { k: 'ram', name: 'RAM của VPS', icon: '🧠', def: 85 },
  { k: 'heap', name: 'Bộ nhớ máy chủ QĐ', icon: '📦', def: 80 },
  { k: 'disk', name: 'Ổ cứng', icon: '💽', def: 85 },
  { k: 'cpu', name: 'CPU (trung bình 5 phút)', icon: '⚙️', def: 90 }
];
const fmtB = n => { n = +n || 0; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + u[i]; };
function alertCfg() {
  const c = setting('vps_alert_config') || {}, n = (v, d, lo, hi) => { v = Math.round(Number(v)); return isFinite(v) && v > 0 ? Math.min(hi, Math.max(lo, v)) : d; }, o = { on: c.isEnabled !== false, remindH: 6, managers: c.managers === true };
  ALERT_KEYS.forEach(a => { o[a.k] = n(c[a.k], a.def, 30, 99); });
  const r = Number(c.remindH); o.remindH = isFinite(r) && r >= 0 ? Math.min(72, Math.round(r)) : 6;
  return o;
}
const critOf = th => Math.round((th + (100 - th) / 2) * 10) / 10;   // mức nguy hiểm = giữa ngưỡng và 100%
function alertRead() {
  const mem = readMem(), hs = v8.getHeapStatistics(), now = Date.now(); let disk = null;
  try { const st = fs.statfsSync(DATA); disk = { total: st.blocks * st.bsize, free: st.bavail * st.bsize }; } catch (e) {}
  const cs = HIST.filter(h => h.cpu != null && now - h.t <= 5 * 60000);
  const out = {};
  out.ram = mem.total ? { v: (1 - mem.avail / mem.total) * 100, detail: 'đang dùng ' + fmtB(mem.total - mem.avail) + ' / ' + fmtB(mem.total) } : null;
  out.heap = hs.heap_size_limit ? { v: hs.used_heap_size / hs.heap_size_limit * 100, detail: 'đang dùng ' + fmtB(hs.used_heap_size) + ' / giới hạn ' + fmtB(hs.heap_size_limit) } : null;
  out.disk = disk && disk.total ? { v: (1 - disk.free / disk.total) * 100, detail: 'còn trống ' + fmtB(disk.free) + ' / ' + fmtB(disk.total) } : null;
  out.cpu = cs.length >= 60 ? { v: cs.reduce((a, h) => a + h.cpu, 0) / cs.length, detail: os.cpus().length + ' nhân' } : null;   // cần đủ ~2 phút số liệu
  return out;
}
let ALERT = { level: 0, notified: 0, notifiedAt: 0, since: 0, items: [], last: '', raw: {} };
const ALERT_MS = +process.env.QD_ALERT_MS || 60000;   // đo mỗi phút
try { const x = (getDoc('settings/vps_alert') || {}).d; if (x) ALERT = Object.assign(ALERT, { level: x.level || 0, notified: x.notified || 0, notifiedAt: x.notifiedAt || 0, since: x.since || 0 }); } catch (e) {}
function alertRecipients(cfg) {
  const out = [], m = COLS.get('accounts');
  if (m) for (const [, x] of m) { const d = x.d || {}; if (!d.user || d.isBlocked === true) continue; if (d.owner === true || d.role === 'admin' || (cfg.managers && d.role === 'manager')) out.push(d.user); }
  return Array.from(new Set(out));
}
function alertPush(cfg, title, body) {
  const to = alertRecipients(cfg), now = Date.now();
  if (!to.length) return to;
  commit(to.map((u, i) => ({ op: 'set', path: 'push_broadcast/' + actId(), data: { title, body: body.slice(0, 900), image: '', target: u, status: 'pending', createdAt: now + i, by: 'vps-alert', kind: 'vps_alert' } })), null, ACT_LOCAL);
  console.log('[cảnh báo] ' + title + ' -> ' + to.join(', '));
  return to;
}
const pct = v => (Math.round(v * 10) / 10).toLocaleString('vi-VN') + '%';
function alertTick() {
  try {
    const cfg = alertCfg(), r = alertRead(), now = Date.now(), prev = {};
    (ALERT.items || []).forEach(x => { prev[x.k] = x.lv || 0; });
    const items = ALERT_KEYS.map(a => {
      const m = r[a.k]; if (!m) return { k: a.k, name: a.name, icon: a.icon, v: null, th: cfg[a.k], crit: critOf(cfg[a.k]), lv: 0, detail: '' };
      const th = cfg[a.k], crit = critOf(th), was = prev[a.k] || 0;
      const raw = m.v >= crit ? 2 : m.v >= th ? 1 : 0, pr = ALERT.raw[a.k] || 0; ALERT.raw[a.k] = raw;
      let lv = raw > was ? Math.max(was, Math.min(raw, pr)) : raw;   // lên mức phải đúng 2 lần đo liền nhau (bỏ qua vọt lên chốc lát)
      if (was === 2 && lv < 2 && m.v >= crit - 3) lv = 2;          // chống báo bật / tắt liên tục quanh ngưỡng
      if (was >= 1 && lv < 1 && m.v >= th - 5) lv = 1;
      return { k: a.k, name: a.name, icon: a.icon, v: Math.round(m.v * 10) / 10, th, crit, lv, detail: m.detail };
    });
    const level = cfg.on ? Math.max(0, ...items.map(x => x.lv)) : 0, bad = items.filter(x => x.lv > 0).sort((a, b) => b.lv - a.lv || b.v - a.v);
    const lines = bad.map(x => x.icon + ' ' + x.name + ': ' + pct(x.v) + ' (ngưỡng ' + x.th + '%) — ' + x.detail).join('\n');
    if (cfg.on && level > ALERT.notified) {
      alertPush(cfg, (level === 2 ? '🚨 Máy chủ QĐ sắp quá tải' : '⚠️ Máy chủ QĐ đang cao') + ': ' + bad[0].name + ' ' + pct(bad[0].v),
        lines + '\n' + (level === 2 ? 'Cần xử lý ngay: hệ thống có thể chậm hoặc ngừng chạy.' : 'Nên kiểm tra tab Máy chủ VPS trong Admin.'));
      ALERT.notified = level; ALERT.notifiedAt = now; if (!ALERT.since) ALERT.since = now;
    } else if (cfg.on && level >= 1 && cfg.remindH > 0 && now - ALERT.notifiedAt >= cfg.remindH * 3600e3) {
      alertPush(cfg, '⏰ Nhắc lại: máy chủ QĐ vẫn ' + (level === 2 ? 'quá tải' : 'đang cao'), lines + '\nTừ lúc ' + new Date(ALERT.since || now).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) + '.');
      ALERT.notified = level; ALERT.notifiedAt = now;
    } else if (level === 0 && ALERT.notified > 0) {
      if (cfg.on) alertPush(cfg, '✅ Máy chủ QĐ đã trở lại bình thường', items.filter(x => x.v != null).map(x => x.icon + ' ' + x.name + ': ' + pct(x.v)).join('\n'));
      ALERT.notified = 0; ALERT.notifiedAt = now; ALERT.since = 0;
    } else if (level >= 1 && level < ALERT.notified) ALERT.notified = level;
    ALERT.level = level; ALERT.items = items;
    const snap = JSON.stringify([level, ALERT.notified, ALERT.since, cfg, items.map(x => [x.lv, x.v == null ? null : Math.round(x.v)])]);
    if (snap !== ALERT.last || now - (ALERT.wrote || 0) > 10 * 60000) {
      ALERT.last = snap; ALERT.wrote = now;
      commit([{ op: 'set', path: 'settings/vps_alert', data: { level, notified: ALERT.notified, notifiedAt: ALERT.notifiedAt, since: ALERT.since, items, on: cfg.on, managers: cfg.managers, updatedAt: now, restart: ALERT.restart || null } }], null, ACT_LOCAL);
    }
    const iv = k => { const x = items.find(i => i.k === k); return x && x.v != null ? x.v : null; };
    qMetaSet.run('beat', JSON.stringify({ t: now, ram: iv('ram'), heap: iv('heap'), disk: iv('disk') }));
    try { if (fs.statSync(RUNLOG).size > 2 * 1024 * 1024) fs.writeFileSync(RUNLOG, tailFile(RUNLOG, 2000).join('\n') + '\n'); } catch (e) {}
  } catch (e) { console.error('[cảnh báo]', e); }
}
function alertState() {   // số đo mới nhất + ngưỡng đang lưu (mức cảnh báo giữ theo lần đo định kỳ)
  const cfg = alertCfg(), st = Object.assign({}, (getDoc('settings/vps_alert') || {}).d || {}), r = alertRead(), lvOf = {};
  (ALERT.items || []).forEach(x => { lvOf[x.k] = x.lv || 0; });
  st.items = ALERT_KEYS.map(a => { const m = r[a.k]; return { k: a.k, name: a.name, icon: a.icon, v: m ? Math.round(m.v * 10) / 10 : null, th: cfg[a.k], crit: critOf(cfg[a.k]), lv: lvOf[a.k] || 0, detail: m ? m.detail : '' }; });
  st.updatedAt = Date.now(); if (st.level == null) st.level = ALERT.level || 0;
  return { cfg, state: st, recipients: alertRecipients(cfg), every: ALERT_MS };
}
function alertTest(conn) {
  const cfg = alertCfg(), r = alertRead();
  const to = alertPush(cfg, '🧪 Thử cảnh báo máy chủ QĐ', ALERT_KEYS.filter(a => r[a.k]).map(a => a.icon + ' ' + a.name + ': ' + pct(r[a.k].v) + ' (ngưỡng ' + cfg[a.k] + '%)').join('\n') + '\nGửi thử bởi ' + (conn.u || 'Admin') + '. Nhận được thông báo này là cảnh báo sớm đang hoạt động.');
  return { to };
}
// bị tắt đột ngột? (lần chạy trước không đánh dấu tắt đàng hoàng)
function markClean() { try { qMetaSet.run('run', JSON.stringify({ clean: true, at: Date.now() })); } catch (e) {} }
(function () {
  let prev = null, beat = 0, bi = {};
  try { prev = JSON.parse((qMetaGet.get('run') || {}).v || 'null'); const bv = (qMetaGet.get('beat') || {}).v || ''; bi = /^\{/.test(bv) ? JSON.parse(bv) : { t: +bv || 0 }; beat = bi.t || 0; } catch (e) {}
  qMetaSet.run('run', JSON.stringify({ clean: false, at: Date.now(), pid: process.pid }));
  if (prev && prev.clean === false) {
    const down = beat || prev.at, t = new Date(down).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const mem = (bi.ram != null && bi.ram >= 88) || (bi.heap != null && bi.heap >= 85), last = tailFile(PREVLOG, 40), errLine = last.slice().reverse().find(l => / ERROR /.test(l)) || '';
    const why = mem ? 'Nhiều khả năng do hết bộ nhớ' + (bi.heap != null && bi.heap >= 85 ? ' (bộ nhớ máy chủ QĐ ' + pct(bi.heap) + ')' : ' (RAM ' + pct(bi.ram) + ')') + ' lúc cuối còn chạy.'
      : errLine ? 'Lỗi cuối trong nhật ký: ' + errLine.slice(20, 220) : 'Không thấy lỗi trong nhật ký — có thể do VPS khởi động lại, hết RAM đột ngột hoặc bị tắt từ bên ngoài.';
    ALERT.restart = { at: Date.now(), lastSeen: down, why, ram: bi.ram == null ? null : bi.ram, heap: bi.heap == null ? null : bi.heap };
    console.log('[cảnh báo] lần chạy trước bị tắt đột ngột (khoảng ' + t + '). ' + why);
    setTimeout(() => {
      const cfg = alertCfg(), r = alertRead(); if (!cfg.on) return;
      alertPush(cfg, '🔁 Máy chủ QĐ vừa bị tắt đột ngột và đã tự bật lại', 'Lần cuối còn chạy: khoảng ' + t + '.\n' + ALERT.restart.why + '\nHiện tại: ' +
        ALERT_KEYS.filter(a => r[a.k]).map(a => a.name + ' ' + pct(r[a.k].v)).join(' · ') + '.\nXem Admin > Máy chủ VPS > Nhật ký > Lần chạy trước.');
    }, Math.min(20000, ALERT_MS * 4));
  }
})();
setInterval(alertTick, ALERT_MS); setTimeout(alertTick, Math.min(15000, ALERT_MS));

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
/* ---------------------------------- XÓA TẤT CẢ DỮ LIỆU (Admin > Cài đặt Hệ thống > Xóa tất cả dữ liệu) ----------------------------------
   Giữ lại: tài khoản Quản trị (vai trò admin, Chủ hệ thống, người đang thao tác) + phiên đăng nhập / thiết bị của họ.
            Tùy chọn: giữ cả tài khoản Quản lý; giữ cấu hình hệ thống (settings: giải thưởng, lịch mở, bảo trì...).
   Xóa: MỌI bộ sưu tập còn lại (kể cả bộ sưu tập mới thêm sau này) + tệp video tin nhắn trên ổ đĩa.
   Luôn sao lưu toàn bộ trước khi xóa -> khôi phục được ở Máy chủ VPS > Sao lưu. Thành viên đang mở trang bị đăng xuất. */
function wipePlan(conn, o) {
  const keepMgr = o.keepManagers === true, keepCfg = o.keepSettings !== false, keepIds = new Set(), keepUsers = new Set(), kept = [];
  const accs = COLS.get('accounts');
  if (accs) for (const [id, x] of accs) {
    const d = x.d || {};
    if (d.role === 'admin' || d.owner === true || (keepMgr && d.role === 'manager') || (conn.u && d.user === conn.u)) {
      keepIds.add(id); if (d.user) keepUsers.add(d.user); kept.push({ u: d.user || id, role: d.owner === true ? 'owner' : d.role || 'user' });
    }
  }
  const plan = []; let total = 0;
  for (const [c, mm] of COLS) {
    if ((c === 'settings' || c === 'regid_auto') && keepCfg) continue;
    let ids;
    if (c === 'accounts') ids = [...mm.keys()].filter(id => !keepIds.has(id));
    else if (c === 'acc_sessions') ids = [...mm.keys()].filter(id => !keepUsers.has(id) && !keepUsers.has((mm.get(id).d || {}).user));
    else if (c === 'acc_devices') ids = [...mm.keys()].filter(id => !keepUsers.has((mm.get(id).d || {}).user));
    else ids = [...mm.keys()];
    if (ids.length) { plan.push({ col: c, ids, all: ids.length === mm.size }); total += ids.length; }
  }
  let files = 0; try { files = fs.readdirSync(MEDIA).length; } catch (e) {}
  return { plan, total, kept, keepCfg, keepMgr, files };
}
async function wipeAll(conn, m) {
  const P = wipePlan(conn, m);
  const sum = { total: P.total, cols: P.plan.map(p => ({ col: p.col, n: p.ids.length })).sort((a, b) => b.n - a.n), kept: P.kept, keepSettings: P.keepCfg, keepManagers: P.keepMgr, files: P.files };
  if (m.dry) return sum;
  if (String(m.confirm || '') !== 'XOA TAT CA') throw err('invalid-argument', 'Gõ đúng XOA TAT CA để xác nhận');
  if (!P.kept.some(k => k.role === 'admin' || k.role === 'owner')) throw err('failed-precondition', 'Không còn tài khoản Quản trị nào để giữ lại — dừng xóa');
  const backup = await makeBackup('truoc-xoa-tat-ca'), keepU = new Set(P.kept.map(k => k.u));
  let n = 0;
  for (const p of P.plan) {
    if (p.col === 'media') { try { for (const f of fs.readdirSync(MEDIA)) try { fs.unlinkSync(path.join(MEDIA, f)); } catch (e) {} } catch (e) {} }
    if (p.all) { n += dropCollection(p.col); continue; }
    for (let i = 0; i < p.ids.length; i += 500) commit(p.ids.slice(i, i + 500).map(id => ({ op: 'delete', path: p.col + '/' + id })), null, ACT_LOCAL);
    n += p.ids.length;
  }
  const at = Date.now();
  commit([{ op: 'set', path: 'admin_logs/wipe_' + at, data: { type: 'wipe', action: 'delete_all', user: '(hệ thống)', by: conn.u || '(VPS)', count: n, kept: [...keepU], keepSettings: P.keepCfg, keepManagers: P.keepMgr, backup, timestamp: at } }], null, ACT_LOCAL);
  let kicked = 0; for (const u of new Set([...CONNS].map(c => c.u).filter(Boolean))) if (!keepU.has(u)) kicked += kickUser(u, null, 'admin');
  console.log('[qd] XÓA TẤT CẢ DỮ LIỆU bởi @' + (conn.u || 'VPS') + ': ' + n + ' tài liệu, giữ ' + [...keepU].join(', ') + ' — bản sao lưu ' + backup);
  return Object.assign(sum, { n, backup, kicked });
}
async function selfUpdate() {
  const r = await fetch(SRC_URL + '?t=' + Date.now()); if (!r.ok) throw err('unavailable', 'Không tải được bản mới (' + r.status + ')');
  const txt = await r.text(), next = path.join(__dirname, 'server.next.js');
  try { fs.writeFileSync(next, txt); } catch (e) { throw err('permission-denied', 'Máy chủ chưa có quyền tự cập nhật — chạy "qd update" trên VPS một lần'); }
  try { execFileSync(process.execPath, ['--check', next], { stdio: 'pipe' }); } catch (e) { fs.unlinkSync(next); throw err('internal', 'Bản mới bị lỗi cú pháp, giữ bản cũ'); }
  const ver = (/const VER = '([^']+)'/.exec(txt) || [])[1] || '?';
  fs.renameSync(next, __filename);
  console.log('[qd] đã tải bản mới ' + ver + ', khởi động lại...');
  setTimeout(() => { markClean(); process.exit(0); }, 400);   // systemd tự chạy lại
  return ver;
}

/* ---------------------------------- XỬ LÝ YÊU CẦU QUA WEBSOCKET ---------------------------------- */
const RATE = 600, DONE = new Map();
async function admin(conn, m) {
  if (m.fn === 'regTest' || m.fn === 'regCheck' || m.fn === 'regSweep') {   // tự kiểm tra quân đoàn: Quản lý cũng dùng được
    if (!isStaff(conn)) throw err('permission-denied', 'Chỉ Ban Quản Trị dùng được');
    return regAdmin(conn, m);
  }
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
    case 'wipe': return wipeAll(conn, m);   // xóa tất cả dữ liệu, chỉ giữ tài khoản Quản trị (m.dry = chỉ đếm)
    case 'delBackup': { if (!safeName(m.name)) throw err('invalid-argument', 'Tên tệp sai'); fs.unlinkSync(path.join(BK, m.name)); return { ok: true }; }
    case 'restore': { if (!safeName(m.name)) throw err('invalid-argument', 'Tên tệp sai'); return restoreFrom(path.join(BK, m.name), m.mode); }
    case 'logs': return m.prev ? tailFile(PREVLOG, +m.n || 200) : LOGS.slice(-(+m.n || 200));
    case 'conns': return [...CONNS].map(c => ({ u: c.u, role: c.role, ip: c.ip, at: c.at, ua: c.ua, subs: [...SUBS].filter(s => s.conn === c).length }));
    case 'restart': setTimeout(() => { markClean(); process.exit(0); }, 300); return { ok: true };
    case 'alertState': return alertState();
    case 'secDevices': return secDevices();
    case 'secUnbind': { const id = devKey(m.dev); if (!id) throw err('invalid-argument', 'Thiếu mã thiết bị'); commit([{ op: 'delete', path: 'acc_devices/' + id }], null, ACT_LOCAL); return { ok: true }; }
    case 'secKick': { const u = String(m.u || ''); if (!findAccount(u)) throw err('not-found', 'Không có tài khoản'); const n = kickUser(u, null, 'admin'); commit([{ op: 'set', path: 'acc_sessions/' + u, merge: true, data: { user: u, sid: '', dev: '', outAt: Date.now() } }], null, ACT_LOCAL); return { kicked: n }; }   // mã cấp trước lúc này hết hiệu lực (cả máy đang tắt)
    case 'secClear': { const u = String(m.u || ''); const x = getDoc('acc_sessions/' + u); if (x) commit([{ op: 'update', path: 'acc_sessions/' + u, data: { kicks: [] } }], null, ACT_LOCAL);
      const dm = COLS.get('acc_devices'), W = []; if (dm) for (const [id, y] of dm) if (y.d && y.d.denied && y.d.denied[u] != null) W.push({ op: 'update', path: 'acc_devices/' + id, data: { ['denied.' + u]: { $fv: 'del' } } });
      if (W.length) commit(W, null, ACT_LOCAL); return { ok: true }; }
    case 'alertTest': return alertTest(conn);
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
  if (m.op === 'act' || m.op === 'commit' || m.op === 'login') conn.la = now;   // lần thao tác gần nhất (chống nhiều thiết bị: máy kia có "đang dùng" không)
  const fail = e => { send(conn, { re: m.r, code: e.code || 'internal', message: String(e.message || e).slice(0, 300) }); if (!e.code) console.error('[qd]', e); };
  try {
    switch (m.op) {
      case 'hello': return send(conn, { re: m.r, ok: true, ver: VER, now: Date.now() });
      case 'login': {   // đúng tên + mật khẩu -> cấp mã xác thực 60 ngày
        let a = null; const um = COLS.get('accounts'); if (um) for (const [id, x] of um) if (x.d && x.d.user === String(m.u || '') && x.d.pass === m.p) { a = { id, d: x.d }; break; }   // trùng tên (dữ liệu cũ): lấy đúng tài khoản khớp mật khẩu
        if (!a) { conn.u = ''; conn.role = ''; return send(conn, { re: m.r, code: 'unauthenticated', message: 'Sai tên đăng nhập hoặc mật khẩu' }); }
        const dev = devKey(m.dev), sid = actId();
        try { deviceGate(conn, a, dev, String(m.fp || '').slice(0, 64), sid); }
        catch (e) { conn.u = ''; conn.role = ''; return send(conn, Object.assign({ re: m.r, code: e.code || 'permission-denied', message: String(e.message || e) }, e.x ? { x: e.x } : {})); }
        authConn(conn, a.d.user); conn.sid = sid; conn.dev = dev; return send(conn, { re: m.r, ok: true, token: sign(a.d.user, sid, dev), role: conn.role, u: conn.u });
      }
      case 'auth': { const o = verify(m.token); if (!o) { conn.u = ''; conn.role = ''; return send(conn, { re: m.r, code: 'unauthenticated', message: 'Mã xác thực hết hạn' }); }
        const bad = sessionBad(o); if (bad) { conn.u = ''; conn.role = ''; return send(conn, { re: m.r, code: 'unauthenticated', message: bad }); }   // đã đăng nhập ở thiết bị khác / BQT đăng xuất mọi nơi
        conn.sid = o.s || ''; conn.dev = o.d || ''; authConn(conn, o.u); return send(conn, { re: m.r, ok: true, role: conn.role, u: conn.u }); }
      case 'logout': conn.u = ''; conn.role = ''; return send(conn, { re: m.r, ok: true });
      case 'get': { STAT.r++; const x = getDoc(m.path); return send(conn, { re: m.r, ok: true, exists: !!x, d: x ? viewAt(conn, m.path, x.d) : null, v: x ? x.v : 0, ut: x ? x.ut : 0 }); }
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
      case 'act': {   // trò chơi / đổi điểm: máy chủ tự tính và ghi (thành viên không tự cộng trừ được)
        const k = m.cid ? 'act:' + (conn.u || '') + ':' + m.cid : '';
        if (k && DONE.has(k)) return send(conn, Object.assign({ re: m.r }, DONE.get(k)));
        let out; try { out = { ok: true, data: act(conn, String(m.fn || ''), m.a || {}) }; }
        catch (e) { out = { code: e.code || 'internal', message: String(e.message || e).slice(0, 300) }; if (e.x) out.x = e.x; if (!e.code) console.error('[act]', m.fn, e); }
        if (k) { DONE.set(k, out); if (DONE.size > 20000) DONE.delete(DONE.keys().next().value); }
        return send(conn, Object.assign({ re: m.r }, out));
      }
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

/* Thông báo app qua VPS: trạng thái cho Admin > Thông báo app (settings/push_server) = máy nào đang giữ kết nối nền (app QDLink) */
let LINK_SIG = '', LINK_AT = 0;
function linkTick() {
  const by = new Map();
  for (const c of CONNS) if (/^QDLink\//.test(c.ua) && c.u) by.set(c.u, (by.get(c.u) || 0) + 1);
  const users = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([u, n]) => ({ u, n })), sig = JSON.stringify(users), now = Date.now();
  if (sig === LINK_SIG && now - LINK_AT < 5 * 60000) return;
  LINK_SIG = sig; LINK_AT = now;
  let links = 0; for (const x of users) links += x.n;
  try { commit([{ op: 'set', path: 'settings/push_server', data: { by: 'vps', ver: VER, lastRun: now, ok: true, err: '', links, linkUsers: users.slice(0, 2000), hook: '', hookAuto: '' }, merge: true }], null, { local: true }); } catch (e) {}
}
setInterval(linkTick, 10000); setTimeout(linkTick, 3000);

/* ==================================================================================================
   ĐIỂM TÍNH TRÊN MÁY CHỦ (đợt 1): đổi quà Trạm Quy Đổi · đổi điểm ra tiền mặt · tặng lượt cho người khác.
   Trang thành viên chỉ gửi "muốn làm gì" (QDdb.act); máy chủ đọc cấu hình + số dư hiện tại, kiểm tra luật, rồi ghi tất cả
   trong 1 lần (Node chạy 1 luồng -> không ai chen ngang, không thể trừ / cộng 2 lần).
   Lỗi trả về mã ngắn (POINTS, DAILY, STOCK...) để trang hiện đúng câu như trước.
   ================================================================================================== */
const ACT_LOCAL = { local: true, u: '', role: '' };
const actInc = n => ({ $fv: 'inc', n });
function actId() { return crypto.randomBytes(15).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 20).padEnd(20, 'q'); }
function vnDate(t) { const d = new Date((t || Date.now()) + 7 * 3600e3), p = x => String(x).padStart(2, '0'); return { y: d.getUTCFullYear(), m: p(d.getUTCMonth() + 1), d: p(d.getUTCDate()) }; }
const dayDash = t => { const x = vnDate(t); return x.y + '-' + x.m + '-' + x.d; };   // 2026-11-21 (Trạm Quy Đổi, tặng lượt)
const dayFlat = t => { const x = vnDate(t); return '' + x.y + x.m + x.d; };          // 20261121 (đổi điểm ra tiền)
const fmtVN = n => Number(n || 0).toLocaleString('vi-VN');
const pint = (v, d) => { v = parseInt(v, 10); return isNaN(v) ? d : v; };
function actMe(conn) {
  if (!conn.u) throw err('unauthenticated', 'LOGIN');
  const a = findAccount(conn.u);
  if (!a) throw err('unauthenticated', 'LOGIN');
  if (a.d.isBlocked === true) throw err('permission-denied', 'BLOCKED');
  return a;
}
function setting(id) { const x = getDoc('settings/' + id); return x ? x.d || {} : null; }

// ---- Trạm Quy Đổi (giống PointShop.norm trên trang: chỉ bán lượt rút lì xì + lượt ném còn) ----
const SHOP_DEF = [
  { id: 'tk1', icon: '🧧', name: '1 Lượt rút lì xì', type: 'tickets', amount: 1, cost: 50, stock: null, dailyLimit: null, active: true },
  { id: 'tk5', icon: '🧧', name: 'Combo 5 lượt rút lì xì', type: 'tickets', amount: 5, cost: 220, stock: null, dailyLimit: 2, active: true },
  { id: 'tk10', icon: '🧧', name: 'Combo 10 lượt rút lì xì', type: 'tickets', amount: 10, cost: 400, stock: null, dailyLimit: 1, active: true }
];
function shopNorm(cfg) {
  cfg = cfg || {};
  let list = Array.isArray(cfg.items) && cfg.items.length ? cfg.items : null;
  if (!list) list = SHOP_DEF.map(x => Object.assign({}, x, x.id === 'tk1' && cfg.ticketCost != null ? { cost: cfg.ticketCost } : {}));
  return list.filter(x => ['tickets', 'conThrows'].indexOf(x.type || 'tickets') >= 0).map((x, i) => ({
    id: x.id || ('i' + i), icon: x.icon || (x.type === 'conThrows' ? '🎯' : '🧧'), name: String(x.name || ''), type: x.type || 'tickets',
    amount: Math.max(1, parseInt(x.amount) || 1), cost: Math.max(0, parseInt(x.cost) || 0),
    stock: x.stock == null || x.stock === '' ? null : Math.max(0, parseInt(x.stock) || 0),
    dailyLimit: x.dailyLimit == null || x.dailyLimit === '' ? null : Math.max(0, parseInt(x.dailyLimit) || 0),
    active: x.active !== false
  }));
}
// Quầy đổi lượt ném trong trang Ném Còn (game.html): chỉ gói conThrows, không có thì dùng 3 gói mặc định của Ném Còn
const CON_DEF = [
  { id: 'nc_def1', icon: '🎯', name: '1 Lượt ném còn', type: 'conThrows', amount: 1, cost: 25, stock: null, dailyLimit: null, active: true },
  { id: 'nc_def5', icon: '🎯', name: 'Combo 5 lượt ném còn', type: 'conThrows', amount: 5, cost: 110, stock: null, dailyLimit: null, active: true },
  { id: 'nc_def10', icon: '🎯', name: 'Combo 10 lượt ném còn', type: 'conThrows', amount: 10, cost: 200, stock: null, dailyLimit: null, active: true }
];
function conShopNorm(cfg) {
  const n = v => v == null || v === '' ? null : Math.max(0, parseInt(v, 10) || 0);
  const list = (Array.isArray((cfg || {}).items) ? cfg.items : []).filter(x => x && x.type === 'conThrows').map((x, i) => ({
    id: x.id || ('c' + i), icon: x.icon || '🎯', name: String(x.name || 'Lượt ném còn'), type: 'conThrows', amount: Math.max(1, parseInt(x.amount, 10) || 1),
    cost: Math.max(0, parseInt(x.cost, 10) || 0), stock: n(x.stock), dailyLimit: n(x.dailyLimit), active: x.active !== false }));
  return list.length ? list : CON_DEF.map(x => Object.assign({}, x));
}
function actShopBuy(conn, a) {
  const me = actMe(conn), u = me.d.user, cfg = setting('point_shop_config') || {}, con = a.src === 'con';
  if (cfg.isEnabled === false) throw err('failed-precondition', 'CLOSED');
  if (con && (setting('con_config') || {}).shopEnabled === false) throw err('failed-precondition', 'CLOSED');
  const qty = Math.max(1, Math.min(20, pint(a.qty, 1))), x = (con ? conShopNorm(cfg) : shopNorm(cfg)).find(i => i.id === String(a.id || ''));
  if (!x || !x.active) throw err('failed-precondition', 'GONE');
  const cost = x.cost * qty, pts = +me.d.points || 0;
  if (pts < cost) throw err('failed-precondition', 'POINTS');
  const st = getDoc('point_shop_stock/counts'), sold = ((st && st.d && st.d.counts) || {})[x.id] || 0;
  if (x.stock != null && sold + qty > x.stock) throw err('failed-precondition', 'STOCK');
  const key = dayDash(), dd = getDoc('point_shop_daily/' + u + '_' + key), used = ((dd && dd.d && dd.d.counts) || {})[x.id] || 0;
  if (x.dailyLimit != null && used + qty > x.dailyLimit) throw err('failed-precondition', 'DAILY');
  const now = Date.now(), upd = { points: actInc(-cost) };
  if (x.type !== 'gift') upd[x.type] = actInc(x.amount * qty);
  const what = x.type === 'gift' ? x.name + (qty > 1 ? ' ×' + qty : '') : (x.amount * qty) + ' ' + (x.type === 'spins' ? 'Lượt Vòng Quay' : x.type === 'conThrows' ? 'Lượt Ném Còn' : 'Lượt Rút Lì Xì');
  const W = [
    { op: 'update', path: 'accounts/' + me.id, data: upd },
    { op: 'set', path: 'point_shop_stock/counts', merge: true, data: { counts: { [x.id]: actInc(qty) } } },
    { op: 'set', path: 'point_shop_daily/' + u + '_' + key, merge: true, data: { user: u, date: key, counts: { [x.id]: actInc(qty) } } },
    { op: 'set', path: 'point_history/' + actId(), data: { user: u, action: 'exchange', detail: 'Đổi ' + cost + ' điểm lấy ' + what, pointsChanged: -cost, itemId: x.id, itemType: x.type, qty, timestamp: now, by: 'server' } }
  ];
  if (x.type === 'gift') W.push({ op: 'set', path: 'shop_orders/' + actId(), data: { user: u, itemId: x.id, itemName: x.name, icon: x.icon, qty, cost, status: 'pending', time: now } });
  commit(W, null, ACT_LOCAL);
  const after = findAccount(u).d;
  return { x: { id: x.id, type: x.type, amount: x.amount, name: x.name, icon: x.icon }, cost, what, qty, newPoints: +after.points || 0, turns: x.type === 'gift' ? null : +after[x.type] || 0 };
}

// ---- Đổi điểm lì xì ra tiền mặt (giống Cashout.norm trên trang) ----
const CO_DEF = { per1000: 1000, tiers: [10000, 20000, 50000, 100000] };
function cashoutNorm(c) {
  c = c || {};
  const tiers = (Array.isArray(c.tiers) ? c.tiers : CO_DEF.tiers).map(x => Math.round(+x)).filter(x => x >= 1000).sort((a, b) => a - b);
  return { on: c.isEnabled !== false, per1000: Math.max(1, Math.round(+c.per1000 || CO_DEF.per1000)), tiers: tiers.length ? tiers : CO_DEF.tiers.slice(), daily: Math.max(0, Math.round(+c.dailyLimit || 0)) };
}
function actCashout(conn, a) {
  const me = actMe(conn), u = me.d.user, c = cashoutNorm(setting('point_cashout')), amt = Math.round(+a.amount || 0);
  if (!c.on) throw err('failed-precondition', 'CLOSED');
  if (c.tiers.indexOf(amt) < 0) throw err('failed-precondition', 'TIER');
  const bkx = getDoc('bank_info/' + u), bk = bkx && bkx.d;
  if (!bk || !bk.accNo) throw err('failed-precondition', 'BANK');
  const n = Math.round(amt * c.per1000 / 1000), have = +me.d.points || 0;
  if (have < n) throw err('failed-precondition', 'POINTS');
  const key = dayFlat(), dd = getDoc('point_cashout_daily/' + u + '_' + key), usedAmt = (dd && dd.d && +dd.d.amount) || 0;
  if (c.daily && usedAmt + amt > c.daily) throw err('failed-precondition', 'DAILY');
  const now = Date.now(), oid = actId();
  commit([
    { op: 'update', path: 'accounts/' + me.id, data: { points: actInc(-n) } },
    { op: 'set', path: 'point_cashout_daily/' + u + '_' + key, merge: true, data: { user: u, date: key, amount: actInc(amt), count: actInc(1) } },
    { op: 'set', path: 'point_cashout/' + oid, data: { user: u, points: n, amount: amt, result: fmtVN(amt) + ' VNĐ · Đổi ' + fmtVN(n) + ' điểm lì xì', timestamp: now, status: 'pending',
      bank: { bin: bk.bin || '', bank: bk.bank || '', accNo: bk.accNo || '', accName: bk.accName || '' } } },
    { op: 'set', path: 'point_history/' + actId(), data: { user: u, action: 'cashout', detail: 'Đổi ' + fmtVN(n) + ' điểm lì xì lấy ' + fmtVN(amt) + 'đ tiền mặt', pointsChanged: -n, cashoutId: oid, amount: amt, timestamp: now, by: 'server' } }
  ], null, ACT_LOCAL);
  console.log('[act] @' + u + ' đổi ' + n + ' điểm lấy ' + amt + 'đ (đơn ' + oid + ')');
  return { a: amt, n, left: +findAccount(u).d.points || 0, id: oid };
}

// ---- Tặng lượt (vòng quay / rút lì xì / ném còn) cho người khác (giống GiftUI.norm / state trên trang) ----
const GIFT_TYPES = ['spins', 'tickets', 'conThrows'];
function giftNorm(c) {
  c = c || {};
  const t = c.types && typeof c.types === 'object' ? c.types : null, types = {}, ms = v => { v = Number(v); return isFinite(v) && v > 0 ? Math.floor(v) : 0; };
  GIFT_TYPES.forEach(k => { types[k] = t ? !!(t[k] && t[k].on === true) : k !== 'conThrows'; });
  const lim = (v, hi) => Math.min(hi, Math.max(0, pint(v, 0)));
  return { on: c.isEnabled === true, types, max: lim(c.maxPerTransfer, 1e6), daily: lim(c.dailyLimit, 1000), from: ms(c.from), to: ms(c.to) };
}
function actGiftTurns(conn, a) {
  const me = actMe(conn), u = me.d.user, c = giftNorm(setting('transfer_config')), now = Date.now();
  if (!c.on || (c.from && now < c.from) || (c.to && now >= c.to) || !GIFT_TYPES.some(k => c.types[k])) throw err('failed-precondition', 'CLOSED');
  const type = String(a.type || ''), amount = pint(a.amount, 0), to = String(a.to || '').trim();
  if (GIFT_TYPES.indexOf(type) < 0 || !c.types[type]) throw err('failed-precondition', 'TYPE_OFF');
  if (!(amount > 0)) throw err('invalid-argument', 'AMOUNT');
  if (c.max > 0 && amount > c.max) throw err('failed-precondition', 'OVER_MAX');
  const tg = findAccount(to);
  if (!tg) throw err('not-found', 'NO_TARGET');
  if (tg.id === me.id) throw err('failed-precondition', 'SELF');
  const today = dayDash(now), used = me.d.giftDay === today ? (+me.d.giftCount || 0) : 0;
  if (c.daily > 0 && used >= c.daily) throw err('failed-precondition', 'DAILY');
  if ((+me.d[type] || 0) < amount) throw err('failed-precondition', 'INSUFFICIENT_FUNDS');
  commit([
    { op: 'update', path: 'accounts/' + me.id, data: { [type]: actInc(-amount), giftDay: today, giftCount: used + 1 } },
    { op: 'update', path: 'accounts/' + tg.id, data: { [type]: actInc(amount) } },
    { op: 'set', path: 'transfer_history/' + actId(), data: { from: u, to: tg.d.user, type, amount, timestamp: now, day: today } }
  ], null, ACT_LOCAL);
  return { recv: tg.d.user, used: used + 1, left: +findAccount(u).d[type] || 0 };
}


/* ==================================================================================================
   ĐIỂM TÍNH TRÊN MÁY CHỦ (đợt 2): Lì Xì (Trang chủ) · Vòng Quay + câu hỏi (qt.html) · Rút Lì Xì Xuân (tranht.html) · Quay Số (quays.html)
   Máy chủ chọn phần thưởng (ngẫu nhiên theo tỉ lệ Admin đặt), trừ lượt, ghi lịch sử trúng giải. Trang chỉ chạy hiệu ứng theo kết quả máy chủ trả về.
   Lịch sử trúng giải (spin_history, tranhthuong_history, lucky_rewards) là nguồn của Admin > Trả thưởng -> thành viên không còn tự ghi được.
   ================================================================================================== */
const rnd = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;
const vnTs = (d, t) => { if (!(d && t)) return null; const v = Date.parse(d + 'T' + (String(t).length === 5 ? t + ':00' : t) + '+07:00'); return isNaN(v) ? null : v; };   // giờ Admin hẹn = giờ Việt Nam
const vnDayStr = t => new Date(t || Date.now()).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });   // "21/11/2026" giống Utils.getTodayString trên trang
const noAcc = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const wishText = v => { v = String(v == null ? '' : v).slice(0, 400); return v || null; };

// ---- Lì Xì Trang chủ (giống LiXi trong user.html) ----
const LIXI_DEF = [{ points: 8, chance: 35 }, { points: 18, chance: 30 }, { points: 28, chance: 20 }, { points: 38, chance: 10 }, { points: 68, chance: 4 }, { points: 88, chance: 1 }];
function lixiNorm(d) {
  d = d || {};
  let prizes = (Array.isArray(d.prizes) ? d.prizes : []).map(p => ({ points: Math.floor(Number(p && p.points)), chance: Number(p && p.chance) })).filter(p => p.points >= 1 && isFinite(p.chance) && p.chance >= 0);
  if (!prizes.some(p => p.chance > 0)) prizes = LIXI_DEF.slice();
  return { isEnabled: d.isEnabled !== false, endDate: d.endDate || '', endTime: d.endTime || '', openDate: d.openDate || '', openTime: d.openTime || '', prizes,
    bigThreshold: Number(d.bigThreshold) > 0 ? Number(d.bigThreshold) : 68, dailyBudget: Math.max(0, Math.floor(Number(d.dailyBudget) || 0)),
    allowRedraw: d.allowRedraw === true, maxPerDay: Math.min(50, Math.max(2, Math.floor(Number(d.maxPerDay)) || 3)) };
}
function lixiPhase(c, now) {
  if (!c.isEnabled) return 'closed';
  const op = vnTs(c.openDate, c.openTime), dl = vnTs(c.endDate, c.endTime);
  if (op && now < op) return 'upcoming';
  if (dl && now >= dl) return 'closed';
  return 'open';
}
function actLixi(conn) {
  const me = actMe(conn), u = me.d.user, now = Date.now(), c = lixiNorm(setting('lixi_config')), today = vnDayStr(now), key = dayDash(now);
  const d = me.d, same = d.lixiDate === today, used = same ? (d.lixiCount != null ? d.lixiCount : 1) : 0, sum = same ? (d.lixiTotal != null ? d.lixiTotal : (d.lixiAmount || 0)) : 0;
  if (used >= (c.allowRedraw ? c.maxPerDay : 1)) throw err('failed-precondition', 'LIXI_CLAIMED', { count: used, total: sum, last: d.lixiAmount || 0 });
  const ph = lixiPhase(c, now);
  if (ph !== 'open') throw err('failed-precondition', 'LIXI_CLOSED', { phase: ph });
  const dd = getDoc('lixi_daily/' + key), spent = (dd && dd.d && +dd.d.points) || 0;
  let list = c.prizes.filter(p => p.chance > 0);
  if (c.dailyBudget > 0) { list = list.filter(p => p.points <= c.dailyBudget - spent); if (!list.length) throw err('failed-precondition', 'LIXI_SOLDOUT', { spent }); }
  const tot = list.reduce((a, p) => a + p.chance, 0), r = rnd() * tot; let s2 = 0, prize = list[0].points;
  for (const p of list) { s2 += p.chance; if (r < s2) { prize = p.points; break; } }
  commit([
    { op: 'update', path: 'accounts/' + me.id, data: { points: actInc(prize), lixiDate: today, lixiAmount: prize, lixiCount: used + 1, lixiTotal: sum + prize } },
    { op: 'set', path: 'lixi_daily/' + key, merge: true, data: { date: today, count: actInc(1), points: actInc(prize) } },
    { op: 'set', path: 'lixi_history/' + actId(), data: { user: u, amount: prize, date: today, dateKey: key, seq: used + 1, timestamp: now, status: 'ok' } },
    { op: 'set', path: 'point_history/' + actId(), data: { user: u, action: 'add', detail: 'Rút lì xì: +' + prize + ' điểm', pointsChanged: prize, timestamp: now, by: 'server' } }
  ], null, ACT_LOCAL);
  return { prize, count: used + 1, total: sum + prize, big: prize >= c.bigThreshold, points: +findAccount(u).d.points || 0 };
}

// ---- Giải thưởng dạng ô (Vòng Quay / Rút Lì Xì Xuân) ----
function prizeNorm(list, def) {
  const src = (Array.isArray(list) && list.length) ? list : def;
  return src.map((p, i) => ({ id: p.id || ('p' + i), text: String(p.text || ''), qty: (p.qty === '' || p.qty == null || isNaN(parseInt(p.qty))) ? null : Math.max(0, parseInt(p.qty)), chance: parseFloat(p.chance) || 0 }));
}
function closedBy(c) {   // settings/wheel_config, tranhthuong_config: isEnabled, endDate + endTime
  c = c || {};
  if (c.isEnabled === false) return 'off';
  const dl = vnTs(c.endDate, c.endTime);
  if (dl && Date.now() >= dl) return 'expired';
  return null;
}
function pickPrize(prizes, counts) {   // chỉ trong các ô còn số lượng; trả về chỉ số (-1 = hết sạch)
  const avail = []; prizes.forEach((p, i) => { if (p.chance > 0 && !(p.qty != null && (counts[p.id] || 0) >= p.qty)) avail.push(i); });
  if (!avail.length) return -1;
  let tot = 0; avail.forEach(i => { tot += prizes[i].chance; });
  const r = rnd() * tot; let s2 = 0;
  for (const i of avail) { s2 += prizes[i].chance; if (r <= s2) return i; }
  return avail[avail.length - 1];
}

// ---- Vòng Quay (qt.html) ----
const WHEEL_DEF = [{ id: 'm10', text: '10.000 VNĐ', qty: 20, chance: 12 }, { id: 'w1', text: 'Lời Chúc Tết', qty: null, chance: 27 }, { id: 'm20', text: '20.000 VNĐ', qty: 10, chance: 6 },
  { id: 'w2', text: 'Lời Chúc Tết', qty: null, chance: 27 }, { id: 'm50', text: '50.000 VNĐ', qty: 3, chance: 2 }, { id: 'w3', text: 'Lời Chúc Tết', qty: null, chance: 26 }];
const wheelWish = t => !t || /chuc may man|loi chuc|chuc tet|ti nua|them ti/.test(noAcc(t));
function quizCfg(q) {
  q = q || {}; const mode = q.mode === 'random' ? 'random' : 'all', n = parseInt(q.count);
  return { mode, count: isNaN(n) ? (mode === 'random' ? 3 : 0) : Math.min(50, Math.max(0, n)), rotateMin: Math.max(0, parseInt(q.rotateMin) || 0), start: q.start || '', end: q.end || '' };
}
function quizOpen(c, now) {   // khung giờ hiện câu hỏi hằng ngày (giờ Việt Nam)
  const mins = h => { const m = /^(\d{1,2}):(\d{2})$/.exec(h || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const s2 = mins(c.start), e = mins(c.end);
  if (s2 == null || e == null || s2 === e) return true;
  const d = new Date(now + 7 * 3600e3), cur = d.getUTCHours() * 60 + d.getUTCMinutes();
  return s2 < e ? (cur >= s2 && cur < e) : (cur >= s2 || cur < e);
}
function actWheelClaim(conn, a) {   // trả lời đúng câu hỏi -> giữ 1 vé quay (người đúng ĐẦU TIÊN)
  const me = actMe(conn), u = me.d.user, now = Date.now(), cfg = setting('wheel_config') || {}, qid = String(a.qid || ''), h = String(a.h || '');
  if (closedBy(cfg)) throw err('failed-precondition', 'CLOSED');
  const q = qid && getDoc('wheel_questions/' + qid), d = q && q.d;
  if (!d || d.active === false) throw err('failed-precondition', 'GONE');
  if ((d.showAt && now < d.showAt) || (d.hideAt && now >= d.hideAt) || !quizOpen(quizCfg(cfg.quiz), now)) throw err('failed-precondition', 'NOTNOW');
  if (d.claimedBy) throw err('failed-precondition', 'TAKEN', { by: d.claimedBy });
  if (!h || !(d.answerHashes || []).includes(h)) throw err('failed-precondition', 'WRONG');
  commit([{ op: 'update', path: 'wheel_questions/' + qid, data: { claimedBy: u, claimedAt: now, ticketUsed: false } }], null, ACT_LOCAL);
  return { qid };
}
function actWheelSpin(conn, a) {
  const me = actMe(conn), u = me.d.user, now = Date.now(), cfg = setting('wheel_config') || {};
  if (closedBy(cfg)) throw err('failed-precondition', 'CLOSED');
  // dùng vé từ câu hỏi trước (vé cũ nhất), hết vé thì dùng lượt quay trong tài khoản
  let tk = null; const qm = COLS.get('wheel_questions');
  if (qm) for (const [id, x] of qm) if (x.d && x.d.claimedBy === u && x.d.ticketUsed !== true && (!tk || (x.d.claimedAt || 0) < (tk.d.claimedAt || 0))) tk = { id, d: x.d };
  const spins = +me.d.spins || 0;
  if (!tk && spins <= 0) throw err('failed-precondition', 'NOSPIN');
  const prizes = prizeNorm(cfg.prizes, WHEEL_DEF), st = getDoc('wheel_stock/counts'), idx = pickPrize(prizes, (st && st.d && st.d.counts) || {});
  const p = idx >= 0 ? prizes[idx] : null, isWish = !p || wheelWish(p.text), result = isWish ? 'Lời Chúc Tết' : p.text;
  const W = [tk ? { op: 'update', path: 'wheel_questions/' + tk.id, data: { ticketUsed: true, usedAt: now } } : { op: 'update', path: 'accounts/' + me.id, data: { spins: actInc(-1) } }];
  if (p && p.qty != null) W.push({ op: 'set', path: 'wheel_stock/counts', merge: true, data: { counts: { [p.id]: actInc(1) } } });
  W.push({ op: 'set', path: 'spin_history/' + actId(), data: { userId: u, result, prizeId: p ? p.id : null, wish: isWish ? wishText(a.wish) : null, questionId: tk ? tk.id : null, source: tk ? 'question' : 'account', timestamp: now, by: 'server' } });
  commit(W, null, ACT_LOCAL);
  if (!isWish) console.log('[act] @' + u + ' Vòng Quay trúng ' + result);
  return { idx, prizes, result, isWish, questionId: tk ? tk.id : null, remain: tk ? null : spins - 1 };
}

// ---- Rút Lì Xì Xuân (tranht.html): mở 1 hoặc 3 bao ----
const TRANH_DEF = [{ id: 'm10', text: '10.000 VNĐ', qty: 20, chance: 15 }, { id: 'm20', text: '20.000 VNĐ', qty: 10, chance: 8 }, { id: 'm50', text: '50.000 VNĐ', qty: 3, chance: 2 }, { id: 'luck', text: 'Lời Chúc Tết', qty: null, chance: 75 }];
const tranhWish = t => !t || /chuc may man|loi chuc|chuc tet|may man lan sau/.test(noAcc(t));
function actTranh(conn, a) {
  const me = actMe(conn), u = me.d.user, now = Date.now(), cfg = setting('tranhthuong_config') || {}, N = Math.max(1, Math.min(3, pint(a.n, 1)));
  if (closedBy(cfg)) throw err('failed-precondition', 'CLOSED');
  const left = +me.d.tickets || 0;
  if (left < N) throw err('failed-precondition', 'NOTICKET');
  const prizes = prizeNorm(cfg.prizes, TRANH_DEF), st = getDoc('tranhthuong_stock/counts'), counts = Object.assign({}, (st && st.d && st.d.counts) || {}), inc = {}, picks = [];
  const wishes = Array.isArray(a.wishes) ? a.wishes : [];
  for (let k = 0; k < N; k++) {
    const i = pickPrize(prizes, counts), p = i >= 0 ? prizes[i] : null;
    if (p && p.qty != null) { counts[p.id] = (counts[p.id] || 0) + 1; inc[p.id] = (inc[p.id] || 0) + 1; }
    const text = p ? p.text : 'Lời Chúc Tết', w = tranhWish(text);
    picks.push({ text, prizeId: p ? p.id : null, prize: w ? 'Lời Chúc Tết' : text, wish: w ? (wishText(wishes[k]) || 'Chúc Mừng Năm Mới — An Khang Thịnh Vượng!') : null });
  }
  const W = [{ op: 'update', path: 'accounts/' + me.id, data: { tickets: actInc(-N) } }];
  if (Object.keys(inc).length) { const m = {}; for (const id of Object.keys(inc)) m[id] = actInc(inc[id]); W.push({ op: 'set', path: 'tranhthuong_stock/counts', merge: true, data: { counts: m } }); }
  picks.forEach((x, k) => W.push({ op: 'set', path: 'tranhthuong_history/' + actId(), data: Object.assign({ userId: u, result: x.prize, prizeId: x.prizeId, wish: x.wish, remain: left - 1 - k }, N > 1 ? { multi: N } : {}, { timestamp: now + k, by: 'server' }) }));
  commit(W, null, ACT_LOCAL);
  picks.forEach(x => { if (!x.wish) console.log('[act] @' + u + ' Rút Lì Xì trúng ' + x.prize); });
  return { left, remain: left - N, picks };
}

// ---- Quay Số May Mắn: thành viên chốt số (1 lần, Admin cấp phép mới được đổi) ----
function actLuckyPick(conn, a) {
  const me = actMe(conn), u = me.d.user, n = pint(a.number, 0);
  if (!(n >= 1 && n <= 100)) throw err('invalid-argument', 'NUMBER');
  const cur = getDoc('lucky_numbers/' + u);
  if (cur && cur.d && cur.d.number && cur.d.canEdit !== true) throw err('failed-precondition', 'LOCKED');
  commit([{ op: 'set', path: 'lucky_numbers/' + u, data: { user: u, number: n, lastUpdated: Date.now(), canEdit: false } }], null, ACT_LOCAL);
  return { number: n };
}

// ---- Quay Số theo giờ hẹn: máy chủ tự quay đúng giờ (không cần Admin mở trang), ghi lịch sử + trao thưởng 1 lần ----
const LUCKY_MISS_MS = 10 * 60 * 1000;
const LR_KEYS = [['points', 'Điểm lì xì', 'điểm lì xì'], ['spins', 'Lượt vòng quay', 'lượt quay'], ['tickets', 'Lượt rút lì xì', 'lượt rút lì xì'], ['conThrows', 'Lượt ném còn', 'lượt ném còn']];
const lrN0 = v => { v = parseInt(v, 10); return isNaN(v) || v < 0 ? 0 : Math.min(v, 1e9); };
const pad2 = x => String(x).padStart(2, '0');
function lrNorm(c) {
  c = c || {}; const main = {}, near = {};
  LR_KEYS.forEach(k => { main[k[0]] = lrN0((c.main || {})[k[0]]); near[k[0]] = lrN0((c.near || {})[k[0]]); });
  return { on: c.isEnabled === true, since: +c.since || 0, mode: c.mode === 'split' ? 'split' : 'each', main, cash: lrN0(c.cash), nearOn: c.nearOn === true, near, nearCash: lrN0(c.nearCash) };
}
const lrEmpty = (r, cash) => !cash && LR_KEYS.every(k => !(r[k[0]] > 0));
function lrShare(part, cash, count, mode) {
  const o = {}; LR_KEYS.forEach(k => { const v = part[k[0]] || 0; o[k[0]] = mode === 'split' && count > 1 ? Math.floor(v / count) : v; });
  let c = cash || 0; if (mode === 'split' && count > 1) { const e = Math.floor(c / count); c = e >= 1000 ? Math.floor(e / 1000) * 1000 : e; }
  o.cash = c; return o;
}
function lrText(r) { if (!r) return ''; const a = []; if (r.cash > 0) a.push(fmtVN(r.cash) + 'đ tiền mặt'); LR_KEYS.forEach(k => { if (r[k[0]] > 0) a.push('+' + fmtVN(r[k[0]]) + ' ' + k[2]); }); return a.join(' · '); }
function luckyDraw(id, r, now) {   // 1 lượt hẹn giờ tới giờ: chốt số -> phát cho mọi màn hình -> lịch sử -> trao thưởng (1 lần ghi)
  const live = setting('lucky_live') || {}, pre0 = ((setting('lucky_round_presets') || {}).byId || {})[id];
  const pre = (pre0 != null && pre0 !== '') ? parseInt(pre0, 10) : null;
  const num = (pre >= 1 && pre <= 100) ? pre : crypto.randomInt(1, 101);
  const W = [{ op: 'set', path: 'settings/lucky_live', merge: true, data: { isLive: true, startedAt: live.isLive ? (live.startedAt || now) : now, rollId: now, rollAt: now, rollNumber: num, rollLabel: r.label || null, rollRound: id,
    rounds: { [id]: { done: true, doneAt: now, missed: false, number: num } } } }];
  const main = [], near0 = [], c = lrNorm(setting('lucky_reward_config')), ln = COLS.get('lucky_numbers');
  if (ln) for (const [, x] of ln) { const v = x.d || {}, k = parseInt(v.number, 10); if (!v.user || isNaN(k)) continue; if (k === num) main.push(v.user); else if (c.nearOn && Math.abs(k - num) === 1) near0.push(v.user); }
  const histId = actId(), rec = { number: num, winners: main.slice(), timestamp: now, source: 'schedule', by: 'server' };
  if (r.label) rec.round = r.label;
  const award = c.on && !(c.since && now < c.since - 60000) && !(lrEmpty(c.main, c.cash) && (!c.nearOn || lrEmpty(c.near, c.nearCash)));
  if (award) {
    const near = near0.filter(x => main.indexOf(x) < 0), users = main.concat(near);
    const each = lrShare(c.main, c.cash, main.length, c.mode), eachNear = lrShare(c.near, c.nearCash, near.length, c.mode);
    W.push({ op: 'set', path: 'lucky_rewards/' + histId, data: { number: num, histId, winners: main, near, all: users, each, eachNear: c.nearOn ? eachNear : null,
      cash: main.length ? each.cash : 0, nearCash: near.length ? eachNear.cash : 0, mode: c.mode, at: now, wonAt: now, round: r.label || null, source: 'schedule', by: 'server' } });
    Object.assign(rec, { rewarded: true, rewardText: lrText(each), nearUsers: near, nearText: c.nearOn ? lrText(eachNear) : '' });
    const give = (u, rw, isNear) => {
      const a = findAccount(u); if (!a) return; const up = {}; let any = false;
      LR_KEYS.forEach(k => { if (rw[k[0]] > 0) { up[k[0]] = actInc(rw[k[0]]); any = true; } });
      if (any) W.push({ op: 'update', path: 'accounts/' + a.id, data: up });
      if (rw.points > 0) W.push({ op: 'set', path: 'point_history/' + actId(), data: { user: u, action: 'add', detail: 'Quay Số May Mắn: ' + (isNear ? 'giải phụ (lệch 1 số) — số ' : 'trúng số ') + pad2(num), pointsChanged: rw.points, timestamp: now, by: 'server' } });
    };
    main.forEach(u => give(u, each, false)); near.forEach(u => give(u, eachNear, true));
  }
  W.splice(1, 0, { op: 'set', path: 'lucky_number_history/' + histId, data: rec });
  commit(W, null, ACT_LOCAL);
  console.log('[quay số] ' + (r.label || id) + ': số ' + pad2(num) + ' · trúng: ' + (main.join(', ') || 'không ai'));
}
let luckyBusy = false;
function luckyTick() {
  if (luckyBusy) return; luckyBusy = true;
  try {
    const live = setting('lucky_live'), rounds = (live && live.rounds) || {}, now = Date.now();
    const due = Object.keys(rounds).map(id => Object.assign({ id }, rounds[id])).filter(r => r && r.at && !r.done && now >= r.at).sort((a, b) => a.at - b.at);
    for (const r of due) {
      if (now - r.at > LUCKY_MISS_MS) { commit([{ op: 'set', path: 'settings/lucky_live', merge: true, data: { rounds: { [r.id]: { done: true, doneAt: now, missed: true } } } }], null, ACT_LOCAL); continue; }
      try { luckyDraw(r.id, r, now); }
      catch (e) {   // lỗi bất thường: bỏ lượt này (không thử lại liên tục mỗi giây)
        console.error('[quay số] lỗi lượt ' + r.id, e);
        try { commit([{ op: 'set', path: 'settings/lucky_live', merge: true, data: { rounds: { [r.id]: { done: true, doneAt: now, missed: true, error: String(e.message || e).slice(0, 200) } } } }], null, ACT_LOCAL); } catch (x) {}
      }
      break;   // mỗi lần 1 lượt (lượt sau quay ở nhịp kế tiếp, màn hình kịp chạy hiệu ứng)
    }
  } catch (e) { console.error('[quay số]', e); }
  luckyBusy = false;
}
setInterval(luckyTick, 1000);


/* ==================================================================================================
   ĐIỂM TÍNH TRÊN MÁY CHỦ (đợt 3): nhiệm vụ đăng nhập · điểm danh · mã mời · quà toàn hệ thống · Ném Còn · Kéo Búa Bao · thưởng Giải Đấu
   ================================================================================================== */
const vnMin = t => { const d = new Date((t || Date.now()) + 7 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const hhmm = v => { const p = String(v || '').split(':').map(Number); return (p[0] || 0) * 60 + (p[1] || 0); };
const cleanIp = ip => String(ip || '').replace(/^::ffff:/, '');
const ITEM_KEYS = ['points', 'tickets', 'spins', 'conThrows'];
function incUpd(items) { const u = {}; for (const k of Object.keys(items || {})) if (items[k] > 0) u[k] = actInc(items[k]); return u; }

// ---- Nhiệm vụ: đăng nhập lần đầu trong ngày ----
function actTaskLogin(conn) {
  const me = actMe(conn), u = me.d.user, today = vnDayStr(), now = Date.now();
  if (me.d.lastLoginRewardDate === today) return { points: 0 };
  const t = setting('task_config') || {}, n = t.loginReward !== undefined ? parseInt(t.loginReward) : 10;
  if (!(n > 0)) return { points: 0 };
  commit([
    { op: 'update', path: 'accounts/' + me.id, data: { points: actInc(n), lastLoginRewardDate: today } },
    { op: 'set', path: 'point_history/' + actId(), data: { user: u, action: 'add', detail: 'Nhiệm vụ: Đăng nhập lần đầu trong ngày', pointsChanged: n, timestamp: now, by: 'server' } }
  ], null, ACT_LOCAL);
  return { points: n };
}

// ---- Điểm danh (khung giờ, chống điểm danh hộ theo IP do máy chủ thấy, vật phẩm thưởng) ----
function actAttend(conn) {
  const me = actMe(conn), u = me.d.user, now = Date.now(), today = vnDayStr(now), ac = setting('attendance') || {};
  const s0 = hhmm(ac.start || '09:00'), e0 = hhmm(ac.end || '10:00'), cur = vnMin(now);
  if (cur < s0 || cur > e0) throw err('failed-precondition', 'HOURS', { start: ac.start || '09:00', end: ac.end || '10:00' });
  const sec = setting('security_config') || {}, anti = ac.antiProxyEnabled !== false && sec.isEnabled !== false, ip = cleanIp(conn.ip);
  const am = COLS.get('attendance');
  if (am) for (const [, x] of am) {
    const r = x.d || {}; if (r.date !== today) continue;
    if (r.userName === u) throw err('failed-precondition', 'ALREADY');
    if (anti && ip && r.ipAddress === ip) throw err('failed-precondition', 'PROXY_IP', { other: r.userName, ip });
  }
  const rw = setting('attendance_reward_items'), rwD = rw || {}, rwIn = (f, t) => { f = Number(f) || 0; t = Number(t) || 0; return !(f && now < f) && !(t && now >= t); };
  const items = {};
  if (rw && rwD.isEnabled === true) {
    const it = rwD.items && typeof rwD.items === 'object' ? rwD.items : null;
    if (it) ITEM_KEYS.forEach(k => { const x = it[k] || {}, n = Math.min(1e6, parseInt(x.n, 10) || 0); if (x.on === true && n > 0 && rwIn(x.from !== undefined ? x.from : rwD.from, x.to !== undefined ? x.to : rwD.to)) items[k] = n; });
    else if ((parseInt(rwD.tickets, 10) || 0) > 0 && rwIn(rwD.from, rwD.to)) items.tickets = parseInt(rwD.tickets, 10);
  }
  const t = setting('task_config') || {};
  let task = t.attendanceReward !== undefined ? parseInt(t.attendanceReward) : 20;
  if (!Object.keys(items).length || !(task > 0)) task = 0;
  const upd = incUpd(items); if (task > 0) upd.points = actInc((items.points || 0) + task);
  const W = [{ op: 'set', path: 'attendance/' + actId(), data: { userId: me.id, userName: u, time: new Date(now).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }), date: today, timestamp: now, ipAddress: ip, rewardTickets: items.tickets || 0, rewardItems: items, by: 'server' } }];
  if (Object.keys(upd).length) W.push({ op: 'update', path: 'accounts/' + me.id, data: upd });
  if (items.points) W.push({ op: 'set', path: 'point_history/' + actId(), data: { user: u, action: 'add', detail: 'Thưởng vật phẩm điểm danh', pointsChanged: items.points, timestamp: now, by: 'server' } });
  if (task > 0) W.push({ op: 'set', path: 'point_history/' + actId(), data: { user: u, action: 'add', detail: 'Nhiệm vụ: Điểm danh thành công', pointsChanged: task, timestamp: now + 1, by: 'server' } });
  commit(W, null, ACT_LOCAL);
  return { items, task, ip };
}

// ---- Mã mời ----
function inviteNorm(c) {
  c = c || {}; const r = c.rewards && typeof c.rewards === 'object' ? c.rewards : null, lim = (v, d, lo, hi) => { v = parseInt(v, 10); if (isNaN(v)) v = d; return Math.min(hi, Math.max(lo, v)); };
  const ms = v => { v = Number(v); return isFinite(v) && v > 0 ? Math.floor(v) : 0; }, out = { on: !!c.isEnabled, max: lim(c.maxPerInviter, 0, 0, 10000), rewards: {} };
  ITEM_KEYS.forEach(k => {
    if (r) { const x = r[k] || {}; out.rewards[k] = { on: x.on === true, invitee: lim(x.invitee, 0, 0, 1e6), inviter: lim(x.inviter, 0, 0, 1e6), from: ms(x.from), to: ms(x.to) }; }
    else if (k === 'tickets') { const n = lim(c.rewardTickets, 1, 1, 1e6); out.rewards[k] = { on: true, invitee: n, inviter: n, from: 0, to: 0 }; }
    else out.rewards[k] = { on: false, invitee: 0, inviter: 0, from: 0, to: 0 };
  });
  return out;
}
function inviteGive(cfg, side, now) { const g = {}; ITEM_KEYS.forEach(k => { const x = cfg.rewards[k]; if (x.on && !(x.from && now < x.from) && !(x.to && now >= x.to) && x[side] > 0) g[k] = x[side]; }); return g; }
function actInvite(conn, a) {
  const me = actMe(conn), u = me.d.user, code = String(a.code || '').trim().toUpperCase(), now = Date.now(), cfg = inviteNorm(setting('invite_config'));
  if (!cfg.on) throw err('failed-precondition', 'DISABLED');
  let inv = null; const m = COLS.get('accounts');
  if (code && m) for (const [id, x] of m) if (x.d && String(x.d.inviteCode || '').toUpperCase() === code) { inv = { id, d: x.d }; break; }
  if (!inv) throw err('failed-precondition', 'NOT_FOUND');
  if (inv.id === me.id) throw err('failed-precondition', 'SELF');
  if (me.d.hasUsedInvite) throw err('failed-precondition', 'ALREADY_USED');
  if (inv.d.invitedBy && inv.d.invitedBy === u) throw err('failed-precondition', 'MUTUAL');
  const capped = cfg.max > 0 && (Number(inv.d.inviteRewardCount) || 0) >= cfg.max;
  const gMe = inviteGive(cfg, 'invitee', now), full = inviteGive(cfg, 'inviter', now), gInv = capped ? {} : full;
  if (!Object.keys(gMe).length && !Object.keys(gInv).length) throw err('failed-precondition', capped && Object.keys(full).length ? 'CAPPED' : 'NO_REWARD');
  const upMe = Object.assign({ hasUsedInvite: true, invitedBy: inv.d.user || '', invitedAt: now }, incUpd(gMe));
  const upInv = Object.assign({ inviteCount: actInc(1) }, incUpd(gInv)); if (Object.keys(gInv).length) upInv.inviteRewardCount = actInc(1);
  const W = [{ op: 'update', path: 'accounts/' + me.id, data: upMe }, { op: 'update', path: 'accounts/' + inv.id, data: upInv },
    { op: 'set', path: 'invite_history/' + actId(), data: { inviter: inv.d.user || '', invitee: u, rewards: { invitee: gMe, inviter: gInv }, inviterCapped: capped, rewardAmount: gMe.tickets || 0, timestamp: now, by: 'server' } }];
  if (gMe.points) W.push({ op: 'set', path: 'point_history/' + actId(), data: { user: u, action: 'add', detail: 'Mã mời: nhập mã của ' + (inv.d.user || ''), pointsChanged: gMe.points, timestamp: now, by: 'server' } });
  if (gInv.points) W.push({ op: 'set', path: 'point_history/' + actId(), data: { user: inv.d.user || '', action: 'add', detail: 'Mã mời: ' + u + ' nhập mã của bạn', pointsChanged: gInv.points, timestamp: now, by: 'server' } });
  commit(W, null, ACT_LOCAL);
  return { gMe, gInv, inviter: inv.d.user || '', capped };
}

// ---- Quà toàn hệ thống (gifts / gift_claims) ----
const GIFT_ITEM_NAME = { points: 'Điểm lì xì', tickets: 'Lượt rút lì xì', spins: 'Lượt vòng quay', conThrows: 'Lượt ném còn' };
function actGiftClaim(conn, a) {
  const me = actMe(conn), u = me.d.user, gid = String(a.id || ''), now = Date.now(), cid = gid + '__' + me.id;
  if (getDoc('gift_claims/' + cid)) throw err('failed-precondition', 'DA_NHAN');
  const gx = gid && getDoc('gifts/' + gid), x = gx && gx.d;
  if (!x) throw err('failed-precondition', 'GONE');
  if (x.enabled === false) throw err('failed-precondition', 'OFF');
  if (now < x.startAt) throw err('failed-precondition', 'EARLY');
  if (now > x.endAt) throw err('failed-precondition', 'LATE');
  if (x.maxClaims && (x.claimCount || 0) >= x.maxClaims) throw err('failed-precondition', 'FULL');
  if (x.who === 'old' && +me.d.created_at && +me.d.created_at >= x.startAt) throw err('failed-precondition', 'OLD_ONLY');
  const items = {}, gUpd = { claimCount: actInc(1), lastClaimAt: now };
  ITEM_KEYS.forEach(k => { const n = Math.max(0, Math.floor(+((x.items || {})[k]) || 0)); if (n) { items[k] = n; gUpd['sum.' + k] = actInc(n); } });
  if (!Object.keys(items).length) throw err('failed-precondition', 'EMPTY');
  const txt = ITEM_KEYS.filter(k => items[k]).map(k => '+' + items[k] + ' ' + GIFT_ITEM_NAME[k].toLowerCase()).join(', ');
  commit([
    { op: 'set', path: 'gift_claims/' + cid, data: { giftId: gid, giftTitle: x.title || '', user: u, userId: me.id, fullName: me.d.fullName || '', items, at: now } },
    { op: 'update', path: 'gifts/' + gid, data: gUpd },
    { op: 'update', path: 'accounts/' + me.id, data: incUpd(items) },
    { op: 'set', path: 'point_history/' + actId(), data: { user: u, action: 'add', detail: '🎁 Quà toàn hệ thống: ' + (x.title || '') + ' (' + txt + ')', pointsChanged: items.points || 0, timestamp: now, by: 'server' } }
  ], null, ACT_LOCAL);
  return { items };
}

// ---- Ném Còn (game.html): gió do máy chủ đặt, máy chủ tính đường bay -> trúng / chạm vành / trượt ----
const CON_DEF_CFG = { enabled: true, difficulty: 'normal', wind: true, hitPoints: 20, rimPoints: 5, streakEvery: 3, streakBonus: 30, freePerDay: 3 };
const CON_DIFF = { easy: { r: 0.95, wind: 0.5, sway: 0 }, normal: { r: 0.72, wind: 1.2, sway: 0 }, hard: { r: 0.52, wind: 1.8, sway: 0.7 } };
const CON_W = { D: 12, H: 9, y0: 1.4, z0: 0.5, g: 9.8, vz: 10.45, br: 0.15, rim: 0.13 };
function conCfg() {
  const c = setting('con_config') || {}, I = (v, d, lo, hi) => { v = parseInt(v, 10); if (isNaN(v)) v = d; return Math.min(hi, Math.max(lo, v)); }, D = CON_DEF_CFG;
  return { enabled: c.enabled !== false, difficulty: ['easy', 'normal', 'hard'].indexOf(c.difficulty) >= 0 ? c.difficulty : 'normal', wind: c.wind !== false,
    hitPoints: I(c.hitPoints, D.hitPoints, 0, 100000), rimPoints: I(c.rimPoints, D.rimPoints, 0, 100000), streakEvery: I(c.streakEvery, D.streakEvery, 0, 100),
    streakBonus: I(c.streakBonus, D.streakBonus, 0, 100000), freePerDay: I(c.freePerDay, D.freePerDay, 0, 100) };
}
const CONWIND = new Map(), CONLAST = new Map();   // gió hiện tại / lần ném gần nhất của từng người
function conWindFor(u, cfg, fresh) {
  const m = cfg.wind ? CON_DIFF[cfg.difficulty].wind : 0, cur = CONWIND.get(u);
  if (!fresh && cur && cur.m === m) return cur.w;
  let w = m ? Math.round((rnd() * 2 - 1) * m * 10) / 10 : 0;
  if (m && rnd() < 0.12) w = 0;   // thỉnh thoảng lặng gió
  CONWIND.set(u, { w, m }); return w;
}
function actConWind(conn) { const me = actMe(conn); return { wind: conWindFor(me.d.user, conCfg(), false) }; }
function actConFree(conn) {
  const me = actMe(conn), cfg = conCfg(), today = dayDash();
  if (!cfg.enabled || cfg.freePerDay <= 0) throw err('failed-precondition', 'OFF');
  if (me.d.conFreeDate === today) throw err('failed-precondition', 'TAKEN');
  commit([{ op: 'update', path: 'accounts/' + me.id, data: { conThrows: actInc(cfg.freePerDay), conFreeDate: today } }], null, ACT_LOCAL);
  return { n: cfg.freePerDay, date: today };
}
function actConThrow(conn, a) {
  const me = actMe(conn), u = me.d.user, cfg = conCfg(), now = Date.now();
  if (!cfg.enabled) throw err('failed-precondition', 'CLOSED');
  const left = Number(me.d.conThrows) || 0; if (left <= 0) throw err('failed-precondition', 'NOTURN');
  if (now - (CONLAST.get(u) || 0) < 900) throw err('failed-precondition', 'FAST');   // một lần ném bay ~1,3 giây
  const vx = Number(a.vx), vy = Number(a.vy), ms = Number(a.ms) || 0;
  if (!isFinite(vx) || !isFinite(vy) || Math.abs(vx) > 40 || vy < -5 || vy > 60) throw err('invalid-argument', 'BAD');
  CONLAST.set(u, now);
  const wind = conWindFor(u, cfg, false), df = CON_DIFF[cfg.difficulty], W = CON_W;
  const t = (W.D - W.z0) / W.vz, x = vx * t + 0.5 * wind * t * t, y = W.y0 + vy * t - 0.5 * W.g * t * t, rx = df.sway ? df.sway * Math.sin((ms + t * 1000) / 1000 * 1.4) : 0;
  const d = Math.hypot(x - rx, y - W.H), outcome = d <= df.r - W.br * 0.6 ? 'hit' : d <= df.r + W.rim + W.br ? 'rim' : 'miss';
  const hit = outcome === 'hit', streak = hit ? (Number(me.d.conStreak) || 0) + 1 : 0, base = hit ? cfg.hitPoints : outcome === 'rim' ? cfg.rimPoints : 0;
  const bonus = hit && cfg.streakEvery > 1 && cfg.streakBonus > 0 && streak % cfg.streakEvery === 0 ? cfg.streakBonus : 0, total = base + bonus;
  const upd = { conThrows: actInc(-1), conStreak: streak }; if (total > 0) upd.points = actInc(total);
  const st = getDoc('con_stats/' + u), best = Math.max((st && st.d && +st.d.best) || 0, streak);
  const Wr = [{ op: 'update', path: 'accounts/' + me.id, data: upd },
    { op: 'set', path: 'con_stats/' + u, merge: true, data: { user: u, throws: actInc(1), hits: actInc(hit ? 1 : 0), rims: actInc(outcome === 'rim' ? 1 : 0), points: actInc(total), streak, best, updatedAt: now } },
    { op: 'set', path: 'con_history/' + u + '_' + (9999999999999 - now), data: { user: u, result: outcome, points: total, bonus, streak, wind, difficulty: cfg.difficulty, ts: now } }];
  if (total > 0) Wr.push({ op: 'set', path: 'point_history/' + actId(), data: { user: u, action: 'nemcon', detail: 'Ném còn ' + (hit ? 'trúng vòng' : 'chạm vành') + (bonus ? ' (thưởng chuỗi ' + streak + ')' : ''), pointsChanged: total, timestamp: now, by: 'server' } });
  commit(Wr, null, ACT_LOCAL);
  return { outcome, base, bonus, total, streak, left: left - 1, best, wind: conWindFor(u, cfg, true), d: Math.round(d * 1000) / 1000 };
}

// ---- Kéo Búa Bao: máy chủ ghép trận, giữ chiêu (che với đối thủ tới lúc lật), chấm hiệp, sang hiệp, trao điểm ----
const RPS_STALE_MS = 90000, RPS_HANDS = ['rock', 'paper', 'scissors', 'timeout'];
function rpsCfg() {
  const c = setting('rps_config') || { isEnabled: true, start: '00:00', end: '23:59', fee: 5, winReward: 10, loseReward: -5, timeLimit: 10 }, n = (v, d) => { const x = parseInt(v); return isNaN(x) ? d : x; };
  return { isEnabled: c.isEnabled !== false, start: c.start || '00:00', end: c.end || '23:59', fee: n(c.fee, 5), win: n(c.winReward, 10), lose: n(c.loseReward, -5), limit: Math.max(3, n(c.timeLimit, 10)) };
}
function rpsOpen(c) { if (!c.isEnabled) return 'off'; const cur = vnMin(), s2 = hhmm(c.start), e = hhmm(c.end); return (s2 <= e ? (cur >= s2 && cur <= e) : (cur >= s2 || cur <= e)) ? 'open' : 'hours'; }
function rpsRoom(conn, id) {
  const me = actMe(conn), x = id && getDoc('rps_rooms/' + id);
  if (!x) throw err('failed-precondition', 'GONE');
  const d = x.d, side = d.player1 === me.d.user ? 'p1' : d.player2 === me.d.user ? 'p2' : '';
  if (!side) throw err('permission-denied', 'NOT_IN_ROOM');
  return { me, d, side, path: 'rps_rooms/' + id };
}
function actRpsFind(conn) {
  const me = actMe(conn), u = me.d.user, c = rpsCfg(), st = rpsOpen(c), now = Date.now();
  if (st !== 'open') throw err('failed-precondition', st === 'off' ? 'OFF' : 'HOURS');
  if ((+me.d.points || 0) < c.fee) throw err('failed-precondition', 'FEE', { fee: c.fee });
  const rm = COLS.get('rps_rooms'), wait = [], drop = [];
  if (rm) for (const [id, x] of rm) {
    const r = x.d || {};
    if (r.status !== 'waiting') continue;
    if (now - (r.ping || r.createdAt || 0) > RPS_STALE_MS) { drop.push({ op: 'delete', path: 'rps_rooms/' + id }); continue; }
    if (r.player1 === u) throw err('failed-precondition', 'OWN_ROOM');
    if (!r.player2) wait.push({ id, at: r.createdAt || 0 });
  }
  wait.sort((a, b) => a.at - b.at);
  if (wait.length) { commit(drop.concat([{ op: 'update', path: 'rps_rooms/' + wait[0].id, data: { player2: u, status: 'playing', ping: now } }]), null, ACT_LOCAL); return { roomId: wait[0].id, isPlayer1: false }; }
  const id = actId();
  commit(drop.concat([{ op: 'set', path: 'rps_rooms/' + id, data: { player1: u, player2: null, p1Choice: null, p2Choice: null, p1Score: 0, p2Score: 0, round: 1, turn: 1, status: 'waiting', roundWinner: null, deadline: null, createdAt: now, ping: now } }]), null, ACT_LOCAL);
  return { roomId: id, isPlayer1: true };
}
function actRpsPing(conn, a) { const r = rpsRoom(conn, String(a.roomId || '')); if (r.d.status === 'waiting') commit([{ op: 'update', path: r.path, data: { ping: Date.now() } }], null, ACT_LOCAL); return {}; }
function actRpsLeave(conn, a) {
  let r; try { r = rpsRoom(conn, String(a.roomId || '')); } catch (e) { return {}; }
  commit([{ op: 'delete', path: r.path }], null, ACT_LOCAL); return {};
}
const rpsJudge = (a, b) => a === b ? 'draw' : a === 'timeout' ? 'p2' : b === 'timeout' ? 'p1' : ({ rock: 'scissors', scissors: 'paper', paper: 'rock' })[a] === b ? 'p1' : 'p2';
function rpsResolve(path, d, now) {   // đủ 2 chiêu -> lật bài
  const w = rpsJudge(d.p1Choice, d.p2Choice);
  commit([{ op: 'update', path, data: { status: 'revealing', roundWinner: w, revealAt: now, p1Score: (d.p1Score || 0) + (w === 'p1' ? 1 : 0), p2Score: (d.p2Score || 0) + (w === 'p2' ? 1 : 0) } }], null, ACT_LOCAL);
}
function actRpsMove(conn, a) {
  const r = rpsRoom(conn, String(a.roomId || '')), ch = String(a.choice || ''), f = r.side + 'Choice', now = Date.now();
  if (RPS_HANDS.indexOf(ch) < 0) throw err('invalid-argument', 'BAD');
  if (r.d.status !== 'playing' || r.d[f]) return { ok: false };
  const upd = { [f]: ch }; if (!r.d.deadline) upd.deadline = now + rpsCfg().limit * 1000 + 500;   // người ra trước bắt đầu đếm giờ cho đối thủ
  commit([{ op: 'update', path: r.path, data: upd }], null, ACT_LOCAL);
  const d = getDoc(r.path).d; if (d.p1Choice && d.p2Choice) rpsResolve(r.path, d, now);
  return { ok: true };
}
function rpsFinish(path, d, now) {
  const p1Won = (d.p1Score || 0) >= 2, winner = p1Won ? d.player1 : d.player2, loser = p1Won ? d.player2 : d.player1, c = rpsCfg();
  const W = [{ op: 'update', path, data: { status: 'finished', finishedAt: now } },
    { op: 'set', path: 'rps_history/' + actId(), data: { player1: d.player1, player2: d.player2, p1Choice: d.p1Choice, p2Choice: d.p2Choice, p1Score: d.p1Score, p2Score: d.p2Score, winner, timestamp: now, by: 'server' } }];
  const wa = findAccount(winner), la = findAccount(loser);
  if (wa && la) {
    W.push({ op: 'update', path: 'accounts/' + wa.id, data: { points: actInc(c.win) } }, { op: 'update', path: 'accounts/' + la.id, data: { points: actInc(c.lose) } },
      { op: 'set', path: 'point_history/' + actId(), data: { user: winner, action: 'rps', detail: 'Kéo Búa Bao: thắng ' + loser, pointsChanged: c.win, timestamp: now, by: 'server' } },
      { op: 'set', path: 'point_history/' + actId(), data: { user: loser, action: 'rps', detail: 'Kéo Búa Bao: thua ' + winner, pointsChanged: c.lose, timestamp: now, by: 'server' } });
  }
  commit(W, null, ACT_LOCAL);
}
function rpsTick() {
  const rm = COLS.get('rps_rooms'); if (!rm) return; const now = Date.now();
  for (const [id, x] of Array.from(rm)) {
    try {
      const d = x.d || {}, path = 'rps_rooms/' + id;
      if (d.status === 'playing' && d.deadline && now >= d.deadline + 1500 && (!d.p1Choice || !d.p2Choice)) {   // hết giờ: bên chưa ra chiêu bị xử thua hiệp
        const upd = {}; if (!d.p1Choice) upd.p1Choice = 'timeout'; if (!d.p2Choice) upd.p2Choice = 'timeout';
        commit([{ op: 'update', path, data: upd }], null, ACT_LOCAL); rpsResolve(path, getDoc(path).d, now);
      } else if (d.status === 'revealing' && now >= (d.revealAt || 0) + 3000) {
        if ((d.p1Score || 0) >= 2 || (d.p2Score || 0) >= 2) rpsFinish(path, d, now);
        else commit([{ op: 'update', path, data: { p1Choice: null, p2Choice: null, roundWinner: null, deadline: null, revealAt: null, status: 'playing', round: (d.round || 1) + (d.roundWinner !== 'draw' ? 1 : 0), turn: (d.turn || 1) + 1 } }], null, ACT_LOCAL);
      } else if ((d.status === 'finished' && now - (d.finishedAt || 0) > 120000) || (d.status === 'waiting' && now - (d.ping || d.createdAt || 0) > 10 * 60000) || (d.status === 'playing' && now - Math.max(d.ping || 0, d.deadline || 0, d.revealAt || 0, d.createdAt || 0) > 30 * 60000)) {
        commit([{ op: 'delete', path }], null, ACT_LOCAL);   // phòng bỏ hoang
      }
    } catch (e) { console.error('[kbb]', id, e); }
  }
}
setInterval(rpsTick, 400);

// ---- Thưởng Giải Đấu: điểm / lượt tự cộng sau khi sơ đồ đứng yên 10 phút (máy chủ chạy, không cần ai mở trang) ----
const TOUR_TIERS = ['champ', 'second', 'third', 'fourth', 'top8'], TOUR_TIER_NAME = { champ: 'Vô Địch', second: 'Á Quân', third: 'Hạng Ba', fourth: 'Hạng Tư', top8: 'Tứ Kết' };
const TOUR_FMT = { single: 'Giải Đơn', double: 'Giải Đôi' }, TOUR_GRACE = 10 * 60000;
const TOUR_ITEM_U = { points: 'điểm lì xì', spins: 'lượt quay', tickets: 'lượt rút lì xì', conThrows: 'lượt ném còn' }, TOUR_ITEMS = ['points', 'spins', 'tickets', 'conThrows'];
function tourCompute(cfg) {   // = QDB.compute trên trang (sơ đồ loại trực tiếp)
  const valid = n => [4, 8, 16, 32, 64].indexOf(n) >= 0 ? n : 8, roundName = t => t === 2 ? 'Chung Kết' : t === 4 ? 'Bán Kết' : t === 8 ? 'Tứ Kết' : 'Vòng 1/' + (t / 2);
  const sideOf = (e, slot) => e && (e.name || (e.members && e.members.length)) ? { t: 'e', e, slot } : { t: 'bye' };
  const mk = (r, m, sides, rs, no, label) => { const o = { r, m, key: r + '-' + m, sides, no, label, w: -1, res: rs || null, decided: '' }, a = sides[0].t, b = sides[1].t;
    if (a === 'e' && b === 'e') { if (rs && (rs.w === 0 || rs.w === 1)) { o.w = rs.w; o.decided = 'play'; } } else if (a === 'e' && b === 'bye') { o.w = 0; o.decided = 'bye'; } else if (a === 'bye' && b === 'e') { o.w = 1; o.decided = 'bye'; } else if (a === 'bye' && b === 'bye') o.decided = 'void';
    return o; };
  const adv = mt => mt.decided === 'void' ? { t: 'bye' } : mt.w >= 0 ? mt.sides[mt.w] : { t: 'tbd' }, lose = mt => mt.decided === 'play' ? mt.sides[1 - mt.w] : mt.decided ? { t: 'bye' } : { t: 'tbd' };
  const N = valid(+cfg.size), R = Math.round(Math.log(N) / Math.LN2), res = cfg.results || {}, ent = cfg.entries || [], rounds = []; let no = 0;
  for (let r = 0; r < R; r++) { const cnt = N >> (r + 1), row = []; for (let m = 0; m < cnt; m++) { const sides = r === 0 ? [sideOf(ent[2 * m], 2 * m), sideOf(ent[2 * m + 1], 2 * m + 1)] : [adv(rounds[r - 1][2 * m]), adv(rounds[r - 1][2 * m + 1])]; const mt = mk(r, m, sides, res[r + '-' + m], 0, roundName(N >> r)); if (mt.decided !== 'void' && !(mt.decided === 'bye' && r === 0)) mt.no = ++no; row.push(mt); } rounds.push(row); }
  let third = null; if (cfg.third && R >= 2) { const sf = rounds[R - 2]; third = mk('t', 0, [lose(sf[0]), lose(sf[1])], res.third, ++no, 'Tranh Hạng 3'); third.key = 'third'; }
  const fin = rounds[R - 1][0];
  return { N, R, rounds, third, champion: fin.w >= 0 ? fin.sides[fin.w] : null, runnerUp: fin.decided === 'play' ? fin.sides[1 - fin.w] : null, thirdPlace: third && third.w >= 0 ? third.sides[third.w] : null };
}
function tourAwards(fmt, cfg, pc) {
  if (!pc || pc.on !== true || !cfg || !(cfg.entries || []).some(Boolean)) return [];
  let C; try { C = tourCompute(cfg); } catch (e) { return []; }
  if (!(C.champion && C.champion.t === 'e')) return [];
  const list = [], put = (k, s2) => { if (s2 && s2.t === 'e' && s2.e) list.push({ k, e: s2.e }); };
  put('champ', C.champion); put('second', C.runnerUp);
  if (C.third) { put('third', C.thirdPlace); if (C.third.decided === 'play') put('fourth', C.third.sides[1 - C.third.w]); }
  else if (C.R >= 2) C.rounds[C.R - 2].forEach(m => { if (m.decided === 'play') put('third', m.sides[1 - m.w]); });
  if (C.R >= 3) C.rounds[C.R - 3].forEach(m => { if (m.decided === 'play') put('top8', m.sides[1 - m.w]); });
  const t3 = !!cfg.third && ([4, 8, 16, 32, 64].indexOf(+cfg.size) >= 0 ? +cfg.size : 8) >= 4, tierName = k => k === 'third' && !t3 ? 'Đồng Hạng Ba' : TOUR_TIER_NAME[k];
  const num = (v, max) => { v = Math.floor(Number(v) || 0); return v > 0 ? Math.min(v, max || 1e9) : 0; }, split = pc.split === 'team' ? 'team' : 'each', key = fmt + '_' + (cfg.createdAt || 0), out = [];
  list.forEach(p => {
    const raw = (pc.tiers || {})[p.k] || {}, t = { cash: num(raw.cash), gift: String(raw.gift || '').replace(/\s+/g, ' ').trim().slice(0, 80) }; TOUR_ITEMS.forEach(k => { t[k] = num(raw[k], 1e6); });
    if (!(t.cash > 0 || t.gift || TOUR_ITEMS.some(k => t[k] > 0))) return;
    const mem = (p.e.members || []).filter(m => m && m.u), n = mem.length, items = {};
    TOUR_ITEMS.forEach(k => { const v = split === 'team' && n > 1 ? Math.floor(t[k] / n) : t[k]; if (v > 0) items[k] = v; });
    const cash = split === 'team' && n > 1 ? Math.floor(t.cash / n / 1000) * 1000 : t.cash;
    const itxt = TOUR_ITEMS.filter(k => items[k] > 0).map(k => '+' + Number(items[k]).toLocaleString('vi-VN') + ' ' + TOUR_ITEM_U[k]).join(' · ');
    const prize = [cash > 0 ? cash.toLocaleString('vi-VN') + ' VNĐ' : '', itxt, t.gift].filter(Boolean).join(' + ') + ' · Giải Đấu: ' + tierName(p.k) + ' ' + TOUR_FMT[fmt] + (cfg.title ? ' (' + cfg.title + ')' : '');
    mem.forEach(m => out.push({ id: key + '_' + p.k + '_' + m.u, user: m.u, fmt, tier: p.k, tierName: tierName(p.k), team: p.e.name || m.u, items, readyAt: (cfg.updatedAt || 0) + TOUR_GRACE, prize }));
  });
  return out;
}
function tourTick() {
  try {
    const pc = setting('tournament_prize') || {}, a = setting('tournament_bracket'), b = setting('tournament_bracket_double'), now = Date.now();
    const br = { single: a && a.format !== 'double' ? a : null, double: b || (a && a.format === 'double' ? a : null) };
    for (const f of ['single', 'double']) {
      if (!br[f]) continue;
      for (const w of tourAwards(f, br[f], pc[f])) {
        if (!Object.keys(w.items).length || now < w.readyAt || getDoc('tournament_rewards/' + w.id)) continue;
        const acc = findAccount(w.user); if (!acc) continue;
        const W = [{ op: 'set', path: 'tournament_rewards/' + w.id, data: { user: w.user, fmt: w.fmt, tier: w.tier, team: w.team, items: w.items, prize: w.prize, at: now, by: 'server' } },
          { op: 'update', path: 'accounts/' + acc.id, data: incUpd(w.items) }];
        if (w.items.points > 0) W.push({ op: 'set', path: 'point_history/' + actId(), data: { user: w.user, action: 'add', detail: 'Giải Đấu: ' + w.tierName + ' ' + TOUR_FMT[f], pointsChanged: w.items.points, timestamp: now, by: 'server' } });
        commit(W, null, ACT_LOCAL);
        console.log('[giải đấu] trao ' + w.id);
      }
    }
  } catch (e) { console.error('[giải đấu]', e); }
}
setInterval(tourTick, 30000); setTimeout(tourTick, 8000);
setInterval(gcallTick, 30000); setTimeout(gcallTick, 12000);


// ---- Tự mở khóa tài khoản: bấm yêu cầu -> chờ đủ số phút Admin đặt (settings/account_config.autoUnlockMinutes) -> máy chủ mở ----
function unlockState(conn) {
  if (!conn.u) throw err('unauthenticated', 'LOGIN');
  const a = findAccount(conn.u); if (!a) throw err('unauthenticated', 'LOGIN');
  const mins = parseInt((setting('account_config') || {}).autoUnlockMinutes) || 0;
  return { a, mins };
}
function actUnlockReq(conn) {
  const { a, mins } = unlockState(conn);
  if (a.d.isBlocked !== true) return { open: true };
  if (a.d.lockReason === 'security') throw err('failed-precondition', 'SECURITY');
  if (mins <= 0) throw err('failed-precondition', 'OFF');
  let at = +a.d.unlockRequestedAt || 0;
  if (!at) { at = Date.now(); commit([{ op: 'update', path: 'accounts/' + a.id, data: { unlockRequestedAt: at } }], null, ACT_LOCAL); }
  return { requestedAt: at, at: at + mins * 60000 };
}
function actUnlock(conn) {
  const { a, mins } = unlockState(conn), now = Date.now();
  if (a.d.isBlocked !== true) return { open: true };
  if (a.d.lockReason === 'security') throw err('failed-precondition', 'SECURITY');
  if (mins <= 0) throw err('failed-precondition', 'OFF');
  const at = +a.d.unlockRequestedAt || 0;
  if (!at || now < at + mins * 60000 - 2000) throw err('failed-precondition', 'WAIT', { at: at ? at + mins * 60000 : 0 });
  commit([{ op: 'update', path: 'accounts/' + a.id, data: { isBlocked: false, unlockedAt: now, lockedAt: null, unlockRequestedAt: null, lastActive: now } }], null, ACT_LOCAL);
  reauthAll();
  console.log('[mở khóa] @' + a.d.user + ' tự mở khóa sau ' + mins + ' phút');
  return { open: true };
}


// ---- 🎬 Chia sẻ video (settings/video_share.items): thành viên tối đa 3 video / ngày, gỡ được video của chính mình ----
const VID_LIMIT = 3;
const vClean = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim().slice(0, n);
function vDayStart(t) { const d = new Date((t || Date.now()) + 7 * 3600e3); d.setUTCHours(0, 0, 0, 0); return d.getTime() - 7 * 3600e3; }
function actVideoShare(conn, a) {
  const me = actMe(conn), u = me.d.user, now = Date.now(), p = String(a.p || ''), id = String(a.id || ''), url = String(a.url || '').trim();
  if (['youtube', 'tiktok'].indexOf(p) < 0 || !/^[A-Za-z0-9_-]{4,40}$/.test(id) || url.length > 400 || !/^https:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be|tiktok\.com)\//i.test(url)) throw err('invalid-argument', 'BAD');
  const title = vClean(a.title, 100); if (!title) throw err('invalid-argument', 'TITLE');
  const thumb = /^https:\/\/[^\s"'<>]{4,500}$/.test(String(a.thumb || '')) ? String(a.thumb) : '';
  let n = 0; const lm = COLS.get('video_share_log'), t0 = vDayStart(now);
  if (lm) for (const [, x] of lm) { const d = x.d || {}; if (d.user === u && d.act === 'share' && d.role === 'member' && (d.time || 0) >= t0) n++; }
  if (n >= VID_LIMIT) throw err('failed-precondition', 'LIMIT', { limit: VID_LIMIT });
  const cur = (setting('video_share') || {}), items0 = Array.isArray(cur.items) ? cur.items.slice() : [];
  if (items0.some(x => x && x.p === p && x.id === id)) throw err('failed-precondition', 'DUP');
  const item = { uid: now.toString(36) + crypto.randomBytes(3).toString('hex').slice(0, 4), p, id, v: !!a.v, t: Math.max(0, Math.min(86400, Math.floor(+a.t || 0))), url, thumb, author: vClean(a.author, 80),
    title, desc: vClean(a.desc, 200), pin: false, hidden: false, createdAt: now, by: u, byName: vClean(me.d.fullName || u, 60), src: 'user' };
  let items = [item].concat(items0);
  if (items.length > 60) { const keep = items.filter(x => x.pin), rest = items.filter(x => !x.pin); items = keep.concat(rest).slice(0, 60); }
  commit([{ op: 'set', path: 'settings/video_share', merge: true, data: { items, updatedAt: now } },
    { op: 'set', path: 'video_share_log/' + actId(), data: { act: 'share', user: u, name: item.byName, role: 'member', vuid: item.uid, p, id, url, title, time: now } }], null, ACT_LOCAL);
  return { item, left: VID_LIMIT - n - 1 };
}
function actVideoRemove(conn, a) {
  const me = actMe(conn), u = me.d.user, uid = String(a.uid || ''), cur = setting('video_share') || {}, items = Array.isArray(cur.items) ? cur.items : [];
  const it = items.find(x => x && x.uid === uid && x.by === u && x.src === 'user');
  if (!it) throw err('failed-precondition', 'GONE');
  const now = Date.now();
  commit([{ op: 'set', path: 'settings/video_share', merge: true, data: { items: items.filter(x => x !== it), updatedAt: now } },
    { op: 'set', path: 'video_share_log/' + actId(), data: { act: 'self_remove', user: u, name: it.byName || u, role: 'member', vuid: it.uid, p: it.p || '', id: it.id || '', url: it.url || '', title: it.title || '', time: now } }], null, ACT_LOCAL);
  return { ok: true };
}


/* ==================================================================================================
   TIN NHẮN VIDEO (Admin > Chia sẻ video > Tin nhắn video, settings/video_msg)
   - Thành viên quay / chọn video trong khung chat -> POST /api/media/video (kèm mã đăng nhập) -> lưu DATA/media/<mã>.<đuôi>
     Tin nhắn chỉ giữ đường dẫn m/<mã>.<đuôi> + ảnh xem trước nhỏ. Mã 24 ký tự ngẫu nhiên: chỉ người có tin nhắn mới mở được.
   - Máy chủ kiểm tra: tính năng bật, ai được gửi, Kênh Chung, dung lượng, số video / ngày, ổ đĩa còn trống, đúng tệp video (mp4 / webm / mov)
   - Quá số ngày giữ hoặc vượt tổng dung lượng: xóa video cũ nhất (tin nhắn hiện "Video đã hết hạn")
   ================================================================================================== */
const MEDIA = path.join(DATA, 'media'); try { fs.mkdirSync(MEDIA, { recursive: true }); } catch (e) {}
const VM_DEF = { on: true, who: 'all', general: true, maxMB: 30, maxSec: 120, perDay: 20, keepDays: 30, quotaGB: 5 };
const VM_TYPE = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
function vmNum(v, lo, hi, def) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def; }
function vmCfg() {
  const s = setting('video_msg') || {};
  return { on: s.on !== false, who: s.who === 'staff' ? 'staff' : 'all', general: s.general !== false,
    maxMB: vmNum(s.maxMB, 1, 200, VM_DEF.maxMB), maxSec: Math.round(vmNum(s.maxSec, 5, 600, VM_DEF.maxSec)), perDay: Math.round(vmNum(s.perDay, 0, 500, VM_DEF.perDay)),
    keepDays: Math.round(vmNum(s.keepDays, 0, 3650, VM_DEF.keepDays)), quotaGB: vmNum(s.quotaGB, 0.1, 2000, VM_DEF.quotaGB) };
}
function vmSniff(b) {   // nhận dạng tệp theo vài byte đầu, không tin phần đuôi / loại tệp trình duyệt báo
  if (b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp') return b.toString('latin1', 8, 12) === 'qt  ' ? 'mov' : 'mp4';
  if (b.length >= 4 && b.readUInt32BE(0) === 0x1A45DFA3) return 'webm';
  return '';
}
function vmDiskFree() { try { const st = fs.statfsSync(DATA); return st.bavail * st.bsize; } catch (e) { return Infinity; } }
function vmGate(conn, room, len) {   // kiểm tra trước khi nhận tệp (dùng cho cả lệnh hỏi trước media.check và lúc tải lên)
  const me = actMe(conn), cfg = vmCfg(), staff = isStaff(conn), user = me.d.user, now = Date.now();
  if (!cfg.on) throw err('failed-precondition', 'OFF');
  if (cfg.who === 'staff' && !staff) throw err('permission-denied', 'STAFF');
  if (!/^[\w.@-]{1,160}$/.test(room)) throw err('invalid-argument', 'ROOM');
  if (room === 'general_room' && !cfg.general && !staff) throw err('permission-denied', 'GENERAL');
  const max = Math.round(cfg.maxMB * 1048576);
  if (len > max) throw err('failed-precondition', 'SIZE', { maxMB: cfg.maxMB });
  let n = 0;
  if (!staff && cfg.perDay > 0) {
    const mm = COLS.get('media'), t0 = vDayStart(now);
    if (mm) for (const [, x] of mm) if (x.d && x.d.u === user && (+x.d.at || 0) >= t0) n++;
    if (n >= cfg.perDay) throw err('failed-precondition', 'DAY', { perDay: cfg.perDay });
  }
  if (vmDiskFree() - Math.max(len, 1) < 512 * 1048576) throw err('resource-exhausted', 'DISK');
  return { user, cfg, max, now, left: cfg.perDay > 0 && !staff ? cfg.perDay - n : -1 };
}
async function vmUpload(req, res, u) {
  const t = (String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/) || [])[1] || '', o = verify(t);
  if (!o || sessionBad(o)) throw err('unauthenticated', 'LOGIN');
  const conn = { u: '', role: '' }; authConn(conn, o.u);
  const room = String(u.searchParams.get('room') || ''), G = vmGate(conn, room, +req.headers['content-length'] || 0), { user, cfg, max, now } = G;
  const id = crypto.randomBytes(12).toString('hex'), tmp = path.join(MEDIA, id + '.part');
  let size = 0, head = Buffer.alloc(0);
  try {
    await new Promise((ok, no) => {
      const ws = fs.createWriteStream(tmp); let done = false;
      const fail = e => { if (done) return; done = true; try { req.unpipe(ws); } catch (x) {} ws.destroy(); no(e); };
      req.on('data', ch => {
        size += ch.length; if (head.length < 16) head = Buffer.concat([head, ch.subarray(0, 16 - head.length)]);
        if (size > max) { fail(err('failed-precondition', 'SIZE', { maxMB: cfg.maxMB })); req.resume(); }
      });
      req.on('aborted', () => fail(err('aborted', 'ABORTED')));
      req.on('error', fail); ws.on('error', fail);
      ws.on('finish', () => { if (!done) { done = true; ok(); } });
      req.pipe(ws);
    });
    const ext = vmSniff(head);
    if (!ext || size < 512) throw err('invalid-argument', 'TYPE');
    const name = id + '.' + ext; fs.renameSync(tmp, path.join(MEDIA, name));
    const n = k => Math.max(0, Math.min(100000, Math.round(+u.searchParams.get(k) || 0)));
    commit([{ op: 'set', path: 'media/' + id, data: { u: user, at: now, size, ext, kind: 'video', room, dur: n('dur'), w: n('w'), h: n('h') } }], null, ACT_LOCAL);
    setTimeout(vmSweep, 50);
    return json(res, 200, { ok: true, id, p: 'm/' + name, size, ext });
  } finally { try { fs.unlinkSync(tmp); } catch (e) {} }
}
function vmServe(req, res, name) {   // phát video: hỗ trợ tua (Range) — iPhone bắt buộc
  const f = path.join(MEDIA, name); let st;
  try { st = fs.statSync(f); } catch (e) { res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, CORS)); return res.end('Video đã hết hạn hoặc đã bị xóa'); }
  const total = st.size, H = Object.assign({ 'Content-Type': VM_TYPE[name.split('.').pop()] || 'application/octet-stream', 'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable', 'Last-Modified': st.mtime.toUTCString() }, CORS);
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
  if (m && (m[1] || m[2])) {
    let a, b;
    if (m[1]) { a = +m[1]; b = m[2] ? Math.min(+m[2], total - 1) : total - 1; } else { a = Math.max(0, total - +m[2]); b = total - 1; }
    if (a > b || a >= total) { res.writeHead(416, Object.assign({ 'Content-Range': 'bytes */' + total }, CORS)); return res.end(); }
    res.writeHead(206, Object.assign(H, { 'Content-Range': 'bytes ' + a + '-' + b + '/' + total, 'Content-Length': b - a + 1 }));
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(f, { start: a, end: b }).on('error', () => res.destroy()).pipe(res);
  }
  res.writeHead(200, Object.assign(H, { 'Content-Length': total }));
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
}
function vmDelete(ids) {
  ids = ids.filter(id => /^[0-9a-f]{24}$/.test(id)); if (!ids.length) return 0;
  const W = [];
  for (const id of ids) {
    const x = getDoc('media/' + id), ext = x && x.d && VM_TYPE[x.d.ext] ? x.d.ext : null;
    for (const e of ext ? [ext] : Object.keys(VM_TYPE)) try { fs.unlinkSync(path.join(MEDIA, id + '.' + e)); } catch (er) {}
    if (x) W.push({ op: 'delete', path: 'media/' + id });
  }
  for (let i = 0; i < W.length; i += 400) commit(W.slice(i, i + 400), null, ACT_LOCAL);
  return W.length;
}
function vmList() { const mm = COLS.get('media'), a = []; if (mm) for (const [id, x] of mm) a.push({ id, d: x.d || {} }); return a.sort((p, q) => (+p.d.at || 0) - (+q.d.at || 0)); }
function vmSweep() {
  try {
    const cfg = vmCfg(), now = Date.now(), list = vmList(), del = new Set();
    let total = 0; list.forEach(x => total += +x.d.size || 0);
    if (cfg.keepDays > 0) for (const x of list) if (now - (+x.d.at || 0) > cfg.keepDays * 864e5) { del.add(x.id); total -= +x.d.size || 0; }
    const quota = cfg.quotaGB * 1073741824;
    for (const x of list) { if (total <= quota) break; if (!del.has(x.id)) { del.add(x.id); total -= +x.d.size || 0; } }
    if (del.size) { vmDelete([...del]); console.log('[qd] tin nhắn video: đã xóa ' + del.size + ' video cũ'); }
    for (const f of fs.readdirSync(MEDIA)) {   // tệp tải dở / không còn trong danh sách
      const fp = path.join(MEDIA, f), m = /^([0-9a-f]{24})\.(part|mp4|webm|mov)$/.exec(f); let st; try { st = fs.statSync(fp); } catch (e) { continue; }
      if (now - st.mtimeMs < 3600e3) continue;
      if (!m || m[2] === 'part' || !getDoc('media/' + m[1])) try { fs.unlinkSync(fp); } catch (e) {}
    }
  } catch (e) { console.error('[qd] dọn video lỗi', e.message); }
}
setInterval(vmSweep, 3600e3); setTimeout(vmSweep, 25000);
function actMediaCheck(conn, a) { const G = vmGate(conn, String(a.room || ''), Math.max(0, +a.size || 0)); return { ok: true, left: G.left, cfg: G.cfg }; }
function actMediaDel(conn, a) {   // người gửi thu hồi tin / Ban Quản Trị xóa
  const id = String(a.id || ''), x = getDoc('media/' + id);
  if (!x) return { ok: true, gone: true };
  if (!isStaff(conn) && !(conn.u && x.d && x.d.u === conn.u)) throw err('permission-denied', 'OWNER');
  vmDelete([id]); return { ok: true };
}
function actMediaStats(conn) {
  if (!isStaff(conn)) throw err('permission-denied', 'STAFF');
  const list = vmList(), t0 = vDayStart(Date.now()), by = {};
  let bytes = 0, today = 0;
  for (const x of list) { bytes += +x.d.size || 0; if ((+x.d.at || 0) >= t0) today++; const k = x.d.u || '?'; by[k] = (by[k] || 0) + 1; }
  const top = Object.entries(by).sort((p, q) => q[1] - p[1]).slice(0, 5).map(([u, n]) => ({ u, n }));
  let disk = null; try { const st = fs.statfsSync(DATA); disk = { total: st.blocks * st.bsize, free: st.bavail * st.bsize }; } catch (e) {}
  return { count: list.length, bytes, today, oldest: list.length ? list[0].d.at : 0, top, disk, cfg: vmCfg() };
}
function actMediaClear(conn, a) {
  if (!isAdmin(conn)) throw err('permission-denied', 'ADMIN');
  if (a.confirm !== 'XOA') throw err('invalid-argument', 'CONFIRM');
  return { ok: true, n: vmDelete(vmList().map(x => x.id)) };
}

/* ==================================================================================================
   CHỐNG DÙNG NHIỀU THIẾT BỊ (Admin > Chống gian lận > Máy chủ chặn khi đăng nhập; mặc định TẮT)
   - 1 tài khoản – 1 thiết bị (rules.oneDevice {on, n, h}): đăng nhập ở thiết bị mới -> thiết bị cũ bị đăng xuất ngay
     (mã xác thực cũ hết hiệu lực). Đang dùng ở máy kia mà vẫn đăng nhập máy mới = 1 lần vi phạm; đủ n lần trong h giờ -> tự khóa (n = 0: không khóa).
   - 1 thiết bị – 1 tài khoản (rules.oneAccount {on, n, days}): thiết bị gắn với tài khoản đầu tiên dùng nó; tài khoản khác đăng nhập -> chặn;
     cố đủ n lần -> tự khóa tài khoản đó (n = 0: không khóa). Thiết bị không dùng quá `days` ngày thì nhả cho tài khoản khác (0 = giữ mãi).
   Miễn: Quản lý / Quản trị viên / Chủ hệ thống và danh sách "Bỏ qua" (whitelist).
   Mã thiết bị: app Android = ANDROID_ID (bền, cài lại app vẫn giữ); trình duyệt = mã lưu trong máy (xóa dữ liệu trình duyệt / ẩn danh sẽ ra mã mới).
   Ghi: acc_sessions/{tài khoản} = { sid, dev, at, ip, ua, kicks: [mốc vi phạm] } · acc_devices/{mã} = { user, first, last, users[], denied{tài khoản: số lần} }
   ================================================================================================== */
const devKey = v => String(v || '').replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 80);
function secCfg() {
  const c = setting('security_config') || {}, r = c.rules || {}, A = r.oneDevice || {}, B = r.oneAccount || {}, on = c.isEnabled !== false;
  const I = (v, d, lo, hi) => { v = parseInt(v, 10); return isNaN(v) ? d : Math.min(hi, Math.max(lo, v)); };
  return { white: new Set((Array.isArray(c.whitelist) ? c.whitelist : []).map(String)),
    A: { on: on && A.on === true, n: I(A.n, 3, 0, 50), h: I(A.h, 24, 1, 720) },
    B: { on: on && B.on === true, n: I(B.n, 2, 0, 50), days: I(B.days, 30, 0, 3650) } };
}
function secExempt(u, cfg) { const a = findAccount(u); if (!a) return false; const r = a.d.role; return r === 'admin' || r === 'manager' || a.d.owner === true || cfg.white.has(u); }
const maskU = u => { u = String(u || ''); return u.length <= 2 ? u[0] + '*' : u.slice(0, 2) + '*'.repeat(Math.min(4, u.length - 2)) + (u.length > 4 ? u.slice(-1) : ''); };
function secFlag(type, sev, user, detail, extra) {
  try { commit([{ op: 'set', path: 'security_flags/' + actId(), data: Object.assign({ type, sev, user, detail, page: 'máy chủ', at: Date.now(), status: 'new', by: 'server' }, extra || {}) }], null, ACT_LOCAL); } catch (e) { console.error('[chống gian lận]', e); }
}
function kickUser(u, keep, reason) {   // đăng xuất các kết nối của u (trừ keep(c) = true): báo cho trang rồi ngắt
  let n = 0;
  for (const c of Array.from(CONNS)) if (c.u === u && !(keep && keep(c))) { n++; try { send(c, { ev: 'kicked', reason }); } catch (e) {} c.u = ''; c.role = ''; setTimeout(() => drop(c), 400); }
  return n;
}
function secLock(u, why) {
  const a = findAccount(u); if (!a || a.d.isBlocked === true) return false;
  commit([{ op: 'update', path: 'accounts/' + a.id, data: { isBlocked: true, lockReason: 'security', lockedAt: Date.now(), lockNote: why } }], null, ACT_LOCAL);
  reauthAll(); kickUser(u, null, 'locked');
  secFlag('auto_lock', 'high', u, 'Tự khóa tài khoản: ' + why);
  console.log('[chống gian lận] khóa @' + u + ': ' + why);
  return true;
}
const ACTIVE_MS = +process.env.QD_ACTIVE_MS || 10 * 60e3;   // máy kia có thao tác trong 10 phút gần đây mới tính là "đang dùng cùng lúc" (bỏ qua app để chạy nền / tab bỏ quên)
function deviceGate(conn, a, dev, fp, sid) {
  const cfg = secCfg(), u = a.d.user, now = Date.now(), ex = secExempt(u, cfg), ip = cleanIp(conn.ip), ua = String(conn.ua || '').slice(0, 160);
  // --- 1 thiết bị – 1 tài khoản ---
  if (dev) {
    const dk = 'acc_devices/' + dev, d0 = (getDoc(dk) || {}).d || null, owner = d0 && d0.user;
    const live = !!(d0 && (cfg.B.days === 0 || now - (d0.last || 0) < cfg.B.days * 864e5)), ownerOk = !!(owner && findAccount(owner) && !secExempt(owner, cfg));
    if (cfg.B.on && !ex && owner && owner !== u && live && ownerOk) {
      const tries = (+((d0.denied || {})[u]) || 0) + 1;
      commit([{ op: 'set', path: dk, merge: true, data: { denied: { [u]: actInc(1) }, deniedAt: now, users: { $fv: 'au', a: [u] } } }], null, ACT_LOCAL);
      secFlag('multi_account', tries >= 2 ? 'high' : 'med', u, 'Đăng nhập trên thiết bị đã dùng cho tài khoản ' + owner + ' — bị chặn (lần ' + tries + ')', { device: dev, other: owner, ua });
      const locked = cfg.B.n > 0 && tries >= cfg.B.n ? secLock(u, 'Dùng nhiều tài khoản trên 1 thiết bị (thiết bị của ' + owner + ')') : false;
      throw err('permission-denied', 'DEVICE_TAKEN', { other: maskU(owner), locked, left: cfg.B.n > 0 ? Math.max(0, cfg.B.n - tries) : null });
    }
    const take = !ex && (!owner || owner === u || !live || !ownerOk);   // gắn thiết bị cho tài khoản thường (BQT / danh sách bỏ qua không giữ thiết bị)
    const upd = { last: now, lastUser: u, ip, ua, users: { $fv: 'au', a: [u] } };
    if (fp) upd.fp = fp;
    if (take) { upd.user = u; if (owner !== u) upd.first = now; }
    commit([{ op: 'set', path: dk, merge: true, data: upd }], null, ACT_LOCAL);
  }
  // --- 1 tài khoản – 1 thiết bị cùng lúc ---
  if (ex) return;
  const sk = 'acc_sessions/' + u, s0 = (getDoc(sk) || {}).d || null;
  const kicks = (s0 && Array.isArray(s0.kicks) ? s0.kicks : []).filter(t => now - t < cfg.A.h * 3600e3);
  if (cfg.A.on && s0 && s0.dev !== dev) {
    const other = c => c.u === u && c.dev !== dev, active = Array.from(CONNS).some(c => other(c) && !/okhttp|QDLink/i.test(c.ua || '') && now - (c.la || 0) < ACTIVE_MS);   // đang mở trang ở máy kia (không tính kết nối nền của app)
    if (active) kicks.push(now);
    const lock = active && cfg.A.n > 0 && kicks.length >= cfg.A.n;
    if (!lock) kickUser(u, c => !other(c), 'other-device');   // khóa thì secLock tự đăng xuất mọi nơi với lý do "locked"
    if (active) secFlag('multi_device', lock ? 'high' : 'med', u, 'Đăng nhập thiết bị mới trong khi thiết bị khác đang dùng — ' + (lock ? 'đủ số lần, khóa tài khoản' : 'thiết bị cũ bị đăng xuất') + ' (lần ' + kicks.length + ' trong ' + cfg.A.h + ' giờ)', { device: dev, other: s0.dev || '', ua });
    if (lock) {
      commit([{ op: 'set', path: sk, data: { user: u, sid, dev, ip, ua, at: now, kicks } }], null, ACT_LOCAL);
      secLock(u, 'Dùng chung 1 tài khoản trên nhiều thiết bị cùng lúc (' + kicks.length + ' lần trong ' + cfg.A.h + ' giờ)');
      throw err('permission-denied', 'LOCKED_MULTI', { n: kicks.length, h: cfg.A.h });
    }
  }
  commit([{ op: 'set', path: sk, data: { user: u, sid, dev, ip, ua, at: now, kicks } }], null, ACT_LOCAL);
}
function sessionBad(o) {   // mã xác thực còn dùng được? '' = được; 'SIGNED_OUT' = BQT đã đăng xuất mọi nơi sau khi cấp mã; 'OTHER_DEVICE' = đã đăng nhập thiết bị khác (khi bật 1 tài khoản – 1 thiết bị)
  const s0 = (getDoc('acc_sessions/' + o.u) || {}).d;
  if (s0 && s0.outAt && (+o.exp || 0) - 60 * 864e5 <= s0.outAt) return 'SIGNED_OUT';
  const cfg = secCfg(); if (!cfg.A.on || !s0 || secExempt(o.u, cfg)) return '';
  if (o.s && o.s === s0.sid) return '';
  if (o.d && o.d === s0.dev) return '';   // cùng thiết bị (vd: app + trình duyệt nhúng)
  return 'OTHER_DEVICE';
}
function secDevices() {   // cho Admin: thiết bị bị nhiều tài khoản cố dùng + tài khoản đổi thiết bị nhiều
  const cfg = secCfg(), now = Date.now(), devs = [], sess = [], live = {};
  for (const c of CONNS) if (c.u) (live[c.u] = live[c.u] || new Set()).add(c.dev || '?');
  const dm = COLS.get('acc_devices');
  if (dm) for (const [id, x] of dm) { const d = x.d || {}, den = d.denied || {}, us = Array.isArray(d.users) ? d.users : []; if (Object.keys(den).length || us.length > 1) devs.push({ id, user: d.user || '', users: us, denied: den, last: d.last || 0, first: d.first || 0, ua: d.ua || '', ip: d.ip || '', deniedAt: d.deniedAt || 0 }); }
  const sm = COLS.get('acc_sessions');
  if (sm) for (const [id, x] of sm) { const d = x.d || {}, k = (d.kicks || []).filter(t => now - t < cfg.A.h * 3600e3); if (k.length || (live[id] && live[id].size > 1)) sess.push({ user: id, dev: d.dev || '', at: d.at || 0, kicks: k.length, lastKick: k.length ? k[k.length - 1] : 0, live: live[id] ? live[id].size : 0, ua: d.ua || '', ip: d.ip || '' }); }
  devs.sort((a, b) => Math.max(b.deniedAt, b.last) - Math.max(a.deniedAt, a.last)); sess.sort((a, b) => b.lastKick - a.lastKick || b.at - a.at);
  return { cfg: { A: cfg.A, B: cfg.B }, devs: devs.slice(0, 300), sess: sess.slice(0, 300), total: { devs: dm ? dm.size : 0, sess: sm ? sm.size : 0 } };
}

/* ---------------------------------- TỰ KIỂM TRA QUÂN ĐOÀN FREE FIRE ----------------------------------
   Đơn Đăng ký ID game: máy chủ tra hồ sơ công khai của ID qua dịch vụ tra cứu (không chính thức, không thuộc Garena),
   đọc mã quân đoàn trong hồ sơ:
     - đúng Quân Đoàn đã cài -> tự xác thực (approvedBy "Hệ thống") + báo thành viên
     - có hồ sơ nhưng chưa vào / ở quân đoàn khác -> "Chưa vào quân đoàn" + báo; tự tra lại mỗi everyMin phút
     - không tra được (dịch vụ lỗi / không thấy hồ sơ) -> giữ nguyên, chờ Quản lý duyệt tay
   Cấu hình: regid_auto/cfg { on, guildId, region, everyMin, urls[] (mẫu có {uid} {region}) } · kết quả quét: regid_auto/state */
const FF_URLS = ['https://ffdvinh09-info.vercel.app/player-info?region={region}&uid={uid}', 'https://gst-info.vercel.app/player-info?region={region}&uid={uid}', 'https://free-ff-api-src-5plp.onrender.com/api/v1/account?region={region}&uid={uid}'];
const FF_URLS_OLD = 'https://ffdvinh09-info.vercel.app/player-info?region={region}&uid={uid}|https://free-ff-api-src-5plp.onrender.com/api/v1/account?region={region}&uid={uid}';   // danh sách mặc định cũ (đã lưu) -> dùng danh sách mới
const FF_DEF = { on: true, guildId: '1011610530', region: 'VN', everyMin: 30 };
const FF_TIMEOUT = +process.env.QD_FF_TIMEOUT || 15000, FF_GAP = process.env.QD_FF_GAP != null ? +process.env.QD_FF_GAP : 2500, FF_MAX = 40;
function ffCfg(o) {
  const d = Object.assign({}, FF_DEF, ((getDoc('regid_auto/cfg') || {}).d) || {}, o || {});
  const urls = (Array.isArray(d.urls) ? d.urls : []).map(u => String(u || '').trim()).filter(u => /^https?:\/\/\S+$/.test(u) && u.includes('{uid}')).slice(0, 5);
  const list = urls.length && urls.join('|') !== FF_URLS_OLD ? urls : FF_URLS;
  return { on: d.on !== false, guildId: String(d.guildId || '').replace(/\D/g, '').slice(0, 20), region: (String(d.region || 'VN').toUpperCase().replace(/[^A-Z]/g, '') || 'VN').slice(0, 4),
    everyMin: Math.min(1440, Math.max(5, +d.everyMin || 30)), urls: list };
}
function ffParse(j) {   // đọc hồ sơ người chơi từ JSON bất kỳ dịch vụ nào: basicInfo/AccountInfo... + clanBasicInfo/GuildInfo/guild...
  const o = { nick: '', acc: '', region: '', gid: '', gname: '' };
  (function walk(x, p, depth) {
    if (!x || typeof x !== 'object' || depth > 6) return;
    for (const k of Object.keys(x)) {
      const v = x[k], kl = k.toLowerCase().replace(/[^a-z]/g, ''), path = p + kl + '.';
      if (v && typeof v === 'object') { walk(v, path, depth + 1); continue; }
      if (v == null || v === '') continue;
      const sv = String(v).trim();
      if (/clan|guild/.test(p) || /^(clan|guild)/.test(kl)) {
        if (/captain|leader|owner/.test(p)) continue;
        if (!o.gid && /^(clan|guild)?id$/.test(kl) && /^\d{3,20}$/.test(sv)) o.gid = sv;
        else if (!o.gname && /^(clan|guild)?name$/.test(kl)) o.gname = sv.slice(0, 60);
      } else if (!/captain|leader|friend|social/.test(p)) {
        if (!o.nick && (/^(nickname|accountname|nick|playername)$/.test(kl) || (kl === 'name' && /basic|account|player|profile/.test(p)))) o.nick = sv.slice(0, 60);
        else if (!o.acc && /^(accountid|uid|playerid)$/.test(kl) && /^\d{3,20}$/.test(sv)) o.acc = sv;
        else if (!o.region && /^(region|accountregion|server)$/.test(kl)) o.region = sv.slice(0, 8);
      }
    }
  })(j, '', 0);
  o.found = !!o.nick;   // có tên nhân vật mới tính là hồ sơ (dịch vụ báo lỗi thường chỉ lặp lại uid)
  return o;
}
function ffWhy(st, txt, j) {   // lỗi dịch vụ: nói rõ "dịch vụ đã ngừng" hay "không thấy ID" (đọc nội dung trả về)
  const msg = j && typeof j === 'object' ? String(j.message || j.error || j.msg || j.detail || j.status || '').slice(0, 120) : '';
  const t = String(txt || '');
  if (/DEPLOYMENT_NOT_FOUND|deployment could not be found|DEPLOYMENT_DISABLED|DEPLOYMENT_PAUSED/i.test(t)) return 'Dịch vụ đã bị gỡ / tạm dừng (' + st + ')';
  if (st === 404 && !j && /<html|not found/i.test(t)) return 'Dịch vụ không còn chạy (404)';
  if (st === 404 && msg) return 'Không thấy ID (404: ' + msg + ')';
  if (st === 429) return 'Dịch vụ đang giới hạn lượt tra (429), thử lại sau';
  if (st >= 500) return 'Dịch vụ đang lỗi (' + st + (msg ? ': ' + msg : '') + ')';
  return 'Dịch vụ báo lỗi ' + st + (msg ? ': ' + msg : t ? ': ' + t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : '');
}
const FF_LOCAL_OK = process.env.QD_FF_ALLOW_LOCAL === '1';   // chỉ dùng khi chạy thử
function ffHostBad(h) {   // không cho gọi vào chính máy chủ / mạng nội bộ (địa chỉ do Ban Quản Trị nhập)
  if (FF_LOCAL_OK) return false;
  h = String(h || '').toLowerCase().replace(/^\[|\]$/g, '');
  return !h || h === 'localhost' || /\.(local|internal|localhost)$/.test(h) || /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h) || h === '::1' || /^(fc|fd|fe80)/.test(h) || h === '::' || /^\d+$/.test(h);
}
async function ffGet(url, signal) {   // tự theo chuyển hướng (tối đa 3 lần), lần nào cũng kiểm tra địa chỉ
  for (let i = 0; i < 4; i++) {
    const u = new URL(url); if (!/^https?:$/.test(u.protocol) || ffHostBad(u.hostname)) throw new Error('Địa chỉ không được phép: ' + u.hostname);
    const r = await fetch(url, { signal, redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (QD Elite server)', Accept: 'application/json' } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), url).href; continue; }
    return r;
  }
  throw new Error('Chuyển hướng quá nhiều lần');
}
const FFC = new Map();   // nhớ kết quả tra 2 phút (bấm Thử tra / quét liền nhau không gọi lại dịch vụ)
async function ffLookup(uid, cfg) {
  const key = cfg.region + ':' + uid + ':' + cfg.urls.join('|'), hit = FFC.get(key);
  if (hit && Date.now() - hit.at < 120e3) return hit.r;
  const tries = [];
  for (const t of cfg.urls) {
    const url = t.replace(/\{uid\}/g, encodeURIComponent(uid)).replace(/\{region\}/g, encodeURIComponent(cfg.region)).replace(/\{region_lc\}/g, encodeURIComponent(cfg.region.toLowerCase()));
    let host = ''; try { host = new URL(url).host; } catch (e) { tries.push({ host: t.slice(0, 50), ok: false, err: 'Địa chỉ sai' }); continue; }
    const t0 = Date.now(), ac = new AbortController(), tm = setTimeout(() => ac.abort(), FF_TIMEOUT);
    try {
      const r = await ffGet(url, ac.signal);
      const txt = (await r.text()).slice(0, 400000);
      let j = null; try { j = JSON.parse(txt); } catch (e) {}
      const p = j && typeof j === 'object' ? ffParse(j) : null;
      const x = { host, ms: Date.now() - t0, status: r.status, ok: false, nick: p ? p.nick : '', acc: p ? p.acc : '', region: p ? p.region : '', guildId: p ? p.gid : '', guildName: p ? p.gname : '', raw: txt.slice(0, 500) };
      if (!r.ok) x.err = ffWhy(r.status, txt, j);
      else if (!j) x.err = 'Trả về không phải dữ liệu JSON';
      else if (!p.found) x.err = 'Không thấy hồ sơ người chơi (ID sai hoặc khác máy chủ ' + cfg.region + ')';
      else if (p.acc && p.acc !== String(uid)) x.err = 'Hồ sơ trả về không đúng ID ' + uid;
      else x.ok = true;
      tries.push(x);
      if (x.ok) { const out = { ok: true, best: x, tries }; FFC.set(key, { at: Date.now(), r: out }); if (FFC.size > 500) FFC.delete(FFC.keys().next().value); return out; }
    } catch (e) { tries.push({ host, ms: Date.now() - t0, ok: false, err: e && e.name === 'AbortError' ? 'Quá ' + Math.round(FF_TIMEOUT / 1000) + ' giây không trả lời' : /không được phép|Chuyển hướng/.test(String(e && e.message)) ? e.message : 'Không kết nối được: ' + String(e && (e.cause && e.cause.code || e.message) || e).slice(0, 100) }); }
    finally { clearTimeout(tm); }
  }
  return { ok: false, tries };
}
function ffPush(u, title, body, now) { return { op: 'set', path: 'push_broadcast/' + actId(), data: { title, body, image: '', target: u, status: 'pending', createdAt: now, by: 'vps' } }; }
const FF_RUN = new Set();
async function regCheck(id) {
  if (FF_RUN.has(id)) return { skip: 'busy' };
  const x0 = getDoc('users/' + id); if (!x0 || !x0.d) return { skip: 'gone' };
  if (x0.d.status === 'approved') return { skip: 'approved', status: 'approved' };
  const cfg = ffCfg(), uid = String(x0.d.gameId || '');
  if (!cfg.guildId) return { skip: 'noguild' };
  if (!/^\d{3,20}$/.test(uid)) return { skip: 'badid' };
  FF_RUN.add(id);
  try {
    const r = await ffLookup(uid, cfg), now = Date.now(), x = getDoc('users/' + id);
    if (!x || !x.d || x.d.status === 'approved') return { skip: 'changed' };   // trong lúc tra: đã có người duyệt / xóa đơn
    if (!r.ok) {
      const e = r.tries.map(t => t.host + ': ' + t.err).join(' · ').slice(0, 300) || 'Chưa có dịch vụ tra cứu';
      commit([{ op: 'update', path: 'users/' + id, data: { autoCheck: { at: now, ok: false, err: e } } }], null, ACT_LOCAL);
      return { ok: false, err: e, tries: r.tries };
    }
    const b = r.best, inG = b.guildId === cfg.guildId, d = x.d, u = d.submitter || '';
    let dup = false; for (const [oid, y] of COLS.get('users') || new Map()) if (oid !== id && y.d && String(y.d.gameId) === uid) { dup = true; break; }
    const ac = { at: now, ok: true, src: b.host, nick: b.nick, guildId: b.guildId, guildName: b.guildName, inGuild: inG };
    if (dup) ac.dup = true;
    const up = { autoCheck: ac }, W = [];
    if (inG && !dup) {
      Object.assign(up, { status: 'approved', inGuild: true, approvedBy: 'Hệ thống', approvedAt: now, checkedBy: 'Hệ thống', checkedAt: now });
      if (u) W.push(ffPush(u, '✅ ID game đã được xác thực', 'Hệ thống đã thấy ' + (b.nick || d.name || 'bạn') + ' trong Quân Đoàn' + (b.guildName ? ' ' + b.guildName : '') + '. ID ' + uid + ' đã được xác thực.', now));
      W.push({ op: 'set', path: 'admin_logs/' + actId(), data: { type: 'regid', action: 'auto_approve', user: u, gameId: uid, name: d.name || '', nick: b.nick, guildId: b.guildId, by: 'Hệ thống', timestamp: now } });
    } else if (!inG && d.status !== 'not_in_guild') {
      Object.assign(up, { status: 'not_in_guild', inGuild: false, checkedBy: 'Hệ thống', checkedAt: now });
      if (u) W.push(ffPush(u, '⏳ Chưa thấy bạn trong Quân Đoàn', (b.guildId ? 'Nhân vật ' + (b.nick || uid) + ' đang ở quân đoàn ' + (b.guildName || b.guildId) + '. ' : 'Nhân vật ' + (b.nick || uid) + ' chưa vào quân đoàn nào. ')
        + 'Hãy xin vào Quân Đoàn ' + cfg.guildId + ' trong Free Fire, hệ thống sẽ tự kiểm tra lại và xác thực.', now));
    }
    W.unshift({ op: 'update', path: 'users/' + id, data: up });
    commit(W, null, ACT_LOCAL);
    return { ok: true, inGuild: inG, dup, nick: b.nick, guildId: b.guildId, guildName: b.guildName, src: b.host, status: up.status || d.status || 'pending' };
  } finally { FF_RUN.delete(id); }
}
const FF_SOON = new Set();
function ffSoon(id) {   // đơn vừa gửi (chưa tra lần nào) -> tra sau 3 giây
  const x = getDoc('users/' + id); if (!x || !x.d || x.d.status === 'approved' || x.d.autoCheck || FF_SOON.has(id)) return;
  if (!ffCfg().on) return;
  FF_SOON.add(id); setTimeout(() => { FF_SOON.delete(id); regCheck(id).catch(e => console.error('[quân đoàn] tra lỗi', e)); }, +process.env.QD_FF_SOON || 3000);
}
let ffBusy = false;
async function ffSweep(force) {
  const cfg = ffCfg(); if (ffBusy || (!cfg.on && !force) || !cfg.guildId) return { skip: true, busy: ffBusy };
  const now = Date.now(), due = [];
  for (const [id, x] of COLS.get('users') || new Map()) {
    const d = x.d || {}; if (d.status === 'approved') continue;
    const last = +(d.autoCheck && d.autoCheck.at) || 0;
    if (force || now - last >= cfg.everyMin * 60e3 - 30e3) due.push({ id, last });
  }
  due.sort((a, b) => a.last - b.last);
  const list = due.slice(0, FF_MAX), sum = { n: 0, ok: 0, approved: 0, notIn: 0, errs: 0, left: due.length - list.length, err: '' };
  ffBusy = true;
  try {
    for (let i = 0; i < list.length; i++) {
      if (i && FF_GAP) await new Promise(r => setTimeout(r, FF_GAP));   // giãn cách, không dội dịch vụ tra cứu
      const r = await regCheck(list[i].id).catch(e => ({ ok: false, err: String(e && e.message || e) }));
      if (r.skip) continue;
      sum.n++; if (r.ok) sum.ok++; else { sum.errs++; sum.err = r.err || sum.err; }
      if (r.status === 'approved') sum.approved++; else if (r.status === 'not_in_guild') sum.notIn++;
    }
  } finally { ffBusy = false; }
  try { commit([{ op: 'set', path: 'regid_auto/state', data: Object.assign({ lastRun: Date.now(), force: !!force }, sum, { err: String(sum.err).slice(0, 300) }) }], null, ACT_LOCAL); } catch (e) {}
  return sum;
}
setInterval(() => { ffSweep(false).catch(e => console.error('[quân đoàn] quét lỗi', e)); }, +process.env.QD_FF_TICK || 5 * 60e3);
setTimeout(() => { ffSweep(false).catch(() => {}); }, 45000);
async function regAdmin(conn, m) {
  if (m.fn === 'regTest') {   // Thử tra 1 ID (dùng cấu hình đang nhập, chưa cần lưu)
    const uid = String(m.uid || '').replace(/\D/g, ''); if (!/^\d{3,20}$/.test(uid)) throw err('invalid-argument', 'Nhập ID game (chỉ gồm số)');
    const o = {}; if (m.guildId != null) o.guildId = m.guildId; if (m.region) o.region = m.region; if (Array.isArray(m.urls)) o.urls = m.urls;
    const cfg = ffCfg(o); FFC.clear();
    const r = await ffLookup(uid, cfg);
    return { ok: r.ok, guildId: cfg.guildId, region: cfg.region, inGuild: !!(r.ok && r.best.guildId === cfg.guildId), best: r.best || null, tries: r.tries };
  }
  if (m.fn === 'regCheck') { const id = String(m.id || ''); if (!getDoc('users/' + id)) throw err('not-found', 'Không có đơn này'); FFC.clear(); return regCheck(id); }
  if (m.fn === 'regSweep') {
    if (ffBusy) return { started: false, busy: true };
    let due = 0; for (const [, x] of COLS.get('users') || new Map()) if (x.d && x.d.status !== 'approved') due++;
    FFC.clear(); ffSweep(true).catch(e => console.error('[quân đoàn] quét lỗi', e));
    return { started: true, due: Math.min(due, FF_MAX) };
  }
}

const ACTS = { 'shop.buy': actShopBuy, 'cashout': actCashout, 'gift.turns': actGiftTurns,
  'lixi.pick': actLixi, 'wheel.claim': actWheelClaim, 'wheel.spin': actWheelSpin, 'tranh.open': actTranh, 'lucky.pick': actLuckyPick,
  'task.login': actTaskLogin, 'att.check': actAttend, 'invite.use': actInvite, 'gift.claim': actGiftClaim, 'con.wind': actConWind, 'con.free': actConFree, 'con.throw': actConThrow,
  'rps.find': actRpsFind, 'rps.ping': actRpsPing, 'rps.move': actRpsMove, 'rps.leave': actRpsLeave, 'acc.unlockReq': actUnlockReq, 'acc.unlock': actUnlock, 'video.share': actVideoShare, 'video.remove': actVideoRemove,
  'media.check': actMediaCheck, 'media.del': actMediaDel, 'media.stats': actMediaStats, 'media.clear': actMediaClear };
function act(conn, fn, a) {
  const f = ACTS[fn];
  if (!f) throw err('invalid-argument', 'Lệnh lạ: ' + fn);
  STAT.w++;
  return f(conn, a || {});
}

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
    const vm = /^\/m\/([0-9a-f]{24}\.(?:mp4|webm|mov))$/.exec(u.pathname);
    if (vm && (req.method === 'GET' || req.method === 'HEAD')) return vmServe(req, res, vm[1]);
    if (u.pathname === '/api/media/video' && req.method === 'POST') return await vmUpload(req, res, u);
    const c = httpConn(req, u);
    if (u.pathname === '/api/commit' && req.method === 'POST') { const m = JSON.parse(await body(req, 1 << 20) || '{}'); if (!c.local && m.token) { const o = verify(m.token); if (o && !sessionBad(o)) authConn(c, o.u); } const r = commit(m.writes || [], m.pre || null, c); return json(res, 200, { ok: true, v: r.v }); }
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

function bye() { markClean(); try { sql.close(); } catch (e) {} process.exit(0); }
process.on('SIGINT', bye); process.on('SIGTERM', bye);
module.exports = { runQuery, commit, getDoc };
