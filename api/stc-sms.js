// api/stc-sms.js
// ========= مستقبِل طلبات الـ SMS من صفحة إدارة المبيعات ==========
// هذا الـ endpoint يستقبل { phone, message } ويبعتها لـ STC SMS API

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: "phone and message are required" });
    }

    // ========== إعدادات STC (غيرها حسب حساب شركتك) ==========
    const STC_USERNAME = process.env.STC_USERNAME;
    const STC_PASSWORD = process.env.STC_PASSWORD;
    const STC_SENDER   = process.env.STC_SENDER;   // اسم المرسل Sender Name

    // Endpoint الحقيقي للـ STC SMS
    const STC_API_URL =
      "https://www.stc.com.sa/sms/api/send"; // ← غَيّره حسب الـ URL اللي عندك في الوثائق

    // جسم الرسالة حسب تنسيق STC
    const payload = {
      username: STC_USERNAME,
      password: STC_PASSWORD,
      sender: STC_SENDER,
      to: phone,
      message: message,
    };

    // إرسال الطلب إلى STC
    const stcRes = await fetch(STC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const stcResponseText = await stcRes.text();

    if (!stcRes.ok) {
      return res.status(500).json({
        error: "STC API error",
        details: stcResponseText,
      });
    }

    return res.status(200).json({
      success: true,
      stcResponse: stcResponseText,
    });

  } catch (err) {
    console.error("SMS endpoint error:", err);
    return res.status(500).json({
      error: err.message || "Unknown server error",
    });
  }
}
