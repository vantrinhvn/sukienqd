    /* ===== Thẻ + popup "Quay Số May Mắn" ===== */
    (function () {
        'use strict';
        var $ = function (id) { return document.getElementById(id); };
        var pad = function (n) { return String(n).padStart(2, '0'); };

        window.LnTab = {
            mine: undefined,      // undefined = đang tải, null = chưa chọn, object = dữ liệu lucky_numbers/{user}
            count: null, sel: null, confirming: false, saving: false,
            started: false, unsubMine: null, unsubAll: null, unsubLive: null, built: false,
            live: false, liveKnown: false, schedTimer: null, warned: {},

            start: function () {
                var self = this, me = window.State && window.State.currentUser;
                if (this.started || !me || typeof db === 'undefined') return;
                this.started = true;
                try {
                    this.unsubMine = db.collection('lucky_numbers').doc(me).onSnapshot(function (snap) {
                        self.mine = snap && snap.exists ? snap.data() : null;
                        self.render();
                    }, function (e) { console.warn('LnTab mine', e); self.mine = null; self.render(); });
                    this.unsubAll = db.collection('lucky_numbers').onSnapshot(function (snap) {
                        self.count = snap ? snap.size : 0; self.render();
                    }, function (e) { console.warn('LnTab all', e); });
                    // Quay theo giờ hẹn: đếm ngược trên trang chủ (và cũng giúp tự quay khi tới giờ)
                    if (window.LuckySchedule) { LuckySchedule.start(); LuckySchedule.onChange(function () { self.render(); }); }
                    this.schedTimer = setInterval(function () { self.schedTick(); }, 1000);
                    // Admin bật "Phát Trực Tiếp" -> hiện banner + thông báo
                    this.unsubLive = db.collection('settings').doc('lucky_live').onSnapshot(function (snap) {
                        var on = !!(snap && snap.exists && snap.data().isLive === true);
                        var wasKnown = self.liveKnown, was = self.live;
                        self.live = on; self.liveKnown = true;
                        if (on && (!wasKnown || !was)) self.notifyLive(wasKnown);
                        self.render();
                    }, function (e) { console.warn('LnTab live', e); });
                } catch (e) { console.warn('LnTab start', e); }
            },
            stop: function () {
                this.started = false; this.mine = undefined; this.count = null; this.live = false; this.liveKnown = false;
                var bn = $('ln-live-banner'); if (bn) bn.style.display = 'none';
                if (this.schedTimer) { clearInterval(this.schedTimer); this.schedTimer = null; }
                if (window.LuckySchedule) LuckySchedule.stop();
                ['unsubMine', 'unsubAll', 'unsubLive'].forEach(function (k) { if (this[k]) { try { this[k](); } catch (e) {} this[k] = null; } }, this);
            },

            notifyLive: function (justStarted) {
                Utils.toast('🔴 Đang quay số trực tiếp! Bấm "Xem ngay" trên trang chủ để theo dõi.', 'success');
                // Có quyền thông báo hệ thống + đang ở tab khác / ẩn trang -> bắn thông báo
                try {
                    if (!justStarted || !document.hidden || localStorage.getItem('qd_notif_state') === 'false') return;
                    if (!('Notification' in window) || Notification.permission !== 'granted') return;
                    var opts = { body: 'Admin đang quay Số May Mắn. Chạm để vào xem kết quả!', icon: 'https://cdn-icons-png.flaticon.com/512/1041/1041916.png', tag: 'lucky_live', renotify: true };
                    try {
                        var n = new Notification('🔴 Đang quay số trực tiếp', opts);
                        n.onclick = function () { window.focus(); var a = $('ln-live-banner'); if (a) a.click(); };
                    } catch (err) {
                        if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(function (reg) { if (reg) reg.showNotification('🔴 Đang quay số trực tiếp', opts); });
                    }
                } catch (e) {}
            },

            schedTick: function () {
                if (!window.LuckySchedule || !LuckySchedule.pending()) return;
                var nx = LuckySchedule.get(), left = LuckySchedule.remaining(), key = nx.id + '@' + nx.at;
                if (left <= 60000 && left > 0 && !this.warned[key]) { this.warned[key] = true; Utils.toast('⏰ Còn 1 phút nữa là quay ' + (nx.label || 'số may mắn') + '! Vào xem ngay nhé.', 'warning'); }
                this.render();
            },

            hasNumber: function () { return !!(this.mine && this.mine.number); },
            canEdit: function () { return !this.hasNumber() || this.mine.canEdit === true; },

            open: function () {
                if (!window.State || !window.State.currentUser) return;
                this.start();
                this.build();
                this.sel = null; this.confirming = false;
                this.render();
                window.UI.openModal('modal-lucky-number');
            },
            close: function () { this.confirming = false; window.UI.closeModal('modal-lucky-number'); },

            build: function () {
                if (this.built) return;
                var grid = $('ln2-grid'), html = '';
                for (var i = 1; i <= 100; i++) html += '<button type="button" class="ln2-cell" data-n="' + i + '" aria-label="Số ' + pad(i) + '">' + pad(i) + '</button>';
                grid.innerHTML = html;
                var self = this;
                grid.addEventListener('click', function (e) {
                    var b = e.target.closest ? e.target.closest('.ln2-cell') : null;
                    if (!b || !self.canEdit() || self.saving) return;
                    self.pick(parseInt(b.dataset.n, 10));
                });
                this.built = true;
            },

            pick: function (n) {
                if (this.hasNumber() && parseInt(this.mine.number, 10) === n) { this.sel = null; }
                else { this.sel = n; }
                this.confirming = false;
                this.render();
            },

            save: function () {
                var self = this, me = window.State && window.State.currentUser, n = this.sel;
                if (!me || !n || this.saving || !this.canEdit()) return;
                if (!this.confirming) { this.confirming = true; this.render(); return; }   // bấm lần 2 để xác nhận
                this.saving = true; this.render();
                // Máy chủ kiểm tra số đã chốt (chỉ đổi được khi Admin cấp phép) rồi lưu
                window.QDdb.play('lucky.pick', { number: n }).catch(function (e) { if (e && e.code === 'LOCKED') throw new Error('locked'); throw e; })
                .then(function () {
                    self.sel = null; self.confirming = false;
                    Utils.toast('Đã chốt số may mắn ' + pad(n) + '. Chúc bạn may mắn!', 'success');
                    var ball = $('ln2-my-number'); if (ball) { ball.classList.remove('pop'); void ball.offsetWidth; ball.classList.add('pop'); }
                }).catch(function (e) {
                    self.confirming = false;
                    if (e && e.message === 'locked') Utils.toast('Số của bạn đã được chốt. Liên hệ Admin để được cấp phép đổi số.', 'warning');
                    else { console.warn('LnTab save', e); Utils.toast('Lỗi kết nối máy chủ, vui lòng thử lại.', 'error'); }
                }).finally(function () { self.saving = false; self.render(); });
            },

            render: function () {
                var has = this.hasNumber(), edit = this.canEdit(), loading = this.mine === undefined;
                var myN = has ? parseInt(this.mine.number, 10) : null;

                // --- thẻ trên trang chủ ---
                var tab = $('ln-tab'), live = this.live;
                var nextR = window.LuckySchedule ? LuckySchedule.get() : null;          // lượt hẹn giờ sắp tới
                var pend = !live && !!nextR;
                var sched = nextR, left = nextR ? LuckySchedule.remaining() : null;
                var whenTxt = nextR ? LuckySchedule.fmtTime(nextR.at) : '', lbl = nextR && nextR.label ? nextR.label : 'Lượt tới';
                if (tab) {
                    tab.dataset.state = has && !edit ? 'locked' : 'open';
                    tab.classList.toggle('is-live', live);
                    $('ln-tab-sub').textContent = live ? '🔴 ĐANG LIVE' : pend ? '⏰ ' + lbl + ' lúc ' + whenTxt.replace(' hôm nay', '') : (loading ? 'Đang tải...' : (has ? 'Số của bạn: ' + pad(myN) : 'Chưa chọn số'));
                    $('ln-tab-ball').textContent = has ? pad(myN) : '?';
                    $('ln-tab-go').textContent = live ? '🔴 Đang quay trực tiếp · chạm để xem ›' : pend ? '⏰ Còn ' + LuckySchedule.fmtLeft(left) + ' · ' + (has ? 'số của bạn: ' + pad(myN) : 'chạm để chọn số ›') : (loading ? 'Chạm để chọn số ›' : (!has ? 'Chạm để chọn số may mắn ›' : (edit ? 'Được phép đổi số · chạm để đổi ›' : '🔒 Đã chốt số · chạm để xem ›')));
                }
                var bn = $('ln-live-banner');
                if (bn) {
                    bn.style.display = live || pend ? 'flex' : 'none';
                    bn.classList.toggle('soon', pend);
                    $('ln-live-banner-title').textContent = live ? 'Đang quay số trực tiếp!' : '⏰ Sắp quay số may mắn · ' + lbl + '!';
                    $('ln-live-banner-go').textContent = live ? 'Xem ngay ›' : 'Vào chờ ›';
                    $('ln-live-banner-sub').textContent = live
                        ? (nextR && left > 0 ? lbl + ' quay lúc ' + whenTxt + ' · còn ' + LuckySchedule.fmtLeft(left) : 'Vào xem kết quả Quay Số May Mắn ngay') + (has ? ' · số của bạn: ' + pad(myN) : '')
                        : (left > 0 ? lbl + ' quay lúc ' + whenTxt + ' · còn ' + LuckySchedule.fmtLeft(left) : 'Đến giờ quay ' + lbl + ' rồi! Vào xem ngay') + (has ? ' · số của bạn: ' + pad(myN) : '');
                }
                var lv = $('ln2-live');
                if (lv) {
                    lv.dataset.live = live || pend ? 'on' : 'off';
                    lv.setAttribute('aria-disabled', live || pend ? 'false' : 'true');
                    lv.tabIndex = live || pend ? 0 : -1;
                    $('ln2-live-txt').textContent = live ? 'Xem quay trực tiếp ngay' : pend ? '⏰ ' + lbl + ' lúc ' + whenTxt + ' · vào chờ' : 'Chưa mở quay trực tiếp';
                }

                // --- popup ---
                if (!this.built) return;
                $('ln2-my-number').textContent = has ? pad(myN) : '?';
                var st = $('ln2-status');
                st.className = has ? (edit ? 'open' : 'lock') : '';
                st.textContent = loading ? 'Đang tải...' : (!has ? 'Bạn chưa chọn số nào' : (edit ? 'Admin đã cho phép bạn đổi số' : 'Đã chốt · chờ kết quả quay số'));

                var hint = $('ln2-hint');
                hint.className = 'ln2-hint' + (edit ? '' : ' lock');
                hint.textContent = edit
                    ? (has ? 'Chạm vào số mới để đổi. Sau khi chốt, số sẽ bị khóa lại.' : 'Chạm vào một ô số để chọn. Mỗi thành viên chọn 1 số, sau khi chốt sẽ không tự đổi được.')
                    : '🔒 Số của bạn đã được chốt. Muốn đổi số, hãy liên hệ Admin để được cấp phép.';

                var grid = $('ln2-grid'), sel = this.sel;
                grid.classList.toggle('locked', !edit);
                Array.prototype.forEach.call(grid.children, function (b) {
                    var n = parseInt(b.dataset.n, 10);
                    b.classList.toggle('mine', n === myN);
                    b.classList.toggle('sel', n === sel);
                    b.disabled = !edit;
                    b.setAttribute('aria-pressed', n === sel ? 'true' : 'false');
                });

                $('ln2-count').textContent = this.count == null ? '--' : this.count;
                var btn = $('ln2-save');
                btn.classList.toggle('confirm', this.confirming && !this.saving);
                btn.disabled = !edit || !sel || this.saving;
                btn.innerHTML = this.saving ? '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...'
                    : (!edit ? '<i class="fa-solid fa-lock"></i> Đã chốt'
                    : (!sel ? 'Chọn một số'
                    : (this.confirming ? '<i class="fa-solid fa-check"></i> Xác nhận chốt số ' + pad(sel) : (has ? 'Đổi sang số ' + pad(sel) : 'Chốt số ' + pad(sel)))));
            }
        };

        document.addEventListener('keydown', function (e) {
            var m = $('modal-lucky-number');
            if (e.key === 'Escape' && m && m.classList.contains('active')) window.LnTab.close();
        });
        document.addEventListener('click', function (e) {   // bấm ra ngoài popup để đóng
            if (e.target && e.target.id === 'modal-lucky-number') window.LnTab.close();
        });
    })();
    
