/**
 * scripts/admin-faqs.js — Service FAQs tab (HEA-234)
 * Extracted from admin.html main IIFE.
 * Uses: esc(), hwToast() (global), window._hbShared.sb
 * Save logic stays in saveConfig() in admin.html main IIFE — reads window._hbShared.faqData/faqSlug.
 */

async function loadFaqs(slug){
  var sb = window._hbShared.sb;
  var res = await sb.from('service_faqs').select('*').eq('service_slug', slug).order('sort_order');
  window._hbShared.faqData = (res.data || []).map(function(r){ return { id: r.id, question: r.question, answer: r.answer, sort_order: r.sort_order, active: r.active }; });
  renderFaqs();
}

function renderFaqs(){
  var faqData = window._hbShared.faqData;
  var el = document.getElementById('faqList');
  var editor = document.getElementById('faqEditor');
  var empty = document.getElementById('faqEmpty');

  if(!faqData.length){
    editor.style.display = 'none';
    empty.style.display = 'block';
    // Still show add button
    empty.innerHTML = '<p style="color:var(--text-light);font-size:14px;padding:12px 0;">No FAQs for this service yet.</p>';
    // Move add button to be visible
    document.getElementById('addFaqBtn').style.display = '';
    editor.style.display = 'block';
    el.innerHTML = '';
    return;
  }

  empty.style.display = 'none';
  editor.style.display = 'block';

  var h = '';
  for(var i = 0; i < faqData.length; i++){
    var f = faqData[i];
    h += '<div class="faq-admin-item">';
    h += '<div class="faq-admin-row">';
    h += '<div class="faq-admin-num">' + (i+1) + '</div>';
    h += '<div class="faq-admin-fields">';
    h += '<label>Question</label>';
    h += '<input type="text" value="' + esc(f.question) + '" data-f="fq" data-i="' + i + '" placeholder="Enter question...">';
    h += '<label>Answer</label>';
    h += '<textarea data-f="fa" data-i="' + i + '" placeholder="Enter answer...">' + esc(f.answer) + '</textarea>';
    h += '</div>';
    h += '<div class="faq-admin-actions">';
    if(i > 0) h += '<button class="svc-remove" data-f="fu" data-i="' + i + '" title="Move up" style="font-size:14px;">&#9650;</button>';
    if(i < faqData.length - 1) h += '<button class="svc-remove" data-f="fd" data-i="' + i + '" title="Move down" style="font-size:14px;">&#9660;</button>';
    h += '<button class="svc-remove" data-f="fr" data-i="' + i + '" title="Remove">&#10005;</button>';
    h += '</div>';
    h += '</div></div>';
  }
  el.innerHTML = h;

  // Bind events
  el.querySelectorAll('[data-f="fq"]').forEach(function(inp){ inp.addEventListener('input', function(){ faqData[+this.dataset.i].question = this.value; }); });
  el.querySelectorAll('[data-f="fa"]').forEach(function(inp){ inp.addEventListener('input', function(){ faqData[+this.dataset.i].answer = this.value; }); });
  el.querySelectorAll('[data-f="fr"]').forEach(function(btn){ btn.addEventListener('click', function(){ faqData.splice(+this.dataset.i, 1); renderFaqs(); }); });
  el.querySelectorAll('[data-f="fu"]').forEach(function(btn){ btn.addEventListener('click', function(){ var i = +this.dataset.i; var tmp = faqData[i]; faqData[i] = faqData[i-1]; faqData[i-1] = tmp; renderFaqs(); }); });
  el.querySelectorAll('[data-f="fd"]').forEach(function(btn){ btn.addEventListener('click', function(){ var i = +this.dataset.i; var tmp = faqData[i]; faqData[i] = faqData[i+1]; faqData[i+1] = tmp; renderFaqs(); }); });
}

document.addEventListener('DOMContentLoaded', function() {
  var faqSelect = document.getElementById('faqServiceSelect');
  if (faqSelect) faqSelect.addEventListener('change', function(){
    window._hbShared.faqSlug = this.value;
    if(!this.value){
      document.getElementById('faqEditor').style.display = 'none';
      document.getElementById('faqEmpty').style.display = 'none';
      return;
    }
    loadFaqs(this.value);
  });

  var addBtn = document.getElementById('addFaqBtn');
  if (addBtn) addBtn.addEventListener('click', function(){
    if(!window._hbShared.faqSlug){ hwToast('Please select a service first.'); return; }
    var faqData = window._hbShared.faqData;
    faqData.push({ id: null, question: '', answer: '', sort_order: faqData.length, active: true });
    renderFaqs();
    // Scroll to and focus the new question input
    var inputs = document.querySelectorAll('[data-f="fq"]');
    if(inputs.length) inputs[inputs.length - 1].focus();
  });
});

window.loadFaqs = loadFaqs;
window.renderFaqs = renderFaqs;
