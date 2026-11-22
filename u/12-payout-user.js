    /* ===== TÀI KHOẢN NHẬN THƯỞNG (user) =====
       bank_info/{tên đăng nhập}  : { user, bin, bank, accNo, accName, updatedAt, history: [{ at, bin, accNo }], allowEdit }  -> chỉ Admin dùng để chuyển thưởng
                                    Khai 1 lần là KHÓA; muốn đổi phải được Admin bấm "Cho sửa lại" (allowEdit = true), sửa xong tự khóa lại.
       payouts/{bộ sưu tập}_{mã}  : Admin ghi khi đã chuyển / từ chối 1 giải tiền mặt { user, amount, status: 'paid'|'rejected', paidAt, note ... }
       settings/payout_config     : { isEnabled (mặc định BẬT) }
       Túi đồ: nút "Tài khoản nhận thưởng" + mỗi giải tiền hiện "Đã chuyển khoản / Chờ chuyển / Không hợp lệ". */
    (function () {
        'use strict';
        var $ = function (id) { return document.getElementById(id); };
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var fmtMoney = function (n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; };
        var p2 = function (x) { return String(x).padStart(2, '0'); };
        var fold = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D'); };
        var COL = { lixi: 'tranhthuong_history', wheel: 'spin_history', lucky: 'lucky_rewards', tour: 'tournament_prize' };
        /* Danh sách ngân hàng (mã BIN theo NAPAS / VietQR). Có mạng: cập nhật thêm từ api.vietqr.io */
        var BANKS = [
            ['970436', 'Vietcombank'], ['970415', 'VietinBank'], ['970418', 'BIDV'], ['970405', 'Agribank'], ['970422', 'MB Bank'], ['970407', 'Techcombank'],
            ['970416', 'ACB'], ['970432', 'VPBank'], ['970423', 'TPBank'], ['970403', 'Sacombank'], ['970437', 'HDBank'], ['970441', 'VIB'], ['970443', 'SHB'],
            ['970431', 'Eximbank'], ['970426', 'MSB'], ['970448', 'OCB'], ['970440', 'SeABank'], ['970449', 'LPBank'], ['970428', 'Nam A Bank'], ['970409', 'Bac A Bank'],
            ['970425', 'ABBANK'], ['970427', 'VietABank'], ['970412', 'PVcomBank'], ['970452', 'Kienlongbank'], ['970454', 'BVBank (Viet Capital)'], ['970438', 'BaoViet Bank'],
            ['970400', 'Saigonbank'], ['970419', 'NCB'], ['970414', 'OceanBank'], ['970430', 'PG Bank'], ['970408', 'GPBank'], ['970406', 'DongA Bank'], ['970429', 'SCB'],
            ['970421', 'VRB'], ['970442', 'Hong Leong'], ['970424', 'Shinhan Bank'], ['970457', 'Woori Bank'], ['546034', 'Cake by VPBank'], ['963388', 'Timo']
        ];
        function loadBanks() {
            try {
                if (!window.fetch) return;
                fetch('https://api.vietqr.io/v2/banks', { cache: 'force-cache' }).then(function (r) { return r.json(); }).then(function (j) {
                    var have = {}; BANKS.forEach(function (b) { have[b[0]] = 1; });
                    (j && j.data || []).forEach(function (b) {
                        if (!b || !b.bin) return;
                        var ph = BANKS.filter(function (x) { return x[0] === String(b.bin) && x[2]; })[0];   // tên tạm (đọc từ mã QR) -> thay bằng tên thật
                        if (ph) { ph[1] = String(b.shortName || b.name); ph[2] = 0; return; }
                        if (!have[b.bin] && b.transferSupported !== 0) { BANKS.push([String(b.bin), String(b.shortName || b.name)]); have[b.bin] = 1; }
                    });
                    fillBanks();
                }).catch(function () {});
            } catch (e) {}
        }
        function bankName(bin) { for (var i = 0; i < BANKS.length; i++) if (BANKS[i][0] === bin) return BANKS[i][1]; return bin || ''; }

        var TOUCH = (function () { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return 'ontouchstart' in window; } })();
        var PU = window.PayoutUser = { me: null, bank: null, pays: {}, cfg: { on: true }, unsubs: [], firstPays: true };
        function stop() { PU.unsubs.forEach(function (u) { try { u(); } catch (e) {} }); PU.unsubs = []; PU.bank = null; PU.pays = {}; PU.firstPays = true; }
        function watch() {
            var me = window.State && window.State.currentUser;
            if (me === PU.me) return; stop(); PU.me = me || null;
            if (!me || typeof db === 'undefined') { render(); return; }
            PU.unsubs.push(db.collection('bank_info').doc(me).onSnapshot(function (d) { PU.bank = d.exists ? d.data() : null; render(); }, function () {}));
            PU.unsubs.push(db.collection('payouts').where('user', '==', me).onSnapshot(function (snap) {
                var first = PU.firstPays; PU.firstPays = false;
                snap.docs.forEach(function (d) { PU.pays[d.id] = d.data(); });
                if (!first) snap.docChanges().forEach(function (c) {
                    var p = c.doc.data(); if (c.type !== 'removed' && p.status === 'paid' && (c.type === 'added' || c.type === 'modified')) {
                        try { window.Utils.toast('💵 Ban Quản Trị đã chuyển ' + fmtMoney(p.amount) + ' tiền thưởng cho bạn!', 'success'); } catch (e) {}
                    }
                    if (c.type === 'removed') delete PU.pays[c.doc.id];
                });
                render(); if (window.Inventory) window.Inventory.renderList();
            }, function () {}));
        }
        if (typeof db !== 'undefined') db.collection('settings').doc('payout_config').onSnapshot(function (d) { var c = d.exists ? d.data() : {}; PU.cfg = { on: c.isEnabled !== false }; render(); }, function () {});
        setInterval(watch, 1500);

        /* ---------- Trạng thái từng giải tiền (dùng trong Túi đồ) ---------- */
        PU.status = function (r) {
            if (!r || !(r.money > 0) || !COL[r.src] || !r.id) return null;
            return PU.pays[COL[r.src] + '_' + r.id] || null;
        };
        PU.badge = function (r) {
            if (!PU.cfg.on || !(r && r.money > 0)) return '';
            var p = PU.status(r);
            if (p && p.status === 'paid') { var t = new Date(p.paidAt || 0); return '<span class="inv2-pay ok">✅ Đã chuyển khoản ' + p2(t.getDate()) + '/' + p2(t.getMonth() + 1) + '</span>'; }
            if (p && p.status === 'rejected') return '<span class="inv2-pay no">✖ Không được trả' + (p.note ? ': ' + esc(p.note) : '') + '</span>';
            return '<span class="inv2-pay wait">⏳ Chờ BQT chuyển khoản' + (PU.bank ? '' : ' · cần khai tài khoản nhận') + '</span>';
        };
        function totals() {
            var t = { won: 0, paid: 0, wait: 0 };
            if (!window.Inventory || !window.Inventory.all) return t;
            window.Inventory.all().forEach(function (r) {
                if (!(r.money > 0)) return; var p = PU.status(r);
                if (p && p.status === 'rejected') return;
                t.won += r.money; if (p && p.status === 'paid') t.paid += r.money; else t.wait += r.money;
            });
            return t;
        }
        function mask(acc) { acc = String(acc || ''); return acc.length > 4 ? '••' + acc.slice(-4) : acc; }
        function canEdit() { var b = PU.bank; return !b || !b.accNo || b.allowEdit === true; }
        PU.canEdit = canEdit;
        function renderProfile(t) {   // hộp Hồ sơ: số dư + thông tin + tài khoản nhận thưởng
            var S = window.State || {}, set = function (id, v) { var el = $(id); if (el) el.textContent = v; };
            set('pf2-user', S.currentUser || '—'); set('pf2-full', S.fullName || '');
            set('pf2-pts', Number(S.availablePoints || 0).toLocaleString('vi-VN')); set('pf2-tk', Number(S.availableTickets || 0).toLocaleString('vi-VN'));
            set('pf2-sp', Number(((window.Inventory && window.Inventory.spinTickets) || 0) + (Number(S.availableSpins) || 0)).toLocaleString('vi-VN'));
            var sec = $('pf2-bank-sec'), box = $('pf2-bank'); if (!sec || !box) return;
            sec.hidden = !PU.cfg.on || !PU.me;
            var b = PU.bank, st = !b ? '<span class="pf2-bk-st need">Chưa khai</span>' : canEdit() ? '<span class="pf2-bk-st open">BQT đã cho sửa lại</span>' : '<span class="pf2-bk-st lock">🔒 Đã khóa · muốn đổi nhắn BQT</span>';
            box.innerHTML = '<div class="pf2-bk"><div class="pf2-bk-ico">🏦</div><div class="pf2-bk-t">'
                + (b ? '<b>' + esc(bankName(b.bin)) + ' · ' + esc(mask(b.accNo)) + '</b><small>' + esc(b.accName || '') + '</small>' : '<b>Chưa có tài khoản nhận thưởng</b><small>Khai 1 lần để Ban Quản Trị chuyển giải tiền mặt</small>')
                + st + '</div>' + (canEdit() ? '<button type="button" class="pf2-bk-btn" onclick="window.PayoutUser.openForm()">' + (b ? 'Sửa' : 'Khai ngay') + '</button>' : '<button type="button" class="pf2-bk-btn" onclick="window.PayoutUser.openForm()">Xem</button>') + '</div>'
                + (t.won ? '<div class="pf2-bk-sum"><div><b>' + fmtMoney(t.paid) + '</b>Đã chuyển khoản</div><div><b>' + fmtMoney(t.wait) + '</b>Chờ chuyển</div></div>' : '');
        }
        function render() {
            var btn = $('inv2-bank'); if (!btn) return;
            btn.hidden = !PU.cfg.on || !PU.me;
            var t = totals(), b = PU.bank;
            btn.classList.toggle('need', !b && t.wait > 0);
            $('inv2-bank-t').textContent = b ? bankName(b.bin) + ' · ' + mask(b.accNo) + ' · ' + (b.accName || '') : 'Khai tài khoản nhận thưởng';
            $('inv2-bank-sub').textContent = (t.won ? 'Đã nhận ' + fmtMoney(t.paid) + ' · Chờ chuyển ' + fmtMoney(t.wait) + ' · ' : '') + (!b ? 'Để Ban Quản Trị chuyển giải tiền mặt cho bạn' : canEdit() ? 'BQT đã cho sửa lại — bấm để sửa' : '🔒 Đã khóa · muốn đổi nhắn BQT');
            renderProfile(t);
            var s = $('bk2-sum');
            if (s) s.innerHTML = t.won ? '<div><b>' + fmtMoney(t.paid) + '</b><small>Đã chuyển khoản</small></div><div><b>' + fmtMoney(t.wait) + '</b><small>Chờ chuyển</small></div>' : '';
        }
        PU.render = render;

        /* ---------- Hộp khai / đổi tài khoản ---------- */
        function fillBanks(sel) {
            var box = $('bk2-bank'); if (!box) return;
            var q = fold(($('bk2-bank-q') || {}).value || '').toLowerCase().replace(/\s+/g, ''), cur = sel || box.value;
            var key = function (b) { return fold(b[1]).toLowerCase().replace(/\s+/g, ''); };
            var list = BANKS.filter(function (b) { return !q || key(b).indexOf(q) >= 0 || b[0].indexOf(q) === 0; });
            if (q) list.sort(function (x, y) { return (key(x).indexOf(q) === 0 ? 0 : 1) - (key(y).indexOf(q) === 0 ? 0 : 1); });   // tên bắt đầu bằng chữ đã gõ lên đầu
            box.innerHTML = list.map(function (b) { return '<option value="' + b[0] + '"' + (b[0] === cur ? ' selected' : '') + '>' + esc(b[1]) + '</option>'; }).join('');
            if (cur && !list.some(function (b) { return b[0] === cur; }) && !q) box.value = '';
        }
        function msg(t, cls) { var m = $('bk2-msg'); if (m) { m.textContent = t || ''; m.className = 'bk2-msg ' + (cls || ''); } }
        PU.openForm = function () {
            var b = PU.bank || {};
            $('bk2-bank-q').value = ''; fillBanks(b.bin || ''); if (b.bin) $('bk2-bank').value = b.bin;
            $('bk2-acc').value = b.accNo || ''; $('bk2-name').value = b.accName || ''; $('bk2-pwd').value = ''; msg(''); PU._qrName = '';
            var ed = canEdit();
            ['bk2-bank-q', 'bk2-bank', 'bk2-acc', 'bk2-name', 'bk2-pwd'].forEach(function (id) { var el = $(id); if (el) el.disabled = !ed; });
            var bq = $('bk2-bank-q'); if (bq) { bq.parentNode.classList.toggle('bk2-ro', !ed); if (!ed && b.bin) bq.value = bankName(b.bin); }
            $('bk2-save').hidden = !ed; $('bk2-pwd').closest('label').hidden = !ed;
            var qr = $('bk2-qr'); if (qr) qr.hidden = !ed;
            var lk = $('bk2-lock'); if (lk) { lk.hidden = ed; }
            var nt = $('bk2-note'); if (nt) nt.innerHTML = PU.bank && PU.bank.accNo && ed
                ? '✏️ Ban Quản Trị đã cho phép sửa <b>1 lần</b>. Lưu xong tài khoản sẽ tự khóa lại.'
                : '🔒 Chỉ khai <b>1 lần</b>: lưu xong sẽ khóa lại, muốn đổi phải nhắn Ban Quản Trị cho sửa. Nhập sai số tài khoản / tên, tiền có thể chuyển nhầm và không lấy lại được — hãy kiểm tra kỹ.';
            render(); window.UI.openModal('modal-bank');
            if (ed && !TOUCH) setTimeout(function () { var f = b.bin ? $('bk2-acc') : $('bk2-bank-q'); if (f) f.focus(); }, 250);   // điện thoại: không tự bật bàn phím (màn hình bị giật)
        };
        document.addEventListener('input', function (e) {
            if (e.target.id === 'bk2-bank-q') { fillBanks(); var box = $('bk2-bank'); if (box && box.options.length && e.target.value.trim() && box.selectedIndex < 0) box.selectedIndex = 0; }   // tự chọn ngân hàng khớp nhất
            if (e.target.id === 'bk2-acc') e.target.value = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '');   // ví MoMo / ZaloPay có chữ: 99MM..., 99ZP...
            if (e.target.id === 'bk2-name') { var p = e.target.selectionStart; e.target.value = fold(e.target.value).toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s{2,}/g, ' '); try { e.target.setSelectionRange(p, p); } catch (er) {} }
        });
        PU.save = function () {
            var me = window.State && window.State.currentUser, docId = window.State && window.State.currentDocId;
            if (!me || !docId) { msg('Vui lòng đăng nhập lại.', 'err'); return; }
            if (!canEdit()) { msg('Tài khoản nhận thưởng đã khóa. Nhắn Ban Quản Trị bấm "Cho sửa lại" để đổi.', 'err'); return; }
            var bin = $('bk2-bank').value, acc = $('bk2-acc').value.trim().toUpperCase(), name = $('bk2-name').value.trim().replace(/\s+/g, ' '), pwd = $('bk2-pwd').value;
            if (!bin) return msg('Chọn ngân hàng.', 'err');
            if (!/^[0-9A-Z]{6,19}$/.test(acc)) return msg('Số tài khoản gồm 6–19 ký tự (chữ số, ví điện tử có thể có chữ in hoa).', 'err');
            if (!/^[A-Z]+( [A-Z]+)+$/.test(name)) return msg('Nhập đủ họ tên chủ tài khoản, viết không dấu (VD: NGUYEN VAN A).', 'err');
            if (!pwd) return msg('Nhập mật khẩu đăng nhập để xác nhận.', 'err');
            var btn = $('bk2-save'); btn.disabled = true; msg('Đang kiểm tra...');
            db.collection('accounts').where('user', '==', me).where('pass', '==', pwd).limit(1).get().then(function (q) {
                if (q.empty) { throw { code: 'PWD' }; }
                var old = PU.bank || {}, now = Date.now(), hist = Array.isArray(old.history) ? old.history.slice(-9) : [];
                var changed = old.accNo && (old.accNo !== acc || old.bin !== bin);
                if (!old.accNo || changed) hist.push({ at: now, bin: bin, accNo: acc });
                return db.collection('bank_info').doc(me).set({ user: me, docId: docId, bin: bin, bank: bankName(bin), accNo: acc, accName: name, updatedAt: now, changedAt: (!old.accNo || changed) ? now : (old.changedAt || old.updatedAt || now), history: hist,
                    allowEdit: false, editCount: (+old.editCount || 0) + (old.accNo ? 1 : 0), firstAt: old.firstAt || old.updatedAt || now }, { merge: true });   // lưu xong -> khóa lại
            }).then(function () {
                msg('✓ Đã lưu. Tài khoản nhận thưởng đã được khóa.', 'ok'); $('bk2-pwd').value = '';
                try { window.Utils.toast('Đã lưu tài khoản nhận thưởng!', 'success'); } catch (e) {}
                setTimeout(function () { window.UI.closeModal('modal-bank'); }, 900);
            }).catch(function (e) {
                msg(e && e.code === 'PWD' ? 'Mật khẩu không đúng.' : 'Không lưu được, thử lại sau.', 'err');
            }).finally(function () { btn.disabled = false; });
        };

        /* ---------- Đọc mã QR nhận tiền (VietQR / NAPAS 247) -> tự điền ngân hàng + số tài khoản ----------
           Mã VietQR theo chuẩn EMVCo: [mã 2 số][độ dài 2 số][giá trị]...; khối 38 (hoặc 26–51) có GUID A000000727,
           trong đó 01 -> { 00: mã BIN ngân hàng, 01: số tài khoản / số thẻ }; 59: tên (nếu có); 63: CRC16-CCITT.
           Ví MoMo / ZaloPay: tài khoản định danh tại ngân hàng (VD BVBank 970454, số 99MM... / 99ZP...) -> chuyển khoản như ngân hàng. */
        function crc16(str) {
            var c = 0xFFFF;
            for (var i = 0; i < str.length; i++) { c ^= (str.charCodeAt(i) & 0xFF) << 8; for (var j = 0; j < 8; j++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; }
            return ('000' + c.toString(16).toUpperCase()).slice(-4);
        }
        function tlv(str) {
            var o = {}, i = 0; str = String(str || '');
            while (i < str.length) {
                if (i + 4 > str.length) return null;
                var id = str.substr(i, 2), n = parseInt(str.substr(i + 2, 2), 10);
                if (!/^\d\d$/.test(id) || isNaN(n) || i + 4 + n > str.length) return null;
                o[id] = str.substr(i + 4, n); i += 4 + n;
            }
            return o;
        }
        function parseQR(raw) {
            raw = String(raw || '').replace(/^\s+|\s+$/g, '');
            if (/^2\|99\|/.test(raw)) return { err: 'momo-cu' };   // mã MoMo cũ (chuyển ví - ví), không có tài khoản ngân hàng
            var t = tlv(raw); if (!t || t['00'] !== '01') return { err: 'khong-phai' };
            var k = raw.lastIndexOf('6304'), crcOk = !t['63'] || (k >= 0 && crc16(raw.slice(0, k + 4)) === String(t['63']).toUpperCase());
            for (var id = 26; id <= 51; id++) {
                var m = tlv(t[String(id)] || ''); if (!m || !/^A000000727$/i.test(m['00'] || '')) continue;
                var b = tlv(m['01'] || ''); if (!b || !/^\d{6}$/.test(b['00'] || '') || !b['01']) continue;
                return { bin: b['00'], acc: String(b['01']).toUpperCase().replace(/[^0-9A-Z]/g, ''), name: t['59'] || '', card: m['02'] === 'QRIBFTTC', crcOk: crcOk };
            }
            return { err: t['26'] || t['27'] ? 'cua-hang' : 'khong-phai' };
        }
        PU.parseQR = parseQR;
        var jsQRp = null;
        function loadJsQR() {
            if (window.jsQR) return Promise.resolve(window.jsQR);
            if (jsQRp) return jsQRp;
            var urls = ['https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js', 'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js'];
            jsQRp = new Promise(function (res, rej) {
                (function next(i) {
                    if (i >= urls.length) { jsQRp = null; return rej(new Error('jsqr')); }
                    var sc = document.createElement('script'); sc.src = urls[i]; sc.async = true;
                    sc.onload = function () { window.jsQR ? res(window.jsQR) : next(i + 1); };
                    sc.onerror = function () { sc.remove(); next(i + 1); };
                    document.head.appendChild(sc);
                })(0);
            });
            return jsQRp;
        }
        function readImage(file) {
            return new Promise(function (res, rej) {
                var u = URL.createObjectURL(file), im = new Image();
                im.onload = function () { res(im); setTimeout(function () { URL.revokeObjectURL(u); }, 2000); };
                im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('img')); };
                im.src = u;
            });
        }
        // Thử: BarcodeDetector có sẵn trong trình duyệt (Android) -> jsQR ở nhiều cỡ ảnh (ảnh chụp màn hình to / mã nhỏ)
        function decodeQR(im) {
            var W0 = im.naturalWidth || im.width, H0 = im.naturalHeight || im.height;
            var viaDetector = Promise.resolve([]);
            try {
                if ('BarcodeDetector' in window) viaDetector = new window.BarcodeDetector({ formats: ['qr_code'] }).detect(im)
                    .then(function (r) { return (r || []).map(function (x) { return x.rawValue; }); }, function () { return []; });
            } catch (e) {}
            return viaDetector.then(function (found) {
                if (found.length) return found;
                return loadJsQR().then(function (jsQR) {
                    var out = [], cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
                    var tries = [[1, 1000], [1, 1600], [1, 700], [0.6, 1000]];   // [phần giữa ảnh, cạnh dài tối đa]
                    for (var i = 0; i < tries.length && !out.length; i++) {
                        var f = tries[i][0], sw = W0 * f, sh = H0 * f, sx = (W0 - sw) / 2, sy = (H0 - sh) / 2;
                        var k = Math.min(1, tries[i][1] / Math.max(sw, sh)), w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
                        cv.width = w; cv.height = h; cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(im, sx, sy, sw, sh, 0, 0, w, h);
                        var r = jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
                        if (r && r.data) out.push(r.data);
                    }
                    return out;
                });
            });
        }
        function flash(id) { var el = $(id); if (!el) return; el.classList.remove('bk2-filled'); void el.offsetWidth; el.classList.add('bk2-filled'); }
        function applyQR(r) {
            if (!BANKS.some(function (b) { return b[0] === r.bin; })) BANKS.push([r.bin, 'Ngân hàng mã ' + r.bin, 1]);
            $('bk2-bank-q').value = ''; fillBanks(r.bin); $('bk2-bank').value = r.bin;
            var sel = $('bk2-bank').selectedOptions && $('bk2-bank').selectedOptions[0]; if (sel) try { sel.scrollIntoView({ block: 'nearest' }); } catch (e) {}
            $('bk2-acc').value = r.acc; flash('bk2-bank'); flash('bk2-acc');
            var nm = fold(r.name).toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim(), nEl = $('bk2-name');
            if (nm && / /.test(nm)) { nEl.value = nm; flash('bk2-name'); PU._qrName = nm; }
            else { if (PU._qrName && nEl.value === PU._qrName) nEl.value = ''; PU._qrName = ''; nm = nEl.value.trim(); }   // tên do mã QR trước điền -> xóa, tên tự gõ -> giữ
            var wallet = /^99MM/.test(r.acc) ? ' (ví MoMo)' : /^99ZP/.test(r.acc) ? ' (ví ZaloPay)' : '';
            msg('✓ Đã đọc mã QR: ' + bankName(r.bin) + wallet + ' · ' + (r.card ? 'số thẻ ' : 'STK ') + r.acc + '. '
                + (nm ? 'Kiểm tra lại tên chủ tài khoản rồi nhập mật khẩu để lưu.' : 'Nhập tên chủ tài khoản (không dấu) và mật khẩu để lưu.')
                + (r.crcOk ? '' : ' ⚠️ Mã QR có thể bị mờ / lỗi, hãy đối chiếu kỹ số tài khoản.'), r.crcOk ? 'ok' : 'err');
            if (!TOUCH) setTimeout(function () { var f = nm ? $('bk2-pwd') : $('bk2-name'); if (f) f.focus(); }, 120);
        }
        PU.applyQR = applyQR;

        /* ---------- Đọc tên chủ tài khoản in trên ảnh (mã VietQR thường KHÔNG chứa tên) ----------
           Tesseract.js (tiếng Việt) chạy ngay trên máy, chỉ tải khi cần; chọn dòng giống họ tên nhất (họ Việt phổ biến, cạnh số tài khoản, sau "Tên / Chủ tài khoản") */
        var SURN = {}; ('NGUYEN TRAN LE PHAM HOANG HUYNH PHAN VU VO DANG BUI DO HO NGO DUONG LY TRUONG DINH LAM MAI TRINH CAO LUONG TA TO HA THAI QUACH LUU KIEU DOAN TONG LA MA CHAU TANG VUONG TIEU KHUC VIEN THAN LUC DIEP KHUAT HUA PHUNG NONG LO VI TRIEU MAC KHONG BACH CU CHU DAM DAU GIANG HAN HAU HUA KIM LAI LIEU NGHIEM NINH ONG PHI QUAN SON TAN THACH THAN TIET TRAC TU UNG VAN VUONG XA YEN').split(' ').forEach(function (x) { SURN[x] = 1; });
        var NOTNAME = /NGAN HANG|BANK|MOMO|ZALO|VIETQR|VIET QR|NAPAS|\bQR\b|TAI KHOAN|CHUYEN|NHAN TIEN|QUET|\bSTK\b|THANH TOAN|\bVI\b|LUU ANH|CHIA SE|TAI VE|SAO CHEP|SO TIEN|NOI DUNG|DIEN THOAI|HOTLINE|\bPAY\b|DIGITAL|MOBILE|\bAPP\b|\bMA\b QR|VIET NAM|TMCP|THUONG MAI|CO PHAN|QUAN DOI|NGOAI THUONG|CONG THUONG|DAU TU|PHAT TRIEN|\bDONG\b|\bVND\b|SMART|WALLET|SCAN|SHARE|SAVE|DOWNLOAD|ACCOUNT NUMBER/;
        function nameFromText(text, acc) {
            var lines = String(text || '').split(/\r?\n/), best = null, accLine = -1, digits = String(acc || '').replace(/\D/g, '');
            lines.forEach(function (l, i) { var d = l.replace(/[^0-9A-Z]/gi, '').toUpperCase(); if (acc && (d.indexOf(String(acc).toUpperCase()) >= 0 || (digits.length >= 6 && d.indexOf(digits.slice(-6)) >= 0))) accLine = i; });
            lines.forEach(function (raw, i) {
                var lab = /(t[eê]n|ch[uủ]\s*t[aà]i\s*kho[aả]n|ch[uủ]\s*tk|account\s*name|ng[uư][oờ]i\s*nh[aậ]n)\s*[:：]/i.test(raw);
                var l = raw.indexOf(':') >= 0 ? raw.slice(raw.lastIndexOf(':') + 1) : raw;
                var f = fold(l).toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
                if (lab && !f && lines[i + 1]) return;
                var w = f.split(' ');
                if (w.length < 2 || w.length > 6 || f.length < 5 || f.length > 40 || NOTNAME.test(f)) return;
                if (w.some(function (x) { return x.length > 7 || !/[AEIOUY]/.test(x); })) return;   // mỗi tiếng Việt có nguyên âm, dài tối đa 7 chữ
                var sc = (SURN[w[0]] ? 3 : 0) + (lab ? 3 : 0) + (accLine >= 0 && Math.abs(i - accLine) <= 2 ? 2 : 0) + (l.replace(/[^A-Za-zÀ-ỹ]/g, '') === l.replace(/[^A-Za-zÀ-ỹ]/g, '').toUpperCase() ? 1 : 0) + (w.length >= 3 ? 1 : 0);
                if (sc >= 3 && (!best || sc > best.sc)) best = { name: f, sc: sc };
            });
            return best ? best.name : '';
        }
        PU.nameFromText = nameFromText;
        var tessP = null;
        function loadTess() {
            if (window.Tesseract) return Promise.resolve(window.Tesseract);
            if (tessP) return tessP;
            tessP = new Promise(function (res, rej) {
                var sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; sc.async = true;
                sc.onload = function () { window.Tesseract ? res(window.Tesseract) : rej(new Error('ocr')); };
                sc.onerror = function () { tessP = null; sc.remove(); rej(new Error('ocr')); };
                document.head.appendChild(sc);
            });
            return tessP;
        }
        function ocrName(im, acc) {
            var W0 = im.naturalWidth || im.width, H0 = im.naturalHeight || im.height, k = Math.min(1400, Math.max(1000, Math.max(W0, H0))) / Math.max(W0, H0);   // ảnh nhỏ phóng lên ~1000px cho chữ rõ
            var cv = document.createElement('canvas'); cv.width = Math.round(W0 * k); cv.height = Math.round(H0 * k);
            var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);
            var worker = null;
            var job = loadTess().then(function (T) { return T.createWorker('vie'); })
                .then(function (w) { worker = w; return w.recognize(cv); })
                .then(function (r) { return nameFromText(r && r.data && r.data.text, acc); });
            var to = new Promise(function (res) { setTimeout(function () { res(''); }, 30000); });   // mạng chậm: tối đa 30 giây
            return Promise.race([job, to]).then(function (n) { if (worker) try { worker.terminate(); } catch (e) {} return n; },
                function () { if (worker) try { worker.terminate(); } catch (e) {} return ''; });
        }
        PU.readQRFile = function (file) {
            if (!file || !canEdit()) return;
            var btn = $('bk2-qr-btn'); if (btn) { btn.disabled = true; btn.classList.add('busy'); }
            msg('Đang đọc mã QR...');
            var img = null;
            readImage(file).then(function (im) { img = im; return decodeQR(im); }).then(function (list) {
                if (!list.length) return msg('Không tìm thấy mã QR trong ảnh. Chọn ảnh rõ nét, thấy trọn mã QR (có thể cắt sát mã rồi thử lại).', 'err');
                var bad = null;
                for (var i = 0; i < list.length; i++) {
                    var r = parseQR(list[i]); if (r.err) { bad = bad || r.err; continue; }
                    applyQR(r);
                    if ($('bk2-name').value.trim()) return;   // mã đã có tên / người dùng đã gõ tên
                    var m0 = $('bk2-msg').textContent, cls = $('bk2-msg').className.indexOf('err') >= 0 ? 'err' : 'ok', nEl = $('bk2-name');
                    nEl.placeholder = 'Đang đọc tên trên ảnh...';
                    msg(m0.replace(/Nhập tên chủ tài khoản.*?lưu\./, '⏳ Đang đọc tên chủ tài khoản trên ảnh...'), cls);
                    return ocrName(img, r.acc).then(function (nm) {
                        nEl.placeholder = 'VD: NGUYEN VAN A';
                        if (nm && !nEl.value.trim() && $('bk2-acc').value === r.acc) {
                            nEl.value = nm; PU._qrName = nm; flash('bk2-name');
                            msg(m0.replace(/Nhập tên chủ tài khoản.*?lưu\./, 'Tên: ' + nm + ' (đọc từ ảnh — kiểm tra lại cho đúng). Nhập mật khẩu để lưu.'), cls);
                        } else if (!nEl.value.trim()) msg(m0.replace(/Nhập tên chủ tài khoản/, 'Không đọc được tên trên ảnh — nhập tên chủ tài khoản'), cls);
                        else msg(m0, cls);
                    });
                }
                msg(bad === 'momo-cu' ? 'Đây là mã MoMo chuyển ví–ví (mã cũ), không có tài khoản nhận từ ngân hàng. Trong MoMo chọn "Nhận tiền" → mã QR nhận tiền từ ngân hàng rồi lưu ảnh đó.'
                    : bad === 'cua-hang' ? 'Đây là mã QR thanh toán cửa hàng, không phải mã nhận tiền cá nhân. Hãy dùng mã "Nhận tiền" trong app ngân hàng / ví.'
                    : 'Mã QR này không phải mã nhận tiền chuyển khoản (VietQR). Hãy dùng mã "Nhận tiền" trong app ngân hàng / ví, hoặc nhập tay bên dưới.', 'err');
            }).catch(function (e) {
                msg(e && e.message === 'jsqr' ? 'Không tải được bộ đọc mã QR, kiểm tra kết nối mạng rồi thử lại.' : 'Không mở được ảnh, hãy chọn ảnh khác (JPG / PNG).', 'err');
            }).finally(function () { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } });
        };
        document.addEventListener('change', function (e) {
            if (e.target && e.target.id === 'bk2-qr-file') { var f = e.target.files && e.target.files[0]; e.target.value = ''; PU.readQRFile(f); }
        });
        /* Điện thoại: khóa chiều cao hộp + ẩn trang phía sau khi hộp Tài khoản nhận thưởng mở */
        (function () {
            if (!TOUCH) return;
            var ov = null, H = 0;
            function typing() { var a = document.activeElement; return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); }
            function setH(force) {
                var h = window.innerHeight;
                if (!force && (typing() || h <= H)) return;   // bàn phím đang hiện -> giữ nguyên; chỉ lớn lên khi xoay máy / bàn phím đóng
                H = h; ov.style.setProperty('--bk2-h', Math.max(360, h - 20) + 'px');
            }
            function sync() {
                var on = ov.classList.contains('active');
                if (on === document.body.classList.contains('bk2-open')) return;
                if (on) { H = 0; setH(true); }
                document.body.classList.toggle('bk2-open', on);
                if (!on) ov.scrollTop = 0;
            }
            function boot() {
                ov = $('modal-bank'); if (!ov || !window.MutationObserver) return;
                new MutationObserver(sync).observe(ov, { attributes: true, attributeFilter: ['class', 'style'] });
                window.addEventListener('resize', function () { if (document.body.classList.contains('bk2-open')) setH(false); }, { passive: true });
                window.addEventListener('orientationchange', function () { setTimeout(function () { if (document.body.classList.contains('bk2-open')) setH(true); }, 400); });
                // chạm vào ô -> cuộn ô đó lên giữa phần màn hình còn lại (sau khi bàn phím hiện xong)
                ov.addEventListener('focusin', function (e) {
                    var t = e.target; if (!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
                    setTimeout(function () { try { t.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (er) {} }, 320);
                });
                sync();
            }
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
        })();
        document.addEventListener('DOMContentLoaded', function () { fillBanks(); loadBanks(); });
        document.addEventListener('click', function (e) {   // mở Túi đồ -> vẽ lại số liệu
            var t = e.target && e.target.closest ? e.target.closest('[onclick*="modal-inventory"], [onclick*="modal-profile"]') : null;
            if (t) setTimeout(render, 50);
        }, true);
    })();
    
