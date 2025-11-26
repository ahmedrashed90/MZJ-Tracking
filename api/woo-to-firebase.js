// api/woo-to-firebase.js
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// نهيّأ firebase-admin مرة واحدة
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

export default async function handler(req, res) {
  // نسمح فقط بـ POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // تحقق من الكي البسيط في الـ URL ?key=...
  const key = req.query.key;
  if (!key || key !== process.env.WEBHOOK_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const order = req.body; // WooCommerce يبعت JSON

    // بيانات أساسية من الطلب
    const orderId = String(order.id);
    const billing = order.billing || {};
    const paymentTitle = order.payment_method_title || "";
    const status = order.status || "pending"; // pending, processing, completed ...

    // مابّينج حالة WooCommerce → مرحلة التتبع
    let currentStage = 0; // 0 = في انتظار تأكيد / بداية الطلب
    switch (status) {
      case "pending":
        currentStage = 0; // لسه ما اتأكدش الدفع أو التنازل
        break;
      case "processing":
        currentStage = 3; // نعتبرها داخل مراحل المعالجة (خدمة عملاء / رسوم / تأمين)
        break;
      case "completed":
        currentStage = 10; // تم التسليم
        break;
      default:
        currentStage = 1; // طلب منشأ على الأقل
    }

    // نبني الداتا للإدارة
    const adminData = {
      orderId,
      source: "woocommerce",
      wooStatus: status,
      customerName: `${billing.first_name || ""} ${billing.last_name || ""}`.trim(),
      customerPhone: billing.phone || "",
      customerEmail: billing.email || "",
      paymentMethod: paymentTitle,
      currentStage,
      updatedAt: new Date()
    };

    // الداتا اللي يشوفها العميل
    const publicData = {
      orderId,
      currentStage,
      stages: {},       // ممكن نطوّرها لاحقًا لو حابين نختم مراحل معينة
      updatedAt: new Date()
    };

    // كتابة في Firestore
    await db.doc(`orders/${orderId}`).set(adminData, { merge: true });
    await db.doc(`orders/${orderId}/public/status`).set(publicData, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Woo webhook error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
