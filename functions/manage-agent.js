/**
 * Netlify Function: manage-agent
 *
 * CREATE, UPDATE, DELETE real estate agent accounts.
 * CREATE: inserts an agents row with role='agent' and generates a permanent portal_token.
 *         Does NOT create a Supabase auth user — agents log in via token only.
 * UPDATE: updates agents row fields.
 * DELETE: deletes agents row only.
 *
 * POST body: { action, id?, name, email, phone?, company?, active? }
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');
const crypto = require('crypto');

const { corsHeaders } = require('./lib/cors');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };

  const authError = await requireAuth(event);
  if (authError) return authError;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action, id, name, email, phone, company, active, booking_discount } = body;
  const sb = getSupabase();

  try {

    // ── CREATE ──────────────────────────────────────────────
    if (action === 'create') {
      if (!name || !email) {
        return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'name and email are required' }) };
      }

      // Check for duplicate email
      const { data: existing } = await sb
        .from('agents')
        .select('id')
        .eq('email', email)
        .eq('role', 'agent')
        .maybeSingle();

      if (existing) {
        return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'An agent with this email already exists.' }) };
      }

      // Generate a permanent portal token
      const portal_token = crypto.randomBytes(32).toString('hex');

      const { data, error } = await sb.from('agents').insert({
        name,
        email,
        phone:          phone            || null,
        company:        company          || null,
        booking_discount: booking_discount != null ? Number(booking_discount) || 0 : 0,
        role:         'agent',
        active:       active !== false,
        portal_token,
      }).select('id').single();

      if (error) return { statusCode: 500, headers: headers, body: JSON.stringify({ error: error.message }) };

      return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true, id: data.id, portal_token }) };
    }

    // ── UPDATE ──────────────────────────────────────────────
    if (action === 'update') {
      if (!id) return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'id is required' }) };

      const payload = {};
      if (name             !== undefined) payload.name             = name;
      if (email            !== undefined) payload.email            = email;
      if (phone            !== undefined) payload.phone            = phone || null;
      if (company          !== undefined) payload.company          = company || null;
      if (active           !== undefined) payload.active           = active;
      if (booking_discount !== undefined) payload.booking_discount = Number(booking_discount) || 0;

      const { error } = await sb.from('agents').update(payload).eq('id', id).eq('role', 'agent');
      if (error) return { statusCode: 500, headers: headers, body: JSON.stringify({ error: error.message }) };

      return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true }) };
    }

    // ── DELETE ──────────────────────────────────────────────
    if (action === 'delete') {
      if (!id) return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'id is required' }) };

      const { error } = await sb.from('agents').delete().eq('id', id).eq('role', 'agent');
      if (error) return { statusCode: 500, headers: headers, body: JSON.stringify({ error: error.message }) };

      return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    console.error('[manage-agent] error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
