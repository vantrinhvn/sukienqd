    (function () {
        var d = document, D = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        if (!D || !D.set) return;
        function p2(n) { return (n < 10 ? '0' : '') + n; }
        function sel(max, title) {
            var s = d.createElement('select'), h = '<option value="">--</option>';
            for (var i = 0; i <= max; i++) h += '<option value="' + p2(i) + '">' + p2(i) + '</option>';
            s.innerHTML = h; s.title = title; s.setAttribute('aria-label', title); return s;
        }
        function enhance(inp) {
            if (inp.__t24) return;
            var type = (inp.getAttribute('type') || '').toLowerCase();
            if (type !== 'time' && type !== 'datetime-local') return;
            inp.__t24 = true;
            var dt = type === 'datetime-local';
            var w = d.createElement('div'); w.className = 't24' + (dt ? ' t24-dt' : '');
            var di = null;
            if (dt) { di = d.createElement('input'); di.type = 'date'; di.setAttribute('aria-label', 'Ngày'); w.appendChild(di); }
            var hs = sel(23, 'Giờ (00 - 23)'), ms = sel(59, 'Phút'), colon = d.createElement('span');
            colon.textContent = ':';
            w.appendChild(hs); w.appendChild(colon); w.appendChild(ms);
            var x = null;
            if (dt) { x = d.createElement('button'); x.type = 'button'; x.className = 't24-x'; x.title = 'Xóa (để trống)'; x.innerHTML = '&#10005;'; w.appendChild(x); }
            // giữ bề rộng như ô cũ: ô có width cố định -> giữ; còn lại giãn đầy
            var wd = inp.style.width; if (wd && !/100%/.test(wd)) w.style.minWidth = wd; else w.classList.add('t24-full');
            inp.classList.add('t24-src'); inp.parentNode.insertBefore(w, inp);
            inp.__t24w = w;

            function raw() { return D.get.call(inp) || ''; }
            function sync() {
                var v = raw(), m;
                if (dt) {
                    m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(v);
                    di.value = m ? m[1] : ''; hs.value = m ? m[2] : ''; ms.value = m ? m[3] : '';
                    x.style.visibility = m ? 'visible' : 'hidden';
                } else {
                    m = /^(\d{2}):(\d{2})/.exec(v);
                    hs.value = m ? m[1] : ''; ms.value = m ? m[2] : '';
                }
            }
            function commit(clear) {
                var h = hs.value, mi = ms.value, v = '';
                if (dt) {
                    var dv = clear ? '' : di.value;
                    if (dv) { if (!h) h = '00'; if (!mi) mi = '00'; v = dv + 'T' + h + ':' + mi; }
                } else if (h) { if (!mi) mi = '00'; v = h + ':' + mi; }
                if (v === raw()) { sync(); return; }
                D.set.call(inp, v); sync();
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
            }
            hs.addEventListener('change', function () { if (!hs.value) ms.value = ''; commit(); });
            ms.addEventListener('change', function () { commit(); });
            if (di) di.addEventListener('change', function () { commit(); });
            if (x) x.addEventListener('click', function () { commit(true); });
            // code cũ gán .value = '...' -> ô 24h tự hiện theo
            Object.defineProperty(inp, 'value', { configurable: true, enumerable: true,
                get: function () { return D.get.call(this); },
                set: function (v) { D.set.call(this, v); sync(); } });
            inp.focus = function () { (di || hs).focus(); };
            function dis() {
                var off = inp.disabled || inp.readOnly;
                w.classList.toggle('t24-dis', off);
                [hs, ms, di, x].forEach(function (e) { if (e) e.disabled = off; });
                if (inp.title) w.title = inp.title;
            }
            new MutationObserver(dis).observe(inp, { attributes: true, attributeFilter: ['disabled', 'readonly', 'title'] });
            dis(); sync();
        }
        function scan(root) {
            if (!root || !root.querySelectorAll) return;
            if (root.matches && root.matches('input[type="time"], input[type="datetime-local"]')) enhance(root);
            var l = root.querySelectorAll('input[type="time"], input[type="datetime-local"]');
            for (var i = 0; i < l.length; i++) enhance(l[i]);
        }
        function start() {
            scan(d.body);
            new MutationObserver(function (ms) {
                for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) { var n = ms[i].addedNodes[j]; if (n.nodeType === 1) scan(n); }
            }).observe(d.body, { childList: true, subtree: true });
        }
        if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
    })();
    
