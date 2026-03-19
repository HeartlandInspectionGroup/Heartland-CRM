/**
 * Netlify Function: sign-waiver
 *
 * Captures a client's waiver signature with full audit trail.
 * Uses raw REST fetch - same pattern as get-agreements.js, no createClient dependency.
 *
 * POST /api/sign-waiver
 * Body: { waiver_version_id, client_email, inspection_record_id?, booking_id?,
 *         signed_name, signature_data?, signature_method, checkbox_responses }
 */

const { sendEmail, hasCredentials } = require("./lib/ms-graph");
const { writeAuditLog } = require("./write-audit-log");
const { emailWrap, esc: escHtml } = require("./lib/email-template");
const { resolveTemplate } = require("./lib/template-utils");

const { corsHeaders } = require('./lib/cors');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function sbHeaders() {
  return {
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };
}

async function sbGet(path) {
  var res = await fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: sbHeaders() });
  if (!res.ok) {
    var text = await res.text();
    throw new Error("sbGet " + path + " HTTP " + res.status + ": " + text);
  }
  return res.json();
}

async function sbInsert(table, payload) {
  var res = await fetch(SUPABASE_URL + "/rest/v1/" + table, {
    method: "POST",
    headers: sbHeaders(),
    body: JSON.stringify(payload),
  });
  var text = await res.text();
  var data = null;
  try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
  return { status: res.status, data };
}

function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

exports.handler = async function (event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Database not configured" }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const {
    waiver_version_id, client_email,
    inspection_record_id, booking_id,
    signed_name, signature_data, signature_method, checkbox_responses,
  } = body;

  if (!waiver_version_id || !client_email || !signed_name || !signature_method) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields" }) };
  }
  if (!["typed","drawn"].includes(signature_method)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid signature_method" }) };
  }
  if (signature_method === "drawn" && !signature_data) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Drawn signature requires signature_data" }) };
  }

  try {
    // Fetch waiver version
    var waivers = await sbGet("waiver_versions?id=eq." + encodeURIComponent(waiver_version_id) + "&select=*&limit=1");
    var waiver  = waivers && waivers[0];
    if (!waiver)           return { statusCode: 404, headers, body: JSON.stringify({ error: "Waiver version not found" }) };
    if (!waiver.is_active) return { statusCode: 400, headers, body: JSON.stringify({ error: "Waiver version is no longer active" }) };

    // Validate required checkboxes
    var requiredKeys = (waiver.checkboxes || []).filter(function(cb){ return cb.required; }).map(function(cb){ return cb.key; });
    var responses    = checkbox_responses || {};
    var missing      = requiredKeys.filter(function(k){ return !responses[k]; });
    if (missing.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Required checkboxes not checked: " + missing.join(", ") }) };
    }

    // Check for duplicate
    var dupPath = "waiver_signatures?client_email=eq." + encodeURIComponent(client_email)
      + "&waiver_version_id=eq." + encodeURIComponent(waiver_version_id);
    if (inspection_record_id) dupPath += "&inspection_record_id=eq." + encodeURIComponent(inspection_record_id);
    dupPath += "&select=id&limit=1";
    var existing = await sbGet(dupPath);
    if (existing && existing.length) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: "Already signed", signature_id: existing[0].id }) };
    }

    var ip_address = (event.headers['x-forwarded-for'] || '').split(',')[0].trim()
                  || event.headers['client-ip']
                  || null;
    var user_agent = event.headers['user-agent'] || null;

    var { status, data: sigData } = await sbInsert("waiver_signatures", {
      waiver_version_id,
      client_email,
      inspection_record_id: inspection_record_id || null,
      signed_name,
      signature_data:       signature_data        || null,
      signature_method,
      ip_address,
      user_agent,
    });

    if (status === 409) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: "Already signed" }) };
    }
    if (status < 200 || status >= 300) {
      console.error("[sign-waiver] Insert error:", status, JSON.stringify(sigData));
      var errMsg = (sigData && (sigData.message || sigData.hint || sigData.code)) || ("HTTP " + status);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to save signature: " + errMsg }) };
    }

    var sigRecord = Array.isArray(sigData) ? sigData[0] : sigData;
    console.log("[sign-waiver] Recorded id:", sigRecord && sigRecord.id, "email:", (client_email || '').replace(/^(.).*@/, '$1***@'), "waiver:", waiver.name);

    // ── Update signed_agreements count and flip signed_agreement if all signed ──
    if (inspection_record_id) {
      try {
        // Count how many signatures exist for this record
        var signedRows = await sbGet(
          "waiver_signatures?inspection_record_id=eq." + encodeURIComponent(inspection_record_id) +
          "&select=id"
        );
        var signedCount = Array.isArray(signedRows) ? signedRows.length : 0;

        // Fetch the record to get active_agreements count
        var records = await sbGet(
          "inspection_records?id=eq." + encodeURIComponent(inspection_record_id) +
          "&select=active_agreements&limit=1"
        );
        var activeCount = (records && records[0]) ? (records[0].active_agreements || 0) : 0;

        var allSigned = activeCount > 0 && signedCount >= activeCount;

        var patchRes = await fetch(
          SUPABASE_URL + "/rest/v1/inspection_records?id=eq." + encodeURIComponent(inspection_record_id),
          {
            method:  "PATCH",
            headers: Object.assign({}, sbHeaders(), { "Prefer": "return=minimal" }),
            body:    JSON.stringify({
              signed_agreements: signedCount,
              signed_agreement:  allSigned,
            }),
          }
        );
        if (!patchRes.ok) {
          var patchText = await patchRes.text();
          console.error("[sign-waiver] patch failed:", patchRes.status, patchText);
        } else {
          console.log("[sign-waiver] signed_agreements=" + signedCount + "/" + activeCount + " signed_agreement=" + allSigned);
        }
      } catch (patchErr) {
        // Non-fatal — audit trail still intact in waiver_signatures
        console.error("[sign-waiver] update error (non-fatal):", patchErr.message);
      }
    }

    // Confirmation email (non-fatal)
    if (hasCredentials()) {
      try {
        var firstName  = signed_name.split(" ")[0] || "there";
        var tplVars = { client_name: signed_name, address: '', date: '' };
        var tpl = await resolveTemplate('agreement_signed', { subject: 'Agreement Signed — Heartland Inspection Group', body: 'Your inspection agreement has been signed. We look forward to seeing you at your inspection!' }, tplVars);
        var bodyHtml = ''
          + '<div style="padding:32px 40px;">'
          + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:16px;color:#1a2530;margin:0 0 12px;">Hi ' + escHtml(firstName) + ',</p>'
          + '<p style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:15px;color:#4a5568;line-height:1.7;margin:0;">' + escHtml(tpl.body) + '</p>'
          + '</div>';
        await sendEmail({
          to: client_email, toName: signed_name,
          subject: tpl.subject,
          htmlBody: emailWrap({ subtitle: 'Agreement Signed' }, bodyHtml),
        });
      } catch (emailErr) {
        console.error("[sign-waiver] Email failed (non-fatal):", emailErr.message);
      }
    }

    // ── Audit log (fire and forget) ──
    writeAuditLog({
      record_id: inspection_record_id || null,
      action:    'agreement.signed',
      category:  'agreements',
      actor:     'client',
      details:   { method: signature_method },
    });

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, signature: sigRecord }) };

  } catch (err) {
    console.error("[sign-waiver] Error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
