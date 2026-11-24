import { createHmac } from 'node:crypto';
import { adminClient, send } from './_lib/supabase.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed' });
  }

  try {
    const secret = process.env.ACTIVITY_HASH_SECRET;
    if (!secret || secret.length < 32) {
      return send(res, 500, { error: 'Activity tracking is not configured' });
    }

    const { song_id, event_type, visitor_id } = req.body || {};

    if (
      !UUID_RE.test(String(song_id || '')) ||
      !['stream', 'download'].includes(event_type) ||
      !UUID_RE.test(String(visitor_id || ''))
    ) {
      return send(res, 400, { error: 'Invalid activity details' });
    }

    const forwarded = req.headers['x-forwarded-for'];
    const ip = (
      Array.isArray(forwarded) ? forwarded[0] : forwarded || ''
    ).split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';

    const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);

    const visitorHash = createHmac('sha256', secret)
      .update(`${ip}|${userAgent}|${visitor_id}`)
      .digest('hex');

    const db = adminClient();

    const { data, error } = await db.rpc('record_song_activity', {
      p_song_id: song_id,
      p_event_type: event_type,
      p_visitor_hash: visitorHash
    });

    if (error) {
      return send(res, 500, { error: 'Could not record activity' });
    }

    return send(res, 200, { recorded: data === true });
  } catch {
    return send(res, 500, { error: 'Server error' });
  }
}
