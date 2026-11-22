    /* ===== 📞 GỌI THOẠI / GỌI VIDEO 1-1 (WebRTC, báo hiệu qua Firestore "calls/{id}") =====
       - Người gọi: tạo lời mời (offer, đã gom đủ địa chỉ mạng) -> status 'ringing' -> gõ cửa máy chủ để điện thoại người nhận đổ chuông.
       - Người nhận: nghe máy -> trả lời (answer) -> status 'accepted' -> hai máy nối thẳng với nhau (âm thanh / hình không qua máy chủ).
       - Kết thúc / từ chối / nhỡ (45 giây) -> người gọi ghi 1 dòng vào tin nhắn riêng: "📞 Cuộc gọi video · 02:31" / "📵 Cuộc gọi nhỡ". */
    window.QDCall = (function () {
        var d = document, $ = function (id) { return d.getElementById(id); }, Q = window.QDNative || null;
        var RING_MS = 45000, S = null, listening = false, cfgIce = null, booted = false;
        var ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }];
        function db() { return firebase.firestore(); }
        function me() { return (window.State && State.currentUser) || ''; }
        function nameOf(u) { var N = (window.State && State.nicknames) || {}; if (N[u]) return N[u]; if (u === me() && State.fullName) return State.fullName; var c = (State.usersFull || State.fullNames || {})[u]; return c || u; }
        function avatarHTML(u) { var n = nameOf(u); try { if (window.Avatar && Avatar.inner) return Avatar.inner((State.avatars || {})[u], n); } catch (e) {} return window.qdH(String(n || '?').charAt(0).toUpperCase()); }
        function toast(m, t) { try { Utils.toast(m, t || 'info'); } catch (e) {} }
        function supported() { return !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
        function pingHook() {}   // máy chủ VPS tự báo tới app (không còn máy chủ trung chuyển Apps Script)
        function fmt(ms) { var s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; s = s % 60; return (h ? h + ':' : '') + (h && m < 10 ? '0' : '') + (m < 10 && !h ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
        function iceCfg() { return { iceServers: (cfgIce && cfgIce.length ? [ICE[0], ICE[1]].concat(cfgIce) : ICE), iceCandidatePoolSize: 2 }; }   // có máy chủ riêng (Admin) -> STUN + máy chủ riêng
        /* ---------- Âm báo (tự tạo bằng WebAudio, không cần file) ---------- */
        var AC = null, toneT = 0, vibT = 0;
        function ac() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) {} return AC; }
        function beep(freqs, dur, vol) { var a = ac(); if (!a) return; var t = a.currentTime; freqs.forEach(function (f) { var o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .03); g.gain.setValueAtTime(vol, t + dur - .05); g.gain.linearRampToValueAtTime(0, t + dur); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + .02); }); }
        function tone(kind) {
            stopTone();
            if (kind === 'in' && window.QDNative && typeof QDNative.ringStart === 'function') { try { QDNative.ringStart(); nativeRing = true; return; } catch (e) {} }   // app Android: nhạc chuông của app
            if (kind === 'in') {   // trình duyệt: cùng nhạc chuông của app; không phát được (chưa chạm trang) -> bíp
                try { if (!ringAu) { ringAu = new Audio('media/qd-ring.mp3?v=3'); ringAu.loop = true; ringAu.preload = 'auto'; } ringAu.currentTime = 0; var pr = ringAu.play(); webRing = true; if (pr && pr.catch) pr.catch(function () { if (webRing) { webRing = false; beepIn(); } }); try { navigator.vibrate && (vibT = setInterval(function () { navigator.vibrate([400, 300, 400]); }, 2200)); } catch (e) {} return; } catch (e) {}
            }
            if (kind === 'in') beepIn();
            if (kind === 'in') { /* chuông đến: đã xử lý ở trên */ }
            else if (kind === 'out') { var g = function () { beep([425], 1.0, .09); }; g(); toneT = setInterval(g, 3500); }
            else if (kind === 'end') { beep([480], .25, .12); setTimeout(function () { beep([380], .35, .12); }, 300); }
        }
        var nativeRing = false, webRing = false, ringAu = null;
        function beepIn() { var f = function () { beep([660, 880], .35, .16); setTimeout(function () { beep([880, 1100], .35, .16); }, 420); }; f(); toneT = setInterval(f, 2200); }
        function stopTone() { if (nativeRing) { nativeRing = false; try { QDNative.ringStop(); } catch (e) {} } if (webRing) { webRing = false; try { ringAu.pause(); ringAu.currentTime = 0; } catch (e) {} } clearInterval(toneT); clearInterval(vibT); toneT = vibT = 0; try { navigator.vibrate && navigator.vibrate(0); } catch (e) {} }
        /* ---------- Giao diện ---------- */
        var idleT = 0;
        function ui(mode) {   // mode: out | in | connecting | live
            var o = $('qd-call'); o.classList.add('on'); o.classList.toggle('vid', S.type === 'video'); o.classList.toggle('ring', mode === 'in' || mode === 'out'); o.classList.toggle('live', mode === 'live');
            $('qc-name').textContent = S.pname || nameOf(S.peer); $('qc-av').innerHTML = avatarHTML(S.peer);
            var show = function (k, on) { var b = o.querySelector('[data-k="' + k + '"]'); if (b) b.hidden = !on; };
            var inc = mode === 'in';
            show('decline', inc); show('accept', inc && S.type !== 'video'); show('acceptv', inc && S.type === 'video'); if (inc && S.type === 'video') show('accept', true);
            if (inc && S.type === 'video') o.querySelector('[data-k="accept"]').lastChild.textContent = 'Chỉ nghe';
            else o.querySelector('[data-k="accept"]').lastChild.textContent = 'Nghe';
            show('mic', !inc); show('cam', !inc && S.type === 'video'); show('fx', !inc && S.type === 'video' && !!(HTMLCanvasElement.prototype.captureStream)); show('flip', !inc && S.type === 'video' && S.cams > 1 && !S.screen);
            show('screen', !inc && S.type === 'video' && !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !Q && !/Android|iPhone|iPad/i.test(navigator.userAgent));
            show('spk', !inc && !!(Q && Q.callMode)); show('end', !inc);
            $('qc-fit').hidden = !(S.type === 'video' && mode === 'live');
            $('qc-repbtn').hidden = !(S.id && (mode === 'live' || mode === 'connecting'));
            st();
            try { if (!d.fullscreenElement && /Android|iPhone/i.test(navigator.userAgent) && !Q && o.requestFullscreen) o.requestFullscreen().catch(function () {}); } catch (e) {}
        }
        function st(txt) {
            if (!S) return; var m = S.mode;
            $('qc-st').textContent = txt || (m === 'out' ? (S.ringing ? 'Đang đổ chuông…' : (S.wmsg || 'Đang gọi…')) : m === 'in' ? (S.type === 'video' ? 'Cuộc gọi video đến…' : 'Cuộc gọi thoại đến…') : m === 'connecting' ? 'Đang kết nối…' : fmt(Date.now() - (S.liveAt || Date.now())));
            var f = []; if (S.peerMic === false) f.push('🔇 Đã tắt micro'); if (S.type === 'video' && S.peerCam === false && m === 'live') f.push('📷 Đã tắt camera');
            $('qc-flags').innerHTML = f.map(function (x) { return '<span>' + x + '</span>'; }).join('');
            var o = $('qd-call'); if (S.type === 'video' && m === 'live') { o.classList.toggle('pcoff', S.peerCam === false); layout(); } 
        }
        function nativeInfo() { if (S && Q && Q.callInfo) try { Q.callInfo(S.pname || nameOf(S.peer), S.type === 'video', S.liveAt || 0); } catch (e) {} }
        function btn(k, on, icon, label) { var b = $('qd-call').querySelector('[data-k="' + k + '"]'); if (!b) return; b.classList.toggle('off', !on); if (icon) b.querySelector('i').className = 'fa-solid ' + icon; if (label) b.lastChild.textContent = label; }
        function wake() { var o = $('qd-call'); o.classList.remove('idle'); clearTimeout(idleT); if (S && S.mode === 'live' && S.type === 'video') idleT = setTimeout(function () { if (S && S.mode === 'live') o.classList.add('idle'); }, 5000); }
        function hideUI() { var o = $('qd-call'); o.className = ''; $('qc-q').hidden = true; $('qc-net').classList.remove('slow'); $('qc-rv').srcObject = null; $('qc-ra').srcObject = null; $('qc-lv').srcObject = null; $('qc-pip').className = ''; $('qc-lv').className = ''; $('qc-net').classList.remove('on'); try { if (d.fullscreenElement && d.exitFullscreen) d.exitFullscreen().catch(function () {}); } catch (e) {} }
        /* ---------- Thiết bị ---------- */
        function media(video, facing) {
            var c = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: video ? { facingMode: facing || 'user', width: { min: 640, ideal: 1280 }, height: { min: 360, ideal: 720 }, frameRate: { ideal: 30, max: 30 } } : false };
            return navigator.mediaDevices.getUserMedia(c).catch(function (e) {
                if (video && e && /Overconstrained|Constraint/.test(e.name || '')) return navigator.mediaDevices.getUserMedia({ audio: c.audio, video: { facingMode: facing || 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
                throw e;
            }).then(function (stm) { sharpen(stm.getVideoTracks()[0]); return stm; }).catch(function (e) {
                if (video) return navigator.mediaDevices.getUserMedia({ audio: c.audio, video: false }).then(function (s) { toast('Không mở được camera — gọi bằng giọng nói.', 'warning'); return s; });
                throw e;
            });
        }
        function sharpen(t) {   // máy trả hình nhỏ hơn 480p -> xin lại 720p
            if (!t || !t.getSettings || !t.applyConstraints) return; var st = t.getSettings() || {};
            try { t.contentHint = 'motion'; } catch (e) {}
            if ((st.height || 0) < 480 && (st.width || 0) < 1280) t.applyConstraints({ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }).catch(function () {});
        }
        function mediaErr(e) {
            var n = e && e.name || '';
            toast(n === 'NotAllowedError' || n === 'SecurityError' ? 'Bạn chưa cho phép dùng micro / camera. Hãy bấm "Cho phép" rồi gọi lại.' : n === 'NotFoundError' ? 'Máy không có micro / camera.' : n === 'NotReadableError' ? 'Micro / camera đang bị ứng dụng khác dùng.' : 'Không mở được micro / camera.', 'error');
        }
        function playV(v) { try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
        /* Khung to / khung nhỏ: mặc định to = người kia, nhỏ = Bạn; chạm khung nhỏ để đổi. Tiếng người kia luôn phát qua <audio> riêng. */
        function layout() {
            if (!S) return; var rv = $('qc-rv'), lv = $('qc-lv'), pip = $('qc-pip'), o = $('qd-call');
            var loc = S.screen || (S.fx ? S.fxStream : null) || S.local, lt = loc && loc.getVideoTracks()[0], locOn = !!lt && lt.readyState !== 'ended' && lt.enabled !== false;
            var sw = !!S.swap && S.mode === 'live' && !!S.rstream && locOn && S.peerCam !== false;
            var big = sw ? loc : (S.rstream || null), small = sw ? S.rstream : (locOn ? loc : null);
            if (rv.srcObject !== big) { rv.srcObject = big; if (big) playV(rv); } rv.muted = true;
            if (lv.srcObject !== small) { lv.srcObject = small; if (small) playV(lv); }
            pip.classList.toggle('has', !!small);
            var mirLocal = !S.screen && !S.fx && S.facing !== 'environment';
            lv.classList.toggle('mir', !sw && mirLocal); rv.classList.toggle('mir', sw && mirLocal);
            $('qc-tag').textContent = sw ? (S.pname || nameOf(S.peer)) : (S.screen ? 'Bạn · màn hình' : S.fx ? 'Bạn · ' + S.fx.def.ic : 'Bạn');
            o.classList.toggle('swap', sw);
        }
        function showLocal() { layout(); }
        function countCams() { try { navigator.mediaDevices.enumerateDevices().then(function (l) { if (S) { S.cams = l.filter(function (x) { return x.kind === 'videoinput'; }).length; if (S.mode === 'live' || S.mode === 'connecting') ui(S.mode); } }); } catch (e) {} }
        /* ---------- Kết nối ---------- */
        function newPC() {
            var pc = new RTCPeerConnection(iceCfg());
            pc.ontrack = function (e) {
                if (!S) return; S.rstream = S.rstream || new MediaStream(); try { if (S.rstream.getTracks().indexOf(e.track) < 0) S.rstream.addTrack(e.track); } catch (x) {}
                var stm = S.rstream;
                if ($('qc-ra').srcObject !== stm) $('qc-ra').srcObject = stm; playV($('qc-ra'));
                if (S.type === 'video') layout();
            };
            var onState = function () {
                if (!S || S.pc !== pc) return;
                var cs = pc.connectionState || pc.iceConnectionState;
                if (cs === 'connected' || cs === 'completed') { $('qc-net').classList.remove('on'); clearTimeout(S.dropT); if (!S.statT) { sample(pc); S.statT = setInterval(function () { sample(pc); }, 2000); } if (S.mode !== 'live') { S.mode = 'live'; S.liveAt = S.liveAt || Date.now(); stopTone(); ui('live'); nativeInfo(); loudStart(); var rl = $('qc-rules'); rl.hidden = false; clearTimeout(S.rulesT); S.rulesT = setTimeout(function () { rl.hidden = true; }, 5500); wake(); clearInterval(S.tick); S.tick = setInterval(function () { st(); }, 1000); } }
                else if (cs === 'disconnected') { $('qc-net').classList.add('on'); clearTimeout(S.dropT); S.dropT = setTimeout(function () { if (S && S.pc === pc) finish('ended', 'Mất kết nối'); }, 15000); }
                else if (cs === 'failed') finish('ended', S.liveAt ? 'Mất kết nối' : 'Không kết nối được (mạng chặn cuộc gọi)');
            };
            pc.onconnectionstatechange = onState; pc.oniceconnectionstatechange = onState;
            return pc;
        }
        /* Trao đổi địa chỉ mạng từng cái ngay khi tìm thấy (không chờ gom đủ) -> nối nhanh hơn vài giây */
        function trickle(pc) {
            var q = [], tm = 0;
            function flush() { tm = 0; if (!S || S.pc !== pc || !S.docReady || !q.length) return; var b = q.splice(0); var o = {}; o['c' + (S.role === 'caller' ? 'From' : 'To')] = firebase.firestore.FieldValue.arrayUnion.apply(null, b); db().collection('calls').doc(S.id).update(o).catch(function () {}); }
            pc.onicecandidate = function (e) { if (!e.candidate || !e.candidate.candidate) return; try { q.push(JSON.stringify(e.candidate.toJSON ? e.candidate.toJSON() : e.candidate)); } catch (x) { return; } if (!tm) tm = setTimeout(flush, S && S.docReady ? 40 : 120); };
            return flush;
        }
        function addRemote(c) {   // địa chỉ mạng của máy bên kia
            if (!S || !S.pc) return; var list = c['c' + (S.role === 'caller' ? 'To' : 'From')] || []; S.rc = S.rc || 0;
            if (!S.pc.remoteDescription || !S.pc.remoteDescription.type) return;
            for (; S.rc < list.length; S.rc++) { try { S.pc.addIceCandidate(JSON.parse(list[S.rc])).catch(function () {}); } catch (e) {} }
        }
        function connTimer() { clearTimeout(S.connT); var s0 = S; S.connT = setTimeout(function () { if (S === s0 && S.mode !== 'live') finish('ended', 'Không kết nối được — mạng đang chặn cuộc gọi. Thử Wi-Fi khác hoặc 4G.'); }, 25000); }
        /* Đường đi của cuộc gọi: nối thẳng hay qua máy chủ trung chuyển (TURN), và dung lượng đã dùng -> Admin > Cuộc gọi */
        function sample(pc) {
            if (!pc || !pc.getStats) return; var s0 = S;
            pc.getStats().then(function (rep) {
                if (!s0 || S !== s0) return; var pair = null, byId = {}, vin = null, ain = null, vout = null;
                rep.forEach(function (r) { byId[r.id] = r; if (r.type === 'outbound-rtp' && (r.kind || r.mediaType) === 'video' && !r.isRemote) vout = r; if (r.type === 'inbound-rtp' && !r.isRemote) { if ((r.kind || r.mediaType) === 'video') vin = r; else ain = r; } });
                rep.forEach(function (r) { if (r.type === 'transport' && r.selectedCandidatePairId && byId[r.selectedCandidatePairId]) pair = byId[r.selectedCandidatePairId]; });
                if (!pair) rep.forEach(function (r) { if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected) && (!pair || (r.bytesReceived || 0) > (pair.bytesReceived || 0))) pair = r; });
                if (!pair) return;
                var lc = byId[pair.localCandidateId] || {}, rc = byId[pair.remoteCandidateId] || {};
                s0.net = { relay: lc.candidateType === 'relay', path: lc.candidateType === 'relay' || rc.candidateType === 'relay' ? 'relay' : 'direct', bytes: (pair.bytesSent || 0) + (pair.bytesReceived || 0), proto: String(lc.relayProtocol || lc.protocol || ''), at: Date.now() };
                // Chất lượng mạng: tốc độ nhận, độ trễ, mất gói, độ phân giải hình
                var now = Date.now(), vid = s0.type === 'video' && s0.peerCam !== false, m = vid && vin ? vin : (ain || vin), pv = s0.qPrev || {};
                var bytes = (m && m.bytesReceived) || 0, lost = (m && m.packetsLost) || 0, recv = (m && m.packetsReceived) || 0, dt = pv.t ? (now - pv.t) / 1000 : 0;
                var kbps = dt > 0 ? Math.max(0, (bytes - pv.b) * 8 / dt / 1000) : 0, dl = lost - (pv.l || 0), dr = recv - (pv.r || 0), loss = dl + dr > 0 ? Math.max(0, dl) / (dl + dr) * 100 : 0;
                s0.qPrev = { t: now, b: bytes, l: lost, r: recv };
                if (!s0.tuned) tune(pc);
                if (!dt) return;
                var rtt = Math.round((pair.currentRoundTripTime || 0) * 1000), up = pair.availableOutgoingBitrate || 0, h = vin && vin.frameHeight, fps = vin && vin.framesPerSecond, liveFor = s0.liveAt ? now - s0.liveAt : 0;
                var lvl = (loss > 8 || rtt > 1000 || (vid && liveFor > 8000 && fps && fps < 8) || (!vid && liveFor > 5000 && kbps < 8)) ? 2 : (loss > 3 || rtt > 550 || (vid && liveFor > 8000 && fps && fps < 15) || (vid && liveFor > 15000 && h && h < 240) || (liveFor > 10000 && up && up < 250000)) ? 1 : 0;
                s0.qHist = (s0.qHist || []).concat([lvl]).slice(-3);
                var worst = s0.qHist.length >= 2 ? Math.min(s0.qHist[s0.qHist.length - 1], s0.qHist[s0.qHist.length - 2]) : 0;   // 2 lần đo liền mới báo (tránh nháy)
                var sp = kbps >= 1000 ? (kbps / 1000).toFixed(1).replace('.', ',') + ' Mb/s' : Math.round(kbps) + ' kb/s';
                var q = $('qc-q'); q.hidden = false; q.className = 'qc-q' + (worst === 2 ? ' bad' : worst === 1 ? ' weak' : '');
                q.textContent = (worst === 2 ? '📶 Mạng rất chậm' : worst === 1 ? '📶 Mạng hơi chậm' : '📶 Mạng tốt') + ' · ' + sp + (rtt ? ' · ' + rtt + ' ms' : '') + (vid && h ? ' · ↓' + h + 'p' + (fps ? ' ' + Math.round(fps) + 'fps' : '') : '') + (s0.type === 'video' && vout && vout.frameHeight ? ' · ↑' + vout.frameHeight + 'p' + (vout.qualityLimitationReason === 'cpu' ? ' (máy yếu)' : '') : '') + (s0.net.path === 'relay' ? ' · 🔁' : '');
                var nb = $('qc-net');
                if (!nb.classList.contains('on') || nb.classList.contains('slow')) {
                    var mine = up && up < 250000;
                    if (worst >= 1) { nb.textContent = mine ? '📶 Mạng của bạn yếu — bên kia có thể thấy ' + (vid ? 'hình mờ, giật' : 'tiếng ngắt quãng') : '📶 Mạng chậm — ' + (vid ? 'hình có thể bị mờ, giật' : 'tiếng có thể bị ngắt quãng'); nb.classList.add('on', 'slow'); }
                    else nb.classList.remove('on', 'slow');
                }
            }).catch(function () {});
        }
        /* Hình nét hơn: cho phép tới 2,5 Mb/s, 30 khung hình, ưu tiên cao; mạng yếu thì tự cân bằng nét / mượt */
        function tune(pc) {
            if (!S) return; S.tuned = true;
            try { pc.getSenders().forEach(function (sd) {
                if (!sd.track || !sd.getParameters || !sd.setParameters) return;
                var p = sd.getParameters(); if (!p.encodings || !p.encodings.length) return;
                if (sd.track.kind === 'video') { p.encodings[0].maxBitrate = S.screen ? 1500000 : 2500000; p.encodings[0].maxFramerate = S.screen ? 15 : 30; p.degradationPreference = S.screen ? 'maintain-resolution' : 'balanced'; }
                p.encodings[0].priority = 'high'; p.encodings[0].networkPriority = 'high';
                sd.setParameters(p).catch(function () {});
            }); } catch (e) {}
        }
        function gathered(pc) {   // chờ gom đủ địa chỉ mạng (tối đa 3,5 giây) -> gửi 1 lần, không cần trao đổi từng địa chỉ
            return new Promise(function (res) {
                if (pc.iceGatheringState === 'complete') return res();
                var t = setTimeout(res, 3500);
                pc.addEventListener('icegatheringstatechange', function () { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
            });
        }
        function watch(id) {
            return db().collection('calls').doc(id).onSnapshot(function (doc) {
                if (!S || S.id !== id || !doc.exists) return; var c = doc.data(); S.doc = c;
                var mine = S.role === 'caller' ? 'From' : 'To', theirs = S.role === 'caller' ? 'To' : 'From';
                S.peerMic = c['mic' + theirs]; S.peerCam = c['cam' + theirs];
                if (S.role === 'caller') {
                    if (c.status === 'ringing' && (c.seen || c.delivered) && !S.ringing) { S.ringing = true; clearTimeout(S.waitT); st(); }
                    if (c.status === 'accepted' && c.answer && !S.answered) {
                        S.answered = true; S.mode = 'connecting'; stopTone(); ui('connecting');
                        S.pc.setRemoteDescription(c.answer).then(function () { addRemote(c); }).catch(function () { finish('ended', 'Lỗi kết nối'); }); connTimer();
                    }
                    if (c.status === 'declined' && c.reason === 'spam') { coolSet(S.peer, c.coolUntil); toast(c.bot || '🤖 Bot tạm chặn gọi lặp lại.', 'warning'); return finish(null, '🤖 Bot: tạm chặn gọi lặp lại', 'declined'); }
                    if (c.status === 'declined') return finish(null, 'Đã từ chối cuộc gọi', 'declined');
                    if (c.status === 'busy') return finish(null, 'Đang bận cuộc gọi khác', 'busy');
                } else if (c.status === 'accepted' && !S.acceptedHere) return finish(null, 'Đã nghe máy trên thiết bị khác');
                if (c.status === 'ended' || c.status === 'missed' || (c.status === 'declined' && S.role !== 'caller')) {
                    if (c.status === 'missed' && S.role === 'callee') return finish(null, 'Cuộc gọi nhỡ');
                    return finish(null, c.endedBy && c.endedBy !== me() ? 'Cuộc gọi đã kết thúc' : '');
                }
                addRemote(c);
                if (c.warn && c.warn.to === me()) warnShow(c.warn);
                if (S.mode !== 'in') st();
            }, function () {});
        }
        /* ---------- Gọi đi ---------- */
        function start(type) {
            var to = window.State && State.chatTarget;
            if (!to || to === 'general' || to === me()) return toast('Chọn 1 người trong danh bạ để gọi.', 'warning');
            if (!supported()) return toast('Trình duyệt này chưa hỗ trợ gọi. Hãy dùng Chrome / app QD Elite bản mới.', 'error');
            if (S) return toast('Bạn đang trong một cuộc gọi.', 'warning');
            if (window.QDGroupCall && (QDGroupCall.active() || QDGroupCall.ringing())) return toast('Bạn đang trong cuộc gọi nhóm.', 'warning');
            if (!window.isSecureContext) return toast('Cần mở trang bằng https để gọi.', 'error');
            if (start.banUntil > Date.now()) return toast('🔒 Bạn đang bị khóa gọi đến ' + fmtTime(start.banUntil) + ' do vi phạm quy định.', 'error');
            var cool = coolLeft(to); if (cool) return toast('🤖 Bot: ' + nameOf(to) + ' chưa trả lời nhiều cuộc gọi của bạn. Thử lại sau ' + cool + ' phút hoặc nhắn tin trước nhé.', 'warning');
            var rw = rateCheck(); if (rw) return toast('🤖 Bot: Bạn gọi quá nhiều trong thời gian ngắn. Đợi ' + rw + ' phút rồi gọi lại.', 'warning');
            missClear(to);
            S = { role: 'caller', peer: to, type: type === 'video' ? 'video' : 'audio', mode: 'out', cams: 1, facing: 'user', speaker: type === 'video' };
            try { QDHush.on('call'); } catch (e) {}
            ui('out'); st('Đang mở micro' + (S.type === 'video' ? ' / camera' : '') + '…');
            media(S.type === 'video').then(function (stm) {
                if (!S || S.role !== 'caller') { stm.getTracks().forEach(function (t) { t.stop(); }); return; }
                S.local = stm; if (!stm.getVideoTracks().length && S.type === 'video') S.camOff = true; showLocal(); countCams();
                if (Q && Q.callMode) try { Q.callMode(true, S.speaker); } catch (e) {} nativeInfo();
                var pc = S.pc = newPC(); stm.getTracks().forEach(function (t) { pc.addTrack(t, stm); });
                if (S.type === 'video' && !stm.getVideoTracks().length) pc.addTransceiver('video', { direction: 'recvonly' });
                fxRestore();
                tone('out'); st();
                var ref = db().collection('calls').doc(); S.id = ref.id; var flushC = trickle(pc);
                return pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () {
                    if (!S || S.pc !== pc) return;
                    return ref.set({ from: me(), to: S.peer, fromName: (State.fullName || me()), toName: nameOf(S.peer), type: S.type, status: 'ringing', created: Date.now(),
                        offer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp }, micFrom: true, camFrom: S.type === 'video' && !S.camOff }).then(function () {
                        S.docReady = true; flushC(); S.unsub = watch(ref.id); pingHook();
                        var s1 = S;
                        S.waitT = setTimeout(function () {   // chưa đổ chuông được -> nói rõ đang chờ
                            if (S !== s1 || S.ringing || S.answered) return;
                            S.wmsg = 'Người nhận đang tắt app — đang gọi tới điện thoại…'; st();
                            S.waitT = setTimeout(function () { if (S === s1 && !S.ringing && !S.answered) { S.wmsg = 'Chưa liên lạc được điện thoại người nhận (mất mạng / chặn thông báo) — vẫn đang chờ…'; st(); } }, 12000);
                        }, 6000);
                        S.ringT = setTimeout(function () { if (S && S.id === ref.id && !S.answered) finish('missed', 'Không có người nghe máy'); }, RING_MS);
                    });
                });
            }).catch(function (e) { if (e && /NotAllowed|NotFound|NotReadable|Security|Overconstrained/.test(e.name || '')) mediaErr(e); else toast('Chưa gọi được, thử lại sau.', 'error'); cleanup(); });
        }
        /* ---------- Gọi đến ---------- */
        function incoming(id, c) {
            if (c && c.group && window.QDGroupCall) return QDGroupCall.invited(id, c);   // lời mời vào cuộc gọi nhóm
            if (!S && window.QDGroupCall && QDGroupCall.active()) { db().collection('calls').doc(id).update({ status: 'busy', endedAt: Date.now() }).catch(function () {}); return; }
            if (S) { if (S.id !== id) db().collection('calls').doc(id).update({ status: 'busy', endedAt: Date.now() }).catch(function () {}); return; }
            if (!supported()) { db().collection('calls').doc(id).update({ status: 'declined', endedAt: Date.now(), reason: 'unsupported' }).catch(function () {}); return; }
            if (incoming.blocked && incoming.blocked[c.from]) { db().collection('calls').doc(id).update({ status: 'declined', endedAt: Date.now(), reason: 'blocked' }).catch(function () {}); return; }
            if (spamCheck(id, c)) return;
            S = { id: id, role: 'callee', peer: c.from, pname: (window.State && State.nicknames && State.nicknames[c.from]) || c.fromName || c.from, type: c.type === 'video' ? 'video' : 'audio', mode: 'in', offer: c.offer, cams: 1, facing: 'user', speaker: c.type === 'video' };
            try { QDHush.on('call'); } catch (e) {}
            S.unsub = watch(id); ui('in'); tone('in'); setTimeout(prewarm, 0);
            db().collection('calls').doc(id).update({ seen: Date.now() }).catch(function () {});
            S.ringT = setTimeout(function () { if (S && S.id === id && S.mode === 'in') finish(null, 'Cuộc gọi nhỡ'); }, Math.max(3000, RING_MS - (Date.now() - (c.created || Date.now()))));
            if (d.hidden && window.Notif && Notif.show) try { Notif.show('📞 ' + (c.fromName || nameOf(c.from)) + (c.type === 'video' ? ' đang gọi video cho bạn' : ' đang gọi cho bạn'), 'Chạm để nghe máy', 'call:' + id, c.from); } catch (e) {}
        }
        /* Đang đổ chuông: dựng sẵn kết nối + tìm sẵn đường mạng (chưa mở micro / camera, chưa gửi gì cho người gọi).
           Bấm Nghe -> gửi trả lời ngay lập tức, micro / camera mở song song -> nối được trong khoảng 1 giây. */
        function prewarm() {
            if (!S || S.role !== 'callee' || S.prep) return S && S.prep;
            var pc = S.pc = newPC(); S.flushC = trickle(pc);
            S.prep = pc.setRemoteDescription(S.offer).then(function () {
                pc.getTransceivers().forEach(function (t) { try { t.direction = 'sendrecv'; } catch (e) {} });   // gửi được hình / tiếng sau mà không phải thương lượng lại
                addRemote(S.doc || {}); return pc.createAnswer();
            }).then(function (a) { return pc.setLocalDescription(a); }).then(function () { return pc; });
            S.prep.catch(function () {});
            return S.prep;
        }
        function accept(withVideo) {
            if (!S || S.mode !== 'in') return; stopTone(); S.acceptedHere = true; clearTimeout(S.ringT); missClear(S.peer);
            var vid = S.type === 'video' && withVideo !== false; if (S.type === 'video' && !vid) S.camOff = true;
            S.mode = 'connecting'; ui('connecting');
            var s0 = S, camP = media(vid);   // mở micro / camera cùng lúc với gửi trả lời
            prewarm().then(function (pc) {
                if (S !== s0) return;
                connTimer();
                return db().collection('calls').doc(S.id).update({ status: 'accepted', acceptedAt: Date.now(), answer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp }, micTo: true, camTo: S.type === 'video' && !S.camOff })
                    .then(function () { if (S === s0) { S.docReady = true; S.flushC(); } });
            }).catch(function () { if (S === s0) finish('ended', 'Lỗi kết nối'); });
            camP.then(function (stm) {
                if (S !== s0) { stm.getTracks().forEach(function (t) { t.stop(); }); return; }
                S.local = stm; if (!stm.getVideoTracks().length) S.camOff = true; showLocal(); countCams();
                if (Q && Q.callMode) try { Q.callMode(true, S.speaker); } catch (e) {} nativeInfo();
                return S.prep.then(function (pc) {
                    var tr = pc.getTransceivers();
                    stm.getTracks().forEach(function (t) {
                        var x = tr.filter(function (y) { return y.receiver && y.receiver.track && y.receiver.track.kind === t.kind && !y.sender.track; })[0];
                        if (x) { x.sender.replaceTrack(t); try { x.sender.setStreams && x.sender.setStreams(stm); } catch (e) {} } else { try { pc.addTrack(t, stm); } catch (e) {} }
                    });
                    if (S.type === 'video' && !stm.getVideoTracks().length) setFlag('cam', false);
                    fxRestore();
                });
            }).catch(function (e) { if (S !== s0) return; if (e && /NotAllowed|NotFound|NotReadable|Security/.test(e.name || '')) { mediaErr(e); setFlag('mic', false); setFlag('cam', false); } });
        }
        function decline() { if (!S || S.mode !== 'in') return; var id = S.id; db().collection('calls').doc(id).update({ status: 'declined', endedAt: Date.now(), endedBy: me() }).catch(function () {}); pingHook(); cleanup(); }
        /* ---------- Kết thúc ---------- */
        function finish(status, msg, logAs) {
            if (!S) return; var s = S, dur = s.liveAt ? Date.now() - s.liveAt : 0;
            if (status && s.id) { var up = { status: status, endedAt: Date.now(), endedBy: me() }; if (dur) up.duration = dur; db().collection('calls').doc(s.id).update(up).catch(function () {}); pingHook(); }
            if (s.role === 'caller' && s.id && !s.logged) {   // người gọi ghi 1 dòng vào cuộc trò chuyện
                s.logged = true; var st2 = logAs || status || (s.doc && s.doc.status) || 'ended';
                var kind = s.type === 'video' ? 'video' : 'thoại';
                var text = dur ? '📞 Cuộc gọi ' + kind + ' · ' + fmt(dur) : st2 === 'declined' ? '📵 Cuộc gọi ' + kind + ' bị từ chối' : st2 === 'busy' ? '📵 Cuộc gọi ' + kind + ' — người nhận đang bận' : '📵 Cuộc gọi ' + kind + ' nhỡ';
                try { db().collection('private_chat').add({ conversationId: Utils.getRoomId(me(), s.peer), from: me(), to: s.peer, text: text, imageUrl: null, time: Date.now(), read: false, heart: false, hearts: [], readBy: [], call: { type: s.type, dur: Math.round(dur / 1000), status: dur ? 'done' : st2 } }); } catch (e) {}
            }
            if (s.id) try {
                var side = s.role === 'caller' ? 'From' : 'To', L = { updatedAt: Date.now() };
                if (s.role === 'caller') { L.from = me(); L.to = s.peer; L.fromName = State.fullName || me(); L.toName = nameOf(s.peer); L.type = s.type; L.created = (s.doc && s.doc.created) || Date.now(); L.status = dur ? 'done' : (logAs || status || (s.doc && s.doc.status) || 'ended'); L.dur = Math.round(dur / 1000); }
                else if (dur) L.dur = Math.round(dur / 1000);
                if (s.net) L['net' + side] = s.net;
                db().collection('call_log').doc(s.id).set(L, { merge: true }).catch(function () {});
                if (s.role === 'caller') { var cid = s.id; setTimeout(function () { var FV = firebase.firestore.FieldValue; db().collection('calls').doc(cid).update({ offer: FV.delete(), answer: FV.delete(), cFrom: FV.delete(), cTo: FV.delete() }).catch(function () {}); }, 8000); }
            } catch (e) {}
            if (s.mode !== 'in') tone('end');
            if (msg) { $('qc-st').textContent = msg; $('qd-call').classList.remove('ring', 'live', 'idle'); }
            cleanup(msg ? 1300 : 0);
        }
        function cleanup(delay) {
            var s = S; S = null; if (!s) return; stopTone();
            clearTimeout(s.ringT); clearTimeout(s.waitT); clearTimeout(s.rulesT); loudStop(s); try { $('qc-botn').hidden = true; $('qc-rep').hidden = true; $('qc-warn').hidden = true; $('qc-rules').hidden = true; } catch (e) {} clearInterval(s.tick); clearInterval(s.statT); clearTimeout(s.dropT); clearTimeout(s.connT); clearTimeout(idleT);
            try { s.unsub && s.unsub(); } catch (e) {}
            if (s.fx) { var S0 = S; S = s; fxStop(); S = S0; }
            try { $('qc-fx').hidden = true; } catch (e) {}
            try { s.pc && s.pc.close(); } catch (e) {}
            [s.local, s.screen].forEach(function (m) { try { m && m.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} });
            if (Q && Q.callMode) try { Q.callMode(false, false); } catch (e) {}
            if (Q && Q.cancelCallNotif && s.id) try { Q.cancelCallNotif('call:' + s.id); } catch (e) {}
            setTimeout(function () { if (!S) try { QDHush.off('call'); } catch (e) {} }, (delay || 0) + 400);   // tiếng "tút tút" kết thúc xong mới bật lại nhạc
            setTimeout(function () { if (!S) hideUI(); }, delay || 0);
        }
        /* ---------- ✨ HIỆU ỨNG GỌI VIDEO: lọc màu, làm đẹp, khung Tết, hoa mai rơi, pháo hoa, khung neon ----------
           Camera -> <video> ẩn -> vẽ lên canvas (lọc + trang trí) -> canvas.captureStream() -> gửi đi + xem trước.
           Người kia thấy đúng hiệu ứng; tắt hiệu ứng -> trả lại hình camera gốc (không tốn máy). */
        var FX = [
            { k: '', ic: '🚫', n: 'Không' },
            { k: 'beauty', ic: '✨', n: 'Làm đẹp', f: 'brightness(1.07) contrast(0.95) saturate(1.1)', soft: 0.42 },
            { k: 'warm', ic: '🌅', n: 'Ấm áp', f: 'sepia(0.22) saturate(1.28) brightness(1.04) hue-rotate(-8deg)' },
            { k: 'cool', ic: '❄️', n: 'Mát lạnh', f: 'saturate(1.08) hue-rotate(10deg) brightness(1.03) contrast(1.05)', tint: 'rgba(70,130,255,0.10)' },
            { k: 'vintage', ic: '🎞️', n: 'Cổ điển', f: 'sepia(0.62) contrast(1.1) brightness(0.96) saturate(0.9)', vig: 0.6 },
            { k: 'bw', ic: '🖤', n: 'Đen trắng', f: 'grayscale(1) contrast(1.15)', vig: 0.35 },
            { k: 'tet', ic: '🧧', n: 'Khung Tết', f: 'saturate(1.12) brightness(1.03)', frame: 'tet' },
            { k: 'mai', ic: '🌼', n: 'Hoa mai rơi', f: 'saturate(1.1) brightness(1.02)', fall: 'mai' },
            { k: 'fire', ic: '🎆', n: 'Pháo hoa', f: 'contrast(1.05) saturate(1.1)', fire: 1 },
            { k: 'neon', ic: '💥', n: 'Neon T"L"', f: 'contrast(1.08) saturate(1.15)', frame: 'neon' }
        ];
        var FXK = 'qd_call_fx';
        function fxDef(k) { for (var i = 0; i < FX.length; i++) if (FX[i].k === k) return FX[i]; return FX[0]; }
        function fxStop() {
            if (!S || !S.fx) return; var f = S.fx; S.fx = null;
            clearTimeout(f.t); try { f.out.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
            try { f.v.srcObject = null; } catch (e) {}
        }
        function fxSend() {   // gửi hình đã qua hiệu ứng (hoặc camera gốc) cho người kia
            if (!S || !S.pc || S.screen) return; var raw = S.local && S.local.getVideoTracks()[0], tr = S.fx ? S.fx.track : raw;
            var sd = sender('video') || (S.pc.getTransceivers().filter(function (x) { return x.receiver.track && x.receiver.track.kind === 'video'; })[0] || {}).sender;
            if (sd && tr && sd.track !== tr) { sd.replaceTrack(tr).catch(function () {}); S.tuned = false; }
        }
        function fxApply(k) {
            if (!S || S.type !== 'video') return; var def = fxDef(k);
            try { localStorage.setItem(FXK, def.k); } catch (e) {}
            fxStop();
            var raw = S.local && S.local.getVideoTracks()[0];
            if (!def.k || !raw) { fxSend(); layout(); fxUI(); return; }
            var st = raw.getSettings ? raw.getSettings() : {}, sw = st.width || 1280, sh = st.height || 720, sc = Math.min(1, 960 / Math.max(sw, sh));
            var W = Math.round(sw * sc / 2) * 2, Hh = Math.round(sh * sc / 2) * 2;
            var cv = d.createElement('canvas'); cv.width = W; cv.height = Hh; var ctx = cv.getContext('2d');
            var sm = d.createElement('canvas'); sm.width = Math.max(2, W >> 3); sm.height = Math.max(2, Hh >> 3); var sctx = sm.getContext('2d');
            var v = d.createElement('video'); v.muted = true; v.playsInline = true; v.autoplay = true; v.srcObject = new MediaStream([raw]); playV(v);
            var out = cv.captureStream(30), f = { k: def.k, def: def, cv: cv, ctx: ctx, sm: sm, sctx: sctx, v: v, out: out, track: out.getVideoTracks()[0], parts: [], bursts: [], t: 0, t0: Date.now(), W: W, H: Hh };
            try { f.track.contentHint = 'motion'; } catch (e) {}
            S.fx = f; S.fxStream = new MediaStream([f.track]);
            (function loop() {
                if (!S || S.fx !== f) return;
                try { fxDraw(f); } catch (e) {}
                f.t = setTimeout(loop, 33);
            })();
            fxSend(); layout(); fxUI();
        }
        function fxDraw(f) {
            var c = f.ctx, W = f.W, H = f.H, def = f.def, v = f.v, now = Date.now(), raw = S.local && S.local.getVideoTracks()[0];
            if (raw && f.v.srcObject && f.v.srcObject.getVideoTracks()[0] !== raw) { f.v.srcObject = new MediaStream([raw]); playV(f.v); }   // vừa đổi camera trước / sau
            if (!v.videoWidth || (raw && raw.enabled === false)) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); return; }
            c.save(); c.filter = def.f || 'none'; c.drawImage(v, 0, 0, W, H); c.restore();
            if (def.soft) {   // mịn da: chồng 1 lớp mờ (vẽ nhỏ rồi phóng to = mờ rẻ máy)
                f.sctx.drawImage(v, 0, 0, f.sm.width, f.sm.height);
                c.save(); c.globalAlpha = def.soft; c.filter = 'brightness(1.08)'; c.imageSmoothingQuality = 'high'; c.drawImage(f.sm, 0, 0, W, H); c.restore();
            }
            if (def.tint) { c.fillStyle = def.tint; c.fillRect(0, 0, W, H); }
            if (def.vig) { var g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + def.vig + ')'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
            var u = Math.min(W, H) / 100;
            if (def.frame === 'tet') {
                var b = 3.2 * u; c.save();
                c.lineWidth = b; c.strokeStyle = '#c1121f'; c.strokeRect(b / 2, b / 2, W - b, H - b);
                c.lineWidth = 0.9 * u; c.strokeStyle = '#ffd65a'; c.strokeRect(b + u, b + u, W - 2 * b - 2 * u, H - 2 * b - 2 * u);
                [[W * 0.1, 0], [W * 0.9, 0]].forEach(function (p, i) {   // đèn lồng đung đưa
                    var sw = Math.sin(now / 600 + i) * 4 * u, x = p[0] + sw, ly = 13 * u;
                    c.strokeStyle = '#ffd65a'; c.lineWidth = 0.5 * u; c.beginPath(); c.moveTo(p[0], 0); c.lineTo(x, ly - 5 * u); c.stroke();
                    c.fillStyle = '#d10f1b'; c.beginPath(); c.ellipse(x, ly, 6 * u, 5 * u, 0, 0, Math.PI * 2); c.fill();
                    c.fillStyle = '#ffd65a'; c.fillRect(x - 3 * u, ly - 5.6 * u, 6 * u, 1.4 * u); c.fillRect(x - 3 * u, ly + 4.2 * u, 6 * u, 1.4 * u);
                    c.strokeStyle = '#ffd65a'; c.lineWidth = 0.6 * u; c.beginPath(); for (var t = -2; t <= 2; t++) { c.moveTo(x + t * 0.8 * u, ly + 5.6 * u); c.lineTo(x + t * 0.8 * u, ly + 10 * u); } c.stroke();
                    c.fillStyle = '#ffd65a'; c.font = '900 ' + Math.round(5 * u) + 'px "Noto Serif CJK SC",serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('福', x, ly + 0.3 * u);
                });
                var bh = 9 * u, by = H - bh - b - 1.5 * u; c.fillStyle = 'rgba(160,10,20,0.88)'; c.fillRect(W * 0.12, by, W * 0.76, bh);
                c.strokeStyle = '#ffd65a'; c.lineWidth = 0.6 * u; c.strokeRect(W * 0.12, by, W * 0.76, bh);
                c.fillStyle = '#ffe38a'; c.font = '900 ' + Math.round(4.6 * u) + 'px Inter, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('CHÚC MỪNG NĂM MỚI 2027', W / 2, by + bh / 2);
                c.restore();
            }
            if (def.frame === 'neon') {
                c.save(); var p = 2.4 * u, pulse = 0.65 + 0.35 * Math.sin(now / 350);
                c.shadowColor = 'rgba(255,30,45,' + pulse + ')'; c.shadowBlur = 5 * u; c.strokeStyle = '#ff2a37'; c.lineWidth = 1.2 * u;
                c.beginPath(); if (c.roundRect) c.roundRect(p, p, W - 2 * p, H - 2 * p, 4 * u); else c.rect(p, p, W - 2 * p, H - 2 * p); c.stroke();
                c.font = 'italic 900 ' + Math.round(5.5 * u) + 'px "Inter Display", Inter, Arial, sans-serif'; c.textAlign = 'right'; c.textBaseline = 'bottom';
                c.lineWidth = 0.9 * u; c.strokeStyle = '#000'; c.strokeText('T"L"HEADSHOT', W - 5 * u, H - 4 * u); c.fillStyle = '#fff'; c.fillText('T"L"HEADSHOT', W - 5 * u, H - 4 * u);
                c.restore();
            }
            if (def.fall === 'mai') {   // hoa mai rơi
                while (f.parts.length < 22) f.parts.push({ x: Math.random() * W, y: (Math.random() * 1.2 - 0.25) * H, r: (1.6 + Math.random() * 1.8) * u, vy: (0.25 + Math.random() * 0.35) * u, vx: (Math.random() - 0.5) * 0.25 * u, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.06 });
                f.parts.forEach(function (q) {
                    q.y += q.vy; q.x += q.vx + Math.sin((now / 900) + q.a) * 0.15 * u; q.a += q.va;
                    if (q.y > H + 5 * u) { q.y = -5 * u; q.x = Math.random() * W; }
                    c.save(); c.translate(q.x, q.y); c.rotate(q.a); c.fillStyle = '#ffd23f';
                    for (var i = 0; i < 5; i++) { var an = i * Math.PI * 2 / 5; c.beginPath(); c.arc(Math.cos(an) * q.r * 0.62, Math.sin(an) * q.r * 0.62, q.r * 0.52, 0, Math.PI * 2); c.fill(); }
                    c.fillStyle = '#e8590c'; c.beginPath(); c.arc(0, 0, q.r * 0.3, 0, Math.PI * 2); c.fill(); c.restore();
                });
            }
            if (def.fire) {   // pháo hoa nổ phía trên
                if (now - (f.lastB || 0) > 900 + Math.random() * 700) {
                    f.lastB = now; var cx = W * (0.15 + Math.random() * 0.7), cy = H * (0.1 + Math.random() * 0.3), col = ['#ffd23f', '#ff4d6d', '#7cf', '#9f6', '#f9c'][Math.floor(Math.random() * 5)];
                    for (var i = 0; i < 46; i++) { var an = Math.random() * Math.PI * 2, sp = (0.5 + Math.random()) * 0.9 * u; f.bursts.push({ x: cx, y: cy, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: 1, col: col }); }
                }
                c.save(); c.globalCompositeOperation = 'lighter';
                f.bursts = f.bursts.filter(function (p) {
                    p.x += p.vx; p.y += p.vy; p.vy += 0.025 * u; p.vx *= 0.985; p.life -= 0.022;
                    if (p.life <= 0) return false;
                    c.globalAlpha = p.life; c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, 0.7 * u, 0, Math.PI * 2); c.fill(); return true;
                });
                c.restore();
            }
        }
        function fxUI() {
            var box = $('qc-fx'); if (!box) return; var cur = S && S.fx ? S.fx.k : '';
            Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) { b.classList.toggle('on', b.dataset.fx === cur); });
            var b2 = $('qd-call').querySelector('[data-k="fx"]'); if (b2) b2.classList.toggle('off', !!cur);
        }
        function fxRestore() { var k = ''; try { k = localStorage.getItem(FXK) || ''; } catch (e) {} if (k && S && S.type === 'video' && !S.camOff) fxApply(k); }   // dùng lại hiệu ứng lần trước
        function fxToggle() { var box = $('qc-fx'); box.hidden = !box.hidden; if (!box.hidden) { fxUI(); wake(); } }
        /* ---------- 🛡️ AN TOÀN KHI GỌI: báo cáo quấy rối / bạo lực / đe dọa, cảnh báo người vi phạm, chặn, khóa gọi ----------
           call_reports  : báo cáo (kèm ảnh bằng chứng chụp từ hình người kia) -> Admin > Cuộc gọi > Báo cáo & cảnh báo
           calls/{id}.warn: cảnh báo hiện ngay trên màn hình người bị báo cáo
           call_blocks   : "{tôi}__{người kia}" -> người kia không gọi được cho tôi nữa
           call_warnings : cảnh báo / khóa gọi do Admin gửi -> hiện hộp cảnh báo khi người đó mở app
           accounts.callBanUntil: đang bị khóa gọi tới thời điểm này */
        var REASONS = [['harass', '😠 Quấy rối'], ['violence', '👊 Bạo lực'], ['threat', '🔪 Đe dọa'], ['sexual', '🔞 Khiêu dâm / nhạy cảm'], ['abuse', '🤬 Xúc phạm, lăng mạ'], ['other', '❓ Khác']];
        function reasonLabel(k) { for (var i = 0; i < REASONS.length; i++) if (REASONS[i][0] === k) return REASONS[i][1]; return k || ''; }
        function snapRemote() {   // chụp 1 khung hình người kia làm bằng chứng (nhỏ gọn ~40KB)
            try {
                var v = $('qc-rv'), src = S && S.rstream; if (!src || S.type !== 'video') return '';
                if (v.srcObject !== src) { v = $('qc-lv'); if (v.srcObject !== src) return ''; }
                if (!v.videoWidth) return ''; var w = Math.min(480, v.videoWidth), h = Math.round(v.videoHeight * w / v.videoWidth);
                var c = d.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h);
                var url = c.toDataURL('image/jpeg', 0.6); return url.length < 180000 ? url : c.toDataURL('image/jpeg', 0.4);
            } catch (e) { return ''; }
        }
        function repOpen() {
            if (!S || !S.id) return; var box = $('qc-rep'); S.repSnap = snapRemote(); S.repReason = '';
            $('qc-rep-who').textContent = S.pname || nameOf(S.peer);
            $('qc-rep-r').innerHTML = REASONS.map(function (r) { return '<button type="button" data-r="' + r[0] + '">' + r[1] + '</button>'; }).join('');
            $('qc-rep-note').value = ''; $('qc-rep-block').checked = false; $('qc-rep-st').textContent = '';
            var pv = $('qc-rep-snap'); pv.hidden = !S.repSnap; if (S.repSnap) pv.querySelector('img').src = S.repSnap;
            box.hidden = false; wake();
        }
        function repSend() {
            if (!S || !S.id) return; var s0 = S, r = S.repReason;
            if (!r) { $('qc-rep-st').textContent = 'Chọn lý do báo cáo.'; return; }
            var note = String($('qc-rep-note').value || '').replace(/[<>]/g, '').trim().slice(0, 300), block = $('qc-rep-block').checked, withSnap = !$('qc-rep-snap').hidden && $('qc-rep-snapuse').checked;
            if (repCount() >= 5) { $('qc-rep-st').textContent = 'Bạn đã gửi quá nhiều báo cáo hôm nay. Liên hệ Ban Quản Trị nếu cần.'; return; }
            var btn = $('qc-rep-send'); btn.disabled = true;
            var rep = { callId: S.id, reporter: me(), reporterName: (State.fullName || me()), reported: S.peer, reportedName: S.pname || nameOf(S.peer), reason: r, reasonLabel: reasonLabel(r), note: note, snap: withSnap ? (S.repSnap || '') : '', type: S.type, dur: S.liveAt ? Math.round((Date.now() - S.liveAt) / 1000) : 0, at: Date.now(), status: 'new', blocked: block };
            db().collection('call_reports').add(rep).then(function () {
                db().collection('calls').doc(s0.id).update({ warn: { to: s0.peer, reason: r, label: reasonLabel(r), at: Date.now() } }).catch(function () {});
                if (block) db().collection('call_blocks').doc(me() + '__' + s0.peer).set({ by: me(), blocked: s0.peer, at: Date.now(), reason: r }).catch(function () {});
                $('qc-rep').hidden = true; toast('Đã gửi báo cáo cho Ban Quản Trị. Người kia đã nhận cảnh báo.', 'success'); repCount(1);
                guardReports(s0.peer, true).then(function (a) { if (a) toast('🤖 Bot đã tự động ' + a + ' với ' + (s0.pname || nameOf(s0.peer)) + '.', 'info'); });
                if (block && S === s0) finish('ended', 'Đã kết thúc và chặn người này');
            }).catch(function () { $('qc-rep-st').textContent = 'Chưa gửi được, thử lại.'; }).then(function () { btn.disabled = false; });
        }
        function warnShow(w) {   // người bị báo cáo: cảnh báo đỏ ngay trong cuộc gọi
            if (!S || !w || S.warnAt >= w.at) return; S.warnAt = w.at;
            $('qc-warn-r').textContent = w.label || reasonLabel(w.reason);
            $('qc-warn').hidden = false; try { navigator.vibrate && navigator.vibrate([300, 120, 300]); } catch (e) {}
        }
        function blockedBy(callee, caller) { return db().collection('call_blocks').doc(callee + '__' + caller).get().then(function (x) { return x.exists; }).catch(function () { return false; }); }
        function myBan() {
            var id = window.State && State.currentDocId; if (!id) return Promise.resolve(0);
            return db().collection('accounts').doc(id).get().then(function (x) { var b = x.exists ? +x.data().callBanUntil || 0 : 0; return b > Date.now() ? b : 0; }).catch(function () { return 0; });
        }
        function fmtTime(t) { var x = new Date(t); return ('0' + x.getHours()).slice(-2) + ':' + ('0' + x.getMinutes()).slice(-2) + ' ' + x.getDate() + '/' + (x.getMonth() + 1); }
        // Cảnh báo / khóa gọi do Ban Quản Trị gửi -> hiện 1 lần
        function adminWarnings() {
            db().collection('call_warnings').where('user', '==', me()).onSnapshot(function (q) {
                var list = []; banW = 0; q.forEach(function (doc) { var x = doc.data(); if (x.banUntil > Date.now()) banW = Math.max(banW, x.banUntil); if (!x.seen) list.push({ id: doc.id, x: x }); }); setBan();
                if (!list.length) return; list.sort(function (a, b) { return (a.x.at || 0) - (b.x.at || 0); }); var w = list[list.length - 1];
                $('qc-aw-h').textContent = w.x.bot ? '🤖 Cảnh báo tự động' : 'Cảnh báo từ Ban Quản Trị';
                $('qc-aw-r').textContent = w.x.label || reasonLabel(w.x.reason) || 'Vi phạm quy định khi gọi';
                $('qc-aw-note').textContent = w.x.note || '';
                $('qc-aw-ban').textContent = w.x.banUntil && w.x.banUntil > Date.now() ? '🔒 Bạn bị khóa gọi thoại / video đến ' + fmtTime(w.x.banUntil) + '.' : '';
                $('qc-aw').hidden = false; $('qc-aw').dataset.ids = list.map(function (a) { return a.id; }).join(',');
            }, function () {});
        }
        /* ---------- 🤖 BOT KIỂM SOÁT CUỘC GỌI (tự chạy, không cần Admin) ----------
           settings/call_guard : bật / tắt + ngưỡng (Admin > Cuộc gọi > Bot kiểm soát)
           1. Báo cáo: đủ N NGƯỜI KHÁC NHAU báo cáo trong X ngày -> tự cảnh báo / khóa gọi 1 ngày / 7 ngày (1 người không tự khóa được ai)
           2. Gọi dồn dập: người nhận chưa trả lời ≥ K cuộc liên tiếp -> tự từ chối, tạm chặn người gọi gọi lại; lặp lại nhiều lần / ngày -> cảnh báo + khóa gọi vài giờ
           3. Gọi quá nhiều người trong thời gian ngắn -> tạm dừng gọi
           4. Nói / la hét quá to kéo dài -> nhắc nhở nhẹ trên màn hình chính người đó (không phạt, không ghi âm)
           Mọi việc bot làm ghi vào call_bot_log + call_warnings (by '🤖 Bot') để Admin xem lại. */
        var GD = { on: true, winDays: 30, warnAt: 1, ban1At: 2, ban7At: 3, missMax: 3, missMin: 30, spamWarn: 3, spamBanH: 3, rateMax: 8, rateMin: 10, loud: true, exempt: [], pardon: {} };
        // Admin can thiệp: exempt = danh sách được miễn bot; pardon[user] = lúc Admin gỡ chặn (bot bỏ qua mọi vi phạm trước mốc này)
        function ex(u) { return !!u && Array.isArray(GD.exempt) && GD.exempt.indexOf(u) >= 0; }
        function pd(u) { return (GD.pardon && +GD.pardon[u]) || 0; }
        var banA = 0, banW = 0;
        function setBan() { start.banUntil = Math.max(banA || 0, banW || 0); }
        function LSget(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
        function LSset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
        function botLog(o) { o.at = Date.now(); o.by = '🤖 Bot'; try { return db().collection('call_bot_log').add(o).catch(function () {}); } catch (e) { return Promise.resolve(); } }
        function dayKey(t) { var x = new Date(t || Date.now()); return x.getFullYear() + ('0' + (x.getMonth() + 1)).slice(-2) + ('0' + x.getDate()).slice(-2); }
        function accRef(user) { return db().collection('accounts').where('user', '==', user).limit(1).get().then(function (q) { return q.empty ? null : q.docs[0].ref; }).catch(function () { return null; }); }
        function botPunish(id, w, push) {   // ghi cảnh báo (mã cố định -> 2 máy cùng xét không bị trùng) + khóa gọi + đẩy thông báo
            var ref = db().collection('call_warnings').doc(id);
            if (ex(w.user)) return Promise.resolve(false);
            return db().collection('accounts').where('user', '==', w.user).limit(1).get().then(function (q) {
                var r = q.empty ? '' : q.docs[0].data().role; if (r === 'admin' || r === 'manager') return { exists: true };   // Ban Quản Trị: bot không phạt
                return ref.get();
            }).then(function (x) {
                if (x.exists) return false;
                w.by = '🤖 Bot'; w.bot = true; w.seen = false; w.at = w.at || Date.now();
                return ref.set(w).then(function () {
                    if (w.banUntil > Date.now()) accRef(w.user).then(function (r) { if (r) r.get().then(function (d) { if ((+d.data().callBanUntil || 0) < w.banUntil) r.update({ callBanUntil: w.banUntil }).catch(function () {}); }); });
                    if (push) { db().collection('push_broadcast').add({ title: '🤖 Cảnh báo tự động', body: 'Bạn bị ' + w.label + (w.banUntil > Date.now() ? '. Tạm khóa gọi đến ' + fmtTime(w.banUntil) + '.' : '. Tái phạm sẽ bị khóa gọi.'), target: w.user, status: 'pending', createdAt: Date.now(), by: '🤖 Bot' }).catch(function () {}); pingHook(); }
                    return true;
                });
            }).catch(function () { return false; });
        }
        // 1. Xét báo cáo -> trả về mô tả hành động nếu bot vừa xử lý
        function guardReports(user, push) {
            if (!GD.on || !user || ex(user)) return Promise.resolve('');
            var since = Math.max(Date.now() - GD.winDays * 864e5, pd(user));   // Admin gỡ chặn -> báo cáo cũ không tính lại
            return db().collection('call_reports').where('reported', '==', user).get().then(function (q) {
                var L = []; q.forEach(function (x) { var r = x.data(); r.id = x.id; if ((r.at || 0) >= since && r.status !== 'dismissed' && r.reporter && r.reporter !== user) L.push(r); });
                L.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
                var who = {}, n = 0, LV = [{ at: +GD.ban7At, days: 7, k: 'ban7', txt: 'khóa gọi 7 ngày' }, { at: +GD.ban1At, days: 1, k: 'ban1', txt: 'khóa gọi 1 ngày' }, { at: +GD.warnAt, days: 0, k: 'warn', txt: 'gửi cảnh báo' }];
                L.forEach(function (r) { if (who[r.reporter]) return; who[r.reporter] = r.reasonLabel || r.reason; n++; LV.forEach(function (l) { if (l.at > 0 && n === l.at) { l.r = r; l.n = n; } }); });
                var hit = LV.filter(function (l) { return l.r; })[0]; if (!hit) return '';
                var labels = {}; Object.keys(who).forEach(function (k) { labels[who[k]] = 1; });
                var w = { user: user, name: hit.r.reportedName || user, reason: hit.r.reason, label: (hit.r.reasonLabel || hit.r.reason) + ' — ' + hit.n + ' người báo cáo', reportId: hit.r.id, count: hit.n, rule: 'reports',
                    note: '🤖 Bot tự động: ' + hit.n + ' người khác nhau báo cáo bạn trong ' + GD.winDays + ' ngày (' + Object.keys(labels).join(', ') + ').' };
                if (hit.days) w.banUntil = Math.max(Date.now(), hit.r.at) + hit.days * 864e5;
                return botPunish('bot_' + user + '_' + hit.k + '_' + hit.r.id, w, push && Date.now() - hit.r.at < 3600e3).then(function (did) {
                    if (!did) return '';
                    db().collection('call_reports').doc(hit.r.id).update({ bot: hit.txt, botAt: Date.now() }).catch(function () {});
                    botLog({ kind: 'report', user: user, action: hit.txt, detail: hit.n + ' người báo cáo / ' + GD.winDays + ' ngày' });
                    return hit.txt;
                });
            }).catch(function () { return ''; });
        }
        // 2. Gọi dồn dập (xét trên máy người nhận)
        function missList(from) { var m = LSget('qd_call_miss', {}), t = Date.now(), w = GD.missMin * 6e4, p = pd(from); return (m[from] || []).filter(function (x) { return t - x < w && x > p; }); }
        function missClear(u) { var m = LSget('qd_call_miss', {}); if (m[u]) { delete m[u]; LSset('qd_call_miss', m); } }
        function spamCheck(id, c) {
            if (!GD.on || !(GD.missMax > 0) || ex(c.from)) return false;
            var L = missList(c.from), m = LSget('qd_call_miss', {});
            if (L.length >= GD.missMax) {
                var until = L[0] + GD.missMin * 6e4, mins = Math.max(1, Math.ceil((until - Date.now()) / 6e4)), nm = (State.fullName || me());
                db().collection('calls').doc(id).update({ status: 'declined', endedAt: Date.now(), reason: 'spam', coolUntil: until, bot: '🤖 Bot: ' + nm + ' chưa trả lời ' + L.length + ' cuộc gọi gần nhất của bạn. Tạm chặn gọi lại ' + mins + ' phút — hãy nhắn tin trước nhé.' }).catch(function () {});
                botLog({ kind: 'spam', user: c.from, target: me(), action: 'Tự từ chối, chặn gọi lại ' + mins + ' phút', detail: L.length + ' cuộc không trả lời / ' + GD.missMin + ' phút' }).then(function () { guardSpam(c.from); });
                return true;
            }
            L.push(Date.now()); m[c.from] = L; LSset('qd_call_miss', m); return false;
        }
        function guardSpam(user) {   // bị bot chặn gọi dồn dập nhiều lần / ngày -> cảnh báo + khóa gọi vài giờ
            if (!(GD.spamWarn > 0) || ex(user)) return;
            setTimeout(function () {
                db().collection('call_bot_log').where('user', '==', user).get().then(function (q) {
                    var n = 0, t = Date.now(); q.forEach(function (x) { var o = x.data(); if (o.kind === 'spam' && t - (o.at || 0) < 864e5 && (o.at || 0) > pd(user)) n++; }); n = Math.max(n, 1);   // lần vừa chặn chắc chắn tính
                    if (n < GD.spamWarn) return;
                    var w = { user: user, name: user, reason: 'spam', label: '📵 Gọi làm phiền liên tục', count: n, rule: 'spam', note: '🤖 Bot tự động: ' + n + ' lần gọi dồn dập khi người nhận không trả lời trong 24 giờ.' };
                    if (GD.spamBanH > 0) w.banUntil = t + GD.spamBanH * 3600e3;
                    botPunish('bot_' + user + '_spam_' + dayKey(), w, true).then(function (did) { if (did) botLog({ kind: 'spam-ban', user: user, action: GD.spamBanH > 0 ? 'Khóa gọi ' + GD.spamBanH + ' giờ' : 'Gửi cảnh báo', detail: n + ' lần / 24 giờ' }); });
                }).catch(function () {});
            }, 300);
        }
        function coolSet(u, until) { var m = LSget('qd_call_cool', {}); m[u] = +until || Date.now() + GD.missMin * 6e4; LSset('qd_call_cool', m); }
        function coolLeft(u) { var m = LSget('qd_call_cool', {}), t = +m[u] || 0; if (ex(me()) || pd(me()) > t - GD.missMin * 6e4) return 0; return t > Date.now() ? Math.ceil((t - Date.now()) / 6e4) : 0; }   // Admin gỡ chặn / miễn bot -> hết bị chặn gọi lại
        // 3. Gọi quá nhiều trong thời gian ngắn
        function rateCheck() {
            if (!GD.on || !(GD.rateMax > 0) || ex(me())) return 0;
            var t = Date.now(), w = GD.rateMin * 6e4, p0 = pd(me()), a = LSget('qd_call_rate', []).filter(function (x) { return t - x < w && x > p0; });
            if (a.length >= GD.rateMax) {
                if (t - (+LSget('qd_call_rate_log', 0)) > w) { LSset('qd_call_rate_log', t); botLog({ kind: 'rate', user: me(), action: 'Tạm dừng gọi', detail: a.length + ' cuộc / ' + GD.rateMin + ' phút' }); }
                return Math.max(1, Math.ceil((a[0] + w - t) / 6e4));
            }
            a.push(t); LSset('qd_call_rate', a); return 0;
        }
        function repCount(add) { var k = 'qd_rep_' + dayKey(), n = +LSget(k, 0); if (add) LSset(k, n + 1); return n; }
        // 4. Âm lượng: la hét to kéo dài -> nhắc nhở nhẹ (chỉ đo độ to trên máy, không nghe nội dung, không ghi âm)
        function botNote(msg) { var b = $('qc-botn'); b.textContent = msg; b.hidden = false; clearTimeout(botNote.t); botNote.t = setTimeout(function () { b.hidden = true; }, 6000); try { navigator.vibrate && navigator.vibrate(120); } catch (e) {} }
        function loudStart() {
            if (!GD.on || !GD.loud || !S || S.loud || !S.local || ex(me())) return; var tr = S.local.getAudioTracks()[0]; if (!tr) return;
            try {
                var AC = window.AudioContext || window.webkitAudioContext, ac = new AC(), an = ac.createAnalyser(); an.fftSize = 1024;
                ac.createMediaStreamSource(new MediaStream([tr])).connect(an); try { ac.resume(); } catch (e) {}
                var buf = new Float32Array(an.fftSize), hist = [], last = 0, s0 = S;
                S.loud = { ac: ac, n: 0, iv: setInterval(function () {
                    if (S !== s0 || !tr.enabled || tr.readyState !== 'live') { hist = []; return; }
                    an.getFloatTimeDomainData(buf); var sum = 0; for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
                    var dbfs = 10 * Math.log10(sum / buf.length + 1e-12); hist.push(dbfs > (GD.loudDb || -14) ? 1 : 0); if (hist.length > 20) hist.shift();
                    var on = 0; hist.forEach(function (v) { on += v; });
                    if (hist.length >= 20 && on >= 14 && Date.now() - last > 60000) {
                        last = Date.now(); hist = []; s0.loud.n++;
                        botNote('🤖 Bot: Bạn đang nói rất to — giữ bình tĩnh, trò chuyện văn minh nhé.');
                        if (s0.loud.n === 3) botLog({ kind: 'loud', user: me(), target: s0.peer, action: 'Nhắc nhở 3 lần', detail: 'La hét to kéo dài trong cuộc gọi' });
                    }
                }, 500) };
            } catch (e) {}
        }
        function loudStop(s) { if (s && s.loud) { clearInterval(s.loud.iv); try { s.loud.ac.close(); } catch (e) {} s.loud = null; } }
        function guardListen() {
            db().collection('settings').doc('call_guard').onSnapshot(function (x) { var c = x.exists ? x.data() : {}; Object.keys(c).forEach(function (k) { if (k in GD || k === 'loudDb') GD[k] = c[k]; }); }, function () {});
            var t0 = 0; db().collection('call_reports').where('reported', '==', me()).onSnapshot(function () { clearTimeout(t0); t0 = setTimeout(function () { guardReports(me(), false); }, 1500); }, function () {});
        }
        /* ---------- Nút trong cuộc gọi ---------- */
        function setFlag(k, v) { if (S && S.id) { var o = {}; o[k + (S.role === 'caller' ? 'From' : 'To')] = v; db().collection('calls').doc(S.id).update(o).catch(function () {}); } }
        function toggleMic() { var t = S && S.local && S.local.getAudioTracks()[0]; if (!t) return; t.enabled = !t.enabled; btn('mic', t.enabled, t.enabled ? 'fa-microphone' : 'fa-microphone-slash', t.enabled ? 'Micro' : 'Đã tắt mic'); setFlag('mic', t.enabled); }
        function toggleCam() {
            if (!S || S.type !== 'video') return; var t = S.local && S.local.getVideoTracks()[0];
            if (!t) {   // chưa có camera (nghe bằng giọng / không mở được) -> mở camera và gửi đi
                return media(true, S.facing).then(function (m) { var v = m.getVideoTracks()[0]; m.getAudioTracks().forEach(function (a) { a.stop(); }); if (!v) return; S.local.addTrack(v); var tr = S.pc.getTransceivers().filter(function (x) { return x.receiver.track && x.receiver.track.kind === 'video'; })[0]; if (tr && tr.sender) { tr.sender.replaceTrack(v); try { tr.direction = 'sendrecv'; } catch (e) {} } S.camOff = false; showLocal(); btn('cam', true, 'fa-video', 'Camera'); setFlag('cam', true); }).catch(mediaErr);
            }
            t.enabled = !t.enabled; S.camOff = !t.enabled; if (S.fx) S.fx.track.enabled = t.enabled; showLocal(); btn('cam', t.enabled, t.enabled ? 'fa-video' : 'fa-video-slash', t.enabled ? 'Camera' : 'Đã tắt cam'); setFlag('cam', t.enabled);
        }
        function sender(kind) { return S && S.pc ? S.pc.getSenders().filter(function (x) { return x.track && x.track.kind === kind; })[0] : null; }
        function flip() {
            if (!S || !S.local || S.screen) return; var old = S.local.getVideoTracks()[0]; if (!old) return;
            var want = S.facing === 'user' ? 'environment' : 'user'; old.stop();
            navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: want }, width: { min: 640, ideal: 1280 }, height: { min: 360, ideal: 720 }, frameRate: { ideal: 30 } } }).catch(function () { return navigator.mediaDevices.getUserMedia({ video: { facingMode: want, width: { ideal: 1280 }, height: { ideal: 720 } } }); }).then(function (m) {
                var v = m.getVideoTracks()[0]; sharpen(v); S.local.removeTrack(old); S.local.addTrack(v); S.facing = want; if (S.fx) { fxApply(S.fx.k); } else { var sd = sender('video'); if (sd) sd.replaceTrack(v); } showLocal(); S.tuned = false;
            }).catch(function () { toast('Không đổi được camera.', 'error'); });
        }
        function screenShare() {
            if (!S || S.type !== 'video' || !navigator.mediaDevices.getDisplayMedia) return;
            if (S.screen) return stopScreen();
            navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false }).then(function (m) {
                var v = m.getVideoTracks()[0], sd = sender('video') || (S.pc.getTransceivers().filter(function (x) { return x.receiver.track && x.receiver.track.kind === 'video'; })[0] || {}).sender;
                if (!sd) { m.getTracks().forEach(function (t) { t.stop(); }); return toast('Không chia sẻ được màn hình.', 'error'); }
                S.screen = m; try { v.contentHint = 'detail'; } catch (e) {} sd.replaceTrack(v); v.onended = stopScreen; S.tuned = false;
                layout(); btn('screen', false, 'fa-desktop', 'Dừng chia sẻ'); ui('live'); setFlag('cam', true);
            }).catch(function () {});
        }
        function stopScreen() {
            if (!S || !S.screen) return; var m = S.screen; S.screen = null; m.getTracks().forEach(function (t) { t.stop(); });
            var cam = S.local && S.local.getVideoTracks()[0], sd = sender('video') || (S.pc.getTransceivers().filter(function (x) { return x.receiver.track && x.receiver.track.kind === 'video'; })[0] || {}).sender;
            if (sd) sd.replaceTrack(S.fx ? S.fx.track : (cam || null)); S.tuned = false; showLocal(); btn('screen', true, 'fa-desktop', 'Chia sẻ MH'); ui('live'); setFlag('cam', !!(cam && cam.enabled));
        }
        function speaker() { if (!S || !Q || !Q.callMode) return; S.speaker = !S.speaker; try { Q.callMode(true, S.speaker); } catch (e) {} btn('spk', !S.speaker ? false : true, S.speaker ? 'fa-volume-high' : 'fa-phone-volume', S.speaker ? 'Loa ngoài' : 'Loa trong'); }
        /* ---------- Lắng nghe cuộc gọi đến ---------- */
        function bubble() { try { return !!(Q && Q.isBubble && Q.isBubble()) || d.documentElement.classList.contains('qd-bubble'); } catch (e) { return false; } }
        function listen() {
            if (listening || !me() || bubble()) return; listening = true;
            incoming.blocked = {};   // người mình đã chặn
            db().collection('call_blocks').where('by', '==', me()).onSnapshot(function (q) { var b = {}; q.forEach(function (x) { b[x.data().blocked] = 1; }); incoming.blocked = b; }, function () {});
            var refreshBan = function () { myBan().then(function (t) { banA = t; setBan(); }); }; refreshBan(); setInterval(refreshBan, 30 * 60000);   // khóa gọi do bot / Admin còn đến qua call_warnings (nghe trực tiếp)
            adminWarnings(); guardListen();
            db().collection('settings').doc('call_config').onSnapshot(function (x) { var c = x.exists ? x.data() : {}; cfgIce = Array.isArray(c.iceServers) && c.iceServers.length ? c.iceServers : null; }, function () {});
            db().collection('calls').where('to', '==', me()).onSnapshot(function (q) {
                (q.docChanges ? q.docChanges() : []).forEach(function (ch) {
                    if (ch.type === 'removed') return; var c = ch.doc.data(), id = ch.doc.id;
                    if (c.status === 'ringing' && Date.now() - (c.created || 0) < RING_MS - 2000 && c.from !== me() && !(S && S.id === id)) incoming(id, c);
                });
            }, function () { listening = false; });
        }
        function fromNotif(r) {   // bấm thông báo cuộc gọi: "call:<mã>[:accept|:decline]"
            var p = String(r).split(':'), id = p[1], act = p[2] || '';
            if (id === 'return') { if (S) { $('qd-call').classList.add('on'); wake(); } else if (window.QDGroupCall && QDGroupCall.active()) QDGroupCall.show(); return; }
            if (id === 'hangup' && !S && window.QDGroupCall && QDGroupCall.active()) return QDGroupCall.leave();
            if (id === 'hangup') { if (S) finish(S.mode === 'out' ? (S.id ? 'missed' : null) : 'ended', '', S.mode === 'out' ? 'missed' : null); return; }
            if (!id) return;
            var go = function () {
                if (S && S.id === id) { if (act === 'accept') accept(true); else if (act === 'decline') decline(); return; }
                db().collection('calls').doc(id).get().then(function (x) {
                    var c = x.exists ? x.data() : null;
                    if (!c || c.status !== 'ringing' || Date.now() - (c.created || 0) > RING_MS) { try { window.UI && UI.navigate('chat'); if (c && c.from && window.Chat && Chat.openFromNotif) Chat.openFromNotif(Utils.getRoomId(me(), c.from)); } catch (e) {} return toast('Cuộc gọi đã kết thúc.', 'info'); }
                    if (c.group && window.QDGroupCall) return QDGroupCall.invited(id, c, act);
                    incoming(id, c); if (act === 'accept') setTimeout(function () { accept(true); }, 300); else if (act === 'decline') decline();
                });
            };
            if (me()) go(); else { var n = 0; (function w() { if (me()) go(); else if (n++ < 60) setTimeout(w, 500); })(); }
        }
        /* ---------- Gắn vào trang ---------- */
        function boot() {
            if (booted) return; booted = true;
            var bar = $('qc-bar');
            bar.addEventListener('click', function (e) {
                var b = e.target.closest('.qc-b'); if (!b) return; var k = b.dataset.k; wake();
                if (k === 'accept') accept(S && S.type === 'video' ? false : true); else if (k === 'acceptv') accept(true); else if (k === 'decline') decline();
                else if (k === 'end') finish(S && S.mode === 'out' ? (S.id ? 'missed' : null) : 'ended', '', S && S.mode === 'out' ? 'missed' : null);
                else if (k === 'fx') fxToggle();
                else if (k === 'mic') toggleMic(); else if (k === 'cam') toggleCam(); else if (k === 'flip') flip(); else if (k === 'screen') screenShare(); else if (k === 'spk') speaker();
            });
            $('qd-call').addEventListener('pointerdown', function (e) { if (!e.target.closest('.qc-bar')) wake(); });
            $('qc-fit').addEventListener('click', function () { $('qd-call').classList.toggle('rv-contain'); });
            $('qc-repbtn').addEventListener('click', function (e) { e.stopPropagation(); repOpen(); });
            $('qc-rep-r').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b || !S) return; S.repReason = b.dataset.r; Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); }); $('qc-rep-st').textContent = ''; });
            $('qc-rep-cancel').addEventListener('click', function () { $('qc-rep').hidden = true; });
            $('qc-rep-send').addEventListener('click', repSend);
            $('qc-warn-ok').addEventListener('click', function () { $('qc-warn').hidden = true; });
            $('qc-aw-ok').addEventListener('click', function () { var ids = ($('qc-aw').dataset.ids || '').split(',').filter(Boolean); ids.forEach(function (id) { db().collection('call_warnings').doc(id).update({ seen: Date.now() }).catch(function () {}); }); $('qc-aw').hidden = true; });
            $('qc-fx').innerHTML = FX.map(function (x) { return '<button type="button" data-fx="' + x.k + '"><span>' + x.ic + '</span>' + x.n + '</button>'; }).join('');
            $('qc-fx').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; e.stopPropagation(); fxApply(b.dataset.fx || ''); wake(); });
            $('qc-pip').addEventListener('click', function (e) { e.stopPropagation(); if (S && S.mode === 'live' && S.rstream) { S.swap = !S.swap; layout(); wake(); } });
            // nút gọi trên đầu khung chat
            var hdr = d.querySelector('#chat-active-ui .chat-header .flex.gap-2.flex-shrink-0');
            if (hdr && !$('qc-btn-a')) {
                hdr.insertAdjacentHTML('afterbegin', '<button type="button" class="btn-icon qc-hbtn qc-a" id="qc-btn-a" title="Gọi thoại" aria-label="Gọi thoại" onclick="window.QDCall.start(\'audio\')"><i class="fa-solid fa-phone"></i></button><button type="button" class="btn-icon qc-hbtn qc-v" id="qc-btn-v" title="Gọi video" aria-label="Gọi video" onclick="window.QDCall.start(\'video\')"><i class="fa-solid fa-video"></i></button>');
            }
            var sync = function () { var t = window.State && State.chatTarget, on = !!t && t !== 'general' && !bubble(); ['qc-btn-a', 'qc-btn-v'].forEach(function (id) { var b = $(id); if (b) b.style.display = on ? '' : 'none'; }); };
            (function hook(n) {
                if (!window.Chat || !Chat.updateHeader) { if (n < 120) setTimeout(function () { hook(n + 1); }, 500); return; }
                var uh = Chat.updateHeader; Chat.updateHeader = function () { var r = uh.apply(this, arguments); sync(); return r; }; sync();
                if (Chat.openFromNotif) { var of = Chat.openFromNotif; Chat.openFromNotif = function (r) { if (/^call:/.test(String(r || ''))) return fromNotif(r); return of.apply(this, arguments); }; }
            })(0);
            var nf = window.__qdNotifOpen; if (typeof nf === 'function') window.__qdNotifOpen = function (r) { if (/^call:/.test(String(r || ''))) return fromNotif(r); return nf.apply(this, arguments); };
            d.addEventListener('visibilitychange', function () {
                if (!d.hidden || !S || Q || S.mode === 'in' || S.hidNoted) return; S.hidNoted = true;
                try { window.Notif && Notif.show && Notif.show('📞 Đang trong cuộc gọi với ' + (S.pname || nameOf(S.peer)), 'Chạm để quay lại cuộc gọi', 'call:return', S.peer); } catch (e) {}
            });
            window.addEventListener('pagehide', function () { if (S && S.id) { var up = S.mode === 'in' ? null : { status: S.liveAt ? 'ended' : 'missed', endedAt: Date.now(), endedBy: me() }; if (up) try { db().collection('calls').doc(S.id).update(up); } catch (e) {} } });
            (function wait(n) { if (window.firebase && firebase.apps && firebase.apps.length && me()) listen(); else if (n < 2000) setTimeout(function () { wait(n + 1); }, 1500); })(0);
        }
        if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
        /* ---- App: kiểm tra điện thoại đã sẵn sàng đổ chuông khi tắt app ---- */
        function readyInfo() { try { return Q && Q.callReady ? JSON.parse(Q.callReady()) : null; } catch (e) { return null; } }
        function readyRows(r) {
            var rows = [
                ['notif', r.notif, 'Cho phép thông báo', 'Không có thông báo thì không thể báo cuộc gọi đến'],
                ['call', r.call, 'Thông báo "Cuộc gọi đến" ở mức cao', 'Cho kêu chuông, hiện nổi trên màn hình'],
                ['fullscreen', r.fullscreen, 'Hiện toàn màn hình khi có cuộc gọi', 'Màn hình khóa vẫn bật lên giao diện nghe máy'],
                ['battery', r.battery, 'Không giới hạn pin', 'Chọn "Không hạn chế" để Android không tắt app khi chạy nền']
            ];
            if (r.xiaomi) rows.push(['autostart', null, 'Xiaomi / Redmi / POCO: Tự khởi chạy', 'Bật "Tự khởi chạy", "Hiện trên màn hình khóa", "Cửa sổ bật lên khi chạy nền"']);
            return rows;
        }
        function renderReady() {
            var r = readyInfo(); if (!r) return null;
            var html = readyRows(r).map(function (x) {
                var ok = x[1] === true, unk = x[1] == null;
                return '<button type="button" class="qcr-row' + (ok ? '' : ' no') + '" data-k="' + x[0] + '"><span class="qcr-ic">' + (ok ? '✓' : unk ? '!' : '✗') + '</span><span><b>' + x[2] + '</b><small>' + x[3] + '</small></span><span class="qcr-go">' + (ok ? 'Đã bật' : 'Mở cài đặt ›') + '</span></button>';
            }).join('');
            Array.prototype.forEach.call(d.querySelectorAll('[data-qcr-list]'), function (el) { el.innerHTML = html; });
            var set = $('qd-callready-set'); if (set) set.style.display = '';
            return r;
        }
        function readyNeeds(r) { return r && (!r.notif || !r.call || !r.fullscreen || !r.battery); }
        function bootReady() {
            if (!Q || !Q.callReady || bubble()) return;
            d.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.qcr-row'); if (!b) return; try { Q.openCallSetting(b.dataset.k); } catch (x) {} });
            d.addEventListener('visibilitychange', function () { if (!d.hidden) setTimeout(renderReady, 400); });   // quay lại từ Cài đặt -> cập nhật ✓
            (function wait(n) {
                if (!me()) { if (n < 200) setTimeout(function () { wait(n + 1); }, 1500); return; }
                var r = renderReady(), k = 'qd_callready_asked';
                var asked = false; try { asked = localStorage.getItem(k) === '1'; } catch (e) {}
                if (readyNeeds(r) && !asked) setTimeout(function () { try { localStorage.setItem(k, '1'); } catch (e) {} if (!S) UI.openModal('modal-callready'); }, 6000);
            })(0);
        }
        bootReady();
        return { start: start, accept: accept, decline: decline, end: function () { finish('ended', ''); }, fromNotif: fromNotif, _s: function () { return S; }, active: function () { return !!S; }, ready: renderReady, fx: function (k) { fxApply(k); } };
    })();
    
