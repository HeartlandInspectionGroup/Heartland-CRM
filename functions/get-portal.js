/**
 * Netlify Function: get-portal
 *
 * Resolves a portal token to client inspection records.
 * Single source of truth: inspection_records only.
 * No bookings. No stitching.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL     = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function sbGet(path) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  var text = await res.text();
  try { return JSON.parse(text); } catch(e) { return null; }
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  var token = event.queryStringParameters && event.queryStringParameters.token;
  if (!token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Token required' }) };

  // Resolve token
  var tokenRows = await sbGet('client_portal_tokens?token=eq.' + token + '&select=*');
  var tokenRow  = tokenRows && tokenRows[0];

  if (!tokenRow) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Invalid or expired token' }) };
  }

  var clientEmail = tokenRow.client_email;
  var clientName  = tokenRow.client_name || '';

  // Fetch all inspection records for this client — everything comes from here
  var records = await sbGet(
    'inspection_records?cust_email=eq.' + encodeURIComponent(clientEmail) +
    '&order=inspection_date.desc' +
    '&select=id,status,booking_id,address,inspection_date,inspection_time,tier,category,' +
    'cust_name,cust_email,cust_phone,inspector_name,' +
    'invoice_url,report_url,final_total,' +
    'payment_status,payment_method,stripe_payment_id,' +
    'reschedule_requested,reschedule_date,reschedule_time,' +
    'agent_id,agent_name,agent_report_release,' +
    'created_at,updated_at'
  );

  var safeRecords = Array.isArray(records) ? records : [];
  console.log('get-portal: records count:', safeRecords.length, 'for', clientEmail);
  if (!Array.isArray(records)) console.error('get-portal: records error:', JSON.stringify(records));

  // Fetch waiver signatures for this client (all records)
  var signatures = await sbGet(
    'waiver_signatures?client_email=eq.' + encodeURIComponent(clientEmail) +
    '&select=id,waiver_version_id,inspection_record_id,signed_name,signed_at,signature_method' +
    '&order=signed_at.desc'
  );
  var safeSigs = Array.isArray(signatures) ? signatures : [];

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok:         true,
      client:     { email: clientEmail, name: clientName },
      records:    safeRecords,
      signatures: safeSigs,
      site_url:   SITE_URL,
    }),
  };
};
