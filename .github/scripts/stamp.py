"""Đóng dấu phiên bản cho file JS / CSS trong các trang HTML: ?v=<8 ký tự mã băm nội dung>.

Sửa file nào (u/*.js, u/user.css, qd-ui.css, qd-db.js...) thì chạy lại lệnh này: trang sẽ trỏ tới ?v= mới,
trình duyệt + service worker (sw.js giữ file có ?v= lâu dài) tải đúng bản mới, không lẫn bản cũ.
Chạy:  python3 .github/scripts/stamp.py          (sửa luôn các trang)
       python3 .github/scripts/stamp.py --check  (chỉ kiểm tra, lệch thì thoát mã 1)
"""
import glob, hashlib, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REF = re.compile(r'''((?:src|href)=\\?["'])([\w./-]+\.(?:js|css))\?v=([\w.-]*)(\\?["'])''')
check = '--check' in sys.argv
_cache = {}


def digest(rel):
    if rel not in _cache:
        p = os.path.join(ROOT, rel)
        _cache[rel] = hashlib.sha1(open(p, 'rb').read()).hexdigest()[:8] if os.path.isfile(p) else None
    return _cache[rel]


stale = []
for page in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    s = open(page, encoding='utf-8').read()

    def fix(m):
        h = digest(m.group(2))
        if not h or h == m.group(3):
            return m.group(0)
        stale.append('%s: %s ?v=%s -> %s' % (os.path.basename(page), m.group(2), m.group(3), h))
        return m.group(1) + m.group(2) + '?v=' + h + m.group(4)

    t = REF.sub(fix, s)
    if t != s and not check:
        open(page, 'w', encoding='utf-8').write(t)

print('\n'.join(stale) if stale else 'Dấu phiên bản đã đúng.')
sys.exit(1 if (check and stale) else 0)
