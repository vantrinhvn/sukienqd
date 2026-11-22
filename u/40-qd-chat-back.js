    (function () {
        var W = window, d = document, pushed = false, skip = 0;
        function inChat() { return d.body.classList.contains('in-chat-mode'); }
        function anyModal() { return !!d.querySelector('.modal-overlay.active'); }
        function closeChat() { try { W.Chat.toggleMobile(true); } catch (e) {} }
        /* 1) Nút Quay lại của điện thoại / trình duyệt: mở chat -> thêm 1 bước lịch sử; bấm Quay lại -> về danh sách trò chuyện */
        new MutationObserver(function () {
            if (inChat() && !pushed) { pushed = true; try { history.pushState({ qdChatOpen: 1 }, ''); } catch (e) {} }
            else if (!inChat() && pushed) {   // thoát bằng nút ← -> bỏ bước lịch sử đã thêm
                pushed = false;
                if (history.state && history.state.qdChatOpen) { skip++; try { history.back(); } catch (e) { skip--; } }
            }
        }).observe(d.body, { attributes: true, attributeFilter: ['class'] });
        W.addEventListener('popstate', function () {
            if (skip > 0) { skip--; return; }
            if (!pushed || !inChat() || anyModal()) return;          // có hộp thoại đang mở: để hộp thoại tự đóng trước
            if (history.state && history.state.qdChatOpen) return;    // vừa đóng 1 hộp thoại bên trong chat -> vẫn ở khung chat
            pushed = false; closeChat();
        });
        /* 2) Vuốt sang phải trong khung chat: khung trượt theo tay, đủ xa (hoặc vuốt nhanh) thì thoát về danh sách */
        var x0 = 0, y0 = 0, t0 = 0, dx = 0, on = false, dead = false, el = null;
        d.addEventListener('touchstart', function (e) {
            if (!inChat() || anyModal() || e.touches.length !== 1) { dead = true; return; }
            var t = e.target; el = d.querySelector('body.in-chat-mode .chat-main');
            dead = !el || !el.contains(t) || !!(t.closest && t.closest('textarea, input, #qd-at-pop, .qd-older'));
            x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); dx = 0; on = false;
        }, { passive: true });
        d.addEventListener('touchmove', function (e) {
            if (dead || !el) return;
            var mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
            if (!on) {
                if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) { dead = true; return; }   // đang cuộn dọc
                if (mx > 14 && mx > Math.abs(my) * 1.4) { on = true; el.classList.add('qd-swiping'); } else return;
            }
            dx = Math.max(0, mx - 14);
            el.style.transform = 'translateX(' + dx + 'px)';
        }, { passive: true });
        function end() {
            if (dead || !el) { dead = false; return; }
            if (!on) return;
            on = false; el.classList.remove('qd-swiping'); el.classList.add('qd-swipe-back');
            var fast = dx > 45 && (Date.now() - t0) < 260, far = dx > Math.min(110, W.innerWidth * 0.28), node = el;
            if (fast || far) {
                node.style.transform = 'translateX(' + W.innerWidth + 'px)';
                setTimeout(function () {
                    node.classList.remove('qd-swipe-back'); node.style.transform = '';
                    if (pushed && history.state && history.state.qdChatOpen) { try { history.back(); } catch (e) { closeChat(); } } else closeChat();
                }, 200);
            } else {
                node.style.transform = '';
                setTimeout(function () { node.classList.remove('qd-swipe-back'); }, 230);
            }
        }
        d.addEventListener('touchend', end, { passive: true });
        d.addEventListener('touchcancel', end, { passive: true });
    })();
    
