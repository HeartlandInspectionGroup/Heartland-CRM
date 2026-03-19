/**
 * scripts/admin-audit-log.js — Audit Log tab (HEA-234)
 * Extracted from QC IIFE in admin.html.
 * Uses: esc(), getAuthHeaderLocal(), sbFetch(), hwConfirm(), hwAlert(), hwToast() (all global via admin-utils.js)
 * Netlify: get-audit-log, clear-audit-log
 */

var AUDIT_ACTIONS_BY_CAT = {
  scheduling:  ['booking.created','booking.rescheduled','booking.cancelled'],
  agreements:  ['agreement.signed','agreement.sent','agreement.viewed'],
  payments:    ['payment.field','payment.online','payment.stripe_webhook'],
  inspection:  ['draft.saved','report.submitted','report.delivered'],
  agent:       ['agent.assigned','report.release.authorized','report.release.revoked'],
  admin:       ['qa.approved','qa.revision_requested','record.updated'],
};

var ACTION_LABELS = {
  'booking.created':             'Booking Created',
  'booking.rescheduled':         'Booking Rescheduled',
  'booking.cancelled':           'Booking Cancelled',
  'agreement.signed':            'Agreement Signed',
  'agreement.sent':              'Agreement Sent',
  'agreement.viewed':            'Agreement Viewed',
  'payment.field':               'Field Payment Recorded',
  'payment.online':              'Online Payment Completed',
  'payment.stripe_webhook':      'Stripe Payment (Webhook)',
  'draft.saved':                 'Draft Saved',
  'report.submitted':            'Report Submitted',
  'report.delivered':            'Report Delivered',
  'agent.assigned':              'Agent Assigned',
  'report.release.authorized':   'Report Release Authorized',
  'report.release.revoked':      'Report Release Revoked',
  'qa.approved':                 'QA Approved',
  'qa.revision_requested':       'QA Revision Requested',
  'record.updated':              'Record Updated',
};

var CAT_COLORS = {
  scheduling:  '#3b82f6',
  agreements:  '#8b5cf6',
  payments:    '#10b981',
  inspection:  '#f59321',
  agent:       '#06b6d4',
  admin:       '#e74c3c',
};

function auditUpdateActionFilter() {
  var cat = document.getElementById('auditCategoryFilter').value;
  var sel = document.getElementById('auditActionFilter');
  var actions = cat ? (AUDIT_ACTIONS_BY_CAT[cat] || []) : [];
  sel.innerHTML = '<option value="">All Events</option>' +
    actions.map(function(a){ return '<option value="' + a + '">' + (ACTION_LABELS[a] || a) + '</option>'; }).join('');
}

async function loadAuditLog() {
  var list   = document.getElementById('auditLogList');
  var from   = document.getElementById('auditDateFrom').value;
  var to     = document.getElementById('auditDateTo').value;
  var cat    = document.getElementById('auditCategoryFilter').value;
  var action = document.getElementById('auditActionFilter').value;
  var search = (document.getElementById('auditSearch').value || '').toLowerCase().trim();

  list.innerHTML = '<p style="padding:20px;color:#888;">Loading...</p>';

  var params = new URLSearchParams({ limit: 500 });
  if (from)   params.set('from',     from);
  if (to)     params.set('to',       to);
  if (cat)    params.set('category', cat);
  if (action) params.set('action',   action);

  var authHdr;
  try { authHdr = await getAuthHeaderLocal(); } catch(e) { authHdr = {}; }
  fetch('/.netlify/functions/get-audit-log?' + params.toString(), {
    headers: authHdr
  }).then(function(r){
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(rows) {
    if (!Array.isArray(rows)) {
      list.innerHTML = '<p style="padding:20px;color:#e74c3c;">Unexpected response from audit log.</p>';
      return;
    }
    if (!rows || !rows.length) {
      list.innerHTML = '<p style="padding:20px;color:#888;">No audit log entries found.</p>';
      return;
    }

    // Client-side search filter on details fields
    if (search) {
      rows = rows.filter(function(entry) {
        var d = entry.details || {};
        var hay = [d.address, d.client, d.client_email, entry.actor, entry.action].filter(Boolean).join(' ').toLowerCase();
        return hay.indexOf(search) !== -1;
      });
    }

    if (!rows.length) {
      list.innerHTML = '<p style="padding:20px;color:#888;">No results match your search.</p>';
      return;
    }

    var html = '<style>' +
      '.al-row{position:relative;cursor:default;}' +
      '.al-row:hover{background:#f8f9fa;}' +
      '.al-tip{display:none;position:absolute;left:0;top:100%;z-index:9999;background:#1a2a44;color:#fff;border-radius:10px;padding:12px 16px;min-width:260px;max-width:360px;box-shadow:0 8px 24px rgba(0,0,0,0.18);font-size:12px;line-height:1.8;white-space:normal;pointer-events:none;}' +
      '.al-row:hover .al-tip{display:block;}' +
      '@media(max-width:768px){.al-tip{position:fixed;left:12px;right:12px;top:auto;bottom:80px;max-width:none;}}' +
      '</style>' +
      '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">' +
      '<thead><tr style="background:#f8f9fa;border-bottom:2px solid #e8eaed;">' +
        '<th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;">Client</th>' +
        '<th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;">Category</th>' +
        '<th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;">Event</th>' +
        '<th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;">Actor</th>' +
        '<th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;">Time</th>' +
        '<th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;"></th>' +
      '</tr></thead><tbody>';

    rows.forEach(function(entry) {
      var time       = new Date(entry.created_at).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
      var catColor   = CAT_COLORS[entry.category] || '#888';
      var catLabel   = (entry.category || 'system').charAt(0).toUpperCase() + (entry.category || 'system').slice(1);
      var actionLabel = ACTION_LABELS[entry.action] || entry.action || '—';
      var actor      = entry.actor || 'system';
      var d          = entry.details || {};
      var clientStr  = d.client || d.client_email || '—';
      var tipLines = [];
      if (d.client)       tipLines.push('<strong>Client:</strong> ' + esc(d.client));
      if (d.client_email) tipLines.push('<strong>Email:</strong> ' + esc(d.client_email));
      if (d.address)      tipLines.push('<strong>Address:</strong> ' + esc(d.address));
      if (d.agent_name)   tipLines.push('<strong>Agent:</strong> ' + esc(d.agent_name));
      if (d.method)       tipLines.push('<strong>Method:</strong> ' + esc(d.method));
      if (d.amount)       tipLines.push('<strong>Amount:</strong> $' + esc(String(d.amount)));
      if (d.new_date)     tipLines.push('<strong>New Date:</strong> ' + esc(d.new_date) + (d.new_time ? ' at ' + esc(d.new_time) : ''));
      if (d.notes)        tipLines.push('<strong>Notes:</strong> ' + esc(d.notes));
      if (d.source)       tipLines.push('<strong>Source:</strong> ' + esc(d.source));
      if (!tipLines.length) tipLines.push('<em style="color:rgba(255,255,255,0.4);">No additional details</em>');
      tipLines.push('<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.4);font-size:11px;">' + esc(time) + '</div>');

      html += '<tr class="al-row" style="border-bottom:1px solid #f0f2f4;">' +
        '<td style="padding:10px 12px;font-weight:600;color:#1a2a44;">' + esc(clientStr) +
          '<div class="al-tip">' + tipLines.join('<br>') + '</div>' +
        '</td>' +
        '<td style="padding:10px 12px;">' +
          '<span style="background:' + catColor + '22;color:' + catColor + ';padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">' + esc(catLabel) + '</span>' +
        '</td>' +
        '<td style="padding:10px 12px;font-weight:600;color:#1a2a44;">' + esc(actionLabel) + '</td>' +
        '<td style="padding:10px 12px;color:#666;font-size:12px;">' + esc(actor) + '</td>' +
        '<td style="padding:10px 12px;color:#888;font-size:12px;white-space:nowrap;">' + esc(time) + '</td>' +
        '<td style="padding:10px 12px;">' + (entry.action === 'agreement.signed' && entry.record_id ? '<button class="cr-btn cr-btn-sm" data-al-view-sig="' + esc(entry.record_id) + '" style="font-size:11px;padding:3px 10px;white-space:nowrap;">View Signature</button>' : '') + '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    list.innerHTML = html;
  }).catch(function() {
    list.innerHTML = '<p style="padding:20px;color:#e74c3c;">Error loading audit log.</p>';
  });
}

window.loadAuditLog = loadAuditLog;

// ── View Signature from Audit Log ─────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var auditList = document.getElementById('auditLogList');
  if (auditList) auditList.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-al-view-sig]');
    if (!btn) return;
    var recordId = btn.getAttribute('data-al-view-sig');
    var sigs = (window._hbShared && window._hbShared.waiverSignatures) || [];
    var match = sigs.find(function(s) { return s.inspection_record_id === recordId; });
    if (match && window.laViewSignatureDetails) {
      window.laViewSignatureDetails(match.id);
    } else {
      hwAlert('No signature record found for this inspection.', { title: 'Not Found' });
    }
  });

  var refreshBtn = document.getElementById('auditRefreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadAuditLog);

  var clearBtn = document.getElementById('auditClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', async function() {
    if (!await hwConfirm('Delete all audit log entries? This cannot be undone.', { title: 'Clear Audit Log', confirmLabel: 'Yes, Clear It', confirmColor: '#c0392b' })) return;
    var btn = document.getElementById('auditClearBtn');
    btn.disabled = true; btn.textContent = 'Clearing...';
    fetch('/.netlify/functions/clear-audit-log', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeaderLocal()) }
    }).then(function(r){ return r.json(); }).then(function(d) {
      btn.disabled = false; btn.textContent = 'Clear Log';
      if (d.ok) { hwToast('Audit log cleared.'); loadAuditLog(); }
      else hwAlert('Error: ' + (d.error || 'Unknown error'));
    }).catch(function() {
      btn.disabled = false; btn.textContent = 'Clear Log';
      hwAlert('Network error clearing log.');
    });
  });

  var catFilter = document.getElementById('auditCategoryFilter');
  if (catFilter) catFilter.addEventListener('change', function() {
    auditUpdateActionFilter();
    loadAuditLog();
  });

  var actionFilter = document.getElementById('auditActionFilter');
  if (actionFilter) actionFilter.addEventListener('change', loadAuditLog);

  var dateFrom = document.getElementById('auditDateFrom');
  if (dateFrom) dateFrom.addEventListener('change', loadAuditLog);

  var dateTo = document.getElementById('auditDateTo');
  if (dateTo) dateTo.addEventListener('change', loadAuditLog);

  var searchInput = document.getElementById('auditSearch');
  if (searchInput) searchInput.addEventListener('input', loadAuditLog);
});
