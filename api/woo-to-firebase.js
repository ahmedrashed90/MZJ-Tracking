const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// تهيئة firebase-admin مرة واحدة فقط
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // حماية بسيطة بالـ key في الـ URL
  const key = req.query.key;
  if (!key || key !== process.env.WEBHOOK_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const order = req.body || {};

    const orderId = String(order.id || "");
    if (!orderId) {
      return res.status(400).json({ error: "Missing order id" });
    }

    const billing = order.billing || {};
    const status = order.status || "pending";

    // مابّينج مبدئي لحالة WooCommerce → مرحلة التتبع
    let currentStage = 0; // 0 = طلب جديد / في انتظار تأكيد
    switch (status) {
      case "pending":
        currentStage = 0;
        break;
      case "processing":
        currentStage = 3;
        break;
      case "completed":
        currentStage = 10;
        break;
      default:
        currentStage = 1;
    }

    const adminData = {
      orderId,
      source: "woocommerce",
      wooStatus: status,
      customerName: `${billing.first_name || ""} ${billing.last_name || ""}`.trim(),
      customerPhone: billing.phone || "",
      customerEmail: billing.email || "",
      paymentMethod: order.payment_method_title || "",
      updatedAt: new Date(),
      currentStage,
    };

    const publicData = {
      orderId,
      currentStage,
      updatedAt: new Date(),
    };

    // كتابة في Firestore (للإدارة)
    await db.doc(`orders/${orderId}`).set(adminData, { merge: true });

    // نسخة العميل
    await db.doc(`orders/${orderId}/public/status`).set(publicData, { merge: true });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Woo webhook error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
