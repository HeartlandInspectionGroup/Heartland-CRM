/**
 * scripts/admin-calendar.js — Admin Calendar View (HEA-76, extracted HEA-240)
 * Month/week/day views for scheduled inspections.
 * Reads: window._hbShared.records (fixed from dead IIFE-local inspectionRecordsData)
 * Uses: DAYS, SHORT, MONTHS, pad(), dateKey(), esc(), addonTierLabel() — all on window.*
 */

var calView = 'month';
var calMonth, calYear, calWeekStart, calDayDate;
var calPopupEl = null;
var calEventsMap = {};

function initCal() {
  var now = new Date();
  calMonth = now.getMonth();
  calYear = now.getFullYear();
  calWeekStart = getWeekStart(now);
  calDayDate = dateKey(now);
}

function getWeekStart(d) {
  var dt = new Date(d);
  dt.setDate(dt.getDate() - dt.getDay());
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function getCalEvents() {
  return (window._hbShared.records || []).filter(function(r) {
    return r.status === 'scheduled' || r.status === 'confirmed';
  });
}

function formatCalType(r) {
  var cat = r.category || '';
  var tier = r.tier || '';
  if (cat === 'home_health_check') return 'HHC' + (tier ? ' \u2014 ' + tier : '');
  if (cat === 'home_inspection') return tier || 'Home Inspection';
  if (cat === 'new_construction') return 'NC' + (tier ? ' \u2014 ' + tier : '');
  if (cat === 'addon') return addonTierLabel(tier) + ' (Add-On)';
  return tier || cat || 'Inspection';
}

function buildPopupHTML(r) {
  var payBadge = r.payment_status === 'paid'
    ? '<span class="cal-popup-badge paid">Paid</span>'
    : '<span class="cal-popup-badge unpaid">Unpaid</span>';
  var agreedLabel = r.signed_agreement ? '\u2713 Signed' : 'Not signed';
  var html = '<div class="cal-popup-name">' + esc(r.cust_name || '\u2014') + '</div>';
  html += '<div class="cal-popup-row"><span class="cal-popup-label">Address</span><span class="cal-popup-value">' + esc(r.address || '\u2014') + '</span></div>';
  html += '<div class="cal-popup-row"><span class="cal-popup-label">Service</span><span class="cal-popup-value">' + esc(formatCalType(r)) + '</span></div>';
  if (r.inspection_time) html += '<div class="cal-popup-row"><span class="cal-popup-label">Time</span><span class="cal-popup-value">' + esc(r.inspection_time) + '</span></div>';
  html += '<div class="cal-popup-row"><span class="cal-popup-label">Payment</span><span class="cal-popup-value">' + payBadge + '</span></div>';
  html += '<div class="cal-popup-row"><span class="cal-popup-label">Agreement</span><span class="cal-popup-value">' + agreedLabel + '</span></div>';
  return html;
}

function calShowPopup(e, rid) {
  calHidePopup();
  var r = calEventsMap[rid];
  if (!r) return;
  var el = document.createElement('div');
  el.className = 'cal-popup';
  el.innerHTML = buildPopupHTML(r);
  document.body.appendChild(el);
  var x = e.clientX || (e.touches && e.touches[0].clientX) || 0;
  var y = e.clientY || (e.touches && e.touches[0].clientY) || 0;
  el.style.left = Math.min(x + 12, window.innerWidth - 320) + 'px';
  el.style.top = Math.min(y + 12, window.innerHeight - el.offsetHeight - 20) + 'px';
  calPopupEl = el;
}

function calHidePopup() {
  if (calPopupEl) { calPopupEl.remove(); calPopupEl = null; }
}

function calSetView(v) {
  calView = v;
  document.querySelectorAll('.cal-view-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.view === v);
  });
  renderCalendar();
}

function calPrev() {
  if (calView === 'month') {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
  } else if (calView === 'week') {
    calWeekStart = new Date(calWeekStart.getFullYear(), calWeekStart.getMonth(), calWeekStart.getDate() - 7);
  } else {
    var parts = calDayDate.split('-');
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2] - 1);
    calDayDate = dateKey(d);
  }
  renderCalendar();
}

function calNext() {
  if (calView === 'month') {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
  } else if (calView === 'week') {
    calWeekStart = new Date(calWeekStart.getFullYear(), calWeekStart.getMonth(), calWeekStart.getDate() + 7);
  } else {
    var parts = calDayDate.split('-');
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2] + 1);
    calDayDate = dateKey(d);
  }
  renderCalendar();
}

function renderCalendar() {
  var container = document.getElementById('calContainer');
  if (!container) return;
  document.querySelectorAll('.cal-view-btn').forEach(function(btn) {
    btn.onclick = function() { calSetView(btn.dataset.view); };
  });
  if (calView === 'month') renderCalMonth(container);
  else if (calView === 'week') renderCalWeek(container);
  else renderCalDay(container);
}

function renderCalMonth(container) {
  var events = getCalEvents();
  calEventsMap = {};
  var byDate = {};
  events.forEach(function(r) {
    var dk = r.inspection_date ? r.inspection_date.substring(0, 10) : null;
    if (!dk) return;
    if (!byDate[dk]) byDate[dk] = [];
    byDate[dk].push(r);
    calEventsMap[r.id] = r;
  });

  var today = dateKey(new Date());
  var first = new Date(calYear, calMonth, 1);
  var startDow = first.getDay();
  var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  var html = '<div class="cal-header">';
  html += '<button onclick="calPrev()">&larr;</button>';
  html += '<span class="cal-title">' + MONTHS[calMonth] + ' ' + calYear + '</span>';
  html += '<button onclick="calNext()">&rarr;</button>';
  html += '</div>';

  html += '<div class="cal-grid">';
  SHORT.forEach(function(d) { html += '<div class="cal-dow">' + d + '</div>'; });

  for (var i = 0; i < startDow; i++) html += '<div class="cal-cell empty"></div>';

  for (var day = 1; day <= daysInMonth; day++) {
    var dk = calYear + '-' + pad(calMonth + 1) + '-' + pad(day);
    var cls = 'cal-cell';
    if (dk === today) cls += ' today';
    var dayEvents = byDate[dk] || [];
    html += '<div class="' + cls + '" onclick="calDayDate=\'' + dk + '\';calSetView(\'day\')">';
    html += '<div class="cal-day">' + day;
    if (dayEvents.length) html += '<span class="cal-count">' + dayEvents.length + '</span>';
    html += '</div>';
    var maxChips = 3;
    for (var j = 0; j < Math.min(dayEvents.length, maxChips); j++) {
      var ev = dayEvents[j];
      html += '<div class="cal-event" onmouseenter="calShowPopup(event,\'' + ev.id + '\')" onmouseleave="calHidePopup()" ontouchstart="calShowPopup(event,\'' + ev.id + '\')" ontouchend="calHidePopup()">' + esc((ev.cust_name || '').substring(0, 18)) + '</div>';
    }
    if (dayEvents.length > maxChips) {
      html += '<div style="font-size:10px;color:var(--text-light);padding-left:6px;">+' + (dayEvents.length - maxChips) + ' more</div>';
    }
    html += '</div>';
  }
  var totalCells = startDow + daysInMonth;
  var remainder = totalCells % 7;
  if (remainder > 0) { for (var k = 0; k < 7 - remainder; k++) html += '<div class="cal-cell empty"></div>'; }
  html += '</div>';
  container.innerHTML = html;
}

function renderCalWeek(container) {
  var events = getCalEvents();
  calEventsMap = {};
  events.forEach(function(r) { calEventsMap[r.id] = r; });

  if (!calWeekStart) calWeekStart = getWeekStart(new Date());
  var today = dateKey(new Date());
  var days = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(calWeekStart.getFullYear(), calWeekStart.getMonth(), calWeekStart.getDate() + i);
    days.push(d);
  }

  var weekEnd = days[6];
  var html = '<div class="cal-header">';
  html += '<button onclick="calPrev()">&larr;</button>';
  html += '<span class="cal-title">' + SHORT[days[0].getDay()] + ' ' + MONTHS[days[0].getMonth()] + ' ' + days[0].getDate() + ' \u2013 ' + SHORT[weekEnd.getDay()] + ' ' + MONTHS[weekEnd.getMonth()] + ' ' + weekEnd.getDate() + ', ' + weekEnd.getFullYear() + '</span>';
  html += '<button onclick="calNext()">&rarr;</button>';
  html += '</div>';

  html += '<div class="cal-week-grid">';
  days.forEach(function(d) {
    var dk = dateKey(d);
    var cls = 'cal-week-header' + (dk === today ? ' today' : '');
    html += '<div class="' + cls + '">' + SHORT[d.getDay()] + ' ' + d.getDate() + '</div>';
  });
  days.forEach(function(d) {
    var dk = dateKey(d);
    var dayEvents = events.filter(function(r) { return r.inspection_date && r.inspection_date.substring(0, 10) === dk; });
    html += '<div class="cal-week-cell" onclick="calDayDate=\'' + dk + '\';calSetView(\'day\')">';
    dayEvents.forEach(function(ev) {
      html += '<div class="cal-event" onmouseenter="calShowPopup(event,\'' + ev.id + '\')" onmouseleave="calHidePopup()" ontouchstart="calShowPopup(event,\'' + ev.id + '\')" ontouchend="calHidePopup()">' + esc(ev.inspection_time || '') + ' ' + esc((ev.cust_name || '').substring(0, 14)) + '</div>';
    });
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function renderCalDay(container) {
  var events = getCalEvents();
  calEventsMap = {};
  events.forEach(function(r) { calEventsMap[r.id] = r; });

  if (!calDayDate) calDayDate = dateKey(new Date());
  var parts = calDayDate.split('-');
  var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);

  var html = '<div class="cal-header">';
  html += '<button onclick="calPrev()">&larr;</button>';
  html += '<span class="cal-title">' + DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + '</span>';
  html += '<button onclick="calNext()">&rarr;</button>';
  html += '</div>';

  var dayEvents = events.filter(function(r) { return r.inspection_date && r.inspection_date.substring(0, 10) === calDayDate; });
  dayEvents.sort(function(a, b) { return (a.inspection_time || '').localeCompare(b.inspection_time || ''); });

  html += '<div class="cal-day-view">';
  html += '<div class="cal-day-header">' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + '</div>';
  if (!dayEvents.length) {
    html += '<div class="cal-day-empty">No inspections scheduled for this day.</div>';
  } else {
    dayEvents.forEach(function(ev) {
      html += '<div class="cal-day-event" onmouseenter="calShowPopup(event,\'' + ev.id + '\')" onmouseleave="calHidePopup()" ontouchstart="calShowPopup(event,\'' + ev.id + '\')" ontouchend="calHidePopup()">';
      html += '<div class="cal-day-time">' + esc(ev.inspection_time || 'TBD') + '</div>';
      html += '<div class="cal-day-info">';
      html += '<div class="cal-day-name">' + esc(ev.cust_name || '\u2014') + '</div>';
      html += '<div class="cal-day-addr">' + esc(ev.address || '\u2014') + '</div>';
      html += '<div class="cal-day-type">' + esc(formatCalType(ev)) + '</div>';
      html += '</div>';
      html += '</div>';
    });
  }
  html += '</div>';
  container.innerHTML = html;
}

window.initCal = initCal;
window.renderCalendar = renderCalendar;
window.calSetView = calSetView;
window.calPrev = calPrev;
window.calNext = calNext;
window.calShowPopup = calShowPopup;
window.calHidePopup = calHidePopup;
