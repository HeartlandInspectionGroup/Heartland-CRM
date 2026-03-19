/**
 * Netlify Function: get-agreements
 *
 * Returns all active waiver templates applicable to a given inspection record,
 * along with which ones the client has already signed.
 *
 * GET /api/get-agreements?token=<portal_token>&record_id=<id>
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const { corsHeaders } = require('./lib/cors');
async function sbGet(path) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  var text = await res.text();
  try { return JSON.parse(text); } catch(e) { return null; }
}

/**
 * Replace {{TOKEN}} placeholders in agreement body with real record values.
 * Tokens that have no data are left as empty string (not shown as {{TOKEN}}).
 */
function substituteTokens(body, record, clientEmail, signingDate) {
  if (!body) return body;

  // Format inspection date
  var inspDate = '';
  var inspTime = record.inspection_time || '';
  if (record.inspection_date) {
    var d = new Date(record.inspection_date + 'T12:00:00');
    inspDate = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  // Format signing date (today)
  var today = signingDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Build services label from category + tier
  var servicesLabel = '';
  if (record.category) {
    var catMap = {
      home_inspection:   'Home Inspection',
      home_health_check: 'Home Health Check',
      new_construction:  'New Construction Inspection',
      addon:             'Add-On Service',
    };
    servicesLabel = catMap[record.category] || record.category;
    if (record.tier) servicesLabel += ' — ' + record.tier;
  }

  // Payment method label
  var feesLabel = '';
  var pmMap = {
    cash:          'Cash',
    check:         'Check',
    card:          'Credit/Debit Card',
    invoice:       'Invoice',
    stripe_online: 'Online Payment',
  };
  if (record.payment_method) feesLabel = pmMap[record.payment_method] || record.payment_method;

  // Price
  var price = record.final_total ? Number(record.final_total).toFixed(2) : '';

  var tokens = {
    '{{ADDRESS}}':            record.address               || '',
    '{{INSPECTION_ADDRESS}}': record.address               || '',
    '{{INSPECTION_DATE}}':    inspDate,
    '{{INSPECTION_TIME}}':    inspTime,
    '{{CLIENT_NAME}}':        record.cust_name             || '',
    '{{CLIENT_ADDRESS}}':     record.client_current_address || '',
    '{{CLIENT_EMAIL}}':       clientEmail                  || '',
    '{{CLIENT_PHONE}}':       record.cust_phone            || '',
    '{{INSPECTOR_NAME}}':     record.inspector_name        || '',
    '{{SERVICES}}':           servicesLabel,
    '{{PRICE}}':              price,
    '{{FEES}}':               feesLabel,
    '{{CURRENT_DATE}}':       today,
    '{{INSPECTION_COMPANY}}': 'Heartland Inspection Group',
    '{{COMPANY_PHONE}}':      '(815) 329-8583',
    '{{COMPANY_EMAIL}}':      'info@heartlandinspectiongroup.com',
  };

  var result = body;
  Object.keys(tokens).forEach(function(token) {
    result = result.split(token).join(tokens[token]);
  });
  return result;
}

function getStateFromAddress(address) {
  if (!address) return null;
  var upper = address.toUpperCase();
  if (upper.includes(', IL') || upper.includes(',IL')) return 'IL';
  if (upper.includes(', WI') || upper.includes(',WI')) return 'WI';
  return null;
}

/**
 * Build the set of applicable service keys for a record.
 * Keys follow the pattern: "category", "category:tier", "category:state", "category:tier:state"
 * Universal key: "*" matches every record.
 */
function buildApplicableKeys(record, bookingServices) {
  var keys = new Set(['*']); // universal — always included
  var cat   = record.category || '';
  var tier  = record.tier     || '';
  var state = getStateFromAddress(record.address);

  // ── Main category keys ───────────────────────────
  if (cat) {
    keys.add(cat);
    if (tier)  keys.add(cat + ':' + tier);
    if (state) keys.add(cat + ':' + state);
    if (tier && state) keys.add(cat + ':' + tier + ':' + state);
  }

  // ── Legacy pre-purchase / pre-listing keys ───────
  // applies_to was configured using booking-form category names, not record category names.
  // A 'home_inspection' record with tier 'Pre Purchase' also matches 'pre-purchase:STATE'.
  if (cat === 'home_inspection') {
    var tierLower = tier.toLowerCase().replace(/[- ]/g, '');
    if (tierLower === 'prepurchase') {
      keys.add('pre-purchase');
      if (state) keys.add('pre-purchase:' + state);
    } else if (tierLower === 'prelisting') {
      keys.add('pre-listing');
      if (state) keys.add('pre-listing:' + state);
    }
  }

  // ── Addon keys from booking services ─────────────
  // Addon agreements are booked as add-ons to a main inspection, not their own category.
  // We detect them by scanning the booking's services array for known addon names.
  if (Array.isArray(bookingServices)) {
    bookingServices.forEach(function(svc) {
      var name = (svc.name || '').toLowerCase();
      if (name.includes('radon'))                                 keys.add('addon:radon');
      if (name.includes('sewer'))                                 keys.add('addon:sewer_scope');
      if (name.includes('wdo') || name.includes('termite') || name.includes('wood destroying')) keys.add('addon:wdo');
      if (name.includes('mold') || name.includes('air quality')) keys.add('addon:mold');
      if (name.includes('water quality') || name.includes('water test')) keys.add('addon:water_quality');
      if (name.includes('thermal') || name.includes('infrared')) keys.add('addon:thermal');
    });
  }

  return keys;
}

exports.handler = async function(event) {
  var headers = { 'Content-Type': 'application/json', ...corsHeaders(event) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  var params    = event.queryStringParameters || {};
  var token     = params.token;
  var recordId  = params.record_id;

  if (!token || !recordId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'token and record_id required' }) };
  }

  // Verify token → get client email
  var tokenRows = await sbGet('client_portal_tokens?token=eq.' + encodeURIComponent(token) + '&select=client_email&limit=1');
  var tokenRow  = tokenRows && tokenRows[0];
  if (!tokenRow) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid token' }) };
  var clientEmail = tokenRow.client_email;

  // Fetch the inspection record
  var records = await sbGet('inspection_records?id=eq.' + encodeURIComponent(recordId) + '&cust_email=eq.' + encodeURIComponent(clientEmail) + '&select=id,category,tier,address,client_current_address,cust_name,cust_phone,inspector_name,inspection_date,inspection_time,final_total,payment_method,booking_id&limit=1');
  var record  = records && records[0];
  if (!record) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Record not found' }) };

  // Fetch booking services (for addon key detection)
  var bookingServices = [];
  if (record.booking_id) {
    var bookingRows = await sbGet('bookings?id=eq.' + encodeURIComponent(record.booking_id) + '&select=services&limit=1');
    if (Array.isArray(bookingRows) && bookingRows[0]) {
      if (Array.isArray(bookingRows[0].services)) bookingServices = bookingRows[0].services;
    }
  }

  // Fetch all active waiver versions
  var waivers = await sbGet('waiver_versions?is_active=eq.true&select=id,name,version,body,checkboxes,applies_to,sort_order&order=sort_order.asc,name.asc');
  if (!Array.isArray(waivers)) waivers = [];

  // Filter to applicable waivers
  var applicable = buildApplicableKeys(record, bookingServices);
  var matched = waivers.filter(function(w) {
    var appliesTo = Array.isArray(w.applies_to) ? w.applies_to : [];
    // If applies_to is empty, treat as universal
    if (!appliesTo.length) return true;
    return appliesTo.some(function(key) { return applicable.has(key); });
  });

  // Fetch existing signatures for this client + record
  var sigs = await sbGet(
    'waiver_signatures?client_email=eq.' + encodeURIComponent(clientEmail) +
    '&inspection_record_id=eq.' + encodeURIComponent(recordId) +
    '&select=id,waiver_version_id,signed_name,signed_at,signature_method,signature_data'
  );
  if (!Array.isArray(sigs)) sigs = [];

  var sigMap = {};
  sigs.forEach(function(s) { sigMap[s.waiver_version_id] = s; });

  // Attach signature status and substitute tokens in each waiver body
  var signingDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  var result = matched.map(function(w) {
    var sig = sigMap[w.id] || null;
    return {
      id:          w.id,
      name:        w.name,
      version:     w.version,
      body:        substituteTokens(w.body, record, clientEmail, signingDate),
      checkboxes:  w.checkboxes || [],
      applies_to:  w.applies_to || [],
      signed:          !!sig,
      signed_name:     sig ? sig.signed_name     : null,
      signed_at:       sig ? sig.signed_at       : null,
      signature_data:  sig ? sig.signature_data  : null,
      signature_method:sig ? sig.signature_method: null,
    };
  });

  // Write active_agreements count to the record so the gate knows how many were sent
  if (matched.length > 0) {
    await fetch(SUPABASE_URL + '/rest/v1/inspection_records?id=eq.' + encodeURIComponent(recordId), {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ active_agreements: matched.length })
    });
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, agreements: result, record_id: recordId }),
  };
};
