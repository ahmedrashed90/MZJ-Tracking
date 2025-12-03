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

// تحويل "ر.س 83,000.00" → 83000
function parseAmount(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const s = String(value)
    .replace(/[^\d.,\-]/g, "") // شيل ر.س وأي حروف
    .replace(/,/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const data = req.body || {};

    // رقم الطلب
    const orderNo =
      data.orderNo ||
      data.OrderNo ||
      "";

    if (!orderNo) {
      return res.status(400).json({ error: "Missing orderNo" });
    }

    // رقم الصنف/السطر
    const itemNo =
      (data.item && data.item.no && String(data.item.no)) ||
      data.ItemNo ||
      data.itemNo ||
      "1";

    const db = getDb();
    const nowIso = new Date().toISOString();

    // 1) استخراج القيمة الفعلية للسيارة من ItemValue
    const rawItemValue =
      data.ItemValue ||
      data.itemValue ||
      (data.item && data.item.value) ||
      data.UnitPrice ||
      data.unitPrice;

    let itemValueNum = parseAmount(rawItemValue);

    // لو مش لاقي، جرّب UnitPrice كاحتياط
    if (itemValueNum === null) {
      const backupPrice =
        data.UnitPrice ||
        data.unitPrice ||
        (data.item && data.item.unitPrice);
      itemValueNum = parseAmount(backupPrice);
    }

    // نسبة الضريبة
    let rawTaxRate =
      data.TaxRate ||
      data.taxRate ||
      (data.item && data.item.taxRate) ||
      0.15;

    let taxRateNum;
    if (typeof rawTaxRate === "number") {
      taxRateNum = rawTaxRate;
    } else {
      const cleaned = String(rawTaxRate).replace("%", "");
      const r = parseFloat(cleaned);
      taxRateNum = isNaN(r) ? 0.15 : r;
      if (String(rawTaxRate).includes("%")) {
        taxRateNum = taxRateNum / 100; // لو جاي 15%
      }
    }

    // إجماليات الطلب (زي ما هي من الشيت)
    const rawOrderSubtotal =
      data.SubtotalExclVAT ||
      data.subtotalExclVAT ||
      data.SubtotalExclVat;
    const rawOrderTotal =
      data.TotalInclVAT ||
      data.totalInclVAT ||
      data.totalInclVat;

    const orderSubtotalNum = parseAmount(rawOrderSubtotal);
    const orderTotalNum = parseAmount(rawOrderTotal);

    // حساب السعر الصحيح لكل سيارة
    const subtotalPerCar =
      itemValueNum !== null ? itemValueNum : orderSubtotalNum;
    const totalInclPerCar =
      itemValueNum !== null
        ? Number((itemValueNum * (1 + taxRateNum)).toFixed(2))
        : orderTotalNum;

    // ========== 1) erp_orders (سطر خام من ERP + تصحيح الأرقام لكل سيارة) ==========
    const erpDocId = `${orderNo}_${itemNo}`;
    console.log("Saving erp_orders doc:", erpDocId);

    const erpDocData = {
      ...data,
      orderNo,
      itemNo,
      source: "erp",
      updatedAt: nowIso,

      // أرقام صحيحة لكل سيارة
      subtotalExclVAT: subtotalPerCar,
      totalInclVAT: totalInclPerCar,

      // إجماليات الطلب الكامل (لو حابب تستخدمهم في التقارير)
      orderSubtotalExclVAT: orderSubtotalNum,
      orderTotalInclVAT: orderTotalNum,
    };

    await db.collection("erp_orders").doc(erpDocId).set(erpDocData, {
      merge: true,
    });

    // ========== 2) orders (طلب واحد فيه كل الهياكل) ==========
    const orderDocId = orderNo;

    const vin =
      (data.item && String(data.item.vin || data.item.VIN || "").trim()) ||
      String(data.VIN || data.vin || "").trim();

    const itemPayload = {
      itemNo,
      vin,
      itemCode:
        (data.item && (data.item.code || data.item.Code)) ||
        data.ItemCode ||
        data.itemCode ||
        "",
      itemName:
        (data.item && (data.item.name || data.item.Name)) ||
        data.ItemType ||
        data.ItemName ||
        "",
      itemModel:
        data.ItemModel ||
        (data.item && data.item.model) ||
        "",
      chassisNo: vin,
      qty:
        (data.item && data.item.qty) ||
        data.Qty ||
        data.qty ||
        1,

      // الأسعار الصحيحة لكل سيارة
      subtotalExclVAT: subtotalPerCar,
      totalInclVAT: totalInclPerCar,

      // بيانات الضريبة
      taxCode: data.TaxCode || data.taxCode || "",
      taxRate: taxRateNum,
      taxValue:
        parseAmount(data.TaxValue || data.taxValue) || null,

      // إجماليات الطلب (للسجّل كامل)
      orderSubtotalExclVAT: orderSubtotalNum,
      orderTotalInclVAT: orderTotalNum,

      updatedAt: nowIso,
    };

    console.log("Saving/merging orders doc:", orderDocId);

    await db
      .collection("orders")
      .doc(orderDocId)
      .set(
        {
          orderNo,
          branch: data.Branch || data.branch || "",
          customerName:
            data.CustomerName || data.customerName || "",
          customerVat:
            data.CustomerVAT || data.customerVat || "",
          orderDate:
            data.OrderDate || data.orderDate || "",
          deliveryDate:
            data.DeliveryDate || data.deliveryDate || "",
          source: "erp",
          updatedAt: nowIso,

          // Array فيها كل العربيات لنفس الطلب
          items: FieldValue.arrayUnion(itemPayload),

          // نحفظ إجماليات الطلب على مستوى المستند برضه
          orderSubtotalExclVAT: orderSubtotalNum,
          orderTotalInclVAT: orderTotalNum,
        },
        { merge: true }
      );

    // ========== 3) erp_vins (تتبع آخر طلب لكل VIN) ==========
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
