// scripts/admin-bookings.js — Bookings tab + modals (HEA-236)

// ─── Module-local vars ──────────────────────────────────────
var bkCalMonth, bkCalYear, bkCalSelectedDate = null;
var bkFilterState = { status: '', agent: '', from: '', to: '', search: '' };
var bkSortKey = 'date-desc';
var bkSearchTimer = null;
var _bkSelectedId = null;

// Reschedule modal vars
var _arBookingId = null;
var _arType = null;
var _arBusyEvents = [];
var _arSelDate = null;
var _arSelTime = null;
var _arCalMonth = null;
var _arCalYear = null;
var AR_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ═══ BOOKINGS ════════════════════════════════════════════════
async function refreshBookings(){
  var sb = window._hbShared.sb;
  var res = await sb.from('bookings').select('*').order('created_at', { ascending: false });
  var agentMap = {};
  (window._hbShared.agents || []).forEach(function(a){ agentMap[a.id] = { name: a.name || a.email, company: a.company || '' }; });
  var bookingsData = (res.data || []).map(function(b){
    var info = agentMap[b.agent_id] || { name: 'Unknown', company: '' };
    b.agent_name = info.name;
    b.agent_company = info.company;
    return b;
  });
  window._hbShared.bookings = bookingsData;
  renderBookings();
}

function bkServiceName(b) {
  if (!b.services || !Array.isArray(b.services) || !b.services.length) return '—';
  return b.services[0].name || b.services[0].id || '—';
}

function bkAddonsList(b) {
  if (!b.services || !Array.isArray(b.services) || b.services.length <= 1) return [];
  return b.services.slice(1).map(function(s){ return s.name || s.id || 'Add-on'; });
}

function bkAddonsCell(b) {
  var addons = bkAddonsList(b);
  if (!addons.length) return '<td data-label="Add-Ons"><span style="color:#aaa;">—</span></td>';
  var id = 'addon-pop-' + (b.id || Math.random().toString(36).substr(2,6));
  var listHtml = addons.map(function(a){ return '<div style="padding:3px 0;font-size:12px;color:#333;">• ' + esc(a) + '</div>'; }).join('');
  return '<td data-label="Add-Ons" style="position:relative;">' +
    '<span class="bk-addon-badge" data-addon-id="' + id + '" style="display:inline-block;background:var(--primary);color:#fff;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:700;cursor:pointer;" title="Click to see add-ons">' + addons.length + '</span>' +
    '<div id="' + id + '" class="bk-addon-popover" style="display:none;position:absolute;z-index:200;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);padding:10px 14px;min-width:180px;top:100%;left:0;">' +
    '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:6px;">Add-On Services</div>' +
    listHtml +
    '</div>' +
    '</td>';
}

function bkRow(b, extraCols) {
  var submitted = b.created_at ? new Date(b.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
  var status = b.status || 'pending';
  // Source of truth: use cust_name from inspection_records if confirmed, else booking client_name
  var rec = (window._hbShared.records || []).find(function(r){ return r.booking_id === b.id; });
  var clientName = (rec && rec.cust_name) ? rec.cust_name : (b.client_name || '—');
  var html = '<tr>';
  html += '<td data-label="Date Booked">' + submitted + '</td>';
  html += '<td data-label="Client"><strong style="color:var(--primary);">' + esc(clientName) + '</strong></td>';
  html += '<td class="bk-svc" data-label="Service">' + esc(bkServiceName(b)) + '</td>';
  html += bkAddonsCell(b);
  html += '<td data-label="Status"><span class="bk-status ' + status + '">' + status + '</span></td>';
  // Confirm button — show for all pending bookings (record may already exist if booked via agent portal)
  var hasRecord = !!rec;
  if(status === 'pending'){
    html += '<td data-label="Confirm"><button class="bk-confirm-btn" data-bk-confirm="' + b.id + '" style="font-size:11px;padding:5px 12px;border:none;background:var(--secondary);color:#fff;border-radius:6px;cursor:pointer;font-weight:700;">✓ Confirm</button></td>';
  } else if(hasRecord){
    html += '<td data-label="Confirm"><span style="color:var(--secondary);font-size:11px;font-weight:700;">✓ Scheduled</span></td>';
  } else {
    html += '<td data-label="Confirm"><span style="color:#aaa;font-size:11px;">—</span></td>';
  }
  html += '</tr>';
  return html;
}

function bkTableHead(cols) {
  var html = '<div style="overflow-x:auto;"><table class="bookings-table"><thead><tr>';
  cols.forEach(function(c){ html += '<th>' + c + '</th>'; });
  html += '</tr></thead><tbody>';
  return html;
}

// ─── BOOKINGS: Filter / Sort / Calendar helpers ────────────
function bkFiltersActive() {
  return bkFilterState.status || bkFilterState.agent || bkFilterState.from || bkFilterState.to || bkFilterState.search;
}

function getFilteredBookings() {
  var list = (window._hbShared.bookings || []).slice();
  var f = bkFilterState;
  if (f.status) list = list.filter(function(b){ return (b.status || 'pending') === f.status; });
  if (f.agent) {
    if (f.agent === '__consumer__') list = list.filter(function(b){ return b.agent_id == null; });
    else list = list.filter(function(b){ return b.agent_id === f.agent; });
  }
  if (f.from) list = list.filter(function(b){ return (b.preferred_date || b.created_at || '') >= f.from; });
  if (f.to) list = list.filter(function(b){ return (b.preferred_date || b.created_at || '') <= f.to; });
  if (f.search) {
    var q = f.search.toLowerCase();
    list = list.filter(function(b){
      return (b.client_name || '').toLowerCase().indexOf(q) !== -1 ||
             (b.property_address || '').toLowerCase().indexOf(q) !== -1;
    });
  }
  // Sort
  var key = bkSortKey;
  list.sort(function(a, b){
    if (key === 'date-desc') return (b.preferred_date || b.created_at || '') > (a.preferred_date || a.created_at || '') ? 1 : -1;
    if (key === 'date-asc') return (a.preferred_date || a.created_at || '') > (b.preferred_date || b.created_at || '') ? 1 : -1;
    if (key === 'client-asc') return (a.client_name || '').localeCompare(b.client_name || '');
    if (key === 'client-desc') return (b.client_name || '').localeCompare(a.client_name || '');
    if (key === 'total-desc') return (Number(b.final_total) || 0) - (Number(a.final_total) || 0);
    if (key === 'total-asc') return (Number(a.final_total) || 0) - (Number(b.final_total) || 0);
    if (key === 'status') {
      var order = { pending:0, confirmed:1, completed:2, cancelled:3 };
      return (order[a.status || 'pending'] || 0) - (order[b.status || 'pending'] || 0);
    }
    return 0;
  });
  return list;
}

function populateAgentFilter() {
  var sel = document.getElementById('bkFilterAgent');
  if (!sel) return;
  var prev = sel.value;
  var seen = {};
  var agents = [];
  (window._hbShared.bookings || []).forEach(function(b){
    if (b.agent_id && !seen[b.agent_id]) {
      seen[b.agent_id] = true;
      agents.push({ id: b.agent_id, name: b.agent_name || 'Unknown' });
    }
  });
  agents.sort(function(a, b){ return a.name.localeCompare(b.name); });
  var html = '<option value="">All Sources</option><option value="__consumer__">Consumer Direct</option>';
  agents.forEach(function(a){ html += '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>'; });
  sel.innerHTML = html;
  sel.value = prev;
}

function initBkCal() {
  var now = new Date();
  bkCalMonth = now.getMonth();
  bkCalYear = now.getFullYear();
}

function formatDateLabel(dk) {
  var parts = dk.split('-');
  var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  return window.DAYS[d.getDay()] + ', ' + window.MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function renderBkCalendar() {
  var filtered = getFilteredBookings();
  // Group by preferred_date
  var byDate = {};
  filtered.forEach(function(b){
    var dk = b.preferred_date || (b.created_at ? b.created_at.substring(0, 10) : null);
    if (!dk) return;
    if (!byDate[dk]) byDate[dk] = [];
    byDate[dk].push(b);
  });

  var today = dateKey(new Date());
  var first = new Date(bkCalYear, bkCalMonth, 1);
  var startDow = first.getDay();
  var daysInMonth = new Date(bkCalYear, bkCalMonth + 1, 0).getDate();

  var html = '';
  // Header
  html += '<div class="bk-cal-header">';
  html += '<button onclick="bkCalPrev()">&larr;</button>';
  html += '<span class="bk-cal-title">' + window.MONTHS[bkCalMonth] + ' ' + bkCalYear + '</span>';
  html += '<button onclick="bkCalNext()">&rarr;</button>';
  html += '</div>';

  // Legend
  html += '<div class="bk-cal-legend">';
  html += '<span><span class="bk-cal-legend-dot" style="background:#a16207;"></span> Pending</span>';
  html += '<span><span class="bk-cal-legend-dot" style="background:#166534;"></span> Confirmed</span>';
  html += '<span><span class="bk-cal-legend-dot" style="background:#6b7280;"></span> Completed</span>';
  html += '<span><span class="bk-cal-legend-dot" style="background:#dc2626;"></span> Cancelled</span>';
  html += '</div>';

  // Grid
  html += '<div class="bk-cal-grid">';
  window.SHORT.forEach(function(d){ html += '<div class="bk-cal-dow">' + d + '</div>'; });

  // Empty offset cells
  for (var i = 0; i < startDow; i++) html += '<div class="bk-cal-cell empty"></div>';

  for (var day = 1; day <= daysInMonth; day++) {
    var dk = bkCalYear + '-' + pad(bkCalMonth + 1) + '-' + pad(day);
    var bookings = byDate[dk] || [];
    var cls = 'bk-cal-cell';
    if (dk === today) cls += ' today';
    if (dk === bkCalSelectedDate) cls += ' selected';

    html += '<div class="' + cls + '" onclick="bkCalSelectDay(\'' + dk + '\')">';
    html += '<div class="bk-cal-day">' + day;
    if (bookings.length) html += '<span class="bk-cal-count">' + bookings.length + '</span>';
    html += '</div>';
    if (bookings.length) {
      html += '<div class="bk-cal-dots">';
      var shown = bookings.slice(0, 5);
      shown.forEach(function(b){ html += '<span class="bk-cal-dot ' + (b.status || 'pending') + '"></span>'; });
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';

  document.getElementById('bkCalContainer').innerHTML = html;

  // Detail panel
  if (bkCalSelectedDate && byDate[bkCalSelectedDate]) {
    renderBkCalDetail(byDate[bkCalSelectedDate]);
  } else {
    document.getElementById('bkCalDetail').innerHTML = '';
  }
}

function renderBkCalDetail(dayBookings) {
  var html = '<div class="bk-cal-detail-title">' + formatDateLabel(bkCalSelectedDate) + ' — ' + dayBookings.length + ' booking' + (dayBookings.length !== 1 ? 's' : '') + '</div>';
  html += bkTableHead(['Time','Client','Service','Add-Ons','Status','']);
  dayBookings.forEach(function(b){
    var time = b.preferred_time || '—';
    var total = b.final_total != null ? '$' + Number(b.final_total).toLocaleString() : '—';
    var status = b.status || 'pending';
    // Find matching client record for direct link
    var rec = (window._hbShared.records || []).find(function(r){ return r.booking_id === b.id; });
    html += '<tr>';
    html += '<td>' + esc(time) + '</td>';
    html += '<td><strong style="color:var(--primary);">' + esc(((window._hbShared.records || []).find(function(r){return r.booking_id===b.id;}) || {}).cust_name || b.client_name || '—') + '</strong></td>';
    html += '<td class="bk-addr" title="' + esc(b.property_address || '') + '">' + esc(b.property_address || '—') + '</td>';
    html += '<td class="bk-svc" title="' + esc(bkServiceName(b)) + '">' + esc(bkServiceName(b)) + '</td>';
    html += '<td>' + total + '</td>';
    html += '<td><span class="bk-status ' + status + '">' + status + '</span></td>';
    html += '<td>';
    if (rec) {
      html += '<a href="#" onclick="event.preventDefault();document.querySelector(\'[data-tab=client-records]\').click();setTimeout(function(){var el=document.querySelector(\'[data-record-id=&quot;' + rec.id + '&quot;]\');if(el){el.scrollIntoView({behavior:\'smooth\',block:\'center\'});el.click();}},200);" style="color:#15516d;font-size:0.82rem;white-space:nowrap;" title="Go to client record">View Record &rarr;</a>';
    }
    html += '</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  document.getElementById('bkCalDetail').innerHTML = html;
}

function bkCalPrev() { bkCalMonth--; if (bkCalMonth < 0) { bkCalMonth = 11; bkCalYear--; } bkCalSelectedDate = null; renderBkCalendar(); }
function bkCalNext() { bkCalMonth++; if (bkCalMonth > 11) { bkCalMonth = 0; bkCalYear++; } bkCalSelectedDate = null; renderBkCalendar(); }
function bkCalSelectDay(dk) { bkCalSelectedDate = (bkCalSelectedDate === dk) ? null : dk; renderBkCalendar(); }

// ─── BOOKINGS: List / Detail rendering ───────────────────────
function renderBookings(){
  var q = (document.getElementById('bkFilterSearch') ? document.getElementById('bkFilterSearch').value.toLowerCase() : '');
  var list = (window._hbShared.bookings || []).filter(function(b){
    // Only show bookings that need action — pending or reschedule requested
    var s = b.status || 'pending';
    if (s !== 'pending' && !b.reschedule_requested) return false;
    if (!q) return true;
    return (b.client_name||'').toLowerCase().indexOf(q) !== -1 ||
           (b.property_address||'').toLowerCase().indexOf(q) !== -1 ||
           (b.client_email||'').toLowerCase().indexOf(q) !== -1;
  });
  list.sort(function(a,b){ return (b.created_at||'') > (a.created_at||'') ? 1 : -1; });

  var el = document.getElementById('bkListItems');
  if (!el) return;
  var html = '';
  list.forEach(function(b){
    var rec = (window._hbShared.records || []).find(function(r){ return r.booking_id === b.id; });
    var name = (rec && rec.cust_name) ? rec.cust_name : (b.client_name || '—');
    var status = b.status || 'pending';
    var service = bkServiceName(b);
    var prefDate = b.preferred_date ? new Date(b.preferred_date + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
    var isActive = _bkSelectedId === b.id;
    html += '<div class="tp-list-item' + (isActive ? ' tp-active' : '') + '" data-bk-list-id="' + b.id + '">';
    html += '<div class="tp-list-name">' + esc(name) + '</div>';
    html += '<div class="tp-list-meta">';
    html += '<span class="tp-list-badge ' + status + '">' + status + '</span>';
    if (b.reschedule_requested) html += '<span class="tp-list-badge" style="background:#fff3e0;color:#e65100;">⏰</span>';
    html += '<span>' + esc(service) + '</span>';
    if (prefDate) html += '<span>' + prefDate + '</span>';
    html += '</div></div>';
  });
  el.innerHTML = html || '<div style="padding:20px;color:#aaa;font-size:13px;">No bookings found.</div>';

  if (!_bkSelectedId && list.length) bkSelectBooking(list[0].id);
  else if (_bkSelectedId) bkRenderDetail(_bkSelectedId);
}

function bkSelectBooking(id) {
  _bkSelectedId = id;
  document.querySelectorAll('#bkListItems .tp-list-item').forEach(function(el){
    el.classList.toggle('tp-active', el.getAttribute('data-bk-list-id') === id);
  });
  bkRenderDetail(id);
  // Mobile: show detail
  var listPane = document.getElementById('bkListPane');
  var detailPane = document.getElementById('bkDetailPane');
  if (window.innerWidth <= 768) {
    listPane.classList.add('tp-mobile-hide');
    detailPane.classList.add('tp-mobile-show');
  }
}

function bkRenderDetail(id) {
  var pane = document.getElementById('bkDetailPane');
  if (!pane) return;
  var b = (window._hbShared.bookings || []).find(function(x){ return x.id === id; });
  if (!b) { pane.innerHTML = '<div class="tp-detail-empty">Booking not found</div>'; return; }

  var rec = (window._hbShared.records || []).find(function(r){ return r.booking_id === b.id; });
  var clientName = (rec && rec.cust_name) ? rec.cust_name : (b.client_name || '—');
  var status = b.status || 'pending';
  var service = bkServiceName(b);
  var addons = bkAddonsList(b);
  var prefDate = b.preferred_date ? new Date(b.preferred_date + 'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : '—';
  var prefTime = b.preferred_time || '—';
  var dateBooked = b.created_at ? new Date(b.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

  var html = '<button class="tp-back-btn" onclick="bkBackToList()">‹ Back to list</button>';
  html += '<div class="tp-detail-header">';
  html += '<div class="tp-detail-name">' + esc(clientName) + '</div>';
  html += '<div class="tp-detail-badges">';
  html += '<span class="tp-list-badge ' + status + '">' + status + '</span>';
  if (b.reschedule_requested) html += '<span class="tp-list-badge" style="background:#fff3e0;color:#e65100;">⏰ Reschedule Requested</span>';
  if (b.calendar_event_status === 'failed') html += '<span class="tp-list-badge" style="background:#fde8e8;color:#c0392b;">⚠ Cal Failed</span>';
  html += '</div></div>';

  html += '<div class="tp-detail-section"><div class="tp-detail-label">Service</div>';
  html += '<div style="font-size:14px;font-weight:600;color:var(--text-dark);">' + esc(service) + '</div>';
  if (addons.length) html += '<div style="font-size:12px;color:var(--text-light);margin-top:4px;">Add-ons: ' + addons.map(esc).join(', ') + '</div>';
  html += '</div>';

  html += '<div class="tp-detail-section"><div class="tp-detail-label">Details</div>';
  html += '<div class="tp-detail-grid">';
  html += '<dt>Preferred Date</dt><dd>' + esc(prefDate) + '</dd>';
  html += '<dt>Preferred Time</dt><dd>' + esc(prefTime) + '</dd>';
  if (b.client_phone) { html += '<dt>Phone</dt><dd>' + esc(b.client_phone) + '</dd>'; }
  if (b.client_email) { html += '<dt>Email</dt><dd>' + esc(b.client_email) + '</dd>'; }
  if (b.property_address) { html += '<dt>Address</dt><dd>' + esc(b.property_address) + '</dd>'; }
  html += '<dt>Booked</dt><dd>' + dateBooked + '</dd>';
  if (b.agent_name && b.agent_name !== 'Unknown') { html += '<dt>Agent</dt><dd>' + esc(b.agent_name) + '</dd>'; }
  html += '</div></div>';

  // Reschedule request block
  if (b.reschedule_requested && b.reschedule_date) {
    html += '<div style="margin-bottom:16px;padding:12px 16px;background:#fff8f0;border:1.5px solid #ffcc80;border-radius:8px;font-size:13px;">';
    html += '<div style="color:#e65100;font-weight:700;margin-bottom:6px;">Reschedule Requested</div>';
    html += '<div><strong>New time:</strong> ' + esc(b.reschedule_date) + (b.reschedule_time ? ' at ' + esc(b.reschedule_time) : '') + '</div>';
    html += '<div style="display:flex;gap:6px;margin-top:10px;">';
    html += '<button class="cr-card-btn" style="background:#27ae60;color:#fff;border:none;padding:6px 16px;" data-bk-action="approve-reschedule" data-new-date="' + esc(b.reschedule_date) + '" data-new-time="' + esc(b.reschedule_time||'') + '">✓ Approve</button>';
    html += '<button class="cr-card-btn" style="background:#fff3f3;color:#c0392b;border:1.5px solid #e8c0bb;padding:6px 16px;" data-bk-action="deny-reschedule">✗ Deny</button>';
    html += '</div></div>';
  }

  // Actions
  html += '<div class="tp-detail-actions" data-bk-id="' + b.id + '">';
  if (status === 'cancelled') {
    html += '<span style="font-size:12px;font-weight:700;color:#c0392b;padding:6px 10px;">✕ Cancelled</span>';
    html += '<button class="cr-card-btn cr-btn-delete" data-bk-action="delete">Delete</button>';
  } else {
    if (status === 'pending') {
      html += '<button class="cr-card-btn cr-btn-view" data-bk-action="confirm">✓ Confirm</button>';
    } else if (rec) {
      html += '<span style="font-size:12px;font-weight:700;color:var(--secondary);padding:6px 10px;">✓ Scheduled</span>';
    }
    html += '<button class="cr-card-btn cr-btn-edit" data-bk-action="edit">Edit</button>';
    html += '<button class="cr-card-btn" style="background:#c0392b;color:#fff;border:none;" data-bk-action="cancel">Cancel</button>';
    html += '<div class="tp-overflow-wrap"><button class="tp-overflow-btn" onclick="this.nextElementSibling.classList.toggle(\'open\')">•••</button>';
    html += '<div class="tp-overflow-menu"><button class="danger" data-bk-action="delete">Delete</button></div></div>';
  }
  html += '</div>';
  pane.innerHTML = html;
}

function bkBackToList() {
  var listPane = document.getElementById('bkListPane');
  var detailPane = document.getElementById('bkDetailPane');
  listPane.classList.remove('tp-mobile-hide');
  detailPane.classList.remove('tp-mobile-show');
}

// ─── CONFIRM & ASSIGN MODAL ────────────────────────────────
function openConfirmAssignModal(bookingId) {
  var b = (window._hbShared.bookings || []).find(function(x){ return x.id === bookingId; });
  if(!b) return;

  document.getElementById('caBookingId').value = bookingId;

  // Populate client info summary
  var service = bkServiceName(b);
  var addons = bkAddonsList(b);
  var dateStr = b.preferred_date ? new Date(b.preferred_date + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
  var info = '<strong style="font-size:15px;">' + esc(b.client_name || '—') + '</strong><br>' +
    '<span style="color:var(--text-light);">' + esc(b.property_address || '—') + '</span><br>' +
    '<span style="color:var(--text-light);">' + esc(service) + (addons.length ? ' + ' + addons.join(', ') : '') + ' &nbsp;·&nbsp; ' + dateStr + '</span>';
  document.getElementById('caClientInfo').innerHTML = info;

  // Populate inspector dropdown from agentsData
  var sel = document.getElementById('caInspectorSelect');
  sel.innerHTML = '<option value="">— Unassigned —</option>';
  (window._hbShared.agents || []).filter(function(a){ return (a.role === 'inspector' || a.role === 'admin') && a.active !== false; })
    .sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); })
    .forEach(function(a){
      sel.innerHTML += '<option value="' + a.id + '" data-name="' + esc(a.name||a.email) + '">' + esc(a.name || a.email) + '</option>';
    });

  document.getElementById('caMsg').style.display = 'none';
  document.getElementById('confirmAssignModal').classList.add('open');
}

function closeConfirmAssignModal() {
  document.getElementById('confirmAssignModal').classList.remove('open');
}

async function submitConfirmAssign() {
  var bookingId = document.getElementById('caBookingId').value;
  var sel = document.getElementById('caInspectorSelect');
  var inspectorId = sel.value || null;
  var inspectorName = inspectorId ? (sel.options[sel.selectedIndex].getAttribute('data-name') || '') : '';
  var msgEl = document.getElementById('caMsg');
  var b = (window._hbShared.bookings || []).find(function(x){ return x.id === bookingId; });
  if(!b) return;

  msgEl.style.display = 'none';
  var btn = document.querySelector('#confirmAssignModal button[onclick="submitConfirmAssign()"]');
  var origText = btn.textContent;
  btn.disabled = true; btn.textContent = 'Confirming...';

  try {
    var nameParts = (b.client_name || '').trim().split(/\s+/);
    var lastName = nameParts.length > 1 ? nameParts.pop() : '';
    var firstName = nameParts.join(' ');

    // Derive category and tier from booking services
    var derivedCategory = 'home_health_check';
    var derivedTier     = 'Standard';
    var svcs = b.services || [];
    var svcNames = svcs.map(function(s){ return (s.name || '').toLowerCase(); }).join(' ');
    if (svcNames.indexOf('pre-purchase') !== -1 || svcNames.indexOf('pre purchase') !== -1) {
      derivedCategory = 'home_inspection'; derivedTier = 'Pre Purchase';
    } else if (svcNames.indexOf('pre-listing') !== -1 || svcNames.indexOf('pre listing') !== -1) {
      derivedCategory = 'home_inspection'; derivedTier = 'Pre Listing';
    } else if (svcNames.indexOf('pre pour') !== -1 || svcNames.indexOf('pre-pour') !== -1) {
      derivedCategory = 'new_construction'; derivedTier = 'Pre Pour';
    } else if (svcNames.indexOf('pre drywall') !== -1 || svcNames.indexOf('pre-drywall') !== -1) {
      derivedCategory = 'new_construction'; derivedTier = 'Pre Drywall';
    } else if (svcNames.indexOf('final walkthrough') !== -1 || svcNames.indexOf('final walk') !== -1) {
      derivedCategory = 'new_construction'; derivedTier = 'Final Walkthrough';
    } else if (svcNames.indexOf('home inspection') !== -1) {
      derivedCategory = 'home_inspection'; derivedTier = 'Pre Purchase';
    } else if (svcNames.indexOf('home health') !== -1 || svcNames.indexOf('health check') !== -1) {
      derivedCategory = 'home_health_check'; derivedTier = 'Standard';
    }

    // confirm-booking-email creates the inspection_record + portal token + sends email
    var confirmRes = await fetch('/.netlify/functions/confirm-booking-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      body: JSON.stringify({
        booking_id:     bookingId,
        inspector_id:   inspectorId   || null,
        inspector_name: inspectorName || null,
        category:       derivedCategory,
        tier:           derivedTier,
      })
    });
    if (!confirmRes.ok) {
      var confirmErr = await confirmRes.json();
      throw new Error(confirmErr.error || 'Confirmation failed');
    }

    // Calendar event for manually-entered bookings
    var needsCalEvent = !b.calendar_event_id && !b.calendar_event_status && b.data_source !== 'consumer_wizard';
    if (needsCalEvent) {
      try {
        await fetch('/.netlify/functions/update-calendar-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
          body: JSON.stringify({
            booking_id: bookingId,
            action: 'create',
            new_date: b.preferred_date,
            new_time: b.preferred_time,
          })
        });
      } catch(calErr) {
        console.error('Calendar event creation failed:', calErr);
      }
    }

    closeConfirmAssignModal();
    await Promise.all([refreshBookings(), window.refreshClientRecords()]);
    hwAlert('✓ Confirmation email sent.' + (inspectorName ? ' Assigned to ' + inspectorName + '.' : ''), {title:'Booking Confirmed!', icon:'✅', success:true});

  } catch(err) {
    msgEl.textContent = 'Error: ' + (err.message || err);
    msgEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = origText;
  }
}

async function sendPortalLinkFromAdmin(bookingId, btn, fallbackEmail) {
  var b = (window._hbShared.bookings || []).find(function(x){ return x.id === bookingId; });
  var email = (b && b.client_email) || fallbackEmail;
  if (!email) { hwToast('No email address found for this client.'); return; }

  // If no booking ID, we need to find it from bookings by email
  if (!bookingId && email) {
    var match = (window._hbShared.bookings || []).find(function(x){ return x.client_email === email && x.status === 'scheduled'; });
    if (match) bookingId = match.id;
  }
  if (!bookingId) { hwToast('No confirmed booking found. Confirm the booking first.'); return; }

  var origText = btn.textContent;
  btn.disabled = true; btn.textContent = 'Sending...';
  try {
    var res = await fetch('/.netlify/functions/confirm-booking-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      body: JSON.stringify({ booking_id: bookingId, portal_only: true })
    });
    var d = await res.json();
    if (d.success) {
      btn.textContent = '✓ Sent!';
      btn.style.background = '#27ae60';
      btn.style.color = '#fff';
      setTimeout(function(){ btn.disabled = false; btn.textContent = origText; btn.style.background = ''; btn.style.color = ''; }, 3000);
    } else {
      hwAlert('Failed to send: ' + (d.error || 'Unknown error'));
      btn.disabled = false; btn.textContent = origText;
    }
  } catch(err) {
    hwAlert('Network error sending portal link.');
    btn.disabled = false; btn.textContent = origText;
  }
}

async function approveReschedule(bookingId, newDate, newTime, btn) {
  if (!await hwConfirm('Approve reschedule to ' + newDate + (newTime ? ' at ' + newTime : '') + '? This will cancel the old booking and create a new one.', {title:'Approve Reschedule', confirmLabel:'Approve', danger:false})) return;
  var origText = btn.textContent;
  btn.disabled = true; btn.textContent = 'Approving...';
  try {
    var res = await fetch('/.netlify/functions/reschedule-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      body: JSON.stringify({ _admin: true, booking_id: bookingId, new_date: newDate, new_time: newTime || '' })
    });
    var d = await res.json();
    if (d.success) {
      renderBookings();
      hwAlert('Reschedule approved. New booking created and confirmation emails sent.', {title:'Reschedule Approved', icon:'✅', success:true});
    } else {
      hwAlert('Error: ' + (d.error || 'Unknown error'));
      btn.disabled = false; btn.textContent = origText;
    }
  } catch(e) {
    hwAlert('Network error approving reschedule.');
    btn.disabled = false; btn.textContent = origText;
  }
}

async function denyReschedule(bookingId, btn) {
  if (!await hwConfirm('Deny this reschedule request? The original booking date will be kept.', {title:'Deny Reschedule', confirmLabel:'Deny Request'})) return;
  var origText = btn.textContent;
  btn.disabled = true; btn.textContent = 'Denying...';
  try {
    var sb = window._hbShared.sb;
    await sb.from('bookings').update({ reschedule_requested: false, reschedule_date: null, reschedule_time: null }).eq('id', bookingId);
    var b = (window._hbShared.bookings || []).find(function(x){ return x.id === bookingId; });
    if (b) { b.reschedule_requested = false; b.reschedule_date = null; b.reschedule_time = null; }
    renderBookings();
  } catch(e) {
    hwAlert('Error denying reschedule.');
    btn.disabled = false; btn.textContent = origText;
  }
}

// ── ADMIN RESCHEDULE MODAL ────────────────────────────────────────────────
function openAdminRescheduleModal(bookingId, type) {
  if (!bookingId) { hwAlert('No booking ID found for this record.'); return; }
  _arBookingId  = bookingId;
  _arType       = type;
  _arSelDate    = null;
  _arSelTime    = null;
  var now = new Date();
  _arCalMonth   = now.getMonth();
  _arCalYear    = now.getFullYear();

  var existing = document.getElementById('adminRescheduleModal');
  if (!existing) _arBuildModal();

  document.getElementById('adminRescheduleModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  _arFetchAvailability();
}

function _arBuildModal() {
  var modal = document.createElement('div');
  modal.id = 'adminRescheduleModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
  modal.innerHTML = [
    '<div style="background:#fff;border-radius:12px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.4);">',
      '<div style="background:#15516d;padding:18px 24px;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between;">',
        '<span style="font-family:\'Work Sans\',sans-serif;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#fff;">Reschedule Inspection</span>',
        '<button id="arModalClose" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;">×</button>',
      '</div>',
      '<div style="padding:24px;">',
        '<div id="arLoadingMsg" style="text-align:center;padding:30px;color:#888;font-size:14px;">Loading availability…</div>',
        '<div id="arCalWrap" style="display:none;">',
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">',
            '<button id="arCalPrev" style="background:#f0f2f4;border:1.5px solid #ddd;color:#333;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:16px;">&#8249;</button>',
            '<div id="arCalTitle" style="font-size:16px;font-weight:700;color:#1a2a44;font-family:\'Barlow Condensed\',sans-serif;"></div>',
            '<button id="arCalNext" style="background:#f0f2f4;border:1.5px solid #ddd;color:#333;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:16px;">&#8250;</button>',
          '</div>',
          '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:6px;">',
            ['Su','Mo','Tu','We','Th','Fr','Sa'].map(function(d){ return '<div style="text-align:center;font-size:11px;font-weight:700;color:#999;padding:4px 0;">'+d+'</div>'; }).join(''),
          '</div>',
          '<div id="arCalDays" style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:20px;"></div>',
          '<div id="arTimesWrap" style="display:none;">',
            '<div id="arTimesTitle" style="font-size:12px;font-weight:700;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px;"></div>',
            '<div id="arTimesGrid" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;"></div>',
          '</div>',
        '</div>',
        '<div id="arActionRow" style="display:none;border-top:1px solid #eee;padding-top:18px;display:flex;gap:10px;justify-content:flex-end;">',
          '<button id="arCancelBtn" style="padding:10px 20px;background:#f0f2f4;border:1.5px solid #ddd;border-radius:8px;color:#555;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>',
          '<button id="arSubmitBtn" style="padding:10px 24px;background:#27ae60;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;opacity:0.4;" disabled>Select a time slot</button>',
        '</div>',
        '<div id="arErrMsg" style="font-size:13px;color:#e74c3c;margin-top:10px;display:none;"></div>',
      '</div>',
    '</div>'
  ].join('');
  document.body.appendChild(modal);

  document.getElementById('arModalClose').addEventListener('click', _arClose);
  document.getElementById('arCancelBtn').addEventListener('click',  _arClose);
  modal.addEventListener('click', function(e){ if (e.target === modal) _arClose(); });
  document.getElementById('arCalPrev').addEventListener('click', function(){
    _arCalMonth--; if (_arCalMonth < 0) { _arCalMonth = 11; _arCalYear--; } _arRenderCal();
  });
  document.getElementById('arCalNext').addEventListener('click', function(){
    _arCalMonth++; if (_arCalMonth > 11) { _arCalMonth = 0; _arCalYear++; } _arRenderCal();
  });
  document.getElementById('arSubmitBtn').addEventListener('click', _arSubmit);
}

function _arClose() {
  var m = document.getElementById('adminRescheduleModal');
  if (m) m.style.display = 'none';
  document.body.style.overflow = '';
  _arSelDate = null; _arSelTime = null;
}

function _arFetchAvailability() {
  var loading = document.getElementById('arLoadingMsg');
  var calWrap = document.getElementById('arCalWrap');
  if (loading) loading.style.display = 'block';
  if (calWrap) calWrap.style.display = 'none';
  fetch('/.netlify/functions/get-availability?weeks=8')
    .then(function(r){ return r.json(); })
    .then(function(data) {
      _arBusyEvents = (data.busy || []).map(function(e){ return { start: new Date(e.start), end: new Date(e.end) }; });
      if (loading) loading.style.display = 'none';
      if (calWrap) calWrap.style.display = 'block';
      _arRenderCal();
    })
    .catch(function() {
      _arBusyEvents = [];
      if (loading) loading.style.display = 'none';
      if (calWrap) calWrap.style.display = 'block';
      _arRenderCal();
    });
}

function _arGetSlots(dateStr) {
  var CFG = (window._hbShared.cfg || {});
  if (!CFG || !Object.keys(CFG).length) CFG = window.HEARTLAND_CONFIG || null;
  var d = new Date(dateStr + 'T12:00:00');
  var dow = d.getDay();
  var schedule = CFG && CFG.schedule ? CFG.schedule : {1:['8:00 AM','5:00 PM'],2:['8:00 AM','5:00 PM'],3:['8:00 AM','5:00 PM'],4:['8:00 AM','5:00 PM'],5:['8:00 AM','5:00 PM']};
  var ov = CFG && CFG.dateOverrides ? CFG.dateOverrides[dateStr] : undefined;
  var entry = (ov !== undefined) ? ov : schedule[dow];
  if (!entry) return [];
  function parseT(str) {
    var p = (str||'').trim().split(' '); var hm = p[0].split(':');
    var h = parseInt(hm[0],10), m = parseInt(hm[1]||'0',10);
    var mer = p[1] ? p[1].toUpperCase() : null;
    if (mer === 'PM' && h !== 12) h += 12; if (mer === 'AM' && h === 12) h = 0;
    return h*60+m;
  }
  var windows = (Array.isArray(entry) && typeof entry[0] === 'string') ? [entry] : (Array.isArray(entry) ? entry : []);
  var dur = (CFG && CFG.INSPECTION_DURATION_HOURS ? CFG.INSPECTION_DURATION_HOURS : 2.5) * 60;
  var step = (CFG && CFG.SLOT_STEP_MINUTES ? CFG.SLOT_STEP_MINUTES : 60);
  var slots = [];
  windows.forEach(function(w){
    if (!Array.isArray(w) || w.length < 2) return;
    var sMin = parseT(w[0]), eMin = parseT(w[1]);
    for (var t = sMin; t + dur <= eMin; t += step) {
      var hh = Math.floor(t/60), mm = t%60;
      var ap = hh >= 12 ? 'PM' : 'AM';
      var disp = (hh%12||12) + ':' + (mm<10?'0':'')+mm + ' ' + ap;
      slots.push({ time: disp, minutes: t });
    }
  });
  if (_arBusyEvents.length) {
    var tz = (CFG && CFG.TIMEZONE) || 'America/Chicago';
    var fmt = new Intl.DateTimeFormat('en-US', {timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
    var bufMs = (CFG && CFG.BUFFER_MINUTES ? CFG.BUFFER_MINUTES : 0) * 60000;
    slots = slots.filter(function(slot){
      var naiveStr = dateStr + 'T' + String(Math.floor(slot.minutes/60)).padStart(2,'0') + ':' + String(slot.minutes%60).padStart(2,'0') + ':00';
      var naiveUtc = new Date(naiveStr + 'Z');
      var parts = fmt.formatToParts(naiveUtc); var p = {};
      parts.forEach(function(x){ p[x.type] = x.value; });
      var localMs = Date.UTC(+p.year,+p.month-1,+p.day,+(p.hour==='24'?0:p.hour),+p.minute,+p.second);
      var offsetMs = localMs - naiveUtc.getTime();
      var sUtc = naiveUtc.getTime() - offsetMs;
      var eUtc = sUtc + dur * 60000;
      for (var i=0;i<_arBusyEvents.length;i++){
        var bS = _arBusyEvents[i].start.getTime()-bufMs, bE = _arBusyEvents[i].end.getTime()+bufMs;
        if (sUtc < bE && eUtc > bS) return false;
      }
      return true;
    });
  }
  return slots;
}

function _arRenderCal() {
  var today = new Date();
  var maxDate = new Date(today); maxDate.setDate(maxDate.getDate() + 56);
  var daysInMonth = new Date(_arCalYear, _arCalMonth+1, 0).getDate();
  var firstDay = new Date(_arCalYear, _arCalMonth, 1).getDay();
  var title = document.getElementById('arCalTitle');
  if (title) title.textContent = AR_MONTH_NAMES[_arCalMonth] + ' ' + _arCalYear;
  var prevBtn = document.getElementById('arCalPrev');
  var nextBtn = document.getElementById('arCalNext');
  var canPrev = _arCalYear > today.getFullYear() || (_arCalYear === today.getFullYear() && _arCalMonth > today.getMonth());
  var canNext = _arCalYear < maxDate.getFullYear() || (_arCalYear === maxDate.getFullYear() && _arCalMonth <= maxDate.getMonth());
  if (prevBtn) { prevBtn.style.opacity = canPrev ? '1' : '0.25'; prevBtn.style.pointerEvents = canPrev ? 'auto' : 'none'; }
  if (nextBtn) { nextBtn.style.opacity = canNext ? '1' : '0.25'; nextBtn.style.pointerEvents = canNext ? 'auto' : 'none'; }
  var html = '';
  for (var i=0;i<firstDay;i++) html += '<div></div>';
  for (var d=1;d<=daysInMonth;d++) {
    var ds = _arCalYear+'-'+String(_arCalMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var dObj = new Date(_arCalYear,_arCalMonth,d);
    var isPast = dObj < new Date(today.getFullYear(),today.getMonth(),today.getDate());
    var isBeyond = dObj > maxDate;
    var slots = _arGetSlots(ds);
    var isAvail = slots.length > 0 && !isPast && !isBeyond;
    var isSel = _arSelDate === ds;
    var bg = isSel ? '#27ae60' : isAvail ? '#e8f5ee' : '#f8f9fa';
    var color = isSel ? '#fff' : isAvail ? '#27ae60' : '#ccc';
    var border = isSel ? '1.5px solid #27ae60' : isAvail ? '1.5px solid #b8e0c8' : '1.5px solid #eee';
    var cursor = isAvail || isSel ? 'pointer' : 'default';
    html += '<div style="text-align:center;padding:8px 4px;border-radius:8px;font-size:13px;font-weight:600;cursor:'+cursor+';background:'+bg+';color:'+color+';border:'+border+';"'+(isAvail||isSel?' data-ar-date="'+ds+'"':'')+'>'+d+'</div>';
  }
  var grid = document.getElementById('arCalDays');
  if (grid) { grid.innerHTML = html; grid.querySelectorAll('[data-ar-date]').forEach(function(cell){
    cell.addEventListener('click', function(){
      _arSelDate = this.getAttribute('data-ar-date'); _arSelTime = null;
      _arRenderCal(); _arRenderSlots(); _arUpdateBtn();
    });
  }); }
  _arRenderSlots();
}

function _arRenderSlots() {
  var wrap = document.getElementById('arTimesWrap');
  var grid = document.getElementById('arTimesGrid');
  var title = document.getElementById('arTimesTitle');
  if (!_arSelDate) { if(wrap) wrap.style.display = 'none'; return; }
  var slots = _arGetSlots(_arSelDate);
  var dObj = new Date(_arSelDate+'T12:00:00');
  if (title) title.textContent = dObj.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  if (!slots.length) {
    if (grid) grid.innerHTML = '<div style="color:#999;font-size:13px;">No available slots for this date.</div>';
  } else {
    if (grid) { grid.innerHTML = slots.map(function(s){
      var sel = _arSelTime === s.time;
      return '<button data-ar-time="'+s.time+'" style="padding:8px 14px;background:'+(sel?'#27ae60':'#f0f2f4')+';border:1.5px solid '+(sel?'#27ae60':'#ddd')+';border-radius:8px;color:'+(sel?'#fff':'#333')+';font-size:13px;font-weight:'+(sel?'700':'500')+';cursor:pointer;">'+s.time+'</button>';
    }).join('');
    grid.querySelectorAll('[data-ar-time]').forEach(function(btn){
      btn.addEventListener('click', function(){ _arSelTime = this.getAttribute('data-ar-time'); _arRenderSlots(); _arUpdateBtn(); });
    }); }
  }
  if (wrap) wrap.style.display = 'block';
  var actionRow = document.getElementById('arActionRow');
  if (actionRow) actionRow.style.display = 'flex';
  _arUpdateBtn();
}

function _arUpdateBtn() {
  var btn = document.getElementById('arSubmitBtn');
  if (!btn) return;
  var ready = !!_arSelDate && !!_arSelTime;
  btn.disabled = !ready;
  btn.style.opacity = ready ? '1' : '0.4';
  btn.textContent = ready ? 'Reschedule — ' + _arSelTime : 'Select a time slot';
}

async function _arSubmit() {
  if (!_arSelDate || !_arSelTime || !_arBookingId) return;
  var btn = document.getElementById('arSubmitBtn');
  var errEl = document.getElementById('arErrMsg');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
  if (errEl) errEl.style.display = 'none';
  try {
    var res = await fetch('/.netlify/functions/reschedule-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      body: JSON.stringify({ _admin: true, booking_id: _arBookingId, new_date: _arSelDate, new_time: _arSelTime })
    });
    var d = await res.json();
    if (!d.success) throw new Error(d.error || 'Reschedule failed');
    _arClose();
    await Promise.all([refreshBookings(), window.refreshClientRecords()]);
    hwToast('Reschedule submitted. New booking is pending confirmation.');
  } catch(err) {
    if (errEl) { errEl.textContent = err.message || 'Error submitting reschedule.'; errEl.style.display = 'block'; }
    if (btn) { btn.disabled = false; _arUpdateBtn(); }
  }
}

// ── Cancel booking from Bookings tab (admin) ─────────────────────────────
async function cancelBookingFromAdmin(bookingId, btn) {
  var b = (window._hbShared.bookings || []).find(function(x){ return x.id === bookingId; });
  if (!b) return;
  var clientName = b.client_name || b.client_email || 'this client';
  var addr = b.property_address || 'unknown address';
  if (!await hwConfirm('Cancel the booking for <strong>' + esc(clientName) + '</strong> at ' + esc(addr) + '?<br><br>This will:<ul style="margin:8px 0 0 16px;text-align:left;"><li>Delete the calendar event</li><li>Send a cancellation email to the client</li><li>Move the record to Client History</li></ul>', {title:'Cancel Booking', confirmLabel:'Yes, Cancel It', confirmColor:'#c0392b'})) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Cancelling…'; }
  try {
    var res = await fetch('/.netlify/functions/cancel-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      body: JSON.stringify({ booking_id: bookingId, _admin: true })
    });
    var d = await res.json();
    if (!d.success) throw new Error(d.error || 'Cancel failed');
    hwToast('Booking cancelled and client notified.');
    await refreshBookings();
    if(window.renderClientRecords) window.renderClientRecords();
  } catch(err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Cancel'; }
    hwAlert('Error cancelling booking: ' + (err.message || err));
  }
}

async function deleteBooking(bookingId) {
  var b = (window._hbShared.bookings || []).find(function(x){ return x.id === bookingId; });
  if (!b) return;
  if (!await hwConfirm('Delete booking for <strong>' + esc(b.client_name || 'this client') + '</strong>? This cannot be undone.', {title:'Delete Booking', confirmLabel:'Delete Booking'})) return;
  try {
    var res = await fetch('/.netlify/functions/delete-record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      body: JSON.stringify({ booking_id: bookingId })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    await refreshBookings();
  } catch(err) {
    hwAlert('Error deleting booking: ' + (err.message || err));
  }
}

function openBkEditModal(bookingId) {
  var b = (window._hbShared.bookings || []).find(function(x){ return x.id === bookingId; });
  if (!b) return;
  document.getElementById('bkEditId').value = bookingId;
  document.getElementById('bkEditName').value = b.client_name || '';
  document.getElementById('bkEditPhone').value = b.client_phone || '';
  document.getElementById('bkEditEmail').value = b.client_email || '';
  document.getElementById('bkEditAddress').value = b.property_address || '';
  document.getElementById('bkEditModal').classList.add('open');
}

async function saveBkEdit() {
  var id = document.getElementById('bkEditId').value;
  var bookingUpdates = {
    client_name:      document.getElementById('bkEditName').value.trim(),
    client_phone:     document.getElementById('bkEditPhone').value.trim(),
    client_email:     document.getElementById('bkEditEmail').value.trim(),
    property_address: document.getElementById('bkEditAddress').value.trim(),
  };
  try {
    var res = await fetch('/.netlify/functions/update-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      body: JSON.stringify({ id: id, action: 'update_booking', data: bookingUpdates })
    });
    var d = await res.json();
    if (!res.ok || !d.success) throw new Error(d.error || 'Update failed');
    var b = (window._hbShared.bookings || []).find(function(x){ return x.id === id; });
    if (b) { b.client_name = bookingUpdates.client_name; b.client_phone = bookingUpdates.client_phone; b.client_email = bookingUpdates.client_email; b.property_address = bookingUpdates.property_address; }
    document.getElementById('bkEditModal').classList.remove('open');
    renderBookings();
    hwToast('Booking updated.');
  } catch(err) {
    hwAlert('Error saving booking: ' + (err.message || err));
  }
}

function closeBkEditModal() {
  document.getElementById('bkEditModal').classList.remove('open');
}

// ─── Event listeners (DOMContentLoaded) ──────────────────────
document.addEventListener('DOMContentLoaded', function() {
  // Booking search — debounced
  var bkSearchEl = document.getElementById('bkFilterSearch');
  if (bkSearchEl) bkSearchEl.addEventListener('input', function(){
    clearTimeout(bkSearchTimer);
    var val = this.value;
    bkSearchTimer = setTimeout(function(){ renderBookings(); }, 250);
  });

  // List item click — select booking
  var tabBookings = document.getElementById('tab-bookings');
  if (tabBookings) {
    tabBookings.addEventListener('click', function(e){
      var item = e.target.closest('[data-bk-list-id]');
      if (item) { bkSelectBooking(item.getAttribute('data-bk-list-id')); return; }
    });

    // Card action delegation
    tabBookings.addEventListener('click', function(e){
      var btn = e.target.closest('[data-bk-action]');
      if (!btn) return;
      var wrap = btn.closest('[data-bk-id]');
      if (!wrap) return;
      var id = wrap.getAttribute('data-bk-id');
      var action = btn.getAttribute('data-bk-action');
      if (action === 'confirm') {
        openConfirmAssignModal(id);
      } else if (action === 'delete') {
        deleteBooking(id);
      } else if (action === 'edit') {
        openBkEditModal(id);
      } else if (action === 'reschedule') {
        openAdminRescheduleModal(id, 'booking');
      } else if (action === 'send-portal') {
        sendPortalLinkFromAdmin(id, btn);
      } else if (action === 'approve-reschedule') {
        approveReschedule(id, btn.getAttribute('data-new-date'), btn.getAttribute('data-new-time'), btn);
      } else if (action === 'deny-reschedule') {
        denyReschedule(id, btn);
      } else if (action === 'cancel') {
        cancelBookingFromAdmin(id, btn);
      }
    });
  }

  // Addon popover toggle
  document.addEventListener('click', function(e) {
    var badge = e.target.closest('.bk-addon-badge');
    if (badge) {
      e.stopPropagation();
      var id = badge.getAttribute('data-addon-id');
      var pop = document.getElementById(id);
      if (!pop) return;
      var isOpen = pop.style.display !== 'none';
      // Close all open popovers first
      document.querySelectorAll('.bk-addon-popover').forEach(function(p){ p.style.display = 'none'; });
      if (!isOpen) pop.style.display = 'block';
      return;
    }
    // Close any open addon popover on outside click
    document.querySelectorAll('.bk-addon-popover').forEach(function(p){ p.style.display = 'none'; });
  });
});

// ─── Expose on window ────────────────────────────────────────
window.refreshBookings = refreshBookings;
window.renderBookings = renderBookings;
window.bkSelectBooking = bkSelectBooking;
window.bkBackToList = bkBackToList;
window.bkCalPrev = bkCalPrev;
window.bkCalNext = bkCalNext;
window.bkCalSelectDay = bkCalSelectDay;
window.renderBkCalendar = renderBkCalendar;
window.openConfirmAssignModal = openConfirmAssignModal;
window.closeConfirmAssignModal = closeConfirmAssignModal;
window.submitConfirmAssign = submitConfirmAssign;
window.sendPortalLinkFromAdmin = sendPortalLinkFromAdmin;
window.approveReschedule = approveReschedule;
window.denyReschedule = denyReschedule;
window.openAdminRescheduleModal = openAdminRescheduleModal;
window.cancelBookingFromAdmin = cancelBookingFromAdmin;
window.deleteBooking = deleteBooking;
window.openBkEditModal = openBkEditModal;
window.saveBkEdit = saveBkEdit;
window.closeBkEditModal = closeBkEditModal;
