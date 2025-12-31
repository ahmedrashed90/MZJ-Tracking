export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://mzj-workflow.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    let body = req.body ?? {};

    // allow raw string body
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    // ✅ قراءة رقم العميل من أي key محتمل
    const phoneRaw =
      body.phone ||
      body.customerPhone ||
      body.to ||
      body.mobile ||
      body.phone_number;

    const stageNum = body.stageNum ?? body.stage ?? null;

    // ✅ اختيار قالب افتراضي حسب المرحلة (لو الصفحة ما بعتتش template_name)
    const fallbackTemplate =
      (Number(stageNum) === 9) ? "mzj_car_ready_delivery"
      : (Number(stageNum) === 10) ? "mzj_delivery_completed"
      : "tracking_message";

    const templateName = String(body.template_name || body.templateName || fallbackTemplate).trim();
    const templateLanguage = String(body.template_language || body.templateLanguage || "ar").trim();

    if (!phoneRaw || !templateName || !templateLanguage) {
      return res.status(400).json({
        ok: false,
        error: "Missing phone/template_name/template_language",
        received: {
          phone: phoneRaw ?? null,
          template_name: templateName ?? null,
          template_language: templateLanguage ?? null
        }
      });
    }

    // ✅ تنظيف رقم الجوال (بدون + وبدون مسافات)
    let phone = String(phoneRaw).trim().replace(/[^\d]/g, "");

    // 00966 → 966
    if (phone.startsWith("00")) phone = phone.slice(2);

    // 05xxxxxxxx → 9665xxxxxxxx
    if (phone.startsWith("05")) phone = "966" + phone.slice(1);

    // 5xxxxxxxx → 9665xxxxxxxx
    if (phone.length === 9 && phone.startsWith("5")) phone = "966" + phone;

    // validation نهائي
    if (!phone.startsWith("9665") || phone.length !== 12) {
      return res.status(400).json({
        ok: false,
        error: "Invalid Saudi mobile number. Use 05XXXXXXXX or 9665XXXXXXXX",
        phone
      });
    }

    const BASE_URL = process.env.MERSAL_BASE_URL || "https://w-mersal.com";
    const TOKEN = process.env.MERSAL_TOKEN;

    if (!TOKEN) {
      return res.status(500).json({ ok: false, error: "Missing MERSAL_TOKEN" });
    }

    // ✅ 1) نحاول نقرأ body_params كـ Array (الأسهل)
    let params =
      (Array.isArray(body.body_params) && body.body_params) ||
      (Array.isArray(body.bodyParams) && body.bodyParams) ||
      null;

    // ✅ 2) لو الصفحة بعتت components كاملة (زي Postman) ناخدها ونحوّلها params
    // body.components = [{type:"body", parameters:[{type:"text", text:"..."}]}]
    if (!params && Array.isArray(body.components)) {
      const bodyComp = body.components.find(c => String(c?.type || "").toLowerCase() === "body");
      const p = bodyComp?.parameters;
      if (Array.isArray(p)) params = p.map(x => (x?.text ?? x?.value ?? x));
    }

    // ✅ 3) لو الصفحة بعتت parameters مباشرة
    if (!params && Array.isArray(body.parameters)) {
      params = body.parameters.map(x => (x?.text ?? x?.value ?? x));
    }

    // لو مفيش params خالص، نخليها Array فاضية
    if (!Array.isArray(params)) params = [];

    // ✅ فلترة وتحويل القيم لنصوص
    params = params.map(v => String(v ?? "").trim());

    // ✅ حماية: تحقق عدد المتغيرات المطلوبة لبعض القوالب (عدل الأرقام حسب قوالبك)
    // tracking_message واضح عندك = 7
    const TEMPLATE_REQUIRED_PARAMS = {
      tracking_message: 7,
      // mzj_car_ready_delivery: X,
      // mzj_delivery_completed: Y,
      // m1: Z,
    };

    const requiredCount = TEMPLATE_REQUIRED_PARAMS[templateName];
    if (typeof requiredCount === "number" && params.length !== requiredCount) {
      return res.status(400).json({
        ok: false,
        error: "Template params count mismatch",
        template_name: templateName,
        required: requiredCount,
        received: params.length,
        hint: "Send body_params with the exact count and order of the template variables."
      });
    }

    // ✅ بناء Payload النهائي
    const payload = {
      token: TOKEN,
      phone,
      template_name: templateName,
      template_language: templateLanguage,
      components: [
        {
          type: "body",
          parameters: params.map(v => ({ type: "text", text: v }))
        }
      ]
    };

    const r = await fetch(`${BASE_URL}/api/wpbox/sendtemplatemessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    // ✅ لو مرسال رجّع خطأ، نبينه للواجهة
    if (!r.ok) {
      return res.status(502).json({
        ok: false,
        status: r.status,
        mersal_error: data || text,
        sent_payload: {
          phone,
          templateName,
          templateLanguage,
          paramsCount: params.length
        }
      });
    }

    return res.status(200).json({
      ok: true,
      status: r.status,
      mersal_result: data,
      sent_payload: {
        phone,
        templateName,
        templateLanguage,
        paramsCount: params.length
      }
    });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
