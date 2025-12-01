// api/erp-to-firebase.js

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// نهيّأ firebase-admin مرة واحدة ونرجّع db
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
  // نسمح فقط بـ POST من Google Sheets
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const data = req.body || {};

    // بنتوقع يجيلنا orderNo و item.no من Google Sheets
    const orderNo = data.orderNo || "";
    const itemNo  = data.item?.no ? String(data.item.no) : "0";

    if (!orderNo) {
      return res.status(400).json({ error: "Missing orderNo" });
    }

    const db = getDb();

    // Doc ID أساسي: رقم الطلب + رقم البند
    const docId = `${orderNo}_${itemNo}`;

    const nowIso = new Date().toISOString();

    // 👇 نخزّن الطلب في Collection رئيسية
    await db
      .collection("erp_orders")
      .doc(docId)
      .set(
        {
          ...data,
          orderNo,
          itemNo,
          source: "erp",
          updatedAt: nowIso,
        },
        { merge: true }
      );

    // 👇 لو فيه VIN نخزّنه في Collection حسب رقم الهيكل
    if (data.item && data.item.vin) {
      await db
        .collection("erp_vins")
        .doc(data.item.vin)
        .set(
          {
            lastOrderNo: orderNo,
            lastItemNo: itemNo,
            lastUpdate: nowIso,
            lastData: data,
          },
          { merge: true }
        );
    }

    // لو حبيت مستقبلاً تخزن View مبسّط للعميل تقدر تضيف Collection ثالثة هنا

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("ERP Webhook Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
