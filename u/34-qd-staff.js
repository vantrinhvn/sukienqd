    window.QDStaff = (function () {
        var TICK = '<i class="fa-solid fa-circle-check qd-staff-tick" title="Tài khoản quản lý" aria-label="Quản lý"></i>';
        function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
        function is(u) {
            if (!u || u === 'general' || u === 'all') return false;
            if (u === 'admin') return true;
            var a = ((window.State || {}).accInfo || {})[u];
            return !!a && (a.role === 'admin' || a.role === 'manager');
        }
        function mark(el, on) {
            el.classList.toggle('is-staff', on);
            var t = el.querySelector('.qd-staff-tick');
            if (on && !t) el.insertAdjacentHTML('beforeend', TICK); else if (!on && t) t.remove();
        }
        function sender(u, nm) { var on = is(u); return '<div class="msg-sender' + (on ? ' is-staff' : '') + '" data-staff-u="' + esc(u) + '" style="color: var(--color-info);">' + esc(nm) + (on ? TICK : '') + '</div>'; }
        function name(u, nm) { var on = is(u); return '<span class="qd-nm' + (on ? ' is-staff' : '') + '" data-staff-u="' + esc(u) + '">' + esc(nm) + (on ? TICK : '') + '</span>'; }
        function header() {
            var el = document.getElementById('active-name'); if (!el) return; var t = (window.State || {}).chatTarget; mark(el, is(t)); el.classList.toggle('qd-kc', t === 'general');
            // Quản trị / Quản lý: ẩn nút "Đổi biệt danh" (chỉ thành viên mới đổi được biệt danh)
            var b = document.querySelector('[onclick="window.Chat.openNicknameEditor()"]'); if (b) b.style.display = is(t) ? 'none' : '';
        }
        function purgeNicks() {   // biệt danh đã đặt trước đây cho Quản trị / Quản lý -> bỏ, luôn hiện tên thật
            var S = window.State; if (!S || !S.nicknames || !S.accInfo) return;
            var gone = Object.keys(S.nicknames).filter(is);
            if (!gone.length) return;
            gone.forEach(function (u) { delete S.nicknames[u]; });
            try { localStorage.setItem('qd_elite_nicks', JSON.stringify(S.nicknames)); } catch (e) {}
            try { if (window.Chat && window.Chat.updateHeader) window.Chat.updateHeader(); if (window.Chat && window.Chat.init && S.currentUser) window.Chat.init(); } catch (e) {}
        }
        function paint() { purgeNicks(); document.querySelectorAll('[data-staff-u]').forEach(function (el) { mark(el, is(el.getAttribute('data-staff-u'))); }); header(); }
        return { is: is, sender: sender, name: name, header: header, paint: paint };
    })();
    
