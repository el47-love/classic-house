import { adminClient, requireUser, send } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'Method not allowed.' });
  }

  try {
    const db = adminClient();
    const auth = await requireUser(req, db);

    if (auth.error) {
      return send(res, auth.status, { error: auth.error });
    }

    const { data: adminProfile, error: adminError } = await db
      .from('profiles')
      .select('role')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (adminError || adminProfile?.role !== 'admin') {
      return send(res, 403, { error: 'Administrator access required.' });
    }

    // Retrieve registered accounts directly from Supabase Auth.
    const users = [];
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await db.auth.admin.listUsers({
        page,
        perPage: 1000
      });

      if (error) {
        return send(res, 500, { error: error.message });
      }

      const batch = data?.users || [];
      users.push(...batch);

      if (batch.length < 1000) break;
    }

    // Read profiles in pages, including accounts without a profile.
    const profiles = [];
    for (let offset = 0; offset < 100000; offset += 1000) {
      const { data, error } = await db
        .from('profiles')
        .select('id, role, artist_name, artist_slug, bio, country, city, genres')
        .range(offset, offset + 999);

      if (error) return send(res, 500, { error: error.message });

      const batch = data || [];
      profiles.push(...batch);

      if (batch.length < 1000) break;
    }

    // Retrieve song submissions and connect them using songs.user_id.
    const songs = [];
    for (let offset = 0; offset < 100000; offset += 1000) {
      const { data, error } = await db
        .from('songs')
        .select('id, user_id, title, artist, status, payment_status, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + 999);

      if (error) return send(res, 500, { error: error.message });

      const batch = data || [];
      songs.push(...batch);

      if (batch.length < 1000) break;
    }

    const profileById = new Map(profiles.map(p => [p.id, p]));
    const songsByUser = new Map();

    for (const song of songs) {
      if (!song.user_id) continue;
      if (!songsByUser.has(song.user_id)) {
        songsByUser.set(song.user_id, []);
      }
      songsByUser.get(song.user_id).push(song);
    }

    const artists = users
      .filter(user => profileById.get(user.id)?.role !== 'admin')
      .map(user => {
        const profile = profileById.get(user.id) || {};
        const userSongs = songsByUser.get(user.id) || [];

        return {
          id: user.id,
          email: user.email || '',
          created_at: user.created_at,
          email_confirmed_at: user.email_confirmed_at || null,
          artist_name:
            profile.artist_name ||
            user.user_metadata?.artist_name ||
            user.user_metadata?.full_name ||
            user.email?.split('@')[0] ||
            'Unnamed artist',
          artist_slug: profile.artist_slug || null,
          bio: profile.bio || '',
          country: profile.country || '',
          city: profile.city || '',
          genres: profile.genres || [],
          song_count: userSongs.length,
          songs: userSongs
        };
      })
      .sort((a, b) =>
        new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );

    return send(res, 200, {
      artists,
      total: artists.length
    });

  } catch (error) {
    return send(res, 500, {
      error: error.message || 'Server error.'
    });
  }
}
