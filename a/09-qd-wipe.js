    /* Xóa tất cả dữ liệu Firestore của hệ thống.
       - Chỉ hiện với tài khoản role "admin" (Quản trị viên); Quản lý (manager) không thấy.
       - 3 lần nhắc nhở: (1) chọn nhóm dữ liệu  (2) đếm số bản ghi + tải bản sao lưu  (3) gõ "XOA TAT CA" + chờ 5 giây.
       - Mặc định GIỮ tài khoản Ban Quản Trị (admin / quản lý) và GIỮ cấu hình hệ thống (settings) — có thể bỏ chọn.
       - Xóa theo lô 400 bản ghi; ghi 1 dòng admin_logs (type: wipe) sau khi xong. */
    (function () {
        'use strict';
        var $ = function (id) { return document.getElementById(id); };
        var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var fmt = function (n) { return Number(n || 0).toLocaleString('vi-VN'); };
        var S = function () { try { return State; } catch (e) { return window.State || {}; } };
        var toast = function (m, t) { try { Utils.toast(m, t || 'success'); } catch (e) {} };
        var GROUPS = [
            { id: 'accounts', icon: 'fa-users', name: 'Tài khoản thành viên & đơn đăng ký', cols: ['accounts', 'pending_users', 'users'] },
            { id: 'history', icon: 'fa-clock-rotate-left', name: 'Lịch sử điểm, quay, rút lì xì, giao dịch', cols: ['point_history', 'spin_history', 'tranhthuong_history', 'lixi_history', 'rps_history', 'con_history', 'invite_history', 'transfer_history', 'lucky_number_history', 'shop_orders', 'admin_logs'] },
            { id: 'daily', icon: 'fa-calendar-check', name: 'Điểm danh, số may mắn, BXH & dữ liệu hằng ngày', cols: ['attendance', 'lucky_numbers', 'con_stats', 'lixi_daily', 'point_shop_daily', 'rps_rooms'] },
            { id: 'stock', icon: 'fa-boxes-stacked', name: 'Kho giải đã phát (số giải đã trúng)', cols: ['wheel_stock', 'tranhthuong_stock', 'point_shop_stock'] },
            { id: 'chat', icon: 'fa-comments', name: 'Tin nhắn trò chuyện & lịch sử Bot báo cáo', cols: ['private_chat', 'bot_reports'] },
            { id: 'quiz', icon: 'fa-circle-question', name: 'Câu hỏi vòng quay & đáp án', cols: ['wheel_questions', 'wheel_question_keys'] },
            { id: 'event', icon: 'fa-trophy', name: 'Giải đấu (danh sách) & bản tin', cols: ['tournament', 'news'] },
            { id: 'ai', icon: 'fa-robot', name: 'Câu hỏi chưa trả lời của Quân Sư AI', cols: ['ai_unanswered'] },
            { id: 'settings', icon: 'fa-sliders', name: 'Cấu hình hệ thống (giải thưởng, giờ mở, sơ đồ giải đấu, bảo trì, Quân Sư...)', cols: ['settings'], def: false }
        ];
        var PHRASE = 'XOA TAT CA';
        var W = window.Wipe = { step: 0, sel: {}, keepAdmins: true, scan: null, busy: false };
        GROUPS.forEach(function (g) { W.sel[g.id] = g.def !== false; });

        function isAdmin() { var s = S(); var sh = $('app-shell'); return !!(s && s.currentUser && s.currentUserRole === 'admin' && sh && sh.style.display !== 'none'); }
        setInterval(function () { var a = isAdmin(); ['wipe-entry-settings', 'wipe-entry-dash'].forEach(function (id) { var e = $(id); if (e && e.hidden === a) e.hidden = !a; }); }, 1200);

        function norm(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toUpperCase().replace(/\s+/g, ' ').trim(); }
        function isAdminAcc(d) { return d && (d.role === 'admin' || d.role === 'manager' || d.user === 'admin' || d.user === S().currentUser); }
        function chosen() { return GROUPS.filter(function (g) { return W.sel[g.id]; }); }
        function dots(n) { [1, 2, 3].forEach(function (i) { $('wd' + i).classList.toggle('on', i <= n); }); $('wipe-step').textContent = n <= 3 ? 'Nhắc nhở ' + n + '/3' : 'Đang xóa'; }
        function btns(list) {
            $('wipe-btns').innerHTML = list.map(function (b, i) { return '<button type="button" class="btn ' + (b.cls || 'btn-outline') + '" data-i="' + i + '"' + (b.dis ? ' disabled' : '') + (b.id ? ' id="' + b.id + '"' : '') + '>' + b.t + '</button>'; }).join('');
            Array.prototype.forEach.call($('wipe-btns').children, function (el, i) { el.onclick = list[i].fn; });
        }

        W.open = function () {
            if (!isAdmin()) return toast('Chỉ Quản trị viên mới dùng được chức năng này.', 'error');
            W.scan = null; W.busy = false; W.srvBk = null; W.go = false; step1(); UI.openModal('modal-wipe');
        };
        W.close = function () { if (W.busy) return toast('Đang xóa dữ liệu, vui lòng chờ hoàn tất.', 'warning'); clearInterval(W._cd); UI.closeModal('modal-wipe'); };
        $('modal-wipe').addEventListener('click', function (e) { if (e.target === this) W.close(); });

        /* ---------- NHẮC NHỞ 1/3: chọn dữ liệu sẽ xóa ---------- */
        function step1() {
            W.step = 1; dots(1); $('wipe-x').disabled = false;
            $('wipe-body').innerHTML = '<div class="wipe-warn">⚠️ Bạn sắp <b>XÓA VĨNH VIỄN</b> dữ liệu của toàn hệ thống Quân Đoàn. Thành viên sẽ mất điểm, lượt, lịch sử, tin nhắn... và <b>không thể khôi phục</b>. Chọn những phần cần xóa:</div>'
                + '<div class="wipe-list">' + GROUPS.map(function (g) {
                    return '<label class="wipe-row' + (W.sel[g.id] ? '' : ' off') + '"><input type="checkbox" data-g="' + g.id + '"' + (W.sel[g.id] ? ' checked' : '') + '><i class="fa-solid ' + g.icon + '" style="width:18px;text-align:center;color:var(--color-danger)"></i><span class="wr-t">' + esc(g.name) + '<small>' + esc(g.cols.join(', ')) + '</small></span></label>';
                }).join('') + '</div>'
                + '<label class="wipe-opt"><input type="checkbox" id="wipe-keep"' + (W.keepAdmins ? ' checked' : '') + '><span>🛡️ <b>Giữ lại tài khoản Ban Quản Trị</b> (admin / quản lý) để vẫn đăng nhập được Admin</span></label>';
            $('wipe-body').querySelectorAll('input[data-g]').forEach(function (cb) {
                cb.onchange = function () { W.sel[cb.dataset.g] = cb.checked; cb.closest('.wipe-row').classList.toggle('off', !cb.checked); $('wipe-next1').disabled = !chosen().length; };
            });
            $('wipe-keep').onchange = function () { W.keepAdmins = this.checked; };
            btns([{ t: 'Hủy', fn: W.close }, { t: 'Tôi hiểu, tiếp tục (1/3) <i class="fa-solid fa-arrow-right ml-1"></i>', cls: 'btn-danger', id: 'wipe-next1', dis: !chosen().length, fn: step2 }]);
        }

        /* ---------- NHẮC NHỞ 2/3: đếm số bản ghi + sao lưu ---------- */
        function fetchCol(name) {
            return db.collection(name).get().then(function (s) {
                var docs = s.docs; if (name === 'accounts' && W.keepAdmins) docs = docs.filter(function (d) { return !isAdminAcc(d.data()); });
                return { name: name, docs: docs };
            }).catch(function (e) { return { name: name, docs: [], err: (e && e.code) || 'lỗi đọc' }; });
        }
        function step2() {
            W.step = 2; dots(2);
            var gs = chosen();
            $('wipe-body').innerHTML = '<div class="wipe-warn">⚠️ <b>Nhắc nhở lần 2:</b> đang đếm dữ liệu sẽ bị xóa...</div><div class="wipe-total"><i class="fa-solid fa-spinner fa-spin"></i></div>';
            btns([{ t: '<i class="fa-solid fa-arrow-left mr-1"></i> Quay lại', fn: step1 }, { t: 'Đang đếm...', cls: 'btn-danger', dis: true }]);
            var cols = []; gs.forEach(function (g) { cols = cols.concat(g.cols); });
            Promise.all(cols.map(fetchCol)).then(function (res) {
                if (W.step !== 2) return;
                var by = {}; res.forEach(function (r) { by[r.name] = r; });
                W.scan = { at: Date.now(), by: by, total: res.reduce(function (a, r) { return a + r.docs.length; }, 0) };
                var errs = res.filter(function (r) { return r.err; });
                $('wipe-body').innerHTML = '<div class="wipe-warn">⚠️ <b>Nhắc nhở lần 2:</b> các dữ liệu dưới đây sẽ bị <b>xóa vĩnh viễn</b>. Nên <b>tải bản sao lưu</b> về máy trước khi tiếp tục.</div>'
                    + '<div class="wipe-total">Tổng số bản ghi sẽ xóa<b>' + fmt(W.scan.total) + '</b></div>'
                    + '<div class="wipe-list">' + gs.map(function (g) {
                        var n = g.cols.reduce(function (a, c) { return a + by[c].docs.length; }, 0);
                        return '<div class="wipe-row" style="cursor:default"><i class="fa-solid ' + g.icon + '" style="width:18px;text-align:center;color:var(--color-danger)"></i><span class="wr-t">' + esc(g.name)
                            + '<small>' + g.cols.map(function (c) { return c + ': ' + fmt(by[c].docs.length); }).join(' · ') + '</small></span><span class="wr-n">' + fmt(n) + '</span></div>';
                    }).join('') + '</div>'
                    + (W.sel.accounts && W.keepAdmins ? '<p class="text-xs text-muted mb-2">🛡️ Tài khoản Ban Quản Trị được giữ lại (không tính ở trên).</p>' : '')
                    + (errs.length ? '<p class="text-xs mb-2" style="color:var(--color-danger)">Không đọc được: ' + errs.map(function (r) { return esc(r.name) + ' (' + esc(r.err) + ')'; }).join(', ') + '</p>' : '');
                btns([{ t: '<i class="fa-solid fa-arrow-left mr-1"></i> Quay lại', fn: step1 },
                    { t: '<i class="fa-solid fa-download mr-1"></i> Tải bản sao lưu', cls: 'btn-outline', dis: !W.scan.total, fn: backup },
                    { t: W.scan.total ? 'Tôi hiểu, tiếp tục (2/3) <i class="fa-solid fa-arrow-right ml-1"></i>' : 'Không có dữ liệu để xóa', cls: 'btn-danger', dis: !W.scan.total, fn: step3 }]);
            });
        }
        function backup() {
            if (!W.scan) return;
            var out = { app: 'QD Elite', exportedAt: new Date().toISOString(), by: S().currentUser || '', collections: {} };
            Object.keys(W.scan.by).forEach(function (c) { out.collections[c] = W.scan.by[c].docs.map(function (d) { return { id: d.id, data: d.data() }; }); });
            var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
            var name = 'qd-elite-saoluu-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
            var url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
            var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
            W.backedUp = true; toast('Đã tải bản sao lưu: ' + name);
        }

        /* ---------- NHẮC NHỞ 3/3: gõ cụm xác nhận + chờ 5 giây ---------- */
        function step3() {
            W.step = 3; dots(3); clearInterval(W._cd);
            $('wipe-body').innerHTML = '<div class="wipe-warn">⛔ <b>Nhắc nhở lần cuối (3/3):</b> sau bước này <b>' + fmt(W.scan.total) + ' bản ghi</b> sẽ bị xóa ngay và <b>KHÔNG THỂ HOÀN TÁC</b>.'
                + (W.backedUp ? '' : '<br>Bạn <b>chưa tải bản sao lưu</b>.') + '</div>'
                + '<label class="form-label" for="wipe-type">Gõ <b style="color:var(--color-danger)">' + PHRASE + '</b> để xác nhận</label>'
                + '<input id="wipe-type" class="form-control wipe-type mb-4" autocomplete="off" spellcheck="false" placeholder="' + PHRASE + '">';
            var left = 5;
            btns([{ t: '<i class="fa-solid fa-arrow-left mr-1"></i> Quay lại', fn: step2back }, { t: 'Xóa vĩnh viễn (' + left + ')', cls: 'btn-solid-danger', id: 'wipe-go', dis: true, fn: run }]);
            function upd() { var ok = norm($('wipe-type').value) === PHRASE; $('wipe-type').classList.toggle('ok', ok); $('wipe-go').disabled = !(ok && left <= 0); }
            $('wipe-type').oninput = upd;
            $('wipe-type').onkeydown = function (e) { if (e.key === 'Enter' && !$('wipe-go').disabled) run(); };
            W._cd = setInterval(function () { left--; $('wipe-go').innerHTML = left > 0 ? 'Xóa vĩnh viễn (' + left + ')' : '<i class="fa-solid fa-trash-can mr-1"></i> Xóa vĩnh viễn ' + fmt(W.scan.total) + ' bản ghi'; if (left <= 0) clearInterval(W._cd); upd(); }, 1000);
            setTimeout(function () { try { $('wipe-type').focus(); } catch (e) {} }, 200);
        }
        function step2back() { clearInterval(W._cd); step2(); }

        /* ---------- XÓA ---------- */
        function run() {
            if (W.busy || (!W.go && norm(($('wipe-type') || {}).value) !== PHRASE)) { var b = $('wipe-type'); if (b) { b.classList.remove('wipe-shake'); void b.offsetWidth; b.classList.add('wipe-shake'); } return; }
            if (!isAdmin()) return toast('Chỉ Quản trị viên mới dùng được chức năng này.', 'error');
            clearInterval(W._cd); W.busy = true; W.step = 4; dots(4); $('wipe-x').disabled = true;
            if (window.QD_BACKEND === 'vps' && window.QDdb && !W.srvBk) {   // VPS: sao lưu toàn bộ trên máy chủ trước (khôi phục được ở Máy chủ VPS > Sao lưu)
                $('wipe-body').innerHTML = '<div class="wipe-warn">💾 Máy chủ VPS đang sao lưu toàn bộ dữ liệu trước khi xóa…</div>';
                return QDdb.admin('backup').then(function (r) { W.srvBk = r.name; toast('Đã sao lưu trên máy chủ: ' + r.name); }, function (e) { W.srvBk = 'lỗi'; toast('Không sao lưu được trên máy chủ: ' + (e.message || e.code) + ' — vẫn tiếp tục xóa', 'warning'); }).then(function () { W.busy = false; W.go = true; run(); });
            }
            var gs = chosen(), cols = []; gs.forEach(function (g) { cols = cols.concat(g.cols); });
            $('wipe-body').innerHTML = '<div class="wipe-warn" id="wipe-warn4">🗑️ Đang xóa dữ liệu... <b>Không đóng trang</b> cho tới khi xong.</div><div class="wipe-bar"><i id="wipe-bar"></i></div><div class="text-sm mb-2" id="wipe-prog">Chuẩn bị...</div><div class="wipe-log" id="wipe-log"></div>';
            btns([{ t: '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang xóa...', cls: 'btn-solid-danger', dis: true }]);
            var total = W.scan.total || 1, done = 0, fails = [], logEl = $('wipe-log');
            var log = function (h) { logEl.insertAdjacentHTML('beforeend', '<div>' + h + '</div>'); logEl.scrollTop = logEl.scrollHeight; };
            var prog = function (c) { $('wipe-bar').style.width = Math.min(100, Math.round(done / total * 100)) + '%'; $('wipe-prog').textContent = 'Đã xóa ' + fmt(done) + ' / ' + fmt(total) + (c ? ' · ' + c : ''); };
            var seq = Promise.resolve();
            cols.forEach(function (c) {
                seq = seq.then(function () {
                    prog(c);
                    return fetchCol(c).then(function (r) {   // đọc lại ngay lúc xóa (dữ liệu có thể vừa thay đổi)
                        if (r.err) { fails.push(c); log('<span class="e">✗ ' + esc(c) + ': không đọc được (' + esc(r.err) + ')</span>'); return; }
                        if (!r.docs.length) { log('· ' + esc(c) + ': trống'); return; }
                        if (done + r.docs.length > total) total = done + r.docs.length;
                        var chunks = []; for (var i = 0; i < r.docs.length; i += 400) chunks.push(r.docs.slice(i, i + 400));
                        var n = 0, inner = Promise.resolve();
                        chunks.forEach(function (ch) {
                            inner = inner.then(function () {
                                var b = db.batch(); ch.forEach(function (d) { b.delete(d.ref || db.collection(c).doc(d.id)); });
                                return b.commit().then(function () { n += ch.length; done += ch.length; prog(c); });
                            });
                        });
                        return inner.then(function () { log('<span class="k">✓ ' + esc(c) + ': đã xóa ' + fmt(n) + '</span>'); })
                            .catch(function (e) { fails.push(c); log('<span class="e">✗ ' + esc(c) + ': lỗi xóa sau ' + fmt(n) + ' bản ghi (' + esc((e && e.code) || e) + ')</span>'); });
                    });
                });
            });
            seq.then(function () {
                W.busy = false; $('wipe-x').disabled = false; $('wipe-bar').style.width = '100%';
                db.collection('admin_logs').add({ type: 'wipe', action: 'delete_all', user: '(hệ thống)', by: S().currentUser || '', groups: gs.map(function (g) { return g.id; }), keepAdmins: !!W.keepAdmins, count: done, failed: fails, timestamp: Date.now() }).catch(function () {});
                $('wipe-step').textContent = fails.length ? 'Xong (có lỗi)' : 'Hoàn tất';
                $('wipe-warn4').innerHTML = fails.length ? '⚠️ Đã chạy xong nhưng <b>có mục không xóa được</b>.' : '✅ Đã xóa xong dữ liệu đã chọn. Bạn có thể đóng cửa sổ này.';
                $('wipe-prog').innerHTML = fails.length ? '⚠️ Đã xóa <b>' + fmt(done) + '</b> bản ghi. <b style="color:var(--color-danger)">' + fails.length + ' mục lỗi</b> (thường do Firestore Rules không cho xóa) — xem chi tiết bên dưới.'
                    : '✅ Đã xóa xong <b>' + fmt(done) + '</b> bản ghi.';
                btns([{ t: 'Đóng', cls: 'btn-primary', fn: W.close }]);
                toast(fails.length ? 'Xóa xong, có ' + fails.length + ' mục lỗi.' : 'Đã xóa tất cả dữ liệu đã chọn.', fails.length ? 'warning' : 'success');
                W.backedUp = false;
            });
        }
    })();
    
