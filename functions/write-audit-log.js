/**
 * Netlify Function: write-audit-log
 *
 * Writes a single audit event to the audit_log table.
 * Called internally by other functions — fire and forget, never blocks.
 *
 * POST body: { record_id, action, category, details, actor }
 *
 * Categories: scheduling | agreements | payments | inspection | agent | admin
 * Actions:
 *   scheduling:  booking.created | booking.rescheduled | booking.cancelled
 *   agreements:  agreement.sent | agreement.signed | agreement.viewed
 *   payments:    payment.field | payment.online | payment.stripe_webhook
 *   inspection:  draft.saved | report.submitted | report.delivered
 *   agent:       agent.assigned | report.release.authorized | report.release.revoked
 *   admin:       qa.approved | qa.revision_requested | record.updated
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const { corsHeaders } = require('./lib/cors');
exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { record_id, action, category, details, actor } = body;

  if (!action || !category) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'action and category required' }) };
  }

  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/audit_log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        record_id: record_id || null,
        action:    action,
        category:  category,
        details:   details || {},
        actor:     actor || 'system',
      }),
    });

    if (!res.ok) {
      var errText = await res.text();
      console.error('[write-audit-log] Supabase error:', errText);
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: errText }) };
    }

    return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true }) };

  } catch(err) {
    console.error('[write-audit-log] Error:', err.message);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};

/**
 * Helper for other Netlify functions to fire-and-forget an audit log entry.
 * Usage: writeAuditLog({ record_id, action, category, details, actor })
 * Never throws — safe to call without await or try/catch.
 */
async function writeAuditLog({ record_id, action, category, details, actor }) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(SUPABASE_URL + '/rest/v1/audit_log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        record_id: record_id || null,
        action:    action,
        category:  category,
        details:   details || {},
        actor:     actor || 'system',
      }),
    });
  } catch(err) {
    console.error('[writeAuditLog] Non-fatal error:', err.message);
  }
}

module.exports.writeAuditLog = writeAuditLog;
