export default async function handler(req, res) {
  try {
    // السماح فقط بـ POST
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const { phone, message } = req.body || {};

    if (!phone || !message) {
      return res.status(400).json({
        ok: false,
        error: "Missing phone or message"
      });
    }

    // Environment Variables
    const BASE_URL  = process.env.MERSAL_BASE_URL;   // https://w-mersal.com
    const SEND_PATH = process.env.MERSAL_SEND_PATH;  // /api/send
    const TOKEN     = process.env.MERSAL_TOKEN;      // API TOKEN

    if (!BASE_URL || !SEND_PATH || !TOKEN) {
      return res.status(500).json({
        ok: false,
        error: "Mersal environment variables are not set"
      });
    }

    // Payload حسب مرسال
    const payload = {
      mobile: phone,      // 9665XXXXXXXX
      message: message
    };

    const response = await fetch(`${BASE_URL}${SEND_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": TOKEN
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: text
      });
    }

    return res.status(200).json({
      ok: true,
      result: text
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || "Server Error"
    });
  }
}
