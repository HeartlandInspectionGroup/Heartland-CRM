const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const { id, booking_id, include_photos } = event.queryStringParameters || {};
  if (!id && !booking_id) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing id or booking_id' }) };
  }

  try {
    let query = supabase
      .from('inspection_records')
      .select('*');

    if (id) {
      query = query.eq('id', id).single();
    } else {
      query = query.eq('booking_id', booking_id).limit(1).single();
    }

    const { data, error } = await query;

    if (error || !data) {
      return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Report not found' }) };
    }

    // Status gate: only the public report viewer requires status=submitted
    // invoice.html, invoice-receipt.html, and field photos bypass this gate
    const bypassGate = booking_id || include_photos === 'true' || event.queryStringParameters.invoice === 'true';
    if (!bypassGate && data.status !== 'submitted') {
      return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Report not available' }) };
    }

    // Optionally include field_photos
    var fieldPhotos = [];
    if (include_photos === 'true' && data.id) {
      const { data: fpRows } = await supabase
        .from('field_photos')
        .select('id, section_id, subsection_id, cloudinary_url, cloudinary_public_id, caption, created_at')
        .eq('record_id', data.id)
        .order('created_at', { ascending: true });
      fieldPhotos = fpRows || [];
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ report: data, field_photos: fieldPhotos }),
    };

  } catch (err) {
    console.error('get-report error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
