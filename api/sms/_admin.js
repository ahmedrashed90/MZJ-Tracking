// api/sms/_admin.js
// Shared Firebase Admin initializer for Vercel API routes.
// Usage:
//   import { getAdmin, getDb } from "./_admin";
//   const db = getDb();

import admin from "firebase-admin";

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON env var");
  }

  // Support either direct JSON string OR base64-encoded JSON.
  let jsonStr = raw;
  try {
    // If it's base64, decoding will likely produce a JSON string.
    // If it's plain JSON, decoding will throw or produce gibberish that won't parse.
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    if (decoded && decoded.trim().startsWith("{") && decoded.includes("private_key")) {
      jsonStr = decoded;
    }
  } catch (_) {
    // ignore
  }

  // Normalize escaped newlines in private_key (common in env vars)
  const obj = JSON.parse(jsonStr);
  if (obj.private_key && typeof obj.private_key === "string") {
    obj.private_key = obj.private_key.replace(/\\n/g, "\n");
  }
  return obj;
}

export function getAdmin() {
  if (!admin.apps.length) {
    const serviceAccount = parseServiceAccount();
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  return admin;
}

export function getDb() {
  const a = getAdmin();
  return a.firestore();
}

