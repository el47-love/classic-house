import { adminClient, requireUser, send } from './_lib/supabase.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return send(res, 405, { error: 'Method not allowed.' });
    }

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

    const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query?.limit, 10) || 25));
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    const { data: profiles, count: total, error: profilesError } = await db
      .from('profiles')
      .select(
        'id, artist_name, bio, country, city, genres, artist_slug, created_at',
        { count: 'exact' }
      )
      .eq('role', 'artist')
      .order('created_at', { ascending: false })
      .range(start, end);

    if (profilesError) {
      return send(res, 500, { error: profilesError.message });
    }

    const artists = await Promise.all((profiles || []).map(async profile => {
      const [
        { data: userData, error: userError },
        { count: songCount, error: countError }
      ] = await Promise.all([
        db.auth.admin.getUserById(profile.id),
        db.from('songs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id)
      ]);

      if (userError) {
        throw new Error('Could not retrieve artist account: ' + userError.message);
      }

      if (countError) {
        throw new Error('Could not count artist songs: ' + countError.message);
      }

      const user = userData?.user;

      return {
        id: profile.id,
        artist_name:
          profile.artist_name ||
          user?.user_metadata?.artist_name ||
          user?.user_metadata?.full_name ||
          user?.email?.split('@')[0] ||
          'Unknown Artist',
        email: user?.email || '',
        registered_at: user?.created_at || profile.created_at,
        email_confirmed: !!user?.email_confirmed_at,
        email_confirmed_at: user?.email_confirmed_at || null,
        country: profile.country || '',
        city: profile.city || '',
        genres: profile.genres || [],
        bio: profile.bio || '',
        artist_slug: profile.artist_slug || '',
        song_count: songCount || 0
      };
    }));

    const totalArtists = total || 0;
    const totalPages = Math.ceil(totalArtists / limit);

    return send(res, 200, {
      artists,
      page,
      limit,
      next_page: page < totalPages ? page + 1 : null,
      total: totalArtists
    });

  } catch (error) {
    console.error('Admin artists error:', error);
    return send(res, 500, {
      error: error.message || 'Could not load registered artists.'
    });
  }
}
