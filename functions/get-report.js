const { createClient } = require('@supabase/supabase-js');

const { corsHeaders } = require('./lib/cors');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const { id, booking_id, include_photos } = event.queryStringParameters || {};
  if (!id && !booking_id) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Missing id or booking_id' }) };
  }

  try {
    let query = supabase
      .from('inspection_records')
      .select('*');

    if (id) {
      query = query.eq('id', id).single();
    } else {
      query = query.eq('booking_id', booking_id).limit(1).single();
    }

    const { data, error } = await query;

    if (error || !data) {
      return { statusCode: 404, headers: headers, body: JSON.stringify({ error: 'Report not found' }) };
    }

    // Status gate: only the public report viewer requires status=submitted
    // invoice.html, invoice-receipt.html, and field photos bypass this gate
    const bypassGate = booking_id || include_photos === 'true' || event.queryStringParameters.invoice === 'true';
    if (!bypassGate && data.status !== 'submitted') {
      return { statusCode: 404, headers: headers, body: JSON.stringify({ error: 'Report not available' }) };
    }

    // Optionally include field_photos
    var fieldPhotos = [];
    if (include_photos === 'true' && data.id) {
      const { data: fpRows } = await supabase
        .from('field_photos')
        .select('id, section_id, subsection_id, cloudinary_url, cloudinary_public_id, caption, created_at')
        .eq('record_id', data.id)
        .order('created_at', { ascending: true });
      fieldPhotos = fpRows || [];
    }

    // V2 data — fetch findings, narratives, finding photos, and sections in parallel
    var v2 = { findings: [], narratives: {}, finding_photos: [], sections: [] };
    if (data.id) {
      var [findingsRes, narrativesRes, findingPhotosRes, sectionsRes, configRes, commentsRes, fieldAnswersRes, fieldQuestionsRes, equipmentScansRes] = await Promise.all([
        supabase.from('inspection_findings').select('*, inspection_finding_recommendations(*)').eq('record_id', data.id),
        supabase.from('inspection_narratives').select('*').eq('record_id', data.id),
        supabase.from('inspection_finding_photos').select('*').eq('record_id', data.id).order('order_index', { ascending: true }),
        supabase.from('wizard_sections').select('id, name, icon, order_index').eq('active', true).order('order_index', { ascending: true }),
        supabase.from('config_json').select('config').limit(1).single(),
        supabase.from('inspection_section_comments').select('*').eq('record_id', data.id),
        supabase.from('inspection_field_answers').select('*').eq('record_id', data.id),
        supabase.from('wizard_field_questions').select('*').eq('active', true).order('order_index'),
        supabase.from('equipment_scans').select('*').eq('record_id', data.id),
      ]);

      var findings = (findingsRes.data || []).map(function (f) {
        f.recommendations = f.inspection_finding_recommendations || [];
        delete f.inspection_finding_recommendations;
        return f;
      });
      v2.findings = findings;

      // Key narratives by section_id
      (narrativesRes.data || []).forEach(function (n) {
        v2.narratives[n.section_id] = n;
      });

      v2.finding_photos = findingPhotosRes.data || [];
      // Photo-centric findings (HEA-160) — photos where severity is set
      v2.photo_findings = (findingPhotosRes.data || []).filter(function (p) { return p.severity; });
      v2.sections = sectionsRes.data || [];
      v2.config = (configRes.data && configRes.data.config) || {};

      // Section comments keyed by section_id (HEA-163)
      v2.section_comments = {};
      ((commentsRes && commentsRes.data) || []).forEach(function (c) {
        v2.section_comments[c.section_id] = c.comment;
      });

      // Field answers — nested by field_id then question_id (HEA-166 + HEA-175)
      v2.field_answers = {};
      ((fieldAnswersRes && fieldAnswersRes.data) || []).forEach(function (a) {
        if (!v2.field_answers[a.field_id]) v2.field_answers[a.field_id] = {};
        var key = a.question_id || 'field';
        v2.field_answers[a.field_id][key] = a;
      });

      // Field questions keyed by field_id (HEA-175)
      v2.field_questions = {};
      ((fieldQuestionsRes && fieldQuestionsRes.data) || []).forEach(function (q) {
        if (!v2.field_questions[q.field_id]) v2.field_questions[q.field_id] = [];
        v2.field_questions[q.field_id].push(q);
      });

      // Equipment scans — keyed by section_id:field_id (HEA-220)
      v2.equipment_scans = {};
      ((equipmentScansRes && equipmentScansRes.data) || []).forEach(function (es) {
        var esKey = es.field_id ? (es.section_id + ':' + es.field_id) : es.section_id;
        v2.equipment_scans[esKey] = es;
      });
    }

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        report: data,
        field_photos: fieldPhotos,
        v2_findings: v2.findings,
        v2_narratives: v2.narratives,
        v2_finding_photos: v2.finding_photos,
        v2_photo_findings: v2.photo_findings,
        v2_sections: v2.sections,
        v2_section_comments: v2.section_comments,
        v2_field_answers: v2.field_answers,
        v2_field_questions: v2.field_questions,
        v2_equipment_scans: v2.equipment_scans,
        config: v2.config,
      }),
    };

  } catch (err) {
    console.error('get-report error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
