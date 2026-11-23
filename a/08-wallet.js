    (function () {
        'use strict';
        var $ = function (id) { return document.getElementById(id); };
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var TYPES = [
            { k: 'points', name: 'Điểm lì xì', short: 'Điểm', icon: '💰', tone: 'var(--color-success)', adj: true, note: 'Dùng để đổi lượt ở Trạm Quy Đổi / cửa hàng Ném Còn.' },
            { k: 'spins', name: 'Lượt vòng quay', short: 'Vòng quay', icon: '🎡', tone: 'var(--color-warning)', adj: false, note: 'Lượt vòng quay nhận khi trả lời đúng câu hỏi (quản lý ở mục Vòng quay).' },
            { k: 'tickets', name: 'Lượt rút lì xì', short: 'Rút lì xì', icon: '🧧', tone: 'var(--color-danger)', adj: true, note: 'Nhận từ Trạm Quy Đổi, điểm danh, mã mời hoặc admin cấp.' },
            { k: 'conThrows', name: 'Lượt ném còn', short: 'Ném còn', icon: '🎯', tone: '#f97316', adj: true, note: 'Nhận từ lượt miễn phí mỗi ngày, đổi điểm hoặc admin tặng.' }
        ];
        var W = window.AccWallet = { acc: {}, id: null, tab: 'points', logs: null, loading: false };
        W.put = function (id, d) { W.acc[id] = d; if (W.id === id && $('modal-wallet').classList.contains('active')) W.renderTop(); };
        W.open = function (id) {
            var d = W.acc[id]; if (!d) return;
            W.id = id; W.logs = null; $('wl-user').textContent = d.user;
            UI.openModal('modal-wallet'); W.renderTop(); W.load();
        };
        W.load = function () {
            var d = W.acc[W.id]; if (!d || typeof AdminActions === 'undefined' || !AdminActions.collectUserLogs) return;
            W.loading = true; W.renderHist(); var id = W.id;
            AdminActions.collectUserLogs(d.user).then(function (r) { if (id !== W.id) return; W.logs = r.logs; })
                .catch(function (e) { console.error(e); if (id === W.id) W.logs = 'err'; })
                .then(function () { if (id !== W.id) return; W.loading = false; W.renderHist(); });
        };
        W.renderTop = function () {
            var d = W.acc[W.id] || {}, t = TYPES.filter(function (x) { return x.k === W.tab; })[0];
            $('wl-tabs').innerHTML = TYPES.map(function (x) {
                return '<button type="button" role="tab" data-k="' + x.k + '" class="' + (x.k === W.tab ? 'on' : '') + '" style="--tone: ' + x.tone + ';"><b>' + (Number(d[x.k]) || 0).toLocaleString('vi-VN') + '</b><span>' + x.icon + ' ' + x.short + '</span></button>';
            }).join('');
            var panel = document.querySelector('#modal-wallet .wl-panel'); panel.style.setProperty('--tone', t.tone);
            $('wl-bal-lbl').textContent = t.icon + ' ' + t.name; $('wl-bal-num').textContent = (Number(d[t.k]) || 0).toLocaleString('vi-VN'); $('wl-bal-note').textContent = t.note;
            $('wl-adjust').style.display = t.adj ? '' : 'none';
        };
        W.renderHist = function () {
            var tb = $('wl-hist');
            if (W.loading || W.logs == null) { tb.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang thu thập dữ liệu...</td></tr>'; $('wl-stats').innerHTML = ''; return; }
            if (W.logs === 'err') { tb.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-8">Không tải được lịch sử.</td></tr>'; return; }
            var list = W.logs.filter(function (l) { return l.type === W.tab; }), plus = 0, minus = 0;
            list.forEach(function (l) { if (l.action === 'add') { if (l.amount > 0) plus += l.amount; else minus += l.amount; } });
            $('wl-stats').innerHTML = '<span>Số giao dịch: <b>' + list.length + '</b></span><span>Tổng nhận: <b class="text-success">+' + plus.toLocaleString('vi-VN') + '</b></span><span>Tổng dùng / trừ: <b class="text-danger">' + minus.toLocaleString('vi-VN') + '</b></span>';
            if (!list.length) { tb.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-8">Chưa có biến động nào.</td></tr>'; return; }
            tb.innerHTML = list.slice(0, 300).map(function (l) {
                var amt = l.action === 'set' ? '<span class="text-info font-bold">=' + l.amount + '</span>' : l.amount > 0 ? '<span class="text-success font-bold">+' + l.amount + '</span>' : l.amount < 0 ? '<span class="text-danger font-bold">' + l.amount + '</span>' : '<span class="text-muted font-bold">0</span>';
                return '<tr><td class="text-muted text-sm" style="white-space: nowrap;">' + new Date(l.time).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) + '</td>'
                    + '<td class="text-center" style="font-size: 15px;">' + amt + '</td><td class="text-center font-bold">' + (l.balanceAfter == null ? '' : l.balanceAfter) + '</td><td>' + l.reason + '</td></tr>';
            }).join('');
        };
        $('wl-tabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-k]'); if (!b) return; W.tab = b.getAttribute('data-k'); W.renderTop(); W.renderHist(); });
        $('wl-reload').onclick = function () { W.load(); };
        $('wl-adjust').onclick = function () {
            var d = W.acc[W.id]; if (!d) return;
            AdminActions.openSpinModal(W.id, d.user); $('spin-type').value = W.tab;
        };
        // cấp / trừ xong (hộp Cấp điểm / lượt) -> tải lại lịch sử ví nếu đang mở
        var obs = new MutationObserver(function () { var m = $('modal-spins'); if (m && !m.classList.contains('active') && $('modal-wallet').classList.contains('active') && W._spinOpen) { W._spinOpen = false; setTimeout(W.load, 400); } if (m && m.classList.contains('active')) W._spinOpen = true; });
        if ($('modal-spins')) obs.observe($('modal-spins'), { attributes: true, attributeFilter: ['class'] });
    })();
    
