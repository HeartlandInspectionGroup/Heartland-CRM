/**
 * scripts/admin-draft-cleanup.js — Draft Cleanup tab (HEA-233)
 * Extracted from admin.html main IIFE.
 * Reads: window._hbShared.cfg, window._hbShared.records
 * Uses: getAuthHeader() (stays in main IIFE, global), hwConfirm/hwAlert (hw-dialogs)
 */

function renderDraftCleanup() {
  var cfg = window._hbShared.cfg;
  var enabled = cfg && cfg.draftCleanup && cfg.draftCleanup.enabled;
  var days    = (cfg && cfg.draftCleanup && cfg.draftCleanup.days) || 30;
  document.getElementById('draftCleanupEnabled').checked = !!enabled;
  document.getElementById('draftCleanupDays').value = days;

  document.getElementById('draftCleanupEnabled').onchange = function() {
    if (!cfg.draftCleanup) cfg.draftCleanup = {};
    cfg.draftCleanup.enabled = this.checked;
  };
  document.getElementById('draftCleanupDays').oninput = function() {
    if (!cfg.draftCleanup) cfg.draftCleanup = {};
    cfg.draftCleanup.days = parseInt(this.value) || 30;
  };
  document.getElementById('draftCleanupPreviewBtn').onclick   = checkDraftCleanupCount;
  document.getElementById('draftDeleteEligibleBtn').onclick   = deleteEligibleDrafts;
  document.getElementById('draftSeeAllBtn').onclick           = loadAllDrafts;
  document.getElementById('draftDeleteAllBtn').onclick        = deleteAllDrafts;
}

function _draftCutoff() {
  var days = parseInt(document.getElementById('draftCleanupDays').value) || 30;
  return new Date(Date.now() - days * 86400000).toISOString();
}

function checkDraftCleanupCount() {
  var cutoff  = _draftCutoff();
  var countEl = document.getElementById('draftCleanupCount');
  var delBtn  = document.getElementById('draftDeleteEligibleBtn');
  var inspectionRecordsData = window._hbShared.records || [];
  var n = inspectionRecordsData.filter(function(r) {
    var ts = r.updated_at || r.created_at || '';
    return r.status === 'scheduled' && ts < cutoff;
  }).length;
  countEl.textContent = n + ' scheduled record' + (n !== 1 ? 's' : '') + ' eligible';
  countEl.style.color = n > 0 ? 'var(--red)' : 'var(--secondary)';
  if (delBtn) delBtn.style.display = n > 0 ? '' : 'none';
}

async function deleteEligibleDrafts() {
  var cutoff = _draftCutoff();
  var days   = parseInt(document.getElementById('draftCleanupDays').value) || 30;
  if (!await hwConfirm('Delete all scheduled records older than ' + days + ' days? This cannot be undone.', {title:'Delete Old Records', confirmLabel:'Delete'})) return;
  fetch('/.netlify/functions/delete-record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
    body: JSON.stringify({ status: 'scheduled', older_than: cutoff })
  }).then(function(r){ return r.json(); }).then(function(res) {
    if (res.error) { hwAlert('Error: ' + res.error); return; }
    window._hbShared.records = (window._hbShared.records || []).filter(function(r) {
      return !(r.status === 'scheduled' && (r.updated_at || r.created_at) < cutoff);
    });
    checkDraftCleanupCount();
    loadAllDrafts();
    if (typeof refreshClientRecords === 'function') refreshClientRecords();
  }).catch(function(err){ hwAlert('Error: ' + err.message); });
}

function loadAllDrafts() {
  var listEl = document.getElementById('draftCleanupList');
  if (!listEl) return;
  listEl.style.display = '';

  var inspectionRecordsData = window._hbShared.records || [];
  var rows = inspectionRecordsData
    .filter(function(r) { return r.status === 'scheduled'; })
    .sort(function(a, b) {
      var ta = a.updated_at || a.created_at || '';
      var tb = b.updated_at || b.created_at || '';
      return tb.localeCompare(ta);
    });

  if (!rows.length) {
    listEl.innerHTML = '<p style="font-size:13px;color:var(--secondary);padding:12px 0;">No scheduled records found.</p>';
    return;
  }
  var cutoff = _draftCutoff();
  listEl.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;">' +
    rows.map(function(r) {
      var ts         = r.updated_at || r.created_at || '';
      var age        = ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) : '?';
      var isEligible = ts && ts < cutoff;
      var dateStr    = ts ? new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
      var name       = r.cust_name || '—';
      var addr       = r.address || r.inspection_address || '—';
      var tier       = r.tier ? ' — ' + r.tier : '';
      return '<div class="cr-card is-scheduled" style="margin-bottom:0;border:1.5px solid ' + (isEligible ? '#fca5a5' : '#e8eaed') + ';">' +
        '<div class="cr-card-body">' +
          '<div class="cr-card-top">' +
            '<div class="cr-card-name">' + esc(name) + '</div>' +
            '<div class="cr-card-badges">' +
              (isEligible ? '<span style="font-size:11px;font-weight:700;color:var(--red);padding:3px 8px;background:rgba(239,68,68,0.1);border-radius:20px;">' + age + 'd old — eligible</span>' : '<span style="font-size:11px;color:var(--text-light);">' + age + 'd old</span>') +
            '</div>' +
          '</div>' +
          '<div class="cr-card-address">' + esc(addr) + esc(tier) + '</div>' +
          '<div class="cr-card-meta">' +
            '<span class="cr-pill cr-pill-scheduled">scheduled</span>' +
            '<span class="cr-card-meta-item">📅 ' + dateStr + '</span>' +
            (r.inspector_name ? '<span class="cr-card-meta-item">👤 ' + esc(r.inspector_name) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="cr-card-actions">' +
          '<button data-did="' + r.id + '" class="draft-single-del cr-card-btn cr-btn-delete" data-action="delete">Delete</button>' +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>';

  listEl.querySelectorAll('.draft-single-del').forEach(function(btn) {
    btn.onclick = async function() {
      var did = this.dataset.did;
      if (!await hwConfirm('Delete this scheduled record? This cannot be undone.', {title:'Delete Record', confirmLabel:'Delete'})) return;
      this.textContent = 'Deleting...';
      this.disabled = true;
      fetch('/.netlify/functions/delete-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ id: did })
      }).then(function(r){ return r.json(); }).then(function(res) {
        if (res.error) { hwAlert('Error deleting record: ' + res.error); loadAllDrafts(); return; }
        window._hbShared.records = (window._hbShared.records || []).filter(function(r) { return r.id !== did; });
        loadAllDrafts();
        checkDraftCleanupCount();
        if (typeof refreshClientRecords === 'function') refreshClientRecords();
      }).catch(function(err) {
        hwAlert('Error deleting record: ' + err.message);
        loadAllDrafts();
      });
    };
  });
}

async function deleteAllDrafts() {
  if (!await hwConfirm('Delete ALL scheduled records? This cannot be undone.', {title:'Delete All Records', confirmLabel:'Delete All'})) return;
  fetch('/.netlify/functions/delete-record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
    body: JSON.stringify({ status: 'scheduled' })
  }).then(function(r){ return r.json(); }).then(function(res) {
    if (res.error) { hwAlert('Error: ' + res.error); return; }
    window._hbShared.records = (window._hbShared.records || []).filter(function(r) { return r.status !== 'scheduled'; });
    loadAllDrafts();
    checkDraftCleanupCount();
    if (typeof refreshClientRecords === 'function') refreshClientRecords();
  }).catch(function(err){ hwAlert('Error: ' + err.message); });
}

window.renderDraftCleanup = renderDraftCleanup;
window.loadAllDrafts = loadAllDrafts;
