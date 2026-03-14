/**
 * Heartland Home Inspections — Live Availability Calendar
 *
 * Reads weekly schedule + date overrides from Supabase (via HEARTLAND_CONFIG),
 * fetches booked events from the Netlify function proxy,
 * and computes available time slots per day.
 *
 * Config is loaded async; this script waits for the heartland-config-ready event.
 *
 * Public calendar: shows PUBLIC_WEEKS_AHEAD (default 4 weeks).
 * Admin can set overrides up to ADMIN_WEEKS_AHEAD (6 weeks) via admin page.
 */
(function () {
  'use strict';

  function _bootCalendarModule() {
  // ─── LOAD CONFIG ─────────────────────────────────
  if (typeof HEARTLAND_CONFIG === 'undefined') {
    console.error('HEARTLAND_CONFIG not available — calendar disabled');
    return;
  }

  var CFG = HEARTLAND_CONFIG;

  // ─── DERIVED CONFIG ──────────────────────────────
  var FUNCTION_URL   = '/.netlify/functions/spectora-availability';
  var POLL_INTERVAL  = 60000;
  var TZ             = CFG.TIMEZONE || 'America/Chicago';
  var PUBLIC_WEEKS   = CFG.PUBLIC_WEEKS_AHEAD || 4;
  var DAYS_AHEAD     = PUBLIC_WEEKS * 7;
  var SLOT_DURATION_MIN = (CFG.INSPECTION_DURATION_HOURS || 2) * 60;
  var SLOT_STEP_MIN  = CFG.SLOT_STEP_MINUTES || 30;
  var BUFFER_MIN     = CFG.BUFFER_MINUTES || 30;

  var MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];

  // ─── STATE ───────────────────────────────────────
  var bookedEvents = [];
  var availabilityByDate = {};
  var currentMonth, currentYear;
  var pollTimer = null;
  var isLoading = true;
  var hasError = false;

  // ─── DOM REFS ────────────────────────────────────
  var calDaysEl, calTitleEl, calPrevBtn, calNextBtn;
  var slotsPanel;

  // ─── HELPERS ─────────────────────────────────────
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /** Parse "3:00 PM" → { hour: 15, minute: 0 } */
  function parseTimeStr(str) {
    var m = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    var ampm = m[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return { hour: h, minute: min };
  }

  /** Parse a schedule entry into work windows.
   *  Returns array of [startH, startM, endH, endM] or null if closed. */
  function parseScheduleEntry(entry) {
    if (!entry || entry === 'closed') return null;

    // Single window: ["3:00 PM", "8:30 PM"]
    if (Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string') {
      var s = parseTimeStr(entry[0]);
      var e = parseTimeStr(entry[1]);
      if (s && e) return [[s.hour, s.minute, e.hour, e.minute]];
      return null;
    }

    // Multiple windows: [["6:00 AM","8:30 AM"],["3:00 PM","7:00 PM"]]
    if (Array.isArray(entry) && Array.isArray(entry[0])) {
      var windows = [];
      for (var i = 0; i < entry.length; i++) {
        var s2 = parseTimeStr(entry[i][0]);
        var e2 = parseTimeStr(entry[i][1]);
        if (s2 && e2) windows.push([s2.hour, s2.minute, e2.hour, e2.minute]);
      }
      return windows.length > 0 ? windows : null;
    }

    return null;
  }

  /** Get work windows for a date, checking overrides first, then weekly default.
   *  Returns array of [startH, startM, endH, endM] or null. */
  function getWorkWindows(dateKey, dow) {
    // Check date override first
    if (CFG.dateOverrides && CFG.dateOverrides.hasOwnProperty(dateKey)) {
      return parseScheduleEntry(CFG.dateOverrides[dateKey]);
    }
    // Fall back to weekly default
    return parseScheduleEntry(CFG.schedule[dow]);
  }

  function chicagoDate(year, month, day, hour, minute) {
    // Create a JS Date representing a specific clock time in Chicago
    var naive = new Date(year, month, day, hour, minute, 0, 0);
    var localStr = naive.toLocaleString('en-US', { timeZone: TZ });
    var localAsDate = new Date(localStr);
    var browserOffset = naive.getTime() - localAsDate.getTime();
    return new Date(naive.getTime() + browserOffset);
  }

  function toChicagoComponents(date) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    var vals = {};
    for (var i = 0; i < parts.length; i++) {
      vals[parts[i].type] = parseInt(parts[i].value, 10);
    }
    return {
      month:  vals.month - 1,
      day:    vals.day,
      year:   vals.year,
      hour:   vals.hour === 24 ? 0 : vals.hour,
      minute: vals.minute,
    };
  }

  function chicagoDateKey(date) {
    var c = toChicagoComponents(date);
    return c.year + '-' + pad(c.month + 1) + '-' + pad(c.day);
  }

  function chicagoDayOfWeek(date) {
    var dayStr = date.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' });
    var map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[dayStr] !== undefined ? map[dayStr] : date.getDay();
  }

  function formatTime12(date) {
    return date.toLocaleTimeString('en-US', {
      timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true,
    });
  }

  function formatTime24(date) {
    return date.toLocaleTimeString('en-US', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  // ─── FETCH EVENTS ────────────────────────────────
  function fetchEvents() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', FUNCTION_URL, true);
    xhr.timeout = 15000;

    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          bookedEvents = (data.events || []).map(function (e) {
            return { start: new Date(e.start), end: new Date(e.end), summary: e.summary };
          });
          hasError = false;
        } catch (err) {
          console.error('Availability parse error:', err);
          hasError = true;
        }
      } else {
        console.error('Availability fetch status:', xhr.status);
        hasError = true;
      }
      isLoading = false;
      computeAvailability();
      renderCalendar();
    };

    xhr.onerror = function () {
      console.error('Availability fetch network error');
      hasError = true;
      isLoading = false;
      renderCalendar();
    };

    xhr.ontimeout = function () {
      console.error('Availability fetch timeout');
      hasError = true;
      isLoading = false;
      renderCalendar();
    };

    xhr.send();
  }

  // ─── AVAILABILITY ALGORITHM ──────────────────────
  function computeAvailability() {
    availabilityByDate = {};
    var now = new Date();

    for (var d = 0; d < DAYS_AHEAD; d++) {
      var dayDate = new Date(now.getTime() + d * 86400000);
      var dateKey = chicagoDateKey(dayDate);
      var dow     = chicagoDayOfWeek(dayDate);

      // Get work windows (override-aware)
      var windows = getWorkWindows(dateKey, dow);
      if (!windows) continue;

      var comp = toChicagoComponents(dayDate);

      // Blocked intervals = booked events + buffer
      var blocked = [];
      for (var i = 0; i < bookedEvents.length; i++) {
        var ev = bookedEvents[i];
        blocked.push({
          start: new Date(ev.start.getTime() - BUFFER_MIN * 60000),
          end:   new Date(ev.end.getTime()   + BUFFER_MIN * 60000),
        });
      }

      var slots = [];
      var slotDurMs = SLOT_DURATION_MIN * 60000;
      var stepMs    = SLOT_STEP_MIN * 60000;

      // Iterate each work window
      for (var w = 0; w < windows.length; w++) {
        var win = windows[w];
        var dayStart = chicagoDate(comp.year, comp.month, comp.day, win[0], win[1]);
        var dayEnd   = chicagoDate(comp.year, comp.month, comp.day, win[2], win[3]);
        var dayEndMs = dayEnd.getTime();

        var cursor = dayStart.getTime();
        while (cursor + slotDurMs <= dayEndMs) {
          var slotStart = new Date(cursor);
          var slotEnd   = new Date(cursor + slotDurMs);

          // Skip slots within the last-minute booking cutoff
          var minAdvanceMs = ((CFG.MIN_ADVANCE_HOURS !== undefined ? CFG.MIN_ADVANCE_HOURS : 24) * 3600000);
          var cutoffTime = now.getTime() + minAdvanceMs;
          if (slotStart.getTime() < cutoffTime) {
            cursor += stepMs;
            continue;
          }

          var overlaps = false;
          for (var b = 0; b < blocked.length; b++) {
            if (slotStart < blocked[b].end && slotEnd > blocked[b].start) {
              overlaps = true;
              break;
            }
          }

          if (!overlaps) {
            slots.push({
              start:   slotStart,
              end:     slotEnd,
              label:   formatTime12(slotStart) + ' – ' + formatTime12(slotEnd),
              dateKey: dateKey,
              start24: formatTime24(slotStart),
              end24:   formatTime24(slotEnd),
            });
          }
          cursor += stepMs;
        }
      }

      if (slots.length > 0) {
        availabilityByDate[dateKey] = slots;
      }
    }
  }

  // ─── CALENDAR RENDERING ──────────────────────────
  function initCalendar() {
    calDaysEl  = document.getElementById('calendarDays');
    calTitleEl = document.getElementById('calendarMonthTitle');
    calPrevBtn = document.getElementById('calPrev');
    calNextBtn = document.getElementById('calNext');

    if (!calDaysEl || !calTitleEl) return false;

    // Use existing panel or create one
    slotsPanel = document.getElementById('availabilitySlots');
    if (!slotsPanel) {
      var wrapper = calDaysEl.closest('.calendar-wrapper') || calDaysEl.parentNode;
      slotsPanel = document.createElement('div');
      slotsPanel.id = 'availabilitySlots';
      slotsPanel.className = 'availability-slots-panel';
      slotsPanel.style.display = 'none';
      wrapper.parentNode.insertBefore(slotsPanel, wrapper.nextSibling);
    }

    var now  = new Date();
    var comp = toChicagoComponents(now);
    currentMonth = comp.month;
    currentYear  = comp.year;

    // Clone buttons to remove any old listeners
    var newPrev = calPrevBtn.cloneNode(true);
    calPrevBtn.parentNode.replaceChild(newPrev, calPrevBtn);
    calPrevBtn = newPrev;

    var newNext = calNextBtn.cloneNode(true);
    calNextBtn.parentNode.replaceChild(newNext, calNextBtn);
    calNextBtn = newNext;

    calPrevBtn.addEventListener('click', function () {
      currentMonth--;
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      renderCalendar();
      hideSlots();
    });

    calNextBtn.addEventListener('click', function () {
      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      renderCalendar();
      hideSlots();
    });

    return true;
  }

  function renderCalendar() {
    if (!calDaysEl || !calTitleEl) return;

    calTitleEl.textContent = MONTH_NAMES[currentMonth] + ' ' + currentYear;

    var firstDay    = new Date(currentYear, currentMonth, 1).getDay();
    var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    var now         = new Date();
    var todayComp   = toChicagoComponents(now);

    var html = '';

    // Loading
    if (isLoading) {
      html = '<div class="cal-loading" style="grid-column:1/-1;text-align:center;padding:40px 0;color:var(--text-light);">' +
        '<div class="cal-spinner"></div>' +
        '<p style="margin-top:12px;font-size:14px;">Loading live availability…</p></div>';
      calDaysEl.innerHTML = html;
      return;
    }

    // Error (with no cached data)
    if (hasError && bookedEvents.length === 0) {
      html = '<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--text-light);">' +
        '<p style="font-size:15px;margin-bottom:8px;">⚠️ Temporarily unable to load live availability.</p>' +
        '<p style="font-size:13px;">Please call <a href="tel:8153298583" style="color:var(--primary);font-weight:600;">(815) 329-8583</a> to check availability.</p></div>';
      calDaysEl.innerHTML = html;
      return;
    }

    // Empty cells before first day
    for (var i = 0; i < firstDay; i++) {
      html += '<div class="calendar-day empty"></div>';
    }

    for (var d = 1; d <= daysInMonth; d++) {
      var date      = new Date(currentYear, currentMonth, d);
      var dateKey   = currentYear + '-' + pad(currentMonth + 1) + '-' + pad(d);
      var dayOfWeek = date.getDay();
      var isToday   = (d === todayComp.day && currentMonth === todayComp.month && currentYear === todayComp.year);
      var isPast    = date < new Date(todayComp.year, todayComp.month, todayComp.day);

      var slots     = availabilityByDate[dateKey];
      var hasSlots  = slots && slots.length > 0;

      // Check if this is a work day (override-aware)
      var windows   = getWorkWindows(dateKey, dayOfWeek);
      var isWorkDay = !!windows;

      var dayDiff   = Math.floor((date - new Date(todayComp.year, todayComp.month, todayComp.day)) / 86400000);
      var inRange   = dayDiff >= 0 && dayDiff < DAYS_AHEAD;

      var cls       = 'calendar-day';
      var clickable = false;
      var badge     = '';

      if (isToday) cls += ' today';

      if (isPast) {
        cls += ' booked';
      } else if (!inRange) {
        cls += ' empty';
        html += '<div class="' + cls + '" style="color:var(--text-light);opacity:0.4;">' + d + '</div>';
        continue;
      } else if (!isWorkDay) {
        cls += ' sunday';
      } else if (hasSlots) {
        cls += ' available';
        clickable = true;
        badge = '<span class="slot-count-badge">' + slots.length + '</span>';
      } else {
        cls += ' booked';
      }

      if (clickable) {
        html += '<div class="' + cls + '" data-date="' + dateKey + '" role="button" tabindex="0" aria-label="' +
          slots.length + ' slots available on ' + MONTH_NAMES[currentMonth] + ' ' + d + '">' + d + badge + '</div>';
      } else {
        html += '<div class="' + cls + '">' + d + '</div>';
      }
    }

    calDaysEl.innerHTML = html;

    // Attach click listeners
    var availDays = calDaysEl.querySelectorAll('.calendar-day.available');
    for (var a = 0; a < availDays.length; a++) {
      availDays[a].addEventListener('click', handleDayClick);
      availDays[a].addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDayClick.call(this, e); }
      });
    }
  }

  // ─── TIME SLOTS PANEL ────────────────────────────
  function handleDayClick(e) {
    var el      = e.currentTarget;
    var dateKey = el.getAttribute('data-date');
    if (!dateKey) return;

    var slots = availabilityByDate[dateKey];
    if (!slots || slots.length === 0) return;

    // Highlight selected
    var allDays = calDaysEl.querySelectorAll('.calendar-day');
    for (var i = 0; i < allDays.length; i++) allDays[i].classList.remove('selected');
    el.classList.add('selected');

    showSlots(dateKey, slots);
  }

  function showSlots(dateKey, slots) {
    if (!slotsPanel) return;

    var parts       = dateKey.split('-');
    var friendlyDate = MONTH_NAMES[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
    var dayName     = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
                        .toLocaleDateString('en-US', { weekday: 'long' });

    var html = '<div class="slots-header">' +
      '<div class="slots-title-group">' +
      '<h4 class="slots-title">' + dayName + ', ' + friendlyDate + '</h4>' +
      '<p class="slots-subtitle">' + slots.length + ' available time slot' + (slots.length !== 1 ? 's' : '') + '</p>' +
      '</div>' +
      '<button class="slots-close" aria-label="Close time slots" id="slotsClose">&times;</button>' +
      '</div>' +
      '<div class="slots-grid">';

    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var schedulerUrl = 'scheduler.html?date=' + slot.dateKey +
        '&start=' + encodeURIComponent(slot.start24) +
        '&end=' + encodeURIComponent(slot.end24);

      html += '<a class="slot-button" href="' + schedulerUrl + '" ' +
        'data-date="' + friendlyDate + '" data-time="' + formatTime12(slot.start) + '">' +
        '<span class="slot-time">' + slot.label + '</span>' +
        '<span class="slot-cta">Book Now →</span>' +
        '</a>';
    }

    html += '</div>' +
      '<p class="slots-note">Select a time to book directly, or <a href="#contact" style="color:var(--primary);font-weight:600;">send us a message</a> with your preferred time.</p>';

    slotsPanel.innerHTML = html;
    slotsPanel.style.display = 'block';
    slotsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    document.getElementById('slotsClose').addEventListener('click', hideSlots);

    var slotBtns = slotsPanel.querySelectorAll('.slot-button');
    for (var b = 0; b < slotBtns.length; b++) {
      slotBtns[b].addEventListener('click', function (e) {
        var date = this.getAttribute('data-date');
        var time = this.getAttribute('data-time');
        prefillContactForm(date, time);
      });
    }
  }

  function hideSlots() {
    if (slotsPanel) {
      slotsPanel.style.display = 'none';
      slotsPanel.innerHTML = '';
    }
    if (calDaysEl) {
      var sel = calDaysEl.querySelectorAll('.calendar-day.selected');
      for (var i = 0; i < sel.length; i++) sel[i].classList.remove('selected');
    }
  }

  function prefillContactForm(date, time) {
    var topic   = document.getElementById('formTopic');
    var message = document.getElementById('formMessage');
    if (topic)   topic.value   = 'schedule';
    if (message) message.value = "I'd like to schedule an inspection on " + date + " at " + time + ".";
  }

  // ─── CONTACT BANNER ──────────────────────────────
  function injectContactBanner() {
    // Don't inject twice
    if (document.getElementById('booking-contact-banner')) return;

    // Find the calendar section to insert near
    var target = slotsPanel || calDaysEl;
    if (!target || !target.parentNode) return;

    var banner = document.createElement('div');
    banner.id = 'booking-contact-banner';
    banner.style.cssText =
      'background:linear-gradient(135deg,#fef9e7,#fef3cd);' +
      'border:1px solid #f0d060;' +
      'border-radius:10px;' +
      'padding:16px 22px;' +
      'margin:18px 0 8px 0;' +
      'text-align:center;' +
      'font-size:0.95em;' +
      'color:#5a4300;' +
      'line-height:1.55;';
    banner.innerHTML =
      '<strong style="display:block;margin-bottom:4px;">Need a date further out?</strong>' +
      'For bookings more than 4-weeks out, please call, text, or e-mail us to confirm availability.';

    target.parentNode.insertBefore(banner, target.nextSibling);
  }

  // ─── INIT ────────────────────────────────────────
  function boot() {
    if (!initCalendar()) return;
    injectContactBanner();
    fetchEvents();
    pollTimer = setInterval(fetchEvents, POLL_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  } // end _bootCalendarModule

  // Wait for config, or run immediately if already loaded
  if (typeof HEARTLAND_CONFIG !== 'undefined' && HEARTLAND_CONFIG.pricing) {
    _bootCalendarModule();
  } else {
    window.addEventListener('heartland-config-ready', _bootCalendarModule, { once: true });
  }
})();
