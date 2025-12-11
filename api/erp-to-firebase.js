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
    const itemNo  = data.item?.no ? String(data.item.no) : "1";

    if (!orderNo) {
      return res.status(400).json({ error: "Missing orderNo" });
    }

    const db = getDb();
    const nowIso = new Date().toISOString();

    // ========== 1) erp_orders (البيانات الكاملة من الشيت) ==========
    const erpDocId = `${orderNo}_${itemNo}`;
    console.log("Saving erp_orders doc:", erpDocId);

    await db
      .collection("erp_orders")
      .doc(erpDocId)
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

    // ========== 2) orders (اللي النظام بيستخدمه في فتح الطلب) ==========
    // هنا هنستخدم نفس رقم الطلب اللي بتكتبه في الفورم: SAL-ORD-2025-01109_1
    const orderDocId = `${orderNo}_${itemNo}`;
    console.log("Saving orders doc:", orderDocId);

    await db
      .collection("orders")
      .doc(orderDocId)
      .set(
        {
          orderNo: orderDocId,
          branch: data.branch || "",
          customerName: data.customerName || "",
          customerVat: data.customerVat || "",
          customerPhone: data.customerPhone || "", // 👈 رقم جوال العميل
          createdAt: nowIso,
          source: "erp",
          // ممكن تزود بعدها:
          // paymentType, status, notes, ...
        },
        { merge: true }
      );

    // ========== 3) erp_vins (التتبع برقم الهيكل) ==========
    const vin = data.item?.vin ? String(data.item.vin).trim() : "";
    if (vin) {
      console.log("Saving erp_vins doc:", vin);
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
