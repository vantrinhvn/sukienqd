    /* Nhận diện link YouTube / TikTok -> { p: 'youtube'|'tiktok', id, v (dọc), t (giây bắt đầu), short (link rút gọn TikTok cần tra) } */
    window.QDVid = window.QDVid || (function () {
        function parse(u) {
            u = String(u || '').trim(); if (!u) return null;
            var m0 = u.match(/https?:\/\/[^\s"'<>]+/i); if (m0) u = m0[0];   // dán cả đoạn chữ kèm link -> lấy link
            if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
            var x; try { x = new URL(u); } catch (e) { return null; }
            var h = x.hostname.toLowerCase().replace(/^(www|m|music)\./, ''), path = x.pathname, id = '', m;
            var t = parseInt(String(x.searchParams.get('t') || x.searchParams.get('start') || '').replace(/s$/, ''), 10) || 0;
            if (h === 'youtu.be') id = path.split('/')[1] || '';
            else if (/(^|\.)youtube(-nocookie)?\.com$/.test(h)) {
                id = x.searchParams.get('v') || '';
                if (!id && (m = path.match(/^\/(shorts|embed|live|v|e)\/([\w-]{11})/))) id = m[2];
            }
            if (id && /^[\w-]{11}$/.test(id)) return { p: 'youtube', id: id, v: /^\/shorts\//.test(path), t: t, url: 'https://www.youtube.com/' + (/^\/shorts\//.test(path) ? 'shorts/' + id : 'watch?v=' + id) };
            if (/(^|\.)tiktok\.com$/.test(h)) {
                if ((m = path.match(/\/(video|v|embed\/v2|player\/v1)\/(\d{8,25})/))) return { p: 'tiktok', id: m[2], v: true, t: 0, url: u.split('?')[0] };
                if (/^(vm|vt)\.tiktok\.com$/.test(x.hostname.toLowerCase()) || /^\/t\/\w+/.test(path)) return { p: 'tiktok', id: '', v: true, t: 0, url: u.split('?')[0], short: true };
                if (/\/photo\//.test(path)) return { p: 'tiktok', bad: 'Bài ảnh TikTok không phát được, hãy dùng link video.' };
            }
            return null;
        }
        function embed(o, auto) {
            if (o.p === 'youtube') return 'https://www.youtube.com/embed/' + o.id + '?rel=0&playsinline=1&modestbranding=1&enablejsapi=1' + (location.origin && /^https?:/.test(location.origin) ? '&origin=' + encodeURIComponent(location.origin) : '') + (auto ? '&autoplay=1' : '') + (o.t ? '&start=' + o.t : '');
            return 'https://www.tiktok.com/player/v1/' + o.id + '?' + (auto ? 'autoplay=1&' : '') + 'music_info=1&description=1&rel=0&controls=1&progress_bar=1&play_button=1&volume_control=1&fullscreen_button=1&timestamp=1';
        }
        function thumb(o) { return o.p === 'youtube' ? 'https://i.ytimg.com/vi/' + o.id + '/hqdefault.jpg' : (o.thumb || ''); }
        // Tra tên / ảnh / mã video (link rút gọn TikTok) qua oEmbed; lỗi mạng -> trả {} (Admin tự nhập tên)
        function meta(o) {
            var enc = encodeURIComponent(o.url), list = o.p === 'tiktok'
                ? ['https://www.tiktok.com/oembed?url=' + enc, 'https://noembed.com/embed?url=' + enc]
                : ['https://noembed.com/embed?url=' + enc, 'https://www.youtube.com/oembed?format=json&url=' + enc];
            function one(i) {
                if (i >= list.length) return Promise.resolve({});
                var ac = window.AbortController ? new AbortController() : null, tm = setTimeout(function () { if (ac) ac.abort(); }, 7000);
                return fetch(list[i], ac ? { signal: ac.signal } : {}).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (j) {
                    clearTimeout(tm);
                    if (!j || j.error || !(j.title || j.html)) return one(i + 1);
                    var id = String(j.embed_product_id || ''), mm = String(j.html || '').match(/data-video-id="(\d+)"/) || String(j.url || '').match(/\/video\/(\d+)/);
                    if (!id && mm) id = mm[1];
                    return { title: String(j.title || '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim(), author: String(j.author_name || '').trim(), thumb: /^https:\/\//.test(j.thumbnail_url || '') ? j.thumbnail_url : '', id: id };
                });
            }
            return one(0);
        }
        function name(p) { return p === 'youtube' ? 'YouTube' : 'TikTok'; }
        return { parse: parse, embed: embed, thumb: thumb, meta: meta, name: name };
    })();
    
