/**
 * Netlify Function: get-record-public
 *
 * Returns non-PII fields from an inspection record for public-facing pages
 * (agreement receipts, invoice receipts). No auth required — the record_id
 * serves as the access token (same pattern as get-report.js).
 *
 * Does NOT return: cust_email, cust_phone, payment_status, final_total,
 * or any other sensitive PII/financial data.
 *
 * GET ?record_id=<uuid>
 */

const { createClient } = require('@supabase/supabase-js');
const { corsHeaders } = require('./lib/cors');

var _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _supabase;
}

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var { record_id } = event.queryStringParameters || {};
  if (!record_id) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'record_id required' }) };
  }

  try {
    var { data, error } = await db()
      .from('inspection_records')
      .select('cust_name, address, inspection_date, inspector_name, category, tier, invoice_amount, payment_method, report_url')
      .eq('id', record_id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Record not found' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ record: data }) };
  } catch (err) {
    console.error('get-record-public error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
