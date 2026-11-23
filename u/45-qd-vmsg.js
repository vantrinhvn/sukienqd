    /* ===== TIN NHẮN VIDEO (khung chat) =====
       - Nút 🎬 cạnh nút gửi ảnh: "Quay video" (camera ngay trong trang / app) hoặc "Chọn video có sẵn"
       - Xem lại trước khi gửi. Video quá nặng: tự nén lại ngay trên máy (phát lại + ghi ở chất lượng vừa đủ) rồi mới gửi
       - Tải lên máy chủ VPS (POST /api/media/video); tin nhắn chỉ giữ đường dẫn m/<mã>.<đuôi> + ảnh xem trước nhỏ
       - Bấm video trong chat -> trình phát toàn màn hình (tua được). Thu hồi tin -> xóa luôn video trên máy chủ
       - Thiết lập: Admin > Chia sẻ video > Tin nhắn video (settings/video_msg) */
    window.QDVMsg = (function () {
        'use strict';
        var W = window, d = document, LABEL = '🎬 Đã gửi một video';
        var DEF = { on: true, who: 'all', general: true, maxMB: 30, maxSec: 120, perDay: 20 }, CFG = Object.assign({}, DEF);
        var S = { mode: '', stream: null, face: 'user', rec: null, chunks: [], t0: 0, tick: 0, blob: null, meta: null, url: '', xhr: null, cancel: null, busy: false, room: '', to: '' };
        function $(id) { return d.getElementById(id); }
        function toast(m, t) { try { W.Utils.toast(m, t || 'info'); } catch (e) {} }
        function st() { return W.State || {}; }
        function staff() { try { var r = W.QDdb && W.QDdb.who().role; return r === 'admin' || r === 'manager'; } catch (e) { return false; } }
        function fmt(s) { s = Math.max(0, Math.round(+s || 0)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
        function mb(n) { return (n / 1048576).toFixed(n < 10485760 ? 1 : 0).replace('.', ',') + ' MB'; }
        function canRecord() { return !!(W.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
        function canShrink() { return !!(W.MediaRecorder && HTMLCanvasElement.prototype.captureStream); }
        function mime() {
            var L = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
            for (var i = 0; i < L.length; i++) try { if (MediaRecorder.isTypeSupported(L[i])) return L[i]; } catch (e) {}
            return '';
        }
        function bitrate(sec) {   // vừa đủ để video dài nhất vẫn dưới ~85% dung lượng cho phép
            var b = (CFG.maxMB * 0.85 * 8 * 1048576) / Math.max(5, sec || CFG.maxSec) - 96000;
            return Math.round(Math.max(350000, Math.min(2500000, b)));
        }
        function allowed(t) {
            if (!CFG.on) return false;
            if (CFG.who === 'staff' && !staff()) return false;
            if (t === 'general' && !CFG.general && !staff()) return false;
            return true;
        }
        function sync() { var b = $('chat-vid-btn'); if (b) b.hidden = !allowed(st().chatTarget); }
        var ERR = {
            OFF: 'Tin nhắn video đang tạm tắt.', STAFF: 'Chỉ Ban Quản Trị được gửi video.', GENERAL: 'Kênh Chung hiện không cho gửi video.',
            DISK: 'Máy chủ sắp hết dung lượng, chưa gửi được video.', LOGIN: 'Phiên đăng nhập đã hết, hãy đăng nhập lại.', BLOCKED: 'Tài khoản đang bị khóa.',
            TYPE: 'Tệp này không phải video hợp lệ.', ROOM: 'Chưa chọn cuộc trò chuyện.', ABORTED: 'Đã hủy gửi video.'
        };
        function errText(e) {
            var c = (e && e.message) || '', x = (e && e.x) || {};
            if (c === 'SIZE') return 'Video quá nặng (tối đa ' + (x.maxMB || CFG.maxMB) + ' MB).';
            if (c === 'BIG') return 'Nén rồi video vẫn nặng ' + mb(x.mb || 0) + ' (tối đa ' + CFG.maxMB + ' MB). Hãy chọn đoạn video ngắn hơn.';
            if (c === 'DAY') return 'Hôm nay bạn đã gửi đủ ' + (x.perDay || CFG.perDay) + ' video. Mai gửi tiếp nhé!';
            if (ERR[c]) return ERR[c];
            if (/Lệnh lạ|not-found/.test(c) || (e && e.code === 'not-found')) return 'Máy chủ chưa hỗ trợ tin nhắn video — Ban Quản Trị cần cập nhật máy chủ.';
            return 'Không gửi được video' + (c ? ' (' + c + ')' : '') + '. Thử lại sau.';
        }

        /* ---------- giao diện ---------- */
        function build() {
            if ($('qvm-studio')) return;
            var box = d.createElement('div');
            box.innerHTML =
                '<div class="qvm-menu" id="qvm-menu" hidden>' +
                    '<button type="button" id="qvm-m-rec" onclick="QDVMsg.record()"><i class="fa-solid fa-video"></i><span>Quay video</span></button>' +
                    '<button type="button" onclick="QDVMsg.pick()"><i class="fa-solid fa-photo-film"></i><span>Chọn video có sẵn</span></button>' +
                '</div>' +
                '<input type="file" id="qvm-file" accept="video/*" hidden>' +
                '<div class="modal-overlay qvm-ov" id="qvm-studio" style="display: none;">' +
                    '<div class="qvm-st" role="dialog" aria-label="Gửi video">' +
                        '<div class="qvm-stage">' +
                            '<video id="qvm-cam" autoplay muted playsinline></video>' +
                            '<video id="qvm-rev" playsinline controls></video>' +
                            '<div class="qvm-work" id="qvm-work"><i class="fa-solid fa-film"></i><b id="qvm-work-t">Đang xử lý…</b><div class="qvm-bar"><i id="qvm-bar"></i></div><small id="qvm-work-s"></small></div>' +
                        '</div>' +
                        '<div class="qvm-top">' +
                            '<button type="button" class="qvm-ic" aria-label="Đóng" onclick="QDVMsg.close()"><i class="fa-solid fa-xmark"></i></button>' +
                            '<span class="qvm-time" id="qvm-time"></span>' +
                            '<button type="button" class="qvm-ic" id="qvm-flip" aria-label="Đổi camera" onclick="QDVMsg.flip()"><i class="fa-solid fa-camera-rotate"></i></button>' +
                        '</div>' +
                        '<div class="qvm-bot">' +
                            '<p class="qvm-info" id="qvm-info"></p>' +
                            '<div class="qvm-acts" id="qvm-a-cam"><button type="button" class="qvm-shot" id="qvm-shot" aria-label="Bắt đầu quay" onclick="QDVMsg.shot()"><span></span></button></div>' +
                            '<div class="qvm-acts" id="qvm-a-rev">' +
                                '<button type="button" class="btn btn-outline" id="qvm-again" onclick="QDVMsg.again()"><i class="fa-solid fa-rotate-left"></i> <span>Quay lại</span></button>' +
                                '<button type="button" class="btn btn-primary" id="qvm-send" onclick="QDVMsg.send()"><i class="fa-solid fa-paper-plane"></i> <span>Gửi</span></button>' +
                            '</div>' +
                            '<div class="qvm-acts" id="qvm-a-work"><button type="button" class="btn btn-outline" onclick="QDVMsg.stopWork()">Hủy</button></div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="modal-overlay qvm-ov" id="qvm-player" style="display: none;">' +
                    '<div class="qvm-pl">' +
                        '<video id="qvm-pv" playsinline controls></video>' +
                        '<p class="qvm-gone" id="qvm-gone" hidden><i class="fa-solid fa-clock-rotate-left"></i> Video đã hết hạn hoặc đã bị xóa.</p>' +
                        '<div class="qvm-top"><button type="button" class="qvm-ic" aria-label="Đóng" onclick="QDVMsg.closePlayer()"><i class="fa-solid fa-xmark"></i></button>' +
                        '<a class="qvm-ic" id="qvm-open" target="_blank" rel="noopener" aria-label="Mở / tải video"><i class="fa-solid fa-download"></i></a></div>' +
                    '</div>' +
                '</div>';
            while (box.firstChild) d.body.appendChild(box.firstChild);
            $('qvm-file').addEventListener('change', function () { var f = this.files && this.files[0]; this.value = ''; if (f) usePicked(f); });
            d.addEventListener('click', function (e) {
                var m = $('qvm-menu'); if (!m || m.hidden) return;
                if (!e.target.closest('#qvm-menu, #chat-vid-btn')) m.hidden = true;
            }, true);
            var rv = $('qvm-rev'), pv = $('qvm-pv');
            [rv, pv].forEach(function (v) { v.addEventListener('loadedmetadata', function () { fixDur(v); }); });
            pv.addEventListener('error', function () { if (pv.getAttribute('src')) { $('qvm-gone').hidden = false; pv.hidden = true; } });
        }
        function fixDur(v) {   // video ghi bằng Chrome (webm) không ghi thời lượng -> tua tới cuối 1 lần để trình duyệt tự tính
            if (v.duration !== Infinity || v.__fx) return; v.__fx = 1;
            var back = function () { v.removeEventListener('timeupdate', back); v.currentTime = 0; };
            v.addEventListener('timeupdate', back); try { v.currentTime = 1e101; } catch (e) {}
        }
        function mode(m) {
            S.mode = m; var box = $('qvm-studio'); if (!box) return;
            box.setAttribute('data-m', m);
            $('qvm-flip').hidden = m !== 'cam';
        }
        function open() {
            build(); var o = $('qvm-studio');
            if (W.UI && W.UI.openModal) W.UI.openModal('qvm-studio'); else { o.style.display = 'flex'; o.classList.add('active'); }
        }
        function info(t) { var p = $('qvm-info'); if (p) p.innerHTML = t || ''; }
        function room() {
            var t = st().chatTarget; if (!t) return null;
            return { id: t === 'general' ? 'general_room' : W.Utils.getRoomId(st().currentUser, t), to: t === 'general' ? 'all' : t, t: t };
        }

        /* ---------- nút trong khung chat ---------- */
        function menu() {
            build();
            var t = st().chatTarget;
            if (!allowed(t)) { toast(!CFG.on ? ERR.OFF : CFG.who === 'staff' ? ERR.STAFF : ERR.GENERAL, 'error'); return; }
            if (S.busy) { toast('Đang gửi một video, đợi xong đã nhé.', 'info'); return; }
            var m = $('qvm-menu'), b = $('chat-vid-btn');
            $('qvm-m-rec').hidden = !canRecord();
            if (!m.hidden) { m.hidden = true; return; }
            m.hidden = false;
            var r = b.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
            m.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.left)) + 'px';
            m.style.top = Math.max(8, r.top - mh - 8) + 'px';
        }
        function pick() { $('qvm-menu').hidden = true; $('qvm-file').click(); }

        /* ---------- quay video ---------- */
        function stopCam() { if (S.stream) { S.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); S.stream = null; } var c = $('qvm-cam'); if (c) c.srcObject = null; }
        function startCam() {
            stopCam(); info('');
            var c = { video: { facingMode: S.face, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: { echoCancellation: true, noiseSuppression: true } };
            return navigator.mediaDevices.getUserMedia(c).then(function (s) {
                if (S.mode !== 'cam') { s.getTracks().forEach(function (t) { t.stop(); }); return; }
                S.stream = s; var v = $('qvm-cam'); v.muted = true; v.defaultMuted = true; v.srcObject = s; v.classList.toggle('mirror', S.face === 'user');
                var go = function () { var p = v.play(); if (p && p.catch) p.catch(function () {}); }; v.onloadedmetadata = go; go();
                $('qvm-time').textContent = '0:00 / ' + fmt(CFG.maxSec);
                info('Bấm nút đỏ để quay — tối đa ' + fmt(CFG.maxSec) + '.');
            }).catch(function (e) {
                info('<span class="qvm-bad">Không mở được camera / micro' + (e && e.name === 'NotAllowedError' ? ' — hãy cho phép quyền camera và micro.' : (e && e.name === 'NotReadableError' ? ' — camera đang được dùng ở chỗ khác (cuộc gọi?).' : '.')) + '</span>');
            });
        }
        function record() {
            $('qvm-menu').hidden = true;
            if (!canRecord()) { toast('Máy này chưa hỗ trợ quay video trong trang — hãy chọn video có sẵn.', 'error'); return; }
            var r = room(); if (!r) return; S.room = r.id; S.to = r.to;
            open(); resetRev(); mode('cam'); setShot(false); startCam();
        }
        function flip() { if (S.rec) return; S.face = S.face === 'user' ? 'environment' : 'user'; startCam(); }
        function setShot(on) { var b = $('qvm-shot'); if (!b) return; b.classList.toggle('on', on); b.setAttribute('aria-label', on ? 'Dừng quay' : 'Bắt đầu quay'); }
        function shot() {
            if (S.rec) { S.rec.stop(); return; }
            if (!S.stream) { startCam(); return; }
            var mt = mime(), opt = { videoBitsPerSecond: bitrate(CFG.maxSec), audioBitsPerSecond: 96000 }; if (mt) opt.mimeType = mt;
            var rec; try { rec = new MediaRecorder(S.stream, opt); } catch (e) { try { rec = new MediaRecorder(S.stream); } catch (x) { toast('Máy này chưa quay được video trong trang.', 'error'); return; } }
            S.rec = rec; S.chunks = []; S.t0 = Date.now();
            rec.ondataavailable = function (e) { if (e.data && e.data.size) S.chunks.push(e.data); };
            rec.onstop = function () {
                clearInterval(S.tick); setShot(false);
                var dur = (Date.now() - S.t0) / 1000, type = (rec.mimeType || mt || 'video/webm').split(';')[0];
                S.rec = null;
                if (S.mode !== 'cam') return;
                var blob = new Blob(S.chunks, { type: type }); S.chunks = [];
                if (dur < 0.8 || blob.size < 1000) { info('Video ngắn quá, quay lại nhé.'); return; }
                stopCam();
                review(blob, { dur: dur, src: 'cam' });
            };
            rec.start(1000); setShot(true); info('Đang quay… bấm lại để dừng.');
            S.tick = setInterval(function () {
                var s = (Date.now() - S.t0) / 1000; $('qvm-time').textContent = fmt(s) + ' / ' + fmt(CFG.maxSec);
                if (s >= CFG.maxSec && S.rec && S.rec.state === 'recording') S.rec.stop();
            }, 250);
        }

        /* ---------- xem lại + đo video ---------- */
        function resetRev() { var v = $('qvm-rev'); if (v) { try { v.pause(); } catch (e) {} v.removeAttribute('src'); v.load(); v.__fx = 0; } if (S.url) { URL.revokeObjectURL(S.url); S.url = ''; } S.blob = null; S.meta = null; }
        function probe(blob, known) {   // thời lượng, kích thước, ảnh xem trước (JPEG nhỏ) — tối đa vài giây
            return new Promise(function (ok) {
                var v = d.createElement('video'), u = URL.createObjectURL(blob), done = false, out = { dur: known && known.dur || 0, w: 0, h: 0, poster: '', ok: false }, t2 = 0;
                var fin = function () { if (done) return; done = true; clearTimeout(to); clearTimeout(t2); try { v.removeAttribute('src'); v.load(); } catch (e) {} URL.revokeObjectURL(u); ok(out); };
                var to = setTimeout(fin, 12000);
                var snap = function () {
                    try {
                        var k = Math.min(1, 360 / Math.max(out.w, out.h)), c = d.createElement('canvas');
                        c.width = Math.max(2, Math.round(out.w * k)); c.height = Math.max(2, Math.round(out.h * k));
                        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
                        var j = c.toDataURL('image/jpeg', 0.6); if (j.length > 60000) j = c.toDataURL('image/jpeg', 0.4);
                        if (j.length <= 90000 && j.indexOf('data:image/jpeg') === 0) out.poster = j;
                    } catch (e) {}
                };
                v.muted = true; v.playsInline = true; v.preload = 'auto';
                v.onerror = fin;
                var needDur = false;
                var seekPoster = function () {
                    v.ondurationchange = null; v.onseeked = function () { snap(); fin(); };
                    clearTimeout(t2); t2 = setTimeout(fin, 2500);
                    try { v.currentTime = Math.min(0.5, (out.dur || 1) / 3); } catch (e) { fin(); }
                };
                v.onloadedmetadata = function () {
                    out.w = v.videoWidth; out.h = v.videoHeight; out.ok = out.w > 0;
                    if (isFinite(v.duration) && v.duration > 0) out.dur = v.duration; else if (v.duration === Infinity) needDur = !out.dur;
                };
                v.onloadeddata = function () {   // khung hình đầu: ảnh dự phòng; rồi thử lấy khung ở giây 0,5 cho đẹp hơn
                    if (!out.w) { out.w = v.videoWidth; out.h = v.videoHeight; out.ok = out.w > 0; }
                    if (!out.ok) return fin();
                    snap();
                    if (needDur) {   // video webm không ghi thời lượng: tua tới cuối để trình duyệt tự tính
                        v.ondurationchange = function () { if (isFinite(v.duration) && v.duration > 0) { out.dur = v.duration; seekPoster(); } };
                        t2 = setTimeout(fin, 5000);
                        try { v.currentTime = 1e101; } catch (e) { seekPoster(); }
                        return;
                    }
                    seekPoster();
                };
                v.src = u;
            });
        }
        function review(blob, known) {
            open(); mode('rev'); S.blob = blob;
            if (S.url) URL.revokeObjectURL(S.url);
            S.url = URL.createObjectURL(blob);
            var v = $('qvm-rev'); v.__fx = 0; v.src = S.url;
            $('qvm-again').querySelector('span').textContent = known.src === 'cam' ? 'Quay lại' : 'Chọn video khác';
            $('qvm-send').disabled = true; info('Đang đọc video…'); $('qvm-time').textContent = '';
            probe(blob, known).then(function (m) {
                if (S.blob !== blob) return;
                m.src = known.src; S.meta = m; $('qvm-send').disabled = false;
                var max = CFG.maxMB * 1048576, msg = (m.dur ? fmt(m.dur) + ' · ' : '') + mb(blob.size);
                $('qvm-time').textContent = m.dur ? fmt(m.dur) : '';
                if (m.dur > CFG.maxSec + 1) { $('qvm-send').disabled = true; info('<span class="qvm-bad">Video dài ' + fmt(m.dur) + ', tối đa ' + fmt(CFG.maxSec) + '. Hãy cắt ngắn rồi chọn lại, hoặc quay video mới.</span>'); return; }
                if (blob.size > max) {
                    if (!m.ok || !canShrink() || !(m.dur > 0)) { $('qvm-send').disabled = true; info('<span class="qvm-bad">Video nặng ' + mb(blob.size) + ', tối đa ' + CFG.maxMB + ' MB. Máy này chưa tự nén được — hãy quay video ngắn hơn bằng nút Quay video.</span>'); return; }
                    $('qvm-send').querySelector('span').textContent = 'Nén & gửi';
                    info(msg + ' — nặng hơn mức cho phép (' + CFG.maxMB + ' MB) nên sẽ được <b>nén lại</b> trước khi gửi (khoảng ' + fmt(m.dur) + ').');
                } else { $('qvm-send').querySelector('span').textContent = 'Gửi'; info(msg); }
            });
        }
        function usePicked(f) {
            var r = room(); if (!r) return; S.room = r.id; S.to = r.to;
            if (!/^video\//.test(f.type || '') && !/\.(mp4|m4v|mov|webm|3gp|mkv)$/i.test(f.name || '')) { toast('Hãy chọn một tệp video.', 'error'); return; }
            resetRev(); review(f, { src: 'file' });
        }
        function again() {
            var src = S.meta && S.meta.src; resetRev();
            if (src === 'file') { close(); setTimeout(pick, 50); return; }
            mode('cam'); setShot(false); startCam();
        }

        /* ---------- nén video quá nặng (phát lại trong máy + ghi lại) ---------- */
        function unlock() {   // tạo sẵn ngay lúc bấm nút: trình duyệt / app chỉ cho phát video có tiếng khi người dùng vừa chạm
            var AC = W.AudioContext || W.webkitAudioContext, p = { v: d.createElement('video'), ac: null, src: null };
            p.v.playsInline = true; p.v.preload = 'auto';
            try { var r = p.v.play(); if (r && r.catch) r.catch(function () {}); p.v.pause(); } catch (e) {}   // play + pause ngay: chỉ để "mở khóa" phần tử
            try { if (AC) { p.ac = new AC(); if (p.ac.resume) p.ac.resume(); } } catch (e) { p.ac = null; }
            return p;
        }
        function unlockDone(p) { if (!p) return; try { p.v.removeAttribute('src'); p.v.load(); } catch (e) {} try { if (p.ac) p.ac.close(); } catch (e) {} }
        function shrink(blob, meta, prog, o) {   // o.side: cạnh dài tối đa (px), o.k: hệ số giảm bitrate (lần nén thứ 2), o.pre: video + AudioContext tạo lúc bấm
            o = o || {};
            return new Promise(function (ok, no) {
                var pre = o.pre || unlock(), v = pre.v, u = URL.createObjectURL(blob), ac = pre.ac, rec = null, stop = false, raf = 0;
                var k = Math.min(1, (o.side || 1280) / Math.max(meta.w, meta.h)), cw = Math.max(2, Math.round(meta.w * k / 2) * 2), ch = Math.max(2, Math.round(meta.h * k / 2) * 2);
                var cv = d.createElement('canvas'); cv.width = cw; cv.height = ch; var g = cv.getContext('2d');
                var tracks = cv.captureStream(30).getVideoTracks();
                v.muted = false; v.onended = v.onerror = v.oncanplay = null;
                try {
                    if (!ac) throw 0;
                    if (!pre.src) pre.src = ac.createMediaElementSource(v);   // mỗi phần tử video chỉ nối được 1 lần -> giữ lại cho lần nén thứ 2
                    var dst = ac.createMediaStreamDestination(); try { pre.src.disconnect(); } catch (x) {} pre.src.connect(dst);   // tiếng chỉ vào bản ghi, không phát ra loa
                    tracks = tracks.concat(dst.stream.getAudioTracks());
                } catch (e) { v.muted = true; }
                var mt = mime(), target = (CFG.maxMB * 0.8 * 8 * 1048576 / Math.max(1, meta.dur) - 96000) * (o.k || 1);
                var opt = { videoBitsPerSecond: Math.round(Math.max(250000, Math.min(2500000, target))), audioBitsPerSecond: 96000 }; if (mt) opt.mimeType = mt;
                var chunks = [];
                var end = function (e) {
                    if (stop) return; stop = true; cancelAnimationFrame(raf);
                    try { v.pause(); } catch (x) {}
                    var fin = function () {
                        try { tracks.forEach(function (t) { t.stop(); }); } catch (x) {}
                        v.onended = v.onerror = v.oncanplay = null;
                        if (!o.pre) unlockDone(pre);
                        URL.revokeObjectURL(u);
                        if (e) no(e); else ok(new Blob(chunks, { type: ((rec && rec.mimeType) || mt || 'video/webm').split(';')[0] }));
                    };
                    if (rec && rec.state !== 'inactive') { rec.onstop = fin; try { rec.stop(); } catch (x) { fin(); } } else fin();
                };
                S.cancel = function () { end(new Error('ABORTED')); };
                var draw = function () { if (stop) return; try { g.drawImage(v, 0, 0, cw, ch); } catch (x) {} prog(Math.min(0.99, v.currentTime / Math.max(0.1, meta.dur))); raf = requestAnimationFrame(draw); };
                v.onended = function () { end(null); };
                v.onerror = function () { end(new Error('DECODE')); };
                v.src = u;
                v.oncanplay = function () {
                    v.oncanplay = null;
                    try { rec = new MediaRecorder(new MediaStream(tracks), opt); } catch (x) { try { rec = new MediaRecorder(new MediaStream(tracks)); } catch (y) { return end(new Error('REC')); } }
                    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
                    if (ac && ac.state === 'suspended') ac.resume();
                    rec.start(1000);
                    var p = v.play();
                    if (p && p.catch) p.catch(function () { v.muted = true; v.play().catch(function () { end(new Error('PLAY')); }); });
                    draw();
                };
            });
        }

        /* ---------- gửi ---------- */
        function work(t, pct, sub) {
            mode('work'); $('qvm-work-t').textContent = t; $('qvm-bar').style.width = Math.round((pct || 0) * 100) + '%'; $('qvm-work-s').textContent = sub || '';
        }
        function upload(blob, meta) {
            return new Promise(function (ok, no) {
                var q = '?room=' + encodeURIComponent(S.room) + '&dur=' + Math.round(meta.dur || 0) + '&w=' + (meta.w || 0) + '&h=' + (meta.h || 0);
                var x = new XMLHttpRequest(); S.xhr = x;
                x.open('POST', W.QDdb.http + '/api/media/video' + q);
                x.setRequestHeader('Authorization', 'Bearer ' + W.QDdb.token());
                x.setRequestHeader('Content-Type', blob.type || 'video/mp4');
                x.upload.onprogress = function (e) { if (e.lengthComputable) work('Đang gửi video…', e.loaded / e.total, mb(e.loaded) + ' / ' + mb(e.total)); };
                x.onload = function () {
                    S.xhr = null; var j = {}; try { j = JSON.parse(x.responseText || '{}'); } catch (e) {}
                    if (x.status === 200 && j.ok && j.p) return ok(j);
                    var er = new Error(j.message || (x.status === 404 ? 'not-found' : 'HTTP ' + x.status)); er.code = j.code || (x.status === 404 ? 'not-found' : ''); no(er);
                };
                x.onerror = function () { S.xhr = null; no(new Error('Mất kết nối khi gửi')); };
                x.onabort = function () { S.xhr = null; no(new Error('ABORTED')); };
                x.send(blob);
            });
        }
        function send() {
            if (S.busy || !S.blob || !S.meta) return;
            var blob = S.blob, meta = S.meta, roomId = S.room, to = S.to, max = CFG.maxMB * 1048576;
            if (!roomId) return;
            S.busy = true; $('qvm-rev').pause();
            var pre = blob.size > max && canShrink() ? unlock() : null;
            var chk = function (size) { return W.QDdb.act('media.check', { room: roomId, size: size }); };
            var p = chk(Math.min(blob.size, max)).then(function () {
                if (blob.size <= max) return blob;
                work('Đang nén video…', 0, 'Giữ màn hình mở trong lúc nén');
                return shrink(blob, meta, function (f) { work('Đang nén video…', f, 'Giữ màn hình mở trong lúc nén'); }, { pre: pre }).then(function (b) {
                    if (b.size <= max) return b;
                    // vẫn nặng (video nhiều chuyển động): nén lần 2 nhỏ hơn nữa (480p, bitrate theo tỉ lệ còn thừa)
                    var k = Math.max(0.15, max * 0.7 / b.size);
                    work('Đang nén thêm…', 0, 'Video nhiều chuyển động, nén thêm một lần nữa');
                    return shrink(blob, meta, function (f) { work('Đang nén thêm…', f, 'Giữ màn hình mở trong lúc nén'); }, { side: 854, k: k, pre: pre }).then(function (b2) {
                        if (b2.size > max) throw Object.assign(new Error('BIG'), { x: { mb: b2.size } });
                        return b2;
                    });
                });
            }).then(function (b) {
                S.cancel = null; work('Đang gửi video…', 0, mb(b.size));
                return upload(b, meta).then(function (j) { return { j: j, b: b }; });
            }).then(function (r) {
                var v = { p: r.j.p, id: r.j.id, dur: Math.round(meta.dur || 0), w: meta.w || 0, h: meta.h || 0, size: r.b.size };
                if (meta.poster) v.poster = meta.poster;
                var msg = { conversationId: roomId, from: st().currentUser, to: to, text: LABEL, imageUrl: null, video: v, time: Date.now(), read: false, heart: false, hearts: [], readBy: [] };
                return firebase.firestore().collection('private_chat').add(msg);
            });
            p.then(function () {
                unlockDone(pre); S.busy = false; close(); toast('Đã gửi video', 'success');
            }, function (e) {
                unlockDone(pre); S.busy = false; S.cancel = null;
                if (e && e.message === 'ABORTED') { if (S.blob) mode('rev'); return; }
                var t = e && e.message === 'DECODE' ? 'Máy này không đọc được video này để nén — hãy quay video mới.' : errText(e);
                if (S.blob) { mode('rev'); info('<span class="qvm-bad">' + t + '</span>'); } else toast(t, 'error');
            });
        }
        function stopWork() {
            if (S.xhr) { try { S.xhr.abort(); } catch (e) {} }
            if (S.cancel) { var c = S.cancel; S.cancel = null; c(); }
        }
        function close() {
            stopWork();
            if (S.rec) { var r = S.rec; S.rec = null; r.onstop = null; try { r.stop(); } catch (e) {} }
            clearInterval(S.tick); stopCam(); resetRev(); S.busy = false; S.mode = '';
            if ($('qvm-studio')) { if (W.UI && W.UI.closeModal) W.UI.closeModal('qvm-studio'); else $('qvm-studio').classList.remove('active'); }
        }

        /* ---------- hiển thị trong chat + trình phát ---------- */
        var P_RE = /^m\/[0-9a-f]{24}\.(mp4|webm|mov)$/, POSTER_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
        function isLabel(t) { return t === LABEL; }
        function html(m) {
            var v = m && m.video; if (!v || typeof v !== 'object') return '';
            var p = String(v.p || ''); if (!P_RE.test(p)) return '';
            var poster = typeof v.poster === 'string' && v.poster.length < 120000 && POSTER_RE.test(v.poster) ? v.poster : '';
            var w = +v.w || 0, h = +v.h || 0, ar = w > 0 && h > 0 ? Math.max(0.56, Math.min(1.78, w / h)) : 0.75;
            return '<div class="qvm-msg' + (ar >= 1 ? ' wide' : '') + '" data-p="' + p + '" style="aspect-ratio: ' + ar.toFixed(4) + ';" role="button" tabindex="0" aria-label="Xem video" onclick="event.stopPropagation(); QDVMsg.play(this)">' +
                (poster ? '<img src="' + poster + '" alt="" decoding="async">' : '<i class="fa-solid fa-film qvm-noimg"></i>') +
                '<span class="qvm-pb"><i class="fa-solid fa-play"></i></span>' + (+v.dur > 0 ? '<span class="qvm-dur">' + fmt(v.dur) + '</span>' : '') + '</div>';
        }
        function urlOf(p) { return W.QDdb ? W.QDdb.http + '/' + p : ''; }
        function play(el) {
            var p = el && el.getAttribute('data-p'); if (!p || !P_RE.test(p)) return;
            build(); var v = $('qvm-pv'), u = urlOf(p);
            $('qvm-gone').hidden = true; v.hidden = false; v.__fx = 0;
            $('qvm-open').href = u;
            v.src = u;
            if (W.UI && W.UI.openModal) W.UI.openModal('qvm-player'); else { $('qvm-player').style.display = 'flex'; $('qvm-player').classList.add('active'); }
            var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
        }
        function closePlayer() {
            var v = $('qvm-pv'); if (v) { try { v.pause(); } catch (e) {} v.removeAttribute('src'); v.load(); }
            if (W.UI && W.UI.closeModal) W.UI.closeModal('qvm-player'); else $('qvm-player').classList.remove('active');
        }
        function drop(p) {   // thu hồi tin -> xóa video trên máy chủ
            var m = /^m\/([0-9a-f]{24})\./.exec(String(p || '')); if (!m || !W.QDdb) return;
            W.QDdb.act('media.del', { id: m[1] }).catch(function () {});
        }

        /* ---------- khởi động ---------- */
        function boot() {
            build(); sync();
            try {
                firebase.firestore().collection('settings').doc('video_msg').onSnapshot(function (doc) {
                    var s = doc.exists ? doc.data() || {} : {}; CFG = Object.assign({}, DEF);
                    Object.keys(DEF).forEach(function (k) { if (s[k] !== undefined && s[k] !== null && s[k] !== '') CFG[k] = s[k]; });
                    CFG.on = s.on !== false; CFG.general = s.general !== false; CFG.who = s.who === 'staff' ? 'staff' : 'all';
                    CFG.maxMB = Math.max(1, Math.min(200, +CFG.maxMB || DEF.maxMB)); CFG.maxSec = Math.max(5, Math.min(600, Math.round(+CFG.maxSec || DEF.maxSec)));
                    sync();
                }, function () {});
            } catch (e) {}
            var C = W.Chat;
            if (C && C.selectTarget && !C.selectTarget.__qvm) { var o = C.selectTarget; C.selectTarget = function () { var r = o.apply(this, arguments); try { sync(); } catch (e) {} return r; }; C.selectTarget.__qvm = 1; }
            setInterval(sync, 5000);   // đổi vai trò / đăng nhập lại
        }
        if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();

        return { menu: menu, pick: pick, record: record, flip: flip, shot: shot, again: again, send: send, stopWork: stopWork, close: close,
            html: html, isLabel: isLabel, play: play, closePlayer: closePlayer, drop: drop, LABEL: LABEL, _cfg: function () { return CFG; } };
    })();
