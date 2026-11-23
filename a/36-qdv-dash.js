    /* ===== Tổng quan: thẻ "Máy chủ VPS" (CPU / RAM / ổ đĩa / kết nối / sao lưu) — chỉ Quản trị viên, làm mới 15 giây khi đang xem Tổng quan ===== */
    (function () {
        if (window.QD_BACKEND !== 'vps') return;
        var $ = function (id) { return document.getElementById(id); }, T = 0;
        function B(n) { n = +n || 0; var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + u[i]; }
        function tone(p) { return p >= 85 ? '#ef4444' : p >= 65 ? '#f59e0b' : '#22c55e'; }
        function it(lb, val, pct) { return '<div class="qdv-i"><span>' + lb + '</span><b>' + val + '</b>' + (pct == null ? '' : '<i><em style="width:' + Math.max(2, Math.min(100, pct)) + '%;background:' + tone(pct) + '"></em></i>') + '</div>'; }
        function dur(s) { var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600); return d ? d + ' ngày ' + h + ' giờ' : h + ' giờ ' + Math.floor(s % 3600 / 60) + ' phút'; }
        function tick() {
            var card = $('qdv-card'), dash = $('view-dashboard');
            if (!card || !window.QDdb || !QDdb.admin || document.hidden) return;
            if (typeof State === 'undefined' || State.currentUserRole !== 'admin') { card.hidden = true; return; }
            if (dash && !dash.classList.contains('active') && !card.hidden) return;
            QDdb.admin('stats', { since: Date.now() }).then(function (s) {
                var h = (s.hist || []).slice(-1)[0] || {}, mp = s.mem && s.mem.total ? (1 - s.mem.avail / s.mem.total) * 100 : null, dp = s.disk && s.disk.total ? (1 - s.disk.free / s.disk.total) * 100 : null;
                card.hidden = false;
                $('qdv-sub').textContent = '● Đang chạy · ' + s.ver + ' · chạy được ' + dur(s.uptime);
                $('qdv-grid').innerHTML = it('CPU (' + s.cores + ' nhân)', s.load ? (s.load[0] / s.cores * 100).toFixed(0) + '%' : '—', s.load ? s.load[0] / s.cores * 100 : null)
                    + it('RAM', mp == null ? '—' : mp.toFixed(0) + '% <small style="font-size:12px;color:var(--text-muted)">/ ' + B(s.mem.total) + '</small>', mp)
                    + it('Ổ đĩa', dp == null ? '—' : dp.toFixed(0) + '% <small style="font-size:12px;color:var(--text-muted)">còn ' + B(s.disk.free) + '</small>', dp)
                    + it('Dữ liệu', s.db.docs.toLocaleString('vi-VN') + ' <small style="font-size:12px;color:var(--text-muted)">· ' + B(s.db.file) + '</small>')
                    + it('Đang kết nối', s.users + ' người <small style="font-size:12px;color:var(--text-muted)">· ' + s.conns + ' kết nối</small>');
                window.__vpsBrief = 'RAM ' + (mp == null ? '?' : mp.toFixed(0) + '%') + ' · ổ đĩa ' + (dp == null ? '?' : dp.toFixed(0) + '%') + ' · ' + s.users + ' người online';
            }).catch(function (e) {
                if (e && e.code === 'permission-denied') { card.hidden = true; return; }
                card.hidden = false; $('qdv-sub').innerHTML = '<span style="color:#ef4444">● Không đọc được máy chủ: ' + String((e && (e.message || e.code)) || 'mất kết nối') + '</span>'; $('qdv-grid').innerHTML = '';
            });
        }
        setTimeout(tick, 3500); T = setInterval(tick, 15000);
    })();
    
