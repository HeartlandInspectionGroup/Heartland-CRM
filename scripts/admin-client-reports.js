/**
 * scripts/admin-client-reports.js — Client Reports tab (HEA-235)
 * Extracted from QC IIFE in admin.html.
 * Uses: esc(), copyCrUrl(), resendCrReport() (all global via window.*)
 * Reads: window._hbShared.records, window._hbShared.clients
 */

function renderClientReports() {
  var el = document.getElementById('rpRecordsTable');
  if(!el) return;
  var searchEl = document.getElementById('rpSearch');
  var q = searchEl ? searchEl.value.toLowerCase() : '';
  var clientMap = {};
  var clients = (window._hbShared && window._hbShared.clients) || [];
  var records = (window._hbShared && window._hbShared.records) || [];
  clients.forEach(function(c){ clientMap[c.id] = c; });

  var submitted = ['submitted','delivered','approved'];
  var filtered = records.filter(function(r){
    if(submitted.indexOf(r.status) === -1) return false;
    if(!q) return true;
    var c = clientMap[r.client_id] || {};
    var name = (r.cust_name || ((c.first_name||'') + ' ' + (c.last_name||'')).trim()).toLowerCase();
    var addr = (r.address || r.inspection_address || '').toLowerCase();
    return name.indexOf(q) !== -1 || addr.indexOf(q) !== -1;
  });

  if(!filtered.length) {
    el.innerHTML = '<div class="cr-empty" style="padding:32px;text-align:center;color:#aaa;">No submitted reports found.</div>';
    return;
  }

  var html = '';
  filtered.forEach(function(r){
    var c = clientMap[r.client_id] || {};
    var clientName = r.cust_name || ((c.first_name||'') + ' ' + (c.last_name||'')).trim() || '—';
    var address = r.address || r.inspection_address || '—';
    var dateStr = r.inspection_date ? new Date(r.inspection_date + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
    var tier = (r.tier || 'Standard').toUpperCase();
    var scoreLabel = r.score != null ? r.score + ' (A)' : null;
    var status = r.status || 'submitted';

    html += '<div class="cr-card is-' + status + '">';
    html += '<div class="cr-card-body">';
    html += '<div class="cr-card-top">';
    html += '<div class="cr-card-name">' + esc(clientName) + '</div>';
    html += '<div class="cr-card-badges">';
    if(scoreLabel) html += '<span class="cr-pill cr-pill-score">' + esc(scoreLabel) + '</span>';
    html += '<span class="cr-pill cr-pill-tier">' + esc(tier) + '</span>';
    html += '</div></div>';
    html += '<div class="cr-card-address">' + esc(address) + '</div>';
    html += '<div class="cr-card-meta">';
    html += '<span class="cr-pill cr-pill-' + status + '">' + status + '</span>';
    html += '<span class="cr-card-meta-item">📅 ' + dateStr + '</span>';
    if(r.inspector_name) html += '<span class="cr-card-meta-item">👤 ' + esc(r.inspector_name) + '</span>';
    html += '</div>';
    html += '</div>';

    // Actions — data attrs to avoid quote issues
    var rpRurl = r.report_url || '';
    if (!rpRurl && r.id) rpRurl = window.location.origin + '/report.html?id=' + r.id;
    html += '<div class="cr-card-actions" data-rurl="' + esc(rpRurl) + '" data-rid="' + r.id + '">';
    html += '<button class="cr-card-btn cr-btn-view" data-rp-action="view">View Report</button>';
    html += '<button class="cr-card-btn cr-btn-copy" data-rp-action="copy">Copy Report URL</button>';
    html += '<button class="cr-card-btn cr-btn-resend" data-rp-action="resend">Send Report</button>';
    html += '</div>';
    html += '</div>';
  });
  el.innerHTML = html;
}

// Reports tab action delegation
document.addEventListener('click', function(e){
  var btn = e.target.closest('[data-rp-action]');
  if(!btn) return;
  var wrap = btn.closest('[data-rurl]');
  if(!wrap) return;
  var rurl = wrap.getAttribute('data-rurl');
  var rid = wrap.getAttribute('data-rid');
  var action = btn.getAttribute('data-rp-action');
  var noUrl = function(b){ var o=b.textContent; b.textContent='Not available yet'; setTimeout(function(){ b.textContent=o; },2000); };
  if(action === 'view') { if(rurl) window.open(rurl,'_blank'); else noUrl(btn); }
  else if(action === 'copy') { if(rurl) copyCrUrl(rurl,btn); else noUrl(btn); }
  else if(action === 'resend') { if(rid) resendCrReport(rid,btn); else noUrl(btn); }
});

// Wire up reports search
document.addEventListener('input', function(e){
  if(e.target && e.target.id === 'rpSearch') renderClientReports();
});

window.renderClientReports = renderClientReports;
