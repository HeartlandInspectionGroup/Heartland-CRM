const { createClient } = require('@supabase/supabase-js');
const { emailWrap } = require('./lib/email-template');
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL     = 'no-reply@heartlandinspectiongroup.com';
const FROM_NAME      = 'Heartland Inspection Group';
const SITE_URL = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';
const BCC_EMAIL      = 'jake@heartlandinspectiongroup.com';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const EMAIL_FOOTER = `
  <tr><td style="background:#1a2a44;border-radius:0 0 12px 12px;padding:32px 40px;text-align:center;">
    <img src="https://i.imgur.com/I1vTiVT.png" width="130" alt="Heartland Inspection Group" style="display:block;margin:0 auto 18px;opacity:0.8;background:#1a2a44;border-radius:4px;">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="text-align:center;padding-bottom:8px;">
          <a href="tel:8153298583" style="text-decoration:none;font-family:'Barlow Condensed',Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:1.5px;color:rgba(255,255,255,0.85);">(815) 329-8583</a>
        </td>
      </tr>
      <tr>
        <td style="text-align:center;padding-bottom:8px;">
          <a href="mailto:info@heartlandinspectiongroup.com" style="text-decoration:none;font-size:13px;color:#27ae60;">info@heartlandinspectiongroup.com</a>
        </td>
      </tr>
      <tr>
        <td style="text-align:center;padding-bottom:20px;">
          <a href="https://www.heartlandinspectiongroup.com" target="_blank" style="text-decoration:none;font-size:13px;color:rgba(255,255,255,0.5);">www.heartlandinspectiongroup.com</a>
        </td>
      </tr>
      <tr>
        <td style="text-align:center;padding-bottom:20px;">
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
              <td style="padding:0 12px;">
                <a href="https://www.facebook.com/heartlandinspectiongroup" target="_blank" style="text-decoration:none;">
                  <img src="https://s.magecdn.com/social/tc-facebook.svg" width="32" height="32" alt="Facebook" style="display:block;border:0;">
                </a>
              </td>
              <td style="padding:0 12px;">
                <a href="https://www.instagram.com/heartlandinspectiongroup" target="_blank" style="text-decoration:none;">
                  <img src="https://s.magecdn.com/social/tc-instagram.svg" width="32" height="32" alt="Instagram" style="display:block;border:0;">
                </a>
              </td>
              <td style="padding:0 12px;">
                <a href="https://www.youtube.com/@heartlandinspectiongroup" target="_blank" style="text-decoration:none;">
                  <img src="https://s.magecdn.com/social/tc-youtube.svg" width="32" height="32" alt="YouTube" style="display:block;border:0;">
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td></tr>`;

const TIER_COLORS = {
  Standard:  { bg: '#e8f5e9', text: '#27ae60' },
  Premium:   { bg: '#e3f2fd', text: '#1565c0' },
  Signature: { bg: '#fce4ec', text: '#c62828' },
};

function scoreColor(n) {
  if (isNaN(n)) return '#888';
  return n >= 75 ? '#27ae60' : n >= 50 ? '#e67e22' : '#e74c3c';
}
function scoreGrade(n) {
  if (isNaN(n)) return '';
  return n >= 90 ? 'A' : n >= 75 ? 'B' : n >= 60 ? 'C' : n >= 45 ? 'D' : 'F';
}
function scoreBlurb(n) {
  if (n >= 75) return 'Your home is in good overall condition. Systems are functioning well.';
  if (n >= 50) return 'Your home has some areas that need attention in the near future.';
  return 'Your home has systems that require prompt attention or repair.';
}

function buildReportHtml({ reportUrl, invoiceUrl, portalUrl, firstName, dateStr, tier, address, category, scoreNum, scoreText, gradeText }) {
  const tc    = TIER_COLORS[tier] || TIER_COLORS.Standard;
  const sc    = scoreColor(scoreNum);
  const isSignature = tier === 'Signature';
  const isSewerScope = category === 'addon' && tier === 'Sewer Scope';

  // Subject / title by category
  const ADDON_NAMES = { Radon:'Radon Testing', 'Sewer Scope':'Sewer Scope', Mold:'Mold / Air Quality',
    'Water Quality':'Water Quality Testing', Thermal:'Thermal Imaging', WDO:'WDO / Termite Inspection' };
  const CAT_TITLES = {
    home_inspection: `Home Inspection — ${tier}`,
    new_construction: `New Construction — ${tier}`,
    addon: ADDON_NAMES[tier] || tier,
    bundle_addon: ADDON_NAMES[tier] || tier,
    home_health_check: `Home Health Check — ${tier || 'Standard'}`
  };
  const reportTitle = CAT_TITLES[category] || `${tier || 'Standard'} Inspection`;

  // Intro body copy
  let introCopy = `Your Heartland Home Health inspection is complete. Your full report — including system conditions, inspector notes, photos, and ${isSignature ? 'your 36-month maintenance roadmap' : 'recommendations'} — is ready to view online.`;
  if (category === 'home_inspection') {
    introCopy = `Your ${tier} home inspection is complete. Your full report — including all findings, inspector notes, and photos — is ready to view online.`;
  } else if (category === 'new_construction') {
    introCopy = `Your New Construction ${tier} inspection is complete. Your full report is ready to view online.`;
  } else if (category === 'addon' || category === 'bundle_addon') {
    introCopy = `Your ${ADDON_NAMES[tier] || tier} results are ready. Your full report is ready to view online.`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Inspection Report is Ready</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

  <tr><td style="background:#1a2a44;border-radius:12px 12px 0 0;padding:36px 40px 32px;text-align:center;">
    <img src="https://i.imgur.com/I1vTiVT.png" width="180" alt="Heartland Inspection Group" style="margin:0 auto 20px;display:block;background:#1a2a44;border-radius:4px;">
    <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:0.5px;margin-bottom:8px;">Your Inspection Report is Ready</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.55);margin-bottom:16px;">
      ${dateStr ? `Inspection completed ${dateStr}` : 'Inspection complete'}
    </div>
    <span style="display:inline-block;background:${tc.bg};color:${tc.text};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:5px 16px;border-radius:20px;">
      ${reportTitle}
    </span>
  </td></tr>

  <tr><td style="background:#fff;padding:24px 40px;border-left:4px solid #27ae60;">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#27ae60;margin-bottom:4px;">Property</div>
    <div style="font-size:18px;font-weight:700;color:#1a2a44;">${address || ''}</div>
  </td></tr>

  <tr><td style="background:#fff;padding:8px 40px 24px;border-bottom:1px solid #f0f0f0;">
    <p style="font-size:15px;color:#444;line-height:1.7;margin:0;">
      Hi ${firstName},<br><br>
      ${introCopy}
    </p>
  </td></tr>

  ${scoreText ? `
  <tr><td style="background:#fff;padding:24px 40px;border-bottom:1px solid #f0f0f0;">
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="text-align:center;width:110px;">
        <div style="width:90px;height:90px;border-radius:50%;border:4px solid ${sc};background:${sc}18;display:inline-flex;align-items:center;justify-content:center;flex-direction:column;margin:0 auto;">
          <div style="font-size:30px;font-weight:900;color:${sc};line-height:1;">${scoreText}</div>
          ${gradeText ? `<div style="font-size:12px;font-weight:700;color:${sc};">Grade ${gradeText}</div>` : ''}
        </div>
      </td>
      <td style="padding-left:20px;">
        <div style="font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1a2a44;margin-bottom:6px;">Home Health Score</div>
        <div style="font-size:13px;color:#666;line-height:1.6;">${scoreBlurb(scoreNum)}</div>
      </td>
    </tr>
    </table>
  </td></tr>
  ` : ''}

  ${isSewerScope ? `
  <tr><td style="background:#fff3cd;padding:16px 40px;border-left:4px solid #e67e22;border-bottom:1px solid #f0f0f0;">
    <div style="font-size:13px;color:#7d4e00;line-height:1.6;">
      <strong>📹 Sewer Scope Video:</strong> Your inspection video will be available in your client portal once it has been processed. You'll find it waiting for you when you log in.
    </div>
  </td></tr>
  ` : ''}

  <tr><td style="background:#fff;padding:32px 40px;text-align:center;">
    <div style="font-size:15px;color:#444;line-height:1.7;margin-bottom:8px;">Your report and invoice are ready and waiting in your client portal.</div>
    <div style="font-size:13px;color:#888;margin-bottom:28px;">Your portal is your home base — no login needed, just click your link.</div>
    <a href="${portalUrl}" style="display:inline-block;background:#27ae60;color:#fff;font-size:15px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-decoration:none;padding:16px 40px;border-radius:8px;">🏠 Go to My Portal</a>
  </td></tr>

  <tr><td style="background:#f8f9fb;padding:24px 40px;border-top:1px solid #eee;border-bottom:1px solid #eee;">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#aaa;margin-bottom:14px;">What's in your report</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:50%;padding:6px 0;font-size:13px;color:#444;">✅ &nbsp;System conditions</td>
        <td style="width:50%;padding:6px 0;font-size:13px;color:#444;">📸 &nbsp;Inspection photos</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#444;">🔧 &nbsp;Equipment details</td>
        <td style="padding:6px 0;font-size:13px;color:#444;">💡 &nbsp;Inspector notes</td>
      </tr>
      ${isSignature ? '<tr><td colspan="2" style="padding:6px 0;font-size:13px;color:#444;">📅 &nbsp;36-month maintenance roadmap</td></tr>' : ''}
      ${isSewerScope ? '<tr><td colspan="2" style="padding:6px 0;font-size:13px;color:#444;">🎥 &nbsp;Sewer scope video (available in portal once processed)</td></tr>' : ''}
    </table>
  </td></tr>

${EMAIL_FOOTER}

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildInvoiceHtml({ invoiceUrl, firstName, address }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="background:#1a2a44;border-radius:12px 12px 0 0;padding:36px 40px 28px;text-align:center;">
    <img src="https://i.imgur.com/I1vTiVT.png" width="160" alt="Heartland Inspection Group" style="margin:0 auto 16px;display:block;background:#1a2a44;border-radius:4px;">
    <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px;">Your Invoice is Ready</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.5);">${address || ''}</div>
  </td></tr>
  <tr><td style="background:#fff;padding:32px 40px;text-align:center;">
    <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 28px;">
      Hi ${firstName},<br><br>
      Your Heartland Inspection Group invoice is ready. You can view and print it at any time using the link below.
    </p>
    <a href="${invoiceUrl}" style="display:inline-block;background:#1a2a44;color:#fff;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-decoration:none;padding:15px 32px;border-radius:8px;">🧾 View Invoice</a>
  </td></tr>
${EMAIL_FOOTER}
</table>
</td></tr>
</table>
</body>
</html>`;
}

exports.handler = async (event) => {

  // ── AUTH CHECK ──
  const adminToken = process.env.ADMIN_TOKEN;
  if (event.httpMethod !== 'OPTIONS' && event.headers['x-admin-token'] !== adminToken) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let parsed;
  try {
    parsed = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  let { id, cust_name, cust_email, address, tier, category, health_score, inspection_date, payment_method, invoice_only } = parsed;

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
        health_score    = rec.form_data?.health_score || '';
        inspection_date = rec.form_data?.inspection_date || '';
        payment_method  = rec.payment_method;
      }
    } catch(e) { console.error('Record lookup error:', e); }
  }

  if (!cust_email || !id) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing email or id' }) };
  }

  const reportUrl  = `${SITE_URL}/report.html?id=${id}`;
  const invoiceUrl = `${SITE_URL}/invoice-receipt.html?id=${id}`;

  // Look up portal token — upsert if missing so link always works
  let portalUrl = `${SITE_URL}/client-portal.html`;
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbHeaders = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
    // Try existing token first
    const tokRes  = await fetch(SUPABASE_URL + '/rest/v1/client_portal_tokens?client_email=eq.' + encodeURIComponent(cust_email) + '&select=token&limit=1', { headers: sbHeaders });
    const tokRows = await tokRes.json();
    let token = tokRows && tokRows[0] && tokRows[0].token;
    if (!token) {
      // No token exists — generate and insert a fresh one
      token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
      await fetch(SUPABASE_URL + '/rest/v1/client_portal_tokens', {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ token, client_email: cust_email, client_name: cust_name || '', booking_id: null }),
      });
      console.log('send-report-email: generated fresh portal token for', cust_email);
    }
    portalUrl = `${SITE_URL}/client-portal.html?token=${token}`;
  } catch(e) { console.error('Portal token lookup/upsert failed:', e); }
  const firstName  = (cust_name || 'there').split(' ')[0];
  const dateStr    = inspection_date
    ? new Date(inspection_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const scoreNum   = parseInt(health_score, 10);
  const scoreText  = isNaN(scoreNum) ? '' : `${scoreNum}`;
  const gradeText  = scoreGrade(scoreNum);

  try {
    let subject, html;

    if (invoice_only) {
      subject = `Your Invoice — ${address || 'Heartland Inspection Group'}`;
      html    = buildInvoiceHtml({ invoiceUrl, firstName, address });
    } else {
      subject = `Your Inspection Report is Ready — ${address || 'Inspection Complete'}`;
      html    = buildReportHtml({ reportUrl, invoiceUrl, portalUrl, firstName, dateStr, tier, address, category, scoreNum, scoreText, gradeText });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `${FROM_NAME} <${FROM_EMAIL}>`,
        to:      [cust_email],
        bcc:     [BCC_EMAIL],
        subject,
        html,
      }),
    });

    let result;
    try { result = await res.json(); } catch { result = {}; }

    if (!res.ok) {
      throw new Error(result.message || `Resend API error ${res.status}`);
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, email_id: result.id }) };

  } catch (err) {
    console.error('send-report-email error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
