/**
 * api/mersal-wa-template.js
 * ------------------------------------------------------------
 * Vercel Serverless Function (Node.js)
 * Sends WhatsApp Template messages via Mersal.
 *
 * ✅ Uses Vercel Env Vars (recommended):
 *    - MERSAL_BASE_URL   (default: https://w-mersal.com)
 *    - MERSAL_SEND_PATH  (default: /api/wpbox/sendtemplatemessage)
 *    - MERSAL_TOKEN      (token used if not provided in request body)
 *
 * Compatible with sales.html request body:
 * {
 *   phone,
 *   template_name,
 *   template_language,
 *   body_params
 * }
 *
 * Notes:
 * - Template with variables: send body_params as array in the correct order.
 * - Template without variables: send body_params: [] (or omit it).
 */
module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    // Body can be object or JSON string (depending on runtime)
    let body = req.body || {};
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const phone = String(body.phone || "").trim();
    const template_name = String(body.template_name || body.templateName || "").trim();
    const template_language = String(body.template_language || body.templateLanguage || "ar").trim();

    const body_params =
      Array.isArray(body.body_params) ? body.body_params :
      (Array.isArray(body.bodyParams) ? body.bodyParams : []);

    // Env-based config
    const BASE_URL = String(process.env.MERSAL_BASE_URL || "https://w-mersal.com").replace(/\/+$/, "");
    const SEND_PATH = String(process.env.MERSAL_SEND_PATH || "/api/wpbox/sendtemplatemessage");
    const SEND_URL = BASE_URL + (SEND_PATH.startsWith("/") ? SEND_PATH : ("/" + SEND_PATH));

    const envToken =
      process.env.MERSAL_TOKEN ||
      process.env.MERSAL_WABOX_TOKEN ||
      process.env.WABOX_TOKEN ||
      "";

    const token = String(body.token || envToken).trim();

    if (!token || !phone || !template_name) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields: token, phone, template_name",
        debug: {
          hasToken: !!token,
          hasPhone: !!phone,
          hasTemplate: !!template_name,
          usingEnv: {
            MERSAL_BASE_URL: !!process.env.MERSAL_BASE_URL,
            MERSAL_SEND_PATH: !!process.env.MERSAL_SEND_PATH,
            MERSAL_TOKEN: !!process.env.MERSAL_TOKEN
          }
        }
      });
    }

    // Convert body_params to Mersal/Meta parameters (order = {{1}},{{2}}...)
    const parameters = body_params.map(v => ({ type: "text", text: String(v ?? "") }));

    const payload = {
      token,
      phone,
      template_name,
      template_language,
      components: [
        { type: "body", parameters }
      ]
    };

    const resp = await fetch(SEND_URL, {
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
      mersal_url: SEND_URL,
      data
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
};
