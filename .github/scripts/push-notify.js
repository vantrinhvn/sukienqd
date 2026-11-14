/**
 * Gửi thông báo đẩy đến app Android QD Elite (chạy bằng GitHub Actions, xem .github/workflows/push-notify.yml).
 *  push_broadcast/{id} { title, body, target: 'all' | tên đăng nhập, status: 'pending' }  (Admin tạo)
 *    -> lấy mã máy ở accounts/{id}.pushTokens -> gửi Firebase Cloud Messaging -> status 'done' + sent / failed / devices
 * Mã máy hỏng (gỡ app, đăng xuất) tự xóa khỏi tài khoản. Thông báo chờ quá 24 giờ -> 'expired'.
 */
const admin = require('firebase-admin');

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);
const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

async function tokensOf(target) {
  const q = target === 'all'
    ? db.collection('accounts').where('pushTokens', '!=', null)
    : db.collection('accounts').where('user', '==', target);
  const out = [], seen = new Set();
  (await q.get()).forEach((doc) => {
    const d = doc.data() || {};
    if (d.isBlocked === true) return;
    (Array.isArray(d.pushTokens) ? d.pushTokens : []).forEach((t) => {
      if (typeof t === 'string' && t && !seen.has(t)) { seen.add(t); out.push({ token: t, ref: doc.ref }); }
    });
  });
  return out;
}

async function send(targets, data) {
  let sent = 0, failed = 0;
  for (let i = 0; i < targets.length; i += 500) {
    const part = targets.slice(i, i + 500);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: part.map((x) => x.token),
      data,
      android: { priority: 'high', ttl: 24 * 3600 * 1000 },
    });
    sent += res.successCount; failed += res.failureCount;
    await Promise.all(res.responses.map((r, k) => (!r.success && r.error && DEAD.has(r.error.code))
      ? part[k].ref.update({ pushTokens: FV.arrayRemove(part[k].token) }).catch(() => {}) : null));
  }
  return { sent, failed };
}

(async () => {
  const snap = await db.collection('push_broadcast').where('status', '==', 'pending').limit(20).get();
  if (snap.empty) { console.log('Không có thông báo nào đang chờ.'); return; }
  for (const doc of snap.docs) {
    // Nhận việc (tránh 2 lần chạy cùng gửi 1 thông báo)
    const claimed = await db.runTransaction(async (tx) => {
      const cur = await tx.get(doc.ref);
      if (!cur.exists || cur.data().status !== 'pending') return null;
      tx.update(doc.ref, { status: 'sending', startedAt: Date.now() });
      return cur.data();
    });
    if (!claimed) continue;
    const b = claimed;
    try {
      if (Date.now() - (Number(b.createdAt) || 0) > 24 * 3600 * 1000) { await doc.ref.update({ status: 'expired', doneAt: Date.now() }); continue; }
      const target = String(b.target || 'all').trim() || 'all';
      const targets = await tokensOf(target);
      const r = targets.length
        ? await send(targets, { title: clip(b.title || 'QD Elite', 120), body: clip(b.body || '', 500), room: String(b.room || ''), always: '1' })
        : { sent: 0, failed: 0 };
      await doc.ref.update({ status: 'done', sent: r.sent, failed: r.failed, devices: targets.length, doneAt: Date.now() });
      console.log(`"${clip(b.title, 40)}" -> ${target}: gửi ${r.sent}/${targets.length} máy, lỗi ${r.failed}`);
    } catch (e) {
      console.error(e);
      await doc.ref.update({ status: 'error', error: String((e && e.message) || e).slice(0, 300), doneAt: Date.now() });
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
