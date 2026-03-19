/**
 * scripts/admin-broadcasts.js — Broadcasts tab (HEA-235)
 * Extracted from QC IIFE in admin.html.
 * Uses: esc(), getAuthHeaderLocal(), hwToast(), hwConfirm() (all global)
 * Netlify: send-broadcast
 */

var GOOGLE_REVIEW_URL = 'https://g.page/r/CS4SFR_hU5gaEBM/review';

var BC_DEFAULTS = {
  promotions: {
    label: 'Promotions',
    color: '#15516d',
    icon: '📣',
    subject: '',
    body: '',
    prefilter: null,
  },
  google_review: {
    label: 'Google Review',
    color: '#4285f4',
    icon: '⭐',
    subject: 'How did we do? Leave us a review!',
    body: 'Hi {{first_name}},\n\nThank you so much for choosing Heartland Inspection Group. We hope your inspection experience was a great one!\n\nIf you have a moment, we would truly appreciate it if you could leave us a Google review. It only takes a minute and makes a huge difference for our small business.\n\n' + GOOGLE_REVIEW_URL + '\n\nThank you again — we appreciate your trust!\n\nThe Heartland Inspection Group Team\n(815) 329-8583',
    prefilter: null,
  },
  followup_90: {
    label: '90 Day Follow Up',
    color: '#27ae60',
    icon: '📅',
    subject: 'Checking in — how is everything at home?',
    body: 'Hi {{first_name}},\n\nIt has been about 90 days since your Heartland home inspection at {{address}} — we hope everything is going well!\n\nIf you have any questions about your report, need a contractor referral, or want to schedule any follow-up services, we are here to help.\n\nFeel free to reach out any time.\n\nThe Heartland Inspection Group Team\n(815) 329-8583',
    prefilter: 90,
  },
  reminder_11: {
    label: '11 Month Service Reminder',
    color: '#f59321',
    icon: '🔔',
    subject: 'Time for your annual home check-up!',
    body: 'Hi {{first_name}},\n\nIt is hard to believe it has been nearly a year since your inspection at {{address}}! A lot can change in a home over 12 months.\n\nWe recommend an annual Home Health Check to catch small issues before they become big ones. Our inspectors are ready when you are.\n\nReply to this email or call us at (815) 329-8583 to schedule.\n\nThe Heartland Inspection Group Team',
    prefilter: 335,
  },
};

// Track per-section state
var bcState = {};
Object.keys(BC_DEFAULTS).forEach(function(k) {
  bcState[k] = { selected: {}, dateFrom: '', dateTo: '', subject: BC_DEFAULTS[k].subject, body: BC_DEFAULTS[k].body };
});
// Expose bcState on window so inline oninput= attributes can write to it
window.bcState = bcState;

function renderBroadcasts() {
  var el = document.getElementById('broadcastsWrap');
  if (!el) return;

  var html = '';
  Object.keys(BC_DEFAULTS).forEach(function(type) {
    html += buildBcSection(type);
  });
  html += buildBcHistory();
  el.innerHTML = html;

  // Wire section header clicks via delegation (only once)
  var bcWrap = document.getElementById('broadcastsWrap');
  if (!bcWrap._bcDelegated) {
    bcWrap._bcDelegated = true;
    bcWrap.addEventListener('click', function(e) {
      var hdr = e.target.closest('.bc-section-header[data-bc-type]');
      if (hdr) window.toggleBcSection(hdr.getAttribute('data-bc-type'));
    });
  }

  // Wire up inputs
  Object.keys(BC_DEFAULTS).forEach(function(type) {
    wireBcSection(type);
  });

  loadBcHistory();
}

function getEligibleRecords(type) {
  var submitted = ['submitted','delivered','approved'];
  var records = (window._hbShared && window._hbShared.records) || [];
  var all = records.filter(function(r) { return submitted.indexOf(r.status) !== -1 && r.cust_email; });
  var cfg = BC_DEFAULTS[type];
  var state = bcState[type];

  // Date range filter
  var from = state.dateFrom ? new Date(state.dateFrom + 'T00:00:00') : null;
  var to   = state.dateTo   ? new Date(state.dateTo   + 'T23:59:59') : null;

  // Pre-filter: show records whose inspection date falls within last N days
  if (cfg.prefilter && !state.dateFrom && !state.dateTo) {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cfg.prefilter);
    from = cutoff;
    to   = new Date();
  }

  return all.filter(function(r) {
    if (!r.inspection_date) return false;
    var d = new Date(r.inspection_date + 'T12:00:00');
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });
}

function buildBcSection(type) {
  var cfg   = BC_DEFAULTS[type];
  var state = bcState[type];
  var records = getEligibleRecords(type);
  var isPromo = type === 'promotions';

  var defaultFrom = '';
  var defaultTo   = '';
  if (cfg.prefilter && !state.dateFrom && !state.dateTo) {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cfg.prefilter);
    defaultFrom = cutoff.toISOString().slice(0,10);
    defaultTo   = new Date().toISOString().slice(0,10);
  }
  var fromVal = state.dateFrom || defaultFrom;
  var toVal   = state.dateTo   || defaultTo;

  var html = '<div class="bc-section" id="bc-section-' + type + '" style="border:1.5px solid #e8ecef;border-radius:12px;margin-bottom:24px;overflow:hidden;">';

  // Section header
  html += '<div class="bc-section-header" data-bc-type="' + type + '" style="background:#f8fafc;border-bottom:1px solid #e8ecef;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;">';
  html += '<div style="display:flex;align-items:center;gap:10px;">';
  html += '<span style="font-size:20px;">' + cfg.icon + '</span>';
  html += '<div>';
  html += '<div style="font-size:14px;font-weight:700;color:#1a2530;">' + cfg.label + '</div>';
  html += '</div></div>';
  html += '<span class="bc-chevron" id="bc-chevron-' + type + '" style="font-size:12px;color:#aaa;transition:transform 0.2s;">▼</span>';
  html += '</div>';

  // Section body
  html += '<div class="bc-body" id="bc-body-' + type + '" style="display:none;padding:20px;">';

  // Date range
  html += '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px;">';
  html += '<label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7d8a;">Inspection Date Range</label>';
  html += '<input type="date" id="bc-from-' + type + '" value="' + fromVal + '" style="padding:7px 10px;border:1.5px solid #dde;border-radius:7px;font-size:13px;" onchange="bcDateChange(\'' + type + '\')">';
  html += '<span style="font-size:12px;color:#aaa;">to</span>';
  html += '<input type="date" id="bc-to-' + type + '" value="' + toVal + '" style="padding:7px 10px;border:1.5px solid #dde;border-radius:7px;font-size:13px;" onchange="bcDateChange(\'' + type + '\')">';
  html += '<button onclick="bcClearDates(\'' + type + '\')" style="padding:7px 12px;background:#fff;border:1.5px solid #dde;border-radius:7px;font-size:12px;cursor:pointer;color:#6b7d8a;">Clear</button>';
  html += '</div>';

  // Client cards
  html += '<div style="margin-bottom:16px;">';
  if (isPromo) {
    html += '<div style="display:flex;gap:8px;margin-bottom:10px;">';
    html += '<button onclick="bcSelectAll(\'' + type + '\')" style="padding:6px 14px;background:#15516d;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;">Select All</button>';
    html += '<button onclick="bcDeselectAll(\'' + type + '\')" style="padding:6px 14px;background:#fff;color:#15516d;border:1.5px solid #15516d;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;">Deselect All</button>';
    html += '</div>';
  }

  html += '<div id="bc-cards-' + type + '">';
  if (!records.length) {
    html += '<div style="padding:20px;text-align:center;color:#aaa;font-size:13px;">No eligible clients found for this date range.</div>';
  } else {
    records.forEach(function(r) {
      var dateStr = r.inspection_date ? new Date(r.inspection_date + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
      var isChecked = isPromo ? (state.selected[r.id] !== false) : true;
      html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1.5px solid #e8ecef;border-radius:8px;margin-bottom:8px;background:#fff;">';
      html += '<input type="checkbox" id="bc-chk-' + type + '-' + r.id + '" data-id="' + r.id + '" ' + (isChecked ? 'checked' : '') + ' onchange="bcToggleClient(\'' + type + '\',\'' + r.id + '\',this.checked)" style="width:16px;height:16px;cursor:pointer;accent-color:' + cfg.color + ';">';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="font-size:13px;font-weight:600;color:#1a2530;">' + esc(r.cust_name || '—') + '</div>';
      html += '<div style="font-size:12px;color:#6b7d8a;">' + esc(r.address || r.inspection_address || '—') + '</div>';
      html += '</div>';
      html += '<div style="text-align:right;flex-shrink:0;">';
      html += '<div style="font-size:11px;color:#aaa;">' + dateStr + '</div>';
      html += '<div style="font-size:11px;color:#aaa;">' + esc(r.cust_email || '') + '</div>';
      html += '</div>';
      html += '</div>';
    });
  }
  html += '</div></div>';

  // Subject
  html += '<div style="margin-bottom:12px;">';
  html += '<label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7d8a;margin-bottom:6px;">Subject Line</label>';
  html += '<input type="text" id="bc-subj-input-' + type + '" value="' + esc(state.subject) + '" placeholder="Enter subject..." style="width:100%;padding:10px 12px;border:1.5px solid #dde;border-radius:8px;font-size:13px;font-family:\'Work Sans\',sans-serif;" oninput="bcState[\'' + type + '\'].subject=this.value">';
  html += '</div>';

  // Body
  html += '<div style="margin-bottom:16px;">';
  html += '<label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7d8a;margin-bottom:6px;">Message Body</label>';
  html += '<textarea id="bc-msg-input-' + type + '" rows="8" placeholder="Write your message..." style="width:100%;padding:10px 12px;border:1.5px solid #dde;border-radius:8px;font-size:13px;font-family:\'Work Sans\',sans-serif;resize:vertical;line-height:1.6;" oninput="bcState[\'' + type + '\'].body=this.value">' + esc(state.body) + '</textarea>';
  html += '<div style="font-size:11px;color:#aaa;margin-top:4px;">Use {{first_name}} to personalise. For 90 day and 11 month, {{address}} is also available.</div>';
  html += '</div>';

  // Send button
  html += '<div style="display:flex;align-items:center;gap:12px;">';
  html += '<button id="bc-send-btn-' + type + '" onclick="bcSend(\'' + type + '\')" style="padding:12px 28px;background:' + cfg.color + ';color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:\'Work Sans\',sans-serif;">';
  html += cfg.icon + ' Send ' + cfg.label;
  html += '</button>';
  html += '<span id="bc-send-status-' + type + '" style="font-size:13px;color:#6b7d8a;"></span>';
  html += '</div>';

  html += '</div>'; // end bc-body
  html += '</div>'; // end bc-section
  return html;
}

function buildBcHistory() {
  var html = '<div class="bc-section" id="bc-section-history" style="border:1.5px solid #e8ecef;border-radius:12px;margin-bottom:24px;overflow:hidden;">';
  html += '<div class="bc-section-header" data-bc-type="history" style="background:#f8fafc;border-bottom:1px solid #e8ecef;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;">';
  html += '<div style="display:flex;align-items:center;gap:10px;">';
  html += '<span style="font-size:20px;">📬</span>';
  html += '<div style="font-size:14px;font-weight:700;color:#1a2530;">Send History</div>';
  html += '</div>';
  html += '<span class="bc-chevron" id="bc-chevron-history" style="font-size:12px;color:#aaa;transition:transform 0.2s;">▼</span>';
  html += '</div>';
  html += '<div class="bc-body" id="bc-body-history" style="display:none;padding:20px;">';
  html += '<div id="bc-history-list"><div style="text-align:center;color:#aaa;font-size:13px;padding:20px;">Loading history...</div></div>';
  html += '</div></div>';
  return html;
}

function wireBcSection(type) {
  // Sync textarea value (escaped text needs to be set via JS to avoid HTML entity issues)
  var ta = document.getElementById('bc-msg-input-' + type);
  if (ta) ta.value = bcState[type].body;
  var subj = document.getElementById('bc-subj-input-' + type);
  if (subj) subj.value = bcState[type].subject;
}

function rebuildBcCards(type) {
  var container = document.getElementById('bc-cards-' + type);
  if (!container) return;
  var records = getEligibleRecords(type);
  var cfg     = BC_DEFAULTS[type];
  var state   = bcState[type];
  var isPromo = type === 'promotions';

  if (!records.length) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#aaa;font-size:13px;">No eligible clients found for this date range.</div>';
    return;
  }

  var html = '';
  records.forEach(function(r) {
    var dateStr = r.inspection_date ? new Date(r.inspection_date + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
    var isChecked = isPromo ? (state.selected[r.id] !== false) : true;
    html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1.5px solid #e8ecef;border-radius:8px;margin-bottom:8px;background:#fff;">';
    html += '<input type="checkbox" id="bc-chk-' + type + '-' + r.id + '" data-id="' + r.id + '" ' + (isChecked ? 'checked' : '') + ' onchange="bcToggleClient(\'' + type + '\',\'' + r.id + '\',this.checked)" style="width:16px;height:16px;cursor:pointer;accent-color:' + cfg.color + ';">';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:13px;font-weight:600;color:#1a2530;">' + esc(r.cust_name || '—') + '</div>';
    html += '<div style="font-size:12px;color:#6b7d8a;">' + esc(r.address || r.inspection_address || '—') + '</div>';
    html += '</div>';
    html += '<div style="text-align:right;flex-shrink:0;">';
    html += '<div style="font-size:11px;color:#aaa;">' + dateStr + '</div>';
    html += '<div style="font-size:11px;color:#aaa;">' + esc(r.cust_email || '') + '</div>';
    html += '</div></div>';
  });
  container.innerHTML = html;
}

async function loadBcHistory() {
  var el = document.getElementById('bc-history-list');
  if (!el) return;
  var SUPABASE_URL = 'https://fusravedbksupcsjfzda.supabase.co';
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
  try {
    var res  = await fetch(SUPABASE_URL + '/rest/v1/broadcast_logs?order=created_at.desc&limit=50', {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
    });
    var logs = await res.json();
    if (!logs || !logs.length) {
      el.innerHTML = '<div style="text-align:center;color:#aaa;font-size:13px;padding:20px;">No broadcasts sent yet.</div>';
      return;
    }

    var TYPE_LABELS = { promotions:'Promotions', google_review:'Google Review', followup_90:'90 Day Follow Up', reminder_11:'11 Month Reminder' };
    var TYPE_ICONS  = { promotions:'📣', google_review:'⭐', followup_90:'📅', reminder_11:'🔔' };

    var html = '';
    logs.forEach(function(log) {
      var id       = 'bclog-' + log.id;
      var label    = TYPE_LABELS[log.type] || log.type;
      var icon     = TYPE_ICONS[log.type]  || '📬';
      var dateStr  = log.created_at ? new Date(log.created_at).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) : '—';
      var recips   = Array.isArray(log.recipients) ? log.recipients : [];

      html += '<div style="border:1.5px solid #e8ecef;border-radius:8px;margin-bottom:10px;overflow:hidden;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f8fafc;cursor:pointer;" onclick="toggleBcLog(\'" + id + "\')">';
      html += '<div style="display:flex;align-items:center;gap:10px;">';
      html += '<span>' + icon + '</span>';
      html += '<div>';
      html += '<div style="font-size:13px;font-weight:600;color:#1a2530;">' + esc(log.subject) + '</div>';
      html += '<div style="font-size:11px;color:#6b7d8a;">' + label + ' &middot; ' + (log.recipient_count || 0) + ' sent' + (log.failed_count ? ' &middot; ' + log.failed_count + ' failed' : '') + ' &middot; ' + dateStr + '</div>';
      html += '</div></div>';
      html += '<span style="font-size:11px;color:#aaa;">▼</span>';
      html += '</div>';
      html += '<div id="' + id + '" style="display:none;padding:12px 16px;border-top:1px solid #e8ecef;">';
      if (!recips.length) {
        html += '<div style="font-size:12px;color:#aaa;">No recipient details recorded.</div>';
      } else {
        recips.forEach(function(r) {
          html += '<div style="font-size:12px;color:#444;padding:3px 0;">' + esc(r.name || '') + (r.name ? ' &mdash; ' : '') + esc(r.email) + '</div>';
        });
      }
      html += '</div></div>';
    });
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;color:#e74c3c;font-size:13px;padding:20px;">Could not load history.</div>';
  }
}

window.toggleBcSection = function(type) {
  var body    = document.getElementById('bc-body-' + type);
  var chevron = document.getElementById('bc-chevron-' + type);
  if (!body) return;
  var open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
  if (type === 'history' && !open) loadBcHistory();
};

window.bcDateChange = function(type) {
  bcState[type].dateFrom = document.getElementById('bc-from-' + type).value;
  bcState[type].dateTo   = document.getElementById('bc-to-'   + type).value;
  rebuildBcCards(type);
};

window.bcClearDates = function(type) {
  bcState[type].dateFrom = '';
  bcState[type].dateTo   = '';
  document.getElementById('bc-from-' + type).value = '';
  document.getElementById('bc-to-'   + type).value = '';
  rebuildBcCards(type);
};

window.bcToggleClient = function(type, id, checked) {
  bcState[type].selected[id] = checked;
};

window.bcSelectAll = function(type) {
  var records = getEligibleRecords(type);
  records.forEach(function(r) {
    bcState[type].selected[r.id] = true;
    var chk = document.getElementById('bc-chk-' + type + '-' + r.id);
    if (chk) chk.checked = true;
  });
};

window.bcDeselectAll = function(type) {
  var records = getEligibleRecords(type);
  records.forEach(function(r) {
    bcState[type].selected[r.id] = false;
    var chk = document.getElementById('bc-chk-' + type + '-' + r.id);
    if (chk) chk.checked = false;
  });
};

window.bcSend = async function(type) {
  var state   = bcState[type];
  var cfg     = BC_DEFAULTS[type];
  var records = getEligibleRecords(type);
  var isPromo = type === 'promotions';

  var recipients = records.filter(function(r) {
    if (isPromo) return state.selected[r.id] !== false;
    var chk = document.getElementById('bc-chk-' + type + '-' + r.id);
    return chk ? chk.checked : true;
  }).map(function(r) {
    return { name: r.cust_name || '', email: r.cust_email, address: r.address || r.inspection_address || '' };
  });

  if (!recipients.length) {
    hwToast('No recipients selected.');
    return;
  }

  var subject = document.getElementById('bc-subj-input-' + type).value.trim();
  var body    = document.getElementById('bc-msg-input-' + type).value.trim();

  if (!subject) { hwToast('Please enter a subject line.'); return; }
  if (!body)    { hwToast('Please enter a message body.'); return; }

  if (!await hwConfirm('Send <strong>' + subject + '</strong> to ' + recipients.length + ' recipient' + (recipients.length !== 1 ? 's' : '') + '?', {title:'Send Broadcast', confirmLabel:'Send Now', danger:false})) return;

  var btn    = document.getElementById('bc-send-btn-' + type);
  var status = document.getElementById('bc-send-status-' + type);
  btn.disabled = true;
  btn.textContent = 'Sending...';
  status.textContent = 'Preparing send...';

  var finalRecipients = recipients.map(function(r) {
    return {
      name:  r.name,
      email: r.email,
      body:  body.replace(/\{\{address\}\}/gi, r.address),
    };
  });

  try {
    var res = await fetch('/.netlify/functions/send-broadcast', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaderLocal()) },
      body: JSON.stringify({ type: type, subject: subject, body: body, recipients: finalRecipients }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Send failed');

    status.textContent = '✓ Sent to ' + data.sent + (data.failed ? ' (' + data.failed + ' failed)' : '') + ' recipients';
    status.style.color = '#27ae60';
    btn.textContent = cfg.icon + ' Send ' + cfg.label;
    btn.disabled = false;

    loadBcHistory();

  } catch(err) {
    status.textContent = '✗ Error: ' + err.message;
    status.style.color = '#e74c3c';
    btn.textContent = cfg.icon + ' Send ' + cfg.label;
    btn.disabled = false;
  }
};

window.toggleBcLog = function(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.renderBroadcasts = renderBroadcasts;
