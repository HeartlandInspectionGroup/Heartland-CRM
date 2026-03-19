const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');

const { corsHeaders } = require('./lib/cors');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function ok(body)  { return { statusCode: 200, headers: headers, body: JSON.stringify(body) }; }
function err(code, msg) { return { statusCode: code, headers: headers, body: JSON.stringify({ error: msg }) }; }

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  // ── AUTH CHECK ──
  const authError = await requireAuth(event);
  if (authError) return authError;
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  // ── GET all inspectors ──
  if (event.httpMethod === 'GET') {
    try {
      const { data, error } = await supabase
        .from('inspectors')
        .select('id, name, active, role, last_seen, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ok({ inspectors: data || [] });
    } catch (e) {
      console.error('get-inspectors GET:', e);
      return err(500, e.message);
    }
  }

  // ── POST add inspector ──
  if (event.httpMethod === 'POST') {
    let parsed;
    try { parsed = JSON.parse(event.body || '{}'); } catch { return err(400, 'Invalid JSON'); }

    const { name, pin, role } = parsed;
    if (!name || !pin) return err(400, 'Name and PIN required');

    try {
      const { data, error } = await supabase
        .from('inspectors')
        .insert({ name, pin, active: true, role: role || 'inspector' })
        .select('id, name, active, role')
        .single();
      if (error) throw error;
      return ok({ inspector: data });
    } catch (e) {
      console.error('get-inspectors POST:', e);
      return err(500, e.message);
    }
  }

  // ── PATCH update inspector ──
  if (event.httpMethod === 'PATCH') {
    let parsed;
    try { parsed = JSON.parse(event.body || '{}'); } catch { return err(400, 'Invalid JSON'); }

    const { id, name, pin, active, role } = parsed;
    if (!id) return err(400, 'ID required');

    const updates = {};
    if (name   !== undefined) updates.name   = name;
    if (pin    !== undefined) updates.pin    = pin;
    if (active !== undefined) updates.active = active;
    if (role   !== undefined) updates.role   = role;

    try {
      const { data, error } = await supabase
        .from('inspectors')
        .update(updates)
        .eq('id', id)
        .select('id, name, active, role')
        .single();
      if (error) throw error;
      return ok({ inspector: data });
    } catch (e) {
      console.error('get-inspectors PATCH:', e);
      return err(500, e.message);
    }
  }

  // ── DELETE inspector ──
  if (event.httpMethod === 'DELETE') {
    let parsed;
    try { parsed = JSON.parse(event.body || '{}'); } catch { return err(400, 'Invalid JSON'); }

    const { id } = parsed;
    if (!id) return err(400, 'ID required');

    try {
      const { error } = await supabase.from('inspectors').delete().eq('id', id);
      if (error) throw error;
      return ok({ success: true });
    } catch (e) {
      console.error('get-inspectors DELETE:', e);
      return err(500, e.message);
    }
  }

  return err(405, 'Method Not Allowed');
};
