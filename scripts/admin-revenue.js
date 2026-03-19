/**
 * scripts/admin-revenue.js — Revenue tab (HEA-233)
 * Extracted from admin.html main IIFE.
 * Reads: window._hbShared.records, window._hbShared.cfg
 * Uses shared utils from admin-utils.js: mkKpiTile, mkBarRow, esc, qbParseDate, qbFormatDate, qbDownloadCSV
 * Uses filterRecordsByRange from admin-metrics.js
 */

var revenueRange = 'all';

function setRevenueRange(range, btn) {
  revenueRange = range;
  document.querySelectorAll('#tab-revenue .cr-filter-btn').forEach(function(b){ b.classList.remove('active'); });
  if(btn) btn.classList.add('active');
  renderRevenue();
}

function renderRevenue() {
  var kpiEl   = document.getElementById('revenueKpiGrid');
  var tierEl  = document.getElementById('revenueTierGrid');
  var addonEl = document.getElementById('revenueAddonGrid');
  if(!kpiEl) return;

  var inspectionRecordsData = window._hbShared.records || [];
  var cfg = window._hbShared.cfg;

  var completed = ['submitted','delivered','approved','completed'];
  var allRecs = inspectionRecordsData.filter(function(r){ return completed.indexOf(r.status) !== -1; });
  var recs = filterRecordsByRange(allRecs, revenueRange);
  var total = recs.length;

  var tierPriceMap = {};
  if(cfg && cfg.pricing && cfg.pricing.homeSizeTiers) {
    cfg.pricing.homeSizeTiers.forEach(function(t){ tierPriceMap[t.label] = t.price; });
  }
  var addonPriceMap = {};
  if(cfg && cfg.pricing && cfg.pricing.addonServices) {
    cfg.pricing.addonServices.forEach(function(s){ addonPriceMap[s.name] = s.price; });
  }

  function getRecordRevenue(r) {
    if(r.final_total && !isNaN(parseFloat(r.final_total))) return parseFloat(r.final_total);
    var base = tierPriceMap[r.tier] || 0;
    var fd = r.form_data || {};
    var addons = fd.addons || fd.selectedAddons || fd.add_ons || [];
    var addonTotal = 0;
    if(Array.isArray(addons)) {
      addons.forEach(function(a){
        var name = typeof a === 'string' ? a : (a.name || '');
        addonTotal += addonPriceMap[name] || (typeof a === 'object' && a.price ? a.price : 0);
      });
    }
    return base + addonTotal;
  }

  var totalRev = recs.reduce(function(sum,r){ return sum + getRecordRevenue(r); }, 0);
  var avgRev = total > 0 ? totalRev / total : 0;

  var now = new Date();
  var monthRev = allRecs.filter(function(r){
    var d = new Date(r.inspection_date || r.created_at || '');
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce(function(sum,r){ return sum + getRecordRevenue(r); }, 0);
  var yearRev = allRecs.filter(function(r){
    var d = new Date(r.inspection_date || r.created_at || '');
    return d.getFullYear() === now.getFullYear();
  }).reduce(function(sum,r){ return sum + getRecordRevenue(r); }, 0);

  function fmt(n){ return '$' + Math.round(n).toLocaleString(); }

  kpiEl.innerHTML =
    mkKpiTile('💰', fmt(totalRev), 'Total Revenue (Period)', 'var(--primary)') +
    mkKpiTile('📊', fmt(avgRev), 'Avg per Inspection', 'var(--secondary)') +
    mkKpiTile('📅', fmt(monthRev), 'This Month (All Time)', 'var(--secondary)') +
    mkKpiTile('📆', fmt(yearRev), 'This Year (All Time)', 'var(--accent)');

  var tierRevMap = {};
  recs.forEach(function(r){
    var t = r.tier || 'Unknown';
    tierRevMap[t] = (tierRevMap[t]||0) + getRecordRevenue(r);
  });
  var tierColors = { Standard:'var(--primary)', Premium:'var(--secondary)', Elite:'var(--accent)', Unknown:'#aaa' };
  tierEl.innerHTML = Object.keys(tierRevMap).sort().map(function(t){
    return mkBarRow(t, fmt(tierRevMap[t]).replace('$',''), totalRev, tierColors[t] || 'var(--primary)', '$');
  }).join('') || '<p style="color:#aaa;font-size:13px;">No data for this period.</p>';

  var addonRevMap = {};
  recs.forEach(function(r){
    var fd = r.form_data || {};
    var addons = fd.addons || fd.selectedAddons || fd.add_ons || [];
    if(Array.isArray(addons)) {
      addons.forEach(function(a){
        var name = typeof a === 'string' ? a : (a.name || '');
        var price = addonPriceMap[name] || (typeof a === 'object' && a.price ? a.price : 0);
        if(name) addonRevMap[name] = (addonRevMap[name]||0) + price;
      });
    }
  });
  var addonKeys = Object.keys(addonRevMap).filter(function(k){ return addonRevMap[k] > 0; });
  addonEl.innerHTML = addonKeys.length ? addonKeys.sort(function(a,b){ return addonRevMap[b]-addonRevMap[a]; }).map(function(name){
    var rev = addonRevMap[name];
    return '<div style="background:#f8f9fb;border:1px solid #e8eaed;border-radius:10px;padding:16px 18px;">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:8px;">' + esc(name) + '</div>' +
      '<div style="font-size:26px;font-weight:700;color:var(--secondary);">' + fmt(rev) + '</div>' +
      '<div style="font-size:12px;color:var(--text-light);">' + fmt(totalRev > 0 ? (rev/totalRev*100) : 0).replace('$','') + '% of total</div>' +
    '</div>';
  }).join('') : '<p style="color:#aaa;font-size:13px;">No add-on revenue recorded yet.</p>';
}

function qbQuickSelect(range) {
  var now = new Date();
  var y = now.getFullYear();
  var from, to;
  if (range === 'thisYear') {
    from = y + '-01-01';
    to = y + '-12-31';
  } else if (range === 'thisQuarter') {
    var qStart = Math.floor(now.getMonth() / 3) * 3;
    var qEnd = qStart + 2;
    from = y + '-' + String(qStart + 1).padStart(2, '0') + '-01';
    var lastDay = new Date(y, qEnd + 1, 0).getDate();
    to = y + '-' + String(qEnd + 1).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
  } else if (range === 'lastQuarter') {
    var curQ = Math.floor(now.getMonth() / 3);
    var lqYear = curQ === 0 ? y - 1 : y;
    var lqStart = curQ === 0 ? 9 : (curQ - 1) * 3;
    var lqEnd = lqStart + 2;
    from = lqYear + '-' + String(lqStart + 1).padStart(2, '0') + '-01';
    var lqLastDay = new Date(lqYear, lqEnd + 1, 0).getDate();
    to = lqYear + '-' + String(lqEnd + 1).padStart(2, '0') + '-' + String(lqLastDay).padStart(2, '0');
  } else if (range === 'lastYear') {
    from = (y - 1) + '-01-01';
    to = (y - 1) + '-12-31';
  }
  if (from) document.getElementById('qbExportFrom').value = from;
  if (to) document.getElementById('qbExportTo').value = to;
}

function qbBuildCategoryLabel(r) {
  var cat = r.category || '';
  var tier = r.tier || '';
  if (cat === 'home_inspection') return 'Home Inspection' + (tier ? ' ' + tier : '');
  if (cat === 'home_health_check') return 'HHC' + (tier ? ' ' + tier : '');
  if (cat === 'new_construction') return 'New Construction' + (tier ? ' ' + tier : '');
  if (cat === 'addon') return (tier || 'Add-On') + ' (Add-On)';
  if (cat === 'bundle_addon') return (tier || 'Add-On') + ' (Add-On)';
  return tier || cat || 'Inspection';
}

function qbExportCSV() {
  var fromVal = document.getElementById('qbExportFrom').value;
  var toVal = document.getElementById('qbExportTo').value;
  var msgEl = document.getElementById('qbExportMsg');

  if (!fromVal || !toVal) {
    msgEl.style.display = 'block';
    msgEl.textContent = 'Please select a date range';
    return;
  }

  var fromDate = qbParseDate(fromVal);
  var toDate = qbParseDate(toVal);
  toDate.setHours(23, 59, 59, 999);

  var inspectionRecordsData = window._hbShared.records || [];
  var recs = inspectionRecordsData.filter(function(r) {
    if (r.payment_status !== 'paid') return false;
    var dateStr = r.inspection_date || r.created_at || '';
    if (!dateStr) return false;
    var d = qbParseDate(dateStr);
    return d >= fromDate && d <= toDate;
  });

  if (recs.length === 0) {
    msgEl.style.display = 'block';
    msgEl.textContent = 'No paid inspections found in this date range';
    return;
  }

  msgEl.style.display = 'none';

  recs.sort(function(a, b) {
    var da = qbParseDate(a.inspection_date || a.created_at || '');
    var db = qbParseDate(b.inspection_date || b.created_at || '');
    return db - da;
  });

  var total = 0;
  var rows = recs.map(function(r) {
    var amt = parseFloat(r.final_total) || 0;
    total += amt;
    var desc = qbBuildCategoryLabel(r) + ' \u2014 ' + (r.cust_name || 'Unknown') + ', ' + (r.address || 'N/A');
    var dateStr = r.inspection_date || r.created_at || '';
    return qbFormatDate(dateStr) + ',"' + desc.replace(/"/g, '""') + '",' + amt.toFixed(2);
  });

  var fromDisplay = qbFormatDate(fromVal);
  var toDisplay = qbFormatDate(toVal);
  var csv = 'Heartland Inspection Group \u2014 Income Export\n' +
    'Date Range: ' + fromDisplay + ' - ' + toDisplay + '\n' +
    'Total Revenue: $' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\n' +
    '\n' +
    'Date,Description,Amount\n' +
    rows.join('\n');

  var today = new Date();
  var filename = 'heartland-income-' + today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0') + '.csv';

  qbDownloadCSV(csv, filename);
}

window.setRevenueRange = setRevenueRange;
window.renderRevenue = renderRevenue;
window.qbQuickSelect = qbQuickSelect;
window.qbExportCSV = qbExportCSV;
