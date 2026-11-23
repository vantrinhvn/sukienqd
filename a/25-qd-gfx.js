    window.QDGfx = (function () {
        'use strict';
        var W = window, d = document, html = d.documentElement, nav = navigator;
        if (W.QDGfx) return W.QDGfx;
        var LEVELS = ['low', 'mid', 'high'];
        var INFO = {
            auto: ['⚡', 'Tự động', 'Tự cân bằng theo máy, mạng, pin và FPS thực tế'],
            high: ['✨', 'Cao', 'Đầy đủ: hoa rơi, kính mờ, ánh sáng, chuyển động'],
            mid: ['⚖️', 'Cân bằng', 'Bỏ kính mờ, bớt hoa rơi — mượt hơn, vẫn đẹp'],
            low: ['🍃', 'Tiết kiệm', 'Tắt hiệu ứng lặp, bóng đổ, hoa rơi; video không tự chạy. Hợp máy yếu, mạng chậm, tiết kiệm pin']
        };
        var NAME = { high: 'Cao', mid: 'Cân bằng', low: 'Tiết kiệm' };
        function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
        var choice = /^(auto|high|mid|low)$/.test(ls('qd_gfx') || '') ? ls('qd_gfx') : 'auto';
        var ceil = 'high', why = [], level = null, fps = 0, jank = 0, battLow = false, subs = [], ups = 0;

        /* ---------- Mức tối đa máy + mạng chịu được ---------- */
        function detect() {
            var c = nav.connection || nav.mozConnection || nav.webkitConnection || {}, et = c.effectiveType || '', mem = nav.deviceMemory || 0, cores = nav.hardwareConcurrency || 0;
            var reduce = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;
            var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '');
            why = []; var lv = 2;
            if (cores) why.push(cores + ' nhân'); if (mem) why.push(mem + ' GB RAM'); why.push(et ? 'mạng ' + et.toUpperCase() : 'mạng ?');
            if (reduce) { lv = 0; why.push('máy bật giảm chuyển động'); }
            if (c.saveData) { lv = 0; why.push('đang tiết kiệm dữ liệu'); }
            if (/^(slow-2g|2g)$/.test(et)) lv = 0; else if (et === '3g') lv = Math.min(lv, 1);
            if ((mem && mem <= 2) || (cores && cores <= 2)) lv = 0; else if ((mem && mem <= 4) || (cores && cores <= 4) || (mobile && !mem && !cores)) lv = Math.min(lv, 1);
            if (battLow) { lv = 0; why.push('pin yếu'); }
            ceil = LEVELS[lv];
        }
        function apply(lv, from) {
            if (!NAME[lv]) lv = 'mid';
            if (lv === level) return;
            level = lv; html.setAttribute('data-gfx', lv); ls('qd_gfx_eff', lv);
            try { if (W.QDSmooth && W.QDSmooth.setLite) W.QDSmooth.setLite(lv === 'low'); } catch (e) {}   // QD Smooth cũ: chế độ nhẹ = Tiết kiệm
            videos();
            subs.forEach(function (f) { try { f(lv, from); } catch (e) {} });
            draw();
        }
        function want() { return choice === 'auto' ? ceil : choice; }

        /* ---------- Video tự chạy: Tiết kiệm / mạng chậm thì không tự phát ---------- */
        function videos() {
            Array.prototype.forEach.call(d.querySelectorAll('video[autoplay], video[muted], video.hero-video'), function (v) {
                if (level === 'low') { if (!v.paused) { v.__qgPaused = true; try { v.pause(); } catch (e) {} } v.preload = 'none'; }
                else if (v.__qgPaused) { v.__qgPaused = false; try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
            });
        }

        /* ---------- Đo FPS thật ---------- */
        function sample(cb) {
            if (!W.requestAnimationFrame) return;
            var t = [], last = 0, end = performance.now() + 2000;
            requestAnimationFrame(function step(now) {
                if (d.hidden) return cb(null);
                if (last) t.push(now - last); last = now;
                if (now < end) return requestAnimationFrame(step);
                if (t.length < 15) return cb(null);
                var s = t.slice().sort(function (a, b) { return a - b; }), vs = Math.max(6.5, s[Math.floor(s.length * .1)]), bad = 0, sum = 0;
                t.forEach(function (x) { sum += x; if (x > vs * 1.8) bad++; });
                cb({ fps: Math.round(1000 / (sum / t.length)), jank: bad / t.length, hz: Math.round(1000 / vs) });
            });
        }
        var strikes = 0, good = 0, mon = 0;
        function monitor() {
            clearTimeout(mon);
            mon = setTimeout(function () {
                if (d.hidden) return monitor();
                sample(function (r) {
                    if (r) {
                        fps = r.fps; jank = r.jank; draw();
                        if (choice === 'auto') {
                            var i = LEVELS.indexOf(level);
                            if (r.jank > .2 || r.fps < Math.min(45, r.hz * .75)) { good = 0; if (++strikes >= 2 && i > 0) { strikes = 0; apply(LEVELS[i - 1], 'fps'); } }
                            else if (r.jank < .05) { strikes = 0; if (++good >= 6 && i < LEVELS.indexOf(ceil) && ups < 2) { good = 0; ups++; apply(LEVELS[i + 1], 'fps'); } }
                            else { strikes = 0; good = 0; }
                        }
                    }
                    monitor();
                });
            }, panelOpen() ? 600 : (strikes ? 2500 : 9000));
        }

        /* ---------- Khung chọn trong Cài đặt ---------- */
        function panelOpen() { return Array.prototype.some.call(d.querySelectorAll('[data-qd-gfx-panel]'), function (p) { return p.offsetParent !== null; }); }
        function render(box) {
            box.innerHTML = '<div class="qg"><div class="qg-opts" role="radiogroup" aria-label="Mức đồ họa">' + ['auto', 'high', 'mid', 'low'].map(function (k) {
                var i = INFO[k]; return '<button type="button" class="qg-opt" role="radio" data-qg="' + k + '"><span class="e">' + i[0] + '</span><span><b>' + i[1] + '</b><small>' + i[2] + '</small></span><span class="ck"></span></button>';
            }).join('') + '</div><div class="qg-stat"><span class="qg-fps">– FPS</span><span class="qg-why"></span></div></div>';
            box.addEventListener('click', function (e) { var b = e.target.closest('[data-qg]'); if (b) set(b.getAttribute('data-qg')); });
        }
        function draw() {
            Array.prototype.forEach.call(d.querySelectorAll('[data-qd-gfx-panel]'), function (box) {
                if (!box.firstChild) render(box);
                Array.prototype.forEach.call(box.querySelectorAll('.qg-opt'), function (b) { var on = b.getAttribute('data-qg') === choice; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
                var f = box.querySelector('.qg-fps'); if (f) { f.textContent = fps ? fps + ' FPS' : '– FPS'; f.className = 'qg-fps' + (!fps ? '' : jank > .2 || fps < 40 ? ' bad' : jank > .06 || fps < 55 ? ' mid' : ''); }
                var w = box.querySelector('.qg-why');
                if (w) w.innerHTML = (choice === 'auto' ? 'Tự động đang dùng <b>' + NAME[level] + '</b>' + (level !== ceil ? ' (hạ vì FPS thấp)' : '') : 'Đang dùng <b>' + NAME[level] + '</b>') + ' · ' + why.join(' · ');
            });
        }
        function set(k) {
            if (!INFO[k]) return; choice = k; ls('qd_gfx', k); strikes = 0; good = 0; ups = 0;
            ls('qd_fx', k === 'auto' ? 'auto' : k === 'low' ? 'lite' : 'full');   // QD Smooth cũ
            apply(want(), 'user'); draw(); monitor();
            try { if (W.Utils && W.Utils.toast) W.Utils.toast(INFO[k][0] + ' Mức đồ họa: ' + INFO[k][1] + (k === 'auto' ? ' (' + NAME[level] + ')' : ''), 'success'); } catch (e) {}
        }

        /* ---------- Hộp nổi cho trang không có Cài đặt ---------- */
        function popover() {
            var p = d.getElementById('qg-pop');
            if (!p) {
                p = d.createElement('div'); p.id = 'qg-pop'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Mức đồ họa');
                p.innerHTML = '<div class="qg-card"><h3>🎛️ Mức đồ họa <button type="button" aria-label="Đóng">×</button></h3><div data-qd-gfx-panel></div></div>';
                p.addEventListener('click', function (e) { if (e.target === p || e.target.closest('h3 button')) { p.classList.remove('on'); } });
                d.addEventListener('keydown', function (e) { if (e.key === 'Escape') p.classList.remove('on'); });
                d.body.appendChild(p);
            }
            p.classList.add('on'); draw(); monitor();
        }

        /* ---------- Khởi động ---------- */
        detect();
        if (nav.getBattery) nav.getBattery().then(function (b) {
            var chk = function () { var was = battLow; battLow = !b.charging && b.level <= .2; if (was !== battLow) { detect(); if (choice === 'auto') apply(want(), 'battery'); } };
            b.addEventListener('levelchange', chk); b.addEventListener('chargingchange', chk); chk();
        }).catch(function () {});
        var cn = nav.connection; if (cn && cn.addEventListener) cn.addEventListener('change', function () { detect(); if (choice === 'auto') apply(want(), 'net'); });
        apply(want(), 'boot');
        try { if (W.QDSmooth && W.QDSmooth.onLite) W.QDSmooth.onLite(function (on) { if (on && choice === 'auto' && level === 'high') apply('mid', 'fps'); }); } catch (e) {}
        d.addEventListener('visibilitychange', function () { html.classList.toggle('qd-hidden', d.hidden); if (!d.hidden) monitor(); });
        if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { videos(); draw(); }); else { videos(); draw(); }
        setTimeout(monitor, 4000);
        var wasOpen = false;   // mở Cài đặt -> đo FPS nhanh hơn để hiện số trực tiếp (chỉ kiểm tra khi trang có khung chọn)
        setInterval(function () { if (d.hidden || !d.querySelector('[data-qd-gfx-panel]')) return; var o = panelOpen(); if (o && !wasOpen) { draw(); monitor(); } wasOpen = o; }, 1500);
        d.addEventListener('play', function (e) { var v = e.target; if (level === 'low' && v && v.tagName === 'VIDEO' && (v.muted || v.classList.contains('hero-video'))) { v.__qgPaused = true; try { v.pause(); } catch (er) {} } }, true);

        return { set: set, level: function () { return level; }, choice: function () { return choice; }, on: function (f) { subs.push(f); }, popover: popover, draw: draw };
    })();
    
