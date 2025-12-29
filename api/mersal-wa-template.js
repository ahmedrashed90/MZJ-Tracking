export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://mzj-workflow.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const { phone, template_language = "ar", bodyParams = [] } = req.body || {};

    if (!phone) {
      return res.status(400).json({ ok: false, error: "Missing phone" });
    }

    // ✅ ENV VARS (زي اللي عندك بالظبط)
    const BASE_URL = process.env.MERSAL_BASE_URL;
    const TOKEN = process.env.MERSAL_TOKEN;

    if (!BASE_URL || !TOKEN) {
      return res.status(500).json({
        ok: false,
        error: "Missing MERSAL_BASE_URL or MERSAL_TOKEN"
      });
    }

    // endpoint الثابت لقوالب واتساب
    const SEND_TEMPLATE_PATH = "/api/wpbox/sendtemplatemessage";

    const payload = {
      token: TOKEN,
      phone: String(phone),
      template_name: "tracking_message",
      template_language,
      components: [
        {
          type: "body",
          parameters: bodyParams.map(v => ({
            type: "text",
            text: String(v ?? "")
          }))
        }
      ]
    };

    const r = await fetch(`${BASE_URL}${SEND_TEMPLATE_PATH}`, {
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
        error: data
      });
    }

    return res.status(200).json({
      ok: true,
      status: r.status,
      result: data
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
