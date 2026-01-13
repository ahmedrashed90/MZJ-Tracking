import { getAdmin } from "./_admin.js";

export default async function handler(req,res){
  if (req.method !== "POST") return res.status(405).json({ok:false, error:"method_not_allowed"});

  try{
    const { apiKey, uid, id, status } = req.body || {};
    if (apiKey && process.env.SMS_API_KEY && apiKey !== process.env.SMS_API_KEY){
      return res.status(401).json({ok:false, error:"unauthorized"});
    }
    if (!uid || !id) return res.status(400).json({ok:false, error:"missing_fields"});

    const a = getAdmin();
    const db = a.firestore();

    const ref = db.collection("sms_outbox").doc(id);
    await ref.set({
      status: status === "sent" ? "sent" : "failed",
      handledBy: uid,
      handledAt: a.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return res.status(200).json({ok:true});
  }catch(err){
    return res.status(500).json({ok:false, error:String(err && err.message ? err.message : err)});
  }
}
