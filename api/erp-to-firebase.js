// api/erp-to-firebase.js

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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const data = req.body || {};

    const orderNo = data.orderNo || "";
    const itemNo  = data.item?.no ? String(data.item.no) : "0";

    if (!orderNo) {
      return res.status(400).json({ error: "Missing orderNo" });
    }

    const db = getDb();
    const nowIso = new Date().toISOString();

    // 🧾 المستند الأساسي للطلب (سطر في الشيت = بند واحد)
    const docId = `${orderNo}_${itemNo}`;
    console.log("Saving order doc:", docId);

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

    // 🚗 تخزين حسب رقم الهيكل – فقط لو VIN غير فاضي
    const vin = data.item?.vin ? String(data.item.vin).trim() : "";
    if (vin) {
      console.log("Saving VIN doc:", vin);
      await db
        .collection("erp_vins")
        .doc(vin)
        .set(
          {
            lastOrderNo: orderNo,
            lastItemNo: itemNo,
            lastUpdate: nowIso,
            lastData: data,
          },
          { merge: true }
        );
    } else {
      console.log("No VIN in payload, skipping erp_vins doc.");
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("ERP Webhook Error:", err);
    return res.status(500).json({
      error: err.message || String(err),
    });
  }
};
