export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://mzj-workflow.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    const body = req.body || {};

    // ✅ اقرا كل الأسماء المحتملة اللي الصفحة ممكن تبعتها
    const phoneRaw = body.phone;
    const templateName = (body.template_name || body.templateName || "tracking_message").trim();
    const templateLanguage = (body.template_language || body.templateLanguage || "ar").trim();

    const params =
      (Array.isArray(body.body_params) && body.body_params) ||
      (Array.isArray(body.bodyParams) && body.bodyParams) ||
      [];

    if (!phoneRaw) return res.status(400).json({ ok: false, error: "Missing phone" });

    // ✅ نظّف رقم الجوال (بدون + وبدون مسافات)
    let phone = String(phoneRaw).replace(/[^\d]/g, "");
    if (phone.startsWith("0")) phone = "966" + phone.slice(1);
    if (!phone.startsWith("966")) {
      return res.status(400).json({ ok: false, error: "Phone must start with 966", phone });
    }

    const BASE_URL = process.env.MERSAL_BASE_URL || "https://w-mersal.com";
    const TOKEN = process.env.MERSAL_TOKEN;

    if (!TOKEN) {
      return res.status(500).json({ ok: false, error: "Missing MERSAL_TOKEN" });
    }

    const payload = {
      token: TOKEN,
      phone,
      template_name: templateName,
      template_language: templateLanguage,
      components: [
        {
          type: "body",
          parameters: params.map(v => ({ type: "text", text: String(v ?? "") }))
        }
      ]
    };

    const r = await fetch(`${BASE_URL}/api/wpbox/sendtemplatemessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    // ✅ لو مرسال رجّع خطأ، نبينه للواجهة بدل “تم الإرسال”
    if (!r.ok) {
      return res.status(502).json({
        ok: false,
        status: r.status,
        mersal_error: data || text,
        sent_payload: { phone, templateName, templateLanguage, paramsCount: params.length }
      });
    }

    return res.status(200).json({
      ok: true,
      status: r.status,
      mersal_result: data,
      sent_payload: { phone, templateName, templateLanguage, paramsCount: params.length }
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
