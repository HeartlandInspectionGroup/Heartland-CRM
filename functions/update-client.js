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

  // ── AUTH CHECK ──
  const adminToken = process.env.ADMIN_TOKEN;
  if (event.httpMethod !== 'OPTIONS' && event.headers['x-admin-token'] !== adminToken) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let parsed;
  try {
    parsed = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { id, action, data } = parsed;
  if (!id) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing id' }) };
  }

  // ── DELETE ──
  if (action === 'delete') {
    try {
      const { error } = await supabase.from('inspection_records').delete().eq('id', id);
      if (error) throw error;
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
    } catch (err) {
      console.error('update-client delete error:', err);
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── UPDATE ──
  if (action === 'update') {
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing data payload' }) };
    }

    try {
      // Fetch existing form_data first so we only overwrite the top-level fields
      const { data: existing, error: fetchErr } = await supabase
        .from('inspection_records')
        .select('form_data')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;

      const mergedFormData = { ...(existing.form_data || {}), ...data };

      const { error } = await supabase
        .from('inspection_records')
        .update({
          cust_name:       data.cust_name,
          cust_email:      data.cust_email,
          cust_phone:      data.cust_phone,
          address:         data.address,
          inspection_date: data.inspection_date,
          form_data:       mergedFormData,
          updated_at:      new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };

    } catch (err) {
      console.error('update-client update error:', err);
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── UPDATE BOOKING ──
  if (action === 'update_booking') {
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing data payload' }) };
    }
    const BOOKING_ALLOWED = ['client_name','client_email','client_phone','property_address'];
    const cleanData = {};
    BOOKING_ALLOWED.forEach(function(k) { if (data[k] !== undefined) cleanData[k] = data[k]; });
    try {
      const { error } = await supabase.from('bookings').update(cleanData).eq('id', id);
      if (error) throw error;
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
    } catch (err) {
      console.error('update-client update_booking error:', err);
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── ASSIGN AGENT ──
  if (action === 'assign_agent') {
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing data payload' }) };
    }
    const { agent_id, agent_name, booking_id } = data;
    try {
      // Update inspection_records (source of truth)
      const { error: recErr } = await supabase
        .from('inspection_records')
        .update({ agent_id: agent_id || null, agent_name: agent_name || null })
        .eq('id', id);
      if (recErr) throw recErr;

      // Mirror to bookings if booking_id provided
      if (booking_id) {
        await supabase.from('bookings').update({ agent_id: agent_id || null }).eq('id', booking_id);
      }

      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
    } catch (err) {
      console.error('update-client assign_agent error:', err);
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Unknown action' }) };
};
