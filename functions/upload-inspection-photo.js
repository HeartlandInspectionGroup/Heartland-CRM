/**
 * Netlify Function: upload-inspection-photo
 *
 * Receives a photo blob via multipart/form-data or base64 JSON,
 * uploads to Supabase Storage inspection-photos bucket,
 * and inserts metadata into the inspection_photos table.
 *
 * Endpoint: POST /api/upload-photo
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'inspection-photos';

const { corsHeaders } = require('./lib/cors');
exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const {
      photo_id,
      inspection_id,
      section_id,
      item_id,
      storage_path,
      caption,
      annotation,
      taken_at,
      base64_data,
    } = JSON.parse(event.body);

    if (!inspection_id || !section_id || !storage_path || !base64_data) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: inspection_id, section_id, storage_path, base64_data' }),
      };
    }

    // Decode base64 to buffer
    const buffer = Buffer.from(base64_data, 'base64');

    // Upload to Supabase Storage
    const storageUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storage_path}`;
    const uploadRes = await fetch(storageUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true',
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('Storage upload failed:', errText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Storage upload failed', detail: errText }),
      };
    }

    // Insert metadata row
    const metadata = {
      id: photo_id || undefined,
      inspection_record_id: inspection_id,
      section_id,
      item_id: item_id || null,
      storage_path,
      caption: caption || '',
      annotation: annotation || '',
      taken_at: taken_at || new Date().toISOString(),
    };

    const metaRes = await fetch(`${SUPABASE_URL}/rest/v1/inspection_photos`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(metadata),
    });

    if (!metaRes.ok) {
      const errText = await metaRes.text();
      console.error('Metadata insert failed:', errText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Metadata insert failed', detail: errText }),
      };
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storage_path}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, public_url: publicUrl, storage_path }),
    };
  } catch (err) {
    console.error('upload-inspection-photo error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
