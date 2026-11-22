    /* ===== 🎬 VIDEO CHIA SẺ: đọc settings/video_share (Admin > Chia sẻ video) -> thẻ trang chủ + mục Video + trình phát ===== */
    window.QDVideo = (function () {
        var d = document, $ = function (id) { return d.getElementById(id); }, H = window.qdH, ITEMS = [], LIST = [], idx = -1, filter = '', started = false, musicWas = false;
        function me() { try { return (window.State && State.currentUser) || ''; } catch (e) { return ''; } }
        function seenKey() { return 'qd_vid_seen_' + me(); }
        function lastSeen() { try { return +localStorage.getItem(seenKey()) || 0; } catch (e) { return 0; } }
        function markSeen() { var L = all(); if (!L.length) return; try { localStorage.setItem(seenKey(), String(Math.max.apply(null, L.map(function (x) { return x.createdAt || 0; })))); } catch (e) {} renderTab(); }
        function all() { return ITEMS.filter(function (x) { return x && !x.hidden && x.id && (x.p === 'youtube' || x.p === 'tiktok'); }).sort(function (a, b) { return (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0); }); }
        function ago(t) { var s = (Date.now() - (t || 0)) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' phút trước'; if (s < 86400) return Math.round(s / 3600) + ' giờ trước'; if (s < 86400 * 30) return Math.round(s / 86400) + ' ngày trước'; var x = new Date(t); return x.getDate() + '/' + (x.getMonth() + 1) + '/' + x.getFullYear(); }
        function img(it) { var u = QDVid.thumb(it); return u ? '<img src="' + H(u) + '" alt="" loading="lazy" referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()">' : ''; }
        function renderTab() {
            var tab = $('vid-tab'); if (!tab) return;
            var L = all(), show = !!me(), was = tab.style.display !== 'none';
            tab.style.display = show ? '' : 'none';
            if (show && !L.length) { $('vid-tab-sub').textContent = 'Chưa có video'; $('vid-mini').innerHTML = '<i class="vid-mini-play">＋</i>'; $('vid-tab-go').textContent = 'Chia sẻ video đầu tiên ›'; }
            if (show && L.length) {
                var nNew = L.filter(function (x) { return (x.createdAt || 0) > lastSeen(); }).length;
                $('vid-tab-sub').textContent = nNew ? nNew + ' video mới' : L.length + ' video';
                var newest = L.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })[0];
                $('vid-mini').innerHTML = img(newest) + (nNew ? '<span class="vid-new">MỚI</span>' : '') + '<i class="vid-mini-play">▶</i>';
                $('vid-tab-go').textContent = nNew ? 'Có video mới — chạm để xem ›' : 'Chạm để xem ›';
            }
            if (was !== show) try { window.dispatchEvent(new Event('resize')); } catch (e) {}   // xếp lại lưới thẻ trang chủ
            var nb = d.querySelector('.nav-item[data-nv="videos"] .nv-badge');
            if (nb) { var n = show ? L.filter(function (x) { return (x.createdAt || 0) > lastSeen(); }).length : 0; nb.hidden = !n; nb.textContent = n || ''; }
        }
        function renderGrid() {
            var g = $('vid-grid'); if (!g) return;
            var A = all(); LIST = A.filter(function (x) { return !filter || x.p === filter; });
            var both = A.some(function (x) { return x.p === 'youtube'; }) && A.some(function (x) { return x.p === 'tiktok'; });
            $('vid-tabs').hidden = !both; if (!both && filter) { filter = ''; return renderGrid(); }
            var seen = lastSeen();
            g.innerHTML = LIST.length ? LIST.map(function (it, i) {
                return '<button type="button" class="vid-card" data-i="' + i + '" aria-label="Xem video ' + H(it.title || '') + '">' +
                    '<span class="vid-th' + (it.v ? ' v' : '') + '">' + img(it) + ((it.createdAt || 0) > seen ? '<span class="vid-new">MỚI</span>' : '') + '<i class="vid-mini-play">▶</i><span class="vid-pf ' + (it.p === 'tiktok' ? 'tiktok' : '') + '">' + QDVid.name(it.p) + '</span></span>' +
                    '<span class="vid-in"><b>' + (it.pin ? '📌 ' : '') + H(it.title || 'Video') + '</b>' + (it.desc ? '<span class="vid-ds">' + H(it.desc) + '</span>' : '') + '<small>' + ago(it.createdAt) + (it.src === 'user' && it.byName ? ' · 👤 ' + H(it.byName) : (it.author ? ' · ' + H(it.author) : '')) + '</small></span></button>';
            }).join('') : '<div class="vid-empty">' + (A.length ? 'Không có video nào ở mục này.' : 'Chưa có video nào được chia sẻ. Quay lại sau nhé! 🎬') + '</div>';
        }
        function render() { renderTab(); renderGrid(); }
        function openList() { try { UI.navigate('videos'); } catch (e) {} try { window.scrollTo(0, 0); } catch (e) {} }
        function music(pause) { try { if (pause) QDHush.on('video'); else QDHush.off('video'); } catch (e) {} }
        function show() {
            var it = LIST[idx]; if (!it) return;
            $('vid-box').classList.toggle('v', !!it.v);
            $('vid-frame').innerHTML = '<iframe src="' + H(QDVid.embed(it, true)) + '" title="' + H(it.title || 'Video') + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
            watch(it);
            var pf = $('vid-pf'); pf.textContent = QDVid.name(it.p); pf.className = 'vid-pf ' + (it.p === 'tiktok' ? 'tiktok' : '');
            $('vid-t').textContent = (it.pin ? '📌 ' : '') + (it.title || 'Video');
            $('vid-d').textContent = (it.desc ? it.desc + '\n' : '') + ago(it.createdAt) + (it.src === 'user' && it.byName ? ' · chia sẻ bởi ' + it.byName : (it.author ? ' · ' + it.author : ''));
            $('vid-mine').hidden = !(it.src === 'user' && it.by === me());
            var a = $('vid-open'); a.href = /^https:\/\//.test(it.url || '') ? it.url : (it.p === 'youtube' ? 'https://www.youtube.com/watch?v=' + it.id : 'https://www.tiktok.com/video/' + it.id);
            a.textContent = 'Mở trên ' + QDVid.name(it.p);
            $('vid-prev').disabled = idx <= 0; $('vid-next').disabled = idx >= LIST.length - 1;
        }
        // Trình phát YouTube / TikTok gửi tin báo sẵn sàng / lỗi -> chủ video chặn phát ngoài, video bị xóa... thì báo rõ thay vì màn đen
        var ptok = 0, pready = false, ptm = 0;
        var YTERR = { 2: 'Link video không đúng.', 5: 'Trình duyệt này không phát được video.', 100: 'Video đã bị xóa hoặc để riêng tư.', 101: 'Chủ video không cho phát ngoài YouTube.', 150: 'Chủ video không cho phát ngoài YouTube.', 153: 'YouTube từ chối phát ở trang này.' };
        function fail(msg) {
            var it = LIST[idx], f = $('vid-frame'); if (!it || !f || f.querySelector('.vid-fail')) return;
            var el = d.createElement('div'); el.className = 'vid-fail';
            el.innerHTML = '<div style="font-size:34px">😕</div><b>Không xem được video này ngay trong trang</b><span>' + H(msg || '') + '</span><a href="' + H($('vid-open').href) + '" target="_blank" rel="noopener">▶ Xem trên ' + QDVid.name(it.p) + '</a>';
            f.appendChild(el);
        }
        function watch(it) {
            var my = ++ptok; pready = false; clearTimeout(ptm); $('vid-hint').hidden = true;
            var fr = $('vid-frame').querySelector('iframe'); if (!fr) return;
            fr.addEventListener('load', function () {
                if (my !== ptok) return;
                if (it.p === 'youtube') { var k = 0; (function hi() { if (my !== ptok || pready || k++ > 8) return; try { fr.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'qdv', channel: 'widget' }), '*'); } catch (e) {} setTimeout(hi, 500); })(); }
            });
            ptm = setTimeout(function () { if (my === ptok && !pready) $('vid-hint').hidden = false; }, 9000);
        }
        window.addEventListener('message', function (e) {
            if (idx < 0) return; var h = ''; try { h = new URL(e.origin).hostname; } catch (x) { return; }
            var m = e.data; if (typeof m === 'string') { try { m = JSON.parse(m); } catch (x) { return; } } if (!m || typeof m !== 'object') return;
            if (/(^|\.)youtube(-nocookie)?\.com$/.test(h)) {
                if (m.event === 'onError') fail(YTERR[m.info] || 'YouTube báo lỗi ' + m.info + '.');
                else if (m.event === 'onReady' || m.event === 'initialDelivery' || m.event === 'infoDelivery') { pready = true; $('vid-hint').hidden = true; }
            } else if (/(^|\.)tiktok\.com$/.test(h) && (m['x-tiktok-player'] || /^on[A-Z]/.test(m.type || ''))) {
                if (m.type === 'onError') fail('TikTok không cho phát video này ở đây (video riêng tư, đã xóa hoặc bị chặn).');
                else if (m.type === 'onPlayerReady' || m.type === 'onStateChange' || m.type === 'onCurrentTime') { pready = true; $('vid-hint').hidden = true; }
            }
        });
        function play(i) {
            if (!LIST[i]) return; idx = i; show();
            var ov = $('modal-vid'); if (!ov.classList.contains('active')) { music(true); UI.openModal('modal-vid'); }
            markSeen();
        }
        function start() {
            if (started) return;
            if (!window.firebase || !firebase.apps || !firebase.apps.length || !me()) return setTimeout(start, 800);
            started = true;
            firebase.firestore().collection('settings').doc('video_share').onSnapshot(function (doc) {
                ITEMS = doc.exists && Array.isArray(doc.data().items) ? doc.data().items : []; render();
                if (idx >= 0 && $('modal-vid').classList.contains('active')) { /* đang xem: giữ nguyên video */ }
            }, function (e) { try { console.warn('[QD video] không đọc được settings/video_share', e && e.code); } catch (er) {} });
        }
        function boot() {
            var g = $('vid-grid'); if (!g) return;
            g.addEventListener('click', function (e) { var b = e.target.closest('.vid-card'); if (b) play(+b.dataset.i); });
            $('vid-tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; filter = b.dataset.f || ''; Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); }); renderGrid(); });
            $('vid-prev').addEventListener('click', function () { if (idx > 0) play(idx - 1); });
            $('vid-next').addEventListener('click', function () { if (idx < LIST.length - 1) play(idx + 1); });
            $('vid-mine').addEventListener('click', removeMine);
            // Đóng trình phát (nút ✕, nút Quay lại, chạm ra ngoài) -> dừng video, bật lại nhạc nền nếu trước đó đang phát
            var ov = $('modal-vid');
            new MutationObserver(function () { if (!ov.classList.contains('active') && $('vid-frame').firstChild) { $('vid-frame').innerHTML = ''; idx = -1; ptok++; clearTimeout(ptm); music(false); } }).observe(ov, { attributes: true, attributeFilter: ['class'] });
            ov.addEventListener('click', function (e) { if (e.target === ov) UI.closeModal('modal-vid'); });
            // Vào mục Video -> đánh dấu đã xem
            (function hook(n) {
                if (!window.UI || !UI.navigate) { if (n < 120) setTimeout(function () { hook(n + 1); }, 500); return; }
                var nav = UI.navigate;
                UI.navigate = function (v) { var r = nav.apply(this, arguments); if (v === 'videos') setTimeout(markSeen, 1500); return r; };
            })(0);
            start();
        }
        if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
        /* ---- Thành viên chia sẻ video (tối đa 3/ngày) + nhật ký video_share_log cho Admin ---- */
        var LIMIT = 3, vsCur = null, vsSeq = 0;
        function myName() { try { return (window.State && State.fullName) || me(); } catch (e) { return me(); } }
        function log(act, it) {
            try { firebase.firestore().collection('video_share_log').add({ act: act, user: me(), name: myName(), role: 'member', vuid: it.uid || '', p: it.p || '', id: it.id || '', url: it.url || '', title: it.title || '', time: Date.now() }); } catch (e) {}
        }
        function vsStatus(m, k) { var el = $('vs-status'); el.textContent = m || ''; el.className = 'vs-status' + (k ? ' ' + k : ''); }
        function todayStart() { var x = new Date(); x.setHours(0, 0, 0, 0); return x.getTime(); }
        function usedToday() {
            return firebase.firestore().collection('video_share_log').where('user', '==', me()).get().then(function (q) {
                var t0 = todayStart(), n = 0; q.forEach(function (doc) { var x = doc.data(); if (x.act === 'share' && x.role === 'member' && (x.time || 0) >= t0) n++; }); return n;
            }).catch(function () { return ITEMS.filter(function (x) { return x.by === me() && x.src === 'user' && (x.createdAt || 0) >= todayStart(); }).length; });
        }
        function vsCheck() {
            var raw = $('vs-url').value, o = QDVid.parse(raw), my = ++vsSeq; vsCur = null; $('vs-prev').hidden = true;
            if (!raw.trim()) { vsStatus(''); return Promise.resolve(null); }
            if (!o) { vsStatus('Link chưa đúng — chỉ nhận link video YouTube hoặc TikTok.', 'err'); return Promise.resolve(null); }
            if (o.bad) { vsStatus(o.bad, 'err'); return Promise.resolve(null); }
            vsStatus('⏳ Đang đọc video…');
            return QDVid.meta(o).then(function (m) {
                if (my !== vsSeq) return null;
                if (o.short) { if (!m.id) { vsStatus('Không đọc được link rút gọn TikTok. Mở link rồi chép link đầy đủ (tiktok.com/@…/video/…).', 'err'); return null; } o.id = m.id; o.short = false; }
                if (m.thumb && o.p === 'tiktok') o.thumb = m.thumb; o.title = m.title || ''; o.author = m.author || '';
                if (o.title && (!$('vs-title').value.trim() || $('vs-title').dataset.auto === '1')) { $('vs-title').value = o.title.slice(0, 100); $('vs-title').dataset.auto = '1'; }
                var dup = ITEMS.filter(function (x) { return x.p === o.p && x.id === o.id; })[0];
                vsCur = o; $('vs-prev').hidden = false; $('vs-th').innerHTML = img(o) + '<i class="vid-mini-play" style="animation:none;width:28px;height:28px;margin:-14px 0 0 -14px;font-size:11px">▶</i>';
                $('vs-pf').textContent = QDVid.name(o.p); $('vs-pf').className = 'vid-pf ' + (o.p === 'tiktok' ? 'tiktok' : ''); $('vs-t').textContent = $('vs-title').value.trim() || o.title || 'Video';
                if (dup) { vsStatus('Video này đã có trong mục Video rồi.', 'err'); return null; }
                vsStatus(o.title ? '✓ Link hợp lệ.' : '✓ Link hợp lệ — nhập thêm tiêu đề nhé.', 'ok'); return o;
            });
        }
        function share() {
            if (!me()) return;
            ['vs-url', 'vs-title', 'vs-note'].forEach(function (id) { $(id).value = ''; }); $('vs-title').dataset.auto = ''; $('vs-prev').hidden = true; vsCur = null; vsStatus('');
            UI.openModal('modal-vshare');
            usedToday().then(function (n) { if (n >= LIMIT) vsStatus('Hôm nay bạn đã chia sẻ đủ ' + LIMIT + ' video. Mai quay lại nhé!', 'err'); });
            if (!share.bound) {
                share.bound = 1; var u = $('vs-url'), tm = 0;
                u.addEventListener('paste', function () { setTimeout(vsCheck, 30); });
                u.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(vsCheck, 700); });
                $('vs-title').addEventListener('input', function () { this.dataset.auto = ''; if (vsCur) $('vs-t').textContent = this.value.trim() || vsCur.title || 'Video'; });
            }
        }
        function send() {
            var btn = $('vs-send'); if (btn.disabled) return; btn.disabled = true;
            var clean = function (v, n) { return String(v || '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim().slice(0, n); };
            (vsCur ? Promise.resolve(vsCur) : vsCheck()).then(function (o) {
                if (!o) return;
                var title = clean($('vs-title').value, 100), note = clean($('vs-note').value, 200);
                if (!title) { vsStatus('Nhập tiêu đề video.', 'err'); $('vs-title').focus(); return; }
                return usedToday().then(function (n) {
                    if (n >= LIMIT) { vsStatus('Hôm nay bạn đã chia sẻ đủ ' + LIMIT + ' video. Mai quay lại nhé!', 'err'); return; }
                    vsStatus('⏳ Đang chia sẻ…');
                    // Máy chủ kiểm tra link, trùng video, giới hạn 3 video / ngày rồi thêm vào mục Video + ghi lịch sử
                    return window.QDdb.play('video.share', { p: o.p, id: o.id, v: !!o.v, t: o.t || 0, url: o.url, thumb: o.thumb || '', author: o.author || '', title: title, desc: note }).then(function () {
                        UI.closeModal('modal-vshare');
                        try { Utils.toast('Đã chia sẻ video 🎬', 'success'); } catch (e) {}
                        filter = ''; setTimeout(function () { renderGrid(); }, 300);
                    }).catch(function (e) { var c = e && e.code; vsStatus(c === 'DUP' ? 'Video này đã có trong mục Video rồi.' : c === 'LIMIT' ? 'Hôm nay bạn đã chia sẻ đủ ' + LIMIT + ' video. Mai quay lại nhé!' : c === 'TITLE' ? 'Nhập tiêu đề video.' : c === 'BAD' ? 'Link video không hợp lệ.' : 'Chưa chia sẻ được, thử lại sau.', 'err'); });
                });
            }).then(function () { btn.disabled = false; }, function () { btn.disabled = false; });
        }
        function removeMine() {
            var it = LIST[idx]; if (!it || it.by !== me() || it.src !== 'user') return;
            if (!confirm('Gỡ video "' + (it.title || '') + '" khỏi mục Video?')) return;
            window.QDdb.play('video.remove', { uid: it.uid })   // máy chủ chỉ cho gỡ video của chính mình
            .then(function () { UI.closeModal('modal-vid'); try { Utils.toast('Đã gỡ video', 'success'); } catch (e) {} })
              .catch(function () { try { Utils.toast('Chưa gỡ được, thử lại sau', 'error'); } catch (e) {} });
        }
        return { share: share, send: send, removeMine: removeMine, openList: openList, play: function (uid) { var i = LIST.map(function (x) { return x.uid; }).indexOf(uid); if (i < 0) { filter = ''; renderGrid(); i = LIST.map(function (x) { return x.uid; }).indexOf(uid); } play(i); } };
    })();
    
