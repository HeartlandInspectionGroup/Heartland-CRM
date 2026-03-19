/**
 * scripts/admin-metrics.js — Metrics tab (HEA-233)
 * Extracted from admin.html main IIFE.
 * Reads: window._hbShared.records
 */

var metricsRange = 'all';
var _mxFlippedCat = null;

function setMetricsRange(range, btn) {
  metricsRange = range;
  document.querySelectorAll('#tab-metrics .cr-filter-btn').forEach(function(b){ b.classList.remove('active'); });
  if(btn) btn.classList.add('active');
  renderMetrics();
}

function getDateRangeCutoff(range) {
  var now = new Date();
  if(range === 'week') {
    var d = new Date(now); d.setDate(d.getDate() - 7); return d;
  }
  if(range === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if(range === 'quarter') {
    var qStart = Math.floor(now.getMonth() / 3) * 3;
    return new Date(now.getFullYear(), qStart, 1);
  }
  if(range === 'year') {
    return new Date(now.getFullYear(), 0, 1);
  }
  return null;
}

function filterRecordsByRange(records, range) {
  var cutoff = getDateRangeCutoff(range);
  if(!cutoff) return records;
  return records.filter(function(r) {
    var d = r.inspection_date || r.created_at || '';
    return d && new Date(d) >= cutoff;
  });
}

function renderMetrics() {
  var kpiEl   = document.getElementById('metricsKpiGrid');
  var mixEl   = document.getElementById('metricsServiceMix');
  var addonEl = document.getElementById('metricsAddonGrid');
  if (!kpiEl) return;

  var inspectionRecordsData = window._hbShared.records || [];
  var ADDON_TIERS = ['Radon','Sewer Scope','Mold','Water Quality','Thermal','WDO'];

  var allSubmitted = inspectionRecordsData.filter(function(r){ return r.status === 'submitted'; });
  var recs = filterRecordsByRange(allSubmitted, metricsRange);

  var mainRecs  = recs.filter(function(r){ return ADDON_TIERS.indexOf(r.tier) === -1; });
  var hiRecs    = mainRecs.filter(function(r){ return r.category === 'home_inspection'; });
  var hhcRecs   = mainRecs.filter(function(r){ return r.category === 'home_health_check'; });
  var ncRecs    = mainRecs.filter(function(r){ return r.category === 'new_construction'; });
  var totalMain = mainRecs.length;

  var now = new Date();
  var thisMonth = allSubmitted.filter(function(r){
    var d = new Date(r.inspection_date || r.created_at || '');
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && ADDON_TIERS.indexOf(r.tier) === -1;
  }).length;
  var thisYear = allSubmitted.filter(function(r){
    var d = new Date(r.inspection_date || r.created_at || '');
    return d.getFullYear() === now.getFullYear() && ADDON_TIERS.indexOf(r.tier) === -1;
  }).length;
  var scheduled = inspectionRecordsData.filter(function(r){ return r.status === 'scheduled'; }).length;

  kpiEl.innerHTML =
    mkKpiTile('🔍', totalMain, 'Main Inspections (Period)', 'var(--primary)') +
    mkKpiTile('📅', thisMonth, 'This Month', 'var(--secondary)') +
    mkKpiTile('📆', thisYear, 'This Year', 'var(--secondary)') +
    mkKpiTile('📋', scheduled, 'Scheduled', 'var(--accent)');

  var CAT_DEFS = [
    { key: 'home_inspection',   label: 'Home Inspections',  icon: '🏠', color: 'var(--primary)',   recs: hiRecs  },
    { key: 'home_health_check', label: 'Home Health Check', icon: '❤️', color: 'var(--secondary)', recs: hhcRecs },
    { key: 'new_construction',  label: 'New Construction',  icon: '🏗️', color: 'var(--accent)',    recs: ncRecs  },
  ];

  var mixHtml = '<div style="display:flex;flex-direction:column;gap:12px;">';

  CAT_DEFS.forEach(function(cat) {
    var count = cat.recs.length;
    var pct   = totalMain > 0 ? Math.round((count / totalMain) * 100) : 0;
    var isFlipped = _mxFlippedCat === cat.key;

    mixHtml += '<div style="border:1.5px solid #e8eaed;border-radius:12px;overflow:hidden;">';
    mixHtml += '<button data-mxcat="' + cat.key + '" style="width:100%;background:' + (isFlipped ? cat.color : '#f8f9fb') + ';border:none;cursor:pointer;padding:14px 18px;text-align:left;transition:background 0.2s;">';
    mixHtml += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    mixHtml += '<span style="font-size:14px;font-weight:700;color:' + (isFlipped ? '#fff' : 'var(--text-dark)') + ';">' + cat.icon + ' ' + esc(cat.label) + '</span>';
    mixHtml += '<span style="font-size:18px;font-weight:700;color:' + (isFlipped ? '#fff' : cat.color) + ';">' + pct + '% <span style="font-size:12px;font-weight:400;opacity:0.7;">(' + count + ')</span></span>';
    mixHtml += '</div>';
    mixHtml += '<div style="background:' + (isFlipped ? 'rgba(255,255,255,0.3)' : '#e8eaed') + ';border-radius:20px;height:6px;margin-top:8px;overflow:hidden;">';
    mixHtml += '<div style="background:' + (isFlipped ? '#fff' : cat.color) + ';width:' + pct + '%;height:100%;border-radius:20px;transition:width 0.4s;"></div>';
    mixHtml += '</div>';
    mixHtml += '</button>';

    if (isFlipped && count > 0) {
      var tierCounts = {};
      cat.recs.forEach(function(r){ var t = r.tier || 'Unknown'; tierCounts[t] = (tierCounts[t]||0) + 1; });
      mixHtml += '<div style="padding:14px 18px;background:#fff;border-top:1px solid #e8eaed;">';
      Object.keys(tierCounts).sort().forEach(function(t){
        mixHtml += mkBarRow(t, tierCounts[t], count, cat.color);
      });
      mixHtml += '</div>';
    }

    mixHtml += '</div>';
  });

  mixHtml += '</div>';
  mixEl.innerHTML = totalMain ? mixHtml : '<p style="color:#aaa;font-size:13px;">No submitted inspections for this period.</p>';

  var hiCount = hiRecs.length;
  var addonHtml = '';

  if (hiCount === 0) {
    addonHtml = '<p style="color:#aaa;font-size:13px;">No submitted Home Inspections yet — add-on penetration requires HI as the base.</p>';
  } else {
    addonHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">';
    ADDON_TIERS.forEach(function(addonName) {
      var count = recs.filter(function(r){ return r.tier === addonName; }).length;
      var pct   = Math.round((count / hiCount) * 100);
      addonHtml +=
        '<div style="background:#f8f9fb;border:1px solid #e8eaed;border-radius:10px;padding:16px 18px;">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:8px;">' + esc(addonName) + '</div>' +
        '<div style="font-size:28px;font-weight:700;color:var(--primary);">' + pct + '%</div>' +
        '<div style="font-size:12px;color:var(--text-light);margin-bottom:10px;">' + count + ' of ' + hiCount + ' HIs</div>' +
        '<div style="background:#e8eaed;border-radius:20px;height:6px;overflow:hidden;">' +
          '<div style="background:var(--secondary);width:' + pct + '%;height:100%;border-radius:20px;"></div>' +
        '</div>' +
        '</div>';
    });
    addonHtml += '</div>';
  }
  addonEl.innerHTML = addonHtml;
}

function mxFlipCat(catKey) {
  _mxFlippedCat = _mxFlippedCat === catKey ? null : catKey;
  renderMetrics();
}

// Event listener for service mix category toggle
document.addEventListener('DOMContentLoaded', function() {
  var tabMetrics = document.getElementById('tab-metrics');
  if (tabMetrics) {
    tabMetrics.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-mxcat]');
      if (btn) mxFlipCat(btn.getAttribute('data-mxcat'));
    });
  }
});

window.setMetricsRange = setMetricsRange;
window.mxFlipCat = mxFlipCat;
window.renderMetrics = renderMetrics;
window.getDateRangeCutoff = getDateRangeCutoff;
window.filterRecordsByRange = filterRecordsByRange;
