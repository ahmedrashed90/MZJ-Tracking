// /api/sms/pull.js
import admin from "firebase-admin";

function getAdmin(){
  if (!admin.apps.length){
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
    });
  }
  return admin;
}

export default async function handler(req,res){
  if (req.method !== "POST") return res.status(405).json({ok:false});

  const { apiKey, deviceId } = req.body || {};
  if (apiKey !== process.env.SMS_API_KEY) return res.status(401).json({ok:false, error:"unauthorized"});

  const a = getAdmin();
  const db = a.firestore();

  // ناخد أول رسالة queued ونقفلها locked عشان ما تتسحبش مرتين
  const snap = await db.collection("sms_queue")
    .where("status","==","queued")
    .orderBy("createdAt","asc")
    .limit(1)
    .get();

  if (snap.empty) return res.json({ok:true, job:null});

  const doc = snap.docs[0];
  await doc.ref.update({
    status: "locked",
    lockedBy: deviceId || "android",
    lockedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  res.json({ok:true, job:{ id: doc.id, ...doc.data() }});
}
