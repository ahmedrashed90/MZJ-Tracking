/**
 * Vercel Serverless Function
 * Path: /api/mersal-wa
 *
 * IMPORTANT:
 * - Do NOT put your token in frontend code.
 * - Set env vars in Vercel:
 *   MERSAL_BASE_URL   e.g. https://w-mersal.com  (or https://api.w-mersal.com if that's what support gives you)
 *   MERSAL_SEND_PATH  e.g. /api/whatsapp/send   (ask Mersal support for the exact path)
 *   MERSAL_TOKEN      your API token
 *
 * Optional:
 *   MERSAL_AUTH_HEADER = Authorization  (or X-API-KEY etc.)
 *   MERSAL_AUTH_PREFIX = Bearer         (or Token / empty)
 */

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).send("Method Not Allowed");
    }

    const { phone, message, stageNum, orderId } = req.body || {};
    const to = String(phone || "").replace(/\s+/g, "");
    const text = String(message || "");

    if (!to || !text) return res.status(400).json({ ok: false, error: "Missing phone or message" });

    const baseUrl = process.env.MERSAL_BASE_URL || "https://w-mersal.com";
    const sendPath = process.env.MERSAL_SEND_PATH || "/api/send-message"; // ✅ change in env to match Mersal docs
    const token = process.env.MERSAL_TOKEN;

    if (!token) return res.status(500).json({ ok: false, error: "MERSAL_TOKEN is not set" });

    const authHeader = process.env.MERSAL_AUTH_HEADER || "Authorization";
    const authPrefix = process.env.MERSAL_AUTH_PREFIX || "Bearer";

    // Generic payload — adjust if Mersal requires different keys (e.g. instance/channel/senderId/templateId)
    const payload = {
      to,
      type: "text",
      message: text,
      meta: { stageNum: stageNum ?? null, orderId: orderId || "" }
    };

    const headers = { "Content-Type": "application/json" };
    headers[authHeader] = authPrefix ? `${authPrefix} ${token}` : token;

    const url = new URL(sendPath, baseUrl).toString();

    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const bodyText = await r.text();
    if (!r.ok) {
      return res.status(502).json({
        ok: false,
        status: r.status,
        error: bodyText || "Mersal request failed"
      });
    }

    // Try JSON, fallback to text
    try {
      const json = JSON.parse(bodyText);
      return res.status(200).json({ ok: true, mersal: json });
    } catch {
      return res.status(200).json({ ok: true, mersal_raw: bodyText });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
