/**
 * Netlify Function: send-agent-portal-link
 *
 * Looks up an agent by ID, then emails them their permanent portal link.
 *
 * POST body: { agent_id }
 * Headers:   x-admin-token required
 */

const { createClient } = require('@supabase/supabase-js');
const { sendEmail, hasCredentials } = require('./lib/ms-graph');
const { emailWrap, emailBtn, esc } = require('./lib/email-template');

const SITE_URL = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
};

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function buildAgentPortalEmail(firstName, portalUrl) {
  var body = ''
    + '<div style="padding:32px 40px 8px;">'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#4a5568;line-height:1.7;margin:0 0 20px;">'
    + 'Hi ' + esc(firstName) + ',<br><br>'
    + 'Your Heartland Inspection Group agent portal is ready. Use the link below to access your portal anytime — it\'s permanent and never changes, so you can bookmark it.'
    + '</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;border-radius:10px;padding:14px 20px;margin-bottom:24px;">'
    + '<tr><td>'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#8a9ab0;margin:0 0 6px;">Your portal link</p>'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:13px;color:#1a2a44;margin:0;word-break:break-all;">' + esc(portalUrl) + '</p>'
    + '</td></tr>'
    + '</table>'
    + '</div>'
    + '<div style="padding:0 40px;text-align:center;">'
    + emailBtn(portalUrl, 'Open My Agent Portal \u2192')
    + '</div>'
    + '<div style="padding:20px 40px 32px;">'
    + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:13px;color:#8a9ab0;line-height:1.6;margin:0;">'
    + 'Through your portal you can submit inspection requests for your clients, track scheduled inspections, view completed reports, and more.<br><br>'
    + 'Questions? Give us a call anytime.'
    + '</p>'
    + '</div>';

  return emailWrap({ subtitle: 'Agent Portal Access' }, body);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (event.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { agent_id } = body;
  if (!agent_id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'agent_id required' }) };

  const sb = getSupabase();

  try {
    const { data: agent, error } = await sb
      .from('agents')
      .select('id, name, email, company, portal_token, role')
      .eq('id', agent_id)
      .eq('role', 'agent')
      .single();

    if (error || !agent) {
      return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Agent not found' }) };
    }
    if (!agent.portal_token) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Agent has no portal token. Please edit and re-save the agent.' }) };
    }
    if (!agent.email) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Agent has no email address.' }) };
    }

    const portalUrl = `${SITE_URL}/agent-portal.html?token=${agent.portal_token}`;
    const firstName = (agent.name || 'there').split(' ')[0];

    if (!hasCredentials()) {
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Email not configured on server.' }) };
    }

    await sendEmail({
      to:       agent.email,
      toName:   agent.name || '',
      subject:  'Your Heartland Inspection Group Agent Portal',
      htmlBody: buildAgentPortalEmail(firstName, portalUrl),
    });

    console.log('[send-agent-portal-link] Sent to', agent.email, 'portal:', portalUrl);
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error('[send-agent-portal-link] error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
