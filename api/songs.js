import { adminClient, requireUser, send } from './_lib/supabase.js';

export default async function handler(req, res) {
  try {
    const db = adminClient();
    if (req.method === 'GET') {
      const { data, error } = await db.from('songs').select('id,title,artist,genre,producer,description,cover_path,audio_path,downloads,streams,created_at,status').eq('status','published').eq('payment_status','paid').order('created_at',{ascending:false}).limit(100);
      if (error) return send(res, 500, { error: error.message });
      const songs = await Promise.all((data || []).map(async s => {
        const [{ data: audio }, { data: cover }] = await Promise.all([
          db.storage.from('music').createSignedUrl(s.audio_path, 3600),
          db.storage.from('music').createSignedUrl(s.cover_path, 3600)
        ]);
        return { ...s, audio_url: audio?.signedUrl || null, cover_url: cover?.signedUrl || null };
      }));
      return send(res, 200, { songs });
    }
    if (req.method === 'POST') {
      const auth = await requireUser(req, db);
      if (auth.error) return send(res, auth.status, { error: auth.error });
      const { title, artist, genre, producer, description, audio_path, cover_path, rights_confirmed } = req.body || {};
      if (!title || !artist || !genre || !audio_path || !cover_path || rights_confirmed !== true) return send(res, 400, { error: 'Complete all required fields and confirm distribution rights.' });
      const prefix = `${auth.user.id}/`;
      if (!audio_path.startsWith(prefix) || !cover_path.startsWith(prefix)) return send(res, 403, { error: 'Uploads must belong to your account.' });
      const { data, error } = await db.from('songs').insert({ user_id: auth.user.id, artist_id: auth.user.id, title, artist, artist_name: artist, genre, producer: producer || null, description: description || null, audio_path, cover_path, rights_confirmed: true, status: 'pending_payment', payment_status: 'unpaid' }).select('id,title,status,payment_status').single();
      if (error) return send(res, 500, { error: error.message });
      return send(res, 201, { song: data });
    }
    res.setHeader('Allow','GET, POST'); return send(res, 405, { error: 'Method not allowed' });
  } catch (e) { return send(res, 500, { error: e.message || 'Server error' }); }
}
