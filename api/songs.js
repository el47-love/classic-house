import { adminClient, requireUser, send } from './_lib/supabase.js';

export default async function handler(req, res) {
  try {
    const db = adminClient();
    if (req.method === 'GET') {
      const { data, error } = await db.from('songs').select('id,artist_id,title,artist,genre,producer,description,cover_path,audio_path,downloads,streams,created_at,status').eq('status','published').eq('payment_status','paid').is('removed_at',null).order('created_at',{ascending:false}).limit(100);
      if (error) return send(res, 500, { error: error.message });

      const artistIds = [...new Set((data || []).map(s => s.artist_id).filter(Boolean))];
      const countryByArtist = new Map();

      if (artistIds.length) {
        const { data: profiles, error: profileError } = await db
          .from('profiles')
          .select('id,country')
          .in('id', artistIds);

        if (profileError) {
          return send(res, 500, { error: profileError.message });
        }

        for (const profile of profiles || []) {
          countryByArtist.set(profile.id, profile.country || null);
        }
      }

      const songs = await Promise.all((data || []).map(async s => {
        const [{ data: audio }, { data: cover }] = await Promise.all([
          db.storage.from('music').createSignedUrl(s.audio_path, 3600),
          db.storage.from('music').createSignedUrl(s.cover_path, 3600)
        ]);
        const { artist_id, ...song } = s;
        return {
          ...song,
          artist_country: countryByArtist.get(artist_id) || null,
          audio_url: audio?.signedUrl || null,
          cover_url: cover?.signedUrl || null
        };
      }));
      return send(res, 200, { songs });
    }
    if (req.method === 'POST') {
      const auth = await requireUser(req, db);
      if (auth.error) return send(res, auth.status, { error: auth.error });
      const { title, artist, genre, producer, description, audio_path, original_audio_path, cover_path, rights_confirmed } = req.body || {};
      const validPath = (path, folder) =>
        typeof path === 'string' &&
        path.startsWith(`${auth.user.id}/${folder}/`) &&
        path.indexOf('..') === -1 &&
        path.indexOf('\\') === -1 &&
        path.indexOf('//') === -1;
      if (!title || !artist || !genre || rights_confirmed !== true ||
          !validPath(original_audio_path, 'originals') ||
          !validPath(audio_path, 'watermarked') ||
          !validPath(cover_path, 'covers') ||
          original_audio_path === audio_path) {
        return send(res, 400, { error: 'Invalid submission details or audio paths.' });
      }
      const prefix = `${auth.user.id}/`;
      if (!audio_path.startsWith(prefix) || !cover_path.startsWith(prefix)) return send(res, 403, { error: 'Uploads must belong to your account.' });
      const { data, error } = await db.from('songs').insert({ user_id: auth.user.id, artist_id: auth.user.id, title, artist, artist_name: artist, genre, producer: producer || null, description: description || null, audio_path, original_audio_path, cover_path, rights_confirmed: true, status: 'pending_payment', payment_status: 'unpaid' }).select('id,title,status,payment_status').single();
      if (error) return send(res, 500, { error: error.message });
      return send(res, 201, { song: data });
    }
    res.setHeader('Allow','GET, POST'); return send(res, 405, { error: 'Method not allowed' });
  } catch (e) { return send(res, 500, { error: e.message || 'Server error' }); }
}
