export default async function handler(req, res) {
  // CORS (عشان صفحة المبيعات في مشروع mzj-workflow)
  res.setHeader("Access-Control-Allow-Origin", "https://mzj-workflow.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    const { phone, template_language, bodyParams } = req.body || {};

    if (!phone) {
      return res.status(400).json({ ok: false, error: "Missing phone" });
    }

    const TOKEN = process.env.MERSAL_TOKEN;
    if (!TOKEN) {
      return res.status(500).json({ ok: false, error: "Missing MERSAL_TOKEN env var" });
    }

    // ✅ قالبك المحدد
    const template_name = "tracking_message";

    // bodyParams = مصفوفة 7 عناصر ({{1}}..{{7}})
    const params = Array.isArray(bodyParams) ? bodyParams : [];

    const payload = {
      token: TOKEN,
      phone: String(phone),
      template_name,
      template_language: template_language || "ar",
      components: [
        {
          type: "body",
          parameters: params.map(v => ({
            type: "text",
            text: String(v ?? "")
          }))
        }
      ]
    };

    const r = await fetch("https://w-mersal.com/api/wpbox/sendtemplatemessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!r.ok) {
      return res.status(502).json({ ok: false, status: r.status, error: data });
    }

    return res.status(200).json({ ok: true, status: r.status, result: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
