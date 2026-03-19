const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');

const { corsHeaders } = require('./lib/cors');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SELECT_FIELDS = [
  'id', 'created_at', 'updated_at', 'status', 'tier',
  'cust_name', 'cust_email', 'cust_phone', 'address',
  'inspection_date', 'form_data', 'inspector_id', 'inspector_name',
  'payment_method', 'stripe_payment_id', 'payment_signature',
  'booking_id', 'category', 'payment_status', 'final_total', 'is_bundle',
].join(', ');

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  // ── AUTH CHECK ──
  const authError = await requireAuth(event);
  if (authError) return authError;
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const params = event.queryStringParameters || {};
    const search = params.search   || '';
    const status = params.status   || '';
    const limit  = Math.min(parseInt(params.limit  || '50', 10), 10000);
    const offset = Math.max(parseInt(params.offset || '0',  10), 0);

    let query = supabase
      .from('inspection_records')
      .select(SELECT_FIELDS)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        query = query.eq('status', statuses[0]);
      } else if (statuses.length > 1) {
        query = query.in('status', statuses);
      }
    }
    if (params.payment_status) {
      query = query.eq('payment_status', params.payment_status);
    }
    if (search) {
      query = query.or(
        `cust_name.ilike.%${search}%,cust_email.ilike.%${search}%,address.ilike.%${search}%,cust_phone.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return { statusCode: 200, headers: headers, body: JSON.stringify({ clients: data || [] }) };

  } catch (err) {
    console.error('get-clients error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
