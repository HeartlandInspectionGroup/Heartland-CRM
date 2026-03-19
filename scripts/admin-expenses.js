/**
 * scripts/admin-expenses.js — Expenses tab (HEA-233)
 * Extracted from admin.html main IIFE.
 * Reads: window._hbShared.sb
 * Uses shared utils from admin-utils.js: mkKpiTile, esc, qbParseDate, qbFormatDate, qbDownloadCSV
 */

var expensesData = [];
var _expensesLoaded = false;

async function loadExpenses() {
  var sb = window._hbShared.sb;
  var { data, error } = await sb.from('expenses').select('*').order('date', { ascending: false });
  if (error) { console.error('loadExpenses error:', error); return; }
  expensesData = data || [];
  _expensesLoaded = true;
  renderExpenses();
}

function renderExpenses() {
  var kpiEl = document.getElementById('expenseKpiGrid');
  var listEl = document.getElementById('expenseListWrap');
  if (!kpiEl || !listEl) return;

  var now = new Date();
  var monthTotal = 0, yearTotal = 0, allTotal = 0;
  expensesData.forEach(function(e) {
    var amt = parseFloat(e.amount) || 0;
    allTotal += amt;
    var d = qbParseDate(e.date);
    if (d.getFullYear() === now.getFullYear()) {
      yearTotal += amt;
      if (d.getMonth() === now.getMonth()) monthTotal += amt;
    }
  });

  function fmt(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  kpiEl.innerHTML =
    mkKpiTile('📋', String(expensesData.length), 'Total Expenses', 'var(--primary)') +
    mkKpiTile('💰', fmt(allTotal), 'All Time', 'var(--secondary)') +
    mkKpiTile('📅', fmt(monthTotal), 'This Month', 'var(--secondary)') +
    mkKpiTile('📆', fmt(yearTotal), 'This Year', 'var(--accent)');

  if (!expensesData.length) {
    listEl.innerHTML = '<p style="color:#aaa;font-size:13px;">No expenses recorded yet. Click "Add Expense" to get started.</p>';
    return;
  }

  var html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
  html += '<thead><tr style="border-bottom:2px solid #e8eaed;text-align:left;">';
  html += '<th style="padding:10px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-light);">Date</th>';
  html += '<th style="padding:10px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-light);">Category</th>';
  html += '<th style="padding:10px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-light);">Amount</th>';
  html += '<th style="padding:10px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-light);">Notes</th>';
  html += '<th style="padding:10px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-light);">Receipt</th>';
  html += '<th style="padding:10px 8px;"></th>';
  html += '</tr></thead><tbody>';

  expensesData.forEach(function(e) {
    var amt = parseFloat(e.amount) || 0;
    var notes = e.notes || '';
    var truncNotes = notes.length > 40 ? notes.substring(0, 40) + '...' : notes;
    var receiptHtml = e.receipt_url
      ? '<a href="' + esc(e.receipt_url) + '" target="_blank"><img src="' + esc(e.receipt_url) + '" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid #e0e0e0;"></a>'
      : '<span style="color:#ccc;">—</span>';

    html += '<tr style="border-bottom:1px solid #f0f0f0;">';
    html += '<td style="padding:10px 8px;">' + qbFormatDate(e.date) + '</td>';
    html += '<td style="padding:10px 8px;">' + esc(e.category) + '</td>';
    html += '<td style="padding:10px 8px;font-weight:700;">$' + amt.toFixed(2) + '</td>';
    html += '<td style="padding:10px 8px;color:var(--text-light);" title="' + esc(notes) + '">' + esc(truncNotes) + '</td>';
    html += '<td style="padding:10px 8px;">' + receiptHtml + '</td>';
    html += '<td style="padding:10px 8px;white-space:nowrap;">';
    html += '<button onclick="openExpenseModal(\'' + e.id + '\')" style="background:none;border:none;color:var(--secondary);cursor:pointer;font-size:12px;font-weight:600;margin-right:8px;">Edit</button>';
    html += '<button onclick="deleteExpense(\'' + e.id + '\')" style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:12px;font-weight:600;">Delete</button>';
    html += '</td></tr>';
  });

  html += '</tbody></table>';
  listEl.innerHTML = html;
}

function openExpenseModal(id) {
  var modal = document.getElementById('expenseModal');
  document.getElementById('expEditId').value = '';
  document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('expCategory').value = '';
  document.getElementById('expAmount').value = '';
  document.getElementById('expNotes').value = '';
  document.getElementById('expReceiptUrl').value = '';
  document.getElementById('expReceiptPreview').style.display = 'none';
  document.getElementById('expReceiptStatus').textContent = '';
  document.getElementById('expenseModalTitle').textContent = 'Add Expense';

  if (id) {
    var exp = expensesData.find(function(e) { return e.id === id; });
    if (exp) {
      document.getElementById('expEditId').value = exp.id;
      document.getElementById('expDate').value = exp.date || '';
      document.getElementById('expCategory').value = exp.category || '';
      document.getElementById('expAmount').value = exp.amount || '';
      document.getElementById('expNotes').value = exp.notes || '';
      document.getElementById('expenseModalTitle').textContent = 'Edit Expense';
      if (exp.receipt_url) {
        document.getElementById('expReceiptUrl').value = exp.receipt_url;
        var preview = document.getElementById('expReceiptPreview');
        preview.src = exp.receipt_url;
        preview.style.display = 'block';
        document.getElementById('expReceiptStatus').textContent = 'Receipt attached';
      }
    }
  }
  modal.classList.add('open');
}

function expPickReceipt() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async function() {
    var file = input.files[0];
    if (!file) return;
    var statusEl = document.getElementById('expReceiptStatus');
    var btnEl = document.getElementById('expReceiptBtn');
    statusEl.textContent = 'Uploading...';
    btnEl.disabled = true;
    try {
      var fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', 'slvlwkcf');
      fd.append('folder', 'heartland/receipts');
      var res = await fetch('https://api.cloudinary.com/v1_1/dmztfzqfm/image/upload', { method: 'POST', body: fd });
      var cData = await res.json();
      if (!cData.secure_url) throw new Error('Upload failed');
      document.getElementById('expReceiptUrl').value = cData.secure_url;
      var preview = document.getElementById('expReceiptPreview');
      preview.src = cData.secure_url;
      preview.style.display = 'block';
      statusEl.textContent = 'Receipt uploaded';
    } catch (err) {
      statusEl.textContent = 'Upload failed: ' + err.message;
    }
    btnEl.disabled = false;
  };
  input.click();
}

async function saveExpense() {
  var dateVal = document.getElementById('expDate').value;
  var catVal = document.getElementById('expCategory').value;
  var amtVal = document.getElementById('expAmount').value;
  var notesVal = document.getElementById('expNotes').value;
  var receiptVal = document.getElementById('expReceiptUrl').value;
  var editId = document.getElementById('expEditId').value;

  if (!dateVal || !catVal || !amtVal) {
    hwAlert('Please fill in Date, Category, and Amount.');
    return;
  }

  var row = {
    date: dateVal,
    category: catVal,
    amount: parseFloat(amtVal),
    notes: notesVal || null,
    receipt_url: receiptVal || null,
  };

  var saveBtn = document.getElementById('expSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    var sb = window._hbShared.sb;
    if (editId) {
      var { error } = await sb.from('expenses').update(row).eq('id', editId);
      if (error) throw error;
    } else {
      var { error } = await sb.from('expenses').insert(row);
      if (error) throw error;
    }
    document.getElementById('expenseModal').classList.remove('open');
    await loadExpenses();
    hwToast(editId ? 'Expense updated' : 'Expense added');
  } catch (err) {
    hwAlert('Error saving expense: ' + err.message);
  }
  saveBtn.disabled = false;
  saveBtn.textContent = 'Save Expense';
}

async function deleteExpense(id) {
  if (!await hwConfirm('Delete this expense? This cannot be undone.', { title: 'Delete Expense', confirmLabel: 'Delete' })) return;
  try {
    var sb = window._hbShared.sb;
    var { error } = await sb.from('expenses').delete().eq('id', id);
    if (error) throw error;
    await loadExpenses();
    hwToast('Expense deleted');
  } catch (err) {
    hwAlert('Error deleting expense: ' + err.message);
  }
}

function expQuickSelect(range) {
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
  if (from) document.getElementById('expExportFrom').value = from;
  if (to) document.getElementById('expExportTo').value = to;
}

function exportExpensesCsv() {
  var fromVal = document.getElementById('expExportFrom').value;
  var toVal = document.getElementById('expExportTo').value;
  var msgEl = document.getElementById('expExportMsg');

  if (!fromVal || !toVal) {
    msgEl.style.display = 'block';
    msgEl.textContent = 'Please select a date range';
    return;
  }

  var fromDate = qbParseDate(fromVal);
  var toDate = qbParseDate(toVal);
  toDate.setHours(23, 59, 59, 999);

  var filtered = expensesData.filter(function(e) {
    var d = qbParseDate(e.date);
    return d >= fromDate && d <= toDate;
  });

  if (filtered.length === 0) {
    msgEl.style.display = 'block';
    msgEl.textContent = 'No expenses found in this date range';
    return;
  }

  msgEl.style.display = 'none';

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
  var csv = 'Heartland Inspection Group \u2014 Expense Export\n' +
    'Date Range: ' + fromDisplay + ' - ' + toDisplay + '\n' +
    'Total Expenses: $' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\n' +
    '\n' +
    'Date,Category,Description,Amount\n' +
    rows.join('\n');

  var today = new Date();
  var filename = 'heartland-expenses-' + today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0') + '.csv';

  qbDownloadCSV(csv, filename);
}

window.loadExpenses = loadExpenses;
window.renderExpenses = renderExpenses;
window.openExpenseModal = openExpenseModal;
window.saveExpense = saveExpense;
window.deleteExpense = deleteExpense;
window.expPickReceipt = expPickReceipt;
window.expQuickSelect = expQuickSelect;
window.exportExpensesCsv = exportExpensesCsv;
// Expose _expensesLoaded for tab handler
window._expensesLoaded = function() { return _expensesLoaded; };
