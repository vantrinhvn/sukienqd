    /* ===== CHIA SẺ VIDEO (settings/video_share.items) — Admin dán link YouTube / TikTok, trang thành viên phát ngay ===== */
    window.QDVideoAdmin = (function () {
        var $ = function (id) { return document.getElementById(id); }, booted = false, ITEMS = [], cur = null, editId = null, seq = 0;
        var H = window.qdH || function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        function fs() { return window.firebase && firebase.apps && firebase.apps.length ? firebase.firestore() : null; }
        function ref() { var f = fs(); return f && f.collection('settings').doc('video_share'); }
        function toast(m, t) { try { Utils.toast(m, t || 'info'); } catch (e) {} }
        function status(m, k) { var el = $('vsh-status'); if (el) { el.textContent = m || ''; el.style.color = k === 'err' ? '#ef4444' : k === 'ok' ? '#22c55e' : ''; } }
        function th(o) { var u = QDVid.thumb(o); return '<div class="vsh-prev-th' + (o.v ? ' v' : '') + '" style="' + (u ? "background-image:url('" + H(u) + "')" : 'background:linear-gradient(135deg,#111,#2b2b2b)') + '"><span class="vsh-play">▶</span></div>'; }
        function logAct(act, it) {
            var f = fs(); if (!f || !it) return; var by = ''; try { by = State.currentUser || ''; } catch (e) {}
            f.collection('video_share_log').add({ act: act, user: by || 'admin', name: by || 'admin', role: 'admin', vuid: it.uid || '', p: it.p || '', id: it.id || '', url: it.url || '', title: it.title || '', owner: it.src === 'user' ? (it.by || '') : '', time: Date.now() }).catch(function () {});
        }
        function counts() { $('vsh-title-n').textContent = $('vsh-title').value.length + '/100'; $('vsh-desc-n').textContent = $('vsh-desc').value.length + '/300'; }
        function showPrev(o, title, author) {
            var p = $('vsh-prev'); if (!o) { p.hidden = true; return; }
            p.hidden = false; $('vsh-prev-th').outerHTML = th(o).replace('class="vsh-prev-th', 'id="vsh-prev-th" class="vsh-prev-th');
            var pf = $('vsh-prev-pf'); pf.textContent = QDVid.name(o.p) + (o.v ? ' · dọc' : ''); pf.className = 'vsh-pf ' + o.p;
            $('vsh-prev-t').textContent = title || '(chưa có tiêu đề)'; $('vsh-prev-a').textContent = author ? 'Kênh: ' + author : '';
        }
        // Đọc link -> nhận diện -> tra tên / ảnh (TikTok rút gọn: tra mã video)
        function check() {
            var raw = $('vsh-url').value, o = QDVid.parse(raw), my = ++seq;
            cur = null; showPrev(null);
            if (!raw.trim()) { status(''); return Promise.resolve(null); }
            if (!o) { status('Link không đúng. Chỉ nhận link video YouTube hoặc TikTok.', 'err'); return Promise.resolve(null); }
            if (o.bad) { status(o.bad, 'err'); return Promise.resolve(null); }
            var dup = ITEMS.filter(function (x) { return x.p === o.p && x.id === o.id && x.id && x.uid !== editId; })[0];
            status('⏳ Đang đọc thông tin video…'); $('vsh-check').disabled = true;
            return QDVid.meta(o).then(function (m) {
                if (my !== seq) return null;
                $('vsh-check').disabled = false;
                if (o.short) {
                    if (!m.id) { status('Không đọc được link rút gọn TikTok. Mở link trên trình duyệt rồi chép link đầy đủ (dạng tiktok.com/@tên/video/123…).', 'err'); return null; }
                    o.id = m.id; o.short = false;   // giữ link rút gọn gốc: mở bằng app TikTok vẫn đúng video
                    dup = ITEMS.filter(function (x) { return x.p === o.p && x.id === o.id && x.uid !== editId; })[0];
                }
                if (m.thumb && o.p === 'tiktok') o.thumb = m.thumb;
                o.title = m.title || ''; o.author = m.author || '';
                if (o.title && (!$('vsh-title').value.trim() || $('vsh-title').dataset.auto === '1')) { $('vsh-title').value = o.title.slice(0, 100); $('vsh-title').dataset.auto = '1'; counts(); }
                cur = o; showPrev(o, $('vsh-title').value.trim() || o.title, o.author);
                status(dup ? '⚠ Video này đã được chia sẻ ("' + (dup.title || '') + '") — đăng nữa sẽ bị trùng.' : (m.title ? '✓ Link hợp lệ.' : '✓ Link hợp lệ. Không tự đọc được tiêu đề — hãy nhập tiêu đề.'), dup ? 'err' : 'ok');
                return o;
            });
        }
        function readAll() { var r = ref(); return r ? r.get().then(function (d) { return (d.exists && Array.isArray(d.data().items)) ? d.data().items.slice() : []; }) : Promise.reject('Chưa kết nối máy chủ'); }
        function writeAll(items) { return ref().set({ items: items, updatedAt: Date.now() }, { merge: true }); }
        function save() {
            var go = cur && !cur.short && QDVid.parse($('vsh-url').value) ? Promise.resolve(cur) : check();
            var btn = $('vsh-save');
            go.then(function (o) {
                if (!o) return;
                var title = $('vsh-title').value.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim().slice(0, 100), desc = $('vsh-desc').value.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim().slice(0, 300);
                if (!title) { status('Nhập tiêu đề video.', 'err'); $('vsh-title').focus(); return; }
                var dup = ITEMS.filter(function (x) { return x.p === o.p && x.id === o.id && x.uid !== editId; })[0];
                if (dup) { status('Video này đã có trong danh sách ("' + (dup.title || '') + '").', 'err'); return; }
                btn.disabled = true; status('⏳ Đang lưu…');
                var by = ''; try { by = State.currentUser || ''; } catch (e) {}
                var push = !editId && $('vsh-push').checked, item;
                return readAll().then(function (items) {
                    if (editId) {
                        var it = items.filter(function (x) { return x.uid === editId; })[0]; if (!it) throw 'Video đã bị xóa ở máy khác.';
                        Object.assign(it, { p: o.p, id: o.id, v: !!o.v, t: o.t || 0, url: o.url, thumb: o.thumb || it.thumb || '', author: o.author || it.author || '', title: title, desc: desc, pin: $('vsh-pin').checked, editedAt: Date.now() });
                        item = it;
                    } else {
                        item = { uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), p: o.p, id: o.id, v: !!o.v, t: o.t || 0, url: o.url, thumb: o.thumb || '', author: o.author || '', title: title, desc: desc, pin: $('vsh-pin').checked, hidden: false, createdAt: Date.now(), by: by || 'admin' };
                        items.unshift(item);
                        if (items.length > 60) items = items.slice(0, 60);   // giữ tối đa 60 video
                    }
                    return writeAll(items);
                }).then(function () {
                    var wasEdit = !!editId; logAct(wasEdit ? 'edit' : 'share', item); reset();
                    status(wasEdit ? '✓ Đã lưu thay đổi.' : '✓ Đã đăng — thành viên thấy ngay ở mục 🎬 Video.', 'ok');
                    toast(wasEdit ? 'Đã lưu thay đổi video' : 'Đã chia sẻ video', 'success');
                    if (push) notify(item);
                });
            }).catch(function (e) { status('✗ Không lưu được' + (e && e.code ? ' (' + e.code + ')' : typeof e === 'string' ? ': ' + e : ''), 'err'); })
              .then(function () { btn.disabled = false; });
        }
        // Thông báo "Video mới" qua hàng đợi push_broadcast (máy chủ VPS gửi tới app)
        function notify(it) {
            var f = fs(); if (!f) return;
            var by = ''; try { by = State.currentUser || ''; } catch (e) {}
            f.collection('push_broadcast').add({ title: '🎬 Video mới: ' + it.title.slice(0, 70), body: it.desc || 'Mở app, vào mục 🎬 Video để xem ngay!', image: QDVid.thumb(it) || '', target: 'all', status: 'pending', createdAt: Date.now(), by: by || 'admin' }).then(function () {
                toast('Đã xếp hàng gửi thông báo đến app', 'success');
            }).catch(function () { toast('Không gửi được thông báo', 'error'); });
        }
        function reset() {
            editId = null; cur = null; seq++;
            ['vsh-url', 'vsh-title', 'vsh-desc'].forEach(function (id) { $(id).value = ''; }); $('vsh-title').dataset.auto = '';
            $('vsh-pin').checked = false; $('vsh-push').checked = false; $('vsh-push-row').hidden = false;
            $('vsh-form-h').textContent = 'Thêm video'; $('vsh-save').querySelector('span').textContent = 'Đăng video'; $('vsh-cancel').hidden = true;
            showPrev(null); status(''); counts();
        }
        function edit(uid) {
            var it = ITEMS.filter(function (x) { return x.uid === uid; })[0]; if (!it) return;
            editId = uid; cur = { p: it.p, id: it.id, v: it.v, t: it.t, url: it.url, thumb: it.thumb, author: it.author };
            $('vsh-url').value = it.url; $('vsh-title').value = it.title || ''; $('vsh-title').dataset.auto = ''; $('vsh-desc').value = it.desc || ''; $('vsh-pin').checked = !!it.pin;
            $('vsh-push-row').hidden = true; $('vsh-form-h').textContent = 'Sửa video'; $('vsh-save').querySelector('span').textContent = 'Lưu thay đổi'; $('vsh-cancel').hidden = false;
            showPrev(cur, it.title, it.author); status(''); counts();
            try { $('vsh-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
        }
        function patch(uid, fn, okMsg) {
            return readAll().then(function (items) {
                var it = items.filter(function (x) { return x.uid === uid; })[0]; if (!it) throw 'Video không còn trong danh sách.';
                items = fn(items, it) || items; return writeAll(items);
            }).then(function () { if (okMsg) toast(okMsg, 'success'); }).catch(function (e) { toast('Không lưu được' + (typeof e === 'string' ? ': ' + e : e && e.code ? ' (' + e.code + ')' : ''), 'error'); });
        }
        function pin(uid) { patch(uid, function (a, it) { it.pin = !it.pin; logAct(it.pin ? 'pin' : 'unpin', it); }, null); }
        function hide(uid) { patch(uid, function (a, it) { it.hidden = !it.hidden; logAct(it.hidden ? 'hide' : 'show', it); }, null); }
        function del(uid) {
            var it = ITEMS.filter(function (x) { return x.uid === uid; })[0]; if (!it) return;
            $('confirm-msg').innerHTML = 'Gỡ video <b>' + H(it.title || '') + '</b> khỏi mục Video của thành viên?';
            var btn = $('btn-exec-confirm'); btn.className = 'btn btn-danger w-full'; btn.innerHTML = 'Gỡ video';
            State.activeDeleteAction = function () {
                State.activeDeleteAction = null; UI.closeModal('modal-confirm'); btn.innerHTML = 'Đồng ý Xóa';
                if (editId === uid) reset();
                patch(uid, function (a, x0) { logAct('remove', x0); return a.filter(function (x) { return x.uid !== uid; }); }, 'Đã gỡ video');
            };
            UI.openModal('modal-confirm');
        }
        var LOG = [], LF = '';
        var ACT = { share: ['🎬 Chia sẻ', '#22c55e'], self_remove: ['🗑 Tự gỡ', '#f97316'], remove: ['🗑 Admin gỡ', '#ef4444'], edit: ['✏️ Sửa', '#3b82f6'], pin: ['📌 Ghim', '#f59e0b'], unpin: ['Bỏ ghim', '#94a3b8'], hide: ['🙈 Ẩn', '#a855f7'], show: ['👁 Hiện lại', '#14b8a6'] };
        function renderLog() {
            var fold = function (x) { return String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'); };
            var q = fold($('vsh-q').value.trim()), t0 = new Date(); t0.setHours(0, 0, 0, 0);
            var L = LOG.filter(function (x) { return (!LF || x.role === LF) && (!q || fold(x.name + ' ' + x.user + ' ' + x.title + ' ' + (x.owner || '')).indexOf(q) >= 0); });
            var mem = LOG.filter(function (x) { return x.role === 'member' && x.act === 'share'; }), top = {};
            mem.forEach(function (x) { top[x.name || x.user] = (top[x.name || x.user] || 0) + 1; });
            var topS = Object.keys(top).sort(function (a, b) { return top[b] - top[a]; }).slice(0, 3).map(function (k) { return H(k) + ' (' + top[k] + ')'; }).join(', ');
            $('vsh-stats').innerHTML = '<span>Hôm nay: <b>' + LOG.filter(function (x) { return x.act === 'share' && (x.time || 0) >= t0.getTime(); }).length + '</b> lượt chia sẻ</span>' +
                '<span>Thành viên đã chia sẻ: <b>' + mem.length + '</b> video</span>' + (topS ? '<span>Chia sẻ nhiều nhất: <b>' + topS + '</b></span>' : '');
            var live = {}; ITEMS.forEach(function (x) { live[x.uid] = x; });
            $('vsh-log').innerHTML = L.length ? L.slice(0, 200).map(function (x) {
                var a = ACT[x.act] || [x.act, '#94a3b8'], v = live[x.vuid], st = v ? (v.hidden ? '<span style="color:#a855f7">Đang ẩn</span>' : '<span style="color:#22c55e">Đang hiện</span>') : '<span class="text-muted">Đã gỡ</span>';
                return '<tr><td style="white-space:nowrap">' + fmt(x.time) + '</td>' +
                    '<td class="vsh-who"><b>' + H(x.name || x.user) + '</b>' + (x.role === 'member' ? '<span class="vsh-mem">Thành viên</span>' : '') + '<small>@' + H(x.user) + (x.owner ? ' · video của @' + H(x.owner) : '') + '</small></td>' +
                    '<td><span class="vsh-act" style="color:' + a[1] + '">' + a[0] + '</span></td>' +
                    '<td><span class="vsh-pf ' + (x.p === 'tiktok' ? 'tiktok' : '') + '" style="font-size:10px">' + (x.p ? QDVid.name(x.p) : '') + '</span> ' + (/^https:\/\//.test(x.url || '') ? '<a href="' + H(x.url) + '" target="_blank" rel="noopener">' + H(x.title || x.url) + '</a>' : H(x.title || '')) + '</td>' +
                    '<td style="white-space:nowrap">' + st + '</td></tr>';
            }).join('') : '<tr><td colspan="5" class="text-muted">Chưa có lịch sử' + (LF || q ? ' phù hợp' : '') + '.</td></tr>';
        }
        function fmt(t) { var d = new Date(t || 0); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ' ' + d.getDate() + '/' + (d.getMonth() + 1); }
        function render() {
            var L = ITEMS.slice().sort(function (a, b) { return (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0); });
            $('vsh-count').textContent = ITEMS.length;
            $('vsh-list').innerHTML = L.length ? L.map(function (it) {
                var u = qdJ(it.uid);
                return '<div class="vsh-row' + (it.hidden ? ' off' : '') + '">' + th(it) +
                    '<div class="vsh-row-in"><span class="vsh-pf ' + (it.p === 'tiktok' ? 'tiktok' : '') + '">' + QDVid.name(it.p) + '</span><b title="' + H(it.title) + '">' + (it.pin ? '📌 ' : '') + H(it.title || '(không tên)') + '</b>' +
                    '<small>' + fmt(it.createdAt) + (it.src === 'user' ? ' · <span class="vsh-mem">👤 ' + H(it.byName || it.by) + '</span>' : (it.by ? ' · ' + H(it.by) : '')) + (it.hidden ? ' · <b style="color:#f59e0b">Đang ẩn</b>' : '') + '</small></div>' +
                    '<div class="vsh-acts">' +
                    '<button type="button" title="Mở link gốc" onclick="window.open(\'' + qdJ(it.url) + '\',\'_blank\',\'noopener\')"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>' +
                    '<button type="button" class="' + (it.pin ? 'on' : '') + '" title="' + (it.pin ? 'Bỏ ghim' : 'Ghim lên đầu') + '" onclick="QDVideoAdmin.pin(\'' + u + '\')"><i class="fa-solid fa-thumbtack"></i></button>' +
                    '<button type="button" title="' + (it.hidden ? 'Hiện lại' : 'Tạm ẩn') + '" onclick="QDVideoAdmin.hide(\'' + u + '\')"><i class="fa-solid ' + (it.hidden ? 'fa-eye-slash' : 'fa-eye') + '"></i></button>' +
                    '<button type="button" title="Sửa" onclick="QDVideoAdmin.edit(\'' + u + '\')"><i class="fa-solid fa-pen"></i></button>' +
                    '<button type="button" class="del" title="Gỡ video" onclick="QDVideoAdmin.del(\'' + u + '\')"><i class="fa-solid fa-trash"></i></button></div></div>';
            }).join('') : '<p class="text-muted text-sm m-0">Chưa có video nào. Dán link YouTube / TikTok ở khung bên cạnh để chia sẻ.</p>';
        }
        function boot(n) {
            if (booted) return;
            var r = ref(); if (!r) { if (n < 120) setTimeout(function () { boot(n + 1); }, 500); return; }
            booted = true;
            r.onSnapshot(function (d) { ITEMS = d.exists && Array.isArray(d.data().items) ? d.data().items : []; render(); renderLog(); }, function (e) { $('vsh-list').innerHTML = '<p class="text-sm" style="color:#ef4444">Không đọc được danh sách (' + H(e && e.code || 'lỗi') + ').</p>'; });
            fs().collection('video_share_log').orderBy('time', 'desc').limit(300).onSnapshot(function (q) { LOG = []; q.forEach(function (doc) { LOG.push(doc.data()); }); LOG.sort(function (x, y) { return (y.time || 0) - (x.time || 0); }); renderLog(); },
                function (e) { $('vsh-log').innerHTML = '<tr><td colspan="5" style="color:#ef4444">Không đọc được lịch sử (' + H(e && e.code || 'lỗi') + ').</td></tr>'; });
            $('vsh-filt').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; LF = b.dataset.f || ''; Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); }); renderLog(); });
            var qt = 0; $('vsh-q').addEventListener('input', function () { clearTimeout(qt); qt = setTimeout(renderLog, 200); });
            var u = $('vsh-url'), tm = 0;
            u.addEventListener('paste', function () { setTimeout(check, 30); });
            u.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(check, 700); });
            u.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); check(); } });
            $('vsh-title').addEventListener('input', function () { this.dataset.auto = ''; counts(); if (cur) $('vsh-prev-t').textContent = this.value.trim() || cur.title || '(chưa có tiêu đề)'; });
            $('vsh-desc').addEventListener('input', counts);
            counts();
        }
        (function hook(n) {
            if (typeof UI === 'undefined' || !UI.navigate) { if (n < 120) setTimeout(function () { hook(n + 1); }, 500); return; }
            var nav = UI.navigate;
            UI.navigate = function (v) { var r = nav.apply(this, arguments); if (v === 'videos') boot(0); return r; };
            var sec = $('view-videos'); if (sec && sec.classList.contains('active')) boot(0);
        })(0);
        return { check: check, save: save, reset: reset, edit: edit, pin: pin, hide: hide, del: del };
    })();
    
