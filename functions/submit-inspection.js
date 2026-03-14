/**
 * Netlify Function: submit-inspection
 *
 * Validates completeness of an inspection, compiles section data into the
 * findings JSONB column on inspection_records, updates status, and logs audit entry.
 *
 * Endpoint: POST /api/submit-inspection
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
    const { inspection_id, inspector_id } = JSON.parse(event.body);

    if (!inspection_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing inspection_id' }) };
    }

    // 1. Fetch the inspection record
    const recRes = await sbFetch(`inspection_records?id=eq.${inspection_id}&select=*`);
    const records = await recRes.json();
    if (!records || !records.length) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Inspection not found' }) };
    }
    const inspection = records[0];

    // 2. Fetch all section data
    const sdRes = await sbFetch(`inspection_section_data?inspection_record_id=eq.${inspection_id}&select=*`);
    const sectionData = await sdRes.json();

    // 3. Fetch section templates for names
    const sectRes = await sbFetch('inspection_sections?select=id,name,category,group_name');
    const sectionTemplates = await sectRes.json();
    const templateMap = {};
    (sectionTemplates || []).forEach(s => { templateMap[s.id] = s; });

    // 4. Validate completeness
    const incomplete = sectionData.filter(sd =>
      sd.status === 'not_started' || sd.status === 'in_progress'
    );
    if (incomplete.length > 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Incomplete sections',
          incomplete: incomplete.map(s => s.section_id),
        }),
      };
    }

    // 5. Compile findings JSONB from section data
    const findings = [];
    let findingCounter = 1;

    for (const sd of sectionData) {
      if (sd.status === 'skipped' || sd.status === 'na') continue;

      const template = templateMap[sd.section_id] || {};
      const items = typeof sd.items === 'string' ? JSON.parse(sd.items) : (sd.items || []);

      for (const item of items) {
        // Only include items with defects or notable conditions
        if (item.condition === 'Minor Defect' || item.condition === 'Major Defect') {
          const severity = item.condition === 'Major Defect' ? 'major' : 'minor';
          findings.push({
            id: `F${String(findingCounter++).padStart(3, '0')}`,
            section_id: sd.section_id,
            section_name: template.name || sd.section_id,
            category: (template.group_name || 'Other').toLowerCase(),
            severity,
            item_id: item.id,
            title: item.label || item.id,
            description: item.comment || '',
            condition: item.condition,
          });
        }
      }

      // Include general comment as info finding if section was flagged
      if (sd.flagged && sd.general_comment) {
        findings.push({
          id: `F${String(findingCounter++).padStart(3, '0')}`,
          section_id: sd.section_id,
          section_name: template.name || sd.section_id,
          category: (template.group_name || 'Other').toLowerCase(),
          severity: 'info',
          title: `${template.name || sd.section_id} — Flagged`,
          description: sd.general_comment,
          condition: 'Flagged for review',
        });
      }
    }

    // 6. Fetch photos metadata
    const photoRes = await sbFetch(`inspection_photos?inspection_record_id=eq.${inspection_id}&select=*`);
    const photos = await photoRes.json();

    // 7. Compile the full findings payload
    const compiledFindings = {
      version: 2,
      compiled_at: new Date().toISOString(),
      findings,
      section_summary: sectionData.map(sd => ({
        section_id: sd.section_id,
        section_name: (templateMap[sd.section_id] || {}).name || sd.section_id,
        status: sd.status,
        flagged: sd.flagged,
        general_comment: sd.general_comment || '',
        item_count: (typeof sd.items === 'string' ? JSON.parse(sd.items) : (sd.items || [])).length,
      })),
      photo_count: (photos || []).length,
      total_findings: findings.length,
      major_count: findings.filter(f => f.severity === 'major').length,
      minor_count: findings.filter(f => f.severity === 'minor').length,
    };

    // 8. Update inspection record
    const completedSections = sectionData.filter(sd =>
      sd.status === 'completed' || sd.status === 'skipped' || sd.status === 'na'
    ).length;

    await sbFetch(`inspection_records?id=eq.${inspection_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'submitted',
        findings: compiledFindings,
        completed_at: new Date().toISOString(),
        completed_sections: completedSections,
      }),
    });

    // 9. Log audit entry
    await sbFetch('audit_log', {
      method: 'POST',
      body: JSON.stringify({
        inspection_record_id: inspection_id,
        actor_id: inspector_id || null,
        actor_type: 'inspector',
        action: 'inspection_submitted',
        details: {
          total_findings: findings.length,
          major_count: findings.filter(f => f.severity === 'major').length,
          minor_count: findings.filter(f => f.severity === 'minor').length,
          completed_sections: completedSections,
        },
      }),
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        inspection_id,
        findings_count: findings.length,
        status: 'submitted',
      }),
    };
  } catch (err) {
    console.error('submit-inspection error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
