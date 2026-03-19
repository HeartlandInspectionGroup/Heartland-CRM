/**
 * Netlify Function: generate-report
 *
 * Compiles inspection section data into a structured HTML report payload.
 * The actual PDF generation happens client-side via html2pdf.js.
 * This function provides the compiled report data for both the
 * interactive web report and the PDF generation input.
 *
 * Endpoint: POST /api/generate-report
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'inspection-photos';

const { corsHeaders } = require('./lib/cors');
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
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { inspection_id } = JSON.parse(event.body);

    if (!inspection_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing inspection_id' }) };
    }

    // 1. Fetch inspection record with client and agent data
    const recRes = await sbFetch(
      `inspection_records?id=eq.${inspection_id}&select=*,clients(name,email,phone),agents(name,email,company)`
    );
    const records = await recRes.json();
    if (!records || !records.length) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Inspection not found' }) };
    }
    const inspection = records[0];

    // 2. Fetch section data
    const sdRes = await sbFetch(
      `inspection_section_data?inspection_record_id=eq.${inspection_id}&select=*&order=last_modified`
    );
    const sectionData = await sdRes.json();

    // 3. Fetch section templates
    const sectRes = await sbFetch('inspection_sections?active=eq.true&order=sort_order&select=*');
    const sectionTemplates = await sectRes.json();
    const templateMap = {};
    (sectionTemplates || []).forEach(s => { templateMap[s.id] = s; });

    // 4. Fetch photos
    const photoRes = await sbFetch(
      `inspection_photos?inspection_record_id=eq.${inspection_id}&select=*&order=taken_at`
    );
    const photos = await photoRes.json();
    const photosBySection = {};
    (photos || []).forEach(p => {
      if (!photosBySection[p.section_id]) photosBySection[p.section_id] = [];
      p.public_url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p.storage_path}`;
      photosBySection[p.section_id].push(p);
    });

    // 5. Fetch agreement (if exists)
    const agreeRes = await sbFetch(
      `inspection_agreements?inspection_record_id=eq.${inspection_id}&select=*`
    );
    const agreements = await agreeRes.json();
    const agreement = agreements && agreements.length ? agreements[0] : null;

    // 6. Compile report sections
    const reportSections = [];
    const notInspected = [];
    const allFindings = [];
    let findingCounter = 1;

    for (const sd of (sectionData || [])) {
      const template = templateMap[sd.section_id] || {};
      let items, templateItems;
      try { items = typeof sd.items === 'string' ? JSON.parse(sd.items) : (sd.items || []); } catch (e) { items = []; }
      try { templateItems = typeof template.items === 'string' ? JSON.parse(template.items) : (template.items || []); } catch (e) { templateItems = []; }

      if (sd.status === 'skipped' || sd.status === 'na') {
        notInspected.push({
          section_id: sd.section_id,
          section_name: template.name || sd.section_id,
          reason: sd.skip_reason || (sd.status === 'na' ? 'Not applicable' : 'Skipped'),
        });
        continue;
      }

      const sectionFindings = [];
      const sectionItems = [];

      for (const item of items) {
        // Match with template item for label
        const tplItem = templateItems.find(ti => ti.id === item.id) || {};

        const compiled = {
          id: item.id,
          label: tplItem.label || item.id,
          type: tplItem.type || 'condition',
          value: item.value || null,
          condition: item.condition || null,
          comment: item.comment || '',
        };
        sectionItems.push(compiled);

        // Track "Not Inspected" items
        if (item.condition === 'Not Inspected') {
          notInspected.push({
            section_id: sd.section_id,
            section_name: template.name || sd.section_id,
            item: tplItem.label || item.id,
            reason: 'Not inspected',
          });
        }

        // Build findings for defects
        if (item.condition === 'Minor Defect' || item.condition === 'Major Defect') {
          const finding = {
            id: `F${String(findingCounter++).padStart(3, '0')}`,
            section_id: sd.section_id,
            section_name: template.name || sd.section_id,
            category: (template.group_name || 'Other').toLowerCase(),
            severity: item.condition === 'Major Defect' ? 'major' : 'minor',
            title: tplItem.label || item.id,
            description: item.comment || '',
            photos: (photosBySection[sd.section_id] || []).filter(p => p.item_id === item.id),
          };
          sectionFindings.push(finding);
          allFindings.push(finding);
        }
      }

      reportSections.push({
        section_id: sd.section_id,
        name: template.name || sd.section_id,
        group_name: template.group_name || 'Other',
        icon: template.icon || '',
        status: sd.status,
        flagged: sd.flagged,
        general_comment: sd.general_comment || '',
        items: sectionItems,
        findings: sectionFindings,
        photos: photosBySection[sd.section_id] || [],
      });
    }

    // 7. Build report payload
    const report = {
      meta: {
        generated_at: new Date().toISOString(),
        report_version: 2,
      },
      property: {
        address: inspection.inspection_address,
        data: inspection.property_data || {},
      },
      inspection: {
        id: inspection.id,
        date: inspection.inspection_date,
        state_code: inspection.state_code || 'IL',
        weather: inspection.weather || {},
        started_at: inspection.started_at,
        completed_at: inspection.completed_at,
      },
      client: inspection.clients || {},
      agent: inspection.agents || {},
      inspector: {
        name: 'Heartland Inspection Group',
        company: 'Heartland Inspection Group',
      },
      agreement: agreement ? {
        signed: true,
        state_code: agreement.state_code,
        client_signed_at: agreement.client_signed_at,
        inspector_signed_at: agreement.inspector_signed_at,
      } : null,
      sections: reportSections,
      findings: allFindings,
      not_inspected: notInspected,
      summary: {
        total_sections: reportSections.length,
        total_findings: allFindings.length,
        major: allFindings.filter(f => f.severity === 'major').length,
        minor: allFindings.filter(f => f.severity === 'minor').length,
        flagged_sections: reportSections.filter(s => s.flagged).length,
        photo_count: (photos || []).length,
      },
    };

    // 8. Create/update report_versions entry
    await sbFetch('report_versions', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        inspection_record_id: inspection_id,
        version: 1,
        generated_at: new Date().toISOString(),
        notes: `${allFindings.length} findings, ${(photos || []).length} photos`,
      }),
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(report),
    };
  } catch (err) {
    console.error('generate-report error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
