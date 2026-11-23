                    (function hook(n) {   // Admin > Lì Xì: danh sách lỗi rút lì xì (app_errors where == 'lixi')
                        if (!window.firebase || !firebase.apps || !firebase.apps.length) { if (n < 240) setTimeout(function () { hook(n + 1); }, 500); return; }
                        var H = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }, on = false;
                        function go() {
                            if (on) return; on = true;
                            firebase.firestore().collection('app_errors').orderBy('at', 'desc').limit(300).onSnapshot(function (q) {
                                var L = []; q.forEach(function (d) { L.push(d.data()); }); L.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
                                var day = Date.now() - 864e5; document.getElementById('lx-err-n').textContent = L.length ? '· 24 giờ qua: ' + L.filter(function (x) { return x.at > day; }).length : '';
                                document.getElementById('tb-lx-err').innerHTML = L.length ? L.slice(0, 200).map(function (x) { var d = new Date(x.at || 0);
                                    return '<tr><td style="white-space:nowrap">' + d.toLocaleString('vi-VN') + '</td><td><b>@' + H(x.user) + '</b></td><td>' + ({ lixi: '🧧 Rút lì xì', shop: '🏪 Đổi quà', cashout: '💵 Đổi tiền' }[x.where] || H(x.where)) + '</td><td><span style="color:#ef4444;font-weight:800">' + H(x.code) + '</span>' + (x.online === false ? ' <small class="text-muted">(mất mạng)</small>' : '') + '</td><td class="text-sm text-muted" style="max-width:420px;word-break:break-word">' + H(x.msg) + '</td></tr>'; }).join('')
                                    : '<tr><td colspan="5" class="text-center text-muted py-6">Chưa có lỗi nào 👍</td></tr>';
                            }, function (e) { document.getElementById('tb-lx-err').innerHTML = '<tr><td colspan="4" class="text-center text-danger py-6">Không đọc được (' + H(e && e.code) + ')</td></tr>'; });
                        }
                        (function nav(k) { if (typeof UI === 'undefined' || !UI.navigate) { if (k < 240) setTimeout(function () { nav(k + 1); }, 500); return; } var o = UI.navigate; UI.navigate = function (v) { var r = o.apply(this, arguments); if (v === 'lixi') go(); return r; }; })(0);
                    })(0);
                    
