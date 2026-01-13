// /api/sms/ack.js
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

  const { apiKey, id, status, error } = req.body || {};
  if (apiKey !== process.env.SMS_API_KEY) return res.status(401).json({ok:false, error:"unauthorized"});
  if (!id) return res.status(400).json({ok:false, error:"missing id"});

  const a = getAdmin();
  const db = a.firestore();

  await db.collection("sms_queue").doc(id).update({
    status: status || "sent",
    error: error || null,
    doneAt: admin.firestore.FieldValue.serverTimestamp()
  });

  res.json({ok:true});
}
