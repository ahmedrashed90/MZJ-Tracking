/**
 * api/mersal-wa-template.js
 * --------------------------------------------------------------------
 * Vercel Serverless Function (Node.js) to send WhatsApp template messages via Mersal.
 *
 * ✅ Supports templates WITH variables (body_params array)
 * ✅ Supports templates WITHOUT variables (body_params omitted or [])
 *
 * Request (POST JSON):
 * {
 *   "token": "MERSAL_TOKEN",
 *   "phone": "9665xxxxxxxx",
 *   "template_name": "tracking_message",
 *   "template_language": "ar",
 *   "body_params": ["val1","val2", ...]   // optional
 * }
 *
 * Notes:
 * - For step 1 (tracking_message): send 7 values in body_params ({{1}}..{{7}})
 * - For step 9/10 (no vars): send body_params: [] or omit it
 */
module.exports = async (req, res) => {
  // CORS (safe default)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    const body = req.body || {};
    const token = body.token;
    const phone = body.phone;
    const template_name = body.template_name;
    const template_language = body.template_language || "ar";

    // Accept body_params as array, otherwise treat as []
    const body_params = Array.isArray(body.body_params) ? body.body_params : [];

    if (!token || !phone || !template_name) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields: token, phone, template_name"
      });
    }

    // Build parameters list (type:text) – order matters for {{1}},{{2}}...
    const parameters = body_params.map((v) => ({
      type: "text",
      text: String(v ?? "")
    }));

    // Always send a BODY component. If template has no vars, parameters can be []
    const payload = {
      token,
      phone,
      template_name,
      template_language,
      components: [
        {
          type: "body",
          parameters
        }
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

    return res.status(resp.ok ? 200 : resp.status).json({
      ok: resp.ok,
      status: resp.status,
      sent_payload: payload,   // مفيد للتجربة (لو مش عايزه، قولي أشيله)
      data
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
};
