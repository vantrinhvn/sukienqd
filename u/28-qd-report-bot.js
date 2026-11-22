    (function () {
        'use strict';
        var W = window;
        if (W.QDReportBot) return;
        var VN = 7 * 3600e3, BOT = 'qd_bot', CFG_DOC = 'report_bot', DAY = 864e5;
        var WD = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
        var DEF = {
            isEnabled: false, enabledAt: 0, schedAt: 0,
            times: ['20:00'], days: [0, 1, 2, 3, 4, 5, 6], from: '', to: '',
            grace: 60, memberRun: false,
            botName: 'Bot Báo Cáo',
            title: '📋 BÁO CÁO HOẠT ĐỘNG — {thu}, {ngay}',
            footer: 'Cảm ơn anh em đã có mặt hôm nay! Ai chưa điểm danh nhớ vào đúng giờ nhé 💪',
            sec: { att: true, login: true, loginNoAtt: true, noLogin: false, locked: true, gameId: true, bank: true },
            tag: true, showTime: true, excludeStaff: true, exclude: [], maxNames: 100, skipEmpty: false
        };
        var DB = null;
        function db() { if (DB) return DB; try { if (W.firebase && firebase.apps && firebase.apps.length && firebase.firestore) DB = firebase.firestore(); } catch (e) {} return DB; }
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

        /* ---------- Giờ Việt Nam (UTC+7, không đổi giờ mùa hè) ---------- */
        function vnParts(t) {
            var d = new Date((t == null ? Date.now() : t) + VN);
            return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
        }
        function dateKey(p) { return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
        function dateVN(p) { return p.d + '/' + p.m + '/' + p.y; }              // giống toLocaleDateString('vi-VN') ở trang Điểm Danh
        function dateShow(p) { return pad(p.d) + '/' + pad(p.m) + '/' + p.y; }
        function dayStart(p) { return Date.UTC(p.y, p.m - 1, p.d) - VN; }
        function hm(t) { var p = vnParts(t); return pad(p.h) + ':' + pad(p.mi); }

        /* ---------- Chuẩn hóa cấu hình ---------- */
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
            o.grace = n(c.grace, DEF.grace, 5, 720); o.memberRun = false;   // bỏ "máy thành viên gửi thay"
            ['botName', 'title', 'footer'].forEach(function (k) { if (typeof c[k] === 'string') o[k] = c[k].slice(0, k === 'botName' ? 40 : 300); });
            if (!o.botName.trim()) o.botName = DEF.botName;
            if (c.sec && typeof c.sec === 'object') Object.keys(o.sec).forEach(function (k) { if (typeof c.sec[k] === 'boolean') o.sec[k] = c.sec[k]; });
            ['tag', 'showTime', 'excludeStaff', 'skipEmpty'].forEach(function (k) { if (typeof c[k] === 'boolean') o[k] = c[k]; });
            if (Array.isArray(c.exclude)) o.exclude = c.exclude.map(function (u) { return String(u).replace(/^@/, '').trim(); }).filter(Boolean).slice(0, 300);
            o.maxNames = n(c.maxNames, DEF.maxNames, 10, 500);
            o.updatedAt = +c.updatedAt || 0; o.updatedBy = c.updatedBy || '';
            return o;
        }

        /* ---------- Lịch: các mốc giờ của 1 ngày, mốc kế tiếp, mốc đang tới hạn ---------- */
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
            now = now || Date.now(); if (!cfg || !cfg.times.length || !cfg.days.length) return null;
            for (var i = 0; i < 400; i++) {
                var p = vnParts(now + i * DAY);
                if (cfg.to && dateKey(p) > cfg.to) return null;
                var s = slotsFor(cfg, p).filter(function (x) { return x.ts > now; })[0];
                if (s) { s.p = p; return s; }
            }
            return null;
        }
        function dueSlots(cfg, now, delay) {
            var floor = Math.max(cfg.enabledAt || 0, cfg.schedAt || 0) - 60000;
            return slotsFor(cfg, vnParts(now)).filter(function (s) { return s.ts <= now - (delay || 0) && now - s.ts <= cfg.grace * 60000 && s.ts >= floor; });
        }

        /* ---------- Thu số liệu: tài khoản, điểm danh, đăng nhập hôm nay ---------- */
        async function collect(cfg, at) {
            var D = db(); if (!D) throw new Error('Chưa kết nối được máy chủ.');
            cfg = cfg || norm(null); at = at || Date.now();
            var p = vnParts(at), start = dayStart(p), key = dateKey(p), d1 = dateVN(p), d2 = dateShow(p);
            var ex = {}; cfg.exclude.forEach(function (u) { ex[u.toLowerCase()] = 1; });
            var res = await Promise.all([
                D.collection('accounts').get(),
                D.collection('attendance').where('date', 'in', d1 === d2 ? [d1] : [d1, d2]).get(),
                // Khai báo ID (đơn đăng ký: users) + tài khoản ngân hàng (bank_info): không đọc được thì bỏ qua mục đó, báo cáo vẫn gửi
                D.collection('users').get().catch(function () { return null; }),
                D.collection('bank_info').get().catch(function () { return null; })
            ]);
            var accs = [], by = {}, all = [], locked = [];
            res[0].forEach(function (doc) {
                var a = doc.data() || {}, u = String(a.user || '').trim();
                if (u && u !== BOT) all.push(u);
                if (!u || u === BOT || ex[u.toLowerCase()]) return;
                var role = a.role || (u === 'admin' ? 'admin' : 'user');
                if (cfg.excludeStaff && (role === 'admin' || role === 'manager')) return;
                if (a.isBlocked === true) { locked.push({ u: u, name: a.fullName || a.name || '', role: role, why: a.lockReason === 'security' ? 'nghi gian lận' : '', at: +a.lockedAt || 0 }); return; }
                var o = { u: u, name: a.fullName || a.name || '', role: role, la: +a.lastActive || 0, online: a.online !== false, ll: a.lastLoginDate === key ? (+a.lastLoginAt || 0) : 0 };
                accs.push(o); by[u] = o;
            });
            var att = {};
            res[1].forEach(function (doc) {
                var x = doc.data() || {}, u = x.userName; if (!u || !by[u]) return;
                var ts = +x.timestamp || 0; if (!att[u] || ts < att[u].ts) att[u] = { ts: ts, time: x.time || '' };
            });
            var cmpName = function (a, b) { return a.u.localeCompare(b.u, 'vi', { sensitivity: 'base' }); };
            // Ai đã khai ID / ngân hàng (chỉ lấy tên + giờ khai, KHÔNG đưa số ID / số tài khoản vào báo cáo)
            var idTs = {}, bkTs = {};
            if (res[2]) res[2].forEach(function (doc) { var x = doc.data() || {}, u = String(x.submitter || '').trim(), ts = +x.timestamp || 0; if (u && by[u] && x.gameId && (!idTs[u] || ts > idTs[u].ts)) idTs[u] = { ts: ts }; });
            if (res[3]) res[3].forEach(function (doc) { var x = doc.data() || {}, u = String(x.user || doc.id || '').trim(), ts = +x.changedAt || +x.updatedAt || 0; if (u && by[u] && x.accNo) bkTs[u] = { ts: ts }; });
            var byTs = function (m) { return function (a, b) { return (m[a.u].ts || 0) - (m[b.u].ts || 0); }; };
            var idDone = accs.filter(function (a) { return idTs[a.u]; }), bkDone = accs.filter(function (a) { return bkTs[a.u]; });
            var attended = accs.filter(function (a) { return att[a.u]; }).sort(function (a, b) { return att[a.u].ts - att[b.u].ts; });
            var logged = accs.filter(function (a) { return att[a.u] || a.ll || a.la >= start; }).sort(cmpName);
            var inLog = {}; logged.forEach(function (a) { inLog[a.u] = 1; });
            return {
                at: at, p: p, key: key, total: accs.length, att: att, by: by, allUsers: all.sort(),
                attended: attended, loggedIn: logged,
                loginNoAtt: logged.filter(function (a) { return !att[a.u]; }),
                noLogin: accs.filter(function (a) { return !inLog[a.u]; }).sort(cmpName),
                locked: locked.sort(cmpName),
                idOk: !!res[2], idTs: idTs, idDone: idDone, idNew: idDone.filter(function (a) { return idTs[a.u].ts >= start; }).sort(byTs(idTs)), idMissing: accs.filter(function (a) { return !idTs[a.u]; }).sort(cmpName),
                bkOk: !!res[3], bkTs: bkTs, bkDone: bkDone, bkNew: bkDone.filter(function (a) { return bkTs[a.u].ts >= start; }).sort(byTs(bkTs)), bkMissing: accs.filter(function (a) { return !bkTs[a.u]; }).sort(cmpName),
                online: accs.filter(function (a) { return a.online && at - a.la < 120000; }).length
            };
        }

        /* ---------- Soạn tin nhắn ---------- */
        function fill(tpl, v) { return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }
        function compose(cfg, d) {
            cfg = cfg || norm(null);
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
                chuadiemdanh: d.loginNoAtt.length, chuavao: d.noLogin.length, bikhoa: (d.locked || []).length, tong: d.total, tile: String(pct).replace('.', ',') + '%', bot: cfg.botName,
                khaiid: (d.idDone || []).length, chuakhaiid: (d.idMissing || []).length, khainh: (d.bkDone || []).length, chuakhainh: (d.bkMissing || []).length };
            var out = [], t = fill(cfg.title, v).trim();
            if (t) out.push(t);
            out.push('⏰ Chốt số liệu lúc ' + v.gio + ' · ' + d.total + ' thành viên');
            if (cfg.sec.att) out.push('', '✅ ĐÃ ĐIỂM DANH: ' + d.attended.length + '/' + d.total + ' (' + v.tile + ')', list(d.attended, true));
            if (cfg.sec.login) out.push('', '🔐 ĐĂNG NHẬP HÔM NAY: ' + d.loggedIn.length + '/' + d.total, list(d.loggedIn));
            if (cfg.sec.loginNoAtt) out.push('', '⚠️ ĐÃ VÀO NHƯNG CHƯA ĐIỂM DANH: ' + d.loginNoAtt.length, list(d.loginNoAtt));
            if (cfg.sec.noLogin) out.push('', '😴 CHƯA ĐĂNG NHẬP: ' + d.noLogin.length, list(d.noLogin));
            if (cfg.sec.locked) out.push('', '🔒 TÀI KHOẢN BỊ KHÓA: ' + (d.locked || []).length, list(d.locked || [], false, '— Không có tài khoản nào bị khóa —'));
            function decl(on, ok, icon, label, done, fresh, miss, tm) {
                if (!on || !ok) return;
                out.push('', icon + ' ' + label + ': ' + done.length + '/' + d.total + ' đã khai' + (fresh.length ? ' · hôm nay +' + fresh.length : ''));
                if (fresh.length) out.push('🆕 Mới khai hôm nay: ' + list(fresh, tm));
                out.push('⏳ Chưa khai: ' + (miss.length ? miss.length + ' — ' : '') + list(miss, false, 'Tất cả đã khai 🎉'));
            }
            decl(cfg.sec.gameId, d.idOk !== false && d.idDone, '🆔', 'KHAI BÁO ID', d.idDone || [], d.idNew || [], d.idMissing || [], d.idTs);
            decl(cfg.sec.bank, d.bkOk !== false && d.bkDone, '🏦', 'KHAI BÁO TÀI KHOẢN NGÂN HÀNG', d.bkDone || [], d.bkNew || [], d.bkMissing || [], d.bkTs);
            var f = fill(cfg.footer, v).trim(); if (f) out.push('', f);
            return {
                text: out.join('\n').slice(0, 30000), mentions: Object.keys(men), vars: v,
                counts: { total: d.total, att: d.attended.length, login: d.loggedIn.length, loginNoAtt: d.loginNoAtt.length, noLogin: d.noLogin.length, locked: (d.locked || []).length, online: d.online,
                    gameId: (d.idDone || []).length, gameIdNew: (d.idNew || []).length, bank: (d.bkDone || []).length, bankNew: (d.bkNew || []).length }
            };
        }

        /* ---------- @nhắc tên: tô màu + tách danh sách người được nhắc ---------- */
        // resolve(token) -> tên tài khoản đúng (hoặc null nếu không có ai tên đó)
        function scan(raw, resolve, cb) {
            var re = /@([^\s@<>"'`,;:!?()[\]{}]+)/g, m;
            while ((m = re.exec(raw))) {
                var prev = m.index ? raw.charAt(m.index - 1) : '';
                if (prev && !/[\s(\[,;:]/.test(prev)) continue;                 // a@b.com không phải nhắc tên
                var tok = m[1], u = null;
                if (/^(all|tatca|tấtcả)$/i.test(tok)) u = 'all';
                else u = resolve(tok) || (/[.\-_]+$/.test(tok) ? resolve(tok.replace(/[.\-_]+$/, '')) : null);
                if (!u) continue;
                var len = u === 'all' ? tok.length : (resolve(tok) ? tok.length : tok.replace(/[.\-_]+$/, '').length);
                cb(m.index, len + 1, u);
                re.lastIndex = m.index + len + 1;
            }
        }
        function renderText(raw, o) {
            raw = String(raw == null ? '' : raw); o = o || {};
            var resolve = o.resolve || function () { return null; }, out = '', last = 0;
            scan(raw, resolve, function (i, len, u) {
                out += esc(raw.slice(last, i));
                var mine = u === 'all' || (o.me && u === o.me);
                out += '<span class="qd-mention' + (mine ? ' me' : '') + '" data-u="' + esc(u) + '" role="button" tabindex="0">@' + esc(u === 'all' ? 'All' : u) + '</span>';
                last = i + len;
            });
            out += esc(raw.slice(last));
            return out.replace(/\n/g, '<br>');
        }
        function mentionsIn(raw, resolve) { var s = {}; scan(String(raw || ''), resolve, function (i, len, u) { s[u] = 1; }); return Object.keys(s); }

        /* ---------- Gửi: giành quyền (giao dịch) -> thu số liệu -> ghi tin Kênh Chung + lịch sử cùng lúc ---------- */
        async function send(slot, opt) {
            var D = db(); if (!D) throw new Error('Chưa kết nối được máy chủ.');
            opt = opt || {}; var cfg = opt.cfg || CFG || norm(null), who = String(opt.by || '?');
            var ref = D.collection('bot_reports').doc(slot.runId);
            var got = await D.runTransaction(function (tx) {
                return tx.get(ref).then(function (s) {
                    var x = s.exists ? s.data() : null, t = Date.now();
                    if (x) {
                        if (x.status === 'sent' || x.status === 'skipped') return 'done';
                        if ((x.tries || 0) >= 3) return 'done';
                        if (x.status === 'sending' && t - (+x.at || 0) < 180000) return 'busy';
                    }
                    tx.set(ref, { runId: slot.runId, slot: slot.time, dateKey: slot.key, due: slot.ts, status: 'sending', by: who, byRole: opt.role || '', at: t, tries: ((x && x.tries) || 0) + 1, manual: !!opt.manual }, { merge: true });
                    return 'ok';
                });
            });
            if (got !== 'ok') return { ok: false, reason: got };
            try {
                var data = await collect(cfg, Date.now()), comp = compose(cfg, data);
                if (cfg.skipEmpty && !opt.manual && !data.loggedIn.length) {
                    await ref.set({ status: 'skipped', note: 'Hôm nay chưa ai đăng nhập', doneAt: Date.now(), counts: comp.counts }, { merge: true });
                    return { ok: false, reason: 'done', skipped: true };
                }
                var mref = D.collection('private_chat').doc(), t = Date.now();
                var msg = { conversationId: 'general_room', from: BOT, to: 'all', text: comp.text, imageUrl: null, time: t, read: false, heart: false, hearts: [], readBy: [],
                    bot: true, botName: cfg.botName, mentions: comp.mentions, reportId: slot.runId };
                var b = D.batch();
                b.set(mref, msg);
                b.set(ref, { status: 'sent', msgId: mref.id, sentAt: t, counts: comp.counts, text: comp.text.slice(0, 6000) }, { merge: true });
                await b.commit();
                emit({ type: 'sent', runId: slot.runId });
                return { ok: true, msgId: mref.id, comp: comp };
            } catch (e) {
                ref.set({ status: 'error', err: String((e && (e.message || e.code)) || e).slice(0, 200), errAt: Date.now() }, { merge: true }).catch(function () {});
                emit({ type: 'error', runId: slot.runId });
                throw e;
            }
        }
        function sendNow(by, role, cfg) {
            var now = Date.now(), p = vnParts(now);
            return send({ runId: 'manual_' + dateKey(p) + '_' + now.toString(36), time: hm(now), key: dateKey(p), ts: now }, { by: by, role: role, manual: true, cfg: cfg });
        }

        /* ---------- Lưu cấu hình (đổi lịch -> chỉ gửi các mốc từ lúc lưu, không gửi bù mốc cũ) ---------- */
        async function save(patch, by, action) {
            var D = db(); if (!D) throw new Error('Chưa kết nối được máy chủ.');
            var t = Date.now(), cur = CFG || norm(null), p = {};
            Object.keys(patch || {}).forEach(function (k) { p[k] = patch[k]; });
            if (p.isEnabled === true && !cur.isEnabled) p.enabledAt = t;
            var sched = ['times', 'days', 'from', 'to'].some(function (k) { return k in p && JSON.stringify(p[k]) !== JSON.stringify(cur[k]); });
            if (sched) p.schedAt = t;
            p.memberRun = false;   // máy thành viên (kể cả bản web cũ còn mở) không gửi nữa
            p.updatedAt = t; p.updatedBy = by || '';
            await D.collection('settings').doc(CFG_DOC).set(p, { merge: true });
            D.collection('admin_logs').add({ type: 'report_bot', action: action || 'save', user: '(bot báo cáo)', by: by || '', timestamp: t,
                detail: 'isEnabled' in p ? (p.isEnabled ? 'Bật' : 'Tắt') : JSON.stringify({ times: p.times, days: p.days, from: p.from, to: p.to }).slice(0, 300) }).catch(function () {});
        }

        /* ---------- Trực gửi theo lịch ---------- */
        var CFG = null, RAW = null, ROLE = '', ME = null, DELAY = 0, unsub = null, timer = null, tried = {}, subs = [];
        function emit(ev) { subs.forEach(function (f) { try { f(ev || { type: 'cfg' }, CFG); } catch (e) {} }); }
        function on(fn) { subs.push(fn); if (CFG) { try { fn({ type: 'cfg' }, CFG); } catch (e) {} } return function () { subs = subs.filter(function (x) { return x !== fn; }); }; }
        function listen() {
            var D = db(); if (!D || unsub) return !!unsub;
            unsub = D.collection('settings').doc(CFG_DOC).onSnapshot(function (s) {
                RAW = s.exists ? s.data() : null; CFG = norm(RAW); emit({ type: 'cfg', fromCache: s.metadata.fromCache }); tick();
            }, function () { unsub = null; });
            return true;
        }
        function tick() {
            if (!CFG || !CFG.isEnabled || !ROLE) return;
            if (ROLE !== 'admin' && ROLE !== 'bot') return;   // chỉ trang Admin / Bot gửi dự phòng, máy thành viên không gửi
            var me = ME ? ME() : ''; if (!me) return;
            var now = Date.now();
            dueSlots(CFG, now, DELAY).forEach(function (s) {
                var t = tried[s.runId]; if (t === true || (t && now - t < 60000)) return;
                tried[s.runId] = now;
                send(s, { by: me, role: ROLE, cfg: CFG }).then(function (r) { if (r.ok || r.reason === 'done') tried[s.runId] = true; })
                    .catch(function (e) { console.warn('[Bot báo cáo] Gửi chưa được, sẽ thử lại:', e && e.message); });
            });
        }
        function start(o) {
            o = o || {}; ROLE = o.role || 'member'; ME = o.me || null;
            DELAY = ROLE === 'member' ? 30000 + Math.floor(Math.random() * 60000) : ROLE === 'admin' ? 1500 + Math.floor(Math.random() * 4000) : 0;
            if (!listen()) { var n = 0, w = setInterval(function () { if (listen() || ++n > 60) clearInterval(w); }, 500); }
            if (!timer) timer = setInterval(tick, 15000);
            setTimeout(tick, 2500);
        }
        // Trang nào cũng nghe cấu hình để hiển thị (không gửi khi chưa start)
        function watch() { if (!listen()) { var n = 0, w = setInterval(function () { if (listen() || ++n > 60) clearInterval(w); }, 500); } }

        W.QDReportBot = {
            BOT: BOT, DEF: DEF, WD: WD, norm: norm, vnParts: vnParts, dateKey: dateKey, dateShow: dateShow, dayStart: dayStart, hm: hm, pad: pad, esc: esc,
            slotsFor: slotsFor, nextRun: nextRun, dueSlots: dueSlots, collect: collect, compose: compose, fill: fill,
            renderText: renderText, mentionsIn: mentionsIn, send: send, sendNow: sendNow, save: save,
            start: start, watch: watch, on: on, cfg: function () { return CFG; }, raw: function () { return RAW; }, role: function () { return ROLE; }
        };
    })();
    
