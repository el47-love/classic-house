import { adminClient } from './_lib/supabase.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE_URL = 'https://classic-house.vercel.app';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  })[c]);
}

function slugify(value) {
  return String(value || 'music')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'music';
}

function sendHtml(res, status, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(html);
}

function notFound(res) {
  return sendHtml(res, 404, `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="robots" content="noindex">
<title>Song not found | Classic House</title></head>
<body><h1>Song not found</h1>
<p>This song is unavailable or has not been published.</p>
<a href="/">Visit Classic House</a></body></html>`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendHtml(res, 405, '<h1>Method not allowed</h1>');
  }

  try {
    const id = String(req.query?.id || '');
    if (!UUID_RE.test(id)) return notFound(res);

    const db = adminClient();

    const { data: song, error } = await db
      .from('songs')
      .select('id,title,artist,genre,description,cover_path,audio_path,artist_id,created_at,downloads,streams')
      .eq('id', id)
      .eq('status', 'published')
      .eq('payment_status', 'paid')
      .is('removed_at', null)
      .maybeSingle();

    if (error) throw error;
    if (!song) return notFound(res);

    const downloadName = `${slugify(song.title || 'classic-house-track')}.mp3`;

    const [{ data: audio }, { data: cover }, { data: artist }] =
      await Promise.all([
        db.storage.from('music').createSignedUrl(song.audio_path, 3600, { download: downloadName }),
        db.storage.from('music').createSignedUrl(song.cover_path, 3600),
        db.from('profiles')
          .select('artist_name,artist_slug,country')
          .eq('id', song.artist_id)
          .maybeSingle()
      ]);

    if (!audio?.signedUrl) {
      return sendHtml(res, 503, '<h1>Audio is temporarily unavailable</h1>');
    }

    const title = song.title || 'Untitled';
    const artistName = song.artist || artist?.artist_name || 'Unknown artist';
    const description = song.description ||
      `Listen to ${title} by ${artistName} on Classic House.`;
    const slug = slugify(title);
    const canonical = `${BASE_URL}/song/${id}/${slug}`;
    const artistUrl = artist?.artist_slug
      ? `${BASE_URL}/artist/${encodeURIComponent(artist.artist_slug)}`
      : '';
    const coverUrl = cover?.signedUrl || '';
    const audioUrl = audio.signedUrl;

    const structuredData = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'MusicRecording',
      name: title,
      byArtist: {
        '@type': 'MusicGroup',
        name: artistName
      },
      genre: song.genre || undefined,
      url: canonical
    }).replace(/</g, '\\u003c');

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} by ${escapeHtml(artistName)} | Classic House</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="music.song">
<meta property="og:title" content="${escapeHtml(title)} by ${escapeHtml(artistName)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
${coverUrl ? `<meta property="og:image" content="${escapeHtml(coverUrl)}">` : ''}
<meta name="twitter:card" content="${coverUrl ? 'summary_large_image' : 'summary'}">
<script type="application/ld+json">${structuredData}</script>
<style>
body{margin:0;background:#071426;color:#f4f7fb;font:16px Arial,sans-serif}
main{max-width:760px;margin:50px auto;padding:24px}
a{color:#35d0c1}img{width:100%;max-width:320px;border-radius:14px}
audio{width:100%;margin:20px 0}
button{background:#16b8aa;color:#061522;border:0;border-radius:8px;padding:13px 20px;font-weight:bold}
p{color:#b9c7d8;line-height:1.6}
</style>
</head>
<body>
<main>
<a href="/">Classic House</a>
<h1>${escapeHtml(title)}</h1>
<h2>${escapeHtml(artistName)}</h2>
${coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="Cover artwork for ${escapeHtml(title)}">` : ''}
<p>Genre: ${escapeHtml(song.genre || 'Music')}</p>
${artist?.country ? `<p>Country: ${escapeHtml(artist.country)}</p>` : ''}
<p>${escapeHtml(description)}</p>
<audio id="track" controls preload="none" src="${escapeHtml(audioUrl)}"></audio>
<p><a id="download" href="${escapeHtml(audioUrl)}" download="${escapeHtml(title)}.mp3">Download this song</a></p>
${artistUrl ? `<p>Artist profile: <a href="${escapeHtml(artistUrl)}">${escapeHtml(artistName)}</a></p>` : ''}
<p>Streams: ${Number(song.streams) || 0} · Downloads: ${Number(song.downloads) || 0}</p>
</main>
<script>
(function(){
  const songId = ${JSON.stringify(song.id)};
  let visitorId = '';
  try {
    visitorId = localStorage.getItem('ch_visitor_id') || '';
    if (!/^[0-9a-f-]{36}$/i.test(visitorId)) {
      visitorId = crypto.randomUUID();
      localStorage.setItem('ch_visitor_id', visitorId);
    }
  } catch(e) {
    visitorId = crypto.randomUUID();
  }

  function record(type) {
    fetch('/api/song-activity', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      credentials:'same-origin',
      keepalive:true,
      body:JSON.stringify({
        song_id:songId,
        event_type:type,
        visitor_id:visitorId
      })
    }).catch(()=>{});
  }

  const audio = document.getElementById('track');
  let sent = false;

  audio.addEventListener('timeupdate', function(){
    if (sent) return;
    let played = 0;
    for (let i=0; i<audio.played.length; i++) {
      played += audio.played.end(i)-audio.played.start(i);
    }
    if (played >= 30) {
      sent = true;
      record('stream');
    }
  });

  document.getElementById('download').addEventListener('click', function(){
    record('download');
  });
})();
</script>
</body>
</html>`;

    return sendHtml(res, 200, html);
  } catch (error) {
    console.error('Song page error:', error);
    return sendHtml(res, 500, '<h1>Could not load this song</h1>');
  }
}
