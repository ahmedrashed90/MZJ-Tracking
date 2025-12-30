// Mersal WhatsApp Template sender (with best-effort de-duplication for steps 1/9/10)
// Note: In Vercel serverless, in-memory de-duplication is best-effort (may reset on cold starts).
// It still prevents rapid double-click / duplicate sends in most cases.
const __DEDUPE_STORE__ = globalThis.__MZJ_MERSAL_DEDUPE_STORE__ || (globalThis.__MZJ_MERSAL_DEDUPE_STORE__ = new Map());

function _now() { return Date.now(); }

function _cleanupStore() {
  const t = _now();
  for (const [k, v] of __DEDUPE_STORE__.entries()) {
    if (!v || (v.expiresAt && v.expiresAt <= t)) __DEDUPE_STORE__.delete(k);
  }
}

function _getDedupeKey({ phone, templateName, stageNum, orderKey }) {
  // Keep it stable & short
  return [
    "wa_tpl",
    String(stageNum ?? ""),
    String(templateName ?? ""),
    String(phone ?? ""),
    String(orderKey ?? "")
  ].join("|");
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://mzj-workflow.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    _cleanupStore();

    let body = req.body || {};
    // allow raw string body
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    // ✅ اقرا كل الأسماء المحتملة اللي الصفحة ممكن تبعتها
    const phoneRaw = body.phone || body.customerPhone || body.to || body.mobile || body.phone_number;
    const stageNum = body.stageNum ?? body.stage ?? null;

    const fallbackTemplate = (Number(stageNum) === 9) ? "mzj_car_ready_delivery"
      : (Number(stageNum) === 10) ? "mzj_delivery_completed"
      : "tracking_message";

    const templateName = String(body.template_name || body.templateName || fallbackTemplate).trim();
    const templateLanguage = String(body.template_language || body.templateLanguage || "ar").trim();

    const params =
      (Array.isArray(body.body_params) && body.body_params) ||
      (Array.isArray(body.bodyParams) && body.bodyParams) ||
      [];

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

    // ✅ نظّف رقم الجوال (بدون + وبدون مسافات)
    let phone = String(phoneRaw || "").trim().replace(/[^\d]/g, "");

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

    // ✅ Best-effort de-duplication for steps 1 / 9 / 10
    const stageN = Number(stageNum);
    const isProtectedStage = (stageN === 1 || stageN === 9 || stageN === 10);

    // Prefer strong idempotency key if provided by client
    const orderKey =
      body.idempotency_key ||
      body.idempotencyKey ||
      body.orderId || body.order_id ||
      body.vin || body.VIN || body.chassis || body.chassisNo || body.chassis_no ||
      body.requestId || body.request_id ||
      ""; // fallback empty

    if (isProtectedStage) {
      const key = _getDedupeKey({ phone, templateName, stageNum: stageN, orderKey });

      const existing = __DEDUPE_STORE__.get(key);
      const t = _now();

      // If another request is in-flight OR already sent recently, block duplicates
      if (existing && existing.expiresAt && existing.expiresAt > t) {
        return res.status(409).json({
          ok: false,
          error: "Duplicate prevented (already sent or in progress).",
          stage: stageN,
          template: templateName,
          phone,
          dedupe: { state: existing.state, expiresAt: existing.expiresAt }
        });
      }

      // lock as pending for 2 minutes
      __DEDUPE_STORE__.set(key, { state: "pending", expiresAt: t + (2 * 60 * 1000) });
      // We'll upgrade to "sent" on success with a longer TTL.
      body.__dedupeKey = key;
    }

    const BASE_URL = process.env.MERSAL_BASE_URL || "https://w-mersal.com";
    const TOKEN = process.env.MERSAL_TOKEN;

    if (!TOKEN) {
      // release lock if we set one
      if (body.__dedupeKey) __DEDUPE_STORE__.delete(body.__dedupeKey);
      return res.status(500).json({ ok: false, error: "Missing MERSAL_TOKEN" });
    }

    const payload = {
      token: TOKEN,
      phone,
      template_name: templateName,
      template_language: templateLanguage,
      components: [
        {
          type: "body",
          parameters: params.map(v => ({ type: "text", text: String(v ?? "") }))
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

    if (!r.ok) {
      // release lock on failure so user can retry
      if (body.__dedupeKey) __DEDUPE_STORE__.delete(body.__dedupeKey);
      return res.status(502).json({
        ok: false,
        status: r.status,
        mersal_error: data || text,
        sent_payload: { phone, templateName, templateLanguage, paramsCount: params.length }
      });
    }

    // success → mark as sent for 6 hours (prevents duplicates across users most of the day)
    if (body.__dedupeKey) {
      __DEDUPE_STORE__.set(body.__dedupeKey, { state: "sent", expiresAt: _now() + (6 * 60 * 60 * 1000) });
    }

    return res.status(200).json({
      ok: true,
      status: r.status,
      mersal_result: data,
      sent_payload: { phone, templateName, templateLanguage, paramsCount: params.length }
    });

  } catch (e) {
    // release any pending lock if we can infer it (best effort)
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
