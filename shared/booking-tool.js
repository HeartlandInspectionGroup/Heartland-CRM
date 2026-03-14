/**
 * shared/booking-tool.js
 * Shared calendar, slot, and Geoapify logic for the 4-step inspection booking wizard.
 * Used by: agent-portal.html (apw namespace), inspector-wizard.html (iwb namespace)
 *
 * API:
 *   BookingTool.initCalendar(state)
 *   BookingTool.fetchBusy(state, onComplete)
 *   BookingTool.getSlots(dateStr, state)
 *   BookingTool.renderCalendar(state, ids)
 *   BookingTool.renderTimeSlots(state, ids, onSelect)
 *   BookingTool.initGeoapify(ids, opts)
 *   BookingTool.MONTHS
 *
 * Each function takes a `state` object (apw or iwb) that must have:
 *   state.cfg           — HEARTLAND_CONFIG
 *   state.busyEvents    — array of {start:Date, end:Date}
 *   state.calYear       — current calendar year
 *   state.calMonth      — current calendar month (0-11)
 *   state.selectedDate  — 'YYYY-MM-DD' or null
 *   state.selectedTime  — '10:00 AM' string or null
 *   state.step          — current wizard step (for auto re-render after fetch)
 *   state.calStepIndex  — which step number is the calendar step (apw=2, iwb=2)
 *
 * `ids` object for renderCalendar:
 *   { title, prev, next, days, timeSlots, timeGrid, timeTitle, dateHidden, timeHidden }
 *
 * `ids` object for initGeoapify:
 *   { currentAddrAC, currentAddrHidden, inspAddrAC, inspAddrHidden }
 *
 * `opts` object for initGeoapify:
 *   { onInspSelect(addr, loc), onInspClear(), scopeStyles(bool) }
 *   scopeStyles: inject scoped CSS for the autocomplete dropdowns (needed inside overlays)
 */
window.BookingTool = (function() {

  var MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];

  var GEO_KEY = '5d418eda80154ea2abaf816531ac89d1';

  /* ── Time helpers ── */
  function formatTime(h, m) {
    var ap = h >= 12 ? 'PM' : 'AM';
    return (h % 12 || 12) + ':' + (m < 10 ? '0' + m : m) + ' ' + ap;
  }

  function parseTime(str) {
    var m = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    var h = parseInt(m[1]), min = parseInt(m[2]), ap = m[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return { hour: h, minute: min };
  }

  function getWindows(entry) {
    if (!entry) return [];
    if (Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string') {
      var s = parseTime(entry[0]), e = parseTime(entry[1]);
      return (s && e) ? [{ sH: s.hour, sM: s.minute, eH: e.hour, eM: e.minute }] : [];
    }
    if (Array.isArray(entry) && Array.isArray(entry[0])) {
      return entry.map(function(w) {
        var s = parseTime(w[0]), e = parseTime(w[1]);
        return (s && e) ? { sH: s.hour, sM: s.minute, eH: e.hour, eM: e.minute } : null;
      }).filter(Boolean);
    }
    return [];
  }

  function getDateStr(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* ── Calendar init ── */
  function initCalendar(state) {
    var now = new Date();
    state.calYear  = now.getFullYear();
    state.calMonth = now.getMonth();
  }

  /* ── Busy events fetch ── */
  function fetchBusy(state, onComplete) {
    state.busyEvents = state.busyEvents || [];
    var cfg = state.cfg || {};
    var weeks = cfg.PUBLIC_WEEKS_AHEAD || 4;
    fetch('/.netlify/functions/get-availability?weeks=' + weeks)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        state.busyEvents = (data.busy && data.busy.length)
          ? data.busy.map(function(e) { return { start: new Date(e.start), end: new Date(e.end) }; })
          : [];
        if (onComplete) onComplete();
      })
      .catch(function() {
        state.busyEvents = [];
        if (onComplete) onComplete();
      });
  }

  /* ── Slot generation ── */
  function getSlots(dateStr, state) {
    var cfg = state.cfg || {};
    var d = new Date(dateStr + 'T12:00:00'), dow = d.getDay();
    var ov = cfg.dateOverrides ? cfg.dateOverrides[dateStr] : undefined;
    var entry = (ov !== undefined) ? ov : (cfg.schedule ? cfg.schedule[dow] : null);
    var windows = getWindows(entry);
    if (!windows.length) return [];

    var dur = (cfg.INSPECTION_DURATION_HOURS || 2.5) * 60;
    var step = cfg.SLOT_STEP_MINUTES || 60;
    var slots = [];
    windows.forEach(function(w) {
      var sMin = w.sH * 60 + w.sM, eMin = w.eH * 60 + w.eM;
      for (var t = sMin; t + dur <= eMin; t += step) {
        slots.push({ time: formatTime(Math.floor(t / 60), t % 60), minutes: t });
      }
    });

    if (state.busyEvents && state.busyEvents.length) {
      var tz = cfg.TIMEZONE || 'America/Chicago';
      var fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      var bufMs = (cfg.BUFFER_MINUTES || 0) * 60000;
      slots = slots.filter(function(slot) {
        var h2 = Math.floor(slot.minutes / 60), m2 = slot.minutes % 60;
        var naive = new Date(dateStr + 'T' + String(h2).padStart(2, '0') + ':' + String(m2).padStart(2, '0') + ':00Z');
        var pts = fmt.formatToParts(naive), p = {};
        pts.forEach(function(x) { p[x.type] = x.value; });
        var locMs = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === '24' ? 0 : p.hour), +p.minute, +p.second);
        var off = locMs - naive.getTime();
        var sU = naive.getTime() - off, eU = sU + dur * 60000;
        for (var i = 0; i < state.busyEvents.length; i++) {
          var bS = state.busyEvents[i].start.getTime() - bufMs;
          var bE = state.busyEvents[i].end.getTime() + bufMs;
          if (sU < bE && eU > bS) return false;
        }
        return true;
      });
    }

    var minAdv = (cfg.MIN_ADVANCE_HOURS !== undefined) ? cfg.MIN_ADVANCE_HOURS : 24;
    if (minAdv > 0) {
      var tz2 = cfg.TIMEZONE || 'America/Chicago';
      var fmt2 = new Intl.DateTimeFormat('en-US', {
        timeZone: tz2, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      var cutoff = new Date().getTime() + (minAdv * 3600000);
      slots = slots.filter(function(slot) {
        var h3 = Math.floor(slot.minutes / 60), m3 = slot.minutes % 60;
        var ref = new Date(dateStr + 'T' + String(h3).padStart(2, '0') + ':' + String(m3).padStart(2, '0') + ':00Z');
        var pts2 = fmt2.formatToParts(ref), po = {};
        pts2.forEach(function(p) { po[p.type] = p.value; });
        var loc2 = Date.UTC(+po.year, +po.month - 1, +po.day, +(po.hour === '24' ? 0 : po.hour), +po.minute, +po.second);
        return (ref.getTime() - (loc2 - ref.getTime())) > cutoff;
      });
    }

    return slots;
  }

  /* ── Calendar render ── */
  function renderCalendar(state, ids) {
    if (state.calYear === null || state.calYear === undefined) initCalendar(state);
    var cfg = state.cfg || {};
    var today = new Date(), todayStr = getDateStr(today);
    var maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + (cfg.PUBLIC_WEEKS_AHEAD || 4) * 7);

    var dim = new Date(state.calYear, state.calMonth + 1, 0).getDate();
    var firstDay = new Date(state.calYear, state.calMonth, 1).getDay();

    var titleEl = document.getElementById(ids.title);
    if (titleEl) titleEl.textContent = MONTHS[state.calMonth] + ' ' + state.calYear;

    var prevBtn = document.getElementById(ids.prev);
    var nextBtn = document.getElementById(ids.next);
    if (prevBtn) {
      var cp = state.calYear > today.getFullYear() ||
        (state.calYear === today.getFullYear() && state.calMonth > today.getMonth());
      prevBtn.style.opacity = cp ? '1' : '0.3';
      prevBtn.style.pointerEvents = cp ? 'auto' : 'none';
    }
    if (nextBtn) {
      var cn = state.calYear < maxDate.getFullYear() ||
        (state.calYear === maxDate.getFullYear() && state.calMonth < maxDate.getMonth());
      nextBtn.style.opacity = cn ? '1' : '0.3';
      nextBtn.style.pointerEvents = cn ? 'auto' : 'none';
    }

    var h = '';
    for (var i = 0; i < firstDay; i++) h += '<div class="wiz-cal-cell empty"></div>';
    for (var dd = 1; dd <= dim; dd++) {
      var ds = state.calYear + '-' +
        String(state.calMonth + 1).padStart(2, '0') + '-' +
        String(dd).padStart(2, '0');
      var dObj = new Date(state.calYear, state.calMonth, dd);
      var isPast = dObj < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      var isBeyond = dObj > maxDate;
      var slots = getSlots(ds, state);
      var isAvail = slots.length > 0 && !isPast && !isBeyond;
      var isSel = state.selectedDate === ds;
      var isToday = ds === todayStr;
      var isBook = false;
      if (!isAvail && !isPast && !isBeyond) {
        var dow2 = dObj.getDay();
        var ov2 = cfg.dateOverrides ? cfg.dateOverrides[ds] : undefined;
        var ent2 = (ov2 !== undefined) ? ov2 : (cfg.schedule ? cfg.schedule[dow2] : null);
        if (getWindows(ent2).length > 0) isBook = true;
      }
      var cls = 'wiz-cal-cell';
      if (isSel)        cls += ' selected';
      else if (isAvail) cls += ' available';
      else if (isBook)  cls += ' booked';
      else              cls += ' disabled';
      if (isToday) cls += ' today';
      h += '<div class="' + cls + '" ' + (isAvail ? 'data-date="' + ds + '"' : '') + '>' +
           '<span>' + dd + '</span>' +
           (isAvail && !isSel ? '<div class="wiz-cal-dot"></div>' : '') +
           '</div>';
    }

    var daysEl = document.getElementById(ids.days);
    if (daysEl) {
      daysEl.innerHTML = h;
      daysEl.querySelectorAll('.wiz-cal-cell[data-date]').forEach(function(cell) {
        cell.addEventListener('click', function() {
          state.selectedDate = this.dataset.date;
          state.selectedTime = null;
          if (ids.dateHidden) document.getElementById(ids.dateHidden).value = state.selectedDate;
          if (ids.timeHidden) document.getElementById(ids.timeHidden).value = '';
          renderCalendar(state, ids);
          renderTimeSlots(state, ids, null);
        });
      });
    }
    if (state.selectedDate) renderTimeSlots(state, ids, null);
  }

  /* ── Time slot render ── */
  function renderTimeSlots(state, ids, onSelect) {
    var container = document.getElementById(ids.timeSlots);
    var grid      = document.getElementById(ids.timeGrid);
    var title     = document.getElementById(ids.timeTitle);
    if (!state.selectedDate || !container) return;

    var slots = getSlots(state.selectedDate, state);
    var dObj  = new Date(state.selectedDate + 'T12:00:00');
    if (title) title.textContent = 'Available Times \u2014 ' +
      dObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    if (!slots.length) {
      grid.innerHTML = '<p class="wiz-no-slots">No available time slots for this date.</p>';
    } else {
      grid.innerHTML = slots.map(function(slot) {
        return '<button type="button" class="wiz-time-btn' +
          (state.selectedTime === slot.time ? ' selected' : '') +
          '" data-time="' + slot.time + '">' + slot.time + '</button>';
      }).join('');
      grid.querySelectorAll('.wiz-time-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          state.selectedTime = this.dataset.time;
          if (ids.timeHidden) document.getElementById(ids.timeHidden).value = state.selectedTime;
          grid.querySelectorAll('.wiz-time-btn').forEach(function(b) { b.classList.remove('selected'); });
          this.classList.add('selected');
          if (onSelect) onSelect(state.selectedTime);
        });
      });
    }
    container.style.display = 'block';
  }

  /* ── Geoapify autocomplete ── */
  function initGeoapify(ids, opts) {
    opts = opts || {};

    function init() {
      if (!window.autocomplete || !window.autocomplete.GeocoderAutocomplete) {
        window.addEventListener('load', init);
        return;
      }

      var geoOpts = { lang: 'en', countryCodes: ['us'] };
      var ROCKFORD_BIAS = { lon: -89.0940, lat: 42.2711 }; // Rockford IL service area

      var acCurr = new autocomplete.GeocoderAutocomplete(
        document.getElementById(ids.currentAddrAC),
        GEO_KEY,
        Object.assign({}, geoOpts, { placeholder: '123 Oak St, Rockford, IL' })
      );
      if (acCurr.addBiasByProximity) acCurr.addBiasByProximity(ROCKFORD_BIAS);
      acCurr.on('select', function(loc) {
        document.getElementById(ids.currentAddrHidden).value = loc ? (loc.properties.formatted || '') : '';
      });
      acCurr.on('input', function(val) {
        if (!val) document.getElementById(ids.currentAddrHidden).value = '';
      });

      var acInsp = new autocomplete.GeocoderAutocomplete(
        document.getElementById(ids.inspAddrAC),
        GEO_KEY,
        Object.assign({}, geoOpts, { placeholder: '456 Elm Ave, Rockford, IL' })
      );
      if (acInsp.addBiasByProximity) acInsp.addBiasByProximity(ROCKFORD_BIAS);
      acInsp.on('select', function(loc) {
        if (!loc) return;
        var addr = loc.properties.formatted || '';
        document.getElementById(ids.inspAddrHidden).value = addr;
        if (opts.onInspSelect) opts.onInspSelect(addr, loc);
      });
      acInsp.on('input', function(val) {
        if (!val) {
          document.getElementById(ids.inspAddrHidden).value = '';
          if (opts.onInspClear) opts.onInspClear();
        }
      });

      // Inject scoped dark-navy styles — scopeStyles:true = dark overlay theme
      if (opts.scopeStyles && ids.currentAddrAC && ids.inspAddrAC) {
        var id1 = '#' + ids.currentAddrAC;
        var id2 = '#' + ids.inspAddrAC;
        // sel() builds "id1 .cls, id2 .cls" so BOTH containers get descendant match
        function sel(cls) { return id1 + ' ' + cls + ', ' + id2 + ' ' + cls; }
        var style = document.createElement('style');
        style.textContent =
          /* ── input field ── */
          sel('.geoapify-autocomplete-input') + '{' +
            'background:#1a2a44!important;' +
            'border:1.5px solid rgba(255,255,255,0.15)!important;' +
            'border-radius:8px!important;color:#fff!important;' +
            '-webkit-text-fill-color:#fff!important;caret-color:#fff!important;' +
            "font-family:'Barlow',sans-serif!important;font-size:15px!important;" +
            'padding:11px 14px!important;width:100%!important;' +
            'box-sizing:border-box!important;outline:none!important;box-shadow:none!important;}' +
          sel('.geoapify-autocomplete-input:focus') + '{' +
            'border-color:#27ae60!important;background:#1a2a44!important;' +
            'outline:none!important;box-shadow:none!important;}' +
          sel('.geoapify-autocomplete-input::placeholder') + '{' +
            'color:rgba(255,255,255,0.28)!important;' +
            '-webkit-text-fill-color:rgba(255,255,255,0.28)!important;}' +
          /* ── kill container ring ── */
          sel('.geoapify-autocomplete-input-container') + '{' +
            'border:none!important;outline:none!important;box-shadow:none!important;}' +
          /* ── dropdown list ── */
          sel('.geoapify-autocomplete-items') + '{' +
            'z-index:99999!important;background:#1a2a44!important;' +
            'border:1px solid rgba(255,255,255,0.15)!important;' +
            'border-radius:8px!important;box-shadow:0 8px 24px rgba(0,0,0,0.55)!important;' +
            'margin-top:4px!important;overflow:hidden!important;}' +
          /* ── individual items ── */
          sel('.geoapify-autocomplete-item') + '{' +
            'background:#1a2a44!important;color:#fff!important;' +
            "padding:10px 14px!important;font-family:'Barlow',sans-serif!important;" +
            'font-size:14px!important;cursor:pointer!important;' +
            'border-bottom:1px solid rgba(255,255,255,0.07)!important;}' +
          sel('.geoapify-autocomplete-item:last-child') + '{border-bottom:none!important;}' +
          sel('.geoapify-autocomplete-item:hover') + ',' +
          sel('.geoapify-autocomplete-item.active') + '{' +
            'background:rgba(39,174,96,0.18)!important;color:#fff!important;}' +
          /* ── address text parts — wildcard + all known v3 class variants ── */
          sel('.geoapify-autocomplete-item *') + '{color:#fff!important;-webkit-text-fill-color:#fff!important;}' +
          sel('.geoapify-autocomplete-item .main-part') + '{color:#fff!important;font-weight:600!important;}' +
          sel('.geoapify-autocomplete-item .secondary-part') + '{color:rgba(255,255,255,0.55)!important;font-size:12px!important;}' +
          sel('.geoapify-autocomplete-item .address-main-part') + '{color:#fff!important;font-weight:600!important;}' +
          sel('.geoapify-autocomplete-item .address-secondary-part') + '{color:rgba(255,255,255,0.55)!important;font-size:12px!important;}' +
          /* ── close button & pin icon ── */
          sel('.geoapify-close-btn') + '{color:rgba(255,255,255,0.45)!important;}' +
          sel('.geoapify-close-btn:hover') + '{color:#fff!important;}' +
          sel('svg') + '{stroke:rgba(255,255,255,0.4)!important;fill:none!important;}';
        document.head.appendChild(style);
      }

                  return { acCurr: acCurr, acInsp: acInsp };
    }

    return init();
  }

  return {
    MONTHS:           MONTHS,
    initCalendar:     initCalendar,
    fetchBusy:        fetchBusy,
    getSlots:         getSlots,
    renderCalendar:   renderCalendar,
    renderTimeSlots:  renderTimeSlots,
    initGeoapify:     initGeoapify,
  };

})();
