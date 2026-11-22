    /* ===== QD MODAL EASE: đóng hộp thoại (hồ sơ, cài đặt, túi đồ, kết quả...) không bắt buộc bấm nút X =====
       - Chạm ra vùng tối bên ngoài hộp            -> đóng
       - Vuốt hộp xuống (điện thoại)               -> đóng
       - Nút Quay lại của điện thoại / trình duyệt -> đóng hộp đang mở (không rời trang)
       - Phím Esc (máy tính)                       -> đóng
       Đóng bằng chính nút đóng của hộp (X / Đóng / Hủy) nên mọi xử lý cũ vẫn chạy như bấm tay. */
    (function () {
        'use strict';
        if (window.QDModalEase) return;
        var d = document, W = window;
        var M = W.QDModalEase = { stack: [], skipPop: 0 };

        function isOpen(ov) { return ov.classList.contains('active'); }
        function openList() { return Array.prototype.slice.call(d.querySelectorAll('.modal-overlay.active')); }
        function z(el) { var v = parseInt(getComputedStyle(el).zIndex, 10); return isNaN(v) ? 0 : v; }
        // Hộp đang nằm trên cùng màn hình: z-index cao nhất, bằng nhau thì hộp đứng sau trong trang (trình duyệt vẽ đè lên)
        function top() { var l = openList(), t = null; l.forEach(function (o) { if (!t || z(o) >= z(t)) t = o; }); return t; }
        function innerPop(ov) { var p = ov.querySelector('.ps2-pop.show'); return p || null; }   // bảng xác nhận nằm trong Trạm Quy Đổi

        // Tìm nút đóng của chính hộp đó và bấm hộ
        function closeOv(ov) {
            if (!ov) return false;
            if (innerPop(ov)) { if (W.PointShop && W.PointShop.closePop) W.PointShop.closePop(); return true; }
            var id = ov.id, sels = [
                '[onclick*="closeModal(\'' + id + '\')"]', '.modal-close', '[onclick*="closeResultModal"]', '[onclick*="closeModal()"]',
                '[onclick*="LnTab.close"]', '[onclick*="leaveRoom"]', '.btn-close', '[aria-label="Đóng"]'
            ];
            for (var i = 0; i < sels.length; i++) {
                var b = null; try { b = ov.querySelector(sels[i]); } catch (e) {}
                if (b) { if (!b.disabled) b.click(); return true; }
            }
            if (W.UI && W.UI.closeModal && id) { W.UI.closeModal(id); return true; }
            ov.classList.remove('active'); setTimeout(function () { if (!isOpen(ov)) ov.style.display = 'none'; }, 300);
            return true;
        }
        M.closeTop = function () { return closeOv(top()); };

        /* ---------- 1. Chạm ra ngoài hộp ---------- */
        function isBackdrop(ov, t) {
            if (t === ov) return true;
            var c = ov.firstElementChild;   // hộp phủ kín màn hình (vd. xem ảnh) -> nền của nó cũng là vùng ngoài
            if (t === c) { var r = c.getBoundingClientRect(); return r.width >= innerWidth * 0.95 && r.height >= innerHeight * 0.95; }
            return false;
        }
        var downOn = null;
        d.addEventListener('pointerdown', function (e) { downOn = e.target; }, true);
        d.addEventListener('click', function (e) {
            var t = e.target, started = downOn; downOn = null;
            if (started && started !== t) return;   // kéo bôi chữ từ trong hộp ra ngoài: không đóng
            if (t.classList && t.classList.contains('ps2-pop') && t.classList.contains('show')) { if (W.PointShop) W.PointShop.closePop(); return; }
            var ov = t.closest ? t.closest('.modal-overlay.active') : null;
            if (ov && isBackdrop(ov, t)) closeOv(ov);   // chạm trúng nền của hộp nào thì đóng đúng hộp đó
        });

        /* ---------- 2. Phím Esc ---------- */
        // Chờ các xử lý Esc sẵn có của trang chạy trước; hộp trên cùng vẫn mở (chưa ai đóng) thì mới đóng -> không đóng 2 hộp 1 lúc
        W.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            var t = top(); if (!t || innerPop(t)) return;   // bảng xác nhận trong Trạm Quy Đổi đã có xử lý Esc riêng
            var before = openList().length;
            setTimeout(function () { if (!e.defaultPrevented && isOpen(t) && t === top() && openList().length === before) closeOv(t); }, 0);
        }, true);

        /* ---------- 3. Nút Quay lại (điện thoại / trình duyệt) ---------- */
        function sync() {
            var open = openList();
            open.forEach(function (o) {
                if (M.stack.indexOf(o) >= 0) return;
                M.stack.push(o);
                try { history.pushState({ qdModal: o.id || 1 }, ''); } catch (e) {}
            });
            // hộp vừa đóng bằng nút -> bỏ bước lịch sử đã thêm cho nó
            for (var i = M.stack.length - 1; i >= 0; i--) {
                var o = M.stack[i]; if (isOpen(o)) continue;
                M.stack.splice(i, 1);
                if (history.state && history.state.qdModal) { M.skipPop++; try { history.back(); } catch (e) { M.skipPop--; } }
            }
        }
        var syncT = 0;
        new MutationObserver(function (ms) {
            for (var i = 0; i < ms.length; i++) if (ms[i].target.classList && ms[i].target.classList.contains('modal-overlay')) { clearTimeout(syncT); syncT = setTimeout(sync, 0); return; }
        }).observe(d.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });
        W.addEventListener('popstate', function () {
            if (M.skipPop > 0) { M.skipPop--; return; }
            M.stack = M.stack.filter(isOpen);
            var o = top(); if (!o) return;
            M.stack.splice(M.stack.indexOf(o), 1);
            if (innerPop(o)) {   // còn bảng xác nhận bên trong: đóng bảng đó, giữ hộp + bước lịch sử
                M.stack.push(o); try { history.pushState({ qdModal: o.id || 1 }, ''); } catch (e) {}
                if (W.PointShop) W.PointShop.closePop(); return;
            }
            closeOv(o);
            if (isOpen(o)) { M.stack.push(o); try { history.pushState({ qdModal: o.id || 1 }, ''); } catch (e) {} }   // hộp không cho đóng lúc này (đang xử lý)
        });

        /* ---------- 4. Vuốt xuống để đóng (màn hình cảm ứng) ---------- */
        var drag = null;
        function scrolledInside(el, box) {   // có khung cuộn nào (từ chỗ chạm tới hộp) chưa ở đầu trang?
            for (var n = el; n && n !== box.parentNode; n = n.parentNode) {
                if (n.nodeType !== 1) continue;
                if (n.scrollTop > 0) return true;
            }
            return false;
        }
        d.addEventListener('touchstart', function (e) {
            drag = null;
            if (e.touches.length !== 1) return;
            var t = e.target, ov = t.closest ? t.closest('.modal-overlay.active') : null;
            if (!ov || ov !== top() || t === ov) return;
            if (t.closest('input, textarea, select, [contenteditable="true"], canvas, .ps2-pop.show')) return;
            var box = ov.firstElementChild; if (!box || scrolledInside(t, box)) return;
            drag = { ov: ov, box: box, x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), dy: 0, on: false };
        }, { passive: true });
        d.addEventListener('touchmove', function (e) {
            if (!drag) return;
            if (e.touches.length > 1) { if (drag.on) { drag.dy = 0; endDrag(); } drag = null; return; }   // 2 ngón (phóng to ảnh): bỏ kéo
            var dx = e.touches[0].clientX - drag.x, dy = e.touches[0].clientY - drag.y;
            if (!drag.on) {
                if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
                if (dy <= 0 || Math.abs(dx) > dy) { drag = null; return; }   // vuốt lên / ngang: để cuộn bình thường
                drag.on = true; drag.box.style.transition = 'none';
            }
            drag.dy = Math.max(0, dy);
            drag.box.style.transform = 'translateY(' + drag.dy + 'px)';
            drag.box.style.opacity = String(Math.max(0.4, 1 - drag.dy / 600));
            if (e.cancelable) e.preventDefault();   // không kéo-để-tải-lại trang
        }, { passive: false });
        function endDrag() {
            if (!drag) return; var g = drag; drag = null; if (!g.on) return;
            var fast = g.dy / Math.max(1, Date.now() - g.t) > 0.6, far = g.dy > Math.min(140, g.box.offsetHeight * 0.25);
            g.box.style.transition = 'transform .22s ease, opacity .22s ease';
            if (far || (fast && g.dy > 40)) {
                g.box.style.transform = 'translateY(' + (g.dy + 120) + 'px)'; g.box.style.opacity = '0';
                closeOv(g.ov);
                setTimeout(function () { g.box.style.transition = ''; g.box.style.transform = ''; g.box.style.opacity = ''; if (isOpen(g.ov)) g.box.style.transform = ''; }, 320);
            } else {
                g.box.style.transform = ''; g.box.style.opacity = '';
                setTimeout(function () { g.box.style.transition = ''; }, 240);
            }
        }
        d.addEventListener('touchend', endDrag, { passive: true });
        d.addEventListener('touchcancel', endDrag, { passive: true });

    })();
    
