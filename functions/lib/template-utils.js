/**
 * Email template utilities — shared across all email-sending functions.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Replace {{variable}} placeholders with values from vars object.
 */
function substituteVars(template, vars) {
  if (!template || !vars) return template || '';
  return template.replace(/\{\{(\w+)\}\}/g, function(match, key) {
    return vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : match;
  });
}

/**
 * Fetch email template from DB by key. Returns { subject, body } or null.
 */
async function getTemplate(templateKey) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !templateKey) return null;
  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/email_templates?template_key=eq.' + encodeURIComponent(templateKey) + '&select=subject,body&limit=1', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    if (!res.ok) return null;
    var rows = await res.json();
    return (rows && rows[0]) ? { subject: rows[0].subject, body: rows[0].body } : null;
  } catch (e) {
    console.error('[template-utils] getTemplate error:', e.message);
    return null;
  }
}

/**
 * Get subject and body for a template key, with fallback defaults.
 * Substitutes merge variables into both subject and body.
 */
async function resolveTemplate(templateKey, defaults, vars) {
  var tpl = await getTemplate(templateKey);
  var subject = (tpl ? tpl.subject : defaults.subject) || defaults.subject;
  var body = (tpl ? tpl.body : defaults.body) || defaults.body;
  return {
    subject: substituteVars(subject, vars),
    body: substituteVars(body, vars),
  };
}

module.exports = { substituteVars, getTemplate, resolveTemplate };
