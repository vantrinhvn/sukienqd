"""Tạo app-update.json cho app Android QD Elite (cập nhật nóng, không cần cài lại APK).

Danh sách mọi file web trong kho + mã băm git (blob sha) + kích thước.
App đọc file này, so với bản đang dùng, chỉ tải những file đã đổi (theo đúng commit, kiểm tra mã băm).
Chạy: python3 .github/scripts/app-update.py <commit-sha> [số phiên bản]
"""
import json, os, subprocess, sys, time

EXTS = ('.html', '.htm', '.js', '.css', '.json', '.txt', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico',
        '.mp3', '.ogg', '.wav', '.m4a', '.mp4', '.webm', '.woff', '.woff2', '.ttf')
SKIP = {'app-update.json'}

commit = sys.argv[1] if len(sys.argv) > 1 else subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip()
number = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 0   # số lần chạy (tự tăng mỗi lần đẩy)
# Tên phiên bản hiển thị: bắt đầu từ 1.1.0.0 (lần chạy thứ 9), mỗi lần đẩy file lên tăng số cuối: 1.1.0.1, 1.1.0.2...
PREFIX, BASE = '1.1.0.', 9
name = PREFIX + str(max(0, number - BASE)) if number else ''
raw = subprocess.check_output(['git', '-c', 'core.quotepath=off', 'ls-files', '-s', '-z']).decode('utf-8')
files = {}
for item in raw.split('\0'):
    if not item:
        continue
    meta, path = item.split('\t', 1)
    mode, sha, _stage = meta.split()
    if path.endswith('-ngang.mp4'):   # video ngang chỉ dành cho máy tính: app (điện thoại) không cần tải
        continue
    if mode == '160000' or path.startswith('.') or '/.' in path or path in SKIP or not path.lower().endswith(EXTS):
        continue
    files[path] = {'sha': sha, 'size': os.path.getsize(path)}

msg = subprocess.check_output(['git', 'log', '-1', '--format=%s', commit]).decode('utf-8').strip()
out = {
    'version': commit[:7],
    'number': number,
    'name': name,
    'commit': commit,
    'message': msg[:300],
    'time': int(time.time() * 1000),
    'files': dict(sorted(files.items())),
}
with open('app-update.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
    f.write('\n')
print(f"app-update.json: {len(files)} file · phiên bản v{name} (lần {number}, {out['version']}) · {msg[:80]}")
