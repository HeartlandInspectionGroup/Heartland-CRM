/**
 * Netlify Function: delete-photo-finding
 * Deletes a photo from inspection_finding_photos (and optionally from Cloudinary).
 * POST body: { photo_id }
 */
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');
const { corsHeaders } = require('./lib/cors');

var _sb;
function db() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _sb;
}

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  var authErr = await requireAuth(event);
  if (authErr) return authErr;
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  var { photo_id } = body;
  if (!photo_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'photo_id required' }) };

  try {
    // Get photo details for Cloudinary cleanup
    var { data: photo, error: fetchErr } = await db().from('inspection_finding_photos')
      .select('id, cloudinary_public_id')
      .eq('id', photo_id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!photo) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Photo not found' }) };

    // Delete from DB
    var { error: delErr } = await db().from('inspection_finding_photos')
      .delete()
      .eq('id', photo_id);
    if (delErr) throw delErr;

    // Cloudinary cleanup (best-effort, non-blocking)
    if (photo.cloudinary_public_id && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      try {
        var cloudName = 'dmztfzqfm';
        var auth = Buffer.from(process.env.CLOUDINARY_API_KEY + ':' + process.env.CLOUDINARY_API_SECRET).toString('base64');
        fetch('https://api.cloudinary.com/v1_1/' + cloudName + '/image/destroy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + auth },
          body: JSON.stringify({ public_id: photo.cloudinary_public_id }),
        }).catch(function () {}); // fire and forget
      } catch (e) { /* non-fatal */ }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('delete-photo-finding error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
