/* ===== QD SMOOTH: lớp tối ưu mượt mà dùng chung mọi trang =====
   - Giữ luồng chính (main thread) rảnh: hiệu ứng lặp chạy trên GPU, ghi DOM trùng lặp bị bỏ qua
   - Hiệu ứng nằm ngoài màn hình / video nền khuất -> tạm dừng, hiện lại -> chạy tiếp
   - Máy yếu hoặc đo thấy rớt khung hình -> tự bật chế độ nhẹ (html.qd-lite)
   Ép chế độ: localStorage.setItem('qd_fx', 'full' | 'lite' | 'auto') */
(function () {
    'use strict';
    if (window.QDSmooth) return;
    var W = window, d = document, html = d.documentElement, nav = navigator;
    var Q = W.QDSmooth = { lite: false, _cb: [] };
    function store(k, v) { try { if (v === undefined) return (k === 'ss' ? sessionStorage : localStorage).getItem('qd_fx'); (k === 'ss' ? sessionStorage : localStorage).setItem('qd_fx', v); } catch (e) { return null; } }
    var pref = store('ls');

    /* ---------- 1. Chế độ nhẹ ---------- */
    Q.onLite = function (fn) { Q._cb.push(fn); if (Q.lite) { try { fn(true); } catch (e) {} } };
    Q.setLite = function (on) {
        on = !!on; if (Q.lite === on) return;
        Q.lite = on; html.classList.toggle('qd-lite', on); store('ss', on ? 'lite' : 'full');
        Q._cb.forEach(function (fn) { try { fn(on); } catch (e) {} });
    };
    var reduce = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var conn = nav.connection || {};
    var weak = (nav.deviceMemory && nav.deviceMemory <= 2) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2) || conn.saveData === true;
    if (pref !== 'full' && (pref === 'lite' || store('ss') === 'lite' || weak || reduce)) Q.setLite(true);

    /* Đo khung hình thật: 2 lần đo liên tiếp rớt > 22% khung -> bật chế độ nhẹ cho phiên này */
    function monitor() {
        if (pref === 'full' || pref === 'lite' || Q.lite || !W.requestAnimationFrame) return;
        var strikes = 0, runs = 0;
        function sample() {
            if (Q.lite || runs > 40) return;
            if (d.hidden) return setTimeout(sample, 4000);
            runs++;
            var t = [], last = 0, end = performance.now() + 2000;
            requestAnimationFrame(function step(now) {
                if (d.hidden) return setTimeout(sample, 4000);
                if (last) t.push(now - last); last = now;
                if (now < end) return requestAnimationFrame(step);
                if (t.length < 20) return setTimeout(sample, 8000);
                var s = t.slice().sort(function (a, b) { return a - b; });
                var vsync = Math.max(6.5, s[Math.floor(s.length * 0.1)]);   // ~8.3ms ở màn 120Hz, ~16.7ms ở 60Hz
                var bad = 0; t.forEach(function (x) { if (x > vsync * 1.8) bad++; });
                strikes = bad / t.length > 0.22 ? strikes + 1 : 0;
                if (strikes >= 2) return Q.setLite(true);
                setTimeout(sample, strikes ? 1500 : 12000);
            });
        }
        setTimeout(sample, 5000);
    }

    /* ---------- 2. Bỏ qua ghi chữ trùng lặp (đồng hồ, bộ đếm... ghi mỗi giây) ---------- */
    function guardText(proto, prop, noNewline) {
        var desc = Object.getOwnPropertyDescriptor(proto, prop);
        if (!desc || !desc.set || !desc.get || desc.set.__qd) return;
        var set = function (v) {
            var c = this.firstChild, s = v == null ? '' : String(v);
            if (c ? (c === this.lastChild && c.nodeType === 3 && c.data === s && !(noNewline && /[\r\n]/.test(s))) : (s === '' && this.nodeType === 1)) return;
            desc.set.call(this, v);
        };
        set.__qd = true;
        Object.defineProperty(proto, prop, { configurable: true, enumerable: desc.enumerable, get: desc.get, set: set });
    }
    try { guardText(Node.prototype, 'textContent'); guardText(HTMLElement.prototype, 'innerText', true); } catch (e) {}

    /* Ghi innerHTML chỉ khi nội dung thay đổi (dùng cho các vòng cập nhật định kỳ) */
    Q.html = function (el, s) {
        if (!el) return;
        s = s == null ? '' : String(s);
        if (el.__qdH === s && el.__qdF === el.firstChild && el.__qdL === el.lastChild) return;
        el.innerHTML = s; el.__qdH = s; el.__qdF = el.firstChild; el.__qdL = el.lastChild;
    };

    /* ---------- 3. Tạm dừng hiệu ứng lặp khi khuất màn hình ---------- */
    var MOVE = /^(transform|translate|rotate|scale|left|top|right|bottom|offset|inset|margin)/;
    var io = W.IntersectionObserver ? new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.target.classList.toggle(e.target.__qdM, !e.isIntersecting); });
    }, { rootMargin: '120px' }) : null;
    var seen = new WeakSet(), seenPx = new WeakSet();
    function moves(a) {   // hiệu ứng tự di chuyển phần tử (hoa rơi...) thì không dừng, tránh kẹt ngoài màn hình
        try { var k = a.effect.getKeyframes(); for (var i = 0; i < k.length; i++) for (var p in k[i]) if (MOVE.test(p)) return true; } catch (e) { return true; }
        return false;
    }
    function scan() {
        if (!io || !d.getAnimations || d.hidden) return;
        var as = d.getAnimations();
        for (var i = 0; i < as.length; i++) {
            var ef = as[i].effect, el = ef && ef.target;
            if (!el || !ef.getTiming || ef.getTiming().iterations !== Infinity) continue;
            var bag = ef.pseudoElement ? seenPx : seen;
            if (bag.has(el)) continue;
            bag.add(el);
            var own = el.getAnimations ? el.getAnimations() : [], mv = false;
            for (var j = 0; j < own.length; j++) if (moves(own[j])) { mv = true; break; }
            if (mv && !ef.pseudoElement) continue;          // chỉ có hiệu ứng di chuyển: để nguyên
            if (el.__qdM === 'qd-paused') continue;
            el.__qdM = mv ? 'qd-paused-px' : 'qd-paused';   // có di chuyển: chỉ dừng ::before/::after
            io.observe(el);
        }
    }

    /* ---------- 4. Video nền: dừng khi khuất / ẩn tab, chạy lại khi hiện ---------- */
    var vio = W.IntersectionObserver ? new IntersectionObserver(function (es) {
        es.forEach(function (e) {
            var v = e.target; v.__qdVis = e.isIntersecting;
            if (!e.isIntersecting) { if (!v.paused) { v.__qdAuto = true; v.pause(); } }
            else if (v.__qdAuto) { v.__qdAuto = false; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        });
    }, { rootMargin: '80px' }) : null;
    function watchMedia(root) {
        var imgs = root.getElementsByTagName ? root.getElementsByTagName('img') : [];
        for (var i = 0; i < imgs.length; i++) if (!imgs[i].getAttribute('decoding')) imgs[i].decoding = 'async';
        if (!vio) return;
        var vs = root.getElementsByTagName ? root.getElementsByTagName('video') : [];
        for (var j = 0; j < vs.length; j++) {
            var v = vs[j]; if (v.__qdW || !v.muted && !v.hasAttribute('muted') || (v.closest && v.closest('#qd-call, #qd-gcall, #qvm-studio'))) continue;   // khung gọi video / gọi nhóm: không tự dừng
            v.__qdW = true; vio.observe(v);
            v.addEventListener('play', function () { var me = this; if (me.__qdVis === false) setTimeout(function () { if (me.__qdVis === false && !me.paused) { me.__qdAuto = true; me.pause(); } }, 0); });
        }
    }

    /* ---------- Khởi động ---------- */
    var scanT = 0;
    function later() { clearTimeout(scanT); scanT = setTimeout(function () { scan(); }, 400); }
    function boot() {
        watchMedia(d);
        scan(); setInterval(scan, 3000);
        if (W.MutationObserver) new MutationObserver(function (ms) {
            for (var i = 0; i < ms.length; i++) for (var j = 0, n = ms[i].addedNodes; j < n.length; j++) {
                var x = n[j]; if (x.nodeType !== 1) continue;
                if (x.tagName === 'IMG' || x.tagName === 'VIDEO' || x.firstElementChild) watchMedia(x.tagName === 'IMG' || x.tagName === 'VIDEO' ? x.parentNode || d : x);
            }
            later();
        }).observe(d.body, { childList: true, subtree: true });
        d.addEventListener('visibilitychange', function () { if (!d.hidden) later(); });
        monitor();
    }
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})();
    
