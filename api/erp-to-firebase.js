// api/erp-to-firebase.js

// لو حابب تربطه بـ Firebase Admin (Firestore) استخدم نفس الطريقة دي:
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

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
  // نسمح فقط بـ POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const data = req.body || {};

    // نتوقع إن Google Sheets بيبعت orderNo
    const orderNo = data.orderNo || "";
    const itemNo  = data.item?.no || "0";

    if (!orderNo) {
      return res.status(400).json({ error: "Missing orderNo" });
    }

    // نحدد ID للـ document
    const docId = `${orderNo}_${itemNo}`;

    const db = getDb();

    // نخزن الطلب كامل في Firestore
    await db
      .collection("erp_orders")
      .doc(docId)
      .set(data, { merge: true });

    // تقدر تضيف كمان Collections إضافية لو حابب:
    // مثال: حفظ حسب رقم الهيكل
    if (data.item && data.item.vin) {
      await db
        .collection("erp_vins")
        .doc(data.item.vin)
        .set(
          {
            lastOrderNo: orderNo,
            lastItemNo: itemNo,
            lastUpdate: new Date(),
            lastData: data,
          },
          { merge: true }
        );
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("ERP Webhook Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
