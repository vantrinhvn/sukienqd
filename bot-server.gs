/* =====================================================================================
   QD ELITE - MÁY CHỦ TỰ GỬI BOT BÁO CÁO (Google Apps Script, miễn phí)
   -------------------------------------------------------------------------------------
   Tới giờ hẹn (giờ Việt Nam) máy chủ tự gửi báo cáo vào Kênh Chung, KHÔNG CẦN ai mở web
   (Admin offline vẫn gửi). Dùng đúng lịch + nội dung đang cài ở Admin > Bot Báo Cáo.
   Mỗi mốc giờ chỉ gửi ĐÚNG 1 LẦN: nếu trang Admin / bot.html đang mở cũng gửi dự phòng,
   ai giành được quyền trước thì gửi, bên kia tự bỏ qua.

   CÀI ĐẶT (1 lần, khoảng 3 phút):
   1. Mở https://script.google.com  ->  "Dự án mới" (New project).
   2. Xóa hết chữ có sẵn, dán TOÀN BỘ file này vào, bấm 💾 Lưu. Đặt tên dự án: "QD Bot Bao Cao".
   3. Ở thanh trên chọn hàm  CAI_DAT  ->  bấm ▶ Chạy (Run).
      Google hỏi quyền -> "Xem xét quyền" -> chọn tài khoản -> "Nâng cao" -> "Đi tới QD Bot Bao Cao" -> "Cho phép".
   4. Xong. Nhật ký (Execution log) hiện "ĐÃ CÀI XONG". Trong Admin > Bot Báo Cáo, ô
      "🖥️ Máy chủ tự gửi" chuyển sang "Đang chạy" sau tối đa 1 phút.

   HÀM KHÁC (chọn tên hàm rồi bấm ▶ Chạy):
   - XEM_THU   : soạn thử báo cáo với số liệu thật lúc này, chỉ in ra Nhật ký, KHÔNG gửi.
   - GUI_NGAY  : gửi 1 báo cáo vào Kênh Chung ngay bây giờ (ghi "Gửi tay · máy chủ").
   - GO_CAI_DAT: tắt máy chủ tự gửi (xóa lịch chạy mỗi phút).
   Bật / tắt Bot, đổi giờ, đổi nội dung: vẫn làm trong Admin như cũ, KHÔNG cần sửa file này.
   ===================================================================================== */

var PROJECT_ID = 'web-dangky-123';
var API_KEY = 'AIzaSyCtn0peiXBsrRRgUZSSVQFrBe-RGgxS6eQ';
var VER = 'srv-1';

/* ---------------- Cài / gỡ ---------------- */
function CAI_DAT() {
  GO_CAI_DAT(true);
  ScriptApp.newTrigger('chayMoiPhut').timeBased().everyMinutes(1).create();
  PropertiesService.getScriptProperties().deleteProperty('hb');
  chayMoiPhut();
  var cfg = norm(fsGet('settings/report_bot'));
  Logger.log('ĐÃ CÀI XONG. Máy chủ kiểm tra mỗi phút và tự gửi báo cáo đúng giờ.');
  Logger.log('Bot hiện ' + (cfg.isEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT (bật trong Admin > Bot Báo Cáo)') + ' · giờ gửi: ' + (cfg.times.join(', ') || 'chưa có'));
  var n = nextRun(cfg, Date.now());
  if (cfg.isEnabled && n) Logger.log('Lần gửi kế tiếp: ' + dateShow(vnParts(n.ts)) + ' lúc ' + n.time);
}
function GO_CAI_DAT(silent) {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'chayMoiPhut') ScriptApp.deleteTrigger(t); });
  if (silent !== true) {
    try { fsPatch('settings/report_bot_server', { lastRun: Date.now(), stopped: true, ver: VER }); } catch (e) {}
    Logger.log('Đã tắt máy chủ tự gửi. Chạy CAI_DAT để bật lại.');
  }
}
function XEM_THU() {
  var cfg = norm(fsGet('settings/report_bot'));
  var c = compose(cfg, collect(cfg, Date.now()));
  Logger.log('----- XEM THỬ (không gửi) -----\n' + c.text);
  Logger.log('Nhắc tên: ' + c.mentions.length + ' tài khoản');
}
function GUI_NGAY() {
  var now = Date.now(), p = vnParts(now), cfg = norm(fsGet('settings/report_bot'));
  var r = send({ runId: 'manual_' + dateKey(p) + '_' + now.toString(36), time: hm(now), key: dateKey(p), ts: now }, cfg, true);
  Logger.log(r.ok ? 'Đã gửi báo cáo vào Kênh Chung.' : 'Chưa gửi được: ' + r.reason);
}

/* ---------------- Chạy mỗi phút ---------------- */
function chayMoiPhut() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return;
  var now = Date.now(), note = '', err = '', sentAny = false;
  try {
    var cfg = norm(fsGet('settings/report_bot'));
    if (cfg.isEnabled) {
      dueSlots(cfg, now).forEach(function (s) {
        try {
          var r = send(s, cfg, false);
          if (r.ok) { sentAny = true; note = 'Đã gửi mốc ' + s.time; }
          else if (r.skipped) note = 'Bỏ qua mốc ' + s.time + ' (chưa ai đăng nhập)';
        } catch (e) { err = 'Mốc ' + s.time + ': ' + msgOf(e); }
      });
    }
  } catch (e) { err = msgOf(e); }
  finally { heartbeat(now, err, note, sentAny); lock.releaseLock(); }
  if (err) Logger.log('Lỗi: ' + err);
}
// Báo "còn sống" cho Admin (ghi tối đa 1 lần / 4 phút, hoặc ngay khi có lỗi / vừa gửi)
function heartbeat(now, err, note, force) {
  var P = PropertiesService.getScriptProperties(), last = JSON.parse(P.getProperty('hb') || '{}');
  if (!force && !err && last.err === '' && now - (last.at || 0) < 4 * 60000) return;
  var data = { lastRun: now, ok: !err, err: String(err || '').slice(0, 300), ver: VER, every: 1, stopped: false };
  if (note) { data.note = note; data.noteAt = now; }
  try { fsPatch('settings/report_bot_server', data); P.setProperty('hb', JSON.stringify({ at: now, err: err || '' })); } catch (e) { Logger.log('Không ghi được trạng thái: ' + msgOf(e)); }
}
function msgOf(e) { return String((e && (e.message || e)) || 'Lỗi không rõ').slice(0, 300); }

/* =====================================================================================
   PHẦN DƯỚI GIỐNG HỆT bộ máy Bot trên web (qd-report-bot) - không cần sửa
   ===================================================================================== */
var VN = 7 * 3600e3, BOT = 'qd_bot', DAY = 864e5;
var WD = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
var DEF = {
  isEnabled: false, enabledAt: 0, schedAt: 0,
  times: ['20:00'], days: [0, 1, 2, 3, 4, 5, 6], from: '', to: '',
  grace: 60,
  botName: 'Bot Báo Cáo',
  title: '📋 BÁO CÁO HOẠT ĐỘNG — {thu}, {ngay}',
  footer: 'Cảm ơn anh em đã có mặt hôm nay! Ai chưa điểm danh nhớ vào đúng giờ nhé 💪',
  sec: { att: true, login: true, loginNoAtt: true, noLogin: false, locked: true },
  tag: true, showTime: true, excludeStaff: true, exclude: [], maxNames: 100, skipEmpty: false
};
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
function dueSlots(cfg, now) {
  var floor = Math.max(cfg.enabledAt || 0, cfg.schedAt || 0) - 60000;
  return slotsFor(cfg, vnParts(now)).filter(function (s) { return s.ts <= now && now - s.ts <= cfg.grace * 60000 && s.ts >= floor; });
}

/* ---------- Thu số liệu ---------- */
function collect(cfg, at) {
  var p = vnParts(at), start = dayStart(p), key = dateKey(p), d1 = dateVN(p), d2 = dateShow(p);
  var ex = {}; cfg.exclude.forEach(function (u) { ex[u.toLowerCase()] = 1; });
  var accDocs = fsList('accounts');
  var attDocs = fsQuery({ from: [{ collectionId: 'attendance' }], where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'IN', value: toFs(d1 === d2 ? [d1] : [d1, d2]) } } });
  var accs = [], by = {}, all = [], locked = [];
  accDocs.forEach(function (a) {
    var u = String(a.user || '').trim();
    if (u && u !== BOT) all.push(u);
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
  var attended = accs.filter(function (a) { return att[a.u]; }).sort(function (a, b) { return att[a.u].ts - att[b.u].ts; });
  var logged = accs.filter(function (a) { return att[a.u] || a.ll || a.la >= start; }).sort(cmpName);
  var inLog = {}; logged.forEach(function (a) { inLog[a.u] = 1; });
  return {
    at: at, p: p, total: accs.length, att: att, attended: attended, loggedIn: logged,
    loginNoAtt: logged.filter(function (a) { return !att[a.u]; }),
    noLogin: accs.filter(function (a) { return !inLog[a.u]; }).sort(cmpName),
    locked: locked.sort(cmpName),
    online: accs.filter(function (a) { return a.online && at - a.la < 120000; }).length
  };
}

/* ---------- Soạn tin ---------- */
function fill(tpl, v) { return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }
function compose(cfg, d) {
  var men = {};
  function list(arr, withTime, empty) {
    if (!arr.length) return empty || '— Chưa có ai —';
    var shown = arr.slice(0, cfg.maxNames);
    var s = shown.map(function (a) {
      if (cfg.tag) men[a.u] = 1;
      return (cfg.tag ? '@' : '') + a.u + (withTime && cfg.showTime && d.att[a.u] && d.att[a.u].ts ? ' (' + hm(d.att[a.u].ts) + ')' : '') + (a.why ? ' (' + a.why + ')' : '');
    }).join(', ');
    if (arr.length > shown.length) s += ' … và ' + (arr.length - shown.length) + ' người khác';
    return s;
  }
  var pct = d.total ? Math.round(d.attended.length * 1000 / d.total) / 10 : 0;
  var v = { ngay: dateShow(d.p), thu: WD[d.p.wd], gio: hm(d.at), diemdanh: d.attended.length, dangnhap: d.loggedIn.length,
    chuadiemdanh: d.loginNoAtt.length, chuavao: d.noLogin.length, bikhoa: d.locked.length, tong: d.total, tile: String(pct).replace('.', ',') + '%', bot: cfg.botName };
  var out = [], t = fill(cfg.title, v).trim();
  if (t) out.push(t);
  out.push('⏰ Chốt số liệu lúc ' + v.gio + ' · ' + d.total + ' thành viên');
  if (cfg.sec.att) out.push('', '✅ ĐÃ ĐIỂM DANH: ' + d.attended.length + '/' + d.total + ' (' + v.tile + ')', list(d.attended, true));
  if (cfg.sec.login) out.push('', '🔐 ĐĂNG NHẬP HÔM NAY: ' + d.loggedIn.length + '/' + d.total, list(d.loggedIn));
  if (cfg.sec.loginNoAtt) out.push('', '⚠️ ĐÃ VÀO NHƯNG CHƯA ĐIỂM DANH: ' + d.loginNoAtt.length, list(d.loginNoAtt));
  if (cfg.sec.noLogin) out.push('', '😴 CHƯA ĐĂNG NHẬP: ' + d.noLogin.length, list(d.noLogin));
  if (cfg.sec.locked) out.push('', '🔒 TÀI KHOẢN BỊ KHÓA: ' + d.locked.length, list(d.locked, false, '— Không có tài khoản nào bị khóa —'));
  var f = fill(cfg.footer, v).trim(); if (f) out.push('', f);
  return {
    text: out.join('\n').slice(0, 30000), mentions: Object.keys(men),
    counts: { total: d.total, att: d.attended.length, login: d.loggedIn.length, loginNoAtt: d.loginNoAtt.length, noLogin: d.noLogin.length, locked: d.locked.length, online: d.online }
  };
}

/* ---------- Gửi: giành quyền (giao dịch) -> thu số liệu -> ghi tin Kênh Chung + lịch sử cùng lúc ---------- */
function send(slot, cfg, manual) {
  var path = 'bot_reports/' + slot.runId;
  var got = claim(path, slot, manual);
  if (got !== 'ok') return { ok: false, reason: got };
  try {
    var data = collect(cfg, Date.now()), comp = compose(cfg, data);
    if (cfg.skipEmpty && !manual && !data.loggedIn.length) {
      fsPatch(path, { status: 'skipped', note: 'Hôm nay chưa ai đăng nhập', doneAt: Date.now(), counts: comp.counts });
      return { ok: false, reason: 'done', skipped: true };
    }
    var id = autoId(), t = Date.now();
    var msg = { conversationId: 'general_room', from: BOT, to: 'all', text: comp.text, imageUrl: null, time: t, read: false, heart: false, hearts: [], readBy: [],
      bot: true, botName: cfg.botName, mentions: comp.mentions, reportId: slot.runId };
    var rep = { status: 'sent', msgId: id, sentAt: t, counts: comp.counts, text: comp.text.slice(0, 6000) };
    fsCall('post', ':commit', { writes: [
      { update: { name: docName('private_chat/' + id), fields: toFields(msg) }, currentDocument: { exists: false } },
      { update: { name: docName(path), fields: toFields(rep) }, updateMask: { fieldPaths: Object.keys(rep) } }
    ] });
    return { ok: true, msgId: id };
  } catch (e) {
    try { fsPatch(path, { status: 'error', err: msgOf(e).slice(0, 200), errAt: Date.now() }); } catch (er) {}
    throw e;
  }
}
function claim(path, slot, manual) {
  var tx = fsCall('post', ':beginTransaction', { options: { readWrite: {} } }).transaction;
  var x = fsGet(path, tx), t = Date.now(), why = '';
  if (x) {
    if (x.status === 'sent' || x.status === 'skipped') why = 'done';
    else if ((x.tries || 0) >= 3) why = 'done';
    else if (x.status === 'sending' && t - (+x.at || 0) < 180000) why = 'busy';
  }
  if (why) { try { fsCall('post', ':rollback', { transaction: tx }); } catch (e) {} return why; }
  var rec = { runId: slot.runId, slot: slot.time, dateKey: slot.key, due: slot.ts, status: 'sending', by: 'máy chủ', byRole: 'server', at: t, tries: ((x && x.tries) || 0) + 1, manual: !!manual };
  try {
    fsCall('post', ':commit', { transaction: tx, writes: [{ update: { name: docName(path), fields: toFields(rec) }, updateMask: { fieldPaths: Object.keys(rec) } }] });
  } catch (e) {
    if (/ABORTED|409|contention/i.test(msgOf(e))) return 'busy';   // trang Admin vừa giành trước
    throw e;
  }
  return 'ok';
}

/* =====================================================================================
   Firestore REST (dùng cùng API key với trang web)
   ===================================================================================== */
function base() { return 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents'; }
function docName(path) { return 'projects/' + PROJECT_ID + '/databases/(default)/documents/' + path; }
function encPath(path) { return path.split('/').map(encodeURIComponent).join('/'); }
function fsCall(method, suffix, body, query) {
  var url = base() + suffix + (suffix.indexOf('?') >= 0 ? '&' : '?') + 'key=' + encodeURIComponent(API_KEY) + (query || '');
  var opt = { method: method, muteHttpExceptions: true, contentType: 'application/json' };
  if (body) opt.payload = JSON.stringify(body);
  var r = UrlFetchApp.fetch(url, opt), code = r.getResponseCode(), txt = r.getContentText();
  if (code === 404 && method === 'get') return null;
  if (code < 200 || code >= 300) {
    var m = txt; try { var j = JSON.parse(txt); m = (j.error && (j.error.status + ': ' + j.error.message)) || txt; } catch (e) {}
    throw new Error('Firestore ' + code + ' ' + String(m).slice(0, 220));
  }
  return txt ? JSON.parse(txt) : {};
}
function fsGet(path, tx) {
  var d = fsCall('get', '/' + encPath(path), null, tx ? '&transaction=' + encodeURIComponent(tx) : '');
  return d && d.fields ? fromFields(d.fields) : (d ? {} : null);
}
function fsPatch(path, data) {
  var mask = Object.keys(data).map(function (k) { return '&updateMask.fieldPaths=' + encodeURIComponent(k); }).join('');
  return fsCall('patch', '/' + encPath(path), { fields: toFields(data) }, mask);
}
function fsList(col) {
  var out = [], tok = '';
  for (var i = 0; i < 200; i++) {
    var r = fsCall('get', '/' + col, null, '&pageSize=300' + (tok ? '&pageToken=' + encodeURIComponent(tok) : ''));
    (r && r.documents || []).forEach(function (d) { out.push(fromFields(d.fields || {})); });
    tok = r && r.nextPageToken; if (!tok) break;
  }
  return out;
}
function fsQuery(sq) {
  var r = fsCall('post', ':runQuery', { structuredQuery: sq });
  return (r || []).filter(function (x) { return x.document; }).map(function (x) { return fromFields(x.document.fields || {}); });
}
function autoId() { var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = ''; for (var i = 0; i < 20; i++) s += c.charAt(Math.floor(Math.random() * c.length)); return s; }

function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(toFs) } : {} };
  return { mapValue: { fields: toFields(v) } };
}
function toFields(o) { var f = {}; Object.keys(o).forEach(function (k) { f[k] = toFs(o[k]); }); return f; }
function fromFs(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  if ('referenceValue' in v) return v.referenceValue;
  return null;
}
function fromFields(f) { var o = {}; Object.keys(f || {}).forEach(function (k) { o[k] = fromFs(f[k]); }); return o; }
