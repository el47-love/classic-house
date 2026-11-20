import { adminClient, requireUser, send } from './_lib/supabase.js';

// Artists can only report that they have paid. This endpoint NEVER marks a payment as paid.
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'Method not allowed' }); }
  try {
    const db = adminClient();
    const auth = await requireUser(req, db);
    if (auth.error) return send(res, auth.status, { error: auth.error });

    const { song_id, transaction_reference } = req.body || {};
    if (!song_id) return send(res, 400, { error: 'song_id is required' });

    const { data: song, error: lookupError } = await db.from('songs')
      .select('id,user_id,title,payment_status').eq('id', song_id).single();
    if (lookupError || !song || song.user_id !== auth.user.id) return send(res, 404, { error: 'Song not found' });
    if (song.payment_status === 'paid') return send(res, 409, { error: 'This song payment has already been confirmed.' });
    if (song.payment_status === 'awaiting_verification') return send(res, 409, { error: 'Your payment report is already awaiting administrator verification.' });

    const { error: updateError } = await db.from('songs').update({ payment_status: 'awaiting_verification' })
      .eq('id', song_id).eq('user_id', auth.user.id);
    if (updateError) return send(res, 500, { error: updateError.message });

    const { error: paymentError } = await db.from('payments').insert({
      song_id, user_id: auth.user.id, artist_id: auth.user.id, amount: 50, currency: 'ZMW', method: 'Airtel Money',
      status: 'awaiting_verification', provider_reference: transaction_reference || null
    });
    if (paymentError) {
      await db.from('songs').update({ payment_status: 'unpaid' }).eq('id', song_id).eq('user_id', auth.user.id);
      return send(res, 500, { error: paymentError.message });
    }

    return send(res, 200, { message: 'Your payment report has been submitted. We will verify the Airtel Money payment after receiving your WhatsApp screenshot. Your song is not yet approved or published.' });
  } catch (e) { return send(res, 500, { error: e.message || 'Server error' }); }
}
