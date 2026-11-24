import { adminClient, requireUser, send } from './_lib/supabase.js';

const fields = [
  'artist_name',
  'artist_slug',
  'bio',
  'country',
  'city',
  'genres',
  'profile_image_path',
  'cover_image_path',
  'website_url',
  'instagram_url',
  'facebook_url',
  'tiktok_url',
  'youtube_url'
];

const selectFields = [
  'artist_name',
  'artist_slug',
  'bio',
  'country',
  'city',
  'genres',
  'profile_image_path',
  'cover_image_path',
  'website_url',
  'instagram_url',
  'facebook_url',
  'tiktok_url',
  'youtube_url',
  'updated_at'
].join(',');

function validUrl(value) {
  if (value === null || value === '') return true;
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return send(res, 405, { error: 'Method not allowed' });
  }

  try {
    const db = adminClient();
    const auth = await requireUser(req, db);
    if (auth.error) {
      return send(res, auth.status, { error: auth.error });
    }

    const userId = auth.user.id;

    if (req.method === 'GET') {
      const { data, error } = await db
        .from('profiles')
        .select(selectFields)
        .eq('id', userId)
        .single();

      if (error) return send(res, 500, { error: error.message });
      return send(res, 200, { profile: data });
    }

    const body = req.body || {};
    const keys = Object.keys(body);

    if (!keys.length || keys.some(key => !fields.includes(key))) {
      return send(res, 400, { error: 'Invalid or empty profile update' });
    }

    const update = {};

    for (const key of keys) {
      const value = body[key];

      if (key === 'genres') {
        if (!Array.isArray(value) || value.length > 20 ||
            value.some(g => typeof g !== 'string' || g.length > 60)) {
          return send(res, 400, { error: 'Invalid genres list' });
        }
        update[key] = [...new Set(value.map(g => g.trim()).filter(Boolean))];
        continue;
      }

      if (key === 'artist_slug') {
        if (value === null || value === '') {
          update[key] = null;
        } else if (typeof value !== 'string' ||
                   !/^[a-z0-9-]{3,40}$/i.test(value)) {
          return send(res, 400, {
            error: 'Artist slug must be 3–40 letters, numbers or hyphens'
          });
        } else {
          update[key] = value.toLowerCase();
        }
        continue;
      }

      if (['website_url', 'instagram_url', 'facebook_url',
           'tiktok_url', 'youtube_url'].includes(key)) {
        if (!validUrl(value)) {
          return send(res, 400, { error: 'Please use a valid HTTPS link' });
        }
        update[key] = value || null;
        continue;
      }

      if (key === 'profile_image_path' || key === 'cover_image_path') {
        if (value !== null && value !== '' &&
            (typeof value !== 'string' ||
             value.length > 500 ||
             !value.startsWith(userId + '/') ||
             value.includes('..') ||
             value.includes('\\'))) {
          return send(res, 400, { error: 'Invalid image storage path' });
        }
        update[key] = value || null;
        continue;
      }

      if (key === 'artist_name') {
        if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 80) {
          return send(res, 400, { error: 'Artist name must be 2–80 characters' });
        }
        update[key] = value.trim();
        continue;
      }

      if (key === 'country' || key === 'city') {
        if (value !== null && (typeof value !== 'string' || value.length > 100)) {
          return send(res, 400, { error: 'Country and city must be 100 characters or fewer' });
        }
        update[key] = typeof value === 'string' ? value.trim() || null : value;
        continue;
      }

      if (value !== null &&
          (typeof value !== 'string' || value.length > 2000)) {
        return send(res, 400, { error: 'Invalid profile field: ' + key });
      }

      update[key] = value;
    }

    update.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('profiles')
      .update(update)
      .eq('id', userId)
      .select(selectFields)
      .single();

    if (error) {
      if (error.code === '23505') {
        return send(res, 409, { error: 'That artist username is already taken' });
      }
      return send(res, 500, { error: error.message });
    }

    return send(res, 200, { message: 'Artist profile updated', profile: data });

  } catch (error) {
    return send(res, 500, { error: error.message || 'Server error' });
  }
}
