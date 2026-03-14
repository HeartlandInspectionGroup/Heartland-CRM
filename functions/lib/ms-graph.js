/**
 * Shared email helper — previously used Microsoft Graph API, now uses Resend.
 * Drop-in replacement: same function signatures, same exports.
 * All functions using sendEmail() and hasCredentials() work unchanged.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL     = 'no-reply@heartlandinspectiongroup.com';
const FROM_NAME      = 'Heartland Inspection Group';

/**
 * Send an email via Resend.
 * @param {Object} opts
 * @param {string} opts.to       - Recipient email address
 * @param {string} opts.toName   - Recipient display name (unused by Resend but kept for compat)
 * @param {string} opts.subject  - Email subject
 * @param {string} opts.htmlBody - HTML email content
 */
async function sendEmail({ to, toName, subject, htmlBody }) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + RESEND_API_KEY,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    FROM_NAME + ' <' + FROM_EMAIL + '>',
      to:      [to],
      subject: subject,
      html:    htmlBody,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Resend API error (' + res.status + '): ' + err);
  }

  return true;
}

function hasCredentials() {
  return !!RESEND_API_KEY;
}

// Kept for any legacy imports — no-op since we no longer need Azure tokens here
async function getAccessToken() {
  throw new Error('getAccessToken() is deprecated — use Resend for email, Azure only for calendar writes');
}

module.exports = { getAccessToken, sendEmail, hasCredentials };
