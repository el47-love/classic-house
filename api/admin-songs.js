
import { adminClient, requireUser, send } from './_lib/supabase.js';

export default async function handler(req, res) {
  try {
    const db = adminClient();
    const auth = await requireUser(req, db);

    if (auth.error) {
      return send(res, auth.status, { error: auth.error });
    }

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('id, role')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (profile?.role !== 'admin') {
      const details = {
        signed_in_email: auth.user.email || 'Unknown',
        signed_in_user_id: auth.user.id,
        profile_found: !!profile,
        profile_role: profile?.role || 'PROFILE NOT FOUND',
        profile_error: profileError?.message || null
      };

      return send(res, 403, {
        error: 'ADMIN CHECK FAILED: ' + JSON.stringify(details),
        diagnostic: details
      });
    }

    if (req.method === 'GET') {
      const { data, error } = await db
        .from('songs')
        .select(`
          id,
          title,
          artist,
          genre,
          status,
          payment_status,
          created_at,
          payments(
            amount,
            currency,
            method,
            status,
            provider_reference,
            created_at
          )
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        return send(res, 500, { error: error.message });
      }

      return send(res, 200, { songs: data || [] });
    }

    if (req.method === 'PATCH') {
      const { song_id, status, action } = req.body || {};

      if (!song_id) {
        return send(res, 400, { error: 'Song ID is required.' });
      }

      if (action === 'confirm_payment') {
        const { data: song, error: lookupError } = await db
          .from('songs')
          .select('id, payment_status')
          .eq('id', song_id)
          .single();

        if (lookupError || !song) {
          return send(res, 404, { error: 'Song not found.' });
        }

        if (song.payment_status !== 'awaiting_verification') {
          return send(res, 409, {
            error: 'This song is not awaiting payment verification.'
          });
        }

        const { error: songError } = await db
          .from('songs')
          .update({
            payment_status: 'paid',
            status: 'pending_review'
          })
          .eq('id', song_id);

        if (songError) {
          return send(res, 500, { error: songError.message });
        }

        const { error: paymentError } = await db
          .from('payments')
          .update({ status: 'confirmed' })
          .eq('song_id', song_id)
          .eq('status', 'awaiting_verification');

        if (paymentError) {
          return send(res, 500, { error: paymentError.message });
        }

        return send(res, 200, {
          message: 'Payment confirmed. Song moved to the review queue.'
        });
      }

      if (![
        'published',
        'rejected',
        'changes_requested'
      ].includes(status)) {
        return send(res, 400, { error: 'Invalid review request.' });
      }

      const { data, error } = await db
        .from('songs')
        .update({ status })
        .eq('id', song_id)
        .eq('payment_status', 'paid')
        .select('id, status')
        .single();

      if (error || !data) {
        return send(res, 400, {
          error: error?.message ||
            'Only payment-confirmed submissions can be reviewed.'
        });
      }

      return send(res, 200, {
        message: 'Song review updated successfully.',
        song: data
      });
    }

    res.setHeader('Allow', 'GET, PATCH');

    return send(res, 405, { error: 'Method not allowed.' });

  } catch (error) {
    return send(res, 500, {
      error: error.message || 'Server error.'
    });
  }
}
