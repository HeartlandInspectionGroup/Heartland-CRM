/**
 * shared/admin-utils.js — Shared utility functions for admin.html
 * HEA-233: Extracted from admin.html to eliminate duplicate definitions.
 * All functions are pure utilities with no dependency on sb or IIFE-scoped variables.
 */

function esc(s) {
  return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
}

function fixInvoiceUrl(url) {
  if (!url) return '';
  return url.replace(/invoice\.html(\?id=)/, 'invoice-receipt.html$1');
}

function addonTierLabel(tier) {
  var map = {
    radon: 'Radon Testing', radon_testing: 'Radon Testing',
    wdo: 'WDO / Termite',
    sewer_scope: 'Sewer Scope',
    mold: 'Mold / Air Sampling', mold_air_sampling: 'Mold / Air Sampling',
    thermal: 'Thermal Imaging', thermal_imaging: 'Thermal Imaging',
    water: 'Water Quality', water_quality: 'Water Quality'
  };
  return map[tier] || tier;
}

function mkKpiTile(icon, value, label, color) {
  color = color || 'var(--primary)';
  return '<div style="background:#f8f9fb;border:1px solid #e8eaed;border-radius:10px;padding:18px 20px;text-align:center;">' +
    '<div style="font-size:1.5rem;margin-bottom:6px;">' + icon + '</div>' +
    '<div style="font-size:28px;font-weight:700;color:' + color + ';">' + value + '</div>' +
    '<div style="font-size:12px;color:var(--text-light);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">' + label + '</div>' +
  '</div>';
}

function mkBarRow(label, count, total, color, suffix) {
  suffix = suffix || '';
  var pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return '<div style="margin-bottom:14px;">' +
    '<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:5px;">' +
      '<span>' + esc(label) + '</span>' +
      '<span style="color:var(--text-light);">' + suffix + count + (total !== count ? ' <span style="font-weight:400;color:#bbb;">(' + pct + '%)</span>' : '') + '</span>' +
    '</div>' +
    '<div style="background:#e8eaed;border-radius:20px;height:8px;overflow:hidden;">' +
      '<div style="background:' + color + ';width:' + pct + '%;height:100%;border-radius:20px;transition:width 0.4s;"></div>' +
    '</div>' +
  '</div>';
}

function qbParseDate(dateStr) {
  var s = String(dateStr || '');
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  return new Date(s);
}

function qbFormatDate(dateStr) {
  var d = qbParseDate(dateStr);
  return String(d.getMonth() + 1).padStart(2, '0') + '/' +
         String(d.getDate()).padStart(2, '0') + '/' +
         d.getFullYear();
}

function qbDownloadCSV(content, filename) {
  var blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function formatJobType(r) {
  var cat = r.category || '';
  var tier = r.tier || '';
  if (cat === 'home_health_check') return 'Home Health Check' + (tier ? ' \u2014 ' + tier : '');
  if (cat === 'home_inspection')   return 'Pre Purchase' + (tier ? ' \u2014 ' + tier : '');
  if (cat === 'new_construction')  return 'New Construction' + (tier ? ' \u2014 ' + tier : '');
  if (cat === 'bundle_addon')      return 'Bundle Add-On' + (tier ? ' \u2014 ' + tier : '');
  if (cat === 'addon')             return 'Add-On' + (tier ? ' \u2014 ' + addonTierLabel(tier) : '');
  if (cat === 'pre_listing')       return 'Pre Listing' + (tier ? ' \u2014 ' + tier : '');
  return (tier || cat || 'Inspection');
}

// ── QC IIFE helpers (HEA-234) ────────────────────────────
// Moved from the Quality Control IIFE in admin.html so extracted tab scripts
// (admin-audit-log.js, admin-qa-review.js, etc.) can call them via window.*.

async function getAuthHeaderLocal() {
  try {
    if (window._heartlandSB || window.sb) {
      var _sb = window._heartlandSB || window.sb;
      var { data } = await _sb.auth.getSession();
      if (data && data.session && data.session.access_token) {
        return { 'Authorization': 'Bearer ' + data.session.access_token };
      }
    }
  } catch (e) {}
  return { 'x-admin-token': window.ADMIN_TOKEN || '' };
}

function sbFetch(path, opts) {
  var SUPABASE_URL = 'https://fusravedbksupcsjfzda.supabase.co';
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
  opts = opts || {};
  var h = opts.headers || {};
  h['apikey'] = SUPABASE_ANON_KEY;
  h['Authorization'] = 'Bearer ' + SUPABASE_ANON_KEY;
  if (!h['Content-Type'] && opts.method && opts.method !== 'GET') h['Content-Type'] = 'application/json';
  if (opts.upsert) h['Prefer'] = 'resolution=merge-duplicates';
  opts.headers = h;
  return fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
}

function closeClientPopover() {
  var existing = document.querySelector('.client-popover-backdrop');
  if (existing) existing.remove();
  var pop = document.querySelector('.client-popover');
  if (pop) pop.remove();
}

function showClientPopoverFromRecord(anchor) {
  var _sd = function() { return window._hbShared || { invoices: [], bookings: [], clients: [], records: [], waiverVersions: [], waiverSignatures: [] }; };
  var recordId = anchor.getAttribute('data-record-id');
  var record = _sd().records.find(function(r){ return r.id === recordId; }) || {};
  var clientId = anchor.getAttribute('data-client-id');
  var client = _sd().clients.find(function(c){ return c.id === clientId; }) || {};
  var name = record.cust_name || ((client.first_name || '') + ' ' + (client.last_name || '')).trim() || '—';
  var email = record.cust_email || client.email || '';
  var phone = record.cust_phone || client.phone || '';
  var address = record.address || record.inspection_address || '';
  var booking = _sd().bookings.find(function(b){
    return b.id === record.booking_id || b.property_address === address;
  });

  closeClientPopover();
  var backdrop = document.createElement('div');
  backdrop.className = 'client-popover-backdrop';
  backdrop.onclick = closeClientPopover;
  document.body.appendChild(backdrop);
  var pop = document.createElement('div');
  pop.className = 'client-popover';
  pop.innerHTML = _renderPopoverContent({
    name: name, email: email, phone: phone, address: address,
    date: record.inspection_date || '',
    time: booking ? booking.preferred_time : '',
    homeSizeTier: booking ? booking.home_size_tier : '',
    sqft: booking ? booking.sqft : '',
    yearBuilt: booking ? booking.year_built : '',
    services: booking ? (booking.services || []) : [],
    total: booking ? booking.final_total : null,
    notes: booking ? booking.notes : '',
    findings: record.findings || null,
    reportUrl: record.report_url || '',
    hasInspection: !!record.id,
    clientId: clientId
  });
  document.body.appendChild(pop);
  // Position popover
  var rect = anchor.getBoundingClientRect();
  var top = rect.bottom + 8;
  var left = rect.left;
  if (left + 380 > window.innerWidth) left = window.innerWidth - 400;
  if (left < 10) left = 10;
  if (top + pop.offsetHeight > window.innerHeight - 20) top = rect.top - pop.offsetHeight - 8;
  pop.style.top = top + 'px';
  pop.style.left = left + 'px';
}

function _renderPopoverContent(data) {
  var html = '<button class="cp-close" onclick="closeClientPopover()">&times;</button>';
  html += '<h3>' + esc(data.name || '—') + '</h3>';
  html += '<p class="cp-email">' + esc(data.email || '') + (data.phone ? ' &bull; ' + esc(data.phone) : '') + '</p>';
  if (data.address) {
    html += '<div class="cp-section"><div class="cp-section-title">Property</div>';
    html += '<div class="cp-row"><span class="cp-label">Address</span><span class="cp-value">' + esc(data.address) + '</span></div>';
    if (data.date) html += '<div class="cp-row"><span class="cp-label">Inspection Date</span><span class="cp-value">' + esc(data.date) + '</span></div>';
    if (data.time) html += '<div class="cp-row"><span class="cp-label">Time</span><span class="cp-value">' + esc(data.time) + '</span></div>';
    if (data.homeSizeTier) html += '<div class="cp-row"><span class="cp-label">Home Size</span><span class="cp-value">' + esc(data.homeSizeTier) + '</span></div>';
    if (data.sqft) html += '<div class="cp-row"><span class="cp-label">Sq Ft</span><span class="cp-value">' + Number(data.sqft).toLocaleString() + '</span></div>';
    if (data.yearBuilt) html += '<div class="cp-row"><span class="cp-label">Year Built</span><span class="cp-value">' + esc(data.yearBuilt) + '</span></div>';
    html += '</div>';
  }
  if (data.services && data.services.length) {
    html += '<div class="cp-section"><div class="cp-section-title">Services Ordered</div>';
    html += '<ul class="cp-services-list">';
    data.services.forEach(function(s) {
      var name = typeof s === 'string' ? s : (s.name || s.id || '');
      var price = s.price != null ? ' — $' + Number(s.price).toLocaleString() : '';
      html += '<li>' + esc(name) + price + '</li>';
    });
    html += '</ul>';
    if (data.total != null) html += '<div class="cp-row" style="margin-top:6px;border-top:1px solid #eaeef0;padding-top:6px;"><span class="cp-label">Total</span><span class="cp-value" style="color:#15516d;">$' + Number(data.total).toLocaleString() + '</span></div>';
    html += '</div>';
  }
  if (data.findings) {
    var f = data.findings;
    html += '<div class="cp-section"><div class="cp-section-title">Inspection Results</div>';
    if (f.version === 2) {
      html += '<div class="cp-row"><span class="cp-label">Total Findings</span><span class="cp-value">' + (f.total_findings || 0) + '</span></div>';
      if (f.major_count) html += '<div class="cp-row"><span class="cp-label">Major</span><span class="cp-value" style="color:#e03328;">' + f.major_count + '</span></div>';
      if (f.minor_count) html += '<div class="cp-row"><span class="cp-label">Minor</span><span class="cp-value" style="color:#c97a10;">' + f.minor_count + '</span></div>';
    } else if (Array.isArray(f) && f.length) {
      var majors = f.filter(function(x){return x.severity==='major';}).length;
      var minors = f.filter(function(x){return x.severity==='minor';}).length;
      html += '<div class="cp-row"><span class="cp-label">Total Findings</span><span class="cp-value">' + f.length + '</span></div>';
      if (majors) html += '<div class="cp-row"><span class="cp-label">Major</span><span class="cp-value" style="color:#e03328;">' + majors + '</span></div>';
      if (minors) html += '<div class="cp-row"><span class="cp-label">Minor</span><span class="cp-value" style="color:#c97a10;">' + minors + '</span></div>';
    }
    html += '</div>';
  }
  if (data.notes) {
    html += '<div class="cp-section"><div class="cp-section-title">Notes</div>';
    html += '<div class="cp-notes">' + esc(data.notes) + '</div>';
    html += '</div>';
  }
  if (data.reportUrl) {
    html += '<a href="' + esc(data.reportUrl) + '" target="_blank" class="cp-report-link">View Report</a>';
  } else if (data.hasInspection) {
    html += '<a href="/client-portal.html?cid=' + esc(data.clientId || '') + '" target="_blank" class="cp-report-link">Open Client Portal</a>';
  }
  return html;
}

// ── Shared date/time utilities (HEA-236) ────────────────────
var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad(n){ return n < 10 ? '0' + n : '' + n; }
function dateKey(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function to24(s){ var m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i); if(!m) return s; var h = +m[1], ap = m[3].toUpperCase(); if(ap==='PM' && h!==12) h += 12; if(ap==='AM' && h===12) h = 0; return pad(h) + ':' + m[2]; }
function to12(s){ var p = s.split(':'), h = +p[0], m = p[1]; var ap = h >= 12 ? 'PM' : 'AM'; if(h > 12) h -= 12; if(h === 0) h = 12; return h + ':' + m + ' ' + ap; }

// Expose all on window for global access
window.esc = esc;
window.fixInvoiceUrl = fixInvoiceUrl;
window.addonTierLabel = addonTierLabel;
window.mkKpiTile = mkKpiTile;
window.mkBarRow = mkBarRow;
window.qbParseDate = qbParseDate;
window.qbFormatDate = qbFormatDate;
window.qbDownloadCSV = qbDownloadCSV;
window.formatJobType = formatJobType;
window.getAuthHeaderLocal = getAuthHeaderLocal;
window.sbFetch = sbFetch;
window.closeClientPopover = closeClientPopover;
window.showClientPopoverFromRecord = showClientPopoverFromRecord;
window.DAYS = DAYS;
window.SHORT = SHORT;
window.MONTHS = MONTHS;
window.pad = pad;
window.dateKey = dateKey;
window.to24 = to24;
window.to12 = to12;
