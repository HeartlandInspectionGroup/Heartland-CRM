/**
 * Shared branded email template — Heartland Inspection Group
 *
 * Single source of truth for all client-facing email layout.
 * Header: navy #1a2a44, logo, optional subtitle
 * Footer: navy #1a2a44, phone, email, website, social icons
 *
 * Usage:
 *   const { emailWrap, emailBtn, emailInfoTable } = require('./lib/email-template');
 *   const html = emailWrap({ subtitle: 'Inspection Confirmed' }, bodyHtml);
 */

const LOGO_URL  = 'https://i.imgur.com/I1vTiVT.png';
const PHONE     = '(815) 329-8583';
const PHONE_RAW = '8153298583';
const EMAIL_ADDR = 'info@heartlandinspectiongroup.com';
const WEBSITE   = 'https://www.heartlandinspectiongroup.com';
const FB_URL    = 'https://www.facebook.com/heartlandinspectiongroup';
const IG_URL    = 'https://www.instagram.com/heartlandinspectiongroup';
const YT_URL    = 'https://www.youtube.com/@heartlandinspectiongroup';

const HEADER_BG  = '#1a2a44';
const FOOTER_BG  = '#1a2a44';
const OUTER_BG   = '#f0f2f5';
const GREEN      = '#27ae60';
const NAVY       = '#1a2a44';

/**
 * Wraps body HTML in the full branded email shell.
 * @param {object} opts
 *   opts.subtitle  — small text under logo (e.g. "Inspection Confirmed")
 *   opts.preheader — hidden preheader text (optional)
 * @param {string} bodyHtml — the middle content section
 */
function emailWrap(opts, bodyHtml) {
  const subtitle  = opts.subtitle  || 'Heartland Inspection Group';
  const preheader = opts.preheader || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subtitle)}</title>
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>` : ''}
</head>
<body style="margin:0;padding:0;background:${OUTER_BG};font-family:'Segoe UI',Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:${OUTER_BG};padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

  <!-- HEADER -->
  <tr><td style="background:${HEADER_BG};border-radius:14px 14px 0 0;padding:32px 40px;text-align:center;">
    <img src="${LOGO_URL}" width="170" alt="Heartland Inspection Group"
         style="display:block;margin:0 auto 18px;background:${HEADER_BG};border-radius:4px;">
    <div style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;
                color:rgba(255,255,255,0.45);font-family:'Segoe UI',Arial,sans-serif;">
      ${esc(subtitle)}
    </div>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:#ffffff;">
    ${bodyHtml}
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:${FOOTER_BG};border-radius:0 0 14px 14px;padding:28px 40px;text-align:center;">
    <img src="${LOGO_URL}" width="130" alt="Heartland Inspection Group"
         style="display:block;margin:0 auto 16px;opacity:0.75;background:${FOOTER_BG};border-radius:4px;">
    <p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;
              color:rgba(255,255,255,0.45);">Heartland Inspection Group &nbsp;·&nbsp; Roscoe, IL 61073</p>
    <p style="margin:0 0 14px;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;">
      <a href="tel:${PHONE_RAW}" style="color:#fff;text-decoration:none;font-weight:700;">${PHONE}</a>
      &nbsp;&nbsp;·&nbsp;&nbsp;
      <a href="mailto:${EMAIL_ADDR}" style="color:${GREEN};text-decoration:none;">${EMAIL_ADDR}</a>
    </p>
    <p style="margin:0 0 16px;">
      <a href="${WEBSITE}" style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;
                                   color:rgba(255,255,255,0.35);text-decoration:none;">
        www.heartlandinspectiongroup.com
      </a>
    </p>
    <!-- Social icons -->
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="padding:0 10px;">
          <a href="${FB_URL}" target="_blank">
            <img src="https://s.magecdn.com/social/tc-facebook.svg" width="28" height="28"
                 alt="Facebook" style="display:block;border:0;">
          </a>
        </td>
        <td style="padding:0 10px;">
          <a href="${IG_URL}" target="_blank">
            <img src="https://s.magecdn.com/social/tc-instagram.svg" width="28" height="28"
                 alt="Instagram" style="display:block;border:0;">
          </a>
        </td>
        <td style="padding:0 10px;">
          <a href="${YT_URL}" target="_blank">
            <img src="https://s.magecdn.com/social/tc-youtube.svg" width="28" height="28"
                 alt="YouTube" style="display:block;border:0;">
          </a>
        </td>
      </tr>
    </table>
  </td></tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

/**
 * Renders a full-width CTA button.
 * @param {string} url
 * @param {string} label
 * @param {string} color  — defaults to green
 */
function emailBtn(url, label, color) {
  const bg = color || GREEN;
  return `<table cellpadding="0" cellspacing="0" style="margin:0 auto;">
  <tr><td style="background:${bg};border-radius:8px;padding:14px 36px;text-align:center;">
    <a href="${url}" style="font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:700;
                             color:#ffffff;text-decoration:none;display:block;letter-spacing:0.5px;">
      ${label}
    </a>
  </td></tr>
</table>`;
}

/**
 * Renders a shaded info table (property / date / time etc).
 * @param {Array<{label, value, highlight}>} rows
 */
function emailInfoTable(rows) {
  const rowHtml = rows.map(function(r, i) {
    const topBorder = i > 0 ? 'border-top:1px solid #e5e7eb;' : '';
    const valColor  = r.highlight ? GREEN : '#1a2530';
    const valWeight = r.highlight ? '700' : '400';
    const valStyle  = r.strikethrough ? 'text-decoration:line-through;color:#9ca3af;' : `color:${valColor};font-weight:${valWeight};`;
    return `<tr${i % 2 === 0 ? '' : ' style="background:#f8fafc;"'}>
      <td style="padding:11px 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;
                 color:#6b7280;width:130px;${topBorder}">${esc(r.label)}</td>
      <td style="padding:11px 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;
                 ${topBorder}${valStyle}">${r.value}</td>
    </tr>`;
  }).join('');

  return `<table width="100%" cellpadding="0" cellspacing="0"
          style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;
                 overflow:hidden;margin:20px 0;">
  ${rowHtml}
</table>`;
}

/** Simple HTML escape */
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = { emailWrap, emailBtn, emailInfoTable, esc, GREEN, NAVY };
