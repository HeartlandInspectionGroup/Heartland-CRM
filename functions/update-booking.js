/**
 * Netlify Function: update-booking
 *
 * Handles client-initiated reschedule and cancellation requests.
 * Sends notification emails to both the client and jake@heartlandinspectiongroup.com.
 *
 * POST body: { action: "reschedule"|"cancel", booking_id, client_email,
 *              new_date?, new_time?, reason? }
 */

const { createClient } = require('@supabase/supabase-js');
const { sendEmail, hasCredentials } = require('./lib/ms-graph');
const { resolveTemplate } = require('./lib/template-utils');
const { emailWrap, emailInfoTable, esc } = require('./lib/email-template');

const { corsHeaders } = require('./lib/cors');

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

function bodyPad(html) {
  return '<div style="padding:32px 40px;">' + html + '</div>';
}

exports.handler = async function (event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const sb = getSupabase();
  if (!sb) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database not configured' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action, booking_id, client_email, new_date, new_time, reason } = body;

  if (!action || !booking_id || !client_email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
  }
  if (action !== 'reschedule' && action !== 'cancel') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };
  }

  try {
    const { data: booking, error: bErr } = await sb.from('bookings').select('*').eq('id', booking_id).single();
    if (bErr || !booking) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Booking not found' }) };

    const clientName  = booking.client_name  || 'Client';
    const clientEmail = booking.client_email || client_email || null;
    const firstName   = clientName.split(' ')[0];

    if (action === 'cancel') {
      await sb.from('bookings').update({ status: 'cancelled' }).eq('id', booking_id);
      await sb.from('inspection_records').update({ status: 'cancelled' }).eq('booking_id', booking_id);

      if (hasCredentials()) {
        // Email to client
        if (clientEmail) {
          var cancelRows = [
            { label: 'Property',      value: esc(booking.property_address) },
            { label: 'Original Date', value: esc(formatDate(booking.preferred_date) + (booking.preferred_time ? ' at ' + booking.preferred_time : '')) },
          ];
          var clientBody = bodyPad(''
            + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#333;line-height:1.6;margin:0 0 16px;">Hi ' + esc(firstName) + ',</p>'
            + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#333;line-height:1.6;margin:0 0 4px;">Your inspection has been <strong>cancelled</strong> as requested.</p>'
            + emailInfoTable(cancelRows)
            + (reason ? '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:14px;color:#666;margin:0 0 16px;"><strong>Reason:</strong> ' + esc(reason) + '</p>' : '')
            + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:14px;color:#6b7280;margin:0;">If you\'d like to reschedule, please contact us or book a new appointment.</p>'
          );
          await sendEmail({
            to:       clientEmail,
            toName:   clientName,
            subject:  'Inspection Cancelled \u2014 Heartland Inspection Group',
            htmlBody: emailWrap({ subtitle: 'Inspection Cancelled' }, clientBody),
          });
        }

        // Internal alert to Jake (minimal, intentionally different style)
        var adminHtml = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f7f9;">'
          + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f9;padding:32px 0;"><tr><td align="center">'
          + '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">'
          + '<tr><td style="background:#1a2a44;padding:20px 32px;">'
          + '<h1 style="margin:0;font-family:sans-serif;font-size:18px;font-weight:700;color:#fff;">\u274c Booking Cancelled</h1>'
          + '</td></tr>'
          + '<tr><td style="padding:28px 32px;font-family:sans-serif;">'
          + '<p style="font-size:15px;color:#1a2530;margin:0 0 16px;"><strong>' + esc(clientName) + '</strong> has cancelled their inspection.</p>'
          + '<table style="background:#f0f6f9;border-radius:8px;padding:16px 20px;width:100%;margin-bottom:20px;" cellpadding="0" cellspacing="0">'
          + '<tr><td style="font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;width:120px;">Client</td><td style="font-size:14px;color:#1a2530;">' + esc(clientName) + ' (' + esc(clientEmail || '—') + ')</td></tr>'
          + '<tr><td style="font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;">Property</td><td style="font-size:14px;color:#1a2530;font-weight:600;">' + esc(booking.property_address) + '</td></tr>'
          + '<tr><td style="font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;">Date</td><td style="font-size:14px;color:#1a2530;">' + esc(formatDate(booking.preferred_date)) + '</td></tr>'
          + '</table>'
          + (reason ? '<p style="font-size:14px;color:#666;margin:0 0 16px;"><strong>Reason:</strong> ' + esc(reason) + '</p>' : '')
          + '</td></tr></table></td></tr></table></body></html>';

        await sendEmail({
          to: 'jake@heartlandinspectiongroup.com',
          toName: 'Heartland Inspection Group',
          subject: 'Booking Cancelled \u2014 ' + clientName,
          htmlBody: adminHtml,
        });
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, action: 'cancelled' }) };
    }

    if (action === 'reschedule') {
      if (!new_date) return { statusCode: 400, headers, body: JSON.stringify({ error: 'new_date is required for reschedule' }) };

      const oldDate = booking.preferred_date;
      const oldTime = booking.preferred_time;

      const updates = { preferred_date: new_date, status: 'pending' };
      if (new_time) updates.preferred_time = new_time;
      await sb.from('bookings').update(updates).eq('id', booking_id);
      await sb.from('inspection_records').update({ inspection_date: new_date }).eq('booking_id', booking_id);

      if (hasCredentials()) {
        const newTimeStr = new_time ? ' at ' + new_time : (oldTime ? ' at ' + oldTime : '');

        if (clientEmail) {
          var reschedRows = [
            { label: 'Property',      value: esc(booking.property_address) },
            { label: 'Previous Date', value: esc(formatDate(oldDate) + (oldTime ? ' at ' + oldTime : '')), strikethrough: true },
            { label: 'New Date',      value: esc(formatDate(new_date) + newTimeStr), highlight: true },
          ];
          var clientBody2 = bodyPad(''
            + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#333;line-height:1.6;margin:0 0 16px;">Hi ' + esc(firstName) + ',</p>'
            + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#333;line-height:1.6;margin:0 0 4px;">Your inspection has been <strong>rescheduled</strong> as requested.</p>'
            + emailInfoTable(reschedRows)
            + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:14px;color:#6b7280;margin:0;">If you have any questions, please don\'t hesitate to contact us.</p>'
          );
          var rsTpl = await resolveTemplate('reschedule_client', { subject: 'Inspection Rescheduled \u2014 Heartland Inspection Group', body: '' }, { client_name: clientName || '', address: '', old_date: '', new_date: '' });
          await sendEmail({
            to:       clientEmail,
            toName:   clientName,
            subject:  rsTpl.subject,
            htmlBody: emailWrap({ subtitle: 'Inspection Rescheduled' }, clientBody2),
          });
        }

        // Internal alert to Jake
        var adminHtml2 = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f7f9;">'
          + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f9;padding:32px 0;"><tr><td align="center">'
          + '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">'
          + '<tr><td style="background:#1a2a44;padding:20px 32px;">'
          + '<h1 style="margin:0;font-family:sans-serif;font-size:18px;font-weight:700;color:#fff;">\u23f0 Reschedule Request</h1>'
          + '</td></tr>'
          + '<tr><td style="padding:28px 32px;font-family:sans-serif;">'
          + '<p style="font-size:15px;color:#1a2530;margin:0 0 16px;"><strong>' + esc(clientName) + '</strong> has rescheduled their inspection.</p>'
          + '<table style="background:#f0f6f9;border-radius:8px;padding:16px 20px;width:100%;margin-bottom:20px;" cellpadding="0" cellspacing="0">'
          + '<tr><td style="font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;width:120px;">Client</td><td style="font-size:14px;color:#1a2530;">' + esc(clientName) + ' (' + esc(clientEmail || '—') + ')</td></tr>'
          + '<tr><td style="font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;">Property</td><td style="font-size:14px;color:#1a2530;font-weight:600;">' + esc(booking.property_address) + '</td></tr>'
          + '<tr><td style="font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;">Previous</td><td style="font-size:14px;color:#999;text-decoration:line-through;">' + esc(formatDate(oldDate) + (oldTime ? ' at ' + oldTime : '')) + '</td></tr>'
          + '<tr><td style="font-size:13px;color:#6b7d8a;padding:3px 16px 3px 0;">New</td><td style="font-size:14px;color:#27ae60;font-weight:700;">' + esc(formatDate(new_date) + newTimeStr) + '</td></tr>'
          + '</table>'
          + '</td></tr></table></td></tr></table></body></html>';

        await sendEmail({
          to: 'jake@heartlandinspectiongroup.com',
          toName: 'Heartland Inspection Group',
          subject: 'Inspection Rescheduled \u2014 ' + clientName,
          htmlBody: adminHtml2,
        });
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, action: 'rescheduled', new_date, new_time: new_time || oldTime }) };
    }
  } catch (err) {
    console.error('[update-booking] Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
