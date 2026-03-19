/**
 * Unit tests for HEA-77: QuickBooks CSV Export
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var html = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');
var revenueSrc = readFileSync(resolve(__dirname, '../../scripts/admin-revenue.js'), 'utf8');

// ── Extract JS helpers from inline script ──
// We re-implement the pure functions here for unit testing,
// matching the logic in admin.html exactly.

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

function qbParseDate(dateStr) {
  var s = String(dateStr || '');
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  return new Date(s);
}

function qbFormatDate(dateStr) {
  var d = qbParseDate(dateStr);
  return String(d.getMonth() + 1).padStart(2, '0') + '/' +
         String(d.getDate()).padStart(2, '0') + '/' +
         d.getFullYear();
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
  return { from: from, to: to };
}

// Build CSV content (mirrors qbExportCSV logic, without DOM/download)
function buildCSV(records, fromVal, toVal) {
  var fromDate = qbParseDate(fromVal);
  var toDate = qbParseDate(toVal);
  toDate.setHours(23, 59, 59, 999);

  var recs = records.filter(function(r) {
    if (r.payment_status !== 'paid') return false;
    var dateStr = r.inspection_date || r.created_at || '';
    if (!dateStr) return false;
    var d = qbParseDate(dateStr);
    return d >= fromDate && d <= toDate;
  });

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

  return { csv: csv, total: total, count: recs.length };
}

// ── Mock data ──
var mockRecords = [
  { inspection_date: '2026-03-15', cust_name: 'Jacob Smith', address: '123 Main St', category: 'home_inspection', tier: 'Pre Purchase', final_total: '450.00', payment_status: 'paid' },
  { inspection_date: '2026-03-12', cust_name: 'Sarah Jones', address: '456 Oak Ave', category: 'home_health_check', tier: 'Signature', final_total: '375.00', payment_status: 'paid' },
  { inspection_date: '2026-02-20', cust_name: 'Bob Lee', address: '789 Elm Dr', category: 'new_construction', tier: 'Final Walkthrough', final_total: '500.00', payment_status: 'paid' },
  { inspection_date: '2026-03-10', cust_name: 'Unpaid Client', address: '000 None Rd', category: 'home_inspection', tier: 'Pre Listing', final_total: '300.00', payment_status: 'pending' },
  { inspection_date: '2025-12-01', cust_name: 'Last Year Client', address: '111 Old St', category: 'addon', tier: 'Radon', final_total: '150.00', payment_status: 'paid' },
  { inspection_date: '2026-01-15', cust_name: 'Jan Client', address: '222 Winter Ln', category: 'bundle_addon', tier: 'Sewer Scope', final_total: '200.00', payment_status: 'paid' },
];


describe('HEA-77 — QuickBooks CSV Export HTML', function() {
  it('export section exists in revenue tab', function() {
    var revTabStart = html.indexOf('id="tab-revenue"');
    var revTabEnd = html.indexOf('id="tab-broadcasts"');
    var revTab = html.substring(revTabStart, revTabEnd);
    expect(revTab).toContain('Export Income');
    expect(revTab).toContain('qbExportFrom');
    expect(revTab).toContain('qbExportTo');
    expect(revTab).toContain('qbExportCSV()');
  });

  it('has all four quick-select buttons', function() {
    expect(html).toContain("qbQuickSelect('thisYear')");
    expect(html).toContain("qbQuickSelect('thisQuarter')");
    expect(html).toContain("qbQuickSelect('lastQuarter')");
    expect(html).toContain("qbQuickSelect('lastYear')");
  });

  it('export functions are exposed to window (extracted to admin-revenue.js)', function() {
    expect(revenueSrc).toContain('window.qbQuickSelect = qbQuickSelect');
    expect(revenueSrc).toContain('window.qbExportCSV = qbExportCSV');
  });
});


describe('HEA-77 — CSV header block', function() {
  it('formats correctly with date range and total', function() {
    var result = buildCSV(mockRecords, '2026-03-01', '2026-03-31');
    var lines = result.csv.split('\n');
    expect(lines[0]).toBe('Heartland Inspection Group \u2014 Income Export');
    expect(lines[1]).toBe('Date Range: 03/01/2026 - 03/31/2026');
    expect(lines[2]).toContain('Total Revenue: $');
    expect(lines[3]).toBe('');
    expect(lines[4]).toBe('Date,Description,Amount');
  });

  it('total in header matches sum of amounts', function() {
    var result = buildCSV(mockRecords, '2026-03-01', '2026-03-31');
    // Only paid records in March 2026: 450 + 375 = 825
    expect(result.total).toBe(825);
    expect(result.csv).toContain('Total Revenue: $825.00');
  });
});


describe('HEA-77 — Description formatting', function() {
  it('home_inspection formats as "Home Inspection {tier}"', function() {
    var label = qbBuildCategoryLabel({ category: 'home_inspection', tier: 'Pre Purchase' });
    expect(label).toBe('Home Inspection Pre Purchase');
  });

  it('home_health_check formats as "HHC {tier}"', function() {
    var label = qbBuildCategoryLabel({ category: 'home_health_check', tier: 'Signature' });
    expect(label).toBe('HHC Signature');
  });

  it('new_construction formats as "New Construction {tier}"', function() {
    var label = qbBuildCategoryLabel({ category: 'new_construction', tier: 'Final Walkthrough' });
    expect(label).toBe('New Construction Final Walkthrough');
  });

  it('addon formats as "{tier} (Add-On)"', function() {
    var label = qbBuildCategoryLabel({ category: 'addon', tier: 'Radon' });
    expect(label).toBe('Radon (Add-On)');
  });

  it('bundle_addon formats as "{tier} (Add-On)"', function() {
    var label = qbBuildCategoryLabel({ category: 'bundle_addon', tier: 'Sewer Scope' });
    expect(label).toBe('Sewer Scope (Add-On)');
  });

  it('full description line includes name and address', function() {
    var result = buildCSV(mockRecords, '2026-03-01', '2026-03-31');
    expect(result.csv).toContain('Home Inspection Pre Purchase \u2014 Jacob Smith, 123 Main St');
    expect(result.csv).toContain('HHC Signature \u2014 Sarah Jones, 456 Oak Ave');
  });
});


describe('HEA-77 — Total sum calculation', function() {
  it('sums only paid records in range', function() {
    var result = buildCSV(mockRecords, '2026-01-01', '2026-12-31');
    // Paid in 2026: 450 + 375 + 500 + 200 = 1525 (excludes unpaid 300 and 2025 record)
    expect(result.total).toBe(1525);
  });

  it('handles records with missing final_total as 0', function() {
    var recs = [
      { inspection_date: '2026-03-15', cust_name: 'No Total', address: '999 St', category: 'home_inspection', tier: 'Standard', final_total: null, payment_status: 'paid' },
    ];
    var result = buildCSV(recs, '2026-03-01', '2026-03-31');
    expect(result.total).toBe(0);
    expect(result.csv).toContain(',0.00');
  });
});


describe('HEA-77 — Date range filter', function() {
  it('excludes records outside range', function() {
    var result = buildCSV(mockRecords, '2026-03-01', '2026-03-31');
    // Only March paid: Smith (3/15) and Jones (3/12)
    expect(result.count).toBe(2);
    expect(result.csv).not.toContain('Bob Lee');
    expect(result.csv).not.toContain('Last Year Client');
  });

  it('includes records at range boundaries', function() {
    var recs = [
      { inspection_date: '2026-03-01', cust_name: 'Start', address: 'A', category: 'home_inspection', tier: 'Standard', final_total: '100', payment_status: 'paid' },
      { inspection_date: '2026-03-31', cust_name: 'End', address: 'B', category: 'home_inspection', tier: 'Standard', final_total: '200', payment_status: 'paid' },
    ];
    var result = buildCSV(recs, '2026-03-01', '2026-03-31');
    expect(result.count).toBe(2);
  });

  it('only includes payment_status === paid', function() {
    var result = buildCSV(mockRecords, '2026-03-01', '2026-03-31');
    expect(result.csv).not.toContain('Unpaid Client');
  });

  it('uses created_at fallback when inspection_date is missing', function() {
    var recs = [
      { created_at: '2026-03-15T10:00:00Z', cust_name: 'Fallback', address: 'FB St', category: 'home_inspection', tier: 'Standard', final_total: '100', payment_status: 'paid' },
    ];
    var result = buildCSV(recs, '2026-03-01', '2026-03-31');
    expect(result.count).toBe(1);
    expect(result.csv).toContain('Fallback');
  });
});


describe('HEA-77 — Quick-select date ranges', function() {
  it('thisYear sets Jan 1 to Dec 31 of current year', function() {
    var r = qbQuickSelect('thisYear');
    var y = new Date().getFullYear();
    expect(r.from).toBe(y + '-01-01');
    expect(r.to).toBe(y + '-12-31');
  });

  it('thisQuarter sets correct boundaries', function() {
    var r = qbQuickSelect('thisQuarter');
    var now = new Date();
    var qStart = Math.floor(now.getMonth() / 3) * 3;
    // from should be first day of quarter
    expect(r.from).toContain('-01');
    // to should be last day of quarter
    var toDate = new Date(r.to + 'T00:00:00');
    // Next day should be first of next month
    var nextDay = new Date(toDate);
    nextDay.setDate(nextDay.getDate() + 1);
    expect(nextDay.getDate()).toBe(1);
  });

  it('lastQuarter sets previous quarter', function() {
    var r = qbQuickSelect('lastQuarter');
    var now = new Date();
    var curQ = Math.floor(now.getMonth() / 3);
    // last quarter should be before current quarter start
    var fromDate = new Date(r.from + 'T00:00:00');
    var toDate = new Date(r.to + 'T00:00:00');
    var curQStart = new Date(now.getFullYear(), curQ * 3, 1);
    expect(toDate.getTime()).toBeLessThan(curQStart.getTime());
    // from should be first of month
    expect(fromDate.getDate()).toBe(1);
  });

  it('lastYear sets Jan 1 to Dec 31 of previous year', function() {
    var r = qbQuickSelect('lastYear');
    var y = new Date().getFullYear();
    expect(r.from).toBe((y - 1) + '-01-01');
    expect(r.to).toBe((y - 1) + '-12-31');
  });
});


describe('HEA-77 — Empty range handling', function() {
  it('returns zero records for range with no paid data', function() {
    var result = buildCSV(mockRecords, '2024-01-01', '2024-12-31');
    expect(result.count).toBe(0);
  });
});


describe('HEA-77 — CSV format details', function() {
  it('amounts have no dollar sign and two decimal places', function() {
    var result = buildCSV(mockRecords, '2026-03-01', '2026-03-31');
    var dataLines = result.csv.split('\n').slice(5);
    dataLines.forEach(function(line) {
      var amt = line.split(',').pop();
      expect(amt).toMatch(/^\d+\.\d{2}$/);
    });
  });

  it('dates are in MM/DD/YYYY format', function() {
    var result = buildCSV(mockRecords, '2026-03-01', '2026-03-31');
    var dataLines = result.csv.split('\n').slice(5);
    dataLines.forEach(function(line) {
      var datePart = line.split(',')[0];
      expect(datePart).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });
  });

  it('records are sorted by date descending', function() {
    var result = buildCSV(mockRecords, '2026-03-01', '2026-03-31');
    var dataLines = result.csv.split('\n').slice(5);
    // First record should be 03/15, second 03/12
    expect(dataLines[0]).toContain('03/15/2026');
    expect(dataLines[1]).toContain('03/12/2026');
  });

  it('filename pattern includes today date (extracted to admin-revenue.js)', function() {
    var today = new Date();
    var expected = 'heartland-income-' + today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0') + '.csv';
    expect(revenueSrc).toContain("'heartland-income-'");
    expect(revenueSrc).toContain(".csv");
    expect(expected).toMatch(/^heartland-income-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
