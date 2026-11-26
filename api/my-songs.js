import { adminClient, requireUser, send } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'Method not allowed' });
  }

  try {
    const db = adminClient();
    const auth = await requireUser(req, db);

    if (auth.error) {
      return send(res, auth.status, { error: auth.error });
    }

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('role')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (profileError) {
      return send(res, 500, { error: profileError.message });
    }

    const { data, error } = await db
      .from('songs')
      .select('id,title,artist,genre,status,payment_status,downloads,streams,created_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return send(res, 500, { error: error.message });
    }

    return send(res, 200, {
      role: profile?.role || 'artist',
      songs: data || []
    });
  } catch (e) {
    return send(res, 500, { error: e.message || 'Server error' });
  }
}
