/**
 * scripts/admin-legal.js — Legal & Agreements tab (HEA-239)
 * Extracted from admin.html Legal Agreements IIFE.
 * Has its own auth layer (laGetAuthHeader) — falls back to {} not x-admin-token.
 * All external data access already uses window._hbShared — no rewrites needed.
 */

'use strict';

// ── Auth helper (mirrors _fpGetAuthHeader — main IIFE's getAuthHeader is out of scope) ──
async function laGetAuthHeader() {
  try {
    var _sb = window._heartlandSB || window.sb;
    if (_sb) {
      var sess = await _sb.auth.getSession();
      if (sess && sess.data && sess.data.session) {
        return { 'Authorization': 'Bearer ' + sess.data.session.access_token };
      }
    }
  } catch (e) {}
  return {};
}

// ── Service key definitions ──────────────────────────────
var SERVICE_GROUPS = [
  { id: 'pre_inspection', icon: '📋', label: 'Pre Inspection', items: [
    { key: '*', label: 'Pre Inspection Agreement (Universal — all inspections)' },
  ]},
  { id: 'home_inspection', icon: '🏠', label: 'Home Inspection', items: [
    { key: 'home_inspection:IL', label: 'Home Inspection Agreement — Illinois' },
    { key: 'home_inspection:WI', label: 'Home Inspection Agreement — Wisconsin' },
  ]},
  { id: 'home_health_check', icon: '✅', label: 'Home Health Check', items: [
    { key: 'home_health_check',           label: 'Home Health Check — All Tiers' },
    { key: 'home_health_check:Standard',  label: 'Home Health Check — Standard' },
    { key: 'home_health_check:Premium',   label: 'Home Health Check — Premium' },
    { key: 'home_health_check:Signature', label: 'Home Health Check — Signature' },
  ]},
  { id: 'new_construction', icon: '🏗️', label: 'New Construction', items: [
    { key: 'new_construction:Pre Pour',          label: 'New Construction — Pre Pour' },
    { key: 'new_construction:Pre Drywall',        label: 'New Construction — Pre Drywall' },
    { key: 'new_construction:Final Walkthrough',  label: 'New Construction — Final Walkthrough' },
  ]},
  { id: 'addons', icon: '🔬', label: 'Add-Ons', items: [
    { key: 'addon:radon',         label: 'Radon' },
    { key: 'addon:sewer_scope',   label: 'Sewer Scope' },
    { key: 'addon:wdo',           label: 'WDO (Termite)' },
    { key: 'addon:mold',          label: 'Mold / Air Quality' },
    { key: 'addon:water_quality', label: 'Water Quality' },
    { key: 'addon:thermal',       label: 'Thermal Imaging' },
  ]},
];

// Flat list derived from groups — used for label lookups
var SERVICE_KEYS = SERVICE_GROUPS.reduce(function(acc, g) { return acc.concat(g.items); }, []);

var laEditingId   = null;  // null = new, string = editing existing
var laCheckboxSeq = 0;

// ── Sub-tab wiring ───────────────────────────────────────
document.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-lapanel]');
  if (!btn) return;
  var panel = btn.getAttribute('data-lapanel');
  document.querySelectorAll('#laSubs .cr-sub-tab').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  // Use active class for panels, not inline display, so CSS and JS don't fight
  var allPanels = { templates: 'laPanelTemplates', signatures: 'laPanelSignatures', 'agreement-reminders': 'laPanelAgreementReminders', 'data-policy': 'laPanelDataPolicy', breach: 'laPanelBreach', retention: 'laPanelRetention' };
  Object.keys(allPanels).forEach(function (k) {
    var el = document.getElementById(allPanels[k]);
    if (el) el.style.display = (k === panel) ? 'block' : 'none';
  });
  document.getElementById('laEditorWrap').style.display   = 'none';
  document.getElementById('laAddWaiverBtn').style.display  = panel === 'templates' ? '' : 'none';
  if (panel === 'signatures') renderLaSigTable();
  if (panel === 'templates')  renderLaTemplates();
  if (panel === 'retention')  laLoadRetention();
});

// ── Render template list ─────────────────────────────────
function renderLaTemplates() {
  var data = (window._hbShared && window._hbShared.waiverVersions) || [];
  var el   = document.getElementById('laTemplatesTable');
  if (!el) return;
  if (!data.length) {
    el.innerHTML = '<p style="color:#aaa;font-size:13px;padding:12px 0;">No agreements yet. Click "+ New Agreement" to create one.</p>';
    return;
  }

  var html = '';
  data.forEach(function(w) {
    var appliesTo = Array.isArray(w.applies_to) && w.applies_to.length
      ? w.applies_to.map(function(k){
          var found = SERVICE_KEYS.find(function(s){ return s.key === k; });
          return found ? found.label : k;
        }).join(', ')
      : 'Universal (all inspections)';

    var statusBadge = w.is_active
      ? '<span style="background:rgba(39,174,96,0.12);color:#27ae60;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:0.5px;">ACTIVE</span>'
      : '<span style="background:rgba(0,0,0,0.06);color:#aaa;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:0.5px;">INACTIVE</span>';

    var checkboxCount = Array.isArray(w.checkboxes) ? w.checkboxes.length : 0;
    var cbBadge = checkboxCount
      ? '<span style="background:#e3f2fd;color:#1565c0;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;margin-left:6px;">' + checkboxCount + ' checkbox' + (checkboxCount > 1 ? 'es' : '') + '</span>'
      : '';

    html += '<div style="background:#fff;border:1.5px solid #e8ecef;border-radius:10px;padding:0;margin-bottom:10px;overflow:hidden;transition:box-shadow 0.15s;">';

    // Card header row
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;gap:12px;flex-wrap:wrap;">';

    // Left: name + badges
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:14px;font-weight:700;color:#1a2530;margin-bottom:5px;">' + esc(w.name) + '</div>';
    html += '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px;">';
    html += statusBadge;
    html += cbBadge;
    html += '</div>';
    html += '</div>';

    // Right: action buttons — no Edit/Delete (immutable). Only View + Archive toggle.
    html += '<div style="display:flex;gap:6px;flex-shrink:0;align-items:center;">';
    html += '<button class="cr-btn cr-btn-sm" data-la-view="' + esc(w.id) + '" style="background:#f0f4ff;color:#3b5bdb;border-color:#c5d0fa;">View</button>';
    html += '<button class="cr-btn cr-btn-sm" data-la-archive="' + esc(w.id) + '" style="' + (w.is_active ? 'color:#c0392b;border-color:#e8c0bb;' : 'color:#27ae60;border-color:#27ae60;') + '">' + (w.is_active ? 'Deactivate' : 'Reactivate') + '</button>';
    html += '</div>';
    html += '</div>';

    // Applies-to footer strip
    html += '<div style="padding:8px 16px;background:#f9fafb;border-top:1px solid #f0f0f0;font-size:11px;color:#888;">';
    html += '<span style="font-weight:700;color:#aaa;letter-spacing:0.5px;text-transform:uppercase;margin-right:6px;">Applies to:</span>';
    html += '<span style="color:#555;">' + esc(appliesTo) + '</span>';
    html += '</div>';

    html += '</div>';
  });

  el.innerHTML = html;
}
window.renderLaTemplates = renderLaTemplates;

// ── View modal ───────────────────────────────────────────
function laViewTemplate(id) {
  var w = (window._hbShared.waiverVersions || []).find(function(v){ return v.id === id; });
  if (!w) return;

  // Remove any existing modal
  var existing = document.getElementById('laViewModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'laViewModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;';

  var inner = document.createElement('div');
  inner.style.cssText = 'background:#fff;border-radius:14px;width:100%;max-width:760px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.2);';

  // Modal header
  var header = '<div style="background:linear-gradient(135deg,#121e30,#1a2a44);padding:18px 24px;display:flex;align-items:center;justify-content:space-between;">';
  header += '<div>';
  header += '<div style="font-family:Barlow Condensed,sans-serif;font-size:18px;font-weight:700;color:#fff;letter-spacing:1px;">' + esc(w.name) + '</div>';
  header += '<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:3px;">Agreement Preview</div>';
  header += '</div>';
  header += '<button id="laViewModalClose" style="background:rgba(255,255,255,0.12);border:none;color:#fff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:14px;">&#10005; Close</button>';
  header += '</div>';

  // Body - render HTML content
  var body = '<div style="padding:24px;max-height:70vh;overflow-y:auto;font-size:13px;line-height:1.8;color:#1a2a44;">';
  body += w.body || '<em style="color:#aaa;">No content.</em>';
  body += '</div>';

  // Footer — read-only, no edit button (agreements are immutable)
  var footer = '<div style="padding:14px 24px;background:#f9fafb;border-top:1px solid #e8ecef;display:flex;justify-content:flex-end;gap:8px;">';
  footer += '<button id="laViewModalClose2" style="padding:9px 20px;background:#f0f0f0;color:#555;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">Close</button>';
  footer += '</div>';

  inner.innerHTML = header + body + footer;
  modal.appendChild(inner);
  document.body.appendChild(modal);

  // Close handlers
  function closeModal() { modal.remove(); }
  document.getElementById('laViewModalClose').addEventListener('click', closeModal);
  document.getElementById('laViewModalClose2').addEventListener('click', closeModal);
  modal.addEventListener('click', function(e){ if (e.target === modal) closeModal(); });
}

// ── Open editor ──────────────────────────────────────────
function laOpenEditor(waiverData) {
  laEditingId = waiverData ? waiverData.id : null;
  laCheckboxSeq = 0;

  document.getElementById('laEditorTitle').textContent = waiverData ? 'Edit Agreement' : 'New Agreement';
  document.getElementById('laName').value    = waiverData ? (waiverData.name || '') : '';
  document.getElementById('laBody').value    = waiverData ? (waiverData.body || '') : '';
  document.getElementById('laIsActive').checked = waiverData ? !!waiverData.is_active : true;

  // Applies-to grid — grouped collapsible sections
  var appliesTo = (waiverData && Array.isArray(waiverData.applies_to)) ? waiverData.applies_to : [];
  var grid = document.getElementById('laAppliesToGrid');
  var gridHtml = '';
  SERVICE_GROUPS.forEach(function(g) {
    var groupCheckedCount = g.items.filter(function(sk){ return appliesTo.includes(sk.key); }).length;
    var badge = groupCheckedCount ? ' <span style="background:#15516d;color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:20px;margin-left:6px;">' + groupCheckedCount + '</span>' : '';
    gridHtml += '<div class="la-group" style="border:1.5px solid #e8ecef;border-radius:10px;margin-bottom:8px;overflow:hidden;">';
    // Header
    gridHtml += '<div class="la-group-header" data-lagroup="' + esc(g.id) + '" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8fafc;cursor:pointer;user-select:none;">';
    gridHtml += '<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#1a2530;">';
    gridHtml += '<span>' + g.icon + '</span><span>' + esc(g.label) + '</span>' + badge;
    gridHtml += '</div>';
    gridHtml += '<span class="la-group-chevron" id="la-chevron-' + esc(g.id) + '" style="font-size:11px;color:#aaa;transition:transform 0.15s;">▼</span>';
    gridHtml += '</div>';
    // Body
    gridHtml += '<div class="la-group-body" id="la-gbody-' + esc(g.id) + '" style="display:none;padding:10px 14px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px;">';
    g.items.forEach(function(sk) {
      var checked = appliesTo.includes(sk.key) ? 'checked' : '';
      gridHtml += '<label style="display:flex;align-items:center;gap:7px;font-size:12px;color:#444;cursor:pointer;padding:5px 4px;border-radius:5px;" onmouseover="this.style.background=\'#f0f4f8\'" onmouseout="this.style.background=\'\'">';
      gridHtml += '<input type="checkbox" class="la-applies-cb" value="' + esc(sk.key) + '" ' + checked + ' style="width:14px;height:14px;cursor:pointer;flex-shrink:0;" onchange="laUpdateGroupBadge(\'' + esc(g.id) + '\')">';
      gridHtml += '<span>' + esc(sk.label) + '</span></label>';
    });
    gridHtml += '</div></div>';
  });
  grid.innerHTML = gridHtml;

  // Auto-expand groups that have checked items
  SERVICE_GROUPS.forEach(function(g) {
    var hasChecked = g.items.some(function(sk){ return appliesTo.includes(sk.key); });
    if (hasChecked) laToggleGroup(g.id, true);
  });

  // Checkboxes
  var cbs = (waiverData && Array.isArray(waiverData.checkboxes)) ? waiverData.checkboxes : [];
  var cbList = document.getElementById('laCheckboxList');
  cbList.innerHTML = '';
  cbs.forEach(function(cb) { laAddCheckboxRow(cb.label || '', cb.key || '', cb.required !== false); });

  document.getElementById('laPreviewWrap').style.display = 'none';
  document.getElementById('laPanelTemplates').style.display = 'none';
  document.getElementById('laEditorWrap').style.display = 'block';
  document.getElementById('laAddWaiverBtn').style.display = 'none';
  document.getElementById('laEditorWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Group toggle helpers ─────────────────────────────────
function laToggleGroup(id, forceOpen) {
  var body    = document.getElementById('la-gbody-' + id);
  var chevron = document.getElementById('la-chevron-' + id);
  if (!body) return;
  var open = forceOpen !== undefined ? !forceOpen : body.style.display !== 'none';
  body.style.display      = open ? 'none' : 'grid';
  if (chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
}
window.laToggleGroup = laToggleGroup;

window.laUpdateGroupBadge = function(groupId) {
  var g = SERVICE_GROUPS.find(function(x){ return x.id === groupId; });
  if (!g) return;
  var count = g.items.filter(function(sk){
    var cb = document.querySelector('.la-applies-cb[value="' + sk.key + '"]');
    return cb && cb.checked;
  }).length;
  // Update badge in header
  var header = document.getElementById('la-gbody-' + groupId);
  if (!header) return;
  var badgeEl = header.previousElementSibling && header.previousElementSibling.querySelector('span[data-badge]');
  // Re-render via full badge scan
  var headers = document.querySelectorAll('.la-group-header[data-lagroup="' + groupId + '"] span[data-badge]');
  if (!headers.length) {
    // Insert badge if missing
    var hdr = document.querySelector('.la-group-header[data-lagroup="' + groupId + '"] div');
    if (hdr) {
      var existing = hdr.querySelector('.la-count-badge');
      if (existing) existing.remove();
      if (count) {
        var b = document.createElement('span');
        b.className = 'la-count-badge';
        b.style.cssText = 'background:#15516d;color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:20px;margin-left:6px;';
        b.textContent = count;
        hdr.appendChild(b);
      }
    }
  }
};

// Delegated click for group headers
document.addEventListener('click', function(e) {
  var hdr = e.target.closest('.la-group-header[data-lagroup]');
  if (hdr) { laToggleGroup(hdr.getAttribute('data-lagroup')); }
});

function laCloseEditor() {
  document.getElementById('laEditorWrap').style.display      = 'none';
  document.getElementById('laPanelTemplates').style.display  = 'block';
  document.getElementById('laAddWaiverBtn').style.display    = '';
  renderLaTemplates();
}

// ── Checkbox row builder ─────────────────────────────────
function laAddCheckboxRow(label, key, required) {
  laCheckboxSeq++;
  var seq = laCheckboxSeq;
  var autoKey = key || ('cb_' + seq);
  var row = document.createElement('div');
  row.className = 'la-cb-row';
  row.setAttribute('data-seq', seq);
  row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;background:#f9fafb;border-radius:7px;border:1.5px solid #e8ecef;';
  row.innerHTML =
    '<input type="text" class="la-cb-label" placeholder="Checkbox text, e.g. I have read and understand this agreement" value="' + esc(label) + '" style="flex:1;padding:6px 10px;border:1.5px solid #e0e0e0;border-radius:6px;font-size:12px;font-family:\'Work Sans\',sans-serif;">' +
    '<input type="text" class="la-cb-key" placeholder="key" value="' + esc(autoKey) + '" style="width:90px;padding:6px 10px;border:1.5px solid #e0e0e0;border-radius:6px;font-size:11px;font-family:monospace;color:#888;">' +
    '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#666;white-space:nowrap;"><input type="checkbox" class="la-cb-required" ' + (required !== false ? 'checked' : '') + ' style="width:13px;height:13px;"> Required</label>' +
    '<button type="button" class="la-cb-remove" style="background:none;border:none;color:#e74c3c;font-size:18px;cursor:pointer;line-height:1;padding:0 4px;" title="Remove">×</button>';
  document.getElementById('laCheckboxList').appendChild(row);
}

// ── Collect editor data ──────────────────────────────────
function laCollectForm() {
  var name   = (document.getElementById('laName').value || '').trim();
  var body   = (document.getElementById('laBody').value || '').trim();
  var active = document.getElementById('laIsActive').checked;

  var appliesTo = [];
  document.querySelectorAll('.la-applies-cb:checked').forEach(function(cb) {
    appliesTo.push(cb.value);
  });

  var checkboxes = [];
  document.querySelectorAll('.la-cb-row').forEach(function(row) {
    var lbl = row.querySelector('.la-cb-label').value.trim();
    var key = row.querySelector('.la-cb-key').value.trim();
    var req = row.querySelector('.la-cb-required').checked;
    if (lbl) checkboxes.push({ label: lbl, key: key || ('cb_' + Date.now()), required: req });
  });

  return { name: name, body: body, is_active: active, applies_to: appliesTo, checkboxes: checkboxes };
}

// ── REST helpers for waiver_versions (bypass schema cache) ──
function waiverFetch(path, opts) {
  opts = opts || {};
  var SUPABASE_URL = 'https://fusravedbksupcsjfzda.supabase.co';
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
  var h = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY };
  if (opts.method && opts.method !== 'GET' && opts.method !== 'DELETE') h['Content-Type'] = 'application/json';
  if (opts.prefer) h['Prefer'] = opts.prefer;
  return fetch(SUPABASE_URL + '/rest/v1/' + path, { method: opts.method || 'GET', headers: h, body: opts.body || undefined });
}

async function laSave() {
  var form = laCollectForm();
  if (!form.name) { hwToast('Agreement name is required.'); return; }
  if (!form.body) { hwToast('Agreement text is required.'); return; }

  var btn = document.getElementById('laSaveBtn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    var payload, res, saved;
    if (laEditingId) {
      payload = { name: form.name, body: form.body, is_active: form.is_active, applies_to: form.applies_to, checkboxes: form.checkboxes };
      res = await waiverFetch('waiver_versions?id=eq.' + encodeURIComponent(laEditingId), { method: 'PATCH', prefer: 'return=representation', body: JSON.stringify(payload) });
    } else {
      var existing = (window._hbShared.waiverVersions || []).filter(function(w){ return w.name === form.name; });
      payload = { name: form.name, body: form.body, version: existing.length + 1, is_active: form.is_active, applies_to: form.applies_to, checkboxes: form.checkboxes, sort_order: (window._hbShared.waiverVersions || []).length };
      res = await waiverFetch('waiver_versions', { method: 'POST', prefer: 'return=representation', body: JSON.stringify(payload) });
    }
    var json = await res.json();
    if (!res.ok) throw new Error((Array.isArray(json) ? json[0] : json).message || JSON.stringify(json));
    saved = Array.isArray(json) ? json[0] : json;

    // Update local cache
    var versions = window._hbShared.waiverVersions || [];
    if (laEditingId) {
      var idx = versions.findIndex(function(w){ return w.id === laEditingId; });
      if (idx >= 0) versions[idx] = saved; else versions.push(saved);
    } else {
      versions.push(saved);
    }
    window._hbShared.waiverVersions = versions;

    laCloseEditor();
    renderLaTemplates();
  } catch(err) {
    hwAlert('Save failed: ' + (err.message || JSON.stringify(err)));
  } finally {
    btn.textContent = 'Save Agreement';
    btn.disabled = false;
  }
}

// ── Delete ───────────────────────────────────────────────
async function laDelete(id) {
  var w = (window._hbShared.waiverVersions || []).find(function(v){ return v.id === id; });
  if (!w) return;
  if (!await hwConfirm('Delete <strong>' + w.name + '</strong>? Existing signatures will be preserved.', {title:'Delete Agreement', confirmLabel:'Delete'})) return;
  var res = await waiverFetch('waiver_versions?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  if (!res.ok) { var j = await res.json(); hwAlert('Delete failed: ' + ((j && j.message) || res.status)); return; }
  window._hbShared.waiverVersions = (window._hbShared.waiverVersions || []).filter(function(v){ return v.id !== id; });
  renderLaTemplates();
}

// ── Signature audit log ──────────────────────────────────
function renderLaSigTable() {
  var sigs     = (window._hbShared && window._hbShared.waiverSignatures) || [];
  var versions = (window._hbShared && window._hbShared.waiverVersions)   || [];
  var el       = document.getElementById('laSigTable');
  if (!el) return;

  // Populate agreement type filter dropdown
  var filterEl = document.getElementById('laSigAgreementFilter');
  if (filterEl && filterEl.options.length <= 1) {
    var names = [];
    versions.forEach(function(v) { if (names.indexOf(v.name) === -1) names.push(v.name); });
    names.forEach(function(n) {
      var opt = document.createElement('option');
      opt.value = n; opt.textContent = n;
      filterEl.appendChild(opt);
    });
  }

  var search    = (document.getElementById('laSigSearch')          || {}).value || '';
  var dateFrom  = (document.getElementById('laSigDateFrom')        || {}).value || '';
  var dateTo    = (document.getElementById('laSigDateTo')          || {}).value || '';
  var agrFilter = (document.getElementById('laSigAgreementFilter') || {}).value || '';
  search = search.toLowerCase();

  var filtered = sigs.filter(function(s) {
    if (search && !(
      (s.client_email || '').toLowerCase().includes(search) ||
      (s.signed_name  || '').toLowerCase().includes(search) ||
      laWaiverName(s.waiver_version_id, versions).toLowerCase().includes(search)
    )) return false;
    if (dateFrom && s.signed_at < dateFrom) return false;
    if (dateTo   && s.signed_at.slice(0,10) > dateTo) return false;
    if (agrFilter) {
      var wName = laWaiverName(s.waiver_version_id, versions);
      if (wName !== agrFilter) return false;
    }
    return true;
  });

  if (!filtered.length) {
    el.innerHTML = '<p style="color:#aaa;font-size:13px;padding:12px 0;">No signatures found.</p>';
    return;
  }

  var html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
  html += '<thead><tr style="background:#f9fafb;border-bottom:2px solid #e8ecef;">';
  ['Agreement','Client','Signed By','Method','Date','IP',''].forEach(function(h){
    html += '<th style="text-align:left;padding:10px 14px;color:#555;font-weight:700;">' + h + '</th>';
  });
  html += '</tr></thead><tbody>';
  filtered.forEach(function(s) {
    var dt = s.signed_at ? new Date(s.signed_at).toLocaleString('en-US',{ timeZone:'America/Chicago', dateStyle:'short', timeStyle:'short' }) : '';
    html += '<tr style="border-bottom:1px solid #f0f0f0;">';
    html += '<td style="padding:10px 14px;font-weight:600;color:#1a2530;">' + esc(laWaiverName(s.waiver_version_id, versions)) + '</td>';
    html += '<td style="padding:10px 14px;color:#555;">' + esc(s.client_email || '') + '</td>';
    html += '<td style="padding:10px 14px;color:#555;">' + esc(s.signed_name  || '') + '</td>';
    html += '<td style="padding:10px 14px;color:#888;text-transform:capitalize;">' + esc(s.signature_method || '') + '</td>';
    html += '<td style="padding:10px 14px;color:#888;white-space:nowrap;">' + esc(dt) + '</td>';
    html += '<td style="padding:10px 14px;color:#aaa;font-size:11px;font-family:monospace;">' + esc((s.ip_address||'').split(',')[0].trim()) + '</td>';
    html += '<td style="padding:10px 14px;"><button class="cr-btn cr-btn-sm" data-la-sig-detail="' + esc(s.id) + '" style="font-size:11px;padding:4px 10px;">Details</button></td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function laWaiverName(id, versions) {
  var v = versions.find(function(w){ return w.id === id; });
  return v ? v.name : id;
}

// ── Export CSV ───────────────────────────────────────────
function laSigExportCsv() {
  var sigs     = (window._hbShared && window._hbShared.waiverSignatures) || [];
  var versions = (window._hbShared && window._hbShared.waiverVersions)   || [];
  var rows = [['Agreement','Client Email','Signed By','Method','Signed At','IP Address']];
  sigs.forEach(function(s) {
    rows.push([
      laWaiverName(s.waiver_version_id, versions),
      s.client_email || '',
      s.signed_name  || '',
      s.signature_method || '',
      s.signed_at    || '',
      (s.ip_address  || '').split(',')[0].trim(),
    ]);
  });
  var csv  = rows.map(function(r){ return r.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href   = url; a.download = 'signature-audit-log.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── Helper — esc() moved to shared/admin-utils.js (HEA-233) ──

// ── Archive toggle — only changes is_active (immutable trigger blocks all other updates) ──
async function laToggleArchive(id) {
  var w = (window._hbShared.waiverVersions || []).find(function(v){ return v.id === id; });
  if (!w) return;
  var newActive = !w.is_active;
  var label = newActive ? 'reactivate' : 'archive';
  if (!await hwConfirm((newActive ? 'Reactivate' : 'Deactivate') + ' <strong>' + esc(w.name) + '</strong>?' + (!newActive ? '<br><span style="font-size:12px;color:#888;">Deactivating prevents this agreement from being shown to new clients. Existing signed agreements are unaffected.</span>' : ''), { title: newActive ? 'Reactivate Agreement' : 'Deactivate Agreement', confirmLabel: newActive ? 'Reactivate' : 'Deactivate' })) return;
  var res = await waiverFetch('waiver_versions?id=eq.' + encodeURIComponent(id), { method: 'PATCH', prefer: 'return=representation', body: JSON.stringify({ is_active: newActive }) });
  if (!res.ok) { var j = await res.json(); hwAlert('Failed: ' + ((j && j.message) || res.status)); return; }
  var json = await res.json();
  var updated = Array.isArray(json) ? json[0] : json;
  var idx = (window._hbShared.waiverVersions || []).findIndex(function(v){ return v.id === id; });
  if (idx >= 0) window._hbShared.waiverVersions[idx] = updated;
  renderLaTemplates();
  hwToast(newActive ? 'Agreement reactivated.' : 'Agreement deactivated.');
}

// ── View signature details modal ──────────────────────────
function laViewSignatureDetails(sigId) {
  var sigs     = (window._hbShared && window._hbShared.waiverSignatures) || [];
  var versions = (window._hbShared && window._hbShared.waiverVersions) || [];
  var s = sigs.find(function(x) { return x.id === sigId; });
  if (!s) return;
  var w = versions.find(function(v) { return v.id === s.waiver_version_id; });

  var existing = document.getElementById('laSigDetailModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'laSigDetailModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;';

  var dt = s.signed_at ? new Date(s.signed_at).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'long', timeStyle: 'short' }) : '—';

  var html = '<div style="background:#fff;border-radius:14px;width:100%;max-width:680px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.2);">';
  html += '<div style="background:linear-gradient(135deg,#121e30,#1a2a44);padding:18px 24px;display:flex;align-items:center;justify-content:space-between;">';
  html += '<div><div style="font-family:Barlow Condensed,sans-serif;font-size:18px;font-weight:700;color:#fff;letter-spacing:1px;">Signature Details</div>';
  html += '<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:3px;">' + esc(s.signed_name || '') + ' — ' + esc(dt) + '</div></div>';
  html += '<button onclick="document.getElementById(\'laSigDetailModal\').remove()" style="background:rgba(255,255,255,0.12);border:none;color:#fff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:14px;">&#10005;</button>';
  html += '</div>';

  // Details grid
  html += '<div style="padding:20px 24px;">';
  html += '<table style="width:100%;font-size:13px;border-collapse:collapse;">';
  var rows = [
    ['Signed By', s.signed_name || '—'],
    ['Client Email', s.client_email || '—'],
    ['Agreement', w ? w.name : s.waiver_version_id],
    ['Method', (s.signature_method || '—')],
    ['Signed At', dt],
    ['IP Address', (s.ip_address || '—').split(',')[0].trim()],
    ['User Agent', s.user_agent || '—'],
    ['Record ID', s.inspection_record_id || s.booking_id || '—'],
  ];
  rows.forEach(function(r) {
    html += '<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px 0;font-weight:600;color:#555;width:130px;">' + r[0] + '</td><td style="padding:8px 0;color:#1a2530;word-break:break-all;">' + esc(r[1]) + '</td></tr>';
  });
  html += '</table>';

  // Signature rendering
  if (s.signature_method === 'drawn' && s.signature_data) {
    html += '<div style="margin-top:16px;text-align:center;"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin-bottom:8px;">Signature</div>';
    html += '<img src="' + esc(s.signature_data) + '" alt="Drawn signature" style="max-width:100%;max-height:180px;border:1px solid #e8ecef;border-radius:8px;background:#fff;padding:8px;">';
    html += '</div>';
  } else if (s.signature_method === 'typed' && s.signed_name) {
    html += '<div style="margin-top:16px;text-align:center;"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin-bottom:8px;">Signature</div>';
    html += '<div style="font-family:\'Dancing Script\',\'Brush Script MT\',cursive;font-size:32px;color:#1a2a44;padding:16px;border:1px solid #e8ecef;border-radius:8px;background:#fff;">' + esc(s.signed_name) + '</div>';
    html += '</div>';
  }

  // Checkbox responses
  var cbResponses = s.checkbox_responses;
  if (cbResponses && typeof cbResponses === 'object') {
    html += '<div style="margin-top:16px;"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin-bottom:8px;">Checkbox Responses</div>';
    html += '<ul style="font-size:13px;color:#333;line-height:1.8;padding-left:20px;">';
    if (Array.isArray(cbResponses)) {
      cbResponses.forEach(function(cb) {
        html += '<li>' + esc(typeof cb === 'object' ? (cb.label || JSON.stringify(cb)) : String(cb)) + '</li>';
      });
    } else {
      Object.keys(cbResponses).forEach(function(k) {
        html += '<li><strong>' + esc(k) + ':</strong> ' + esc(String(cbResponses[k])) + '</li>';
      });
    }
    html += '</ul></div>';
  }

  // Agreement text
  if (w && w.body) {
    html += '<div style="margin-top:16px;"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin-bottom:8px;">Agreement Text Signed</div>';
    html += '<div style="max-height:300px;overflow-y:auto;padding:12px 14px;background:#f9fafb;border:1px solid #e8ecef;border-radius:8px;font-size:12px;line-height:1.7;color:#333;">' + w.body + '</div>';
    html += '</div>';
  }

  html += '</div>'; // end padding
  html += '<div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #e8ecef;text-align:right;"><button onclick="document.getElementById(\'laSigDetailModal\').remove()" style="padding:9px 20px;background:#f0f0f0;color:#555;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">Close</button></div>';
  html += '</div>';

  modal.innerHTML = html;
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

window.laViewSignatureDetails = laViewSignatureDetails;

// ── Wire events (delegated + direct) ────────────────────
document.addEventListener('click', function(e) {
  // View button
  var viewBtn = e.target.closest('[data-la-view]');
  if (viewBtn) { laViewTemplate(viewBtn.getAttribute('data-la-view')); return; }
  // Archive toggle button
  var archiveBtn = e.target.closest('[data-la-archive]');
  if (archiveBtn) { laToggleArchive(archiveBtn.getAttribute('data-la-archive')); return; }
  // View signature details button
  var sigDetailBtn = e.target.closest('[data-la-sig-detail]');
  if (sigDetailBtn) { laViewSignatureDetails(sigDetailBtn.getAttribute('data-la-sig-detail')); return; }
  // Remove checkbox row (in editor)
  if (e.target.classList.contains('la-cb-remove')) {
    e.target.closest('.la-cb-row').remove(); return;
  }
});

function wireOnce(id, fn) {
  var el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

document.addEventListener('DOMContentLoaded', function() {
  wireOnce('laAddWaiverBtn',  function(){ laOpenEditor(null); });
  wireOnce('laSaveBtn',       laSave);
  wireOnce('laCancelBtn',     laCloseEditor);
  wireOnce('laCancelBtn2',    laCloseEditor);
  wireOnce('laAddCheckboxBtn',function(){ laAddCheckboxRow('','',true); });
  wireOnce('laSigRefreshBtn', renderLaSigTable);
  wireOnce('laSigExportBtn',  laSigExportCsv);
  wireOnce('laPreviewBtn', function() {
    var wrap = document.getElementById('laPreviewWrap');
    var body = document.getElementById('laBody').value;
    if (wrap.style.display === 'none') {
      wrap.innerHTML = body || '<em style="color:#aaa;">Nothing to preview.</em>';
      wrap.style.display = '';
    } else {
      wrap.style.display = 'none';
    }
  });

  // Search/filter live
  ['laSigSearch','laSigDateFrom','laSigDateTo'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', renderLaSigTable);
  });
  var agrFilterEl = document.getElementById('laSigAgreementFilter');
  if (agrFilterEl) agrFilterEl.addEventListener('change', renderLaSigTable);

  // Don't call renderLaTemplates here — data not loaded yet at DOMContentLoaded.
  // It fires when: (a) Legal Agreements tab is clicked, (b) after loadConfig() via setTimeout.
});

// ── Owner gate ──────────────────────────────────────────
var _laIsOwner = null;

async function laCheckOwnerAndRender() {
  if (_laIsOwner === null) {
    try {
      var authHdr = {};
      var _sb = window._heartlandSB || window.sb;
      if (_sb) {
        var sess = await _sb.auth.getSession();
        if (sess && sess.data && sess.data.session) {
          authHdr = { 'Authorization': 'Bearer ' + sess.data.session.access_token };
        }
      }
      var res = await fetch('/.netlify/functions/check-owner', { headers: authHdr });
      var data = await res.json();
      _laIsOwner = !!(data && data.isOwner);
    } catch (e) { _laIsOwner = false; }
  }

  var subs    = document.getElementById('laSubs');
  var locked  = document.getElementById('laLockedState');
  var panels  = ['laPanelTemplates', 'laPanelSignatures', 'laPanelAgreementReminders', 'laPanelDataPolicy', 'laPanelBreach', 'laPanelRetention', 'laEditorWrap', 'laAddWaiverBtn'];

  if (!_laIsOwner) {
    if (subs) subs.style.display = 'none';
    panels.forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; });
    if (locked) locked.style.display = 'block';
    return;
  }

  if (subs) subs.style.display = '';
  if (locked) locked.style.display = 'none';
  renderLaTemplates();
}
window.laCheckOwnerAndRender = laCheckOwnerAndRender;

// ── Agreement Reminders — read-only audit trail ─────────────────
async function laLoadReminders() {
  var el = document.getElementById('laReminderTable');
  if (!el) return;
  el.innerHTML = '<p style="color:#888;font-size:13px;padding:12px 0;">Loading...</p>';
  try {
    var authHdr = await laGetAuthHeader();
    // Fetch scheduled + recent records
    var recRes = await fetch('/.netlify/functions/get-clients?status=scheduled,submitted,narrative,delivered,approved&limit=500', { headers: authHdr });
    var recData = await recRes.json();
    var records = (recData.clients || []).filter(function(r) { return r.inspection_date; });

    // Fetch reminder logs
    var SUPABASE_URL = 'https://fusravedbksupcsjfzda.supabase.co';
    var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
    var logRes = await fetch(SUPABASE_URL + '/rest/v1/agreement_reminder_log?select=inspection_id,reminder_type,sent_at&order=sent_at.desc', {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
    });
    var logs = await logRes.json();
    var logMap = {};
    (Array.isArray(logs) ? logs : []).forEach(function(l) {
      if (!logMap[l.inspection_id]) logMap[l.inspection_id] = {};
      logMap[l.inspection_id][l.reminder_type] = l.sent_at;
    });

    // Fetch waiver signatures for signed status
    var sigs = (window._hbShared && window._hbShared.waiverSignatures) || [];

    var filter = (document.getElementById('laReminderFilter') || {}).value || '';
    var now = new Date();

    var rows = records.map(function(r) {
      var rLogs = logMap[r.id] || {};
      var recSigs = sigs.filter(function(s) { return s.inspection_record_id === r.id; });
      var isSigned = r.signed_agreement === true || recSigs.length > 0;
      var inspDate = new Date(r.inspection_date + 'T12:00:00');
      var isPast = inspDate < now;

      var status, statusSort;
      if (isSigned) {
        var sigTime = recSigs.length ? recSigs[0].signed_at : '';
        status = '✅ Signed' + (sigTime ? ' — ' + new Date(sigTime).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : '');
        statusSort = 1;
      } else if (isPast) {
        status = '⚠️ Unsigned at inspection time';
        statusSort = 4;
      } else if (rLogs['24hr']) {
        status = '⏳ 24hr sent — ' + new Date(rLogs['24hr']).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
        statusSort = 3;
      } else if (rLogs['48hr']) {
        status = '⏳ 48hr sent — ' + new Date(rLogs['48hr']).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
        statusSort = 2;
      } else {
        status = '—';
        statusSort = 0;
      }

      var filterKey = isSigned ? 'signed' : isPast ? 'unsigned' : rLogs['24hr'] ? '24hr' : rLogs['48hr'] ? '48hr' : '';
      return { r: r, status: status, statusSort: statusSort, filterKey: filterKey };
    });

    // Apply filter
    if (filter) rows = rows.filter(function(row) { return row.filterKey === filter; });

    // Sort by inspection date descending
    rows.sort(function(a, b) { return (b.r.inspection_date || '').localeCompare(a.r.inspection_date || ''); });

    if (!rows.length) {
      el.innerHTML = '<p style="color:#aaa;font-size:13px;padding:12px 0;">No records found.</p>';
      return;
    }

    var html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr style="background:#f9fafb;border-bottom:2px solid #e8ecef;">';
    ['Client', 'Address', 'Inspection Date', 'Status'].forEach(function(h) {
      html += '<th style="text-align:left;padding:10px 14px;color:#555;font-weight:700;">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    rows.forEach(function(row) {
      var r = row.r;
      var dateStr = r.inspection_date ? new Date(r.inspection_date + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
      html += '<tr style="border-bottom:1px solid #f0f0f0;">';
      html += '<td style="padding:10px 14px;font-weight:600;color:#1a2530;">' + esc(r.cust_name || '—') + '</td>';
      html += '<td style="padding:10px 14px;color:#555;">' + esc(r.address || '—') + '</td>';
      html += '<td style="padding:10px 14px;color:#888;">' + esc(dateStr) + '</td>';
      html += '<td style="padding:10px 14px;">' + row.status + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = '<p style="color:#e74c3c;font-size:13px;padding:12px 0;">Error loading reminders.</p>';
    console.error('laLoadReminders error:', err);
  }
}

// Wire filter + refresh
document.addEventListener('DOMContentLoaded', function() {
  var filterEl = document.getElementById('laReminderFilter');
  if (filterEl) filterEl.addEventListener('change', laLoadReminders);
  var refreshBtn = document.getElementById('laReminderRefreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', laLoadReminders);
});

// Load reminders when tab is shown
document.addEventListener('click', function(e) {
  var tab = e.target.closest('[data-lapanel="agreement-reminders"]');
  if (tab) setTimeout(laLoadReminders, 50);
});

// ── Breach Response — checklist modal ─────────────────
document.addEventListener('DOMContentLoaded', function () {
  var checklistBtn = document.getElementById('laBreachChecklistBtn');
  if (checklistBtn) {
    checklistBtn.addEventListener('click', function () {
      var existing = document.getElementById('laBreachChecklistModal');
      if (existing) existing.remove();

      var steps = [
        'Identify what was accessed and when',
        'Determine how many clients are affected',
        'Change all credentials immediately (Supabase, Netlify env vars, Stripe API keys, Cloudinary API keys)',
        'Use the Breach Notification tool below to notify affected clients',
        'If >500 Illinois residents affected — notify IL Attorney General within 45 days',
        'Document everything — date discovered, scope, actions taken, notifications sent',
        'Review and patch the security gap',
      ];

      var modal = document.createElement('div');
      modal.id = 'laBreachChecklistModal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;';

      var html = '<div style="background:#fff;border-radius:14px;width:100%;max-width:560px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.2);">';
      html += '<div style="background:#c0392b;padding:18px 24px;"><div style="font-family:Barlow Condensed,sans-serif;font-size:18px;font-weight:700;color:#fff;letter-spacing:1px;">&#x1F6A8; Incident Response Checklist</div></div>';
      html += '<div style="padding:20px 24px;">';
      steps.forEach(function (step, i) {
        html += '<label style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#333;cursor:pointer;line-height:1.5;">';
        html += '<input type="checkbox" class="la-checklist-cb" style="margin-top:3px;width:16px;height:16px;flex-shrink:0;">';
        html += '<span>' + (i + 1) + '. ' + step + '</span>';
        html += '</label>';
      });
      html += '</div>';
      html += '<div style="padding:14px 24px;background:#f9fafb;border-top:1px solid #e8ecef;display:flex;justify-content:flex-end;gap:8px;">';
      html += '<button onclick="window.print()" style="padding:9px 20px;background:var(--primary);color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">Print</button>';
      html += '<button onclick="document.getElementById(\'laBreachChecklistModal\').remove()" style="padding:9px 20px;background:#f0f0f0;color:#555;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">Close</button>';
      html += '</div></div>';

      modal.innerHTML = html;
      modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
      document.body.appendChild(modal);
    });
  }

  // Breach scope radio toggle
  document.querySelectorAll('input[name="laBreachScope"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      var v = this.value;
      var dr = document.getElementById('laBreachDateRange');
      var sc = document.getElementById('laBreachSingleClient');
      if (dr) dr.style.display = v === 'date_range' ? '' : 'none';
      if (sc) sc.style.display = v === 'single' ? '' : 'none';
    });
  });

  // Breach preview
  var previewBtn = document.getElementById('laBreachPreviewBtn');
  if (previewBtn) {
    previewBtn.addEventListener('click', async function () {
      var status = document.getElementById('laBreachStatus');
      status.textContent = 'Counting recipients...';
      // Simple count — query inspection_records for unique emails based on scope
      try {
        var scope = document.querySelector('input[name="laBreachScope"]:checked').value;
        var authHdr = await laGetAuthHeader();
        var url = '/.netlify/functions/get-clients?status=all&limit=10000';
        var res = await fetch(url, { headers: authHdr });
        var data = await res.json();
        var clients = data.clients || [];
        if (scope === 'date_range') {
          var s = document.getElementById('laBreachStart').value;
          var e = document.getElementById('laBreachEnd').value;
          clients = clients.filter(function (c) { return c.inspection_date >= s && c.inspection_date <= e; });
        } else if (scope === 'single') {
          var em = document.getElementById('laBreachEmail').value.trim().toLowerCase();
          clients = clients.filter(function (c) { return (c.cust_email || '').toLowerCase() === em; });
        }
        var emails = {};
        clients.forEach(function (c) { if (c.cust_email) emails[c.cust_email] = true; });
        status.textContent = Object.keys(emails).length + ' client(s) will be notified.';
      } catch (err) {
        status.textContent = 'Error counting recipients.';
      }
    });
  }

  // Breach send
  var sendBtn = document.getElementById('laBreachSendBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', async function () {
      var scope = document.querySelector('input[name="laBreachScope"]:checked').value;
      var message = document.getElementById('laBreachMessage').value;
      if (!message.trim()) { hwToast('Message is required.'); return; }
      if (!await hwConfirm('Send breach notification to ' + scope + ' scope? This cannot be undone.', { title: 'Send Breach Notification', confirmLabel: 'Send Now', confirmColor: '#c0392b' })) return;

      var payload = { scope: scope, message: message };
      if (scope === 'date_range') {
        payload.start_date = document.getElementById('laBreachStart').value;
        payload.end_date = document.getElementById('laBreachEnd').value;
      } else if (scope === 'single') {
        payload.client_email = document.getElementById('laBreachEmail').value.trim();
      }

      sendBtn.disabled = true; sendBtn.textContent = 'Sending...';
      try {
        var authHdr = await laGetAuthHeader();
        var res = await fetch('/.netlify/functions/send-breach-notification', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHdr),
          body: JSON.stringify(payload),
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Send failed');
        hwToast('Breach notification sent to ' + data.sent + ' recipient(s).');
        document.getElementById('laBreachStatus').textContent = 'Sent to ' + data.sent + ' recipient(s) at ' + new Date().toLocaleTimeString();
      } catch (err) {
        hwAlert('Send failed: ' + err.message);
      } finally {
        sendBtn.disabled = false; sendBtn.textContent = 'Send Notification';
      }
    });
  }

  // Retention — select all toggle
  var selectAll = document.getElementById('laRetentionSelectAll');
  if (selectAll) {
    selectAll.addEventListener('change', function () {
      document.querySelectorAll('.la-retention-cb').forEach(function (cb) { cb.checked = selectAll.checked; });
      laUpdatePurgeBtn();
    });
  }

  // Retention — refresh
  var retRefresh = document.getElementById('laRetentionRefreshBtn');
  if (retRefresh) retRefresh.addEventListener('click', laLoadRetention);

  // Retention — purge
  var purgeBtn = document.getElementById('laRetentionPurgeBtn');
  if (purgeBtn) {
    purgeBtn.addEventListener('click', async function () {
      var selected = [];
      document.querySelectorAll('.la-retention-cb:checked').forEach(function (cb) { selected.push(cb.dataset.id); });
      if (!selected.length) return;

      var msg = '<strong>' + selected.length + ' record(s)</strong> will be permanently deleted.<br><br>' +
        'Tables purged: inspection_records, inspection_findings, inspection_finding_photos, inspection_narratives, property_profiles.<br><br>' +
        '<strong style="color:#27ae60;">Signed agreements are preserved and will NOT be deleted.</strong>';

      if (!await hwConfirm(msg, { title: 'Confirm Data Purge', confirmLabel: 'Delete ' + selected.length + ' Records', confirmColor: '#c0392b' })) return;

      purgeBtn.disabled = true; purgeBtn.textContent = 'Purging...';
      try {
        var authHdr = await laGetAuthHeader();
        var res = await fetch('/.netlify/functions/purge-old-records', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHdr),
          body: JSON.stringify({ record_ids: selected }),
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Purge failed');
        hwToast('Purged ' + data.purged + ' record(s).');
        laLoadRetention();
      } catch (err) {
        hwAlert('Purge failed: ' + err.message);
      } finally {
        purgeBtn.disabled = false; purgeBtn.textContent = 'Review & Delete Selected';
      }
    });
  }
});

// ── Retention helpers ──────────────────────────────────
async function laLoadRetention() {
  var table = document.getElementById('laRetentionTable');
  var lastPurge = document.getElementById('laRetentionLastPurge');
  if (!table) return;
  table.innerHTML = '<p style="color:#888;font-size:13px;">Loading...</p>';

  try {
    var authHdr = await laGetAuthHeader();
    var res = await fetch('/.netlify/functions/get-old-records', { headers: authHdr });
    var data = await res.json();
    var records = data.records || [];

    if (!records.length) {
      table.innerHTML = '<p style="color:#888;font-size:13px;padding:12px 0;">No records past the 7-year retention threshold.</p>';
    } else {
      var html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
      html += '<thead><tr style="background:#f9fafb;border-bottom:2px solid #e8ecef;">';
      html += '<th style="padding:10px 14px;width:30px;"></th>';
      ['Client', 'Address', 'Inspection Date', 'Age'].forEach(function (h) {
        html += '<th style="text-align:left;padding:10px 14px;color:#555;font-weight:700;">' + h + '</th>';
      });
      html += '</tr></thead><tbody>';
      records.forEach(function (r) {
        var age = r.inspection_date ? Math.floor((Date.now() - new Date(r.inspection_date + 'T12:00:00').getTime()) / (365.25 * 86400000)) : '?';
        html += '<tr style="border-bottom:1px solid #f0f0f0;">';
        html += '<td style="padding:10px 14px;"><input type="checkbox" class="la-retention-cb" data-id="' + (r.id || '') + '" onchange="window.laUpdatePurgeBtn()"></td>';
        html += '<td style="padding:10px 14px;font-weight:600;">' + (r.cust_name || '—') + '</td>';
        html += '<td style="padding:10px 14px;color:#555;">' + (r.address || '—') + '</td>';
        html += '<td style="padding:10px 14px;color:#888;">' + (r.inspection_date || '—') + '</td>';
        html += '<td style="padding:10px 14px;color:#c0392b;font-weight:700;">' + age + ' years</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      table.innerHTML = html;
    }

    // Last purge indicator
    if (lastPurge) {
      try {
        var auditRes = await fetch('/.netlify/functions/get-audit-log?action=data.retention_purge&limit=1', { headers: authHdr });
        var auditData = await auditRes.json();
        if (Array.isArray(auditData) && auditData.length && auditData[0].created_at) {
          lastPurge.textContent = new Date(auditData[0].created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        } else {
          lastPurge.textContent = 'Never purged';
        }
      } catch (e) { lastPurge.textContent = 'Never purged'; }
    }
  } catch (err) {
    table.innerHTML = '<p style="color:#e74c3c;font-size:13px;">Failed to load records.</p>';
  }
}

function laUpdatePurgeBtn() {
  var btn = document.getElementById('laRetentionPurgeBtn');
  var count = document.querySelectorAll('.la-retention-cb:checked').length;
  if (btn) btn.disabled = count === 0;
}
window.laUpdatePurgeBtn = laUpdatePurgeBtn;

// Window exposures (HEA-239)
window.laToggleGroup = laToggleGroup;
window.laViewSignatureDetails = laViewSignatureDetails;
window.laCheckOwnerAndRender = laCheckOwnerAndRender;
window.laUpdatePurgeBtn = laUpdatePurgeBtn;
window.laSigExportCsv = laSigExportCsv;
window.laOpenEditor = laOpenEditor;
window.laCloseEditor = laCloseEditor;
window.laSave = laSave;
window.laDelete = laDelete;
window.laToggleArchive = laToggleArchive;
window.laLoadReminders = laLoadReminders;
window.laLoadRetention = laLoadRetention;
