const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

var _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _supabase;
}

exports._setClient = function (c) { _supabase = c; };

const ALLOWED_FIELDS = [
  'record_id', 'property_type', 'foundation_type', 'construction_type', 'roof_type',
  'year_built', 'square_footage', 'num_bedrooms', 'num_bathrooms', 'num_stories',
  'garage_type', 'has_pool', 'has_fireplace', 'occupied', 'notes',
];

function pick(obj, allowed) {
  var out = {};
  allowed.forEach(function (k) { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  const authError = requireAuth(event);
  if (authError) return authError;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var { record_id } = body;

  if (!record_id) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'record_id required' }) };
  }
  if (!body.property_type) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'property_type required' }) };
  }

  var row = pick(body, ALLOWED_FIELDS);

  try {
    // Check if profile exists for this record
    var { data: existing } = await db()
      .from('property_profiles')
      .select('id')
      .eq('record_id', record_id)
      .maybeSingle();

    var result;
    if (existing) {
      // Update existing
      result = await db()
        .from('property_profiles')
        .update(row)
        .eq('record_id', record_id)
        .select('id')
        .single();
    } else {
      // Insert new
      result = await db()
        .from('property_profiles')
        .insert(row)
        .select('id')
        .single();
    }

    if (result.error) throw result.error;

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ id: result.data.id }) };
  } catch (err) {
    console.error('save-property-profile error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
