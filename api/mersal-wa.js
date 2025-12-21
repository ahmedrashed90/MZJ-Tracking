export default async function handler(req, res) {
  // CORS (عشان الصفحة في مشروع تاني)
  res.setHeader("Access-Control-Allow-Origin", "https://mzj-workflow.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const { phone, message } = req.body || {};
    if (!phone || !message) {
      return res.status(400).json({ ok: false, error: "Missing phone or message" });
    }

    const TOKEN = process.env.MERSAL_TOKEN;
    if (!TOKEN) {
      return res.status(500).json({ ok: false, error: "Missing MERSAL_TOKEN" });
    }

    const response = await fetch(
      "https://w-mersal.com/api/wpbox/sendmessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: TOKEN,
          phone: phone,
          message: message
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({ ok: false, error: data });
    }

    return res.status(200).json({
      ok: true,
      status: data.status,
      message_id: data.message_id,
      wamid: data.message_wamid
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
