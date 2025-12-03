const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

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

    // ========== 2) orders (طلب واحد فيه كل الهياكل) ==========
    // هنا هنخلي الـ Doc ID هو رقم الطلب فقط
    const orderDocId = orderNo;

    // تجهيز بيانات العنصر (السيارة) عشان نضيفها في items[]
    const vin = data.item?.vin ? String(data.item.vin).trim() : "";
    const itemPayload = {
      itemNo,
      vin,
      itemCode: data.item?.code || "",
      itemName: data.item?.name || "",
      chassisNo: vin,
      qty: data.item?.qty || 1,
      unit: data.item?.unit || "",
      itemValue: data.item?.value || "",
      taxCode: data.taxCode || data.item?.taxCode || "",
      taxRate: data.taxRate || data.item?.taxRate || "",
      taxValue: data.taxValue || data.item?.taxValue || "",
      subtotalExclVAT: data.subtotalExclVAT || data.SubtotalExclVAT || "",
      totalInclVAT: data.totalInclVAT || data.TotalInclVAT || "",
      updatedAt: nowIso,
    };

    console.log("Saving/merging orders doc:", orderDocId);

    await db
      .collection("orders")
      .doc(orderDocId)
      .set(
        {
          orderNo,
          branch: data.branch || "",
          customerName: data.customerName || "",
          customerVat: data.customerVat || "",
          orderDate: data.orderDate || data.OrderDate || "",
          deliveryDate: data.deliveryDate || data.DeliveryDate || "",
          source: "erp",
          updatedAt: nowIso,

          // هنستخدم arrayUnion عشان نضيف العربية (الهيكل) الجديدة لنفس الطلب
          items: FieldValue.arrayUnion(itemPayload),
        },
        { merge: true }
      );

    // ========== 3) erp_vins (التتبع برقم الهيكل) ==========
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
