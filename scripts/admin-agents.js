/**
 * scripts/admin-agents.js — Agents tab (HEA-235)
 * Extracted from admin.html main IIFE.
 * Uses: esc(), formatJobType(), getAuthHeader() (all global via admin-utils.js / window)
 * Netlify: manage-agent, send-agent-portal-link
 */

var _agSelectedId = null;
var _agRowsCache = {};

function renderAgentsList() {
  var list = document.getElementById('agentsList');
  if (!list) return;
  list.innerHTML = '<p style="padding:20px;color:#888;">Loading...</p>';
  var _sbUrl = 'https://fusravedbksupcsjfzda.supabase.co';
  var _sbKey = window.SUPABASE_ANON_KEY;
  fetch(_sbUrl + '/rest/v1/agents?role=eq.agent&order=name&select=*', {
    headers: { apikey: _sbKey, Authorization: 'Bearer ' + _sbKey }
  }).then(function(r){ return r.json(); }).then(function(rows) {
    if (!rows || !rows.length) {
      list.innerHTML = '<p style="padding:20px;color:#888;">No agents yet.</p>';
      document.getElementById('agDetailPane').innerHTML = '<div class="tp-detail-empty">No agents found</div>';
      return;
    }
    _agRowsCache = {};
    rows.forEach(function(r) { _agRowsCache[r.id] = r; });

    var q = (document.getElementById('agFilterSearch') ? document.getElementById('agFilterSearch').value.toLowerCase() : '');
    var inspectionRecordsData = window._hbShared.records || [];
    var filtered = rows.filter(function(r) {
      if (!q) return true;
      return (r.name||'').toLowerCase().indexOf(q) !== -1 || (r.email||'').toLowerCase().indexOf(q) !== -1 || (r.company||'').toLowerCase().indexOf(q) !== -1;
    });

    var html = '';
    filtered.forEach(function(r) {
      var agentRecs = inspectionRecordsData.filter(function(rec){ return rec.agent_id === r.id; });
      var isActive = _agSelectedId === r.id;
      html += '<div class="tp-list-item' + (isActive ? ' tp-active' : '') + '" data-ag-list-id="' + r.id + '">';
      html += '<div class="tp-list-name">' + esc(r.name || r.email || 'Unknown') + '</div>';
      html += '<div class="tp-list-meta">';
      html += '<span class="tp-list-badge ' + (r.active !== false ? 'active' : 'inactive') + '">' + (r.active !== false ? 'Active' : 'Inactive') + '</span>';
      html += '<span>' + agentRecs.length + ' referral' + (agentRecs.length !== 1 ? 's' : '') + '</span>';
      html += '</div></div>';
    });
    list.innerHTML = html || '<p style="padding:20px;color:#888;">No matching agents.</p>';

    if (!_agSelectedId && filtered.length) agSelect(filtered[0].id);
    else if (_agSelectedId) agRenderDetail(_agSelectedId);
  });
}

function agSelect(id) {
  _agSelectedId = id;
  document.querySelectorAll('#agentsList .tp-list-item').forEach(function(el){
    el.classList.toggle('tp-active', el.getAttribute('data-ag-list-id') === id);
  });
  agRenderDetail(id);
  if (window.innerWidth <= 768) {
    document.getElementById('agListPane').classList.add('tp-mobile-hide');
    document.getElementById('agDetailPane').classList.add('tp-mobile-show');
  }
}

function agBackToList() {
  document.getElementById('agListPane').classList.remove('tp-mobile-hide');
  document.getElementById('agDetailPane').classList.remove('tp-mobile-show');
}
window.agBackToList = agBackToList;

function agRenderDetail(id) {
  var pane = document.getElementById('agDetailPane');
  if (!pane) return;
  var agent = _agRowsCache[id];
  if (!agent) { pane.innerHTML = '<div class="tp-detail-empty">Agent not found</div>'; return; }

  var inspectionRecordsData = window._hbShared.records || [];
  var agentRecs = inspectionRecordsData.filter(function(r){ return r.agent_id === agent.id; });
  agentRecs.sort(function(a,b){ return (b.inspection_date||b.created_at||'').localeCompare(a.inspection_date||a.created_at||''); });
  var totalRev = agentRecs.reduce(function(s,r){ return s + (parseFloat(r.final_total)||0); }, 0);
  var completedCount = agentRecs.filter(function(r){ return r.status==='submitted'||r.status==='completed'; }).length;

  var hasToken = !!agent.portal_token;
  var portalUrl = window.location.origin + '/agent-portal.html?token=' + (agent.portal_token||'');
  var initials = (agent.name||'A').split(' ').map(function(w){ return w.charAt(0); }).join('').substring(0,2).toUpperCase();

  var html = '<button class="tp-back-btn" onclick="agBackToList()">‹ Back to list</button>';
  html += '<div class="tp-detail-header">';
  html += '<div class="tp-avatar">' + esc(initials) + '</div>';
  html += '<div><div class="tp-detail-name">' + esc(agent.name||agent.email||'Unknown') + '</div>';
  html += '<div style="font-size:12px;color:var(--text-light);">' + esc(agent.company||'');
  if (agent.company && agent.email) html += ' · ';
  html += esc(agent.email||'') + '</div></div></div>';

  // Stats
  html += '<div class="tp-stat-grid">';
  html += '<div class="tp-stat-card"><div class="tp-stat-value">' + agentRecs.length + '</div><div class="tp-stat-label">Total Referrals</div></div>';
  html += '<div class="tp-stat-card"><div class="tp-stat-value">' + completedCount + '</div><div class="tp-stat-label">Completed</div></div>';
  html += '<div class="tp-stat-card"><div class="tp-stat-value">$' + Math.round(totalRev).toLocaleString() + '</div><div class="tp-stat-label">Total Revenue</div></div>';
  html += '</div>';

  // Contact info
  html += '<div class="tp-detail-section"><div class="tp-detail-label">Contact</div>';
  html += '<div class="tp-detail-grid">';
  if (agent.phone) { html += '<dt>Phone</dt><dd>' + esc(agent.phone) + '</dd>'; }
  if (agent.email) { html += '<dt>Email</dt><dd>' + esc(agent.email) + '</dd>'; }
  if (agent.company) { html += '<dt>Company</dt><dd>' + esc(agent.company) + '</dd>'; }
  html += '<dt>Status</dt><dd>' + (agent.active !== false ? 'Active' : 'Inactive') + '</dd>';
  if (agent.booking_discount > 0) { html += '<dt>Discount</dt><dd>$' + agent.booking_discount + ' off</dd>'; }
  html += '</div></div>';

  // Recent referrals
  var recent = agentRecs.slice(0, 5);
  if (recent.length) {
    html += '<div class="tp-detail-section"><div class="tp-detail-label">Recent Referrals</div>';
    recent.forEach(function(r) {
      var dateStr = r.inspection_date ? new Date(r.inspection_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
      var amt = parseFloat(r.final_total)||0;
      html += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">';
      html += '<div><strong>' + esc(r.cust_name||'—') + '</strong><span style="color:var(--text-light);margin-left:8px;">' + esc(formatJobType(r)) + '</span></div>';
      html += '<div style="text-align:right;color:var(--text-light);">' + dateStr + (amt ? ' · $' + amt.toFixed(0) : '') + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Actions
  html += '<div class="tp-detail-actions">';
  if (hasToken) {
    html += '<button class="ag-send-btn cr-card-btn cr-btn-view" data-id="' + agent.id + '" data-name="' + esc(agent.name||'') + '" data-email="' + esc(agent.email||'') + '">Send Portal Link</button>';
    html += '<button class="ag-copy-btn cr-card-btn" data-url="' + esc(portalUrl) + '" style="background:#f5f7f8;color:var(--text-dark);border:1px solid #ddd;">Copy Link</button>';
  }
  html += '<button class="ag-edit-btn cr-card-btn cr-btn-edit" data-id="' + agent.id + '">Edit</button>';
  html += '<div class="tp-overflow-wrap"><button class="tp-overflow-btn" onclick="this.nextElementSibling.classList.toggle(\'open\')">•••</button>';
  html += '<div class="tp-overflow-menu"><button class="ag-del-btn danger" data-id="' + agent.id + '" data-name="' + esc(agent.name||agent.email||'') + '">Delete Agent</button></div></div>';
  html += '</div>';

  pane.innerHTML = html;

  // Wire action buttons in detail pane
  pane.querySelectorAll('.ag-edit-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { showAgentModal(_agRowsCache[btn.dataset.id]); });
  });
  pane.querySelectorAll('.ag-del-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { deleteAgent(btn.dataset.id, btn.dataset.name); });
  });
  pane.querySelectorAll('.ag-send-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { sendAgentPortalLink(btn.dataset.id, btn.dataset.name, btn.dataset.email, btn); });
  });
  pane.querySelectorAll('.ag-copy-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      navigator.clipboard.writeText(btn.dataset.url).then(function() {
        var orig = btn.textContent; btn.textContent = 'Copied!';
        setTimeout(function(){ btn.textContent = orig; }, 2000);
      });
    });
  });
}

// Compatibility: showAgentInspectionsModal now selects in the right pane
function showAgentInspectionsModal(agent) {
  if (agent && agent.id) agSelect(agent.id);
}

async function deleteAgent(id, name) {
  if (!await hwConfirm('Delete agent <strong>' + name + '</strong>? This will remove their account and portal access permanently.', {title:'Delete Agent', confirmLabel:'Delete Agent'})) return;
  fetch('/.netlify/functions/manage-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
    body: JSON.stringify({ action: 'delete', id: id })
  }).then(function(r){ return r.json(); }).then(function(data) {
    if (data.ok) { renderAgentsList(); }
    else { hwAlert('Error deleting agent: ' + (data.error || 'unknown')); }
  });
}

async function sendAgentPortalLink(id, name, email, btn) {
  var orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Sending...';
  fetch('/.netlify/functions/send-agent-portal-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
    body: JSON.stringify({ agent_id: id })
  }).then(function(r){ return r.json(); }).then(function(data) {
    btn.disabled = false;
    if (data.ok) {
      btn.textContent = 'Sent ✓';
      setTimeout(function(){ btn.textContent = orig; }, 3000);
    } else {
      btn.textContent = orig;
      hwAlert('Error sending link: ' + (data.error || 'unknown'));
    }
  }).catch(function() {
    btn.disabled = false; btn.textContent = orig;
    hwAlert('Network error sending portal link.');
  });
}

function showAgentModal(agent) {
  var existing = document.getElementById('agentModal');
  if (existing) existing.remove();
  var isNew = !agent || !agent.id;
  var modal = document.createElement('div');
  modal.id = 'agentModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:14px;padding:36px;max-width:460px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.25);max-height:90vh;overflow-y:auto;">' +
      '<h2 style="font-family:\'Crimson Pro\',serif;font-size:24px;color:var(--primary);margin-bottom:6px;">' + (isNew ? 'Add Agent' : 'Edit Agent') + '</h2>' +
      '<p style="font-size:13px;color:var(--text-light);margin-bottom:24px;">' + (isNew ? 'A permanent portal link will be generated automatically.' : 'Portal token is permanent — editing does not change it.') + '</p>' +
      '<div style="margin-bottom:16px;">' +
        '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Full Name *</label>' +
        '<input id="agModalName" value="' + esc((agent&&agent.name)||'') + '" placeholder="Jane Smith" style="width:100%;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;">' +
      '</div>' +
      '<div style="margin-bottom:16px;">' +
        '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Email *</label>' +
        '<input id="agModalEmail" type="email" value="' + esc((agent&&agent.email)||'') + '" placeholder="jane@realty.com" style="width:100%;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;">' +
      '</div>' +
      '<div style="margin-bottom:16px;">' +
        '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Phone</label>' +
        '<input id="agModalPhone" value="' + esc((agent&&agent.phone)||'') + '" placeholder="(815) 555-0100" style="width:100%;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;">' +
      '</div>' +
      '<div style="margin-bottom:16px;">' +
        '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Brokerage / Company</label>' +
        '<input id="agModalCompany" value="' + esc((agent&&agent.company)||'') + '" placeholder="Keller Williams Realty" style="width:100%;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;">' +
      '</div>' +
      '<div style="margin-bottom:16px;">' +
        '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Booking Discount ($) <span style="font-weight:400;color:var(--text-light);">— Home Inspections only</span></label>' +
        '<input id="agModalDiscount" type="number" min="0" max="500" step="1" value="' + ((agent&&agent.booking_discount)||0) + '" placeholder="0" style="width:100%;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;">' +
      '</div>' +
      '<div style="margin-bottom:24px;display:flex;align-items:center;gap:12px;">' +
        '<label style="font-size:13px;font-weight:600;">Active</label>' +
        '<input id="agModalActive" type="checkbox"' + (!agent||agent.active!==false?' checked':'') + ' style="width:18px;height:18px;accent-color:var(--secondary);cursor:pointer;">' +
      '</div>' +
      '<div id="agModalErr" style="color:var(--red);font-size:13px;margin-bottom:12px;display:none;"></div>' +
      '<div style="display:flex;gap:12px;">' +
        '<button id="agModalSave" style="flex:1;padding:12px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">' + (isNew?'Add Agent':'Save Changes') + '</button>' +
        '<button id="agModalCancel" style="padding:12px 20px;background:#f5f7f8;color:var(--text-dark);border:1px solid #ddd;border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;cursor:pointer;">Cancel</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  document.getElementById('agModalCancel').addEventListener('click', function(){ modal.remove(); });
  modal.addEventListener('click', function(e){ if(e.target===modal) modal.remove(); });
  document.getElementById('agModalSave').addEventListener('click', async function() {
    var name     = document.getElementById('agModalName').value.trim();
    var email    = document.getElementById('agModalEmail').value.trim();
    var phone    = document.getElementById('agModalPhone').value.trim();
    var company  = document.getElementById('agModalCompany').value.trim();
    var active   = document.getElementById('agModalActive').checked;
    var discount = parseInt(document.getElementById('agModalDiscount').value, 10) || 0;
    var errEl    = document.getElementById('agModalErr');
    if (!name)  { errEl.textContent='Name is required.';  errEl.style.display=''; return; }
    if (!email) { errEl.textContent='Email is required.'; errEl.style.display=''; return; }
    errEl.style.display='none';
    var btn = document.getElementById('agModalSave');
    btn.disabled=true; btn.textContent='Saving...';
    var payload = { action: isNew?'create':'update', name:name, email:email, phone:phone, company:company, active:active, booking_discount:discount };
    if (!isNew) payload.id = agent.id;
    fetch('/.netlify/functions/manage-agent', {
      method:'POST',
      headers:{'Content-Type':'application/json',...(await getAuthHeader())},
      body:JSON.stringify(payload)
    }).then(function(r){ return r.json(); }).then(function(data) {
      if (data.ok) { modal.remove(); renderAgentsList(); }
      else { errEl.textContent=data.error||'Error saving. Try again.'; errEl.style.display=''; btn.disabled=false; btn.textContent=isNew?'Add Agent':'Save Changes'; }
    });
  });
}

document.addEventListener('DOMContentLoaded', function() {
  var addAgBtn = document.getElementById('addAgentBtn');
  if (addAgBtn) addAgBtn.addEventListener('click', function(){ showAgentModal(null); });

  // List item click handler
  var agTab = document.getElementById('tab-agents');
  if (agTab) agTab.addEventListener('click', function(e) {
    var item = e.target.closest('[data-ag-list-id]');
    if (item && !e.target.closest('button')) { agSelect(item.getAttribute('data-ag-list-id')); return; }
  });

  // Agent search
  var agSearchEl = document.getElementById('agFilterSearch');
  if (agSearchEl) agSearchEl.addEventListener('input', function() {
    renderAgentsList();
  });
});

// Refresh agents list when tab is opened
(function() {
  var _agentsLoaded = false;
  document.addEventListener('click', function(e) {
    if (e.target && e.target.dataset && e.target.dataset.tab === 'agents' && !_agentsLoaded) {
      _agentsLoaded = true;
      renderAgentsList();
    } else if (e.target && e.target.dataset && e.target.dataset.tab === 'agents') {
      renderAgentsList();
    }
  });
})();

window.renderAgentsList = renderAgentsList;
window.showAgentModal = showAgentModal;
window.showAgentInspectionsModal = showAgentInspectionsModal;
window.deleteAgent = deleteAgent;
window.sendAgentPortalLink = sendAgentPortalLink;
