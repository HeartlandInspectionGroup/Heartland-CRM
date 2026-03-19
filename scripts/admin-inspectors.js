/**
 * scripts/admin-inspectors.js — Inspectors tab (HEA-234)
 * Extracted from admin.html main IIFE.
 * Uses: esc(), getAuthHeader(), hwConfirm(), hwAlert() (all global)
 * Netlify: manage-inspector
 */

var inspectorsLoaded = false;

function loadInspectors() {
  inspectorsLoaded = false;
  renderInspectorsList();
}

function renderInspectorsList() {
  var list = document.getElementById('inspectorsList');
  list.innerHTML = '<p style="padding:20px;color:#888;">Loading...</p>';
  var _sbUrl = 'https://fusravedbksupcsjfzda.supabase.co';
  var _sbKey = window.SUPABASE_ANON_KEY;
  fetch(_sbUrl + '/rest/v1/agents?or=(role.eq.inspector,role.eq.admin)&order=name&select=*', { headers: { apikey: _sbKey, Authorization: 'Bearer ' + _sbKey } }).then(function(r){ return r.json(); }).then(function(rows) {
    if (!rows || !rows.length) {
      list.innerHTML = '<p style="padding:20px;color:#888;">No inspectors found. Add one below.</p>';
      return;
    }
    list.innerHTML = rows.map(function(r) {
      var roleColor = r.role === 'admin' ? 'var(--primary)' : 'var(--secondary)';
      var rowData = esc(JSON.stringify(r));
      return '<div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #eee;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:150px;">' +
          '<div style="font-weight:600;font-size:14px;">' + esc(r.name || '') + '</div>' +
          '<div style="font-size:12px;color:var(--text-light);">' + esc(r.email || '') + '</div>' +
        '</div>' +
        '<span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:' + roleColor + '20;color:' + roleColor + ';">' + esc(r.role || 'inspector') + '</span>' +
        '<span style="font-size:12px;color:' + (r.active ? 'var(--secondary)' : 'var(--text-light)') + ';">' + (r.active ? '● Active' : '○ Inactive') + '</span>' +
        '<button class="ins-edit-btn" data-row="' + rowData + '" style="padding:5px 12px;border:1px solid var(--primary);border-radius:6px;background:none;color:var(--primary);cursor:pointer;font-family:\'Work Sans\',sans-serif;font-size:12px;font-weight:600;">Edit</button>' +
        '<button class="ins-del-btn" data-id="' + r.id + '" data-name="' + esc(r.name || r.email) + '" style="padding:5px 12px;border:1px solid var(--red);border-radius:6px;background:none;color:var(--red);cursor:pointer;font-family:\'Work Sans\',sans-serif;font-size:12px;font-weight:600;">Delete</button>' +
      '</div>';
    }).join('');
    list.querySelectorAll('.ins-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { try { showInspectorModal(JSON.parse(btn.dataset.row)); } catch(e) { console.error('Inspector row parse error:', e); } });
    });
    list.querySelectorAll('.ins-del-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { deleteInspector(btn.dataset.id, btn.dataset.name); });
    });
  });
}

async function deleteInspector(id, name) {
  if (!await hwConfirm('Delete inspector <strong>' + name + '</strong>? This will remove their profile and login credentials permanently.', {title:'Delete Inspector', confirmLabel:'Delete Inspector'})) return;
  fetch('/.netlify/functions/manage-inspector', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
    body: JSON.stringify({ action: 'delete', id: id })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.ok) { renderInspectorsList(); }
    else { hwAlert('Error deleting inspector: ' + (data.error || 'unknown error')); }
  });
}

function showInspectorModal(inspector) {
  var existing = document.getElementById('inspectorModal');
  if (existing) existing.remove();
  var isNew = !inspector || !inspector.id;
  var modal = document.createElement('div');
  modal.id = 'inspectorModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:14px;padding:36px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.25);max-height:90vh;overflow-y:auto;">' +
      '<h2 style="font-family:\'Crimson Pro\',serif;font-size:24px;color:var(--primary);margin-bottom:24px;">' + (isNew ? 'Add Inspector' : 'Edit Inspector') + '</h2>' +
      '<div style="margin-bottom:16px;">' +
        '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Full Name</label>' +
        '<input id="iModalName" value="' + esc((inspector && inspector.name) || '') + '" placeholder="Jake Smith" style="width:100%;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;">' +
      '</div>' +
      '<div style="margin-bottom:16px;">' +
        '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Email</label>' +
        '<input id="iModalEmail" type="email" value="' + esc((inspector && inspector.email) || '') + '" placeholder="email@heartlandinspectiongroup.com" style="width:100%;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;">' +
      '</div>' +
      '<div style="margin-bottom:16px;">' +
        '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">' + (isNew ? 'Password' : 'New Password') + '</label>' +
        '<input id="iModalPassword" type="password" placeholder="' + (isNew ? 'Set their password' : 'Leave blank to keep current') + '" autocomplete="new-password" style="width:100%;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;">' +
      '</div>' +
      '<div style="margin-bottom:16px;">' +
        '<label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Role</label>' +
        '<select id="iModalRole" style="width:100%;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;">' +
          '<option value="inspector"' + (inspector && inspector.role === 'inspector' ? ' selected' : '') + '>Inspector</option>' +
          '<option value="admin"' + (inspector && inspector.role === 'admin' ? ' selected' : '') + '>Admin</option>' +
        '</select>' +
      '</div>' +
      '<div style="margin-bottom:24px;display:flex;align-items:center;gap:12px;">' +
        '<label style="font-size:13px;font-weight:600;">Active</label>' +
        '<input id="iModalActive" type="checkbox"' + (!inspector || inspector.active !== false ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--secondary);cursor:pointer;">' +
      '</div>' +
      '<div id="iModalErr" style="color:var(--red);font-size:13px;margin-bottom:12px;display:none;"></div>' +
      '<div style="display:flex;gap:12px;">' +
        '<button id="iModalSave" style="flex:1;padding:12px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;font-weight:700;cursor:pointer;">' + (isNew ? 'Add Inspector' : 'Save Changes') + '</button>' +
        '<button id="iModalCancel" style="padding:12px 20px;background:#f5f7f8;color:var(--text-dark);border:1px solid #ddd;border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;cursor:pointer;">Cancel</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  document.getElementById('iModalCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  document.getElementById('iModalSave').addEventListener('click', async function() {
    var name     = document.getElementById('iModalName').value.trim();
    var email    = document.getElementById('iModalEmail').value.trim();
    var password = document.getElementById('iModalPassword').value;
    var role     = document.getElementById('iModalRole').value;
    var active   = document.getElementById('iModalActive').checked;
    var errEl    = document.getElementById('iModalErr');
    if (!name)  { errEl.textContent = 'Name is required.';  errEl.style.display = ''; return; }
    if (!email) { errEl.textContent = 'Email is required.'; errEl.style.display = ''; return; }
    if (isNew && !password) { errEl.textContent = 'Password is required for new inspectors.'; errEl.style.display = ''; return; }
    errEl.style.display = 'none';
    var btn = document.getElementById('iModalSave');
    btn.disabled = true; btn.textContent = 'Saving...';
    var payload = { action: isNew ? 'create' : 'update', name: name, email: email, role: role, active: active };
    if (isNew) payload.password = password;
    if (!isNew) payload.id = inspector.id;
    if (!isNew && password) payload.password = password;
    fetch('/.netlify/functions/manage-inspector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      body: JSON.stringify(payload)
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.ok) { modal.remove(); renderInspectorsList(); }
      else { errEl.textContent = data.error || 'Error saving. Try again.'; errEl.style.display = ''; btn.disabled = false; btn.textContent = isNew ? 'Add Inspector' : 'Save Changes'; }
    });
  });
}

document.addEventListener('DOMContentLoaded', function() {
  var addBtn = document.getElementById('addInspectorBtn');
  if (addBtn) addBtn.addEventListener('click', function() { showInspectorModal(null); });
});

window.loadInspectors = loadInspectors;
window.renderInspectorsList = renderInspectorsList;
