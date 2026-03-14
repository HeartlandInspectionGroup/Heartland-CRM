/**
 * shared/hw-dialogs.js
 * Defines hwAlert, hwConfirm, hwToast for use across all pages.
 *
 * By default, injects modal HTML and CSS into the page.
 * If the page has its own HTML/CSS (e.g. admin.html), set:
 *   window._hwDialogsNoCss = true
 * before loading this script — HTML and CSS injection will be skipped,
 * but the JS functions will still be defined.
 *
 * opts for hwAlert:   { title, icon, success }
 * opts for hwConfirm: { title, confirmLabel, danger }
 * opts for hwToast:   { type: 'error'|'success'|'info' }
 */
(function() {

  var skipInject = !!window._hwDialogsNoCss || !!document.getElementById('hwOverlay');

  if (!skipInject) {
    var html = [
      '<style>',
      '.hw-overlay{display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.55);align-items:center;justify-content:center;padding:20px}',
      '.hw-overlay.hw-active{display:flex}',
      '.hw-modal{background:#1a2a44;border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:28px 28px 20px;max-width:420px;width:100%;color:#fff;font-family:\'Barlow\',sans-serif}',
      '.hw-modal-title{font-family:\'Barlow Condensed\',sans-serif;font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#fff;margin-bottom:12px}',
      '.hw-modal-body{font-size:14px;color:rgba(255,255,255,0.75);line-height:1.5;margin-bottom:20px}',
      '.hw-modal-footer{display:flex;gap:10px;justify-content:flex-end}',
      '.hw-btn{padding:10px 20px;border-radius:8px;border:none;font-family:\'Barlow Condensed\',sans-serif;font-size:14px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;cursor:pointer;transition:opacity 0.15s}',
      '.hw-btn:hover{opacity:0.85}',
      '.hw-btn-primary{background:#27ae60;color:#fff}',
      '.hw-btn-success{background:#27ae60;color:#fff}',
      '.hw-btn-danger{background:#e74c3c;color:#fff}',
      '.hw-btn-secondary{background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.15)}',
      '.hw-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);z-index:99998;padding:12px 22px;border-radius:10px;font-family:\'Barlow\',sans-serif;font-size:14px;font-weight:600;color:#fff;opacity:0;transition:opacity 0.25s,transform 0.25s;pointer-events:none;white-space:nowrap}',
      '.hw-toast.hw-toast-show{opacity:1;transform:translateX(-50%) translateY(0)}',
      '.hw-toast-error{background:#c0392b}',
      '.hw-toast-success{background:#27ae60}',
      '.hw-toast-info{background:#2980b9}',
      '</style>',
      '<div class="hw-overlay" id="hwOverlay">',
      '  <div class="hw-modal">',
      '    <div class="hw-modal-title" id="hwModalTitle"></div>',
      '    <div class="hw-modal-body" id="hwModalBody"></div>',
      '    <div class="hw-modal-footer" id="hwModalFooter"></div>',
      '  </div>',
      '</div>',
      '<div class="hw-toast hw-toast-error" id="hwToast"></div>'
    ].join('');

    var container = document.createElement('div');
    container.innerHTML = html;
    while (container.firstChild) document.body.appendChild(container.firstChild);

    document.getElementById('hwOverlay').addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('hw-active');
    });
  }

  var _hwToastTimer = null;

  window.hwAlert = function(msg, opts) {
    opts = opts || {};
    document.getElementById('hwModalTitle').textContent = opts.title || 'Heartland Inspection Group';
    document.getElementById('hwModalBody').innerHTML =
      (opts.icon ? '<div style="font-size:36px;margin-bottom:10px;">' + opts.icon + '</div>' : '') +
      '<p style="margin:0 0 4px;">' + msg + '</p>';
    var footer = document.getElementById('hwModalFooter');
    footer.innerHTML = '';
    var ok = document.createElement('button');
    ok.className   = 'hw-btn ' + (opts.success ? 'hw-btn-success' : 'hw-btn-primary');
    ok.textContent = 'OK';
    ok.onclick = function() { document.getElementById('hwOverlay').classList.remove('hw-active'); };
    footer.appendChild(ok);
    document.getElementById('hwOverlay').classList.add('hw-active');
  };

  window.hwConfirm = function(msg, opts) {
    return new Promise(function(resolve) {
      opts = opts || {};
      document.getElementById('hwModalTitle').textContent = opts.title || 'Are you sure?';
      document.getElementById('hwModalBody').innerHTML = '<p style="margin:0 0 4px;">' + msg + '</p>';
      var footer = document.getElementById('hwModalFooter');
      footer.innerHTML = '';
      var confirmBtn = document.createElement('button');
      confirmBtn.className   = 'hw-btn ' + (opts.danger !== false ? 'hw-btn-danger' : 'hw-btn-primary');
      confirmBtn.textContent = opts.confirmLabel || 'Confirm';
      confirmBtn.onclick = function() { document.getElementById('hwOverlay').classList.remove('hw-active'); resolve(true); };
      var cancelBtn = document.createElement('button');
      cancelBtn.className   = 'hw-btn hw-btn-secondary';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.onclick = function() { document.getElementById('hwOverlay').classList.remove('hw-active'); resolve(false); };
      footer.appendChild(confirmBtn);
      footer.appendChild(cancelBtn);
      document.getElementById('hwOverlay').classList.add('hw-active');
    });
  };

  window.hwToast = function(msg, opts) {
    opts = opts || {};
    var type  = opts.type || 'error';
    var toast = document.getElementById('hwToast');
    toast.textContent = msg;
    toast.className   = 'hw-toast hw-toast-' + type;
    clearTimeout(_hwToastTimer);
    void toast.offsetWidth;
    toast.classList.add('hw-toast-show');
    _hwToastTimer = setTimeout(function() { toast.classList.remove('hw-toast-show'); }, 3500);
  };

})();
