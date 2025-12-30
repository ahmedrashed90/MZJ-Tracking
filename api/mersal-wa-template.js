/**
 * api/mersal-wa-template.js
 * Vercel Serverless Function (Node.js)
 *
 * POST JSON:
 * {
 *   "token": "....",
 *   "phone": "9665xxxxxxxx",
 *   "template_name": "tracking_message",
 *   "template_language": "ar",
 *   "body_params": ["text1","text2",...]
 * }
 */
module.exports = async (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    const { token, phone, template_name, template_language, body_params } = req.body || {};
    if (!token || !phone || !template_name || !template_language) {
      return res.status(400).json({ ok: false, error: "Missing phone/template_name/template_language/token" });
    }

    const paramsArr = Array.isArray(body_params) ? body_params : [];
    const bodyParameters = paramsArr.map(v => ({ type: "text", text: String(v ?? "") }));

    const payload = {
      token,
      phone,
      template_name,
      template_language,
      components: [
        { type: "body", parameters: bodyParameters }
      ]
    };

    const resp = await fetch("https://w-mersal.com/api/wpbox/sendtemplatemessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const raw = await resp.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { raw }; }

    return res.status(resp.ok ? 200 : resp.status).json({ ok: resp.ok, status: resp.status, data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
};
