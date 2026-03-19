/**
 * Netlify Function: confirm-booking-email
 *
 * Called when admin confirms a booking.
 * 1. Creates a placeholder inspection_records row (source of truth for portal)
 * 2. Generates portal token
 * 3. Sends confirmation email
 */

const { createClient } = require('@supabase/supabase-js');
const { corsHeaders } = require('./lib/cors');
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const SITE_URL       = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';

const FROM_EMAIL = 'no-reply@heartlandinspectiongroup.com';
const FROM_NAME  = 'Heartland Inspection Group';

const { requireAuth } = require('./auth');
const crypto = require('crypto');
const { emailWrap, emailBtn, emailInfoTable, esc } = require('./lib/email-template');
const { writeAuditLog } = require('./write-audit-log');
const { resolveTemplate } = require('./lib/template-utils');

// Service-role Supabase client for RLS-protected tables (client_portal_tokens)
var _sb;
function db() {
  if (!_sb) _sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb;
}

async function sbGet(path) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  var text = await res.text();
  try { return JSON.parse(text); } catch(e) { return null; }
}

async function sbPost(path, body) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  });
  var text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch(e) { return { ok: res.ok, status: res.status, data: null }; }
}

async function sbPatch(path, body) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status };
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

function portalFeatureList() {
  return ''
    + '<div style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:13px;color:#4a5568;padding:4px 0;">📋 &nbsp;Sign your Inspection Agreement</div>'
    + '<div style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:13px;color:#4a5568;padding:4px 0;">🧾 &nbsp;View and pay your invoice</div>'
    + '<div style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:13px;color:#4a5568;padding:4px 0;">📄 &nbsp;Access your inspection report when complete</div>'
    + '<div style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:13px;color:#4a5568;padding:4px 0;">📅 &nbsp;Manage your booking</div>';
}

function buildEmail({ firstName, address, date, time, portalUrl, portalOnly }) {
  var dateFormatted = fmtDate(date);

  if (portalOnly) {
    var body = ''
      + '<div style="padding:32px 40px 8px;">'
      + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:16px;color:#1a2530;margin:0 0 12px;">Hi ' + esc(firstName) + ',</p>'
      + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#4a5568;line-height:1.7;margin:0 0 24px;">Here\'s your personal client portal link. Use it to sign agreements, view your invoice, access your report, and manage your booking — no password required.</p>'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf4;border:1.5px solid #27ae60;border-radius:10px;margin-bottom:24px;">'
      + '<tr><td style="padding:16px 20px;">'
      + '<div style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:13px;font-weight:700;color:#1a2530;margin-bottom:10px;">Your portal gives you access to:</div>'
      + portalFeatureList()
      + '</td></tr></table>'
      + '</div>'
      + '<div style="padding:0 40px;text-align:center;">'
      + emailBtn(portalUrl, 'Go to My Portal \u2192')
      + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:11px;color:#9aabb5;margin:10px 0 0;">This link is unique to you — keep it safe. No password required.</p>'
      + '</div><div style="height:32px;"></div>';
    return emailWrap({ subtitle: 'Your Client Portal' }, body);
  }

  var apptRows = [{ label: 'Property', value: esc(address) }, { label: 'Date', value: esc(dateFormatted) }];
  if (time) apptRows.push({ label: 'Time', value: esc(time) });

  var body = ''
    + '<div style="padding:32px 40px 8px;">'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:16px;color:#1a2530;margin:0 0 12px;">Hi ' + esc(firstName) + ',</p>'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#4a5568;line-height:1.7;margin:0;">Great news — your home inspection has been confirmed. Your client portal is your home base for everything related to your inspection.</p>'
    + emailInfoTable(apptRows)
    + '</div>'

    + '<div style="padding:0 40px 20px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f0;border:2px solid #f59321;border-radius:10px;">'
    + '<tr><td style="padding:18px 20px;">'
    + '<span style="font-size:20px;vertical-align:middle;">📋</span>'
    + '<span style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:14px;font-weight:700;color:#1a2530;margin-left:10px;vertical-align:middle;">Action Required — Sign Your Inspection Agreement</span>'
    + '<span style="display:inline-block;background:#f59321;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:8px;vertical-align:middle;">REQUIRED</span>'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:13px;color:#4a5568;line-height:1.7;margin:10px 0 0;">Your Inspection Agreement <strong>must be signed before your inspection can take place.</strong> You\'ll find it waiting in your client portal.</p>'
    + '</td></tr></table>'
    + '</div>'

    + '<div style="padding:0 40px 8px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf4;border:1.5px solid #27ae60;border-radius:10px;margin-bottom:20px;">'
    + '<tr><td style="padding:16px 20px;">'
    + '<div style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:13px;font-weight:700;color:#1a2530;margin-bottom:10px;">Everything is in your portal — no login needed, just click your link:</div>'
    + portalFeatureList()
    + '</td></tr></table>'
    + '</div>'

    + '<div style="padding:0 40px;text-align:center;">'
    + emailBtn(portalUrl, 'Go to My Portal \u2192')
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:11px;color:#9aabb5;margin:10px 0;">This link is unique to you — keep it safe. No password required.</p>'
    + '</div><div style="height:32px;"></div>';

  return emailWrap({ subtitle: 'Inspection Confirmed' }, body);
}

exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  var authError = await requireAuth(event);
  if (authError) return authError;

  if (!RESEND_API_KEY) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'RESEND_API_KEY not set' }) };
  }

  var parsed;
  try { parsed = JSON.parse(event.body || '{}'); }
  catch(e) { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  var { booking_id, inspector_id, inspector_name, category, tier, skip_email, portal_only } = parsed;
  if (!booking_id) return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'booking_id required' }) };

  var rows = await sbGet('bookings?id=eq.' + booking_id + '&select=*');
  var b = rows && rows[0];
  if (!b) return { statusCode: 404, headers: headers, body: JSON.stringify({ error: 'Booking not found' }) };
  if (!b.client_email) return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Booking has no client email' }) };

  var existingRecs = await sbGet('inspection_records?booking_id=eq.' + booking_id + '&select=id');
  var existingRec  = existingRecs && existingRecs[0];

  if (!existingRec) {
    var recPayload = {
      booking_id:             booking_id,
      cust_name:              b.client_name             || '',
      cust_email:             b.client_email            || '',
      cust_phone:             b.client_phone            || '',
      address:                b.property_address        || '',
      client_current_address: b.client_current_address  || null,
      inspection_date:        b.preferred_date          || null,
      inspection_time:        b.preferred_time          || null,
      tier:                   tier                      || b.home_size_tier || null,
      category:               category                  || null,
      final_total:            b.final_total             || 0,
      inspector_id:           inspector_id              || null,
      inspector_name:         inspector_name            || null,
      agent_id:               b.agent_id                || null,
      status:                 'scheduled',
      payment_status:         'unpaid',
      payment_method:         null,
    };
    var recResult = await sbPost('inspection_records', recPayload);
    if (!recResult.ok) {
      return { statusCode: 500, headers: headers, body: JSON.stringify({
        error: 'Failed to create inspection record',
        supabase_status: recResult.status,
        supabase_error: recResult.data,
      })};
    }
  } else {
    if (inspector_id || inspector_name) {
      await sbPatch('inspection_records?booking_id=eq.' + booking_id, {
        inspector_id:    inspector_id      || null,
        inspector_name:  inspector_name    || null,
        inspection_time: b.preferred_time  || null,
        status:          'scheduled',
      });
    }
  }

  var token = null;
  try {
    // Use Supabase JS client (service role) for RLS-protected client_portal_tokens
    var { data: existingTokenRows, error: tokenLookupErr } = await db()
      .from('client_portal_tokens')
      .select('token')
      .eq('client_email', b.client_email)
      .limit(1);

    if (tokenLookupErr) {
      console.error('[confirm-booking-email] Token lookup error:', tokenLookupErr.message);
    }

    if (existingTokenRows && existingTokenRows[0] && existingTokenRows[0].token) {
      token = existingTokenRows[0].token;
      console.log('[confirm-booking-email] Reusing existing portal token for', b.client_email);
    } else {
      token = crypto.randomBytes(32).toString('hex');
      var { error: tokenInsertErr } = await db()
        .from('client_portal_tokens')
        .insert({
          token: token,
          client_email: b.client_email,
          client_name:  b.client_name || '',
          booking_id:   booking_id,
        });

      if (tokenInsertErr) {
        console.error('[confirm-booking-email] client_portal_tokens insert FAILED:', tokenInsertErr.message);
      } else {
        console.log('[confirm-booking-email] Portal token created for', b.client_email);
      }
    }
  } catch(e) {
    console.error('[confirm-booking-email] Token save error:', e.message || e);
    token = crypto.randomBytes(32).toString('hex');
  }

  // ── Set invoice_url on the inspection record so client portal can show it ──
  var recordId = existingRec ? existingRec.id : (recResult && recResult.data && recResult.data[0] ? recResult.data[0].id : null);
  if (recordId) {
    var invoiceUrl = SITE_URL + '/invoice-receipt.html?id=' + recordId;
    var reportUrl  = SITE_URL + '/report.html?id=' + recordId;
    await sbPatch('inspection_records?id=eq.' + recordId, { invoice_url: invoiceUrl, report_url: reportUrl });
    console.log('[confirm-booking-email] Set invoice_url + report_url for record', recordId);
  }

  // ── Create addon records for bundle bookings ──
  var addonRecordIds = [];
  if (!existingRec && b.services && Array.isArray(b.services) && b.services.length > 1) {
    var addonEntries = b.services.slice(1).filter(function(s) { return s && s.id; });
    if (addonEntries.length > 0) {
      var addonPromises = addonEntries.map(function(addon) {
        return sbPost('inspection_records', {
          booking_id:             booking_id,
          parent_record_id:       recordId                  || null,
          cust_name:              b.client_name             || '',
          cust_email:             b.client_email            || '',
          cust_phone:             b.client_phone            || '',
          address:                b.property_address        || '',
          client_current_address: b.client_current_address  || null,
          inspection_date:        b.preferred_date          || null,
          inspection_time:        b.preferred_time          || null,
          tier:                   addon.id,
          category:               'addon',
          is_bundle:              true,
          final_total:            addon.price || 0,
          inspector_id:           inspector_id              || null,
          inspector_name:         inspector_name            || null,
          agent_id:               b.agent_id                || null,
          status:                 'scheduled',
          payment_status:         'unpaid',
          payment_method:         null,
        });
      });
      var addonResults = await Promise.all(addonPromises);

      for (var i = 0; i < addonResults.length; i++) {
        var ar = addonResults[i];
        if (ar.ok && ar.data && ar.data[0]) {
          var addonId = ar.data[0].id;
          addonRecordIds.push(addonId);
          var addonInvoiceUrl = SITE_URL + '/invoice-receipt.html?id=' + addonId;
          var addonReportUrl  = SITE_URL + '/report.html?id=' + addonId;
          await sbPatch('inspection_records?id=eq.' + addonId, { invoice_url: addonInvoiceUrl, report_url: addonReportUrl });
          console.log('[confirm-booking-email] Created addon record', addonId, 'tier=' + addonEntries[i].id);
        } else {
          console.error('[confirm-booking-email] Failed to create addon record for', addonEntries[i].id, ar.status, ar.data);
        }
      }
    }
  }

  await sbPatch('bookings?id=eq.' + booking_id, { status: 'confirmed' });

  var firstName = (b.client_name || 'there').split(' ')[0];
  var portalUrl = SITE_URL + '/client-portal.html?token=' + token;

  if (skip_email) {
    return { statusCode: 200, headers: headers, body: JSON.stringify({ ok: true, portal_url: portalUrl, skip_email: true }) };
  }

  var emailHtml = buildEmail({
    firstName,
    address:    b.property_address || '',
    date:       b.preferred_date   || '',
    time:       b.preferred_time   || '',
    portalUrl,
    portalOnly: !!portal_only,
  });

  try {
    var res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    FROM_NAME + ' <' + FROM_EMAIL + '>',
        to:      [b.client_email],
        bcc:     ['jake@heartlandinspectiongroup.com'],
        subject: portal_only
          ? 'Your Heartland Inspection Group Portal Link'
          : (await resolveTemplate('booking_confirmed', { subject: 'Your Inspection is Confirmed \u2014 {{address}}', body: '' }, { client_name: b.client_name || '', address: b.property_address || '', date: b.preferred_date || '', time: b.preferred_time || '', inspector_name: inspector_name || '' })).subject,
        html:    emailHtml,
      }),
    });

    if (!res.ok) {
      var err = await res.text();
      throw new Error('Resend error: ' + err);
    }

    console.log('[confirm-booking-email] Email sent to', b.client_email);

  } catch(e) {
    console.error('[confirm-booking-email] Email send error:', e.message || e);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: e.message }) };
  }

  // ── Audit log (after email — non-fatal) ──
  try {
    console.log('[confirm-booking-email] Writing audit logs for record_id:', recordId);
    writeAuditLog({ record_id: recordId, action: 'booking.confirmed', category: 'scheduling', actor: 'admin', details: { source: 'confirm_booking', agent_id: b.agent_id || null } });
    writeAuditLog({ record_id: recordId, action: 'agreement.sent',    category: 'agreements',  actor: 'system', details: {} });

    // Audit addon records
    for (var a = 0; a < addonRecordIds.length; a++) {
      writeAuditLog({ record_id: addonRecordIds[a], action: 'booking.confirmed', category: 'scheduling', actor: 'admin', details: { source: 'confirm_booking_addon', parent_record_id: recordId } });
      writeAuditLog({ record_id: addonRecordIds[a], action: 'agreement.sent',    category: 'agreements',  actor: 'system', details: {} });
    }
  } catch(auditErr) {
    console.error('[confirm-booking-email] Audit log write error:', auditErr.message || auditErr);
  }

  return { statusCode: 200, headers: headers, body: JSON.stringify({ success: true }) };
};
