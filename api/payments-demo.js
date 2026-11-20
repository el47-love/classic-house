import { adminClient, requireUser, send } from './_lib/supabase.js';
export default async function handler(req,res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return send(res,405,{error:'Method not allowed'}); }
  if (process.env.DEMO_PAYMENTS !== 'true') return send(res,403,{error:'Demo payments are disabled. Connect a real payment provider before accepting payments.'});
  try {
    const db=adminClient(); const auth=await requireUser(req,db); if(auth.error) return send(res,auth.status,{error:auth.error});
    const {song_id,method}=req.body||{}; if(!song_id) return send(res,400,{error:'song_id is required'});
    const {data:song,error:lookup}=await db.from('songs').select('id,user_id,payment_status').eq('id',song_id).single();
    if(lookup||!song||song.user_id!==auth.user.id) return send(res,404,{error:'Song not found'});
    if(song.payment_status==='paid') return send(res,200,{message:'Demo payment was already recorded.'});
    const {error}=await db.from('songs').update({payment_status:'paid',status:'pending_review'}).eq('id',song_id);
    if(error) return send(res,500,{error:error.message});
    await db.from('payments').insert({song_id,user_id:auth.user.id,amount:50,currency:'ZMW',method:method||'demo',status:'demo'});
    return send(res,200,{message:'DEMO ONLY: no money was collected. Submission is waiting for admin review.'});
  } catch(e){return send(res,500,{error:e.message||'Server error'});}
}
