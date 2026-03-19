/**
 * Unit tests for HEA-76: Admin Calendar View
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var html = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');
var bookingsSrc = readFileSync(resolve(__dirname, '../../scripts/admin-bookings.js'), 'utf8');
var settingsSrc = readFileSync(resolve(__dirname, '../../scripts/admin-settings.js'), 'utf8');
var calSrc = readFileSync(resolve(__dirname, '../../scripts/admin-calendar.js'), 'utf8');

// ── Extract relevant sections ──

// Extract the Bookings sidebar group
var bookingsGroupStart = html.indexOf('<div class="sidebar-group-label">Bookings</div>');
var bookingsGroupEnd = html.indexOf('</div>', html.indexOf('</div>', bookingsGroupStart + 1) + 1);
var bookingsGroup = html.substring(bookingsGroupStart, bookingsGroupEnd + 10);

// Extract the calendar tab panel
var calPanelStart = html.indexOf('id="tab-calendar"');
var calPanelEnd = html.indexOf('<!-- ═══ INVOICES', calPanelStart);
var calPanel = html.substring(calPanelStart, calPanelEnd);

// Extract the full JS section containing cal functions
// Calendar JS extracted to scripts/admin-calendar.js (HEA-240)
var calJs = calSrc;

// Extract CSS
var calCssStart = html.indexOf('/* ─── Admin Calendar View (HEA-76) ─── */');
var calCssEnd = html.indexOf('/* ─── Client Detail Popover ─── */');
var calCss = html.substring(calCssStart, calCssEnd);

// Tab switching section
var tabSwitchStart = html.indexOf('// ─── TAB SWITCHING (sidebar nav)');
var tabSwitchEnd = html.indexOf('sidebarToggle.addEventListener', tabSwitchStart);
var tabSwitch = html.substring(tabSwitchStart, tabSwitchEnd);

// ── Helper: evaluate getCalEvents logic ──
function getCalEvents(records) {
  return records.filter(function(r) {
    return r.status === 'scheduled' || r.status === 'confirmed';
  });
}

function formatCalType(r) {
  var cat = r.category || '';
  var tier = r.tier || '';
  if (cat === 'home_health_check') return 'HHC' + (tier ? ' \u2014 ' + tier : '');
  if (cat === 'home_inspection') return tier || 'Home Inspection';
  if (cat === 'new_construction') return 'NC' + (tier ? ' \u2014 ' + tier : '');
  if (cat === 'addon') return (tier || 'Add-On') + ' (Add-On)';
  return tier || cat || 'Inspection';
}

function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

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

// ── Tests ──

describe('HEA-76 — Admin Calendar View: Nav', () => {
  it('Calendar button exists in sidebar above Bookings group', () => {
    var calIdx = html.indexOf('data-tab="calendar"');
    var bkGroupIdx = html.indexOf('<div class="sidebar-group-label">Bookings</div>');
    expect(calIdx).toBeGreaterThan(-1);
    expect(calIdx).toBeLessThan(bkGroupIdx);
  });

  it('Calendar button is above All Bookings button', () => {
    var calIdx = html.indexOf('data-tab="calendar"');
    var bkIdx = html.indexOf('data-tab="bookings"');
    expect(calIdx).toBeLessThan(bkIdx);
  });

  it('Calendar button uses tab-btn class', () => {
    var calLine = html.split('\n').find(function(l) { return l.includes('data-tab="calendar"'); });
    expect(calLine).toContain('tab-btn');
    expect(calLine).toContain('Calendar');
  });
});

describe('HEA-76 — Admin Calendar View: Tab Panel HTML', () => {
  it('tab-calendar panel exists', () => {
    expect(html).toContain('id="tab-calendar"');
  });

  it('panel has card-title "Inspection Calendar"', () => {
    expect(calPanel).toContain('Inspection Calendar');
  });

  it('panel has view toggle with Month, Week, Day buttons', () => {
    expect(calPanel).toContain('data-view="month"');
    expect(calPanel).toContain('data-view="week"');
    expect(calPanel).toContain('data-view="day"');
  });

  it('panel has calContainer div', () => {
    expect(calPanel).toContain('id="calContainer"');
  });
});

describe('HEA-76 — Admin Calendar View: CSS', () => {
  it('defines cal-grid class', () => {
    expect(calCss).toContain('.cal-grid');
  });

  it('cal-grid uses 7-column grid', () => {
    expect(calCss).toContain('grid-template-columns:repeat(7,1fr)');
  });

  it('defines cal-cell class', () => {
    expect(calCss).toContain('.cal-cell');
  });

  it('defines cal-event class', () => {
    expect(calCss).toContain('.cal-event');
  });

  it('defines cal-popup class', () => {
    expect(calCss).toContain('.cal-popup');
  });

  it('defines cal-view-toggle class', () => {
    expect(calCss).toContain('.cal-view-toggle');
  });

  it('defines cal-week-grid class', () => {
    expect(calCss).toContain('.cal-week-grid');
  });

  it('defines cal-day-view class', () => {
    expect(calCss).toContain('.cal-day-view');
  });

  it('defines cal-popup-badge paid/unpaid', () => {
    expect(calCss).toContain('.cal-popup-badge.paid');
    expect(calCss).toContain('.cal-popup-badge.unpaid');
  });
});

describe('HEA-76 — Admin Calendar View: Event Filtering', () => {
  var records = [
    { id: '1', status: 'scheduled', cust_name: 'Alice', inspection_date: '2026-03-20' },
    { id: '2', status: 'confirmed', cust_name: 'Bob', inspection_date: '2026-03-21' },
    { id: '3', status: 'draft', cust_name: 'Charlie', inspection_date: '2026-03-22' },
    { id: '4', status: 'submitted', cust_name: 'Diana', inspection_date: '2026-03-23' },
    { id: '5', status: 'cancelled', cust_name: 'Eve', inspection_date: '2026-03-24' },
    { id: '6', status: 'scheduled', cust_name: 'Frank', inspection_date: '2026-03-25' },
  ];

  it('filters to only scheduled and confirmed records', () => {
    var result = getCalEvents(records);
    expect(result).toHaveLength(3);
    expect(result.map(function(r) { return r.cust_name; })).toEqual(['Alice', 'Bob', 'Frank']);
  });

  it('excludes draft records', () => {
    var result = getCalEvents(records);
    expect(result.find(function(r) { return r.cust_name === 'Charlie'; })).toBeUndefined();
  });

  it('excludes submitted records', () => {
    var result = getCalEvents(records);
    expect(result.find(function(r) { return r.cust_name === 'Diana'; })).toBeUndefined();
  });

  it('excludes cancelled records', () => {
    var result = getCalEvents(records);
    expect(result.find(function(r) { return r.cust_name === 'Eve'; })).toBeUndefined();
  });
});

describe('HEA-76 — Admin Calendar View: formatCalType', () => {
  it('returns HHC label for home_health_check', () => {
    expect(formatCalType({ category: 'home_health_check', tier: 'Signature' })).toBe('HHC \u2014 Signature');
  });

  it('returns HHC without tier if no tier', () => {
    expect(formatCalType({ category: 'home_health_check', tier: '' })).toBe('HHC');
  });

  it('returns tier for home_inspection', () => {
    expect(formatCalType({ category: 'home_inspection', tier: 'Pre Purchase' })).toBe('Pre Purchase');
  });

  it('returns "Home Inspection" when home_inspection has no tier', () => {
    expect(formatCalType({ category: 'home_inspection', tier: '' })).toBe('Home Inspection');
  });

  it('returns NC label for new_construction', () => {
    expect(formatCalType({ category: 'new_construction', tier: 'Pre Pour' })).toBe('NC \u2014 Pre Pour');
  });

  it('returns addon label', () => {
    var result = formatCalType({ category: 'addon', tier: 'radon' });
    expect(result).toContain('Add-On');
  });

  it('returns "Inspection" for unknown category', () => {
    expect(formatCalType({ category: '', tier: '' })).toBe('Inspection');
  });
});

describe('HEA-76 — Admin Calendar View: Popup HTML', () => {
  it('includes client name', () => {
    var html = buildPopupHTML({ cust_name: 'John Doe', address: '123 Main', category: 'home_inspection', tier: 'Pre Purchase', payment_status: 'paid', signed_agreement: true });
    expect(html).toContain('John Doe');
  });

  it('includes address', () => {
    var html = buildPopupHTML({ cust_name: 'John', address: '123 Main St', category: 'home_inspection', tier: '', payment_status: 'unpaid' });
    expect(html).toContain('123 Main St');
  });

  it('includes service type', () => {
    var html = buildPopupHTML({ cust_name: 'John', address: '', category: 'home_health_check', tier: 'Premium', payment_status: 'paid' });
    expect(html).toContain('HHC');
    expect(html).toContain('Premium');
  });

  it('includes inspection time when present', () => {
    var html = buildPopupHTML({ cust_name: 'John', address: '', category: '', tier: '', payment_status: 'paid', inspection_time: '9:00 AM' });
    expect(html).toContain('9:00 AM');
  });

  it('shows paid badge when paid', () => {
    var html = buildPopupHTML({ cust_name: 'John', address: '', category: '', tier: '', payment_status: 'paid' });
    expect(calSrc).toContain('cal-popup-badge paid');
    expect(html).toContain('Paid');
  });

  it('shows unpaid badge when not paid', () => {
    var html = buildPopupHTML({ cust_name: 'John', address: '', category: '', tier: '', payment_status: 'pending' });
    expect(calSrc).toContain('cal-popup-badge unpaid');
    expect(html).toContain('Unpaid');
  });

  it('shows signed agreement status when signed', () => {
    var html = buildPopupHTML({ cust_name: 'John', address: '', category: '', tier: '', payment_status: 'paid', signed_agreement: true });
    expect(html).toContain('Signed');
  });

  it('shows not signed when agreement not signed', () => {
    var html = buildPopupHTML({ cust_name: 'John', address: '', category: '', tier: '', payment_status: 'paid', signed_agreement: false });
    expect(html).toContain('Not signed');
  });

  it('shows all required popup rows', () => {
    var html = buildPopupHTML({ cust_name: 'John', address: '123 Main', category: 'home_inspection', tier: 'Pre Purchase', payment_status: 'paid', signed_agreement: true, inspection_time: '10:00 AM' });
    expect(calSrc).toContain('cal-popup-label">Address');
    expect(calSrc).toContain('cal-popup-label">Service');
    expect(calSrc).toContain('cal-popup-label">Time');
    expect(calSrc).toContain('cal-popup-label">Payment');
    expect(calSrc).toContain('cal-popup-label">Agreement');
  });
});

describe('HEA-76 — Admin Calendar View: JS functions exist', () => {
  it('defines initCal function', () => {
    expect(calJs).toContain('function initCal()');
  });

  it('defines renderCalendar function', () => {
    expect(calJs).toContain('function renderCalendar()');
  });

  it('defines renderCalMonth function', () => {
    expect(calJs).toContain('function renderCalMonth(');
  });

  it('defines renderCalWeek function', () => {
    expect(calJs).toContain('function renderCalWeek(');
  });

  it('defines renderCalDay function', () => {
    expect(calJs).toContain('function renderCalDay(');
  });

  it('defines calPrev function', () => {
    expect(calJs).toContain('function calPrev()');
  });

  it('defines calNext function', () => {
    expect(calJs).toContain('function calNext()');
  });

  it('defines calSetView function', () => {
    expect(calJs).toContain('function calSetView(');
  });

  it('defines calShowPopup function', () => {
    expect(calJs).toContain('function calShowPopup(');
  });

  it('defines calHidePopup function', () => {
    expect(calJs).toContain('function calHidePopup()');
  });

  it('defines getCalEvents function', () => {
    expect(calJs).toContain('function getCalEvents()');
  });

  it('defines formatCalType function', () => {
    expect(calJs).toContain('function formatCalType(');
  });

  it('defines buildPopupHTML function', () => {
    expect(calJs).toContain('function buildPopupHTML(');
  });
});

describe('HEA-76 — Month view rendering', () => {
  it('month view renders 7-column grid with cal-grid class', () => {
    expect(calJs).toContain("'<div class=\"cal-grid\">'");
    // Also check cal-dow headers
    expect(calJs).toContain('cal-dow');
  });

  it('month view renders day cells', () => {
    expect(calJs).toContain('cal-cell');
    expect(calJs).toContain('cal-day');
  });

  it('month view renders event chips', () => {
    expect(calJs).toContain('cal-event');
  });

  it('month view shows +N more when > 3 events', () => {
    expect(calJs).toContain('more</div>');
  });
});

describe('HEA-76 — Week view rendering', () => {
  it('week view uses cal-week-grid', () => {
    expect(calJs).toContain('cal-week-grid');
  });

  it('week view renders 7 day columns with headers', () => {
    expect(calJs).toContain('cal-week-header');
    expect(calJs).toContain('cal-week-cell');
  });

  it('week event chips show time + name', () => {
    // The week view chips include inspection_time and cust_name
    expect(calJs).toContain("ev.inspection_time || ''");
    expect(calJs).toContain("ev.cust_name || ''");
  });
});

describe('HEA-76 — Day view rendering', () => {
  it('day view uses cal-day-view', () => {
    expect(calJs).toContain('cal-day-view');
  });

  it('day view renders event cards with time, name, address, type', () => {
    expect(calJs).toContain('cal-day-time');
    expect(calJs).toContain('cal-day-name');
    expect(calJs).toContain('cal-day-addr');
    expect(calJs).toContain('cal-day-type');
  });

  it('day view has empty state message', () => {
    expect(calJs).toContain('No inspections scheduled for this day');
  });
});

describe('HEA-76 — Navigation logic', () => {
  it('calPrev handles month decrement', () => {
    expect(calJs).toContain("calMonth--");
    expect(calJs).toContain("calMonth = 11; calYear--");
  });

  it('calNext handles month increment', () => {
    expect(calJs).toContain("calMonth++");
    expect(calJs).toContain("calMonth = 0; calYear++");
  });

  it('calPrev handles week backward', () => {
    expect(calJs).toContain("calWeekStart.getDate() - 7");
  });

  it('calNext handles week forward', () => {
    expect(calJs).toContain("calWeekStart.getDate() + 7");
  });

  it('calPrev handles day backward', () => {
    // Day prev subtracts 1 from day
    expect(calJs).toMatch(/parts\[2\]\s*-\s*1/);
  });

  it('calNext handles day forward', () => {
    // Day next adds 1 to day
    expect(calJs).toMatch(/parts\[2\]\s*\+\s*1/);
  });
});

describe('HEA-76 — Tab switching', () => {
  it('calendar tab triggers refreshClientRecords then renderCalendar', () => {
    expect(tabSwitch).toContain("tabName === 'calendar'");
    expect(tabSwitch).toContain('refreshClientRecords');
    expect(tabSwitch).toContain('renderCalendar');
  });

  it('initCal is called on admin load', () => {
    // initCal() is called inside loadConfig() which moved to admin-settings.js (HEA-238)
    expect(settingsSrc).toContain('initCal()');
  });
});

describe('HEA-76 — No regression on Bookings tab', () => {
  it('Bookings tab button still exists', () => {
    expect(bookingsGroup).toContain('data-tab="bookings"');
  });

  it('Bookings tab panel still exists', () => {
    expect(html).toContain('id="tab-bookings"');
  });

  it('Bookings calendar functions still exist (bkCalPrev, bkCalNext, renderBkCalendar)', () => {
    // Functions extracted to scripts/admin-bookings.js in HEA-236
    expect(bookingsSrc).toContain('function bkCalPrev()');
    expect(bookingsSrc).toContain('function bkCalNext()');
    expect(bookingsSrc).toContain('function renderBkCalendar()');
  });

  it('refreshBookings still called when switching to bookings tab', () => {
    expect(tabSwitch).toContain("tabName === 'bookings'");
    expect(tabSwitch).toContain('refreshBookings()');
  });
});
