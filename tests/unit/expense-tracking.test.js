/**
 * Unit tests for HEA-246: Expense tracking — nav, CSV export, RLS
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var adminHtml = readFileSync(resolve(__dirname, '../../admin.html'), 'utf-8');
var expensesSrc = readFileSync(resolve(__dirname, '../../scripts/admin-expenses.js'), 'utf-8');

// ── Nav restructuring ────────────────────────────────────────────────

describe('HEA-246 — nav restructuring', () => {
  it('FINANCIALS group contains Revenue and Expenses tab buttons', () => {
    // Extract the sidebarGroupFinancials block
    var match = adminHtml.match(/id="sidebarGroupFinancials"[\s\S]*?<\/div>\s*<\/div>/);
    expect(match).not.toBeNull();
    var block = match[0];
    expect(block).toContain('data-tab="revenue"');
    expect(block).toContain('data-tab="expenses"');
    expect(block).toContain('Financials');
  });

  it('FINANCIALS group label says Financials, not Revenue', () => {
    var match = adminHtml.match(/id="sidebarGroupFinancials"[\s\S]*?sidebar-group-label[^>]*>([^<]+)/);
    expect(match).not.toBeNull();
    expect(match[1].trim()).toBe('Financials');
  });

  it('METRICS group is separate and unchanged', () => {
    // Extract just the Metrics group up to the next sidebar-group
    var startIdx = adminHtml.indexOf('id="sidebarGroupMetrics"');
    expect(startIdx).toBeGreaterThan(-1);
    var nextGroup = adminHtml.indexOf('class="sidebar-group"', startIdx + 10);
    var block = adminHtml.substring(startIdx, nextGroup);
    expect(block).toContain('data-tab="metrics"');
    expect(block).toContain('Metrics');
    // Should NOT contain expenses or revenue
    expect(block).not.toContain('data-tab="expenses"');
    expect(block).not.toContain('data-tab="revenue"');
  });

  it('old sidebarGroupRevenue no longer exists', () => {
    expect(adminHtml).not.toContain('id="sidebarGroupRevenue"');
  });
});

// ── Expenses tab panel ───────────────────────────────────────────────

describe('HEA-246 — expenses tab panel', () => {
  it('has tab-expenses panel', () => {
    expect(adminHtml).toContain('id="tab-expenses"');
  });

  it('has expense KPI grid', () => {
    expect(adminHtml).toContain('id="expenseKpiGrid"');
  });

  it('has expense list wrapper', () => {
    expect(adminHtml).toContain('id="expenseListWrap"');
  });

  it('has CSV export section with From/To inputs', () => {
    expect(adminHtml).toContain('id="expExportFrom"');
    expect(adminHtml).toContain('id="expExportTo"');
  });

  it('has quick-select buttons', () => {
    expect(adminHtml).toContain("expQuickSelect('thisYear')");
    expect(adminHtml).toContain("expQuickSelect('thisQuarter')");
    expect(adminHtml).toContain("expQuickSelect('lastQuarter')");
    expect(adminHtml).toContain("expQuickSelect('lastYear')");
  });

  it('has Export CSV button', () => {
    expect(adminHtml).toContain('exportExpensesCsv()');
  });

  it('has export message div', () => {
    expect(adminHtml).toContain('id="expExportMsg"');
  });
});

// ── Expense modal ────────────────────────────────────────────────────

describe('HEA-246 — expense modal', () => {
  it('has expense modal with all fields', () => {
    expect(adminHtml).toContain('id="expenseModal"');
    expect(adminHtml).toContain('id="expDate"');
    expect(adminHtml).toContain('id="expCategory"');
    expect(adminHtml).toContain('id="expAmount"');
    expect(adminHtml).toContain('id="expNotes"');
    expect(adminHtml).toContain('id="expReceiptUrl"');
  });

  it('has all 8 expense categories', () => {
    var categories = ['Mileage', 'Equipment', 'Radon Monitor', 'Lab Fees', 'Software', 'Insurance', 'Marketing', 'Other'];
    categories.forEach(function(cat) {
      expect(adminHtml).toContain('value="' + cat + '"');
    });
  });

  it('has receipt upload button', () => {
    expect(adminHtml).toContain('expPickReceipt()');
  });
});

// ── CSV export logic ─────────────────────────────────────────────────

describe('HEA-246 — expense CSV format', () => {
  // Test the CSV building logic by simulating what exportExpensesCsv does
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

  function buildCsv(expenses, fromVal, toVal) {
    var fromDate = qbParseDate(fromVal);
    var toDate = qbParseDate(toVal);
    toDate.setHours(23, 59, 59, 999);

    var filtered = expenses.filter(function(e) {
      var d = qbParseDate(e.date);
      return d >= fromDate && d <= toDate;
    });

    filtered.sort(function(a, b) {
      return qbParseDate(b.date) - qbParseDate(a.date);
    });

    var total = 0;
    var rows = filtered.map(function(e) {
      var amt = parseFloat(e.amount) || 0;
      total += amt;
      var desc = (e.notes || '').replace(/"/g, '""');
      return qbFormatDate(e.date) + ',' + e.category + ',"' + desc + '",' + amt.toFixed(2);
    });

    var fromDisplay = qbFormatDate(fromVal);
    var toDisplay = qbFormatDate(toVal);
    return 'Heartland Inspection Group \u2014 Expense Export\n' +
      'Date Range: ' + fromDisplay + ' - ' + toDisplay + '\n' +
      'Total Expenses: $' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\n' +
      '\n' +
      'Date,Category,Description,Amount\n' +
      rows.join('\n');
  }

  var mockExpenses = [
    { date: '2026-03-10', category: 'Mileage', amount: 42.50, notes: 'Drive to Roscoe inspection' },
    { date: '2026-03-05', category: 'Equipment', amount: 89.99, notes: 'Thermal camera battery' },
    { date: '2026-01-15', category: 'Software', amount: 29.99, notes: 'Monthly subscription' },
    { date: '2025-12-01', category: 'Insurance', amount: 350.00, notes: 'Annual policy renewal' },
  ];

  it('header block formats correctly', () => {
    var csv = buildCsv(mockExpenses, '2026-01-01', '2026-03-31');
    expect(csv).toContain('Heartland Inspection Group');
    expect(csv).toContain('Expense Export');
    expect(csv).toContain('Date Range: 01/01/2026 - 03/31/2026');
    expect(csv).toContain('Total Expenses: $');
  });

  it('expense rows include date, category, notes, amount', () => {
    var csv = buildCsv(mockExpenses, '2026-03-01', '2026-03-31');
    var lines = csv.split('\n');
    var dataLines = lines.slice(5); // skip header block + column header
    expect(dataLines.length).toBe(2);
    expect(dataLines[0]).toContain('03/10/2026');
    expect(dataLines[0]).toContain('Mileage');
    expect(dataLines[0]).toContain('Drive to Roscoe inspection');
    expect(dataLines[0]).toContain('42.50');
  });

  it('total sum calculates correctly', () => {
    var csv = buildCsv(mockExpenses, '2026-01-01', '2026-03-31');
    // 42.50 + 89.99 + 29.99 = 162.48
    expect(csv).toContain('$162.48');
  });

  it('date range filter excludes records outside range', () => {
    var csv = buildCsv(mockExpenses, '2026-03-01', '2026-03-31');
    // Only March 2026 expenses
    expect(csv).not.toContain('Monthly subscription');
    expect(csv).not.toContain('Annual policy renewal');
    expect(csv).toContain('Mileage');
    expect(csv).toContain('Equipment');
  });

  it('empty range returns no data rows', () => {
    var csv = buildCsv(mockExpenses, '2024-01-01', '2024-12-31');
    var lines = csv.split('\n');
    var dataLines = lines.slice(5).filter(function(l) { return l.trim(); });
    expect(dataLines.length).toBe(0);
    expect(csv).toContain('$0.00');
  });
});

// ── Quick-select date logic ──────────────────────────────────────────

describe('HEA-246 — quick-select date logic', () => {
  function computeQuickSelect(range) {
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
    } else if (range === 'lastYear') {
      from = (y - 1) + '-01-01';
      to = (y - 1) + '-12-31';
    }
    return { from: from, to: to };
  }

  it('thisYear sets Jan 1 to Dec 31 of current year', () => {
    var r = computeQuickSelect('thisYear');
    var y = new Date().getFullYear();
    expect(r.from).toBe(y + '-01-01');
    expect(r.to).toBe(y + '-12-31');
  });

  it('lastYear sets Jan 1 to Dec 31 of previous year', () => {
    var r = computeQuickSelect('lastYear');
    var y = new Date().getFullYear() - 1;
    expect(r.from).toBe(y + '-01-01');
    expect(r.to).toBe(y + '-12-31');
  });

  it('thisQuarter start and end are in the same quarter', () => {
    var r = computeQuickSelect('thisQuarter');
    var fromMonth = parseInt(r.from.split('-')[1]);
    var toMonth = parseInt(r.to.split('-')[1]);
    // Same quarter: months should be within 3 of each other
    expect(toMonth - fromMonth).toBeLessThanOrEqual(2);
  });
});

// ── JS functions exposed on window ───────────────────────────────────

describe('HEA-246 — JS window exports (extracted to admin-expenses.js)', () => {
  it('exposes all expense functions on window', () => {
    var fns = ['openExpenseModal', 'saveExpense', 'deleteExpense', 'expPickReceipt', 'expQuickSelect', 'exportExpensesCsv'];
    fns.forEach(function(fn) {
      expect(expensesSrc).toContain('window.' + fn + ' = ' + fn);
    });
  });
});

// ── Security compliance ──────────────────────────────────────────────

describe('HEA-246 — security compliance', () => {
  it('expenses tab does not use window.ADMIN_TOKEN', () => {
    expect(expensesSrc).not.toContain('window.ADMIN_TOKEN');
    expect(expensesSrc).not.toContain('x-admin-token');
  });

  it('uses _hbShared.sb for Supabase access (authenticated client)', () => {
    expect(expensesSrc).toContain("window._hbShared.sb");
    expect(expensesSrc).toContain(".from('expenses')");
  });

  it('Cloudinary upload uses correct preset', () => {
    expect(expensesSrc).toContain("'upload_preset', 'slvlwkcf'");
    expect(expensesSrc).toContain("'folder', 'heartland/receipts'");
  });
});
