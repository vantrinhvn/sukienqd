    /* ===== Admin > Cuộc gọi: lịch sử (call_log), thời lượng, dung lượng máy chủ trung chuyển ===== */
    window.QDCallLog = (function () {
        var $ = function (id) { return document.getElementById(id); }, H = window.qdH, booted = false, unsub = null, LOG = [], F = '', GB = 1000;
        function fs() { return firebase.firestore(); }
        function mStart(off) { var d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - (off || 0)); return d; }
        function mb(b) { b = +b || 0; return b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1e3 ? Math.round(b / 1e3) + ' KB' : b + ' B'; }
        function dur(sec) { sec = Math.round(sec || 0); var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, x = sec % 60; return h ? h + ' giờ ' + m + ' phút' : m ? m + ' phút ' + (x < 10 ? '0' : '') + x + 's' : x + ' giây'; }
        function mmss(sec) { sec = Math.round(sec || 0); var m = Math.floor(sec / 60), x = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (x < 10 ? '0' : '') + x; }
        function fmt(t) { var d = new Date(t || 0); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ' ' + d.getDate() + '/' + (d.getMonth() + 1); }
        function relayBytes(x) { var b = 0; ['netFrom', 'netTo'].forEach(function (k) { var n = x[k]; if (n && n.relay) b += +n.bytes || 0; }); return b; }
        function path(x) { var a = x.netFrom, b = x.netTo; if ((a && a.path === 'relay') || (b && b.path === 'relay')) return 'relay'; if (a || b) return 'direct'; return ''; }
        function result(x) {
            if (x.status === 'done' || x.dur > 0) return '<span class="qcl-ok">✓ Đã nghe · ' + mmss(x.dur) + '</span>';
            if (x.status === 'missed') return '<span class="qcl-miss">Nhỡ</span>';
            if (x.status === 'declined') return '<span class="qcl-miss">Từ chối</span>';
            if (x.status === 'busy') return '<span class="qcl-miss">Máy bận</span>';
            return '<span class="qcl-bad">Không nối được</span>';
        }
        function render() {
            var t0 = new Date(); t0.setHours(0, 0, 0, 0);
            var done = LOG.filter(function (x) { return x.dur > 0; }), miss = LOG.filter(function (x) { return !(x.dur > 0) && /missed|declined|busy/.test(x.status || ''); }), fail = LOG.filter(function (x) { return !(x.dur > 0) && !/missed|declined|busy/.test(x.status || ''); });
            var today = LOG.filter(function (x) { return (x.created || 0) >= t0.getTime(); }), talk = done.reduce(function (a, x) { return a + (+x.dur || 0); }, 0);
            var vid = LOG.filter(function (x) { return x.type === 'video'; }).length;
            $('qcl-stats').innerHTML =
                '<div class="card"><small>📞 Cuộc gọi trong tháng</small><b>' + LOG.length + '</b><span>' + vid + ' video · ' + (LOG.length - vid) + ' thoại</span></div>' +
                '<div class="card"><small>⏱️ Tổng thời gian nói</small><b>' + Math.round(talk / 60) + ' phút</b><span>' + done.length + ' cuộc đã nghe' + (done.length ? ' · TB ' + mmss(talk / done.length) : '') + '</span></div>' +
                '<div class="card"><small>📵 Nhỡ / từ chối / bận</small><b>' + miss.length + '</b><span>' + (fail.length ? '<span class="qcl-bad">' + fail.length + ' cuộc không nối được</span>' : 'Không có cuộc lỗi') + '</span></div>' +
                '<div class="card"><small>📅 Hôm nay</small><b>' + today.length + '</b><span>' + Math.round(today.reduce(function (a, x) { return a + (+x.dur || 0); }, 0) / 60) + ' phút nói</span></div>';
            var rb = LOG.reduce(function (a, x) { return a + relayBytes(x); }, 0), quota = GB * 1e9, pct = Math.min(100, rb / quota * 100), nRelay = LOG.filter(function (x) { return path(x) === 'relay'; }).length;
            var cur = $('qcl-month').value === '0';
            $('qcl-turn-body').innerHTML = '<div class="flex justify-between flex-wrap gap-2"><span>Đã dùng <b class="qq-big">' + mb(rb) + '</b> / ' + GB + ' GB</span><span>' + (cur ? 'Còn khoảng <b>' + mb(Math.max(0, quota - rb)) + '</b>' : 'Tháng đã chọn') + '</span></div>' +
                '<div class="qq-bar' + (pct > 90 ? ' bad' : pct > 70 ? ' warn' : '') + '"><i style="width:' + Math.max(pct, rb ? 1 : 0).toFixed(1) + '%"></i></div>' +
                '<span class="text-muted">' + nRelay + ' / ' + done.length + ' cuộc đã nghe phải đi qua máy chủ (các cuộc còn lại nối thẳng, không tốn dung lượng). Số đo do máy người gọi gửi về — có thể lệch nhẹ so với trang ExpressTURN.</span>';
            var fold = function (v) { return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'); }, q = fold($('qcl-q').value.trim());
            var L = LOG.filter(function (x) {
                if (F === 'done' && !(x.dur > 0)) return false; if (F === 'miss' && x.dur > 0) return false; if (F === 'relay' && path(x) !== 'relay') return false;
                return !q || fold([x.from, x.to, x.fromName, x.toName].join(' ')).indexOf(q) >= 0;
            });
            $('qcl-list').innerHTML = L.length ? L.slice(0, 400).map(function (x) {
                var pth = path(x), rbx = relayBytes(x), tot = ['netFrom', 'netTo'].reduce(function (a, k) { return Math.max(a, (x[k] && +x[k].bytes) || 0); }, 0);
                return '<tr><td style="white-space:nowrap">' + fmt(x.created) + '</td><td class="vsh-who"><b>' + H(x.fromName || x.from || '?') + '</b> → <b>' + H(x.toName || x.to || '?') + '</b><small>@' + H(x.from || '') + ' → @' + H(x.to || '') + '</small></td>' +
                    '<td style="white-space:nowrap">' + (x.type === 'video' ? '🎥 Video' : '📞 Thoại') + '</td><td style="white-space:nowrap">' + result(x) + '</td>' +
                    '<td style="white-space:nowrap">' + (pth === 'relay' ? '<span style="color:#8b5cf6">🔁 Qua máy chủ</span>' : pth === 'direct' ? '↔️ Trực tiếp' : '<span class="text-muted">—</span>') + '</td>' +
                    '<td style="white-space:nowrap">' + (rbx ? '<b>' + mb(rbx) + '</b>' : tot ? '<span class="text-muted">' + mb(tot) + '</span>' : '<span class="text-muted">—</span>') + '</td></tr>';
            }).join('') : '<tr><td colspan="6" class="text-muted">Chưa có cuộc gọi' + (F || q ? ' phù hợp' : ' trong tháng này') + '.</td></tr>';
        }
        function load() {
            var off = +$('qcl-month').value || 0, a = mStart(off).getTime(), b = mStart(off - 1).getTime();
            if (unsub) try { unsub(); } catch (e) {}
            $('qcl-list').innerHTML = '<tr><td colspan="6" class="text-muted">Đang tải…</td></tr>';
            unsub = fs().collection('call_log').where('created', '>=', a).where('created', '<', b).orderBy('created', 'desc').limit(2000).onSnapshot(function (q) {
                LOG = []; q.forEach(function (d) { var x = d.data(); x.id = d.id; LOG.push(x); }); LOG.sort(function (x, y) { return (y.created || 0) - (x.created || 0); }); render();
            }, function (e) { $('qcl-list').innerHTML = '<tr><td colspan="6" style="color:#ef4444">Không đọc được lịch sử (' + H(e && e.code || 'lỗi') + ').</td></tr>'; });
        }
        function boot() {
            if (booted) { return; } if (!window.firebase || !firebase.apps || !firebase.apps.length) return; booted = true;
            var sel = $('qcl-month'); for (var i = 0; i < 6; i++) { var d = mStart(i), o = document.createElement('option'); o.value = String(i); o.textContent = (i ? '' : 'Tháng này · ') + 'Tháng ' + (d.getMonth() + 1) + '/' + d.getFullYear(); sel.appendChild(o); }
            sel.addEventListener('change', load);
            $('qcl-filt').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; F = b.dataset.f || ''; Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); }); render(); });
            var qt = 0; $('qcl-q').addEventListener('input', function () { clearTimeout(qt); qt = setTimeout(render, 200); });
            fs().collection('settings').doc('call_config').onSnapshot(function (d) { var c = d.exists ? d.data() : {}; GB = +c.quotaGB || 1000; render(); }, function () {});
            load();
        }
        (function hook(n) {
            if (typeof UI === 'undefined' || !UI.navigate) { if (n < 120) setTimeout(function () { hook(n + 1); }, 500); return; }
            var nav = UI.navigate; UI.navigate = function (v) { var r = nav.apply(this, arguments); if (v === 'calls') boot(); return r; };
        })(0);
        return { reload: function () { if (booted) load(); } };
    })();

    
