    /* Nghe thử tiếng tin nhắn / chuông cuộc gọi (Cài đặt). App Android: phát đúng tiếng của app (bản có previewSound);
       app bản cũ chưa có tiếng mới -> nói rõ cần cập nhật app và mở kiểm tra bản mới. */
    window.QDSnd = (function () {
        var Q = window.QDNative || null, au = {}, stopT = 0;
        function st(t, cls) { var e = document.getElementById('qd-snd-st'); if (e) { e.textContent = t || ''; e.className = 'text-sm font-bold ' + (cls || 'text-muted'); } }
        function web(kind) {
            var src = kind === 'ring' ? 'media/qd-ring.mp3?v=3' : 'media/qd-msg.mp3?v=2';
            try { var a = au[kind] = au[kind] || new Audio(src); a.currentTime = 0; var p = a.play(); if (p && p.catch) p.catch(function () {}); if (kind === 'ring') { clearTimeout(stopT); stopT = setTimeout(function () { try { a.pause(); } catch (e) {} }, 4500); } } catch (e) {}
        }
        function newApp() { return !!(Q && typeof Q.previewSound === 'function'); }
        function test(kind) {
            if (Q && !newApp()) {   // app bản cũ: tiếng của app vẫn là tiếng cũ
                if (kind === 'ring' && typeof Q.ringStart === 'function') { try { Q.ringStart(); clearTimeout(stopT); stopT = setTimeout(function () { try { Q.ringStop(); } catch (e) {} }, 4500); } catch (e) {} }
                else web(kind);
                st('⚠️ App trên máy này là bản cũ (' + (function () { try { return 'v' + Q.appVersion(); } catch (e) { return '?'; } })() + ') — chuông cuộc gọi và tiếng tin nhắn khi thoát app vẫn là tiếng cũ. Thoát hẳn app rồi mở lại, bấm "Cập nhật" khi app hỏi.', 'text-warning');
                return;
            }
            if (newApp()) { try { Q.previewSound(kind); } catch (e) {} st(kind === 'ring' ? '📞 Đang phát chuông cuộc gọi (4 giây). Máy để Rung / Im lặng thì chỉ rung / không kêu.' : '💬 Tiếng tin nhắn. Máy để Rung / Im lặng thì chỉ rung / không kêu.'); return; }
            web(kind); st(kind === 'ring' ? '📞 Chuông cuộc gọi (4 giây).' : '💬 Tiếng tin nhắn.');
        }
        return { test: test, newApp: newApp };
    })();
    
