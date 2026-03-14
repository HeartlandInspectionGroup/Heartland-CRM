// manage-inspector.js
// CREATE, UPDATE, DELETE inspector accounts.
// CREATE: creates Supabase auth user + agents row in one shot.
// UPDATE: updates agents row (and optionally resets password).
// DELETE: deletes agents row + Supabase auth user.

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };

  const authError = requireAuth(event);
  if (authError) return authError;

  // Use service key — needed to create/delete auth users
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { action, id, name, email, password, role, active, phone } = body;

  try {
    // ── CREATE ──────────────────────────────────────────────
    if (action === 'create') {
      if (!name || !email || !password) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'name, email and password are required' }) };
      }

      // 1. Check if auth user already exists (handles partial failures)
      const { data: listData } = await sb.auth.admin.listUsers({ perPage: 1000 });
      const existingAuthUser = listData && listData.users
        ? listData.users.find(u => u.email === email)
        : null;

      let userId;

      if (existingAuthUser) {
        // Auth exists — check if agents row also exists
        const { data: existingAgent } = await sb.from('agents').select('id').eq('id', existingAuthUser.id).single();
        if (existingAgent) {
          return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'An inspector with this email already exists.' }) };
        }
        // Auth exists but no agents row — reuse auth, reset password
        userId = existingAuthUser.id;
        await sb.auth.admin.updateUserById(userId, { password });
      } else {
        // Create new Supabase auth user
        const { data: authData, error: authErr } = await sb.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (authErr) {
          return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: authErr.message }) };
        }
        userId = authData.user.id;
      }

      // 2. Create agents row with same ID
      const { error: agentErr } = await sb.from('agents').insert({
        id: userId,
        name,
        email,
        role: role || 'inspector',
        active: active !== false,
      });

      if (agentErr) {
        // Roll back auth user if agents insert fails
        await sb.auth.admin.deleteUser(userId);
        return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: agentErr.message }) };
      }

      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, id: userId }) };
    }

    // ── UPDATE ──────────────────────────────────────────────
    if (action === 'update') {
      if (!id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id is required' }) };

      // Update agents row
      const agentPayload = {};
      if (name !== undefined)   agentPayload.name   = name;
      if (email !== undefined)  agentPayload.email  = email;
      if (role !== undefined)   agentPayload.role   = role;
      if (active !== undefined) agentPayload.active = active;
      if (phone !== undefined)  agentPayload.phone  = phone;

      const { error: agentErr } = await sb.from('agents').update(agentPayload).eq('id', id);
      if (agentErr) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: agentErr.message }) };

      // Optionally reset password
      if (password) {
        const { error: pwErr } = await sb.auth.admin.updateUserById(id, { password });
        if (pwErr) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: pwErr.message }) };
      }

      // Optionally update email in auth too
      if (email) {
        await sb.auth.admin.updateUserById(id, { email });
      }

      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    // ── DELETE ──────────────────────────────────────────────
    if (action === 'delete') {
      if (!id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id is required' }) };

      // Delete agents row first
      const { error: agentErr } = await sb.from('agents').delete().eq('id', id);
      if (agentErr) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: agentErr.message }) };

      // Delete Supabase auth user
      const { error: authErr } = await sb.auth.admin.deleteUser(id);
      if (authErr) console.error('Auth delete error (agents row already deleted):', authErr.message);

      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    console.error('manage-inspector error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
