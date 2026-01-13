import admin from "firebase-admin";
import fetch from "node-fetch";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }

  // 🔐 Verify Firebase Login
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "No token" });
  }

  let user;
  try {
    user = await admin.auth().verifyIdToken(token);
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: "Missing data" });
  }

  // 📩 Send SMS via Mersal
  const response = await fetch(
    `${process.env.MERSAL_BASE_URL}${process.env.MERSAL_SEND_PATH}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MERSAL_TOKEN}`,
      },
      body: JSON.stringify({
        to: phone,
        message: message,
      }),
    }
  );

  const result = await response.json();

  return res.json({
    ok: true,
    sentBy: user.email,
    providerResponse: result,
  });
}
