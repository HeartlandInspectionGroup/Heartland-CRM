const { createClient } = require('@supabase/supabase-js');
const { writeAuditLog } = require('./write-audit-log');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const SITE_URL = process.env.SITE_URL || 'https://heartlandinspectiongroup.com';

// Fire-and-forget report email
async function fireReportEmail({ id, cust_name, cust_email, address, tier, category, form_data, inspection_date, payment_method }) {
  if (!cust_email) return;
  try {
    const res = await fetch(SITE_URL + '/.netlify/functions/send-report-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': process.env.ADMIN_TOKEN || '',
      },
      body: JSON.stringify({
        id, cust_name, cust_email, address, tier, category,
        health_score:    form_data && form_data.health_score || '',
        inspection_date, payment_method,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('send-report-email non-OK:', res.status, body);
    }
  } catch (err) {
    console.error('send-report-email fetch error:', err);
  }
}

exports.handler = async (event) => {

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  const adminToken = process.env.ADMIN_TOKEN;
  if (event.headers['x-admin-token'] !== adminToken) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
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

  const {
    id, device_id, booking_id, tier, category, cust_name, cust_email, cust_phone,
    address, inspection_date, form_data, status,
    inspector_id, inspector_name, payment_method, stripe_payment_id, payment_signature,
    final_total,
  } = parsed;

  // Derive payment_status from payment_method
  var paymentStatus   = null;
  var skipPayment     = false;
  if (status === 'submitted') {
    var pm = (payment_method || '').toLowerCase();
    if (pm === 'cash' || pm === 'check' || pm === 'card' || pm === 'stripe' || pm === 'stripe_online' || pm === 'stripe_onsite' || pm === 'bundle') {
      paymentStatus = 'paid';
    } else if (pm === 'invoice') {
      // Previously Paid path — record was already paid externally
      // Don't overwrite existing payment fields — skip payment updates entirely
      skipPayment = true;
    } else {
      paymentStatus = 'unpaid';
    }
  }

  const fields = {
    tier,
    category:          category          || null,
    cust_name,
    cust_email,
    cust_phone,
    address,
    inspection_date:   inspection_date   || null,
    form_data,
    status:            status            || 'scheduled',
    inspector_id:      inspector_id      || null,
    inspector_name:    inspector_name    || null,
    payment_method:    (!skipPayment && payment_method) ? payment_method : undefined,
    stripe_payment_id: stripe_payment_id || null,
    payment_signature: payment_signature || null,
  };

  // Only write payment_status and final_total when they have values
  if (paymentStatus && !skipPayment) fields.payment_status = paymentStatus;
  if (final_total)    fields.final_total     = final_total;
  if (booking_id)     fields.booking_id      = booking_id;

  try {
    let recordId;

    if (id) {
      // Update existing record by id — never downgrade status
      const { data: cur } = await supabase.from('inspection_records').select('status').eq('id', id).single();
      const STATUS_RANK = { scheduled: 1, in_progress: 2, submitted: 3, delivered: 4, approved: 5 };
      const safeFields = { ...fields };
      if (cur && (STATUS_RANK[fields.status] || 0) <= (STATUS_RANK[cur.status] || 0) && fields.status !== 'submitted') {
        delete safeFields.status;
      }
      const { data, error } = await supabase
        .from('inspection_records')
        .update(safeFields)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
      recordId = data.id;
    } else if (booking_id) {
      // Find existing confirmed placeholder by booking_id
      const { data: existing } = await supabase
        .from('inspection_records')
        .select('id, status')
        .eq('booking_id', booking_id)
        .single();

      if (existing) {
        // Never downgrade status — confirmed stays confirmed until submitted
        const STATUS_RANK = { scheduled: 1, in_progress: 2, submitted: 3, delivered: 4, approved: 5 };
        const incomingRank = STATUS_RANK[fields.status] || 0;
        const existingRank = STATUS_RANK[existing.status] || 0;
        const safeFields = { ...fields };
        if (incomingRank <= existingRank && fields.status !== 'submitted') {
          delete safeFields.status; // keep existing status
        }
        const { data, error } = await supabase
          .from('inspection_records')
          .update(safeFields)
          .eq('id', existing.id)
          .select('id, status')
          .single();
        if (error) throw error;
        recordId = data.id;
      } else {
        // No placeholder found — create fresh (edge case: wizard started without prior confirm)
        const { data, error } = await supabase
          .from('inspection_records')
          .insert({ device_id, ...fields })
          .select('id')
          .single();
        if (error) throw error;
        recordId = data.id;
        writeAuditLog({ record_id: recordId, action: 'booking.created', category: 'scheduling', actor: 'inspector',
          details: { source: 'inspector_wizard', address: fields.address, client: fields.cust_name } });
      }
    } else {
      // Legacy path — no booking_id (draft with no confirmed booking)
      const { data, error } = await supabase
        .from('inspection_records')
        .insert({ device_id, ...fields })
        .select('id')
        .single();
      if (error) throw error;
      recordId = data.id;
      writeAuditLog({ record_id: recordId, action: 'booking.created', category: 'scheduling', actor: 'inspector',
        details: { source: 'inspector_wizard', address: fields.address, client: fields.cust_name } });
    }

    if (fields.status === 'submitted') {
      const reportUrl  = SITE_URL + '/report.html?id='           + recordId;
      const invoiceUrl = SITE_URL + '/invoice-receipt.html?id='  + recordId;
      await supabase
        .from('inspection_records')
        .update({ report_url: reportUrl, invoice_url: invoiceUrl })
        .eq('id', recordId);

      fireReportEmail({
        id: recordId, cust_name, cust_email, address,
        tier, category, form_data, inspection_date, payment_method,
      });

      // ── Audit log — report submitted ──
      writeAuditLog({
        record_id: recordId,
        action:    'report.submitted',
        category:  'inspection',
        actor:     'inspector',
        details:   { address: address, client: cust_name, tier: tier, category: category },
      });
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ id: recordId }) };

  } catch (err) {
    console.error('save-draft error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
