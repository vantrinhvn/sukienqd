/* =====================================================================================
   QD ELITE - MÁY CHỦ TỰ GỬI BOT BÁO CÁO + THÔNG BÁO APP ANDROID (Google Apps Script, miễn phí)  · bản srv-12
   -------------------------------------------------------------------------------------
   BẢN srv-12: ĐẾM LƯỢT ĐỌC / GHI / XÓA FIRESTORE HÔM NAY -> Admin > Tổng quan / Cuộc gọi thấy còn bao nhiêu
   - Cứ 10 phút máy chủ hỏi Google Cloud Monitoring (số liệu thật của Firebase, trễ vài phút) rồi ghi vào settings/firestore_usage.
   - Gói miễn phí Spark: 50.000 lượt đọc · 20.000 lượt ghi · 20.000 lượt xóa / ngày, đặt lại lúc 0:00 giờ Mỹ (15:00 giờ VN).
   - Báo lỗi "Cloud Monitoring API chưa bật" -> mở console.cloud.google.com/apis/library/monitoring.googleapis.com?project=web-dangky-123 -> BẬT.
   - Thử ngay: chọn hàm XEM_LUOT_GHI -> ▶ Chạy.
   Cập nhật: dán đè + 💾 Lưu, rồi Triển khai -> Quản lý các lần triển khai -> ✏️ -> Phiên bản mới -> Triển khai.
   -------------------------------------------------------------------------------------
   BẢN srv-11: ĐẾM HẠN MỨC GOOGLE ĐỂ ADMIN BIẾT CÒN GỬI ĐƯỢC BAO NHIÊU THÔNG BÁO
   - Đếm số lượt gọi mạng (UrlFetch) và thời gian chạy hẹn giờ mỗi ngày -> Admin > Thông báo app hiện "Hạn mức hôm nay".
   - Tài khoản Gmail thường: 20.000 lượt gọi mạng / ngày, 90 phút chạy hẹn giờ / ngày (sửa QUOTA bên dưới nếu dùng Google Workspace).
   -------------------------------------------------------------------------------------
   BẢN srv-10: GỌI THOẠI / GỌI VIDEO TRONG TIN NHẮN
   - Có người gọi mà máy người nhận đang tắt app -> điện thoại đổ chuông như cuộc gọi (bấm Nghe / Từ chối).
   - Người gọi hủy / hết 45 giây -> chuông tự tắt.
   Cập nhật: dán đè + 💾 Lưu, rồi Triển khai -> Quản lý các lần triển khai -> ✏️ -> Phiên bản mới -> Triển khai.
   -------------------------------------------------------------------------------------
   BẢN srv-9: BOT BÁO CÁO GỬI VÀO KÊNH CHUNG -> CŨNG BÁO LÊN ĐIỆN THOẠI (kể cả khi đã tắt app)
   - Người bị bot @nhắc tên (chưa điểm danh / chưa khai báo...) nhận "📣 <tên bot> nhắc đến bạn".
   - Mọi người còn lại nhận "📊 <tên bot>" kèm vài dòng đầu của báo cáo.
   - Bật / tắt ở Admin > Thông báo app > "📊 Bot báo cáo" (mặc định BẬT).
   - Báo cáo do máy chủ gửi được báo lên điện thoại ngay sau khi gửi (không phải chờ thêm 1 phút).
   Cập nhật: dán đè + 💾 Lưu, rồi Triển khai -> Quản lý các lần triển khai -> ✏️ -> Phiên bản mới -> Triển khai.
   -------------------------------------------------------------------------------------
   BẢN srv-8: thông báo tin nhắn gửi kèm tên đăng nhập người gửi -> app hiện đúng ẢNH ĐẠI DIỆN của tài khoản
   (bong bóng chat / thông báo hội thoại). Cập nhật: dán đè + Lưu, rồi Triển khai -> Quản lý các lần triển khai ->
   ✏️ -> Phiên bản mới -> Triển khai.
   -------------------------------------------------------------------------------------
   BẢN srv-7: thông báo Admin gửi kèm ẢNH LỚN; bật / tắt từng loại tin nhắn trong Admin > Thông báo app
   (Tin nhắn riêng · @Nhắc tên · Mọi tin Kênh Chung). Cập nhật: dán đè + Lưu, rồi Triển khai ->
   Quản lý các lần triển khai -> ✏️ -> Phiên bản mới -> Triển khai (để cửa gửi nhanh dùng mã mới).
   -------------------------------------------------------------------------------------
   BẢN srv-6: GỬI THÔNG BÁO GẦN NHƯ TỨC THÌ (vài giây thay vì tới 1 phút)
   Admin bấm gửi / có tin nhắn riêng / @nhắc tên -> trang web "gõ cửa" máy chủ -> gửi ngay.
   Lịch mỗi phút vẫn chạy làm dự phòng. CẦN làm 1 lần (sau khi dán file này + 💾 Lưu):
     1) Nút xanh "Triển khai" (Deploy) góc trên phải -> "Tùy chọn triển khai mới" (New deployment).
     2) Bánh răng cạnh "Chọn loại" -> "Ứng dụng web" (Web app).
        - Thực thi dưới dạng (Execute as): "Tôi" (Me)
        - Người có quyền truy cập (Who has access): "Bất kỳ ai" (Anyone)
        -> "Triển khai" -> cho phép quyền nếu được hỏi -> SAO CHÉP "URL ứng dụng web" (kết thúc bằng /exec).
     3) Admin > Thông báo app > ô "Địa chỉ gửi nhanh" -> dán URL đó -> Lưu.
   Địa chỉ này chỉ "nhắc" máy chủ kiểm tra việc cần gửi, KHÔNG nhận nội dung nào từ bên ngoài
   -> người lạ có biết địa chỉ cũng không gửi được thông báo tùy ý.
   Sau này sửa file này: Triển khai -> Quản lý các lần triển khai -> ✏️ -> Phiên bản: "Phiên bản mới" -> Triển khai
   (URL giữ nguyên). Không làm bước này thì cửa gửi nhanh vẫn chạy mã cũ.
   -------------------------------------------------------------------------------------
   BẢN srv-5: THÔNG BÁO ĐẨY ĐẾN APP ANDROID (kể cả khi đã tắt app), mỗi phút kiểm tra 1 lần:
   - Admin > Cài đặt > "Gửi thông báo đến app"  -> gửi tới tất cả / 1 tài khoản (~1 phút).
   - Tin nhắn riêng -> báo người nhận; @nhắc tên ở Kênh Chung -> báo người được nhắc.
   Gửi bằng chính tài khoản Google chủ dự án Firebase (không cần file khóa). CẦN làm 1 lần:
     a) ⚙️ Cài đặt dự án (bánh răng bên trái) -> tích "Hiển thị tệp kê khai appsscript.json trong trình chỉnh sửa".
     b) Mở tệp appsscript.json bên trái -> xóa hết, dán đoạn APPSSCRIPT_JSON ở cuối hướng dẫn này -> 💾 Lưu.
     c) Dán file này vào tệp mã (xóa bản cũ) -> 💾 Lưu -> chọn hàm CAI_DAT -> ▶ Chạy -> cho phép quyền mới
        ("Gửi tin nhắn Firebase Cloud Messaging" ...).
     d) Chọn hàm KIEM_TRA -> ▶ Chạy: phải thấy "✅ Gửi thông báo app (FCM): được".
   APPSSCRIPT_JSON (dán nguyên khối, từ dấu { tới dấu }):
   {
     "timeZone": "Asia/Ho_Chi_Minh",
     "dependencies": {},
     "exceptionLogging": "STACKDRIVER",
     "runtimeVersion": "V8",
     "oauthScopes": [
       "https://www.googleapis.com/auth/script.external_request",
       "https://www.googleapis.com/auth/script.scriptapp",
       "https://www.googleapis.com/auth/firebase.messaging",
       "https://www.googleapis.com/auth/cloud-platform"
     ]
   }
   -------------------------------------------------------------------------------------
   BẢN srv-4: thêm 2 mục báo cáo 🆔 Khai báo ID, 🏦 Khai báo tài khoản ngân hàng (chỉ ghi tên).

   Tới giờ hẹn (giờ Việt Nam) máy chủ tự gửi báo cáo vào Kênh Chung, KHÔNG CẦN ai mở web,
   có ai online hay không cũng gửi. Dùng đúng lịch + nội dung đang cài ở Admin > Bot Báo Cáo.
   Mỗi mốc giờ chỉ gửi ĐÚNG 1 LẦN: nếu trang Admin / bot.html đang mở cũng gửi dự phòng,
   ai giành được quyền trước thì gửi, bên kia tự bỏ qua.

   BẢN srv-3 SỬA:
   - Lỗi "Firestore 403 PERMISSION_DENIED" lúc tới giờ gửi: bản cũ giành quyền gửi bằng giao dịch
     khóa (chỉ tài khoản quản trị Google Cloud mới được dùng) nên Firestore chặn -> KHÔNG BAO GIỜ gửi
     được. Bản mới giành quyền giống hệt trang web nên gửi được.
   - Gửi ĐÚNG GIỜ tới từng giây (bản cũ trễ tới 1 phút): lượt chạy ngay trước mốc giờ sẽ chờ
     tới đúng giây rồi gửi.
   - Máy Admin để sai đồng hồ (chạy nhanh) -> bản cũ coi mốc giờ vừa nhập là "mốc cũ" và BỎ
     LUÔN, không gửi. Bản mới lấy giờ lưu thật của máy chủ Google nên không bị nữa.
   - Lỗi mạng: bản cũ thử 3 lần (tính chung với trang Admin) rồi bỏ hẳn mốc đó. Bản mới máy
     chủ thử lại mỗi phút, tối đa 10 lần, trong khoảng "Gửi bù khi trễ".
   - Đọc ít dữ liệu hơn (không tải ảnh đại diện) -> nhanh, không bị quá thời gian.
   - Báo lỗi rõ ràng: lỗi hiện ở Admin > Bot Báo Cáo, và Google gửi email khi máy chủ không
     ghi được trạng thái. Có hàm KIEM_TRA để tự dò lỗi.

   CÀI ĐẶT (1 lần, khoảng 3 phút):
   1. Mở https://script.google.com  ->  "Dự án mới" (New project).
      (Đã cài bản cũ: mở dự án "QD Bot Bao Cao" cũ, làm tiếp bước 2.)
   2. Xóa hết chữ có sẵn, dán TOÀN BỘ file này vào, bấm 💾 Lưu. Đặt tên dự án: "QD Bot Bao Cao".
   3. Ở thanh trên chọn hàm  CAI_DAT  ->  bấm ▶ Chạy (Run).
      Google hỏi quyền -> "Xem xét quyền" -> chọn tài khoản -> "Nâng cao" -> "Đi tới QD Bot Bao Cao" -> "Cho phép".
   4. Xong. Nhật ký (Execution log) hiện "ĐÃ CÀI XONG". Trong Admin > Bot Báo Cáo, ô
      "🖥️ Máy chủ tự gửi" chuyển sang "Đang chạy" sau tối đa 1 phút.

   HÀM KHÁC (chọn tên hàm rồi bấm ▶ Chạy):
   - KIEM_TRA  : tự dò lỗi (lịch chạy, quyền đọc / ghi, cấu hình, mốc kế tiếp, 5 lần gửi gần nhất).
   - XEM_THU   : soạn thử báo cáo với số liệu thật lúc này, chỉ in ra Nhật ký, KHÔNG gửi.
   - GUI_NGAY  : gửi 1 báo cáo vào Kênh Chung ngay bây giờ (ghi "Gửi tay · máy chủ").
   - GO_CAI_DAT: tắt máy chủ tự gửi (xóa lịch chạy mỗi phút).
   Bật / tắt Bot, đổi giờ, đổi nội dung: vẫn làm trong Admin như cũ, KHÔNG cần sửa file này.
   ===================================================================================== */

var PROJECT_ID = 'web-dangky-123';
var API_KEY = 'AIzaSyCtn0peiXBsrRRgUZSSVQFrBe-RGgxS6eQ';
// Chỉ điền khi KIEM_TRA báo "API key bị giới hạn theo trang web": ghi địa chỉ web của bạn, vd 'https://ten-web.github.io/'
var REFERER = '';
var VER = 'srv-12';
// Hạn mức Google Apps Script mỗi ngày: Gmail thường 20.000 lượt gọi mạng + 90 phút hẹn giờ; Google Workspace 100.000 + 360 phút
var QUOTA = { fetch: 20000, triggerMin: 90 };
var USE = { f: 0, n: 0, t0: Date.now() };   // lượt chạy này: f = lượt gọi mạng, n = thông báo đã gửi
function useDay() { return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'); }
function useGet() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('use_' + useDay()) || '{}'); } catch (e) { return {}; } }
function useNow() { var u = useGet(); return { day: useDay(), f: (u.f || 0) + USE.f, n: (u.n || 0) + USE.n, ms: (u.ms || 0), r: u.r || 0, h: u.h || 0, at: Date.now(), limF: QUOTA.fetch, limMin: QUOTA.triggerMin }; }
function useFlush(trig) {
  try {
    var P = PropertiesService.getScriptProperties(), day = useDay(), k = 'use_' + day, u = useGet();
    u.f = (u.f || 0) + USE.f; u.n = (u.n || 0) + USE.n;
    if (trig) { u.ms = (u.ms || 0) + (Date.now() - USE.t0); u.r = (u.r || 0) + 1; } else u.h = (u.h || 0) + 1;
    P.setProperty(k, JSON.stringify(u)); USE.f = 0; USE.n = 0; USE.t0 = Date.now();
    if (P.getProperty('use_last') !== day) {   // sang ngày mới: xóa số đếm cũ
      P.setProperty('use_last', day);
      Object.keys(P.getProperties()).forEach(function (x) { if (/^use_\d{4}-/.test(x) && x < 'use_' + Utilities.formatDate(new Date(Date.now() - 3 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd')) P.deleteProperty(x); });
    }
  } catch (e) {}
}
var WAIT_MAX = 75 * 1000;   // mốc giờ còn <= 75 giây nữa -> lượt này chờ tới đúng giây rồi gửi
var BUSY_MS = 120 * 1000;   // máy khác đang gửi quá 2 phút mà chưa xong -> máy chủ gửi thay
var MAX_TRIES = 10;         // số lần thử tối đa cho 1 mốc giờ (mỗi phút 1 lần)

/* ---------------- Cài / gỡ ---------------- */
function CAI_DAT() {
  GO_CAI_DAT(true);
  ScriptApp.newTrigger('chayMoiPhut').timeBased().everyMinutes(1).create();
  PropertiesService.getScriptProperties().deleteProperty('hb');
  var cfg = loadCfg();
  heartbeat(Date.now(), '', 'Đã cài máy chủ ' + VER, true, cfg);
  Logger.log('ĐÃ CÀI XONG (' + VER + '). Máy chủ kiểm tra mỗi phút và tự gửi báo cáo đúng giờ, có ai online hay không cũng gửi.');
  Logger.log('Bot hiện ' + (cfg.isEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT (bật trong Admin > Bot Báo Cáo)') + ' · giờ gửi: ' + (cfg.times.join(', ') || 'chưa có'));
  var n = nextRun(cfg, Date.now());
  if (cfg.isEnabled && n) Logger.log('Lần gửi kế tiếp: ' + dateShow(vnParts(n.ts)) + ' lúc ' + n.time);
  if (cfg.skipEmpty) Logger.log('LƯU Ý: đang bật "Không gửi khi chưa ai đăng nhập" -> hôm nào chưa ai vào web thì mốc giờ bị Bỏ qua. Muốn luôn gửi: tắt mục này trong Admin.');
}
function GO_CAI_DAT(silent) {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'chayMoiPhut') ScriptApp.deleteTrigger(t); });
  if (silent !== true) {
    try { fsPatch('settings/report_bot_server', { lastRun: Date.now(), stopped: true, ver: VER }); } catch (e) {}
    Logger.log('Đã tắt máy chủ tự gửi. Chạy CAI_DAT để bật lại.');
  }
}
function XEM_THU() {
  var cfg = loadCfg();
  var c = compose(cfg, collect(cfg, Date.now()));
  Logger.log('----- XEM THỬ (không gửi) -----\n' + c.text);
  Logger.log('Nhắc tên: ' + c.mentions.length + ' tài khoản');
}
function GUI_NGAY() {
  var now = Date.now(), p = vnParts(now), cfg = loadCfg();
  var r = send({ runId: 'manual_' + dateKey(p) + '_' + now.toString(36), time: hm(now), key: dateKey(p), ts: now }, cfg, true);
  Logger.log(r.ok ? 'Đã gửi báo cáo vào Kênh Chung.' : 'Chưa gửi được: ' + r.reason);
  if (r.ok) try { pushNow(5000); Logger.log('Đã báo lên điện thoại.'); } catch (e) { Logger.log('Thông báo app: ' + msgOf(e)); }
}

/* ---------------- Tự dò lỗi ---------------- */
function KIEM_TRA() {
  var L = function (s) { Logger.log(s); }, bad = 0, now = Date.now();
  L('===== KIỂM TRA MÁY CHỦ BOT (' + VER + ') · ' + dateShow(vnParts(now)) + ' ' + hm(now) + ' giờ VN =====');
  var tr = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'chayMoiPhut'; }).length;
  if (tr === 1) L('✅ Lịch chạy mỗi phút: có');
  else if (tr === 0) { bad++; L('❌ CHƯA có lịch chạy mỗi phút -> chọn hàm CAI_DAT rồi bấm ▶ Chạy.'); }
  else L('⚠️ Có ' + tr + ' lịch chạy trùng -> chạy lại CAI_DAT để dọn còn 1.');
  var cfg = null;
  try { cfg = loadCfg(); L('✅ Đọc cấu hình Bot: được'); }
  catch (e) { bad++; L('❌ Không đọc được cấu hình: ' + msgOf(e)); }
  if (cfg) {
    L('   Bot: ' + (cfg.isEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT  <- bật công tắc trong Admin > Bot Báo Cáo') + ' · giờ: ' + (cfg.times.join(', ') || 'chưa có')
      + ' · ngày: ' + cfg.days.map(function (d) { return WD[d]; }).join(', ') + (cfg.from || cfg.to ? ' · từ ' + (cfg.from || '…') + ' đến ' + (cfg.to || '…') : '') + ' · gửi bù: ' + cfg.grace + ' phút');
    if (cfg.clockFix) L('   ⚠️ Đồng hồ máy Admin lúc lưu bị lệch ' + Math.round(cfg.clockFix / 60000) + ' phút -> máy chủ đã tự chỉnh, không bỏ sót mốc giờ.');
    var n = nextRun(cfg, now);
    L('   Lần gửi kế tiếp: ' + (cfg.isEnabled && n ? dateShow(vnParts(n.ts)) + ' lúc ' + n.time : 'không có'));
    if (cfg.skipEmpty) L('   ⚠️ Đang bật "Không gửi khi chưa ai đăng nhập": hôm nào chưa ai vào web thì KHÔNG gửi. Muốn luôn gửi -> tắt mục này trong Admin.');
  }
  try { fsPatch('settings/report_bot_server', { checkAt: now, ver: VER }); L('✅ Ghi dữ liệu: được'); }
  catch (e) { bad++; L('❌ Không ghi được dữ liệu: ' + msgOf(e)); }
  try {
    var tp = 'bot_reports/_kiem_tra', td = fsCall('get', '/' + encPath(tp));
    fsCall('post', ':commit', { writes: [{ update: { name: docName(tp), fields: toFields({ checkAt: now, ver: VER }) }, currentDocument: td && td.updateTime ? { updateTime: td.updateTime } : { exists: false } }] });
    L('✅ Giành quyền gửi (ghi có điều kiện): được');
  } catch (e) { bad++; L('❌ Không giành được quyền gửi: ' + msgOf(e)); }
  try { fsList('accounts', ACC_FIELDS, 5); fsQuery({ from: [{ collectionId: 'attendance' }], limit: 1 }); L('✅ Đọc tài khoản + điểm danh: được'); }
  catch (e) { bad++; L('❌ Không đọc được tài khoản / điểm danh: ' + msgOf(e)); }
  try { fsList('users', ['submitter'], 1); L('✅ Đọc khai báo ID: được'); } catch (e) { L('⚠️ Không đọc được khai báo ID (mục 🆔 sẽ bị bỏ qua): ' + msgOf(e)); }
  try { fsList('bank_info', ['user'], 1); L('✅ Đọc khai báo ngân hàng: được'); } catch (e) { L('⚠️ Không đọc được khai báo ngân hàng (mục 🏦 sẽ bị bỏ qua): ' + msgOf(e)); }
  try {
    var hist = fsQuery({ from: [{ collectionId: 'bot_reports' }], orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }], limit: 5 });
    L('   5 lần gửi gần nhất:' + (hist.length ? '' : ' (chưa có)'));
    hist.forEach(function (x) { L('   · ' + (x.runId || '?') + ' · ' + (x.status || '?') + ' · ' + (x.by || '?') + ' · thử ' + (x.tries || 0) + ' lần' + (x.err ? ' · lỗi: ' + x.err : '') + (x.note ? ' · ' + x.note : '')); });
  } catch (e) {}
  try {
    var fr = fcmCall({ validate_only: true, message: { token: 'kiem-tra-quyen', data: { title: 'x' } } });
    if (fr.code === 200 || (fr.code === 400 && /token|INVALID_ARGUMENT/i.test(fr.text))) L('✅ Gửi thông báo app (FCM): được');
    else { bad++; L('❌ Gửi thông báo app (FCM): ' + fr.code + ' ' + fr.text.slice(0, 200) + fcmHint(fr)); }
  } catch (e) { bad++; L('❌ Gửi thông báo app (FCM): ' + msgOf(e) + ' -> làm bước a, b, c ở đầu file (appsscript.json + chạy CAI_DAT cho phép quyền).'); }
  try { var tk = pushTargets(null, null); L('   Máy đang nhận thông báo: ' + tk.length); } catch (e) {}
  try {
    var hu = ScriptApp.getService().getUrl() || '';
    L(hu ? '✅ Cửa gửi nhanh (Ứng dụng web): ' + hu + (/\/exec$/.test(hu) ? '' : '  <- đây là địa chỉ thử (/dev), hãy Triển khai -> Ứng dụng web để có địa chỉ /exec') : '⚠️ Chưa có cửa gửi nhanh: Triển khai -> Tùy chọn triển khai mới -> Ứng dụng web (xem đầu file). Không có vẫn gửi được, chỉ chậm tới 1 phút.');
  } catch (e) {}
  L(bad ? '===== CÓ ' + bad + ' LỖI (xem dòng ❌ ở trên) =====' : '===== MỌI THỨ ỔN. Tới giờ máy chủ sẽ tự gửi. =====');
}

/* ---------------- Chạy mỗi phút ---------------- */
function chayMoiPhut() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return;            // lượt trước đang chờ tới giờ / đang gửi
  var st = { note: '', err: '', sent: false, cfg: null }, hbErr = '';
  try { pushNow(1500); } catch (e) { Logger.log('Thông báo app: ' + msgOf(e)); }
  try { fsUsageTick(false); } catch (e) { Logger.log('Đếm lượt Firestore: ' + msgOf(e)); }
  try {
    runDue(st);
    // Mốc giờ sắp tới trong <= 75 giây: chờ tới đúng giây rồi gửi (lượt chạy sau có thể tới trễ)
    var cfg = st.cfg, n = cfg && cfg.isEnabled ? nextRun(cfg, Date.now()) : null;
    if (n && n.ts >= floorOf(cfg) && n.ts - Date.now() <= WAIT_MAX) {
      Utilities.sleep(Math.max(0, n.ts - Date.now() + 800));
      runDue(st);                              // đọc lại cấu hình mới nhất rồi mới gửi
    }
    if (st.sent) try { pushNow(5000); } catch (e) { Logger.log('Thông báo app (bot): ' + msgOf(e)); }   // báo cáo vừa gửi -> báo lên điện thoại luôn
  } catch (e) { st.err = msgOf(e); }
  finally {
    try { heartbeat(Date.now(), st.err, st.note, st.sent, st.cfg); } catch (e) { hbErr = msgOf(e); }
    useFlush(true);
    lock.releaseLock();
  }
  if (st.err) Logger.log('Lỗi: ' + st.err);
  // Không ghi được trạng thái -> Admin không thấy lỗi. Ném lỗi để Google ghi "Thất bại" và gửi email báo chủ dự án.
  if (hbErr) throw new Error('Máy chủ Bot không ghi được trạng thái: ' + hbErr);
}
function runDue(st) {
  var now = Date.now();
  try { st.cfg = loadCfg(); } catch (e) { st.err = msgOf(e); return; }
  if (!st.cfg.isEnabled) return;
  dueSlots(st.cfg, now).forEach(function (s) {
    try {
      var r = send(s, st.cfg, false);
      if (r.ok) { st.sent = true; st.note = 'Đã gửi mốc ' + s.time; st.err = ''; }
      else if (r.skipped) st.note = 'Bỏ qua mốc ' + s.time + ' (đang bật "Không gửi khi chưa ai đăng nhập")';
      else if (r.reason === 'giveup') st.err = 'Mốc ' + s.time + ' thử ' + MAX_TRIES + ' lần vẫn lỗi, đã dừng (xem Lịch sử gửi)';
    } catch (e) { st.err = 'Mốc ' + s.time + ': ' + msgOf(e); }
  });
}
// Báo "còn sống" cho Admin (ghi tối đa 1 lần / 4 phút, hoặc ngay khi có lỗi / vừa gửi)
function heartbeat(now, err, note, force, cfg) {
  var P = PropertiesService.getScriptProperties(), last = JSON.parse(P.getProperty('hb') || '{}');
  if (!force && !err && last.err === '' && now - (last.at || 0) < 4 * 60000) return;
  var data = { lastRun: now, ok: !err, err: String(err || '').slice(0, 300), ver: VER, every: 1, stopped: false };
  if (note) { data.note = note; data.noteAt = now; }
  var n = cfg && cfg.isEnabled ? nextRun(cfg, now) : null;
  data.nextAt = n ? n.ts : 0;
  fsPatch('settings/report_bot_server', data);
  P.setProperty('hb', JSON.stringify({ at: now, err: err || '' }));
}
function msgOf(e) {
  var m = String((e && (e.message || e)) || 'Lỗi không rõ');
  if (/referer|REFERRER/i.test(m)) m += ' -> API key đang bị giới hạn theo trang web: điền REFERER ở đầu file (địa chỉ web của bạn), hoặc bỏ giới hạn trong Google Cloud > Credentials.';
  else if (/API_KEY_SERVICE_BLOCKED|API has not been used|SERVICE_DISABLED/i.test(m)) m += ' -> API key chưa được dùng Cloud Firestore API: mở Google Cloud > Credentials, cho phép "Cloud Firestore API".';
  else if (/PERMISSION_DENIED|403/.test(m)) m += ' -> Firestore Rules đang chặn: cho phép đọc/ghi settings, accounts, attendance, bot_reports, private_chat như trang web.';
  else if (/RESOURCE_EXHAUSTED|429|quota|too many times/i.test(m)) m += ' -> Hết hạn mức trong ngày (Firestore hoặc Google Apps Script).';
  return m.slice(0, 300);
}

/* ---------------- Cấu hình: chống đồng hồ máy Admin chạy sai ----------------
   enabledAt / schedAt do máy Admin ghi theo đồng hồ của máy đó. Nếu đồng hồ chạy NHANH,
   mốc giờ vừa nhập bị coi là "trước lúc lưu" -> bị bỏ. Lấy giờ lưu thật (updateTime của
   Google) làm trần để không bỏ sót. */
function loadCfg() {
  var d = fsCall('get', '/' + encPath('settings/report_bot'));
  var cfg = norm(d && d.fields ? fromFields(d.fields) : null);
  var upd = d && d.updateTime ? parseTs(d.updateTime) : 0;
  cfg.clockFix = 0;
  if (upd) ['enabledAt', 'schedAt'].forEach(function (k) {
    if (cfg[k] > upd + 5000) { cfg.clockFix = Math.max(cfg.clockFix, cfg[k] - upd); cfg[k] = upd; }
  });
  return cfg;
}
function parseTs(s) { return Date.parse(String(s).replace(/(\.\d{3})\d+/, '$1')) || 0; }
function floorOf(cfg) { return Math.max(cfg.enabledAt || 0, cfg.schedAt || 0) - 60000; }

/* =====================================================================================
   PHẦN DƯỚI GIỐNG bộ máy Bot trên web (qd-report-bot) - không cần sửa
   ===================================================================================== */
var VN = 7 * 3600e3, BOT = 'qd_bot', DAY = 864e5;
var WD = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
var DEF = {
  isEnabled: false, enabledAt: 0, schedAt: 0,
  times: ['20:00'], days: [0, 1, 2, 3, 4, 5, 6], from: '', to: '',
  grace: 60,
  botName: 'Bot Báo Cáo',
  title: '📋 BÁO CÁO HOẠT ĐỘNG — {thu}, {ngay}',
  footer: 'Cảm ơn anh em đã có mặt hôm nay! Ai chưa điểm danh nhớ vào đúng giờ nhé 💪',
  sec: { att: true, login: true, loginNoAtt: true, noLogin: false, locked: true, gameId: true, bank: true },
  tag: true, showTime: true, excludeStaff: true, exclude: [], maxNames: 100, skipEmpty: false
};
var ACC_FIELDS = ['user', 'role', 'isBlocked', 'lockReason', 'lastActive', 'online', 'lastLoginDate', 'lastLoginAt'];
function pad(n) { return (n < 10 ? '0' : '') + n; }
function vnParts(t) {
  var d = new Date((t == null ? Date.now() : t) + VN);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
function dateKey(p) { return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
function dateVN(p) { return p.d + '/' + p.m + '/' + p.y; }
function dateShow(p) { return pad(p.d) + '/' + pad(p.m) + '/' + p.y; }
function dayStart(p) { return Date.UTC(p.y, p.m - 1, p.d) - VN; }
function hm(t) { var p = vnParts(t); return pad(p.h) + ':' + pad(p.mi); }

function norm(c) {
  c = c || {};
  var o = JSON.parse(JSON.stringify(DEF)), n = function (v, def, lo, hi) { v = parseInt(v, 10); return isNaN(v) ? def : Math.max(lo, Math.min(hi, v)); };
  o.isEnabled = c.isEnabled === true; o.enabledAt = +c.enabledAt || 0; o.schedAt = +c.schedAt || 0;
  if (Array.isArray(c.times)) {
    var seen = {};
    o.times = c.times.map(function (t) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim()); if (!m || +m[1] > 23 || +m[2] > 59) return null; return pad(+m[1]) + ':' + m[2]; })
      .filter(function (t) { if (!t || seen[t]) return false; seen[t] = 1; return true; }).sort().slice(0, 12);
  }
  if (Array.isArray(c.days)) { var sd = {}; o.days = c.days.map(Number).filter(function (x) { if (!(x >= 0 && x <= 6) || sd[x]) return false; sd[x] = 1; return true; }).sort(); }
  var dk = /^\d{4}-\d{2}-\d{2}$/;
  o.from = dk.test(c.from || '') ? c.from : ''; o.to = dk.test(c.to || '') ? c.to : '';
  o.grace = n(c.grace, DEF.grace, 5, 720);
  ['botName', 'title', 'footer'].forEach(function (k) { if (typeof c[k] === 'string') o[k] = c[k].slice(0, k === 'botName' ? 40 : 300); });
  if (!o.botName.trim()) o.botName = DEF.botName;
  if (c.sec && typeof c.sec === 'object') Object.keys(o.sec).forEach(function (k) { if (typeof c.sec[k] === 'boolean') o.sec[k] = c.sec[k]; });
  ['tag', 'showTime', 'excludeStaff', 'skipEmpty'].forEach(function (k) { if (typeof c[k] === 'boolean') o[k] = c[k]; });
  if (Array.isArray(c.exclude)) o.exclude = c.exclude.map(function (u) { return String(u).replace(/^@/, '').trim(); }).filter(Boolean).slice(0, 300);
  o.maxNames = n(c.maxNames, DEF.maxNames, 10, 500);
  return o;
}
function dayOk(cfg, p) {
  if (cfg.days.indexOf(p.wd) < 0) return false;
  var k = dateKey(p);
  return !(cfg.from && k < cfg.from) && !(cfg.to && k > cfg.to);
}
function slotsFor(cfg, p) {
  if (!dayOk(cfg, p)) return [];
  var k = dateKey(p), st = dayStart(p);
  return cfg.times.map(function (t) { var a = t.split(':'); return { time: t, key: k, ts: st + (+a[0]) * 3600e3 + (+a[1]) * 60e3, runId: k + '_' + a[0] + a[1] }; });
}
function nextRun(cfg, now) {
  if (!cfg.times.length || !cfg.days.length) return null;
  for (var i = 0; i < 400; i++) {
    var p = vnParts(now + i * DAY);
    if (cfg.to && dateKey(p) > cfg.to) return null;
    var s = slotsFor(cfg, p).filter(function (x) { return x.ts > now; })[0];
    if (s) return s;
  }
  return null;
}
// Mốc tới hạn: hôm nay + hôm qua (mốc gần nửa đêm, gửi bù sang ngày mới vẫn còn hạn)
function dueSlots(cfg, now) {
  var floor = floorOf(cfg);
  return slotsFor(cfg, vnParts(now - DAY)).concat(slotsFor(cfg, vnParts(now)))
    .filter(function (s) { return s.ts <= now && now - s.ts <= cfg.grace * 60000 && s.ts >= floor; });
}

/* ---------- Thu số liệu ---------- */
function collect(cfg, at) {
  var p = vnParts(at), start = dayStart(p), key = dateKey(p), d1 = dateVN(p), d2 = dateShow(p);
  var ex = {}; cfg.exclude.forEach(function (u) { ex[u.toLowerCase()] = 1; });
  var accDocs = fsList('accounts', ACC_FIELDS);
  var attDocs = fsQuery({ select: { fields: [{ fieldPath: 'userName' }, { fieldPath: 'timestamp' }, { fieldPath: 'time' }] },
    from: [{ collectionId: 'attendance' }], where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'IN', value: toFs(d1 === d2 ? [d1] : [d1, d2]) } } });
  var accs = [], by = {}, locked = [];
  accDocs.forEach(function (a) {
    var u = String(a.user || '').trim();
    if (!u || u === BOT || ex[u.toLowerCase()]) return;
    var role = a.role || (u === 'admin' ? 'admin' : 'user');
    if (cfg.excludeStaff && (role === 'admin' || role === 'manager')) return;
    if (a.isBlocked === true) { locked.push({ u: u, why: a.lockReason === 'security' ? 'nghi gian lận' : '' }); return; }
    var o = { u: u, role: role, la: +a.lastActive || 0, online: a.online !== false, ll: a.lastLoginDate === key ? (+a.lastLoginAt || 0) : 0 };
    accs.push(o); by[u] = o;
  });
  var att = {};
  attDocs.forEach(function (x) {
    var u = x.userName; if (!u || !by[u]) return;
    var ts = +x.timestamp || 0; if (!att[u] || ts < att[u].ts) att[u] = { ts: ts, time: x.time || '' };
  });
  var cmpName = function (a, b) { return a.u.localeCompare(b.u, 'vi', { sensitivity: 'base' }); };
  // Ai đã khai ID (users) / ngân hàng (bank_info): chỉ lấy tên + giờ khai. Không đọc được -> bỏ qua mục đó, báo cáo vẫn gửi.
  var idTs = {}, bkTs = {}, idOk = true, bkOk = true;
  try {
    fsList('users', ['submitter', 'gameId', 'timestamp']).forEach(function (x) {
      var u = String(x.submitter || '').trim(), ts = +x.timestamp || 0;
      if (u && by[u] && x.gameId && (!idTs[u] || ts > idTs[u].ts)) idTs[u] = { ts: ts };
    });
  } catch (e) { idOk = false; }
  try {
    fsList('bank_info', ['user', 'accNo', 'changedAt', 'updatedAt']).forEach(function (x) {
      var u = String(x.user || x._id || '').trim(), ts = +x.changedAt || +x.updatedAt || 0;
      if (u && by[u] && x.accNo) bkTs[u] = { ts: ts };
    });
  } catch (e) { bkOk = false; }
  var byTs = function (m) { return function (a, b) { return (m[a.u].ts || 0) - (m[b.u].ts || 0); }; };
  var idDone = accs.filter(function (a) { return idTs[a.u]; }), bkDone = accs.filter(function (a) { return bkTs[a.u]; });
  var attended = accs.filter(function (a) { return att[a.u]; }).sort(function (a, b) { return att[a.u].ts - att[b.u].ts; });
  var logged = accs.filter(function (a) { return att[a.u] || a.ll || a.la >= start; }).sort(cmpName);
  var inLog = {}; logged.forEach(function (a) { inLog[a.u] = 1; });
  return {
    at: at, p: p, total: accs.length, att: att, attended: attended, loggedIn: logged,
    loginNoAtt: logged.filter(function (a) { return !att[a.u]; }),
    noLogin: accs.filter(function (a) { return !inLog[a.u]; }).sort(cmpName),
    locked: locked.sort(cmpName),
    idOk: idOk, idTs: idTs, idDone: idDone, idNew: idDone.filter(function (a) { return idTs[a.u].ts >= start; }).sort(byTs(idTs)), idMissing: accs.filter(function (a) { return !idTs[a.u]; }).sort(cmpName),
    bkOk: bkOk, bkTs: bkTs, bkDone: bkDone, bkNew: bkDone.filter(function (a) { return bkTs[a.u].ts >= start; }).sort(byTs(bkTs)), bkMissing: accs.filter(function (a) { return !bkTs[a.u]; }).sort(cmpName),
    online: accs.filter(function (a) { return a.online && at - a.la < 120000; }).length
  };
}

/* ---------- Soạn tin ---------- */
function fill(tpl, v) { return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }
function compose(cfg, d) {
  var men = {};
  function list(arr, withTime, empty) {
    if (!arr.length) return empty || '— Chưa có ai —';
    var shown = arr.slice(0, cfg.maxNames);
    var s = shown.map(function (a) {
      if (cfg.tag) men[a.u] = 1;
      var tm = withTime === true ? d.att : withTime;   // true = giờ điểm danh; hoặc bảng giờ khai báo
      return (cfg.tag ? '@' : '') + a.u + (tm && cfg.showTime && tm[a.u] && tm[a.u].ts ? ' (' + hm(tm[a.u].ts) + ')' : '') + (a.why ? ' (' + a.why + ')' : '');
    }).join(', ');
    if (arr.length > shown.length) s += ' … và ' + (arr.length - shown.length) + ' người khác';
    return s;
  }
  var pct = d.total ? Math.round(d.attended.length * 1000 / d.total) / 10 : 0;
  var v = { ngay: dateShow(d.p), thu: WD[d.p.wd], gio: hm(d.at), diemdanh: d.attended.length, dangnhap: d.loggedIn.length,
    chuadiemdanh: d.loginNoAtt.length, chuavao: d.noLogin.length, bikhoa: d.locked.length, tong: d.total, tile: String(pct).replace('.', ',') + '%', bot: cfg.botName,
    khaiid: d.idDone.length, chuakhaiid: d.idMissing.length, khainh: d.bkDone.length, chuakhainh: d.bkMissing.length };
  var out = [], t = fill(cfg.title, v).trim();
  if (t) out.push(t);
  out.push('⏰ Chốt số liệu lúc ' + v.gio + ' · ' + d.total + ' thành viên');
  if (cfg.sec.att) out.push('', '✅ ĐÃ ĐIỂM DANH: ' + d.attended.length + '/' + d.total + ' (' + v.tile + ')', list(d.attended, true));
  if (cfg.sec.login) out.push('', '🔐 ĐĂNG NHẬP HÔM NAY: ' + d.loggedIn.length + '/' + d.total, list(d.loggedIn));
  if (cfg.sec.loginNoAtt) out.push('', '⚠️ ĐÃ VÀO NHƯNG CHƯA ĐIỂM DANH: ' + d.loginNoAtt.length, list(d.loginNoAtt));
  if (cfg.sec.noLogin) out.push('', '😴 CHƯA ĐĂNG NHẬP: ' + d.noLogin.length, list(d.noLogin));
  if (cfg.sec.locked) out.push('', '🔒 TÀI KHOẢN BỊ KHÓA: ' + d.locked.length, list(d.locked, false, '— Không có tài khoản nào bị khóa —'));
  function decl(on, ok, icon, label, done, fresh, miss, tm) {
    if (!on || !ok) return;
    out.push('', icon + ' ' + label + ': ' + done.length + '/' + d.total + ' đã khai' + (fresh.length ? ' · hôm nay +' + fresh.length : ''));
    if (fresh.length) out.push('🆕 Mới khai hôm nay: ' + list(fresh, tm));
    out.push('⏳ Chưa khai: ' + (miss.length ? miss.length + ' — ' : '') + list(miss, false, 'Tất cả đã khai 🎉'));
  }
  decl(cfg.sec.gameId, d.idOk, '🆔', 'KHAI BÁO ID', d.idDone, d.idNew, d.idMissing, d.idTs);
  decl(cfg.sec.bank, d.bkOk, '🏦', 'KHAI BÁO TÀI KHOẢN NGÂN HÀNG', d.bkDone, d.bkNew, d.bkMissing, d.bkTs);
  var f = fill(cfg.footer, v).trim(); if (f) out.push('', f);
  return {
    text: out.join('\n').slice(0, 30000), mentions: Object.keys(men),
    counts: { total: d.total, att: d.attended.length, login: d.loggedIn.length, loginNoAtt: d.loginNoAtt.length, noLogin: d.noLogin.length, locked: d.locked.length, online: d.online,
      gameId: d.idDone.length, gameIdNew: d.idNew.length, bank: d.bkDone.length, bankNew: d.bkNew.length }
  };
}

/* ---------- Gửi: giành quyền (giao dịch) -> thu số liệu -> ghi tin Kênh Chung + lịch sử cùng lúc ---------- */
function send(slot, cfg, manual) {
  var path = 'bot_reports/' + slot.runId;
  var got = claim(path, slot, manual);
  if (got !== 'ok') return { ok: false, reason: got };
  try {
    var data = collect(cfg, Date.now()), comp = compose(cfg, data);
    if (cfg.skipEmpty && !manual && !data.loggedIn.length) {
      fsPatch(path, { status: 'skipped', note: 'Hôm nay chưa ai đăng nhập', doneAt: Date.now(), counts: comp.counts });
      return { ok: false, reason: 'done', skipped: true };
    }
    var id = autoId(), t = Date.now();
    var msg = { conversationId: 'general_room', from: BOT, to: 'all', text: comp.text, imageUrl: null, time: t, read: false, heart: false, hearts: [], readBy: [],
      bot: true, botName: cfg.botName, mentions: comp.mentions, reportId: slot.runId };
    var rep = { status: 'sent', msgId: id, sentAt: t, counts: comp.counts, text: comp.text.slice(0, 6000), err: '' };
    fsCall('post', ':commit', { writes: [
      { update: { name: docName('private_chat/' + id), fields: toFields(msg) }, currentDocument: { exists: false } },
      { update: { name: docName(path), fields: toFields(rep) }, updateMask: { fieldPaths: Object.keys(rep) } }
    ] });
    return { ok: true, msgId: id };
  } catch (e) {
    try { fsPatch(path, { status: 'error', err: msgOf(e).slice(0, 200), errAt: Date.now() }); } catch (er) {}
    throw e;
  }
}
// Giành quyền gửi KHÔNG dùng beginTransaction (giao dịch khóa chỉ dành cho tài khoản quản trị
// Google Cloud -> dùng API key bị Firestore chặn "403 PERMISSION_DENIED").
// Làm giống thư viện Firebase trên web: đọc -> ghi kèm điều kiện "chưa ai sửa từ lúc đọc".
// Trang Admin giành trước -> điều kiện sai -> máy chủ tự bỏ qua. Mỗi mốc vẫn chỉ gửi 1 lần.
function claim(path, slot, manual) {
  var d = fsCall('get', '/' + encPath(path)), x = d && d.fields ? fromFields(d.fields) : (d ? {} : null), t = Date.now(), why = '';
  if (x) {
    if (x.status === 'sent' || x.status === 'skipped') why = 'done';
    else if (x.status === 'sending' && t - (+x.at || 0) < BUSY_MS) why = 'busy';
    else if ((x.tries || 0) >= MAX_TRIES) why = 'giveup';
  }
  if (why) return why;
  var rec = { runId: slot.runId, slot: slot.time, dateKey: slot.key, due: slot.ts, status: 'sending', by: 'máy chủ', byRole: 'server', at: t, tries: ((x && x.tries) || 0) + 1, manual: !!manual };
  var pre = d && d.updateTime ? { updateTime: d.updateTime } : { exists: false };
  try {
    fsCall('post', ':commit', { writes: [{ update: { name: docName(path), fields: toFields(rec) }, updateMask: { fieldPaths: Object.keys(rec) }, currentDocument: pre }] });
  } catch (e) {
    if (/FAILED_PRECONDITION|ALREADY_EXISTS|NOT_FOUND|ABORTED| 409 | 400 /i.test(String(e && e.message))) return 'busy';   // máy khác vừa giành trước
    throw e;
  }
  return 'ok';
}


/* =====================================================================================
   THÔNG BÁO ĐẨY ĐẾN APP ANDROID (Firebase Cloud Messaging, gửi bằng tài khoản Google chủ dự án)
   - push_broadcast {title, body, target:'all'|tên, status:'pending'} (Admin tạo) -> gửi -> status 'done' + sent/failed/devices
   - private_chat mới: tin riêng -> người nhận; Kênh Chung có @nhắc tên -> người được nhắc (@all: mọi người)
   Mã máy: accounts/{id}.pushTokens (app tự lưu khi đăng nhập). Mã hỏng (gỡ app / đăng xuất) tự xóa.
   ===================================================================================== */
var PUSH_CHAT = true;          // false = chỉ gửi thông báo do Admin soạn, không báo tin nhắn (tắt hẳn, bỏ qua công tắc Admin)
// Công tắc trong Admin > Thông báo app (settings/push_config), nhớ 60 giây cho đỡ đọc
function pushCfg() {
  var C = CacheService.getScriptCache(), v = C.get('pushCfg');
  if (v) return JSON.parse(v);
  var x = {}; try { x = fsGet('settings/push_config') || {}; } catch (e) {}
  var o = { private: x.private !== false, mention: x.mention !== false, general: x.general === true, bot: x.bot !== false };
  C.put('pushCfg', JSON.stringify(o), 60);
  return o;
}
function fcmCall(body) {
  USE.f++; var r = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + PROJECT_ID + '/messages:send', fcmOpt(body));
  return { code: r.getResponseCode(), text: r.getContentText() };
}
function fcmOpt(body) {
  return { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(body),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROJECT_ID } };
}
function fcmHint(r) {
  if (r.code === 401 || /insufficient|scope/i.test(r.text)) return ' -> chưa cho phép quyền: làm bước a, b, c ở đầu file.';
  if (/SERVICE_DISABLED|has not been used|disabled/i.test(r.text)) return ' -> bật "Firebase Cloud Messaging API" cho dự án ' + PROJECT_ID + ' trong Google Cloud Console (APIs & Services).';
  if (r.code === 403) return ' -> tài khoản Google chạy máy chủ phải là chủ (Owner) / người chỉnh sửa dự án Firebase ' + PROJECT_ID + '.';
  return '';
}
var _accCache = null;
function pushAccounts() { return _accCache || (_accCache = fsList('accounts', ['user', 'fullName', 'name', 'pushTokens', 'isBlocked'])); }
// users = ['an','binh'] hoặc null (tất cả); trả về [{ token, id }]
function pushTargets(users, except) {
  var want = null; if (users) { want = {}; users.forEach(function (u) { want[u] = 1; }); }
  var out = [], seen = {};
  pushAccounts().forEach(function (a) {
    var u = String(a.user || ''); if (!u || u === except || a.isBlocked === true || (want && !want[u])) return;
    (Array.isArray(a.pushTokens) ? a.pushTokens : []).forEach(function (t) { if (t && !seen[t]) { seen[t] = 1; out.push({ token: t, id: a._id }); } });
  });
  return out;
}
function pushNameOf(u) { var a = pushAccounts().filter(function (x) { return x.user === u; })[0]; return (a && (a.fullName || a.name)) || u; }
function clipS(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function pushSend(targets, data) {
  var sent = 0, failed = 0, dead = [];
  var d = { title: clipS(data.title, 120), body: clipS(data.body, 500), room: String(data.room || ''), always: data.always ? '1' : '0' };
  if (/^https:\/\/\S+$/.test(String(data.image || '')) && String(data.image).length < 1500) d.image = String(data.image);
  if (data.type) d.type = String(data.type).slice(0, 20);   // 'call' = cuộc gọi đến (đổ chuông), 'call_end' = tắt chuông
  if (data.from) d.from = String(data.from).slice(0, 60);   // tên đăng nhập người gửi -> app lấy ảnh đại diện   // ảnh lớn (chỉ link https)
  for (var i = 0; i < targets.length; i += 50) {
    var part = targets.slice(i, i + 50);
    USE.f += part.length;
    var res = UrlFetchApp.fetchAll(part.map(function (t) {
      var o = fcmOpt({ message: { token: t.token, data: d, android: { priority: 'HIGH', ttl: data.type === 'call' ? '40s' : data.type === 'call_end' ? '120s' : '21600s' } } });
      o.url = 'https://fcm.googleapis.com/v1/projects/' + PROJECT_ID + '/messages:send'; return o;
    }));
    res.forEach(function (r, k) {
      var c = r.getResponseCode();
      if (c === 200) { sent++; USE.n++; }
      else { failed++; if (c === 404 || /UNREGISTERED|registration token is not a valid/i.test(r.getContentText())) dead.push(part[k]); }
    });
  }
  dead.forEach(function (t) {
    try { fsCall('post', ':commit', { writes: [{ transform: { document: docName('accounts/' + t.id), fieldTransforms: [{ fieldPath: 'pushTokens', removeAllFromArray: { values: [{ stringValue: t.token }] } }] } }] }); } catch (e) {}
  });
  return { sent: sent, failed: failed };
}
// runQuery trả cả đường dẫn + updateTime (để giành quyền gửi)
function fsQueryDocs(sq) {
  var r = fsCall('post', ':runQuery', { structuredQuery: sq });
  return (r || []).filter(function (x) { return x.document; }).map(function (x) {
    var n = x.document.name; return { path: n.slice(n.indexOf('/documents/') + 11), updateTime: x.document.updateTime, data: fromFields(x.document.fields || {}) };
  });
}
// Kênh Chung: người được @nhắc nhận "📣 ... nhắc đến bạn"; bật "Mọi tin Kênh Chung" thì người còn lại nhận "💬 Kênh Chung"
function mentionAndGeneral(PC, m, men, all, who, text) {
  var sent = 0, got = {}, body = clipS(text || 'Gửi một ảnh đính kèm', 180);
  if (PC.mention && men.length) {
    var tg = pushTargets(all ? null : men, m.from);
    tg.forEach(function (t) { got[t.token] = 1; });
    if (tg.length) sent += pushSend(tg, { title: '📣 ' + who + ' nhắc đến bạn trong Kênh Chung', body: body, room: 'general_room', from: m.from }).sent;
  }
  if (PC.general) {
    var rest = pushTargets(null, m.from).filter(function (t) { return !got[t.token]; });
    if (rest.length) sent += pushSend(rest, { title: '💬 Kênh Chung · ' + who, body: body, room: 'general_room', from: m.from }).sent;
  }
  return sent;
}
// Bot báo cáo: người bị @nhắc tên nhận "📣 ... nhắc đến bạn", người còn lại nhận "📊 <tên bot>" + vài dòng đầu báo cáo
function botPush(m) {
  var name = clipS(String(m.botName || 'Bot báo cáo').trim() || 'Bot báo cáo', 40);
  var lines = String(m.text || '').split('\n').map(function (l) { return l.replace(/\*\*|__/g, '').trim(); })
    .filter(function (l) { return l && !/^[─━—=\-_·.\s]+$/.test(l) && !/^(@\S+[\s,]*)+$/.test(l); });
  var body = clipS(lines.slice(0, 6).join('\n') || 'Có báo cáo mới trong Kênh Chung', 400);
  var men = Array.isArray(m.mentions) ? m.mentions : [], all = men.indexOf('all') >= 0, got = {}, sent = 0;
  if (men.length && !all) {
    var tg = pushTargets(men, null);
    tg.forEach(function (t) { got[t.token] = 1; });
    if (tg.length) sent += pushSend(tg, { title: '📣 ' + name + ' nhắc đến bạn trong Kênh Chung', body: body, room: 'general_room' }).sent;
  }
  var rest = pushTargets(null, null).filter(function (t) { return !got[t.token]; });
  if (rest.length) sent += pushSend(rest, { title: (all ? '📣 ' : '📊 ') + name, body: body, room: 'general_room' }).sent;
  return sent;
}
// Chạy gửi thông báo, không cho 2 lượt chạy cùng lúc (lịch mỗi phút + cửa gửi nhanh)
function pushNow(waitMs) {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(waitMs || 1500)) return { ok: false, busy: true };
  try { pushRun(); return { ok: true }; } finally { lock.releaseLock(); }
}
// CỬA GỬI NHANH (Ứng dụng web): trang web gọi địa chỉ /exec -> gửi ngay các việc đang chờ.
// Không nhận nội dung từ bên ngoài: chỉ đọc push_broadcast / tin nhắn trong Firestore như lịch mỗi phút.
function doGet(e) {
  var r;
  if (e && e.parameter && e.parameter.usage === '1') { try { fsUsageTick(false, 60000); } catch (er) {} }   // Admin bấm "Làm mới" (tối đa 1 lần / phút)
  try { r = pushNow(20000); } catch (er) { r = { ok: false, err: msgOf(er) }; }
  useFlush(false);
  r.ver = VER;
  return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) { return doGet(e); }
function pushRun() {
  _accCache = null;
  var P = PropertiesService.getScriptProperties(), now = Date.now(), sentAll = 0, err = '';
  // 1) Admin gửi
  try {
    fsQueryDocs({ from: [{ collectionId: 'push_broadcast' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'pending' } } }, limit: 10 })
      .forEach(function (doc) {
        var b = doc.data;
        try {   // giành quyền: chỉ đổi 'pending' -> 'sending' nếu chưa ai đụng vào (máy chủ GitHub cũng có thể đang chạy)
          fsCall('post', ':commit', { writes: [{ update: { name: docName(doc.path), fields: toFields({ status: 'sending', startedAt: Date.now(), by: 'apps-script' }) }, updateMask: { fieldPaths: ['status', 'startedAt', 'by'] }, currentDocument: { updateTime: doc.updateTime } }] });
        } catch (e) { return; }
        try {
          if (now - (+b.createdAt || 0) > DAY) { fsPatch(doc.path, { status: 'expired', doneAt: Date.now() }); return; }
          var target = String(b.target || 'all').trim() || 'all';
          var tg = pushTargets(target === 'all' ? null : [target], null);
          var r = tg.length ? pushSend(tg, { title: b.title || 'QD Elite', body: b.body || '', room: b.room || '', image: b.image || '', always: true }) : { sent: 0, failed: 0 };
          sentAll += r.sent;
          fsPatch(doc.path, { status: 'done', sent: r.sent, failed: r.failed, devices: tg.length, doneAt: Date.now() });
        } catch (e) { fsPatch(doc.path, { status: 'error', error: msgOf(e), doneAt: Date.now() }); err = msgOf(e); }
      });
  } catch (e) { err = msgOf(e); }
  // 1b) Cuộc gọi thoại / video: người nhận đang tắt app -> đổ chuông; người gọi hủy / hết giờ -> tắt chuông
  try {
    var CC = CacheService.getScriptCache();
    fsQueryDocs({ from: [{ collectionId: 'calls' }], where: { fieldFilter: { field: { fieldPath: 'created' }, op: 'GREATER_THAN', value: { integerValue: String(now - 150000) } } }, limit: 40 })
      .forEach(function (x) {
        var c = x.data, id = x.path.split('/').pop(), kR = 'cr_' + id, kE = 'ce_' + id, to = String(c.to || '');
        if (!to || !c.from) return;
        if (c.status === 'ringing' && now - (+c.created || 0) < 45000) {
          if (CC.get(kR)) return; CC.put(kR, '1', 900);
          var tg = pushTargets([to], null); if (!tg.length) return;
          sentAll += pushSend(tg, { title: '📞 ' + clipS(c.fromName || pushNameOf(c.from), 40) + (c.type === 'video' ? ' đang gọi video cho bạn' : ' đang gọi cho bạn'), body: 'Chạm để nghe máy', room: 'call:' + id, from: c.from, type: 'call' }).sent;
        } else if (CC.get(kR) && !CC.get(kE)) {
          CC.put(kE, '1', 900);
          var te = pushTargets([to], null); if (te.length) pushSend(te, { title: 'Cuộc gọi đã kết thúc', body: '', room: 'call:' + id, type: 'call_end' });
        }
      });
  } catch (e) { Logger.log('Cuộc gọi: ' + msgOf(e)); }
  // 2) Tin nhắn mới (riêng / @nhắc tên): đọc lại 3 phút gần nhất, nhớ mã tin đã xử lý 1 giờ
  //    -> máy người gửi để đồng hồ lệch vẫn không bị sót, gõ cửa nhiều lần vẫn không báo trùng
  var PC = pushCfg();
  if (PUSH_CHAT && (PC.private || PC.mention || PC.general || PC.bot)) try {
    var C = CacheService.getScriptCache(), since = +P.getProperty('chatSince') || 0;
    if (!since || now - since > 15 * 60000) since = now - 90 * 1000;      // lần đầu / máy chủ nghỉ lâu: không báo dồn tin cũ
    var docs = fsQueryDocs({ select: { fields: ['conversationId', 'from', 'to', 'text', 'time', 'bot', 'botName', 'mentions', 'revoked'].map(function (f) { return { fieldPath: f }; }) },
      from: [{ collectionId: 'private_chat' }], where: { fieldFilter: { field: { fieldPath: 'time' }, op: 'GREATER_THAN', value: { integerValue: String(since - 180000) } } },
      orderBy: [{ field: { fieldPath: 'time' }, direction: 'ASCENDING' }], limit: 300 });
    var keys = docs.map(function (x) { return 'pm_' + x.path.split('/').pop(); }), done = keys.length ? C.getAll(keys) : {}, mark = {};
    docs.forEach(function (x, i) {
      var m = x.data; if (done[keys[i]]) return; mark[keys[i]] = '1';
      if (m.revoked || now - (+m.time || 0) > 10 * 60000) return;         // tin đã thu hồi / quá cũ (đồng hồ lệch quá nhiều) -> bỏ
      if (m.bot || m.from === BOT) { if (PC.bot && m.conversationId === 'general_room') sentAll += botPush(m); return; }   // tin Bot báo cáo
      if (!m.from) return;
      var text = m.text ? String(m.text) : '', who = pushNameOf(m.from), tg, r;
      if (m.conversationId === 'general_room') {
        var men = Array.isArray(m.mentions) ? m.mentions : [], all = men.indexOf('all') >= 0;
        sentAll += mentionAndGeneral(PC, m, men, all, who, text);
        return;
      } else {
        if (!PC.private) return;
        if (!m.to || m.to === 'all' || m.to === m.from) return;
        tg = pushTargets([m.to], null); if (!tg.length) return;
        r = pushSend(tg, { title: 'Tin nhắn từ ' + who, body: text || 'Đã gửi một ảnh đính kèm', room: m.conversationId || '', from: m.from });
      }
      sentAll += r.sent;
    });
    if (Object.keys(mark).length) C.putAll(mark, 3600);
    P.setProperty('chatSince', String(now));
  } catch (e) { err = err || msgOf(e); }
  // Trạng thái cho Admin (ghi khi có gửi / có lỗi / 5 phút 1 lần)
  var last = +P.getProperty('pushHb') || 0;
  if (sentAll || err || now - last > 5 * 60000) {
    var hook = ''; try { hook = ScriptApp.getService().getUrl() || ''; } catch (e) {}
    try { fsPatch('settings/push_server', { lastRun: now, ok: !err, err: String(err || '').slice(0, 300), by: 'apps-script', ver: VER, lastSent: sentAll ? now : (+P.getProperty('pushLastSent') || 0), use: useNow(), hookAuto: /\/exec$/.test(hook) ? hook : '' }); P.setProperty('pushHb', String(now)); } catch (e) {}
    if (sentAll) P.setProperty('pushLastSent', String(now));
  }
}

/* =====================================================================================
   Firestore REST (dùng cùng API key với trang web)
   ===================================================================================== */
/* ---------- srv-12: LƯỢT ĐỌC / GHI / XÓA FIRESTORE HÔM NAY (Google Cloud Monitoring) -> settings/firestore_usage ----------
   Hạn mức miễn phí tính theo ngày giờ Mỹ (America/Los_Angeles): đặt lại 0:00 bên đó = 15:00 giờ VN (14:00 khi Mỹ theo giờ hè). */
var FS_FREE = { r: 50000, w: 20000, d: 20000 };
function fsUsageTick(force, minGap) {
  var P = PropertiesService.getScriptProperties(), last = +P.getProperty('fsUsageAt') || 0, gap = force ? 0 : (minGap || 10 * 60000);
  if (Date.now() - last < gap) return null;
  P.setProperty('fsUsageAt', String(Date.now()));
  var now = new Date(), startIso = Utilities.formatDate(now, 'America/Los_Angeles', "yyyy-MM-dd'T'00:00:00XXX"), since = Date.parse(startIso);
  var out = { at: Date.now(), ver: VER, since: since, resetAt: since + 864e5, freeR: FS_FREE.r, freeW: FS_FREE.w, freeD: FS_FREE.d, ok: true, err: '' };
  var M = { r: 'read_count', w: 'write_count', d: 'delete_count' }, hours = {};
  try {
    Object.keys(M).forEach(function (k) {
      var s = monSum('firestore.googleapis.com/document/' + M[k], startIso, now.toISOString());
      out[k] = s.total;
      s.pts.forEach(function (p) { var h = hours[p[0]] || (hours[p[0]] = { t: p[0], r: 0, w: 0, d: 0 }); h[k] += p[1]; });
    });
    out.hours = Object.keys(hours).map(function (t) { return hours[t]; }).sort(function (a, b) { return a.t - b.t; }).slice(-24);
  } catch (e) { out.ok = false; out.err = msgOf(e).slice(0, 300); }
  fsPatch('settings/firestore_usage', out);
  return out;
}
function monSum(metric, startIso, endIso) {
  var q = 'filter=' + encodeURIComponent('metric.type="' + metric + '"') + '&interval.startTime=' + encodeURIComponent(startIso) + '&interval.endTime=' + encodeURIComponent(endIso)
    + '&aggregation.alignmentPeriod=3600s&aggregation.perSeriesAligner=ALIGN_SUM&aggregation.crossSeriesReducer=REDUCE_SUM';
  USE.f++;
  var r = UrlFetchApp.fetch('https://monitoring.googleapis.com/v3/projects/' + PROJECT_ID + '/timeSeries?' + q,
    { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROJECT_ID } });
  var code = r.getResponseCode(), txt = r.getContentText();
  if (code !== 200) {
    var m = txt; try { var j = JSON.parse(txt); m = (j.error && (j.error.status + ': ' + j.error.message)) || txt; } catch (e) {}
    if (/SERVICE_DISABLED|has not been used|is disabled/i.test(m)) m = 'Cloud Monitoring API chưa bật -> mở console.cloud.google.com/apis/library/monitoring.googleapis.com?project=' + PROJECT_ID + ' -> BẬT. (' + String(m).slice(0, 120) + ')';
    else if (code === 401 || code === 403) m = 'Tài khoản Google chạy máy chủ chưa có quyền xem số liệu dự án ' + PROJECT_ID + ' (cần là Chủ sở hữu / Monitoring Viewer). ' + String(m).slice(0, 140);
    throw new Error('Monitoring ' + code + ': ' + m);
  }
  var j2 = JSON.parse(txt || '{}'), total = 0, pts = [];
  (j2.timeSeries || []).forEach(function (ts) {
    (ts.points || []).forEach(function (p) { var v = Number((p.value && (p.value.int64Value || p.value.doubleValue)) || 0); total += v; pts.push([Date.parse(p.interval.endTime), v]); });
  });
  return { total: Math.round(total), pts: pts };
}
function XEM_LUOT_GHI() {
  var o = fsUsageTick(true);
  if (!o) return;
  if (!o.ok) { Logger.log('❌ ' + o.err); return; }
  Logger.log('Firestore hôm nay (từ ' + Utilities.formatDate(new Date(o.since), 'Asia/Ho_Chi_Minh', 'HH:mm dd/MM') + ' giờ VN):');
  Logger.log('  Ghi : ' + o.w + ' / ' + FS_FREE.w + '  (' + Math.round(o.w / FS_FREE.w * 100) + '%)');
  Logger.log('  Đọc : ' + o.r + ' / ' + FS_FREE.r + '  (' + Math.round(o.r / FS_FREE.r * 100) + '%)');
  Logger.log('  Xóa : ' + o.d + ' / ' + FS_FREE.d);
  Logger.log('Đặt lại lúc ' + Utilities.formatDate(new Date(o.resetAt), 'Asia/Ho_Chi_Minh', 'HH:mm dd/MM') + ' giờ VN. Admin sẽ thấy số này.');
}
function base() { return 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents'; }
function docName(path) { return 'projects/' + PROJECT_ID + '/databases/(default)/documents/' + path; }
function encPath(path) { return path.split('/').map(encodeURIComponent).join('/'); }
function fsCall(method, suffix, body, query) {
  var url = base() + suffix + (suffix.indexOf('?') >= 0 ? '&' : '?') + 'key=' + encodeURIComponent(API_KEY) + (query || '');
  var opt = { method: method, muteHttpExceptions: true, contentType: 'application/json' };
  if (REFERER) opt.headers = { Referer: REFERER };
  if (body) opt.payload = JSON.stringify(body);
  var r = null, code = 0, txt = '';
  for (var i = 0; i < 3; i++) {                 // lỗi mạng / máy chủ Google bận: thử lại 2 lần
    try { USE.f++; r = UrlFetchApp.fetch(url, opt); code = r.getResponseCode(); txt = r.getContentText(); }
    catch (e) { if (i === 2) throw new Error('Mạng: ' + msgOf(e)); Utilities.sleep(800 * (i + 1)); continue; }
    if ((code === 429 || code === 500 || code === 503) && i < 2 && suffix.indexOf(':commit') < 0) { Utilities.sleep(800 * (i + 1)); continue; }
    break;
  }
  if (code === 404 && method === 'get') return null;
  if (code < 200 || code >= 300) {
    var m = txt; try { var j = JSON.parse(txt); m = (j.error && (j.error.status + ': ' + j.error.message)) || txt; } catch (e) {}
    throw new Error('Firestore ' + code + ' ' + String(m).slice(0, 220));
  }
  return txt ? JSON.parse(txt) : {};
}
function fsGet(path) {
  var d = fsCall('get', '/' + encPath(path));
  return d && d.fields ? fromFields(d.fields) : (d ? {} : null);
}
function fsPatch(path, data) {
  var mask = Object.keys(data).map(function (k) { return '&updateMask.fieldPaths=' + encodeURIComponent(k); }).join('');
  return fsCall('patch', '/' + encPath(path), { fields: toFields(data) }, mask);
}
// Chỉ lấy các trường cần (không tải ảnh đại diện, lịch sử…) -> nhanh, ít dữ liệu
function fsList(col, fields, max) {
  var out = [], tok = '', mask = (fields || []).map(function (k) { return '&mask.fieldPaths=' + encodeURIComponent(k); }).join('');
  for (var i = 0; i < 200; i++) {
    var r = fsCall('get', '/' + col, null, '&pageSize=' + (max || 300) + mask + (tok ? '&pageToken=' + encodeURIComponent(tok) : ''));
    (r && r.documents || []).forEach(function (d) { var o = fromFields(d.fields || {}); o._id = String(d.name || '').split('/').pop(); out.push(o); });
    tok = r && r.nextPageToken; if (!tok || max) break;
  }
  return out;
}
function fsQuery(sq) {
  var r = fsCall('post', ':runQuery', { structuredQuery: sq });
  return (r || []).filter(function (x) { return x.document; }).map(function (x) { return fromFields(x.document.fields || {}); });
}
function autoId() { var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = ''; for (var i = 0; i < 20; i++) s += c.charAt(Math.floor(Math.random() * c.length)); return s; }

function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return (isFinite(v) && v % 1 === 0) ? { integerValue: String(v) } : { doubleValue: isFinite(v) ? v : 0 };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(toFs) } : {} };
  return { mapValue: { fields: toFields(v) } };
}
function toFields(o) { var f = {}; Object.keys(o).forEach(function (k) { f[k] = toFs(o[k]); }); return f; }
function fromFs(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return parseTs(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  if ('referenceValue' in v) return v.referenceValue;
  return null;
}
function fromFields(f) { var o = {}; Object.keys(f || {}).forEach(function (k) { o[k] = fromFs(f[k]); }); return o; }
