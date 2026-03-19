/**
 * Netlify Function: save-narrative
 *
 * Manages narrative state transitions: approve, edit (custom), revert.
 *
 * POST body: { record_id, section_id, action, custom_text? }
 * action: 'approve' | 'edit' | 'revert'
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');

const { corsHeaders } = require('./lib/cors');

var _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _supabase;
}

exports._setClient = function (c) { _supabase = c; };

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  const authError = await requireAuth(event);
  if (authError) return authError;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var { record_id, section_id, action, custom_text } = body;

  if (!record_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'record_id required' }) };
  }
  if (!section_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'section_id required' }) };
  }
  if (!action) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'action required' }) };
  }

  var validActions = ['approve', 'edit', 'revert', 'approve_finding', 'approve_photo'];
  if (validActions.indexOf(action) === -1) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'action must be approve, edit, revert, approve_finding, or approve_photo' }) };
  }

  if (action === 'edit' && !custom_text) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'custom_text required for edit action' }) };
  }

  // ── Per-finding approval ──
  if (action === 'approve_finding') {
    var finding_id = body.finding_id;
    if (!finding_id) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'finding_id required for approve_finding' }) };
    }
    try {
      var { error: afErr } = await db()
        .from('inspection_findings')
        .update({ narrative_status: 'approved', narrative_approved_at: new Date().toISOString() })
        .eq('id', finding_id)
        .eq('record_id', record_id);
      if (afErr) throw afErr;
      return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true, status: 'approved' }) };
    } catch (err) {
      console.error('save-narrative approve_finding error:', err);
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── Per-photo approval (HEA-160) ──
  if (action === 'approve_photo') {
    var photo_id = body.photo_id;
    if (!photo_id) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'photo_id required for approve_photo' }) };
    }
    try {
      var { error: apErr } = await db()
        .from('inspection_finding_photos')
        .update({ narrative_status: 'approved', narrative_approved_at: new Date().toISOString() })
        .eq('id', photo_id)
        .eq('record_id', record_id);
      if (apErr) throw apErr;
      return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true, status: 'approved' }) };
    } catch (err) {
      console.error('save-narrative approve_photo error:', err);
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  try {
    // Fetch existing narrative
    var { data: narrative, error: fetchErr } = await db()
      .from('inspection_narratives')
      .select('*')
      .eq('record_id', record_id)
      .eq('section_id', section_id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!narrative) {
      return { statusCode: 404, headers: headers, body: JSON.stringify({ error: 'Narrative not found' }) };
    }

    var updates = { updated_at: new Date().toISOString() };

    if (action === 'approve') {
      updates.approved_narrative = narrative.draft_narrative;
      updates.status = 'approved';
      updates.approved_at = new Date().toISOString();
    } else if (action === 'edit') {
      updates.custom_narrative = custom_text;
      updates.status = 'custom';
    } else if (action === 'revert') {
      updates.approved_narrative = null;
      updates.custom_narrative = null;
      updates.status = 'draft';
      updates.approved_at = null;
    }

    var { error: updErr } = await db()
      .from('inspection_narratives')
      .update(updates)
      .eq('id', narrative.id);

    if (updErr) throw updErr;

    return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true, status: updates.status }) };
  } catch (err) {
    console.error('save-narrative error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
