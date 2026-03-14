/**
 * Netlify Function: sync-inspection
 *
 * Receives batched section data + status updates from the PWA inspector.
 * Upserts section data, updates inspection status, and logs to audit_log.
 *
 * Endpoint: POST /api/sync-inspection
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function sbFetch(path, opts = {}) {
  const h = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...opts.headers,
  };
  if (opts.upsert) {
    h['Prefer'] = 'resolution=merge-duplicates';
  }
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: h });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { inspection_id, inspector_email, changes } = JSON.parse(event.body);

    if (!inspection_id || !changes || !changes.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing inspection_id or changes' }) };
    }

    const results = [];

    for (const change of changes) {
      if (change.type === 'section_update') {
        const payload = {
          inspection_record_id: inspection_id,
          section_id: change.section_id,
          status: change.data.status || 'in_progress',
          skip_reason: change.data.skip_reason || '',
          items: JSON.stringify(change.data.items || []),
          general_comment: change.data.general_comment || '',
          flagged: change.data.flagged || false,
          last_modified: change.timestamp || new Date().toISOString(),
        };

        const res = await sbFetch('inspection_section_data', {
          method: 'POST',
          upsert: true,
          body: JSON.stringify(payload),
        });
        results.push({ type: 'section_update', section_id: change.section_id, ok: res.ok });

      } else if (change.type === 'status_change') {
        const payload = { status: change.status };
        if (change.status === 'in_progress') payload.started_at = change.timestamp;
        if (change.status === 'review' || change.status === 'submitted') payload.completed_at = change.timestamp;

        const res = await sbFetch(`inspection_records?id=eq.${inspection_id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        results.push({ type: 'status_change', status: change.status, ok: res.ok });

      } else if (change.type === 'agreement') {
        const payload = {
          inspection_record_id: inspection_id,
          ...change.data,
        };

        const res = await sbFetch('inspection_agreements', {
          method: 'POST',
          upsert: true,
          body: JSON.stringify(payload),
        });
        results.push({ type: 'agreement', ok: res.ok });
      }
    }

    // Fetch current server state for conflict resolution
    const stateRes = await sbFetch(`inspection_records?id=eq.${inspection_id}&select=status,qa_status,completed_sections,total_sections`);
    const stateRows = await stateRes.json();
    const serverState = stateRows && stateRows.length ? stateRows[0] : {};

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ synced: true, results, server_state: serverState }),
    };
  } catch (err) {
    console.error('sync-inspection error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
