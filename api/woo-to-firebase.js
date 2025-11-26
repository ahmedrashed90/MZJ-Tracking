// api/woo-to-firebase.js

module.exports = async (req, res) => {
  // نسمح بس بـ POST من Webhook
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // حماية بسيطة بالـ key في الـ URL
  const key = req.query.key;
  if (!key || key !== process.env.WEBHOOK_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // نهيّأ firebase-admin داخل الفنكشن مع try/catch
  let db;
  try {
    const { initializeApp, cert, getApps } = require("firebase-admin/app");
    const { getFirestore } = require("firebase-admin/firestore");

    if (!getApps().length) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!raw) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT is missing");
      }

      const serviceAccount = JSON.parse(raw); // لو JSON مش سليم هيقع هنا
      initializeApp({ credential: cert(serviceAccount) });
    }

    db = getFirestore();
  } catch (err) {
    console.error("Firebase init error:", err);
    return res.status(500).json({ error: "Firebase config error" });
  }

  try {
    const order = req.body || {};

    const orderId = String(order.id || "");
    if (!orderId) {
      return res.status(400).json({ error: "Missing order id" });
    }

    const billing = order.billing || {};
    const status = order.status || "pending";

    // مابّينج مبدئي لحالة WooCommerce → مرحلة
    let currentStage = 0; // 0 = طلب جديد
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
      currentStage,
      updatedAt: new Date(),
    };

    const publicData = {
      orderId,
      currentStage,
      updatedAt: new Date(),
    };

    await db.doc(`orders/${orderId}`).set(adminData, { merge: true });
    await db.doc(`orders/${orderId}/public/status`).set(publicData, { merge: true });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Woo webhook handler error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
