import { adminClient } from './_lib/supabase.js';

const BASE_URL = 'https://classic-house.vercel.app';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  })[c]);
}

function sendHtml(res, status, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(html);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendHtml(res, 405, '<h1>Method not allowed</h1>');
  }

  try {
    const slug = String(req.query?.slug || '').trim();

    if (!/^[a-z0-9-]{3,40}$/i.test(slug)) {
      return sendHtml(res, 404, '<h1>Artist not found</h1>');
    }

    const db = adminClient();

    const { data: artist, error: artistError } = await db
      .from('profiles')
      .select('id,artist_name,artist_slug,bio,country,city,genres,profile_image_path,cover_image_path,website_url,instagram_url,facebook_url,tiktok_url,youtube_url')
      .ilike('artist_slug', slug)
      .maybeSingle();

    if (artistError) throw artistError;
    if (!artist) return sendHtml(res, 404, '<h1>Artist not found</h1>');

    const { data: songs, error: songsError } = await db
      .from('songs')
      .select('id,title,artist,genre,description,cover_path,created_at,streams,downloads')
      .eq('artist_id', artist.id)
      .eq('status', 'published')
      .eq('payment_status', 'paid')
      .is('removed_at', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (songsError) throw songsError;

    const [profileImage, coverImage, songCards] = await Promise.all([
      artist.profile_image_path
        ? db.storage.from('music').createSignedUrl(artist.profile_image_path, 3600)
        : Promise.resolve({ data: null }),
      artist.cover_image_path
        ? db.storage.from('music').createSignedUrl(artist.cover_image_path, 3600)
        : Promise.resolve({ data: null }),
      Promise.all((songs || []).map(async song => {
        const { data } = song.cover_path
          ? await db.storage.from('music').createSignedUrl(song.cover_path, 3600)
          : { data: null };

        const title = song.title || 'Untitled';
        const songUrl = `${BASE_URL}/song/${song.id}/${String(title)
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 80) || 'music'}`;

        return { ...song, title, songUrl, coverUrl: data?.signedUrl || '' };
      }))
    ]);

    const name = artist.artist_name || 'Independent artist';
    const canonical = `${BASE_URL}/artist/${encodeURIComponent(artist.artist_slug)}`;
    const description = artist.bio || `Discover music by ${name} on Classic House.`;
    const location = [artist.city, artist.country].filter(Boolean).join(', ');
    const genres = Array.isArray(artist.genres) ? artist.genres : [];
    const imageUrl = profileImage.data?.signedUrl || coverImage.data?.signedUrl || '';

    const songsHtml = songCards.length
      ? songCards.map(song => `
        <article class="song">
          <a href="${escapeHtml(song.songUrl)}">
            ${song.coverUrl ? `<img src="${escapeHtml(song.coverUrl)}" alt="Cover for ${escapeHtml(song.title)}">` : ''}
            <h2>${escapeHtml(song.title)}</h2>
          </a>
          <p>${escapeHtml(song.genre || 'Music')}</p>
          <a href="${escapeHtml(song.songUrl)}">Listen and download</a>
        </article>
      `).join('')
      : '<p>No published songs yet.</p>';

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(name)} | Classic House</title>
<meta name="description" content="${escapeHtml(description)}">
${songCards.length ? "" : '<meta name="robots" content="noindex,follow">' }
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${escapeHtml(name)} | Classic House">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : ''}
<style>
body{margin:0;background:#071426;color:#f4f7fb;font:16px Arial,sans-serif}
main{max-width:900px;margin:40px auto;padding:24px}
a{color:#35d0c1}
header{margin-bottom:30px}
header img{width:100%;max-height:260px;object-fit:cover;border-radius:14px}
.song{padding:16px;margin:14px 0;background:#10243a;border-radius:12px}
.song img{width:110px;height:110px;object-fit:cover;border-radius:9px}
p{color:#b9c7d8;line-height:1.6}
</style>
</head>
<body>
<main>
<a href="/">Classic House</a>
<header>
${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}">` : ''}
<h1>${escapeHtml(name)}</h1>
${location ? `<p>${escapeHtml(location)}</p>` : ''}
<p>${escapeHtml(description)}</p>
<p>${genres.map(escapeHtml).join(' · ')}</p>
</header>
<h2>Published music</h2>
${songsHtml}
</main>
</body>
</html>`;

    return sendHtml(res, 200, html);
  } catch (error) {
    console.error('Artist page error:', error);
    return sendHtml(res, 500, '<h1>Could not load this artist</h1>');
  }
}
