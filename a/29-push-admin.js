    window.QDPushAdmin = (function () {
        var d = document, ACCS = [], LAST = [], SRV = null, booted = false;
        var TPL = [
            ['🧧 Lì xì', '🧧 Lì xì đã mở!', 'Vào app nhận lì xì ngay hôm nay, số lượng có hạn.'],
            ['🎡 Vòng quay', '🎡 Vòng quay may mắn', 'Lượt quay mới đã có, vào app thử vận may ngay!'],
            ['✅ Điểm danh', '✅ Nhớ điểm danh hôm nay', 'Vào app điểm danh để nhận điểm thưởng nhé.'],
            ['🏆 Giải đấu', '🏆 Giải đấu sắp bắt đầu', 'Anh em vào app xem lịch thi đấu và chuẩn bị nhé!'],
            ['🛠 Bảo trì', '🛠 Thông báo bảo trì', 'Hệ thống bảo trì trong ít phút, anh em thông cảm nhé.']
        ];
        function $(id) { return d.getElementById(id); }
        function fs() { return (window.firebase && firebase.apps && firebase.apps.length) ? firebase.firestore() : null; }
        function toast(m, t) { try { Utils.toast(m, t); } catch (e) { alert(m); } }
        function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        function fmt(ms) { if (!ms) return ''; var x = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(x.getHours()) + ':' + p(x.getMinutes()) + ' ' + p(x.getDate()) + '/' + p(x.getMonth() + 1); }
        function status(h, cls) { var s = $('pushn-status'); if (s) { s.innerHTML = h; s.style.color = cls === 'ok' ? '#22c55e' : cls === 'err' ? '#ef4444' : ''; } }
        function target() { var one = $('pushn-target').value === 'one'; $('pushn-user').style.display = one ? '' : 'none'; if (one) $('pushn-user').focus(); }
        function pv() {
            var t = $('pushn-title'), b = $('pushn-body'); if (!t) return;
            $('pushn-pv-t').textContent = t.value.trim() || 'Tiêu đề thông báo';
            $('pushn-pv-b').textContent = b.value.trim() || 'Nội dung thông báo hiện ở đây.';
            $('pushn-title-n').textContent = t.value.length + '/80'; $('pushn-body-n').textContent = b.value.length + '/300';
            showImg($('pushn-pv-img'), img());
        }
        var SITE = 'https://vantrinhvn.github.io/sukienqd/';
        function img() {
            var v = $('pushn-img-sel').value;
            if (!v) return '';
            if (v === 'url') { var u = ($('pushn-img-url').value || '').trim(); return /^https:\/\/\S+$/.test(u) ? u : ''; }
            return SITE + v;
        }
        function imgSel() { $('pushn-img-url').style.display = $('pushn-img-sel').value === 'url' ? '' : 'none'; if ($('pushn-img-sel').value === 'url') $('pushn-img-url').focus(); pv(); }
        function showImg(el, u) { if (u) { el.src = u; el.hidden = false; } else { el.hidden = true; el.removeAttribute('src'); } }
        function useTpl(i) { var x = TPL[i]; $('pushn-title').value = x[1]; $('pushn-body').value = x[2]; pv(); }
        function pick(u) { $('pushn-target').value = 'one'; target(); $('pushn-user').value = u; $('pushn-title').focus(); try { $('pushn-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
        function accs() {
            var box = $('pushn-accs'); if (!box) return;
            var q = ($('pushn-acc-q').value || '').trim().toLowerCase();
            var list = ACCS.filter(function (a) { return !q || a.u.toLowerCase().indexOf(q) >= 0 || (a.name || '').toLowerCase().indexOf(q) >= 0; });
            box.innerHTML = list.length ? list.map(function (a) { return '<button type="button" data-u="' + esc(a.u) + '" title="Gửi riêng cho ' + esc(a.name || a.u) + '">@' + esc(a.u) + (a.n > 1 ? '<small>' + a.n + ' máy</small>' : '') + '</button>'; }).join('')
                : '<div class="text-muted text-sm">' + (ACCS.length ? 'Không có ai khớp.' : 'Chưa có ai — người dùng cần cập nhật app bản mới rồi đăng nhập.') + '</div>';
        }
        function vps() { return true; }   // chỉ còn máy chủ VPS
        function devVps() {   // máy chủ VPS: máy đang giữ kết nối nền của app (bản 1.1.0.85 trở lên)
            var el = $('pushn-devices'), L = (SRV && SRV.linkUsers) || [], dev = 0;
            ACCS = L.map(function (x) { dev += x.n; return { u: x.u, name: '', n: x.n }; });
            if (el) el.textContent = dev ? ('Đang có ' + dev + ' máy · ' + ACCS.length + ' tài khoản đang kết nối nhận thông báo.') : 'Chưa có máy nào đang kết nối (cần app bản 1.1.0.85 trở lên + đăng nhập).';
            $('pushn-n-dev').textContent = dev; $('pushn-n-acc').textContent = ACCS.length;
            $('pushn-userlist').innerHTML = ACCS.map(function (a) { return '<option value="' + esc(a.u) + '"></option>'; }).join('');
            accs();
        }
        function devices() {
            devVps();
        }
        function result(b) {
            if (!b) return '';
            if (b.status === 'done') return '<span style="color:#22c55e">✓ ' + (b.devices ? ('Đã gửi ' + b.sent + '/' + b.devices + ' máy' + (b.failed ? ' · ' + b.failed + ' lỗi' : '')) : 'Không có máy nào nhận') + (b.doneAt ? ' · ' + fmt(b.doneAt) : '') + '</span>';
            if (b.status === 'error') return '<span style="color:#ef4444">✗ Lỗi: ' + esc(b.error || '') + '</span>';
            if (b.status === 'expired') return '<span style="color:#f59e0b">⚠ Quá 24 giờ chưa gửi được — đã hủy</span>';
            if (b.status === 'sending') return '<span>📤 Đang gửi đến các máy...</span>';
            return (Date.now() - (b.createdAt || 0) > 10 * 60000) ? '<span style="color:#f59e0b">⚠ Chờ quá lâu — máy chủ gửi thông báo chưa chạy</span>' : '<span>⏳ Đang chờ gửi (' + eta() + ')</span>';
        }
        function hist() {
            var f = fs(), el = $('pushn-hist'); if (!f || !el) return;
            f.collection('push_broadcast').orderBy('createdAt', 'desc').limit(20).onSnapshot(function (q) {
                LAST = []; var h = [], st = new Date(); st.setHours(0, 0, 0, 0); var today = 0;
                q.forEach(function (x) {
                    var b = x.data(); if (b.kind === 'vps_alert') return;   // cảnh báo máy chủ tự gửi: không hiện trong lịch sử thông báo
                    LAST.push(b); if ((b.createdAt || 0) >= st.getTime() && b.status === 'done') today += (b.sent || 0);
                    h.push('<div class="pushn-h"><button type="button" class="pushn-again" data-i="' + (LAST.length - 1) + '" title="Chép lại để gửi lần nữa"><i class="fa-solid fa-copy"></i> Dùng lại</button><b>' + (b.image ? '🖼️ ' : '') + esc(b.title) + '</b> <span class="text-muted">· ' + (b.target === 'all' ? 'Tất cả' : '@' + esc(b.target)) + ' · ' + fmt(b.createdAt) + '</span><div class="pushn-hb">' + esc(b.body) + '</div>' + result(b) + '</div>');
                });
                el.innerHTML = h.length ? h.join('') : '<div class="text-muted text-sm">Chưa gửi thông báo nào.</div>';
                $('pushn-n-today').textContent = today;
            }, function () {});
        }
        function eta() { return 'vài giây'; }
        function srv() {   // máy chủ VPS (settings/push_server do máy chủ ghi: by 'vps', links, linkUsers)
            var el = $('pushn-srv'); if (!el) return;
            var t = SRV && +SRV.lastRun || 0, age = Date.now() - t;
            el.innerHTML = (t && age < 7 * 60000 ? '<span style="color:#22c55e">● Đang chạy</span>' : '<span style="color:#ef4444">● Mất liên lạc</span>') + '<br><span class="text-muted text-xs">Máy chủ VPS · gửi ngay (vài giây) · ' + (+(SRV && SRV.links) || 0) + ' máy đang kết nối</span>';
            $('pushn-eta').innerHTML = 'Đến điện thoại sau <b>vài giây</b>.';
            devVps();
        }
        // Hộp xác nhận theo giao diện Admin (thay hộp hỏi mặc định của trình duyệt)
        var waiting = null;
        function ask(o) {
            $('pushn-cf-t').textContent = o.title; $('pushn-cf-b').textContent = o.body; showImg($('pushn-cf-img'), o.image || '');
            $('pushn-cf-to').innerHTML = o.to; $('pushn-cf-note').innerHTML = o.note || '';
            $('pushn-cf-note').style.color = o.warn ? '#f59e0b' : '';
            UI.openModal('modal-pushn-confirm');
            setTimeout(function () { try { $('pushn-cf-ok').focus(); } catch (e) {} }, 50);
            return new Promise(function (res) { waiting = res; });
        }
        function answer(ok) { UI.closeModal('modal-pushn-confirm'); var w = waiting; waiting = null; if (w) w(!!ok); }
        var CFG = { private: true, mention: true, general: false, bot: true };
        function cfgUi() { ['private', 'mention', 'general', 'bot'].forEach(function (k) { var el = $('pushn-c-' + k); if (el) el.checked = !!CFG[k]; }); }
        function setCfg(k, el) {
            var v = !!el.checked, p = {}; p[k] = v; p.updatedAt = Date.now();
            fs().collection('settings').doc('push_config').set(p, { merge: true }).then(function () {
                toast({ private: 'Tin nhắn riêng', mention: '@Nhắc tên', general: 'Mọi tin Kênh Chung', bot: 'Bot báo cáo' }[k] + ': ' + (v ? 'BẬT báo lên điện thoại' : 'TẮT'), 'success');
            }).catch(function (e) { el.checked = !v; toast('Không lưu được' + (e && e.code ? ' (' + e.code + ')' : ''), 'error'); });
        }
        function send() {
            var f = fs(); if (!f) return toast('Chưa kết nối máy chủ, thử lại sau.', 'error');
            var title = $('pushn-title').value.trim(), body = $('pushn-body').value.trim(), one = $('pushn-target').value === 'one', user = $('pushn-user').value.trim().replace(/^@/, '');
            if (!title) return toast('Nhập tiêu đề thông báo.', 'error');
            if (!body) return toast('Nhập nội dung thông báo.', 'error');
            if (one && !user) return toast('Nhập tên đăng nhập người nhận.', 'error');
            var dev = 0; ACCS.forEach(function (a) { if (!one || a.u === user) dev += a.n; });
            var noDev = one && ACCS.length && !ACCS.some(function (a) { return a.u === user; });
            if ($('pushn-img-sel').value === 'url' && !img()) return toast('Link ảnh phải bắt đầu bằng https://', 'error');
            ask({ title: title, body: body, image: img(),
                to: one ? 'Gửi riêng cho <b>@' + esc(user) + '</b>' : 'Gửi đến <b>TẤT CẢ</b> thành viên',
                note: noDev ? '⚠ @' + esc(user) + ' chưa có máy nào nhận thông báo (chưa cập nhật app hoặc chưa đăng nhập) — thông báo sẽ không đến đâu cả.'
                    : (dev ? '📱 Sẽ đến <b>' + dev + '</b> máy sau ' + eta() + '.' : 'Chưa có máy nào nhận thông báo.') + (vps() ? '<br><span class="text-muted">Qua máy chủ VPS: máy đang có mạng nhận ngay; máy mất mạng / tắt dưới 10 phút sẽ nhận khi có mạng lại.</span>' : ''),
                warn: noDev }).then(function (ok) { if (ok) queue(f, title, body, one, user); });
        }
        function queue(f, title, body, one, user) {
            var btn = $('pushn-send'); btn.disabled = true; status('⏳ Đang xếp hàng...');
            var by = ''; try { by = (window.State && State.currentUser) || ''; } catch (e) {}
            var im = img();
            f.collection('push_broadcast').add({ title: title, body: body, image: im, target: one ? user : 'all', status: 'pending', createdAt: Date.now(), by: by || 'admin' }).then(function () {
                $('pushn-title').value = ''; $('pushn-body').value = ''; $('pushn-img-sel').value = ''; $('pushn-img-url').value = ''; imgSel();
                btn.disabled = false;
                status('✓ Đã gửi qua máy chủ VPS — xem số máy nhận ở "Đã gửi gần đây".', 'ok');
            }).catch(function (e) { status('✗ Không gửi được' + (e && e.code ? ' (' + e.code + ')' : ''), 'err'); btn.disabled = false; });
        }
        function boot(n) {
            if (booted) return;
            if (!fs()) { if (n < 120) setTimeout(function () { boot(n + 1); }, 500); return; }
            booted = true;
            $('pushn-tpl').innerHTML = TPL.map(function (x, i) { return '<button type="button" data-i="' + i + '">' + x[0] + '</button>'; }).join('');
            $('pushn-tpl').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) useTpl(+b.dataset.i); });
            $('pushn-accs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) pick(b.dataset.u); });
            $('pushn-hist').addEventListener('click', function (e) {
                var b = e.target.closest('.pushn-again'); if (!b) return; var x = LAST[+b.dataset.i]; if (!x) return;
                $('pushn-title').value = x.title || ''; $('pushn-body').value = x.body || '';
                var im = String(x.image || ''), pre = im.indexOf(SITE) === 0 ? im.slice(SITE.length) : '';
                if (!im) $('pushn-img-sel').value = ''; else if (pre && $('pushn-img-sel').querySelector('option[value="' + pre + '"]')) $('pushn-img-sel').value = pre; else { $('pushn-img-sel').value = 'url'; $('pushn-img-url').value = im; }
                imgSel();
                $('pushn-target').value = x.target && x.target !== 'all' ? 'one' : 'all'; target(); $('pushn-user').value = x.target !== 'all' ? (x.target || '') : '';
                pv(); try { $('pushn-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (er) {}
            });
            ['pushn-title', 'pushn-body'].forEach(function (id) { $(id).addEventListener('input', pv); });
            pv(); devices(); hist();
            fs().collection('settings').doc('push_server').onSnapshot(function (x) { SRV = x.exists ? x.data() : null; srv(); }, function () {});
            fs().collection('settings').doc('push_config').onSnapshot(function (x) { var c = x.exists ? x.data() : {}; CFG = { private: c.private !== false, mention: c.mention !== false, general: c.general === true, bot: c.bot !== false }; cfgUi(); }, function () {});
            cfgUi(); $('pushn-img-url').addEventListener('input', pv);
            setInterval(srv, 60000);
        }
        // Chỉ nạp khi mở mục Thông báo app (đỡ đọc dữ liệu khi không dùng); mở lại -> đếm lại số máy
        (function hook(n) {
            if (typeof UI === 'undefined' || !UI.navigate) { if (n < 120) setTimeout(function () { hook(n + 1); }, 500); return; }
            var nav = UI.navigate;
            UI.navigate = function (v) { var r = nav.apply(this, arguments); if (v === 'apppush') { if (booted) devices(); else boot(0); } return r; };
            var sec = $('view-apppush'); if (sec && sec.classList.contains('active')) boot(0);
        })(0);
        return { send: send, target: target, devices: devices, accs: accs, pick: pick, answer: answer, setCfg: setCfg, imgSel: imgSel };
    })();
    
