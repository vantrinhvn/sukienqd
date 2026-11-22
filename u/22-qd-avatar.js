    (function () {
        'use strict';
        var $ = function (id) { return document.getElementById(id); };
        var SIZE = 192, OK = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
        var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var valid = function (u) { return typeof u === 'string' && u.length < 400000 && OK.test(u) ? u : null; };
        var initial = function (name) { return esc(String(name || '?').charAt(0).toUpperCase()); };
        var toast = function (m, t) { if (window.Utils && window.Utils.toast) window.Utils.toast(m, t || 'success'); };
        var A = window.Avatar = { mine: null, pending: null, busy: false };

        /* Nội dung ô tròn: ảnh nếu có, không thì chữ cái đầu (dùng cho danh bạ / đầu khung chat) */
        A.inner = function (url, name) { url = valid(url); return url ? '<img class="avt-img" src="' + url + '" alt="" loading="lazy" decoding="async">' : initial(name); };
        function paint(el, url, name) {
            if (!el) return; url = valid(url);
            el.innerHTML = A.inner(url, name); el.classList.toggle('has-img', !!url);
            // ô ở danh bạ còn chấm trạng thái -> class has-img gắn trên ô cha
        }
        function paintNav(url) {
            var b = $('nav-profile-btn'); if (!b) return; url = valid(url);
            b.innerHTML = url ? '<img src="' + url + '" alt="">' : '<i class="fa-solid fa-user"></i>'; b.classList.toggle('has-img', !!url);
        }
        function buttons() {
            var p = !!A.pending;
            $('pf-avt-change').hidden = p; $('pf-avt-del').hidden = p || !A.mine;
            $('pf-avt-save').hidden = !p; $('pf-avt-cancel').hidden = !p;
            $('pf-avt-note').textContent = p ? 'Xem trước — bấm "Lưu ảnh" để dùng ảnh này' : (A.mine ? 'Bấm vào ảnh hoặc biểu tượng máy ảnh để đổi ảnh khác' : 'Chưa có ảnh — đang dùng ảnh mặc định (chữ cái đầu tên)');
            var w = document.querySelector('.pf-avt-wrap'); if (w) { w.classList.toggle('pending', p); w.classList.toggle('busy', A.busy); }
            ['pf-avt-change', 'pf-avt-del', 'pf-avt-save', 'pf-avt-cancel'].forEach(function (id) { $(id).disabled = A.busy; });
            disarm();
        }
        /* Vẽ ảnh của mình ở mọi chỗ; url rỗng -> ảnh mặc định */
        A.apply = function (url) {
            A.mine = valid(url);
            var me = window.State && window.State.currentUser;
            if (!A.pending) paint($('profile-avatar-large'), A.mine, me);
            paint($('sidebar-avt'), A.mine, me); paintNav(A.mine);
            buttons();
        };

        /* ---------- Chọn ảnh -> cắt vuông, thu nhỏ -> xem trước ---------- */
        A.pick = function () { if (A.busy) return; var f = $('pf-avt-file'); f.value = ''; f.click(); };
        function loadImg(file) {
            return new Promise(function (res, rej) {
                var url = URL.createObjectURL(file), img = new Image();
                img.onload = function () { res(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
                img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('decode')); };
                img.src = url;
            });
        }
        function toSquare(img) {
            var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
            var sx = (w - s) / 2, sy = h > w ? (h - s) * 0.3 : (h - s) / 2;   // ảnh dọc: lấy lệch lên trên (thường là mặt)
            var c = document.createElement('canvas'), x;
            // Ảnh rất lớn: thu nhỏ 2 bước cho mịn
            var src = img, mid = SIZE * 3;
            if (s > mid * 1.5) { var m = document.createElement('canvas'); m.width = m.height = mid; x = m.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, sx, sy, s, s, 0, 0, mid, mid); src = m; sx = sy = 0; s = mid; }
            c.width = c.height = SIZE; x = c.getContext('2d');
            x.fillStyle = '#ffffff'; x.fillRect(0, 0, SIZE, SIZE);   // ảnh PNG trong suốt -> nền trắng
            x.imageSmoothingQuality = 'high'; x.drawImage(src, sx, sy, s, s, 0, 0, SIZE, SIZE);
            var out = c.toDataURL('image/jpeg', 0.84);
            if (out.length > 60000) out = c.toDataURL('image/jpeg', 0.7);
            return out;
        }
        $('pf-avt-file').addEventListener('change', function () {
            var file = this.files && this.files[0]; if (!file) return;
            if (file.type && !/^image\//.test(file.type)) return toast('Vui lòng chọn một tệp ảnh.', 'error');
            if (file.size > 25 * 1024 * 1024) return toast('Ảnh quá lớn (tối đa 25 MB).', 'error');
            loadImg(file).then(function (img) {
                if (!img.naturalWidth) throw new Error('empty');
                A.pending = toSquare(img);
                paint($('profile-avatar-large'), A.pending, ''); buttons();
            }).catch(function () { toast('Không đọc được ảnh này. Hãy thử ảnh JPG hoặc PNG khác.', 'error'); });
        });

        /* ---------- Lưu / hủy / xóa ---------- */
        function ref() { return window.State && window.State.currentDocId ? db.collection('accounts').doc(window.State.currentDocId) : null; }
        A.save = function () {
            var r = ref(), url = A.pending; if (!r || !url || A.busy) return;
            A.busy = true; buttons();
            r.update({ avatar: url, avatarUpdatedAt: Date.now() }).then(function () {
                A.pending = null; A.busy = false; A.apply(url); toast('Đã cập nhật ảnh đại diện!');
            }).catch(function (e) { console.error('avatar save', e); A.busy = false; buttons(); toast('Lưu ảnh thất bại, kiểm tra kết nối rồi thử lại.', 'error'); });
        };
        A.cancel = function () { if (A.busy) return; A.pending = null; A.apply(A.mine); };
        var armT = 0;
        function disarm() { clearTimeout(armT); var b = $('pf-avt-del'); if (b && b.classList.contains('armed')) { b.classList.remove('armed'); b.querySelector('span').textContent = 'Xóa ảnh'; } }
        A.remove = function () {
            var b = $('pf-avt-del'), r = ref(); if (!r || A.busy || !A.mine) return;
            if (!b.classList.contains('armed')) {   // bấm lần 1: hỏi lại ngay trên nút
                b.classList.add('armed'); b.querySelector('span').textContent = 'Bấm lần nữa để xóa';
                clearTimeout(armT); armT = setTimeout(disarm, 3500); return;
            }
            disarm(); A.busy = true; buttons();
            r.update({ avatar: firebase.firestore.FieldValue.delete(), avatarUpdatedAt: Date.now() }).then(function () {
                A.busy = false; A.apply(null); toast('Đã xóa ảnh, quay về ảnh mặc định.');
            }).catch(function (e) { console.error('avatar delete', e); A.busy = false; buttons(); toast('Xóa ảnh thất bại, thử lại sau.', 'error'); });
        };

        /* Đóng Hồ sơ khi đang xem trước mà chưa lưu -> bỏ ảnh xem trước */
        function hookClose() {
            var U = window.UI; if (!U || !U.closeModal || U.closeModal._avt) return;
            var orig = U.closeModal;
            U.closeModal = function (id) { if (id === 'modal-profile' && A.pending && !A.busy) A.cancel(); return orig.apply(this, arguments); };
            U.closeModal._avt = true;
        }
        hookClose(); document.addEventListener('DOMContentLoaded', hookClose);
        buttons();
    })();
    
