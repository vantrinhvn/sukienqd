        /* Gộp cập nhật dồn dập: dữ liệu đổi liên tục (vd. thành viên quay / điểm danh liên tục) thì bảng chỉ vẽ lại
           tối đa 1 lần mỗi "ms" mili-giây, luôn theo bản dữ liệu MỚI NHẤT (bản cũ hơn bỏ qua). Lần đầu vẽ ngay. */
        window.qdCoalesce = window.qdCoalesce || function (fn, ms) {
            let last = 0, timer = 0, args = null, self = null;
            const run = () => { timer = 0; const a = args; args = null; last = Date.now(); fn.apply(self, a); };
            return function () { args = arguments; self = this; if (!timer) timer = setTimeout(run, Math.max(0, last + ms - Date.now())); };
        };
        window.qdSlow = window.qdSlow || function (ref, ms) { return { onSnapshot: (fn, err) => ref.onSnapshot(qdCoalesce(fn, ms), err) }; };
        /* Bảng lịch sử dài (data-cap="200" trên <tbody>): chỉ đưa 200 dòng mới nhất vào trang, các dòng cũ hơn giữ sẵn,
           bấm "Hiện tất cả" mới thêm vào. Bảng hàng nghìn dòng làm chuyển mục / vẽ lại rất chậm. Xuất báo cáo vẫn đủ dữ liệu. */
        window.qdRow = window.qdRow || (() => {
            document.addEventListener('click', e => {
                const b = e.target.closest && e.target.closest('.qd-more-btn'); if (!b) return;
                const tb = b.closest('tbody'); if (!tb || !tb.qdRest) return;
                const rest = tb.qdRest; tb.qdRest = null; tb.classList.add('qd-all');
                if (tb.qdMore) tb.qdMore.remove(); tb.qdMore = null;
                tb.insertAdjacentHTML('beforeend', rest.join(''));
            });
            const label = tb => { if (tb.qdMore && tb.qdRest) tb.qdMore.querySelector('b').textContent = tb.qdRest.length.toLocaleString('vi-VN'); };
            return (tb, html) => {
                if (!tb) return;
                if (!tb.firstElementChild) { tb.qdRest = null; tb.qdMore = null; }   // bảng vừa xóa để vẽ lại
                const cap = +tb.getAttribute('data-cap') || 0;
                if (!cap || tb.classList.contains('qd-all') || (!tb.qdRest && tb.childElementCount < cap)) { tb.insertAdjacentHTML('beforeend', html); return; }
                if (!tb.qdRest) {
                    tb.qdRest = [];
                    tb.insertAdjacentHTML('beforeend', '<tr class="qd-more"><td colspan="99"><span>Đang hiện ' + cap + ' dòng mới nhất · còn <b>0</b> dòng cũ hơn</span><button type="button" class="btn btn-outline qd-more-btn"><i class="fa-solid fa-angles-down"></i> Hiện tất cả</button></td></tr>');
                    tb.qdMore = tb.lastElementChild;
                }
                tb.qdRest.push(html);
                if (!tb.qdLbl) { tb.qdLbl = 1; Promise.resolve().then(() => { tb.qdLbl = 0; label(tb); }); }
            };
        })();

        /** FIREBASE INIT */
        const firebaseConfig = { apiKey: "AIzaSyCtn0peiXBsrRRgUZSSVQFrBe-RGgxS6eQ", projectId: "web-dangky-123" };
        firebase.initializeApp(firebaseConfig); const db = firebase.firestore();

        const State = {
            todayStr: new Date().toLocaleDateString('vi-VN'),
            attendanceCache: [], 
            regCache: [], 
            luckyNumberHistoryCache: [], 
            currentLuckyNumbers: [],     
            wheelHistoryCache: [], 
            tranhThuongHistoryCache: [],
            accountsCache: [], 
            pointShopHistoryCache: [],
            rpsHistoryCache: [],
            accountConfig: null, 
            activeDeleteAction: null,
            defaultWheelPrizes: [
                { id: 'm10', text: '10.000 VNĐ', qty: 20, chance: 12 },
                { id: 'w1', text: 'Lời Chúc Tết', qty: null, chance: 27 },
                { id: 'm20', text: '20.000 VNĐ', qty: 10, chance: 6 },
                { id: 'w2', text: 'Lời Chúc Tết', qty: null, chance: 27 },
                { id: 'm50', text: '50.000 VNĐ', qty: 3, chance: 2 },
                { id: 'w3', text: 'Lời Chúc Tết', qty: null, chance: 26 }
            ],
            defaultTranhThuongPrizes: [
                { id: 'm10', text: '10.000 VNĐ', qty: 20, chance: 15 },
                { id: 'm20', text: '20.000 VNĐ', qty: 10, chance: 8 },
                { id: 'm50', text: '50.000 VNĐ', qty: 3, chance: 2 },
                { id: 'luck', text: 'Lời Chúc Tết', qty: null, chance: 75 }
            ]
        };

        const Utils = {
            toast: (message, type = 'success') => {
                const container = document.getElementById('toast-container'); const t = document.createElement('div');
                t.className = `toast ${type}`;
                let iconStr = 'fa-circle-check'; let titleStr = 'Thành công';
                if(type === 'error') { iconStr = 'fa-circle-xmark'; titleStr = 'Thất bại'; }
                if(type === 'warning') { iconStr = 'fa-triangle-exclamation'; titleStr = 'Cảnh báo'; }
                if(type === 'info') { iconStr = 'fa-circle-info'; titleStr = 'Thông báo'; }
                t.innerHTML = `<div class="toast-icon"><i class="fa-solid ${iconStr}"></i></div><div class="toast-content"><span class="toast-title">${titleStr}</span><span class="toast-message">${message}</span></div>`;
                container.appendChild(t); void t.offsetWidth; t.classList.add('show');
                setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
            },
            // Trạng thái hoạt động thời gian thực (khối QD Session): bảng tài khoản tự chạy "Hoạt động x phút trước"
            timeAgo: (timestamp, online) => {
                if (window.QDSession) return timestamp ? window.QDSession.pres({ lastActive: timestamp, online: online }).text : "Chưa từng đăng nhập";
                if (!timestamp) return "Chưa từng đăng nhập";
                const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
                if (diffSeconds < 300) return "Đang trực tuyến"; 
                if (diffSeconds < 3600) return `Hoạt động ${Math.floor(diffSeconds / 60)} phút trước`;
                if (diffSeconds < 86400) return `Hoạt động ${Math.floor(diffSeconds / 3600)} giờ trước`;
                const d = new Date(timestamp); return `Trực tuyến ${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
            },
            buildTimeSelects: () => {
                let hOpts = ''; for(let i=0; i<=23; i++) hOpts += `<option value="${i.toString().padStart(2,'0')}">${i.toString().padStart(2,'0')}</option>`;
                let mOpts = ''; for(let i=0; i<=59; i+=5) mOpts += `<option value="${i.toString().padStart(2,'0')}">${i.toString().padStart(2,'0')}</option>`;
                document.getElementById('cfg-start-h').innerHTML = hOpts; document.getElementById('cfg-end-h').innerHTML = hOpts;
                document.getElementById('cfg-start-m').innerHTML = mOpts; document.getElementById('cfg-end-m').innerHTML = mOpts;
                
                const rpsSH = document.getElementById('cfg-rps-start-h'); if(rpsSH) rpsSH.innerHTML = hOpts;
                const rpsEH = document.getElementById('cfg-rps-end-h'); if(rpsEH) rpsEH.innerHTML = hOpts;
                const rpsSM = document.getElementById('cfg-rps-start-m'); if(rpsSM) rpsSM.innerHTML = mOpts;
                const rpsEM = document.getElementById('cfg-rps-end-m'); if(rpsEM) rpsEM.innerHTML = mOpts;
            },
            setSelectorsFrom24H: (timeString, prefix) => {
                if(!timeString) return; const parts = timeString.split(':'); if(parts.length !== 2) return;
                let h = parseInt(parts[0]); let m = parseInt(parts[1]);
                m = Math.round(m / 5) * 5; if(m === 60) { m = 0; h = (h + 1) % 24; }
                const hEl = document.getElementById(`${prefix}-h`); const mEl = document.getElementById(`${prefix}-m`);
                if(hEl) hEl.value = h.toString().padStart(2, '0'); if(mEl) mEl.value = m.toString().padStart(2, '0');
            },
            get24HFromSelectors: (prefix) => {
                let h = document.getElementById(`${prefix}-h`).value; let m = document.getElementById(`${prefix}-m`).value; return `${h}:${m}`;
            }
        };

        const Theme = {
            init: () => {
                const savedMode = localStorage.getItem('qd_adm_theme') || 'dark'; document.documentElement.setAttribute('data-theme', savedMode);
                const themeText = document.getElementById('theme-text'); const themeIcon = document.getElementById('theme-icon');
                if(themeText && themeIcon) { themeText.innerText = savedMode === 'dark' ? 'Giao diện Tối' : 'Giao diện Sáng'; themeIcon.className = savedMode === 'dark' ? 'fa-solid fa-moon text-lg' : 'fa-solid fa-sun text-lg'; }
            },
            toggle: () => {
                const root = document.documentElement; const nextMode = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                root.setAttribute('data-theme', nextMode); localStorage.setItem('qd_adm_theme', nextMode);
                const themeText = document.getElementById('theme-text'); const themeIcon = document.getElementById('theme-icon');
                if(themeText && themeIcon) { themeText.innerText = nextMode === 'dark' ? 'Giao diện Tối' : 'Giao diện Sáng'; themeIcon.className = nextMode === 'dark' ? 'fa-solid fa-moon text-lg' : 'fa-solid fa-sun text-lg'; }
                Utils.toast(`Đã áp dụng giao diện ${nextMode === 'dark' ? 'Tối' : 'Sáng'}`, 'success');
            }
        };

        const UI = {
            openModal: (modalId) => { const modal = document.getElementById(modalId); if(modal) { modal.style.display = 'flex'; void modal.offsetWidth; modal.classList.add('active'); } },
            closeModal: (modalId) => { const modal = document.getElementById(modalId); if(modal) { modal.classList.remove('active'); setTimeout(() => modal.style.display = 'none', 300); } },
            navigate: (viewId, element = null, isMobile = false) => {
                document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
                const targetView = document.getElementById(`view-${viewId}`); if(targetView) targetView.classList.add('active');
                if (element) {
                    const selectorClass = isMobile ? '.m-nav-item' : '.nav-item';
                    document.querySelectorAll(selectorClass).forEach(n => n.classList.remove('active')); element.classList.add('active');
                    if(isMobile) { const dEq = document.querySelector(`.nav-item[onclick*="${viewId}"]`); if(dEq) { document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); dEq.classList.add('active'); } } 
                    else { const mEq = document.querySelector(`.m-nav-item[onclick*="${viewId}"]`); if(mEq) { document.querySelectorAll('.m-nav-item').forEach(n => n.classList.remove('active')); mEq.classList.add('active'); } }
                } else {
                    document.querySelectorAll('.nav-item, .m-nav-item').forEach(n => n.classList.remove('active'));
                    document.querySelector(`.nav-item[onclick*="${viewId}"]`)?.classList.add('active'); 
                    document.querySelector(`.m-nav-item[onclick*="${viewId}"]`)?.classList.add('active');
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };

        const Auth = {
            initRemember: () => {
                const isRemembered = localStorage.getItem('qd_adm_remember') === 'true';
                const savedU = localStorage.getItem('qd_adm_saved_u') || '';
                const savedP = localStorage.getItem('qd_adm_saved_p') || '';
                const autoLogin = localStorage.getItem('qd_adm_autologin') === 'true';

                const uInput = document.getElementById('log-u');
                const pInput = document.getElementById('log-p');
                const remCheckbox = document.getElementById('remember-me');

                if (isRemembered && uInput && pInput && remCheckbox) {
                    uInput.value = savedU;
                    pInput.value = savedP;
                    remCheckbox.checked = true;

                    // Tự động đăng nhập nếu phiên trước chưa bấm Đăng xuất
                    if (autoLogin && savedU && savedP) {
                        Auth.login();
                    }
                }
            },
            handleRememberSave: (u, p) => {
                const remCheckbox = document.getElementById('remember-me');
                if (remCheckbox && remCheckbox.checked) {
                    localStorage.setItem('qd_adm_remember', 'true');
                    localStorage.setItem('qd_adm_saved_u', u);
                    localStorage.setItem('qd_adm_saved_p', p);
                    localStorage.setItem('qd_adm_autologin', 'true');
                } else {
                    localStorage.removeItem('qd_adm_remember');
                    localStorage.removeItem('qd_adm_saved_u');
                    localStorage.removeItem('qd_adm_saved_p');
                    localStorage.removeItem('qd_adm_autologin');
                }
            },
            login: () => {
                const u = document.getElementById('log-u').value.trim(); const p = document.getElementById('log-p').value.trim();
                const btn = document.getElementById('btn-login');
                if(!u || !p) return Utils.toast("Vui lòng cung cấp thông tin xác thực.", "warning");
                
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> ĐANG KẾT NỐI...`; btn.disabled = true;
                
                db.collection("accounts").where("user", "==", u).where("pass", "==", p).get().then(snap => {
                    if(!snap.empty) {
                        const userData = snap.docs[0].data();
                        const userRole = (userData.role === 'admin' || userData.role === 'manager') ? userData.role : 'user';
                        State.isOwner = userData.owner === true;
                        if (userRole === 'admin' || userRole === 'manager') {
                            Auth.handleRememberSave(u, p);
                            State.currentUser = u;
                            State.currentUserRole = userRole;
                            State.currentUserPerms = userData.permissions || ['dashboard', 'attendance', 'registration'];
                            document.documentElement.classList.toggle('role-manager', userRole === 'manager');
                            localStorage.setItem('qd_current_username', u); // Đồng bộ với user.html
                            // Phiên Ban Quản Trị (riêng) + phiên thành viên cho các trang mở từ Admin; hết phiên / bị đá -> thoát ở mọi trang
                            if (window.QDSession) QDSession.start({ u: u, id: snap.docs[0].id, role: userRole, kickAt: userData.kickAt });
                            setTimeout(() => {
                                document.getElementById('auth-gate').style.opacity = '0';
                                setTimeout(() => {
                                    document.getElementById('auth-gate').style.display = 'none'; document.getElementById('app-shell').style.display = 'flex';
                                    Utils.toast(`Xin chào ${u}! Xác thực quyền thành công!`, "success"); AdminCore.init();
                                }, 500);
                            }, 800);
                        } else {
                            Utils.toast("Từ chối truy cập: Tài khoản không có quyền Quản trị.", "error");
                            btn.innerHTML = `Đăng nhập <i class="fa-solid fa-arrow-right-to-bracket"></i>`; btn.disabled = false;
                        }
                    } else {
                        Utils.toast("Từ chối truy cập: Sai tài khoản hoặc mật khẩu.", "error");
                        btn.innerHTML = `Đăng nhập <i class="fa-solid fa-arrow-right-to-bracket"></i>`; btn.disabled = false;
                    }
                }).catch(err => {
                    Utils.toast("Lỗi kết nối máy chủ.", "error");
                    btn.innerHTML = `Đăng nhập <i class="fa-solid fa-arrow-right-to-bracket"></i>`; btn.disabled = false;
                });
            },
            logout: () => {
                const btn = document.querySelector('#modal-logout .btn-danger');
                if(btn) { btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang thoát...`; btn.disabled = true; }
                if (window.QDSession) QDSession.end('logout', true);   // thoát phiên Admin + các trang thành viên đang mở bằng tài khoản này
                localStorage.removeItem('qd_current_username'); // Đăng xuất thì mất phiên bên user.html luôn
                localStorage.setItem('qd_adm_autologin', 'false'); // Tắt tự động vào thẳng khi chủ động đăng xuất
                try { if (window.QDdb && QDdb.logout) QDdb.logout(); } catch (e) {}
                setTimeout(() => window.location.reload(), 500);
            }
        };

        // Tự động kiểm tra và điền tài khoản đã ghi nhớ khi vừa mở trang
        document.addEventListener('DOMContentLoaded', () => {
            Auth.initRemember();
        });

        /* ===== TRẠM QUY ĐỔI VẬT PHẨM (admin) =====
           settings/point_shop_config : { isEnabled, items: [{ id, icon, name, type: 'tickets'|'spins'|'gift', amount, cost, stock|null, dailyLimit|null, active }] }
           point_shop_stock/counts    : { counts: { <id>: số lần đã đổi } }        (phía user tăng trong giao dịch)
           shop_orders                : { user, itemId, itemName, icon, qty, cost, status: 'pending'|'done'|'rejected', time, ... }
           point_history              : log đổi điểm (action 'exchange') -> thống kê hôm nay */
        const ShopAdmin = (() => {
            const TYPES = { tickets: '🧧 Lượt rút', conThrows: '🎯 Lượt ném còn' };   // lượt rút lì xì + lượt ném còn (đã bỏ lượt vòng quay & quà trao tay)
            const DEF = [
                { id: 'tk1', icon: '🧧', name: '1 Lượt rút lì xì', type: 'tickets', amount: 1, cost: 50, stock: null, dailyLimit: null, active: true },
                { id: 'tk5', icon: '🧧', name: 'Combo 5 lượt rút lì xì', type: 'tickets', amount: 5, cost: 220, stock: null, dailyLimit: 2, active: true },
                { id: 'tk10', icon: '🧧', name: 'Combo 10 lượt rút lì xì', type: 'tickets', amount: 10, cost: 400, stock: null, dailyLimit: 1, active: true }
            ];
            let counts = {}, orders = [], dirty = false, started = false, today = { n: 0, pts: 0 };
            const $ = id => document.getElementById(id);
            const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            const numOrNull = v => { v = String(v == null ? '' : v).trim(); if (v === '') return null; const n = parseInt(v); return isNaN(n) || n < 0 ? NaN : n; };
            // Danh mục từ cấu hình (tương thích bản cũ chỉ có spinCost / ticketCost)
            const norm = (cfg) => {
                cfg = cfg || {};
                let list = Array.isArray(cfg.items) && cfg.items.length ? cfg.items : null;
                if (!list) list = DEF.map(x => Object.assign({}, x, x.id === 'tk1' && cfg.ticketCost != null ? { cost: cfg.ticketCost } : {}, x.id === 'sp1' && cfg.spinCost != null ? { cost: cfg.spinCost } : {}));
                return list.filter(x => TYPES[x.type || 'tickets']).map((x, i) => ({
                    id: x.id || ('i' + i), icon: x.icon || (x.type === 'conThrows' ? '🎯' : '🧧'), name: String(x.name || ''), type: x.type || 'tickets',
                    amount: Math.max(1, parseInt(x.amount) || 1), cost: Math.max(0, parseInt(x.cost) || 0),
                    stock: x.stock == null || x.stock === '' ? null : Math.max(0, parseInt(x.stock) || 0),
                    dailyLimit: x.dailyLimit == null || x.dailyLimit === '' ? null : Math.max(0, parseInt(x.dailyLimit) || 0),
                    active: x.active !== false
                }));
            };
            const rows = () => Array.from(document.querySelectorAll('#tb-shop-items tr[data-id]'));
            const rowHtml = (x) => `<tr data-id="${esc(x.id)}" class="${x.active ? '' : 'sh-off'}">
                <td><input class="form-control sh-icon" maxlength="4" value="${esc(x.icon)}" oninput="ShopAdmin.onEdit()"></td>
                <td><input class="form-control sh-name" maxlength="50" value="${esc(x.name)}" placeholder="Tên hiển thị" oninput="ShopAdmin.onEdit()"></td>
                <td><select class="form-control sh-type" style="appearance: auto;" onchange="ShopAdmin.onEdit()">${Object.keys(TYPES).map(k => `<option value="${k}" ${k === x.type ? 'selected' : ''}>${TYPES[k]}</option>`).join('')}</select></td>
                <td><input type="number" class="form-control sh-amount" min="1" step="1" value="${x.amount}" oninput="ShopAdmin.onEdit()"></td>
                <td><input type="number" class="form-control sh-cost" min="0" step="1" value="${x.cost}" oninput="ShopAdmin.onEdit()" style="font-family: var(--font-family-mono); font-weight: 700; color: var(--color-success);"></td>
                <td><input type="number" class="form-control sh-stock" min="0" step="1" value="${x.stock == null ? '' : x.stock}" placeholder="∞" oninput="ShopAdmin.onEdit()"></td>
                <td class="text-center sh-left"></td>
                <td><input type="number" class="form-control sh-daily" min="0" step="1" value="${x.dailyLimit == null ? '' : x.dailyLimit}" placeholder="∞" oninput="ShopAdmin.onEdit()"></td>
                <td class="text-center"><input type="checkbox" class="sh-active" ${x.active ? 'checked' : ''} onchange="ShopAdmin.onEdit()" style="width: 18px; height: 18px; cursor: pointer;"></td>
                <td class="text-center" style="white-space: nowrap;"><span class="sh-mv"><button title="Lên" onclick="ShopAdmin.move(this,-1)">▲</button><button title="Xuống" onclick="ShopAdmin.move(this,1)">▼</button></span>
                    <button class="btn-icon" style="width: 34px; height: 34px; color: var(--color-danger); border-color: rgba(239,68,68,.3); vertical-align: middle;" title="Xóa" onclick="ShopAdmin.removeRow(this)"><i class="fa-solid fa-trash-can"></i></button></td>
            </tr>`;
            const read = (tr) => ({
                id: tr.dataset.id, icon: tr.querySelector('.sh-icon').value.trim() || '🎁', name: tr.querySelector('.sh-name').value.trim(),
                type: tr.querySelector('.sh-type').value, amount: parseInt(tr.querySelector('.sh-amount').value), cost: parseInt(tr.querySelector('.sh-cost').value),
                stock: numOrNull(tr.querySelector('.sh-stock').value), dailyLimit: numOrNull(tr.querySelector('.sh-daily').value), active: tr.querySelector('.sh-active').checked
            });
            const render = (list) => { const tb = $('tb-shop-items'); if (!tb) return; tb.innerHTML = list.length ? list.map(rowHtml).join('') : '<tr><td colspan="10" class="text-center text-muted py-8">Chưa có vật phẩm. Bấm "Thêm nhanh" ở trên.</td></tr>'; recalc(); };
            const recalc = () => {
                let selling = 0;
                rows().forEach(tr => {
                    const r = read(tr), sold = counts[r.id] || 0, cell = tr.querySelector('.sh-left');
                    tr.classList.toggle('sh-off', !r.active);
                    tr.querySelector('.sh-amount').disabled = r.type === 'gift';
                    if (r.active) selling++;
                    cell.innerHTML = r.stock == null || isNaN(r.stock) ? `<b>${sold}</b> / <span class="text-muted">∞</span>`
                        : (r.stock - sold > 0 ? `<b>${sold}</b> / <span class="badge badge-online" style="font-size: 12px;">${r.stock - sold}</span>` : `<b>${sold}</b> / <span class="badge badge-danger" style="font-size: 11px;">HẾT</span>`);
                });
                if ($('sh-s-items')) $('sh-s-items').textContent = selling;
                const note = $('sh-dirty-note'); if (note) note.innerHTML = dirty ? '<span class="text-warning font-bold"><i class="fa-solid fa-triangle-exclamation"></i> Có thay đổi chưa lưu</span>' : '';
            };
            const statusBadge = (o) => o.status === 'done' ? `<span class="badge badge-online" style="text-transform:none">✅ Đã trao</span>${o.doneBy ? `<div class="text-xs text-muted mt-1">bởi ${esc(o.doneBy)}</div>` : ''}`
                : o.status === 'rejected' ? `<span class="badge badge-danger" style="text-transform:none">↩ Đã từ chối · hoàn ${o.cost} điểm</span>`
                : '<span class="badge badge-warning" style="text-transform:none">⏳ Chờ trao</span>';
            const api = {
                TYPES, norm,
                init: () => {
                    if (started) return; started = true;
                    db.collection('point_shop_stock').doc('counts').onSnapshot(d => { counts = (d.exists && d.data().counts) || {}; recalc(); }, e => console.warn('point_shop_stock', e));
                    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
                    qdSlow(db.collection('point_history').where('timestamp', '>=', d0.getTime()), 1000).onSnapshot(snap => {
                        today = { n: 0, pts: 0 };
                        snap.forEach(doc => { const d = doc.data(); if (d.action === 'exchange') { today.n++; today.pts += Math.abs(d.pointsChanged || 0); } });
                        if ($('sh-s-today')) { $('sh-s-today').textContent = today.n; $('sh-s-points').textContent = today.pts.toLocaleString('vi-VN'); }
                    }, e => console.warn('point_history today', e));
                },
                onConfig: (cfg) => { api.init(); if (!dirty) render(norm(cfg)); },
                onEdit: () => { dirty = true; recalc(); },
                addRow: (type) => {
                    const tb = $('tb-shop-items'); if (!tb) return; if (!rows().length) tb.innerHTML = '';
                    type = TYPES[type] ? type : 'tickets';
                    const preset = type === 'conThrows' ? { icon: '🎯', name: '3 Lượt ném còn', cost: 60, amount: 3 } : { icon: '🧧', name: 'Lượt rút lì xì', cost: 50 };
                    tb.insertAdjacentHTML('beforeend', rowHtml(Object.assign({ id: 'i' + Date.now().toString(36), type, amount: 1, stock: null, dailyLimit: null, active: true }, preset)));
                    dirty = true; recalc(); const last = rows().pop(); if (last) last.querySelector('.sh-name').focus();
                },
                removeRow: (btn) => { btn.closest('tr').remove(); dirty = true; recalc(); },
                move: (btn, dir) => {
                    const tr = btn.closest('tr'), sib = dir < 0 ? tr.previousElementSibling : tr.nextElementSibling; if (!sib) return;
                    if (dir < 0) tr.parentNode.insertBefore(tr, sib); else tr.parentNode.insertBefore(sib, tr);
                    dirty = true; recalc();
                },
                resetDefaults: () => { if (!qdOk('Đưa danh mục về mặc định? Bấm "Lưu Danh Mục" để áp dụng.', () => ShopAdmin.resetDefaults(), { title: 'Về mặc định?', tone: 'warn', ok: 'Về mặc định' })) return; render(norm({ items: DEF })); dirty = true; recalc(); },
                resetCounts: () => {
                    if (!qdOk('Đặt lại số "Đã đổi" của tất cả vật phẩm về 0?\nKho sẽ đầy lại. Lịch sử và đơn quà vẫn giữ.', () => ShopAdmin.resetCounts(), { title: 'Làm mới số đã đổi?', tone: 'warn', ok: 'Làm mới' })) return;
                    db.collection('point_shop_stock').doc('counts').set({ counts: {}, resetAt: Date.now() }).then(() => Utils.toast('Đã làm mới số đã đổi!', 'success')).catch(() => Utils.toast('Lỗi làm mới.', 'error'));
                },
                save: () => {
                    const items = [];
                    for (const [i, tr] of rows().entries()) {
                        const r = read(tr);
                        if (!r.name) return Utils.toast(`Tên vật phẩm dòng ${i + 1} đang trống!`, 'warning');
                        if (isNaN(r.cost) || r.cost < 0) return Utils.toast(`Giá dòng ${i + 1} không hợp lệ!`, 'warning');
                        if (r.type !== 'gift' && (isNaN(r.amount) || r.amount < 1)) return Utils.toast(`"Nhận / lần" dòng ${i + 1} phải từ 1 trở lên!`, 'warning');
                        if (Number.isNaN(r.stock) || Number.isNaN(r.dailyLimit)) return Utils.toast(`Kho / giới hạn dòng ${i + 1} không hợp lệ (để trống = không giới hạn).`, 'warning');
                        items.push({ id: r.id, icon: r.icon.slice(0, 4), name: r.name, type: r.type, amount: r.type === 'gift' ? 1 : r.amount, cost: r.cost, stock: r.stock, dailyLimit: r.dailyLimit, active: r.active });
                    }
                    // giữ spinCost / ticketCost cho các trang cũ
                    const tk = items.find(x => x.type === 'tickets' && x.amount === 1 && x.active);
                    const extra = {}; if (tk) extra.ticketCost = tk.cost;
                    db.collection('settings').doc('point_shop_config').set(Object.assign({ items }, extra), { merge: true })
                        .then(() => { dirty = false; recalc(); Utils.toast('Đã lưu danh mục Trạm Quy Đổi!', 'success'); })
                        .catch(() => Utils.toast('Lỗi lưu danh mục.', 'error'));
                },
                renderOrders: () => {
                    const tb = $('tb-shop-orders'); if (!tb) return;
                    const pending = orders.filter(o => o.status === 'pending').length;
                    if ($('sh-pending-badge')) $('sh-pending-badge').textContent = pending + ' chờ trao';
                    if ($('sh-s-pending')) $('sh-s-pending').textContent = pending;
                    const f = ($('sh-o-filter') || {}).value || 'pending', u = (($('sh-o-user') || {}).value || '').trim().toLowerCase();
                    const list = orders.filter(o => (f === 'all' || o.status === f) && (!u || String(o.user || '').toLowerCase().includes(u)));
                    if (!list.length) { tb.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-8">${f === 'pending' ? 'Không có đơn nào chờ trao. 🎉' : 'Không có đơn nào.'}</td></tr>`; return; }
                    tb.innerHTML = list.map(o => `<tr><td class="text-muted text-sm">${esc(new Date(o.time).toLocaleString('vi-VN'))}</td><td><b>${esc(o.user)}</b></td>` +
                        `<td>${esc(o.icon || '🎁')} ${esc(o.itemName)}${o.qty > 1 ? ` <b>×${o.qty}</b>` : ''}</td><td class="text-center font-bold" style="font-family: var(--font-family-mono);">${(o.cost || 0).toLocaleString('vi-VN')}</td>` +
                        `<td>${statusBadge(o)}</td><td class="text-right">${o.status === 'pending' ? `<div class="wq-btns"><button class="btn btn-success" onclick="ShopAdmin.markDone('${o.id}')"><i class="fa-solid fa-check"></i> Đã trao</button><button class="btn btn-outline" onclick="ShopAdmin.reject('${o.id}')"><i class="fa-solid fa-rotate-left"></i> Từ chối</button></div>` : ''}</td></tr>`).join('');
                },
                markDone: async (id) => {
                    try { await db.collection('shop_orders').doc(id).update({ status: 'done', doneAt: Date.now(), doneBy: (State.currentUser || 'admin') }); Utils.toast('Đã đánh dấu ĐÃ TRAO quà.', 'success'); }
                    catch (e) { console.error(e); Utils.toast('Không cập nhật được đơn.', 'error'); }
                },
                reject: async (id) => {
                    const o = orders.find(x => x.id === id); if (!o) return;
                    if (!qdOk(`Từ chối đơn "${o.itemName}${o.qty > 1 ? ' ×' + o.qty : ''}" của @${o.user} và hoàn lại ${o.cost} điểm?`, () => ShopAdmin.reject(id), { title: 'Từ chối đơn quà?', ok: 'Từ chối & hoàn điểm' })) return;
                    try {
                        // NHANH: tìm tài khoản song song với đọc đơn trong giao dịch
                        const accP = db.collection('accounts').where('user', '==', o.user).limit(1).get(); accP.catch(() => {});
                        const oRef = db.collection('shop_orders').doc(id), FV = firebase.firestore.FieldValue;
                        await db.runTransaction(async t => {
                            const [od, acc] = await Promise.all([t.get(oRef), accP]);
                            if (acc.empty) throw 'NOACC';
                            const aRef = acc.docs[0].ref;
                            if (!od.exists || od.data().status !== 'pending') throw 'DONE';
                            t.update(oRef, { status: 'rejected', rejectedAt: Date.now() });
                            t.update(aRef, { points: FV.increment(o.cost || 0) });
                            if (o.itemId) t.set(db.collection('point_shop_stock').doc('counts'), { counts: { [o.itemId]: FV.increment(-(o.qty || 1)) } }, { merge: true });
                            t.set(db.collection('point_history').doc(), { user: o.user, action: 'refund', detail: `Hoàn điểm: đơn "${o.itemName}" bị từ chối`, pointsChanged: o.cost || 0, timestamp: Date.now() });
                        });
                        Utils.toast(`Đã từ chối và hoàn ${o.cost} điểm cho ${qdH(o.user)}.`, 'success');
                    } catch (e) { if (e === 'NOACC') Utils.toast('Không tìm thấy tài khoản ' + o.user, 'error'); else if (e === 'DONE') Utils.toast('Đơn này đã được xử lý rồi.', 'warning'); else { console.error(e); Utils.toast('Không xử lý được đơn.', 'error'); } }
                }
            };
            return api;
        })();

        /* ===== PHẦN THƯỞNG CÓ SỐ LƯỢNG (dùng chung cho Rút Lì Xì & Vòng Quay) =====
           <cfgDoc>.prizes   : [{ id, text, qty (null = không giới hạn), chance }]
           <stockColl>/counts : { counts: { <id>: số lần đã trúng } }  (phía user tăng trong giao dịch)
           Phần thưởng tên "Lời Chúc Tết" / "Chúc May Mắn" / "Tí nữa..." -> người chơi nhận 1 câu chúc Tết ngẫu nhiên */
        const PrizeAdmin = (o) => {
            const DEF = o.DEF;
            let counts = {}, dirty = false, started = false;
            const $ = id => document.getElementById(id);
            const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            const fmt = n => Number(n || 0).toLocaleString('vi-VN') + 'đ';
            const norm = (list) => (list && list.length ? list : DEF).map((p, i) => ({
                id: p.id || ('p' + i), text: String(p.text || ''),
                qty: (p.qty === '' || p.qty == null || isNaN(parseInt(p.qty))) ? null : Math.max(0, parseInt(p.qty)),
                chance: parseFloat(p.chance) || 0
            }));
            // "10.000 VNĐ" -> 10000 ; "20K" -> 20000 ; không phải tiền -> 0
            const money = (t) => {
                const m = String(t || '').match(/(\d[\d.,]*)\s*(k(?!\p{L})|nghìn|ngàn)?\s*(vnđ|vnd|đồng|đ(?!\p{L}))?/iu);
                if (!m || (!m[2] && !m[3])) return 0;
                const n = parseInt(m[1].replace(/[.,]/g, '')) || 0;
                return m[2] ? n * 1000 : n;
            };
            const isWish = (t) => /chuc may man|loi chuc|chuc tet|ti nua|them ti/.test(String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase());
            const rows = () => Array.from(document.querySelectorAll('#' + o.tbody + ' tr[data-id]'));
            const readRow = (tr) => ({
                id: tr.dataset.id,
                text: tr.querySelector('.pz-text').value.trim(),
                qtyRaw: tr.querySelector('.pz-qty').value.trim(),
                chance: parseFloat(tr.querySelector('.pz-chance').value) || 0
            });
            const N = o.name;
            const rowHtml = (p) => `<tr data-id="${esc(p.id)}">
                <td class="text-center font-bold text-muted pz-idx"></td>
                <td><input type="text" class="form-control pz-text" maxlength="40" value="${esc(p.text)}" placeholder="VD: 10.000 VNĐ" style="padding: 10px; font-size: 14px;" oninput="${N}.onEdit()"><div class="pz-tag text-xs" style="margin-top: 4px;"></div></td>
                <td><input type="number" class="form-control pz-qty" min="0" step="1" value="${p.qty == null ? '' : p.qty}" placeholder="∞ Vô hạn" style="padding: 10px; font-size: 14px; font-family: var(--font-family-mono);" oninput="${N}.onEdit()"></td>
                <td class="text-center font-bold pz-won" style="font-family: var(--font-family-mono);">0</td>
                <td class="text-center pz-left"></td>
                <td><input type="number" class="form-control pz-chance" min="0" step="0.1" value="${p.chance}" style="padding: 10px; font-size: 14px; font-family: var(--font-family-mono);" oninput="${N}.onEdit()"></td>
                <td class="text-center font-bold pz-pct" style="font-family: var(--font-family-mono);">-</td>
                <td class="text-center"><button class="btn-icon" style="color: var(--color-danger); border-color: rgba(239,68,68,.3);" title="Xóa phần thưởng này" onclick="${N}.removeRow(this)"><i class="fa-solid fa-trash-can"></i></button></td>
            </tr>`;
            const render = (list) => {
                const tb = $(o.tbody); if (!tb) return;
                tb.innerHTML = list.length ? list.map(rowHtml).join('') : '<tr><td colspan="8" class="text-center text-muted py-8">Chưa có phần thưởng nào. Bấm "Thêm nhanh" ở trên.</td></tr>';
                recalc();
            };
            // Cập nhật % trúng, đã trúng / còn lại và thống kê tiền (không vẽ lại ô nhập)
            const recalc = () => {
                const rs = rows(); let total = 0;
                rs.forEach(tr => total += readRow(tr).chance);
                let budget = 0, paid = 0, wins = 0, unlimitedMoney = false;
                rs.forEach((tr, i) => {
                    const r = readRow(tr), won = counts[r.id] || 0, qty = r.qtyRaw === '' ? null : Math.max(0, parseInt(r.qtyRaw) || 0), val = money(r.text);
                    tr.querySelector('.pz-idx').textContent = i + 1;
                    tr.querySelector('.pz-won').textContent = won;
                    tr.querySelector('.pz-tag').innerHTML = isWish(r.text) ? '<span class="text-warning">🧧 Hiện câu chúc Tết ngẫu nhiên</span>' : (val ? `<span class="text-success">💰 Tiền thưởng ${fmt(val)}</span>` : '');
                    const left = tr.querySelector('.pz-left');
                    if (qty == null) left.innerHTML = '<span class="text-muted">∞</span>';
                    else {
                        const l = Math.max(0, qty - won);
                        left.innerHTML = l > 0 ? `<span class="badge" style="background: var(--color-success-bg, rgba(16,185,129,.15)); color: var(--color-success); font-size: 13px;">${l} / ${qty}</span>`
                                               : `<span class="badge" style="background: var(--color-danger-bg); color: var(--color-danger); font-size: 12px;">HẾT GIẢI</span>`;
                    }
                    tr.querySelector('.pz-pct').textContent = total > 0 ? (Math.round(r.chance / total * 1000) / 10) + '%' : '-';
                    if (val > 0) {
                        paid += won * val; wins += won;
                        if (qty == null) unlimitedMoney = true; else budget += qty * val;
                    }
                });
                const tc = $(o.total); if (tc) tc.textContent = `Tổng tỉ lệ: ${Math.round(total * 10) / 10}`;
                if ($(o.stat + 'budget')) {
                    $(o.stat + 'budget').textContent = unlimitedMoney ? fmt(budget) + ' + ∞' : fmt(budget);
                    $(o.stat + 'paid').textContent = fmt(paid);
                    $(o.stat + 'left').textContent = unlimitedMoney ? '∞' : fmt(Math.max(0, budget - paid));
                    $(o.stat + 'wins').textContent = wins;
                }
            };
            const api = {
                DEF, norm,
                init: () => {
                    if (started) return; started = true;
                    db.collection(o.stockColl).doc('counts').onSnapshot(doc => { counts = (doc.exists && doc.data().counts) || {}; recalc(); },
                        e => console.warn(o.stockColl, e));
                },
                onConfig: (data) => {
                    api.init();
                    if (dirty) return;   // đang sửa dở thì không ghi đè ô nhập
                    render(norm(data && data.prizes));
                },
                onEdit: () => { dirty = true; recalc(); },
                recalc,
                addRow: (text) => {
                    const tb = $(o.tbody); if (!tb) return;
                    if (!rows().length) tb.innerHTML = '';
                    const money_ = money(text) > 0;
                    tb.insertAdjacentHTML('beforeend', rowHtml({ id: 'p' + Date.now().toString(36), text: text, qty: money_ ? 10 : null, chance: money_ ? 5 : 20 }));
                    dirty = true; recalc();
                    const last = rows().pop(); if (last) last.querySelector(money_ ? '.pz-qty' : '.pz-text').focus();
                },
                removeRow: (btn) => {
                    if (rows().length <= 1) return Utils.toast('Cần ít nhất 1 phần thưởng.', 'warning');
                    btn.closest('tr').remove(); dirty = true; recalc();
                },
                resetDefaults: () => {
                    if (!qdOk(`Đưa bảng phần thưởng ${o.label} về mặc định (${o.defLabel})? Bấm "Lưu Phần Thưởng" để áp dụng.`, null, { title: 'Về mặc định?', tone: 'warn', ok: 'Về mặc định' })) return;
                    render(norm(DEF)); dirty = true;
                },
                resetCounts: () => {
                    if (!qdOk(`Đặt lại số "Đã trúng" của ${o.label} về 0?\nSố lượng giải sẽ đầy lại, lịch sử vẫn được giữ.`, null, { title: 'Làm mới số đã trúng?', tone: 'warn', ok: 'Làm mới' })) return;
                    db.collection(o.stockColl).doc('counts').set({ counts: {}, resetAt: Date.now() })
                        .then(() => Utils.toast('Đã làm mới số đã trúng!', 'success'))
                        .catch(() => Utils.toast('Lỗi làm mới số đã trúng.', 'error'));
                },
                save: () => {
                    const rs = rows(); if (!rs.length) return Utils.toast('Cần ít nhất 1 phần thưởng.', 'warning');
                    if (o.minRows && rs.length < o.minRows) return Utils.toast(`Cần ít nhất ${o.minRows} ô phần thưởng.`, 'warning');
                    const prizes = []; let total = 0, hasUnlimited = false;
                    for (let i = 0; i < rs.length; i++) {
                        const r = readRow(rs[i]);
                        if (!r.text) return Utils.toast(`Tên phần thưởng dòng ${i + 1} đang trống!`, 'warning');
                        if (r.chance < 0) return Utils.toast(`Tỉ lệ dòng ${i + 1} không được âm!`, 'warning');
                        let qty = null;
                        if (r.qtyRaw !== '') {
                            qty = parseInt(r.qtyRaw);
                            if (isNaN(qty) || qty < 0) return Utils.toast(`Số lượng dòng ${i + 1} không hợp lệ!`, 'warning');
                        } else if (r.chance > 0) hasUnlimited = true;
                        total += r.chance;
                        prizes.push({ id: r.id, text: r.text, qty: qty, chance: r.chance });
                    }
                    if (total <= 0) return Utils.toast('Tổng tỉ lệ phải lớn hơn 0!', 'warning');
                    if (!hasUnlimited) Utils.toast('Lưu ý: không có phần thưởng nào "không giới hạn". Khi hết giải, người chơi sẽ nhận "Lời Chúc Tết".', 'warning');
                    db.collection('settings').doc(o.cfgDoc).set({ prizes: prizes }, { merge: true })
                        .then(() => { dirty = false; Utils.toast(`Đã lưu phần thưởng ${o.label}!`, 'success'); })
                        .catch(() => Utils.toast(`Lỗi lưu cấu hình ${o.label}.`, 'error'));
                }
            };
            return api;
        };

        const TTPrize = PrizeAdmin({
            name: 'TTPrize', label: 'Rút Lì Xì', cfgDoc: 'tranhthuong_config', stockColl: 'tranhthuong_stock',
            tbody: 'tb-tt-config', total: 'tt-total-chance', stat: 'tt-s-',
            defLabel: '10.000đ, 20.000đ, 50.000đ, Lời Chúc Tết',
            DEF: [
                { id: 'm10', text: '10.000 VNĐ', qty: 20, chance: 15 },
                { id: 'm20', text: '20.000 VNĐ', qty: 10, chance: 8 },
                { id: 'm50', text: '50.000 VNĐ', qty: 3, chance: 2 },
                { id: 'luck', text: 'Lời Chúc Tết', qty: null, chance: 75 }
            ]
        });

        // Vòng Quay: mỗi dòng là 1 ô trên bánh xe (nên để số ô chẵn, xen kẽ tiền / lời chúc)
        const WheelPrize = PrizeAdmin({
            name: 'WheelPrize', label: 'Vòng Quay', cfgDoc: 'wheel_config', stockColl: 'wheel_stock', minRows: 2,
            tbody: 'tb-wheel-config', total: 'wheel-total-chance', stat: 'wp-s-',
            defLabel: '6 ô: 10.000đ, 20.000đ, 50.000đ xen kẽ Lời Chúc Tết',
            DEF: [
                { id: 'm10', text: '10.000 VNĐ', qty: 20, chance: 12 },
                { id: 'w1', text: 'Lời Chúc Tết', qty: null, chance: 27 },
                { id: 'm20', text: '20.000 VNĐ', qty: 10, chance: 6 },
                { id: 'w2', text: 'Lời Chúc Tết', qty: null, chance: 27 },
                { id: 'm50', text: '50.000 VNĐ', qty: 3, chance: 2 },
                { id: 'w3', text: 'Lời Chúc Tết', qty: null, chance: 26 }
            ]
        });

        /* ===== QUẢN LÝ LÌ XÌ (admin) =====
           settings/lixi_config : { isEnabled, endDate, endTime, closedMessage, prizes:[{points,chance}], bigThreshold, dailyBudget }
           lixi_history         : { user, amount, date, dateKey, timestamp, status:'ok'|'revoked', ... }
           lixi_daily/{yyyy-mm-dd} : { count, points }  (bộ đếm ngân sách ngày, do phía user cập nhật trong giao dịch) */
        const LixiAdmin = (() => {
            const DEFAULT_PRIZES = [
                { points: 8, chance: 35 }, { points: 18, chance: 30 }, { points: 28, chance: 20 },
                { points: 38, chance: 10 }, { points: 68, chance: 4 }, { points: 88, chance: 1 }
            ];
            const $ = id => document.getElementById(id);
            const pad = n => (n < 10 ? '0' : '') + n;
            const keyOf = d => { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
            const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            const fmtTime = ts => ts ? new Date(ts).toLocaleString('vi-VN') : '';
            const num = v => (Number(v) || 0).toLocaleString('vi-VN');

            let cfg = null, hist = [], daily = null, dailyKey = null, unsubDaily = null, started = false, dirty = false, tickN = 0;

            const normCfg = d => {
                d = d || {};
                let prizes = (Array.isArray(d.prizes) ? d.prizes : []).map(p => ({ points: Math.floor(Number(p && p.points)), chance: Number(p && p.chance) }))
                    .filter(p => p.points >= 1 && isFinite(p.chance) && p.chance >= 0);
                if (!prizes.some(p => p.chance > 0)) prizes = DEFAULT_PRIZES.map(p => ({ ...p }));
                return {
                    isEnabled: d.isEnabled !== false, openDate: d.openDate || '', openTime: d.openTime || '', endDate: d.endDate || '', endTime: d.endTime || '', closedMessage: d.closedMessage || '',
                    prizes, bigThreshold: Number(d.bigThreshold) > 0 ? Number(d.bigThreshold) : 68, dailyBudget: Math.max(0, Math.floor(Number(d.dailyBudget) || 0)),
                    allowRedraw: d.allowRedraw === true, maxPerDay: Math.min(50, Math.max(2, Math.floor(Number(d.maxPerDay)) || 3))
                };
            };
            const stamp = (d, t) => { if (!(d && t)) return null; const v = new Date(d + 'T' + t).getTime(); return isNaN(v) ? null : v; };
            const deadline = c => stamp(c.endDate, c.endTime);
            const openAt = c => stamp(c.openDate, c.openTime);
            const cd = ms => { const d = Math.max(0, Math.floor(ms / 1000)), days = Math.floor(d / 86400); return (days ? days + ' ngày ' : '') + pad(Math.floor(d % 86400 / 3600)) + ':' + pad(Math.floor(d % 3600 / 60)) + ':' + pad(d % 60); };
            const users = () => (State.accountsCache || []).filter(a => (a.role || 'user') === 'user');
            const spentToday = () => (daily && daily.points) || 0;
            const minPrize = c => Math.min(...c.prizes.filter(p => p.chance > 0).map(p => p.points));
            const isSoldOut = c => c.dailyBudget > 0 && (c.dailyBudget - spentToday()) < minPrize(c);

            const subDaily = () => {
                const key = keyOf();
                if (dailyKey === key) return;
                if (unsubDaily) { try { unsubDaily(); } catch (e) { } }
                dailyKey = key; daily = null;
                unsubDaily = db.collection('lixi_daily').doc(key).onSnapshot(doc => { daily = doc.exists ? doc.data() : { points: 0, count: 0 }; renderToday(); }, e => console.warn('lixi_daily', e));
            };

            /* ---------- cấu hình: đóng / mở ---------- */
            const renderConfig = raw => {
                const c = cfg;
                const tg = $('cfg-lx-toggle'), st = $('lx-status-text');
                if (tg && st) { tg.checked = c.isEnabled; st.innerText = c.isEnabled ? 'ĐANG MỞ' : 'ĐANG KHÓA'; st.style.color = c.isEnabled ? 'var(--color-success)' : 'var(--color-danger)'; }
                const act = document.activeElement && document.activeElement.id;
                const rd = $('cfg-lx-redraw'), rdt = $('lx-redraw-text'), md = $('cfg-lx-maxdraw');
                if (rd && rdt && md) {
                    rd.checked = c.allowRedraw; md.disabled = !c.allowRedraw; if (act !== 'cfg-lx-maxdraw') md.value = c.maxPerDay;
                    rdt.innerText = c.allowRedraw ? 'RÚT LẠI TRONG NGÀY: BẬT (tối đa ' + c.maxPerDay + ' lượt)' : 'RÚT LẠI TRONG NGÀY: TẮT (1 lượt/ngày)';
                    rdt.style.color = c.allowRedraw ? 'var(--color-success)' : 'var(--text-muted)';
                }
                if (act !== 'cfg-lx-open-date') $('cfg-lx-open-date').value = c.openDate;
                if (act !== 'cfg-lx-open-time') $('cfg-lx-open-time').value = c.openTime;
                if (act !== 'cfg-lx-end-date') $('cfg-lx-end-date').value = c.endDate;
                if (act !== 'cfg-lx-end-time') $('cfg-lx-end-time').value = c.endTime;
                if (act !== 'cfg-lx-closed-msg') $('cfg-lx-closed-msg').value = c.closedMessage;
                if (!dirty) {
                    $('cfg-lx-budget').value = c.dailyBudget; $('cfg-lx-big').value = c.bigThreshold;
                    fillPrizes(c.prizes);
                }
                renderLive(); renderToday();
            };
            const renderLive = () => {
                const b = $('lx-live-badge'); if (!b || !cfg) return;
                const c = cfg, dl = deadline(c), op = openAt(c), n = Date.now();
                let cls = 'badge-online', txt = 'ĐANG MỞ', big = '', sub = '', bigColor = 'var(--color-success)';
                if (!c.isEnabled) { cls = 'badge-danger'; txt = 'ĐANG ĐÓNG (tắt thủ công)'; bigColor = 'var(--color-danger)'; big = 'ĐÃ ĐÓNG'; sub = 'Bật công tắc để mở cửa ngay.'; }
                else if (op && n < op) { cls = 'badge-warning'; txt = 'CHƯA MỞ · ĐẾM NGƯỢC'; bigColor = 'var(--color-warning)'; big = '⏳ ' + cd(op - n); sub = 'Mở cửa lúc ' + new Date(op).toLocaleString('vi-VN') + ' — người dùng đang thấy đồng hồ đếm ngược này.'; }
                else if (dl && n >= dl) { cls = 'badge-danger'; txt = 'ĐÃ ĐÓNG (quá giờ hẹn)'; bigColor = 'var(--color-danger)'; big = 'ĐÃ ĐÓNG'; sub = 'Đóng từ ' + new Date(dl).toLocaleString('vi-VN') + '. Đặt "Giờ mở cửa" mới hoặc xóa hẹn giờ để mở lại.'; }
                else if (isSoldOut(c)) { cls = 'badge-warning'; txt = 'HẾT QUÀ HÔM NAY'; bigColor = 'var(--color-warning)'; big = 'HẾT QUÀ'; sub = 'Ngân sách điểm hôm nay đã phát hết, mai tự mở lại.'; }
                else if (dl) { const d = Math.floor((dl - n) / 1000); txt = 'ĐANG MỞ'; big = 'Tự đóng sau ' + cd(dl - n); sub = 'Đóng lúc ' + new Date(dl).toLocaleString('vi-VN'); }
                else { big = 'ĐANG MỞ'; sub = 'Không hẹn giờ đóng.'; }
                b.className = 'badge ' + cls; b.innerText = txt;
                const e = $('lx-countdown'); if (e) { e.innerText = big; e.style.color = bigColor; $('lx-countdown-sub').innerText = sub; }
            };

            /* ---------- bảng phần thưởng ---------- */
            const prizeRow = (p, i) => `<tr><td class="text-center font-bold text-muted lx-idx">${i + 1}</td>
                <td><input type="number" class="form-control lx-prize-points" min="1" step="1" value="${p.points}" style="padding: 10px; font-size: 14px; font-family: var(--font-family-mono);" oninput="LixiAdmin.onEdit()"></td>
                <td><input type="number" class="form-control lx-prize-chance" min="0" step="0.1" value="${p.chance}" style="padding: 10px; font-size: 14px; font-family: var(--font-family-mono);" oninput="LixiAdmin.onEdit()"></td>
                <td class="text-center font-bold lx-prize-pct" style="font-family: var(--font-family-mono);">0%</td>
                <td class="text-center"><button class="btn-icon" style="color: var(--color-danger); border-color: rgba(239,68,68,.3);" onclick="LixiAdmin.removePrize(this)" title="Xóa mức này"><i class="fa-solid fa-trash-can"></i></button></td></tr>`;
            const fillPrizes = list => { $('tb-lx-config').innerHTML = list.map(prizeRow).join(''); recalc(); };
            const readPrizes = () => Array.from(document.querySelectorAll('#tb-lx-config tr')).filter(r => r.querySelector('.lx-prize-points')).map(r => ({
                points: Number(r.querySelector('.lx-prize-points').value), chance: Number(r.querySelector('.lx-prize-chance').value)
            }));
            const recalc = () => {
                const rows = Array.from(document.querySelectorAll('#tb-lx-config tr')).filter(r => r.querySelector('.lx-prize-points'));
                const list = rows.map(r => ({ points: Number(r.querySelector('.lx-prize-points').value) || 0, chance: Math.max(0, Number(r.querySelector('.lx-prize-chance').value) || 0) }));
                const total = list.reduce((a, p) => a + p.chance, 0);
                rows.forEach((r, i) => { r.querySelector('.lx-idx').innerText = i + 1; r.querySelector('.lx-prize-pct').innerText = total > 0 ? (list[i].chance / total * 100).toFixed(1) + '%' : '0%'; });
                const ev = total > 0 ? list.reduce((a, p) => a + p.points * p.chance, 0) / total : 0;
                $('lx-total-chance').innerText = 'Tổng tỉ lệ: ' + (Math.round(total * 100) / 100);
                $('lx-ev').innerText = 'TB: ' + ev.toFixed(1) + ' điểm/lượt';
                const n = users().length, budget = Math.max(0, Math.floor(Number($('cfg-lx-budget').value) || 0));
                const lim = cfg && cfg.allowRedraw ? cfg.maxPerDay : 1, all = ev * n * lim;
                let txt = `Ước tính nếu cả ${n} tài khoản rút hết ${lim} lượt mỗi ngày: ≈ <b>${num(Math.round(all))}</b> điểm/ngày`;
                if (budget > 0) txt += ` · trần ngân sách <b>${num(budget)}</b> điểm/ngày` + (all > budget ? ' <span class="text-warning">(sẽ chạm trần)</span>' : '');
                $('lx-cost').innerHTML = txt;
            };

            /* ---------- dữ liệu ---------- */
            const histOk = h => h.status !== 'revoked';
            const inRange = h => {
                const r = $('lx-f-range').value;
                if (r === 'all') return true;
                if (r === 'today') return h.dateKey === keyOf();
                const start = new Date(); start.setHours(0, 0, 0, 0);
                return (h.timestamp || 0) >= start.getTime() - (Number(r) - 1) * 86400000;
            };
            const rangeLabel = () => ({ today: 'Hôm nay', '7': '7 ngày gần nhất', '30': '30 ngày gần nhất', all: 'Tất cả' }[$('lx-f-range').value]);
            const filtered = () => {
                const st = $('lx-f-status').value, q = $('lx-f-user').value.trim().toLowerCase();
                return hist.filter(h => inRange(h) && (st === 'all' || (st === 'ok' ? histOk(h) : !histOk(h))) && (!q || String(h.user).toLowerCase().includes(q)));
            };

            const renderToday = () => {
                if (!cfg || !$('lx-t-count')) return;
                const c = cfg, spent = spentToday();
                let count = (daily && daily.count) || 0;
                const todayStr = new Date().toLocaleDateString('vi-VN');
                const us = users(), claimed = us.filter(a => a.lixiDate === todayStr).length;
                $('lx-today-label').innerText = 'Ngày ' + todayStr;
                $('lx-t-count').innerText = num(count); $('lx-t-points').innerText = num(spent);
                $('lx-t-left').innerText = c.dailyBudget > 0 ? num(Math.max(0, c.dailyBudget - spent)) : '∞';
                $('lx-t-pending').innerText = num(Math.max(0, us.length - claimed));
                const bar = $('lx-budget-bar');
                if (c.dailyBudget > 0) {
                    const pct = Math.min(100, spent / c.dailyBudget * 100);
                    bar.style.width = pct + '%'; bar.style.background = pct >= 90 ? 'var(--color-danger)' : (pct >= 70 ? 'var(--color-warning)' : 'var(--color-success)');
                    $('lx-budget-label').innerText = `Đã phát ${num(spent)} / ${num(c.dailyBudget)} điểm ngân sách ngày`; $('lx-budget-pct').innerText = pct.toFixed(0) + '%';
                } else {
                    bar.style.width = '0'; $('lx-budget-label').innerText = 'Chưa đặt ngân sách ngày (không giới hạn) — đã phát ' + num(spent) + ' điểm'; $('lx-budget-pct').innerText = '';
                }
                renderLive();
            };

            const renderAll = () => {
                if (!$('tb-lx-history')) return;
                renderToday();
                const rows = hist.filter(inRange), ok = rows.filter(histOk), rev = rows.filter(h => !histOk(h));
                const pts = ok.reduce((a, h) => a + (h.amount || 0), 0);
                $('lx-r-count').innerText = num(ok.length); $('lx-r-points').innerText = num(pts);
                $('lx-r-avg').innerText = ok.length ? (pts / ok.length).toFixed(1) : '0';
                $('lx-r-users').innerText = num(new Set(ok.map(h => h.user)).size);
                $('lx-r-revoked').innerText = num(rev.length) + ' (' + num(rev.reduce((a, h) => a + (h.deducted != null ? h.deducted : (h.amount || 0)), 0)) + ')';

                const dist = {}; ok.forEach(h => { dist[h.amount] = (dist[h.amount] || 0) + 1; });
                const keys = Object.keys(dist).map(Number).sort((a, b) => a - b);
                $('lx-dist').innerHTML = keys.length ? keys.map(k => `<span class="lx-chip"><b>+${k}</b> × ${num(dist[k])} <span class="text-muted">(${(dist[k] / ok.length * 100).toFixed(1)}%)</span></span>`).join('') : '<span class="text-muted text-sm">Chưa có dữ liệu.</span>';

                const per = {}; ok.forEach(h => { const p = per[h.user] = per[h.user] || { n: 0, pts: 0 }; p.n++; p.pts += h.amount || 0; });
                const cur = {}; (State.accountsCache || []).forEach(a => { cur[a.user] = a.points || 0; });
                const top = Object.keys(per).sort((a, b) => per[b].pts - per[a].pts).slice(0, 10);
                $('tb-lx-top').innerHTML = top.length ? top.map(u => `<tr><td><b>${esc(u)}</b></td><td class="text-center">${num(per[u].n)}</td><td class="text-center font-bold" style="font-family: var(--font-family-mono); color: var(--color-danger);">+${num(per[u].pts)}</td><td class="text-center" style="font-family: var(--font-family-mono);">${cur[u] != null ? num(cur[u]) : '—'}</td></tr>`).join('')
                    : '<tr><td colspan="4" class="text-center text-muted py-8">Chưa có ai rút lì xì trong khoảng này.</td></tr>';

                const list = filtered(), today = keyOf();
                $('lx-hist-count').innerText = list.length > 300 ? `Hiển thị 300 / ${num(list.length)} lượt (xuất Excel để xem đầy đủ)` : `${num(list.length)} lượt`;
                $('tb-lx-history').innerHTML = list.length ? list.slice(0, 300).map(h => {
                    const revoked = !histOk(h);
                    const badge = revoked ? `<span class="badge badge-danger">Đã thu hồi${h.deducted != null ? ' −' + h.deducted : ''}</span>` : '<span class="badge badge-online">Hợp lệ</span>';
                    const act = revoked ? '<span class="text-muted text-xs">—</span>' :
                        `<button class="btn-icon" style="width:34px;height:34px;font-size:13px;" title="Thu hồi điểm" onclick="LixiAdmin.askRevoke('${h.id}', false)"><i class="fa-solid fa-rotate-left"></i></button> ` +
                        (h.dateKey === today ? `<button class="btn-icon" style="width:34px;height:34px;font-size:13px;color:var(--color-warning);" title="Thu hồi + cấp lại lượt rút" onclick="LixiAdmin.askRevoke('${h.id}', true)"><i class="fa-solid fa-arrows-rotate"></i></button>` : '');
                    return `<tr><td><b>${esc(h.user)}</b></td><td class="text-center font-bold" style="font-family: var(--font-family-mono); color: var(--color-danger);">+${num(h.amount)}</td><td class="text-center">${esc(h.date)}${h.seq > 1 ? ' <span class="text-muted text-xs">· lượt ' + h.seq + '</span>' : ''}</td><td class="text-center">${badge}</td><td class="text-right text-muted">${fmtTime(h.timestamp)}</td><td class="text-center">${act}</td></tr>`;
                }).join('') : '<tr><td colspan="6" class="text-center text-muted py-8">Không có lượt rút nào khớp bộ lọc.</td></tr>';
            };

            /* ---------- xác nhận (dùng lại hộp thoại modal-confirm) ---------- */
            const confirmAction = (msgHtml, okLabel, fn) => {
                const msg = $('confirm-msg'), btn = $('btn-exec-confirm'); if (!msg || !btn) return;
                msg.innerHTML = msgHtml;
                State.activeDeleteAction = async () => {
                    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang xử lý...';
                    try { await fn(); } catch (e) { Utils.toast(typeof e === 'string' ? e : 'Thao tác thất bại, vui lòng thử lại.', 'error'); console.error(e); }
                    btn.disabled = false; btn.innerHTML = 'Đồng ý Xóa'; btn.className = 'btn btn-danger w-full';
                    UI.closeModal('modal-confirm');
                };
                btn.className = 'btn btn-danger w-full'; btn.innerHTML = okLabel;
                UI.openModal('modal-confirm');
            };

            const revoke = async (id, resetTurn) => {
                const h = hist.find(x => x.id === id); if (!h) throw 'Không tìm thấy bản ghi.';
                const acc = (State.accountsCache || []).find(a => a.user === h.user); if (!acc) throw 'Không tìm thấy tài khoản ' + h.user + '.';
                const hRef = db.collection('lixi_history').doc(id), aRef = db.collection('accounts').doc(acc.docId);
                let deducted = 0;
                await db.runTransaction(async t => {
                    const [hd, ad] = await Promise.all([t.get(hRef), t.get(aRef)]);   // NHANH: đọc cùng lúc
                    if (!hd.exists) throw 'Bản ghi không còn tồn tại.';
                    if (hd.data().status === 'revoked') throw 'Lượt này đã được thu hồi trước đó.';
                    if (!ad.exists) throw 'Tài khoản không tồn tại.';
                    const a = ad.data(), amount = hd.data().amount || 0, cur = a.points || 0;
                    deducted = Math.min(amount, cur);
                    const upd = { points: cur - deducted };
                    if (a.lixiDate === hd.data().date) {
                        const FV = firebase.firestore.FieldValue, n = a.lixiCount != null ? a.lixiCount : 1, tot = a.lixiTotal != null ? a.lixiTotal : (a.lixiAmount || 0);
                        if (resetTurn && n <= 1) { upd.lixiDate = FV.delete(); upd.lixiAmount = FV.delete(); upd.lixiCount = FV.delete(); upd.lixiTotal = FV.delete(); }
                        else { upd.lixiTotal = Math.max(0, tot - amount); if (resetTurn) upd.lixiCount = n - 1; }   // trả lại 1 lượt rút
                    }
                    t.update(aRef, upd);
                    t.update(hRef, { status: 'revoked', revokedAt: Date.now(), revokedBy: 'admin', deducted, resetTurn: !!resetTurn });
                    if (hd.data().dateKey) t.set(db.collection('lixi_daily').doc(hd.data().dateKey), { count: firebase.firestore.FieldValue.increment(-1), points: firebase.firestore.FieldValue.increment(-amount) }, { merge: true });
                    t.set(db.collection('point_history').doc(), { user: h.user, action: 'revoke', detail: 'Admin thu hồi lì xì ngày ' + (hd.data().date || '') + (resetTurn ? ' (cấp lại lượt rút)' : ''), pointsChanged: -deducted, timestamp: Date.now() });
                });
                Utils.toast(`Đã thu hồi ${deducted} điểm của ${qdH(h.user)}` + (resetTurn ? ' và cấp lại lượt rút.' : '.'), 'success');
            };

            return {
                init: () => {
                    if (started) return; started = true;
                    cfg = normCfg(null);
                    db.collection('settings').doc('lixi_config').onSnapshot(doc => { cfg = normCfg(doc.exists ? doc.data() : null); renderConfig(doc.exists ? doc.data() : null); renderAll(); }, e => { console.warn('lixi_config', e); Utils.toast('Không đọc được cấu hình Lì Xì.', 'error'); });
                    qdSlow(db.collection('lixi_history').orderBy('timestamp', 'desc').limit(3000), 500).onSnapshot(snap => {
                        hist = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderAll();
                    }, e => { console.warn('lixi_history', e); $('tb-lx-history').innerHTML = '<tr><td colspan="6" class="text-center text-danger py-8">Không đọc được lịch sử Lì Xì (không đủ quyền hoặc mất kết nối máy chủ).</td></tr>'; });
                    subDaily();
                    setInterval(() => { tickN++; if (keyOf() !== dailyKey) subDaily(); renderLive(); if (tickN % 5 === 0) renderToday(); }, 1000);
                },
                renderAll,
                onEdit: () => { dirty = true; recalc(); },
                addPrize: () => {
                    const body = $('tb-lx-config'); if (!body.querySelector('.lx-prize-points')) body.innerHTML = '';
                    body.insertAdjacentHTML('beforeend', prizeRow({ points: 10, chance: 5 }, body.children.length)); dirty = true; recalc();
                },
                removePrize: btn => {
                    const rows = document.querySelectorAll('#tb-lx-config tr');
                    if (rows.length <= 1) return Utils.toast('Cần giữ lại ít nhất 1 mức điểm.', 'warning');
                    btn.closest('tr').remove(); dirty = true; recalc();
                },
                resetDefaults: () => { fillPrizes(DEFAULT_PRIZES); $('cfg-lx-budget').value = 0; $('cfg-lx-big').value = 68; dirty = true; recalc(); Utils.toast('Đã nạp lại bảng mặc định — bấm "Lưu Phần Thưởng" để áp dụng.', 'info'); },
                toggle: cb => {
                    const on = cb.checked;
                    db.collection('settings').doc('lixi_config').set({ isEnabled: on }, { merge: true })
                        .then(() => Utils.toast(on ? 'Đã MỞ cửa Lì Xì!' : 'Đã ĐÓNG cửa Lì Xì!', 'success'))
                        .catch(() => { Utils.toast('Lỗi lưu cấu hình.', 'error'); cb.checked = !on; });
                },
                saveSchedule: () => {
                    const od = $('cfg-lx-open-date').value, ot = $('cfg-lx-open-time').value;
                    const date = $('cfg-lx-end-date').value, time = $('cfg-lx-end-time').value, msg = $('cfg-lx-closed-msg').value.trim();
                    if (!!od !== !!ot) return Utils.toast('Hãy nhập đủ cả NGÀY và GIỜ mở cửa (hoặc để trống cả hai).', 'warning');
                    if (!!date !== !!time) return Utils.toast('Hãy nhập đủ cả NGÀY và GIỜ tự đóng (hoặc để trống cả hai).', 'warning');
                    const o = stamp(od, ot), e = stamp(date, time);
                    if (o && e && e <= o) return Utils.toast('Giờ tự đóng phải sau giờ mở cửa.', 'error');
                    const past = e && e <= Date.now();
                    db.collection('settings').doc('lixi_config').set({ isEnabled: $('cfg-lx-toggle').checked, openDate: od, openTime: ot, endDate: date, endTime: time, closedMessage: msg }, { merge: true })
                        .then(() => past ? Utils.toast('Đã lưu — lưu ý giờ tự đóng đã qua nên Lì Xì sẽ ở trạng thái ĐÓNG.', 'warning')
                            : Utils.toast(o && o > Date.now() ? 'Đã lưu! Người dùng sẽ thấy đồng hồ đếm ngược tới giờ mở cửa.' : 'Đã lưu cấu hình đóng/mở Lì Xì!', 'success'))
                        .catch(() => Utils.toast('Lỗi lưu cấu hình.', 'error'));
                },
                clearSchedule: () => {
                    ['cfg-lx-open-date', 'cfg-lx-open-time', 'cfg-lx-end-date', 'cfg-lx-end-time'].forEach(id => { $(id).value = ''; });
                    db.collection('settings').doc('lixi_config').set({ openDate: '', openTime: '', endDate: '', endTime: '' }, { merge: true })
                        .then(() => Utils.toast('Đã xóa toàn bộ hẹn giờ mở/đóng.', 'success')).catch(() => Utils.toast('Lỗi lưu cấu hình.', 'error'));
                },
                toggleRedraw: cb => {
                    const on = cb.checked, v = Math.floor(Number($('cfg-lx-maxdraw').value));
                    const max = v >= 2 && v <= 50 ? v : 3;
                    db.collection('settings').doc('lixi_config').set({ allowRedraw: on, maxPerDay: max }, { merge: true })
                        .then(() => Utils.toast(on ? `Đã BẬT rút lại trong ngày (tối đa ${max} lượt/ngày).` : 'Đã TẮT rút lại — mỗi tài khoản chỉ rút 1 lần/ngày.', 'success'))
                        .catch(() => { Utils.toast('Lỗi lưu cấu hình.', 'error'); cb.checked = !on; });
                },
                saveMaxDraw: () => {
                    const inp = $('cfg-lx-maxdraw'), v = Number(inp.value);
                    if (!Number.isInteger(v) || v < 2 || v > 50) { inp.value = cfg ? cfg.maxPerDay : 3; return Utils.toast('Số lượt tối đa phải là số nguyên từ 2 đến 50.', 'error'); }
                    db.collection('settings').doc('lixi_config').set({ maxPerDay: v }, { merge: true })
                        .then(() => Utils.toast(`Đã lưu: tối đa ${v} lượt/ngày.`, 'success')).catch(() => Utils.toast('Lỗi lưu cấu hình.', 'error'));
                },
                savePrizes: () => {
                    const list = readPrizes();
                    if (!list.length) return Utils.toast('Cần ít nhất 1 mức điểm.', 'error');
                    for (const p of list) {
                        if (!Number.isInteger(p.points) || p.points < 1 || p.points > 1000000) return Utils.toast('Số điểm phải là số nguyên từ 1 đến 1.000.000.', 'error');
                        if (!isFinite(p.chance) || p.chance < 0) return Utils.toast('Tỉ lệ không hợp lệ (phải ≥ 0).', 'error');
                    }
                    if (!list.some(p => p.chance > 0)) return Utils.toast('Cần ít nhất 1 mức điểm có tỉ lệ lớn hơn 0.', 'error');
                    const big = Math.floor(Number($('cfg-lx-big').value)), budget = Math.floor(Number($('cfg-lx-budget').value) || 0);
                    if (!(big >= 1)) return Utils.toast('Mốc "đại cát" phải ≥ 1.', 'error');
                    if (budget < 0) return Utils.toast('Ngân sách ngày không được âm.', 'error');
                    const min = Math.min(...list.filter(p => p.chance > 0).map(p => p.points));
                    if (budget > 0 && budget < min) return Utils.toast(`Ngân sách ngày (${budget}) nhỏ hơn mức điểm nhỏ nhất (${min}) — sẽ không ai rút được.`, 'error');
                    db.collection('settings').doc('lixi_config').set({ prizes: list, bigThreshold: big, dailyBudget: budget, updatedAt: Date.now() }, { merge: true })
                        .then(() => { dirty = false; Utils.toast('Đã lưu phần thưởng Lì Xì!', 'success'); })
                        .catch(() => Utils.toast('Lỗi lưu cấu hình.', 'error'));
                },
                askRevoke: (id, reset) => {
                    const h = hist.find(x => x.id === id); if (!h) return;
                    confirmAction(`Thu hồi <b>${num(h.amount)}</b> điểm lì xì của <b>${esc(h.user)}</b> (ngày ${esc(h.date)})?<br>` +
                        (reset ? 'Tài khoản sẽ được <b>rút lại</b> trong hôm nay.' : 'Tài khoản vẫn <b>không</b> được rút lại trong ngày.') +
                        '<br><span class="text-muted text-sm">Nếu số điểm hiện có thấp hơn, chỉ trừ phần còn lại.</span>', 'Đồng ý Thu Hồi', () => revoke(id, reset));
                },
                exportReport: () => {
                    const rows = hist.filter(inRange);
                    if (!rows.length) return Utils.toast('Không có dữ liệu Lì Xì trong khoảng thời gian đã chọn.', 'warning');
                    const ok = rows.filter(histOk), rev = rows.filter(h => !histOk(h)), pts = ok.reduce((a, h) => a + (h.amount || 0), 0);
                    const th = (t, c) => `<th bgcolor="${c || '#dc2626'}"><font color="#ffffff">${t}</font></th>`;
                    const c = cfg || normCfg(null), dl = deadline(c);
                    const stText = !c.isEnabled ? 'Đang đóng (thủ công)' : (openAt(c) && Date.now() < openAt(c) ? 'Chưa mở (mở lúc ' + new Date(openAt(c)).toLocaleString('vi-VN') + ')' : (dl && Date.now() >= dl ? 'Đã đóng (quá giờ hẹn)' : 'Đang mở'));
                    let h = `<table border="1"><tr><td colspan="2" bgcolor="#fde68a"><b>BÁO CÁO LÌ XÌ — ${esc(rangeLabel())}</b></td></tr>
                        <tr><td>Thời điểm xuất</td><td>${esc(new Date().toLocaleString('vi-VN'))}</td></tr>
                        <tr><td>Trạng thái hiện tại</td><td>${esc(stText)}</td></tr>
                        <tr><td>Ngân sách điểm / ngày</td><td>${c.dailyBudget > 0 ? c.dailyBudget : 'Không giới hạn'}</td></tr>
                        <tr><td>Số lượt rút tối đa / tài khoản / ngày</td><td>${c.allowRedraw ? c.maxPerDay + ' (cho phép rút lại)' : '1 (không rút lại)'}</td></tr>
                        <tr><td>Số lượt rút hợp lệ</td><td>${ok.length}</td></tr>
                        <tr><td>Tổng điểm đã phát</td><td>${pts}</td></tr>
                        <tr><td>Điểm trung bình / lượt</td><td>${ok.length ? (pts / ok.length).toFixed(2) : 0}</td></tr>
                        <tr><td>Số tài khoản đã rút</td><td>${new Set(ok.map(x => x.user)).size}</td></tr>
                        <tr><td>Số lượt đã thu hồi</td><td>${rev.length}</td></tr>
                        <tr><td>Điểm đã thu hồi (thực trừ)</td><td>${rev.reduce((a, x) => a + (x.deducted != null ? x.deducted : (x.amount || 0)), 0)}</td></tr></table><br>`;

                    const byDay = {}; ok.forEach(x => { const k = x.dateKey || x.date; const d = byDay[k] = byDay[k] || { date: x.date, n: 0, p: 0 }; d.n++; d.p += x.amount || 0; });
                    h += `<table border="1"><thead><tr>${th('Ngày')}${th('Số lượt')}${th('Tổng điểm phát')}${th('TB điểm / lượt')}</tr></thead><tbody>` +
                        Object.keys(byDay).sort().reverse().map(k => `<tr><td>${esc(byDay[k].date)}</td><td align="center">${byDay[k].n}</td><td align="center">${byDay[k].p}</td><td align="center">${(byDay[k].p / byDay[k].n).toFixed(2)}</td></tr>`).join('') + `</tbody></table><br>`;

                    const per = {}; ok.forEach(x => { const p = per[x.user] = per[x.user] || { n: 0, p: 0, last: 0 }; p.n++; p.p += x.amount || 0; p.last = Math.max(p.last, x.timestamp || 0); });
                    const cur = {}; (State.accountsCache || []).forEach(a => { cur[a.user] = a.points || 0; });
                    h += `<table border="1"><thead><tr>${th('STT')}${th('Tài Khoản')}${th('Số lượt rút')}${th('Tổng điểm lì xì')}${th('TB / lượt')}${th('Điểm hiện có')}${th('Lần rút gần nhất')}</tr></thead><tbody>` +
                        Object.keys(per).sort((a, b) => per[b].p - per[a].p).map((u, i) => `<tr><td align="center">${i + 1}</td><td>${esc(u)}</td><td align="center">${per[u].n}</td><td align="center">${per[u].p}</td><td align="center">${(per[u].p / per[u].n).toFixed(2)}</td><td align="center">${cur[u] != null ? cur[u] : ''}</td><td align="center">${esc(fmtTime(per[u].last))}</td></tr>`).join('') + `</tbody></table><br>`;

                    h += `<table border="1"><thead><tr>${th('STT')}${th('Tài Khoản')}${th('Điểm')}${th('Ngày')}${th('Trạng Thái')}${th('Điểm bị trừ')}${th('Thời Gian Rút')}${th('Thời Gian Thu Hồi')}</tr></thead><tbody>` +
                        rows.map((x, i) => `<tr><td align="center">${i + 1}</td><td>${esc(x.user)}</td><td align="center">${x.amount || 0}</td><td align="center">${esc(x.date)}</td><td align="center">${histOk(x) ? 'Hợp lệ' : 'Đã thu hồi'}</td><td align="center">${histOk(x) ? '' : (x.deducted != null ? x.deducted : (x.amount || 0))}</td><td align="center">${esc(fmtTime(x.timestamp))}</td><td align="center">${esc(fmtTime(x.revokedAt))}</td></tr>`).join('') + `</tbody></table>`;
                    AdminActions.downloadXLS(h, 'Bao_Cao_Li_Xi');
                }
            };
        })();

/* ===== Băm đáp án (SHA-256 thuần JS, chạy được cả khi không có crypto.subtle) ===== */
const QHash = (() => {
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    function sha256(str) {
        const msg = Array.from(new TextEncoder().encode(str)), l = msg.length;
        msg.push(0x80); while (msg.length % 64 !== 56) msg.push(0);
        const hi = Math.floor(l * 8 / 4294967296), lo = (l * 8) >>> 0;
        [hi, lo].forEach(v => { msg.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); });
        let h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
        for (let i = 0; i < msg.length; i += 64) {
            const w = new Array(64);
            for (let t = 0; t < 16; t++) w[t] = (msg[i + 4 * t] << 24) | (msg[i + 4 * t + 1] << 16) | (msg[i + 4 * t + 2] << 8) | msg[i + 4 * t + 3];
            for (let t = 16; t < 64; t++) {
                const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3), s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
                w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
            }
            let [a, b, c, d, e, f, g, hh] = h;
            for (let t = 0; t < 64; t++) {
                const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[t] + w[t]) | 0;
                const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0;
                hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
            }
            h = [(h[0] + a) | 0, (h[1] + b) | 0, (h[2] + c) | 0, (h[3] + d) | 0, (h[4] + e) | 0, (h[5] + f) | 0, (h[6] + g) | 0, (h[7] + hh) | 0];
        }
        return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
    }
    // "Hà Nội!" == "ha noi": bỏ dấu, bỏ ký tự đặc biệt, không phân biệt hoa/thường
    const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const hash = (qid, answer) => sha256('qd-wheel|' + qid + '|' + norm(answer));
    return { sha256, norm, hash };
})();


/* ===== QVis: quyết định câu hỏi nào đang HIỆN cho người dùng (dùng chung admin.html & qt.html) =====
   settings/wheel_config.quiz = { mode: 'all' (lần lượt theo thứ tự) | 'random', count (0 = tất cả), rotateMin, start: 'HH:MM', end: 'HH:MM' }
   wheel_questions/{id}.showAt / hideAt (ms, tùy chọn) = hẹn giờ hiện / ẩn từng câu */
const QVis = {
    cfg(q) {
        q = q || {}; const mode = q.mode === 'random' ? 'random' : 'all', n = parseInt(q.count);
        // count: số câu hiện cùng lúc, áp dụng cho CẢ 2 chế độ; 0 = hiện tất cả (mặc định: lần lượt = tất cả, ngẫu nhiên = 3)
        return { mode, count: isNaN(n) ? (mode === 'random' ? 3 : 0) : Math.min(50, Math.max(0, n)), rotateMin: Math.max(0, parseInt(q.rotateMin) || 0), start: q.start || '', end: q.end || '' };
    },
    KEEP_MS: 5000,    // câu vừa có NGƯỜI KHÁC trả lời đúng còn hiện 5 giây (thấy kết quả "đã có người xác thực") rồi nhường chỗ cho câu mới
    mins(hhmm) { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; },
    // Khung giờ hiện câu hỏi hằng ngày -> { open, next: thời điểm đóng/mở kế tiếp (ms) }
    win(c, now) {
        const s = this.mins(c.start), e = this.mins(c.end);
        if (s == null || e == null || s === e) return { open: true, next: null };
        const d = new Date(now), cur = d.getHours() * 60 + d.getMinutes();
        const open = s < e ? (cur >= s && cur < e) : (cur >= s || cur < e);
        const target = open ? e : s, t = new Date(now);
        t.setHours(Math.floor(target / 60), target % 60, 0, 0);
        if (t.getTime() <= now) t.setDate(t.getDate() + 1);
        return { open, next: t.getTime() };
    },
    // Phiên đổi câu: mỗi rotateMin phút (hoặc mỗi ngày nếu = 0) -> mọi người cùng thấy 1 bộ câu hỏi
    slot(c, now) {
        if (c.rotateMin > 0) { const ms = c.rotateMin * 60000, k = Math.floor(now / ms); return { key: 'r' + k, idx: k, start: k * ms, end: (k + 1) * ms }; }
        const d = new Date(now); d.setHours(0, 0, 0, 0); const st = d.getTime(), e = new Date(st); e.setDate(e.getDate() + 1);
        return { key: 'd' + d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(), idx: Math.round(st / 86400000), start: st, end: e.getTime() };
    },
    inTime(q, now) { return q.active !== false && (!q.showAt || now >= q.showAt) && (!q.hideAt || now < q.hideAt); },
    h(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; },
    compute(all, quizCfg, now, me) {
        const c = this.cfg(quizCfg), w = this.win(c, now), sl = this.slot(c, now);
        let up = Infinity;
        all.forEach(q => { if (q.active !== false && !q.claimedBy && q.showAt && q.showAt > now && (!q.hideAt || q.hideAt > q.showAt)) up = Math.min(up, q.showAt); });
        let list = [];
        if (w.open) {
            const pool = all.filter(q => this.inTime(q, now));
            let sorted;
            if (c.mode === 'random') {
                // VÒNG XOAY: mọi câu xếp theo 1 thứ tự trộn cố định (cả câu đã có người trả lời, để vòng không bị xô lệch),
                // mỗi phiên dịch sang nhóm câu KẾ TIẾP -> câu không ai trả lời được sẽ được thay bằng câu khác, đi hết 1 vòng mới lặp lại.
                // Ô nào trong nhóm đã có người trả lời -> lấy bù câu ở GIỮA vòng (xa các phiên sắp tới nhất, tránh lặp lại ngay phiên sau).
                // (trước đây cách trộn theo phiên quá yếu nên đổi phiên hay ra lại đúng câu cũ)
                const ring = pool.slice().sort((a, b) => this.h(a.id) - this.h(b.id) || (a.id < b.id ? -1 : 1));
                const N = ring.length, step = c.count > 0 ? Math.min(c.count, N) : N, off = N ? (sl.idx * step) % N : 0;
                const win = [], rest = [];
                for (let k = 0; k < N; k++) (k < step ? win : rest).push(ring[(off + k) % N]);
                const mid = Math.floor(rest.length / 2);
                sorted = win.concat(rest.slice(mid), rest.slice(0, mid));
            } else sorted = pool.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));   // lần lượt: theo thứ tự tạo
            // Chỗ hiện câu hỏi LUÔN dành cho câu CHƯA ai trả lời: câu đã có người xác thực (kể cả chính mình) không chiếm chỗ
            // -> trả lời xong / bị người khác trả lời trước là có ngay câu kế tiếp hiện lên thay
            let open = sorted.filter(q => !q.claimedBy);
            if (c.count > 0) open = open.slice(0, c.count);
            const keep = new Set(open);
            sorted.forEach(q => { if (q.claimedBy && q.claimedBy !== me && now - (q.claimedAt || 0) < this.KEEP_MS) keep.add(q); });
            list = sorted.filter(q => keep.has(q));
        }
        // Câu mình đã trả lời đúng: ẨN khỏi danh sách (lượt quay đã cộng vào bộ đếm, không hiện lại câu hỏi)
        return { list, cfg: c, open: w.open, next: w.next, slotEnd: c.mode === 'random' ? sl.end : null, upcoming: isFinite(up) ? up : null };
    },
    fmtClock(ms) { const d = new Date(ms), n = new Date(), p = x => String(x).padStart(2, '0'); const hm = p(d.getHours()) + ':' + p(d.getMinutes()); return d.toDateString() === n.toDateString() ? hm : hm + ' ' + p(d.getDate()) + '/' + p(d.getMonth() + 1); },
    fmtLeft(ms) { ms = Math.max(0, ms); const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60, p = v => String(v).padStart(2, '0'); return (h ? h + ':' + p(m) : m) + ':' + p(x); }
};

        // Kho câu đố Tết có sẵn (đáp án cách nhau bởi |, so khớp không phân biệt dấu/hoa thường)
        const WQ_BANK = [
            ['Năm 2027 âm lịch là năm con gì?', 'Dê | Con dê | Mùi | Đinh Mùi | Năm Mùi'],
            ['Năm 2026 âm lịch là năm con gì?', 'Ngựa | Con ngựa | Ngọ | Bính Ngọ | Năm Ngọ'],
            ['Tết Nguyên Đán bắt đầu vào ngày mùng mấy tháng Giêng âm lịch?', '1 | Mùng 1 | Mồng 1 | Một | Mùng một | Mồng một'],
            ['Bánh truyền thống hình vuông gói lá dong ngày Tết miền Bắc là bánh gì?', 'Bánh chưng | Chưng'],
            ['Bánh truyền thống hình trụ dài ngày Tết miền Nam là bánh gì?', 'Bánh tét | Tét'],
            ['Ông Công Ông Táo về trời vào ngày nào tháng Chạp âm lịch?', '23 | Ngày 23 | 23 tháng Chạp | 23 tháng 12 | Hăm ba'],
            ['Ông Táo cưỡi con vật gì để về chầu trời?', 'Cá chép | Cá'],
            ['Hoa đặc trưng ngày Tết của miền Bắc là hoa gì?', 'Hoa đào | Đào | Cành đào'],
            ['Hoa đặc trưng ngày Tết của miền Nam là hoa gì?', 'Hoa mai | Mai | Mai vàng | Hoa mai vàng'],
            ['Mâm ngũ quả ngày Tết gồm bao nhiêu loại quả?', '5 | Năm | 5 loại | Năm loại'],
            ['Người đầu tiên bước vào nhà sau giao thừa gọi là tục gì?', 'Xông đất | Xông nhà | Đạp đất'],
            ['Thời khắc chuyển giao giữa năm cũ và năm mới gọi là gì?', 'Giao thừa | Đêm giao thừa'],
            ['Tháng cuối cùng của năm âm lịch được gọi là tháng gì?', 'Tháng Chạp | Chạp'],
            ['Tháng đầu tiên của năm âm lịch được gọi là tháng gì?', 'Tháng Giêng | Giêng'],
            ['Phong bao màu đỏ đựng tiền mừng tuổi ngày Tết gọi là gì?', 'Lì xì | Bao lì xì | Phong bao | Bao đỏ'],
            ['Điền vào chỗ trống: "Thịt mỡ, dưa hành, câu đối đỏ. Cây nêu, tràng pháo, bánh ... xanh"', 'Chưng | Bánh chưng'],
            ['12 con giáp gồm bao nhiêu con vật?', '12 | Mười hai'],
            ['Con giáp đứng đầu tiên trong 12 con giáp là con gì?', 'Chuột | Con chuột | Tý | Tí'],
            ['Con giáp đứng cuối cùng trong 12 con giáp là con gì?', 'Lợn | Con lợn | Heo | Con heo | Hợi'],
            ['Trong 12 con giáp của Việt Nam, con Mèo thay cho con vật nào?', 'Thỏ | Con thỏ'],
            ['Cây dựng trước sân nhà ngày Tết để xua đuổi tà ma gọi là cây gì?', 'Cây nêu | Nêu'],
            ['Đầu năm người ta thường đến xin chữ của ai?', 'Ông đồ | Thầy đồ | Ông đồ già'],
            ['Món thịt kho với trứng vịt ngày Tết của miền Nam thường gọi là gì?', 'Thịt kho trứng | Thịt kho tàu | Thịt kho hột vịt | Thịt kho'],
            ['Hoàn thành câu: "Mùng 1 Tết cha, mùng 2 Tết ..., mùng 3 Tết thầy"', 'Mẹ'],
            ['Rằm tháng Giêng còn được gọi là Tết gì?', 'Nguyên Tiêu | Tết Nguyên Tiêu | Thượng Nguyên | Tết Thượng Nguyên'],
            ['Bánh chưng được gói bằng loại lá gì?', 'Lá dong | Dong'],
            ['Theo truyền thuyết, hoàng tử nào đã làm ra bánh chưng, bánh giầy?', 'Lang Liêu | Hoàng tử Lang Liêu'],
            ['Món dưa muối thường ăn kèm bánh chưng, thịt mỡ ngày Tết miền Bắc là gì?', 'Dưa hành | Hành muối | Hành củ muối'],
            ['Tết Nguyên Đán còn được gọi ngắn gọn là Tết gì?', 'Tết Ta | Tết Âm lịch | Tết Cổ truyền | Tết Âm'],
            ['Năm 2027 là năm Đinh ...? (điền con giáp)', 'Mùi | Dê']
        ];

        /* ===== Câu hỏi nhận lượt quay: wheel_questions (công khai, đáp án đã băm) + wheel_question_keys (đáp án gốc cho admin) ===== */
        const WheelQ = (() => {
            const $ = id => document.getElementById(id);
            const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            const fmtTime = ts => ts ? new Date(ts).toLocaleString('vi-VN') : '';
            let qs = [], keys = {}, editing = null, started = false, busy = false, quizCfg = {}, setDirty = false, visSig = '';
            const toInput = ms => { if (!ms) return ''; const d = new Date(ms); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
            const fromInput = v => { if (!v) return null; const t = new Date(v).getTime(); return isNaN(t) ? null : t; };
            const visible = () => QVis.compute(qs, quizCfg, Date.now(), null);

            const parseAnswers = raw => {
                const seen = new Set(), out = [];
                String(raw || '').split('|').map(x => x.trim().replace(/\s+/g, ' ')).forEach(a => { const n = QHash.norm(a); if (n && !seen.has(n)) { seen.add(n); out.push(a.slice(0, 120)); } });
                return out.slice(0, 10);
            };
            const confirmAction = (msgHtml, okLabel, fn) => {
                const msg = $('confirm-msg'), btn = $('btn-exec-confirm'); if (!msg || !btn) return;
                msg.innerHTML = msgHtml;
                State.activeDeleteAction = async () => {
                    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang xử lý...';
                    try { await fn(); } catch (e) { Utils.toast(typeof e === 'string' ? e : 'Thao tác thất bại, vui lòng thử lại.', 'error'); console.error(e); }
                    btn.disabled = false; btn.innerHTML = 'Đồng ý Xóa'; btn.className = 'btn btn-danger w-full';
                    UI.closeModal('modal-confirm');
                };
                btn.className = 'btn btn-danger w-full'; btn.innerHTML = okLabel;
                UI.openModal('modal-confirm');
            };

            const render = () => {
                const tb = $('tb-wq'); if (!tb) return;
                const claimed = qs.filter(q => q.claimedBy).length, open = qs.filter(q => q.active !== false && !q.claimedBy).length;
                $('wq-st-total').textContent = 'Tổng: ' + qs.length; $('wq-st-open').textContent = 'Đang mở: ' + open; $('wq-st-claimed').textContent = 'Đã xác thực: ' + claimed;
                const vis = visible(), visIds = new Set(vis.list.map(q => q.id)), now = Date.now();
                visSig = vis.list.map(q => q.id).join() + '|' + vis.open; updateLive(vis);
                if (!qs.length) { tb.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-8">Chưa có câu hỏi nào. Hãy thêm câu hỏi đầu tiên ở trên.</td></tr>'; return; }
                tb.innerHTML = qs.map((q, i) => {
                    const ans = keys[q.id] ? keys[q.id].join('  |  ') : '';
                    let st;
                    if (q.claimedBy) st = `<span class="badge badge-danger" style="text-transform:none">✅ ${esc(q.claimedBy)}</span><div class="text-muted text-xs mt-1">${esc(fmtTime(q.claimedAt))} · ${q.ticketUsed ? 'đã quay' : 'chưa quay'}</div>`;
                    else if (q.active === false) st = '<span class="badge badge-offline">Đang ẩn</span>';
                    else if (q.showAt && now < q.showAt) st = `<span class="badge badge-warning" style="text-transform:none">⏰ Chờ hiện</span>`;
                    else if (q.hideAt && now >= q.hideAt) st = '<span class="badge badge-offline">Hết giờ</span>';
                    else st = '<span class="badge badge-online">Đang mở</span>';
                    if (visIds.has(q.id)) st += ' <span class="badge badge-online" style="text-transform:none">👁 Đang hiện</span>';
                    if (q.showAt || q.hideAt) st += `<div class="wq-sched">${q.showAt ? '⏰ Hiện: ' + esc(fmtTime(q.showAt)) : ''}${q.showAt && q.hideAt ? '<br>' : ''}${q.hideAt ? '⛔ Ẩn: ' + esc(fmtTime(q.hideAt)) : ''}</div>`;
                    const id = esc(q.id);
                    return `<tr><td class="text-center text-muted">${i + 1}</td><td class="wq-q">${esc(q.question)}</td><td class="wq-ans">${ans ? esc(ans) : '<span class="text-muted">—</span>'}</td><td>${st}</td>` +
                        `<td><div class="wq-btns"><button class="btn btn-outline" onclick="WheelQ.edit('${id}')"><i class="fa-solid fa-pen"></i> Sửa</button>` +
                        `<button class="btn btn-outline" onclick="WheelQ.toggle('${id}')">${q.active === false ? '<i class="fa-solid fa-eye"></i> Hiện' : '<i class="fa-solid fa-eye-slash"></i> Ẩn'}</button>` +
                        (q.claimedBy ? `<button class="btn btn-outline" onclick="WheelQ.reopen('${id}')"><i class="fa-solid fa-rotate-left"></i> Mở lại</button>` : '') +
                        `<button class="btn btn-danger" onclick="WheelQ.remove('${id}')"><i class="fa-solid fa-trash"></i></button></div></td></tr>`;
                }).join('');
            };

            // Dòng tóm tắt "người dùng đang thấy gì"
            const updateLive = (vis) => {
                const el = $('wq-live'); if (!el) return;
                const now = Date.now(), c = vis.cfg; let t;
                if (!vis.open) t = `⏸ Ngoài khung giờ · câu hỏi hiện lúc ${QVis.fmtClock(vis.next)} (còn ${QVis.fmtLeft(vis.next - now)})`;
                else {
                    const n = vis.list.length;
                    t = `👁 Người dùng đang thấy ${n} câu (${c.mode === 'random' ? 'ngẫu nhiên' : 'lần lượt'}${c.count > 0 ? ', tối đa ' + c.count + ' câu' : ', tất cả'})`;
                    if (c.mode === 'random') t += c.rotateMin > 0 ? ` · đổi bộ mới sau ${QVis.fmtLeft(vis.slotEnd - now)}` : ' · đổi bộ mới mỗi ngày';
                    if (vis.next) t += ` · đóng lúc ${QVis.fmtClock(vis.next)}`;
                    if (vis.upcoming) t += ` · câu hẹn giờ tiếp theo: ${QVis.fmtClock(vis.upcoming)}`;
                }
                el.textContent = t; el.style.color = vis.open ? 'var(--color-success)' : 'var(--color-warning)';
            };
            const paintSettings = () => {
                const c = QVis.cfg(quizCfg);
                $('wq-mode').value = c.mode; $('wq-count').value = c.count; $('wq-rotate').value = quizCfg && quizCfg.rotateMin != null ? c.rotateMin : 30;
                $('wq-start').value = c.start; $('wq-end').value = c.end; toggleRand(); paintDirty();
            };
            // "Đổi câu mới sau" chỉ dùng cho chế độ ngẫu nhiên
            const toggleRand = () => document.querySelectorAll('.wq-rand').forEach(el => { const on = $('wq-mode').value === 'random'; el.style.opacity = on ? '1' : '.4'; el.querySelector('input').disabled = !on; });
            const paintDirty = () => {
                const b = $('wq-set-save'); if (!b) return;
                b.innerHTML = setDirty ? '<i class="fa-solid fa-triangle-exclamation mr-2"></i> Chưa lưu: bấm để lưu' : '<i class="fa-solid fa-floppy-disk mr-2"></i> Lưu cài đặt';
                b.className = setDirty ? 'btn btn-warning w-full' : 'btn btn-success w-full';
            };

            const resetForm = () => {
                editing = null; $('wq-question').value = ''; $('wq-answers').value = ''; $('wq-show').value = ''; $('wq-hide').value = '';
                $('wq-save').innerHTML = '<i class="fa-solid fa-plus mr-2"></i> Thêm câu hỏi'; $('wq-cancel').style.display = 'none';
            };

            return {
                init: () => {
                    if (started || !$('tb-wq')) return; started = true;
                    db.collection('wheel_questions').onSnapshot(snap => {
                        qs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
                        render();
                    }, err => { console.error(err); $('tb-wq').innerHTML = '<tr><td colspan="5" class="text-center text-danger py-8">Không tải được danh sách câu hỏi.</td></tr>'; });
                    db.collection('wheel_question_keys').onSnapshot(snap => {
                        keys = {}; snap.docs.forEach(d => { keys[d.id] = Array.isArray(d.data().answers) ? d.data().answers : []; }); render();
                    }, err => console.error(err));
                    ['wq-question', 'wq-answers'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') WheelQ.save(); }));
                    $('wq-bank-size').textContent = WQ_BANK.length;
                    // Mỗi giây: cập nhật đếm ngược; nếu bộ câu đang hiện thay đổi (đổi phiên / tới giờ hẹn) thì vẽ lại bảng
                    setInterval(() => { const v = visible(); if (v.list.map(q => q.id).join() + '|' + v.open !== visSig) render(); else updateLive(v); }, 1000);
                },
                save: async () => {
                    if (busy) return;
                    const question = $('wq-question').value.trim().replace(/\s+/g, ' '), answers = parseAnswers($('wq-answers').value);
                    if (!question) return Utils.toast('Vui lòng nhập câu hỏi.', 'warning');
                    if (!answers.length) return Utils.toast('Vui lòng nhập ít nhất 1 đáp án đúng.', 'warning');
                    const showAt = fromInput($('wq-show').value), hideAt = fromInput($('wq-hide').value);
                    if (showAt && hideAt && hideAt <= showAt) return Utils.toast('Giờ ẩn phải sau giờ hiện.', 'warning');
                    busy = true;
                    try {
                        const isEdit = !!editing, id = editing || db.collection('wheel_questions').doc().id;
                        const answerHashes = answers.map(a => QHash.hash(id, a));
                        const batch = db.batch();
                        if (isEdit) batch.update(db.collection('wheel_questions').doc(id), { question, answerHashes, showAt, hideAt });
                        else batch.set(db.collection('wheel_questions').doc(id), { question, answerHashes, showAt, hideAt, active: true, createdAt: Date.now(), claimedBy: null, claimedAt: null, ticketUsed: null });
                        batch.set(db.collection('wheel_question_keys').doc(id), { answers, updatedAt: Date.now() });
                        await batch.commit();
                        Utils.toast(isEdit ? 'Đã lưu chỉnh sửa câu hỏi.' : 'Đã thêm câu hỏi mới.', 'success');
                        resetForm();
                    } catch (e) { console.error(e); Utils.toast('Không lưu được câu hỏi, vui lòng thử lại.', 'error'); }
                    busy = false;
                },
                edit: id => {
                    const q = qs.find(x => x.id === id); if (!q) return;
                    editing = id; $('wq-question').value = q.question || ''; $('wq-answers').value = (keys[id] || []).join(' | ');
                    $('wq-show').value = toInput(q.showAt); $('wq-hide').value = toInput(q.hideAt);
                    $('wq-save').innerHTML = '<i class="fa-solid fa-floppy-disk mr-2"></i> Lưu chỉnh sửa'; $('wq-cancel').style.display = '';
                    $('wq-question').focus(); $('wq-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
                },
                cancelEdit: () => resetForm(),
                onConfig: (data) => {
                    quizCfg = (data && data.quiz) || {};
                    if (!setDirty && $('wq-mode')) paintSettings();
                    if (started) render();
                },
                onSetEdit: () => { setDirty = true; toggleRand(); paintDirty(); },
                saveSettings: async () => {
                    const mode = $('wq-mode').value === 'random' ? 'random' : 'all';
                    const count = parseInt($('wq-count').value), rotateMin = parseInt($('wq-rotate').value);
                    const start = $('wq-start').value, end = $('wq-end').value;
                    if (isNaN(count) || count < 0 || count > 50) return Utils.toast('Số câu hiện cùng lúc phải từ 0 đến 50 (0 = tất cả).', 'warning');
                    if (mode === 'random' && (isNaN(rotateMin) || rotateMin < 0)) return Utils.toast('Số phút đổi câu không hợp lệ (0 = đổi mỗi ngày).', 'warning');
                    if ((start && !end) || (!start && end)) return Utils.toast('Khung giờ cần nhập đủ cả giờ bắt đầu và giờ kết thúc (hoặc để trống cả hai).', 'warning');
                    if (start && start === end) return Utils.toast('Giờ bắt đầu và kết thúc không được trùng nhau.', 'warning');
                    try {
                        await db.collection('settings').doc('wheel_config').set({ quiz: { mode, count: count, rotateMin: isNaN(rotateMin) ? 30 : rotateMin, start, end } }, { merge: true });
                        setDirty = false; paintDirty(); Utils.toast('Đã lưu cài đặt hiển thị câu hỏi!', 'success');
                    } catch (e) { console.error(e); Utils.toast('Không lưu được cài đặt.', 'error'); }
                },
                addRandom: async () => {
                    if (busy) return;
                    const n = parseInt($('wq-bank-n').value) || 5;
                    const have = new Set(qs.map(q => QHash.norm(q.question)));
                    const pool = WQ_BANK.filter(([q]) => !have.has(QHash.norm(q)));
                    if (!pool.length) return Utils.toast('Đã thêm hết câu hỏi trong kho có sẵn.', 'warning');
                    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
                    const pick = pool.slice(0, n);
                    busy = true;
                    try {
                        const batch = db.batch(), t0 = Date.now();
                        pick.forEach(([question, raw], k) => {
                            const id = db.collection('wheel_questions').doc().id, answers = parseAnswers(raw);
                            batch.set(db.collection('wheel_questions').doc(id), { question, answerHashes: answers.map(a => QHash.hash(id, a)), showAt: null, hideAt: null, active: true, createdAt: t0 + k, claimedBy: null, claimedAt: null, ticketUsed: null });
                            batch.set(db.collection('wheel_question_keys').doc(id), { answers, updatedAt: t0 });
                        });
                        await batch.commit();
                        Utils.toast(`Đã thêm ${pick.length} câu hỏi Tết ngẫu nhiên!`, 'success');
                    } catch (e) { console.error(e); Utils.toast('Không thêm được câu hỏi, vui lòng thử lại.', 'error'); }
                    busy = false;
                },
                toggle: async id => {
                    const q = qs.find(x => x.id === id); if (!q) return;
                    try { await db.collection('wheel_questions').doc(id).update({ active: q.active === false }); Utils.toast(q.active === false ? 'Đã hiện câu hỏi.' : 'Đã ẩn câu hỏi.', 'success'); }
                    catch (e) { console.error(e); Utils.toast('Không cập nhật được.', 'error'); }
                },
                reopen: id => {
                    const q = qs.find(x => x.id === id); if (!q || !q.claimedBy) return;
                    confirmAction(`Mở lại câu hỏi <b>"${esc(q.question)}"</b>?<br>Người xác thực hiện tại (<b>${esc(q.claimedBy)}</b>) sẽ mất ${q.ticketUsed ? 'dấu xác thực (lượt đã quay vẫn giữ nguyên)' : '<b>lượt quay chưa dùng</b>'} và ai trả lời đúng sớm nhất sẽ được xác thực lại.`, 'Mở lại câu hỏi', async () => {
                        await db.collection('wheel_questions').doc(id).update({ claimedBy: null, claimedAt: null, ticketUsed: null, usedAt: null });
                        Utils.toast('Đã mở lại câu hỏi.', 'success');
                    });
                },
                remove: id => {
                    const q = qs.find(x => x.id === id); if (!q) return;
                    const warn = q.claimedBy && !q.ticketUsed ? `<br><b style="color:var(--color-danger)">${esc(q.claimedBy)} đang giữ 1 lượt quay chưa dùng sẽ bị mất.</b>` : '';
                    confirmAction(`Xóa vĩnh viễn câu hỏi <b>"${esc(q.question)}"</b>?${warn}`, 'Xóa câu hỏi', async () => {
                        const b = db.batch(); b.delete(db.collection('wheel_questions').doc(id)); b.delete(db.collection('wheel_question_keys').doc(id)); await b.commit();
                        if (editing === id) resetForm();
                        Utils.toast('Đã xóa câu hỏi.', 'success');
                    });
                }
            };
        })();

        const AdminCore = {
            init: () => {
                Theme.init(); Utils.buildTimeSelects();
                
                // Áp dụng Phân Quyền Động & Cập nhật Thời gian thực (Realtime Dynamic Role Enforcement)
                const originalNavigate = UI.navigate;
                UI.navigate = (viewId, element = null, isMobile = false) => {
                    if (State.currentUserRole === 'manager' && viewId !== 'dashboard') {
                        if (!State.currentUserPerms || !State.currentUserPerms.includes(viewId)) {
                            return Utils.toast("Lỗi quyền: Bạn không được Admin cấp phép truy cập chức năng này.", "error");
                        }
                    }
                    originalNavigate(viewId, element, isMobile);
                };

                // Lắng nghe thay đổi quyền hạn liên tục từ Database
                if (State.currentUser) {
                    db.collection("accounts").where("user", "==", State.currentUser).onSnapshot(snap => {
                        if (!snap.empty) {
                            const myData = snap.docs[0].data();
                            const myRole = (myData.role === 'admin' || myData.role === 'manager') ? myData.role : 'user';
                            State.isOwner = myData.owner === true;
                            const myPerms = myData.permissions || ['dashboard', 'attendance', 'registration'];
                            
                            State.currentUserRole = myRole;
                            State.currentUserPerms = myPerms;
                            document.documentElement.classList.toggle('role-manager', myRole === 'manager');   // Quản lý: Cài đặt Hệ thống chỉ còn phần cơ bản

                            // 1. NẾU BỊ GIÁNG CẤP XUỐNG USER HOẶC BỊ KHÓA
                            if (myRole === 'user' || myData.isBlocked) {
                                Utils.toast("Tài khoản đã bị khóa hoặc tước quyền Quản trị!", "error");
                                setTimeout(() => window.location.reload(), 1500);
                                return;
                            }

                            const allViews = ['vps', 'pointshop', 'attendance', 'registration', 'tournament', 'luckynumber', 'wheel', 'tranhthuong', 'lixi', 'rps', 'nemcon', 'invite', 'transfer', 'payout', 'security', 'accounts', 'news', 'approvals', 'reportbot', 'apppush', 'videos', 'calls', 'gifts'];
                            
                            // 2. NẾU LÀ MANAGER THÌ ẨN/HIỆN CHỨC NĂNG THEO QUYỀN
                            if (myRole === 'manager') {
                                allViews.forEach(v => {
                                    const cards = document.querySelectorAll(`.card[onclick="UI.navigate('${v}')"]`);
                                    const navItems = document.querySelectorAll(`.m-nav-item[onclick*="'${v}'"], .nav-item[onclick*="'${v}'"], .m-menu-item[onclick*="'${v}'"], .q-act[onclick*="'${v}'"]`);
                                    if (!myPerms.includes(v)) {
                                        cards.forEach(c => c.style.display = 'none');
                                        navItems.forEach(n => n.style.display = 'none');
                                    } else {
                                        cards.forEach(c => c.style.display = ''); // Khôi phục hiển thị
                                        navItems.forEach(n => n.style.display = '');
                                    }
                                });
                                
                                const statAccCard = document.getElementById('stat-accs');
                                if (statAccCard && statAccCard.parentElement) {
                                    statAccCard.parentElement.style.display = myPerms.includes('accounts') ? '' : 'none';
                                }

                                // => KIỂM TRA CHỨC NĂNG HIỆN TẠI (ĐẨY RA NGOÀI NẾU BỊ TƯỚC QUYỀN TRỰC TIẾP)
                                const activeSection = document.querySelector('.view-section.active');
                                if (activeSection) {
                                    const currentViewId = activeSection.id.replace('view-', '');
                                    if (currentViewId !== 'dashboard' && !myPerms.includes(currentViewId)) {
                                        Utils.toast("Quyền truy cập tính năng này vừa bị tước bỏ!", "error");
                                        
                                        // Đóng mọi Modal đang mở để hủy thay đổi dang dở
                                        document.querySelectorAll('.modal-overlay.active').forEach(m => {
                                            m.classList.remove('active');
                                            m.style.display = 'none';
                                        });
                                        
                                        // Đẩy về bảng điều khiển
                                        UI.navigate('dashboard');
                                    }
                                }
                            } 
                            // 3. NẾU ĐƯỢC THĂNG CẤP LÊN LẠI ADMIN (HIỂN THỊ TẤT CẢ)
                            else if (myRole === 'admin') {
                                allViews.forEach(v => {
                                    document.querySelectorAll(`.card[onclick="UI.navigate('${v}')"]`).forEach(c => c.style.display = '');
                                    document.querySelectorAll(`.m-nav-item[onclick*="'${v}'"], .nav-item[onclick*="'${v}'"], .m-menu-item[onclick*="'${v}'"], .q-act[onclick*="'${v}'"]`).forEach(n => n.style.display = '');
                                });
                                const statAccCard = document.getElementById('stat-accs');
                                if (statAccCard && statAccCard.parentElement) statAccCard.parentElement.style.display = '';
                            }
                        } else {
                            Utils.toast("Tài khoản không tồn tại trên hệ thống!", "error");
                            setTimeout(() => window.location.reload(), 1500);
                        }
                    });
                }
                
                // Đồng hồ thực & Đếm ngược UI Timer
                setInterval(() => { 
                    document.getElementById('live-clock').innerText = new Date().toLocaleTimeString('vi-VN'); 
                    
                    document.querySelectorAll('.admin-unlock-timer').forEach(el => {
                        const target = parseInt(el.getAttribute('data-target'));
                        const diff = target - Date.now();
                        if (diff > 0) {
                            const m = Math.floor(diff / 60000);
                            const s = Math.floor((diff % 60000) / 1000);
                            el.innerText = `${m}p ${s}s`;
                        } else {
                            el.innerText = "Đang xử lý...";
                        }
                    });
                }, 1000);

                /** ĐỒNG BỘ: CẤU HÌNH BẢO TRÌ */
                db.collection("settings").doc("maintenance").onSnapshot(doc => {
                    const toggle = document.getElementById('cfg-mt-toggle');
                    const msgInp = document.getElementById('cfg-mt-message');
                    const dateInp = document.getElementById('cfg-mt-end-date');
                    const timeInp = document.getElementById('cfg-mt-end-time');
                    const configBox = document.getElementById('maintenance-config-box');

                    if (doc.exists) {
                        const data = doc.data();
                        if(toggle) toggle.checked = !!data.isEnabled;
                        if(msgInp) msgInp.value = data.message || "Hệ thống đang được nâng cấp. Vui lòng quay lại sau!";
                        if(dateInp) dateInp.value = data.endDate || "";
                        if(timeInp) timeInp.value = data.endTime || "";
                        if(configBox) configBox.style.display = data.isEnabled ? 'block' : 'none';
                    } else {
                        if(toggle) toggle.checked = false;
                        if(configBox) configBox.style.display = 'none';
                    }
                });

                /** ĐỒNG BỘ: CẤU HÌNH ĐIỂM DANH & CHỐNG ĐIỂM DANH HỘ */
                db.collection("settings").doc("attendance").onSnapshot(docConfig => {
                    if(docConfig.exists) {
                        const data = docConfig.data();
                        Utils.setSelectorsFrom24H(data.start || "09:00", "cfg-start"); Utils.setSelectorsFrom24H(data.end || "10:00", "cfg-end");
                        
                        const secToggle = document.getElementById('cfg-att-security-toggle');
                        const secStatus = document.getElementById('att-security-status-text');
                        if (secToggle && secStatus) {
                            const isSecEnabled = data.antiProxyEnabled !== false; 
                            secToggle.checked = isSecEnabled;
                            secStatus.innerText = isSecEnabled ? "ĐANG BẬT" : "ĐANG TẮT";
                            secStatus.style.color = isSecEnabled ? "var(--color-success)" : "var(--text-muted)";
                        }
                    } else {
                        const secToggle = document.getElementById('cfg-att-security-toggle');
                        const secStatus = document.getElementById('att-security-status-text');
                        if (secToggle) secToggle.checked = true;
                        if (secStatus) { secStatus.innerText = "ĐANG BẬT"; secStatus.style.color = "var(--color-success)"; }
                    }
                });

                /** ĐỒNG BỘ: CẤU HÌNH TỰ ĐỘNG KHÓA VÀ MỞ KHÓA TÀI KHOẢN */
                db.collection("settings").doc("account_config").onSnapshot(doc => {
                    if(doc.exists) {
                        State.accountConfig = doc.data();
                        const inactEl = document.getElementById('cfg-acc-inactivity');
                        const autoEl = document.getElementById('cfg-acc-autounlock');
                        const tempEl = document.getElementById('cfg-acc-tempunlock');
                        if(inactEl) inactEl.value = State.accountConfig.inactivityMinutes !== undefined ? State.accountConfig.inactivityMinutes : 1440;
                        if(autoEl) autoEl.value = State.accountConfig.autoUnlockMinutes || 0;
                        if(tempEl) tempEl.value = State.accountConfig.tempUnlockMinutes || 0;
                        const sesEl = document.getElementById('cfg-acc-session'), sesStEl = document.getElementById('cfg-acc-session-staff');
                        if (sesEl) sesEl.value = State.accountConfig.sessionMinutes !== undefined ? State.accountConfig.sessionMinutes : 360;
                        if (sesStEl) sesStEl.value = State.accountConfig.staffSessionMinutes !== undefined ? State.accountConfig.staffSessionMinutes : 360;
                        const kl = document.getElementById('kick-all-last'), ep = +State.accountConfig.sessionEpoch || 0;
                        if (kl) kl.textContent = ep ? 'Lần gần nhất: ' + new Date(ep).toLocaleString('vi-VN') + (State.accountConfig.sessionEpochBy ? ' · bởi ' + State.accountConfig.sessionEpochBy : '') : '';
                    } else {
                        State.accountConfig = { inactivityMinutes: 1440, autoUnlockMinutes: 0, tempUnlockMinutes: 0 };
                    }
                });

                /** ĐỒNG BỘ: CẤU HÌNH THƯỞNG VẬT PHẨM KHI ĐIỂM DANH */
                db.collection("settings").doc("attendance_reward_items").onSnapshot(doc => {
                    const toggle = document.getElementById('cfg-att-reward-toggle');
                    const spinsInp = document.getElementById('cfg-att-reward-spins');
                    const ticketsInp = document.getElementById('cfg-att-reward-tickets');
                    const statusTxt = document.getElementById('att-reward-status-text');

                    if (doc.exists) {
                        const data = doc.data();
                        if(toggle) toggle.checked = !!data.isEnabled;
                        if(statusTxt) {
                            statusTxt.innerText = data.isEnabled ? "ĐANG BẬT" : "ĐANG TẮT";
                            statusTxt.style.color = data.isEnabled ? "var(--color-success)" : "var(--text-muted)";
                        }
                        if(spinsInp) spinsInp.value = data.spins || 0;
                        if(ticketsInp) ticketsInp.value = data.tickets || 0;
                    }
                    if (window.AttSched) window.AttSched.load(doc.exists ? doc.data() : {});
                });

                /** ĐỒNG BỘ: CẤU HÌNH NHIỆM VỤ */
                db.collection("settings").doc("task_config").onSnapshot(doc => {
                    const loginInp = document.getElementById('cfg-task-login');
                    if (doc.exists) {
                        const data = doc.data();
                        if (loginInp) loginInp.value = data.loginReward !== undefined ? data.loginReward : 10;
                    } else {
                        if (loginInp) loginInp.value = 10;
                    }
                });

                /** ĐỒNG BỘ: CẤU HÌNH KÉO BÚA BAO */
                db.collection("settings").doc("rps_config").onSnapshot(doc => {
                    const toggle = document.getElementById('cfg-rps-toggle');
                    const statusText = document.getElementById('rps-status-text');
                    const feeInp = document.getElementById('cfg-rps-fee');
                    const winInp = document.getElementById('cfg-rps-win');
                    const loseInp = document.getElementById('cfg-rps-lose');
                    const timeInp = document.getElementById('cfg-rps-time'); 
                    
                    if (doc.exists) {
                        const data = doc.data();
                        if(toggle) toggle.checked = data.isEnabled !== false;
                        if(statusText) {
                            statusText.innerText = data.isEnabled !== false ? "ĐANG BẬT" : "ĐANG TẮT";
                            statusText.style.color = data.isEnabled !== false ? "var(--color-success)" : "var(--color-danger)";
                        }
                        Utils.setSelectorsFrom24H(data.start || "00:00", "cfg-rps-start"); 
                        Utils.setSelectorsFrom24H(data.end || "23:59", "cfg-rps-end");

                        if(feeInp) feeInp.value = data.fee !== undefined ? data.fee : 5;
                        if(winInp) winInp.value = data.winReward !== undefined ? data.winReward : 10;
                        if(loseInp) loseInp.value = data.loseReward !== undefined ? data.loseReward : -5;
                        if(timeInp) timeInp.value = data.timeLimit !== undefined ? data.timeLimit : 10;
                    } else {
                        if(toggle) toggle.checked = true;
                        if(statusText) { statusText.innerText = "ĐANG BẬT"; statusText.style.color = "var(--color-success)"; }
                        Utils.setSelectorsFrom24H("00:00", "cfg-rps-start"); 
                        Utils.setSelectorsFrom24H("23:59", "cfg-rps-end");
                        
                        if(feeInp) feeInp.value = 5;
                        if(winInp) winInp.value = 10;
                        if(loseInp) loseInp.value = -5;
                        if(timeInp) timeInp.value = 10;
                    }
                });

                /** ĐỒNG BỘ: LỊCH SỬ KÉO BÚA BAO */
                qdSlow(db.collection("rps_history").orderBy("timestamp", "desc"), 500).onSnapshot(snap => {
                    const tbody = document.getElementById('tb-rps-history');
                    if(!tbody) return;
                    tbody.innerHTML = "";
                    State.rpsHistoryCache = [];

                    if(snap.empty) {
                        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-8">Chưa có dữ liệu trận đấu Kéo Búa Bao.</td></tr>`;
                        return;
                    }

                    snap.forEach(doc => {
                        const d = doc.data();
                        State.rpsHistoryCache.push(d);
                        const timeStr = new Date(d.timestamp).toLocaleString('vi-VN');
                        
                        const p1Icon = AdminActions.getRPSIcon(d.p1Choice);
                        const p2Icon = AdminActions.getRPSIcon(d.p2Choice);
                        
                        let resultHtml = '';
                        if(d.winner === 'draw') resultHtml = '<span class="badge badge-warning" style="font-size:13px; padding: 4px 10px;">Hòa Nhau</span>';
                        else if(d.winner === d.player1) resultHtml = `<span class="badge badge-success" style="font-size:13px; padding: 4px 10px;">${d.player1} Thắng</span>`;
                        else resultHtml = `<span class="badge badge-danger" style="font-size:13px; padding: 4px 10px;">${d.player2} Thắng</span>`;

                        qdRow(tbody, `<tr>
                            <td><b>${d.player1}</b></td>
                            <td><b>${d.player2}</b></td>
                            <td class="text-center"><span class="text-2xl">${p1Icon} <span class="text-sm mx-2 text-muted">vs</span> ${p2Icon}</span></td>
                            <td class="text-center">${resultHtml}<br><span class="text-xs text-muted font-bold">${d.p1Score} - ${d.p2Score}</span></td>
                            <td class="text-right text-muted text-sm">${timeStr}</td>
                        </tr>`);
                    });
                });

                /** ĐỒNG BỘ: CẤU HÌNH CỬA HÀNG ĐIỂM */
                db.collection("settings").doc("point_shop_config").onSnapshot(doc => {
                    try { ShopAdmin.onConfig(doc.exists ? doc.data() : null); } catch (e) { console.error('ShopAdmin', e); }
                    const toggle = document.getElementById('cfg-shop-toggle');
                    const statusText = document.getElementById('shop-status-text');
                    const spinInput = document.getElementById('cfg-shop-spin-cost');
                    const ticketInput = document.getElementById('cfg-shop-ticket-cost');

                    if (doc.exists) {
                        const data = doc.data();
                        if(toggle) toggle.checked = data.isEnabled !== false;
                        if(statusText) {
                            statusText.innerText = data.isEnabled !== false ? "ĐANG MỞ CỬA" : "ĐANG ĐÓNG CỬA";
                            statusText.style.color = data.isEnabled !== false ? "var(--color-success)" : "var(--color-danger)";
                        }
                        if(spinInput) spinInput.value = data.spinCost || 100;
                        if(ticketInput) ticketInput.value = data.ticketCost || 50;
                    } else {
                        if(toggle) toggle.checked = true;
                        if(statusText) { statusText.innerText = "ĐANG MỞ CỬA"; statusText.style.color = "var(--color-success)"; }
                        if(spinInput) spinInput.value = 100;
                        if(ticketInput) ticketInput.value = 50;
                    }
                });

                /** ĐỒNG BỘ: LỊCH SỬ CỬA HÀNG ĐIỂM */
                qdSlow(db.collection("point_history").where("action", "==", "exchange"), 500).onSnapshot(snap => {
                    const tbody = document.getElementById('tb-shop-history-list');
                    if(tbody) tbody.innerHTML = "";
                    State.pointShopHistoryCache = [];
                    
                    if(snap.empty) { 
                        if(tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-8">Chưa có giao dịch quy đổi nào.</td></tr>`; 
                        return; 
                    }
                    
                    let records = [];
                    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
                    snap.forEach(doc => { 
                        const d = doc.data(); 
                        if(d.timestamp >= thirtyDaysAgo) { records.push(d); } 
                    });
                    records.sort((a,b) => b.timestamp - a.timestamp);
                    
                    records.forEach(d => {
                        State.pointShopHistoryCache.push(d);
                        const timeStr = new Date(d.timestamp).toLocaleString('vi-VN', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'});
                        
                        if(tbody) qdRow(tbody, `
                            <tr>
                                <td><b class="text-main">${qdH(d.user)}</b></td>
                                <td><span class="text-info font-bold">${qdH(d.detail)}</span></td>
                                <td class="text-center"><span class="badge badge-success" style="font-size: 13px;">${d.pointsChanged} Điểm</span></td>
                                <td class="text-right text-muted text-sm">${timeStr}</td>
                            </tr>`);
                    });
                });

                LuckySchedule.start();
                // Bản nháp bảng lượt quay: đồng bộ từ máy chủ khi Admin chưa sửa dở
                LuckySchedule.onChange(() => { if (!AdminActions.lnDirty) AdminActions.lnFromServer(); else AdminActions.renderLuckySchedule(); });
                db.collection("settings").doc("lucky_round_presets").onSnapshot(doc => {
                    AdminActions.lnPresets = doc.exists ? (doc.data().byId || {}) : {};
                    if (!AdminActions.lnDirty) AdminActions.lnFromServer();
                });
                setInterval(() => AdminActions.renderLuckySchedule(), 1000);

                db.collection("settings").doc("lucky_live").onSnapshot(doc => {
                    const isLive = doc.exists && doc.data().isLive === true;
                    const tg = document.getElementById('cfg-ln-live-toggle'), st = document.getElementById('ln-live-status-text');
                    if (tg) tg.checked = isLive;
                    if (st) { st.innerText = isLive ? "🔴 ĐANG PHÁT TRỰC TIẾP" : "ĐANG TẮT"; st.style.color = isLive ? "var(--color-danger)" : ""; }
                });

                db.collection("settings").doc("lucky_number_result").onSnapshot(doc => {
                    const el = document.getElementById('admin-current-win-number');
                    if(doc.exists && doc.data().number) {
                        el.innerText = doc.data().number.toString().padStart(2, '0');
                    } else {
                        el.innerText = "--";
                    }
                });
                
                db.collection("settings").doc("wheel_config").onSnapshot(doc => {
                    WheelPrize.onConfig(doc.exists ? doc.data() : null);
                    try { WheelQ.onConfig(doc.exists ? doc.data() : null); } catch (e) { console.error('WheelQ.onConfig', e); }
                    
                    const toggle = document.getElementById('cfg-wheel-toggle');
                    const statusText = document.getElementById('wheel-status-text');
                    const isEnabled = doc.exists && doc.data().isEnabled !== false; 
                    if(toggle && statusText) {
                        toggle.checked = isEnabled;
                        statusText.innerText = isEnabled ? "ĐANG MỞ" : "ĐANG KHÓA";
                        statusText.style.color = isEnabled ? "var(--color-success)" : "var(--color-danger)";
                    }
                });


                /** ĐỒNG BỘ: CẤU HÌNH ĐÃ HẸN GIỜ ĐÓNG VÒNG ĐĂNG KÝ */
                db.collection("settings").doc("registration_config").onSnapshot(doc => {
                    const toggle = document.getElementById('cfg-reg-toggle');
                    const statusText = document.getElementById('reg-status-text');
                    const endDateInp = document.getElementById('cfg-reg-end-date');
                    const endTimeInp = document.getElementById('cfg-reg-end-time');

                    if (doc.exists) {
                        const data = doc.data();
                        if (toggle) toggle.checked = data.isEnabled !== false;
                        if (statusText) {
                            statusText.innerText = data.isEnabled !== false ? "ĐANG MỞ" : "ĐANG KHÓA";
                            statusText.style.color = data.isEnabled !== false ? "var(--color-success)" : "var(--color-danger)";
                        }
                        if (endDateInp) endDateInp.value = data.endDate || "";
                        if (endTimeInp) endTimeInp.value = data.endTime || "";
                    } else {
                        if (toggle) toggle.checked = true;
                        if (statusText) { statusText.innerText = "ĐANG MỞ"; statusText.style.color = "var(--color-success)"; }
                    }
                });

                qdSlow(db.collection("attendance"), 500).onSnapshot(snap => {
                    const statElement = document.getElementById('stat-atts'); 
                    const tbody = document.getElementById('tb-att-list'); if (!tbody) return; 
                    tbody.innerHTML = ""; State.attendanceCache = [];
                    if(snap.empty) { tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-8"><i class="fa-solid fa-folder-open text-3xl mb-2 opacity-50 block"></i> Hệ thống chưa có dữ liệu điểm danh.</td></tr>`; return; }
                    
                    let records = []; const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000); let todayCount = 0;
                    snap.forEach(doc => {
                        const d = doc.data();
                        if(d.timestamp >= thirtyDaysAgo) records.push(d);
                        if(d.date === State.todayStr) todayCount++;
                    });

                    if (statElement) statElement.innerText = todayCount;
                    records.sort((a, b) => b.timestamp - a.timestamp); 

                    if(records.length === 0) {
                         tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-8"><i class="fa-solid fa-folder-open text-3xl mb-2 opacity-50 block"></i> Không có dữ liệu trong 30 ngày qua.</td></tr>`; return;
                    }

                    records.forEach(d => {
                        State.attendanceCache.push(d); const uname = d.userName || "Unknown";
                        qdRow(tbody, `<tr><td><div class="flex items-center gap-3"><div style="width: 36px; height: 36px; border-radius: 50%; background: var(--color-success); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0;">${uname.charAt(0).toUpperCase()}</div><span class="font-bold text-main">${uname}</span></div></td><td><span class="badge badge-offline" style="font-size: 12px; padding: 6px 12px;"><i class="fa-regular fa-clock"></i> ${d.time || "--:--"} - ${d.date}</span></td><td style="font-family: var(--font-family-mono); color: var(--text-muted); font-size: 13px; letter-spacing: 1px;">${d.userId || "---"}</td></tr>`);
                    });
                });

                qdSlow(db.collection("users").orderBy("timestamp", "desc"), 500).onSnapshot(snap => {
                    document.getElementById('stat-regs').innerText = snap.size;
                    const tbody = document.getElementById('tb-reg-list'); 
                    tbody.innerHTML = ""; State.regCache = [];
                    
                    const selectTour = document.getElementById('tour-participant-select');
                    let optionsHtml = `<option value="">-- Chọn một tài khoản --</option>`;

                    if(snap.empty) { 
                        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-8">Không có đơn đăng ký ID Game mới nào.</td></tr>`; 
                        if(selectTour) selectTour.innerHTML = `<option value="">-- Chưa có dữ liệu đăng ký --</option>`;
                        return; 
                    }

                    snap.forEach(doc => {
                        const d = doc.data(); State.regCache.push(d);
                        const timeStr = new Date(d.timestamp).toLocaleString('vi-VN', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'});
                        
                        tbody.insertAdjacentHTML('beforeend', `
                        <tr>
                            <td>
                                <span class="font-bold text-main">${qdH(d.name)}</span><br>
                                <span class="text-xs text-muted"><i class="fa-solid fa-user text-primary mr-1"></i>${qdH(d.submitter)}</span>
                            </td>
                            <td style="font-family: var(--font-family-mono); font-size: 16px; color: var(--color-warning); font-weight: 700; letter-spacing: 1.5px;">${qdH(d.gameId)}</td>
                            <td class="text-muted text-sm">${timeStr}</td>
                            <td class="text-right">
                                <button class="btn btn-warning" style="padding: 8px 12px; font-size: 12px; margin-right: 5px;" onclick="AdminActions.allowReregister('${doc.id}', '${qdJ(d.submitter)}')">
                                    <i class="fa-solid fa-rotate-left mr-1"></i> Cho Phép Nộp Lại
                                </button>
                            </td>
                        </tr>`);

                        optionsHtml += `<option value="${qdH(d.submitter)}" data-gameid="${qdH(d.gameId)}" data-ingame="${qdH(d.name)}">[${qdH(d.submitter)}] - ID: ${qdH(d.gameId)} (${qdH(d.name)})</option>`;
                    });

                    if(selectTour) selectTour.innerHTML = optionsHtml;
                });

                qdSlow(db.collection("tournament").orderBy("timestamp", "desc"), 500).onSnapshot(snap => {
                    const tbody = document.getElementById('tb-tournament-list');
                    const ptbody = document.getElementById('tb-tournament-points');
                    const checkboxList = document.getElementById('tour-group-checkbox-list');
                    
                    if(tbody) tbody.innerHTML = "";
                    if(ptbody) ptbody.innerHTML = "";
                    let checkboxesHtml = ``;

                    if(snap.empty) {
                        if(tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-8">Chưa có ai tham gia giải đấu.</td></tr>`;
                        if(ptbody) ptbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-8">Bảng điểm trống.</td></tr>`;
                        if(checkboxList) checkboxList.innerHTML = `<div class="text-center text-muted p-4">Chưa có người tham gia giải đấu</div>`;
                        return;
                    }

                    let allDocs = [];
                    snap.forEach(doc => { allDocs.push({ id: doc.id, ...doc.data() }); });
                    
                    allDocs.forEach(d => {
                        const timeStr = new Date(d.timestamp).toLocaleString('vi-VN');
                        if(tbody) tbody.insertAdjacentHTML('beforeend', `
                            <tr>
                                <td><b class="text-main"><i class="fa-solid fa-user text-muted mr-2"></i>${qdH(d.username)}</b></td>
                                <td><span class="badge badge-warning" style="font-size: 13px; padding: 4px 10px;">${qdH(d.ingame)}</span></td>
                                <td style="font-family: var(--font-family-mono); letter-spacing: 1px; color: var(--color-info);">${qdH(d.gameId || '---')}</td>
                                <td><span class="badge" style="background: var(--bg-elevated); color: var(--text-main); border: 1px solid var(--border-strong);">${qdH(d.team || '---')}</span></td>
                                <td class="text-muted text-sm">${timeStr}</td>
                                <td class="text-right">
                                    <button class="btn-icon" style="color: var(--color-danger); border-color: rgba(239, 68, 68, 0.3);" onclick="AdminActions.requestDelete('tournament', '${d.id}', 'Bạn có muốn XÓA <b>${qdJ(qdH(d.username))}</b> khỏi danh sách giải đấu không?')" title="Xóa Khỏi Giải"><i class="fa-solid fa-trash-can"></i></button>
                                </td>
                            </tr>`);

                        checkboxesHtml += `
                        <label class="flex items-center gap-3 mb-2 cursor-pointer p-2 rounded hover:bg-hover" style="transition: 0.2s;">
                            <input type="checkbox" class="tour-group-cb" value="${d.id}" style="width: 18px; height: 18px;">
                            <div class="flex-col">
                                <b class="text-main">${qdH(d.username)}</b>
                                <span class="text-xs text-muted">ID: ${qdH(d.gameId || '---')} | Đội: ${qdH(d.team || 'Chưa phân đội')}</span>
                            </div>
                        </label>`;
                    });

                    if(checkboxList) checkboxList.innerHTML = checkboxesHtml;

                    const sortedByPoints = [...allDocs].sort((a, b) => (b.points || 0) - (a.points || 0));
                    sortedByPoints.forEach(d => {
                        if(ptbody) ptbody.insertAdjacentHTML('beforeend', `
                            <tr>
                                <td style="white-space: nowrap;"><b class="text-main"><i class="fa-solid fa-user text-muted mr-2"></i>${qdH(d.username)}</b></td>
                                <td style="white-space: nowrap;"><span class="badge badge-success" style="font-size: 14px; padding: 4px 10px; background: rgba(16, 185, 129, 0.15); border: 1px solid var(--color-success);"><i class="fa-solid fa-star mr-1"></i> ${d.points || 0}</span></td>
                                <td class="text-right" style="white-space: nowrap;">
                                    <button class="btn-icon" style="color: var(--color-success); border-color: rgba(16, 185, 129, 0.3); width: 36px; height: 36px;" onclick="AdminActions.openPointModal('${d.id}', '${qdJ(d.username)}', ${d.points || 0})" title="Cập Nhật Điểm">
                                        <i class="fa-solid fa-pen-to-square"></i>
                                    </button>
                                </td>
                            </tr>`);
                    });
                });

                qdSlow(db.collection("accounts"), 800).onSnapshot(snap => {
                    document.getElementById('stat-accs').innerText = snap.size;
                    const tbodyAcc = document.getElementById('tb-acc-list'); tbodyAcc.innerHTML = "";
                    State.accountsCache = [];

                    if(snap.empty) {
                        tbodyAcc.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-8">Chưa có tài khoản User nào trên Database.</td></tr>`;
                        return;
                    }

                    const now = Date.now();
                    const accConfig = State.accountConfig || { inactivityMinutes: 1440, autoUnlockMinutes: 0, tempUnlockMinutes: 0 };
                    const inactivityMs = (accConfig.inactivityMinutes !== undefined ? accConfig.inactivityMinutes : 1440) * 60 * 1000;
                    const autoUnlockMs = (accConfig.autoUnlockMinutes || 0) * 60 * 1000;
                    const tempUnlockMs = (accConfig.tempUnlockMinutes || 0) * 60 * 1000;

                    // KIỂM TRA ĐIỀU KIỆN KHÓA / MỞ KHÓA TỰ ĐỘNG
                    snap.forEach(doc => {
                        const d = doc.data(); d.docId = doc.id; State.accountsCache.push(d);
                        
                        if (!d.isBlocked) {
                            const lastActiveTime = d.lastActive || d.created_at || 0;
                            const unlockTime = d.unlockedAt || 0;
                            let shouldLock = false;
                            
                            if (tempUnlockMs > 0 && unlockTime > 0 && (now - unlockTime) > tempUnlockMs) {
                                 shouldLock = true;
                            } else if (inactivityMs > 0) {
                                 const refTime = Math.max(lastActiveTime, unlockTime);
                                 if (refTime > 0 && (now - refTime) > inactivityMs) {
                                     shouldLock = true;
                                 }
                            }

                            if (shouldLock) {
                                db.collection("accounts").doc(doc.id).update({ isBlocked: true, lockedAt: now, lockReason: "idle" });
                                d.isBlocked = true; 
                            }
                        } else {
                            if (d.lockReason !== 'security' && autoUnlockMs > 0 && d.unlockRequestedAt && (now - d.unlockRequestedAt) > autoUnlockMs) {   // khóa do Chống gian lận: không tự mở
                                db.collection("accounts").doc(doc.id).update({ isBlocked: false, unlockedAt: now, lockedAt: null, unlockRequestedAt: null });
                                d.isBlocked = false;
                            }
                        }

                        const isOnline = window.QDSession ? QDSession.pres(d).on : (now - (d.lastActive || 0)) < 120000; 
                        
                        const pointCount = d.points || 0;
                        const spinCount = d.spins || 0; 
                        const ticketCount = d.tickets || 0;
                        const conCount = d.conThrows || 0;
                        if (window.AccWallet) AccWallet.put(doc.id, d);
                        const isBlocked = d.isBlocked || false;
                        
                        let statusHtml = '';
                        if (isBlocked) {
                            if (autoUnlockMs > 0 && d.unlockRequestedAt) {
                                const targetTime = d.unlockRequestedAt + autoUnlockMs;
                                if (now < targetTime) {
                                    statusHtml = `<span class="badge badge-warning" style="display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-clock fa-spin" style="font-size: 10px;"></i> Chờ mở: <span class="admin-unlock-timer" data-target="${targetTime}" style="font-family:var(--font-family-mono);">...</span></span>`;
                                } else {
                                    statusHtml = `<span class="badge badge-warning"><i class="fa-solid fa-spinner fa-spin" style="font-size: 10px;"></i> Đang mở...</span>`;
                                }
                            } else {
                                statusHtml = `<span class="badge badge-danger"><i class="fa-solid fa-lock" style="font-size: 8px;"></i> Bị Khóa</span>`;
                            }
                        } else {
                            const live = (o) => window.QDSession ? QDSession.attrs(d, o) : '';
                            statusHtml = `<span class="badge ${isOnline ? 'badge-online' : 'badge-offline'}"${live({ fmt: 'none', on: 'badge-online', off: 'badge-offline' })}><i class="fa-solid fa-circle" style="font-size: 8px;"></i> <span${live({ fmt: 'full' })}>${Utils.timeAgo(d.lastActive, d.online)}</span></span>`;
                        }

                        const lockBtnIcon = isBlocked ? 'fa-unlock' : 'fa-lock';
                        const lockBtnColor = isBlocked ? 'var(--color-success)' : 'var(--color-warning)';
                        const lockBtnBg = isBlocked ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)';
                        const lockBtnTitle = isBlocked ? 'Mở Khóa Tài Khoản' : 'Tạm Khóa Tài Khoản';
                        
                        const uRole = (d.role === 'admin' || d.role === 'manager') ? d.role : 'user';
                        const isOwnerRow = d.owner === true, isMe = d.user === State.currentUser, meAdmin = State.currentUserRole === 'admin';
                        const canEdit = isMe ? false : (meAdmin ? !isOwnerRow : uRole === 'user');   // Quản lý chỉ thao tác trên tài khoản thành viên; không ai đụng Chủ hệ thống
                        const uPerms = d.permissions ? d.permissions.join(',') : '';
                        let roleHtml = '<span class="text-xs text-muted">Thành viên</span>';
                        let roleIcon = 'fa-user';
                        let roleColor = 'text-muted';
                        
                        if (isOwnerRow) {
                            roleHtml = '<span class="text-xs font-bold" style="color:#f59e0b">👑 Chủ hệ thống</span>';
                            roleIcon = 'fa-crown';
                            roleColor = 'text-warning';
                        } else if(uRole === 'admin') {
                            roleHtml = '<span class="text-xs font-bold text-danger">Quản trị viên</span>';
                            roleIcon = 'fa-user-shield';
                            roleColor = 'text-danger';
                        } else if (uRole === 'manager') {
                            roleHtml = '<span class="text-xs font-bold text-primary">Quản lý</span>';
                            roleIcon = 'fa-user-tie';
                            roleColor = 'text-primary';
                        }
                        
                        tbodyAcc.insertAdjacentHTML('beforeend', `
                        <tr>
                            <td>
                                <div class="flex items-center gap-3">
                                    <div class="flex-center rounded-md" style="width: 32px; height: 32px; background: var(--bg-elevated); border: 1px solid var(--border-strong);">
                                        <i class="fa-solid ${roleIcon} ${roleColor}"></i>
                                    </div>
                                    <div class="flex-col">
                                        <span class="font-bold ${isBlocked ? 'text-danger' : 'text-main'}">${qdH(d.user)}</span>
                                        ${roleHtml}
                                    </div>
                                </div>
                            </td>
                            <td style="font-family: var(--font-family-mono); letter-spacing: 1px;">${d.pass === undefined ? '<span class="text-muted text-xs" title="Quản lý không xem được mật khẩu Ban Quản Trị">🔒 ẩn</span>' : `<span class="pw-mask" tabindex="0" role="button" title="Bấm để xem / ẩn mật khẩu" data-pw="${qdH(d.pass)}" onclick="var s=this;s.textContent=s.textContent.indexOf('•')===0?s.dataset.pw:'••••••'">••••••</span>`}</td>
                            <td class="text-center"><button type="button" class="wl-cell" onclick="AccWallet.open('${doc.id}')" title="Xem ví giải trí: điểm và các loại lượt">
                                <span class="wl-c pts" title="Điểm lì xì">💰 ${pointCount}</span><span class="wl-c spn" title="Lượt vòng quay">🎡 ${spinCount}</span><span class="wl-c tkt" title="Lượt rút lì xì">🧧 ${ticketCount}</span><span class="wl-c con" title="Lượt ném còn">🎯 ${conCount}</span>
                            </button></td>
                            <td>${statusHtml}</td>
                            <td class="text-right flex justify-end flex-wrap gap-1">
                                <button class="btn-icon" style="color: var(--color-info); border-color: rgba(14, 165, 233, 0.3);" onclick="AdminActions.viewUserHistory('${qdJ(d.user)}')" title="Xem Lịch sử Biến động Dữ liệu"><i class="fa-solid fa-clock-rotate-left"></i></button>
                                ${meAdmin && canEdit ? `<button class="btn-icon" style="color: var(--brand-primary); border-color: var(--brand-primary-soft);" onclick="AdminActions.openRoleModal('${doc.id}', '${qdJ(d.user)}', '${uRole}', '${uPerms}')" title="Phân quyền: Thành viên / Quản lý / Quản trị viên"><i class="fa-solid fa-id-card-clip"></i></button>` : ''}
                                <button class="btn-icon" style="color: var(--color-warning); border-color: rgba(245, 158, 11, 0.3);" onclick="AdminActions.openSpinModal('${doc.id}', '${qdJ(d.user)}')" title="Cấp Lượt Giải Trí / Điểm"><i class="fa-solid fa-gift"></i></button>
                                ${canEdit ? '' : '<!--'}<button class="btn-icon acc-kick-btn" style="color: var(--color-danger); border-color: rgba(190, 18, 60, 0.3);" onclick="AdminActions.kickUser('${doc.id}', '${qdJ(d.user)}', this)" title="Đá ra khỏi hệ thống (đăng xuất mọi trang / thiết bị đang mở)"><i class="fa-solid fa-right-from-bracket"></i></button>
                                <button class="btn-icon" style="color: ${lockBtnColor}; border-color: ${lockBtnColor}; background: ${lockBtnBg};" onclick="AdminActions.toggleLock('${doc.id}', ${isBlocked}, '${qdJ(d.user)}')" title="${lockBtnTitle}"><i class="fa-solid ${lockBtnIcon}"></i></button>
                                <button class="btn-icon" style="color: var(--color-danger); border-color: rgba(239, 68, 68, 0.3);" onclick="AdminActions.requestDelete('accounts', '${doc.id}', 'Hành động này sẽ XÓA VĨNH VIỄN tài khoản <b>${qdJ(qdH(d.user))}</b>.')" title="Xóa Tài Khoản"><i class="fa-solid fa-trash"></i></button>${canEdit ? '' : '-->'}
                            </td>
                        </tr>`);
                    });
                });

                qdSlow(db.collection("lucky_numbers"), 300).onSnapshot(snap => {
                    const tbody = document.getElementById('tb-ln-list');
                    if(!tbody) return;
                    tbody.innerHTML = "";
                    State.currentLuckyNumbers = [];

                    if(snap.empty) {
                        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-8">Chưa có ai đăng ký số may mắn.</td></tr>`;
                        return;
                    }
                    
                    let records = [];
                    snap.forEach(doc => {
                        const d = doc.data();
                        State.currentLuckyNumbers.push(d); 
                        records.push(d);
                    });
                    records.sort((a,b) => b.lastUpdated - a.lastUpdated);

                    records.forEach(d => {
                        const timeStr = new Date(d.lastUpdated).toLocaleString('vi-VN', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'});
                        const statusHtml = d.canEdit 
                            ? `<span class="badge badge-online">Đang mở sửa</span>` 
                            : `<span class="badge badge-offline">Đã khóa</span>`;
                        
                        const btnHtml = d.canEdit
                            ? `<button class="btn btn-outline w-full mb-2" style="padding: 6px 12px; font-size: 12px;" disabled><i class="fa-solid fa-check mr-1"></i> Đã Cấp Phép</button>`
                            : `<button class="btn btn-warning w-full mb-2" style="padding: 6px 12px; font-size: 12px;" onclick="AdminActions.grantLuckyNumberEdit('${qdJ(d.user)}')"><i class="fa-solid fa-unlock mr-1"></i> Cấp Phép Sửa</button>`;

                        const forceBtn = `<button class="btn btn-success w-full" style="padding: 6px 12px; font-size: 12px;" onclick="AdminActions.setWinningNumber(${d.number})"><i class="fa-solid fa-crosshairs mr-1"></i> Chọn Số Này</button>`;

                        tbody.insertAdjacentHTML('beforeend', `
                            <tr>
                                <td><b class="text-main">${qdH(d.user)}</b></td>
                                <td class="text-center"><b style="color: #ec4899; font-size: 20px;">${d.number}</b></td>
                                <td class="text-center text-muted text-sm">${timeStr}</td>
                                <td class="text-center">${statusHtml}</td>
                                <td class="text-right flex-col">${btnHtml} ${forceBtn}</td>
                            </tr>
                        `);
                    });
                });

                qdSlow(db.collection("lucky_number_history"), 500).onSnapshot(snap => {
                    const tbody = document.getElementById('tb-lnh-history');
                    if(tbody) tbody.innerHTML = "";
                    State.luckyNumberHistoryCache = [];

                    if(snap.empty) { 
                        if(tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-8">Chưa có lịch sử quay số.</td></tr>`; 
                        return; 
                    }

                    let records = [];
                    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
                    
                    snap.forEach(doc => { 
                        const d = doc.data(); 
                        if(d.timestamp >= thirtyDaysAgo) { d.__id = doc.id; records.push(d); } 
                    });
                    if (window.LuckyRewardAdmin) LuckyRewardAdmin.catchUp(records);   // phiên quay chưa được trao (máy quay mất mạng...) -> trao bù

                    records.sort((a,b) => b.timestamp - a.timestamp);
                    if(records.length === 0) { 
                        if(tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-8">Không có dữ liệu trong 30 ngày qua.</td></tr>`; 
                    } else {
                        records.forEach(d => {
                            State.luckyNumberHistoryCache.push(d);
                            const timeStr = new Date(d.timestamp).toLocaleString('vi-VN', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'});
                            const winnersHtml = d.winners && d.winners.length > 0 
                                ? d.winners.map(w => `<span class="badge badge-online"><i class="fa-solid fa-user mr-1"></i> ${w}</span>`).join(' ')
                                : `<span class="text-muted italic">Không có người trúng</span>`;
                            
                            if(tbody) qdRow(tbody, `
                            <tr>
                                <td class="text-center"><b style="color: #ec4899; font-size: 20px;">${d.number.toString().padStart(2, '0')}</b></td>
                                <td>${winnersHtml}${(d.nearUsers && d.nearUsers.length) ? `<div class="text-xs text-muted mt-1">🥈 Giải phụ: ${d.nearUsers.join(', ')}</div>` : ''}</td>
                                <td class="text-sm">${d.rewarded ? `<span class="text-success font-bold">✓ ${d.rewardText || 'Không có thưởng'}</span>${d.nearText && d.nearUsers && d.nearUsers.length ? `<div class="text-xs text-muted">Giải phụ: ${d.nearText}</div>` : ''}` : `<span class="text-muted">—</span>`}</td>
                                <td class="text-right text-muted text-sm">${timeStr}</td>
                            </tr>`);
                        });
                    }
                });

                qdSlow(db.collection("spin_history"), 500).onSnapshot(snap => {
                    const tbodyWheel = document.getElementById('tb-wheel-history-list');
                    if(tbodyWheel) tbodyWheel.innerHTML = "";
                    State.wheelHistoryCache = [];
                    if(snap.empty) { if(tbodyWheel) tbodyWheel.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-8">Chưa có lịch sử.</td></tr>`; return; }
                    let recordsWheel = [];
                    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
                    snap.forEach(doc => { const d = doc.data(); if(d.timestamp >= thirtyDaysAgo) { recordsWheel.push(d); } });
                    recordsWheel.sort((a,b) => b.timestamp - a.timestamp);
                    recordsWheel.forEach(d => {
                        State.wheelHistoryCache.push(d);
                        const timeStr = new Date(d.timestamp).toLocaleString('vi-VN', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'});
                        const remainStr = d.remain !== undefined ? `<span class="badge badge-offline" style="font-size: 13px; color: var(--color-warning); font-weight: bold;">${d.remain}</span>` : `<span class="text-muted text-xs">--</span>`;
                        
                        if(tbodyWheel) qdRow(tbodyWheel, `<tr><td><b class="text-main">${d.userId}</b></td><td><span class="text-warning font-bold">${d.result}</span></td><td class="text-center">${remainStr}</td><td class="text-right text-muted text-sm">${timeStr}</td></tr>`);
                    });
                });

                qdSlow(db.collection("tranhthuong_history"), 500).onSnapshot(snap => {
                    const tbodyTT = document.getElementById('tb-tt-history-list');
                    if(tbodyTT) tbodyTT.innerHTML = "";
                    State.tranhThuongHistoryCache = [];
                    if(snap.empty) { if(tbodyTT) tbodyTT.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-8">Chưa có lịch sử rút lì xì.</td></tr>`; return; }
                    let recordsTT = [];
                    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
                    snap.forEach(doc => { const d = doc.data(); if(d.timestamp >= thirtyDaysAgo) { recordsTT.push(d); } });
                    recordsTT.sort((a,b) => b.timestamp - a.timestamp);
                    recordsTT.forEach(d => {
                        State.tranhThuongHistoryCache.push(d);
                        const timeStr = new Date(d.timestamp).toLocaleString('vi-VN', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'});
                        const remainStr = d.remain !== undefined ? `<span class="badge badge-offline" style="font-size: 13px; color: var(--color-danger); font-weight: bold;">${d.remain}</span>` : `<span class="text-muted text-xs">--</span>`;

                        if(tbodyTT) qdRow(tbodyTT, `<tr><td><b class="text-main">${d.userId}</b></td><td><span class="text-danger font-bold">${d.result}</span></td><td class="text-center">${remainStr}</td><td class="text-right text-muted text-sm">${timeStr}</td></tr>`);
                    });
                });

                db.collection("settings").doc("tranhthuong_config").onSnapshot(doc => {
                    TTPrize.onConfig(doc.exists ? doc.data() : null);
                    
                    const toggleTT = document.getElementById('cfg-tt-toggle');
                    const statusTextTT = document.getElementById('tt-status-text');
                    const isEnabledTT = doc.exists && doc.data().isEnabled !== false; 
                    if(toggleTT && statusTextTT) {
                        toggleTT.checked = isEnabledTT;
                        statusTextTT.innerText = isEnabledTT ? "ĐANG MỞ" : "ĐANG KHÓA";
                        statusTextTT.style.color = isEnabledTT ? "var(--color-success)" : "var(--color-danger)";
                    }
                });

                try { LixiAdmin.init(); } catch (e) { console.error("LixiAdmin", e); }
                try { WheelQ.init(); } catch (e) { console.error("WheelQ", e); }

                try { InviteAdmin.start(); } catch (e) { console.error("InviteAdmin", e); }   // Hệ thống mã mời: cấu hình + lịch sử (khối invite-admin-js)
                try { GiftAdmin.start(); } catch (e) { console.error("GiftAdmin", e); }       // Tặng quà đồng đội: đóng / mở + lịch sử (khối gift-admin-js)
                try { if (window.PayoutAdmin) PayoutAdmin.start(); } catch (e) { console.error("PayoutAdmin", e); }
                try { if (window.LuckyRewardAdmin) LuckyRewardAdmin.start(); } catch (e) { console.error("LuckyRewardAdmin", e); }   // Thưởng quay số (khối lucky-reward-admin-js)   // Trả thưởng tiền mặt (khối payout-admin-js)
                setTimeout(function () { try { SecAdmin.start(); } catch (e) { console.error("SecAdmin", e); } }, 0);   // Chống gian lận & lỗi (khối sec-admin-js, nạp cuối trang)

                db.collection("news").orderBy("time", "desc").onSnapshot(snap => {
                    const listRender = document.getElementById('news-feed-list'); listRender.innerHTML = "";
                    if(snap.empty) { listRender.innerHTML = `<div class="card p-10 text-center border-strong bg-elevated mb-0"><h4 class="text-muted font-normal m-0">Hệ thống chưa có bản tin nào được phát hành.</h4></div>`; return; }
                    snap.forEach(doc => {
                        const d = doc.data(); const timeFmt = new Date(d.time).toLocaleString('vi-VN');
                        listRender.insertAdjacentHTML('beforeend', `<div class="card mb-0 p-6 border-l-4 border-info" style="border-left: 4px solid var(--color-info);"><div class="flex justify-between items-start mb-4 border-b border-strong pb-4" style="border-bottom: 1px solid var(--border-strong);"><div class="flex items-center gap-3"><div class="flex-center rounded-full bg-info-bg text-info" style="width: 36px; height: 36px; background: var(--color-info-bg); color: var(--color-info); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-bullhorn"></i></div><div class="flex-col"><span class="text-xs font-bold text-muted uppercase tracking-wide">THÔNG BÁO TỪ HỆ THỐNG</span><span class="text-xs text-muted"><i class="fa-regular fa-clock mr-1"></i> Phát hành: ${timeFmt}</span>${d.popup ? `<span class="text-xs font-bold" style="color:#d97706">📢 Hiện khi đăng nhập · ${({ every: 'mỗi lần', daily: '1 lần / ngày', once: '1 lần / người' })[d.popupMode] || 'mỗi lần'}${d.popupUntil ? ' · đến ' + d.popupUntil.split('-').reverse().join('/') : ''}</span>` : ''}</div></div><div class="flex gap-2"><button class="btn-icon" style="width: 36px; height: 36px; font-size: 13px;" onclick="AdminActions.openNewsEditor('${doc.id}', '${qdJ(encodeURIComponent(d.content))}')" title="Chỉnh Sửa"><i class="fa-solid fa-pen"></i></button><button class="btn-icon" style="width: 36px; height: 36px; font-size: 13px; color: var(--color-danger); border-color: rgba(239, 68, 68, 0.3);" onclick="AdminActions.requestDelete('news', '${doc.id}', 'Bạn có chắc chắn muốn gỡ bỏ bản tin này khỏi máy chủ?')" title="Xóa Bản Tin"><i class="fa-solid fa-trash-can"></i></button></div></div><div class="text-main" style="font-size: 15px; line-height: 1.7; white-space: pre-wrap;">${qdH(d.content)}</div></div>`);
                    });
                });
            }
        };

        
        // --- LOGIC PHÊ DUYỆT TÀI KHOẢN ---
        function loadPendingUsers() {
            db.collection('pending_users').where('status', '==', 'pending').onSnapshot(snap => {
                const tbody = document.getElementById('pending-list');
                const countBadge = document.getElementById('pending-count');
                const mobileBadge = document.getElementById('mobile-pending-badge');
                
                if(!tbody) return;
                
                if (snap.empty) {
                    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-8">Không có yêu cầu đăng ký nào đang chờ.</td></tr>';
                    if(countBadge) countBadge.style.display = 'none';
                    if(mobileBadge) mobileBadge.style.display = 'none';
                    return;
                }
                
                if(countBadge) {
                    countBadge.innerText = snap.size;
                    countBadge.style.display = 'inline-block';
                }
                if(mobileBadge) {
                    mobileBadge.innerText = snap.size;
                    mobileBadge.style.display = 'flex';
                }
                
                let records = [];
                snap.forEach(doc => {
                    records.push({ id: doc.id, ...doc.data() });
                });
                
                try {
                    // Sắp xếp cục bộ an toàn để tránh lỗi Firebase Index
                    records.sort((a, b) => {
                        let tA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : 0;
                        let tB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : 0;
                        return tB - tA;
                    });
                } catch(e) {
                    console.error("Lỗi sort:", e);
                }

                let html = '';
                State.pendingMap = {};
                records.forEach(data => {
                    State.pendingMap[data.id] = data;
                    let dateStr = 'Mới đây';
                    try {
                        if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                            dateStr = data.createdAt.toDate().toLocaleString('vi-VN');
                        }
                    } catch(e) {}
                    
                    html += `
                        <tr>
                            <td><span class="badge badge-offline">${dateStr}</span></td>
                            <td class="font-bold text-primary" style="font-size: 16px;">${qdH(data.username)}${QD_USER_OK(data.username) ? '' : ' <span class="badge badge-danger" title="Tên đăng nhập chứa ký tự không hợp lệ">⚠ tên lạ</span>'}</td>
                            <td class="font-bold text-main">${qdH(data.fullName || '')}</td>
                            <td class="text-right" style="white-space: nowrap;">
                                <button class="btn btn-success" style="padding: 8px 15px; font-size: 13px;" onclick="AdminActions.approveUser('${qdJ(data.id)}')"><i class="fa-solid fa-check"></i> Duyệt</button>
                                <button class="btn btn-danger" style="padding: 8px 15px; font-size: 13px; margin-left: 5px;" onclick="AdminActions.rejectUser('${qdJ(data.id)}')"><i class="fa-solid fa-xmark"></i> Từ Chối</button>
                            </td>
                        </tr>
                    `;
                });
                tbody.innerHTML = html;
            }, err => {
                console.error("Lỗi lấy dữ liệu:", err);
                const tbody = document.getElementById('pending-list');
                if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-8">Lỗi tải dữ liệu. Vui lòng kiểm tra Console (F12).</td></tr>';
            });
        }
        
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(loadPendingUsers, 2000);
        });
        
        const AdminActions = {

            

            openAdminProfile: () => {
                const currentU = State.currentUser || 'admin';
                document.getElementById('admin-greeting').innerText = `Xin chào, ${currentU}!`;
                document.getElementById('admin-profile-name').innerText = currentU;
                
                db.collection("accounts").where("user", "==", currentU).get().then(snap => {
                    let role = 'admin';
                    if(!snap.empty) {
                        role = snap.docs[0].data().role || (currentU === 'admin' ? 'admin' : 'manager');
                    }
                    const badge = document.getElementById('admin-role-badge');
                    const roleText = document.getElementById('admin-profile-role-text');
                    if(role === 'admin') {
                        badge.innerHTML = `<i class="fa-solid fa-shield-check mr-1"></i> Quản trị viên`;
                        badge.className = 'badge badge-danger mb-6 px-4 py-2 text-sm';
                        roleText.innerText = 'Toàn quyền hệ thống';
                        roleText.className = 'text-danger font-bold';
                    } else {
                        badge.innerHTML = `<i class="fa-solid fa-user-tie mr-1"></i> Quản lý`;
                        badge.className = 'badge badge-online mb-6 px-4 py-2 text-sm';
                        roleText.innerText = 'Truy cập Admin Panel';
                        roleText.className = 'text-primary font-bold';
                    }
                    UI.openModal('modal-admin-profile');
                });
            },

            togglePermissionBox: () => {
                const role = document.getElementById('role-select').value;
                const box = document.getElementById('permission-box');
                if(role === 'manager') {
                    box.style.display = 'block';
                    box.classList.remove('hidden');
                } else {
                    box.style.display = 'none';
                    box.classList.add('hidden');
                }
            },

            openRoleModal: (docId, username, currentRole, currentPerms) => {
                document.getElementById('role-target-id').value = docId;
                document.getElementById('role-target-name').innerText = username;
                document.getElementById('role-select').value = currentRole || 'user';
                
                AdminActions.togglePermissionBox();
                
                let perms = ['dashboard', 'attendance', 'registration'];
                if(currentPerms) {
                    perms = currentPerms.split(',');
                }

                document.querySelectorAll('.perm-cb').forEach(cb => {
                    if (cb.value !== 'dashboard') {
                        cb.checked = perms.includes(cb.value);
                    }
                });
                
                UI.openModal('modal-edit-role');
            },
            
            saveRole: () => {
                const docId = document.getElementById('role-target-id').value;
                const newRole = document.getElementById('role-select').value;
                const username = document.getElementById('role-target-name').innerText;
                const btn = document.getElementById('btn-save-role');
                
                let perms = ['dashboard'];
                if (newRole === 'manager') {
                    document.querySelectorAll('.perm-cb:checked').forEach(cb => {
                        if(!perms.includes(cb.value)) perms.push(cb.value);
                    });
                } else if (newRole === 'admin') {
                    perms = ['all'];
                }

                if(!docId) return Utils.toast("ID Tài khoản không hợp lệ.", "error");
                
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang Lưu...`;
                btn.disabled = true;
                
                db.collection("accounts").doc(docId).update({ role: newRole, permissions: perms })
                .then(() => {
                    Utils.toast(`Cập nhật quyền cho [${username}] thành công!`, "success");
                    UI.closeModal('modal-edit-role');
                })
                .catch(err => {
                    Utils.toast("Lỗi cập nhật phân quyền.", "error");
                    console.error(err);
                })
                .finally(() => {
                    btn.innerHTML = `<i class="fa-solid fa-floppy-disk mr-2"></i> Lưu Cập Nhật`;
                    btn.disabled = false;
                });
            },

            approveUser: (id, username, password, fullName) => {
                const rec = (State.pendingMap || {})[id];
                if (rec) { username = rec.username; password = rec.password; fullName = rec.fullName; }
                username = String(username || '').trim(); fullName = String(fullName || '').replace(/[<>]/g, '').trim().slice(0, 40);
                if (!QD_USER_OK(username)) return Utils.toast('Tên đăng nhập chứa ký tự không hợp lệ — hãy Từ chối đơn này.', 'error');
                const msgNode = document.getElementById('confirm-msg'); 
                const btnExec = document.getElementById('btn-exec-confirm');
                
                msgNode.innerHTML = `Bạn có chắc chắn muốn duyệt và cấp quyền truy cập cho tài khoản <b class="text-success">${qdH(username)}</b>?`;
                btnExec.className = 'btn btn-success w-full';
                btnExec.innerHTML = '<i class="fa-solid fa-check mr-2"></i> Đồng Ý Duyệt';
                
                State.activeDeleteAction = async () => {
                    btnExec.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang Xử Lý...`; 
                    btnExec.disabled = true;
                    
                    try {
                        const existingUser = await db.collection("accounts").where("user", "==", username).get();
                        if (!existingUser.empty) {
                            Utils.toast('Tài khoản này đã tồn tại trong hệ thống!', 'error');
                            UI.closeModal('modal-confirm');
                            return;
                        }
                        
                        // NHANH: tạo tài khoản + đánh dấu đơn đã duyệt trong 1 lần ghi (trước đây 2 lần nối nhau)
                        const ab = db.batch();
                        ab.set(db.collection("accounts").doc(), {
                            user: username,
                            pass: password,
                            role: 'user',
                            fullName: fullName || '',
                            lastActive: 0,
                            isBlocked: false,
                            points: 0,
                            spins: 0,
                            tickets: 0,
                            created_at: Date.now()
                        });
                        ab.update(db.collection('pending_users').doc(id), {
                            status: 'approved',
                            approvedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        await ab.commit();
                        
                        Utils.toast('Phê duyệt thành công!', 'success');
                    } catch(e) {
                        Utils.toast('Lỗi khi phê duyệt: ' + e.message, 'error');
                    } finally {
                        btnExec.disabled = false;
                        UI.closeModal('modal-confirm');
                        State.activeDeleteAction = null;
                    }
                };
                UI.openModal('modal-confirm');
            },
            
            rejectUser: (id, username) => {
                const rec = (State.pendingMap || {})[id]; if (rec) username = rec.username;
                const msgNode = document.getElementById('confirm-msg'); 
                const btnExec = document.getElementById('btn-exec-confirm');
                
                msgNode.innerHTML = `Bạn chắc chắn muốn <b>TỪ CHỐI</b> và <b>XÓA</b> đơn đăng ký của tài khoản <b class="text-danger">${qdH(username)}</b>?`;
                btnExec.className = 'btn btn-danger w-full';
                btnExec.innerHTML = '<i class="fa-solid fa-trash mr-2"></i> Từ Chối & Xóa';
                
                State.activeDeleteAction = async () => {
                    btnExec.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang Xóa...`; 
                    btnExec.disabled = true;
                    try {
                        await db.collection('pending_users').doc(id).delete();
                        Utils.toast('Đã từ chối và xóa yêu cầu đăng ký.', 'success');
                    } catch(e) {
                        Utils.toast('Lỗi: ' + e.message, 'error');
                    } finally {
                        btnExec.disabled = false;
                        UI.closeModal('modal-confirm');
                        State.activeDeleteAction = null;
                    }
                };
                UI.openModal('modal-confirm');
            },

            toggleMaintenance: (checkbox) => {
                const isEnabled = checkbox.checked;
                const configBox = document.getElementById('maintenance-config-box');
                if(isEnabled) {
                    configBox.style.display = 'block';
                    // Bật là có hiệu lực ngay: user đang online bị chuyển sang trang bảo trì (baotri.html)
                    AdminActions.saveMaintenanceConfig(true);
                } else {
                    configBox.style.display = 'none';
                    db.collection("settings").doc("maintenance").set({ isEnabled: false }, { merge: true })
                      .then(() => Utils.toast("Đã TẮT chế độ bảo trì. User có thể truy cập!", "success"))
                      .catch(err => { Utils.toast("Lỗi lưu cấu hình", "error"); checkbox.checked = true; });
                }
            },

            saveMaintenanceConfig: (fromToggle) => {
                const isEnabled = document.getElementById('cfg-mt-toggle').checked;
                const message = document.getElementById('cfg-mt-message').value.trim();
                const endDate = document.getElementById('cfg-mt-end-date').value;
                const endTime = document.getElementById('cfg-mt-end-time').value;

                db.collection("settings").doc("maintenance").set({
                    isEnabled: isEnabled,
                    message: message || "Hệ thống đang được nâng cấp. Vui lòng quay lại sau!",
                    endDate: endDate,
                    endTime: endTime,
                    updatedAt: Date.now()
                }, { merge: true })
                .then(() => {
                    Utils.toast(fromToggle === true ? "Đã BẬT bảo trì! Thành viên đang được chuyển sang trang bảo trì." : "Đã lưu cấu hình bảo trì!", "success");
                })
                .catch(err => { Utils.toast("Lỗi lưu cấu hình bảo trì.", "error"); if (fromToggle === true) { document.getElementById('cfg-mt-toggle').checked = false; document.getElementById('maintenance-config-box').style.display = 'none'; } });
            },

            saveAccountConfig: () => {
                const inact = parseInt(document.getElementById('cfg-acc-inactivity').value) || 1440;
                const autoUnl = parseInt(document.getElementById('cfg-acc-autounlock').value) || 0;
                const tempUnl = parseInt(document.getElementById('cfg-acc-tempunlock').value) || 0;
                const minOr = (id, def) => { const el = document.getElementById(id); const v = el ? parseInt(el.value) : NaN; return isNaN(v) ? def : Math.max(0, Math.min(v, 525600)); };
                const ses = minOr('cfg-acc-session', 360), sesSt = minOr('cfg-acc-session-staff', 360);
                if (sesSt > 0 && sesSt < 5) return Utils.toast("Phiên Ban Quản Trị tối thiểu 5 phút (hoặc 0 = không giới hạn).", "warning");
                if (ses > 0 && ses < 2) return Utils.toast("Phiên thành viên tối thiểu 2 phút (hoặc 0 = không giới hạn).", "warning");
                
                db.collection("settings").doc("account_config").set({
                    inactivityMinutes: inact,
                    autoUnlockMinutes: autoUnl,
                    tempUnlockMinutes: tempUnl,
                    sessionMinutes: ses,
                    staffSessionMinutes: sesSt
                }, { merge: true })
                .then(() => Utils.toast("Đã lưu cấu hình tự động khóa/mở tài khoản và thời gian phiên đăng nhập!", "success"))
                .catch(err => Utils.toast("Lỗi lưu cấu hình trên CSDL.", "error"));
            },

            // Đá 1 tài khoản ra khỏi hệ thống: mọi trang / thiết bị đang đăng nhập tài khoản này thoát ngay (bấm 2 lần để chắc chắn)
            kickUser: (docId, username, btn) => {
                // Nhớ lần bấm thứ nhất theo tài khoản (bảng có thể vẽ lại giữa 2 lần bấm khi có người online / offline)
                const arm = AdminActions._kickArm;
                if (!arm || arm.id !== docId || Date.now() - arm.at > 5000) {
                    AdminActions._kickArm = { id: docId, at: Date.now() };
                    if (btn) { btn.style.background = 'rgba(190, 18, 60, 0.18)'; setTimeout(() => { btn.style.background = ''; }, 5000); }
                    Utils.toast(`Bấm lần nữa để đá <b>${username}</b> ra khỏi hệ thống.`, "warning");
                    return;
                }
                AdminActions._kickArm = null;
                if (btn) btn.disabled = true;
                const t = Date.now();
                db.collection("accounts").doc(docId).update({ kickAt: t, online: false })
                    .then(() => {
                        Utils.toast(`Đã đá <b>${username}</b> ra khỏi hệ thống. Các trang đang mở sẽ thoát ngay.`, "success");
                        db.collection("admin_logs").add({ type: 'session', action: 'kick', user: username, by: State.currentUser || 'admin', timestamp: t }).catch(() => {});
                    })
                    .catch(() => Utils.toast("Không đá được tài khoản (không đủ quyền hoặc mất kết nối máy chủ).", "error"))
                    .finally(() => { if (btn) { btn.disabled = false; btn.style.background = ''; } });
            },

            // Đăng xuất toàn bộ thành viên (Ban Quản Trị không bị ảnh hưởng)
            kickAll: (btn) => {
                if (btn && btn.dataset.arm !== '1') {
                    btn.dataset.arm = '1'; const old = btn.innerHTML; btn.dataset.old = old;
                    btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i> Bấm lần nữa để đăng xuất tất cả';
                    setTimeout(() => { if (btn.dataset.arm === '1') { btn.dataset.arm = ''; btn.innerHTML = btn.dataset.old; } }, 4000);
                    return;
                }
                if (btn) { btn.dataset.arm = ''; btn.innerHTML = btn.dataset.old || btn.innerHTML; btn.disabled = true; }
                const t = Date.now(), by = State.currentUser || 'admin';
                db.collection("settings").doc("account_config").set({ sessionEpoch: t, sessionEpochBy: by }, { merge: true })
                    .then(() => {
                        Utils.toast("Đã đăng xuất toàn bộ thành viên. Mọi trang đang mở sẽ thoát ngay.", "success");
                        db.collection("admin_logs").add({ type: 'session', action: 'kick_all', user: '(tất cả)', by: by, timestamp: t }).catch(() => {});
                    })
                    .catch(() => Utils.toast("Lỗi lưu lên máy chủ.", "error"))
                    .finally(() => { if (btn) btn.disabled = false; });
            },

            toggleLock: (docId, isCurrentlyBlocked, username) => {
                const newStatus = !isCurrentlyBlocked; 
                const updateData = { isBlocked: newStatus };
                
                if (newStatus === false) { 
                    updateData.unlockedAt = Date.now(); 
                    updateData.lockReason = null; updateData.lockNote = null;   // mở khóa tay: xóa lý do khóa (kể cả khóa do Chống gian lận)
                    updateData.lockedAt = null;
                    updateData.unlockRequestedAt = null; 
                } else {
                    updateData.lockedAt = Date.now(); updateData.lockReason = 'manual';
                    updateData.unlockRequestedAt = null; 
                }

                db.collection("accounts").doc(docId).update(updateData).then(() => {
                    Utils.toast(`Đã ${newStatus ? 'TẠM KHÓA' : 'MỞ KHÓA'} tài khoản [${username}] thành công!`, "success");
                }).catch(err => {
                    Utils.toast("Lỗi cập nhật trạng thái trên CSDL.", "error");
                });
            },

            getRPSIcon: (choice) => {
                if (choice === 'rock') return '<i class="fa-solid fa-hand-back-fist text-warning"></i>';
                if (choice === 'paper') return '<i class="fa-solid fa-hand text-success"></i>';
                if (choice === 'scissors') return '<i class="fa-solid fa-hand-scissors text-danger"></i>';
                if (choice === 'timeout') return '<i class="fa-solid fa-hourglass-end text-muted"></i>';
                return '<i class="fa-solid fa-question text-muted"></i>';
            },

            exportRPSExcel: () => {
                if(State.rpsHistoryCache.length === 0) return Utils.toast("Không có lịch sử trận đấu Kéo Búa Bao.", "warning");
                let htmlTableStr = `<table border="1"><thead><tr><th bgcolor="#ef4444"><font color="#ffffff">STT</font></th><th bgcolor="#ef4444"><font color="#ffffff">Người Chơi 1</font></th><th bgcolor="#ef4444"><font color="#ffffff">Người Chơi 2</font></th><th bgcolor="#ef4444"><font color="#ffffff">Chiêu P1</font></th><th bgcolor="#ef4444"><font color="#ffffff">Chiêu P2</font></th><th bgcolor="#ef4444"><font color="#ffffff">Tỉ Số (P1-P2)</font></th><th bgcolor="#ef4444"><font color="#ffffff">Kết Quả Cuối Cùng</font></th><th bgcolor="#ef4444"><font color="#ffffff">Thời Gian</font></th></tr></thead><tbody>`;
                State.rpsHistoryCache.forEach((row, index) => { 
                    const timeFmt = new Date(row.timestamp).toLocaleString('vi-VN'); 
                    let winnerText = "Hòa";
                    if (row.winner === row.player1) winnerText = row.player1 + " Thắng";
                    else if (row.winner === row.player2) winnerText = row.player2 + " Thắng";

                    htmlTableStr += `<tr><td align="center">${index + 1}</td><td>${row.player1}</td><td>${row.player2}</td><td align="center">${row.p1Choice || 'Không rõ'}</td><td align="center">${row.p2Choice || 'Không rõ'}</td><td align="center">'${row.p1Score} - ${row.p2Score}'</td><td align="center">${winnerText}</td><td align="center">${timeFmt}</td></tr>`; 
                });
                htmlTableStr += `</tbody></table>`; 
                AdminActions.downloadXLS(htmlTableStr, "Lich_Su_Keo_Bua_Bao");
            },

            toggleRPSFeature: (checkbox) => {
                const isEnabled = checkbox.checked;
                db.collection("settings").doc("rps_config").set({ isEnabled: isEnabled }, { merge: true })
                  .then(() => Utils.toast(isEnabled ? "Đã MỞ Đấu trường Kéo Búa Bao!" : "Đã ĐÓNG Đấu trường Kéo Búa Bao!", "success"))
                  .catch(err => { Utils.toast("Lỗi lưu cấu hình.", "error"); checkbox.checked = !isEnabled; });
            },

            saveRPSTimeConfig: () => {
                const start24h = Utils.get24HFromSelectors("cfg-rps-start"); 
                const end24h = Utils.get24HFromSelectors("cfg-rps-end");
                const timeLimit = parseInt(document.getElementById('cfg-rps-time').value) || 10;

                db.collection("settings").doc("rps_config").set({ 
                    start: start24h, 
                    end: end24h,
                    timeLimit: timeLimit
                }, { merge: true })
                  .then(() => Utils.toast(`Đã lưu khung giờ Đấu trường & Thời gian ra chiêu: ${timeLimit}s`, "success"))
                  .catch(err => Utils.toast("Lỗi cấu hình CSDL.", "error"));
            },
            
            saveRPSRewardConfig: () => {
                const fee = parseInt(document.getElementById('cfg-rps-fee').value) || 0;
                const winReward = parseInt(document.getElementById('cfg-rps-win').value) || 0;
                const loseReward = parseInt(document.getElementById('cfg-rps-lose').value) || 0;

                db.collection("settings").doc("rps_config").set({ 
                    fee: fee, 
                    winReward: winReward, 
                    loseReward: loseReward 
                }, { merge: true })
                  .then(() => Utils.toast(`Đã lưu cấu hình Cược & Thưởng PvP!`, "success"))
                  .catch(err => Utils.toast("Lỗi lưu cấu hình trên CSDL.", "error"));
            },

            toggleAttendanceSecurity: (checkbox) => {
                const isEnabled = checkbox.checked;
                db.collection("settings").doc("attendance").set({ antiProxyEnabled: isEnabled }, { merge: true })
                  .then(() => Utils.toast(isEnabled ? "Đã BẬT chức năng Chống điểm danh hộ!" : "Đã TẮT chức năng Chống điểm danh hộ", "success"))
                  .catch(err => { Utils.toast("Lỗi cấu hình CSDL", "error"); checkbox.checked = !isEnabled; });
            },

            toggleAttendanceReward: (checkbox) => {
                const isEnabled = checkbox.checked;
                db.collection("settings").doc("attendance_reward_items").set({ isEnabled: isEnabled }, { merge: true })
                  .then(() => Utils.toast(isEnabled ? "Đã BẬT thưởng vật phẩm điểm danh!" : "Đã TẮT thưởng vật phẩm điểm danh", "success"))
                  .catch(err => { Utils.toast("Lỗi cấu hình CSDL", "error"); checkbox.checked = !isEnabled; });
            },

            saveAttendanceRewardConfig: () => {
                const AS = window.AttSched; if (!AS) return;
                const sc = AS.form();
                if (sc.bad) return Utils.toast("Số lượng thưởng phải là số từ 0 đến 1.000.000!", "warning");
                if (sc.badTime.length) return Utils.toast("⏰ " + sc.badTime.join(', ') + ": giờ tắt phải sau giờ bật!", "error");
                const btn = document.getElementById('att-reward-save-btn'); if (btn) btn.disabled = true;
                db.collection("settings").doc("attendance_reward_items").set(AS.payload(sc.items), { merge: true })
                  .then(() => { AS.saved(); const t = AS.text(sc.items); Utils.toast('Đã lưu thiết lập thưởng điểm danh' + (t ? ': ' + t : ' (chưa bật vật phẩm nào)') + '!', t ? "success" : "warning"); })
                  .catch(e => Utils.toast("Lỗi lưu DB", "error"))
                  .then(() => { if (btn) btn.disabled = false; });
            },

            saveTaskConfig: () => {
                const loginReward = parseInt(document.getElementById('cfg-task-login').value);
                if (isNaN(loginReward) || loginReward < 0) {
                    return Utils.toast("Vui lòng nhập số điểm thưởng hợp lệ và không âm!", "warning");
                }

                db.collection("settings").doc("task_config").set({
                    loginReward: loginReward,
                    attendanceReward: 0,   // đã bỏ thưởng điểm danh ở Nhiệm vụ (điểm danh thưởng theo "Thưởng Vật Phẩm Điểm Danh")
                    updatedAt: Date.now()
                }, { merge: true })
                .then(() => {
                    Utils.toast("Đã ghi đè và áp dụng cấu hình nhiệm vụ mới!", "success");
                })
                .catch(err => {
                    console.error(err);
                    Utils.toast("Lỗi ghi dữ liệu cấu hình lên hệ thống.", "error");
                });
            },

            toggleShopFeature: (checkbox) => {
                const isEnabled = checkbox.checked;
                db.collection("settings").doc("point_shop_config").set({ isEnabled: isEnabled }, { merge: true })
                  .then(() => Utils.toast(isEnabled ? "Đã MỞ Cửa Hàng Điểm!" : "Đã ĐÓNG Cửa Hàng Điểm!", "success"))
                  .catch(err => { Utils.toast("Lỗi lưu cấu hình cửa hàng.", "error"); checkbox.checked = !isEnabled; });
            },

            saveShopConfig: () => {
                const spinCost = parseInt(document.getElementById('cfg-shop-spin-cost').value);
                const ticketCost = parseInt(document.getElementById('cfg-shop-ticket-cost').value);
                
                if(isNaN(spinCost) || spinCost < 0 || isNaN(ticketCost) || ticketCost < 0) {
                    return Utils.toast("Giá vật phẩm quy đổi phải lớn hơn hoặc bằng 0", "warning");
                }

                db.collection("settings").doc("point_shop_config").set({ 
                    spinCost: spinCost, 
                    ticketCost: ticketCost 
                }, { merge: true })
                  .then(() => Utils.toast("Cập nhật Bảng Giá Quy Đổi thành công!", "success"))
                  .catch(err => Utils.toast("Lỗi lưu dữ liệu bảng giá.", "error"));
            },

            exportPointShopExcel: () => {
                if(State.pointShopHistoryCache.length === 0) return Utils.toast("Không có lịch sử giao dịch điểm trong 30 ngày qua.", "warning");
                let htmlTableStr = `<table border="1"><thead><tr><th bgcolor="#10b981"><font color="#ffffff">STT</font></th><th bgcolor="#10b981"><font color="#ffffff">Người Mua</font></th><th bgcolor="#10b981"><font color="#ffffff">Chi Tiết Sản Phẩm</font></th><th bgcolor="#10b981"><font color="#ffffff">Biến Động Điểm</font></th><th bgcolor="#10b981"><font color="#ffffff">Thời Gian Giao Dịch</font></th></tr></thead><tbody>`;
                State.pointShopHistoryCache.forEach((row, index) => { 
                    const timeFmt = new Date(row.timestamp).toLocaleString('vi-VN'); 
                    htmlTableStr += `<tr><td align="center">${index + 1}</td><td>${qdH(row.user)}</td><td>${qdH(row.detail)}</td><td align="center">${row.pointsChanged}</td><td align="center">${timeFmt}</td></tr>`; 
                });
                htmlTableStr += `</tbody></table>`; 
                AdminActions.downloadXLS(htmlTableStr, "Lich_Su_Cua_Hang_Diem_30Ngay");
            },

            toggleWheelFeature: (checkbox) => {
                const isEnabled = checkbox.checked;
                db.collection("settings").doc("wheel_config").set({ isEnabled: isEnabled }, { merge: true })
                  .then(() => Utils.toast(isEnabled ? "Đã MỞ chức năng Vòng Quay!" : "Đã KHÓA chức năng Vòng Quay!", "success"))
                  .catch(err => { Utils.toast("Lỗi lưu cấu hình", "error"); checkbox.checked = !isEnabled; });
            },

            toggleTranhThuongFeature: (checkbox) => {
                const isEnabled = checkbox.checked;
                db.collection("settings").doc("tranhthuong_config").set({ isEnabled: isEnabled }, { merge: true })
                  .then(() => Utils.toast(isEnabled ? "Đã MỞ chức năng Rút Lì Xì!" : "Đã KHÓA chức năng Rút Lì Xì!", "success"))
                  .catch(err => { Utils.toast("Lỗi lưu cấu hình", "error"); checkbox.checked = !isEnabled; });
            },

            toggleRegistration: (checkbox) => {
                const isEnabled = checkbox.checked;
                db.collection("settings").doc("registration_config").set({ isEnabled: isEnabled }, { merge: true })
                  .then(() => Utils.toast(isEnabled ? "Đã MỞ hệ thống nộp đơn Đăng ký!" : "Đã KHÓA hệ thống nộp đơn Đăng ký!", "success"))
                  .catch(err => { Utils.toast("Lỗi lưu trạng thái CSDL.", "error"); checkbox.checked = !isEnabled; });
            },

            
            saveWheelScheduleConfig: () => {
                const date = document.getElementById('cfg-wheel-end-date').value;
                const time = document.getElementById('cfg-wheel-end-time').value;
                const isEnabled = document.getElementById('cfg-wheel-toggle').checked;
                
                db.collection("settings").doc("wheel_config").set({
                    isEnabled: isEnabled,
                    endDate: date,
                    endTime: time
                }, { merge: true }).then(() => {
                    Utils.toast("Đã lưu cấu hình lịch trình Vòng Quay!", "success");
                }).catch(err => Utils.toast("Lỗi lưu lịch trình.", "error"));
            },
            
            saveTTScheduleConfig: () => {
                const date = document.getElementById('cfg-tt-end-date').value;
                const time = document.getElementById('cfg-tt-end-time').value;
                const isEnabled = document.getElementById('cfg-tt-toggle').checked;
                
                db.collection("settings").doc("tranhthuong_config").set({
                    isEnabled: isEnabled,
                    endDate: date,
                    endTime: time
                }, { merge: true }).then(() => {
                    Utils.toast("Đã lưu cấu hình lịch trình Rút Lì Xì!", "success");
                }).catch(err => Utils.toast("Lỗi lưu lịch trình.", "error"));
            },
saveRegistrationConfig: () => {
                const endDate = document.getElementById('cfg-reg-end-date').value;
                const endTime = document.getElementById('cfg-reg-end-time').value;
                
                db.collection("settings").doc("registration_config").set({ 
                    endDate: endDate, 
                    endTime: endTime,
                    updatedAt: Date.now()
                }, { merge: true })
                  .then(() => {
                      if(endDate && endTime) Utils.toast(`Đã chốt hạn đóng vòng: ${endTime} ngày ${endDate}`, "success");
                      else Utils.toast(`Đã lưu cấu hình hệ thống thành công.`, "info");
                  })
                  .catch(err => Utils.toast("Lỗi cấu hình CSDL.", "error"));
            },

            addTournamentParticipant: () => {
                const sel = document.getElementById('tour-participant-select');
                if(!sel || !sel.value) return Utils.toast("Vui lòng chọn một người chơi từ danh sách.", "warning");
                
                const opt = sel.options[sel.selectedIndex];
                const u = opt.value;
                const ign = opt.getAttribute('data-ingame');
                const gameId = opt.getAttribute('data-gameid');

                db.collection("tournament").where("username", "==", u).get().then(snap => {
                    if(!snap.empty) {
                        return Utils.toast("Tài khoản này đã có trong danh sách giải đấu!", "error");
                    }
                    db.collection("tournament").add({
                        username: u,
                        ingame: ign,
                        gameId: gameId,
                        team: "Chưa phân đội",
                        timestamp: Date.now()
                    }).then(() => {
                        Utils.toast("Đã thêm vào giải đấu thành công!", "success");
                        UI.closeModal('modal-add-participant');
                        sel.value = "";
                    }).catch(err => Utils.toast("Lỗi lưu dữ liệu giải đấu.", "error"));
                });
            },

                        openPointModal: (docId, username, currentPoints) => {
                document.getElementById('tour-point-username').innerText = username;
                document.getElementById('tour-point-val').value = currentPoints;
                
                document.getElementById('btn-save-tour-point').onclick = () => {
                    const pts = parseInt(document.getElementById('tour-point-val').value) || 0;
                    const btn = document.getElementById('btn-save-tour-point');
                    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang Lưu...`;
                    btn.disabled = true;
                    
                    db.collection("tournament").doc(docId).update({ points: pts })
                        .then(() => {
                            Utils.toast("Đã cập nhật điểm thành công!", "success");
                            UI.closeModal('modal-tournament-points');
                        })
                        .catch(err => Utils.toast("Lỗi lưu điểm.", "error"))
                        .finally(() => {
                            btn.innerHTML = `<i class="fa-solid fa-floppy-disk mr-2"></i> Cập Nhật`;
                            btn.disabled = false;
                        });
                };
                UI.openModal('modal-tournament-points');
            },
            
            groupTournamentTeam: () => {
                const checkboxes = document.querySelectorAll('.tour-group-cb:checked');
                const teamName = document.getElementById('tour-group-name').value.trim();
                
                if(checkboxes.length === 0) return Utils.toast("Vui lòng chọn ít nhất một người chơi.", "warning");
                if(!teamName) return Utils.toast("Vui lòng nhập tên đội.", "warning");
                
                const batch = db.batch();
                
                checkboxes.forEach(cb => {
                    const docId = cb.value;
                    const ref = db.collection("tournament").doc(docId);
                    batch.update(ref, {
                        team: teamName
                    });
                });

                batch.commit().then(() => {
                    Utils.toast(`Đã gộp ${checkboxes.length} tài khoản vào đội "${teamName}" thành công!`, "success");
                    UI.closeModal('modal-group-team');
                    document.getElementById('tour-group-name').value = "";
                }).catch(err => Utils.toast("Lỗi gộp đội giải đấu.", "error"));
            },

            allowReregister: (docId, submitter) => {
                AdminActions.requestDelete('users', docId, `Bạn có chắc chắn muốn xóa đơn hiện tại của tài khoản <b>${submitter}</b> để họ có thể đăng ký lại không?`);
            },

            setWinningNumber: (num = null) => {
                const targetNum = num !== null ? parseInt(num) : parseInt(document.getElementById('inp-force-win').value);
                if(isNaN(targetNum) || targetNum < 1 || targetNum > 100) return Utils.toast("Vui lòng nhập số từ 1-100", "warning");

                const batch = db.batch();

                const resultRef = db.collection("settings").doc("lucky_number_result");
                batch.set(resultRef, {
                    number: targetNum,
                    updatedAt: Date.now(),
                    updatedBy: "admin"
                });

                const winners = State.currentLuckyNumbers
                    .filter(p => parseInt(p.number) === targetNum)
                    .map(p => p.user);

                const historyRef = db.collection("lucky_number_history").doc();
                batch.set(historyRef, {
                    number: targetNum,
                    winners: winners,
                    timestamp: Date.now()
                });

                batch.commit().then(() => {
                    Utils.toast(`Đã chốt kết quả số ${targetNum.toString().padStart(2, '0')} và lưu vào Lịch sử!`, "success");
                    if (window.LuckyReward) LuckyReward.award(historyRef.id, targetNum, { winners: winners, ts: Date.now(), source: 'admin' }).then(r => { if (r && (r.winners.length || r.near.length)) Utils.toast(`🎁 Đã trao thưởng cho ${r.winners.length} người trúng` + (r.near.length ? ` + ${r.near.length} giải phụ` : ''), "success"); });
                    document.getElementById('inp-force-win').value = "";
                }).catch(err => Utils.toast("Lỗi cập nhật: " + err.message, "error"));
            },

            randomWinningNumber: () => {
                const rand = Math.floor(Math.random() * 100) + 1;
                AdminActions.setWinningNumber(rand);
            },

            clearWinningNumber: () => {
                db.collection("settings").doc("lucky_number_result").delete().then(() => {
                    Utils.toast("Đã hủy kết quả! User quay số sẽ ra random tự do.", "info");
                }).catch(err => Utils.toast("Lỗi hủy kết quả.", "error"));
            },

            exportLuckyNumberExcel: () => {
                if(State.luckyNumberHistoryCache.length === 0) return Utils.toast("Không có lịch sử quay số trong 30 ngày qua.", "warning");
                let htmlTableStr = `<table border="1"><thead><tr><th bgcolor="#ec4899"><font color="#ffffff">STT</font></th><th bgcolor="#ec4899"><font color="#ffffff">Số Trúng Thưởng</font></th><th bgcolor="#ec4899"><font color="#ffffff">Danh Sách Người Trúng</font></th><th bgcolor="#ec4899"><font color="#ffffff">Thời Gian Ghi Nhận</font></th></tr></thead><tbody>`;
                State.luckyNumberHistoryCache.forEach((row, index) => { 
                    const timeFmt = new Date(row.timestamp).toLocaleString('vi-VN'); 
                    const winnersText = row.winners && row.winners.length > 0 ? row.winners.join(', ') : "Không có ai";
                    htmlTableStr += `<tr><td align="center">${index + 1}</td><td align="center"><b>${row.number.toString().padStart(2, '0')}</b></td><td>${winnersText}</td><td align="center">${timeFmt}</td></tr>`; 
                });
                htmlTableStr += `</tbody></table>`; 
                AdminActions.downloadXLS(htmlTableStr, "Lich_Su_Quay_So_Nhan_Pham_30Ngay");
            },

            saveTimeConfig: () => {
                const start24h = Utils.get24HFromSelectors("cfg-start"); const end24h = Utils.get24HFromSelectors("cfg-end");
                db.collection("settings").doc("attendance").set({ start: start24h, end: end24h }, { merge: true })
                  .then(() => Utils.toast("Đã áp dụng cấu hình khung giờ điểm danh!", "success")).catch(err => Utils.toast("Lỗi cấu hình CSDL.", "error"));
            },

            toggleAutoSpin: (checkboxElement) => {
                const isEnabled = checkboxElement.checked;
                db.collection("settings").doc("wheel").set({ autoSpinOnAttendance: isEnabled }, { merge: true })
                  .then(() => Utils.toast(isEnabled ? "Đã BẬT tự động tặng lượt Quay!" : "Đã TẮT tự động tặng lượt Quay", "success"))
                  .catch(err => { Utils.toast("Lỗi lưu cấu hình", "error"); checkboxElement.checked = !isEnabled; });
            },

            // Mã mời: chuyển sang khối invite-admin-js (giữ tên cũ để tương thích)
            toggleInvite: (checkboxElement) => InviteAdmin.toggleMaster(checkboxElement),
            saveInviteReward: () => InviteAdmin.save(),

            toggleLuckyLive: (checkbox) => {
                const isLive = checkbox.checked;
                const data = isLive ? { isLive: true, startedAt: Date.now() } : { isLive: false, endedAt: Date.now() };
                db.collection("settings").doc("lucky_live").set(data, { merge: true })
                  .then(() => Utils.toast(isLive ? "Đã BẬT phát trực tiếp! Thành viên đang nhận thông báo." : "Đã TẮT phát trực tiếp.", "success"))
                  .catch(err => { Utils.toast("Lỗi lưu cấu hình", "error"); checkbox.checked = !isLive; });
            },

            /* ===== Lịch quay nhiều lượt ===== */
            lnDraft: null, lnDirty: false, lnPresets: {}, lnClearArm: false,

            lnFromServer: () => {
                const pre = AdminActions.lnPresets || {};
                const rows = LuckySchedule.all().map(r => {
                    const t = new Date(r.at), p = n => String(n).padStart(2, '0');
                    return { id: r.id, date: `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`, time: `${p(t.getHours())}:${p(t.getMinutes())}`,
                             preset: pre[r.id] != null ? String(pre[r.id]) : '', at: r.at, label: r.label, done: !!r.done, missed: !!r.missed, number: r.number, saved: true };
                });
                if (!rows.length) for (let i = 0; i < 4; i++) rows.push(AdminActions.lnBlank());   // mặc định Lượt 1, 2, 3, 4
                AdminActions.lnDraft = rows; AdminActions.lnDirty = false;
                AdminActions.renderLuckyRounds();
            },
            lnBlank: () => ({ id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: '', time: '', preset: '', done: false, saved: false }),
            lnSetDirty: (v) => { AdminActions.lnDirty = v; const el = document.getElementById('ln-rounds-dirty'); if (el) el.style.display = v ? 'inline' : 'none'; },

            addLuckyRound: () => {
                if (!AdminActions.lnDraft) AdminActions.lnFromServer();
                if (AdminActions.lnDraft.length >= 20) return Utils.toast("Tối đa 20 lượt.", "warning");
                AdminActions.lnDraft.push(AdminActions.lnBlank()); AdminActions.lnSetDirty(true); AdminActions.renderLuckyRounds();
            },
            removeLuckyRound: (id) => {
                AdminActions.lnDraft = AdminActions.lnDraft.filter(r => r.id !== id); AdminActions.lnSetDirty(true); AdminActions.renderLuckyRounds();
            },
            lnInput: (id, field, el) => {
                const r = (AdminActions.lnDraft || []).find(x => x.id === id); if (!r) return;
                r[field] = el.value; AdminActions.lnSetDirty(true); AdminActions.renderLuckySchedule();
            },

            renderLuckyRounds: () => {
                const tb = document.getElementById('ln-rounds-body'); if (!tb || !AdminActions.lnDraft) return;
                const esc = v => String(v == null ? '' : v).replace(/"/g, '&quot;');
                tb.innerHTML = AdminActions.lnDraft.map((r, i) => {
                    const dis = r.done ? 'disabled' : '';
                    return `<tr class="ln-r-row${r.done ? ' done' : ''}">
                        <td><span class="ln-r-label">${r.done && r.label ? r.label : 'Lượt ' + (i + 1)}</span></td>
                        <td><input type="date" class="form-control ln-r-date" value="${esc(r.date)}" ${dis} onchange="AdminActions.lnInput('${r.id}','date',this)"></td>
                        <td><input type="time" class="form-control ln-r-time" value="${esc(r.time)}" ${dis} onchange="AdminActions.lnInput('${r.id}','time',this)"></td>
                        <td class="text-center"><input type="number" min="1" max="100" placeholder="Ngẫu nhiên" class="form-control ln-r-num" value="${esc(r.preset)}" ${dis} oninput="AdminActions.lnInput('${r.id}','preset',this)"></td>
                        <td><span class="ln-r-st" id="ln-r-st-${r.id}"></span></td>
                        <td class="text-right">${r.done ? '' : `<button class="btn-icon" style="color: var(--color-danger);" title="Xóa lượt" onclick="AdminActions.removeLuckyRound('${r.id}')"><i class="fa-solid fa-trash"></i></button>`}</td>
                    </tr>`;
                }).join('') || `<tr><td colspan="6" class="text-center text-muted py-6">Chưa có lượt nào. Bấm "Thêm Lượt".</td></tr>`;
                AdminActions.renderLuckySchedule();
            },

            // Cập nhật mỗi giây: trạng thái từng lượt + tóm tắt (không vẽ lại ô nhập để không mất con trỏ)
            renderLuckySchedule: () => {
                const now = Date.now(), all = LuckySchedule.all(), byId = {};
                all.forEach(r => byId[r.id] = r);
                (AdminActions.lnDraft || []).forEach(r => {
                    const el = document.getElementById('ln-r-st-' + r.id); if (!el) return;
                    const sv = byId[r.id];
                    if (!sv) { el.innerHTML = (r.date && r.time) ? '<span style="color: var(--color-warning);">Chưa lưu</span>' : '<span class="text-muted">Chưa đặt giờ</span>'; return; }
                    if (sv.done && sv.missed) el.innerHTML = '<span style="color: var(--color-danger);">⚠ Bỏ qua (không ai online)</span>';
                    else if (sv.done) el.innerHTML = `<span style="color: var(--color-success);">✅ Đã quay: <b style="color:#ec4899; font-size: 16px;">${String(sv.number).padStart(2, '0')}</b></span>`;
                    else if (sv.at > now) el.innerHTML = `<span style="color: var(--color-warning);">⏰ Còn <b style="font-family: var(--font-family-mono);">${LuckySchedule.fmtLeft(sv.at - now)}</b></span>`;
                    else el.innerHTML = '<span style="color: var(--color-info, #38bdf8);">⏳ Đang quay...</span>';
                });
                const sum = document.getElementById('ln-sched-summary'); if (!sum) return;
                if (!all.length) { sum.innerText = 'Chưa có lịch quay.'; sum.style.color = ''; return; }
                const done = all.filter(r => r.done).length, nx = LuckySchedule.get();
                sum.innerHTML = `${all.length} lượt · đã quay ${done}` + (nx ? ` · kế tiếp: <b>${nx.label}</b> lúc ${LuckySchedule.fmtTime(nx.at)} (còn ${LuckySchedule.fmtLeft(nx.at - now)})` : ' · đã quay hết');
                sum.style.color = nx ? 'var(--color-warning)' : 'var(--color-success)';
            },

            saveLuckyRounds: () => {
                const now = Date.now(), rows = [];
                for (const r of (AdminActions.lnDraft || [])) {
                    if (r.done) { rows.push(Object.assign({}, r)); continue; }
                    if (!r.date && !r.time) continue;                              // dòng trống: bỏ qua
                    if (!r.date || !r.time) return Utils.toast("Mỗi lượt cần đủ ngày và giờ quay.", "warning");
                    const at = new Date(r.date + 'T' + r.time).getTime();
                    if (isNaN(at)) return Utils.toast("Ngày giờ không hợp lệ.", "warning");
                    if (at <= now + 10000) return Utils.toast(`Lượt lúc ${r.time} ${r.date.split('-').reverse().join('/')} đã qua, hãy chọn giờ ở tương lai.`, "warning");
                    const pv = String(r.preset || '').trim();
                    if (pv && !(/^\d+$/.test(pv) && +pv >= 1 && +pv <= 100)) return Utils.toast("Số chốt sẵn phải từ 1 đến 100 (để trống = ngẫu nhiên).", "warning");
                    rows.push(Object.assign({}, r, { at: at, preset: pv }));
                }
                rows.sort((a, b) => a.at - b.at);
                for (let i = 1; i < rows.length; i++) if (rows[i].at - rows[i - 1].at < 60000) return Utils.toast("Các lượt phải cách nhau ít nhất 1 phút.", "warning");
                const roundsMap = {}, presets = {};
                rows.forEach((r, i) => {
                    const label = 'Lượt ' + (i + 1);
                    roundsMap[r.id] = r.done
                        ? { label: r.label || label, order: i + 1, at: r.at, done: true, missed: !!r.missed, number: r.number != null ? r.number : null }
                        : { label: label, order: i + 1, at: r.at, done: false, missed: false, number: null };
                    if (!r.done && r.preset) presets[r.id] = parseInt(r.preset, 10);
                });
                const b = db.batch();
                b.set(db.collection("settings").doc("lucky_live"), { rounds: roundsMap }, { mergeFields: ['rounds'] });
                b.set(db.collection("settings").doc("lucky_round_presets"), { byId: presets, updatedAt: now });
                b.commit().then(() => {
                    AdminActions.lnSetDirty(false);
                    const pend = rows.filter(r => !r.done).length;
                    Utils.toast(pend ? `Đã lưu lịch ${rows.length} lượt quay! Thành viên đang thấy đếm ngược.` : "Đã lưu lịch quay.", "success");
                }).catch(err => Utils.toast("Lỗi lưu lịch quay: " + err.message, "error"));
            },

            clearLuckyRounds: () => {
                const btn = document.getElementById('btn-ln-rounds-clear');
                if (!AdminActions.lnClearArm) {
                    AdminActions.lnClearArm = true; btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i> Bấm lần nữa để xóa';
                    setTimeout(() => { AdminActions.lnClearArm = false; btn.innerHTML = '<i class="fa-solid fa-trash mr-2"></i> Xóa Toàn Bộ Lịch'; }, 4000);
                    return;
                }
                AdminActions.lnClearArm = false; btn.innerHTML = '<i class="fa-solid fa-trash mr-2"></i> Xóa Toàn Bộ Lịch';
                const b = db.batch();
                b.set(db.collection("settings").doc("lucky_live"), { rounds: {} }, { mergeFields: ['rounds'] });
                b.set(db.collection("settings").doc("lucky_round_presets"), { byId: {}, updatedAt: Date.now() });
                b.commit().then(() => { AdminActions.lnDirty = false; Utils.toast("Đã xóa toàn bộ lịch quay.", "success"); })
                  .catch(err => Utils.toast("Lỗi xóa lịch: " + err.message, "error"));
            },

            startLuckyLive: () => {
                const w = window.open('quays.html?host=1', '_blank');   // mở trước để không bị chặn popup
                db.collection("settings").doc("lucky_live").set({ isLive: true, startedAt: Date.now() }, { merge: true })
                  .then(() => Utils.toast("Đã mở quay trực tiếp! Thành viên đang nhận thông báo.", "success"))
                  .catch(err => Utils.toast("Lỗi bật phát trực tiếp: " + err.message, "error"));
                if (!w) Utils.toast("Trình duyệt chặn cửa sổ mới, hãy bấm nút Mở Màn Hình Quay.", "warning");
            },

            grantLuckyNumberEdit: (user) => {
                db.collection("lucky_numbers").doc(user).update({ canEdit: true }).then(() => Utils.toast(`Đã cấp phép sửa số cho thành viên: ${user}`, "success")).catch(e => Utils.toast("Lỗi cấp phép trên CSDL.", "error"));
            },

            calcTotalChance: () => WheelPrize.recalc(),
            saveWheelConfig: () => WheelPrize.save(),

            calcTotalChanceTT: () => TTPrize.recalc(),
            saveTranhThuongConfig: () => TTPrize.save(),

            openSpinModal: (docId, username) => {
                document.getElementById('spin-target-id').value = docId; document.getElementById('spin-target-name').innerText = username;
                document.getElementById('spin-amount').value = "1"; document.getElementById('spin-action').value = "add"; UI.openModal('modal-spins');
            },

            saveSpins: () => {
                const docId = document.getElementById('spin-target-id').value; 
                const amount = parseInt(document.getElementById('spin-amount').value); 
                const action = document.getElementById('spin-action').value; 
                const type = document.getElementById('spin-type').value; 
                const username = document.getElementById('spin-target-name').innerText;

                if(!docId || isNaN(amount)) return Utils.toast("Số lượng không hợp lệ.", "error");
                
                const accRef = db.collection("accounts").doc(docId);
                const logRef = db.collection("admin_logs").doc();

                db.runTransaction(transaction => {
                    return transaction.get(accRef).then(doc => {
                        if (!doc.exists) throw "Tài khoản không tồn tại!";
                        const currentVal = doc.data()[type] || 0; let newVal = 0;
                        if(action === 'add') { newVal = currentVal + amount; } else if (action === 'set') { newVal = amount; }
                        
                        if (newVal < 0) newVal = 0;

                        let updateData = {}; updateData[type] = newVal; 
                        transaction.update(accRef, updateData);

                        transaction.set(logRef, {
                            user: username,
                            type: type,
                            action: action,
                            amount: amount,
                            timestamp: Date.now()
                        });
                    });
                }).then(() => { 
                    Utils.toast("Đã cập nhật dữ liệu thành công!", "success"); 
                    UI.closeModal('modal-spins'); 
                }).catch(err => Utils.toast("Lỗi giao dịch CSDL.", "error"));
            },

            /* Thu thập toàn bộ biến động điểm / lượt của 1 tài khoản (dùng chung: Lịch sử biến động + Ví giải trí) */
            collectUserLogs: async (username) => {
                const bal = { points: 0, spins: 0, tickets: 0, conThrows: 0 };
                    let logs = [];
                    // NHANH: 16 truy vấn chạy CÙNG LÚC (trước đây lần lượt từng cái -> 3-6 giây). Xử lý vẫn theo đúng thứ tự cũ.
                    const Q = (p) => p.catch(e => { console.warn('collectUserLogs', e); throw e; });
                    const EMPTY = { empty: true, forEach() {}, docs: [] };
                    const [accSnap, pointSnap, spinSnap, conSnapP, ttSnap, transferFromSnap, transferToSnap, inviteerSnap, inviteeSnap, attRewardDoc, mtSnap, adminSnap, rpsCfgSnap, rpsP1Snap, rpsP2Snap] = await Promise.all([
                        Q(db.collection("accounts").where("user", "==", username).get()),
                        Q(db.collection("point_history").where("user", "==", username).get()),
                        Q(db.collection("spin_history").where("userId", "==", username).get()),
                        db.collection("con_history").where("user", "==", username).get().catch(e => { console.warn('con_history', e); return EMPTY; }),
                        Q(db.collection("tranhthuong_history").where("userId", "==", username).get()),
                        Q(db.collection("transfer_history").where("from", "==", username).get()),
                        Q(db.collection("transfer_history").where("to", "==", username).get()),
                        Q(db.collection("invite_history").where("inviter", "==", username).get()),
                        Q(db.collection("invite_history").where("invitee", "==", username).get()),
                        Q(db.collection("settings").doc("attendance_reward_items").get()),
                        Q(db.collection("attendance").where("userName", "==", username).get()),
                        Q(db.collection("admin_logs").where("user", "==", username).get()),
                        Q(db.collection("settings").doc("rps_config").get()),
                        Q(db.collection("rps_history").where("player1", "==", username).get()),
                        Q(db.collection("rps_history").where("player2", "==", username).get())
                    ]);
                    if(!accSnap.empty) {
                        const data = accSnap.docs[0].data();
                        bal.points = data.points || 0; bal.spins = data.spins || 0; bal.tickets = data.tickets || 0; bal.conThrows = data.conThrows || 0;
                    }

                    pointSnap.forEach(doc => {
                        const d = doc.data();
                        logs.push({ time: d.timestamp, type: 'points', action: 'add', amount: d.pointsChanged, reason: d.detail || 'Giao dịch điểm' });
                        if (d.action === "exchange" && (d.itemType === 'conThrows' || /Lượt Ném Còn/.test(d.detail || ''))) {
                            const m = /lấy (\d+) Lượt Ném Còn/.exec(d.detail || '');
                            logs.push({ time: d.timestamp + 1, type: 'conThrows', action: 'add', amount: m ? parseInt(m[1]) : (d.qty || 1), reason: 'Đổi điểm lấy lượt ném còn' });
                        } else if (d.action === "exchange" && d.detail) {
                            if (d.detail.includes("Vòng Quay")) {
                                logs.push({ time: d.timestamp + 1, type: 'spins', action: 'add', amount: 1, reason: 'Quy đổi từ Cửa Hàng' });
                            } else if ((d.detail.includes("Xé Thẻ") || d.detail.includes("Lì Xì"))) {
                                logs.push({ time: d.timestamp + 1, type: 'tickets', action: 'add', amount: 1, reason: 'Quy đổi từ Cửa Hàng' });
                            }
                        }
                    });

                    spinSnap.forEach(doc => {
                        logs.push({ time: doc.data().timestamp, type: 'spins', action: 'add', amount: -1, reason: `Sử dụng Vòng Quay (Trúng: ${doc.data().result})` });
                    });

                    try {
                        const conSnap = conSnapP;
                        const RES = { hit: 'Lọt vòng', rim: 'Chạm vành', miss: 'Trượt' };
                        conSnap.forEach(doc => {
                            const c = doc.data();
                            if (c.result === 'free') logs.push({ time: c.ts, type: 'conThrows', action: 'add', amount: c.amount || 0, reason: '🎁 Nhận lượt ném còn miễn phí trong ngày' });
                            else logs.push({ time: c.ts, type: 'conThrows', action: 'add', amount: -1, reason: `🎯 Ném còn: ${RES[c.result] || c.result}${c.points > 0 ? ` (+${c.points} điểm)` : ''}` });
                        });
                    } catch (e) { console.warn('con_history', e); }

                    ttSnap.forEach(doc => {
                        logs.push({ time: doc.data().timestamp, type: 'tickets', action: 'add', amount: -1, reason: `Rút Lì Xì (Trúng: ${doc.data().result})` });
                    });

                    transferFromSnap.forEach(doc => {
                        logs.push({ time: doc.data().timestamp, type: doc.data().type, action: 'add', amount: -doc.data().amount, reason: `Tặng quà cho đồng đội: [${doc.data().to}]` });
                    });
                    
                    transferToSnap.forEach(doc => {
                        logs.push({ time: doc.data().timestamp, type: doc.data().type, action: 'add', amount: doc.data().amount, reason: `Được nhận quà từ: [${doc.data().from}]` });
                    });

                    // Mã mời: mỗi loại thưởng (điểm / lượt rút / lượt quay / lượt ném) 1 dòng; bản ghi cũ chỉ có rewardAmount = lượt rút lì xì
                    const invGive = (d, side) => (window.InviteAdmin && InviteAdmin.histGive) ? InviteAdmin.histGive(d, side) : ((d.rewards && d.rewards[side]) || (d.rewardAmount ? { tickets: d.rewardAmount } : {}));
                    const invLogs = (snap, side, reason) => snap.forEach(doc => {
                        const d = doc.data(), g = invGive(d, side);
                        ['points', 'tickets', 'spins', 'conThrows'].forEach((k, i) => { if (Number(g[k]) > 0) logs.push({ time: (d.timestamp || 0) + i * 0.001, type: k, action: 'add', amount: Number(g[k]), reason: reason(d) }); });
                    });
                    invLogs(inviteerSnap, 'inviter', d => `🤝 Nhận thưởng do [${d.invitee}] nhập mã mời của bạn`);
                    invLogs(inviteeSnap, 'invitee', d => `🤝 Nhận thưởng do bạn nhập mã mời của [${d.inviter}]`);

                    // Thưởng vật phẩm điểm danh. Điểm lì xì đã nằm trong point_history -> ở đây chỉ thêm lượt rút / lượt quay / lượt ném
                    const attCfg = attRewardDoc.exists ? attRewardDoc.data() : {}, attOn = attCfg.isEnabled === true;
                    const attEst = (ts) => window.AttSched ? window.AttSched.give(attCfg, ts) : { tickets: Number(attCfg.tickets) || 0 };
                    const attPush = (d, g) => ['tickets', 'spins', 'conThrows'].forEach((k, i) => { const n = Number(g && g[k]) || 0; if (n > 0) logs.push({ time: d.timestamp + 1 + i, type: k, action: 'add', amount: n, reason: `Thưởng điểm danh hằng ngày` }); });
                    mtSnap.forEach(doc => {
                        const d = doc.data();
                        // Bản ghi mới lưu sẵn vật phẩm thực nhận; bản cũ thì ước theo cấu hình hiện tại (+ hẹn giờ)
                        if (d.rewardItems) return attPush(d, d.rewardItems);
                        if (d.rewardTickets !== undefined) return attPush(d, { tickets: d.rewardTickets });
                        if (!attOn) return;
                        attPush(d, attEst(d.timestamp));   // ước theo cấu hình hiện tại, chỉ món có giờ hẹn chứa thời điểm điểm danh
                    });

                    adminSnap.forEach(doc => {
                        logs.push({ time: doc.data().timestamp, type: doc.data().type, action: doc.data().action, amount: doc.data().amount, reason: `<i class="fa-solid fa-user-shield text-info mr-1"></i> Admin can thiệp trực tiếp` });
                    });

                    let rpsWin = 10; let rpsLose = -5;
                    if(rpsCfgSnap.exists) {
                        rpsWin = rpsCfgSnap.data().winReward !== undefined ? parseInt(rpsCfgSnap.data().winReward) : 10;
                        rpsLose = rpsCfgSnap.data().loseReward !== undefined ? parseInt(rpsCfgSnap.data().loseReward) : -5;
                    }

                    rpsP1Snap.forEach(doc => {
                        const d = doc.data();
                        let pointChange = d.winner === username ? rpsWin : (d.winner === 'draw' ? 0 : rpsLose);
                        let rsTxt = d.winner === username ? "Thắng" : (d.winner === 'draw' ? "Hòa" : "Thua");
                        if (pointChange !== 0) logs.push({ time: d.timestamp, type: 'points', action: 'add', amount: pointChange, reason: `PvP Kéo Búa Bao vs [${d.player2}] (${rsTxt})` });
                    });

                    rpsP2Snap.forEach(doc => {
                        const d = doc.data();
                        let pointChange = d.winner === username ? rpsWin : (d.winner === 'draw' ? 0 : rpsLose);
                        let rsTxt = d.winner === username ? "Thắng" : (d.winner === 'draw' ? "Hòa" : "Thua");
                        if (pointChange !== 0) logs.push({ time: d.timestamp, type: 'points', action: 'add', amount: pointChange, reason: `PvP Kéo Búa Bao vs [${d.player1}] (${rsTxt})` });
                    });

                    logs.sort((a, b) => b.time - a.time);

                    let runPoints = bal.points, runSpins = bal.spins, runTickets = bal.tickets, runCon = bal.conThrows;

                    logs.forEach(log => {
                        if (log.type === 'points') {
                            log.balanceAfter = runPoints;
                            if (log.action === 'add') runPoints -= log.amount;
                        } else if (log.type === 'spins') {
                            log.balanceAfter = runSpins;
                            if (log.action === 'add') runSpins -= log.amount;
                        } else if (log.type === 'tickets') {
                            log.balanceAfter = runTickets;
                            if (log.action === 'add') runTickets -= log.amount;
                        } else if (log.type === 'conThrows') {
                            log.balanceAfter = runCon;
                            if (log.action === 'add') runCon -= log.amount;
                        }
                    });

                return { logs, bal };
            },

            viewUserHistory: async (username) => {
                UI.openModal('modal-user-history');
                document.getElementById('history-target-name').innerText = username;
                const tbody = document.getElementById('tb-user-history-list');
                tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang thu thập dữ liệu từ các phân hệ...</td></tr>`;
                
                try {
                    const R = await AdminActions.collectUserLogs(username), logs = R.logs;
                    document.getElementById('history-real-points').innerText = R.bal.points;
                    document.getElementById('history-real-spins').innerText = R.bal.spins;
                    document.getElementById('history-real-tickets').innerText = R.bal.tickets;
                    document.getElementById('history-real-con').innerText = R.bal.conThrows;

                    State.currentUserHistoryCache = logs;
                    State.historyTargetUser = username;
                    
                    tbody.innerHTML = "";
                    if (logs.length === 0) {
                        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-8">Tài khoản này chưa có lịch sử biến động nào.</td></tr>`;
                        return;
                    }

                    logs.forEach(log => {
                        const timeStr = new Date(log.time).toLocaleString('vi-VN', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'});
                        const typeBadge = log.type === 'spins' 
                            ? `<span class="badge badge-warning"><i class="fa-solid fa-dharmachakra mr-1"></i> Lượt Quay</span>` 
                            : log.type === 'tickets' ? `<span class="badge badge-danger"><i class="fa-solid fa-envelope mr-1"></i> Lượt Rút</span>`
                            : log.type === 'conThrows' ? `<span class="badge" style="background: rgba(249, 115, 22, 0.15); color: #f97316; border: 1px solid rgba(249, 115, 22, 0.5);">🎯 Lượt Ném</span>`
                            : `<span class="badge badge-online" style="background: rgba(16, 185, 129, 0.15); color: var(--color-success); border-color: rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-coins mr-1"></i> Điểm Lì Xì</span>`;
                        
                        let amountHtml = '';
                        if (log.action === 'add') {
                            if (log.amount > 0) amountHtml = `<span class="text-success font-bold">+${log.amount}</span>`;
                            else if (log.amount < 0) amountHtml = `<span class="text-danger font-bold">${log.amount}</span>`;
                            else amountHtml = `<span class="text-muted font-bold">0</span>`;
                        } else if (log.action === 'set') {
                            amountHtml = `<span class="text-info font-bold">=${log.amount}</span>`;
                        }

                        let balanceClass = log.type === 'spins' ? 'text-warning' : (log.type === 'tickets' ? 'text-danger' : (log.type === 'conThrows' ? 'text-warning' : 'text-success'));

                        tbody.insertAdjacentHTML('beforeend', `
                            <tr>
                                <td class="text-muted font-bold text-sm" style="white-space: nowrap;">${timeStr}</td>
                                <td>${typeBadge}</td>
                                <td class="text-center">
                                    <div style="font-size: 16px;">${amountHtml}</div>
                                    <div class="text-xs text-muted mt-1 font-bold">Dư: <span class="${balanceClass}">${log.balanceAfter}</span></div>
                                </td>
                                <td class="text-main">${qdH(log.reason)}</td>
                            </tr>
                        `);
                    });

                } catch (err) {
                    console.error("Lỗi lấy lịch sử:", err);
                    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-8">Lỗi trích xuất dữ liệu: Không thể kết nối.</td></tr>`;
                }
            },

            
            exportUserHistoryExcel: () => {
                if(!State.currentUserHistoryCache || State.currentUserHistoryCache.length === 0) return Utils.toast("Không có dữ liệu lịch sử để xuất.", "warning");
                const username = State.historyTargetUser || "Unknown";
                let htmlTableStr = `<table border="1"><thead><tr><th bgcolor="#0ea5e9"><font color="#ffffff">STT</font></th><th bgcolor="#0ea5e9"><font color="#ffffff">Thời Gian</font></th><th bgcolor="#0ea5e9"><font color="#ffffff">Loại Tài Sản</font></th><th bgcolor="#0ea5e9"><font color="#ffffff">Giao Dịch</font></th><th bgcolor="#0ea5e9"><font color="#ffffff">Số Dư</font></th><th bgcolor="#0ea5e9"><font color="#ffffff">Nội Dung Biến Động</font></th></tr></thead><tbody>`;
                State.currentUserHistoryCache.forEach((log, index) => { 
                    const timeStr = new Date(log.time).toLocaleString('vi-VN');
                    let typeStr = log.type === 'spins' ? 'Lượt Quay' : (log.type === 'tickets' ? 'Lượt Rút Lì Xì' : (log.type === 'conThrows' ? 'Lượt Ném Còn' : 'Điểm'));
                    let amountStr = log.amount > 0 ? `+${log.amount}` : log.amount;
                    htmlTableStr += `<tr><td align="center">${index + 1}</td><td align="center">${timeStr}</td><td align="center">${typeStr}</td><td align="center">${amountStr}</td><td align="center">${log.balanceAfter}</td><td>${qdH(log.reason)}</td></tr>`; 
                });
                htmlTableStr += `</tbody></table>`; 
                AdminActions.downloadXLS(htmlTableStr, `Bien_Dong_Du_Lieu_${username}`);
            },
exportAttendanceExcel: () => {
                if(State.attendanceCache.length === 0) return Utils.toast("Không có dữ liệu điểm danh.", "warning");
                let htmlTableStr = `<table border="1"><thead><tr><th bgcolor="#10b981"><font color="#ffffff">STT</font></th><th bgcolor="#10b981"><font color="#ffffff">Tên Thành Viên</font></th><th bgcolor="#10b981"><font color="#ffffff">Thời Gian Ghi Nhận (Giờ - Ngày)</font></th><th bgcolor="#10b981"><font color="#ffffff">Mã Định Danh Hệ Thống (UID)</font></th></tr></thead><tbody>`;
                State.attendanceCache.forEach((row, index) => { htmlTableStr += `<tr><td align="center">${index + 1}</td><td>${row.userName}</td><td align="center">${row.time} - ${row.date}</td><td style="mso-number-format:'\\@';">${row.userId}</td></tr>`; });
                htmlTableStr += `</tbody></table>`; AdminActions.downloadXLS(htmlTableStr, "Bao_Cao_Diem_Danh_30Ngay");
            },

            exportRegistrationExcel: () => {
                if(State.regCache.length === 0) return Utils.toast("Danh sách đăng ký hiện đang trống.", "warning");
                let htmlTableStr = `<table border="1"><thead><tr><th bgcolor="#f59e0b"><font color="#ffffff">STT</font></th><th bgcolor="#f59e0b"><font color="#ffffff">Tên Nhân Vật (Ingame)</font></th><th bgcolor="#f59e0b"><font color="#ffffff">Mã Định Danh (ID Game)</font></th><th bgcolor="#f59e0b"><font color="#ffffff">Ngày Nộp Đơn</font></th><th bgcolor="#f59e0b"><font color="#ffffff">Tài Khoản Yêu Cầu</font></th></tr></thead><tbody>`;
                State.regCache.forEach((row, index) => { htmlTableStr += `<tr><td align="center">${index + 1}</td><td>${qdH(row.name)}</td><td style="mso-number-format:'\\@';">${qdH(row.gameId)}</td><td align="center">${new Date(row.timestamp).toLocaleDateString('vi-VN')}</td><td>${qdH(row.submitter)}</td></tr>`; });
                htmlTableStr += `</tbody></table>`; AdminActions.downloadXLS(htmlTableStr, "Danh_Sach_Dang_Ky_ID");
            },

            exportWheelExcel: () => {
                if(State.wheelHistoryCache.length === 0) return Utils.toast("Không có lịch sử quay trong 30 ngày qua.", "warning");
                let htmlTableStr = `<table border="1"><thead><tr><th bgcolor="#4f46e5"><font color="#ffffff">STT</font></th><th bgcolor="#4f46e5"><font color="#ffffff">Tài Khoản Quay</font></th><th bgcolor="#4f46e5"><font color="#ffffff">Phần Thưởng Trúng</font></th><th bgcolor="#4f46e5"><font color="#ffffff">Thời Gian Thực Hiện</font></th></tr></thead><tbody>`;
                State.wheelHistoryCache.forEach((row, index) => { const timeFmt = new Date(row.timestamp).toLocaleString('vi-VN'); htmlTableStr += `<tr><td align="center">${index + 1}</td><td>${row.userId}</td><td>${row.result}</td><td align="center">${timeFmt}</td></tr>`; });
                htmlTableStr += `</tbody></table>`; AdminActions.downloadXLS(htmlTableStr, "Lich_Su_Vong_Quay_30Ngay");
            },

            exportTranhThuongExcel: () => {
                if(State.tranhThuongHistoryCache.length === 0) return Utils.toast("Không có lịch sử Rút Lì Xì trong 30 ngày qua.", "warning");
                let htmlTableStr = `<table border="1"><thead><tr><th bgcolor="#ef4444"><font color="#ffffff">STT</font></th><th bgcolor="#ef4444"><font color="#ffffff">Tài Khoản Chơi</font></th><th bgcolor="#ef4444"><font color="#ffffff">Phần Thưởng Trúng</font></th><th bgcolor="#ef4444"><font color="#ffffff">Thời Gian</font></th></tr></thead><tbody>`;
                State.tranhThuongHistoryCache.forEach((row, index) => { const timeFmt = new Date(row.timestamp).toLocaleString('vi-VN'); htmlTableStr += `<tr><td align="center">${index + 1}</td><td>${row.userId}</td><td>${row.result}</td><td align="center">${timeFmt}</td></tr>`; });
                htmlTableStr += `</tbody></table>`; AdminActions.downloadXLS(htmlTableStr, "Lich_Su_Rut_Li_Xi_30Ngay");
            },

            downloadXLS: (tableHtmlContent, fileNamePrefix) => {
                // Đổi sang Excel .xlsx thật, giao diện đẹp (lỗi thì quay về kiểu cũ)
                if (window.QDXlsx && window.DOMParser) {
                    try {
                        const T = { Lich_Su_Keo_Bua_Bao: 'Lịch sử Kéo Búa Bao', Lich_Su_Cua_Hang_Diem_30Ngay: 'Lịch sử Cửa hàng điểm (30 ngày)', Lich_Su_Quay_So_Nhan_Pham_30Ngay: 'Lịch sử Quay số nhân phẩm (30 ngày)',
                            Bao_Cao_Diem_Danh_30Ngay: 'Báo cáo điểm danh (30 ngày)', Danh_Sach_Dang_Ky_ID: 'Danh sách đăng ký ID', Lich_Su_Vong_Quay_30Ngay: 'Lịch sử Vòng quay (30 ngày)',
                            Lich_Su_Rut_Li_Xi_30Ngay: 'Lịch sử Rút Lì Xì (30 ngày)', Bao_Cao_Li_Xi: 'Báo cáo Lì Xì' };
                        const title = T[fileNamePrefix] || (/^Bien_Dong_Du_Lieu_/.test(fileNamePrefix) ? 'Biến động tài khoản ' + fileNamePrefix.replace(/^Bien_Dong_Du_Lieu_/, '') : fileNamePrefix.replace(/_/g, ' '));
                        QDXlsx.download(`${fileNamePrefix}_${String(State.todayStr || '').replace(/\//g, '-')}`, QDXlsx.fromHtml(tableHtmlContent, title));
                        return Utils.toast("Đã tải file Excel (.xlsx) về máy.", "success");
                    } catch (e) { console.warn('QDXlsx', e); }
                }
                const finalXmlHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body>${tableHtmlContent}</body></html>`;
                const blob = new Blob([finalXmlHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' }); const anchorLink = document.createElement("a");
                anchorLink.href = URL.createObjectURL(blob); anchorLink.download = `${fileNamePrefix}_${State.todayStr.replace(/\//g, '-')}.xls`;
                document.body.appendChild(anchorLink); anchorLink.click(); document.body.removeChild(anchorLink); Utils.toast("Trích xuất CSDL thành công. Tệp Excel (.xls) đã được tải về máy.", "success");
            },

            createAccount: () => {
                const uInput = document.getElementById('new-u'); const pInput = document.getElementById('new-p'); const rInput = document.getElementById('new-role');
                const u = uInput.value.trim(); const p = pInput.value.trim(); const r = rInput ? rInput.value : 'user';
                if(!u || !p) return Utils.toast("Dữ liệu không hợp lệ.", "warning"); 
                u.length < 4 ? Utils.toast("Tên đăng nhập tối thiểu 4 ký tự.", "error") : db.collection("accounts").where("user", "==", u).limit(1).get().then(ex => { if (!ex.empty) { Utils.toast(`Tên đăng nhập "${u}" đã có người dùng.`, "error"); throw 0; } }).then(() => db.collection("accounts").add({ user: u, pass: p, role: r, lastActive: 0, isBlocked: false, points: 0, spins: 0, tickets: 0, created_at: Date.now() }).then(() => { Utils.toast(`Đã cấp phép quyền truy cập cho "${u}".`, "success"); uInput.value = ""; pInput.value = ""; if(rInput) rInput.value = "user"; UI.closeModal('modal-add-user'); })).catch(err => { if (err !== 0) Utils.toast("Không tạo được: " + ((err && err.message) || "lỗi hệ thống"), "error"); });
            },

            openNewsEditor: (docId = '', currentContentEncoded = '') => { document.getElementById('news-id').value = docId; document.getElementById('news-content').value = currentContentEncoded ? decodeURIComponent(currentContentEncoded) : ''; UI.openModal('modal-news'); },

            saveNews: () => {
                const docId = document.getElementById('news-id').value; const bodyText = document.getElementById('news-content').value.trim();
                if(!bodyText) return Utils.toast("Nội dung không được bỏ trống.", "error");
                if(docId) { db.collection("news").doc(docId).update({ content: bodyText }).then(() => { Utils.toast("Đã cập nhật nội dung bản tin.", "success"); UI.closeModal('modal-news'); }).catch(e => Utils.toast("Lỗi cập nhật CSDL.", "error"));
                } else { db.collection("news").add({ content: bodyText, time: Date.now() }).then(() => { Utils.toast("Bản tin mới đã được phát hành.", "success"); UI.closeModal('modal-news'); }).catch(e => Utils.toast("Lỗi phát hành bản tin.", "error")); }
            },

            requestDelete: (collectionName, docId, messageHtml) => {
                const msgNode = document.getElementById('confirm-msg'); const btnExec = document.getElementById('btn-exec-confirm');
                if(!msgNode || !btnExec) return; msgNode.innerHTML = messageHtml;
                State.activeDeleteAction = () => {
                    btnExec.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang Xóa...`; btnExec.disabled = true;
                    db.collection(collectionName).doc(docId).delete().then(() => Utils.toast("Đã xóa dữ liệu thành công.", "success")).catch(err => Utils.toast("Không thể xóa dữ liệu này.", "error")).finally(() => { btnExec.innerHTML = `Đồng ý Xóa`; btnExec.disabled = false; UI.closeModal('modal-confirm'); State.activeDeleteAction = null; });
                };
                UI.openModal('modal-confirm');
            }
        };


        document.getElementById('btn-exec-confirm').addEventListener('click', () => { if (typeof State.activeDeleteAction === 'function') State.activeDeleteAction(); });
    
        
        // --- MOBILE TABLE RESPONSIVE AUTO-LABELLER ---
        // Gắn data-label (tên cột) cho từng ô của bảng -> trên điện thoại hiện "TÊN CỘT  giá trị".
        // Chỉ xử lý những dòng VỪA THÊM; tên cột của mỗi bảng đọc 1 lần rồi nhớ.
        // (Bản cũ: mỗi lần trang thay đổi bất kỳ chỗ nào lại quét lại MỌI bảng, MỌI dòng, MỌI ô -> bảng hàng nghìn dòng là đứng hình.)
        document.addEventListener('DOMContentLoaded', () => {
            const heads = new WeakMap();
            const headersOf = table => {
                let h = heads.get(table);
                if (!h) { h = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim()); heads.set(table, h); }
                return h;
            };
            const labelRow = tr => {
                const table = tr.closest('table'); if (!table || !tr.closest('tbody')) return;
                if (tr.querySelector('td[colspan]')) return; // Bỏ qua tr loading/trống
                const headers = headersOf(table); if (!headers.length) return;
                const tds = tr.querySelectorAll('td');
                for (let i = 0; i < tds.length; i++) if (headers[i] && !tds[i].getAttribute('data-label')) tds[i].setAttribute('data-label', headers[i]);
            };
            document.querySelectorAll('tbody tr').forEach(labelRow);
            const observer = new MutationObserver(ms => {
                const rows = new Set();
                for (const m of ms) {
                    const t = m.target;
                    if (t.nodeType === 1 && t.closest('th, thead')) { const tb = t.closest('table'); if (tb) heads.delete(tb); }   // tên cột đổi -> đọc lại
                    for (const n of m.addedNodes) {
                        if (n.nodeType !== 1) { const up = t.nodeType === 1 && t.closest('tr'); if (up) rows.add(up); continue; }
                        if (n.tagName === 'TR') rows.add(n);
                        else {
                            if (n.tagName === 'TH' || n.tagName === 'THEAD') { const tb = n.closest('table'); if (tb) heads.delete(tb); }
                            const up = n.closest('tr'); if (up) rows.add(up);
                            if (n.firstElementChild) n.querySelectorAll('tr').forEach(r => rows.add(r));
                        }
                    }
                }
                rows.forEach(labelRow);
            });
            observer.observe(document.body, { childList: true, subtree: true });
        });
        
    
