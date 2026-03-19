const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');
const { emailWrap, emailBtn, esc } = require('./lib/email-template');
const { resolveTemplate } = require('./lib/template-utils');
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL     = 'no-reply@heartlandinspectiongroup.com';
const FROM_NAME      = 'Heartland Inspection Group';
const SITE_URL = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';
const crypto         = require('crypto');
const { corsHeaders } = require('./lib/cors');
const BCC_EMAIL      = 'jake@heartlandinspectiongroup.com';

function ensureAbsoluteUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return 'https://heartland-crm.netlify.app' + (url.startsWith('/') ? '' : '/') + url;
}

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  const authError = await requireAuth(event);
  if (authError) return authError;
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  let parsed;
  try { parsed = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  let { id, cust_name, cust_email, address, tier, category, health_score, inspection_date } = parsed;

  // ── NARRATIVE PRE-FLIGHT CHECK ──
  if (id) {
    try {
      const sb2 = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data: narratives } = await sb2.from('inspection_narratives').select('section_id, status').eq('record_id', id);
      if (narratives && narratives.length > 0) {
        const draftSections = narratives.filter(function (n) { return n.status === 'draft'; });
        if (draftSections.length > 0) {
          return { statusCode: 402, headers, body: JSON.stringify({ error: 'Narratives not approved — cannot deliver report.', draft_count: draftSections.length }) };
        }
      }
    } catch (e) { console.error('Narrative pre-flight error (Non-fatal):', e.message); }

    try {
      const sb3 = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data: pendingFindings } = await sb3.from('inspection_findings').select('id').eq('record_id', id).not('narrative', 'is', null).neq('narrative_status', 'approved');
      if (pendingFindings && pendingFindings.length > 0) {
        return { statusCode: 402, headers, body: JSON.stringify({ error: pendingFindings.length + ' finding narrative(s) not yet approved.', draft_count: pendingFindings.length }) };
      }
    } catch (e) { console.error('Per-finding narrative pre-flight error:', e.message); }

    try {
      const sb4 = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data: pendingPhotos } = await sb4.from('inspection_finding_photos').select('id').eq('record_id', id).not('narrative', 'is', null).neq('narrative_status', 'approved');
      if (pendingPhotos && pendingPhotos.length > 0) {
        return { statusCode: 402, headers, body: JSON.stringify({ error: pendingPhotos.length + ' photo narrative(s) not yet approved.', draft_count: pendingPhotos.length }) };
      }
    } catch (e) { console.error('Photo narrative pre-flight error:', e.message); }
  }

  // If only id was passed (resend from admin), look up the record
  if (id && !cust_email) {
    try {
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data: rec } = await sb.from('inspection_records').select('*').eq('id', id).single();
      if (rec) {
        cust_name       = rec.cust_name;
        cust_email      = rec.cust_email;
        address         = rec.address;
        tier            = rec.tier;
        category        = rec.category;
        health_score    = rec.health_score;
        inspection_date = rec.inspection_date;
      }
    } catch(e) { console.error('Record lookup error:', e); }
  }

  if (!cust_email || !id) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing email or id' }) };
  }

  var reportUrl = ensureAbsoluteUrl(SITE_URL + '/report.html?id=' + id);
  var firstName = (cust_name || 'there').split(' ')[0];
  var dateStr = inspection_date
    ? new Date(inspection_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  var tplVars = { client_name: cust_name || '', address: address || '', date: dateStr };
  var tpl = await resolveTemplate('report_delivery', { subject: 'Your Inspection Report is Ready — {{address}}', body: 'Your inspection report is ready. All findings, inspector notes, and photos are available to view online.' }, tplVars);

  var bodyHtml = ''
    + '<div style="padding:32px 40px 8px;">'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:16px;color:#1a2530;margin:0 0 12px;">Hi ' + esc(firstName) + ',</p>'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#4a5568;line-height:1.7;margin:0 0 24px;">' + esc(tpl.body) + '</p>'
    + '</div>'
    + '<div style="padding:0 40px 24px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;">'
    + '<tr><td style="padding:14px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:130px;">Property</td><td style="padding:14px 16px;font-size:14px;color:#1a2530;font-weight:600;border-bottom:1px solid #e5e7eb;">' + esc(address || '') + '</td></tr>'
    + '<tr><td style="padding:14px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Client</td><td style="padding:14px 16px;font-size:14px;color:#1a2530;border-bottom:1px solid #e5e7eb;">' + esc(cust_name || '') + '</td></tr>'
    + (dateStr ? '<tr><td style="padding:14px 16px;font-size:13px;color:#6b7280;">Inspection Date</td><td style="padding:14px 16px;font-size:14px;color:#1a2530;">' + esc(dateStr) + '</td></tr>' : '')
    + '</table>'
    + '</div>'
    + '<div style="padding:0 40px 32px;text-align:center;">'
    + emailBtn(reportUrl, 'View Your Report')
    + '</div>';

  var html = emailWrap({ subtitle: 'Your Inspection Report is Ready' }, bodyHtml);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_NAME + ' <' + FROM_EMAIL + '>', to: [cust_email], bcc: [BCC_EMAIL], subject: tpl.subject, html }),
    });
    let result;
    try { result = await res.json(); } catch { result = {}; }
    if (!res.ok) throw new Error(result.message || 'Resend API error ' + res.status);

    // Update record status to submitted (report delivered)
    if (id) {
      try {
        const sbDelivery = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        await sbDelivery.from('inspection_records').update({ status: 'submitted' }).eq('id', id);
      } catch (e) { console.error('send-report-email: failed to update status to submitted:', e.message); }
    }
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, email_id: result.id }) };
  } catch (err) {
    console.error('send-report-email error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
