    /* App QD Elite v1.0.19 / v1.0.20 chưa có bộ tự cập nhật phiên bản: trang báo có bản app mới (đọc nhánh "apk" của kho sukienqd),
       bấm "Tải về" -> trình duyệt tải APK -> mở file -> Cài đặt. Từ bản có "QDApkUpd" trong User-Agent, app tự lo (không hiện thông báo này). */
    (function () {
        var ua = navigator.userAgent || '', m = /QDEliteApp\/1\.0\.(\d+)/.exec(ua);
        if (!m || /QDApkUpd\//.test(ua)) return;
        var cur = +m[1], REPO = 'vantrinhvn/sukienqd', RAW = 'https://raw.githubusercontent.com/' + REPO + '/apk/';
        function getJson(u, h) { return fetch(u, { cache: 'no-store', headers: h || {} }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
        function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
        function show(v) {
            var key = 'qd_appupd_' + v.versionCode, last = 0;
            try { last = +localStorage.getItem(key) || 0; } catch (e) {}
            if (Date.now() - last < 3600e3) return;                 // vừa bấm Tải về: 1 giờ sau mới nhắc lại (đang cài)
            if (document.getElementById('qd-appupd')) return;
            var mb = Math.max(1, Math.round((v.size || 0) / 1048576));
            var d = document.createElement('div'); d.id = 'qd-appupd'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
            d.innerHTML = '<div class="box"><div class="ic">📲</div><h3>Có phiên bản app mới v' + esc(v.versionName || ('1.0.' + v.versionCode)) + '</h3>'
                + '<p>Cài bản này <b>một lần</b>: từ lần sau app tự cập nhật ngay trong app, không cần tải file nữa.</p>'
                + '<ol><li>Bấm <b>Tải về</b> (khoảng ' + mb + ' MB).</li><li>Mở file vừa tải → chọn <b>Cài đặt</b> (nếu máy hỏi, cho phép cài từ nguồn này).</li><li>Không cần gỡ app cũ, dữ liệu đăng nhập vẫn giữ.</li></ol>'
                + '<a class="go" href="' + esc(RAW + v.file) + '" target="_blank" rel="noopener">⬇️ Tải về</a></div>';   // bắt buộc cập nhật: không có "Để sau"
            document.body.appendChild(d);
            d.querySelector('.go').addEventListener('click', function () { try { localStorage.setItem(key, String(Date.now() - 11 * 3600e3)); } catch (e) {} setTimeout(function () { d.remove(); }, 400); });
        }
        setTimeout(function () {
            getJson(RAW + 'apk-version.json?t=' + Date.now())
                .catch(function () { return getJson('https://api.github.com/repos/' + REPO + '/contents/apk-version.json?ref=apk', { Accept: 'application/vnd.github.raw' }); })
                .then(function (v) { if (v && v.versionCode > cur && /^[\w.-]+\.apk$/.test(v.file || '')) show(v); })
                .catch(function () {});
        }, 4000);
    })();
    
