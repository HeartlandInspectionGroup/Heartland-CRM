/**
 * inspection-report-viewer.js — Reusable section-based inspection report viewer
 *
 * Renders a full interactive inspection report from generate-report.js data.
 * Used by: client-portal.html, agent-portal.html, admin.html, standalone report page.
 *
 * Usage:
 *   var viewer = InspectionReportViewer.render(containerEl, reportData, options);
 *
 * Options:
 *   showRepairBuilder: boolean (default false) — show repair request checkboxes
 *   showPdfButton: boolean (default false) — show "Generate PDF" button
 *   onPdfGenerate: function(reportData) — callback when PDF button clicked
 */
var InspectionReportViewer = (function() {
  'use strict';

  var SEVERITY_COLORS = {
    major: '#C0392B',
    minor: '#E67E22',
    info: '#7F8C8D'
  };
  var SEVERITY_LABELS = {
    major: 'Major Defect',
    minor: 'Minor Defect',
    info: 'Information'
  };
  var CONDITION_COLORS = {
    'Satisfactory': '#3d7a3c',
    'Minor Defect': '#E67E22',
    'Major Defect': '#C0392B',
    'Not Inspected': '#7F8C8D',
    'Not Present': '#95a5a6'
  };

  function render(container, report, options) {
    options = options || {};
    var state = {
      activeSection: null,
      activeSeverity: null,
      expandedFindings: {},
      repairItems: {},
      sidebarOpen: false,
    };

    var html = buildReportHTML(report, options, state);
    container.innerHTML = html;
    bindEvents(container, report, options, state);
    return { container: container, state: state };
  }

  function buildReportHTML(report, options, state) {
    var html = '';

    /* ── Cover / Header ── */
    html += '<div class="irv-cover">';
    html += '<div class="irv-cover-logo"><img src="/images/HIG_Logo.avif" alt="HIG" onerror="this.src=\'/images/HIG_Logo.png\'"></div>';
    html += '<h1 class="irv-cover-title">Home Inspection Report</h1>';
    html += '<div class="irv-cover-address">' + esc(report.property.address) + '</div>';
    html += '<div class="irv-cover-meta">';
    html += '<span>Date: ' + esc(report.inspection.date) + '</span>';
    html += '<span>State: ' + esc(report.inspection.state_code) + '</span>';
    html += '</div>';
    if (report.client && report.client.name) {
      html += '<div class="irv-cover-client">Prepared for: ' + esc(report.client.name) + '</div>';
    }
    html += '</div>';

    /* ── Summary Stats ── */
    html += '<div class="irv-summary">';
    html += '<div class="irv-stat"><span class="irv-stat-num">' + report.summary.total_sections + '</span><span class="irv-stat-label">Sections</span></div>';
    html += '<div class="irv-stat irv-stat-major"><span class="irv-stat-num">' + report.summary.major + '</span><span class="irv-stat-label">Major</span></div>';
    html += '<div class="irv-stat irv-stat-minor"><span class="irv-stat-num">' + report.summary.minor + '</span><span class="irv-stat-label">Minor</span></div>';
    html += '<div class="irv-stat"><span class="irv-stat-num">' + report.summary.photo_count + '</span><span class="irv-stat-label">Photos</span></div>';
    html += '</div>';

    /* ── Severity Filter Bar ── */
    html += '<div class="irv-filter-bar">';
    html += '<button class="irv-filter-btn active" data-severity="">All Findings (' + report.summary.total_findings + ')</button>';
    html += '<button class="irv-filter-btn irv-sev-major" data-severity="major">Major (' + report.summary.major + ')</button>';
    html += '<button class="irv-filter-btn irv-sev-minor" data-severity="minor">Minor (' + report.summary.minor + ')</button>';
    html += '</div>';

    /* ── Main Layout: Sidebar + Content ── */
    html += '<div class="irv-layout">';

    /* Sidebar — section navigation */
    html += '<nav class="irv-sidebar" id="irvSidebar">';
    html += '<div class="irv-sidebar-header"><h3>Sections</h3><button class="irv-sidebar-close" id="irvSidebarClose">&times;</button></div>';
    var currentGroup = '';
    report.sections.forEach(function(s) {
      if (s.group_name !== currentGroup) {
        if (currentGroup) html += '</div>';
        currentGroup = s.group_name;
        html += '<div class="irv-sidebar-group"><h4>' + esc(currentGroup) + '</h4>';
      }
      var findingCount = s.findings ? s.findings.length : 0;
      var badge = findingCount > 0 ? '<span class="irv-sidebar-badge">' + findingCount + '</span>' : '';
      var flagIcon = s.flagged ? ' <span class="irv-flag">&#9873;</span>' : '';
      html += '<a href="#irv-section-' + esc(s.section_id) + '" class="irv-sidebar-link" data-section="' + esc(s.section_id) + '">' +
        '<span>' + esc(s.icon || '') + ' ' + esc(s.name) + flagIcon + '</span>' + badge + '</a>';
    });
    if (currentGroup) html += '</div>';

    /* Not inspected items */
    if (report.not_inspected && report.not_inspected.length) {
      html += '<div class="irv-sidebar-group"><h4>Not Inspected</h4>';
      html += '<a href="#irv-not-inspected" class="irv-sidebar-link"><span>Items Not Inspected</span><span class="irv-sidebar-badge">' + report.not_inspected.length + '</span></a>';
      html += '</div>';
    }
    html += '</nav>';

    /* Mobile sidebar toggle */
    html += '<button class="irv-sidebar-toggle" id="irvSidebarToggle">&#9776; Sections</button>';

    /* Content area */
    html += '<div class="irv-content">';

    /* Section chapters */
    report.sections.forEach(function(section) {
      html += renderSection(section, options);
    });

    /* Not Inspected disclosure */
    if (report.not_inspected && report.not_inspected.length) {
      html += '<div class="irv-section" id="irv-not-inspected">';
      html += '<h2 class="irv-section-title">Items Not Inspected</h2>';
      html += '<div class="irv-ni-list">';
      report.not_inspected.forEach(function(ni) {
        html += '<div class="irv-ni-item">';
        html += '<span class="irv-ni-section">' + esc(ni.section_name) + '</span>';
        if (ni.item) html += '<span class="irv-ni-item-name"> — ' + esc(ni.item) + '</span>';
        html += '<span class="irv-ni-reason">' + esc(ni.reason) + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    html += '</div>'; /* end irv-content */
    html += '</div>'; /* end irv-layout */

    /* ── Repair Request Builder ── */
    if (options.showRepairBuilder && report.findings && report.findings.length) {
      html += '<div class="irv-repair-builder" id="irvRepairBuilder">';
      html += '<h3>Repair Request Builder</h3>';
      html += '<p>Check findings to include in your repair request:</p>';
      html += '<div id="irvRepairList"></div>';
      html += '<button class="irv-btn irv-btn-accent" id="irvCopyRepairList">Copy Repair List</button>';
      html += '</div>';
    }

    /* ── PDF Button ── */
    if (options.showPdfButton) {
      html += '<div class="irv-pdf-area">';
      html += '<button class="irv-btn irv-btn-primary" id="irvGeneratePdf">Download PDF Report</button>';
      html += '</div>';
    }

    return html;
  }

  function renderSection(section, options) {
    var html = '<div class="irv-section" id="irv-section-' + esc(section.section_id) + '">';
    html += '<h2 class="irv-section-title">' + esc(section.icon || '') + ' ' + esc(section.name) + '</h2>';
    html += '<span class="irv-section-group-label">' + esc(section.group_name) + '</span>';

    if (section.flagged) {
      html += '<div class="irv-flagged-notice">&#9873; This section was flagged for review</div>';
    }

    /* Checklist items summary */
    html += '<div class="irv-items-grid">';
    (section.items || []).forEach(function(item) {
      var condColor = CONDITION_COLORS[item.condition] || '#6b7d8a';
      var value = item.value || item.condition || '—';
      html += '<div class="irv-item-row">';
      html += '<span class="irv-item-label">' + esc(item.label) + '</span>';
      if (item.condition) {
        html += '<span class="irv-item-condition" style="color:' + condColor + '">' + esc(item.condition) + '</span>';
      } else {
        html += '<span class="irv-item-value">' + esc(value) + '</span>';
      }
      html += '</div>';
      if (item.comment) {
        html += '<div class="irv-item-comment">' + esc(item.comment) + '</div>';
      }
    });
    html += '</div>';

    /* Findings */
    if (section.findings && section.findings.length) {
      html += '<div class="irv-findings">';
      html += '<h3>Findings (' + section.findings.length + ')</h3>';
      section.findings.forEach(function(f) {
        html += renderFinding(f, options);
      });
      html += '</div>';
    }

    /* General comment */
    if (section.general_comment) {
      html += '<div class="irv-general-comment"><strong>Inspector Notes:</strong> ' + esc(section.general_comment) + '</div>';
    }

    /* Photos */
    if (section.photos && section.photos.length) {
      html += '<div class="irv-photo-grid">';
      section.photos.forEach(function(p) {
        html += '<div class="irv-photo">';
        html += '<img src="' + esc(p.public_url) + '" alt="' + esc(p.caption || 'Inspection photo') + '" loading="lazy" />';
        if (p.caption) html += '<span class="irv-photo-caption">' + esc(p.caption) + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>'; /* end irv-section */
    return html;
  }

  function renderFinding(f, options) {
    var dotStyle = 'background:' + (SEVERITY_COLORS[f.severity] || '#7F8C8D');
    var html = '<div class="irv-finding" data-severity="' + esc(f.severity) + '" data-finding-id="' + esc(f.id) + '">';

    if (options.showRepairBuilder) {
      html += '<label class="irv-repair-check"><input type="checkbox" data-finding-id="' + esc(f.id) + '" class="irv-repair-checkbox" /></label>';
    }

    html += '<div class="irv-finding-header">';
    html += '<span class="irv-sev-dot" style="' + dotStyle + '"></span>';
    html += '<span class="irv-finding-id">' + esc(f.id) + '</span>';
    html += '<span class="irv-finding-title">' + esc(f.title) + '</span>';
    html += '<span class="irv-finding-badge" style="background:' + (SEVERITY_COLORS[f.severity] || '#7F8C8D') + '">' + esc(SEVERITY_LABELS[f.severity] || f.severity) + '</span>';
    html += '</div>';

    if (f.description) {
      html += '<div class="irv-finding-desc">' + esc(f.description) + '</div>';
    }

    /* Finding photos */
    if (f.photos && f.photos.length) {
      html += '<div class="irv-finding-photos">';
      f.photos.forEach(function(p) {
        html += '<img src="' + esc(p.public_url) + '" alt="' + esc(p.caption || '') + '" loading="lazy" class="irv-finding-photo" />';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function bindEvents(container, report, options, state) {
    /* Severity filter */
    container.querySelectorAll('.irv-filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        container.querySelectorAll('.irv-filter-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.activeSeverity = btn.dataset.severity || null;
        applyFilters(container, state);
      });
    });

    /* Sidebar navigation */
    container.querySelectorAll('.irv-sidebar-link').forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        var href = link.getAttribute('href');
        var target = container.querySelector(href);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        /* Close mobile sidebar */
        var sidebar = container.querySelector('#irvSidebar');
        if (sidebar) sidebar.classList.remove('open');
      });
    });

    /* Mobile sidebar toggle */
    var toggleBtn = container.querySelector('#irvSidebarToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function() {
        var sidebar = container.querySelector('#irvSidebar');
        if (sidebar) sidebar.classList.toggle('open');
      });
    }
    var closeBtn = container.querySelector('#irvSidebarClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        var sidebar = container.querySelector('#irvSidebar');
        if (sidebar) sidebar.classList.remove('open');
      });
    }

    /* Photo lightbox */
    container.querySelectorAll('.irv-photo img, .irv-finding-photo').forEach(function(img) {
      img.addEventListener('click', function() {
        showLightbox(img.src);
      });
    });

    /* Repair builder */
    if (options.showRepairBuilder) {
      container.querySelectorAll('.irv-repair-checkbox').forEach(function(cb) {
        cb.addEventListener('change', function() {
          state.repairItems[cb.dataset.findingId] = cb.checked;
          updateRepairList(container, report, state);
        });
      });

      var copyBtn = container.querySelector('#irvCopyRepairList');
      if (copyBtn) {
        copyBtn.addEventListener('click', function() {
          var list = buildRepairText(report, state);
          navigator.clipboard.writeText(list).then(function() {
            copyBtn.textContent = 'Copied!';
            setTimeout(function() { copyBtn.textContent = 'Copy Repair List'; }, 2000);
          });
        });
      }
    }

    /* PDF generation */
    if (options.showPdfButton) {
      var pdfBtn = container.querySelector('#irvGeneratePdf');
      if (pdfBtn) {
        pdfBtn.addEventListener('click', function() {
          if (options.onPdfGenerate) {
            options.onPdfGenerate(report);
          } else {
            generatePdf(container, report);
          }
        });
      }
    }
  }

  function applyFilters(container, state) {
    container.querySelectorAll('.irv-finding').forEach(function(el) {
      if (!state.activeSeverity || el.dataset.severity === state.activeSeverity) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
  }

  function updateRepairList(container, report, state) {
    var listEl = container.querySelector('#irvRepairList');
    if (!listEl) return;
    var selected = report.findings.filter(function(f) { return state.repairItems[f.id]; });
    if (!selected.length) {
      listEl.innerHTML = '<p class="irv-repair-empty">No items selected</p>';
      return;
    }
    listEl.innerHTML = selected.map(function(f) {
      return '<div class="irv-repair-item">' +
        '<span class="irv-sev-dot" style="background:' + (SEVERITY_COLORS[f.severity] || '#7F8C8D') + '"></span>' +
        '<strong>' + esc(f.title) + '</strong>' +
        (f.description ? ' — ' + esc(f.description) : '') +
        '</div>';
    }).join('');
  }

  function buildRepairText(report, state) {
    var selected = report.findings.filter(function(f) { return state.repairItems[f.id]; });
    var lines = ['REPAIR REQUEST — ' + report.property.address, ''];
    selected.forEach(function(f, i) {
      lines.push((i + 1) + '. [' + f.severity.toUpperCase() + '] ' + f.title);
      if (f.description) lines.push('   ' + f.description);
      lines.push('');
    });
    return lines.join('\n');
  }

  function showLightbox(src) {
    var overlay = document.createElement('div');
    overlay.className = 'irv-lightbox';
    overlay.innerHTML = '<img src="' + src + '" />';
    overlay.addEventListener('click', function() { overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function generatePdf(container, report) {
    /* Load html2pdf.js from CDN if not already loaded */
    if (typeof html2pdf === 'undefined') {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = function() { runPdfGeneration(container, report); };
      document.head.appendChild(script);
    } else {
      runPdfGeneration(container, report);
    }
  }

  function runPdfGeneration(container, report) {
    var pdfBtn = container.querySelector('#irvGeneratePdf');
    if (pdfBtn) { pdfBtn.disabled = true; pdfBtn.textContent = 'Generating PDF...'; }

    var content = container.querySelector('.irv-content');
    var opt = {
      margin: [10, 10, 10, 10],
      filename: 'Inspection-Report-' + (report.property.address || '').replace(/[^a-zA-Z0-9]/g, '-') + '.pdf',
      image: { type: 'jpeg', quality: 0.85 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };

    html2pdf().set(opt).from(content).save().then(function() {
      if (pdfBtn) { pdfBtn.disabled = false; pdfBtn.textContent = 'Download PDF Report'; }
    });
  }

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { render: render };
})();
