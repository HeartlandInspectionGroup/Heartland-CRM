/**
 * scripts/admin-email-templates.js — Email Templates tab (HEA-234)
 * Extracted from admin.html main IIFE.
 * Uses: esc(), getAuthHeader(), hwToast(), hwAlert(), hwConfirm() (all global)
 * Netlify: get-email-templates, save-email-template
 */

var ET_DEFS = [
  { key:'booking_received', name:'Booking Received', type:'auto', trigger:'Fires when a client submits a booking on the website (index.html booking form)', vars:['address','date','time'] },
  { key:'booking_confirmed', name:'Booking Confirmed', type:'manual', trigger:'Triggered by the "✓ Confirm" button on a booking card in Admin → All Bookings', vars:['client_name','address','date','time','inspector_name'] },
  { key:'agreement_signed', name:'Agreement Signed', type:'auto', trigger:'Fires when the client signs their agreement in the Client Portal', vars:['client_name','address','date'] },
  { key:'field_payment_receipt', name:'Field Payment Receipt', type:'auto', trigger:'Fires when payment is collected via the "Collect Payment" button in the Inspector Wizard V2', vars:['client_name','address','amount','date','method'] },
  { key:'report_delivery', name:'Report Ready', type:'auto', trigger:'Fires when Jake clicks "Send Report to Client" in Narrative Review (after all narratives are approved)', vars:['client_name','address','date'] },
  { key:'send_invoice', name:'Invoice', type:'manual', trigger:'Triggered by the "Send Invoice" button on a client record in Admin → Client Records', vars:['client_name','address','date'] },
  { key:'send_portal_link', name:'Portal Link', type:'manual', trigger:'Triggered by the "Send Portal Link" button on a client record in Admin → Client Records', vars:['client_name','address'] },
  { key:'cancel_client', name:'Cancellation Confirmation', type:'auto', trigger:'Fires when a booking is cancelled from Admin, the Client Portal, or the Agent Portal', vars:['client_name','address','date'] },
  { key:'reschedule_client', name:'Reschedule Confirmation', type:'auto', trigger:'Fires when a reschedule is approved from Admin, or requested from the Client Portal or Agent Portal', vars:['client_name','address','old_date','new_date'] },
  { key:'agreement_reminder_48hr', name:'Agreement Reminder (48hr)', type:'auto', trigger:'Fires automatically via scheduled function — 48 hours before inspection if agreement is unsigned', vars:['client_name','address','date','time'] },
  { key:'agreement_reminder_24hr', name:'Agreement Reminder (24hr)', type:'auto', trigger:'Fires automatically via scheduled function — 24 hours before inspection if agreement is still unsigned', vars:['client_name','address','date','time'] },
];
var etData = {};
var _etLoaded = false;

async function loadEmailTemplates() {
  var el = document.getElementById('emailTemplatesList');
  if (!el) return;
  el.innerHTML = '<p style="color:#888;font-size:13px;padding:12px 0;">Loading templates...</p>';
  try {
    var res = await fetch('/.netlify/functions/get-email-templates', {
      headers: { ...(await getAuthHeader()) }
    });
    var data = await res.json();
    var rows = data.templates || [];
    rows.forEach(function(r) { etData[r.template_key] = r; });
    renderEmailTemplates();
  } catch(e) {
    el.innerHTML = '<p style="color:#e74c3c;font-size:13px;">Error loading templates.</p>';
  }
}

function renderEmailTemplates() {
  var el = document.getElementById('emailTemplatesList');
  if (!el) return;
  var h = '';
  ET_DEFS.forEach(function(def) {
    var data = etData[def.key] || {};
    var subj = data.subject || '';
    var body = data.body || '';
    var badge = def.type === 'auto'
      ? '<span style="display:inline-block;background:rgba(39,174,96,0.12);color:#27ae60;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">🤖 Automatic</span>'
      : '<span style="display:inline-block;background:rgba(21,81,109,0.1);color:#15516d;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">👤 Manual</span>';
    h += '<div class="rec-card" style="margin-bottom:12px;">';
    h += '<div class="rec-card-top" style="cursor:pointer;" onclick="etToggle(\'' + def.key + '\')">';
    h += '<div style="display:flex;align-items:center;gap:10px;flex:1;"><strong style="font-size:14px;color:#1a2530;">' + esc(def.name) + '</strong> ' + badge + '</div>';
    h += '<span id="et-chev-' + def.key + '" style="font-size:12px;color:#aaa;transition:transform 0.2s;">▼</span>';
    h += '</div>';
    h += '<div id="et-body-' + def.key + '" style="display:none;padding-top:16px;">';
    h += '<div style="font-size:12px;color:#6b7d8a;margin-bottom:14px;line-height:1.5;">' + esc(def.trigger) + '</div>';
    h += '<div style="margin-bottom:12px;"><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#888;display:block;margin-bottom:4px;">Subject Line</label>';
    h += '<input type="text" id="et-subj-' + def.key + '" value="' + esc(subj) + '" style="width:100%;padding:10px 14px;border:2px solid rgba(0,0,0,0.08);border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;"></div>';
    h += '<div style="margin-bottom:12px;"><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#888;display:block;margin-bottom:4px;">Body</label>';
    h += '<textarea id="et-body-txt-' + def.key + '" rows="4" style="width:100%;padding:10px 14px;border:2px solid rgba(0,0,0,0.08);border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:14px;resize:vertical;line-height:1.6;">' + esc(body) + '</textarea></div>';
    h += '<div style="margin-bottom:14px;display:flex;flex-wrap:wrap;gap:6px;">';
    def.vars.forEach(function(v) { h += '<span style="background:#f0f2f5;color:#555;font-size:11px;font-weight:600;padding:3px 10px;border-radius:4px;font-family:monospace;">{{' + v + '}}</span>'; });
    h += '</div>';
    h += '<div style="display:flex;gap:8px;">';
    h += '<button class="add-svc-btn" style="width:auto;padding:10px 20px;margin:0;" onclick="etSave(\'' + def.key + '\')">Save</button>';
    h += '<button class="add-svc-btn" style="width:auto;padding:10px 20px;margin:0;border-color:#c0392b;color:#c0392b;" onclick="etReset(\'' + def.key + '\')">Reset to Default</button>';
    h += '</div></div></div>';
  });
  el.innerHTML = h;
}

window.etToggle = function(key) {
  var body = document.getElementById('et-body-' + key);
  var chev = document.getElementById('et-chev-' + key);
  if (!body) return;
  var open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (chev) chev.style.transform = open ? '' : 'rotate(180deg)';
};

window.etSave = async function(key) {
  var subj = (document.getElementById('et-subj-' + key) || {}).value || '';
  var body = (document.getElementById('et-body-txt-' + key) || {}).value || '';
  try {
    var res = await fetch('/.netlify/functions/save-email-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      body: JSON.stringify({ template_key: key, subject: subj, body: body }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
    if (data.template) etData[key] = data.template;
    hwToast('Template saved.');
  } catch(e) { hwAlert('Save failed: ' + e.message); }
};

window.etReset = async function(key) {
  var data = etData[key];
  if (!data) return;
  if (!await hwConfirm('Reset this template to its default content?', { title:'Reset Template', confirmLabel:'Reset' })) return;
  try {
    var res = await fetch('/.netlify/functions/save-email-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      body: JSON.stringify({ template_key: key, subject: data.default_subject, body: data.default_body }),
    });
    var d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Reset failed');
    if (d.template) etData[key] = d.template;
    var subjEl = document.getElementById('et-subj-' + key);
    var bodyEl = document.getElementById('et-body-txt-' + key);
    if (subjEl) subjEl.value = data.default_subject;
    if (bodyEl) bodyEl.value = data.default_body;
    hwToast('Template reset to default.');
  } catch(e) { hwAlert('Reset failed: ' + e.message); }
};

window.loadEmailTemplates = loadEmailTemplates;
window._etLoaded = function() { return _etLoaded; };
