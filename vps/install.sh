#!/usr/bin/env bash
# =====================================================================================
#  QD ELITE — CÀI MÁY CHỦ RIÊNG LÊN VPS (Ubuntu 22.04 / 24.04), chạy bằng quyền root:
#    curl -fsSL https://raw.githubusercontent.com/vantrinhvn/sukienqd/main/vps/install.sh | bash
#  Làm gì:
#    1. Cài Node.js 22 + Caddy (tự lấy chứng chỉ https miễn phí) + sqlite3
#    2. Tải máy chủ QD (vps/server.js) về /opt/qd, dữ liệu ở /var/lib/qd
#    3. Tạo dịch vụ qd (tự chạy lại khi lỗi / khởi động lại VPS)
#    4. Tên miền: <IP-nối-bằng-gạch>.sslip.io (miễn phí, tự trỏ về IP), https qua Caddy
#    5. Sao lưu dữ liệu mỗi đêm (giữ 14 ngày) ở /var/lib/qd/backup
#    6. Tạo tài khoản Admin đầu tiên (hỏi tên + mật khẩu)
#  Chạy lại lệnh này bất cứ lúc nào để cập nhật máy chủ (không mất dữ liệu).
# =====================================================================================
set -euo pipefail
REPO_RAW="https://raw.githubusercontent.com/vantrinhvn/sukienqd/main/vps"
APP=/opt/qd; DATA=/var/lib/qd; PORT=8787
G='\033[1;32m'; Y='\033[1;33m'; R='\033[1;31m'; N='\033[0m'
say() { echo -e "${G}==>${N} $*"; }
warn() { echo -e "${Y}!! ${N}$*"; }
die() { echo -e "${R}LỖI:${N} $*"; exit 1; }

[ "$(id -u)" = 0 ] || die "Cần chạy bằng root (gõ: sudo -i rồi dán lại lệnh)."
. /etc/os-release 2>/dev/null || true
case "${ID:-}" in ubuntu|debian) ;; *) warn "Hệ điều hành ${PRETTY_NAME:-lạ} — lệnh cài viết cho Ubuntu/Debian, vẫn thử tiếp...";; esac
export DEBIAN_FRONTEND=noninteractive

say "1/6 Cập nhật hệ thống + gói cần thiết"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg sqlite3 debian-keyring debian-archive-keyring apt-transport-https >/dev/null

say "2/6 Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -e "require('node:sqlite')" 2>/dev/null || die "Node $(node -v) chưa có node:sqlite (cần Node 22.5 trở lên)."
echo "    Node $(node -v)"

say "3/6 Caddy (https tự động)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

say "4/6 Tải máy chủ QD"
id qd >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin qd
mkdir -p "$APP" "$DATA/backup"
curl -fsSL "$REPO_RAW/server.js?t=$(date +%s)" -o "$APP/server.next.js"
node --check "$APP/server.next.js" || die "Tải server.js lỗi"
mv "$APP/server.next.js" "$APP/server.js"
chown -R qd:qd "$DATA" "$APP"   # máy chủ tự cập nhật được từ trang Admin
cat > /etc/systemd/system/qd.service <<EOF
[Unit]
Description=QD Elite server
After=network-online.target
Wants=network-online.target

[Service]
User=qd
Group=qd
Environment=PORT=$PORT
Environment=DATA=$DATA
ExecStart=/usr/bin/node --no-warnings $APP/server.js
Restart=always
RestartSec=2
LimitNOFILE=65535
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA $APP

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now qd >/dev/null 2>&1
systemctl restart qd
for i in $(seq 1 20); do curl -fs "http://127.0.0.1:$PORT/health" >/dev/null && break; sleep 0.5; done
curl -fs "http://127.0.0.1:$PORT/health" >/dev/null || { journalctl -u qd -n 30 --no-pager; die "Máy chủ QD không chạy được"; }

say "5/6 Tên miền + https"
IP=$(curl -fs4 https://api.ipify.org || curl -fs4 https://ifconfig.me || hostname -I | awk '{print $1}')
DOMAIN="${DOMAIN:-$(echo "$IP" | tr . -).sslip.io}"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    encode gzip
    reverse_proxy 127.0.0.1:$PORT
    header -Server
}
EOF
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi
systemctl enable caddy >/dev/null 2>&1; systemctl restart caddy

# Gỡ mạng VPN (WireGuard) nếu bản thử nghiệm trước đã cài (đã bỏ tính năng này)
if [ -f /etc/wireguard/wg0.conf ] && grep -q "QD Elite" /etc/wireguard/wg0.conf 2>/dev/null; then
  systemctl disable --now wg-quick@wg0 >/dev/null 2>&1 || true
  rm -f /etc/wireguard/wg0.conf /etc/wireguard/qd-server.key /etc/sysctl.d/99-qd-vpn.conf
  sysctl -q -w net.ipv4.ip_forward=0 >/dev/null 2>&1 || true
  if command -v ufw >/dev/null; then ufw delete allow 51820/udp >/dev/null 2>&1 || true; fi
  echo "    Đã gỡ mạng VPN thử nghiệm"
fi
rm -f "$DATA/vpn.json" "$DATA/vpn-peers.json"

# Sao lưu mỗi đêm 3:30 (giữ 14 ngày) + lệnh tiện ích "qd"
cat > /usr/local/bin/qd <<'EOF'
#!/usr/bin/env bash
# Lệnh tiện ích máy chủ QD:  qd status | qd logs | qd backup | qd update | qd admin <tên> <mật khẩu>
DATA=/var/lib/qd; PORT=8787
case "${1:-status}" in
  status) systemctl is-active qd caddy; curl -fs http://127.0.0.1:$PORT/health; echo; grep -m1 -v '^\s*$' /etc/caddy/Caddyfile | sed 's/ {//;s/^/https:\/\//';;
  logs) journalctl -u qd -n ${2:-100} --no-pager;;
  backup) f="$DATA/backup/qd-$(date +%Y%m%d-%H%M%S)-tay.db"; sqlite3 "$DATA/qd.db" ".backup '$f'" && gzip -f "$f" && chown qd:qd "$f.gz" && echo "Đã sao lưu: $f.gz";;
  update) curl -fsSL https://raw.githubusercontent.com/vantrinhvn/sukienqd/main/vps/install.sh | bash;;
  admin) [ -n "${2:-}" ] && [ -n "${3:-}" ] || { echo "Cách dùng: qd admin <tên đăng nhập> <mật khẩu>"; exit 1; }
    node -e '
      const [u, p] = process.argv.slice(1), now = Date.now();
      fetch("http://127.0.0.1:'$PORT'/api/query", { method: "POST", body: JSON.stringify({ q: { col: "accounts", where: [["user", "==", u]] } }) }).then(r => r.json()).then(r => {
        const id = (r.docs && r.docs[0] && r.docs[0].id) || "admin_" + u.replace(/[^a-zA-Z0-9_]/g, "");
        const data = r.docs && r.docs[0] ? { pass: p, role: "admin", isBlocked: false, owner: true } : { user: u, pass: p, role: "admin", fullName: "Ban Quản Trị", points: 0, created_at: now, createdAt: now, lastActive: 0, isBlocked: false, owner: true };
        return fetch("http://127.0.0.1:'$PORT'/api/commit", { method: "POST", body: JSON.stringify({ writes: [{ op: "set", path: "accounts/" + id, data, merge: true }] }) }).then(r => r.json()).then(x => console.log(x.ok ? "Đã tạo / cập nhật Chủ hệ thống (toàn quyền): " + u : "Lỗi: " + JSON.stringify(x)));
      });' "$2" "$3";;
  *) echo "Lệnh: qd status | qd logs | qd backup | qd update | qd admin <tên> <mật khẩu>";;
esac
EOF
chmod +x /usr/local/bin/qd
rm -f /etc/cron.d/qd-backup   # máy chủ tự sao lưu lúc 3:30 mỗi đêm (giữ 14 ngày)

say "6/6 Tài khoản Admin"
HAS=$(curl -fs -X POST "http://127.0.0.1:$PORT/api/query" -d '{"q":{"col":"accounts","where":[["role","==","admin"]],"limit":1}}' | grep -c '"id"' || true)
if [ "$HAS" = "0" ]; then
  if [ -r /dev/tty ]; then
    read -r -p "  Tên đăng nhập Admin [admin]: " AU </dev/tty || true; AU=${AU:-admin}
    while :; do read -r -s -p "  Mật khẩu Admin (ít nhất 6 ký tự): " AP </dev/tty; echo; [ ${#AP} -ge 6 ] && break; echo "  Quá ngắn, nhập lại."; done
    /usr/local/bin/qd admin "$AU" "$AP"
  else warn "Không hỏi được mật khẩu. Tạo Admin sau bằng lệnh: qd admin <tên> <mật khẩu>"; fi
else echo "    Đã có Admin, bỏ qua."; fi

echo
for i in $(seq 1 30); do curl -fs "https://$DOMAIN/health" >/dev/null 2>&1 && break; sleep 2; done
if curl -fs "https://$DOMAIN/health" >/dev/null 2>&1; then
  echo -e "${G}✅ XONG!${N} Máy chủ QD đang chạy: ${G}https://$DOMAIN${N}"
  echo "   Kết nối của trang web / app: wss://$DOMAIN/ws"
else
  warn "Máy chủ đã chạy nhưng https chưa sẵn sàng (Caddy đang lấy chứng chỉ, hoặc cổng 80/443 bị chặn ở tường lửa nhà cung cấp)."
  echo "   Thử lại sau 1 phút: curl https://$DOMAIN/health   ·   Xem lỗi: journalctl -u caddy -n 50 --no-pager"
fi
echo "   Lệnh tiện ích: qd status · qd logs · qd backup · qd update · qd admin <tên> <mật khẩu>"
