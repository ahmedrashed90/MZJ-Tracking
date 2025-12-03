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

// تحويل "ر.س 95,450.00" → 95450
function parseAmount(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const s = String(value)
    .replace(/[^\d.,\-]/g, "")
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

    // ===================== 1) حساب سعر وضريبة كل سيارة =====================

    // سعر السيارة قبل الضريبة من ItemValue أو UnitPrice
    const rawItemValue =
      data.ItemValue ||
      data.itemValue ||
      (data.item && data.item.value) ||
      data.UnitPrice ||
      data.unitPrice;

    let pricePerCar = parseAmount(rawItemValue);

    // لو مش لاقي، جرّب UnitPrice كاحتياطي
    if (pricePerCar === null) {
      const backupPrice =
        data.UnitPrice ||
        data.unitPrice ||
        (data.item && data.item.unitPrice);
      pricePerCar = parseAmount(backupPrice);
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
        taxRateNum = taxRateNum / 100; // لو مكتوبة 15%
      }
    }

    // إجماليات الطلب من الشيت (لكل الطلب كله)
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

    // ضريبة السيارة
    let taxPerCar = null;
    if (pricePerCar !== null) {
      taxPerCar = Number((pricePerCar * taxRateNum).toFixed(2));
    }

    // إجمالي السيارة شامل الضريبة
    let totalInclPerCar = null;
    if (pricePerCar !== null && taxPerCar !== null) {
      totalInclPerCar = Number((pricePerCar + taxPerCar).toFixed(2));
    }

    // احتياط: لو مفيش أرقام واضحة نخليها زي الشيت
    if (pricePerCar === null && orderSubtotalNum !== null) {
      pricePerCar = orderSubtotalNum;
    }
    if (totalInclPerCar === null && orderTotalNum !== null) {
      totalInclPerCar = orderTotalNum;
    }

    // ===================== 2) حفظ erp_orders =====================
    const erpDocId = `${orderNo}_${itemNo}`;
    console.log("Saving erp_orders doc:", erpDocId);

    const erpDocData = {
      ...data,
      orderNo,
      itemNo,
      source: "erp",
      updatedAt: nowIso,

      // أرقام صحيحة لكل سيارة (المطلوب تعرضها في صفحة إدارة المبيعات)
      subtotalExclVAT: pricePerCar,
      totalInclVAT: totalInclPerCar,
      taxValue: taxPerCar,

      // نفس القيم بصيغ الحقول الأصلية (في حال كود الواجهة يستخدمها)
      SubtotalExclVAT: pricePerCar,
      TotalInclVAT: totalInclPerCar,
      TaxValue: taxPerCar,

      // إجماليات الطلب الكامل
      orderSubtotalExclVAT: orderSubtotalNum,
      orderTotalInclVAT: orderTotalNum,
    };

    await db.collection("erp_orders").doc(erpDocId).set(erpDocData, {
      merge: true,
    });

    // ===================== 3) حفظ orders (طلب واحد يحتوي كل السيارات) =====================
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
      subtotalExclVAT: pricePerCar,
      totalInclVAT: totalInclPerCar,

      // بيانات الضريبة لكل سيارة
      taxCode: data.TaxCode || data.taxCode || "",
      taxRate: taxRateNum,
      taxValue: taxPerCar,

      // إجماليات الطلب (لكل الطلب كله)
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

          // إجماليات الطلب على مستوى المستند
          orderSubtotalExclVAT: orderSubtotalNum,
          orderTotalInclVAT: orderTotalNum,
        },
        { merge: true }
      );

    // ===================== 4) حفظ erp_vins (آخر طلب لكل VIN) =====================
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
            lastData: {
              ...data,
              // نخزن القيم المصححة مع البيانات الخام
              SubtotalExclVAT: pricePerCar,
              TotalInclVAT: totalInclPerCar,
              TaxValue: taxPerCar,
              subtotalExclVAT: pricePerCar,
              totalInclVAT: totalInclPerCar,
              taxValue: taxPerCar,
            },
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
