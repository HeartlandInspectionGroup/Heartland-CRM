/**
 * Netlify Scheduled Function: check-agreement-reminders
 *
 * Runs hourly via cron (0 * * * *). Checks for scheduled inspections
 * within 48hr and 24hr windows where agreements are unsigned.
 * Sends reminder emails and logs to agreement_reminder_log.
 */

const { emailWrap, emailBtn, emailInfoTable, esc } = require('./lib/email-template');
const { resolveTemplate } = require('./lib/template-utils');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL       = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';
const FROM_EMAIL     = 'no-reply@heartlandinspectiongroup.com';
const FROM_NAME      = 'Heartland Inspection Group';

function sbHeaders() {
  return { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
}

async function sbGet(path) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: sbHeaders() });
  if (!res.ok) throw new Error('sbGet ' + path + ' HTTP ' + res.status);
  return res.json();
}

async function sbInsert(table, row) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method: 'POST', headers: sbHeaders(), body: JSON.stringify(row),
  });
  return res.ok;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function buildReminderEmail(firstName, address, dateStr, timeStr, portalUrl, reminderType) {
  var urgency = reminderType === '24hr'
    ? 'Your inspection is <strong>tomorrow</strong>. Your agreement must be signed before your inspector arrives.'
    : 'Your inspection is in <strong>2 days</strong>. Please sign your agreement as soon as possible.';

  var bodyHtml = ''
    + '<div style="padding:32px 40px 8px;">'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:16px;color:#1a2530;margin:0 0 12px;">Hi ' + esc(firstName) + ',</p>'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#4a5568;line-height:1.7;margin:0 0 20px;">' + urgency + '</p>'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#4a5568;line-height:1.7;margin:0 0 24px;">Illinois law requires a signed inspection agreement before your inspector can enter the property. Please sign your agreement immediately through your client portal.</p>'
    + emailInfoTable([
      { label: 'Property', value: esc(address) },
      { label: 'Inspection Date', value: esc(dateStr) + (timeStr ? ' at ' + esc(timeStr) : '') },
    ])
    + '</div>'
    + '<div style="padding:0 40px 32px;text-align:center;">'
    + emailBtn(portalUrl, 'Sign Your Agreement')
    + '</div>';

  return emailWrap({ subtitle: 'Agreement Required' }, bodyHtml);
}

async function sendReminder(email, subject, html) {
  if (!RESEND_API_KEY) return false;
  var res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_NAME + ' <' + FROM_EMAIL + '>', to: [email], subject: subject, html: html }),
  });
  return res.ok;
}

exports.handler = async function(event) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[check-agreement-reminders] DB not configured, skipping.');
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true }) };
  }

  var now = new Date();
  var sent48 = 0, sent24 = 0, skipped = 0;

  try {
    // Get all scheduled inspections with unsigned agreements
    var records = await sbGet(
      'inspection_records?status=eq.scheduled&signed_agreement=neq.true' +
      '&select=id,cust_name,cust_email,address,inspection_date,inspection_time,signed_agreements,active_agreements' +
      '&order=inspection_date.asc'
    );

    if (!records || !records.length) {
      console.log('[check-agreement-reminders] No unsigned scheduled records.');
      return { statusCode: 200, body: JSON.stringify({ ok: true, sent48: 0, sent24: 0 }) };
    }

    // Get all existing reminder logs to prevent duplicates
    var recordIds = records.map(function(r) { return r.id; });
    var logs = await sbGet(
      'agreement_reminder_log?inspection_id=in.(' + recordIds.join(',') + ')&select=inspection_id,reminder_type'
    );
    var logMap = {};
    (logs || []).forEach(function(l) { logMap[l.inspection_id + ':' + l.reminder_type] = true; });

    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r.cust_email || !r.inspection_date) continue;

      // Double-check: also skip if signed_agreements >= active_agreements
      if (r.active_agreements && r.signed_agreements >= r.active_agreements) { skipped++; continue; }

      // Calculate hours until inspection
      var inspTime = new Date(r.inspection_date + 'T' + (r.inspection_time ? r.inspection_time.replace(/\s*(AM|PM)/i, ' $1') : '09:00:00'));
      var hoursUntil = (inspTime - now) / (1000 * 60 * 60);

      // Skip past inspections
      if (hoursUntil < 0) continue;

      var reminderType = null;
      if (hoursUntil <= 24 && !logMap[r.id + ':24hr']) {
        reminderType = '24hr';
      } else if (hoursUntil <= 48 && hoursUntil > 24 && !logMap[r.id + ':48hr']) {
        reminderType = '48hr';
      }

      if (!reminderType) { skipped++; continue; }

      // Look up portal token
      var tokens = await sbGet('client_portal_tokens?client_email=eq.' + encodeURIComponent(r.cust_email) + '&select=token&limit=1');
      var token = tokens && tokens[0] && tokens[0].token;
      if (!token) { console.log('[check-agreement-reminders] No portal token for', r.cust_email); skipped++; continue; }

      var portalUrl = SITE_URL + '/client-portal.html?token=' + token;
      var firstName = (r.cust_name || 'there').split(' ')[0];
      var dateStr = fmtDate(r.inspection_date);
      var tplKey = reminderType === '24hr' ? 'agreement_reminder_24hr' : 'agreement_reminder_48hr';
      var tplDefaults = reminderType === '24hr'
        ? { subject: 'Reminder: Agreement Required — Tomorrow\'s Inspection', body: '' }
        : { subject: 'Reminder: Agreement Required Before Your Inspection', body: '' };
      var tplVars = { client_name: r.cust_name || '', address: r.address || '', date: dateStr, time: r.inspection_time || '' };
      var tpl = await resolveTemplate(tplKey, tplDefaults, tplVars);
      var subject = tpl.subject;

      var html = buildReminderEmail(firstName, r.address || '', dateStr, r.inspection_time || '', portalUrl, reminderType);
      var sent = await sendReminder(r.cust_email, subject, html);

      if (sent) {
        await sbInsert('agreement_reminder_log', { inspection_id: r.id, reminder_type: reminderType });
        if (reminderType === '48hr') sent48++; else sent24++;
        console.log('[check-agreement-reminders] Sent ' + reminderType + ' to', r.cust_email.replace(/^(.).*@/, '$1***@'));
      }
    }
  } catch (err) {
    console.error('[check-agreement-reminders] Error:', err.message);
  }

  console.log('[check-agreement-reminders] Done. 48hr:' + sent48 + ' 24hr:' + sent24 + ' skipped:' + skipped);
  return { statusCode: 200, body: JSON.stringify({ ok: true, sent48: sent48, sent24: sent24, skipped: skipped }) };
};
