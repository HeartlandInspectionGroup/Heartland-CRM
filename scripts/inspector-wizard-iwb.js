/**
 * inspector-wizard-iwb.js
 * Inspector Walk-In Booking (IWB) — 4-step booking overlay.
 *
 * SCOPE RULES (see CLAUDE.md):
 *   GLOBAL — all utility/logic functions, entry points called from onclick
 *   DCL    — only addEventListener bindings + Geoapify init
 *
 * Entry points (must stay global):
 *   openWalkinBooking()
 *   closeWalkinBooking()
 *   openBundleAddonFromPicker()
 *
 * Depends on globals from inspector-wizard.html:
 *   BookingTool, currentInspector, showDraftPicker(),
 *   showBundleAddonScreen(), window.SUPABASE_URL,
 *   window.SUPABASE_ANON_KEY, window.HEARTLAND_CONFIG
 */

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

var iwb = {
  step: 0,
  category: null,
  hiType: null,  hiTypeLabel: null,
  hiSize: null,  hiSizeLabel: null,  hiSizePrice: 0,
  hiYB:   null,  hiYBLabel:   null,  hiYBSurcharge: 0,
  ncPhase: null, ncPhaseLabel: null, ncPhasePrice: 0,
  hhcTier: null, hhcTierLabel: null, hhcTierPrice: 0,
  addons: [],
  coupon: null, couponDiscount: 0,
  total: 0,
  selectedDate: null, selectedTime: null,
  busyEvents: [],
  calYear: null, calMonth: null,  // managed by BookingTool — do not reset
  cfg: null,                       // persists across opens — do not reset
  _acCurr: null, _acInsp: null,   // Geoapify handles set once at DCL — do not reset
};

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — fires from config-loader BEFORE DOMContentLoaded, must be global
// ─────────────────────────────────────────────────────────────────────────────

window.addEventListener('heartland-config-ready', function () {
  iwb.cfg = window.HEARTLAND_CONFIG || {};
  iwbInitCalendar();
  iwbFetchBusy();
}, { once: true });

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINTS
// ─────────────────────────────────────────────────────────────────────────────

function openWalkinBooking() {
  iwbReset();
  iwbGoTo(0);
  document.getElementById('walkinOverlay').style.display = 'flex';
}

function closeWalkinBooking() {
  document.getElementById('walkinOverlay').style.display = 'none';
  showDraftPicker(currentInspector ? currentInspector.name : '');
}

function openBundleAddonFromPicker() {
  document.getElementById('draftPickerOverlay').style.display = 'none';
  currentCategory = 'bundle_addon';
  document.getElementById('category_field').value = 'bundle_addon';
  showBundleAddonScreen();
}

// ─────────────────────────────────────────────────────────────────────────────
// RESET — clears per-booking state; leaves cfg / cal* / _ac* intact
// ─────────────────────────────────────────────────────────────────────────────

function iwbReset() {
  iwb.step = 0;
  iwb.category = null;
  iwb.hiType = null;  iwb.hiTypeLabel = null;
  iwb.hiSize = null;  iwb.hiSizeLabel = null;  iwb.hiSizePrice = 0;
  iwb.hiYB   = null;  iwb.hiYBLabel   = null;  iwb.hiYBSurcharge = 0;
  iwb.ncPhase = null; iwb.ncPhaseLabel = null;  iwb.ncPhasePrice = 0;
  iwb.hhcTier = null; iwb.hhcTierLabel = null;  iwb.hhcTierPrice = 0;
  iwb.addons = []; iwb.coupon = null; iwb.couponDiscount = 0; iwb.total = 0;
  iwb.selectedDate = null; iwb.selectedTime = null;

  ['iwb_firstName','iwb_lastName','iwb_email','iwb_phone','iwb_coupon',
   'iwb_currentAddress','iwb_address','iwb_date','iwb_time'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });

  if (iwb._acCurr) { try { iwb._acCurr.setValue(''); } catch (e) {} }
  if (iwb._acInsp) { try { iwb._acInsp.setValue(''); } catch (e) {} }

  var cm = document.getElementById('iwbCouponMsg');   if (cm)  cm.textContent = '';
  var pp = document.getElementById('iwbPricingPanel'); if (pp) pp.style.display = 'none';
  var sc = document.getElementById('iwbSuccess');      if (sc) sc.style.display = 'none';

  ['iwbErr0','iwbErr1','iwbErr2','iwbErr3'].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.textContent = '';
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

function iwbGoTo(step) {
  iwb.step = step;
  [0,1,2,3].forEach(function (i) {
    var el = document.getElementById('iwbStep' + i);
    if (el) el.style.display = (i === step) ? 'block' : 'none';
  });
  var sc = document.getElementById('iwbSuccess'); if (sc) sc.style.display = 'none';
  iwbUpdateProgress(step);
  if (step === 2) iwbRenderCalendar();
  if (step === 3) iwbRenderReview();
}

function iwbUpdateProgress(step) {
  [0,1,2,3].forEach(function (i) {
    var el = document.querySelector('#iwbProgress .apw-prog-step[data-s="' + i + '"]');
    if (!el) return;
    el.classList.remove('active','done');
    if (i < step) el.classList.add('done');
    else if (i === step) el.classList.add('active');
    if (i < 3) {
      var line = document.getElementById('iwbLine' + i + (i + 1));
      if (line) line.classList.toggle('done', i < step);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR (BookingTool delegates)
// ─────────────────────────────────────────────────────────────────────────────

function iwbInitCalendar() {
  BookingTool.initCalendar(iwb);
}

function iwbFetchBusy() {
  BookingTool.fetchBusy(iwb, function () {
    if (iwb.step === 2) iwbRenderCalendar();
  });
}

function iwbRenderCalendar() {
  BookingTool.renderCalendar(iwb, {
    title:      'iwbCalTitle',
    prev:       'iwbCalPrev',
    next:       'iwbCalNext',
    days:       'iwbCalDays',
    timeSlots:  'iwbTimeSlots',
    timeGrid:   'iwbTimeGrid',
    timeTitle:  'iwbTimeTitle',
    dateHidden: 'iwb_date',
    timeHidden: 'iwb_time',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — PRICING BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function iwbBuildPricingPanel() {
  var cats = [
    { id: 'home-inspection',   icon: '🏠', name: 'Home Inspection',   desc: 'Pre-Purchase · Pre-Listing' },
    { id: 'new-construction',  icon: '🏗️', name: 'New Construction',  desc: 'Pre-Pour · Pre-Drywall · Final' },
    { id: 'home-health-check', icon: '💚', name: 'Home Health Check', desc: 'Standard · Premium · Signature' },
    { id: 'standalone-addon',  icon: '🔬', name: 'Standalone Add-On', desc: 'Radon · Sewer · Mold · Water' },
  ];

  var catGrid = document.getElementById('iwbCatGrid');
  catGrid.innerHTML = cats.map(function (c) {
    return '<button class="apw-cat-btn" data-catid="' + c.id + '">' +
      '<span class="apw-cat-icon">' + c.icon + '</span>' +
      '<span class="apw-cat-name">' + c.name + '</span>' +
      '<span class="apw-cat-desc">' + c.desc + '</span>' +
    '</button>';
  }).join('');

  catGrid.querySelectorAll('.apw-cat-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      catGrid.querySelectorAll('.apw-cat-btn').forEach(function (b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      iwb.category = btn.dataset.catid;
      // reset sub-selections
      iwb.hiType = null;  iwb.hiTypeLabel = null;
      iwb.hiSize = null;  iwb.hiSizeLabel = null;  iwb.hiSizePrice = 0;
      iwb.hiYB   = null;  iwb.hiYBLabel   = null;  iwb.hiYBSurcharge = 0;
      iwb.ncPhase = null; iwb.ncPhaseLabel = null;  iwb.ncPhasePrice = 0;
      iwb.hhcTier = null; iwb.hhcTierLabel = null;  iwb.hhcTierPrice = 0;
      iwb.addons = [];
      iwbShowCategoryPanel(iwb.category);
      iwbCalcTotal();
    });
  });

  iwbBuildHIPanel();
  iwbBuildNCPanel();
  iwbBuildHHCPanel();
  iwbBuildSAPanel();
  iwbBuildAllAddonLists();
}

function iwbShowCategoryPanel(catId) {
  var panelMap = {
    'home-inspection':   'iwbPanelHI',
    'new-construction':  'iwbPanelNC',
    'home-health-check': 'iwbPanelHHC',
    'standalone-addon':  'iwbPanelSA',
  };
  document.getElementById('iwbPricingPanel').style.display = 'block';
  ['iwbPanelHI','iwbPanelNC','iwbPanelHHC','iwbPanelSA'].forEach(function (id) {
    document.getElementById(id).style.display = (id === panelMap[catId]) ? 'block' : 'none';
  });
}

function iwbBuildHIPanel() {
  var cfg    = iwb.cfg || {};
  var P      = cfg.pricing || {};
  var tiers  = (P.homeSizeTiers || []).filter(function (t) { return t.active !== false; });

  var sizeGrid = document.getElementById('iwbHISizeGrid');
  sizeGrid.innerHTML = tiers.map(function (t) {
    return '<button class="apw-size-btn"' +
      ' data-sizeid="'    + t.id + '"' +
      ' data-sizelabel="' + (t.label || '').replace(/"/g, '&quot;') + '"' +
      ' data-sizeprice="' + (t.price || 0) + '">' +
      '<span>' + (t.label || '') + '</span>' +
      '<span class="apw-size-price">$' + (t.price || 0) + '</span>' +
    '</button>';
  }).join('');

  sizeGrid.querySelectorAll('.apw-size-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      sizeGrid.querySelectorAll('.apw-size-btn').forEach(function (b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      iwb.hiSize      = btn.dataset.sizeid;
      iwb.hiSizeLabel = btn.dataset.sizelabel;
      iwb.hiSizePrice = Number(btn.dataset.sizeprice) || 0;
      iwbCalcTotal();
    });
  });

  document.getElementById('iwbHITypeRow').querySelectorAll('.apw-type-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.getElementById('iwbHITypeRow').querySelectorAll('.apw-type-btn').forEach(function (b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      iwb.hiType      = btn.dataset.type;
      iwb.hiTypeLabel = btn.dataset.label;
      iwbCalcTotal();
    });
  });

  var surcharges = cfg.yearBuiltSurcharges || [];
  var ybRow      = document.getElementById('iwbYBRow');
  if (surcharges.length) {
    ybRow.innerHTML = surcharges.map(function (yb, i) {
      var s = yb.surcharge > 0 ? '<span class="apw-yb-surcharge">+$' + yb.surcharge + '</span>' : '';
      return '<button class="apw-yb-pill"' +
        ' data-ybidx="'       + i + '"' +
        ' data-ybsurcharge="' + (yb.surcharge || 0) + '"' +
        ' data-yblabel="'     + (yb.label || '').replace(/"/g, '&quot;') + '">' +
        (yb.label || '') + s +
      '</button>';
    }).join('');
    ybRow.querySelectorAll('.apw-yb-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        ybRow.querySelectorAll('.apw-yb-pill').forEach(function (p) { p.classList.remove('selected'); });
        pill.classList.add('selected');
        iwb.hiYB          = pill.dataset.ybidx;
        iwb.hiYBLabel     = pill.dataset.yblabel;
        iwb.hiYBSurcharge = Number(pill.dataset.ybsurcharge) || 0;
        iwbCalcTotal();
      });
    });
    document.getElementById('iwbYBSection').style.display = 'block';
  } else {
    document.getElementById('iwbYBSection').style.display = 'none';
  }
}

function iwbBuildNCPanel() {
  var cfg     = iwb.cfg || {};
  var ncItems = (cfg.newConstructionItems || []).filter(function (it) { return it.active !== false; });
  var phases  = ncItems.filter(function (it) { return !it.is_bundle; });
  var bundle  = ncItems.find(function (it)  { return  it.is_bundle; }) || null;
  var ncIcons = { 'Pre Pour': '🪨', 'Pre Drywall': '🔨', 'Final Walkthrough': '🏁' };
  var grid    = document.getElementById('iwbNCGrid');

  var items = phases.slice();
  if (bundle) {
    var savings = phases.reduce(function (s, p) { return s + Number(p.price || 0); }, 0) - Number(bundle.price || 0);
    items.push({ id: '__bundle__', name: bundle.name || 'Full Bundle', price: bundle.price || 0, _savings: savings, is_bundle: true });
  }
  if (!items.length) {
    items = [
      { id: 'Pre Pour',          name: 'Pre Pour',          price: 0 },
      { id: 'Pre Drywall',       name: 'Pre Drywall',       price: 0 },
      { id: 'Final Walkthrough', name: 'Final Walkthrough', price: 0 },
    ];
  }

  grid.innerHTML = items.map(function (it) {
    var icon = ncIcons[it.name] || (it.is_bundle ? '📦' : '🏗️');
    var sub  = (it.is_bundle && it._savings > 0)
      ? '<span style="font-size:11px;color:rgba(255,255,255,0.4);">All 3 phases · save $' + it._savings + '</span>'
      : '';
    return '<button class="apw-phase-btn"' +
      ' data-pid="'    + it.id + '"' +
      ' data-plabel="' + (it.name || '').replace(/"/g, '&quot;') + '"' +
      ' data-pprice="' + (it.price || 0) + '">' +
      '<span>' + icon + ' ' + (it.name || '') + (sub ? '<br>' + sub : '') + '</span>' +
      '<span class="apw-phase-price">$' + (it.price || 0) + '</span>' +
    '</button>';
  }).join('');

  grid.querySelectorAll('.apw-phase-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      grid.querySelectorAll('.apw-phase-btn').forEach(function (b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      iwb.ncPhase      = btn.dataset.pid;
      iwb.ncPhaseLabel = btn.dataset.plabel;
      iwb.ncPhasePrice = Number(btn.dataset.pprice) || 0;
      iwbCalcTotal();
    });
  });
}

function iwbBuildHHCPanel() {
  var cfg     = iwb.cfg || {};
  var hcTiers = (cfg.healthCheckTiers || []).filter(function (t) { return t.active !== false; });
  var grid    = document.getElementById('iwbHHCGrid');

  if (!hcTiers.length) {
    grid.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:13px;">No tiers configured.</p>';
    return;
  }

  grid.innerHTML = hcTiers.map(function (t) {
    return '<button class="apw-tier-btn"' +
      ' data-hid="'    + t.id + '"' +
      ' data-hlabel="' + (t.name || '').replace(/"/g, '&quot;') + '"' +
      ' data-hprice="' + (t.price || 0) + '">' +
      '<span>💚 ' + (t.name || '') + '</span>' +
      '<span class="apw-phase-price">$' + (t.price || 0) + '</span>' +
    '</button>';
  }).join('');

  grid.querySelectorAll('.apw-tier-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      grid.querySelectorAll('.apw-tier-btn').forEach(function (b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      iwb.hhcTier      = btn.dataset.hid;
      iwb.hhcTierLabel = btn.dataset.hlabel;
      iwb.hhcTierPrice = Number(btn.dataset.hprice) || 0;
      iwbCalcTotal();
    });
  });
}

function iwbBuildSAPanel() {
  var P      = (iwb.cfg && iwb.cfg.pricing) || {};
  var addons = (P.addonServices || []).filter(function (a) { return a.active !== false; });
  iwbRenderAddonList('iwbSAAddonsList', addons, 'sa');
}

function iwbBuildAllAddonLists() {
  var P      = (iwb.cfg && iwb.cfg.pricing) || {};
  var addons = (P.addonServices || []).filter(function (a) { return a.active !== false; });

  if (!addons.length) {
    ['iwbHIAddonsSection','iwbNCAddonsSection','iwbHHCAddonsSection'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.style.display = 'none';
    });
  } else {
    iwbRenderAddonList('iwbHIAddonsList',  addons, 'hi');
    iwbRenderAddonList('iwbNCAddonsList',  addons, 'nc');
    iwbRenderAddonList('iwbHHCAddonsList', addons, 'hhc');
  }
}

function iwbRenderAddonList(containerId, addons, prefix) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!addons.length) {
    if (container.parentElement) container.parentElement.style.display = 'none';
    return;
  }
  container.innerHTML = addons.map(function (a, i) {
    return '<div class="apw-addon-row"' +
      ' data-prefix="' + prefix + '"' +
      ' data-idx="'    + i + '"' +
      ' data-name="'   + (a.name || '').replace(/"/g, '&quot;') + '"' +
      ' data-price="'  + (a.price || 0) + '">' +
      '<div class="apw-addon-check">✓</div>' +
      '<span class="apw-addon-name">'   + (a.name || '') + '</span>' +
      '<span class="apw-addon-price">+$' + (a.price || 0) + '</span>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.apw-addon-row').forEach(function (row) {
    row.addEventListener('click', function () {
      var name  = row.dataset.name;
      var price = Number(row.dataset.price);
      var idx   = iwb.addons.findIndex(function (a) { return a.name === name; });
      if (idx >= 0) { iwb.addons.splice(idx, 1); row.classList.remove('selected'); }
      else          { iwb.addons.push({ name: name, price: price }); row.classList.add('selected'); }
      iwbCalcTotal();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING CALCULATION
// ─────────────────────────────────────────────────────────────────────────────

function iwbCalcTotal() {
  var base = 0, baseLabel = '';
  if (iwb.category === 'home-inspection')   { base = iwb.hiSizePrice;  baseLabel = [iwb.hiTypeLabel, iwb.hiSizeLabel].filter(Boolean).join(' — '); }
  if (iwb.category === 'new-construction')  { base = iwb.ncPhasePrice; baseLabel = iwb.ncPhaseLabel || ''; }
  if (iwb.category === 'home-health-check') { base = iwb.hhcTierPrice; baseLabel = iwb.hhcTierLabel || ''; }

  var P          = (iwb.cfg && iwb.cfg.pricing) || {};
  var yb         = iwb.hiYBSurcharge || 0;
  var addonTotal = iwb.addons.reduce(function (s, a) { return s + a.price; }, 0);
  var subtotal   = base + yb + addonTotal;

  // Bundle discount — same logic as public booking tool, only for home-inspection
  var discountAmt = 0;
  if (iwb.category === 'home-inspection' && iwb.addons.length > 0) {
    var mainCount   = 1 + iwb.addons.length;
    var maxPct      = P.maxDiscountPct || 50;
    var dTiers      = P.discountTiers  || [];
    var discountPct = 0;
    for (var i = dTiers.length - 1; i >= 0; i--) {
      if (mainCount >= dTiers[i].services) { discountPct = dTiers[i].pct; break; }
    }
    if (discountPct > maxPct) discountPct = maxPct;
    discountAmt = Math.round(subtotal * discountPct / 100);
  }
  iwb.discountAmt = discountAmt;

  var couponAmt = 0;
  if (iwb.coupon) {
    var afterDiscount = subtotal - discountAmt;
    couponAmt = (iwb.coupon.type === 'percent')
      ? Math.round(afterDiscount * iwb.coupon.value / 100)
      : Math.min(iwb.coupon.value, afterDiscount);
  }
  iwb.couponDiscount = couponAmt;
  iwb.total          = subtotal - discountAmt - couponAmt;

  var html = '';
  if (baseLabel) html += '<div class="apw-price-line"><span>' + baseLabel + '</span><span>$' + base + '</span></div>';
  if (yb > 0)    html += '<div class="apw-price-line"><span>Older Home Surcharge (' + (iwb.hiYBLabel || '') + ')</span><span>+$' + yb + '</span></div>';
  iwb.addons.forEach(function (a) {
    html += '<div class="apw-price-line"><span>' + a.name + '</span><span>+$' + a.price + '</span></div>';
  });
  if (discountAmt > 0) {
    html += '<div class="apw-price-line green"><span>Bundle Discount</span><span>-$' + discountAmt + '</span></div>';
  }
  if (couponAmt > 0) {
    html += '<div class="apw-price-line green"><span>Coupon (' + iwb.coupon.code + ')</span><span>-$' + couponAmt + '</span></div>';
  }

  var pl = document.getElementById('iwbPriceLines'); if (pl) pl.innerHTML = html;
  var tt = document.getElementById('iwbTotal');      if (tt) tt.textContent = '$' + iwb.total;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — REVIEW RENDER
// ─────────────────────────────────────────────────────────────────────────────

function iwbRenderReview() {
  var fn = (document.getElementById('iwb_firstName').value      || '').trim();
  var ln = (document.getElementById('iwb_lastName').value       || '').trim();
  var em = (document.getElementById('iwb_email').value          || '').trim();
  var ph = (document.getElementById('iwb_phone').value          || '').trim();
  var ca = (document.getElementById('iwb_currentAddress').value || '').trim();
  var ad = (document.getElementById('iwb_address').value        || '').trim();

  document.getElementById('iwbRevClient').textContent      = [fn + ' ' + ln, em, ph].filter(Boolean).join(' · ');
  document.getElementById('iwbRevCurrentAddr').textContent = ca || '—';
  document.getElementById('iwbRevAddress').textContent     = ad || '—';

  var svcParts = [];
  if (iwb.category === 'home-inspection') {
    if (iwb.hiTypeLabel)  svcParts.push(iwb.hiTypeLabel);
    if (iwb.hiSizeLabel)  svcParts.push(iwb.hiSizeLabel);
    if (iwb.hiYBLabel)    svcParts.push('Built: ' + iwb.hiYBLabel);
  } else if (iwb.category === 'new-construction') {
    if (iwb.ncPhaseLabel) svcParts.push('New Construction — ' + iwb.ncPhaseLabel);
  } else if (iwb.category === 'home-health-check') {
    if (iwb.hhcTierLabel) svcParts.push('Home Health Check — ' + iwb.hhcTierLabel);
  } else if (iwb.category === 'standalone-addon') {
    svcParts.push('Standalone Add-On(s)');
  }
  if (iwb.addons.length) svcParts.push(iwb.addons.map(function (a) { return a.name; }).join(', '));
  document.getElementById('iwbRevService').textContent = svcParts.join(' · ') || '—';

  var dObj  = iwb.selectedDate ? new Date(iwb.selectedDate + 'T12:00:00') : null;
  var dtStr = dObj ? dObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  if (iwb.selectedTime) dtStr += ' at ' + iwb.selectedTime;
  document.getElementById('iwbRevDateTime').textContent = dtStr;

  var base = 0, baseLabel = '';
  if (iwb.category === 'home-inspection')   { base = iwb.hiSizePrice;  baseLabel = [iwb.hiTypeLabel, iwb.hiSizeLabel].filter(Boolean).join(' — '); }
  if (iwb.category === 'new-construction')  { base = iwb.ncPhasePrice; baseLabel = iwb.ncPhaseLabel  || ''; }
  if (iwb.category === 'home-health-check') { base = iwb.hhcTierPrice; baseLabel = iwb.hhcTierLabel  || ''; }

  var yb       = iwb.hiYBSurcharge || 0;
  var addonT   = iwb.addons.reduce(function (s, a) { return s + a.price; }, 0);
  var subtotal = base + yb + addonT;
  var discountAmt = iwb.discountAmt || 0;
  var couponAmt   = iwb.couponDiscount || 0;

  var html = '';
  if (baseLabel)    html += '<div class="apw-price-line"><span>' + baseLabel + '</span><span>$' + base + '</span></div>';
  if (yb > 0)       html += '<div class="apw-price-line"><span>Older Home Surcharge (' + (iwb.hiYBLabel || '') + ')</span><span>+$' + yb + '</span></div>';
  iwb.addons.forEach(function (a) { html += '<div class="apw-price-line"><span>' + a.name + '</span><span>+$' + a.price + '</span></div>'; });
  if (discountAmt > 0) {
    html += '<div class="apw-price-line green"><span>Bundle Discount</span><span>-$' + discountAmt + '</span></div>';
  }
  if (couponAmt > 0 && iwb.coupon) {
    html += '<div class="apw-price-line green"><span>Coupon (' + iwb.coupon.code + ')</span><span>-$' + couponAmt + '</span></div>';
  }

  document.getElementById('iwbRevPriceLines').innerHTML = html;
  iwb.total = subtotal - discountAmt - couponAmt;
  document.getElementById('iwbRevTotal').textContent = '$' + iwb.total;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM EVENT BINDINGS — addEventListener calls only; runs after DOM is ready
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {

  // ── Geoapify address autocomplete ──────────────────────────────────────────
  var geoHandles = BookingTool.initGeoapify(
    {
      currentAddrAC:     'iwbCurrentAddrAC',
      currentAddrHidden: 'iwb_currentAddress',
      inspAddrAC:        'iwbInspAddrAC',
      inspAddrHidden:    'iwb_address',
    },
    { scopeStyles: true }
  );
  if (geoHandles) {
    iwb._acCurr = geoHandles.acCurr;
    iwb._acInsp = geoHandles.acInsp;
  }

  // ── Step 1: Phone formatting ───────────────────────────────────────────────
  var phInput = document.getElementById('iwb_phone');
  if (phInput) {
    phInput.addEventListener('input', function () {
      var d = this.value.replace(/\D/g, '').substring(0, 10);
      var f = '';
      if (d.length > 0) f = '(' + d.substring(0, 3);
      if (d.length >= 3) f += ') ';
      if (d.length > 3)  f += d.substring(3, 6);
      if (d.length >= 6) f += '-' + d.substring(6, 10);
      this.value = f;
    });
  }

  // ── Step 1: Next ──────────────────────────────────────────────────────────
  var next0 = document.getElementById('iwbNext0');
  if (next0) {
    next0.addEventListener('click', function () {
      var fn  = (document.getElementById('iwb_firstName').value      || '').trim();
      var em  = (document.getElementById('iwb_email').value          || '').trim();
      var ca  = (document.getElementById('iwb_currentAddress').value || '').trim();
      var ad  = (document.getElementById('iwb_address').value        || '').trim();
      var err = document.getElementById('iwbErr0');

      if (!fn)                       { err.textContent = 'First name is required.';              return; }
      if (!em || !em.includes('@'))  { err.textContent = 'A valid email is required.';           return; }
      if (!ca)                       { err.textContent = 'Client current address is required.';  return; }
      if (!ad)                       { err.textContent = 'Inspection address is required.';      return; }
      err.textContent = '';

      // Wait for config if not yet loaded, then proceed regardless (buildPricingPanel handles missing keys gracefully)
      if (!iwb.cfg) {
        err.textContent = 'Loading...';
        var poll = setInterval(function () {
          if (iwb.cfg) {
            clearInterval(poll);
            err.textContent = '';
            iwbBuildPricingPanel();
            iwbGoTo(1);
          }
        }, 100);
        setTimeout(function () {
          clearInterval(poll);
          if (!iwb.cfg) {
            err.textContent = 'Could not connect. Please refresh and try again.';
          }
        }, 8000);
      } else {
        iwbBuildPricingPanel();
        iwbGoTo(1);
      }
    });
  }

  // ── Step 2: Next / Back ───────────────────────────────────────────────────
  var next1 = document.getElementById('iwbNext1');
  var back1 = document.getElementById('iwbBack1');
  if (next1) {
    next1.addEventListener('click', function () {
      var err = document.getElementById('iwbErr1');
      if (!iwb.category)  { err.textContent = 'Please select a service category.'; return; }
      if (iwb.category === 'home-inspection') {
        if (!iwb.hiType)  { err.textContent = 'Please select Pre Purchase or Pre Listing.'; return; }
        if (!iwb.hiSize)  { err.textContent = 'Please select a home size.'; return; }
        if (!iwb.hiYB && iwb.cfg && iwb.cfg.yearBuiltSurcharges && iwb.cfg.yearBuiltSurcharges.length) {
          err.textContent = 'Please select a year built range.'; return;
        }
      }
      if (iwb.category === 'new-construction'  && !iwb.ncPhase)       { err.textContent = 'Please select an inspection phase.'; return; }
      if (iwb.category === 'home-health-check' && !iwb.hhcTier)       { err.textContent = 'Please select a tier.'; return; }
      if (iwb.category === 'standalone-addon'  && !iwb.addons.length) { err.textContent = 'Please select at least one add-on.'; return; }
      err.textContent = '';
      iwbGoTo(2);
    });
  }
  if (back1) back1.addEventListener('click', function () { iwbGoTo(0); });

  // ── Step 3: Calendar nav + Next / Back ───────────────────────────────────
  var calPrev = document.getElementById('iwbCalPrev');
  var calNext = document.getElementById('iwbCalNext');
  var next2   = document.getElementById('iwbNext2');
  var back2   = document.getElementById('iwbBack2');

  if (calPrev) calPrev.addEventListener('click', function () {
    if (iwb.calMonth === 0) { iwb.calMonth = 11; iwb.calYear--; } else { iwb.calMonth--; }
    iwbRenderCalendar();
  });
  if (calNext) calNext.addEventListener('click', function () {
    if (iwb.calMonth === 11) { iwb.calMonth = 0; iwb.calYear++; } else { iwb.calMonth++; }
    iwbRenderCalendar();
  });
  if (next2) {
    next2.addEventListener('click', function () {
      var err = document.getElementById('iwbErr2');
      if (!iwb.selectedDate) { err.textContent = 'Please select a date from the calendar.'; return; }
      if (!iwb.selectedTime) { err.textContent = 'Please select a time slot.'; return; }
      err.textContent = '';
      iwbGoTo(3);
    });
  }
  if (back2) back2.addEventListener('click', function () { iwbGoTo(1); });

  // ── Step 4: Coupon apply + Back ───────────────────────────────────────────
  var applyBtn = document.getElementById('iwbApplyCoupon');
  var back3    = document.getElementById('iwbBack3');

  if (applyBtn) {
    applyBtn.addEventListener('click', function () {
      var code  = (document.getElementById('iwb_coupon').value || '').trim().toUpperCase();
      var msgEl = document.getElementById('iwbCouponMsg');
      msgEl.style.color = '#e74c3c';
      if (!code) { msgEl.textContent = 'Enter a coupon code.'; return; }
      var coupons = (iwb.cfg && iwb.cfg.coupons) ? iwb.cfg.coupons : [];
      var match   = coupons.find(function (c) { return c.code.toUpperCase() === code && c.active !== false; });
      if (!match) {
        msgEl.textContent = 'Code not found or inactive.';
        iwb.coupon = null; iwb.couponDiscount = 0;
        iwbRenderReview();
        return;
      }
      iwb.coupon = match;
      msgEl.style.color = '#27ae60';
      msgEl.textContent = (match.type === 'percent') ? match.value + '% off applied!' : '$' + match.value + ' off applied!';
      iwbCalcTotal();
      iwbRenderReview();
    });
  }
  if (back3) back3.addEventListener('click', function () { iwbGoTo(2); });

  // ── Step 4: Submit ────────────────────────────────────────────────────────
  var submitBtn = document.getElementById('iwbSubmitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', async function () {
      var err = document.getElementById('iwbErr3');
      err.textContent = '';
      submitBtn.disabled    = true;
      submitBtn.textContent = '⏳ Sending request...';

      try {
        var firstName = (document.getElementById('iwb_firstName').value      || '').trim();
        var lastName  = (document.getElementById('iwb_lastName').value       || '').trim();
        var email     = (document.getElementById('iwb_email').value          || '').trim().toLowerCase();
        var phone     = (document.getElementById('iwb_phone').value          || '').trim();
        var address   = (document.getElementById('iwb_address').value        || '').trim();
        var date      = document.getElementById('iwb_date').value;
        var time      = document.getElementById('iwb_time').value;

        var base = 0, baseLabel = '';
        if (iwb.category === 'home-inspection')   { base = iwb.hiSizePrice;  baseLabel = [iwb.hiTypeLabel, iwb.hiSizeLabel].filter(Boolean).join(' — '); }
        if (iwb.category === 'new-construction')  { base = iwb.ncPhasePrice; baseLabel = iwb.ncPhaseLabel || ''; }
        if (iwb.category === 'home-health-check') { base = iwb.hhcTierPrice; baseLabel = iwb.hhcTierLabel || ''; }

        var services = [];
        if (baseLabel) services.push({ name: baseLabel, price: base });
        iwb.addons.forEach(function (a) { services.push({ name: a.name, price: a.price }); });

        var booking = {
          data_source:      'inspector_wizard',
          status:           'pending',
          client_name:      (firstName + ' ' + lastName).trim(),
          client_email:     email,
          client_phone:     phone || null,
          property_address: address,
          services:         services,
          base_price:       base,
          addons_total:     iwb.addons.reduce(function (s, a) { return s + a.price; }, 0),
          discount_amount:  iwb.discountAmt || 0,
          coupon_code:      iwb.coupon ? iwb.coupon.code : null,
          coupon_discount:  iwb.couponDiscount || 0,
          final_total:      iwb.total,
          preferred_date:   date || null,
          preferred_time:   time || null,
          agent_id:         null,
        };

        // Calendar payload — forwarded by the function after booking_id is known
        var calPayload = {
          firstName: firstName, lastName: lastName, phone: phone, email: email,
          address: address, date: date, time: time,
          inspectionCategoryName:
            iwb.category === 'home-inspection'   ? 'Home Inspection'   :
            iwb.category === 'new-construction'  ? 'New Construction'  :
            iwb.category === 'home-health-check' ? 'Home Health Check' : 'Add-On',
          services: services, total: iwb.total,
        };

        // Single server-side call — no anon key touches the bookings table
        // Use JWT auth if getAuthHeader is available (V2 wizard), fall back to ADMIN_TOKEN
        var iwbAuthHeaders = typeof getAuthHeader === 'function' ? await getAuthHeader() : {};
        var bRes = await fetch('/.netlify/functions/iwb-submit-booking', {
          method:  'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, iwbAuthHeaders),
          body:    JSON.stringify({ booking: booking, calendar: calPayload }),
        });
        var bData = await bRes.json();
        if (!bRes.ok || !bData.booking_id) throw new Error(bData.error || 'Booking failed');

        // Success state
        [0,1,2,3].forEach(function (i) { var el = document.getElementById('iwbStep' + i); if (el) el.style.display = 'none'; });
        var sc = document.getElementById('iwbSuccess'); if (sc) sc.style.display = 'block';

        var dObj2  = date ? new Date(date + 'T12:00:00') : null;
        var dtDisp = dObj2 ? dObj2.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
        if (time) dtDisp += ' at ' + time;

        var sm = document.getElementById('iwbSuccessMsg');
        if (sm) sm.innerHTML = 'Booking request submitted for <strong>' + (firstName + ' ' + lastName).trim() + '</strong>.' + (dtDisp ? '<br>' + dtDisp : '');

        var goAdmin = document.getElementById('iwbGoAdmin');
        if (goAdmin) goAdmin.addEventListener('click', function () { window.location.href = '/admin.html#bookings'; });

        setTimeout(function () { window.location.href = '/admin.html#bookings'; }, 3000);

      } catch (e) {
        err.textContent       = 'Error: ' + e.message;
        submitBtn.disabled    = false;
        submitBtn.textContent = '🚀 Send Booking Request';
      }
    });
  }

}); // end DOMContentLoaded
