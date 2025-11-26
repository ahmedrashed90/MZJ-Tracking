// api/woo-to-firebase.js

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// تهيئة firebase-admin مرة واحدة
let db;
function getDb() {
  if (!db) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is missing");
    }
    if (!getApps().length) {
      const serviceAccount = JSON.parse(raw);
      initializeApp({ credential: cert(serviceAccount) });
    }
    db = getFirestore();
  }
  return db;
}

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

  try {
    const order = req.body || {};
    const orderId = String(order.id || "");
    if (!orderId) {
      return res.status(400).json({ error: "Missing order id" });
    }

    const billing = order.billing || {};
    const shipping = order.shipping || {};
    const status = order.status || "pending";

    // المنتجات في الطلب
    const lineItems = (order.line_items || []).map((item) => ({
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      total: item.total,
    }));

    // تحويل حالة Woo → مرحلة تتبع مبدئية
    let currentStage = 1;
    switch (status) {
      case "pending":
        currentStage = 1; // إنشاء الطلب
        break;
      case "processing":
        currentStage = 3; // تحت المعالجة
        break;
      case "completed":
        currentStage = 10; // تم التسليم
        break;
      default:
        currentStage = 1;
    }

    const createdAt =
      order.date_created_gmt ||
      order.date_created ||
      new Date().toISOString();

    const adminData = {
      // أساسي
      orderId,
      source: "woocommerce",
      wooOrderNumber: order.number || orderId,
      wooStatus: status,
      currentStage,
      updatedAt: new Date(),
      createdAt,

      // عميل
      customerName:
        `${billing.first_name || ""} ${billing.last_name || ""}`.trim(),
      customerPhone: billing.phone || "",
      customerEmail: billing.email || "",

      // دفع
      paymentMethod: order.payment_method || "",
      paymentMethodTitle: order.payment_method_title || "",
      orderTotal: order.total || "",
      orderCurrency: order.currency || "",

      // عنوان الفوترة
      billingCity: billing.city || "",
      billingState: billing.state || "",
      billingCountry: billing.country || "",
      billingAddress1: billing.address_1 || "",
      billingPostcode: billing.postcode || "",

      // عنوان الشحن
      shippingCity: shipping.city || "",
      shippingState: shipping.state || "",
      shippingCountry: shipping.country || "",
      shippingAddress1: shipping.address_1 || "",
      shippingPostcode: shipping.postcode || "",

      // المنتجات
      lineItems,

      // بلوك تفصيل كامل (مبسط) لمن يحب يشوفه لاحقًا
      wooDetails: {
        number: order.number,
        status,
        createdAt,
        total: order.total,
        currency: order.currency,
        paymentMethod: order.payment_method,
        paymentMethodTitle: order.payment_method_title,
        billing,
        shipping,
        items: lineItems,
      },
    };

    const publicData = {
      orderId,
      currentStage,
      updatedAt: new Date(),
    };

    const db = getDb();

    // تخزين بيانات الإدارة
    await db.doc(`orders/${orderId}`).set(adminData, { merge: true });

    // تخزين نسخة العميل
    await db
      .doc(`orders/${orderId}/public/status`)
      .set(publicData, { merge: true });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Woo webhook handler error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
