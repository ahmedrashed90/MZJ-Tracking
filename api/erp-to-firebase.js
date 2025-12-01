// api/erp-to-firebase.js

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const data = req.body || {};

    // بس نطبع الـ payload في اللوج عشان تتأكد أنه واصل
    console.log("New ERP payload from Sheets:", JSON.stringify(data, null, 2));

    // لو عايز تتأكد بالدكمنت ID
    const orderNo = data.orderNo || "";
    const itemNo  = data.item?.no || "0";
    console.log("Doc ID:", `${orderNo}_${itemNo}`);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("ERP Webhook Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
