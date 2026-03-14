/**
 * Heartland Inspection Group — Shared Header
 * Include on every page. Auto-detects depth and builds top bar + nav.
 * Renders hardcoded nav immediately, then replaces with Supabase nav_links if available.
 *
 * Usage:
 *   <script src="/shared/header.js" data-base=""></script>        (root pages)
 *   <script src="/shared/header.js" data-base="../"></script>     (subfolder pages)
 */
(function () {
  var scripts = document.getElementsByTagName('script');
  var thisScript = scripts[scripts.length - 1];
  var base = thisScript.getAttribute('data-base') || '';

  var isSubfolder = base === '../';
  var homePath = isSubfolder ? '../index.html' : (base || '/');
  var imgPath = base + 'images/HIG_Logo.avif';

  var SUPABASE_URL = 'https://fusravedbksupcsjfzda.supabase.co';
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

  // Resolve an absolute href for the current page depth
  function resolveHref(href) {
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return href;
    // Absolute paths from root — adjust for subfolder
    if (href.startsWith('/')) {
      return isSubfolder ? '..' + href : href.replace(/^\//, '');
    }
    return href;
  }

  var topBar = ''
    + '<div class="top-bar">'
    + '  <div class="top-bar-content">'
    + '    <div class="top-bar-left">'
    + '      <div class="top-bar-item"><span>\uD83D\uDCCD</span> Serving Roscoe, IL &amp; Surrounding Areas</div>'
    + '      <div class="top-bar-item"><span>\uD83D\uDCDE</span> (815) 329-8583</div>'
    + '    </div>'
    + '    <div class="top-bar-right"><span>\u23F0 Mon-Sat: 7AM - 7PM</span></div>'
    + '  </div>'
    + '</div>';

  function buildNavHTML(items) {
    if (!items || !items.length) return buildFallbackNav();
    var topLevel = items.filter(function (r) { return !r.parent_id && r.visible !== false; });
    var children = items.filter(function (r) { return r.parent_id && r.visible !== false; });
    topLevel.sort(function (a, b) { return a.sort_order - b.sort_order; });

    var html = '';
    topLevel.forEach(function (item) {
      var subs = children.filter(function (c) { return c.parent_id === item.id; });
      subs.sort(function (a, b) { return a.sort_order - b.sort_order; });

      if (item.is_cta) {
        html += '<li><a href="' + resolveHref(item.href) + '" class="cta-button"' + (item.target === '_blank' ? ' target="_blank"' : '') + '>' + item.label + '</a></li>';
      } else if (item.is_dropdown && subs.length) {
        html += '<li class="dropdown">';
        html += '<a href="' + resolveHref(item.href) + '" class="dropdown-toggle">' + item.label + '</a>';
        html += '<ul class="dropdown-menu">';
        subs.forEach(function (sub) {
          html += '<li><a href="' + resolveHref(sub.href) + '"' + (sub.target === '_blank' ? ' target="_blank"' : '') + '>' + sub.label + '</a></li>';
        });
        html += '</ul></li>';
      } else {
        html += '<li><a href="' + resolveHref(item.href) + '"' + (item.target === '_blank' ? ' target="_blank"' : '') + '>' + item.label + '</a></li>';
      }
    });
    return html;
  }

  function buildFallbackNav() {
    var homeAnchor = isSubfolder ? '../index.html' : 'index.html';
    var svcPrefix = isSubfolder ? '' : 'services/';
    var faqPath = isSubfolder ? '../faq.html' : 'faq.html';
    var sampleReportPath = isSubfolder ? '../sample-report.html' : 'sample-report.html';

    return ''
      + '<li><a href="' + homeAnchor + '#home">Home</a></li>'
      + '<li class="dropdown">'
      + '  <a href="' + homeAnchor + '#services" class="dropdown-toggle">Services</a>'
      + '  <ul class="dropdown-menu">'
      + '    <li><a href="' + svcPrefix + 'pre-purchase.html">Pre-Purchase Inspection</a></li>'
      + '    <li><a href="' + svcPrefix + 'pre-listing.html">Pre-Listing Inspection</a></li>'
      + '    <li><a href="' + svcPrefix + 'radon-testing.html">Radon Testing</a></li>'
      + '    <li><a href="' + svcPrefix + 'wdo.html">WDO Inspection</a></li>'
      + '    <li><a href="' + svcPrefix + 'sewer-scope.html">Sewer Scope</a></li>'
      + '    <li><a href="' + svcPrefix + 'mold-air-sampling.html">Mold/Air Sampling</a></li>'
      + '    <li><a href="' + svcPrefix + 'thermal.html">Thermal Imaging</a></li>'
      + '    <li><a href="' + svcPrefix + 'water-quality.html">Water Quality Testing</a></li>'
      + '    <li><a href="' + svcPrefix + 'new-construction.html">New Construction</a></li>'
      + '    <li><a href="' + svcPrefix + 'home-health-check.html">Home Health Check</a></li>'
      + '  </ul>'
      + '</li>'
      + '<li><a href="' + homeAnchor + '#about">About</a></li>'
      + '<li><a href="' + homeAnchor + '#bundle">Pricing</a></li>'
      + '<li><a href="' + sampleReportPath + '">Sample Report</a></li>'
      + '<li><a href="' + faqPath + '">FAQ</a></li>'
      + '<li><a href="' + homeAnchor + '#contact">Contact</a></li>'
      + '<li><a href="' + homeAnchor + '#bundle" class="cta-button">Get Instant Quote</a></li>';
  }

  function renderHeader(navInner) {
    return ''
      + '<header class="header">'
      + '  <nav class="nav-container">'
      + '    <a href="' + homePath + '" class="logo">'
      + '      <img class="logo-icon" src="' + imgPath + '" alt="Heartland Inspection Group">'
      + '    </a>'
      + '    <button class="mobile-toggle" aria-label="Toggle menu">\u2630</button>'
      + '    <ul class="nav-menu">' + navInner + '</ul>'
      + '  </nav>'
      + '</header>';
  }

  // Render immediately with fallback nav
  var placeholder = document.getElementById('site-header');
  if (placeholder) {
    placeholder.innerHTML = topBar + renderHeader(buildFallbackNav());
  } else {
    document.body.insertAdjacentHTML('afterbegin', topBar + renderHeader(buildFallbackNav()));
  }

  // Async: try to replace with Supabase nav_links
  fetch(SUPABASE_URL + '/rest/v1/nav_links?select=*&order=sort_order', {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    if (data && data.length) {
      var navMenu = document.querySelector('.nav-menu');
      if (navMenu) {
        navMenu.innerHTML = buildNavHTML(data);
      }
    }
  })
  .catch(function () { /* Supabase unavailable — keep fallback nav */ });

  // ===== Mobile menu =====
  function setupMobileMenu() {
    var mobileToggle = document.querySelector('.mobile-toggle');
    var navMenu = document.querySelector('.nav-menu');
    var bodyEl = document.body;

    if (mobileToggle && navMenu) {
      mobileToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        navMenu.classList.toggle('active');
        bodyEl.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
        mobileToggle.innerHTML = navMenu.classList.contains('active') ? '\u2715' : '\u2630';
      });

      document.addEventListener('click', function (e) {
        if (navMenu.classList.contains('active') &&
          !navMenu.contains(e.target) &&
          !mobileToggle.contains(e.target)) {
          navMenu.classList.remove('active');
          bodyEl.style.overflow = '';
          mobileToggle.innerHTML = '\u2630';
        }
      });

      // Use event delegation for dropdown toggles (handles dynamic nav)
      navMenu.addEventListener('click', function (e) {
        var toggle = e.target.closest('.dropdown-toggle');
        if (toggle && window.innerWidth <= 768) {
          e.preventDefault();
          toggle.parentElement.classList.toggle('active');
        }

        // Close menu on non-dropdown link click
        if (e.target.tagName === 'A' && !e.target.classList.contains('dropdown-toggle')) {
          navMenu.classList.remove('active');
          bodyEl.style.overflow = '';
          mobileToggle.innerHTML = '\u2630';
        }
      });
    }
  }

  setupMobileMenu();
})();
