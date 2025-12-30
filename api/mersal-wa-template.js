// Mersal WhatsApp Template sender (no de-duplication; step 1/9/10 always allowed)

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://mzj-workflow.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    let body = req.body || {};
    // allow raw string body
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    // ✅ اقرا كل الأسماء المحتملة اللي الصفحة ممكن تبعتها
    const phoneRaw = body.phone || body.customerPhone || body.to || body.mobile || body.phone_number;
    const stageNum = body.stageNum ?? body.stage ?? null;

    const fallbackTemplate = (Number(stageNum) === 9) ? "mzj_car_ready_delivery"
      : (Number(stageNum) === 10) ? "mzj_delivery_completed"
      : "tracking_message";

    const templateName = String(body.template_name || body.templateName || fallbackTemplate).trim();
    const templateLanguage = String(body.template_language || body.templateLanguage || "ar").trim();

    const params =
      (Array.isArray(body.body_params) && body.body_params) ||
      (Array.isArray(body.bodyParams) && body.bodyParams) ||
      [];

    if (!phoneRaw || !templateName || !templateLanguage) {
      return res.status(400).json({
        ok: false,
        error: "Missing phone/template_name/template_language",
        received: {
          phone: phoneRaw ?? null,
          template_name: templateName ?? null,
          template_language: templateLanguage ?? null
        }
      });
    }

    // ✅ نظّف رقم الجوال (بدون + وبدون مسافات)
    let phone = String(phoneRaw || "").trim().replace(/[^\d]/g, "");

    // 00966 → 966
    if (phone.startsWith("00")) phone = phone.slice(2);

    // 05xxxxxxxx → 9665xxxxxxxx
    if (phone.startsWith("05")) phone = "966" + phone.slice(1);

    // 5xxxxxxxx → 9665xxxxxxxx
    if (phone.length === 9 && phone.startsWith("5")) phone = "966" + phone;

    // validation نهائي
    if (!phone.startsWith("9665") || phone.length !== 12) {
      return res.status(400).json({
        ok: false,
        error: "Invalid Saudi mobile number. Use 05XXXXXXXX or 9665XXXXXXXX",
        phone
      });
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
