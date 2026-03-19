/**
 * scripts/admin-qa-review.js — QA Review tab (HEA-234)
 * Extracted from QC IIFE in admin.html.
 * Uses: esc(), sbFetch(), showClientPopoverFromRecord(), hwConfirm(), hwAlert() (all global via admin-utils.js)
 * Fix: replaced bare prompt() with hwConfirm + inline input per architecture rule 10.
 */

var qaLoaded = false;

function loadQAReview() {
  qaLoaded = true;
  var list = document.getElementById('qaReviewList');
  var status = document.getElementById('qaStatusFilter').value;
  list.innerHTML = '<p style="padding:20px;color:#888;">Loading...</p>';
  sbFetch('inspection_records?status=eq.' + status + '&select=*,clients(name,email)&order=completed_at.desc').then(function(r){return r.json();}).then(function(rows){
    if (!rows || !rows.length) { list.innerHTML = '<p style="padding:20px;color:#888;">No inspections with status "' + status + '".</p>'; return; }
    list.innerHTML = rows.map(function(rec){
      var client = rec.cust_name || (rec.clients ? rec.clients.name : 'Unknown');
      var findings = rec.findings || {};
      var majorCount = findings.major_count || 0;
      var minorCount = findings.minor_count || 0;
      return '<div style="background:#fff;border:1px solid #eee;border-radius:10px;padding:16px;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
          '<div><strong>' + esc(rec.inspection_address) + '</strong><br><span style="font-size:0.85rem;color:#888;"><a href="#" class="client-detail-link" data-client-id="' + (rec.client_id || '') + '" data-record-id="' + rec.id + '" style="color:#15516d;font-weight:600;text-decoration:none;border-bottom:1px dashed #15516d;" onclick="event.preventDefault();showClientPopoverFromRecord(this)">' + esc(client) + '</a> • ' + esc(rec.inspection_date) + '</span></div>' +
          '<div style="display:flex;gap:6px;align-items:center;">' +
            (majorCount > 0 ? '<span style="background:#fde8e7;color:#e03328;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;">' + majorCount + ' Major</span>' : '') +
            (minorCount > 0 ? '<span style="background:#fef4e6;color:#c97a10;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;">' + minorCount + ' Minor</span>' : '') +
            '<span style="background:#e8f0f5;color:#15516d;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;">' + esc(rec.qa_status || 'pending') + '</span>' +
          '</div>' +
        '</div>' +
        '<div style="margin-top:12px;display:flex;gap:8px;">' +
          '<button class="qa-approve-btn" data-id="' + rec.id + '" style="padding:6px 14px;background:#3d7a3c;color:white;border:none;border-radius:6px;cursor:pointer;font-family:inherit;font-size:0.85rem;">Approve</button>' +
          '<button class="qa-revise-btn" data-id="' + rec.id + '" style="padding:6px 14px;background:#f59321;color:white;border:none;border-radius:6px;cursor:pointer;font-family:inherit;font-size:0.85rem;">Request Revision</button>' +
        '</div>' +
      '</div>';
    }).join('');

    list.querySelectorAll('.qa-approve-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        sbFetch('inspection_records?id=eq.' + btn.dataset.id, { method:'PATCH', body: JSON.stringify({qa_status:'approved', status:'approved'}) }).then(function(){
          sbFetch('audit_log', { method:'POST', body: JSON.stringify({ record_id: btn.dataset.id, action: 'qa.approved', category: 'admin', actor: 'admin', details: {} }) });
          loadQAReview();
        });
      });
    });
    list.querySelectorAll('.qa-revise-btn').forEach(function(btn){
      btn.addEventListener('click', async function(){
        // HEA-234: replaced bare prompt() with hwConfirm + inline input
        var notesHtml = '<div style="margin-top:12px;"><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Revision Notes</label>' +
          '<textarea id="qaRevisionNotes" rows="3" style="width:100%;padding:10px 12px;border:1.5px solid #dde;border-radius:8px;font-family:\'Work Sans\',sans-serif;font-size:13px;resize:vertical;" placeholder="Describe what needs to be revised..."></textarea></div>';
        var ok = await hwConfirm(notesHtml, { title: 'Request Revision', confirmLabel: 'Send Revision Request', html: true });
        if (!ok) return;
        var notesEl = document.getElementById('qaRevisionNotes');
        var notes = notesEl ? notesEl.value.trim() : '';
        sbFetch('inspection_records?id=eq.' + btn.dataset.id, { method:'PATCH', body: JSON.stringify({qa_status:'revision_requested', qa_notes:notes}) }).then(function(){
          sbFetch('audit_log', { method:'POST', body: JSON.stringify({ record_id: btn.dataset.id, action: 'qa.revision_requested', category: 'admin', actor: 'admin', details: { notes: notes } }) });
          loadQAReview();
        });
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', function() {
  var statusFilter = document.getElementById('qaStatusFilter');
  if (statusFilter) statusFilter.addEventListener('change', function(){ loadQAReview(); });
});

window.loadQAReview = loadQAReview;
