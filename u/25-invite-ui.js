    /* ===== MÃ MỜI (trang user) =====
       Đọc settings/invite_config (Admin > Mã mời): isEnabled + rewards { points | tickets | spins | conThrows: { on, invitee, inviter, from, to } } + maxPerInviter.
       from / to (ms, 0 = không giới hạn): hẹn giờ bật / tắt từng phần thưởng — ngoài giờ thì loại đó không phát.
       Cấu hình cũ chỉ có rewardTickets -> thưởng lượt rút lì xì cho cả 2 bên như trước.
       Giao dịch nhập mã nằm ở AppCore.submitInviteCode (dùng InviteUI.norm / give để tính phần thưởng). */
    (function () {
        'use strict';
        var $ = function (id) { return document.getElementById(id); };
        var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var TYPES = [
            { k: 'points', name: 'Điểm lì xì', icon: '💰', unit: 'điểm', tone: 'var(--color-success)' },
            { k: 'tickets', name: 'Lượt rút lì xì', icon: '🧧', unit: 'lượt rút lì xì', tone: 'var(--color-danger)' },
            { k: 'spins', name: 'Lượt vòng quay', icon: '🎡', unit: 'lượt vòng quay', tone: 'var(--color-warning)' },
            { k: 'conThrows', name: 'Lượt ném còn', icon: '🎯', unit: 'lượt ném còn', tone: '#f97316' }
        ];
        function int(v, d, lo, hi) { v = parseInt(v, 10); if (isNaN(v)) v = d; return Math.min(hi, Math.max(lo, v)); }
        function norm(c) {
            c = c || {};
            var r = c.rewards && typeof c.rewards === 'object' ? c.rewards : null, out = { on: !!c.isEnabled, max: int(c.maxPerInviter, 0, 0, 10000), rewards: {} };
            TYPES.forEach(function (t) {
                if (r) { var x = r[t.k] || {}; out.rewards[t.k] = { on: x.on === true, invitee: int(x.invitee, 0, 0, 1e6), inviter: int(x.inviter, 0, 0, 1e6), from: ms(x.from), to: ms(x.to) }; }
                else if (t.k === 'tickets') { var n = int(c.rewardTickets, 1, 1, 1e6); out.rewards[t.k] = { on: true, invitee: n, inviter: n, from: 0, to: 0 }; }
                else out.rewards[t.k] = { on: false, invitee: 0, inviter: 0, from: 0, to: 0 };
            });
            return out;
        }
        function ms(v) { v = Number(v); return isFinite(v) && v > 0 ? Math.floor(v) : 0; }
        // Hẹn giờ: chỉ phát khi công tắc BẬT và đang trong khoảng [from, to)
        function active(x, now) { now = now || Date.now(); return !!x.on && !(x.from && now < x.from) && !(x.to && now >= x.to); }
        function give(cfg, side, now) { var g = {}; TYPES.forEach(function (t) { var x = cfg.rewards[t.k]; if (active(x, now) && x[side] > 0) g[t.k] = x[side]; }); return g; }
        var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
        function fmtT(t) { var d = new Date(t); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ' ' + p2(d.getDate()) + '/' + p2(d.getMonth() + 1); }
        // Giờ mở sớm nhất của phần thưởng đang chờ (0 = không có), các mốc tắt của phần thưởng đang phát, mốc đổi trạng thái gần nhất
        function sched(cfg, now) {
            now = now || Date.now(); var next = 0, ends = [], marks = [];
            TYPES.forEach(function (t) {
                var x = cfg.rewards[t.k]; if (!x.on || !(x.invitee > 0 || x.inviter > 0)) return;
                if (x.from && now < x.from) { if (!next || x.from < next) next = x.from; marks.push(x.from); }
                else if (x.to && now < x.to) ends.push({ t: t, at: x.to });
                if (x.to && now < x.to) marks.push(x.to);
            });
            return { next: next, ends: ends, nextMark: marks.length ? Math.min.apply(null, marks) : 0 };
        }
        function chips(g) {
            return TYPES.filter(function (t) { return g && Number(g[t.k]) > 0; }).map(function (t) {
                return '<span class="ivu-chip" style="--tone:' + t.tone + '">' + t.icon + ' +' + Number(g[t.k]).toLocaleString('vi-VN') + ' <small>' + esc(t.unit) + '</small></span>';
            }).join('');
        }
        function text(g) {
            return TYPES.filter(function (t) { return g && Number(g[t.k]) > 0; }).map(function (t) { return '+' + Number(g[t.k]).toLocaleString('vi-VN') + ' ' + t.unit; }).join(', ');
        }

        var IV = window.InviteUI = { cfg: norm(null), loaded: false, acc: null, norm: norm, give: give, chips: chips, text: text, TYPES: TYPES, sched: sched, fmtT: fmtT };
        // Tới giờ bật / tắt -> tự vẽ lại (khóa / mở ô nhập, đổi phần thưởng)
        var tmr = 0;
        function arm() {
            clearTimeout(tmr); if (!IV.loaded) return;
            var m = sched(IV.cfg).nextMark; if (!m) return;
            tmr = setTimeout(IV.render, Math.min(Math.max(m - Date.now() + 500, 500), 6 * 3600 * 1000));
        }

        IV.render = function () {
            var c = IV.cfg, info = $('ivu-info'), area = $('invite-input-area'), mine = $('ivu-mine');
            var a = give(c, 'invitee'), b = give(c, 'inviter'), has = Object.keys(a).length || Object.keys(b).length, sc = sched(c);
            var lock = IV.loaded && (!c.on || !has);
            if (info && IV.loaded) {
                if (!c.on) info.innerHTML = '<div class="ivu-off"><i class="fa-solid fa-lock"></i> Hệ thống mã mời đang tạm tắt.</div>';
                else if (!has) info.innerHTML = '<div class="ivu-off"><i class="fa-solid fa-hourglass-half"></i> <span>' + (sc.next ? 'Phần thưởng mã mời mở lúc <b>' + fmtT(sc.next) + '</b>. Hãy quay lại nhé!' : 'Phần thưởng mã mời đang tạm dừng.') + '</span></div>';
                else info.innerHTML = '<p class="text-sm text-muted mb-3">Nhập mã của đồng đội đã mời bạn. Mỗi tài khoản nhập <b>1 lần</b>:</p>' +
                    '<div class="ivu-rows">' +
                    (Object.keys(a).length ? '<div class="ivu-row"><span>🙋 Bạn nhận</span><div class="ivu-chips">' + chips(a) + '</div></div>' : '') +
                    (Object.keys(b).length ? '<div class="ivu-row"><span>🤝 Người mời</span><div class="ivu-chips">' + chips(b) + '</div></div>' : '') +
                    '</div>' +
                    (sc.ends.length ? '<div class="ivu-off"><i class="fa-regular fa-clock"></i> <span>' + sc.ends.map(function (e) { return e.t.icon + ' ' + esc(e.t.name) + ' đến <b>' + fmtT(e.at) + '</b>'; }).join(' · ') + '</span></div>' : '') +
                    (sc.next ? '<div class="ivu-off"><i class="fa-solid fa-hourglass-half"></i> <span>Thêm phần thưởng từ <b>' + fmtT(sc.next) + '</b></span></div>' : '');
            }
            arm();
            if (area) {
                area.classList.toggle('ivu-locked', lock);
                var inp = $('inp-invite-code'); if (inp) inp.disabled = lock;
            }
            if (mine) {
                var n = IV.acc ? (Number(IV.acc.inviteCount) || 0) : 0, h = '';
                if (n > 0) h += '<div>Bạn đã mời <b>' + n.toLocaleString('vi-VN') + '</b> người' + (c.max > 0 ? ' · được thưởng ' + Math.min(Number(IV.acc.inviteRewardCount) || 0, c.max) + '/' + c.max + ' lần' : '') + '</div>';
                if (IV.loaded && c.on && Object.keys(b).length) {
                    var full = c.max > 0 && IV.acc && (Number(IV.acc.inviteRewardCount) || 0) >= c.max;
                    h += full ? '<div>Bạn đã nhận đủ thưởng mời bạn. Cảm ơn bạn! 🎉</div>'
                        : '<div>Mỗi người nhập mã của bạn, bạn nhận:</div><div class="ivu-chips">' + chips(b) + '</div>';
                }
                mine.innerHTML = h;
            }
        };
        // Dữ liệu tài khoản (đăng nhập / đồng bộ realtime)
        IV.onAcc = function (d) {
            if (!d) return;
            IV.acc = d;
            var used = !!d.hasUsedInvite, ia = $('invite-input-area'), sa = $('invite-success-area');
            if (window.State) window.State.hasUsedInvite = used;
            if (ia) ia.style.display = used ? 'none' : 'block';
            if (sa) { sa.style.display = used ? 'block' : 'none'; sa.classList.toggle('hidden', !used); }
            if (used && d.invitedBy) { var t = $('ivu-done-text'); if (t && !IV._justDone) t.innerHTML = 'Bạn đã nhập mã mời của <b>' + esc(d.invitedBy) + '</b>.'; }
            IV.render();
        };
        // Vừa nhập mã thành công
        IV.done = function (r) {
            IV._justDone = true;
            var ia = $('invite-input-area'), sa = $('invite-success-area'), t = $('ivu-done-text'), ch = $('ivu-done-chips');
            if (ia) ia.style.display = 'none';
            if (sa) { sa.style.display = 'block'; sa.classList.remove('hidden'); }
            if (t) t.innerHTML = 'Chúc mừng! Đã nhập mã của <b>' + esc(r.inviter) + '</b>' + (Object.keys(r.gMe).length ? '. Bạn nhận:' : '.');
            if (ch) ch.innerHTML = chips(r.gMe);
            var inp = $('inp-invite-code'); if (inp) inp.value = '';
        };

        function start() {
            if (typeof db === 'undefined' || !db) return;
            try {
                db.collection('settings').doc('invite_config').onSnapshot(function (doc) {
                    IV.cfg = norm(doc.exists ? doc.data() : null); IV.loaded = true; IV.render();
                }, function (e) { console.warn('invite_config', e); });
            } catch (e) { console.warn('InviteUI', e); }
            var inp = $('inp-invite-code');
            if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && window.AppCore && window.AppCore.submitInviteCode) { e.preventDefault(); window.AppCore.submitInviteCode(); } });
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    })();
    
