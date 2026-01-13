export default async function handler(req, res) {
  // CORS للصفحة في مشروع تاني
  res.setHeader("Access-Control-Allow-Origin", "https://mzj-workflow.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    const { phone, template_name, template_language, components } = req.body || {};
    if (!phone || !template_name || !template_language) {
      return res.status(400).json({ ok: false, error: "Missing phone/template_name/template_language" });
    }

    const TOKEN = process.env.MERSAL_TOKEN;
    if (!TOKEN) return res.status(500).json({ ok: false, error: "Missing MERSAL_TOKEN" });

    const payload = {
      token: TOKEN,
      phone,
      template_name,
      template_language,
      components: Array.isArray(components) ? components : []
    };

    const r = await fetch("https://w-mersal.com/api/wpbox/sendtemplatemessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!r.ok) return res.status(502).json({ ok: false, status: r.status, error: data });

    return res.status(200).json({ ok: true, status: r.status, result: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
