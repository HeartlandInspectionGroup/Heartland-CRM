/**
 * scripts/admin-account.js — My Account tab (HEA-233)
 * Extracted from admin.html main IIFE.
 * Reads: window._hbShared.agents, window._hbShared.sb, window._hbShared.currentUserRole, window._hbShared.currentUserName
 * Uses: getAuthHeader() (stays in main IIFE, global), esc() from admin-utils.js
 */

function renderMyAccount() {
  var sb = window._hbShared.sb;
  var agentsData = window._hbShared.agents || [];
  sb.auth.getSession().then(function(res) {
    var uid   = res.data && res.data.session ? res.data.session.user.id : null;
    var agent = agentsData.find(function(a) { return a.id === uid; });

    if (agent) {
      document.getElementById('acctName').value  = agent.name  || '';
      document.getElementById('acctEmail').value = agent.email || '';
      document.getElementById('acctPhone').value = agent.phone || '';
    }

    document.getElementById('acctSaveProfileBtn').onclick = async function() {
      var name  = document.getElementById('acctName').value.trim();
      var email = document.getElementById('acctEmail').value.trim();
      var phone = document.getElementById('acctPhone').value.trim();
      if (!name || !email) { showAcctMsg('acctProfileMsg', 'Name and email are required.', 'red'); return; }
      var btn = document.getElementById('acctSaveProfileBtn');
      btn.disabled = true; btn.textContent = 'Saving...';
      fetch('/.netlify/functions/manage-inspector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ action: 'update', id: uid, name: name, email: email, phone: phone })
      }).then(function(r) { return r.json(); }).then(function(d) {
        btn.disabled = false; btn.textContent = 'Save Profile';
        if (d.ok) {
          showAcctMsg('acctProfileMsg', '✓ Profile saved successfully.', 'green');
          window._hbShared.currentUserName = name;
          var avatarEl = document.getElementById('myAccountAvatar');
          if (avatarEl) avatarEl.textContent = name.trim().split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase() || '?';
          var sidebarAvatar = document.getElementById('sidebarAccountAvatar');
          if (sidebarAvatar) sidebarAvatar.textContent = name.trim().split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase() || '?';
          if (agent) { agent.name = name; agent.email = email; agent.phone = phone; }
        } else {
          showAcctMsg('acctProfileMsg', '✗ ' + (d.error || 'Error saving profile.'), 'red');
        }
      }).catch(function() {
        btn.disabled = false; btn.textContent = 'Save Profile';
        showAcctMsg('acctProfileMsg', '✗ Network error. Please try again.', 'red');
      });
    };

    document.getElementById('acctChangePwBtn').onclick = async function() {
      var pw1 = document.getElementById('acctNewPw').value;
      var pw2 = document.getElementById('acctConfirmPw').value;
      if (!pw1)         { showAcctMsg('acctPwMsg', '✗ Please enter a new password.', 'red'); return; }
      if (pw1 !== pw2)  { showAcctMsg('acctPwMsg', '✗ Passwords do not match.', 'red'); return; }
      if (pw1.length < 6) { showAcctMsg('acctPwMsg', '✗ Password must be at least 6 characters.', 'red'); return; }
      var btn = document.getElementById('acctChangePwBtn');
      btn.disabled = true; btn.textContent = 'Updating...';
      fetch('/.netlify/functions/manage-inspector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ action: 'update', id: uid, password: pw1 })
      }).then(function(r) { return r.json(); }).then(function(d) {
        btn.disabled = false; btn.textContent = 'Update Password';
        if (d.ok) {
          showAcctMsg('acctPwMsg', '✓ Password updated successfully.', 'green');
          document.getElementById('acctNewPw').value     = '';
          document.getElementById('acctConfirmPw').value = '';
        } else {
          showAcctMsg('acctPwMsg', '✗ ' + (d.error || 'Error updating password.'), 'red');
        }
      }).catch(function() {
        btn.disabled = false; btn.textContent = 'Update Password';
        showAcctMsg('acctPwMsg', '✗ Network error. Please try again.', 'red');
      });
    };

    renderMyMetrics(uid);
  });
}

function showAcctMsg(id, text, color) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color   = color === 'green' ? '#16a34a' : '#dc2626';
  el.style.fontWeight = '600';
  el.style.display = '';
  setTimeout(function() { el.style.display = 'none'; }, 5000);
}

function openMyAccount() {
  var btn = document.querySelector('.tab-btn[data-tab="my-account"]');
  if (btn) btn.click();
}

function populateAdminPwUserList() {
  var sel = document.getElementById('acctAdminPwUser');
  var currentUserRole = window._hbShared.currentUserRole || 'inspector';
  if (!sel || currentUserRole !== 'admin') return;
  var agents = window._hbShared.agents || [];
  sel.innerHTML = '<option value="">Choose a user...</option>' +
    agents.filter(function(a){ return a.active !== false; })
          .map(function(a){
            return '<option value="' + a.id + '">' + (a.name || a.email) + ' (' + (a.role || 'inspector') + ')</option>';
          }).join('');
  var btn = document.getElementById('acctAdminChangePwBtn');
  if (btn && !btn._wired) {
    btn._wired = true;
    btn.onclick = async function() {
      var uid  = sel.value;
      var pw1  = document.getElementById('acctAdminNewPw').value;
      var pw2  = document.getElementById('acctAdminConfirmPw').value;
      if (!uid) { showAcctMsg('acctAdminPwMsg', '✗ Please select a user.', 'red'); return; }
      if (!pw1) { showAcctMsg('acctAdminPwMsg', '✗ Please enter a new password.', 'red'); return; }
      if (pw1 !== pw2) { showAcctMsg('acctAdminPwMsg', '✗ Passwords do not match.', 'red'); return; }
      if (pw1.length < 6) { showAcctMsg('acctAdminPwMsg', '✗ Password must be at least 6 characters.', 'red'); return; }
      btn.disabled = true; btn.textContent = 'Resetting...';
      fetch('/.netlify/functions/manage-inspector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ action: 'update', id: uid, password: pw1 })
      }).then(function(r){ return r.json(); }).then(function(d){
        btn.disabled = false; btn.textContent = 'Reset Password';
        if (d.ok) {
          showAcctMsg('acctAdminPwMsg', '✓ Password reset successfully.', 'green');
          document.getElementById('acctAdminNewPw').value = '';
          document.getElementById('acctAdminConfirmPw').value = '';
          sel.value = '';
        } else {
          showAcctMsg('acctAdminPwMsg', '✗ ' + (d.error || 'Error resetting password.'), 'red');
        }
      }).catch(function(){
        btn.disabled = false; btn.textContent = 'Reset Password';
        showAcctMsg('acctAdminPwMsg', '✗ Network error. Please try again.', 'red');
      });
    };
  }
}

function renderMyMetrics(uid) {
  var grid   = document.getElementById('acctMetricsGrid');
  var recent = document.getElementById('acctRecentList');
  if (!grid || !uid) return;

  var allRecords  = (window._hbShared && window._hbShared.records)  || [];
  var allBookings = (window._hbShared && window._hbShared.bookings) || [];
  var myRecords   = allRecords.filter(function(r)  { return r.inspector_id === uid || r.agent_id === uid; });
  var myBookings  = allBookings.filter(function(b) { return b.agent_id === uid; });
  var completed   = myRecords.filter(function(r)   { return r.status === 'submitted' || r.status === 'completed'; });
  var now         = new Date();
  var thisMonth   = completed.filter(function(r) {
    var d = new Date(r.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  var stats = [
    { label: 'Total Inspections', value: completed.length, icon: '🔍' },
    { label: 'This Month',        value: thisMonth.length,  icon: '📅' },
    { label: 'My Bookings',       value: myBookings.length, icon: '📋' },
  ];
  grid.innerHTML = stats.map(function(s) {
    return '<div style="background:#f8f9fb;border:1px solid #e8eaed;border-radius:10px;padding:18px 20px;text-align:center;">' +
      '<div style="font-size:1.6rem;margin-bottom:6px;">' + s.icon + '</div>' +
      '<div style="font-size:28px;font-weight:700;color:var(--primary);">' + s.value + '</div>' +
      '<div style="font-size:12px;color:var(--text-light);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">' + s.label + '</div>' +
    '</div>';
  }).join('');

  var recents = myRecords.slice(-8).reverse();
  if (!recents.length) {
    recent.innerHTML = '<p style="font-size:13px;color:var(--text-light);">No recent activity found.</p>';
    return;
  }
  recent.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;">' +
    recents.map(function(r) {
      var d = new Date(r.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      var statusColor = { submitted:'var(--secondary)', completed:'var(--primary)', scheduled:'var(--accent)' }[r.status] || 'var(--text-light)';
      return '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#f8f9fb;border:1px solid #e8eaed;border-radius:8px;">' +
        '<div style="flex:1;font-size:13px;font-weight:600;">' + esc(r.property_address || 'Unknown address') + '</div>' +
        '<div style="font-size:12px;color:var(--text-light);">' + d + '</div>' +
        '<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:' + statusColor + ';">' + esc(r.status || '') + '</span>' +
      '</div>';
    }).join('') +
  '</div>';
}

window.openMyAccount = openMyAccount;
window.renderMyAccount = renderMyAccount;
window.renderMyMetrics = renderMyMetrics;
window.populateAdminPwUserList = populateAdminPwUserList;
