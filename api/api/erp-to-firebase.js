const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// تهيئة firebase-admin مرة واحدة
let db;
function getDb() {
  if (!db) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is missing");

    if (!getApps().length) {
      const serviceAccount = JSON.parse(raw);
      initializeApp({ credential: cert(serviceAccount) });
    }

    db = getFirestore();
  }
  return db;
}

module.exports = async (req, res) => {
  // نسمح فقط بـ POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // حماية بالـ key
  const key = req.query.key;
  if (!key || key !== process.env.WEBHOOK_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const data = req.body || {};

    const orderNo = data.orderNo || "";
    const itemNo  = data.item?.no || "0";
    if (!orderNo) {
      return res.status(400).json({ error: "Missing order number" });
    }

    const docId = `${orderNo}_${itemNo}`;

    const db = getDb();

    // نسخة للإدارة
    await db.doc(`erp_orders/${docId}`).set(data, { merge: true });

    // نسخة عامة للعميل (لو حابب)
    await db
      .doc(`erp_orders/${docId}/public/status`)
      .set({ orderNo, itemNo, updatedAt: new Date() }, { merge: true });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("ERP Sheets Webhook Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
