    /* ===== ADMIN > BẢN TIN: tùy chọn "Hiện thông báo khi thành viên đăng nhập" (news.popup, popupMode, popupTitle, popupUntil, popupRev) ===== */
    window.NewsPopup = (function () {
        'use strict';
        var $ = function (id) { return document.getElementById(id); }, OLD = null;
        function sync() {
            var on = $('news-popup').checked;
            $('news-pop-opts').style.display = on ? '' : 'none';
            $('news-pop-reset-wrap').style.display = on && OLD && OLD.popup ? '' : 'none';
        }
        function fill(n) {
            OLD = n || null; n = n || {};
            $('news-popup').checked = n.popup === true; $('news-pop-title').value = n.popupTitle || '';
            $('news-pop-mode').value = ['every', 'daily', 'once'].indexOf(n.popupMode) >= 0 ? n.popupMode : 'every';
            $('news-pop-until').value = n.popupUntil || ''; $('news-pop-reset').checked = false; sync();
        }
        if (typeof AdminActions !== 'undefined') {
            var openOrig = AdminActions.openNewsEditor;
            AdminActions.openNewsEditor = function (docId) {
                openOrig.apply(this, arguments); fill(null);
                if (docId) db.collection('news').doc(docId).get().then(function (s) { if ($('news-id').value === docId) fill(s.exists ? s.data() : null); }).catch(function () {});
            };
            AdminActions.saveNews = function () {
                var docId = $('news-id').value, body = $('news-content').value.trim();
                if (!body) return Utils.toast('Nội dung không được bỏ trống.', 'error');
                var on = $('news-popup').checked, until = $('news-pop-until').value, t = Date.now();
                var data = { content: body, popup: on, popupMode: $('news-pop-mode').value, popupTitle: $('news-pop-title').value.trim().slice(0, 80), popupUntil: /^\d{4}-\d{2}-\d{2}$/.test(until) ? until : '' };
                if (on && (!docId || !OLD || !OLD.popup || $('news-pop-reset').checked || OLD.content !== body || OLD.popupMode !== data.popupMode)) data.popupRev = t;   // bản mới / sửa nội dung -> hiện lại cho mọi người
                var job = docId ? db.collection('news').doc(docId).update(data) : db.collection('news').add(Object.assign({ time: t }, data));
                job.then(function () {
                    Utils.toast(docId ? 'Đã cập nhật bản tin.' : 'Bản tin mới đã được phát hành.', 'success');
                    if (on) Utils.toast('📢 Thành viên sẽ thấy thông báo này khi đăng nhập.', 'info');
                    UI.closeModal('modal-news');
                }).catch(function () { Utils.toast(docId ? 'Lỗi cập nhật CSDL.' : 'Lỗi phát hành bản tin.', 'error'); });
            };
        }
        return { sync: sync };
    })();
    
