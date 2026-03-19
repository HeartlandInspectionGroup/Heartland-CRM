/**
 * Netlify Function: update-invoice
 *
 * Handles invoice modifications: edit line items, void, update memo/due-date.
 *
 * Route: POST /api/update-invoice (via netlify.toml redirect)
 *
 * Environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js');

const { corsHeaders } = require('./lib/cors');
const { requireAuth } = require('./auth');

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Recalculate invoice totals from line items.
 * Exported for unit testing.
 */
function recalculate(lineItems) {
  let subtotal = 0;
  let discountAmount = 0;
  let couponDiscount = 0;
  let taxAmount = 0;

  for (const item of lineItems) {
    switch (item.item_type) {
      case 'discount':
        discountAmount += Math.abs(item.total);
        break;
      case 'coupon':
        couponDiscount += Math.abs(item.total);
        break;
      case 'tax':
        taxAmount += item.total;
        break;
      default:
        subtotal += item.total;
    }
  }

  const total = round2(subtotal - discountAmount - couponDiscount + taxAmount);
  return {
    subtotal: round2(subtotal),
    discount_amount: round2(discountAmount),
    coupon_discount: round2(couponDiscount),
    tax_amount: round2(taxAmount),
    total,
  };
}

exports.handler = async function (event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authError = await requireAuth(event);
  if (authError) return authError;

  try {
    const payload = JSON.parse(event.body);
    const { invoice_id, action } = payload;

    if (!invoice_id || !action) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'invoice_id and action required' }) };
    }

    const sb = getSupabase();
    if (!sb) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database not configured' }) };
    }

    // Fetch current invoice
    const { data: invoice, error: fetchErr } = await sb
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single();

    if (fetchErr || !invoice) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Invoice not found' }) };
    }

    // ── VOID ──
    if (action === 'void') {
      if (invoice.status === 'paid') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cannot void a paid invoice. Use refund instead.' }) };
      }
      const { error } = await sb
        .from('invoices')
        .update({ status: 'void', voided_at: new Date().toISOString() })
        .eq('id', invoice_id);
      if (error) throw error;

      await sb.from('audit_log').insert({
        inspection_record_id: invoice.inspection_record_id,
        actor_type: 'admin',
        action: 'invoice_voided',
        details: { invoice_id, invoice_number: invoice.invoice_number },
      }).catch(() => {});

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, status: 'void' }) };
    }

    // ── UPDATE MEMO / DUE DATE / NOTES ──
    if (action === 'update_details') {
      const updates = {};
      if (payload.memo !== undefined) updates.memo = payload.memo;
      if (payload.internal_notes !== undefined) updates.internal_notes = payload.internal_notes;
      if (payload.due_date !== undefined) updates.due_date = payload.due_date;

      const { data: updated, error } = await sb
        .from('invoices')
        .update(updates)
        .eq('id', invoice_id)
        .select('*')
        .single();
      if (error) throw error;

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, invoice: updated }) };
    }

    // ── UPDATE LINE ITEMS ──
    if (action === 'update_items') {
      if (invoice.status === 'paid' || invoice.status === 'void') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cannot edit line items on a ' + invoice.status + ' invoice' }) };
      }

      const newItems = payload.line_items;
      if (!Array.isArray(newItems)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'line_items array required' }) };
      }

      // Validate and normalize line items
      const normalized = newItems.map((item, i) => ({
        invoice_id,
        sort_order: item.sort_order != null ? item.sort_order : i,
        description: item.description || 'Item',
        quantity: Math.max(1, parseInt(item.quantity) || 1),
        unit_price: round2(Number(item.unit_price) || 0),
        total: round2((parseInt(item.quantity) || 1) * (Number(item.unit_price) || 0)),
        item_type: item.item_type || 'custom',
        taxable: item.taxable !== false,
      }));

      // Delete old items, insert new
      await sb.from('invoice_line_items').delete().eq('invoice_id', invoice_id);
      const { data: insertedItems, error: itemsErr } = await sb
        .from('invoice_line_items')
        .insert(normalized)
        .select('*');
      if (itemsErr) throw itemsErr;

      // Recalculate totals
      const totals = recalculate(normalized);
      const balanceDue = round2(totals.total - Number(invoice.amount_paid || 0));

      const { data: updated, error: updateErr } = await sb
        .from('invoices')
        .update({ ...totals, balance_due: balanceDue })
        .eq('id', invoice_id)
        .select('*')
        .single();
      if (updateErr) throw updateErr;

      await sb.from('audit_log').insert({
        inspection_record_id: invoice.inspection_record_id,
        actor_type: 'admin',
        action: 'invoice_items_updated',
        details: { invoice_id, invoice_number: invoice.invoice_number, new_total: totals.total },
      }).catch(() => {});

      return {
        statusCode: 200, headers,
        body: JSON.stringify({ success: true, invoice: updated, line_items: insertedItems }),
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action: ' + action }) };
  } catch (err) {
    console.error('update-invoice error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

exports.recalculate = recalculate;
