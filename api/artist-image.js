import { adminClient, requireUser, send } from './_lib/supabase.js';
import { randomUUID } from 'node:crypto';

const MAX_SIZE = 3 * 1024 * 1024;

const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed' });
  }

  try {
    const db = adminClient();
    const auth = await requireUser(req, db);

    if (auth.error) {
      return send(res, auth.status, { error: auth.error });
    }

    const userId = auth.user.id;
    const { image_type, content_type, file_base64 } = req.body || {};

    if (!['profile', 'cover'].includes(image_type)) {
      return send(res, 400, { error: 'Image type must be profile or cover' });
    }

    if (!TYPES[content_type]) {
      return send(res, 400, { error: 'Only JPEG, PNG and WebP images are allowed' });
    }

    if (typeof file_base64 !== 'string' || !file_base64.length) {
      return send(res, 400, { error: 'Image data is required' });
    }

    const encoded = file_base64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');

    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      return send(res, 400, { error: 'Invalid image encoding' });
    }

    if (encoded.length > 4 * 1024 * 1024) {
      return send(res, 400, { error: 'Image must be smaller than 3 MB' });
    }

    const buffer = Buffer.from(encoded, 'base64');

    if (!buffer.length || buffer.length > MAX_SIZE) {
      return send(res, 400, { error: 'Image must be smaller than 3 MB' });
    }

    const signatures = {
      'image/jpeg': buffer.length >= 3 &&
        buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
      'image/png': buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      'image/webp': buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
    };

    if (!signatures[content_type]) {
      return send(res, 400, { error: 'Image content does not match its file type' });
    }

    const folder = image_type === 'profile' ? 'profile' : 'artist-covers';
    const filePath = `${userId}/${folder}/${Date.now()}-${randomUUID()}.${TYPES[content_type]}`;

    const { error: uploadError } = await db.storage
      .from('music')
      .upload(filePath, buffer, {
        contentType: content_type,
        upsert: false
      });

    if (uploadError) {
      return send(res, 500, { error: 'Image upload failed: ' + uploadError.message });
    }

    const { data: signed, error: signedError } = await db.storage
      .from('music')
      .createSignedUrl(filePath, 3600);

    if (signedError) {
      return send(res, 500, { error: 'Image uploaded but preview could not be created' });
    }

    return send(res, 201, {
      message: 'Artist image uploaded',
      image_path: filePath,
      image_url: signed.signedUrl
    });

  } catch (error) {
    return send(res, 500, {
      error: error.message || 'Server error'
    });
  }
}
