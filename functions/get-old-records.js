/**
 * Netlify Function: get-old-records
 *
 * Returns inspection records older than 7 years for data retention review.
 * GET, requires JWT auth.
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

  var authError = await requireAuth(event);
  if (authError) return authError;

  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    var sevenYearsAgo = new Date();
    sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);
    var cutoffDate = sevenYearsAgo.toISOString().split('T')[0];

    var { data, error } = await db()
      .from('inspection_records')
      .select('id, cust_name, address, inspection_date')
      .lt('inspection_date', cutoffDate)
      .order('inspection_date', { ascending: true });

    if (error) throw error;

    return { statusCode: 200, headers, body: JSON.stringify({ records: data || [] }) };
  } catch (err) {
    console.error('get-old-records error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
