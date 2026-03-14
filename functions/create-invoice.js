/**
 * Netlify Function: create-invoice
 *
 * Creates a draft invoice from a booking record. Reads the booking's
 * services/pricing data and generates invoice line items.
 *
 * Route: POST /api/create-invoice (via netlify.toml redirect)
 *
 * Environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

/**
 * Build line items from a booking record.
 * Exported for unit testing.
 */
function buildLineItems(booking) {
  const items = [];
  let sortOrder = 0;

  // Base service
  if (booking.base_price) {
    const tier = booking.home_size_tier || '';
    items.push({
      sort_order: sortOrder++,
      description: tier ? `Home Inspection (${tier})` : 'Home Inspection',
      quantity: 1,
      unit_price: Number(booking.base_price),
      total: Number(booking.base_price),
      item_type: 'base_service',
      taxable: true,
    });
  }

  // Add-on services from the services JSONB array
  const services = Array.isArray(booking.services) ? booking.services : [];
  for (const svc of services) {
    // Each service entry may be { id, name, price } or { name, price }
    const name = svc.name || svc.id || 'Add-On Service';
    const price = Number(svc.price || 0);
    if (price > 0) {
      items.push({
        sort_order: sortOrder++,
        description: name,
        quantity: 1,
        unit_price: price,
        total: price,
        item_type: 'addon',
        taxable: true,
      });
    }
  }

  // Bundle discount (negative line item)
  const discountAmt = Number(booking.discount_amount || 0);
  if (discountAmt > 0) {
    const pct = booking.discount_pct ? ` (${booking.discount_pct}%)` : '';
    items.push({
      sort_order: sortOrder++,
      description: `Bundle Discount${pct}`,
      quantity: 1,
      unit_price: -discountAmt,
      total: -discountAmt,
      item_type: 'discount',
      taxable: false,
    });
  }

  // Coupon discount (negative line item)
  const couponAmt = Number(booking.coupon_discount || 0);
  if (couponAmt > 0) {
    const code = booking.coupon_code ? ` (${booking.coupon_code})` : '';
    items.push({
      sort_order: sortOrder++,
      description: `Coupon${code}`,
      quantity: 1,
      unit_price: -couponAmt,
      total: -couponAmt,
      item_type: 'coupon',
      taxable: false,
    });
  }

  // Tax line item
  const taxAmt = Number(booking.tax_amount || 0);
  if (taxAmt > 0) {
    const rateDisplay = booking.tax_rate
      ? ` (${(Number(booking.tax_rate) * 100).toFixed(2)}%)`
      : '';
    items.push({
      sort_order: sortOrder++,
      description: `Sales Tax${rateDisplay}`,
      quantity: 1,
      unit_price: taxAmt,
      total: taxAmt,
      item_type: 'tax',
      taxable: false,
    });
  }

  return items;
}

/**
 * Calculate invoice totals from line items.
 * Exported for unit testing.
 */
function calculateTotals(lineItems, booking) {
  let subtotal = 0;
  let taxAmount = 0;

  for (const item of lineItems) {
    if (item.item_type === 'tax') {
      taxAmount += item.total;
    } else if (item.item_type !== 'discount' && item.item_type !== 'coupon') {
      subtotal += item.total;
    }
  }

  const discountAmount = Number(booking.discount_amount || 0);
  const couponDiscount = Number(booking.coupon_discount || 0);
  const total = subtotal - discountAmount - couponDiscount + taxAmount;

  return {
    subtotal: round2(subtotal),
    discount_pct: Number(booking.discount_pct || 0),
    discount_amount: round2(discountAmount),
    coupon_code: booking.coupon_code || null,
    coupon_discount: round2(couponDiscount),
    tax_rate: Number(booking.tax_rate || 0),
    tax_amount: round2(taxAmount),
    total: round2(total),
    balance_due: round2(total),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body);
    const { booking_id, client_id, inspection_record_id } = payload;

    if (!booking_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'booking_id is required' }) };
    }

    const sb = getSupabase();
    if (!sb) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database not configured' }) };
    }

    // Check if invoice already exists for this booking
    const { data: existing } = await sb
      .from('invoices')
      .select('id, invoice_number')
      .eq('booking_id', booking_id)
      .eq('invoice_type', 'original')
      .neq('status', 'void')
      .single();

    if (existing) {
      return {
        statusCode: 409, headers,
        body: JSON.stringify({ error: 'Invoice already exists', invoice_id: existing.id, invoice_number: existing.invoice_number }),
      };
    }

    // Fetch booking
    const { data: booking, error: bkErr } = await sb
      .from('bookings')
      .select('*')
      .eq('id', booking_id)
      .single();

    if (bkErr || !booking) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Booking not found' }) };
    }

    // Resolve client_id: use provided, or look up from booking email
    let resolvedClientId = client_id;
    if (!resolvedClientId && booking.client_email) {
      const { data: client } = await sb
        .from('clients')
        .select('id')
        .ilike('email', booking.client_email.trim().toLowerCase())
        .single();
      if (client) resolvedClientId = client.id;
    }
    if (!resolvedClientId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Could not resolve client_id' }) };
    }

    // Build line items from booking
    const lineItems = buildLineItems(booking);
    const totals = calculateTotals(lineItems, booking);

    // Default due_date = inspection date (preferred_date)
    const dueDate = booking.preferred_date || null;

    // Create invoice
    const { data: invoice, error: invErr } = await sb
      .from('invoices')
      .insert({
        invoice_number: '', // trigger will generate
        booking_id,
        client_id: resolvedClientId,
        inspection_record_id: inspection_record_id || null,
        status: 'draft',
        invoice_type: 'original',
        due_date: dueDate,
        ...totals,
        amount_paid: 0,
      })
      .select('*')
      .single();

    if (invErr) throw invErr;

    // Insert line items
    const itemsWithInvoice = lineItems.map(item => ({
      ...item,
      invoice_id: invoice.id,
    }));

    const { data: items, error: itemsErr } = await sb
      .from('invoice_line_items')
      .insert(itemsWithInvoice)
      .select('*');

    if (itemsErr) throw itemsErr;

    // Log to audit_log
    await sb.from('audit_log').insert({
      inspection_record_id: inspection_record_id || null,
      actor_type: 'admin',
      action: 'invoice_created',
      details: { invoice_id: invoice.id, invoice_number: invoice.invoice_number, booking_id, total: totals.total },
    }).catch(() => {}); // non-critical

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, invoice, line_items: items }),
    };
  } catch (err) {
    console.error('create-invoice error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

// Export for unit testing
exports.buildLineItems = buildLineItems;
exports.calculateTotals = calculateTotals;
