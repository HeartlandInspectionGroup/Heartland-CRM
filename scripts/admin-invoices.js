/**
 * scripts/admin-invoices.js — Invoices tab (HEA-235)
 * Extracted from QC IIFE in admin.html.
 * Uses: esc(), fixInvoiceUrl(), copyCrUrl(), resendCrInvoice() (all global via window.*)
 * Reads: window._hbShared.records, window._hbShared.clients
 */

var invFilterSearch = '';

function renderInvoices() {
  var el = document.getElementById('invTableWrap');
  if (!el) return;
  var searchEl = document.getElementById('invFilterSearch');
  var q = searchEl ? searchEl.value.toLowerCase() : '';
  invFilterSearch = q;

  var records = (window._hbShared && window._hbShared.records) || [];
  var clients = (window._hbShared && window._hbShared.clients) || [];

  var submitted = ['submitted', 'delivered', 'approved'];
  var filtered = records.filter(function(r) {
    if (submitted.indexOf(r.status) === -1) return false;
    if (!q) return true;
    var clientMap = {};
    clients.forEach(function(c) { clientMap[c.id] = c; });
    var c = clientMap[r.client_id] || {};
    var name = (r.cust_name || ((c.first_name||'') + ' ' + (c.last_name||'')).trim()).toLowerCase();
    var addr = (r.address || r.inspection_address || '').toLowerCase();
    return name.indexOf(q) !== -1 || addr.indexOf(q) !== -1;
  });

  if (!filtered.length) {
    el.innerHTML = '<div style="padding:32px;text-align:center;color:#aaa;">No invoices found.</div>';
    return;
  }

  var clientMap = {};
  clients.forEach(function(c) { clientMap[c.id] = c; });

  var html = '';
  filtered.forEach(function(r) {
    var c = clientMap[r.client_id] || {};
    var clientName = r.cust_name || ((c.first_name||'') + ' ' + (c.last_name||'')).trim() || '—';
    var address = r.address || r.inspection_address || '—';
    var dateStr = r.inspection_date
      ? new Date(r.inspection_date + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
      : '—';
    var tier = (r.tier || 'Standard').toUpperCase();
    var status = r.status || 'submitted';
    var iurl = fixInvoiceUrl(r.invoice_url || '');
    // If invoice_url not set yet, construct from record id (invoice-receipt.html is the source of truth)
    if (!iurl && r.id) iurl = window.location.origin + '/invoice-receipt.html?id=' + r.id;

    html += '<div class="cr-card" style="border-left-color:var(--primary);">';
    html += '<div class="cr-card-body">';
    html += '<div class="cr-card-top">';
    html += '<div class="cr-card-name">' + esc(clientName) + '</div>';
    html += '<div class="cr-card-badges">';
    html += '<span class="cr-pill cr-pill-tier">' + esc(tier) + '</span>';
    html += '</div></div>';
    html += '<div class="cr-card-address">' + esc(address) + '</div>';
    html += '<div class="cr-card-meta">';
    html += '<span class="cr-pill cr-pill-' + status + '">' + status + '</span>';
    html += '<span class="cr-card-meta-item">📅 ' + dateStr + '</span>';
    if (r.inspector_name) html += '<span class="cr-card-meta-item">👤 ' + esc(r.inspector_name) + '</span>';
    html += '</div>';
    html += '</div>';

    html += '<div class="cr-card-actions" data-iurl="' + esc(iurl) + '" data-rid="' + r.id + '">';
    html += '<button class="cr-card-btn cr-btn-view" data-iv-action="view">View Invoice</button>';
    html += '<button class="cr-card-btn cr-btn-copy" data-iv-action="copy">Copy Invoice URL</button>';
    html += '<button class="cr-card-btn cr-btn-resend" data-iv-action="resend">Send Invoice</button>';
    html += '</div>';
    html += '</div>';
  });
  el.innerHTML = html;
}

// Invoice tab action delegation
document.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-iv-action]');
  if (!btn) return;
  var wrap = btn.closest('[data-iurl]');
  if (!wrap) return;
  var iurl = wrap.getAttribute('data-iurl');
  var rid  = wrap.getAttribute('data-rid');
  var action = btn.getAttribute('data-iv-action');
  var noUrl = function(b) { var o = b.textContent; b.textContent = 'Not available yet'; setTimeout(function() { b.textContent = o; }, 2000); };
  if (action === 'view')   { if (iurl) window.open(iurl, '_blank'); else noUrl(btn); }
  if (action === 'copy')   { if (iurl) copyCrUrl(iurl, btn); else noUrl(btn); }
  if (action === 'resend') { if (rid) resendCrInvoice(rid, btn); else noUrl(btn); }
});

// Wire invoice search
document.addEventListener('input', function(e) {
  if (e.target && e.target.id === 'invFilterSearch') renderInvoices();
});

window.renderInvoices = renderInvoices;
