/**
 * Netlify Function: inspection-webhook
 *
 * Receives lab results (radon, mold, water quality) from external services
 * and updates the corresponding inspection section data + pending sections.
 *
 * Endpoint: POST /api/inspection-webhook
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
    const {
      inspection_id,
      section_id,
      result_type,
      results,
      lab_report_url,
    } = JSON.parse(event.body);

    if (!inspection_id || !section_id || !results) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: inspection_id, section_id, results' }),
      };
    }

    // 1. Fetch existing section data
    const sdRes = await sbFetch(
      `inspection_section_data?inspection_record_id=eq.${inspection_id}&section_id=eq.${section_id}&select=*`
    );
    const sdRows = await sdRes.json();

    if (!sdRows || !sdRows.length) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Section data not found' }) };
    }

    const sectionData = sdRows[0];
    let items = typeof sectionData.items === 'string' ? JSON.parse(sectionData.items) : (sectionData.items || []);

    // 2. Merge lab results into section items
    for (const [itemId, value] of Object.entries(results)) {
      const existing = items.find(i => i.id === itemId);
      if (existing) {
        existing.value = value;
        existing.lab_result = true;
      } else {
        items.push({ id: itemId, value, lab_result: true });
      }
    }

    // Update the lab results status item if present (e.g., 'mold-lab', 'water-lab')
    const labStatusItem = items.find(i => i.id.endsWith('-lab'));
    if (labStatusItem) {
      labStatusItem.value = 'Received — attached';
    }

    // 3. Append lab report URL to general comment
    let generalComment = sectionData.general_comment || '';
    if (lab_report_url) {
      generalComment += (generalComment ? '\n' : '') + `Lab report: ${lab_report_url}`;
    }

    // 4. Update section data
    await sbFetch(
      `inspection_section_data?inspection_record_id=eq.${inspection_id}&section_id=eq.${section_id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          items: JSON.stringify(items),
          general_comment: generalComment,
          last_modified: new Date().toISOString(),
        }),
      }
    );

    // 5. Remove from pending_sections in report_versions (if exists)
    const rvRes = await sbFetch(
      `report_versions?inspection_record_id=eq.${inspection_id}&select=*&order=version.desc&limit=1`
    );
    const rvRows = await rvRes.json();
    if (rvRows && rvRows.length) {
      const rv = rvRows[0];
      const pending = (rv.pending_sections || []).filter(s => s !== section_id);
      await sbFetch(`report_versions?id=eq.${rv.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pending_sections: pending }),
      });
    }

    // 6. Log audit entry
    await sbFetch('audit_log', {
      method: 'POST',
      body: JSON.stringify({
        inspection_record_id: inspection_id,
        actor_type: 'system',
        action: 'lab_results_received',
        details: {
          section_id,
          result_type: result_type || 'lab',
          results_count: Object.keys(results).length,
        },
      }),
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        section_id,
        updated_items: Object.keys(results).length,
      }),
    };
  } catch (err) {
    console.error('inspection-webhook error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
