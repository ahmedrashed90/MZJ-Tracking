import admin from "firebase-admin";

function initAdmin() {
  if (admin.apps.length) return;
  // حط بيانات Firebase Admin في ENV (مهم)
  // FIREBASE_PROJECT_ID
  // FIREBASE_CLIENT_EMAIL
  // FIREBASE_PRIVATE_KEY  (مع \n)
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    initAdmin();

    // (اختياري) تحقق من Firebase Auth Bearer Token
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).send("Missing token");

    await admin.auth().verifyIdToken(token);

    const { phone, message, source, meta } = req.body || {};
    if (!phone || !message) return res.status(400).send("phone & message required");

    const docRef = await admin.firestore().collection("sms_outbox").add({
      to: String(phone),
      message: String(message),
      source: String(source || "web"),
      meta: meta || {},
      status: "queued",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ok: true, id: docRef.id });
  } catch (e) {
    return res.status(500).send(String(e?.message || e));
  }
}
