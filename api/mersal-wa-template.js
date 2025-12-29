export default async function handler(req, res) {
  // CORS (allow your workflow app)
  res.setHeader("Access-Control-Allow-Origin", "https://mzj-workflow.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    const body = req.body || {};

    // ✅ input
    const phoneRaw = body.phone;
    const templateName = String(body.template_name || body.templateName || "").trim() || "tracking_message";
    const templateLanguage = String(body.template_language || body.templateLanguage || body.language || "ar").trim();

    // params can come as body_params or bodyParams or bodyParams.body etc.
    const params =
      Array.isArray(body.body_params) ? body.body_params :
      Array.isArray(body.bodyParams) ? body.bodyParams :
      Array.isArray(body.params) ? body.params :
      [];

    // ✅ normalize KSA mobile to 9665XXXXXXXX
    let phone = String(phoneRaw || "").trim();
    phone = phone.replace(/[^\d]/g, "");

    // 00966 -> 966
    if (phone.startsWith("00")) phone = phone.slice(2);

    // 05XXXXXXXX -> 9665XXXXXXXX
    if (phone.startsWith("05")) phone = "966" + phone.slice(1);

    // 5XXXXXXXX (9 digits) -> 9665XXXXXXXX
    if (phone.length === 9 && phone.startsWith("5")) phone = "966" + phone;

    // 9660XXXXXXXXX -> 966XXXXXXXXX (احتياط)
    if (phone.startsWith("9660")) phone = "966" + phone.slice(4);

    if (!/^9665\d{8}$/.test(phone)) {
      return res.status(400).json({ ok: false, error: "Invalid Saudi mobile number", phone });
    }

    const baseUrl = (process.env.MERSAL_BASE_URL || "https://w-mersal.com").replace(/\/+$/, "");
    const sendPath = (process.env.MERSAL_SEND_PATH || "/api/wpbox/sendtemplatemessage").startsWith("/")
      ? (process.env.MERSAL_SEND_PATH || "/api/wpbox/sendtemplatemessage")
      : "/" + (process.env.MERSAL_SEND_PATH || "api/wpbox/sendtemplatemessage");

    const url = `${baseUrl}${sendPath}`;

    const payload = {
      token: process.env.MERSAL_TOKEN,
      phone,
      template_name: templateName,
      template_language: templateLanguage,
      // مرسال: bodyParams (الاختصار)
      bodyParams: params
    };

    if (!payload.token) {
      return res.status(500).json({ ok: false, error: "Missing MERSAL_TOKEN env var" });
    }

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return res.status(200).json({
      ok: r.ok,
      status: r.status,
      mersal_result: data,
      sent_payload: {
        phone,
        templateName,
        templateLanguage,
        paramsCount: Array.isArray(params) ? params.length : 0,
        endpoint: url
      }
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
