/**
 * Heartland Inspection Group — Inline Content Editor
 * Loaded on every page. Applies content/theme/SEO/section-order overrides for ALL visitors.
 * Edit UI only appears for authenticated Supabase users.
 *
 * Usage:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" defer></script>
 *   <script src="/shared/inline-editor.js" defer></script>
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://fusravedbksupcsjfzda.supabase.co';
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

  var sb = null;
  var PAGE_SLUG = getPageSlug();
  var editMode = false;
  var currentPanel = null;

  function getPageSlug() {
    var path = window.location.pathname.replace(/^\//, '').replace(/\.html$/, '');
    if (!path || path === '/') return 'index';
    return path;
  }

  function initSupabase() {
    if (sb) return sb;
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) return null;
    /* Singleton: reuse existing client to avoid multiple GoTrueClient instances */
    if (window._heartlandSB) { sb = window._heartlandSB; return sb; }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window._heartlandSB = sb;
    return sb;
  }

  function sanitizeHTML(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript\s*:/gi, '');
  }

  function sanitizeCSS(css) {
    return css
      .replace(/@import\s+url\s*\([^)]*\)/gi, '')
      .replace(/expression\s*\(/gi, '')
      .replace(/url\s*\(\s*["']?javascript:/gi, '');
  }

  function showToast(msg) {
    var t = document.getElementById('edit-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'edit-toast';
      t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1a1a1a;color:#fff;padding:10px 20px;border-radius:8px;font-family:"Work Sans",sans-serif;font-size:14px;z-index:10005;opacity:0;transition:opacity 0.3s;pointer-events:none;border:1px solid rgba(255,255,255,0.15);';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.style.opacity = '0'; }, 2000);
  }

  // ===== LOAD CONTENT OVERRIDES (all visitors) =====
  async function loadContent() {
    var client = initSupabase();
    if (!client) return;
    var { data } = await client.from('page_content').select('element_id, content, content_type').eq('page_slug', PAGE_SLUG);
    if (!data) return;
    data.forEach(function (row) {
      var el = document.querySelector('[data-edit-id="' + row.element_id + '"]');
      if (!el) return;
      if (row.content_type === 'image') {
        el.src = row.content;
      } else if (row.content_type === 'iframe') {
        el.src = row.content;
      } else if (row.content_type === 'link') {
        try {
          var linkData = JSON.parse(row.content);
          el.textContent = linkData.text || el.textContent;
          el.href = linkData.href || el.href;
          if (linkData.target) el.target = linkData.target;
        } catch (e) { /* ignore parse errors */ }
      } else if (row.content_type === 'html') {
        el.innerHTML = row.content;
      } else {
        el.textContent = row.content;
      }
    });
    // Also load global overrides
    var { data: globalData } = await client.from('page_content').select('element_id, content, content_type').eq('page_slug', '_global');
    if (!globalData) return;
    globalData.forEach(function (row) {
      var el = document.querySelector('[data-edit-id="' + row.element_id + '"]');
      if (!el) return;
      if (row.content_type === 'image') { el.src = row.content; }
      else if (row.content_type === 'iframe') { el.src = row.content; }
      else if (row.content_type === 'html') { el.innerHTML = row.content; }
      else { el.textContent = row.content; }
    });
  }

  // ===== LOAD SEO OVERRIDES (all visitors) =====
  async function loadSEO() {
    var client = initSupabase();
    if (!client) return;
    var { data } = await client.from('page_seo').select('*').eq('page_slug', PAGE_SLUG).maybeSingle();
    if (!data) return;
    // Draft check
    if (data.status === 'draft') {
      var { data: sessionData } = await client.auth.getSession();
      if (!sessionData || !sessionData.session) {
        if (data.redirect_url) { window.location.href = data.redirect_url; }
        else { document.body.innerHTML = '<div style="text-align:center;padding:100px;font-family:Work Sans,sans-serif;"><h1>Page Not Found</h1><p><a href="/">Return to Homepage</a></p></div>'; }
        return;
      }
      showDraftBanner();
    }
    if (data.title) document.title = data.title;
    if (data.meta_description) setMeta('description', data.meta_description);
    if (data.canonical_url) setLink('canonical', data.canonical_url);
    if (data.og_image) setMeta('og:image', data.og_image, true);
    if (data.og_title) setMeta('og:title', data.og_title || data.title, true);
    if (data.og_description) setMeta('og:description', data.og_description || data.meta_description, true);
    if (data.noindex) setMeta('robots', 'noindex, nofollow');
    if (data.custom_css) {
      var style = document.getElementById('page-custom-css');
      if (!style) { style = document.createElement('style'); style.id = 'page-custom-css'; document.head.appendChild(style); }
      style.textContent = sanitizeCSS(data.custom_css);
    }
  }

  function setMeta(name, content, isProperty) {
    var attr = isProperty ? 'property' : 'name';
    var el = document.querySelector('meta[' + attr + '="' + name + '"]');
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
    el.setAttribute('content', content);
  }

  function setLink(rel, href) {
    var el = document.querySelector('link[rel="' + rel + '"]');
    if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
    el.href = href;
  }

  function showDraftBanner() {
    var b = document.createElement('div');
    b.style.cssText = 'background:#f59321;color:#000;text-align:center;padding:8px;font-family:"Work Sans",sans-serif;font-weight:700;font-size:14px;position:relative;z-index:9999;';
    b.textContent = 'DRAFT PAGE — Only visible to admins';
    document.body.insertAdjacentElement('afterbegin', b);
  }

  // ===== LOAD THEME (all visitors) =====
  async function loadTheme() {
    var client = initSupabase();
    if (!client) return;
    var { data } = await client.from('site_theme').select('variable, value');
    if (!data) return;
    data.forEach(function (row) {
      document.documentElement.style.setProperty(row.variable, row.value);
    });
  }

  // ===== LOAD SECTION ORDER (all visitors) =====
  async function loadSectionOrder() {
    var client = initSupabase();
    if (!client) return;
    var { data } = await client.from('page_section_order').select('section_id, sort_order, visible').eq('page_slug', PAGE_SLUG).order('sort_order');
    if (!data || data.length === 0) return;
    data.forEach(function (row) {
      var section = document.querySelector('[data-section-id="' + row.section_id + '"]');
      if (!section) return;
      if (!row.visible) { section.style.display = 'none'; return; }
      section.parentNode.appendChild(section);
    });
  }

  // ===== FLASH MITIGATION =====
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.2s';
  var flashTimeout = setTimeout(function () { document.body.style.opacity = '1'; }, 500);

  Promise.all([loadContent(), loadSEO(), loadTheme(), loadSectionOrder()])
    .catch(function () { })
    .finally(function () {
      clearTimeout(flashTimeout);
      document.body.style.opacity = '1';
      checkAuth();
    });

  // ===== AUTH CHECK — show edit button if logged in =====
  async function checkAuth() {
    var client = initSupabase();
    if (!client) return;
    var { data } = await client.auth.getSession();
    if (data && data.session) {
      injectEditButton();
    }
  }

  function injectEditButton() {
    var btn = document.createElement('button');
    btn.id = 'editPageBtn';
    btn.textContent = 'Edit Page';
    btn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9998;background:var(--accent,#f59321);color:#fff;border:none;padding:12px 24px;border-radius:8px;font-family:"Work Sans",sans-serif;font-weight:700;font-size:15px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.3);transition:transform 0.2s;';
    btn.addEventListener('mouseenter', function () { btn.style.transform = 'scale(1.05)'; });
    btn.addEventListener('mouseleave', function () { btn.style.transform = 'scale(1)'; });
    btn.addEventListener('click', enterEditMode);
    document.body.appendChild(btn);
  }

  // ===== ENTER / EXIT EDIT MODE =====
  function enterEditMode() {
    editMode = true;
    var btn = document.getElementById('editPageBtn');
    if (btn) btn.style.display = 'none';
    injectToolbar();
    enableEditing();
  }

  function exitEditMode() {
    editMode = false;
    disableEditing();
    removeToolbar();
    closePanel();
    hideRichToolbar();
    var btn = document.getElementById('editPageBtn');
    if (btn) btn.style.display = '';
  }

  // ===== TOOLBAR =====
  function injectToolbar() {
    var bar = document.createElement('div');
    bar.id = 'editToolbar';
    bar.className = 'edit-toolbar';
    bar.innerHTML = ''
      + '<div class="edit-toolbar-left">'
      + '  <strong class="edit-toolbar-badge">EDIT MODE</strong>'
      + '  <span class="edit-toolbar-hint">Click any highlighted element to edit. Changes auto-save.</span>'
      + '</div>'
      + '<div class="edit-toolbar-right">'
      + '  <button class="edit-toolbar-btn" data-panel="seo">SEO</button>'
      + '  <button class="edit-toolbar-btn" data-panel="theme">Theme</button>'
      + '  <button class="edit-toolbar-btn" data-panel="reorder">Reorder</button>'
      + '  <button class="edit-toolbar-btn" data-panel="nav">Nav</button>'
      + '  <button class="edit-toolbar-btn edit-toolbar-exit" id="exitEditMode">Exit Edit Mode</button>'
      + '</div>';
    document.body.insertAdjacentElement('afterbegin', bar);
    document.body.style.paddingTop = '52px';
    document.getElementById('exitEditMode').addEventListener('click', exitEditMode);
    bar.querySelectorAll('[data-panel]').forEach(function (b) {
      b.addEventListener('click', function () { togglePanel(b.getAttribute('data-panel')); });
    });
  }

  function removeToolbar() {
    var bar = document.getElementById('editToolbar');
    if (bar) bar.remove();
    document.body.style.paddingTop = '';
  }

  // ===== EDITABLE ELEMENTS =====
  function enableEditing() {
    document.querySelectorAll('[data-edit-id]').forEach(function (el) {
      var type = getContentType(el);
      el.classList.add('cms-editable');
      if (type === 'image') {
        el.addEventListener('click', handleImageClick);
      } else if (type === 'iframe') {
        var wrapper = el.parentElement;
        if (wrapper) {
          wrapper.style.position = 'relative';
          var overlay = document.createElement('div');
          overlay.className = 'cms-iframe-overlay';
          overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;cursor:pointer;';
          overlay.addEventListener('click', function () {
            handleIframeClick({ preventDefault: function(){}, stopPropagation: function(){}, currentTarget: el });
          });
          wrapper.appendChild(overlay);
        }
      } else if (type === 'link') {
        el.addEventListener('click', handleLinkClick);
      } else {
        el.setAttribute('contenteditable', 'true');
        el.addEventListener('blur', handleBlur);
        el.addEventListener('mouseup', maybeShowRichToolbar);
        el.addEventListener('keyup', maybeShowRichToolbar);
      }
    });
  }

  function disableEditing() {
    document.querySelectorAll('.cms-iframe-overlay').forEach(function (ov) { ov.remove(); });
    document.querySelectorAll('[data-edit-id]').forEach(function (el) {
      el.classList.remove('cms-editable');
      el.removeAttribute('contenteditable');
      el.removeEventListener('blur', handleBlur);
      el.removeEventListener('click', handleImageClick);
      el.removeEventListener('click', handleLinkClick);
      el.removeEventListener('mouseup', maybeShowRichToolbar);
      el.removeEventListener('keyup', maybeShowRichToolbar);
    });
  }

  function getContentType(el) {
    if (el.tagName === 'IMG') return 'image';
    if (el.tagName === 'IFRAME') return 'iframe';
    if (el.tagName === 'A' || el.hasAttribute('data-edit-link')) return 'link';
    if (['P', 'SPAN', 'DIV', 'LI', 'BLOCKQUOTE'].indexOf(el.tagName) >= 0) return 'html';
    return 'text';
  }

  // ===== AUTO-SAVE ON BLUR =====
  async function handleBlur(e) {
    var el = e.target;
    var editId = el.getAttribute('data-edit-id');
    var type = getContentType(el);
    var content = type === 'html' ? el.innerHTML : el.textContent;
    var slug = el.closest('[data-page-slug]') ? el.closest('[data-page-slug]').getAttribute('data-page-slug') : PAGE_SLUG;

    // Save history first
    await saveHistory(slug, editId, content);

    var { error } = await sb.from('page_content').upsert({
      page_slug: slug,
      element_id: editId,
      content: type === 'html' ? sanitizeHTML(content) : content,
      content_type: type,
      updated_at: new Date().toISOString()
    }, { onConflict: 'page_slug,element_id' });

    showToast(error ? 'Error saving' : 'Saved');
  }

  async function saveHistory(slug, elementId, content) {
    try {
      await sb.from('page_content_history').insert({
        page_slug: slug,
        element_id: elementId,
        content: content,
        edited_at: new Date().toISOString()
      });
    } catch (e) { /* non-critical */ }
  }

  // ===== IMAGE EDITING =====
  function handleImageClick(e) {
    e.preventDefault();
    e.stopPropagation();
    var img = e.target;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async function () {
      var file = input.files[0];
      if (!file || file.size > 2 * 1024 * 1024) { alert('Max 2MB image size.'); return; }
      var ext = file.name.split('.').pop();
      var path = PAGE_SLUG.replace(/\//g, '-') + '/' + img.getAttribute('data-edit-id') + '.' + ext;
      var { error } = await sb.storage.from('page-images').upload(path, file, { upsert: true });
      if (error) { showToast('Upload failed'); return; }
      var url = SUPABASE_URL + '/storage/v1/object/public/page-images/' + path;
      img.src = url;
      await sb.from('page_content').upsert({
        page_slug: PAGE_SLUG, element_id: img.getAttribute('data-edit-id'),
        content: url, content_type: 'image', updated_at: new Date().toISOString()
      }, { onConflict: 'page_slug,element_id' });
      showToast('Image saved');
    });
    input.click();
  }

  // ===== LINK / BUTTON EDITING =====
  function handleLinkClick(e) {
    e.preventDefault();
    e.stopPropagation();
    var el = e.currentTarget;
    var existing = document.getElementById('link-popover');
    if (existing) existing.remove();

    var pop = document.createElement('div');
    pop.id = 'link-popover';
    pop.className = 'link-popover';
    pop.innerHTML = ''
      + '<label class="edit-panel-label">Button Text</label>'
      + '<input class="edit-panel-input" id="lp-text" value="' + (el.textContent || '').replace(/"/g, '&quot;') + '">'
      + '<label class="edit-panel-label" style="margin-top:12px">Link URL</label>'
      + '<input class="edit-panel-input" id="lp-href" value="' + (el.href || el.getAttribute('href') || '').replace(/"/g, '&quot;') + '">'
      + '<label class="edit-panel-label" style="margin-top:12px">Target</label>'
      + '<select class="edit-panel-input" id="lp-target"><option value="_self">Same Tab</option><option value="_blank">New Tab</option></select>'
      + '<div style="display:flex;gap:8px;margin-top:16px;">'
      + '  <button class="edit-panel-save" id="lp-save" style="flex:1">Save</button>'
      + '  <button class="edit-panel-save" id="lp-cancel" style="flex:1;background:rgba(255,255,255,0.1);color:#fff">Cancel</button>'
      + '</div>';

    var rect = el.getBoundingClientRect();
    pop.style.cssText = 'position:fixed;top:' + (rect.bottom + 8) + 'px;left:' + rect.left + 'px;z-index:10003;background:#1a1a1a;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:16px;width:300px;box-shadow:0 8px 24px rgba(0,0,0,0.4);font-family:"Work Sans",sans-serif;';
    document.body.appendChild(pop);

    if (el.target === '_blank') document.getElementById('lp-target').value = '_blank';

    document.getElementById('lp-cancel').addEventListener('click', function () { pop.remove(); });
    document.getElementById('lp-save').addEventListener('click', async function () {
      var text = document.getElementById('lp-text').value;
      var href = document.getElementById('lp-href').value;
      var target = document.getElementById('lp-target').value;
      el.textContent = text;
      el.setAttribute('href', href);
      el.target = target;
      var contentJSON = JSON.stringify({ text: text, href: href, target: target });
      await sb.from('page_content').upsert({
        page_slug: PAGE_SLUG, element_id: el.getAttribute('data-edit-id'),
        content: contentJSON, content_type: 'link', updated_at: new Date().toISOString()
      }, { onConflict: 'page_slug,element_id' });
      pop.remove();
      showToast('Link saved');
    });
  }

  // ===== IFRAME / VIDEO EDITING =====
  function handleIframeClick(e) {
    e.preventDefault();
    e.stopPropagation();
    var el = e.currentTarget;
    var existing = document.getElementById('iframe-popover');
    if (existing) existing.remove();

    var pop = document.createElement('div');
    pop.id = 'iframe-popover';
    pop.className = 'link-popover';
    pop.innerHTML = ''
      + '<label class="edit-panel-label">Video URL</label>'
      + '<input class="edit-panel-input" id="ifp-src" value="' + (el.src || '').replace(/"/g, '&quot;') + '" placeholder="https://www.youtube.com/embed/...">'
      + '<div style="display:flex;gap:8px;margin-top:16px;">'
      + '  <button class="edit-panel-save" id="ifp-save" style="flex:1">Save</button>'
      + '  <button class="edit-panel-save" id="ifp-cancel" style="flex:1;background:rgba(255,255,255,0.1);color:#fff">Cancel</button>'
      + '</div>';

    var rect = el.getBoundingClientRect();
    pop.style.cssText = 'position:fixed;top:' + (rect.bottom + 8) + 'px;left:' + rect.left + 'px;z-index:10003;background:#1a1a1a;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:16px;width:360px;box-shadow:0 8px 24px rgba(0,0,0,0.4);font-family:"Work Sans",sans-serif;';
    document.body.appendChild(pop);

    document.getElementById('ifp-cancel').addEventListener('click', function () { pop.remove(); });
    document.getElementById('ifp-save').addEventListener('click', async function () {
      var src = document.getElementById('ifp-src').value.trim();
      if (!src) { pop.remove(); return; }
      el.src = src;
      await saveHistory(PAGE_SLUG, el.getAttribute('data-edit-id'), src);
      await sb.from('page_content').upsert({
        page_slug: PAGE_SLUG, element_id: el.getAttribute('data-edit-id'),
        content: src, content_type: 'iframe', updated_at: new Date().toISOString()
      }, { onConflict: 'page_slug,element_id' });
      pop.remove();
      showToast('Video URL saved');
    });
  }

  // ===== RICH TEXT MINI-TOOLBAR =====
  function maybeShowRichToolbar() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { hideRichToolbar(); return; }
    var el = sel.anchorNode.parentElement ? sel.anchorNode.parentElement.closest('[data-edit-id]') : null;
    if (!el || getContentType(el) !== 'html') { hideRichToolbar(); return; }
    showRichToolbar(sel);
  }

  function showRichToolbar(sel) {
    var tb = document.getElementById('rich-text-toolbar');
    if (!tb) {
      tb = document.createElement('div');
      tb.id = 'rich-text-toolbar';
      tb.className = 'rich-text-toolbar';
      tb.innerHTML = ''
        + '<button class="rich-text-btn" data-cmd="bold" title="Bold"><b>B</b></button>'
        + '<button class="rich-text-btn" data-cmd="italic" title="Italic"><i>I</i></button>'
        + '<button class="rich-text-btn" data-cmd="underline" title="Underline"><u>U</u></button>'
        + '<button class="rich-text-btn" data-cmd="createLink" title="Link">&#128279;</button>'
        + '<button class="rich-text-btn" data-cmd="removeFormat" title="Clear">&mdash;</button>'
        + '<button class="rich-text-btn" data-cmd="undo" title="Undo">&#8617;</button>';
      document.body.appendChild(tb);
      tb.querySelectorAll('[data-cmd]').forEach(function (btn) {
        btn.addEventListener('mousedown', function (e) {
          e.preventDefault();
          var cmd = btn.getAttribute('data-cmd');
          if (cmd === 'createLink') {
            var url = prompt('Enter URL:');
            if (url) document.execCommand('createLink', false, url);
          } else {
            document.execCommand(cmd, false, null);
          }
          updateRichBtnStates(tb);
        });
      });
    }
    var range = sel.getRangeAt(0);
    var rect = range.getBoundingClientRect();
    tb.style.display = 'flex';
    tb.style.top = (rect.top + window.scrollY - 44) + 'px';
    tb.style.left = (rect.left + rect.width / 2 - 100) + 'px';
    updateRichBtnStates(tb);
  }

  function updateRichBtnStates(tb) {
    ['bold', 'italic', 'underline'].forEach(function (cmd) {
      var btn = tb.querySelector('[data-cmd="' + cmd + '"]');
      if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
    });
  }

  function hideRichToolbar() {
    var tb = document.getElementById('rich-text-toolbar');
    if (tb) tb.style.display = 'none';
  }

  document.addEventListener('mousedown', function (e) {
    var tb = document.getElementById('rich-text-toolbar');
    if (tb && !tb.contains(e.target)) hideRichToolbar();
  });

  // ===== PANELS =====
  function togglePanel(name) {
    if (currentPanel === name) { closePanel(); return; }
    closePanel();
    currentPanel = name;
    var panel = document.createElement('div');
    panel.id = 'editPanel';
    panel.className = 'edit-panel';
    var title = { seo: 'SEO Settings', theme: 'Theme Colors', reorder: 'Section Order', nav: 'Navigation Editor' }[name] || name;
    panel.innerHTML = ''
      + '<div class="edit-panel-header">'
      + '  <h3>' + title + '</h3>'
      + '  <button class="edit-panel-close" id="closePanel">&times;</button>'
      + '</div>'
      + '<div class="edit-panel-body" id="panelBody"></div>';
    document.body.appendChild(panel);
    requestAnimationFrame(function () { panel.classList.add('open'); });
    document.getElementById('closePanel').addEventListener('click', closePanel);

    if (name === 'seo') buildSEOPanel();
    else if (name === 'theme') buildThemePanel();
    else if (name === 'reorder') buildReorderPanel();
    else if (name === 'nav') buildNavPanel();
  }

  function closePanel() {
    currentPanel = null;
    var panel = document.getElementById('editPanel');
    if (panel) { panel.classList.remove('open'); setTimeout(function () { panel.remove(); }, 300); }
  }

  // ===== SEO PANEL =====
  async function buildSEOPanel() {
    var body = document.getElementById('panelBody');
    var { data } = await sb.from('page_seo').select('*').eq('page_slug', PAGE_SLUG).maybeSingle();
    var seo = data || {};

    body.innerHTML = ''
      + '<div class="edit-panel-field">'
      + '  <label class="edit-panel-label">Page Status</label>'
      + '  <select class="edit-panel-input" id="seo-status"><option value="published">Published</option><option value="draft">Draft</option></select>'
      + '</div>'
      + '<div class="edit-panel-field">'
      + '  <label class="edit-panel-label">Page Title <span id="seo-title-count"></span></label>'
      + '  <input class="edit-panel-input" id="seo-title" value="' + esc(seo.title || document.title) + '">'
      + '</div>'
      + '<div class="edit-panel-field">'
      + '  <label class="edit-panel-label">Meta Description <span id="seo-desc-count"></span></label>'
      + '  <textarea class="edit-panel-input" id="seo-desc" rows="3">' + esc(seo.meta_description || '') + '</textarea>'
      + '</div>'
      + '<div class="edit-panel-field">'
      + '  <label class="edit-panel-label">Canonical URL</label>'
      + '  <input class="edit-panel-input" id="seo-canonical" value="' + esc(seo.canonical_url || window.location.href) + '">'
      + '</div>'
      + '<div class="edit-panel-field">'
      + '  <label class="edit-panel-label">OG Image</label>'
      + '  <input type="file" accept="image/*" id="seo-og-file" style="color:#fff;font-size:13px">'
      + '  ' + (seo.og_image ? '<img src="' + esc(seo.og_image) + '" style="width:100%;margin-top:8px;border-radius:6px">' : '')
      + '</div>'
      + '<div class="edit-panel-field">'
      + '  <label class="edit-panel-label">Redirect URL (for draft pages)</label>'
      + '  <input class="edit-panel-input" id="seo-redirect" value="' + esc(seo.redirect_url || '') + '">'
      + '</div>'
      + '<div class="edit-panel-field">'
      + '  <label class="edit-panel-label">Custom CSS</label>'
      + '  <textarea class="edit-panel-input" id="seo-css" rows="4" style="font-family:monospace;font-size:12px">' + esc(seo.custom_css || '') + '</textarea>'
      + '</div>'
      + '<div class="edit-panel-field" style="background:rgba(255,255,255,0.04);border-radius:8px;padding:12px">'
      + '  <label class="edit-panel-label">Google Preview</label>'
      + '  <div id="seo-preview" style="font-family:Arial,sans-serif">'
      + '    <div id="seo-prev-title" style="color:#1a0dab;font-size:18px;line-height:1.3;margin-bottom:2px"></div>'
      + '    <div id="seo-prev-url" style="color:#006621;font-size:13px;margin-bottom:2px"></div>'
      + '    <div id="seo-prev-desc" style="color:#545454;font-size:13px;line-height:1.4"></div>'
      + '  </div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">'
      + '  <input type="checkbox" id="seo-noindex" ' + (seo.noindex ? 'checked' : '') + '>'
      + '  <label for="seo-noindex" style="color:rgba(255,255,255,0.7);font-size:13px">Hide from search engines (noindex)</label>'
      + '</div>'
      + '<button class="edit-panel-save" id="seo-save-btn">Save SEO Settings</button>';

    if (seo.status) document.getElementById('seo-status').value = seo.status;
    updateSEOPreview();

    document.getElementById('seo-title').addEventListener('input', updateSEOPreview);
    document.getElementById('seo-desc').addEventListener('input', updateSEOPreview);
    document.getElementById('seo-save-btn').addEventListener('click', saveSEO);
  }

  function updateSEOPreview() {
    var title = document.getElementById('seo-title');
    var desc = document.getElementById('seo-desc');
    if (!title) return;
    var tc = document.getElementById('seo-title-count');
    var dc = document.getElementById('seo-desc-count');
    if (tc) tc.textContent = '(' + title.value.length + '/60)';
    if (dc) dc.textContent = '(' + desc.value.length + '/160)';
    var pt = document.getElementById('seo-prev-title');
    var pu = document.getElementById('seo-prev-url');
    var pd = document.getElementById('seo-prev-desc');
    if (pt) pt.textContent = title.value.slice(0, 60);
    if (pu) pu.textContent = window.location.href;
    if (pd) pd.textContent = desc.value.slice(0, 160);
  }

  async function saveSEO() {
    var ogImage = null;
    var fileInput = document.getElementById('seo-og-file');
    if (fileInput && fileInput.files[0]) {
      var file = fileInput.files[0];
      var path = PAGE_SLUG.replace(/\//g, '-') + '-og.' + file.name.split('.').pop();
      await sb.storage.from('og-images').upload(path, file, { upsert: true });
      ogImage = SUPABASE_URL + '/storage/v1/object/public/og-images/' + path;
    }

    var payload = {
      page_slug: PAGE_SLUG,
      title: document.getElementById('seo-title').value,
      meta_description: document.getElementById('seo-desc').value,
      canonical_url: document.getElementById('seo-canonical').value,
      noindex: document.getElementById('seo-noindex').checked,
      status: document.getElementById('seo-status').value,
      redirect_url: document.getElementById('seo-redirect').value,
      custom_css: document.getElementById('seo-css').value,
      updated_at: new Date().toISOString()
    };
    if (ogImage) payload.og_image = ogImage;

    await sb.from('page_seo').upsert(payload, { onConflict: 'page_slug' });
    showToast('SEO settings saved');
  }

  // ===== THEME PANEL =====
  async function buildThemePanel() {
    var body = document.getElementById('panelBody');
    var { data } = await sb.from('site_theme').select('*').order('id');
    if (!data) return;

    var html = '';
    data.forEach(function (row) {
      var isColor = row.value.match(/^#[0-9a-fA-F]{3,8}$/);
      html += '<div class="theme-color-row" data-var="' + esc(row.variable) + '">'
        + '  <label class="edit-panel-label" style="flex:1;margin:0">' + esc(row.label || row.variable) + '</label>';
      if (isColor) {
        html += '  <input type="color" class="theme-color-swatch" value="' + esc(row.value) + '" data-var="' + esc(row.variable) + '">';
      }
      html += '  <input class="edit-panel-input theme-color-hex" style="width:140px" value="' + esc(row.value) + '" data-var="' + esc(row.variable) + '" data-default="' + esc(row.default_val) + '">'
        + '  <button class="theme-reset-btn" data-var="' + esc(row.variable) + '" data-default="' + esc(row.default_val) + '">Reset</button>'
        + '</div>';
    });
    html += '<button class="edit-panel-save" id="theme-save-btn">Save Theme</button>';
    body.innerHTML = html;

    // Live preview on color input change
    body.querySelectorAll('.theme-color-swatch').forEach(function (input) {
      input.addEventListener('input', function () {
        var v = input.getAttribute('data-var');
        document.documentElement.style.setProperty(v, input.value);
        var hexInput = body.querySelector('input.theme-color-hex[data-var="' + v + '"]');
        if (hexInput) hexInput.value = input.value;
      });
    });

    body.querySelectorAll('.theme-color-hex').forEach(function (input) {
      input.addEventListener('input', function () {
        var v = input.getAttribute('data-var');
        document.documentElement.style.setProperty(v, input.value);
        var swatch = body.querySelector('.theme-color-swatch[data-var="' + v + '"]');
        if (swatch && input.value.match(/^#[0-9a-fA-F]{6}$/)) swatch.value = input.value;
      });
    });

    body.querySelectorAll('.theme-reset-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-var');
        var def = btn.getAttribute('data-default');
        document.documentElement.style.setProperty(v, def);
        var hex = body.querySelector('.theme-color-hex[data-var="' + v + '"]');
        if (hex) hex.value = def;
        var swatch = body.querySelector('.theme-color-swatch[data-var="' + v + '"]');
        if (swatch) swatch.value = def;
      });
    });

    document.getElementById('theme-save-btn').addEventListener('click', saveTheme);
  }

  async function saveTheme() {
    var rows = document.querySelectorAll('.theme-color-hex');
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i].getAttribute('data-var');
      var val = rows[i].value;
      await sb.from('site_theme').update({ value: val, updated_at: new Date().toISOString() }).eq('variable', v);
    }
    showToast('Theme saved');
  }

  // ===== REORDER PANEL =====
  async function buildReorderPanel() {
    var body = document.getElementById('panelBody');
    var sections = document.querySelectorAll('[data-section-id]');
    if (!sections.length) { body.innerHTML = '<p style="color:rgba(255,255,255,0.5)">No sections found on this page.</p>'; return; }

    // Fetch saved visibility
    var { data: saved } = await sb.from('page_section_order').select('section_id, visible').eq('page_slug', PAGE_SLUG);
    var visMap = {};
    if (saved) saved.forEach(function (r) { visMap[r.section_id] = r.visible; });

    body.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:13px;margin-bottom:16px">Use arrows to reorder sections. Click the eye to toggle visibility.</p>';

    var list = document.createElement('div');
    list.id = 'reorder-list';
    sections.forEach(function (sec) {
      var sid = sec.getAttribute('data-section-id');
      var label = sec.getAttribute('data-section-label') || sid;
      var vis = visMap[sid] !== false;
      var item = document.createElement('div');
      item.className = 'reorder-item' + (vis ? '' : ' section-hidden');
      item.setAttribute('data-sid', sid);
      item.innerHTML = ''
        + '<button class="reorder-visibility' + (vis ? '' : ' hidden') + '" data-sid="' + sid + '">' + (vis ? '&#128065;' : '&#128065;') + '</button>'
        + '<span class="reorder-item-label">' + esc(label) + '</span>'
        + '<div class="reorder-arrows">'
        + '  <button class="reorder-arrow-btn" data-dir="up" data-sid="' + sid + '">&uarr;</button>'
        + '  <button class="reorder-arrow-btn" data-dir="down" data-sid="' + sid + '">&darr;</button>'
        + '</div>';
      list.appendChild(item);
    });
    body.appendChild(list);

    list.querySelectorAll('.reorder-arrow-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sid = btn.getAttribute('data-sid');
        var item = list.querySelector('[data-sid="' + sid + '"]');
        if (btn.getAttribute('data-dir') === 'up' && item.previousElementSibling) {
          item.parentNode.insertBefore(item, item.previousElementSibling);
          // Move DOM section too
          var sec = document.querySelector('[data-section-id="' + sid + '"]');
          var prevSec = getSectionBefore(sid);
          if (sec && prevSec) sec.parentNode.insertBefore(sec, prevSec);
        } else if (btn.getAttribute('data-dir') === 'down' && item.nextElementSibling) {
          item.parentNode.insertBefore(item.nextElementSibling, item);
          var sec2 = document.querySelector('[data-section-id="' + sid + '"]');
          if (sec2 && sec2.nextElementSibling) sec2.parentNode.insertBefore(sec2.nextElementSibling, sec2);
        }
      });
    });

    list.querySelectorAll('.reorder-visibility').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sid = btn.getAttribute('data-sid');
        var item = list.querySelector('[data-sid="' + sid + '"]');
        var sec = document.querySelector('[data-section-id="' + sid + '"]');
        var isHidden = item.classList.toggle('section-hidden');
        btn.classList.toggle('hidden', isHidden);
        if (sec) sec.style.display = isHidden ? 'none' : '';
      });
    });

    var saveBtn = document.createElement('button');
    saveBtn.className = 'edit-panel-save';
    saveBtn.textContent = 'Save Order';
    saveBtn.addEventListener('click', saveReorder);
    body.appendChild(saveBtn);
  }

  function getSectionBefore(sid) {
    var items = document.getElementById('reorder-list').querySelectorAll('[data-sid]');
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute('data-sid') === sid && i > 0) {
        return document.querySelector('[data-section-id="' + items[i - 1].getAttribute('data-sid') + '"]');
      }
    }
    return null;
  }

  async function saveReorder() {
    var items = document.getElementById('reorder-list').querySelectorAll('[data-sid]');
    for (var i = 0; i < items.length; i++) {
      var sid = items[i].getAttribute('data-sid');
      var vis = !items[i].classList.contains('section-hidden');
      await sb.from('page_section_order').upsert({
        page_slug: PAGE_SLUG, section_id: sid, sort_order: i, visible: vis, updated_at: new Date().toISOString()
      }, { onConflict: 'page_slug,section_id' });
    }
    showToast('Section order saved');
  }

  // ===== NAV EDITOR PANEL =====
  async function buildNavPanel() {
    var body = document.getElementById('panelBody');
    var { data } = await sb.from('nav_links').select('*').order('sort_order');
    if (!data) return;

    var topLevel = data.filter(function (r) { return !r.parent_id; });
    var children = data.filter(function (r) { return r.parent_id; });

    var html = '';
    topLevel.forEach(function (item) {
      html += '<div class="reorder-item" data-nav-id="' + item.id + '">'
        + '  <div style="flex:1">'
        + '    <input class="edit-panel-input nav-label" data-nav-id="' + item.id + '" value="' + esc(item.label) + '" style="margin-bottom:4px;font-weight:600">'
        + '    <input class="edit-panel-input nav-href" data-nav-id="' + item.id + '" value="' + esc(item.href) + '" style="font-size:12px;color:rgba(255,255,255,0.5)" placeholder="URL">'
        + '  </div>'
        + '  <div class="reorder-arrows">'
        + '    <button class="reorder-arrow-btn nav-move" data-dir="up" data-nav-id="' + item.id + '">&uarr;</button>'
        + '    <button class="reorder-arrow-btn nav-move" data-dir="down" data-nav-id="' + item.id + '">&darr;</button>'
        + '    <button class="reorder-arrow-btn nav-del" data-nav-id="' + item.id + '" style="color:#e74c3c">&times;</button>'
        + '  </div>'
        + '</div>';

      // Sub-items for dropdowns
      if (item.is_dropdown) {
        var subs = children.filter(function (c) { return c.parent_id === item.id; });
        subs.forEach(function (sub) {
          html += '<div class="reorder-item" data-nav-id="' + sub.id + '" style="margin-left:24px;border-left:2px solid var(--accent,#f59321)">'
            + '  <div style="flex:1">'
            + '    <input class="edit-panel-input nav-label" data-nav-id="' + sub.id + '" value="' + esc(sub.label) + '" style="font-size:13px">'
            + '    <input class="edit-panel-input nav-href" data-nav-id="' + sub.id + '" value="' + esc(sub.href) + '" style="font-size:11px;color:rgba(255,255,255,0.4)" placeholder="URL">'
            + '  </div>'
            + '  <div class="reorder-arrows">'
            + '    <button class="reorder-arrow-btn nav-del" data-nav-id="' + sub.id + '" style="color:#e74c3c">&times;</button>'
            + '  </div>'
            + '</div>';
        });
        html += '<button class="theme-reset-btn nav-add-sub" data-parent-id="' + item.id + '" style="margin-left:24px;margin-bottom:12px">+ Add Sub-Item</button>';
      }
    });

    html += '<button class="theme-reset-btn" id="nav-add-top" style="width:100%;margin-top:12px;padding:8px">+ Add Nav Item</button>';
    html += '<button class="edit-panel-save" id="nav-save-btn">Save Navigation</button>';
    body.innerHTML = html;

    // Event listeners
    body.querySelectorAll('.nav-del').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (!confirm('Delete this nav item?')) return;
        var id = parseInt(btn.getAttribute('data-nav-id'));
        await sb.from('nav_links').delete().eq('id', id);
        btn.closest('.reorder-item').remove();
        showToast('Nav item deleted');
      });
    });

    body.querySelectorAll('.nav-add-sub').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var parentId = parseInt(btn.getAttribute('data-parent-id'));
        var { data: newItem } = await sb.from('nav_links').insert({
          label: 'New Link', href: '/', parent_id: parentId, sort_order: 99
        }).select().single();
        if (newItem) { buildNavPanel(); showToast('Sub-item added'); }
      });
    });

    document.getElementById('nav-add-top').addEventListener('click', async function () {
      var { data: newItem } = await sb.from('nav_links').insert({
        label: 'New Link', href: '/', sort_order: 99
      }).select().single();
      if (newItem) { buildNavPanel(); showToast('Nav item added'); }
    });

    body.querySelectorAll('.nav-move').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.reorder-item');
        if (btn.getAttribute('data-dir') === 'up' && item.previousElementSibling && item.previousElementSibling.classList.contains('reorder-item')) {
          item.parentNode.insertBefore(item, item.previousElementSibling);
        } else if (btn.getAttribute('data-dir') === 'down' && item.nextElementSibling && item.nextElementSibling.classList.contains('reorder-item')) {
          item.parentNode.insertBefore(item.nextElementSibling, item);
        }
      });
    });

    document.getElementById('nav-save-btn').addEventListener('click', saveNav);
  }

  async function saveNav() {
    var items = document.querySelectorAll('#panelBody .reorder-item[data-nav-id]');
    for (var i = 0; i < items.length; i++) {
      var id = parseInt(items[i].getAttribute('data-nav-id'));
      var label = items[i].querySelector('.nav-label').value;
      var href = items[i].querySelector('.nav-href').value;
      await sb.from('nav_links').update({
        label: label, href: href, sort_order: i, updated_at: new Date().toISOString()
      }).eq('id', id);
    }
    showToast('Navigation saved');
  }

  // ===== HELPERS =====
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ===== INJECT CSS =====
  var style = document.createElement('style');
  style.textContent = ''
    /* Edit toolbar */
    + '.edit-toolbar{position:fixed;top:0;left:0;right:0;z-index:10000;background:#0f1a0f;color:#fff;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;font-family:"Work Sans",sans-serif;font-size:13px;box-shadow:0 2px 12px rgba(0,0,0,0.4);border-bottom:3px solid var(--accent,#f59321)}'
    + '.edit-toolbar-left{display:flex;align-items:center}'
    + '.edit-toolbar-badge{background:var(--accent,#f59321);color:#0f1a0f;padding:4px 10px;border-radius:4px;font-size:11px;font-weight:800;letter-spacing:1px;margin-right:12px}'
    + '.edit-toolbar-hint{color:rgba(255,255,255,0.7)}'
    + '.edit-toolbar-right{display:flex;align-items:center}'
    + '.edit-toolbar-btn{background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.3);padding:6px 16px;border-radius:4px;font-family:"Work Sans",sans-serif;font-size:13px;font-weight:600;cursor:pointer;margin-left:8px;transition:all 0.2s}'
    + '.edit-toolbar-btn:hover{border-color:var(--accent,#f59321);color:var(--accent,#f59321)}'
    + '.edit-toolbar-exit{border-color:var(--accent,#f59321);color:var(--accent,#f59321)}'
    /* Editable elements */
    + '.cms-editable{outline:2px dashed var(--accent,#f59321) !important;outline-offset:2px;cursor:pointer;transition:outline-color 0.2s}'
    + '.cms-editable:hover{outline-color:var(--secondary,#3d7a3c) !important}'
    + '.cms-editable:focus{outline:2px solid var(--accent,#f59321) !important;outline-offset:2px}'
    /* Slide-out panels */
    + '.edit-panel{position:fixed;top:0;right:-420px;width:400px;height:100vh;background:#1a1a1a;color:#fff;z-index:10001;transition:right 0.3s ease;overflow-y:auto;box-shadow:-4px 0 20px rgba(0,0,0,0.4);font-family:"Work Sans",sans-serif}'
    + '.edit-panel.open{right:0}'
    + '.edit-panel-header{display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid rgba(255,255,255,0.1)}'
    + '.edit-panel-header h3{font-family:"Crimson Pro",serif;color:var(--accent,#f59321);font-size:20px;margin:0}'
    + '.edit-panel-close{background:none;border:none;color:#fff;font-size:24px;cursor:pointer}'
    + '.edit-panel-body{padding:20px}'
    + '.edit-panel-field{margin-bottom:20px}'
    + '.edit-panel-label{display:block;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-bottom:8px}'
    + '.edit-panel-input{width:100%;padding:10px 12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#fff;font-family:"Work Sans",sans-serif;font-size:14px;box-sizing:border-box}'
    + '.edit-panel-input:focus{outline:none;border-color:var(--accent,#f59321)}'
    + 'textarea.edit-panel-input{resize:vertical}'
    + '.edit-panel-save{width:100%;padding:14px;background:var(--accent,#f59321);color:#0f1a0f;border:none;border-radius:6px;font-family:"Work Sans",sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-top:20px}'
    + '.edit-panel-save:hover{opacity:0.9}'
    /* Theme rows */
    + '.theme-color-row{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}'
    + '.theme-color-swatch{width:36px;height:36px;border-radius:6px;border:2px solid rgba(255,255,255,0.2);cursor:pointer;padding:0}'
    + '.theme-reset-btn{background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:4px 10px;border-radius:4px;font-size:12px;cursor:pointer}'
    + '.theme-reset-btn:hover{background:rgba(255,255,255,0.2)}'
    /* Reorder items */
    + '.reorder-item{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;margin-bottom:8px}'
    + '.reorder-item-label{font-weight:600;font-size:14px;flex:1}'
    + '.reorder-arrows{display:flex;gap:4px}'
    + '.reorder-arrow-btn{background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;width:32px;height:32px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px}'
    + '.reorder-arrow-btn:hover{background:rgba(255,255,255,0.2)}'
    + '.reorder-visibility{background:none;border:none;color:#fff;font-size:16px;cursor:pointer;opacity:0.6;margin-right:8px}'
    + '.reorder-visibility.hidden{opacity:0.3}'
    + '.reorder-item.section-hidden{opacity:0.4}'
    + '.reorder-item.section-hidden .reorder-item-label{text-decoration:line-through}'
    /* Rich text toolbar */
    + '.rich-text-toolbar{position:absolute;z-index:10002;background:#1a1a1a;border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:4px;display:none;gap:2px;box-shadow:0 4px 12px rgba(0,0,0,0.3)}'
    + '.rich-text-btn{background:transparent;border:none;color:#fff;width:32px;height:32px;border-radius:4px;cursor:pointer;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center}'
    + '.rich-text-btn:hover{background:rgba(255,255,255,0.15)}'
    + '.rich-text-btn.active{background:var(--accent,#f59321);color:#0f1a0f}'
    /* Link popover */
    + '.link-popover{font-size:14px}'
    /* Responsive */
    + '@media(max-width:768px){.edit-toolbar{flex-direction:column;gap:8px;padding:8px 12px}.edit-toolbar-hint{display:none}.edit-panel{width:100%;right:-100%}}';
  document.head.appendChild(style);

})();
