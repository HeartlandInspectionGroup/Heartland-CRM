/**
 * Netlify Function: record-digital-payment
 *
 * Records a digital payment (Venmo, PayPal, Zelle) for an inspection record.
 * No email sent, no Stripe, no bookings table — just DB update + audit log.
 *
 * POST body: { record_id, method_detail, transaction_id, amount? }
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./auth');
const { corsHeaders } = require('./lib/cors');
const { writeAuditLog } = require('./write-audit-log');

var _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _supabase;
}

exports._setClient = function (c) { _supabase = c; };

exports.handler = async (event) => {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  var authError = await requireAuth(event);
  if (authError) return authError;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var { record_id, method_detail, transaction_id, amount } = body;

  if (!record_id) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'record_id required' }) };
  }
  if (!method_detail) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'method_detail required' }) };
  }
  if (!transaction_id) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'transaction_id required' }) };
  }

  var validMethods = ['venmo', 'paypal', 'zelle'];
  if (validMethods.indexOf(method_detail) === -1) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'method_detail must be venmo, paypal, or zelle' }) };
  }

  try {
    // Update inspection record
    var updates = {
      payment_status: 'paid',
      payment_method: 'digital',
      payment_method_detail: method_detail,
      digital_transaction_id: transaction_id,
    };

    var { error: updErr } = await db()
      .from('inspection_records')
      .update(updates)
      .eq('id', record_id);

    if (updErr) throw updErr;

    // Price adjustment if amount provided and different
    var logAmount = amount;
    if (amount !== undefined && amount !== null) {
      var adjNum = Number(amount);
      if (!isNaN(adjNum) && adjNum >= 0) {
        var { data: curRec } = await db()
          .from('inspection_records')
          .select('final_total')
          .eq('id', record_id)
          .maybeSingle();

        var originalAmount = curRec ? Number(curRec.final_total || 0) : 0;
        if (adjNum !== originalAmount) {
          await db()
            .from('inspection_records')
            .update({ final_total: adjNum })
            .eq('id', record_id);
        }
        logAmount = adjNum;
      }
    }

    // Audit log
    writeAuditLog({
      record_id: record_id,
      action: 'payment.digital_recorded',
      category: 'payments',
      actor: 'admin',
      details: { method: method_detail, transaction_id: transaction_id, amount: logAmount },
    });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('record-digital-payment error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
