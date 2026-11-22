    window.QDGift = (function () {
        'use strict';
        var W = window, d = document, VN = 7 * 3600e3;
        var ITEMS = [['points', '💰', 'Điểm lì xì'], ['tickets', '🧧', 'Lượt rút lì xì'], ['spins', '🎡', 'Lượt vòng quay'], ['conThrows', '🎯', 'Lượt ném còn']];
        var ALL = [], READY = [], claimed = {}, checking = {}, acc = null, user = '', docId = '', unsub = null, tmr = 0, cur = null, busy = false;
        function db() { return firebase.firestore(); }
        function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        function fmt(ts) { var x = new Date(ts + VN); return pad(x.getUTCHours()) + ':' + pad(x.getUTCMinutes()) + ' ' + pad(x.getUTCDate()) + '/' + pad(x.getUTCMonth() + 1); }
        function cid(g) { return g.id + '__' + docId; }
        function open(g, now) {
            now = now || Date.now();
            return g.enabled !== false && now >= (g.startAt || 0) && now <= (g.endAt || 0) && !(g.maxClaims && (g.claimCount || 0) >= g.maxClaims)
                && !(g.who === 'old' && acc && +acc.created_at && +acc.created_at >= g.startAt) && Object.keys(g.items || {}).some(function (k) { return +g.items[k] > 0; });
        }

        /* ---------- Giao diện: nút nổi + băng ở Trang Chủ ---------- */
        function ui() {
            var fab = d.getElementById('qd-gift-fab'), ban = d.getElementById('qd-gift-banner');
            if (!fab) {
                fab = d.createElement('button'); fab.type = 'button'; fab.id = 'qd-gift-fab'; fab.setAttribute('aria-label', 'Mở quà từ Ban Quản Trị');
                fab.innerHTML = '🎁<span class="n">1</span><span class="t">Nhận quà</span>'; fab.onclick = function () { show(); }; d.body.appendChild(fab);
            }
            if (!ban) {
                var dash = d.getElementById('view-dashboard');
                if (dash) {
                    ban = d.createElement('div'); ban.id = 'qd-gift-banner'; ban.setAttribute('role', 'button'); ban.tabIndex = 0;
                    ban.innerHTML = '<span class="i">🎁</span><span class="x"><b id="gfb-t"></b><small id="gfb-s"></small></span><span class="go">Mở quà ›</span>';
                    ban.onclick = function () { show(); }; ban.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } };
                    dash.insertBefore(ban, dash.firstChild);
                }
            }
            var n = READY.length, on = n > 0 && !!user;
            fab.classList.toggle('on', on); fab.querySelector('.n').textContent = n; fab.querySelector('.n').style.display = n > 1 ? '' : 'none';
            if (ban) {
                ban.classList.toggle('on', on);
                if (on) {
                    d.getElementById('gfb-t').textContent = n > 1 ? 'Bạn có ' + n + ' món quà từ Ban Quản Trị!' : 'Ban Quản Trị gửi bạn 1 món quà!';
                    d.getElementById('gfb-s').textContent = (READY[0].icon || '🎁') + ' ' + (READY[0].title || 'Quà') + ' · nhận trước ' + fmt(READY[0].endAt);
                }
            }
        }

        /* ---------- Tính quà đang nhận được ---------- */
        function recompute() {
            clearTimeout(tmr);
            var now = Date.now(), next = Infinity;
            ALL.forEach(function (g) { if (g.startAt > now) next = Math.min(next, g.startAt); if (g.endAt > now) next = Math.min(next, g.endAt + 1000); });
            if (next < Infinity && next - now < 864e5) tmr = setTimeout(recompute, Math.max(1000, next - now));   // tới giờ mở / đóng quà thì tự cập nhật
            var cand = ALL.filter(function (g) { return open(g, now); });
            cand.forEach(function (g) {
                var k = cid(g);
                if (claimed[k] !== undefined || checking[k]) return;
                checking[k] = 1;
                db().collection('gift_claims').doc(k).get().then(function (s) { claimed[k] = s.exists; checking[k] = 0; recompute(); }, function () { checking[k] = 0; });
            });
            READY = cand.filter(function (g) { return claimed[cid(g)] === false; }).sort(function (a, b) { return (a.endAt || 0) - (b.endAt || 0); });
            ui();
            var ov = d.getElementById('qd-gift'), bt = d.getElementById('gf-btn');   // đang xem quà vừa mở: cập nhật nút "Mở quà tiếp theo"
            if (ov && bt && !busy && ov.classList.contains('opened')) bt.textContent = READY.length ? 'Mở quà tiếp theo (' + READY.length + ') ›' : 'Tuyệt vời! 🎉';
        }
        function startFor(u, id) {
            if (unsub) { unsub(); unsub = null; }
            user = u; docId = id; ALL = []; READY = []; claimed = {}; checking = {}; acc = null; ui();
            if (!u) return;
            db().collection('accounts').doc(id).get().then(function (s) { acc = s.exists ? s.data() : {}; recompute(); }, function () { acc = {}; });
            unsub = db().collection('gifts').where('enabled', '==', true).onSnapshot(function (snap) {
                ALL = snap.docs.map(function (x) { var g = x.data(); g.id = x.id; return g; }); recompute();
                if (cur) { var c = ALL.filter(function (g) { return g.id === cur.id; })[0]; if (c && !busy && !d.getElementById('qd-gift').classList.contains('opened')) cur = c; }
            }, function (e) { console.warn('[Quà]', e && e.message); });
        }
        setInterval(function () { var S = W.State || {}, u = S.currentUser || '', id = S.currentDocId || ''; if (u !== user || (u && id !== docId)) startFor(u, id); }, 1000);

        /* ---------- Hộp mở quà ---------- */
        function build() {
            var ov = d.getElementById('qd-gift'); if (ov) return ov;
            ov = d.createElement('div'); ov.id = 'qd-gift'; ov.className = 'modal-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'gf-h');
            ov.innerHTML = '<div class="gf-wrap"><button type="button" class="gf-x" aria-label="Đóng" onclick="QDGift.close()">×</button>'
                + '<span class="gf-from">🎉 Quà từ Ban Quản Trị</span><h3 id="gf-h"></h3><p class="gf-msg" id="gf-m"></p>'
                + '<div class="gf-stage"><div class="gf-rays"></div><div class="gbox" id="gf-box" title="Chạm để mở quà"><div class="glow"></div><div class="lid"><div class="bow"></div></div><div class="body"></div></div><div class="gf-items" id="gf-its"></div></div>'
                + '<div class="gf-tip" id="gf-tip"></div><button type="button" class="gf-btn" id="gf-btn">🎁 Mở quà</button><div class="gf-time" id="gf-time"></div></div>';
            d.body.appendChild(ov);
            d.getElementById('gf-box').onclick = function () { if (!ov.classList.contains('opened')) openGift(); };
            d.getElementById('gf-btn').onclick = function () { if (ov.classList.contains('opened')) next(); else openGift(); };
            new MutationObserver(function () { d.body.classList.toggle('gf-open', ov.classList.contains('active')); if (!ov.classList.contains('active')) stopConfetti(); }).observe(ov, { attributes: true, attributeFilter: ['class'] });
            return ov;
        }
        function reset(g) {
            var ov = build(); cur = g; busy = false;
            ov.classList.remove('opened', 'shake');
            d.getElementById('gf-h').textContent = (g.icon || '🎁') + ' ' + (g.title || 'Quà tặng');
            d.getElementById('gf-m').textContent = g.msg || 'Chúc bạn năm mới an khang thịnh vượng!';
            d.getElementById('gf-its').innerHTML = '';
            d.getElementById('gf-tip').textContent = 'Chạm vào hộp quà để mở';
            var b = d.getElementById('gf-btn'); b.disabled = false; b.textContent = '🎁 Mở quà';
            d.getElementById('gf-time').textContent = 'Nhận trước ' + fmt(g.endAt) + (g.maxClaims ? ' · còn ' + Math.max(0, g.maxClaims - (g.claimCount || 0)) + ' phần' : '');
            var box = d.getElementById('gf-box'), nb = box.cloneNode(true); nb.onclick = box.onclick; box.parentNode.replaceChild(nb, box);   // chạy lại hiệu ứng từ đầu
        }
        function show(g) {
            g = g || READY[0]; if (!g) return;
            if (W.QDEmbed && W.QDEmbed.isOpen()) W.QDEmbed.close();
            reset(g); W.UI.openModal('qd-gift');
            setTimeout(function () { var b = d.getElementById('gf-btn'); if (b) b.focus(); }, 80);
        }
        function close() { if (W.UI) W.UI.closeModal('qd-gift'); }

        var GIFT_ERR = { GONE: 'Món quà này đã bị Ban Quản Trị thu hồi.', OFF: 'Quà đang tạm tắt.', EARLY: 'Chưa tới giờ mở quà.', LATE: 'Đã hết giờ nhận quà.',
            FULL: 'Tiếc quá, quà đã được nhận hết!', BLOCKED: 'Tài khoản đang bị khóa.', OLD_ONLY: 'Quà này dành cho tài khoản tạo trước lúc mở quà.', EMPTY: 'Quà chưa có vật phẩm.' };
        async function claim(g) {   // máy chủ kiểm tra giờ / số lượng / đối tượng rồi cộng vật phẩm (1 lần mỗi người)
            try { return (await W.QDdb.play('gift.claim', { id: g.id })).items; }
            catch (e) { var c = e && e.code; if (c === 'DA_NHAN') throw new Error('DA_NHAN'); if (GIFT_ERR[c]) throw new Error(GIFT_ERR[c]); throw e; }
        }
        async function openGift() {
            var ov = d.getElementById('qd-gift'), g = cur; if (!g || busy) return;
            busy = true; sound('tap');
            var b = d.getElementById('gf-btn'); b.disabled = true; b.textContent = 'Đang mở quà…'; d.getElementById('gf-tip').textContent = '✨ ✨ ✨';
            ov.classList.add('shake');
            var t0 = Date.now(), items = null, err = null;
            try { items = await claim(g); } catch (e) { err = e; }
            await new Promise(function (r) { setTimeout(r, Math.max(0, 1100 - (Date.now() - t0))); });   // cho hộp rung đủ lâu
            ov.classList.remove('shake');
            claimed[cid(g)] = true; recompute();
            if (err) {
                busy = false; b.disabled = false;
                if (err.message === 'DA_NHAN') { d.getElementById('gf-tip').textContent = 'Bạn đã nhận món quà này rồi 😊'; b.textContent = READY.length ? 'Mở quà tiếp theo ›' : 'Đóng'; ov.classList.add('opened'); }
                else { d.getElementById('gf-tip').textContent = '⚠️ ' + (err.message || 'Không mở được quà, thử lại.'); b.textContent = '🎁 Thử lại'; claimed[cid(g)] = undefined; recompute(); }
                return;
            }
            ov.classList.add('opened'); sound('win'); confetti();
            var box = d.getElementById('gf-its'), its = ITEMS.filter(function (it) { return items[it[0]]; });
            box.innerHTML = its.map(function (it) { return '<div class="gf-it"><i>' + it[1] + '</i><b data-n="' + items[it[0]] + '">+0</b><span>' + it[2] + '</span></div>'; }).join('');
            Array.prototype.forEach.call(box.children, function (el, i) {
                setTimeout(function () { el.classList.add('show'); count(el.querySelector('b')); }, 380 + i * 260);
            });
            d.getElementById('gf-tip').textContent = '🎉 Đã cộng vào tài khoản của bạn!';
            b.disabled = false; b.textContent = READY.length ? 'Mở quà tiếp theo (' + READY.length + ') ›' : 'Tuyệt vời! 🎉';
            busy = false;
            try { if (W.Utils && W.Utils.toast) setTimeout(function () { W.Utils.toast('🎁 Đã nhận quà "' + (g.title || '') + '"', 'success'); }, 900); } catch (e) {}
        }
        function next() { if (READY.length) reset(READY[0]); else close(); }
        function count(el) {
            var n = +el.getAttribute('data-n'), t0 = performance.now(), dur = 900;
            (function step(t) { var k = Math.min(1, (t - t0) / dur), v = Math.round(n * (1 - Math.pow(1 - k, 3))); el.textContent = '+' + v.toLocaleString('vi-VN'); if (k < 1) requestAnimationFrame(step); })(t0);
        }

        /* ---------- Pháo giấy ---------- */
        var cv = null, raf = 0;
        function confetti() {
            if (W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            var ov = d.getElementById('qd-gift'); stopConfetti();
            cv = d.createElement('canvas'); ov.appendChild(cv);
            var dpr = Math.min(2, W.devicePixelRatio || 1), w = innerWidth, h = innerHeight, ctx = cv.getContext('2d');
            cv.width = w * dpr; cv.height = h * dpr; ctx.scale(dpr, dpr);
            var cols = ['#ffd54a', '#fff6c8', '#ff4a58', '#ff9ec4', '#f2b705', '#ffffff', '#4ade80'], P = [], cx = w / 2, cy = h * 0.42;
            for (var i = 0; i < 160; i++) { var a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 9; P.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, r: 4 + Math.random() * 6, c: cols[i % cols.length], rot: Math.random() * 6, vr: (Math.random() - .5) * .4, life: 1, shape: i % 3 }); }
            var t0 = performance.now();
            (function step(t) {
                ctx.clearRect(0, 0, w, h); var alive = 0;
                P.forEach(function (p) {
                    p.vy += 0.22; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; if (t - t0 > 1600) p.life -= 0.02;
                    if (p.life <= 0 || p.y > h + 20) return; alive++;
                    ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
                    if (p.shape === 0) ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); else if (p.shape === 1) { ctx.beginPath(); ctx.arc(0, 0, p.r / 1.6, 0, 7); ctx.fill(); } else { ctx.font = (p.r * 3) + 'px serif'; ctx.fillText(['🌸', '🧧', '✨'][Math.floor(p.r) % 3], 0, 0); }
                    ctx.restore();
                });
                if (alive) raf = requestAnimationFrame(step); else stopConfetti();
            })(t0);
        }
        function stopConfetti() { cancelAnimationFrame(raf); if (cv) { cv.remove(); cv = null; } }

        /* ---------- Âm thanh (tạo sẵn, không cần file) ---------- */
        var actx = null;
        function sound(kind) {
            try {
                var AC = W.AudioContext || W.webkitAudioContext; if (!AC) return; actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
                var t0 = actx.currentTime + 0.02, notes = kind === 'win' ? [[523, 0], [659, .1], [784, .2], [1047, .32], [1319, .46]] : [[880, 0], [1175, .06]];
                notes.forEach(function (n) {
                    var o = actx.createOscillator(), g = actx.createGain(), t = t0 + n[1];
                    o.type = kind === 'win' ? 'triangle' : 'sine'; o.frequency.setValueAtTime(n[0], t);
                    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'win' ? 0.3 : 0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'win' ? 0.6 : 0.25));
                    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.65);
                });
            } catch (e) {}
        }

        return { show: show, close: close, list: function () { return READY.slice(); } };
    })();
    
