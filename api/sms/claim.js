import { getAdmin } from "./_admin.js";

export default async function handler(req,res){
  if (req.method !== "POST") return res.status(405).json({ok:false, error:"method_not_allowed"});

  try{
    const { apiKey, uid } = req.body || {};
    if (apiKey && process.env.SMS_API_KEY && apiKey !== process.env.SMS_API_KEY){
      return res.status(401).json({ok:false, error:"unauthorized"});
    }
    if (!uid) return res.status(400).json({ok:false, error:"missing_uid"});

    const a = getAdmin();
    const db = a.firestore();

    // Find one queued job (oldest first). If no createdAt index, fallback to limit without orderBy.
    let snap;
    try{
      snap = await db.collection("sms_outbox")
        .where("status","==","queued")
        .orderBy("createdAt","asc")
        .limit(1)
        .get();
    } catch(e){
      snap = await db.collection("sms_outbox")
        .where("status","==","queued")
        .limit(1)
        .get();
    }

    if (snap.empty){
      return res.status(200).json({ok:true, hasJob:false});
    }

    const doc = snap.docs[0];
    const data = doc.data() || {};
    const id = doc.id;

    // Claim atomically with a transaction
    await db.runTransaction(async (tx) => {
      const ref = db.collection("sms_outbox").doc(id);
      const cur = await tx.get(ref);
      const curData = cur.data() || {};
      if (curData.status !== "queued") return; // already claimed
      tx.update(ref, {
        status: "sending",
        claimedBy: uid,
        claimedAt: a.firestore.FieldValue.serverTimestamp(),
      });
    });

    // Re-read for current data
    const after = await db.collection("sms_outbox").doc(id).get();
    const afterData = after.data() || {};

    return res.status(200).json({
      ok:true,
      hasJob:true,
      id,
      to: afterData.to || afterData.phone || "",
      message: afterData.message || "",
    });

  }catch(err){
    return res.status(500).json({ok:false, error:String(err && err.message ? err.message : err)});
  }
}
