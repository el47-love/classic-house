import { adminClient, send } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'Method not allowed' });
  }

  try {
    const db = adminClient();
    const { q, country, genre } = req.query || {};

    if ([q, country, genre].some(v => v && String(v).length > 100)) {
      return send(res, 400, { error: 'Search filter is too long' });
    }

    let query = db
      .from('profiles')
      .select(`
        artist_name,
        artist_slug,
        bio,
        country,
        city,
        genres,
        profile_image_path,
        cover_image_path,
        website_url,
        instagram_url,
        facebook_url,
        tiktok_url,
        youtube_url
      `)
      .not('artist_slug', 'is', null)
      .neq('artist_slug', '')
      .not('artist_name', 'is', null)
      .order('artist_name', { ascending: true })
      .limit(50);

    if (q) query = query.ilike('artist_name', `%${q}%`);
    if (country) query = query.ilike('country', country);
    if (genre) query = query.contains('genres', [genre]);

    const { data, error } = await query;

    if (error) {
      return send(res, 500, { error: error.message });
    }

    const artists = await Promise.all((data || []).map(async artist => {
      const [profile, cover] = await Promise.all([
        artist.profile_image_path
          ? db.storage.from('music').createSignedUrl(artist.profile_image_path, 3600)
          : Promise.resolve({ data: null }),
        artist.cover_image_path
          ? db.storage.from('music').createSignedUrl(artist.cover_image_path, 3600)
          : Promise.resolve({ data: null })
      ]);

      const {
        profile_image_path,
        cover_image_path,
        ...publicProfile
      } = artist;

      return {
        ...publicProfile,
        profile_image_url: profile.data?.signedUrl || null,
        cover_image_url: cover.data?.signedUrl || null
      };
    }));

    return send(res, 200, { artists });
  } catch (error) {
    return send(res, 500, {
      error: error.message || 'Server error'
    });
  }
}
