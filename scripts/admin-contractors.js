/**
 * scripts/admin-contractors.js — Contractors tab (HEA-234)
 * Extracted from admin.html main IIFE.
 * Reads: window._hbShared.contractors, window._hbShared.CONTRACTOR_CATEGORIES
 * Uses: esc(), hwConfirm() (global)
 * Save logic stays in saveConfig() in admin.html main IIFE.
 */

function renderContractors(){
  var contractorsData = window._hbShared.contractors;
  var CONTRACTOR_CATEGORIES = window._hbShared.CONTRACTOR_CATEGORIES;
  var el = document.getElementById('contractorsList');
  if(!el) return;
  if(!contractorsData.length){ el.innerHTML = '<p style="color:var(--text-light);font-size:14px;padding:20px 0;">No contractors yet. Click "+ Add Contractor" to get started.</p>'; return; }
  var h = '';
  for(var i = 0; i < contractorsData.length; i++){
    var c = contractorsData[i];
    var cats = (c.service_categories || []).map(function(cat){ return '<span class="con-cat-tag">' + esc(cat) + '</span>'; }).join('');
    h += '<div class="con-card' + (c.active === false ? ' con-inactive' : '') + '" data-ci="' + i + '">';
    h += '<div class="con-header">';
    h += '<div class="con-header-left">';
    h += '<button class="con-expand-btn" data-f="conx" data-i="' + i + '" title="Expand details">&#9654;</button>';
    h += '<input type="text" value="' + esc(c.name) + '" data-f="conn" data-i="' + i + '" placeholder="Name" class="con-field con-name">';
    h += '<input type="text" value="' + esc(c.company) + '" data-f="conco" data-i="' + i + '" placeholder="Company" class="con-field con-company">';
    h += '<input type="text" value="' + esc(c.phone) + '" data-f="conph" data-i="' + i + '" placeholder="Phone" class="con-field con-phone">';
    h += '</div>';
    h += '<div class="con-header-right">';
    h += '<div class="con-cats">' + cats + '</div>';
    h += '<button class="con-star' + (c.featured ? ' active' : '') + '" data-f="conf" data-i="' + i + '" title="Featured">&#9733;</button>';
    h += '<label class="toggle con-toggle"><input type="checkbox" data-f="cona" data-i="' + i + '"' + (c.active !== false ? ' checked' : '') + '><span class="slider"></span></label>';
    h += '<button class="con-del" data-f="cond" data-i="' + i + '" title="Delete">&#10005;</button>';
    h += '</div>';
    h += '</div>';
    // Expandable detail row
    h += '<div class="con-detail" id="conDetail' + i + '">';
    h += '<div class="con-detail-grid">';
    h += '<div class="con-detail-field"><label>Email</label><input type="email" value="' + esc(c.email) + '" data-f="cone" data-i="' + i + '" placeholder="email@example.com"></div>';
    h += '<div class="con-detail-field"><label>Website</label><input type="url" value="' + esc(c.website) + '" data-f="conw" data-i="' + i + '" placeholder="https://..."></div>';
    h += '<div class="con-detail-field"><label>Service Area</label><input type="text" value="' + esc(c.service_area) + '" data-f="consa" data-i="' + i + '" placeholder="e.g. Roscoe / Rockford"></div>';
    h += '<div class="con-detail-field"><label>Notes <span style="font-weight:400;color:var(--text-light);">(private)</span></label><input type="text" value="' + esc(c.notes) + '" data-f="conno" data-i="' + i + '" placeholder="Internal notes"></div>';
    h += '<div class="con-detail-field"><label>Referral Arrangement <span style="font-weight:400;color:var(--text-light);">(private)</span></label><input type="text" value="' + esc(c.referral_arrangement) + '" data-f="conra" data-i="' + i + '" placeholder="e.g. $50 per referral"></div>';
    h += '<div class="con-detail-field"><label>Categories</label><div class="con-cat-checklist">';
    for(var ci = 0; ci < CONTRACTOR_CATEGORIES.length; ci++){
      var cat = CONTRACTOR_CATEGORIES[ci];
      var checked = (c.service_categories || []).indexOf(cat) >= 0;
      h += '<label class="con-cat-check"><input type="checkbox" data-f="concc" data-i="' + i + '" data-cat="' + cat + '"' + (checked ? ' checked' : '') + '><span>' + cat + '</span></label>';
    }
    h += '</div></div>';
    h += '</div>';
    h += '</div>';
    h += '</div>';
  }
  el.innerHTML = h;

  // Event listeners
  el.querySelectorAll('[data-f="conn"]').forEach(function(inp){ inp.addEventListener('input', function(){ contractorsData[+this.dataset.i].name = this.value; }); });
  el.querySelectorAll('[data-f="conco"]').forEach(function(inp){ inp.addEventListener('input', function(){ contractorsData[+this.dataset.i].company = this.value; }); });
  el.querySelectorAll('[data-f="conph"]').forEach(function(inp){ inp.addEventListener('input', function(){ contractorsData[+this.dataset.i].phone = this.value; }); });
  el.querySelectorAll('[data-f="cone"]').forEach(function(inp){ inp.addEventListener('input', function(){ contractorsData[+this.dataset.i].email = this.value; }); });
  el.querySelectorAll('[data-f="conw"]').forEach(function(inp){ inp.addEventListener('input', function(){ contractorsData[+this.dataset.i].website = this.value; }); });
  el.querySelectorAll('[data-f="consa"]').forEach(function(inp){ inp.addEventListener('input', function(){ contractorsData[+this.dataset.i].service_area = this.value; }); });
  el.querySelectorAll('[data-f="conno"]').forEach(function(inp){ inp.addEventListener('input', function(){ contractorsData[+this.dataset.i].notes = this.value; }); });
  el.querySelectorAll('[data-f="conra"]').forEach(function(inp){ inp.addEventListener('input', function(){ contractorsData[+this.dataset.i].referral_arrangement = this.value; }); });
  el.querySelectorAll('[data-f="conf"]').forEach(function(btn){ btn.addEventListener('click', function(){
    var idx = +this.dataset.i;
    contractorsData[idx].featured = !contractorsData[idx].featured;
    this.classList.toggle('active');
  }); });
  el.querySelectorAll('[data-f="cona"]').forEach(function(inp){ inp.addEventListener('change', function(){ contractorsData[+this.dataset.i].active = this.checked; }); });
  el.querySelectorAll('[data-f="cond"]').forEach(async function(btn){ btn.addEventListener('click', async function(){ if(!await hwConfirm('Delete this contractor? This cannot be undone.', {title:'Delete Contractor', confirmLabel:'Delete'})) return; contractorsData.splice(+this.dataset.i, 1); renderContractors(); }); });
  el.querySelectorAll('[data-f="conx"]').forEach(function(btn){ btn.addEventListener('click', function(){
    var detail = document.getElementById('conDetail' + this.dataset.i);
    if(detail){
      var open = detail.classList.toggle('open');
      this.innerHTML = open ? '&#9660;' : '&#9654;';
    }
  }); });
  el.querySelectorAll('[data-f="concc"]').forEach(function(inp){ inp.addEventListener('change', function(){
    var idx = +this.dataset.i, cat = this.dataset.cat;
    var cats = contractorsData[idx].service_categories || [];
    if(this.checked){ if(cats.indexOf(cat) < 0) cats.push(cat); }
    else { cats = cats.filter(function(c){ return c !== cat; }); }
    contractorsData[idx].service_categories = cats;
    // Update tag display in header
    var card = this.closest('.con-card');
    if(card){
      var tagContainer = card.querySelector('.con-cats');
      if(tagContainer) tagContainer.innerHTML = cats.map(function(c){ return '<span class="con-cat-tag">' + esc(c) + '</span>'; }).join('');
    }
  }); });
}

document.addEventListener('DOMContentLoaded', function() {
  var addBtn = document.getElementById('addContractorBtn');
  if (addBtn) addBtn.addEventListener('click', function(){
    var contractorsData = window._hbShared.contractors;
    contractorsData.push({ name: '', company: '', phone: '', email: '', website: '', service_categories: [], service_area: '', notes: '', referral_arrangement: '', featured: false, active: true });
    renderContractors();
    // Scroll to and focus the new card
    var cards = document.querySelectorAll('.con-card');
    if(cards.length){ var last = cards[cards.length - 1]; last.scrollIntoView({ behavior: 'smooth', block: 'center' }); var nameInput = last.querySelector('[data-f="conn"]'); if(nameInput) nameInput.focus(); }
  });
});

window.renderContractors = renderContractors;
