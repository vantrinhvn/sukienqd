    /* Máy chủ trung chuyển cuộc gọi (TURN) -> settings/call_config.iceServers (trang thành viên đọc trực tiếp) */
    /* Gọi nhóm: settings/gcall_config { isEnabled, general, screen, max, videoMax } + cuộc gọi nhóm đang diễn ra (gcalls) */
    window.QDGCallAdmin = (function () {
        var $ = function (id) { return document.getElementById(id); }, started = false, CFG = {};
        function fs() { return firebase.firestore(); }
        function toast(m, k) { try { Utils.toast(m, k); } catch (e) {} }
        function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        function n(v, d, lo, hi) { v = parseInt(v, 10); return isNaN(v) ? d : Math.max(lo, Math.min(hi, v)); }
        function paint() { $('gca-on').checked = CFG.isEnabled !== false; $('gca-general').checked = CFG.general !== false; $('gca-screen').checked = CFG.screen !== false; $('gca-max').value = n(CFG.max, 8, 2, 8); $('gca-vmax').value = n(CFG.videoMax, 4, 0, 4); }
        function save() {
            var c = { isEnabled: $('gca-on').checked, general: $('gca-general').checked, screen: $('gca-screen').checked, max: n($('gca-max').value, 8, 2, 8), videoMax: n($('gca-vmax').value, 4, 0, 4), updatedAt: Date.now() };
            fs().collection('settings').doc('gcall_config').set(c, { merge: true }).then(function () { toast('Đã lưu cài đặt gọi nhóm', 'success'); }, function (e) { toast('Không lưu được: ' + (e.message || e), 'error'); });
        }
        function fmtAgo(t) { var m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'vừa bắt đầu' : m < 60 ? m + ' phút' : Math.floor(m / 60) + ' giờ ' + (m % 60) + ' phút'; }
        function end(id) {
            fs().collection('gcalls').doc(id).set({ status: id === 'general' ? 'live' : 'ended', endedAt: Date.now(), endedBy: 'admin', members: {} }, { merge: false }).then(function () { toast('Đã kết thúc cuộc gọi nhóm', 'success'); }, function () {});
        }
        function start() {
            if (started || !window.firebase || !firebase.apps || !firebase.apps.length) return; started = true;
            fs().collection('settings').doc('gcall_config').onSnapshot(function (d) { CFG = d.exists ? d.data() : {}; paint(); }, function () {});
            fs().collection('gcalls').where('status', '==', 'live').onSnapshot(function (q) {
                var now = Date.now(), rows = [];
                q.forEach(function (x) {
                    var c = x.data() || {}, ms = c.members || {}, ppl = Object.keys(ms).filter(function (u) { return now - (+ms[u].ping || +ms[u].at || 0) < 60000; });
                    if (!ppl.length) return;
                    var since = Math.min.apply(null, ppl.map(function (u) { return +ms[u].at || now; }));
                    rows.push('<div class="gca-row"><div><b>' + (x.id === 'general' ? '🔊 Phòng gọi Kênh Chung' : '👥 Gọi nhóm của ' + esc(c.hostName || c.host || '?')) + (c.type === 'video' ? ' · có hình' : '') + '</b><small>' + ppl.length + ' người: ' + ppl.map(function (u) { return esc((ms[u] && ms[u].name) || u); }).join(', ') + ' · ' + fmtAgo(since) + '</small></div>'
                        + '<button class="btn btn-danger" onclick="QDGCallAdmin.end(\'' + esc(x.id) + '\')"><i class="fa-solid fa-phone-slash"></i> Kết thúc</button></div>');
                });
                $('gca-live').innerHTML = rows.length ? rows.join('') : 'Không có cuộc gọi nhóm nào.';
            }, function () {});
        }
        (function wait(k) { if (window.firebase && firebase.apps && firebase.apps.length && document.getElementById('gca-on')) start(); else if (k < 200) setTimeout(function () { wait(k + 1); }, 1500); })(0);
        return { save: save, end: end };
    })();

    window.QDCallAdmin = (function () {
        var $ = function (id) { return document.getElementById(id); }, booted = false;
        function ref() { return firebase.firestore().collection('settings').doc('call_config'); }
        function st(m, k) { var e = $('qcall-st'); e.textContent = m || ''; e.style.color = k === 'err' ? '#ef4444' : k === 'ok' ? '#22c55e' : ''; }
        function entry() {
            var u = $('qcall-url').value.trim().replace(/^(turns?:)?\/*/i, '').replace(/\?.*$/, ''), user = $('qcall-user').value.trim(), pass = $('qcall-pass').value.trim();
            if (!u || !user || !pass) { st('Điền đủ địa chỉ, tên và mật khẩu.', 'err'); return null; }
            if (!/^[a-z0-9.-]+(:\d{2,5})?$/i.test(u)) { st('Địa chỉ máy chủ chưa đúng (VD: relay1.expressturn.com:3478).', 'err'); return null; }
            var host = u.split(':')[0], port = u.split(':')[1] || '3478';
            return { urls: ['turn:' + host + ':' + port, 'turn:' + host + ':' + port + '?transport=tcp', 'turns:' + host + ':' + (port === '3478' ? '5349' : '443') + '?transport=tcp'], username: user, credential: pass };
        }
        function test() {
            var e = entry(); if (!e) return Promise.resolve(false);
            if (!window.RTCPeerConnection) { st('Trình duyệt này không kiểm tra được.', 'err'); return Promise.resolve(false); }
            st('⏳ Đang thử kết nối tới máy chủ…');
            return new Promise(function (res) {
                var pc, done = false, fin = function (ok, m) { if (done) return; done = true; try { pc.close(); } catch (x) {} st(m, ok ? 'ok' : 'err'); res(ok); };
                try { pc = new RTCPeerConnection({ iceServers: [e], iceTransportPolicy: 'relay' }); } catch (x) { return fin(false, '✗ Thông tin máy chủ không hợp lệ.'); }
                pc.createDataChannel('t');
                pc.onicecandidate = function (ev) { if (ev.candidate && / relay /.test(ev.candidate.candidate)) fin(true, '✓ Máy chủ hoạt động — bấm "Lưu & dùng ngay".'); else if (!ev.candidate) fin(false, '✗ Không vào được máy chủ: kiểm tra lại địa chỉ / tên / mật khẩu.'); };
                pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).catch(function () { fin(false, '✗ Lỗi khi thử.'); });
                setTimeout(function () { fin(false, '✗ Hết thời gian chờ: máy chủ không trả lời.'); }, 9000);
            });
        }
        function save() {
            var e = entry(); if (!e) return;
            test().then(function (ok) {
                return ok ? true : qdAsk({ title: 'Kiểm tra chưa đạt', tone: 'warn', text: 'Máy chủ TURN chưa trả lời đúng. Vẫn lưu?', ok: 'Vẫn lưu' });
            }).then(function (go) {
                if (!go) return;
                return ref().set({ iceServers: [e], quotaGB: Math.max(1, +$('qcall-gb').value || 1000), updatedAt: Date.now(), by: (window.State && State.currentUser) || 'admin' }, { merge: true }).then(function () { st('✓ Đã lưu — các cuộc gọi mới dùng máy chủ này ngay.', 'ok'); try { Utils.toast('Đã lưu máy chủ cuộc gọi', 'success'); } catch (x) {} });
            }).catch(function (x) { st('✗ Không lưu được' + (x && x.code ? ' (' + x.code + ')' : ''), 'err'); });
        }
        function clear() { ref().set({ iceServers: [], updatedAt: Date.now() }, { merge: true }).then(function () { $('qcall-url').value = $('qcall-user').value = $('qcall-pass').value = ''; st('Đã bỏ — dùng máy chủ công cộng.', 'ok'); }); }
        function boot() {
            if (booted || !window.firebase || !firebase.apps || !firebase.apps.length) return; booted = true;
            ref().get().then(function (d) { var c = d.exists ? d.data() : {}, e = (c.iceServers || [])[0]; if (c.quotaGB) $('qcall-gb').value = c.quotaGB; if (!e) return st('Chưa có máy chủ riêng — đang dùng máy chủ công cộng (có thể không ổn định).');
                var u = String((e.urls || [])[0] || '').replace(/^turns?:/, '').replace(/\?.*$/, ''); $('qcall-url').value = u; $('qcall-user').value = e.username || ''; $('qcall-pass').value = e.credential || ''; st('Đang dùng máy chủ riêng: ' + u, 'ok'); }).catch(function () {});
        }
        (function hook(n) {
            if (typeof UI === 'undefined' || !UI.navigate) { if (n < 120) setTimeout(function () { hook(n + 1); }, 500); return; }
            var nav = UI.navigate; UI.navigate = function (v) { var r = nav.apply(this, arguments); if (v === 'calls') boot(); return r; };
        })(0);
        return { test: test, save: save, clear: clear };
    })();
    
