/**
 * ============================================
 * INTERACTIVE SAMPLE REPORT
 * ============================================
 * Renders, filters, and expands findings from DEMO_REPORT global.
 * Loaded on sample-report.html after demo-report-data.js.
 */

(function () {
  'use strict';

  var CATEGORIES = ['electrical', 'plumbing', 'structural', 'roofing', 'hvac', 'exterior', 'interior'];
  var SEVERITIES = ['major', 'minor', 'info'];
  var SEVERITY_LABELS = { major: 'Major', minor: 'Minor', info: 'Informational' };
  var SEVERITY_COLORS = { major: '#C0392B', minor: '#E67E22', info: '#7F8C8D' };

  var state = {
    activeCategory: null,
    activeSeverity: null,
    expandedCards: {}
  };

  var app = document.getElementById('report-app');
  if (!app || typeof DEMO_REPORT === 'undefined') return;

  var data = DEMO_REPORT;
  var findings = data.findings;

  // ─── Helpers ───────────────────────────────────────────────────

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function countBySeverity(sev) {
    return findings.filter(function (f) { return f.severity === sev; }).length;
  }

  // ─── Build the DOM ─────────────────────────────────────────────

  function render() {
    var prop = data.property;
    var insp = data.inspection;

    var html = '';

    // Report header card
    html += '<div class="rpt-header">';
    html += '  <div class="rpt-header-top">';
    html += '    <div>';
    html += '      <h2 class="rpt-header-title">Home Inspection Report</h2>';
    html += '      <p class="rpt-header-subtitle">' + prop.address + ', ' + prop.city + ', ' + prop.state + ' ' + prop.zip + '</p>';
    html += '    </div>';
    html += '    <button class="rpt-print-btn" onclick="window.print()" aria-label="Print report">&#128438; Print</button>';
    html += '  </div>';
    html += '  <div class="rpt-header-details">';
    html += '    <div class="rpt-detail"><span class="rpt-detail-label">Inspection Date</span><span class="rpt-detail-value">' + insp.date + '</span></div>';
    html += '    <div class="rpt-detail"><span class="rpt-detail-label">Inspector</span><span class="rpt-detail-value">' + insp.inspector + '</span></div>';
    html += '    <div class="rpt-detail"><span class="rpt-detail-label">Living Area</span><span class="rpt-detail-value">' + prop.sqft.toLocaleString() + ' sq ft</span></div>';
    html += '    <div class="rpt-detail"><span class="rpt-detail-label">Bedrooms / Baths</span><span class="rpt-detail-value">' + prop.bedrooms + ' bed / ' + prop.bathrooms + ' bath</span></div>';
    html += '    <div class="rpt-detail"><span class="rpt-detail-label">Year Built</span><span class="rpt-detail-value">' + prop.yearBuilt + '</span></div>';
    html += '    <div class="rpt-detail"><span class="rpt-detail-label">Property Type</span><span class="rpt-detail-value">' + prop.type + '</span></div>';
    html += '  </div>';
    html += '</div>';

    // Summary bar
    html += '<div class="rpt-summary">';
    html += summaryTile('total', findings.length, 'Total Findings', null);
    html += summaryTile('major', countBySeverity('major'), 'Major', SEVERITY_COLORS.major);
    html += summaryTile('minor', countBySeverity('minor'), 'Minor', SEVERITY_COLORS.minor);
    html += summaryTile('info', countBySeverity('info'), 'Informational', SEVERITY_COLORS.info);
    html += '</div>';

    // Filter bar
    html += '<div class="rpt-filters">';
    html += '  <div class="rpt-filter-row">';
    html += '    <span class="rpt-filter-label">Category</span>';
    CATEGORIES.forEach(function (cat) {
      html += '<button class="rpt-pill rpt-pill-cat" data-category="' + cat + '">' + capitalize(cat) + '</button>';
    });
    html += '  </div>';
    html += '  <div class="rpt-filter-row">';
    html += '    <span class="rpt-filter-label">Severity</span>';
    SEVERITIES.forEach(function (sev) {
      html += '<button class="rpt-pill rpt-pill-sev" data-severity="' + sev + '">' + SEVERITY_LABELS[sev] + '</button>';
    });
    html += '  </div>';
    html += '  <div class="rpt-filter-status">';
    html += '    <span class="rpt-filter-count">Showing <strong>' + findings.length + '</strong> of ' + findings.length + ' findings</span>';
    html += '    <span class="rpt-active-chips"></span>';
    html += '  </div>';
    html += '</div>';

    // Findings list
    html += '<div class="rpt-findings">';
    findings.forEach(function (f) {
      html += findingCard(f);
    });
    html += '</div>';

    app.innerHTML = html;

    bindEvents();
  }

  function summaryTile(key, count, label, color) {
    var style = color ? ' style="--tile-color:' + color + '"' : '';
    return '<button class="rpt-summary-tile" data-tile="' + key + '"' + style + '>' +
      '<span class="rpt-summary-count">' + count + '</span>' +
      '<span class="rpt-summary-label">' + label + '</span>' +
      '</button>';
  }

  function findingCard(f) {
    var dotStyle = 'background:' + SEVERITY_COLORS[f.severity];
    var html = '';
    html += '<div class="rpt-card" data-id="' + f.id + '" data-category="' + f.category + '" data-severity="' + f.severity + '">';
    html += '  <button class="rpt-card-header" aria-expanded="false">';
    html += '    <span class="rpt-severity-dot" style="' + dotStyle + '"></span>';
    html += '    <span class="rpt-card-id">' + f.id + '</span>';
    html += '    <span class="rpt-card-title">' + f.title + '</span>';
    html += '    <span class="rpt-card-badge">' + capitalize(f.category) + '</span>';
    html += '    <span class="rpt-card-chevron">&#9662;</span>';
    html += '  </button>';
    html += '  <div class="rpt-card-body">';
    html += '    <div class="rpt-card-banner" style="background:' + SEVERITY_COLORS[f.severity] + '">' + SEVERITY_LABELS[f.severity] + '</div>';
    html += '    <p class="rpt-card-desc">' + f.description + '</p>';
    html += '    <div class="rpt-card-meta">';
    html += '      <div class="rpt-card-meta-item"><span class="rpt-meta-icon">&#128205;</span><div><strong>Location</strong><p>' + f.location + '</p></div></div>';
    html += '      <div class="rpt-card-meta-item"><span class="rpt-meta-icon">&#128161;</span><div><strong>Recommendation</strong><p>' + f.recommendation + '</p></div></div>';
    html += '    </div>';
    html += '    <div class="rpt-card-photo">';
    html += '      <span class="rpt-photo-icon">&#128247;</span>';
    html += '      <span class="rpt-photo-caption">' + f.photoCaption + '</span>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';
    return html;
  }

  // ─── Event binding ─────────────────────────────────────────────

  function bindEvents() {
    // Summary tiles
    app.querySelectorAll('.rpt-summary-tile').forEach(function (tile) {
      tile.addEventListener('click', function () {
        var key = tile.getAttribute('data-tile');
        if (key === 'total') {
          state.activeSeverity = null;
          state.activeCategory = null;
        } else {
          state.activeSeverity = state.activeSeverity === key ? null : key;
        }
        applyFilters();
      });
    });

    // Category pills
    app.querySelectorAll('.rpt-pill-cat').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var cat = pill.getAttribute('data-category');
        state.activeCategory = state.activeCategory === cat ? null : cat;
        applyFilters();
      });
    });

    // Severity pills
    app.querySelectorAll('.rpt-pill-sev').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var sev = pill.getAttribute('data-severity');
        state.activeSeverity = state.activeSeverity === sev ? null : sev;
        applyFilters();
      });
    });

    // Card expand/collapse
    app.querySelectorAll('.rpt-card-header').forEach(function (header) {
      header.addEventListener('click', function () {
        var card = header.closest('.rpt-card');
        var id = card.getAttribute('data-id');
        var isExpanded = card.classList.contains('rpt-expanded');

        if (isExpanded) {
          card.classList.remove('rpt-expanded');
          header.setAttribute('aria-expanded', 'false');
          delete state.expandedCards[id];
        } else {
          card.classList.add('rpt-expanded');
          header.setAttribute('aria-expanded', 'true');
          state.expandedCards[id] = true;
        }
      });
    });
  }

  // ─── Filtering ─────────────────────────────────────────────────

  function applyFilters() {
    var cards = app.querySelectorAll('.rpt-card');
    var visibleCount = 0;

    cards.forEach(function (card) {
      var matchCat = !state.activeCategory || card.getAttribute('data-category') === state.activeCategory;
      var matchSev = !state.activeSeverity || card.getAttribute('data-severity') === state.activeSeverity;

      if (matchCat && matchSev) {
        card.classList.remove('rpt-hidden');
        visibleCount++;
      } else {
        card.classList.add('rpt-hidden');
      }
    });

    // Update count
    var countEl = app.querySelector('.rpt-filter-count');
    if (countEl) {
      countEl.innerHTML = 'Showing <strong>' + visibleCount + '</strong> of ' + findings.length + ' findings';
    }

    // Update pill active states
    app.querySelectorAll('.rpt-pill-cat').forEach(function (pill) {
      pill.classList.toggle('rpt-pill--active', pill.getAttribute('data-category') === state.activeCategory);
    });
    app.querySelectorAll('.rpt-pill-sev').forEach(function (pill) {
      pill.classList.toggle('rpt-pill--active', pill.getAttribute('data-severity') === state.activeSeverity);
    });

    // Update summary tile active states
    app.querySelectorAll('.rpt-summary-tile').forEach(function (tile) {
      var key = tile.getAttribute('data-tile');
      var isActive = false;
      if (key === 'total') {
        isActive = !state.activeSeverity && !state.activeCategory;
      } else {
        isActive = state.activeSeverity === key;
      }
      tile.classList.toggle('rpt-summary-tile--active', isActive);
    });

    // Active filter chips
    var chipsEl = app.querySelector('.rpt-active-chips');
    if (chipsEl) {
      var chips = '';
      if (state.activeCategory) {
        chips += '<button class="rpt-chip" data-clear="category">' + capitalize(state.activeCategory) + ' &times;</button>';
      }
      if (state.activeSeverity) {
        chips += '<button class="rpt-chip" data-clear="severity">' + SEVERITY_LABELS[state.activeSeverity] + ' &times;</button>';
      }
      chipsEl.innerHTML = chips;

      chipsEl.querySelectorAll('.rpt-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var clear = chip.getAttribute('data-clear');
          if (clear === 'category') state.activeCategory = null;
          if (clear === 'severity') state.activeSeverity = null;
          applyFilters();
        });
      });
    }
  }

  // ─── Initialize ────────────────────────────────────────────────

  render();

})();
