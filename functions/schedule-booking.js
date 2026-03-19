/**
 * Netlify Function: schedule-booking
 *
 * Receives agent booking data. Upserts into clients table, creates an
 * inspection_record, and schedules 4 email reminders (6mo, 12mo, spring, fall).
 *
 * Route: /api/schedule-booking (via netlify.toml redirect)
 *
 * Environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js');
const { writeAuditLog } = require('./write-audit-log');
const { corsHeaders } = require('./lib/cors');
// Reminders handled manually via Broadcasts tab — not auto-scheduled

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

/**
 * Parse a display name into first and last name.
 * "John Smith" → { first: "John", last: "Smith" }
 * "Mary Jane Watson" → { first: "Mary Jane", last: "Watson" }
 * "John" → { first: "John", last: "" }
 * Exported for unit testing.
 */
function parseClientName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { first: '', last: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  const last = parts.pop();
  return { first: parts.join(' '), last };
}

exports.handler = async function (event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body);
    const required = ['client_name', 'property_address', 'agent_id'];
    const missing = required.filter(f => !payload[f]);
    if (missing.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing: ' + missing.join(', ') }) };
    }

    const sb = getSupabase();
    if (!sb) {
      // Graceful fallback — still return success
      console.warn('schedule-booking: Supabase not configured, skipping client portal setup');
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Booking received' }) };
    }

    // Parse name
    const { first, last } = parseClientName(payload.client_name);
    const email = (payload.client_email || '').trim().toLowerCase();
    const phone = payload.client_phone || '';

    // Upsert client (match on lowercase email)
    let clientId;
    if (email) {
      const { data: existing } = await sb
        .from('clients')
        .select('id')
        .ilike('email', email)
        .single();

      if (existing) {
        clientId = existing.id;
        // Update name/phone if provided
        await sb.from('clients').update({
          first_name: first,
          last_name: last,
          phone: phone || undefined,
        }).eq('id', clientId);
      } else {
        const { data: newClient, error: insertErr } = await sb
          .from('clients')
          .insert({ first_name: first, last_name: last, email, phone })
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        clientId = newClient.id;
      }
    } else {
      // No email — create client without unique constraint conflict
      const { data: newClient, error: insertErr } = await sb
        .from('clients')
        .insert({ first_name: first, last_name: last, email: `no-email-${Date.now()}@placeholder`, phone })
        .select('id')
        .single();
      if (insertErr) throw insertErr;
      clientId = newClient.id;
    }

    // Determine inspection date
    const inspectionDate = payload.preferred_date || new Date().toISOString().split('T')[0];

    // Create inspection record
    const { data: record, error: recErr } = await sb
      .from('inspection_records')
      .insert({
        booking_id: payload.booking_id || null,
        client_id: clientId,
        agent_id: payload.agent_id,
        inspection_address: payload.property_address,
        inspection_date: inspectionDate,
        category_id: payload.category_id || null,
        property_data: payload.property_data || {},
        findings: [],
      })
      .select('id')
      .single();
    if (recErr) throw recErr;

    // ── Audit log (fire and forget) ──
    writeAuditLog({
      record_id: record.id,
      action:    'booking.created',
      category:  'scheduling',
      actor:     'agent',
      details:   { address: payload.property_address, client: payload.client_name, agent_id: payload.agent_id },
    });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success: true,
        message: 'Booking received',
        client_id: clientId,
        inspection_record_id: record.id,
      }),
    };

  } catch (err) {
    console.error('schedule-booking error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

// Export for unit testing
exports.parseClientName = parseClientName;
