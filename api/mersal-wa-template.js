export default async function handler(req, res) {
  // ===== CORS (allow workflow + tracking) =====
  const origin = req.headers.origin || "";
  const allowed = new Set([
    "https://mzj-workflow.vercel.app",
    "https://mzj-tracking.vercel.app",
  ]);

  if (allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const BASE_URL = process.env.MERSAL_BASE_URL || "https://w-mersal.com";
  const TOKEN = process.env.MERSAL_TOKEN;

  if (!TOKEN) {
    return res.status(500).json({ ok: false, error: "Missing MERSAL_TOKEN" });
  }

  async function postToMersal(payload) {
    const r = await fetch(`${BASE_URL}/api/wpbox/sendtemplatemessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return { ok: r.ok, status: r.status, data, raw: text };
  }

  try {
    let body = req.body || {};
    // allow raw string body
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    // Accept multiple possible keys
    const phoneRaw = body.phone || body.customerPhone || body.to || body.mobile || body.phone_number;
    const stageNum = body.stageNum ?? body.stage ?? null;

    const fallbackTemplate =
      Number(stageNum) === 9
        ? "mzj_car_ready_delivery"
        : Number(stageNum) === 10
          ? "mzj_delivery_completed"
          : "tracking_message";

    const templateName = String(body.template_name || body.templateName || fallbackTemplate).trim();
    const templateLanguage = String(body.template_language || body.templateLanguage || "ar").trim();

    const bodyParams =
      (Array.isArray(body.body_params) && body.body_params) ||
      (Array.isArray(body.bodyParams) && body.bodyParams) ||
      [];

    const incomingComponents = Array.isArray(body.components) ? body.components : null;

    if (!phoneRaw || !templateName || !templateLanguage) {
      return res.status(400).json({
        ok: false,
        error: "Missing phone/template_name/template_language",
        received: {
          phone: phoneRaw ?? null,
          template_name: templateName ?? null,
          template_language: templateLanguage ?? null,
        },
      });
    }

    // Normalize Saudi mobile
    let phone = String(phoneRaw || "").trim().replace(/[^\d]/g, "");

    // 00966 -> 966
    if (phone.startsWith("00")) phone = phone.slice(2);

    // 05xxxxxxxx -> 9665xxxxxxxx
    if (phone.startsWith("05")) phone = "966" + phone.slice(1);

    // 5xxxxxxxx -> 9665xxxxxxxx
    if (phone.length === 9 && phone.startsWith("5")) phone = "966" + phone;

    if (!phone.startsWith("9665") || phone.length !== 12) {
      return res.status(400).json({
        ok: false,
        error: "Invalid Saudi mobile number. Use 05XXXXXXXX or 9665XXXXXXXX",
        phone,
      });
    }

    // Build components
    const defaultComponents = [
      {
        type: "body",
        parameters: bodyParams.map((v) => ({ type: "text", text: String(v ?? "") })),
      },
    ];

    // If the frontend sent full components, use them as-is
    const components = (incomingComponents && incomingComponents.length) ? incomingComponents : defaultComponents;

    // ===== First attempt =====
    const basePayload = {
      token: TOKEN,
      phone,
      template_name: templateName,
      template_language: templateLanguage,
      components,
    };

    let attempt = await postToMersal(basePayload);

    // ===== Smart retry for tracking_message (Step 1) =====
    // كثير من قوالب التتبع يكون فيها زر URL بمتغير.
    // إذا فشل الإرسال، نجرب تلقائياً بناء components تشمل زر URL باستخدام آخر باراميتر كرابط.
    if (!attempt.ok && templateName === "tracking_message" && Array.isArray(bodyParams) && bodyParams.length >= 1) {
      const last = String(bodyParams[bodyParams.length - 1] ?? "");
      const bodyOnly = bodyParams.slice(0, Math.max(bodyParams.length - 1, 0));

      const retryPayload = {
        token: TOKEN,
        phone,
        template_name: templateName,
        template_language: templateLanguage,
        components: [
          {
            type: "body",
            parameters: bodyOnly.map((v) => ({ type: "text", text: String(v ?? "") })),
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: last }],
          },
        ],
      };

      const attempt2 = await postToMersal(retryPayload);
      if (attempt2.ok) {
        return res.status(200).json({
          ok: true,
          status: attempt2.status,
          mersal_result: attempt2.data,
          sent_payload: {
            phone,
            templateName,
            templateLanguage,
            mode: "retry_with_url_button",
            bodyParamsCount: bodyOnly.length,
            usedButtonUrl: true,
          },
        });
      }

      // keep original error, but include retry error for debugging
      return res.status(502).json({
        ok: false,
        status: attempt.status,
        mersal_error: attempt.data || attempt.raw,
        retry_error: attempt2.data || attempt2.raw,
        sent_payload: {
          phone,
          templateName,
          templateLanguage,
          mode: "failed_then_retry_failed",
          paramsCount: bodyParams.length,
        },
      });
    }

    if (!attempt.ok) {
      return res.status(502).json({
        ok: false,
        status: attempt.status,
        mersal_error: attempt.data || attempt.raw,
        sent_payload: {
          phone,
          templateName,
          templateLanguage,
          mode: incomingComponents ? "components" : "body_params",
          paramsCount: bodyParams.length,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      status: attempt.status,
      mersal_result: attempt.data,
      sent_payload: {
        phone,
        templateName,
        templateLanguage,
        mode: incomingComponents ? "components" : "body_params",
        paramsCount: bodyParams.length,
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
