        /** 1. FIREBASE INITIALIZATION */
        const firebaseConfig = { apiKey: "AIzaSyCtn0peiXBsrRRgUZSSVQFrBe-RGgxS6eQ", projectId: "web-dangky-123" };
        firebase.initializeApp(firebaseConfig); const db = firebase.firestore();

        // ==========================================
        // HỆ THỐNG BẢO TRÌ TỰ ĐỘNG REALTIME
        // ==========================================
        // BẢO TRÌ: Admin bật -> chuyển sang trang bảo trì baotri.html (Admin đã mở khóa qua "Admin Gateway" thì được ở lại)
        db.collection("settings").doc("maintenance").onSnapshot(doc => {
            if (!(doc.exists && doc.data().isEnabled === true)) return;
            let bypass = false; try { bypass = sessionStorage.getItem('admin_bypass_mt') === 'true'; } catch (e) {}
            if (bypass) return;
            const here = (location.pathname.split('/').pop() || 'index.html') + location.search;
            location.replace('baotri.html?from=' + encodeURIComponent(here));
        });

        window.openCustomAdmin = function() {
            const modal = document.getElementById('custom-admin-prompt');
            const inp = document.getElementById('admin-pass-inp');
            document.getElementById('admin-error-msg').style.display = 'none';
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('active'), 10);
            inp.value = ''; inp.focus();
        };

        window.closeCustomAdmin = function() {
            const modal = document.getElementById('custom-admin-prompt');
            modal.classList.remove('active');
            setTimeout(() => modal.style.display = 'none', 300);
        };

        window.verifyCustomAdmin = function() {
            const pass = document.getElementById('admin-pass-inp').value;
            const errMsg = document.getElementById('admin-error-msg');
            
            if (qdGate(pass)) { 
                sessionStorage.setItem('admin_bypass_mt', 'true');
                document.getElementById('maintenance-blocker').style.display = 'none';
                document.body.style.overflow = '';
                window.closeCustomAdmin();
                
                const appShell = document.getElementById('app-shell');
                if (appShell && window.State && window.State.currentUser) { appShell.style.opacity = '1'; appShell.style.pointerEvents = 'auto'; }
                const authGate = document.getElementById('auth-gate');
                if (authGate && (!window.State || !window.State.currentUser)) { authGate.style.opacity = '1'; authGate.style.pointerEvents = 'auto'; }

                const t = document.createElement('div');
                t.style.cssText = "position:fixed; top:24px; right:24px; background:#121217; color:#fff; padding:16px 24px; border-radius:12px; font-weight:bold; box-shadow:0 15px 30px rgba(0,0,0,0.5); z-index:999999999; transform:translateX(150%); transition:0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55); font-family:'Plus Jakarta Sans',sans-serif; border: 1px solid #3f3f46; border-left: 4px solid #10b981; display:flex; align-items:center; gap:12px;";
                t.innerHTML = '<i class="fa-solid fa-check-circle" style="color:#10b981; font-size:24px;"></i> <span style="font-size: 15px;">Xác thực thành công. Đã gỡ bỏ giới hạn bảo trì!</span>';
                document.body.appendChild(t);
                setTimeout(() => t.style.transform = 'translateX(0)', 10);
                setTimeout(() => { t.style.transform = 'translateX(150%)'; setTimeout(()=>t.remove(), 500); }, 3000);
            } else {
                errMsg.style.display = 'block';
                const inp = document.getElementById('admin-pass-inp');
                inp.style.transform = 'translateX(-10px)';
                setTimeout(()=>inp.style.transform='translateX(10px)', 50);
                setTimeout(()=>inp.style.transform='translateX(-10px)', 100);
                setTimeout(()=>inp.style.transform='translateX(10px)', 150);
                setTimeout(()=>inp.style.transform='translateX(0)', 200);
                inp.value = '';
            }
        };

        /** 2. STATE MANAGEMENT */
        window.State = {
            currentUser: null, currentDocId: null, heartbeatInterval: null,
            chatTarget: null, usersCache: {}, chatListener: null,
            nicknames: JSON.parse(localStorage.getItem('qd_elite_nicks') || '{}'),
            inviteCode: null, hasUsedInvite: false, luckyNumberCanEdit: true,
            tournamentData: [],
            availableSpins: 0, availableTickets: 0, availablePoints: 0,
            wheelPrizes: [], ticketPrizes: []
        };

        /** 3. UTILITY FUNCTIONS */
        window.Utils = {
            toast: (msg, type = 'success') => {
                const c = document.getElementById('toast-container'); const t = document.createElement('div'); t.className = `toast ${type} show`;
                let iconStr = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-xmark' : (type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info'));
                t.innerHTML = `<div style="font-size:28px; flex-shrink:0;"><i class="fa-solid ${iconStr}"></i></div><div class="flex-col"><span style="font-size: 15px; font-weight:700;">${msg}</span></div>`;
                c.appendChild(t); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 1300);   // thông báo chỉ hiện 1,3 giây rồi ẩn
            },
            getTodayString: () => new Date().toLocaleDateString('vi-VN'),
            getRoomId: (u1, u2) => [u1, u2].sort().join('_'),
            // Trạng thái hoạt động thời gian thực (khối QD Session): online = đang mở web + có thao tác, offline ngay khi ẩn / đóng tab
            timeAgo: (ts, online) => {
                if (window.QDSession) return window.QDSession.pres({ lastActive: ts, online: online }).text;
                if(!ts) return "Chưa từng hoạt động"; const s = Math.floor((Date.now() - ts)/1000);
                if(s < 120 && online !== false) return "Đang trực tuyến"; if(s < 60) return "Hoạt động vừa xong"; if(s < 3600) return `Hoạt động ${Math.floor(s/60)} phút trước`; if(s < 86400) return `Hoạt động ${Math.floor(s/3600)} giờ trước`;
                return `Truy cập: ${new Date(ts).toLocaleDateString('vi-VN')}`;
            },
            isOnline: (ts, online) => window.QDSession ? window.QDSession.pres({ lastActive: ts, online: online }).on : (online !== false && (Date.now() - (ts || 0)) < 120000),
            liveAgo: (ts, online, o) => window.QDSession ? window.QDSession.attrs({ lastActive: ts, online: online }, o) : '',
            safeText: (id, text) => { const el = document.getElementById(id); if(el) el.innerText = text; }
        };

        /** ÂM THANH */
        window.Sound = {
            ctx: null,
            rewardAudio: new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3'),
            msgAudio: new Audio('media/qd-msg.mp3?v=2'),   // tiếng tin nhắn "bóp-bóp" ngắn (giống thông báo trên app) — khác chuông cuộc gọi "reng reng"
            initCtx: () => {
                if (!window.Sound.ctx) window.Sound.ctx = new (window.AudioContext || window.webkitAudioContext)();
                if (window.Sound.ctx.state === 'suspended') window.Sound.ctx.resume();
            },
            playTick: () => {
                try {
                    window.Sound.initCtx();
                    const osc = window.Sound.ctx.createOscillator(); const gain = window.Sound.ctx.createGain();
                    osc.type = 'sine'; osc.frequency.setValueAtTime(800, window.Sound.ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(100, window.Sound.ctx.currentTime + 0.1);
                    gain.gain.setValueAtTime(0.1, window.Sound.ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, window.Sound.ctx.currentTime + 0.1);
                    osc.connect(gain); gain.connect(window.Sound.ctx.destination);
                    osc.start(); osc.stop(window.Sound.ctx.currentTime + 0.1);
                } catch(e){}
            },
            playWin: () => {
                try {
                    window.Sound.initCtx();
                    const notes = [523.25, 659.25, 783.99, 1046.50]; 
                    notes.forEach((freq, i) => {
                        const osc = window.Sound.ctx.createOscillator(); const gain = window.Sound.ctx.createGain();
                        osc.frequency.value = freq;
                        gain.gain.setValueAtTime(0.15, window.Sound.ctx.currentTime + i * 0.1);
                        gain.gain.exponentialRampToValueAtTime(0.01, window.Sound.ctx.currentTime + i * 0.1 + 0.3);
                        osc.connect(gain); gain.connect(window.Sound.ctx.destination);
                        osc.start(window.Sound.ctx.currentTime + i * 0.1); osc.stop(window.Sound.ctx.currentTime + i * 0.1 + 0.3);
                    });
                } catch(e){}
            }
        };

        /** 4. THEME & UI CONTROLLERS */
        window.Theme = {
            init: () => {
                document.documentElement.setAttribute('data-theme', 'tet');
                localStorage.setItem('qd_theme_mode', 'tet');
                Utils.safeText('theme-text', 'Giao diện Tết');
                const icn = document.getElementById('theme-icon'); if(icn) icn.className = 'fa-solid fa-fire text-danger';
                const c = localStorage.getItem('qd_chat_color'); if(c) window.Theme.applyChatColor(c);
            },
            toggle: () => {
                Utils.toast(`Giao diện Tết đã được cố định!`, "success");
            },
            // Đặt màu nền tin nhắn của mình + tự chọn chữ đen/trắng cho dễ đọc
            applyChatColor: (hex) => {
                const r = document.documentElement.style; r.setProperty('--chat-bubble-me', hex); r.setProperty('--chat-me-bg', hex);
                const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim()); if (!m) { r.setProperty('--chat-me-fg', '#ffffff'); return; }
                const n = parseInt(m[1], 16), lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
                const L = 0.2126 * lin(n >> 16 & 255) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255);
                r.setProperty('--chat-me-fg', L > 0.4 ? '#3a0000' : '#ffffff');
            },
            setChatColor: (hex) => { window.Theme.applyChatColor(hex); localStorage.setItem('qd_chat_color', hex); Utils.toast('Màu sắc tin nhắn đã được cập nhật.', "success"); window.UI.closeModal('modal-settings'); }
        }
        window.UI = {
            openModal: (id) => { const el = document.getElementById(id); if(el) { el.style.display = 'flex'; void el.offsetWidth; el.classList.add('active'); } },
            closeModal: (id) => { 
                const el = document.getElementById(id); 
                if(el) { 
                    el.classList.remove('active'); 
                    setTimeout(() => el.style.display = 'none', 300); 
                } 
                if(id === 'modal-account-locked') {
                    if(window.Auth.unlockInterval) clearInterval(window.Auth.unlockInterval);
                }
            },
            navigate: (vid, el, mob = false) => {
                document.body.classList.remove('in-chat-mode');
                if(vid === 'wheel' && document.getElementById('btn-nav-wheel')?.classList.contains('locked')) return Utils.toast("Tính năng đang bảo trì!", "warning");
                if(vid === 'tranhthuong' && document.getElementById('btn-nav-tranhthuong')?.classList.contains('locked')) return Utils.toast("Tính năng đang bảo trì!", "warning");
                if(vid === 'pointshop' && document.getElementById('btn-nav-pointshop')?.classList.contains('locked')) return Utils.toast("Cửa hàng hiện đang đóng cửa!", "warning");

                document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active')); const tgt = document.getElementById(`view-${vid}`); if(tgt) tgt.classList.add('active');
                if(el) {
                    document.querySelectorAll(mob ? '.m-nav-item' : '.nav-item').forEach(n => n.classList.remove('active')); el.classList.add('active');
                    if(mob) { const deq = document.querySelector(`.nav-item[onclick*="${vid}"]`); if(deq) { document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active')); deq.classList.add('active'); } } 
                    else { const meq = document.querySelector(`.m-nav-item[onclick*="${vid}"]`); if(meq) { document.querySelectorAll('.m-nav-item').forEach(n=>n.classList.remove('active')); meq.classList.add('active'); } }
                }

                const topNav = document.querySelector('.top-navbar');
                if (topNav) {
                    const hideOnViews = ['chat', 'attendance', 'news', 'tournament', 'wheel', 'tranhthuong', 'pointshop', 'rps'];
                    if (window.innerWidth <= 1023 && hideOnViews.includes(vid)) {
                        topNav.style.display = 'none';
                    } else {
                        topNav.style.display = 'flex';
                    }
                }

                if(vid === 'dashboard' && window.HomeVideo && window.HomeVideo.started) window.HomeVideo.play();
                if(vid === 'chat' && window.innerWidth <= 1023 && !State.chatTarget) window.Chat.toggleMobile(true);
            }
        };

        /** 5. AUTHENTICATION ENGINE */
        window.Auth = {
            pendingLockedId: null,
            pendingLockedData: null,
            unlockInterval: null,

            login: async () => {
                const u = document.getElementById('login-usr').value.trim(); const p = document.getElementById('login-pwd').value.trim(); const b = document.getElementById('btn-login');
                if(!u || !p) return Utils.toast("Bạn cần điền đầy đủ thông tin để hệ thống xác thực.", "warning");
                b.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> đang kết nối`; b.disabled = true;

                try {
                    // NHANH: đọc cấu hình nhiệm vụ song song với kiểm tra đăng nhập (trước đây đợi đăng nhập xong mới đọc)
                    const taskP = db.collection("settings").doc("task_config").get(); taskP.catch(() => {});
                    const introP = db.collection("settings").doc("intro_video").get().catch(() => null);
                    const snap = await db.collection("accounts").where("user", "==", u).where("pass", "==", p).get();
                    // Đang hiện POSTER GIỚI THIỆU (Admin bật) -> không cho đăng nhập mới, kể cả tự đăng nhập / ghi nhớ mật khẩu / lúc trang chưa kịp hiện poster.
                    // Chỉ Admin (vai trò admin) hoặc tab đã nhập mã "Admin vào test" mới vào được.
                    const iv = await introP; let bypass = false; try { bypass = sessionStorage.getItem('qd_intro_bypass') === '1'; } catch (e) {}
                    if (iv && iv.exists && iv.data().isEnabled === true && !bypass && !(!snap.empty && snap.docs[0].data().role === 'admin')) {
                        Utils.toast("🖼️ Hệ thống chưa mở cửa — đang hiện poster giới thiệu, tạm dừng đăng nhập. Vui lòng quay lại sau!", "warning");
                        b.innerHTML = `Đăng nhập <i class="fa-solid fa-arrow-right ml-2"></i>`; b.disabled = false;
                        try { window.QDIntro && window.QDIntro.on(); } catch (e) {}
                        return;
                    }
                    if(snap.empty) { 
                        Utils.toast("Dữ liệu thông tin đăng nhập không chính xác.", "error"); 
                        b.innerHTML = `Đăng nhập <i class="fa-solid fa-arrow-right ml-2"></i>`; 
                        b.disabled = false; 
                    }
                    else {
                        const docData = snap.docs[0].data();
                        
                        // Xử lý Ghi nhớ đăng nhập
                        const isRemember = document.getElementById('remember-me').checked;
                        if (isRemember) {
                            localStorage.setItem('qd_saved_usr', u);
                            localStorage.setItem('qd_saved_pwd', p);
                        } else {
                            localStorage.removeItem('qd_saved_usr');
                            localStorage.removeItem('qd_saved_pwd');
                        }
                        // App Android: nhớ đăng nhập để mở lại app / mở bong bóng chat là vào thẳng (đăng xuất / hết phiên thì phải nhập lại)
                        if (window.QDNative) { try { localStorage.setItem('qd_app_auth', JSON.stringify({ u: u, p: p, t: Date.now() })); } catch (e) {} }
                        
                        // Nếu tài khoản đang bị khóa
                        if(docData.isBlocked) { 
                            window.Auth.pendingLockedId = snap.docs[0].id;
                            window.Auth.pendingLockedData = docData;
                            
                            // Nếu đã bấm yêu cầu trước đó, tự động tiếp tục đếm ngược
                            if (docData.unlockRequestedAt) {
                                document.getElementById('unlock-action-area').style.display = 'none';
                                document.getElementById('unlock-countdown-area').style.display = 'block';
                                window.Auth.requestUnlock();
                            } else {
                                document.getElementById('unlock-action-area').style.display = 'block';
                                document.getElementById('unlock-countdown-area').style.display = 'none';
                            }
                            
                            window.UI.openModal('modal-account-locked');
                            
                            b.innerHTML = `Đăng nhập <i class="fa-solid fa-arrow-right ml-2"></i>`; 
                            b.disabled = false; 
                            return; 
                        }
                        
                        State.currentUser = docData.user; State.currentDocId = snap.docs[0].id; State.fullName = docData.fullName || docData.name || '';
                        localStorage.setItem('qd_current_username', State.currentUser); 
                        // Mở phiên dùng chung toàn hệ thống (mọi trang / mọi tab), hết phiên hoặc bị đá ra là thoát ở tất cả
                        if (window.QDSession) window.QDSession.start({ u: State.currentUser, id: State.currentDocId, role: docData.role || '', kickAt: docData.kickAt });
                        
                        let invCode = docData.inviteCode;
                        let updateAccData = {};
                        // Bot báo cáo: ghi lần đăng nhập gần nhất (ngày theo giờ Việt Nam, dạng YYYY-MM-DD)
                        updateAccData.lastLoginAt = Date.now();
                        updateAccData.lastLoginDate = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

                        if(!invCode) {
                            invCode = State.currentDocId.substring(0, 6).toUpperCase();
                            updateAccData.inviteCode = invCode;
                        }

                        // NHIỆM VỤ ĐĂNG NHẬP (LẦN ĐẦU / NGÀY): máy chủ kiểm tra ngày + cộng điểm (trang không tự cộng)
                        if (window.QDdb && window.QDdb.act) window.QDdb.act('task.login', {}).then(r => {
                            if (r && r.points > 0) setTimeout(() => Utils.toast(`🎁 Đăng nhập ngày mới: +${r.points} Điểm lì xì!`, "success"), 2500);
                        }).catch(e => console.warn('task.login', e));

                        if(Object.keys(updateAccData).length > 0) {
                            db.collection("accounts").doc(State.currentDocId).update(updateAccData);
                        }

                        Utils.safeText('my-invite-code', invCode);
                        
                        if(docData.hasUsedInvite) {
                            document.getElementById('invite-input-area').style.display = 'none';
                            document.getElementById('invite-success-area').style.display = 'block';
                            document.getElementById('invite-success-area').classList.remove('hidden');
                        } else {
                            document.getElementById('invite-input-area').style.display = 'block';
                            document.getElementById('invite-success-area').style.display = 'none';
                            document.getElementById('invite-success-area').classList.add('hidden');
                        }
                        State.hasUsedInvite = docData.hasUsedInvite || false;
                        State.inviteCode = invCode;
                        if (window.InviteUI) window.InviteUI.onAcc(docData);

                        Utils.safeText('sidebar-name', State.currentUser); Utils.safeText('dash-name', State.currentUser); Utils.safeText('profile-name-large', State.currentUser);
                        const initial = State.currentUser.charAt(0).toUpperCase();
                        Utils.safeText('sidebar-avt', initial); Utils.safeText('profile-avatar-large', initial);
                        if (window.Avatar) window.Avatar.apply(docData.avatar);
                        Utils.safeText('profile-uid', State.currentDocId.substring(0,10).toUpperCase());
                        
                        const roleText = document.getElementById('profile-role');
                        const adminBtn = document.getElementById('admin-access-btn');
                        const userRole = docData.role || (State.currentUser === 'admin' ? 'admin' : 'user');
                        
                        if(userRole === 'admin' || userRole === 'manager') {
                            if(roleText) {
                                roleText.innerText = userRole === 'admin' ? 'Quản trị viên' : 'Quản lý';
                                roleText.className = 'font-bold text-danger';
                            }
                            if(adminBtn) adminBtn.classList.remove('hidden');
                        } else {
                            if(roleText) {
                                roleText.innerText = 'Thành viên';
                                roleText.className = 'font-bold text-primary';
                            }
                            if(adminBtn) adminBtn.classList.add('hidden');
                        }
                        
                        document.getElementById('auth-gate').style.opacity = '0';
                        setTimeout(() => { document.getElementById('auth-gate').style.display = 'none'; document.getElementById('app-shell').style.display = 'flex'; if(window.HomeVideo) window.HomeVideo.start(); if(window.Music) window.Music.autoStart(); if(window.LiXi) window.LiXi.start(); if(window.WheelTab) window.WheelTab.start(); if(window.RxTab) window.RxTab.start(); if(window.LnTab) window.LnTab.start(); Auth.ping(); window.AppCore.init(); window.Chat.init(); window.SessionManager.resetTimer(); Utils.toast(`Xác thực an toàn. Chào mừng ${State.currentUser}!`, "success"); }, 500);
                    }
                } catch(e) { 
                    if (!(e && e.qdMsg)) console.error("Login Error:", e);
                    if (e && e.qdMsg) { try { localStorage.removeItem('qd_app_auth'); } catch (x) {} Utils.toast(e.qdMsg, "error"); }   // bị chặn vì thiết bị (chống gian lận)
                    else Utils.toast(`Lỗi Máy Chủ: Request Timeout.`, "error"); 
                    b.innerHTML = `Đăng nhập <i class="fa-solid fa-arrow-right ml-2"></i>`; b.disabled = false; 
                }
            },

            requestUnlock: async () => {
                if(!window.Auth.pendingLockedId) return;
                
                const btnArea = document.getElementById('unlock-action-area');
                const timerArea = document.getElementById('unlock-countdown-area');
                const timerDisplay = document.getElementById('unlock-timer');
                
                btnArea.style.display = 'none';
                timerArea.style.display = 'block';
                timerDisplay.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

                try {
                    // NHANH: đọc cấu hình và tài khoản cùng lúc
                    const userRef = db.collection("accounts").doc(window.Auth.pendingLockedId);
                    const userP = userRef.get(); userP.catch(() => {});
                    // Khóa do hệ thống chống gian lận (Admin > Chống gian lận): không tự mở, phải liên hệ Ban Quản Trị
                    const pre = await userP;
                    if (pre.exists && pre.data().lockReason === 'security') {
                        timerDisplay.innerHTML = `<span class="text-danger" style="font-size:16px;line-height:1.5;display:block;">🛡️ Tài khoản đang được Ban Quản Trị kiểm tra (nghi vấn gian lận).${pre.data().lockNote ? '<br><small style="font-size:13.5px;opacity:.9">Lý do: ' + String(pre.data().lockNote).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]) + '</small>' : ''}<br>Vui lòng liên hệ Ban Quản Trị để được mở khóa.</span>`;
                        return;
                    }
                    const configDoc = await db.collection("settings").doc("account_config").get();
                    let autoUnlockMinutes = 0;
                    if(configDoc.exists && configDoc.data().autoUnlockMinutes !== undefined) {
                        autoUnlockMinutes = parseInt(configDoc.data().autoUnlockMinutes);
                    }
                    
                    if(autoUnlockMinutes <= 0) {
                        timerDisplay.innerHTML = `<span class="text-danger" style="font-size:18px;">Tính năng tự mở đã bị tắt bởi Ban Quản Trị!</span>`;
                        return;
                    }

                    // Lưu mốc thời gian bắt đầu bấm nút yêu cầu
                    const userDoc = await userP;
                    const userData = userDoc.data();

                    // Máy chủ ghi mốc bấm yêu cầu (thành viên không tự sửa được mốc này để mở khóa sớm)
                    let requestedAt = userData.unlockRequestedAt;
                    try { const rq = await window.QDdb.act('acc.unlockReq', {}); if (rq && rq.requestedAt) requestedAt = rq.requestedAt; }
                    catch (e) { console.warn('acc.unlockReq', e); if (!requestedAt) { timerDisplay.innerHTML = `<span class="text-danger" style="font-size:16px;">Không gửi được yêu cầu mở khóa, vui lòng thử lại.</span>`; return; } }

                    const targetTime = requestedAt + (autoUnlockMinutes * 60 * 1000);

                    if(window.Auth.unlockInterval) clearInterval(window.Auth.unlockInterval);

                    window.Auth.unlockInterval = setInterval(() => {
                        const now = Date.now();
                        const diff = targetTime - now;

                        if(diff <= 0) {
                            clearInterval(window.Auth.unlockInterval);
                            timerDisplay.innerHTML = `<span class="text-success">ĐANG XỬ LÝ MỞ KHÓA...</span>`;
                            
                            window.QDdb.act('acc.unlock', {}).then(() => {   // máy chủ kiểm tra đủ thời gian chờ rồi mới mở khóa
                                window.Utils.toast("Tài khoản đã được mở khóa. Đang tự động đăng nhập...", "success");
                                setTimeout(() => {
                                    window.UI.closeModal('modal-account-locked');
                                    window.Auth.login();
                                }, 1500);
                            }).catch(e => { console.warn('acc.unlock', e); timerDisplay.innerHTML = `<span class="text-danger" style="font-size:16px;">Chưa mở khóa được, vui lòng bấm lại sau ít phút.</span>`; });
                        } else {
                            const h = Math.floor(diff / (1000 * 60 * 60));
                            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                            const s = Math.floor((diff % (1000 * 60)) / 1000);
                            timerDisplay.innerText = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
                        }
                    }, 1000);

                } catch(e) {
                    console.error(e);
                    window.Utils.toast("Lỗi khi lấy cấu hình mở khóa", "error");
                }
            },

            // Đăng xuất: kết thúc phiên ở MỌI trang / tab đang mở (Vòng Quay, Rút Lì Xì, Ném Còn...) + báo offline ngay
            logout: () => { 
                if(State.heartbeatInterval) clearInterval(State.heartbeatInterval); 
                const docId = State.currentDocId;
                if (window.QDSession) window.QDSession.end('logout', true);
                else { try { localStorage.removeItem('qd_current_username'); } catch (e) {} }
                try { localStorage.removeItem('qd_app_auth'); } catch (e) {}
                if(docId) { 
                    const offUpd = { lastActive: Date.now(), online: false };
                    db.collection("accounts").doc(docId).update(offUpd).catch(() => {}).finally(()=>{ var lo = window.QDdb && QDdb.logout ? QDdb.logout() : null; Promise.resolve(lo).catch(function(){}).then(function(){ window.location.reload(); }); }); 
                } else {
                    try { if (window.QDdb && QDdb.logout) QDdb.logout(); } catch (e) {}
                    setTimeout(function () { window.location.reload(); }, 150);
                }
            },
            // Báo "đang hoạt động": khối QD Session tự gửi (45 giây / lần khi đang mở trang và có thao tác); bản dự phòng nếu thiếu khối
            ping: () => {
                if (window.QDSession) { window.QDSession.ping(); return; }
                const p = () => { if(State.currentDocId) db.collection("accounts").doc(State.currentDocId).update({lastActive: Date.now()}); }; p(); State.heartbeatInterval = setInterval(p, 60000);
            }
        };

        /** 5.5 SESSION MANAGEMENT (TỰ ĐỘNG ĐĂNG XUẤT)
            Nay do khối QD Session đảm nhận cho CẢ HỆ THỐNG: thời gian lấy theo Admin > Quản trị tài khoản > "Hết phiên đăng nhập",
            thao tác ở bất kỳ trang / tab nào cũng giữ phiên, hết phiên là mọi trang đang mở đều thoát. Phần dưới chỉ là dự phòng khi thiếu khối. */
        window.SessionManager = {
            timeoutLimit: 21600000, // 6 hours (6 * 60 * 60 * 1000)
            timer: null,
            init: () => {
                if (window.QDSession) return;
                ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'].forEach(evt => {
                    document.addEventListener(evt, window.SessionManager.resetTimer, true);
                });
            },
            resetTimer: () => {
                if (window.QDSession) { window.QDSession.touch(); return; }
                if (window.State && window.State.currentDocId) {
                    clearTimeout(window.SessionManager.timer);
                    window.SessionManager.timer = setTimeout(() => {
                        window.Utils.toast("Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại!", "warning");
                        setTimeout(() => { window.Auth.logout(); }, 2000);
                    }, window.SessionManager.timeoutLimit);
                }
            }
        };

        /** 6. PRIVATE CHAT MODULE WITH HEART, UNREAD BADGES & GENERAL CHANNEL */
        window.Chat = {
            showNotification: (title, body, roomId, from) => {
                if (window.Notif && !window.Notif.enabled()) return;

                try {
                    // App Android có quyền thông báo: thông báo của app tự kêu tiếng tin nhắn -> trang không kêu thêm (trước đây kêu 2 lần chồng nhau)
                    const appSound = !!(window.QDAppNotif && window.Notification && Notification.permission === 'granted');
                    if (appSound) {}
                    else if (window.QDMention && window.QDMention.ding) window.QDMention.ding(false);
                    else if (window.Sound.msgAudio) {
                        window.Sound.msgAudio.currentTime = 0;
                        window.Sound.msgAudio.play().catch(e => console.log('Autoplay blocked'));
                    }
                } catch(e) {}

                if (window.Notif) window.Notif.show(title, body, roomId, from);
            },
            // Bấm vào thông báo -> mở đúng phòng chat
            openFromNotif: (roomId) => {
                try { window.focus(); } catch (e) {}
                if (!roomId || !State.currentUser) return;
                window.UI.navigate('chat');
                if (roomId === 'general_room') window.Chat.selectTarget('general');
                else if (roomId.indexOf('_') > 0) {
                    const users = roomId.split('_');
                    const target = users[0] === State.currentUser ? users[1] : users[0];
                    if (target) window.Chat.selectTarget(target);
                }
            },
            init: () => {
                // Đăng ký Service Worker + xin quyền thông báo (nếu người dùng đang để Bật)
                if (window.Notif) window.Notif.boot();

                State.appStartTime = Date.now();

                db.collection("accounts").onSnapshot(snap => {
                    const ls = document.getElementById('contact-list-ui'); if(!ls) return; 
                    State.usersCache = {}; 
                    
                    if (!document.getElementById('contact-general')) {
                        const isGeneralAct = State.chatTarget === 'general' ? 'active' : '';
                        ls.insertAdjacentHTML('afterbegin', `
                            <div id="contact-general" class="contact-card ${isGeneralAct}" data-key="kênh chung" onclick="window.Chat.selectTarget('general')">
                                <div class="avatar-circle" style="background: var(--color-info); font-size: 18px;"><i class="fa-solid fa-users"></i></div>
                                <div class="flex-col flex-1 overflow-hidden">
                                    <div class="qd-ct-top font-bold text-main text-lg"><span class="qd-ct-nm qd-kc">Kênh Chung</span><span id="general-unread-badge" class="qd-ct-badge"></span></div>
                                    <div class="qd-ct-sub text-sm font-semibold text-muted">Trò chuyện toàn Server</div>
                                    <div class="qd-ct-prev text-main" id="general-prev"></div>
                                </div>
                            </div>
                        `);
                    }
                    // Nhãn nhóm: Ban quản lý (ngay dưới Kênh Chung) và Thành viên
                    if (!document.getElementById('qd-ct-head-staff')) {
                        ls.insertAdjacentHTML('beforeend', `<div class="qd-ct-head" id="qd-ct-head-staff"><i class="fa-solid fa-shield-halved"></i> Ban quản lý</div><div class="qd-ct-head" id="qd-ct-head-mem"><i class="fa-solid fa-user-group"></i> Thành viên</div>`);
                    }

                    const skeleton = ls.querySelector('.skeleton');
                    if (skeleton) skeleton.closest('.contact-card').remove();

                    // Bộ nhớ trạng thái của mọi người (dùng cho đầu khung chat, gợi ý người nhận...)
                    State.presence = {};
                    // @nhắc tên: họ tên + nhóm quyền của mọi tài khoản
                    const qdAcc = {};
                    snap.docs.forEach(doc => { const d = doc.data(); if (d && d.user) qdAcc[d.user] = { fullName: d.fullName || d.name || '', role: d.role || (d.user === 'admin' ? 'admin' : 'user'), blocked: d.isBlocked === true }; });
                    State.accInfo = qdAcc; if (window.QDStaff) window.QDStaff.paint();
                    snap.docs.forEach(doc => {
                        const d = doc.data(); if (!d || d.user === State.currentUser) return;
                        State.usersCache[d.user] = d.lastActive; State.presence[d.user] = { lastActive: d.lastActive, online: d.online };
                        (State.avatars = State.avatars || {})[d.user] = d.avatar || null;
                    });

                    // Chỉ vẽ lại (và đếm lại tin chưa đọc) cho tài khoản vừa thay đổi, thay vì cả danh sách mỗi lần có người báo online
                    // Số tin chưa đọc lấy từ 1 bộ nghe trực tiếp chung (bên dưới), nên vẽ thẻ ngay, không phải chờ đếm từng người
                    snap.docChanges().forEach(change => {
                        const doc = change.doc, d = doc.data(); if (!d || !d.user || d.user === State.currentUser) return;
                        if (change.type === 'removed') { const old = document.getElementById(`contact-${d.user}`); if (old) old.remove(); return; }
                        window.Chat.renderCard(d);
                    });
                    window.Chat.sortContacts();
                    if(State.chatTarget) window.Chat.updateHeader();
                });

                db.collection("private_chat").where("conversationId", "==", "general_room").onSnapshot(snap => {
                    let unreadCount = 0, unreadAt = 0;
                    const QM = window.QDMention;
                    snap.forEach(doc => {
                        const data = doc.data();
                        if (data.from !== State.currentUser) {
                            const readList = data.readBy || [];
                            if (!readList.includes(State.currentUser)) { unreadCount++; if (QM && QM.forMe(data)) unreadAt++; }
                        }
                    });
                    if (State.chatTarget === 'general') { unreadCount = 0; unreadAt = 0; }   // đang mở Kênh Chung: tin sắp được đánh dấu đã xem
                    const badgeEl = document.getElementById('general-unread-badge');
                    if(badgeEl) badgeEl.innerHTML = (unreadAt > 0 ? `<span class="qd-at-badge" title="${unreadAt} tin nhắn nhắc đến bạn">@</span>` : '') + (unreadCount > 0 ? `<span class="unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` : '');
                    // Kiểu Zalo / Messenger: in đậm + hiện tin chưa đọc mới nhất ngay dưới tên
                    const gCard = document.getElementById('contact-general'), gPrev = document.getElementById('general-prev');
                    if (gCard) gCard.classList.toggle('has-unread', unreadCount > 0);
                    if (gPrev) {
                        let lastU = null;
                        if (unreadCount > 0) snap.forEach(doc => { const x = doc.data(); if (x.from !== State.currentUser && !(x.readBy || []).includes(State.currentUser) && (!lastU || (x.time || 0) > (lastU.time || 0))) lastU = x; });
                        gPrev.textContent = lastU ? `${QM && QM.sender ? QM.sender(lastU) : (State.nicknames[lastU.from] || lastU.from)}: ${window.Chat.previewText(lastU)}` : '';
                    }

                    snap.docChanges().forEach(change => {
                        if (change.type === 'added') {
                            const data = change.doc.data();
                            if (data.from !== State.currentUser && data.time > State.appStartTime) {
                                const forMe = !!(QM && QM.forMe(data)), who = QM ? QM.sender(data) : data.from;
                                const body = String(data.text || "Gửi một ảnh đính kèm").slice(0, 180);
                                const notifOn = !window.Notif || window.Notif.enabled(), away = State.chatTarget !== 'general' || document.hidden;
                                if (data.bot) {   // Tin Bot báo cáo: luôn có chuông riêng (kể cả đang mở Kênh Chung)
                                    // Cùng tiêu đề + nội dung với máy chủ (srv-9) -> app chỉ hiện 1 thông báo dù cả trang web lẫn máy chủ cùng báo
                                    const bn = String(data.botName || 'Bot báo cáo').trim().slice(0, 40) || 'Bot báo cáo';
                                    let bb = String(data.text || '').split('\n').map(l => l.replace(/\*\*|__/g, '').trim()).filter(l => l && !/^[─━—=\-_·.\s]+$/.test(l) && !/^(@\S+[\s,]*)+$/.test(l)).slice(0, 6).join('\n') || 'Có báo cáo mới trong Kênh Chung';
                                    if (bb.length > 400) bb = bb.slice(0, 399) + '…';
                                    const allTag = Array.isArray(data.mentions) && data.mentions.includes('all');
                                    if (notifOn) { if (QM) QM.ding(true); if (away && window.Notif) window.Notif.show(forMe && !allTag ? `📣 ${bn} nhắc đến bạn trong Kênh Chung` : (allTag ? '📣 ' : '📊 ') + bn, bb, "general_room"); }
                                }
                                else if (State.chatTarget !== 'general' || document.hidden) window.Chat.showNotification(forMe ? `📣 ${who} nhắc đến bạn trong Kênh Chung` : "Kênh Chung", forMe ? body : `${who}: ${body}`, "general_room", data.from);
                                else if (forMe && notifOn) { if (QM) QM.ding(false); if (document.hidden && window.Notif) window.Notif.show(`📣 ${who} nhắc đến bạn trong Kênh Chung`, body, "general_room"); }
                            }
                        }
                    });
                });

                db.collection("private_chat").where("to", "==", State.currentUser).onSnapshot(snap => {
                    // Đếm trực tiếp tin riêng chưa đọc theo từng người gửi (tự cập nhật khi có tin mới / khi đã đọc)
                    const ub = {}, last = {};
                    snap.forEach(doc => {
                        const m = doc.data(); if (!m || !m.from || m.from === State.currentUser || m.conversationId === 'general_room') return;
                        const t = +m.time || 0; if (t > (last[m.from] || 0)) last[m.from] = t;
                        if (m.read || m.revoked) return;
                        const o = ub[m.from] || (ub[m.from] = { n: 0, at: 0, text: '' });
                        o.n++; if (t >= o.at) { o.at = t; o.text = window.Chat.previewText(m); }
                    });
                    State.unreadBy = ub; State.lastFrom = last;
                    document.querySelectorAll('#contact-list-ui .contact-card[data-u]').forEach(c => window.Chat.paintBadge(c.getAttribute('data-u')));
                    window.Chat.sortContacts();

                    snap.docChanges().forEach(change => {
                        if (change.type === 'added') {
                            const data = change.doc.data();
                            if (data.from !== State.currentUser && data.time > State.appStartTime && State.chatTarget !== data.from) {
                                const dN = State.nicknames[data.from] || data.from;
                                window.Chat.showNotification(`Tin nhắn từ ${dN}`, data.text || "Đã gửi một ảnh đính kèm", data.conversationId, data.from);
                            }
                        }
                    });
                });

                setInterval(() => { if(State.chatTarget) window.Chat.updateHeader(); }, 30000);
            },
            
            // Nội dung xem trước 1 tin nhắn (dòng dưới tên trong danh bạ)
            previewText: (m) => {
                if (!m) return '';
                if (m.revoked) return 'Tin nhắn đã bị thu hồi';
                const t = String(m.text || '').replace(/\s+/g, ' ').trim();
                return t ? t.slice(0, 90) : (m.imageUrl ? '🖼️ Đã gửi một ảnh' : 'Tin nhắn mới');
            },
            // Vẽ (hoặc vẽ lại) thẻ 1 tài khoản trong danh bạ
            renderCard: (d) => {
                const ls = document.getElementById('contact-list-ui'); if (!ls || !d || !d.user) return;
                const u = d.user, isOn = Utils.isOnline(d.lastActive, d.online), dN = State.nicknames[u] || u;
                let card = document.getElementById(`contact-${u}`);
                if (!card) {
                    card = document.createElement('div');
                    card.id = `contact-${u}`;
                    card.onclick = () => window.Chat.selectTarget(u);
                    ls.appendChild(card);
                }
                card.className = 'contact-card' + (State.chatTarget === u ? ' active' : '');
                card.setAttribute('data-key', dN.toLowerCase());
                card.setAttribute('data-u', u);
                const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                card.innerHTML = `<div class="avatar-circle" style="position:relative;">${window.Avatar ? window.Avatar.inner(d.avatar, dN) : esc(dN.charAt(0).toUpperCase())}<div class="status-indicator ${isOn?'online':'offline'}"${Utils.liveAgo(d.lastActive, d.online, { fmt: 'none', on: 'online', off: 'offline' })}></div></div><div class="flex-col flex-1 overflow-hidden"><div class="qd-ct-top font-bold text-main text-lg">${window.QDStaff ? window.QDStaff.name(u, dN) : `<span class="qd-ct-nm">${esc(dN)}</span>`}<span class="qd-ct-badge"></span></div><div class="qd-ct-sub text-sm font-semibold ${isOn?'text-success':'text-muted'}"${Utils.liveAgo(d.lastActive, d.online, { on: 'text-success', off: 'text-muted' })}>${Utils.timeAgo(d.lastActive, d.online)}</div><div class="qd-ct-prev text-main"></div></div>`;
                window.Chat.paintBadge(u);
            },
            // Nút đỏ nhỏ đếm tin chưa đọc + in đậm tin mới nhất (kiểu Zalo / Messenger)
            paintBadge: (u) => {
                const card = document.getElementById(`contact-${u}`); if (!card) return;
                const info = (State.unreadBy || {})[u], n = info && State.chatTarget !== u ? info.n : 0;
                card.classList.toggle('has-unread', n > 0);
                const b = card.querySelector('.qd-ct-badge');
                if (b) b.innerHTML = n > 0 ? `<span class="unread-badge" title="${n} tin nhắn chưa đọc">${n > 99 ? '99+' : n}</span>` : '';
                const p = card.querySelector('.qd-ct-prev');
                if (p) p.textContent = n > 0 ? info.text : '';
            },
            // Thứ tự danh bạ: Kênh Chung -> Ban quản lý (admin / quản lý) -> Thành viên.
            // Trong mỗi nhóm: có tin chưa đọc lên đầu (mới nhất trước), rồi người nhắn gần đây, rồi theo tên.
            sortContacts: () => {
                const ls = document.getElementById('contact-list-ui'); if (!ls) return;
                const ub = State.unreadBy || {}, last = State.lastFrom || {}, acc = State.accInfo || {};
                const isStaff = u => window.QDStaff ? window.QDStaff.is(u) : (u === 'admin' || ['admin', 'manager'].includes((acc[u] || {}).role));
                const rank = u => u === 'admin' || (acc[u] || {}).role === 'admin' ? 0 : 1;
                const unr = u => (ub[u] && State.chatTarget !== u) ? ub[u].at : 0;
                const cmp = (a, b) => {
                    const x = a.getAttribute('data-u'), y = b.getAttribute('data-u');
                    return (unr(y) - unr(x)) || ((last[y] || 0) - (last[x] || 0)) || (rank(x) - rank(y)) || a.getAttribute('data-key').localeCompare(b.getAttribute('data-key'), 'vi');
                };
                const cards = Array.from(ls.querySelectorAll(':scope > .contact-card[data-u]'));
                const staff = cards.filter(c => isStaff(c.getAttribute('data-u'))).sort(cmp);
                const mem = cards.filter(c => !isStaff(c.getAttribute('data-u'))).sort(cmp);
                const hS = document.getElementById('qd-ct-head-staff'), hM = document.getElementById('qd-ct-head-mem');
                if (hS) hS.hidden = !staff.length;
                if (hM) hM.hidden = !mem.length;
                const want = [document.getElementById('contact-general'), hS, ...staff, hM, ...mem].filter(Boolean);
                const now = Array.from(ls.children).filter(el => want.includes(el));
                if (now.length === want.length && now.every((el, i) => el === want[i])) return;   // đã đúng thứ tự: không đụng DOM
                want.forEach(el => ls.appendChild(el));
            },
            filterContacts: () => {
                const v = document.getElementById('inp-search-contact').value.toLowerCase();
                document.querySelectorAll('#contact-list-ui .contact-card').forEach(c => { c.style.display = (c.getAttribute('data-key') || '').includes(v) ? 'flex' : 'none'; });
                document.querySelectorAll('#contact-list-ui .qd-ct-head').forEach(h => { h.style.display = v ? 'none' : ''; });
            },
            
            selectTarget: (u) => {
                State.chatTarget = u; document.querySelectorAll('.contact-card').forEach(el => el.classList.remove('active'));
                
                const cardId = u === 'general' ? 'contact-general' : `contact-${u}`;
                const card = document.getElementById(cardId);
                if (card) {
                    card.classList.add('active');
                    // Xóa ngay lập tức badge chưa đọc khi click vào tin nhắn
                    const badge = card.querySelector('.unread-badge');
                    if (badge) badge.remove();
                    card.classList.remove('has-unread');
                }
                
                const emp = document.getElementById('chat-empty-ui'); const act = document.getElementById('chat-active-ui');
                if(emp && act) { emp.style.display = 'none'; act.style.display = 'flex'; }
                if(window.innerWidth <= 1023) window.Chat.toggleMobile(false); 
                window.Chat.updateHeader(); window.Chat.load();
            },
            
            updateHeader: () => {
                if(!State.chatTarget) return; 
                
                if(State.chatTarget === 'general') {
                    Utils.safeText('active-name', 'Kênh Chung (Toàn Server)'); if (window.QDStaff) window.QDStaff.header(); 
                    const avt = document.getElementById('active-avt');
                    if(avt) { avt.innerHTML = '<i class="fa-solid fa-users"></i>'; avt.style.background = 'var(--color-info)'; }
                    const st = document.getElementById('active-status'); if(st) { ['data-qd-t', 'data-qd-o', 'data-qd-fmt', 'data-qd-on', 'data-qd-off'].forEach(a => st.removeAttribute(a)); st.innerText = 'Tất cả thành viên đều có mặt'; st.className = "text-xs text-info font-bold"; }
                    return;
                }
                
                const dN = State.nicknames[State.chatTarget] || State.chatTarget; const pr = (State.presence || {})[State.chatTarget] || { lastActive: State.usersCache[State.chatTarget] }; const lP = pr.lastActive; const isOn = Utils.isOnline(lP, pr.online);
                Utils.safeText('active-name', dN); if (window.QDStaff) window.QDStaff.header(); 
                const avt = document.getElementById('active-avt');
                if(avt) { avt.innerHTML = window.Avatar ? window.Avatar.inner((State.avatars || {})[State.chatTarget], dN) : dN.charAt(0).toUpperCase(); avt.style.background = ''; }
                const st = document.getElementById('active-status'); if(st) {
                    st.innerText = Utils.timeAgo(lP, pr.online); st.className = isOn ? "text-xs text-success font-bold" : "text-xs text-muted font-bold";
                    // "Hoạt động x phút trước" tự chạy theo thời gian thực
                    st.setAttribute('data-qd-t', lP || 0); st.setAttribute('data-qd-o', pr.online === false ? '0' : '1'); st.setAttribute('data-qd-fmt', 'full');
                    st.setAttribute('data-qd-on', 'text-success'); st.setAttribute('data-qd-off', 'text-muted');
                }
            },
            
            testNotification: async () => {
                const N = window.Notif, btn = document.getElementById('notif-test-btn');
                if (!N) return;
                const r = await N.ensure(true);   // tự bật + xin quyền nếu cần
                if (!r.ok) return;
                window.Utils.toast("Sẽ gửi thông báo sau 5 giây! Hãy ẩn trình duyệt xuống màn hình chính ngay lúc này.", "info");
                if (btn) btn.disabled = true;
                const T = "🔔 Hệ Thống QD Elite", B = "Đây là thông báo thử nghiệm! Nếu bạn thấy dòng này thì hệ thống hoạt động 100%.";
                // Service Worker tự hẹn giờ: điện thoại đóng băng trang khi ẩn xuống vẫn hiện được thông báo
                const viaSW = await N.showLater(T, B, "general_room", 5000).catch(() => false);
                let left = 5;
                const tick = () => {
                    if (btn) btn.textContent = left > 0 ? `Đang gửi (${left}s)` : 'Test (5s)';
                    if (left-- > 0) return setTimeout(tick, 1000);
                    if (btn) btn.disabled = false;
                    if (!viaSW) return window.Chat.showNotification(T, B, "general_room");
                    try { if (!document.hidden && window.Sound.msgAudio) { window.Sound.msgAudio.currentTime = 0; window.Sound.msgAudio.play().catch(() => {}); } } catch (e) {}
                };
                tick();
            },
            openNicknameEditor: () => { 
                if(State.chatTarget === 'general') return Utils.toast("Không thể đổi biệt danh cho Kênh Chung.", "info");
                if(window.QDStaff && window.QDStaff.is(State.chatTarget)) return Utils.toast("Không thể đổi biệt danh cho tài khoản Quản trị / Quản lý. Chỉ đổi được biệt danh của thành viên.", "info");
                const inp = document.getElementById('inp-nickname'); if(inp) inp.value = State.nicknames[State.chatTarget] || ''; window.UI.openModal('modal-nickname'); 
            },
            
            saveNickname: () => { if (State.chatTarget === 'general' || (window.QDStaff && window.QDStaff.is(State.chatTarget))) { window.UI.closeModal('modal-nickname'); return Utils.toast("Không thể đổi biệt danh cho tài khoản Quản trị / Quản lý.", "info"); } const v = document.getElementById('inp-nickname').value.trim(); if(v) State.nicknames[State.chatTarget] = v; else delete State.nicknames[State.chatTarget]; localStorage.setItem('qd_elite_nicks', JSON.stringify(State.nicknames)); window.UI.closeModal('modal-nickname'); window.Chat.updateHeader(); window.Chat.init(); Utils.toast("Cập nhật biệt danh hiển thị thành công.", "success"); },
            
            toggleMobile: (showSidebar) => { 
                const s = document.getElementById('chat-sidebar'); const m = document.querySelector('.chat-main'); 
                if(!s || !m) return; 
                // Máy tính + máy tính bảng dọc (bản 23): danh bạ và khung chat hiện song song (2 cột)
                if(window.QDChat2Pane ? window.QDChat2Pane() : window.innerWidth > 1023) { document.body.classList.remove('in-chat-mode'); document.body.style.height = ''; s.style.display = 'flex'; m.style.display = 'flex'; return; }
                if(showSidebar) { 
                    document.body.classList.remove('in-chat-mode');
                    s.style.display = 'flex'; m.style.display = 'none'; 
                    document.querySelectorAll('.contact-card').forEach(el => el.classList.remove('active'));
                    document.getElementById('chat-active-ui').style.display = 'none';
                    document.getElementById('chat-empty-ui').style.display = 'flex';
                    State.chatTarget = null;
                    document.body.style.height = '';
                } else { 
                    document.body.classList.add('in-chat-mode');
                    s.style.display = 'none'; m.style.display = 'flex'; 
                    if (window.visualViewport) {
                        const handleViewportResize = () => {
                            if (document.body.classList.contains('in-chat-mode')) {
                                const currentHeight = window.visualViewport.height;
                                document.body.style.height = `${currentHeight}px`;
                                const box = document.getElementById('chat-history-ui');
                                if(box && box.__qdStick !== false) { setTimeout(() => window.Chat.toBottom(box), 150); }
                            }
                        };
                        window.__qdVVfn = handleViewportResize;
                        if (!window.__qdVV) {   // chỉ đăng ký 1 lần (trước đây mỗi lần mở chat lại thêm 1 cặp listener)
                            window.__qdVV = true; let qdVVp = 0;
                            const qdVV = () => { if (qdVVp) return; qdVVp = requestAnimationFrame(() => { qdVVp = 0; window.__qdVVfn(); }); };
                            window.visualViewport.addEventListener('resize', qdVV);
                            window.visualViewport.addEventListener('scroll', qdVV);
                        }
                        handleViewportResize();
                    }
                } 
            },

            // Thả / bỏ tim của CHÍNH MÌNH (mỗi người 1 tim, lưu tên trong mảng hearts)
            toggleHeart: (msgId) => {
                const m = (State.chatMsgs || {})[msgId]; if (!m || m.revoked || !State.currentUser) return;
                const FV = firebase.firestore.FieldValue, mine = (m.hearts || []).includes(State.currentUser);
                const upd = { hearts: mine ? FV.arrayRemove(State.currentUser) : FV.arrayUnion(State.currentUser) };
                if (!mine) upd['heartAt.' + State.currentUser] = Date.now();
                if (m.heart === true) upd.heart = false;   // bỏ kiểu tim cũ (1 tim chung) khi chuyển sang tim từng người
                State.heartPop = mine ? null : msgId;
                db.collection("private_chat").doc(msgId).update(upd).catch(e => { console.log("Lỗi thả tim:", e); Utils.toast("Không thả tim được, thử lại nhé.", "error"); });
            },
            // Danh sách người đã thả tim / đã xem 1 tin nhắn
            heartList: (m) => {
                const l = (m.hearts || []).slice();
                if (!l.length && m.heart === true) l.push(null);   // tim kiểu cũ: không rõ ai
                return l;
            },
            seenList: (m) => {
                if (m.conversationId === 'general_room') return (m.readBy || []).filter(u => u && u !== m.from);
                return m.read ? [m.to] : [];
            },
            showInfo: (msgId, tab) => {
                const m = (State.chatMsgs || {})[msgId]; if (!m) return;
                State.infoMsgId = msgId;
                const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
                document.getElementById('mi-preview').innerHTML = m.revoked ? '<i>Tin nhắn đã bị thu hồi</i>' : (m.text ? esc(m.text).replace(/\n/g, '<br>') : '🖼️ Ảnh đính kèm');
                window.Chat.infoTab(tab || 'heart');
                window.UI.openModal('modal-msg-info');
            },
            infoTab: (tab) => {
                const m = (State.chatMsgs || {})[State.infoMsgId]; if (!m) return;
                const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
                const fmt = t => t ? new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';
                const hearts = window.Chat.heartList(m), seen = window.Chat.seenList(m);
                document.getElementById('mi-n-heart').textContent = hearts.length;
                document.getElementById('mi-n-seen').textContent = seen.length;
                document.getElementById('mi-tab-heart').classList.toggle('active', tab === 'heart');
                document.getElementById('mi-tab-seen').classList.toggle('active', tab === 'seen');
                const row = (u, when, icon) => {
                    const name = u ? (u === State.currentUser ? 'Bạn' : (State.nicknames[u] || u)) : 'Ai đó (dữ liệu cũ)';
                    return `<div class="mi-item"><div class="avatar-circle">${esc((u || '?').charAt(0).toUpperCase())}</div><div class="mi-name">${esc(name)}</div><div class="mi-when">${icon} ${esc(when)}</div></div>`;
                };
                let html;
                if (tab === 'heart') html = hearts.length ? hearts.map(u => row(u, fmt((m.heartAt || {})[u]), '❤️')).join('') : '<div class="mi-empty">Chưa có ai thả tim tin nhắn này.</div>';
                else html = seen.length ? seen.map(u => row(u, fmt(m.conversationId === 'general_room' ? (m.readAt || {})[u] : m.readTime), '👁')).join('') : '<div class="mi-empty">Chưa có ai xem tin nhắn này.</div>';
                document.getElementById('mi-list').innerHTML = html;
            },

            // Đặt vị trí cuộn tức thì (tắt tạm cuộn mượt), mặc định là đáy = tin mới nhất
            toBottom: (box, top) => {
                if (!box) return;
                const sb = box.style.scrollBehavior; box.style.scrollBehavior = 'auto';
                box.scrollTop = top == null ? box.scrollHeight : top;
                box.style.scrollBehavior = sb;
            },

            load: () => {
                if(State.chatListener) State.chatListener(); const box = document.getElementById('chat-history-ui'); if(!box) return;
                box.innerHTML = `<div class="text-center text-primary mt-10 text-3xl"><i class="fa-solid fa-spinner fa-spin"></i></div>`; box.__qdHtml = null;
                
                const roomId = State.chatTarget === 'general' ? 'general_room' : Utils.getRoomId(State.currentUser, State.chatTarget);
                // Chống giật trên điện thoại: chỉ vẽ 60 tin gần nhất (bấm "Xem tin nhắn cũ hơn" để thêm), gom nhiều lần cập nhật
                // dồn dập thành 1 lần vẽ mỗi khung hình, và đánh dấu "đã xem" bằng 1 lệnh ghi gộp thay vì từng tin một
                const loadSeq = State.chatLoadSeq = (State.chatLoadSeq || 0) + 1, loadTarget = State.chatTarget;
                State.chatShowN = 60; State.chatPrevTotal = 0; State.chatLastSnap = null; State.chatReadPending = new Set();
                let qdLatest = null, qdSent = false, qdRaf = 0;
                const qdFrame = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : (f => setTimeout(f, 16));
                const qdFlush = () => { qdRaf = 0; if (loadSeq !== State.chatLoadSeq || !qdLatest) return; const sn = qdLatest, se = qdSent; qdLatest = null; qdSent = false; paint(sn, se, false); };
                State.chatRepaint = () => { if (loadSeq === State.chatLoadSeq && State.chatLastSnap) paint(State.chatLastSnap, false, true); };
                
                State.chatFirstPaint = true; State.chatOpenAt = Date.now(); box.__qdStick = true;
                // Bám đáy: người dùng tự kéo lên xem tin cũ thì thôi bám; ảnh tải xong khi đang bám đáy thì giữ nguyên ở tin mới nhất
                if (!box.__qdStickInit) {
                    box.__qdStickInit = true;
                    box.addEventListener('scroll', () => { box.__qdStick = box.scrollHeight - box.scrollTop - box.clientHeight < 140; }, { passive: true });
                    box.addEventListener('load', (e) => { if (e.target && e.target.tagName === 'IMG' && box.__qdStick) window.Chat.toBottom(box); }, true);
                }
                State.chatListener = db.collection("private_chat").where("conversationId", "==", roomId).onSnapshot(snap => {
                    if (snap.docChanges().some(c => c.type === 'added' && c.doc.data().from === State.currentUser)) qdSent = true;
                    qdLatest = snap; State.chatLastSnap = snap;
                    if (!qdRaf) qdRaf = qdFrame(qdFlush);
                });
                const paint = (snap, iSent, keepPos) => {
                    if (State.chatTarget !== loadTarget) return;   // đã thoát / chuyển sang cuộc khác: không vẽ, không đánh dấu đã xem
                    // Chỉ tự cuộn xuống cuối khi đang ở gần cuối / lần đầu mở / mình vừa gửi -> không bị giật khi ai đó thả tim
                    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
                    const prevTop = box.scrollTop, prevH = box.scrollHeight, first = State.chatFirstPaint || (box.__qdStick && Date.now() - (State.chatOpenAt || 0) < 2500); State.chatFirstPaint = false;
                    State.chatMsgs = {};
                    if(snap.empty) { box.innerHTML = `<div class="text-center text-success mt-10"><i class="fa-solid fa-shield-heart text-5xl mb-4 opacity-50 block"></i>Kênh kết nối hoàn tất. Hãy gửi tin nhắn đầu tiên!</div>`; box.__qdHtml = ''; return; }
                    let ms = []; snap.forEach(d => { const mData = d.data(); mData.id = d.id; ms.push(mData); State.chatMsgs[d.id] = mData; }); ms.sort((a,b) => a.time - b.time);
                    // Đang kéo lên xem tin cũ mà có tin mới tới: giữ nguyên các tin đang xem (không đẩy tin trên cùng ra ngoài)
                    if (State.chatPrevTotal && !first && !nearBottom && !keepPos) State.chatShowN += Math.max(0, ms.length - State.chatPrevTotal);
                    State.chatPrevTotal = ms.length;
                    const start = Math.max(0, ms.length - State.chatShowN);
                    let html = start > 0 ? `<div class="qd-older"><button type="button" onclick="window.Chat.showOlder()"><i class="fa-solid fa-clock-rotate-left"></i> Xem tin nhắn cũ hơn (${start})</button></div>` : '';
                    
                    const unreadUpdates = [];
                    // Kiểu Messenger: gom tin liên tiếp, mốc thời gian, ảnh "đã xem" dưới tin cuối cùng mỗi người đã xem
                    const QG = window.QDMsgr ? window.QDMsgr.prep(ms, start, State.currentUser, State.chatTarget) : { sep: {}, first: {}, last: {}, heads: {}, mine: -1 };
                    const qdNm = u => (State.nicknames || {})[u] || (((State.accInfo || {})[u] || {}).fullName) || u;

                    ms.forEach((m, idx) => { 
                        const isM = m.from === State.currentUser; 
                        if (idx < start) {   // tin cũ chưa vẽ: vẫn đánh dấu đã xem
                            if (!isM && !m.revoked) { if (State.chatTarget === 'general') { if (!(m.readBy || []).includes(State.currentUser)) unreadUpdates.push({ id: m.id, type: 'general' }); } else if (!m.read) unreadUpdates.push({ id: m.id, type: 'private' }); }
                            return;
                        }
                        const tm = new Date(m.time).toLocaleString('vi-VN', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}); 
                        let statusHtml = '';

                        if (State.chatTarget === 'general') {
                            const readList = m.readBy || [];
                            
                            if (!isM && !readList.includes(State.currentUser)) {
                                unreadUpdates.push({ id: m.id, type: 'general' });
                            }
                            
                            if (isM) {
                                const readNames = readList.filter(u => u !== State.currentUser).map(u => State.nicknames[u] || u);
                                if (readNames.length > 0) {
                                    const readStr = readNames.join(', ');
                                    const safeStr = readStr.replace(/</g, '&lt;');
                                    if (readNames.length > 2) {
                                        statusHtml = `<span class="ml-2 text-success msg-status-btn" title="Bấm để xem ai đã xem" onclick="window.Chat.showInfo('${m.id}','seen')"><i class="fa-solid fa-check-double"></i> Đã xem (${readNames.length}) ›</span>`;
                                    } else {
                                        statusHtml = `<span class="ml-2 text-success msg-status-btn" title="Bấm để xem chi tiết" onclick="window.Chat.showInfo('${m.id}','seen')"><i class="fa-solid fa-check-double"></i> Đã xem: ${safeStr}</span>`;
                                    }
                                } else {
                                    statusHtml = `<span class="ml-2" style="opacity: 0.6;"><i class="fa-solid fa-check"></i> Đã gửi</span>`;
                                }
                            }
                        } 
                        else {
                            if (!isM && !m.read) {
                                unreadUpdates.push({ id: m.id, type: 'private' });
                            }
                            
                            if (isM) {
                                if (m.read) {
                                    const rt = m.readTime ? ' lúc ' + new Date(m.readTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
                                    statusHtml = `<span class="ml-2 text-success msg-status-btn" title="Bấm để xem chi tiết" onclick="window.Chat.showInfo('${m.id}','seen')"><i class="fa-solid fa-check-double"></i> Đã xem${rt}</span>`;
                                } else {
                                    statusHtml = `<span class="ml-2" style="opacity: 0.6;"><i class="fa-solid fa-check"></i> Đã gửi</span>`;
                                }
                            }
                        }

                        const hearts = window.Chat.heartList(m), iHeart = hearts.includes(State.currentUser);
                        let heartHtml = hearts.length ? `<div class="heart-reaction active ${iHeart ? 'mine' : ''} ${State.heartPop === m.id ? 'pop' : ''}" title="Bấm để xem ai đã thả tim" onclick="window.Chat.showInfo('${m.id}','heart')">❤️ <span class="hr-n">${hearts.length}</span></div>` : '';
                        let heartBtn = `<i class="${iHeart ? 'fa-solid on' : 'fa-regular'} fa-heart btn-heart-action" title="${iHeart ? 'Bỏ tim' : 'Thả tim'}" onclick="window.Chat.toggleHeart('${m.id}')"></i>`;
                        let infoBtn = `<i class="fa-solid fa-circle-info btn-heart-action" title="Xem ai đã thả tim / đã xem" onclick="window.Chat.showInfo('${m.id}')"></i>`;
                        let revokeBtn = (isM && !m.revoked) ? `<i class="fa-solid fa-rotate-left btn-heart-action" style="color: var(--color-danger); opacity: 0.7;" onclick="window.Chat.revokeMsg('${m.id}')" title="Thu hồi tin nhắn"></i>` : '';

                        let imgHtml = m.imageUrl ? `<img src="${m.imageUrl}" style="max-width: 100%; border-radius: 8px; margin-top: 5px; cursor: pointer; border: 1px solid var(--border-strong);" onclick="window.Chat.viewImage(this.src)" title="Nhấn để phóng to">` : '';
                        if (!imgHtml && m.video && window.QDVMsg) imgHtml = window.QDVMsg.html(m);   // tin nhắn video: ảnh xem trước + nút phát
                        let safeText = m.text && !(m.video && window.QDVMsg && window.QDVMsg.isLabel(m.text)) ? (window.QDMention ? window.QDMention.html(m) : m.text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")) : '';
                        const atMe = !isM && !m.revoked && window.QDMention && window.QDMention.forMe(m);
                        let textHtml = safeText ? `<div>${safeText}</div>` : '';
                        
                        let senderNameHtml = '', nameHtml = '';
                        if (State.chatTarget === 'general' && !isM) {
                             nameHtml = m.bot && window.QDMention ? window.QDMention.senderHtml(m) : (window.QDStaff ? window.QDStaff.sender(m.from, qdNm(m.from)) : `<div class="msg-sender">${String(qdNm(m.from)).replace(/</g, '&lt;')}</div>`);
                        }
                        if (atMe && !m.bot) senderNameHtml = `<div class="qd-at-tag">@ Nhắc đến bạn</div>` + senderNameHtml;
                        if (m.auto === 'payout' && !m.revoked) senderNameHtml = `<div class="qd-auto-tag">🤖 Tin tự động · Trả thưởng</div>` + senderNameHtml;

                        if (m.revoked) {
                            textHtml = `<div style="font-style: italic; color: var(--text-muted); opacity: 0.8; font-size: 13px;"><i class="fa-solid fa-ban mr-1"></i> Tin nhắn đã bị thu hồi</div>`;
                            imgHtml = '';
                            heartBtn = '';
                            heartHtml = '';
                            revokeBtn = '';
                            infoBtn = '';
                        }
                        
                        let actionsHtml = isM ? revokeBtn + infoBtn + heartBtn : heartBtn + infoBtn;
                        // Nhấp đúp vào tin nhắn = thả / bỏ tim
                        let msgBubbleHtml = `<div class="msg-bubble-container"><div class="msg-bubble" ${m.revoked ? '' : `ondblclick="window.Chat.toggleHeart('${m.id}')"`}>${senderNameHtml}${textHtml}${imgHtml}</div>${heartHtml}</div>`;
                        // Kiểu Messenger: ảnh đại diện ở tin CUỐI của chuỗi, tên người gửi ở trên tin ĐẦU (Kênh Chung), giờ + nút thả tim / thu hồi hiện khi chạm vào tin
                        const gFirst = QG.first[idx] !== false, gLast = QG.last[idx] !== false;
                        const avtHtml = isM || !window.QDChatAvt ? '' : (gLast ? window.QDChatAvt(m.from, qdNm(m.from), m.bot) : '<div class="msg-avt sp" aria-hidden="true"></div>');
                        const heads = QG.heads[idx] || [];
                        const seenTitle = heads.map(u => String(qdNm(u)).replace(/"/g, '&quot;').replace(/</g, '&lt;')).join(', ');
                        let tailHtml = '';
                        if (heads.length && window.QDChatAvt) tailHtml = `<div class="mg-seen" title="Đã xem: ${seenTitle}" onclick="window.Chat.showInfo('${m.id}','seen')">${heads.slice(0, 6).map(u => '<span class="mg-h">' + window.QDChatAvt(u, qdNm(u)) + '</span>').join('')}${heads.length > 6 ? '<span class="mg-more">+' + (heads.length - 6) + '</span>' : ''}</div>`;
                        else if (QG.mine === idx && !QG.seenMine && !m.revoked) tailHtml = `<div class="mg-sent"><i class="fa-regular fa-circle-check"></i> Đã gửi</div>`;
                        if (QG.sep[idx]) html += `<div class="mg-sep">${QG.sep[idx]}</div>`;
                        html += `<div class="msg-row mg ${isM?'me':'them'}${gFirst ? ' g-first' : ''}${gLast ? ' g-last' : ''}${avtHtml ? ' has-avt' : ''} ${heartHtml ? 'has-heart' : ''}${m.bot ? ' is-bot' : ''}${atMe ? ' at-me' : ''}${m.auto ? ' is-auto' : ''}" data-mid="${m.id}">${nameHtml && gFirst ? `<div class="mg-name">${nameHtml}</div>` : ''}<div class="mg-line">${avtHtml}${msgBubbleHtml}<span class="mg-acts">${actionsHtml}</span></div><div class="mg-meta">${tm}${statusHtml}</div>${tailHtml}</div>`;
});
                    if (html !== box.__qdHtml) { box.innerHTML = html; box.__qdHtml = html; }   // nội dung không đổi -> không vẽ lại
                    State.heartPop = null;
                    // cập nhật modal chi tiết nếu đang mở
                    const mi = document.getElementById('modal-msg-info');
                    if (mi && mi.classList.contains('active') && State.infoMsgId) window.Chat.infoTab(document.getElementById('mi-tab-seen').classList.contains('active') ? 'seen' : 'heart');

                    // Đánh dấu đã xem: gộp thành 1 lệnh ghi (tối đa 400 tin / lệnh), không gửi lại tin đang chờ
                    const qdTodo = unreadUpdates.filter(u => !State.chatReadPending.has(u.id));
                    if (qdTodo.length) {
                        const me = State.currentUser, FV = firebase.firestore.FieldValue, ref = id => db.collection("private_chat").doc(id);
                        const patch = u => u.type === 'general' ? { readBy: FV.arrayUnion(me), ['readAt.' + me]: Date.now() } : { read: true, readTime: Date.now() };
                        qdTodo.forEach(u => State.chatReadPending.add(u.id));
                        for (let i = 0; i < qdTodo.length; i += 400) {
                            const part = qdTodo.slice(i, i + 400), bt = db.batch();
                            part.forEach(u => bt.update(ref(u.id), patch(u)));
                            bt.commit().catch(e => {   // 1 tin lỗi (vd. vừa bị xóa) làm hỏng cả lệnh gộp -> ghi lại từng tin như cũ
                                console.warn("Ghi gộp đã xem lỗi, ghi từng tin:", e);
                                part.forEach(u => ref(u.id).update(patch(u)).catch(er => { State.chatReadPending.delete(u.id); console.error("Lỗi cập nhật đã xem:", er); }));
                            });
                        }
                    }

                    // Mới mở cuộc trò chuyện: nhảy thẳng tới tin mới nhất ngay trong lần vẽ đầu (không chạy hiệu ứng cuộn từ trên xuống)
                    if (keepPos) window.Chat.toBottom(box, prevTop + (box.scrollHeight - prevH));   // vừa nạp tin cũ: giữ nguyên chỗ đang đọc
                    else if (first) { window.Chat.toBottom(box); box.__qdStick = true; }
                    else if (nearBottom || iSent) setTimeout(() => box.scrollTop = box.scrollHeight, 100);
                    else window.Chat.toBottom(box, prevTop);
                };
            },
            // Nút "Xem tin nhắn cũ hơn": vẽ thêm 60 tin phía trên
            showOlder: () => { State.chatShowN = (State.chatShowN || 60) + 60; if (State.chatRepaint) State.chatRepaint(); },
            
            sendMsg: () => { 
                const i = document.getElementById('inp-chat-msg'); if(!i) return; 
                const t = i.value.trim(); if(!t || !State.chatTarget) return; 
                i.value = ""; i.style.height = 'auto'; i.focus(); 
                
                const roomId = State.chatTarget === 'general' ? 'general_room' : Utils.getRoomId(State.currentUser, State.chatTarget);
                const targetUser = State.chatTarget === 'general' ? 'all' : State.chatTarget;
                
                const qdMsg = { conversationId: roomId, from: State.currentUser, to: targetUser, text: t, imageUrl: null, time: Date.now(), read: false, heart: false, hearts: [], readBy: [] };
                if (State.chatTarget === 'general' && window.QDMention) { window.QDMention.close(); const men = window.QDMention.extract(t); if (men.length) qdMsg.mentions = men; }
                const ping = targetUser !== 'all' || (qdMsg.mentions && qdMsg.mentions.length);
                db.collection("private_chat").add(qdMsg).catch(() => {}); 
            },

            revokeMsg: (msgId) => {
                document.getElementById('confirm-title').innerText = "Thu hồi tin nhắn";
                document.getElementById('confirm-desc').innerText = "Tin nhắn này sẽ bị xóa với mọi người và không thể hoàn tác. Bạn chắc chắn chứ?";
                document.getElementById('btn-confirm-action').onclick = () => {
                    window.UI.closeModal('modal-confirm');
                    const vEl = document.querySelector('[data-mid="' + msgId + '"] .qvm-msg'), vp = vEl && vEl.getAttribute('data-p');   // tin có video: xóa luôn video trên máy chủ
                    db.collection("private_chat").doc(msgId).update({ revoked: true, text: "Tin nhắn đã bị thu hồi", imageUrl: null, video: null })
                      .then(() => { Utils.toast("Đã thu hồi tin nhắn", "success"); if (vp && window.QDVMsg) window.QDVMsg.drop(vp); })
                      .catch(e => Utils.toast("Lỗi thu hồi tin nhắn", "error"));
                };
                window.UI.openModal('modal-confirm');
            },
            
            currentZoom: 1,
            panX: 0,
            panY: 0,
            isDragging: false,
            startX: 0,
            startY: 0,
            viewImage: (url) => {
                const imgEl = document.getElementById('chat-fullscreen-img');
                const dlBtn = document.getElementById('chat-fullscreen-download');
                if(!imgEl) return;
                imgEl.src = url;
                if(dlBtn) dlBtn.href = url;
                window.Chat.currentZoom = 1;
                window.Chat.panX = 0;
                window.Chat.panY = 0;
                imgEl.style.transition = 'transform 0.3s ease';
                imgEl.style.transform = `translate(0px, 0px) scale(1)`;
                imgEl.style.cursor = 'default';
                window.UI.openModal('modal-image-viewer');
            },
            zoomImage: (factor) => {
                const imgEl = document.getElementById('chat-fullscreen-img');
                if(!imgEl) return;
                if(factor === 0) {
                    window.Chat.currentZoom = 1;
                    window.Chat.panX = 0;
                    window.Chat.panY = 0;
                } else {
                    window.Chat.currentZoom += factor;
                }
                if(window.Chat.currentZoom < 0.5) window.Chat.currentZoom = 0.5;
                if(window.Chat.currentZoom > 5) window.Chat.currentZoom = 5;
                imgEl.style.transition = 'transform 0.3s ease';
                imgEl.style.transform = `translate(${window.Chat.panX}px, ${window.Chat.panY}px) scale(${window.Chat.currentZoom})`;
                imgEl.style.cursor = window.Chat.currentZoom > 1 ? 'grab' : 'default';
            },
            wheelZoom: (e) => {
                e.preventDefault();
                const factor = e.deltaY < 0 ? 0.2 : -0.2;
                window.Chat.zoomImage(factor);
            },
            initialPinchDistance: 0,
            lastZoom: 1,
            startPan: (e) => {
                const imgEl = document.getElementById('chat-fullscreen-img');
                imgEl.style.transition = 'none';

                // Bắt sự kiện chạm 2 ngón tay (Pinch to Zoom)
                if (e.type === 'touchstart' && e.touches.length === 2) {
                    window.Chat.isDragging = false;
                    window.Chat.initialPinchDistance = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    window.Chat.lastZoom = window.Chat.currentZoom;
                    return;
                }

                window.Chat.isDragging = true;
                const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
                const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
                window.Chat.startX = clientX - window.Chat.panX;
                window.Chat.startY = clientY - window.Chat.panY;
                imgEl.style.cursor = 'grabbing';
            },
            doPan: (e) => {
                e.preventDefault();
                const imgEl = document.getElementById('chat-fullscreen-img');

                // Xử lý khi đang zoom bằng 2 ngón tay
                if (e.type === 'touchmove' && e.touches.length === 2) {
                    const currentDistance = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    if (window.Chat.initialPinchDistance) {
                        const zoomFactor = currentDistance / window.Chat.initialPinchDistance;
                        let newZoom = window.Chat.lastZoom * zoomFactor;
                        
                        // Giới hạn zoom
                        if (newZoom < 0.5) newZoom = 0.5;
                        if (newZoom > 5) newZoom = 5;
                        
                        window.Chat.currentZoom = newZoom;
                        imgEl.style.transform = `translate(${window.Chat.panX}px, ${window.Chat.panY}px) scale(${window.Chat.currentZoom})`;
                    }
                    return;
                }

                if (!window.Chat.isDragging) return;
                
                // Chỉ cho phép kéo (Pan) khi ảnh đang được phóng to
                if (window.Chat.currentZoom <= 1) {
                   window.Chat.panX = 0; window.Chat.panY = 0;
                   return;
                }

                const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
                const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
                window.Chat.panX = clientX - window.Chat.startX;
                window.Chat.panY = clientY - window.Chat.startY;
                imgEl.style.transform = `translate(${window.Chat.panX}px, ${window.Chat.panY}px) scale(${window.Chat.currentZoom})`;
            },
            endPan: (e) => {
                window.Chat.isDragging = false;
                window.Chat.initialPinchDistance = 0;
                const imgEl = document.getElementById('chat-fullscreen-img');
                if(imgEl) {
                    imgEl.style.cursor = window.Chat.currentZoom > 1 ? 'grab' : 'default';
                    // Tự động đàn hồi (Snap back) về kích thước gốc nếu lỡ zoom nhỏ hơn 1
                    if (window.Chat.currentZoom < 1) {
                        window.Chat.zoomImage(0); 
                    }
                }
            },
            
            sendImage: (inputElement) => {
                if(!inputElement.files || !inputElement.files[0] || !State.chatTarget) return;
                const file = inputElement.files[0]; const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let w = img.width; let h = img.height; const maxW = 800; const maxH = 800;
                        if(w > maxW || h > maxH) { if(w > h) { h = (maxW / w) * h; w = maxW; } else { w = (maxH / h) * w; h = maxH; } }
                        canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                        
                        const base64Data = canvas.toDataURL('image/jpeg', 0.6);
                        const roomId = State.chatTarget === 'general' ? 'general_room' : Utils.getRoomId(State.currentUser, State.chatTarget);
                        const targetUser = State.chatTarget === 'general' ? 'all' : State.chatTarget;
                        
                        db.collection("private_chat").add({ conversationId: roomId, from: State.currentUser, to: targetUser, text: "", imageUrl: base64Data, time: Date.now(), read: false, heart: false, readBy: [] })
                            .catch(() => {});
                        inputElement.value = ""; 
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        };

        /** 7. MODULE VÒNG QUAY (TÍCH HỢP TRỰC TIẾP) */
        window.Wheel = {
            canvas: null, ctx: null,
            currentRotation: 0, isSpinning: false, lastTickIndex: -1,
            init: function() {
                this.canvas = document.getElementById("wheelCanvas");
                if(!this.canvas) return;
                this.ctx = this.canvas.getContext("2d");
                this.drawGraphics();
            },
            drawGraphics: function() {
                if(!this.ctx) return;
                const slices = State.wheelPrizes.length;
                if(!slices) return;
                const sliceAngle = (2 * Math.PI) / slices;
                const centerX = this.canvas.width / 2; const centerY = this.canvas.height / 2; const radius = centerX;
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                for (let i = 0; i < slices; i++) {
                    const startAngle = i * sliceAngle; const endAngle = startAngle + sliceAngle;
                    const sliceColor = i % 2 === 0 ? "#18181b" : "#27272a";
                    this.ctx.beginPath(); this.ctx.moveTo(centerX, centerY); this.ctx.arc(centerX, centerY, radius, startAngle, endAngle);
                    this.ctx.fillStyle = sliceColor; this.ctx.fill();
                    this.ctx.strokeStyle = "rgba(245, 158, 11, 0.4)"; this.ctx.lineWidth = 3; this.ctx.stroke();

                    this.ctx.save(); this.ctx.translate(centerX, centerY); this.ctx.rotate(startAngle + sliceAngle / 2);
                    this.ctx.textAlign = "right"; this.ctx.textBaseline = "middle";
                    const prizeText = State.wheelPrizes[i].text;
                    if(prizeText.includes("VNĐ") || prizeText.includes("20K")) this.ctx.fillStyle = "#fde047"; else this.ctx.fillStyle = "#f4f4f5";
                    this.ctx.font = "bold 20px 'Plus Jakarta Sans'"; this.ctx.shadowColor = "rgba(0,0,0,0.8)"; this.ctx.shadowBlur = 6;
                    this.ctx.fillText(prizeText, radius - 35, 0); this.ctx.restore();
                }
                this.ctx.beginPath(); this.ctx.arc(centerX, centerY, 35, 0, 2 * Math.PI);
                this.ctx.fillStyle = "#f59e0b"; this.ctx.fill(); this.ctx.strokeStyle = "#121217"; this.ctx.lineWidth = 6; this.ctx.stroke();
                this.ctx.fillStyle = "#ffffff"; this.ctx.font = "900 30px 'Font Awesome 6 Free'"; this.ctx.textAlign = "center"; this.ctx.textBaseline = "middle"; this.ctx.fillText("", centerX, centerY);
            },
            startSpin: function() {
                return void (location.href = 'qt.html');   // bản cũ nhúng trong Trang chủ: Vòng Quay giờ do máy chủ tính ở qt.html
                if (this.isSpinning) return;
                if (State.availableSpins <= 0) return Utils.toast("Bạn đã hết lượt quay! Hãy điểm danh để nhận thêm.", "warning");

                window.Sound.initCtx();
                this.isSpinning = true;
                const spinBtn = document.getElementById("spinBtn");
                spinBtn.disabled = true; spinBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> ĐANG QUAY...`;

                db.collection("accounts").doc(State.currentDocId).update({ spins: firebase.firestore.FieldValue.increment(-1) }).then(() => {
                    let totalChance = 0; State.wheelPrizes.forEach(p => totalChance += (parseFloat(p.chance) || 0));
                    let winningIndex = 0;
                    if (totalChance <= 0) winningIndex = Math.floor(Math.random() * State.wheelPrizes.length);
                    else {
                        const rand = Math.random() * totalChance; let sum = 0;
                        for(let i = 0; i < State.wheelPrizes.length; i++) {
                            sum += parseFloat(State.wheelPrizes[i].chance) || 0;
                            if(rand <= sum) { winningIndex = i; break; }
                        }
                    }
                    
                    const slices = State.wheelPrizes.length; const sliceDeg = 360 / slices;
                    const targetSectorCenter = (winningIndex * sliceDeg) + (sliceDeg / 2);
                    let finalDeg = 270 - targetSectorCenter; if(finalDeg < 0) finalDeg += 360;

                    const spinsCount = Math.floor(Math.random() * 5) + 5;
                    const randomOffset = (Math.random() * (sliceDeg - 8)) - (sliceDeg / 2 - 4);
                    let rotateAmount = finalDeg - (this.currentRotation % 360);
                    if (rotateAmount < 0) rotateAmount += 360; 
                    rotateAmount += (360 * spinsCount) + randomOffset;
                    this.currentRotation += rotateAmount;

                    this.canvas.style.transform = `rotate(${this.currentRotation}deg)`;

                    let start = null;
                    const animateTick = (time) => {
                        if (!start) start = time; const progress = time - start;
                        const currentGoc = (progress / 5000) * rotateAmount; 
                        const curIdx = Math.floor(currentGoc / sliceDeg);
                        if(curIdx !== this.lastTickIndex) { window.Sound.playTick(); this.lastTickIndex = curIdx; }
                        if(progress < 5000) requestAnimationFrame(animateTick);
                    };
                    requestAnimationFrame(animateTick);

                    setTimeout(() => {
                        this.isSpinning = false; spinBtn.disabled = false; spinBtn.innerHTML = `<i class="fa-solid fa-play mr-2"></i> BẮT ĐẦU QUAY`;
                        this.processResult(winningIndex);
                    }, 5000);
                }).catch(err => {
                    Utils.toast("Lỗi kết nối máy chủ.", "error");
                    this.isSpinning = false; spinBtn.disabled = false; spinBtn.innerHTML = `<i class="fa-solid fa-play mr-2"></i> BẮT ĐẦU QUAY`;
                });
            },
            processResult: function(winIndex) {
                window.Sound.playWin();
                const resultText = State.wheelPrizes[winIndex].text;   // (bản cũ, không còn dùng: Vòng Quay chạy ở qt.html)
                document.getElementById('wheelPrizeText').innerText = resultText;
                window.UI.openModal('modal-wheel-result');
                db.collection("spin_history").add({ userId: State.currentUser, result: resultText, timestamp: Date.now() });
            },
            closeResultModal: function() { window.UI.closeModal('modal-wheel-result'); }
        };

        /** 8. MODULE TRANH THƯỞNG (TÍCH HỢP TRỰC TIẾP) */
        window.TranhThuong = {
            hasPlayed: false,
            init: function() {
                this.renderTickets();
            },
            renderTickets: function() {
                const grid = document.getElementById('ticket-grid-ui');
                if(!grid) return;
                grid.innerHTML = "";
                for(let i = 0; i < 6; i++) {
                    grid.insertAdjacentHTML('beforeend', `
                        <div class="ticket-container" id="ticket-${i}" onclick="window.TranhThuong.openTicket(${i})">
                            <div class="ticket-back">
                                <i class="fa-solid fa-gift text-3xl" style="color: var(--color-gold, #ffd700); opacity: 0.8;"></i>
                                <h3 id="ticket-result-${i}">?</h3>
                            </div>
                            <div class="ticket-front">
                                <div class="ticket-half half-left"><i class="fa-solid fa-envelope-open-text"></i></div>
                                <div class="ticket-half half-right"></div>
                            </div>
                        </div>
                    `);
                }
            },
            openTicket: function(index) {
                return void (location.href = 'tranht.html');   // bản cũ nhúng trong Trang chủ: Rút Lì Xì giờ do máy chủ tính ở tranht.html
                if (State.availableTickets <= 0) return Utils.toast("Bạn đã hết lượt xé phiếu!", "warning");
                if (this.hasPlayed) return;
                
                window.Sound.initCtx();
                this.hasPlayed = true;

                db.collection("accounts").doc(State.currentDocId).update({ tickets: firebase.firestore.FieldValue.increment(-1) }).then(() => {
                    let totalChance = 0; State.ticketPrizes.forEach(p => totalChance += parseFloat(p.chance) || 0);
                    const rand = Math.random() * totalChance; let sum = 0; let winningPrize = "Chúc May Mắn";
                    for(let i = 0; i < State.ticketPrizes.length; i++) {
                        sum += parseFloat(State.ticketPrizes[i].chance) || 0;
                        if(rand <= sum) { winningPrize = State.ticketPrizes[i].text; break; }
                    }

                    document.getElementById(`ticket-result-${index}`).innerText = winningPrize;
                    for(let i=0; i<6; i++) { if(i !== index) document.getElementById(`ticket-${i}`).classList.add('disabled'); }

                    const activeTicket = document.getElementById(`ticket-${index}`);
                    activeTicket.classList.add('opened');

                    setTimeout(() => {
                        document.getElementById('ticketPrizeText').innerText = winningPrize;
                        window.UI.openModal('modal-ticket-result');
                        
                        window.Sound.rewardAudio.currentTime = 0;
                        window.Sound.rewardAudio.play().catch(e=>{});

                        db.collection("tranhthuong_history").add({ userId: State.currentUser, result: winningPrize, timestamp: Date.now() });
                    }, 900);

                }).catch(err => {
                    this.hasPlayed = false; Utils.toast("Lỗi kết nối máy chủ.", "error");
                });
            },
            closeModal: function() {
                window.Sound.rewardAudio.pause(); window.Sound.rewardAudio.currentTime = 0;
                window.UI.closeModal('modal-ticket-result');
                setTimeout(() => { this.hasPlayed = false; this.renderTickets(); }, 300);
            }
        };

        /** Lỗi Firestore -> câu dễ hiểu cho thành viên + ghi app_errors để Admin xem (Admin > Lì Xì > Lỗi khi đổi / rút) */
        window.qdErr = function (where, e) {
            const c = String((e && (e.code || e.name)) || (typeof e === 'string' ? e : '') || 'unknown').replace(/^firestore\//, ''), m = String((e && e.message) || e || '').slice(0, 300);
            try { db.collection('app_errors').add({ where, user: (window.State && State.currentUser) || '', docId: (window.State && State.currentDocId) || '', code: c, msg: m, online: navigator.onLine, ua: navigator.userAgent.slice(0, 160), at: Date.now() }).catch(() => {}); } catch (x) {}
            if (!navigator.onLine || c === 'unavailable') return 'Mất kết nối mạng — kiểm tra mạng rồi thử lại.';
            if (c === 'resource-exhausted') { try { window.qdQuotaShow && window.qdQuotaShow(); } catch (x) {} return 'Máy chủ đã dùng hết hạn mức miễn phí hôm nay — tự mở lại lúc 15:00. Báo Ban Quản Trị nhé!'; }
            if (c === 'permission-denied') return 'Hệ thống đang chặn quyền ghi dữ liệu — báo Ban Quản Trị kiểm tra (mã permission-denied).';
            if (c === 'aborted' || c === 'failed-precondition') return 'Đông người thao tác cùng lúc — đợi vài giây rồi thử lại.';
            return 'Lỗi kết nối máy chủ, vui lòng thử lại. (Mã: ' + c + ')';
        };
        window.qdCode = (e) => (e && /^(failed-precondition|not-found|invalid-argument|permission-denied|unauthenticated)$/.test(e.code || '') && /^[A-Z_]+$/.test(e.message || '')) ? e.message : e;   // lỗi luật từ máy chủ (lệnh act) -> mã ngắn
        window.qdTemp = (e) => /aborted|failed-precondition|unavailable|deadline-exceeded|internal|cancelled/.test(String((e && e.code) || ''));

        /** MODULE CỬA HÀNG ĐIỂM (TÍCH HỢP FETCH GIÁ TỪ ADMIN) */
        window.PointShop = {
            userPoints: 0, spinCost: 100, ticketCost: 50,
            cfg: {}, items: [], counts: {}, daily: {}, orders: [], tab: 'items', qty: {}, confirmId: null, busy: false, owner: null, unsubs: [],
            TYPE_NAME: { tickets: 'Lượt rút lì xì', spins: 'Lượt vòng quay', gift: 'Quà tặng', conThrows: 'Lượt ném còn' },
            DEF: [
                { id: 'tk1', icon: '🧧', name: '1 Lượt rút lì xì', type: 'tickets', amount: 1, cost: 50, stock: null, dailyLimit: null, active: true },
                { id: 'tk5', icon: '🧧', name: 'Combo 5 lượt rút lì xì', type: 'tickets', amount: 5, cost: 220, stock: null, dailyLimit: 2, active: true },
                { id: 'tk10', icon: '🧧', name: 'Combo 10 lượt rút lì xì', type: 'tickets', amount: 10, cost: 400, stock: null, dailyLimit: 1, active: true }
            ],
            esc: v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
            dayKey: () => { const d = new Date(), p = x => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); },
            // Danh mục từ cấu hình admin (tương thích bản cũ chỉ có spinCost / ticketCost)
            norm: function(cfg) {
                cfg = cfg || {};
                let list = Array.isArray(cfg.items) && cfg.items.length ? cfg.items : null;
                if (!list) list = this.DEF.map(x => Object.assign({}, x, x.id === 'tk1' && cfg.ticketCost != null ? { cost: cfg.ticketCost } : {}, x.id === 'sp1' && cfg.spinCost != null ? { cost: cfg.spinCost } : {}));
                return list.filter(x => ['tickets', 'conThrows'].indexOf(x.type || 'tickets') >= 0).map((x, i) => ({   // bán lượt rút lì xì + lượt ném còn
                    id: x.id || ('i' + i), icon: x.icon || (x.type === 'conThrows' ? '🎯' : '🧧'), name: String(x.name || ''), type: x.type || 'tickets',
                    amount: Math.max(1, parseInt(x.amount) || 1), cost: Math.max(0, parseInt(x.cost) || 0),
                    stock: x.stock == null || x.stock === '' ? null : Math.max(0, parseInt(x.stock) || 0),
                    dailyLimit: x.dailyLimit == null || x.dailyLimit === '' ? null : Math.max(0, parseInt(x.dailyLimit) || 0),
                    active: x.active !== false
                }));
            },

            init: function() {
                db.collection("settings").doc("point_shop_config").onSnapshot(doc => {
                    this.cfg = doc.exists ? doc.data() : {};
                    this.items = this.norm(this.cfg);
                    this.spinCost = this.cfg.spinCost !== undefined ? this.cfg.spinCost : 100;
                    this.ticketCost = this.cfg.ticketCost !== undefined ? this.cfg.ticketCost : 50;
                    window.AppCore.lockFeatureUI('pointshop', this.cfg.isEnabled !== false);
                    this.render();
                });
                db.collection("point_shop_stock").doc("counts").onSnapshot(doc => { this.counts = (doc.exists && doc.data().counts) || {}; this.render(); }, e => console.warn('point_shop_stock', e));
            },
            // Nghe dữ liệu riêng của người dùng (giới hạn đổi trong ngày)
            ensureUser: function() {
                const me = window.State && window.State.currentUser;
                if (me === this.owner) return;
                this.unsubs.forEach(u => { try { u(); } catch (e) {} }); this.unsubs = []; this.daily = {}; this.orders = []; this.owner = me;
                if (!me) return;
                this.unsubs.push(db.collection('point_shop_daily').doc(me + '_' + this.dayKey()).onSnapshot(d => { this.daily = (d.exists && d.data().counts) || {}; this.render(); }, e => console.warn('point_shop_daily', e)));
            },

            updateUI: function(points) {
                this.userPoints = points || 0;
                window.Utils.safeText('user-points-display', this.userPoints);
                window.Utils.safeText('shop-current-points', Number(this.userPoints).toLocaleString('vi-VN'));
                this.render();
            },
            open: function() { if (!this.items.length) this.items = this.norm(this.cfg); this.ensureUser(); this.confirmId = null; const p = document.getElementById('ps2-pop'); if (p) p.classList.remove('show'); this.render(); window.UI.openModal('modal-point-shop'); },
            setTab: function(t) { this.tab = t; this.render(); },

            // Số lượng tối đa còn đổi được của 1 vật phẩm (theo kho, giới hạn ngày, điểm)
            maxQty: function(x) {
                let m = 20;
                if (x.stock != null) m = Math.min(m, x.stock - (this.counts[x.id] || 0));
                if (x.dailyLimit != null) m = Math.min(m, x.dailyLimit - (this.daily[x.id] || 0));
                if (x.cost > 0) m = Math.min(m, Math.floor(this.userPoints / x.cost));
                return Math.max(0, m);
            },
            render: function() {
                const box = document.getElementById('ps2-grid'), ob = document.getElementById('ps2-orders'); if (!box || !ob) return;
                const closed = this.cfg.isEnabled === false, esc = this.esc;
                const modal = document.querySelector('#modal-point-shop .ps2'); if (modal) modal.classList.toggle('closed', closed);
                document.querySelectorAll('#modal-point-shop .ps2-tab').forEach(b => b.classList.toggle('active', b.dataset.t === this.tab));
                box.style.display = this.tab === 'items' ? '' : 'none'; ob.style.display = this.tab === 'orders' ? '' : 'none';
                const pend = this.orders.filter(o => o.status === 'pending').length, nEl = document.getElementById('ps2-order-n'); if (nEl) nEl.textContent = pend || '';

                const list = this.items.filter(x => x.active);
                box.innerHTML = list.length ? list.map(x => {
                    const sold = this.counts[x.id] || 0, left = x.stock == null ? null : Math.max(0, x.stock - sold);
                    const used = this.daily[x.id] || 0, dLeft = x.dailyLimit == null ? null : Math.max(0, x.dailyLimit - used);
                    const soldout = left === 0, limited = dLeft === 0, max = this.maxQty(x);
                    let q = Math.min(Math.max(1, this.qty[x.id] || 1), Math.max(1, max)); this.qty[x.id] = q;
                    const total = x.cost * q;
                    let btn, dis = false;
                    if (closed) { btn = '🔒 Đang đóng'; dis = true; }
                    else if (soldout) { btn = 'Hết hàng'; dis = true; }
                    else if (limited) { btn = 'Hết lượt hôm nay'; dis = true; }
                    else if (this.userPoints < total) { btn = 'Thiếu ' + (total - this.userPoints).toLocaleString('vi-VN') + ' điểm'; dis = true; }
                    else if (this.busy === x.id) { btn = 'Đang đổi...'; dis = true; }
                    else btn = 'Đổi ngay';
                    const sub = x.type === 'gift' ? '🎁 Quà trao tay' : `Nhận +${x.amount * q} ${this.TYPE_NAME[x.type].toLowerCase()}`;
                    const meta = [left != null ? `Kho: còn ${left}` : '', dLeft != null ? `Hôm nay: còn ${dLeft}/${x.dailyLimit}` : ''].filter(Boolean).map(t => `<span>${t}</span>`).join('');
                    const tag = soldout ? '<span class="ps2-tag">HẾT</span>' : (x.type === 'gift' ? '<span class="ps2-tag">QUÀ TẾT</span>' : (x.amount > 1 ? '<span class="ps2-tag">COMBO</span>' : ''));
                    return `<div class="ps2-item ${x.type === 'gift' ? 'gift' : ''} ${soldout ? 'soldout' : ''} ${limited ? 'limit' : ''}">${tag}
                        <div class="ps2-ico" aria-hidden="true">${esc(x.icon)}</div>
                        <div class="ps2-name">${esc(x.name)}</div>
                        <div class="ps2-sub">${sub}</div>
                        ${meta ? `<div class="ps2-meta">${meta}</div>` : ''}
                        <div class="ps2-price">💰 ${total.toLocaleString('vi-VN')}</div>
                        <div class="ps2-buy">
                            <span class="ps2-qty"><button onclick="window.PointShop.setQty('${x.id}',-1)" ${q <= 1 ? 'disabled' : ''} aria-label="Giảm">−</button><b>${q}</b><button onclick="window.PointShop.setQty('${x.id}',1)" ${q >= max ? 'disabled' : ''} aria-label="Tăng">+</button></span>
                            <button class="ps2-go" ${dis ? 'disabled' : ''} onclick="window.PointShop.buy('${x.id}')">${btn}</button>
                        </div>
                    </div>`;
                }).join('') : '<div class="ps2-empty">Trạm Quy Đổi chưa có vật phẩm nào.</div>';

                ob.innerHTML = this.orders.length ? this.orders.map(o => {
                    const st = o.status === 'done' ? '<span class="ps2-st done">✅ Đã trao</span>' : o.status === 'rejected' ? `<span class="ps2-st rejected">↩ Hoàn ${Number(o.cost || 0).toLocaleString('vi-VN')} điểm</span>` : '<span class="ps2-st pending">⏳ Chờ trao</span>';
                    return `<div class="ps2-order"><div class="o-ico">${esc(o.icon || '🎁')}</div><div class="o-main"><div class="o-name">${esc(o.itemName)}${o.qty > 1 ? ' ×' + o.qty : ''}</div><div class="o-sub">${new Date(o.time).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })} · −${Number(o.cost || 0).toLocaleString('vi-VN')} điểm</div></div>${st}</div>`;
                }).join('') : '<div class="ps2-empty">Bạn chưa đổi quà tặng nào.<br>Lượt rút lì xì đổi xong được cộng thẳng vào túi đồ.</div>';
            },
            setQty: function(id, d) {
                const x = this.items.find(i => i.id === id); if (!x) return;
                this.qty[id] = Math.min(Math.max(1, (this.qty[id] || 1) + d), Math.max(1, this.maxQty(x)));
                this.confirmId = null; this.render();
            },

            // ===== Bảng xác nhận / kết quả =====
            pop: function(cls, html) {
                const p = document.getElementById('ps2-pop'), c = document.getElementById('ps2-pop-card'); if (!p || !c) return;
                c.className = 'ps2-pop-card ' + (cls || ''); c.innerHTML = html; p.classList.add('show');
                const b = c.querySelector('.yes') || c.querySelector('button'); if (b) setTimeout(() => b.focus(), 50);
            },
            closePop: function() { const p = document.getElementById('ps2-pop'); if (p && !this.busy) p.classList.remove('show'); },
            fmt: n => Number(n || 0).toLocaleString('vi-VN'),
            // Trừ điểm trên màn hình NGAY sau khi máy chủ xác nhận (không đợi đồng bộ)
            applyLocal: function(r) {
                const S = window.State || {};
                S.availablePoints = r.newPoints;
                if (r.x.type === 'tickets') S.availableTickets = (S.availableTickets || 0) + r.x.amount * r.qty;
                if (r.x.type === 'spins') S.availableSpins = (S.availableSpins || 0) + r.x.amount * r.qty;
                this.counts[r.x.id] = (this.counts[r.x.id] || 0) + r.qty;
                this.daily[r.x.id] = (this.daily[r.x.id] || 0) + r.qty;
                this.updateUI(r.newPoints);
                try { window.Utils.safeText('ticket-count-val', S.availableTickets); window.Utils.safeText('spin-count-val', S.availableSpins); } catch (e) {}
                try { if (window.Inventory) window.Inventory.refresh(); if (window.RxTab) { window.RxTab.n = S.availableTickets; window.RxTab.render(); } if (window.WheelTab) window.WheelTab.render(); } catch (e) {}
                const bal = document.querySelector('#modal-point-shop .ps2-balance');
                if (bal) {
                    const b = bal.querySelector('b'); b.classList.remove('drop'); void b.offsetWidth; b.classList.add('drop');
                    const f = document.createElement('span'); f.className = 'ps2-fly'; f.textContent = '−' + this.fmt(r.cost); bal.style.position = 'relative'; bal.appendChild(f); setTimeout(() => f.remove(), 1200);
                }
            },
            // Bấm "Đổi ngay" -> hiện bảng xác nhận
            buy: function(id) {
                if (this.busy) return;
                const x = this.items.find(i => i.id === id); if (!x) return;
                const q = this.qty[id] || 1, cost = x.cost * q, after = this.userPoints - cost, esc = this.esc;
                if (after < 0) return window.Utils.toast('Số dư điểm không đủ.', 'warning');
                const get = x.type === 'gift' ? `🎁 ${esc(x.name)}${q > 1 ? ' ×' + q : ''} (Ban Quản Trị trao tay)` : `+${x.amount * q} ${this.TYPE_NAME[x.type].toLowerCase()}`;
                this.pop('', `<div class="ps2-pop-ico">${esc(x.icon)}</div><h3>Xác nhận đổi quà?</h3><div class="ps2-pop-item">${esc(x.name)}${q > 1 ? ' ×' + q : ''}</div>
                    <div class="ps2-pop-rows"><div><span>Bạn nhận</span><b>${get}</b></div><div class="minus"><span>Trừ điểm</span><b>−${this.fmt(cost)}</b></div>
                    <div><span>Số dư hiện tại</span><b>${this.fmt(this.userPoints)}</b></div><div class="after"><span>Số dư sau khi đổi</span><b>${this.fmt(after)}</b></div></div>
                    <div class="ps2-pop-btns"><button class="no" onclick="window.PointShop.closePop()">Hủy</button><button class="yes" onclick="window.PointShop.confirmBuy('${id}', ${q})">Xác nhận đổi</button></div>`);
            },
            confirmBuy: function(id, q) {
                const x = this.items.find(i => i.id === id) || { icon: '🎁', name: '' };
                this.pop('', `<div class="ps2-pop-spin"></div><h3>Đang xử lý...</h3><div class="ps2-pop-item">${this.esc(x.name)}${q > 1 ? ' ×' + q : ''}</div>`);
                this.exchangeItem(id, q);
            },
            exchangeItem: async function(id, qty) {
                const S = window.State, me = S && S.currentUser;
                if (!me || !S.currentDocId) return window.Utils.toast('Phiên đăng nhập không hợp lệ.', 'error');
                qty = Math.max(1, Math.min(20, parseInt(qty) || 1));
                this.busy = id; this.render();
                let got = null;
                try {
                    // Máy chủ tự kiểm tra cấu hình / số dư / kho / giới hạn ngày rồi trừ điểm + cộng lượt (thành viên không tự cộng trừ được)
                    const r = await window.QDdb.act('shop.buy', { id: id, qty: qty });
                    const loc = this.items.find(i => i.id === id) || {};
                    got = { x: Object.assign({}, loc, r.x), cost: r.cost, what: r.what, qty: r.qty, newPoints: r.newPoints };
                    this.busy = false;
                    this.applyLocal(got);   // trừ điểm ngay trên màn hình
                    this.qty[id] = 1;
                    const isGift = got.x.type === 'gift', esc = this.esc;
                    this.pop('ok', `<div class="ps2-pop-ico">🎉</div><h3>Đổi quà thành công!</h3><div class="ps2-pop-item">${esc(got.x.icon)} ${esc(got.what)}</div>
                        <div class="ps2-pop-rows"><div class="plus"><span>${isGift ? 'Trạng thái' : 'Đã cộng vào túi đồ'}</span><b>${isGift ? '⏳ Chờ trao quà' : '+' + got.x.amount * got.qty + ' lượt'}</b></div>
                        <div class="minus"><span>Đã trừ</span><b>−${this.fmt(got.cost)} điểm</b></div><div class="after"><span>Số dư còn lại</span><b>${this.fmt(got.newPoints)} điểm</b></div></div>
                        ${isGift ? '<p style="font-size:12px;color:#d1fae5;margin:-4px 0 12px;">Ban Quản Trị sẽ liên hệ trao quà cho bạn. Theo dõi ở tab "Đơn quà của tôi".</p>' : ''}
                        <div class="ps2-pop-btns">${isGift ? `<button class="no" onclick="window.PointShop.closePop(); window.PointShop.setTab('orders')">Xem đơn quà</button>` : ''}<button class="yes" onclick="window.PointShop.closePop()">Tiếp tục đổi</button></div>`);
                    window.Utils.toast(`🎉 Đổi thành công ${got.what}! −${this.fmt(got.cost)} điểm`, "success");
                } catch (error) {
                    let msg = { CLOSED: 'Trạm Quy Đổi vừa đóng cửa.', GONE: 'Vật phẩm này không còn bán.', POINTS: 'Số dư điểm không đủ.', STOCK: 'Vật phẩm đã hết hàng.', DAILY: 'Bạn đã đạt giới hạn đổi vật phẩm này hôm nay.', BLOCKED: 'Tài khoản đang bị khóa.', LOGIN: 'Phiên đăng nhập hết hạn, hãy đăng nhập lại.' }[window.qdCode(error)];
                    if (!msg) { console.error(error); msg = window.qdErr('shop', error); }
                    this.busy = false;
                    this.pop('err', `<div class="ps2-pop-ico">😢</div><h3>Đổi quà chưa thành công</h3><div class="ps2-pop-item">${msg || 'Lỗi kết nối máy chủ, vui lòng thử lại.'}</div>
                        <p style="font-size:12px;color:#fecaca;margin:0 0 14px;">Bạn chưa bị trừ điểm.</p><div class="ps2-pop-btns"><button class="yes" onclick="window.PointShop.closePop()">Đã hiểu</button></div>`);
                }
                this.busy = false; this.render();
            },
            // tương thích code cũ
            attemptExchange: function(type) {
                const x = this.items.find(i => i.active && i.type === type && i.amount === 1) || this.items.find(i => i.active && i.type === type);
                if (!x) return window.Utils.toast('Vật phẩm này hiện không bán.', 'warning');
                this.exchangeItem(x.id, 1);
            },
            exchange: function(type) { this.attemptExchange(type); }
        };

        /** ÂM THANH KÉO BÚA BAO — tự tổng hợp bằng Web Audio (không tải file), phong cách Tết
            tap: bấm tìm trận | matchFound: ghép được đối thủ (trống lân + chiêng) | yourTurn: hiệp mới, tới lượt bạn
            oppLocked: đối thủ vừa khóa chiêu (mõ gõ 2 tiếng) | pick: bạn ra chiêu (Búa: trống, Kéo: tiếng kéo xoẹt, Bao: tiếng giấy)
            tick: 3 giây cuối | timeout: hết giờ | reveal: "oẳn - tù - tì" 3 tiếng trống + chũm chọe rồi báo thắng / thua / hòa hiệp
            matchWin: chiêng + pháo + đàn tranh vút lên | matchLose: cồng trầm + đàn tranh buồn | oppLeft: đối thủ rời phòng */
        window.RPSSound = {
            ctx: null, on: true, _str: {},
            NOTES: [261.63, 293.66, 349.23, 392.00, 440.00, 523.25, 587.33, 698.46, 783.99, 880.00, 1046.50, 1174.66, 1396.91],   // ngũ cung Đô Rê Fa Sol La

            init: function() { try { this.on = localStorage.getItem('qd_rps_sfx') !== '0'; } catch (e) {} this.renderBtn(); },
            toggle: function() {
                this.on = !this.on;
                try { localStorage.setItem('qd_rps_sfx', this.on ? '1' : '0'); } catch (e) {}
                this.renderBtn();
                if (this.on) this.play('yourTurn');
                else if (this._ducked) { this.duck(false); }
                if (this.on && window.RPSGame && window.RPSGame.roomId) this.duck(true);
            },
            renderBtn: function() {
                const b = document.getElementById('rps2-sfx'); if (!b) return;
                b.textContent = this.on ? '🔊' : '🔇'; b.setAttribute('aria-pressed', this.on ? 'true' : 'false');
                b.title = this.on ? 'Đang bật âm thanh trò chơi (bấm để tắt)' : 'Đang tắt âm thanh trò chơi (bấm để bật)';
                b.classList.toggle('off', !this.on);
            },
            // Gọi trong lúc người dùng bấm để trình duyệt cho phép phát tiếng
            unlock: function() {
                if (!this.on) return null;
                if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
                if (this.ctx.state === 'suspended') { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
                return this._bus();
            },
            play: function(name, arg) {
                if (!this.on || typeof this['_' + name] !== 'function' || !this.unlock()) return;
                const c = this.ctx, go = () => { try { this['_' + name](c.currentTime + 0.02, arg); } catch (e) {} };
                if (c.state === 'running') return go();
                const t0 = performance.now();   // chưa được phép phát: chỉ phát nếu mở khóa ngay, không dồn tiếng cũ
                c.resume().then(() => { if (performance.now() - t0 < 600) go(); }).catch(() => {});
            },
            // Nhạc nền nhỏ lại khi đang trong trận để nghe rõ tiếng trò chơi
            duck: function(on) {
                const M = window.Music; on = !!on && this.on;
                if (!M || typeof M.applyVolume !== 'function' || this._ducked === on) return;
                this._ducked = on; M.applyVolume(on ? M.vol * 0.35 : M.vol);
            },

            /* ---------- bộ tạo âm ---------- */
            _bus: function() {
                const c = this.ctx; if (this.out) return this.out;
                const comp = c.createDynamicsCompressor();
                comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.18;
                comp.connect(c.destination);
                this.out = c.createGain(); this.out.gain.value = 0.8; this.out.connect(comp);
                const dl = c.createDelay(1), fb = c.createGain(), lp = c.createBiquadFilter(), wet = c.createGain();
                dl.delayTime.value = 0.16; fb.gain.value = 0.28; lp.type = 'lowpass'; lp.frequency.value = 2400; wet.gain.value = 0.28;
                dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(comp);
                this.verb = c.createGain(); this.verb.connect(dl);
                return this.out;
            },
            _env: function(p, t, peak, decay, attack) {
                p.setValueAtTime(0.0001, t);
                p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + (attack || 0.003));
                p.exponentialRampToValueAtTime(0.0001, t + decay);
            },
            _noiseBuf: function() {
                if (this._nb) return this._nb;
                const c = this.ctx, len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
                for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
                return this._nb = b;
            },
            _noise: function(t, dur) { const s = this.ctx.createBufferSource(); s.buffer = this._noiseBuf(); s.start(t, Math.random() * 1.5, dur + 0.05); return s; },
            _filter: function(type, f, q) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; },
            _string: function(f) {   // dây đàn tranh (Karplus-Strong), tính 1 lần mỗi nốt
                const sr = this.ctx.sampleRate, N = Math.max(2, Math.round(sr / f));
                if (this._str[N]) return this._str[N];
                const len = Math.floor(sr * 1.8), b = this.ctx.createBuffer(1, len, sr), d = b.getChannelData(0), k = Math.pow(0.001, N / (sr * 1.5));
                let prev = 0;
                for (let i = 0; i < N; i++) { prev = prev * 0.35 + (Math.random() * 2 - 1) * 0.65; d[i] = prev * 0.8; }
                for (let i = N; i < len; i++) d[i] = k * 0.5 * (d[i - N] + (i - N - 1 >= 0 ? d[i - N - 1] : 0));
                return this._str[N] = b;
            },
            _pluck: function(t, f, vol, bend, dur) {
                const c = this.ctx, s = c.createBufferSource(), g = c.createGain(), N = Math.max(2, Math.round(c.sampleRate / f));
                dur = dur || 1.4; s.buffer = this._string(f);
                const r = f * (N + 0.5) / c.sampleRate;
                s.playbackRate.setValueAtTime(r, t);
                if (bend) { s.playbackRate.setValueAtTime(r, t + 0.09); s.playbackRate.linearRampToValueAtTime(r * bend, t + 0.26); s.playbackRate.linearRampToValueAtTime(r, t + 0.5); }
                g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(0.0001, t + dur * 0.65, dur * 0.12);
                s.connect(g); g.connect(this.out); g.connect(this.verb); s.start(t); s.stop(t + dur);
            },
            _clave: function(t, vol, f) {   // mõ / phách tre
                const c = this.ctx, o = c.createOscillator(), g = c.createGain(), n = this._noise(t, 0.04), bp = this._filter('bandpass', f, 7), g2 = c.createGain();
                o.type = 'triangle'; o.frequency.setValueAtTime(f * 0.5, t); o.frequency.exponentialRampToValueAtTime(f * 0.42, t + 0.05);
                this._env(g.gain, t, vol, 0.06, 0.001); this._env(g2.gain, t, vol * 1.4, 0.035, 0.001);
                o.connect(g); g.connect(this.out); n.connect(bp); bp.connect(g2); g2.connect(this.out); o.start(t); o.stop(t + 0.08);
            },
            _drum: function(t, vol) {   // trống lân "tùng"
                const c = this.ctx, o = c.createOscillator(), g = c.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(58, t + 0.16); o.frequency.exponentialRampToValueAtTime(48, t + 0.5);
                this._env(g.gain, t, vol, 0.5, 0.002); o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.55);
                const n = this._noise(t, 0.08), lp = this._filter('lowpass', 900), g2 = c.createGain();
                this._env(g2.gain, t, vol * 0.5, 0.07, 0.001); n.connect(lp); lp.connect(g2); g2.connect(this.out);
            },
            _cymbal: function(t, vol, len) {   // chũm chọe
                const c = this.ctx, n = this._noise(t, len), hp = this._filter('highpass', 4500), pk = this._filter('peaking', 8200, 1.2), g = c.createGain();
                pk.gain.value = 8; this._env(g.gain, t, vol, len, 0.002);
                n.connect(hp); hp.connect(pk); pk.connect(g); g.connect(this.out);
                [3120, 4370].forEach(f => { const o = c.createOscillator(), og = c.createGain(); o.type = 'square'; o.frequency.value = f; this._env(og.gain, t, vol * 0.08, len * 0.7, 0.002); o.connect(og); og.connect(hp); o.start(t); o.stop(t + len); });
            },
            _gong: function(t, vol, base, len) {   // chiêng / cồng
                const c = this.ctx;
                [[1, 1], [1.48, 0.55], [2.02, 0.42], [2.74, 0.3], [3.36, 0.18], [4.1, 0.12]].forEach(([m, a], i) => {
                    const o = c.createOscillator(), g = c.createGain(), f = base * m;
                    o.type = 'sine'; o.frequency.setValueAtTime(f * 1.012, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.5);
                    this._env(g.gain, t, vol * a, len / (1 + i * 0.35), 0.006 + i * 0.002);
                    o.connect(g); g.connect(this.out); g.connect(this.verb); o.start(t); o.stop(t + len);
                });
                const n = this._noise(t, 0.12), bp = this._filter('bandpass', base * 6, 1.5), g2 = c.createGain();
                this._env(g2.gain, t, vol * 0.35, 0.12, 0.001); n.connect(bp); bp.connect(g2); g2.connect(this.out);
            },
            _bell: function(t, f, vol) {
                const c = this.ctx;
                [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([m, a]) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f * m; this._env(g.gain, t, vol * a, 1.4 / m + 0.3, 0.002); o.connect(g); g.connect(this.out); g.connect(this.verb); o.start(t); o.stop(t + 1.8); });
            },
            _swish: function(t, vol, f0, f1, dur, q) {   // tiếng gió / kéo / giấy
                const c = this.ctx, n = this._noise(t, dur), bp = this._filter('bandpass', f0, q || 1.2), g = c.createGain();
                bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
                this._env(g.gain, t, vol, dur, dur * 0.3); n.connect(bp); bp.connect(g); g.connect(this.out);
            },
            _cracker: function(t, vol) {
                const c = this.ctx, d = 0.018 + Math.random() * 0.03, n = this._noise(t, d + 0.06), bp = this._filter('bandpass', 900 + Math.random() * 2600, 0.8), g = c.createGain();
                g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.0015); g.gain.exponentialRampToValueAtTime(vol * 0.25, t + d * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.05);
                n.connect(bp); bp.connect(g);
                if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.random() * 1.4 - 0.7; g.connect(p); p.connect(this.out); } else g.connect(this.out);
            },

            /* ---------- âm thanh theo tình huống ---------- */
            _tap: function(t) { this._drum(t, 0.3); this._clave(t + 0.1, 0.07, 2400); },
            _matchFound: function(t) {   // vào trận: tùng tùng cắc tùng - xèng! + chiêng
                const N = this.NOTES;
                [0, 0.14, 0.42].forEach((o, i) => this._drum(t + o, 0.34 + i * 0.03)); this._clave(t + 0.28, 0.1, 1800);
                this._cymbal(t + 0.56, 0.12, 0.6); this._gong(t + 0.56, 0.28, 131, 2.2);
                [5, 7, 9].forEach((ni, i) => this._pluck(t + 0.7 + i * 0.09, N[ni], 0.16));
            },
            _yourTurn: function(t) { const N = this.NOTES; this._pluck(t, N[8], 0.16, 0, 1); this._pluck(t + 0.1, N[10], 0.18, 0, 1.2); },
            _oppLocked: function(t) { this._clave(t, 0.1, 1700); this._clave(t + 0.09, 0.1, 2200); },
            _pick: function(t, c) {
                const N = this.NOTES;
                this._clave(t, 0.06, 3000);   // tiếng "chốt"
                if (c === 'rock') { this._drum(t, 0.42); this._pluck(t + 0.02, N[3], 0.14, 0, 0.9); }
                else if (c === 'scissors') { this._swish(t, 0.16, 2500, 7500, 0.09, 2.5); this._swish(t + 0.1, 0.16, 2800, 8000, 0.08, 2.5); this._pluck(t + 0.02, N[11], 0.14, 0, 0.9); }
                else { this._swish(t, 0.2, 900, 2600, 0.2, 0.7); this._pluck(t + 0.03, N[7], 0.14, 0, 0.9); }
            },
            _tick: function(t, sec) { this._clave(t, sec === 1 ? 0.13 : 0.09, sec === 1 ? 3200 : 2400); if (sec === 1) this._clave(t + 0.12, 0.1, 3200); },
            _timeout: function(t) { this._gong(t, 0.26, 82, 1.6); this._pluck(t + 0.05, this.NOTES[0], 0.16, 0.94, 1.4); },
            _reveal: function(t, res) {   // oẳn - tù - tì (khớp lúc 2 bàn tay lắc) ... ra!
                const N = this.NOTES;
                [0, 0.27, 0.53].forEach((o, i) => { this._drum(t + o, 0.28 + i * 0.04); this._clave(t + o, 0.05, 2200 + i * 300); });
                this._cymbal(t + 0.8, 0.12, 0.7);
                const r = t + 0.9;
                if (res === 'win') { [7, 9, 10].forEach((ni, i) => this._pluck(r + i * 0.08, N[ni], 0.2)); this._bell(r + 0.24, N[12] * 2, 0.06); }
                else if (res === 'lose') { [6, 4, 1].forEach((ni, i) => this._pluck(r + i * 0.13, N[ni], 0.18, i === 2 ? 0.95 : 0, 1.4)); }
                else { this._pluck(r, N[7], 0.18); this._pluck(r + 0.16, N[7], 0.18); this._clave(r + 0.32, 0.08, 2000); }
            },
            _matchWin: function(t) {   // chiêng + pháo + đàn tranh vút lên
                const N = this.NOTES;
                this._gong(t, 0.45, 98, 3.2); this._cymbal(t, 0.14, 1.2);
                for (let x = t + 0.08, end = t + 1.7; x < end; x += 0.02 + Math.random() * 0.06) this._cracker(x, 0.28 * (0.45 + Math.random() * 0.55));
                [0.2, 0.75].forEach(o => this._drum(t + o, 0.3));
                [5, 6, 7, 8, 9, 10, 11, 12].forEach((ni, i) => this._pluck(t + 0.3 + i * 0.065, N[ni], 0.18));
                [[0, 0.2, 0], [5, 0.18, 0], [8, 0.18, 0], [10, 0.24, 1.06]].forEach(([ni, v, b]) => this._pluck(t + 0.92, N[ni], v, b, 2.2));
            },
            _matchLose: function(t) {   // cồng trầm + câu đàn tranh buồn
                const N = this.NOTES;
                this._gong(t, 0.32, 73, 3);
                [[9, 0.2], [7, 0.48], [6, 0.76], [4, 1.04]].forEach(([ni, o]) => this._pluck(t + o, N[ni], 0.17));
                this._pluck(t + 1.4, N[2], 0.2, 0.94, 2.2); this._pluck(t + 1.4, N[0], 0.12, 0, 2.2);
            },
            _oppLeft: function(t) { this._drum(t, 0.24); this._pluck(t + 0.05, this.NOTES[2], 0.16, 0.95, 1.4); }
        };
        window.RPSSound.init();

        /** MODULE KÉO BÚA BAO MULTIPLAYER (giao diện Tết)
            - Dữ liệu phòng giữ nguyên như cũ (rps_rooms / rps_history / accounts.points) -> trang admin không cần sửa
            - Ghép trận: bỏ qua phòng chờ bị bỏ hoang (người tạo đã tắt trang), nhận phòng bằng giao dịch (2 người không vào trùng 1 phòng)
            - Chấm hiệp / sang hiệp / kết thúc trận chạy bằng giao dịch: chỉ 1 máy ghi, đối thủ thoát giữa chừng trận vẫn chạy tiếp
            - Hết giờ mà đối thủ không ra chiêu (kể cả đã tắt trang) -> đối thủ bị xử thua hiệp đó */
        window.RPSGame = {
            roomId: null, isPlayer1: false, unsubscribe: null,
            timerInt: null, hbInt: null, cdInt: null, nextT: null, revealT: null,
            myCurrentChoice: null, pending: null, lastStatus: null, lastKey: '', lastData: null,
            searching: false, finished: false, resolving: false, claiming: false, nextFor: '',
            STALE_MS: 90000,   // phòng chờ không có tín hiệu quá 90 giây = bỏ hoang
            HANDS: { rock: '✊', paper: '🖐️', scissors: '✌️', timeout: '⌛' },
            NAMES: { rock: 'Búa', paper: 'Bao', scissors: 'Kéo', timeout: 'Hết giờ' },

            getIcon: function(c) { return this.HANDS[c] || '❔'; },
            getChoiceName: function(c) { return this.NAMES[c] || 'Chưa ra chiêu'; },
            $: (id) => document.getElementById(id),
            setText: function(id, v) { const el = this.$(id); if (el) el.textContent = v; },
            setHTML: function(el, s) { if (!el) return; if (window.QDSmooth) window.QDSmooth.html(el, s); else el.innerHTML = s; },
            esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
            fmtPts: (n) => (n > 0 ? '+' : '') + n,
            room: function() { return db.collection("rps_rooms").doc(this.roomId); },
            keyOf: (d) => `${d.turn || 0}|${d.round}|${d.p1Score}|${d.p2Score}`,

            cfg: function() {
                const c = window.AppCore.rpsConfig || {}, n = (v, d) => { const x = parseInt(v); return isNaN(x) ? d : x; };
                return { isEnabled: c.isEnabled !== false, start: c.start || '00:00', end: c.end || '23:59',
                         fee: n(c.fee, 5), win: n(c.winReward, 10), lose: n(c.loseReward, -5), limit: Math.max(3, n(c.timeLimit, 10)) };
            },
            // 'open' | 'off' (admin tắt) | 'hours' (ngoài giờ)
            openState: function() {
                const c = this.cfg(); if (!c.isEnabled) return 'off';
                const toM = (s) => { const p = String(s).split(':').map(Number); return (p[0] || 0) * 60 + (p[1] || 0); };
                const d = new Date(), cur = d.getHours() * 60 + d.getMinutes(), s = toM(c.start), e = toM(c.end);
                return (s <= e ? (cur >= s && cur <= e) : (cur >= s || cur <= e)) ? 'open' : 'hours';   // hỗ trợ khung giờ qua đêm
            },

            /* ---------- Cấu hình / ô trang chủ / sảnh ---------- */
            applyConfig: function() {
                if (!this._tick) this._tick = setInterval(() => this.applyConfig(), 30000);   // tự mở/đóng theo giờ
                const c = this.cfg(), st = this.openState();
                this.setHTML(this.$('rps2-chips'), `<span>🎟️ Vào bàn: cần <b>${c.fee}</b> điểm</span><span class="ok">🏆 Thắng <b>${this.fmtPts(c.win)}</b></span><span class="bad">💀 Thua <b>${this.fmtPts(c.lose)}</b></span><span>⏱️ <b>${c.limit}s</b> / lượt</span><span>🕘 <b>${c.start} – ${c.end}</b></span>`);
                this.setText('rps-rules-text', 'Đấu 1 chọi 1, ai thắng 2 hiệp trước sẽ thắng trận.');
                const tab = this.$('rps-tab');
                if (tab) {
                    const inGame = !!this.roomId;
                    tab.dataset.state = st === 'open' || inGame ? 'open' : 'locked';
                    tab.classList.toggle('in-game', inGame);
                    this.setText('rps-tab-sub', inGame ? '● Đang thi đấu' : st === 'off' ? '🔒 Bảo trì' : st === 'hours' ? `Mở ${c.start} – ${c.end}` : `Vào bàn: ${c.fee} điểm`);
                    this.setText('rps-tab-go', inGame ? 'Chạm để quay lại trận đấu ›' : st === 'off' ? 'Đấu trường đang bảo trì' : st === 'hours' ? 'Ngoài giờ mở cửa' : 'Chạm để vào đấu trường ›');
                }
                this.renderLobbyBtn();
            },
            renderLobbyBtn: function() {
                const btn = this.$('btn-find-match'); if (!btn || this.searching) return;
                const c = this.cfg(), st = this.openState(), pts = window.State.availablePoints || 0;
                btn.disabled = st !== 'open';
                this.setHTML(btn, st === 'off' ? '🔒 ĐANG BẢO TRÌ' : st === 'hours' ? `🕘 MỞ CỬA LÚC ${this.esc(c.start)}` : '⚔️ TÌM ĐỐI THỦ NGAY');
                this.setText('rps2-lobby-note', st === 'off' ? 'Ban Quản Trị đang tạm đóng đấu trường.'
                    : st === 'hours' ? `Đấu trường mở từ ${c.start} đến ${c.end}.`
                    : pts < c.fee ? `Bạn cần ít nhất ${c.fee} điểm lì xì để vào bàn.` : 'Ghép trận tự động với người chơi đang chờ.');
            },
            updatePoints: function(points) { this.setText('rps-current-points', points); this.renderLobbyBtn(); },
            openFromTab: function() {
                window.RPSSound.unlock();
                const el = document.querySelector('.nav-item[onclick*="\'rps\'"]');
                window.UI.navigate('rps', el);
                document.querySelectorAll('.m-nav-item').forEach(n => n.classList.remove('active'));
                this.applyConfig();
                const w = document.querySelector('.workspace-area'); if (w && w.scrollTo) w.scrollTo({ top: 0 });
                window.scrollTo && window.scrollTo({ top: 0 });
            },
            back: function() { window.UI.navigate('dashboard', document.querySelector('.m-nav-item[onclick*="dashboard"]'), true); },

            /* ---------- Ghép trận ---------- */
            findMatch: async function() {
                if (this.roomId || this.searching) return;
                window.RPSSound.unlock();   // mở khóa âm thanh ngay trong cú bấm (để lát nữa ghép được trận còn phát tiếng)
                const c = this.cfg(), st = this.openState(), me = window.State.currentUser;
                if (st === 'off') return window.Utils.toast("Kéo Búa Bao hiện đang được bảo trì!", "warning");
                if (st === 'hours') return window.Utils.toast(`Đấu trường chỉ mở cửa từ ${c.start} đến ${c.end}!`, "error");
                if ((window.State.availablePoints || 0) < c.fee) return window.Utils.toast(`Bạn cần ít nhất ${c.fee} điểm để vào bàn!`, "error");
                const btn = this.$('btn-find-match');
                window.RPSSound.play('tap');
                this.searching = true; btn.disabled = true; this.setHTML(btn, '<span class="rps2-spin"></span> ĐANG TÌM ĐỐI THỦ...');
                try {
                    // Máy chủ ghép trận: vào phòng chờ lâu nhất, không có thì mở phòng mới
                    let r;
                    try { r = await window.QDdb.play('rps.find', {}); }
                    catch (e) {
                        const m = { OFF: "Kéo Búa Bao hiện đang được bảo trì!", HOURS: `Đấu trường chỉ mở cửa từ ${c.start} đến ${c.end}!`, FEE: `Bạn cần ít nhất ${c.fee} điểm để vào bàn!`, OWN_ROOM: "Bạn đang mở phòng ở tab khác!" }[e && e.code];
                        if (m) { this.searching = false; this.renderLobbyBtn(); return window.Utils.toast(m, e.code === 'OWN_ROOM' ? "warning" : "error"); }
                        throw e;
                    }
                    this.roomId = r.roomId; this.isPlayer1 = !!r.isPlayer1;
                    this.searching = false;
                    this.enterRoom();
                } catch (e) {
                    console.error('RPS findMatch', e);
                    this.searching = false; this.renderLobbyBtn();
                    window.Utils.toast("Lỗi kết nối máy chủ.", "error");
                }
            },

            enterRoom: function() {
                this.myCurrentChoice = null; this.pending = null; this.lastStatus = null; this.lastKey = ''; this.lastData = null;
                this.finished = false; this.nextFor = '';
                this.$('rps-lobby').hidden = true; this.$('rps-gameplay').hidden = false;
                const me = window.State.currentUser;
                this.setText('rps-my-name', me); this.setText('rps-my-avt', me.charAt(0).toUpperCase());
                this.unsubscribe = db.collection("rps_rooms").doc(this.roomId).onSnapshot(doc => {
                    if (!doc.exists) {
                        if (this.finished) return;
                        const wasWaiting = !this.lastStatus || this.lastStatus === 'waiting';
                        if (!wasWaiting) window.RPSSound.play('oppLeft');
                        this.leaveRoom('gone', wasWaiting ? "Phòng chờ đã đóng." : "Đối thủ đã rời phòng, trận đấu bị hủy.");
                        return;
                    }
                    const data = doc.data(); this.updateUI(data); this.checkGameLogic(data);
                }, err => { console.error('RPS room', err); });
                // Chủ phòng báo "còn ở đây" trong lúc chờ, để người khác không bỏ qua phòng
                if (this.isPlayer1) this.hbInt = setInterval(() => {
                    if (this.roomId && this.lastStatus === 'waiting') window.QDdb.act('rps.ping', { roomId: this.roomId }).catch(() => {});
                }, 20000);
                window.RPSSound.duck(true);
                this.applyConfig();
            },

            /* ---------- Vẽ giao diện theo dữ liệu phòng ---------- */
            updateUI: function(data) {
                const me = this.isPlayer1 ? 'p1' : 'p2', op = this.isPlayer1 ? 'p2' : 'p1';
                const oppName = data[op === 'p1' ? 'player1' : 'player2'];
                const key = this.keyOf(data), prev = this.lastStatus;
                if (key !== this.lastKey) { this.lastKey = key; this.pending = null; }
                const mine = (data[me + 'Choice'] !== 'hidden' && data[me + 'Choice']) || this.pending, theirs = data[op + 'Choice'];
                const myScore = data[me + 'Score'] || 0, oppScore = data[op + 'Score'] || 0;
                this.myCurrentChoice = mine || null; this.lastStatus = data.status; this.lastData = data;

                this.setText('rps-opp-name', oppName || 'Đang tìm...');
                this.setText('rps-opp-avt', oppName ? oppName.charAt(0).toUpperCase() : '?');
                this.setText('rps-my-score', myScore); this.setText('rps-opp-score', oppScore);
                this.setText('rps-round-label', data.status === 'finished' ? 'Kết thúc' : data.status === 'waiting' ? 'Phòng chờ' : `Hiệp ${data.round || 1}`);
                const pips = (id, n) => { const el = this.$(id); if (el) Array.from(el.children).forEach((p, i) => p.classList.toggle('on', i < n)); };
                pips('rps-my-pips', myScore); pips('rps-opp-pips', oppScore);

                const sMe = this.$('rps2-slot-me'), sOp = this.$('rps2-slot-opp');
                const slot = (el, hand, cap, cls) => {
                    el.className = 'rps2-slot ' + (el === sMe ? 'me' : 'opp') + (cls ? ' ' + cls : '');
                    this.setText(el === sMe ? 'rps2-hand-me' : 'rps2-hand-opp', hand);
                    this.setText(el === sMe ? 'rps2-cap-me' : 'rps2-cap-opp', cap);
                };
                const status = (txt, tone) => { const el = this.$('rps-status-text'); el.textContent = txt; el.className = 'rps2-status' + (tone ? ' ' + tone : ''); };
                const canPick = data.status === 'playing' && !mine;
                const picks = this.$('rps-controls');
                picks.classList.toggle('ready', canPick);
                ['rock', 'paper', 'scissors'].forEach(c => { const b = this.$('btn-' + c); if (b) { b.disabled = !canPick; b.classList.toggle('selected', mine === c); } });

                if (data.status === 'waiting') {
                    slot(sMe, '✊', 'Sẵn sàng', 'thinking'); slot(sOp, '🔍', 'Đang tìm đối thủ...', 'thinking');
                    status('Đang chờ đối thủ vào bàn... Bạn có thể ở lại trang này.');
                } else if (data.status === 'playing') {
                    clearTimeout(this.revealT);
                    slot(sMe, mine ? this.getIcon(mine) : '❔', mine ? `Bạn ra ${this.getChoiceName(mine)}` : 'Chọn chiêu bên dưới', mine ? 'locked' : '');
                    slot(sOp, theirs ? '🧧' : '💭', theirs ? 'Đã ra chiêu!' : 'Đang suy nghĩ...', theirs ? 'locked' : 'thinking');
                    if (mine) status('Đã khóa chiêu! Chờ đối thủ...');
                    else if (theirs) status('Đối thủ đã ra chiêu, nhanh tay lên!', 'warn');
                    else status(prev === 'revealing' && data.round === (this._lastRound || 0) ? 'Hòa! Đấu lại hiệp này, ra chiêu đi!' : 'Đến lượt bạn ra chiêu!');
                    if (prev === 'waiting') { window.RPSSound.play('matchFound'); if (navigator.vibrate) navigator.vibrate([60, 40, 60]); }   // vừa ghép được đối thủ
                    else if (prev === 'revealing' && !mine) window.RPSSound.play('yourTurn');   // sang hiệp mới
                    if (theirs && !mine && prev === 'playing' && this._oppSeen !== key) window.RPSSound.play('oppLocked');   // đối thủ vừa khóa chiêu
                    if (theirs) this._oppSeen = key;
                } else if (data.status === 'revealing' || data.status === 'finished') {
                    const w = data.roundWinner, iWin = w === me, draw = w === 'draw';
                    const show = () => {
                        slot(sMe, this.getIcon(mine), this.getChoiceName(mine), (draw ? 'draw' : iWin ? 'win' : 'lose') + (prev === 'playing' ? ' reveal' : ''));
                        slot(sOp, this.getIcon(theirs), this.getChoiceName(theirs), (draw ? 'draw' : iWin ? 'lose' : 'win') + (prev === 'playing' ? ' reveal' : ''));
                        if (data.status === 'finished') status(myScore > oppScore ? '🎉 Bạn đã thắng trận!' : '💀 Bạn đã thua trận!', myScore > oppScore ? 'good' : 'bad');
                        else if (draw) status(`Hòa! Cả hai cùng ra ${this.getChoiceName(mine)}.`, 'warn');
                        else if (iWin) status(`Bạn thắng hiệp này! ${this.getChoiceName(mine)} thắng ${this.getChoiceName(theirs)}.`, 'good');
                        else status(`Bạn thua hiệp này! ${this.getChoiceName(theirs)} thắng ${this.getChoiceName(mine)}.`, 'bad');
                    };
                    if (prev === 'playing') {   // oẳn tù tì... ra!
                        window.RPSSound.play('reveal', draw ? 'draw' : iWin ? 'win' : 'lose');
                        slot(sMe, '✊', 'Oẳn tù tì...', 'shake'); slot(sOp, '✊', 'Oẳn tù tì...', 'shake');
                        status('Oẳn tù tì... ra cái gì ra cái này!');
                        clearTimeout(this.revealT); this.revealT = setTimeout(show, 800);
                    } else if (prev !== data.status || !this.revealT) show();
                    this._lastRound = data.round;
                    if (data.status === 'finished' && !this.finished) {
                        this.finished = true;
                        setTimeout(() => { if (this.roomId) this.showResult(data); }, prev === 'playing' ? 1500 : 700);
                    }
                }
                this.renderTimer(data, mine, theirs);
                if (prev !== data.status) this.applyConfig();
            },

            renderTimer: function(data, mine, theirs) {
                const box = this.$('rps2-timer');
                const active = data.status === 'playing' && data.deadline && !(mine && theirs);
                box.hidden = !active;
                if (!active) { if (this.timerInt) { clearInterval(this.timerInt); this.timerInt = null; } return; }
                this.deadline = data.deadline;
                if (this.timerInt) return;
                const total = this.cfg().limit * 1000 + 500;
                const tick = () => {
                    const left = this.deadline - Date.now();
                    this.setText('rps-timer', Math.max(0, Math.ceil(left / 1000)));
                    const bar = this.$('rps2-timer-bar'); if (bar) bar.style.setProperty('--p', Math.max(0, Math.min(1, left / total)).toFixed(3));
                    box.classList.toggle('urgent', left < 3500);
                    const sec = Math.ceil(left / 1000);   // tiếng mõ đếm 3 giây cuối khi mình chưa ra chiêu
                    if (sec !== this._lastSec) { this._lastSec = sec; if (sec > 0 && sec <= 3 && !this.myCurrentChoice) window.RPSSound.play('tick', sec); }
                    if (left <= 0 && this.lastStatus === 'playing') {
                        if (!this.myCurrentChoice) {
                            this.makeChoice('timeout');
                            window.Utils.toast("Hết thời gian! Bạn bị xử thua hiệp này.", "error");
                        } else if (left < -1500) this.claimTimeout();   // đối thủ không ra chiêu (có thể đã tắt trang)
                    }
                };
                tick(); this.timerInt = setInterval(tick, 250);
            },

            /* ---------- Ra chiêu ---------- */
            makeChoice: async function(choice) {
                if (!this.roomId || this.myCurrentChoice || this.lastStatus !== 'playing') return;
                this.pending = choice; this.myCurrentChoice = choice;
                window.RPSSound.play(choice === 'timeout' ? 'timeout' : 'pick', choice);
                if (this.lastData) this.updateUI(this.lastData);   // hiện ngay, không đợi máy chủ
                if (choice !== 'timeout' && navigator.vibrate) navigator.vibrate(15);
                try {
                    await window.QDdb.act('rps.move', { roomId: this.roomId, choice: choice });   // máy chủ giữ chiêu, đối thủ chỉ thấy "đã ra chiêu"
                } catch (e) {
                    console.error('RPS choice', e);
                    this.pending = null; this.myCurrentChoice = null;
                    if (this.lastData) this.updateUI(this.lastData);
                    window.Utils.toast("Không gửi được chiêu, thử lại nhé.", "error");
                }
            },
            claimTimeout: function() {},   // máy chủ tự xử thua hiệp khi hết giờ

            /* ---------- Chấm hiệp / sang hiệp / kết thúc ---------- */
            judge: function(a, b) {
                if (a === b) return 'draw';
                if (a === 'timeout') return 'p2'; if (b === 'timeout') return 'p1';
                return ({ rock: 'scissors', scissors: 'paper', paper: 'rock' })[a] === b ? 'p1' : 'p2';
            },
            // Lật bài / sang hiệp / kết thúc trận / cộng trừ điểm: máy chủ làm (đúng giờ, không phụ thuộc ai còn mở trang)
            checkGameLogic: function() {},

            /* ---------- Kết quả trận ---------- */
            showResult: function(d) {
                const me = this.isPlayer1 ? 'p1' : 'p2', op = this.isPlayer1 ? 'p2' : 'p1';
                const my = d[me + 'Score'] || 0, their = d[op + 'Score'] || 0, won = my > their, c = this.cfg();
                const opp = d[op === 'p1' ? 'player1' : 'player2'] || 'đối thủ';
                const box = this.$('rps2-result-box'); box.classList.toggle('lose', !won);
                this.setText('rps-result-icon', won ? '🏆' : '😵');
                this.setText('rps-result-title', won ? 'Chiến thắng!' : 'Thua mất rồi!');
                this.setText('rps2-res-score', `${my} : ${their}`);
                this.setText('rps-result-desc', won ? `Bạn đã hạ gục ${opp}. Lộc đầu xuân về túi rồi!` : `${opp} đã thắng trận này. Đấu tiếp để gỡ lộc nhé!`);
                this.setText('rps2-res-pts', `${this.fmtPts(won ? c.win : c.lose)} điểm lì xì`);
                const fx = this.$('rps2-fx');
                if (fx) this.setHTML(fx, won ? Array.from({ length: 16 }, (_, i) => `<i style="left:${(i * 6.3 + Math.random() * 4).toFixed(1)}%;animation-delay:${(Math.random() * .6).toFixed(2)}s">${['🧧', '✨', '🎉', '🌸'][i % 4]}</i>`).join('') : '');
                window.UI.openModal('modal-rps-result');
                window.RPSSound.play(won ? 'matchWin' : 'matchLose');
                if (navigator.vibrate) navigator.vibrate(won ? [80, 50, 80, 50, 160] : 200);
                let n = 8; this.setText('rps2-res-cd', n);
                clearInterval(this.cdInt);
                this.cdInt = setInterval(() => { n--; this.setText('rps2-res-cd', Math.max(0, n)); if (n <= 0) { clearInterval(this.cdInt); this.leaveRoom('quiet'); } }, 1000);
            },
            playAgain: async function() { await this.leaveRoom('quiet'); this.findMatch(); },

            /* ---------- Rời phòng ---------- */
            leaveRoom: async function(mode, msg) {
                [this.timerInt, this.hbInt, this.cdInt].forEach(clearInterval); clearTimeout(this.nextT); clearTimeout(this.revealT);
                this.timerInt = this.hbInt = this.cdInt = this.nextT = this.revealT = null;
                if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
                const id = this.roomId; this.roomId = null;
                if (id && mode !== 'gone') { try { await window.QDdb.act('rps.leave', { roomId: id }); } catch (e) {} }
                this.resetLobby(mode === 'quiet' ? null : (msg || "Đã rời phòng đấu."));
            },
            resetLobby: function(msg) {
                this.roomId = null; this.myCurrentChoice = null; this.pending = null; this.lastStatus = null; this.lastData = null; this.searching = false;
                window.UI.closeModal('modal-rps-alert');
                window.UI.closeModal('modal-rps-result');
                this.$('rps-lobby').hidden = false; this.$('rps-gameplay').hidden = true; this.$('rps2-timer').hidden = true;
                window.RPSSound.duck(false);
                if (window.State.currentDocId) {
                    db.collection("accounts").doc(window.State.currentDocId).get().then(doc => {
                        if (doc.exists) { window.State.availablePoints = doc.data().points || 0; this.updatePoints(window.State.availablePoints); }
                    }).catch(() => {});
                }
                this.applyConfig();
                if (msg) window.Utils.toast(msg, "info");
            }
        };

        window.addEventListener('beforeunload', () => {
            if (window.RPSGame.roomId) window.RPSGame.leaveRoom();
        });

        /** 9. APPLICATION CORE */
        window.AppCore = {
            attConfig: { start: "09:00", end: "10:00", antiProxyEnabled: true }, 
            hasAttendedToday: false,
            isProcessingAttendance: false,
            rpsConfig: null,
            
            lockFeatureUI: (featureId, isEnabled) => {
                const btn = document.getElementById(`btn-nav-${featureId}`);
                const mNav = document.getElementById(`m-nav-${featureId}`);
                const desc = document.getElementById(`${featureId === 'wheel' ? 'wheel' : (featureId === 'tranhthuong' ? 'tt' : 'shop')}-desc-text`);
                
                if(!isEnabled) {
                    if(btn) btn.classList.add('locked');
                    if(mNav) mNav.classList.add('locked');
                    if(desc) desc.innerText = "Chức năng đang bảo trì / Đóng bởi Admin.";
                    
                    const activeView = document.querySelector('.view-section.active');
                    if(activeView && activeView.id === `view-${featureId}`) {
                        window.UI.navigate('dashboard');
                        Utils.toast("Tính năng này vừa bị khóa bảo trì!", "warning");
                    }
                } else {
                    if(btn) btn.classList.remove('locked');
                    if(mNav) mNav.classList.remove('locked');
                    if(desc) {
                        if(featureId === 'wheel') desc.innerText = "Thử vận may với vòng quay 8 ô nhận ngay thẻ cào.";
                        else if(featureId === 'tranhthuong') desc.innerText = "Xé thẻ lật quà để rinh phần thưởng bí mật mỗi ngày.";
                        else if(featureId === 'pointshop') desc.innerText = "Dùng điểm lì xì đổi lượt rút lì xì, lượt ném còn.";
                    }
                }
            },

            init: () => {
                setInterval(() => { const lc = document.getElementById('live-clock'); if(lc) { lc.innerText = new Date().toLocaleTimeString('vi-VN', { hour12: false }); } }, 1000);
                const dateVN = Utils.getTodayString(); Utils.safeText('att-badge-date', dateVN);

                window.PointShop.init();

                db.collection("settings").doc("registration_config").onSnapshot(doc => {
                    const btn = document.querySelector('#modal-registration .btn-primary');
                    if (doc.exists) {
                        const data = doc.data();
                        let isLocked = data.isEnabled === false;
                        
                        if (!isLocked && data.endDate && data.endTime) {
                            const dlStr = `${data.endDate}T${data.endTime}`;
                            const deadline = new Date(dlStr).getTime();
                            if (Date.now() >= deadline) {
                                isLocked = true;
                            }
                        }

                        if (btn) {
                            if (isLocked) {
                                btn.disabled = true;
                                btn.innerHTML = `<i class="fa-solid fa-lock mr-2"></i> Hệ Thống Đăng Ký Đã Đóng`;
                                btn.style.filter = 'grayscale(1)';
                                btn.style.cursor = 'not-allowed';
                            } else {
                                btn.disabled = false;
                                btn.innerHTML = `<i class="fa-solid fa-paper-plane mr-2"></i> Gửi Yêu Cầu Đăng Ký`;
                                btn.style.filter = 'none';
                                btn.style.cursor = 'pointer';
                            }
                        }
                    }
                });

                db.collection("settings").doc("rps_config").onSnapshot(doc => {
                    window.AppCore.rpsConfig = doc.exists ? doc.data() : { isEnabled: true, start: "00:00", end: "23:59", fee: 5, winReward: 10, loseReward: -5, timeLimit: 10 };
                    if (window.RPSGame) window.RPSGame.applyConfig();
                });

                db.collection("accounts").doc(State.currentDocId).onSnapshot(doc => {
                    if(doc.exists) {
                        const data = doc.data();

                        // Nếu bị admin/hệ thống khóa tài khoản khi đang truy cập
                        if (data.isBlocked === true) {
                            window.Utils.toast("Tài khoản của bạn đã bị hệ thống khóa do không hoạt động!", "error");
                            
                            window.Auth.pendingLockedId = State.currentDocId;
                            window.Auth.pendingLockedData = data;
                            
                            // Đẩy ra ngoài màn hình đăng nhập
                            document.getElementById('auth-gate').style.display = 'flex';
                            document.getElementById('auth-gate').style.opacity = '1';
                            document.getElementById('app-shell').style.display = 'none';
                            if(window.HomeVideo) window.HomeVideo.stop();
                            if(window.LiXi) window.LiXi.stop();
                            if(window.WheelTab) window.WheelTab.stop(); if(window.RxTab) window.RxTab.stop(); if(window.LnTab) window.LnTab.stop();

                            if (data.unlockRequestedAt) {
                                document.getElementById('unlock-action-area').style.display = 'none';
                                document.getElementById('unlock-countdown-area').style.display = 'block';
                                window.Auth.requestUnlock();
                            } else {
                                document.getElementById('unlock-action-area').style.display = 'block';
                                document.getElementById('unlock-countdown-area').style.display = 'none';
                            }
                            
                            window.UI.openModal('modal-account-locked');
                            
                            State.currentUser = null;
                            State.currentDocId = null;
                            if(State.heartbeatInterval) clearInterval(State.heartbeatInterval);
                            return; 
                        }

                        State.availableSpins = data.spins || 0;
                        State.availableTickets = data.tickets || 0;
                        State.availablePoints = data.points || 0;
                        if (window.Inventory) window.Inventory.refresh();
                        if (window.Avatar) window.Avatar.apply(data.avatar);   // ảnh đại diện: đổi / xóa ở máy khác cũng cập nhật ngay
                        if (window.InviteUI) window.InviteUI.onAcc(data);       // mã mời: số người đã mời, đã nhập mã (đồng bộ mọi máy)
                        if (window.GiftUI) window.GiftUI.onAcc(data);         // tặng lượt: số dư từng loại + số lần đã tặng hôm nay

                        Utils.safeText('spin-count-val', State.availableSpins);
                        Utils.safeText('ticket-count-val', State.availableTickets);
                        
                        window.PointShop.updateUI(State.availablePoints);
                        window.RPSGame.updatePoints(State.availablePoints);

                        const wheelCont = document.getElementById('wheel-container-ui');
                        if(wheelCont) {
                            if(State.availableSpins > 0) wheelCont.classList.add('ready');
                            else wheelCont.classList.remove('ready');
                        }

                        if(window.Wheel && !window.Wheel.isSpinning) {
                            const btn = document.getElementById('spinBtn');
                            if(btn) {
                                if(State.availableSpins <= 0) { btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-ban mr-2"></i> ĐÃ HẾT LƯỢT`; }
                                else { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-play mr-2"></i> BẮT ĐẦU QUAY`; }
                            }
                        }
                    }
                });

                db.collection("settings").doc("wheel_config").onSnapshot(doc => {
                    let isEnabled = true;
                    if(doc.exists) {
                        const data = doc.data();
                        if(data.prizes) State.wheelPrizes = data.prizes;
                        if(data.isEnabled !== undefined) isEnabled = data.isEnabled;
                        
                        if (isEnabled && data.endDate && data.endTime) {
                            const deadline = new Date(`${data.endDate}T${data.endTime}`).getTime();
                            if (Date.now() >= deadline) isEnabled = false;
                        }
                    } else {
                        State.wheelPrizes = [{text:"10K", chance:10}, {text:"Chúc May Mắn", chance:90}];
                    }
                    window.AppCore.lockFeatureUI('wheel', isEnabled);
                    window.Wheel.init();
                });

                db.collection("settings").doc("tranhthuong_config").onSnapshot(doc => {
                    let isEnabled = true;
                    if(doc.exists) {
                        const data = doc.data();
                        if(data.prizes) State.ticketPrizes = data.prizes;
                        if(data.isEnabled !== undefined) isEnabled = data.isEnabled;
                        
                        if (isEnabled && data.endDate && data.endTime) {
                            const deadline = new Date(`${data.endDate}T${data.endTime}`).getTime();
                            if (Date.now() >= deadline) isEnabled = false;
                        }
                    } else {
                        State.ticketPrizes = [{text:"10K", chance:10}, {text:"Chúc May Mắn", chance:90}];
                    }
                    window.AppCore.lockFeatureUI('tranhthuong', isEnabled);
                    window.TranhThuong.init();
                });

                db.collection("settings").doc("attendance").onSnapshot(doc => { 
                    if(doc.exists) { 
                        window.AppCore.attConfig.start = doc.data().start || "09:00"; 
                        window.AppCore.attConfig.end = doc.data().end || "10:00"; 
                        window.AppCore.attConfig.antiProxyEnabled = doc.data().antiProxyEnabled !== false;
                        window.AppCore.evalAtt(); 
                    } 
                });
                
                db.collection("attendance").where("date", "==", dateVN).where("userName", "==", State.currentUser).onSnapshot(snap => { window.AppCore.hasAttendedToday = !snap.empty; window.AppCore.evalAtt(); });
                setInterval(window.AppCore.evalAtt, 1000); 

                db.collection("attendance").where("date", "==", dateVN).onSnapshot(snap => {
                    // NHANH: giữ danh sách điểm danh hôm nay (đang nghe trực tiếp) để kiểm tra trùng IP / trùng người ngay trên máy
                    window.AppCore.attToday = { date: dateVN, synced: !snap.metadata.fromCache, rows: snap.docs.map(d => d.data()) };
                    const l = document.getElementById('att-history-list'); if(!l) return; l.innerHTML = ""; if(snap.empty) { l.innerHTML = `<div class="p-10 text-center text-muted"><i class="fa-solid fa-list-ul text-4xl mb-4 opacity-30 block"></i>Chưa có ai điểm danh trong ngày hôm nay.</div>`; return; }
                    let rs = []; snap.forEach(doc => rs.push(doc.data())); rs.sort((a,b) => b.timestamp - a.timestamp);
                    rs.forEach(d => { l.insertAdjacentHTML('beforeend', `<div class="flex justify-between items-center p-5 border-b border-strong" style="border-bottom: 1px solid var(--border-strong);"><div class="flex items-center gap-4"><div class="avatar-circle" style="width:46px;height:46px;font-size:18px;background:var(--color-success);">${String(d.userName || '?').charAt(0).toUpperCase()}</div><div class="flex-col"><span class="font-bold text-main text-lg">${d.userName || 'Không rõ'}</span><span class="text-sm text-muted font-mono tracking-wide">ID: ${String(d.userId || '—').substring(0,8)}...</span></div></div><span class="badge badge-offline px-4 py-2 text-sm"><i class="fa-regular fa-clock mr-1"></i> ${d.time}</span></div>`); });
                });

                db.collection("news").orderBy("time", "desc").onSnapshot(snap => {
                    const f = document.getElementById('news-feed-list'); 
                    const p = document.getElementById('dash-news-preview'); 
                    if(!f) return; 
                    f.innerHTML = "";
                    
                    if(snap.empty) { 
                        f.innerHTML = `
                            <div class="card p-10 text-center border-strong bg-elevated mb-0" style="border-radius: var(--radius-xl);">
                                <div style="font-size: 40px; color: var(--text-muted); opacity: 0.5; margin-bottom: 15px;">
                                    <i class="fa-regular fa-newspaper"></i>
                                </div>
                                <h4 class="text-muted font-normal m-0 text-lg">Hiện chưa có bản tin nào từ hệ thống.</h4>
                            </div>`; 
                        if(p) p.innerHTML = `<h3 class="text-xl mb-2">Bản Tin Cập Nhật</h3><span class="text-muted italic">Không có dữ liệu bản tin.</span>`; 
                        return; 
                    }
                    
                    let isF = true;
                    snap.forEach(doc => {
                        const d = doc.data(); 
                        const tRaw = Number(d.time || d.timestamp || d.createdAt || d.created_at) || (d.time && d.time.toMillis ? d.time.toMillis() : 0);
                        const ts = tRaw ? new Date(tRaw).toLocaleString('vi-VN', {hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'}) : 'Không rõ thời gian';   // không còn "Invalid Date"
                        
                        f.insertAdjacentHTML('beforeend', `
                            <div class="card mb-6 p-6 relative overflow-hidden" style="border: none; border-left: 4px solid var(--color-info); background: var(--bg-surface); box-shadow: var(--shadow-sm); border-radius: var(--radius-lg); transition: transform 0.2s ease;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
                                <div class="flex items-start gap-4 mb-4 border-b border-strong pb-4">
                                    <div class="flex-shrink-0" style="width: 48px; height: 48px; border-radius: 12px; background: var(--color-info-bg); color: var(--color-info); display: flex; align-items: center; justify-content: center; font-size: 20px;">
                                        <i class="fa-solid fa-bell fa-shake" style="--fa-animation-duration: 3s;"></i>
                                    </div>
                                    <div class="flex-col justify-center">
                                        <h3 class="text-lg font-bold m-0" style="color: var(--text-main); letter-spacing: 0.5px;">THÔNG BÁO HỆ THỐNG</h3>
                                        <div class="text-sm text-muted mt-1 font-medium">
                                            <i class="fa-regular fa-clock mr-1"></i> Phát hành: ${ts}
                                        </div>
                                    </div>
                                </div>
                                <div class="text-main" style="font-size: 15px; line-height: 1.8; white-space: pre-wrap; padding-left: 4px;">${qdH(d.content)}</div>
                            </div>`);
                            
                        if(isF && p) { 
                            p.innerHTML = `
                                <div class="flex justify-between items-center mb-3">
                                    <div class="flex items-center gap-2">
                                        <div class="flex items-center justify-center rounded-md" style="width: 30px; height: 30px; background: var(--color-warning-bg); color: var(--color-warning);">
                                            <i class="fa-solid fa-fire text-sm"></i>
                                        </div>
                                        <h3 class="text-lg m-0 font-bold">Tin Tức Mới</h3>
                                    </div>
                                    <div class="badge badge-warning px-3 py-1" style="animation: pulseAlert 2s infinite;">MỚI NHẤT</div>
                                </div>
                                <div class="text-muted font-medium mb-3 pl-3 py-1" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden; font-size: 14px; border-left: 3px solid var(--border-strong);">
                                    ${qdH(d.content)}
                                </div>
                                <div class="text-xs text-muted font-bold pl-3">
                                    <i class="fa-regular fa-calendar-check mr-1"></i> ${ts}
                                </div>`; 
                            isF = false; 
                        }
                    });
                });

                db.collection("tournament").orderBy("timestamp", "desc").onSnapshot(snap => {
                    window.State.tournamentData = [];
                    const displayArea = document.getElementById('tournament-display-area');
                    if(!displayArea) return;
                    if(snap.empty) { displayArea.innerHTML = `<div class="p-10 text-center text-muted">Chưa có danh sách thi đấu do Ban Quản Trị thiết lập.</div>`; return; }
                    snap.forEach(doc => { window.State.tournamentData.push(doc.data()); });
                    window.AppCore.renderTournamentFilters();
                    window.AppCore.renderTournamentView('all_members'); 
                });
            },

            renderTournamentFilters: () => {
                const filtersContainer = document.getElementById('tournament-team-filters');
                if (!filtersContainer) return;
                filtersContainer.className = 'flex-col gap-3 mb-6';
                filtersContainer.style.display = 'flex';
                filtersContainer.innerHTML = `
                    <div class="flex gap-3 w-full">
                        <button class="btn btn-primary flex-1" onclick="window.AppCore.renderTournamentView('all_members', this)">Các Thành Viên</button>
                        <button class="btn btn-outline flex-1" onclick="window.AppCore.renderTournamentView('all_teams', this)">Các Đội</button>
                    </div>
                    <button class="btn btn-outline w-full" style="padding: 14px 0; font-size: 15px;" onclick="window.AppCore.renderTournamentView('leaderboard', this)">
                        <i class="fa-solid fa-ranking-star text-warning mr-2" style="font-size: 18px;"></i> Bảng Điểm Quân Đoàn
                    </button>
                `;
            },

            renderTournamentView: (mode, btnElement = null) => {
                const displayArea = document.getElementById('tournament-display-area');
                if (!displayArea) return;

                if (btnElement) {
                    document.querySelectorAll('#tournament-team-filters .btn').forEach(b => {
                        b.classList.remove('btn-primary'); b.classList.add('btn-outline');
                    });
                    btnElement.classList.remove('btn-outline'); btnElement.classList.add('btn-primary');
                }

                const data = window.State.tournamentData;
                let renderHtml = '';

                if (mode === 'all_members') {
                    renderHtml += `
                        <div class="table-responsive">
                            <table class="w-full text-left" style="border-collapse: collapse; min-width: 450px;">
                                <thead>
                                    <tr style="background: var(--bg-surface); border-bottom: 1px solid var(--border-strong);">
                                        <th class="p-4 text-muted text-sm uppercase" style="width: 60px; text-align: center;">STT</th>
                                        <th class="p-4 text-muted text-sm uppercase">Tài Khoản</th>
                                        <th class="p-4 text-muted text-sm uppercase">Tên Ingame</th>
                                        <th class="p-4 text-muted text-sm uppercase">Mã ID Game</th>
                                        <th class="p-4 text-muted text-sm uppercase">Tên Đội</th>
                                        <th class="p-4 text-muted text-sm uppercase text-right hidden-mobile">Ngày Thêm</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;
                    
                    data.forEach((d, index) => {
                        const timeStr = new Date(d.timestamp).toLocaleDateString('vi-VN');
                        const teamName = d.team || 'Chưa phân đội';
                        renderHtml += `
                            <tr style="border-bottom: 1px solid var(--border-strong); transition: 0.2s;" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='transparent'">
                                <td class="p-4 font-bold text-muted text-center">${index + 1}</td>
                                <td class="p-4">
                                    <div class="flex items-center gap-3">
                                        <div class="avatar-circle" style="width:36px; height:36px; font-size:14px; background:var(--brand-primary-soft); color:var(--brand-primary);">${qdH(d.username.charAt(0).toUpperCase())}</div>
                                        <b class="text-main">${qdH(d.username)}</b>
                                    </div>
                                </td>
                                <td class="p-4"><span class="text-main font-bold">${qdH(d.ingame || '---')}</span></td>
                                <td class="p-4"><span class="badge badge-warning px-3 py-1" style="font-size: 13px; font-family: var(--font-family-mono); letter-spacing: 1px;">${qdH(d.gameId || 'Chưa cập nhật')}</span></td>
                                <td class="p-4"><span class="badge badge-offline px-3 py-1" style="font-size: 12px;">${qdH(teamName)}</span></td>
                                <td class="p-4 text-muted text-sm text-right hidden-mobile"><i class="fa-regular fa-clock mr-1"></i> ${timeStr}</td>
                            </tr>`;
                    });
                    renderHtml += `</tbody></table></div>`;
                    
                } else if (mode === 'all_teams') {
                    let teamsToRender = {};
                    data.forEach(d => {
                        const t = d.team || "Chưa phân đội";
                        if(!teamsToRender[t]) teamsToRender[t] = [];
                        teamsToRender[t].push(d);
                    });

                    for (const [tName, members] of Object.entries(teamsToRender)) {
                        let teamColor = "var(--text-muted)";
                        if(tName.includes("1") || tName.includes("Đỏ")) teamColor = "var(--color-danger)";
                        else if(tName.includes("2") || tName.includes("Xanh")) teamColor = "var(--color-info)";
                        else if(tName.includes("Bị")) teamColor = "var(--color-warning)";

                        renderHtml += `
                            <div style="border-bottom: 4px solid var(--bg-body);">
                                <div class="p-5 font-bold text-xl flex items-center gap-3" style="background: var(--bg-elevated); color: ${teamColor}; border-left: 4px solid ${teamColor};">
                                    <i class="fa-solid fa-users"></i> ${qdH(tName.toUpperCase())} 
                                    <span class="text-muted text-sm font-normal ml-2">(${members.length} Tuyển thủ)</span>
                                </div>
                                <div class="table-responsive">
                                    <table class="w-full text-left" style="border-collapse: collapse; min-width: 450px;">
                                        <thead>
                                            <tr style="background: var(--bg-surface); border-bottom: 1px solid var(--border-strong);">
                                                <th class="p-4 text-muted text-sm uppercase" style="width: 60px; text-align: center;">STT</th>
                                                <th class="p-4 text-muted text-sm uppercase">Tài Khoản</th>
                                                <th class="p-4 text-muted text-sm uppercase">Tên Ingame</th>
                                                <th class="p-4 text-muted text-sm uppercase">Mã ID Game</th>
                                                <th class="p-4 text-muted text-sm uppercase text-right hidden-mobile">Ngày Thêm</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                        `;

                        members.forEach((d, index) => {
                            const timeStr = new Date(d.timestamp).toLocaleDateString('vi-VN');
                            renderHtml += `
                                <tr style="border-bottom: 1px solid var(--border-strong); transition: 0.2s;" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='transparent'">
                                    <td class="p-4 font-bold text-muted text-center">${index + 1}</td>
                                    <td class="p-4">
                                        <div class="flex items-center gap-3">
                                            <div class="avatar-circle" style="width:36px; height:36px; font-size:14px; background:var(--brand-primary-soft); color:var(--brand-primary);">${qdH(d.username.charAt(0).toUpperCase())}</div>
                                            <b class="text-main">${qdH(d.username)}</b>
                                        </div>
                                    </td>
                                    <td class="p-4"><span class="text-main font-bold">${qdH(d.ingame || '---')}</span></td>
                                    <td class="p-4"><span class="badge badge-warning px-3 py-1" style="font-size: 13px; font-family: var(--font-family-mono); letter-spacing: 1px;">${qdH(d.gameId || 'Chưa cập nhật')}</span></td>
                                    <td class="p-4 text-muted text-sm text-right hidden-mobile"><i class="fa-regular fa-clock mr-1"></i> ${timeStr}</td>
                                </tr>`;
                        });

                        renderHtml += `</tbody></table></div></div>`;
                    }
                } else if (mode === 'leaderboard') {
                    // Sort by points desc
                    const sortedData = [...data].sort((a, b) => (b.points || 0) - (a.points || 0));
                    
                    renderHtml += `
                        <div class="table-responsive">
                            <table class="w-full text-left" style="border-collapse: collapse;">
                                <thead>
                                    <tr style="background: var(--bg-surface); border-bottom: 1px solid var(--border-strong);">
                                        <th class="p-4 text-muted text-sm uppercase" style="width: 50px; text-align: center;">Hạng</th>
                                        <th class="p-4 text-muted text-sm uppercase">Tuyển Thủ</th>
                                        <th class="p-4 text-muted text-sm uppercase text-right">Điểm Tích Lũy</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;
                    
                    sortedData.forEach((d, index) => {
                        let rankColor = 'var(--text-muted)';
                        let rankIcon = '';
                        if (index === 0) { rankColor = '#f59e0b'; rankIcon = '<i class="fa-solid fa-crown mr-1"></i>'; }
                        else if (index === 1) { rankColor = '#94a3b8'; rankIcon = '<i class="fa-solid fa-medal mr-1"></i>'; }
                        else if (index === 2) { rankColor = '#b45309'; rankIcon = '<i class="fa-solid fa-medal mr-1"></i>'; }
                        
                        renderHtml += `
                            <tr style="border-bottom: 1px solid var(--border-strong); transition: 0.2s;" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='transparent'">
                                <td class="p-4 font-bold text-center" style="color: ${rankColor}; text-shadow: 0 0 10px rgba(0,0,0,0.2); font-size: 16px;">
                                    ${rankIcon}${index + 1}
                                </td>
                                <td class="p-4" style="min-width: 150px;">
                                    <div class="flex items-center gap-2">
                                        <div class="avatar-circle hidden-mobile" style="width:32px; height:32px; font-size:13px; background:var(--brand-primary-soft); color:var(--brand-primary);">${qdH(d.username.charAt(0).toUpperCase())}</div>
                                        <div class="flex-col" style="overflow: hidden;">
                                            <b class="text-main" style="white-space: nowrap; text-overflow: ellipsis; overflow: hidden; display: block;">${qdH(d.username)}</b>
                                            <span class="text-xs text-muted" style="white-space: nowrap; text-overflow: ellipsis; overflow: hidden; display: block;">${qdH(d.team || 'Chưa phân đội')}</span>
                                        </div>
                                    </div>
                                </td>
                                <td class="p-4 text-right" style="white-space: nowrap;">
                                    <span class="badge badge-success px-3 py-1" style="font-size: 14px; font-family: var(--font-family-mono); box-shadow: inset 0 0 10px rgba(16, 185, 129, 0.2);">
                                        <i class="fa-solid fa-star mr-1"></i> ${d.points || 0}
                                    </span>
                                </td>
                            </tr>`;
                    });
                    renderHtml += `</tbody></table></div>`;
                }
                displayArea.innerHTML = renderHtml;
            },

            evalAtt: () => {
                const btn = document.getElementById('btn-do-att'); const ic = document.getElementById('att-status-icon'); const tt = document.getElementById('att-status-title'); const ds = document.getElementById('att-status-desc'); if(!btn) return;
                
                if(window.AppCore.hasAttendedToday) { 
                    btn.disabled = true; btn.className = 'btn btn-outline w-full'; btn.style.borderColor='var(--color-success)'; btn.style.color='var(--color-success)'; QDSmooth.html(btn, `<i class="fa-solid fa-check-double mr-2"></i> HOÀN TẤT GHI NHẬN`); 
                    QDSmooth.html(ic, `<div class="flex-center mx-auto" style="width:120px;height:120px;border-radius:50%;background:var(--color-success-bg);color:var(--color-success);font-size:60px;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-shield-check"></i></div>`); 
                    tt.innerText = "Điểm danh Hợp lệ"; tt.className = "text-4xl mb-4 text-success font-bold"; ds.innerText = "Tuyệt vời! Dữ liệu chuyên cần của bạn đã được mã hóa an toàn trên máy chủ."; return; 
                }
                
                const now = new Date(); const cur = now.getHours() * 60 + now.getMinutes(); const [sH, sM] = window.AppCore.attConfig.start.split(':').map(Number); const [eH, eM] = window.AppCore.attConfig.end.split(':').map(Number);
                
                if(cur >= (sH*60+sM) && cur <= (eH*60+eM)) { 
                    btn.disabled = false; btn.className = 'btn btn-success w-full'; btn.style.animation = 'pulseAlert 2s infinite'; QDSmooth.html(btn, `<i class="fa-solid fa-fingerprint mr-2"></i> XÁC NHẬN CÓ MẶT NGAY`); 
                    QDSmooth.html(ic, `<div class="flex-center mx-auto" style="width:120px;height:120px;border-radius:50%;background:var(--brand-primary-soft);color:var(--brand-primary);font-size:60px;display:flex;align-items:center;justify-content:center;box-shadow: 0 0 40px var(--brand-glow);"><i class="fa-solid fa-fingerprint"></i></div>`); 
                    tt.innerText = "Cổng Xác Nhận Đang Mở"; tt.className = "text-4xl mb-4 text-main font-bold"; ds.innerText = "Trạng thái hợp lệ. Bấm nút màu xanh bên dưới để gửi dữ liệu xác minh về máy chủ tổng."; 
                } 
                else { 
                    btn.disabled = true; btn.className = 'btn btn-danger w-full'; btn.style.animation = 'none'; QDSmooth.html(btn, `<i class="fa-solid fa-lock mr-2"></i> HỆ THỐNG ĐANG KHÓA`); 
                    QDSmooth.html(ic, `<div class="flex-center mx-auto" style="width:120px;height:120px;border-radius:50%;background:var(--color-danger-bg);color:var(--color-danger);font-size:60px;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-clock-rotate-left"></i></div>`); 
                    tt.innerText = "Chưa thể điểm danh lúc này"; tt.className = "text-4xl mb-4 text-danger font-bold"; QDSmooth.html(ds, `Theo quy định bảo mật, bạn chỉ được phép thao tác trong khung giờ <strong class="text-danger" style="background:var(--color-danger-bg);padding:4px 8px;border-radius:6px;">${window.AppCore.attConfig.start} đến ${window.AppCore.attConfig.end}</strong> mỗi ngày.`); 
                }
            },

            doAttendance: async () => {
                if (window.AppCore.isProcessingAttendance) return;
                if (window.AppCore.hasAttendedToday) return Utils.toast("Bạn đã điểm danh hôm nay rồi!", "warning");
                
                window.AppCore.isProcessingAttendance = true;
                const now = new Date(); 
                const cur = now.getHours() * 60 + now.getMinutes(); 
                const [sH, sM] = window.AppCore.attConfig.start.split(':').map(Number); 
                const [eH, eM] = window.AppCore.attConfig.end.split(':').map(Number);
                
                if(cur < (sH*60+sM) || cur > (eH*60+eM)) {
                    window.AppCore.isProcessingAttendance = false;
                    return Utils.toast("Cảnh báo Hệ thống: Bạn đang thao tác ngoài khung giờ quy định!", "error");
                }
                
                const btn = document.getElementById('btn-do-att'); 
                btn.disabled = true; btn.style.animation = 'none'; 
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> ĐANG KIỂM TRA BẢO MẬT...`;

                try {
                    const todayStr = Utils.getTodayString();
                    // Chống điểm danh hộ: Admin > Chống gian lận (settings/attendance.antiProxyEnabled + công tắc tổng Chống gian lận)
                    const anti = window.AppCore.attConfig.antiProxyEnabled && !(window.QDGuard && window.QDGuard.off && window.QDGuard.off());
                    const proxyErr = (m, extra) => { const e = new Error(m); e.proxy = extra || {}; return e; };
                    if (anti) {
                        const lastDeviceAttDate = localStorage.getItem('qd_device_att_date');
                        const lastDeviceAttUser = localStorage.getItem('qd_device_att_user');
                        if (lastDeviceAttDate === todayStr && lastDeviceAttUser !== State.currentUser) {
                            throw proxyErr(`Hệ thống phát hiện thiết bị này đã điểm danh cho [${lastDeviceAttUser}] hôm nay.`, { by: 'device', other: lastDeviceAttUser });
                        }
                    }

                    // Máy chủ kiểm tra khung giờ, đã điểm danh chưa, cùng mạng (IP máy chủ thấy) với người khác, rồi ghi điểm danh + cộng thưởng
                    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> ĐANG TRUYỀN TẢI...`;
                    let res;
                    try { res = await window.QDdb.play('att.check', {}); }
                    catch (e) {
                        if (e && e.code === 'ALREADY') { window.AppCore.hasAttendedToday = true; throw new Error("Bạn đã điểm danh thành công trước đó rồi!"); }
                        if (e && e.code === 'HOURS') throw new Error("Cảnh báo Hệ thống: Bạn đang thao tác ngoài khung giờ quy định!");
                        if (e && e.code === 'PROXY_IP') throw proxyErr(`Địa chỉ mạng này (IP: ${e.ip}) đã được dùng để điểm danh cho [${e.other}]. Nghi vấn điểm danh hộ!`, { by: 'ip', other: e.other, ip: e.ip });
                        throw e;
                    }
                    const rewardItems = res.items || {}, attRewardPoints = res.task || 0, rewardSpins = rewardItems.spins || 0, rewardTickets = rewardItems.tickets || 0;
                    
                    if (window.AppCore.attConfig.antiProxyEnabled) {
                        localStorage.setItem('qd_device_att_date', todayStr);
                        localStorage.setItem('qd_device_att_user', State.currentUser);
                    }
                    
                    window.AppCore.hasAttendedToday = true;

                    document.getElementById('popup-reward-spins').innerText = rewardSpins;
                    try { const bx = document.getElementById('popup-reward-spins').closest('.rounded-xl'); if (bx) bx.style.display = 'none'; } catch (e) {}
                    document.getElementById('popup-reward-tickets').innerText = rewardTickets;
                    try {   // Hiện đủ những gì vừa nhận: điểm lì xì (Nhiệm vụ + thưởng thêm) và từng vật phẩm
                        const list = document.getElementById('popup-reward-list'), pts = Math.max(0, attRewardPoints || 0) + (rewardItems.points || 0);
                        const box = (ic, color, bg, txt) => `<div class="att-pop-it" style="border-color:${color};background:${bg}"><i class="fa-solid ${ic} text-4xl mb-2" style="color:${color}"></i><span class="font-bold text-main text-lg">${txt}</span></div>`;
                        const h = [];
                        if (pts > 0) h.push(box('fa-coins', 'var(--color-success)', 'var(--color-success-bg)', `+${pts.toLocaleString('vi-VN')} Điểm Lì Xì`));
                        if (rewardItems.tickets) h.push(box('fa-envelope-open-text', 'var(--color-danger)', 'var(--color-danger-bg)', `+${rewardItems.tickets} Lượt Rút Lì Xì`));
                        if (rewardItems.spins) h.push(box('fa-fan', 'var(--color-warning)', 'var(--color-warning-bg)', `+${rewardItems.spins} Lượt Quay`));
                        if (rewardItems.conThrows) h.push(box('fa-bullseye', '#f97316', 'rgba(249,115,22,.12)', `+${rewardItems.conThrows} Lượt Ném Còn`));
                        const hid = '<span id="popup-reward-spins" hidden>' + rewardSpins + '</span><span id="popup-reward-tickets" hidden>' + rewardTickets + '</span>';
                        const msg = list && list.previousElementSibling;
                        if (msg && !msg.dataset.orig) msg.dataset.orig = msg.innerHTML;
                        if (list && h.length) { list.innerHTML = h.join('') + hid; if (msg) msg.innerHTML = msg.dataset.orig; }
                        else if (list) {   // chỉ điểm danh, không có phần thưởng
                            list.innerHTML = box('fa-calendar-check', 'var(--color-success)', 'var(--color-success-bg)', 'Đã ghi nhận điểm danh hôm nay') + hid;
                            if (msg) msg.innerHTML = 'Bạn đã điểm danh thành công. Hôm nay điểm danh <b>không kèm phần thưởng</b>.';
                        }
                    } catch (e) {}
                    window.Sound.initCtx(); window.Sound.playWin();
                    window.UI.openModal('modal-attendance-reward');

                } catch (error) {
                    Utils.toast(error.message || "Lỗi kết nối máy chủ.", "error"); 
                    // Bị chặn điểm danh hộ -> báo về Admin > Chống gian lận
                    if (error && error.proxy && window.QDGuard) window.QDGuard.flag('proxy', 'med', (error.proxy.by === 'ip' ? 'Chặn điểm danh: cùng mạng (IP ' + error.proxy.ip + ') với ' : 'Chặn điểm danh: thiết bị này đã điểm danh cho ') + error.proxy.other + ' hôm nay', { other: error.proxy.other || null, by: error.proxy.by });
                    window.AppCore.evalAtt(); 
                } finally {
                    window.AppCore.isProcessingAttendance = false;
                }
            },

            sendRegistration: async () => {
                const nEl = document.getElementById('reg-name'); const idEl = document.getElementById('reg-id');
                if(!nEl || !idEl) return;
                const n = nEl.value.trim(); const id = idEl.value.trim();
                
                if(!n || !id) return Utils.toast("Cảnh báo: Bạn bỏ trống trường dữ liệu bắt buộc!", "warning"); 
                if(!/^\d+$/.test(id)) { idEl.value=""; return Utils.toast("Vi phạm bảo mật: ID Định danh chỉ được phép là SỐ.", "error"); }
                
                if (window.AppCore._regBusy) return;
                // NHANH: trạng thái đóng/mở + đơn đã gửi đều đang nghe trực tiếp (RegID) -> kiểm tra ngay trên máy, không hỏi lại máy chủ
                const R = window.RegID, cfgP = R && R.cfg !== undefined ? Promise.resolve(R.cfg) : db.collection("settings").doc("registration_config").get().then(d => d.exists ? d.data() : null);
                const mineP = R && R.user === State.currentUser && R.mine !== undefined ? Promise.resolve(!!R.mine) : db.collection("users").where("submitter", "==", State.currentUser).get().then(s => !s.empty);
                window.AppCore._regBusy = true;
                try {
                    const [data, mine] = await Promise.all([cfgP.catch(e => { console.error(e); return null; }), mineP]);
                    if (data) {
                        let isLocked = data.isEnabled === false;
                        if (!isLocked && data.endDate && data.endTime) {
                            const deadline = new Date(`${data.endDate}T${data.endTime}`).getTime();
                            if (Date.now() >= deadline) isLocked = true;
                        }
                        if (isLocked) return Utils.toast("Đăng ký đã bị đóng hoặc quá hạn!", "error");
                    }
                    if (mine) return Utils.toast("Bạn đã nộp đơn định danh rồi!", "error");
                    // Ghi đơn: màn hình đổi sang "Đã đăng ký ✓" ngay lập tức (bản ghi hiện tức thì trên máy), máy chủ xác nhận song song
                    const ref = db.collection("users").doc();
                    const saved = ref.set({ name: n, gameId: id, submitter: State.currentUser, timestamp: Date.now() });
                    nEl.value = ""; idEl.value = ""; window.UI.closeModal('modal-registration');
                    Utils.toast("Mã hóa thành công! Đơn yêu cầu đã đến Server BQT.", "success");
                    saved.catch(err => { console.error(err); nEl.value = n; idEl.value = id; Utils.toast("Lỗi mạng. Đơn bị từ chối, vui lòng gửi lại.", "error"); });
                } catch (err) {
                    Utils.toast("Lỗi hệ thống khi kiểm tra thông tin định danh.", "error");
                } finally { window.AppCore._regBusy = false; }
            },

            copyInviteCode: () => {
                if(!State.inviteCode) return;
                navigator.clipboard.writeText(State.inviteCode).then(() => {
                    Utils.toast("Đã sao chép mã mời vào khay nhớ tạm!", "success");
                }).catch(() => { Utils.toast("Trình duyệt không hỗ trợ tự động sao chép.", "error"); });
            },

            submitInviteCode: async () => {
                const codeInput = document.getElementById('inp-invite-code').value.trim().toUpperCase();
                if(!codeInput) return Utils.toast("Vui lòng nhập mã mời!", "warning");
                if(codeInput === State.inviteCode) return Utils.toast("Bạn không thể tự nhập mã của chính mình!", "error");
                const IV = window.InviteUI;
                if(IV && IV.loaded && !IV.cfg.on) return Utils.toast("Chức năng Mã Mời hiện đang tắt.", "warning");

                const btn = document.querySelector('#invite-input-area button');
                btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

                try {
                    // Máy chủ tìm người mời, kiểm tra luật (đã dùng / tự mời / mời ngược / giới hạn) rồi cộng thưởng cho cả hai
                    const res = await window.QDdb.play('invite.use', { code: codeInput }).catch(e => { throw (e && /^[A-Z_]+$/.test(e.code || '')) ? e.code : e; });

                    State.hasUsedInvite = true;
                    IV.done(res);
                    const txt = IV.text(res.gMe);
                    Utils.toast(txt ? `🎉 Thành công! Bạn nhận ${txt}.` : `🎉 Đã nhập mã của ${res.inviter}!`, "success");
                } catch(err) {
                    btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i>`;
                    if(err === "DISABLED") Utils.toast("Chức năng Mã Mời hiện đang tắt.", "warning");
                    else if(err === "NOT_FOUND") Utils.toast("Mã mời không tồn tại.", "error");
                    else if(err === "SELF") Utils.toast("Bạn không thể tự nhập mã của chính mình!", "error");
                    else if(err === "ALREADY_USED") Utils.toast("Bạn đã sử dụng tính năng này rồi.", "error");
                    else if(err === "MUTUAL") Utils.toast("Người này đã nhập mã của bạn, không thể nhập mã ngược lại.", "error");
                    else if(err === "CAPPED") Utils.toast("Người mời đã đạt giới hạn nhận thưởng. Hãy nhập mã của người khác.", "warning");
                    else if(err === "NO_REWARD") { const nx = IV && IV.loaded ? IV.sched(IV.cfg).next : 0; Utils.toast(nx ? `Chưa tới giờ phát thưởng mã mời. Mở lúc ${IV.fmtT(nx)}.` : "Phần thưởng mã mời đang tạm dừng, vui lòng quay lại sau.", "warning"); if (IV && IV.render) IV.render(); }
                    else { console.error(err); Utils.toast("Lỗi hệ thống khi xử lý mã mời.", "error"); }
                }
            }
        };


        /* ===== TẶNG QUÀ ĐỒNG ĐỘI (Admin bật / tắt: settings/transfer_config) =====
           settings/transfer_config = {
             isEnabled: bool,                                  // công tắc tổng (chưa cấu hình = ĐÓNG)
             types: { spins | tickets | conThrows: { on } },   // loại được tặng (chưa cấu hình: lượt quay + lượt rút BẬT, lượt ném TẮT)
             maxPerTransfer: số,                               // tối đa mỗi lần tặng (0 = không giới hạn)
             dailyLimit: số,                                   // số lần tặng / người / ngày (0 = không giới hạn)
             from: ms, to: ms,                                 // hẹn giờ mở / đóng (0 = không giới hạn)
             closedMsg: chuỗi                                  // lời nhắn khi đóng
           }
           accounts (người tặng): giftDay ('YYYY-MM-DD'), giftCount (số lần tặng trong ngày)
           transfer_history: { from, to, type, amount, timestamp, day } */
        window.GiftUI = (function () {
            const TYPES = [
                { k: 'spins', name: 'Lượt vòng quay', short: 'lượt quay', icon: '🎡' },
                { k: 'tickets', name: 'Lượt rút lì xì', short: 'lượt rút', icon: '🧧' },
                { k: 'conThrows', name: 'Lượt ném còn', short: 'lượt ném', icon: '🎯' }
            ];
            const TMAP = {}; TYPES.forEach(t => TMAP[t.k] = t);
            const $ = (id) => document.getElementById(id);
            const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            const int = (v, d, lo, hi) => { v = parseInt(v, 10); if (isNaN(v)) v = d; return Math.min(hi, Math.max(lo, v)); };
            const p2 = (n) => (n < 10 ? '0' : '') + n;
            const dayKey = (t) => { const d = t ? new Date(t) : new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
            const fmtT = (t) => { const d = new Date(t); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ' ' + p2(d.getDate()) + '/' + p2(d.getMonth() + 1); };
            const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

            function norm(c) {
                c = c || {};
                const t = c.types && typeof c.types === 'object' ? c.types : null, types = {};
                TYPES.forEach(x => { types[x.k] = t ? !!(t[x.k] && t[x.k].on === true) : x.k !== 'conThrows'; });
                const ms = (v) => { v = Number(v); return isFinite(v) && v > 0 ? Math.floor(v) : 0; };
                return { on: c.isEnabled === true, types, max: int(c.maxPerTransfer, 0, 0, 1e6), daily: int(c.dailyLimit, 0, 0, 1000),
                    from: ms(c.from), to: ms(c.to), msg: String(c.closedMsg || '').slice(0, 300) };
            }
            // 'off' tắt · 'wait' chưa tới giờ mở · 'end' đã hết giờ · 'none' không có loại nào · 'open' đang mở
            function state(c, now) {
                now = now || Date.now();
                if (!c.on) return 'off';
                if (c.from && now < c.from) return 'wait';
                if (c.to && now >= c.to) return 'end';
                if (!TYPES.some(t => c.types[t.k])) return 'none';
                return 'open';
            }

            const G = { cfg: norm(null), loaded: false, bal: { spins: 0, tickets: 0, conThrows: 0 }, used: 0, hist: [], histFor: '', filter: 'all', started: false, TYPES, norm, state, dayKey };

            G.onAcc = function (d) {
                d = d || {};
                TYPES.forEach(t => G.bal[t.k] = Math.max(0, Number(d[t.k]) || 0));
                G.used = d.giftDay === dayKey() ? (Number(d.giftCount) || 0) : 0;
                G.render();
            };

            function closedText(c, st) {
                if (st === 'off') return '🔒 Ban Quản Trị đang <b>tạm đóng</b> chức năng tặng quà.';
                if (st === 'wait') return '⏳ Chức năng tặng quà mở lúc <b>' + fmtT(c.from) + '</b>' + (c.to ? ' (đến ' + fmtT(c.to) + ')' : '') + '.';
                if (st === 'end') return '⛔ Đợt tặng quà đã kết thúc lúc <b>' + fmtT(c.to) + '</b>.';
                if (st === 'none') return '🔒 Hiện chưa có loại quà nào được phép tặng.';
                return '';
            }

            G.render = function () {
                const c = G.cfg, st = state(c), open = st === 'open';
                // Lối vào: hiện khi Admin BẬT công tắc tổng (kể cả đang chờ giờ mở)
                const show = G.loaded && c.on;
                const nav = $('nav-gift'), ib = $('inv2-gift'), sub = $('inv2-gift-sub');
                if (nav) nav.hidden = !show;
                if (ib) { ib.hidden = !show; ib.classList.toggle('is-off', !open); }
                if (sub) sub.textContent = open ? 'Chuyển ' + TYPES.filter(t => c.types[t.k]).map(t => t.short).join(' / ') + ' cho thành viên khác'
                    : st === 'wait' ? 'Mở lúc ' + fmtT(c.from) : 'Đang tạm đóng';

                const box = $('gift-state'), form = $('gift-form'); if (!box || !form) return;
                if (!G.loaded) { box.className = 'gift-state'; box.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải thiết lập...'; form.disabled = true; return; }
                const lim = [];
                if (open) {
                    if (c.to) lim.push('⏰ Mở đến <b>' + fmtT(c.to) + '</b>');
                    if (c.max > 0) lim.push('Tối đa <b>' + fmt(c.max) + '</b>/lần');
                    if (c.daily > 0) lim.push('Hôm nay đã tặng <b>' + G.used + '/' + c.daily + '</b> lần');
                }
                const dailyOut = open && c.daily > 0 && G.used >= c.daily;
                box.className = 'gift-state ' + (open && !dailyOut ? 'ok' : 'no');
                box.innerHTML = open
                    ? (dailyOut ? '⛔ Bạn đã dùng hết <b>' + c.daily + ' lần tặng</b> hôm nay — quay lại sau 0 giờ nhé.' : '<span class="gift-dot"></span> Đang mở' + (lim.length ? ' · ' + lim.join(' · ') : ''))
                    : closedText(c, st) + (c.msg ? '<br><i>' + esc(c.msg) + '</i>' : '');
                form.disabled = !open || dailyOut;

                // Loại quà: chỉ các loại Admin đang bật, kèm số dư
                const sel = $('transfer-type'), cur = sel.value;
                const opts = TYPES.filter(t => c.types[t.k]);
                const html = opts.map(t => '<option value="' + t.k + '">' + t.icon + ' ' + t.name + ' (có ' + fmt(G.bal[t.k]) + ')</option>').join('') || '<option value="">Không có loại nào</option>';
                if (sel.innerHTML !== html) { sel.innerHTML = html; if (opts.some(t => t.k === cur)) sel.value = cur; }
                G.hint();
            };
            G.hint = function () {
                const h = $('gift-hint'), sel = $('transfer-type'), c = G.cfg; if (!h || !sel) return;
                const t = TMAP[sel.value]; if (!t) { h.innerHTML = ''; return; }
                const have = G.bal[t.k], cap = c.max > 0 ? Math.min(c.max, have) : have;
                const amt = $('transfer-amount'); if (amt) amt.max = Math.max(1, cap);
                h.innerHTML = 'Bạn đang có <b>' + fmt(have) + ' ' + t.short + '</b>' + (c.max > 0 ? ' · tối đa <b>' + fmt(c.max) + '</b>/lần' : '')
                    + (have > 0 && state(c) === 'open' ? ' · <button type="button" class="gift-all" onclick="window.GiftUI.fillMax()">Tặng tối đa (' + fmt(cap) + ')</button>' : '');
            };
            G.fillMax = function () {
                const t = TMAP[($('transfer-type') || {}).value]; if (!t) return;
                const cap = G.cfg.max > 0 ? Math.min(G.cfg.max, G.bal[t.k]) : G.bal[t.k];
                const a = $('transfer-amount'); if (a && cap > 0) { a.value = cap; a.focus(); }
            };

            /* ---- Lịch sử tặng / nhận của chính mình ---- */
            G.loadHist = function () {
                const me = State.currentUser; if (!me || typeof db === 'undefined') return;
                const list = $('gift-list'); if (list && G.histFor !== me) list.innerHTML = '<div class="gift-empty"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>';
                const col = db.collection('transfer_history');
                Promise.all([col.where('from', '==', me).get(), col.where('to', '==', me).get()]).then(r => {
                    if (State.currentUser !== me) return;
                    const seen = {}, all = [];
                    r.forEach(snap => snap.forEach(doc => { if (seen[doc.id]) return; seen[doc.id] = 1; all.push(Object.assign({ id: doc.id }, doc.data())); }));
                    all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    G.hist = all; G.histFor = me; G.renderHist();
                }).catch(e => { console.warn('transfer_history', e); if (list) list.innerHTML = '<div class="gift-empty">Không tải được lịch sử, thử lại sau.</div>'; });
            };
            G.renderHist = function () {
                const list = $('gift-list'); if (!list) return;
                const me = State.currentUser;
                const rows = G.hist.filter(d => G.filter === 'all' || (G.filter === 'out' ? d.from === me : d.to === me));
                document.querySelectorAll('#modal-transfer .gift-tab').forEach(b => b.classList.toggle('active', b.dataset.f === G.filter));
                if (!rows.length) { list.innerHTML = '<div class="gift-empty">' + (G.hist.length ? 'Không có mục nào.' : 'Bạn chưa tặng hoặc nhận quà nào.') + '</div>'; return; }
                list.innerHTML = rows.slice(0, 40).map(d => {
                    const out = d.from === me, t = TMAP[d.type] || { icon: '🎁', short: 'lượt' };
                    return '<div class="gift-row ' + (out ? 'out' : 'in') + '"><span class="gift-ic">' + (out ? '↗' : '↘') + '</span>'
                        + '<div class="gift-tx"><b>' + (out ? 'Tặng ' + esc(d.to) : 'Nhận từ ' + esc(d.from)) + '</b><small>' + (d.timestamp ? new Date(d.timestamp).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '') + '</small></div>'
                        + '<span class="gift-amt">' + (out ? '−' : '+') + fmt(d.amount) + ' ' + t.icon + ' <small>' + t.short + '</small></span></div>';
                }).join('') + (rows.length > 40 ? '<div class="gift-empty">Hiện 40 mục gần nhất.</div>' : '');
            };

            /* ---- Gợi ý người nhận: danh bạ thành viên (accounts đang nghe trực tiếp -> lấy ngay trong bộ nhớ) ---- */
            const fold = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
            G.dir = []; G.dirAt = 0; G.sugIdx = -1; G.sugList = [];
            G.loadDir = function (force) {
                if (typeof db === 'undefined' || (!force && G.dir.length && Date.now() - G.dirAt < 60000)) return Promise.resolve(G.dir);
                return db.collection('accounts').get().then(snap => {
                    const me = String(State.currentUser || '');
                    G.dir = snap.docs.map(d => d.data()).filter(a => a && a.user && a.user !== me && !a.isBlocked).map(a => ({
                        user: String(a.user), name: String(a.fullName || a.name || ''), avatar: a.avatar || (State.avatars || {})[a.user] || null,
                        nick: (State.nicknames || {})[a.user] || '', on: window.Utils.isOnline(Number(a.lastActive) || 0, a.online), role: a.role || 'user',
                        k: fold(a.user) + ' ' + fold(a.fullName || a.name || '') + ' ' + fold((State.nicknames || {})[a.user] || '')
                    })).sort((x, y) => (y.on - x.on) || x.user.localeCompare(y.user));
                    G.dirAt = Date.now(); return G.dir;
                }).catch(e => { console.warn('gift dir', e); return G.dir; });
            };
            function recent() {   // người mình tặng gần đây nhất (tối đa 4)
                const seen = {}, out = [], me = State.currentUser;
                G.hist.forEach(h => { if (h.from === me && h.to && !seen[h.to] && out.length < 4) { seen[h.to] = 1; out.push(h.to); } });
                return out;
            }
            function hl(text, q) {
                const t = String(text || ''); if (!q) return esc(t);
                const f = fold(t), i = f.indexOf(q); if (i < 0) return esc(t);
                return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length));
            }
            function avHTML(a) {
                const ini = esc((a.name || a.user).trim().charAt(0).toUpperCase() || '?');
                return '<span class="gift-av">' + (a.avatar && /^data:image\/|^https?:\/\//.test(a.avatar) ? '<img src="' + esc(a.avatar) + '" alt="">' : ini) + '<i class="' + (a.on ? 'on' : '') + '"></i></span>';
            }
            G.suggest = function (show) {
                const inp = $('transfer-target'), box = $('gift-sug'); if (!inp || !box) return;
                const raw = inp.value.trim(), q = fold(raw);
                let list, label;
                if (!q) {
                    const r = recent(); list = r.map(u => G.dir.find(a => a.user === u)).filter(Boolean);
                    label = list.length ? 'Tặng gần đây' : 'Thành viên đang hoạt động';
                    if (!list.length) list = G.dir.filter(a => a.on).slice(0, 6);
                } else {
                    const starts = [], has = [];
                    G.dir.forEach(a => { const u = fold(a.user), n = fold(a.name); if (u.startsWith(q) || n.startsWith(q) || n.split(' ').some(w => w.startsWith(q))) starts.push(a); else if (a.k.indexOf(q) >= 0) has.push(a); });
                    list = starts.concat(has).slice(0, 8); label = list.length ? 'Gợi ý thành viên' : '';
                }
                G.sugList = list; G.sugIdx = list.length && q ? 0 : -1;
                const exact = G.dir.find(a => a.user === raw) || G.dir.find(a => a.user.toLowerCase() === raw.toLowerCase());
                if (show === false || !list.length && !q || (exact && list.length === 1 && list[0] === exact && raw === exact.user)) { box.hidden = true; inp.setAttribute('aria-expanded', 'false'); }
                else {
                    box.innerHTML = (label ? '<div class="gift-sug-lbl">' + label + '</div>' : '') + (list.length ? list.map((a, i) =>
                        '<button type="button" class="gift-opt' + (i === G.sugIdx ? ' on' : '') + '" role="option" data-u="' + esc(a.user) + '" id="gift-opt-' + i + '">' + avHTML(a)
                        + '<span class="gift-opt-tx"><b>' + hl(a.user, q) + '</b><small>' + (a.name ? hl(a.name, q) : 'Chưa có họ tên') + (a.nick ? ' · “' + esc(a.nick) + '”' : '') + '</small></span>'
                        + (a.role === 'admin' || a.role === 'manager' ? '<span class="gift-opt-tag">BQT</span>' : a.on ? '<span class="gift-opt-tag">Online</span>' : '') + '</button>').join('')
                        : '<div class="gift-sug-empty">Không tìm thấy thành viên nào khớp “' + esc(raw) + '”</div>');
                    box.hidden = false; inp.setAttribute('aria-expanded', 'true');
                }
                G.who();
            };
            G.who = function () {
                const el = $('gift-who'), inp = $('transfer-target'); if (!el || !inp) return;
                const raw = inp.value.trim(); if (!raw || !G.dir.length) { el.className = 'gift-who'; el.textContent = ''; return; }
                const a = G.dir.find(x => x.user === raw) || G.dir.find(x => x.user.toLowerCase() === raw.toLowerCase());
                if (a) { el.className = 'gift-who ok'; el.innerHTML = '✓ Người nhận: <b>' + esc(a.user) + '</b>' + (a.name ? ' — ' + esc(a.name) : ''); }
                else if (String(State.currentUser || '') === raw) { el.className = 'gift-who no'; el.textContent = 'Không thể tự tặng cho chính mình.'; }
                else if (!$('gift-sug').hidden && G.sugList.length) { el.className = 'gift-who'; el.textContent = ''; }   // đang chọn trong danh sách: chưa cảnh báo
                else { el.className = 'gift-who no'; el.textContent = G.sugList.length ? 'Chưa đúng tên đăng nhập — chọn một người trong danh sách gợi ý.' : 'Không có thành viên nào tên “' + raw + '”.'; }
            };
            G.pick = function (u) {
                const inp = $('transfer-target'); if (!inp) return;
                inp.value = u; $('gift-sug').hidden = true; inp.setAttribute('aria-expanded', 'false'); G.who();
                const am = $('transfer-amount'); if (am) am.focus();
            };
            function moveSug(d) {
                if (!G.sugList.length) return;
                G.sugIdx = (G.sugIdx + d + G.sugList.length) % G.sugList.length;
                document.querySelectorAll('#gift-sug .gift-opt').forEach((b, i) => b.classList.toggle('on', i === G.sugIdx));
                const on = $('gift-opt-' + G.sugIdx); if (on) { on.scrollIntoView({ block: 'nearest' }); $('transfer-target').setAttribute('aria-activedescendant', on.id); }
            }

            G.open = function () { if (window.UI && window.UI.openModal) window.UI.openModal('modal-transfer'); };
            function onOpen() { G.render(); G.loadHist(); G.loadDir(true).then(() => G.who()); const sb = $('gift-sug'); if (sb) sb.hidden = true; setTimeout(() => { const t = $('transfer-target'); if (t && !$('gift-form').disabled && window.innerWidth > 760) t.focus(); }, 250); }

            G.start = function () {
                if (G.started || typeof db === 'undefined') return; G.started = true;
                db.collection('settings').doc('transfer_config').onSnapshot(doc => {
                    G.cfg = norm(doc.exists ? doc.data() : null); G.loaded = true; G.render();
                }, e => { console.warn('transfer_config', e); G.loaded = true; G.render(); });
                setInterval(() => { if (G.cfg.from || G.cfg.to) G.render(); }, 15000);   // hẹn giờ: tự mở / đóng đúng giờ
                const m = $('modal-transfer');
                if (m && window.MutationObserver) { let was = false; new MutationObserver(() => { const on = m.classList.contains('active'); if (on && !was) onOpen(); was = on; }).observe(m, { attributes: true, attributeFilter: ['class'] }); }
                const sel = $('transfer-type'); if (sel) sel.addEventListener('change', G.hint);
                const tg = $('transfer-target'), am = $('transfer-amount');
                if (tg) {
                    tg.addEventListener('input', () => { G.loadDir().then(() => G.suggest()); });
                    tg.addEventListener('focus', () => { G.loadDir().then(() => G.suggest()); });
                    tg.addEventListener('keydown', e => {
                        const open = !$('gift-sug').hidden;
                        if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) G.suggest(); else moveSug(1); }
                        else if (e.key === 'ArrowUp') { if (open) { e.preventDefault(); moveSug(-1); } }
                        else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); $('gift-sug').hidden = true; }
                        else if (e.key === 'Enter' || e.key === 'Tab') {
                            if (open && G.sugIdx >= 0 && G.sugList[G.sugIdx]) { e.preventDefault(); G.pick(G.sugList[G.sugIdx].user); }
                            else if (e.key === 'Enter') { e.preventDefault(); $('gift-sug').hidden = true; am && am.focus(); }
                        }
                    });
                    tg.addEventListener('blur', () => setTimeout(() => { if (document.activeElement === tg) return; const b = $('gift-sug'); if (b && !b.contains(document.activeElement)) { b.hidden = true; tg.setAttribute('aria-expanded', 'false'); } G.who(); }, 180));
                }
                const sb = $('gift-sug');
                if (sb) { sb.addEventListener('mousedown', e => e.preventDefault()); sb.addEventListener('click', e => { const b = e.target.closest('.gift-opt'); if (b) G.pick(b.dataset.u); }); }
                if (am) am.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); window.Transfer.execute(); } });
                document.querySelectorAll('#modal-transfer .gift-tab').forEach(b => b.addEventListener('click', () => { G.filter = b.dataset.f; G.renderHist(); }));
            };
            return G;
        })();
        try { window.GiftUI.start(); } catch (e) { console.warn('GiftUI', e); }

        window.Transfer = {
            busy: false,
            execute: async () => {
                const G = window.GiftUI;
                if (window.Transfer.busy) return;
                const typed = document.getElementById('transfer-target').value.trim();
                const hit = typed && (G.dir || []).find(a => a.user === typed) || (G.dir || []).find(a => a.user.toLowerCase() === typed.toLowerCase());
                const targetUser = hit ? hit.user : typed;   // gõ khác hoa / thường vẫn ra đúng tài khoản
                const type = document.getElementById('transfer-type').value;
                const amount = parseInt(document.getElementById('transfer-amount').value, 10);
                const btn = document.getElementById('btn-execute-transfer');
                const T = G.TYPES.find(t => t.k === type);
                const st = G.state(G.cfg);

                if (st !== 'open') return Utils.toast("Chức năng tặng quà đang tạm đóng.", "warning");
                if (!T || !G.cfg.types[type]) return Utils.toast("Loại quà này hiện không được phép tặng.", "warning");
                if (!targetUser) return Utils.toast("Vui lòng nhập tên người nhận!", "warning");
                if (targetUser.toLowerCase() === String(State.currentUser || '').toLowerCase()) return Utils.toast("Bạn không thể tự chuyển quà cho chính mình!", "error");
                if (isNaN(amount) || amount <= 0) return Utils.toast("Số lượng chuyển phải lớn hơn 0!", "warning");
                if (G.cfg.max > 0 && amount > G.cfg.max) return Utils.toast(`Mỗi lần chỉ được tặng tối đa ${G.cfg.max} ${T.short}.`, "warning");
                if (G.cfg.daily > 0 && G.used >= G.cfg.daily) return Utils.toast(`Bạn đã tặng đủ ${G.cfg.daily} lần hôm nay.`, "warning");
                if (amount > G.bal[type]) return Utils.toast(`Bạn không đủ số lượng để chuyển. Hiện tại bạn có: ${G.bal[type]} ${T.short}`, "error");

                window.Transfer.busy = true;
                btn.disabled = true;
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang Xử Lý...`;

                const now = Date.now(), today = G.dayKey(now);
                let recv = targetUser;
                try {
                    // Máy chủ tự kiểm tra cấu hình / người nhận / giới hạn ngày / số dư rồi chuyển lượt (thành viên không tự cộng được)
                    const r = await window.QDdb.act('gift.turns', { to: targetUser, type: type, amount: amount });
                    recv = r.recv || targetUser;

                    Utils.toast(`Giao dịch thành công! Đã tặng ${amount} ${T.short} cho ${recv}`, "success");
                    document.getElementById('transfer-target').value = '';
                    document.getElementById('transfer-amount').value = '';
                    G.who();
                    G.hist.unshift({ from: State.currentUser, to: recv, type, amount, timestamp: now });
                    G.used = r.used || (G.used + 1); G.bal[type] = r.left != null ? r.left : Math.max(0, G.bal[type] - amount);
                    G.render(); G.renderHist();

                } catch (error) {
                    const m = window.qdCode(error);
                    if (m === "NO_TARGET") Utils.toast("Tài khoản người nhận không tồn tại!", "error");
                    else if (m === "SELF") Utils.toast("Bạn không thể tự chuyển quà cho chính mình!", "error");
                    else if (m === "INSUFFICIENT_FUNDS") Utils.toast("Số dư của bạn không đủ để thực hiện!", "error");
                    else if (m === "CLOSED") Utils.toast("Ban Quản Trị vừa đóng chức năng tặng quà.", "warning");
                    else if (m === "TYPE_OFF") Utils.toast("Loại quà này vừa bị tắt, vui lòng chọn loại khác.", "warning");
                    else if (m === "OVER_MAX") Utils.toast(`Vượt mức tối đa mỗi lần tặng.`, "warning");
                    else if (m === "DAILY") Utils.toast("Bạn đã hết lượt tặng hôm nay.", "warning");
                    else if (m === "BLOCKED") Utils.toast("Tài khoản đang bị khóa.", "error");
                    else if (m === "LOGIN") Utils.toast("Phiên đăng nhập hết hạn, hãy đăng nhập lại.", "error");
                    else { console.error(error); Utils.toast("Lỗi hệ thống khi thực hiện chuyển quà.", "error"); }
                    // Cấu hình trên máy đã cũ (Admin vừa đổi): đọc lại để hộp tặng quà hiện đúng
                    if (["CLOSED", "TYPE_OFF", "OVER_MAX", "DAILY"].indexOf(m) >= 0) db.collection("settings").doc("transfer_config").get().then(d => { G.cfg = G.norm(d.exists ? d.data() : null); G.render(); }).catch(() => {});
                } finally {
                    window.Transfer.busy = false;
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fa-solid fa-paper-plane mr-2"></i> Xác Nhận Chuyển`;
                    G.render();
                }
            }
        };

        // Kích hoạt đồng bộ khi tải DOM
        
        /* =====================================================================
           ADVANCED UI LOGIC: PARTICLES & THEME MANAGER
           ===================================================================== */
        window.ThemeManager = {
            current: 'tet',
            init: () => {
                window.ThemeManager.setTheme('tet');
            },
            toggle: () => {
                Utils.toast("Giao diện Tết đang được kích hoạt!", "success");
            },
            setTheme: (theme) => {
                window.ThemeManager.current = 'tet';
                document.documentElement.setAttribute('data-theme', 'tet');
                localStorage.setItem('qd_theme', 'tet');
                
                // Cập nhật text hiển thị nếu có
                const tText = document.getElementById('theme-text');
                if(tText) tText.textContent = "Giao diện Tết";
            }
        };

        window.ParticleSystem = {
            canvas: null, ctx: null, particles: [], color: 'rgba(79, 70, 229, 0.5)', animationId: null, worker: null, last: 0,
            /* Hạt nền: vẽ trong Web Worker (OffscreenCanvas) để luồng chính rảnh hoàn toàn;
               tốc độ tính theo thời gian thực nên màn 60Hz / 90Hz / 120Hz đều chạy cùng tốc độ, mượt theo tần số màn hình */
            init: () => {
                const PS = window.ParticleSystem;
                PS.canvas = document.getElementById('particle-canvas');
                if(!PS.canvas) return;
                const W = window.innerWidth, H = window.innerHeight;
                for(let i=0; i<50; i++) {
                    PS.particles.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, size: Math.random() * 2 + 1 });
                }
                let rz = 0;
                window.addEventListener('resize', () => { if (rz) return; rz = requestAnimationFrame(() => { rz = 0; PS.resize(); }); }, { passive: true });
                const lite = (on) => { PS.canvas.style.display = on ? 'none' : ''; PS.setRunning(!on); };
                if (PS.canvas.transferControlToOffscreen && window.Worker && window.Blob && window.URL) {
                    try {
                        const src = `var c,x,ps=[],col,W,H,run=true,busy=false,last=0;
var raf=self.requestAnimationFrame?self.requestAnimationFrame.bind(self):function(f){return setTimeout(function(){f(performance.now());},16);};
onmessage=function(e){var d=e.data;if(d.canvas){c=d.canvas;x=c.getContext('2d');col=d.color;ps=d.ps;W=c.width=d.w;H=c.height=d.h;go();}
else if(d.size){W=c.width=d.w;H=c.height=d.h;}else if('run' in d){run=d.run;if(run)go();}};
function go(){if(!busy&&run){busy=true;last=0;raf(frame);}}
function frame(t){if(!run){busy=false;return;}var k=last?Math.min((t-last)/16.667,4):1;last=t;x.clearRect(0,0,W,H);x.fillStyle=col;x.beginPath();
for(var i=0;i<ps.length;i++){var p=ps[i];p.x+=p.vx*k;p.y+=p.vy*k;if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;x.moveTo(p.x+p.size,p.y);x.arc(p.x,p.y,p.size,0,6.2832);}
x.fill();raf(frame);}`;
                        const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
                        const off = PS.canvas.transferControlToOffscreen();
                        PS.worker = new Worker(url);
                        PS.worker.postMessage({ canvas: off, color: PS.color, ps: PS.particles, w: W, h: H }, [off]);
                        document.addEventListener('visibilitychange', () => PS.setRunning(!document.hidden && !(window.QDSmooth && QDSmooth.lite)));
                        if (window.QDSmooth) QDSmooth.onLite(lite);
                        return;
                    } catch (e) { PS.worker = null; }
                }
                PS.ctx = PS.canvas.getContext('2d');
                PS.resize();
                if (window.QDSmooth) QDSmooth.onLite(lite);
                if (!(window.QDSmooth && QDSmooth.lite)) PS.setRunning(true);
            },
            setRunning: (on) => {
                const PS = window.ParticleSystem;
                if (PS.worker) { PS.worker.postMessage({ run: !!on }); return; }
                if (!on) { if (PS.animationId) cancelAnimationFrame(PS.animationId); PS.animationId = null; return; }
                if (!PS.animationId) { PS.last = 0; PS.animationId = requestAnimationFrame(PS.animate); }
            },
            resize: () => {
                const PS = window.ParticleSystem;
                if (PS.worker) { PS.worker.postMessage({ size: true, w: window.innerWidth, h: window.innerHeight }); return; }
                if (!PS.canvas || !PS.ctx) return;
                PS.canvas.width = window.innerWidth;
                PS.canvas.height = window.innerHeight;
            },
            animate: (t) => {
                const PS = window.ParticleSystem, ctx = PS.ctx, canvas = PS.canvas;
                const k = PS.last ? Math.min((t - PS.last) / 16.667, 4) : 1; PS.last = t;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = PS.color;
                ctx.beginPath();
                PS.particles.forEach(p => {
                    p.x += p.vx * k; p.y += p.vy * k;
                    if(p.x < 0 || p.x > canvas.width) p.vx *= -1;
                    if(p.y < 0 || p.y > canvas.height) p.vy *= -1;
                    ctx.moveTo(p.x + p.size, p.y);
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                });
                ctx.fill();
                PS.animationId = document.hidden ? null : requestAnimationFrame(PS.animate);
                if (!PS.animationId) document.addEventListener('visibilitychange', function again() { if (document.hidden) return; document.removeEventListener('visibilitychange', again); if (!(window.QDSmooth && QDSmooth.lite)) PS.setRunning(true); });
            }
        };

        // Sync Inventory Data Helper
        window.SyncInventoryUI = () => {
            if(document.getElementById('inv-spins')) document.getElementById('inv-spins').innerText = State.availableSpins || 0;
            if(document.getElementById('inv-tickets')) document.getElementById('inv-tickets').innerText = State.availableTickets || 0;
            if(document.getElementById('inv-points')) document.getElementById('inv-points').innerText = State.availablePoints || 0;
        };

        
document.addEventListener("DOMContentLoaded", () => {
        // Mouse tracking for glassy cards
        document.querySelectorAll('.bento-action').forEach(card => {
            let qdMM = null;
            card.addEventListener('mousemove', e => {
                if (qdMM) { qdMM = e; return; } qdMM = e;
                requestAnimationFrame(() => {
                    const ev = qdMM; qdMM = null;
                    const rect = card.getBoundingClientRect();
                    card.style.setProperty('--mouse-x', `${ev.clientX - rect.left}px`);
                    card.style.setProperty('--mouse-y', `${ev.clientY - rect.top}px`);
                });
            }, { passive: true });
        });
 
            window.Theme.init(); window.Music.init(); window.ThemeManager.init(); window.ParticleSystem.init(); window.SessionManager.init(); 
            
            
            // --- GIAO DIỆN NÚT THEME DI CHUYỂN ĐƯỢC ---
            const themeBtn = document.getElementById('draggable-theme-btn');
            if (themeBtn) {
                let isThemeDragging = false;
                let tStartX, tStartY, tCurrentX, tCurrentY;
                
                const tDragStart = (e) => {
                    isThemeDragging = false;
                    if (e.type === 'touchstart') {
                        tStartX = e.touches[0].clientX;
                        tStartY = e.touches[0].clientY;
                    } else {
                        tStartX = e.clientX;
                        tStartY = e.clientY;
                    }
                    document.addEventListener('mousemove', tDragMove, {passive: false});
                    document.addEventListener('touchmove', tDragMove, {passive: false});
                    document.addEventListener('mouseup', tDragEnd);
                    document.addEventListener('touchend', tDragEnd);
                };

                const tDragMove = (e) => {
                    let clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
                    let clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
                    
                    let dx = clientX - tStartX;
                    let dy = clientY - tStartY;
                    
                    // Khoảng cách nhạy để phân biệt Click và Drag
                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                        isThemeDragging = true;
                        if(e.cancelable) e.preventDefault();
                    }
                    
                    if (isThemeDragging) {
                        tCurrentX = clientX;
                        tCurrentY = clientY;
                        themeBtn.style.left = (themeBtn.offsetLeft + dx) + 'px';
                        themeBtn.style.top = (themeBtn.offsetTop + dy) + 'px';
                        themeBtn.style.right = 'auto';
                        themeBtn.style.bottom = 'auto';
                        themeBtn.style.transition = 'none';
                        tStartX = clientX;
                        tStartY = clientY;
                    }
                };

                const tDragEnd = (e) => {
                    document.removeEventListener('mousemove', tDragMove);
                    document.removeEventListener('touchmove', tDragMove);
                    document.removeEventListener('mouseup', tDragEnd);
                    document.removeEventListener('touchend', tDragEnd);
                    if(themeBtn) themeBtn.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                };

                themeBtn.addEventListener('mousedown', tDragStart);
                themeBtn.addEventListener('touchstart', tDragStart, {passive: true});
                
                themeBtn.addEventListener('click', (e) => {
                    if (isThemeDragging) {
                        e.preventDefault();
                        e.stopPropagation();
                        isThemeDragging = false;
                    } else {
                        if(window.ThemeManager) window.ThemeManager.toggle();
                    }
                });
            }

            // Restore saved credentials
            const savedUsr = localStorage.getItem('qd_saved_usr');
            const savedPwd = localStorage.getItem('qd_saved_pwd');
            if (savedUsr && savedPwd) {
                document.getElementById('login-usr').value = savedUsr;
                document.getElementById('login-pwd').value = savedPwd;
                document.getElementById('remember-me').checked = true;
            }
        });
    
