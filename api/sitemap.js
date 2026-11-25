import { adminClient } from './_lib/supabase.js';

const BASE_URL = 'https://classic-house.vercel.app';

function xmlEscape(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&apos;'
  })[c]);
}

function sendXml(res, status, xml) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(status).send(xml);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendXml(res, 405, '');
  }

  try {
    const db = adminClient();
    const pageSize = 500;
    const songs = [];

    for (let start = 0; ; start += pageSize) {
      const { data, error } = await db
        .from('songs')
        .select('id,title,created_at,artist_id')
        .eq('status', 'published')
        .eq('payment_status', 'paid')
        .is('removed_at', null)
        .order('created_at', { ascending: false })
        .range(start, start + pageSize - 1);

      if (error) throw error;
      songs.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }

    const artistIds = [...new Set(songs.map(song => song.artist_id).filter(Boolean))];
    const artists = [];

    for (let start = 0; start < artistIds.length; start += pageSize) {
      const batch = artistIds.slice(start, start + pageSize);
      const { data, error } = await db
        .from('profiles')
        .select('id,artist_slug,updated_at')
        .in('id', batch)
        .not('artist_slug', 'is', null)
        .neq('artist_slug', '');

      if (error) throw error;
      artists.push(...(data || []));
    }

    const urls = [
      `<url><loc>${BASE_URL}/</loc></url>`
    ];

    for (const song of songs) {
      const slug = String(song.title || 'music')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'music';

      urls.push(`<url>
<loc>${BASE_URL}/song/${song.id}/${slug}</loc>
${song.created_at ? `<lastmod>${xmlEscape(new Date(song.created_at).toISOString())}</lastmod>` : ''}
</url>`);
    }

    for (const artist of artists) {
      urls.push(`<url>
<loc>${BASE_URL}/artist/${encodeURIComponent(artist.artist_slug)}</loc>
${artist.updated_at ? `<lastmod>${xmlEscape(new Date(artist.updated_at).toISOString())}</lastmod>` : ''}
</url>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

    return sendXml(res, 200, xml);
  } catch (error) {
    console.error('Sitemap error:', error);
    return sendXml(res, 500, '<?xml version="1.0"?><error>Sitemap unavailable</error>');
  }
}
