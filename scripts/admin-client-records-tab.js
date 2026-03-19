/**
 * scripts/admin-client-records-tab.js — Client Records tab (HEA-237)
 * Extracted from admin.html main IIFE.
 * The heaviest extraction in the admin modularization epic.
 */

// ── Module-local state ───────────────────────────────────────
var crScheduledSearchTimer = null;
var _dpSelectedMethod = null;
var _crSchSelectedId = null;
var _crHistSelectedEmail = null;
var _crHistClients = [];
var crSectionState = { scheduled: true, history: true };
var _crSchDetailWired = false;

// ═══ CLIENT RECORDS ════════════════════════════════════════
async function refreshClientRecords(){
  var [cRes, irRes] = await Promise.all([
    window._hbShared.sb.from('clients').select('*').order('created_at', { ascending: false }),
    window._hbShared.sb.from('inspection_records').select('*').order('inspection_date', { ascending: false })
  ]);
  window._hbShared.clients = cRes.data || [];
  window._hbShared.records = irRes.data || [];
  renderClientRecords();
  if(window.renderClientReports) window.renderClientReports();
  if(window.renderInvoices) window.renderInvoices();
}

function renderClientRecords(){
  renderCRRecords();
  // Populate category dropdown
  var catSel = document.getElementById('crCategory');
  if(catSel){
    var opts = '<option value="">— Select —</option>';
    (window._hbShared.categories || []).forEach(function(c){ opts += '<option value="' + c.id + '">' + c.name + '</option>'; });
    catSel.innerHTML = opts;
  }
}

// ── Section collapse/expand ───────────────────────────────────
function toggleCrSection(section) {
  crSectionState[section] = !crSectionState[section];
  var isOpen = crSectionState[section];
  var bodyMap = { scheduled: 'crScheduledBody', history: 'crHistoryBody' };
  var ctrlMap = { scheduled: 'crScheduledControls', history: 'crHistoryControls' };
  var chevMap = { scheduled: 'crScheduledChevron', history: 'crHistoryChevron' };
  var body     = document.getElementById(bodyMap[section] || '');
  var controls = document.getElementById(ctrlMap[section] || '');
  var chevron  = document.getElementById(chevMap[section] || '');
  if (body)     body.classList.toggle('collapsed', !isOpen);
  if (controls) controls.style.display = isOpen ? '' : 'none';
  if (chevron)  chevron.classList.toggle('collapsed', !isOpen);
}

// ── CSV export (submitted records only) ───────────────────────
function exportCrCSV() {
  var submitted = (window._hbShared.records || []).filter(function(r){ return r.status === 'submitted'; });
  var csv = 'Client Name,Email,Phone,Address,Date,Job Type,Inspector\n';
  submitted.forEach(function(r){
    var name = r.cust_name || '';
    csv += [name, r.cust_email||'', r.cust_phone||'', r.address||'', r.inspection_date||'', formatJobType(r), r.inspector_name||'']
      .map(function(v){ return '"' + String(v).replace(/"/g,'""') + '"'; }).join(',') + '\n';
  });
  var blob = new Blob([csv], { type: 'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'client-records.csv'; a.click();
}

// ── Render both sections ──────────────────────────────────────
function renderCRRecords() {
  renderScheduledSection();
  renderHistorySection();
  updateNarrativeBar();
}

// ── SCHEDULED SECTION (Two-Pane) ──────────────────────────────

function renderScheduledSection() {
  var el = document.getElementById('crScheduledList');
  if (!el) return;
  var q = (document.getElementById('crScheduledSearch') ? document.getElementById('crScheduledSearch').value : '').toLowerCase().trim();
  var allRecs = (window._hbShared.records || []);

  // Fix 2: Show main inspections only — exclude add-ons that have a parent
  var records = allRecs.filter(function(r){
    return r.status === 'scheduled' && !r.parent_record_id;
  });
  if (q) {
    records = records.filter(function(r){
      return (r.cust_name||'').toLowerCase().indexOf(q) !== -1;
    });
  }
  records.sort(function(a,b){
    var da = a.inspection_date || a.created_at || '';
    var db = b.inspection_date || b.created_at || '';
    return db.localeCompare(da);
  });

  // Fix 3: Legend
  var html = '<div style="display:flex;gap:14px;padding:6px 12px 8px;font-size:10px;color:var(--text-light);align-items:center;">';
  html += '<span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#e8a020;display:inline-block;"></span> In progress</span>';
  html += '<span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#1a7a4a;display:inline-block;"></span> All done</span>';
  html += '</div>';

  // Render list items
  records.forEach(function(r){
    var name = r.cust_name || '—';
    var dateStr = r.inspection_date ? new Date(r.inspection_date + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
    var tier = r.category === 'addon' ? addonTierLabel(r.tier||'') : (r.tier||'Standard');
    var isActive = _crSchSelectedId === r.id;

    // Fix 3: Status color coding — check appointment group
    var addons = allRecs.filter(function(x){ return x.parent_record_id === r.id; });
    var group = [r].concat(addons);
    var doneStatuses = ['submitted','delivered','approved','completed'];
    var allDone = group.every(function(x){ return doneStatuses.indexOf(x.status) !== -1; });
    var borderColor = allDone ? '#1a7a4a' : '#e8a020';

    html += '<div class="tp-list-item' + (isActive ? ' tp-active' : '') + '" data-cr-sch-id="' + r.id + '" style="border-left:3px solid ' + borderColor + ';">';
    html += '<div class="tp-list-name">' + esc(name) + '</div>';
    html += '<div class="tp-list-meta">';
    html += '<span class="tp-list-badge scheduled">' + esc(tier) + '</span>';
    if (r.payment_status === 'paid') html += '<span class="tp-list-badge paid">Paid</span>';
    else html += '<span class="tp-list-badge unpaid">Unpaid</span>';
    if (dateStr) html += '<span>' + dateStr + '</span>';
    // Fix 3: Add-on note
    if (addons.length) {
      var pending = addons.filter(function(x){ return x.status === 'scheduled'; }).length;
      var note = '+ ' + addons.length + ' add-on' + (addons.length > 1 ? 's' : '') + ', ';
      note += pending > 0 ? pending + ' pending' : 'all submitted';
      html += '<span style="font-style:italic;font-size:10px;color:var(--text-light);">' + note + '</span>';
    }
    html += '</div></div>';
  });
  el.innerHTML = html || '<div class="cr-empty" style="padding:20px;">No scheduled inspections.</div>';

  if (!_crSchSelectedId && records.length) crSchSelect(records[0].id);
  else if (_crSchSelectedId) crSchRenderDetail(_crSchSelectedId);
}

function crSchSelect(id) {
  _crSchSelectedId = id;
  document.querySelectorAll('#crScheduledList .tp-list-item').forEach(function(el){
    el.classList.toggle('tp-active', el.getAttribute('data-cr-sch-id') === id);
  });
  crSchRenderDetail(id);
  if (window.innerWidth <= 768) {
    document.getElementById('crSchListPane').classList.add('tp-mobile-hide');
    document.getElementById('crSchDetailPane').classList.add('tp-mobile-show');
  }
}

function crSchBackToList() {
  document.getElementById('crSchListPane').classList.remove('tp-mobile-hide');
  document.getElementById('crSchDetailPane').classList.remove('tp-mobile-show');
}

function crSchRenderDetail(id) {
  var pane = document.getElementById('crSchDetailPane');
  if (!pane) return;
  var r = (window._hbShared.records || []).find(function(x){ return x.id === id; });
  if (!r) { pane.innerHTML = '<div class="tp-detail-empty">Record not found</div>'; return; }

  var html = '<button class="tp-back-btn" onclick="crSchBackToList()">‹ Back to list</button>';

  // Re-use existing card rendering logic for detail pane
  var clientName = r.cust_name || '—';
  var address = r.address || '—';
  var dateStr = r.inspection_date ? new Date(r.inspection_date + 'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : '—';
  var tier = r.category === 'addon' ? addonTierLabel(r.tier||'') : (r.tier||'Standard');
  var isAddon = r.category === 'addon';
  var crIurl = fixInvoiceUrl(r.invoice_url || '');

  html += '<div class="tp-detail-header"><div class="tp-detail-name">' + esc(clientName) + '</div>';
  html += '<div class="tp-detail-badges">';
  html += '<span class="tp-list-badge scheduled">' + esc(tier) + '</span>';
  if (isAddon) html += '<span class="tp-list-badge" style="background:#8e44ad;color:#fff;">ADD-ON</span>';
  if (r.payment_status === 'paid') html += '<span class="tp-list-badge paid">Paid</span>';
  else html += '<span class="tp-list-badge unpaid">Unpaid</span>';
  html += '</div></div>';

  // Fix 4: Compact two-column detail grid
  var dateTime = dateStr + (r.inspection_time ? ' \u00b7 ' + esc(r.inspection_time) : '');
  var assignedAgent = r.agent_id ? (window._hbShared.agents || []).find(function(a){ return a.id === r.agent_id && a.role === 'agent'; }) : null;
  html += '<div class="cr-detail-grid">';
  html += '<div class="cr-detail-field cr-detail-full"><span class="cr-detail-label">Address</span><span class="cr-detail-val">' + esc(address) + '</span></div>';
  html += '<div class="cr-detail-field"><span class="cr-detail-label">Date &amp; time</span><span class="cr-detail-val">' + dateTime + '</span></div>';
  if (r.inspector_name) { html += '<div class="cr-detail-field"><span class="cr-detail-label">Inspector</span><span class="cr-detail-val">' + esc(r.inspector_name) + '</span></div>'; }
  if (r.cust_phone) { html += '<div class="cr-detail-field"><span class="cr-detail-label">Phone</span><span class="cr-detail-val">' + esc(r.cust_phone) + '</span></div>'; }
  if (r.cust_email) { html += '<div class="cr-detail-field"><span class="cr-detail-label">Email</span><span class="cr-detail-val">' + esc(r.cust_email) + '</span></div>'; }
  if (assignedAgent) { html += '<div class="cr-detail-field"><span class="cr-detail-label">Agent</span><span class="cr-detail-val">' + esc(assignedAgent.name||assignedAgent.email) + '</span></div>'; }
  if (r.final_total) { html += '<div class="cr-detail-field"><span class="cr-detail-label">Total</span><span class="cr-detail-val">$' + parseFloat(r.final_total).toFixed(2) + '</span></div>'; }
  html += '</div>';

  // Add-on grouping: find add-ons linked by parent_record_id, fallback to email+date
  if (!isAddon) {
    var addons = (window._hbShared.records || []).filter(function(x){
      if (x.id === r.id) return false;
      if (x.category !== 'addon' && x.category !== 'bundle_addon') return false;
      // Match by parent_record_id first, then soft-match by email+date
      if (x.parent_record_id === r.id) return true;
      return !x.parent_record_id &&
             (x.cust_email||'').toLowerCase() === (r.cust_email||'').toLowerCase() &&
             x.inspection_date === r.inspection_date;
    });
    if (addons.length) {
      var addonTotal = addons.reduce(function(s,a){ return s + (parseFloat(a.final_total)||0); }, 0);
      html += '<div class="tp-addon-group"><div class="tp-addon-label">Add-ons for this inspection</div>';
      addons.forEach(function(a){
        var addonName = esc(addonTierLabel(a.tier||''));
        var amt = a.final_total ? '$' + parseFloat(a.final_total).toFixed(2) : '';
        var doneStatuses = ['submitted','delivered','approved','completed'];
        var addonDone = doneStatuses.indexOf(a.status) !== -1;
        var statusText = addonDone ? a.status : 'scheduled';
        var statusLabel = addonDone ? 'Done' : 'Scheduled';
        var statusClass = addonDone ? 'paid' : 'scheduled';
        // Border color: blue if lab report, green if done, amber if scheduled
        var addonBorder = a.lab_report_url ? '#185fa5' : addonDone ? '#1a7a4a' : '#e8a020';

        // Build menu items based on status
        var menuItems = '';
        if (addonDone) {
          if (a.report_url) menuItems += '<button class="cr-overflow-item" onclick="window.open(\'' + esc(a.report_url) + '\')">View report</button>';
          if (a.report_url) menuItems += '<button class="cr-overflow-item" data-action="resend-report" data-rid="' + a.id + '">Send report</button>';
          if (a.lab_report_url) menuItems += '<button class="cr-overflow-item" onclick="window.open(\'' + esc(a.lab_report_url) + '\')">View lab report</button>';
          var aIurl = fixInvoiceUrl(a.invoice_url || '');
          if (!aIurl && a.id) aIurl = window.location.origin + '/invoice-receipt.html?id=' + a.id;
          if (aIurl) menuItems += '<button class="cr-overflow-item" onclick="window.open(\'' + esc(aIurl) + '\')">View invoice</button>';
        } else {
          menuItems += '<button class="cr-overflow-item" data-action="edit" data-rid="' + a.id + '">Edit</button>';
          menuItems += '<button class="cr-overflow-item" data-action="reschedule" data-rid="' + a.id + '" data-rbid="' + esc(a.booking_id||'') + '">Reschedule</button>';
          menuItems += '<button class="cr-overflow-item cr-overflow-danger" data-action="cancel" data-rid="' + a.id + '" data-rname="' + esc(a.cust_name||'') + '" data-rbid="' + esc(a.booking_id||'') + '">Cancel</button>';
        }

        html += '<div class="cr-addon-card" style="border-left:3px solid ' + addonBorder + ';">';
        html += '<div class="cr-addon-left"><div class="cr-addon-name">' + addonName + '</div>';
        html += '<div class="cr-addon-meta">' + amt + (amt && statusText ? ' \u00b7 ' : '') + statusText + '</div></div>';
        html += '<div class="cr-addon-right">';
        html += '<span class="tp-list-badge ' + statusClass + '">' + statusLabel + '</span>';
        html += '<div class="cr-addon-overflow"><button class="cr-overflow-btn" onclick="crToggleAddonMenu(this)">\u2022\u2022\u2022</button>';
        html += '<div class="cr-overflow-menu" style="display:none;">' + menuItems + '</div>';
        html += '</div></div></div>';
      });
      var groupTotal = (parseFloat(r.final_total)||0) + addonTotal;
      html += '<div class="tp-group-total">Appointment Total: $' + groupTotal.toFixed(2) + '</div>';
      html += '</div>';
    }
  }

  // Actions
  var clientEmail = r.cust_email || '';
  html += '<div class="tp-detail-actions" data-rid="' + r.id + '" data-rname="' + esc(clientName) + '" data-rurl="' + esc(r.report_url || (r.id ? (window.location.origin + '/report.html?id=' + r.id) : '')) + '" data-iurl="' + esc(crIurl) + '" data-remail="' + esc(clientEmail) + '" data-rbid="' + esc(r.booking_id||'') + '">';
  if (r.payment_status !== 'paid') {
    html += '<button class="cr-card-btn cr-mark-paid" data-action="mark-paid" data-amount="' + (r.final_total||0) + '" style="background:#27ae60;color:#fff;border:none;">Mark as Paid</button>';
  }
  html += '<button class="cr-card-btn cr-btn-edit" data-action="edit">Edit</button>';
  if (!isAddon) html += '<button class="cr-card-btn" style="background:#f59321;color:#fff;border:none;" data-action="reschedule">Reschedule</button>';
  html += '<button class="cr-card-btn" style="background:#c0392b;color:#fff;border:none;" data-action="cancel">Cancel</button>';

  // Overflow menu
  html += '<div class="tp-overflow-wrap"><button class="tp-overflow-btn" onclick="this.nextElementSibling.classList.toggle(\'open\')">•••</button>';
  html += '<div class="tp-overflow-menu">';
  html += '<button data-action="view-agreements">View Agreements</button>';
  if (clientEmail) {
    html += '<button data-action="send-portal">Send Portal Link</button>';
    html += '<button data-action="copy-portal">Copy Portal Link</button>';
  }
  html += '<button class="danger" data-action="delete">Delete</button>';
  html += '</div></div>';
  html += '</div>';

  pane.innerHTML = html;
}

// Legacy compatibility
var _origRenderScheduledSection = renderScheduledSection;

function _wireSchAgentDropdowns() {
  var pane = document.getElementById('crSchDetailPane');
  if (!pane) return;
  // Not needed in two-pane — agent shown as read-only in detail grid
}

// Stub to avoid breaking existing code that calls this directly
function renderScheduledSectionOld() { renderScheduledSection(); }

// ── NARRATIVE NOTIFICATION BAR (HEA-219) ─────────────────────
function updateNarrativeBar() {
  var bar = document.getElementById('narrativeNotifBar');
  if (!bar) return;
  var count = (window._hbShared.records || []).filter(function(r){ return r.status === 'narrative'; }).length;
  if (count === 0) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  document.getElementById('narrativeNotifText').textContent = '\ud83d\udcdd ' + count + ' inspection' + (count !== 1 ? 's' : '') + ' have narratives awaiting review.';
}

// ── CLIENT HISTORY SECTION (Two-Pane) ─────────────────────────

function renderHistorySection() {
  var el = document.getElementById('crHistoryList');
  if (!el) return;
  var q = (document.getElementById('crSearch') ? document.getElementById('crSearch').value : '').toLowerCase().trim();
  var submitted = (window._hbShared.records || []).filter(function(r){
    var validStatuses = ['submitted','in_progress','review','approved','delivered','cancelled'];
    return validStatuses.indexOf(r.status) !== -1;
  });
  var clientMap = {};
  submitted.forEach(function(r){
    var key = (r.cust_email || '').toLowerCase().trim() || ('nomail_' + r.id);
    if (!clientMap[key]) clientMap[key] = { name: r.cust_name || '—', email: r.cust_email || '', records: [] };
    clientMap[key].records.push(r);
  });
  Object.keys(clientMap).forEach(function(k){
    clientMap[k].records.sort(function(a,b){
      return (b.inspection_date||b.created_at||'').localeCompare(a.inspection_date||a.created_at||'');
    });
  });
  _crHistClients = Object.keys(clientMap).map(function(k){ return clientMap[k]; });
  _crHistClients.sort(function(a,b){
    var da = a.records[0] ? (a.records[0].inspection_date||a.records[0].created_at||'') : '';
    var db = b.records[0] ? (b.records[0].inspection_date||b.records[0].created_at||'') : '';
    return db.localeCompare(da);
  });
  if (q) {
    _crHistClients = _crHistClients.filter(function(c){
      return (c.name||'').toLowerCase().indexOf(q) !== -1 ||
             (c.email||'').toLowerCase().indexOf(q) !== -1 ||
             c.records.some(function(r){ return (r.address||'').toLowerCase().indexOf(q) !== -1 || (r.cust_phone||'').toLowerCase().indexOf(q) !== -1; });
    });
  }

  // Render list pane
  var html = '';
  _crHistClients.forEach(function(c){
    var safeEmail = esc(c.email);
    var latestDate = c.records[0] ? (c.records[0].inspection_date ? new Date(c.records[0].inspection_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '') : '';
    var isActive = _crHistSelectedEmail === c.email.toLowerCase().trim();
    html += '<div class="tp-list-item' + (isActive ? ' tp-active' : '') + '" data-cr-hist-email="' + safeEmail + '">';
    html += '<div class="tp-list-name">' + esc(c.name) + '</div>';
    html += '<div class="tp-list-meta">';
    html += '<span>' + c.records.length + ' inspection' + (c.records.length !== 1 ? 's' : '') + '</span>';
    if (latestDate) html += '<span>' + latestDate + '</span>';
    html += '</div></div>';
  });
  el.innerHTML = html || '<div class="cr-empty" style="padding:20px;">No client history found.</div>';

  if (!_crHistSelectedEmail && _crHistClients.length) crHistSelect(_crHistClients[0].email);
  else if (_crHistSelectedEmail) crHistRenderDetail(_crHistSelectedEmail);
}

function crHistSelect(email) {
  _crHistSelectedEmail = email.toLowerCase().trim();
  document.querySelectorAll('#crHistoryList .tp-list-item').forEach(function(el){
    var elEmail = (el.getAttribute('data-cr-hist-email')||'').toLowerCase().trim();
    el.classList.toggle('tp-active', elEmail === _crHistSelectedEmail);
  });
  crHistRenderDetail(_crHistSelectedEmail);
  if (window.innerWidth <= 768) {
    document.getElementById('crHistListPane').classList.add('tp-mobile-hide');
    document.getElementById('crHistDetailPane').classList.add('tp-mobile-show');
  }
}

function crHistBackToList() {
  document.getElementById('crHistListPane').classList.remove('tp-mobile-hide');
  document.getElementById('crHistDetailPane').classList.remove('tp-mobile-show');
}

function crHistRenderDetail(email) {
  var pane = document.getElementById('crHistDetailPane');
  if (!pane) return;
  var validStatuses = ['submitted','in_progress','review','approved','delivered','cancelled'];
  var records = (window._hbShared.records || []).filter(function(r){
    return validStatuses.indexOf(r.status) !== -1 && (r.cust_email||'').toLowerCase().trim() === email;
  });
  records.sort(function(a,b){
    return (b.inspection_date||b.created_at||'').localeCompare(a.inspection_date||a.created_at||'');
  });
  if (!records.length) { pane.innerHTML = '<div class="tp-detail-empty">No records found</div>'; return; }

  var clientName = records[0].cust_name || email;
  var clientPhone = records[0].cust_phone || '';
  var clientEmail = records[0].cust_email || '';
  var initials = clientName.split(' ').map(function(w){ return w.charAt(0); }).join('').substring(0,2).toUpperCase();

  var html = '<button class="tp-back-btn" onclick="crHistBackToList()">‹ Back to list</button>';
  html += '<div class="tp-detail-header">';
  html += '<div class="tp-avatar">' + esc(initials) + '</div>';
  html += '<div><div class="tp-detail-name">' + esc(clientName) + '</div>';
  html += '<div style="font-size:12px;color:var(--text-light);">' + esc(clientEmail);
  if (clientPhone) html += ' \u00b7 ' + esc(clientPhone);
  html += '</div></div></div>';

  // Group records by inspection_date for appointment grouping
  records.forEach(function(r){
    var jobType = formatJobType(r);
    var address = r.address || '—';
    var dateStr = r.inspection_date ? new Date(r.inspection_date + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
    var crIurl = fixInvoiceUrl(r.invoice_url || '');
    if (!crIurl && r.id) crIurl = window.location.origin + '/invoice-receipt.html?id=' + r.id;
    var rurl = r.report_url || (r.id ? (window.location.origin + '/report.html?id=' + r.id) : '');
    var isCancelled = r.status === 'cancelled';
    var histIsAddon = r.category === 'addon' || r.category === 'bundle_addon';

    html += '<div style="margin-bottom:12px;padding:12px 14px;border:1px solid #e8eaed;border-radius:10px;' + (isCancelled ? 'opacity:0.65;' : '') + (histIsAddon ? 'margin-left:16px;border-left:2px solid #8e44ad;' : '') + '">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
    html += '<strong style="font-size:13px;color:var(--text-dark);">' + esc(jobType) + '</strong>';
    if (histIsAddon) html += '<span class="tp-list-badge" style="background:#8e44ad;color:#fff;">Add-On</span>';
    if (isCancelled) html += '<span class="tp-list-badge cancelled">Cancelled</span>';
    html += '</div>';
    html += '<div style="font-size:12px;color:var(--text-light);margin-bottom:6px;">' + esc(address) + ' \u00b7 ' + dateStr + '</div>';

    if (!isCancelled) {
      html += '<div class="tp-detail-actions" style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;" data-rid="' + r.id + '" data-rname="' + esc(clientName) + '" data-rurl="' + esc(rurl) + '" data-iurl="' + esc(crIurl) + '" data-remail="' + esc(r.cust_email||'') + '" data-rbid="' + esc(r.booking_id||'') + '">';
      html += '<button class="cr-card-btn cr-btn-view" data-action="view-report">View Report</button>';
      html += '<button class="cr-card-btn cr-btn-view" data-action="view-invoice" style="background:#15516d;">View Invoice</button>';
      html += '<div class="tp-overflow-wrap"><button class="tp-overflow-btn" onclick="this.nextElementSibling.classList.toggle(\'open\')">•••</button>';
      html += '<div class="tp-overflow-menu">';
      html += '<button data-action="resend-report">Send Report</button>';
      html += '<button data-action="copy-report">Copy Report Link</button>';
      html += '<button data-action="resend-invoice">Send Invoice</button>';
      html += '<button data-action="copy-invoice">Copy Invoice Link</button>';
      html += '<button data-action="view-agreements">View Agreements</button>';
      html += '<button data-action="narratives">Narratives</button>';
      html += '</div></div>';
      html += '</div>';
    }
    html += '</div>';
  });

  pane.innerHTML = html;
}

// Compatibility: openCrHistoryModal now selects in the right pane instead of opening modal
function openCrHistoryModal(email) {
  crHistSelect(email);
}
function closeCrHistoryModal() {
  // No-op — modal removed
}

// ── Agreements Modal (admin) ──────────────────────────
// Strip <style> and <script> tags from agreement body before injecting as innerHTML
// Prevents agreement CSS from leaking into the admin page permanently
function stripStyles(html) {
  if (!html) return html;
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
}

// Substitute {{TOKENS}} in agreement body using inspection record data
// Mirrors the server-side substituteTokens() in get-agreements.js
function substituteTokensClient(body, rec) {
  if (!body || !rec) return body;
  var inspDate = '';
  if (rec.inspection_date) {
    var d = new Date(rec.inspection_date + 'T12:00:00');
    inspDate = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  var today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  var catMap = {
    home_inspection: 'Home Inspection', home_health_check: 'Home Health Check',
    new_construction: 'New Construction Inspection', addon: 'Add-On Service',
  };
  var servicesLabel = rec.category ? (catMap[rec.category] || rec.category) + (rec.tier ? ' \u2014 ' + rec.tier : '') : '';
  var pmMap = { cash:'Cash', check:'Check', card:'Credit/Debit Card', invoice:'Invoice', stripe_online:'Online Payment' };
  var feesLabel = rec.payment_method ? (pmMap[rec.payment_method] || rec.payment_method) : '';
  var price = rec.final_total ? Number(rec.final_total).toFixed(2) : '';
  var tokens = {
    '{{ADDRESS}}':            rec.address                || '',
    '{{INSPECTION_ADDRESS}}': rec.address                || '',
    '{{INSPECTION_DATE}}':    inspDate,
    '{{INSPECTION_TIME}}':    rec.inspection_time        || '',
    '{{CLIENT_NAME}}':        rec.cust_name              || '',
    '{{CLIENT_ADDRESS}}':     rec.client_current_address || '',
    '{{CLIENT_EMAIL}}':       rec.cust_email             || '',
    '{{CLIENT_PHONE}}':       rec.cust_phone             || '',
    '{{INSPECTOR_NAME}}':     rec.inspector_name         || '',
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

function openCrAgreementsModal(recordId, clientName) {
  var sigs     = (window._hbShared && window._hbShared.waiverSignatures) || [];
  var versions = (window._hbShared && window._hbShared.waiverVersions)   || [];
  var records  = (window._hbShared && window._hbShared.records)          || [];

  var recSigs = sigs.filter(function(s){ return s.inspection_record_id === recordId; });
  var sigMap  = {};
  recSigs.forEach(function(s){ sigMap[s.waiver_version_id] = s; });

  // Build applicable keys for this record (mirrors get-agreements / badge logic)
  var rec    = records.find(function(r){ return r.id === recordId; }) || {};
  var mCat   = rec.category || '';
  var mTier  = rec.tier     || '';
  var mAddrU = (rec.address || '').toUpperCase();
  var mState = mAddrU.includes(', IL') || mAddrU.includes(',IL') ? 'IL'
             : mAddrU.includes(', WI') || mAddrU.includes(',WI') ? 'WI' : null;
  var mKeys  = new Set(['*']);
  if (mCat) {
    mKeys.add(mCat);
    if (mTier)  mKeys.add(mCat + ':' + mTier);
    if (mState) mKeys.add(mCat + ':' + mState);
    if (mTier && mState) mKeys.add(mCat + ':' + mTier + ':' + mState);
  }
  if (mCat === 'home_inspection') {
    var mtl = mTier.toLowerCase().replace(/[- ]/g, '');
    if (mtl === 'prepurchase') { mKeys.add('pre-purchase'); if (mState) mKeys.add('pre-purchase:' + mState); }
    else if (mtl === 'prelisting') { mKeys.add('pre-listing'); if (mState) mKeys.add('pre-listing:' + mState); }
  }

  var activeVersions = versions.filter(function(v) {
    if (!v.is_active) return false;
    var at = Array.isArray(v.applies_to) ? v.applies_to : [];
    if (!at.length) return true; // universal — applies to all
    return at.some(function(k){ return mKeys.has(k); });
  });

  var modal = document.getElementById('crAgreementsModal');
  var body  = document.getElementById('crAgreementsModalBody');
  var title = document.getElementById('crAgreementsModalTitle');
  if (!modal) return;

  title.textContent = (clientName || 'Client') + ' \u2014 Inspection Agreements';

  if (!activeVersions.length) {
    body.innerHTML = '<p style="color:#888;padding:12px 0;font-size:14px;">No agreement templates found.</p>';
    modal.classList.add('open');
    return;
  }

  var html = '';
  activeVersions.forEach(function(v, idx) {
    var sig    = sigMap[v.id] || null;
    var dt     = sig && sig.signed_at ? new Date(sig.signed_at).toLocaleString('en-US',{ timeZone:'America/Chicago', dateStyle:'medium', timeStyle:'short' }) : '';
    var bodyId = 'cragrBody-' + idx;
    var isSigned  = !!sig;
    var headerBg  = isSigned ? '#f0faf4' : '#fff8f0';
    var badgeBg   = isSigned ? 'rgba(39,174,96,0.12)' : 'rgba(231,76,60,0.1)';
    var badgeCol  = isSigned ? '#27ae60' : '#e74c3c';
    var badgeTxt  = isSigned ? '&#10003; SIGNED' : 'NOT SIGNED';

    html += '<div style="border:1px solid #e5e9ef;border-radius:10px;overflow:hidden;margin-bottom:14px;">';

    // ── Clickable header row ──
    html += '<div onclick="window.crAgrToggle(\'' + bodyId + '\',this)" style="padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:' + headerBg + ';cursor:pointer;user-select:none;">';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-weight:700;color:#1a2530;font-size:14px;">' + esc(v.name) + ' <span style="font-weight:400;color:#aaa;font-size:12px;">v' + (v.version||1) + '</span></div>';
    if (sig) html += '<div style="font-size:12px;color:#555;margin-top:3px;">Signed by <strong>' + esc(sig.signed_name||'') + '</strong> &bull; ' + esc(dt) + '</div>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">';
    html += '<span style="padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;background:' + badgeBg + ';color:' + badgeCol + ';">' + badgeTxt + '</span>';
    if (isSigned) {
      html += '<a href="/agreement-receipt.html?record_id=' + encodeURIComponent(recordId) + '&waiver_version_id=' + encodeURIComponent(v.id) + '&admin=1" target="_blank" onclick="event.stopPropagation();" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#1a2e47;color:white;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none;white-space:nowrap;">&#128438; View / Print</a>';
    }
    html += '<span class="crAgrChevron" style="font-size:14px;color:#aaa;transition:transform 0.2s;display:inline-block;">&#9660;</span>';
    html += '</div>';
    html += '</div>'; // end header

    // ── Collapsible body — hidden by default ──
    html += '<div id="' + bodyId + '" style="display:none;border-top:1px solid #e5e9ef;">';
    html += '<div style="padding:16px 18px;">';
    var renderedBody = substituteTokensClient(stripStyles(v.body || ''), rec);
    html += '<div style="font-size:13px;color:#444;line-height:1.7;max-height:280px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:12px 14px;background:#fafafa;">' + (renderedBody || '<em style="color:#aaa;">No content</em>') + '</div>';

    // Signature block if signed
    if (sig) {
      html += '<div style="margin-top:16px;padding-top:14px;border-top:1px solid #e5e9ef;">';
      html += '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#aaa;margin-bottom:10px;">Signature Record</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start;">';
      if (sig.signature_data) {
        html += '<div><div style="font-size:11px;color:#aaa;margin-bottom:5px;">Drawn Signature</div>';
        html += '<img src="' + esc(sig.signature_data) + '" style="max-width:240px;height:70px;object-fit:contain;border:1px solid #e0e0e0;border-radius:6px;background:#f9f9f9;padding:4px;" alt="Signature"></div>';
      }
      html += '<div>';
      html += '<div style="font-size:11px;color:#aaa;margin-bottom:5px;">Signed By</div>';
      html += '<div style="font-size:16px;font-style:italic;color:#1a2530;font-family:Georgia,serif;">' + esc(sig.signed_name||'') + '</div>';
      html += '<div style="font-size:12px;color:#888;margin-top:4px;">' + esc(dt) + '</div>';
      if (sig.signature_method) html += '<div style="font-size:11px;color:#aaa;margin-top:4px;text-transform:capitalize;">Method: ' + esc(sig.signature_method) + '</div>';
      if (sig.ip_address) html += '<div style="font-size:11px;color:#aaa;margin-top:4px;">IP: ' + esc(sig.ip_address.split(',')[0].trim()) + '</div>';
      html += '</div></div></div>';
    }
    html += '</div>'; // end padding div
    html += '</div>'; // end collapsible body
    html += '</div>'; // end card
  });

  body.innerHTML = html;
  modal.classList.add('open');
}

// Toggle agreement body expand/collapse in admin agreements modal
function crAgrToggle(bodyId, headerEl) {
  var body    = document.getElementById(bodyId);
  if (!body) return;
  var chevron = headerEl ? headerEl.querySelector('.crAgrChevron') : null;
  var isOpen  = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

// ── Digital Payment Modal Logic ──────────────────────────

function _dpSelectMethod(method) {
  _dpSelectedMethod = method;
  var colors = { venmo: '#008CFF', paypal: '#003087', zelle: '#6D1ED4' };
  document.querySelectorAll('.dp-method-btn').forEach(function(b) {
    var m = b.getAttribute('data-method');
    if (m === method) {
      b.style.borderColor = colors[m] || '#27ae60';
      b.style.background = (colors[m] || '#27ae60') + '15';
      b.style.color = colors[m] || '#27ae60';
    } else {
      b.style.borderColor = '#e0e0e0';
      b.style.background = '#fff';
      b.style.color = '#333';
    }
  });
  _dpValidate();
}

function _dpValidate() {
  var btn = document.getElementById('dpConfirmBtn');
  var tid = (document.getElementById('dpTransactionId').value || '').trim();
  var ok = !!_dpSelectedMethod && !!tid;
  if (btn) {
    btn.disabled = !ok;
    btn.style.opacity = ok ? '1' : '0.4';
  }
}

async function _dpConfirm() {
  var rid = document.getElementById('dpRecordId').value;
  var method = _dpSelectedMethod;
  var tid = (document.getElementById('dpTransactionId').value || '').trim();
  var amt = parseFloat(document.getElementById('dpAmount').value) || 0;
  if (!rid || !method || !tid) return;

  var btn = document.getElementById('dpConfirmBtn');
  btn.disabled = true; btn.textContent = 'Recording...';

  try {
    var authHdr = await getAuthHeader();
    var res = await fetch('/.netlify/functions/record-digital-payment', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHdr),
      body: JSON.stringify({ record_id: rid, method_detail: method, transaction_id: tid, amount: amt }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Payment recording failed');

    document.getElementById('crDigitalPayModal').classList.remove('open');
    var label = { venmo: 'Venmo', paypal: 'PayPal', zelle: 'Zelle' }[method] || method;
    hwToast('Payment recorded \u2014 ' + label);

    // Update local data and refresh
    var rec = (window._hbShared.records || []).find(function(r) { return r.id === rid; });
    if (rec) {
      rec.payment_status = 'paid';
      rec.payment_method = 'digital';
      rec.payment_method_detail = method;
      rec.digital_transaction_id = tid;
    }
    renderScheduledSection();
    updateNarrativeBar();
  } catch (err) {
    hwAlert('Error: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Confirm Payment';
  }
}

// ── Edit Modal ──────────────────────────────────────────────

function openCrEditModal(recordId) {
  var r = (window._hbShared.records || []).find(function(x){ return x.id === recordId; });
  if(!r) return;
  var clientMap = {};
  (window._hbShared.clients || []).forEach(function(c){ clientMap[c.id] = c; });
  var c = clientMap[r.client_id] || {};
  document.getElementById('crEditRecordId').value = recordId;
  document.getElementById('crEditCategory').value = r.category || '';
  document.getElementById('crEditName').value = r.cust_name || ((c.first_name||'') + ' ' + (c.last_name||'')).trim() || '';
  document.getElementById('crEditPhone').value = r.cust_phone || c.phone || '';
  document.getElementById('crEditEmail').value = r.cust_email || c.email || '';
  document.getElementById('crEditAddress').value = r.address || r.inspection_address || '';

  // Show video upload for Sewer Scope records
  var isSewerScope = (r.category === 'addon' || r.category === 'bundle_addon') && r.tier === 'Sewer Scope';
  document.getElementById('crVideoUploadSection').style.display = isSewerScope ? 'block' : 'none';
  if (isSewerScope) {
    var existingVideo = r.form_data && r.form_data.sewer_video_url;
    var currentWrap = document.getElementById('crVideoCurrentWrap');
    var currentLink = document.getElementById('crVideoCurrentLink');
    if (existingVideo) {
      currentWrap.style.display = 'block';
      currentLink.href = existingVideo;
      currentLink.textContent = existingVideo.split('/').pop() || 'View video';
    } else {
      currentWrap.style.display = 'none';
    }
    document.getElementById('crVideoUploadStatus').textContent = existingVideo ? '\u2705 Video uploaded' : 'No video uploaded yet';
    document.getElementById('crVideoFileInput').value = '';
    document.getElementById('crVideoUploadBtn').textContent = '\ud83d\udce4 Upload Video';
    document.getElementById('crVideoUploadBtn').disabled = false;
  }

  document.getElementById('crEditModal').classList.add('open');
}

function closeCrEditModal() {
  document.getElementById('crEditModal').classList.remove('open');
}

async function handleCrVideoUpload(input) {
  var file = input.files[0];
  if (!file) return;
  var recordId = document.getElementById('crEditRecordId').value;
  var statusEl = document.getElementById('crVideoUploadStatus');
  var btn      = document.getElementById('crVideoUploadBtn');

  btn.disabled = true;
  btn.textContent = '\u23f3 Uploading...';
  statusEl.textContent = 'Uploading video to Cloudinary...';

  try {
    var fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('upload_preset', 'slvlwkcf');
    fd.append('folder', 'heartland/videos');
    fd.append('resource_type', 'video');

    var res = await fetch('https://api.cloudinary.com/v1_1/dmztfzqfm/video/upload', {
      method: 'POST', body: fd
    });
    if (!res.ok) throw new Error('Cloudinary error ' + res.status);
    var data = await res.json();
    if (!data.secure_url) throw new Error('No URL returned');

    var videoUrl = data.secure_url;

    // Save URL into record's form_data via function
    var r = (window._hbShared.records || []).find(function(x){ return x.id === recordId; });
    var res2 = await fetch('/.netlify/functions/update-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      body: JSON.stringify({ id: recordId, action: 'update', data: { sewer_video_url: videoUrl } })
    });
    var d2 = await res2.json();
    if (!res2.ok || !d2.success) throw new Error(d2.error || 'Save failed');

    // Update local cache
    if (r) r.form_data = Object.assign({}, (r.form_data || {}), { sewer_video_url: videoUrl });

    // Show success
    statusEl.textContent = '\u2705 Video uploaded successfully';
    btn.textContent = '\ud83d\udce4 Replace Video';
    btn.disabled = false;
    var currentWrap = document.getElementById('crVideoCurrentWrap');
    var currentLink = document.getElementById('crVideoCurrentLink');
    currentWrap.style.display = 'block';
    currentLink.href = videoUrl;
    currentLink.textContent = file.name;

  } catch(err) {
    console.error('Video upload error:', err);
    statusEl.textContent = '\u26a0 Upload failed: ' + (err.message || 'Unknown error');
    btn.textContent = '\ud83d\udce4 Retry Upload';
    btn.disabled = false;
  }
  input.value = '';
}

async function deleteCrFromModal() {
  var id   = document.getElementById('crEditRecordId').value;
  var name = document.getElementById('crEditName').value || 'this client';
  var r    = (window._hbShared.records || []).find(function(x){ return x.id === id; });
  var bid  = r ? (r.booking_id || '') : '';
  if(!await hwConfirm('Delete the record for <strong>' + name + '</strong>? This cannot be undone.', {title:'Delete Client Record', confirmLabel:'Delete Record'})) return;
  deleteCrRecord(id, name, bid);
  closeCrEditModal();
}

async function saveCrEdit() {
  var id = document.getElementById('crEditRecordId').value;
  var recUpdates = {
    cust_name:  document.getElementById('crEditName').value.trim(),
    cust_phone: document.getElementById('crEditPhone').value.trim(),
    cust_email: document.getElementById('crEditEmail').value.trim(),
    address:    document.getElementById('crEditAddress').value.trim(),
  };
  try {
    var res = await fetch('/.netlify/functions/update-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      body: JSON.stringify({ id: id, action: 'update', data: recUpdates })
    });
    var d = await res.json();
    if (!res.ok || !d.success) throw new Error(d.error || 'Update failed');
    var rec = (window._hbShared.records || []).find(function(r){ return r.id === id; });
    if (rec) { rec.cust_name = recUpdates.cust_name; rec.cust_phone = recUpdates.cust_phone; rec.cust_email = recUpdates.cust_email; rec.address = recUpdates.address; }
    closeCrEditModal();
    renderScheduledSection();
    hwToast('Record updated.');
  } catch(err) {
    hwAlert('Error saving: ' + (err.message || err));
  }
}

// ── Copy / Resend / Delete ──────────────────────────────────

function copyCrUrl(url, btn) {
  if(!url) { hwToast('No URL available yet.', {type:'info'}); return; }
  navigator.clipboard.writeText(url).then(function(){
    var orig = btn.textContent;
    btn.textContent = '\u2713 Copied!';
    setTimeout(function(){ btn.textContent = orig; }, 2000);
  }).catch(function() {
    // Clipboard blocked — show in prompt so admin can manually copy
    window.prompt('Copy this URL:', url);
  });
}

async function copyPortalLink(email, btn) {
  if (!email) { hwToast('No email address found for this client.'); return; }
  var orig = btn.textContent;
  btn.textContent = 'Looking up...';
  btn.disabled = true;
  try {
    var res = await fetch('https://fusravedbksupcsjfzda.supabase.co/rest/v1/client_portal_tokens?client_email=eq.' + encodeURIComponent(email) + '&select=token&limit=1', {
      headers: { 'apikey': window.SUPABASE_ANON_KEY, ...(await getAuthHeader()) }
    });
    var rows = await res.json();
    if (!rows || !rows[0] || !rows[0].token) {
      btn.textContent = 'No portal yet';
      setTimeout(function(){ btn.textContent = orig; btn.disabled = false; }, 2500);
      return;
    }
    var url = window.location.origin + '/client-portal.html?token=' + rows[0].token;
    // Clipboard: try async API first, fall back to execCommand for browsers
    // that lose user gesture context after async fetch chain
    var copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch (e) { /* fall through to fallback */ }
    }
    if (!copied) {
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;left:-9999px;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); copied = true; } catch (e) {}
      document.body.removeChild(ta);
    }
    if (copied) {
      btn.textContent = '\u2713 Copied!';
      hwToast('Portal link copied', { type: 'success' });
      setTimeout(function(){ btn.textContent = orig; btn.disabled = false; }, 2000);
    } else {
      window.prompt('Copy portal link:', url);
      btn.textContent = orig;
      btn.disabled = false;
    }
  } catch(err) {
    hwAlert('Error fetching portal link.');
    btn.textContent = orig;
    btn.disabled = false;
  }
}

async function resendCrReport(recordId, btn) {
  var orig = btn.textContent;
  btn.textContent = 'Checking...'; btn.disabled = true;

  // Pre-flight: check narrative approval status
  try {
    var narrRes = await fetch('/.netlify/functions/get-narratives?record_id=' + recordId, {
      headers: { ...(await getAuthHeader()) || '' }
    });
    var narrData = await narrRes.json();
    var narratives = narrData.narratives || {};
    var draftSections = Object.values(narratives).filter(function(n) { return n.status === 'draft'; });
    if (draftSections.length > 0) {
      btn.textContent = orig; btn.disabled = false;
      alert('Cannot send report \u2014 ' + draftSections.length + ' section narrative(s) still in Draft. Open the Narratives editor to approve them first.');
      return;
    }
  } catch (narrErr) {
    // Non-fatal — proceed if check fails
  }

  btn.textContent = 'Sending...';
  try {
    var res = await fetch('/.netlify/functions/send-report-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) || '' },
      body: JSON.stringify({ id: recordId })
    });
    var data = await res.json();
    if(data.error) throw new Error(data.error);
    btn.textContent = 'Sent!';
  } catch(err) {
    btn.textContent = 'Error';
    console.error('Resend report error:', err);
  }
  setTimeout(function(){ btn.textContent = orig; btn.disabled = false; }, 2500);
}

async function resendCrInvoice(recordId, btn) {
  var orig = btn.textContent;
  btn.textContent = 'Sending...'; btn.disabled = true;
  try {
    var res = await fetch('/.netlify/functions/send-invoice-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) || '' },
      body: JSON.stringify({ record_id: recordId })
    });
    var data = await res.json();
    if(data.error) throw new Error(data.error);
    btn.textContent = 'Sent!';
  } catch(err) {
    btn.textContent = 'Error';
    console.error('Resend invoice error:', err);
  }
  setTimeout(function(){ btn.textContent = orig; btn.disabled = false; }, 2500);
}

async function deleteCrRecord(recordId, clientName, bookingId) {
  if(!await hwConfirm('Delete record for <strong>' + clientName + '</strong>? This cannot be undone.', {title:'Delete Record', confirmLabel:'Delete'})) return;
  try {
    // If we have a booking_id, use it — cascade deletes tokens + record + booking
    // Otherwise fall back to record-only delete
    var payload = bookingId ? { booking_id: bookingId } : { id: recordId };
    var res = await fetch('/.netlify/functions/delete-record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      body: JSON.stringify(payload)
    });
    var data = await res.json();
    if(data.error) throw new Error(data.error);
    await Promise.all([refreshClientRecords(), window.refreshBookings()]);
  } catch(err) {
    hwAlert('Error deleting: ' + (err.message || err));
  }
}

// ── Cancel scheduled record from Clients tab (admin) ─────────────────────
async function cancelScheduledRecord(recordId, clientName, bookingId) {
  if (!recordId) return;
  var name = clientName || 'this client';
  var rec = (window._hbShared.records || []).find(function(x){ return x.id === recordId; });
  var addr = rec ? (rec.address || 'unknown address') : 'unknown address';
  if (!await hwConfirm('Cancel the scheduled inspection for <strong>' + esc(name) + '</strong> at ' + esc(addr) + '?<br><br>This will:<ul style="margin:8px 0 0 16px;text-align:left;"><li>Delete the calendar event</li><li>Send a cancellation email to the client</li><li>Move the record to Client History</li></ul>', {title:'Cancel Inspection', confirmLabel:'Yes, Cancel It', confirmColor:'#c0392b'})) return;
  try {
    if (bookingId) {
      var res = await fetch('/.netlify/functions/cancel-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ booking_id: bookingId, _admin: true })
      });
      var d = await res.json();
      if (!d.success) throw new Error(d.error || 'Cancel failed');
    } else {
      // No booking_id — cancel via function using record_id
      var res2 = await fetch('/.netlify/functions/cancel-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ record_id: recordId, _admin: true })
      });
      var d2 = await res2.json();
      if (!d2.success) throw new Error(d2.error || 'Cancel failed');
    }
    hwToast('Inspection cancelled and client notified.');
    if (rec) rec.status = 'cancelled';
    renderScheduledSection();
    renderClientRecords();
  } catch(err) {
    hwAlert('Error cancelling inspection: ' + (err.message || err));
  }
}

// ══════════════════════════════════════════════════════════════
// Event listeners — wrapped in DOMContentLoaded
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {

  // ── crScheduledSearch input handler (debounced) ──
  var crSchSearchEl = document.getElementById('crScheduledSearch');
  if (crSchSearchEl) {
    crSchSearchEl.addEventListener('input', function(){
      clearTimeout(crScheduledSearchTimer);
      crScheduledSearchTimer = setTimeout(function(){ renderScheduledSection(); }, 250);
    });
  }

  // ── Scheduled section list item click ──
  var crTab = document.getElementById('tab-clientrecords');
  if (crTab) {
    crTab.addEventListener('click', function(e){
      var schItem = e.target.closest('[data-cr-sch-id]');
      if (schItem && !e.target.closest('[data-action]') && !e.target.closest('[data-bk-action]')) {
        crSchSelect(schItem.getAttribute('data-cr-sch-id'));
        return;
      }
    });
  }

  // ── CR action delegation ──
  document.addEventListener('click', function(e) {
    // Two-pane list item click — history section
    var histItem = e.target.closest('[data-cr-hist-email]');
    if (histItem && !e.target.closest('button') && !e.target.closest('[data-action]')) {
      var email = histItem.getAttribute('data-cr-hist-email') || '';
      if (email) crHistSelect(email);
      return;
    }
    // Legacy client card click (fallback)
    var clientCard = e.target.closest('.cr-client-card');
    if (clientCard && !e.target.closest('button')) {
      var email = clientCard.getAttribute('data-client-email') || '';
      if (email) openCrHistoryModal(email);
      return;
    }
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var noUrl = function(b) { var o=b.textContent; b.textContent='Not available yet'; setTimeout(function(){ b.textContent=o; }, 2000); };

    // Client history card portal buttons — send-portal-history uses record ID, copy-portal uses email
    if (action === 'send-portal-history') {
      var histRid = btn.getAttribute('data-record-id') || '';
      if (histRid) resendCrReport(histRid, btn); else noUrl(btn);
      return;
    }
    if (action === 'copy-portal' && btn.hasAttribute('data-remail')) {
      var remail = btn.getAttribute('data-remail') || '';
      copyPortalLink(remail, btn);
      return;
    }

    // Add-on overflow buttons carry data-rid on the button itself
    if (btn.hasAttribute('data-rid')) {
      var addonRid = btn.getAttribute('data-rid');
      if (action === 'edit') { openCrEditModal(addonRid); return; }
      if (action === 'reschedule') { openAdminRescheduleModal(btn.getAttribute('data-rbid'), 'record'); return; }
      if (action === 'cancel') { cancelScheduledRecord(addonRid, btn.getAttribute('data-rname')||'', btn.getAttribute('data-rbid')||''); return; }
      if (action === 'resend-report') { resendCrReport(addonRid, btn); return; }
    }

    // Job card buttons — read data from parent [data-rid]
    var actionsDiv = btn.closest('[data-rid]');
    if (!actionsDiv) return;

    var rid    = actionsDiv.getAttribute('data-rid');
    var rname  = actionsDiv.getAttribute('data-rname');
    var rurl   = actionsDiv.getAttribute('data-rurl');
    var iurl   = actionsDiv.getAttribute('data-iurl');
    var remail = actionsDiv.getAttribute('data-remail');
    var rbid   = actionsDiv.getAttribute('data-rbid');
    if (action === 'view-report')    { if(rurl) window.open(rurl, '_blank'); else noUrl(btn); }
    else if (action === 'view-invoice')   { if(iurl) window.open(iurl, '_blank'); else noUrl(btn); }
    else if (action === 'edit')      { openCrEditModal(rid); }
    else if (action === 'reschedule') { openAdminRescheduleModal(rbid, 'record'); }
    else if (action === 'resend-report')  { if(rid) resendCrReport(rid, btn); else noUrl(btn); }
    else if (action === 'copy-report')    { if(rurl) copyCrUrl(rurl, btn); else noUrl(btn); }
    else if (action === 'resend-invoice') { if(rid) resendCrInvoice(rid, btn); else noUrl(btn); }
    else if (action === 'copy-invoice')   { if(iurl) copyCrUrl(iurl, btn); else noUrl(btn); }
    else if (action === 'delete')    { deleteCrRecord(rid, rname, rbid); }
    else if (action === 'view-agreements') { openCrAgreementsModal(rid, rname); }
    else if (action === 'narratives') { openCrNarrativeModal(rid, rname); }
    else if (action === 'send-portal') { sendPortalLinkFromAdmin(rbid, btn, remail); }
    else if (action === 'copy-portal') { copyPortalLink(remail, btn); }
    else if (action === 'cancel') { cancelScheduledRecord(rid, rname, rbid); }
    else if (action === 'mark-paid') {
      var amt = btn.getAttribute('data-amount') || '0';
      document.getElementById('dpRecordId').value = rid;
      document.getElementById('dpAmount').value = Number(amt).toFixed(2);
      document.getElementById('dpTransactionId').value = '';
      _dpSelectedMethod = null;
      document.querySelectorAll('.dp-method-btn').forEach(function(b) { b.style.borderColor = '#e0e0e0'; b.style.background = '#fff'; b.style.color = '#333'; });
      _dpValidate();
      document.getElementById('crDigitalPayModal').classList.add('open');
    }
  });

  // ── Sub-tab switching ──
  var _crSubTabs = document.querySelector('.cr-sub-tabs');
  if (_crSubTabs) _crSubTabs.addEventListener('click', function(e){
    var tab = e.target.closest('.cr-sub-tab'); if(!tab) return;
    _crSubTabs.querySelectorAll('.cr-sub-tab').forEach(function(t){ t.classList.remove('active'); });
    _crSubTabs.parentElement.querySelectorAll('.cr-panel').forEach(function(p){ p.classList.remove('active'); });
    tab.classList.add('active');
    var panelId = 'crPanel' + tab.getAttribute('data-crpanel').charAt(0).toUpperCase() + tab.getAttribute('data-crpanel').slice(1);
    var panel = document.getElementById(panelId);
    if (panel) panel.classList.add('active');
  });

  // ── crSearch input handler for history ──
  var crSearchEl = document.getElementById('crSearch');
  if(crSearchEl) crSearchEl.addEventListener('input', function(){ renderHistorySection(); });

}); // end DOMContentLoaded

// ══════════════════════════════════════════════════════════════
// Expose on window
// ══════════════════════════════════════════════════════════════
// Fix 5: Toggle add-on overflow menu
function crToggleAddonMenu(btn) {
  var menu = btn.nextElementSibling;
  if (!menu) return;
  // Close all other open menus first
  document.querySelectorAll('.cr-overflow-menu').forEach(function(m) {
    if (m !== menu) m.style.display = 'none';
  });
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}
window.crToggleAddonMenu = crToggleAddonMenu;

window.refreshClientRecords = refreshClientRecords;
window.renderClientRecords = renderClientRecords;
window.renderScheduledSection = renderScheduledSection;
window.crSchSelect = crSchSelect;
window.crSchBackToList = crSchBackToList;
window.crSchRenderDetail = crSchRenderDetail;
window.renderHistorySection = renderHistorySection;
window.crHistSelect = crHistSelect;
window.crHistBackToList = crHistBackToList;
window.crHistRenderDetail = crHistRenderDetail;
window.openCrHistoryModal = openCrHistoryModal;
window.closeCrHistoryModal = closeCrHistoryModal;
window.openCrAgreementsModal = openCrAgreementsModal;
window.closeCrAgreementsModal = function() { document.getElementById('crAgreementsModal').classList.remove('open'); };
window.crAgrToggle = crAgrToggle;
window.openCrNarrativeModal = function() { window.open('narrative-review.html', '_blank'); };
window.closeCrNarrativeModal = function() {};
window.crGenerateNarratives = function() {};
window.crNarrAction = function() {};
window.crRegenerateSection = function() {};
window.openCrEditModal = openCrEditModal;
window.closeCrEditModal = closeCrEditModal;
window.handleCrVideoUpload = handleCrVideoUpload;
window.deleteCrFromModal = deleteCrFromModal;
window.saveCrEdit = saveCrEdit;
window._dpSelectMethod = _dpSelectMethod;
window._dpValidate = _dpValidate;
window._dpConfirm = _dpConfirm;
window.copyCrUrl = copyCrUrl;
window.copyPortalLink = copyPortalLink;
window.resendCrReport = resendCrReport;
window.resendCrInvoice = resendCrInvoice;
window.deleteCrRecord = deleteCrRecord;
window.cancelScheduledRecord = cancelScheduledRecord;
window.toggleCrSection = toggleCrSection;
window.exportCrCSV = exportCrCSV;
window.updateNarrativeBar = updateNarrativeBar;
window.renderCRRecords = renderCRRecords;
