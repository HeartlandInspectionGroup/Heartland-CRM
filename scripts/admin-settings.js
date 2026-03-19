/**
 * scripts/admin-settings.js — Settings + Pricing + loadConfig/saveConfig (HEA-238)
 * Extracted from admin.html main IIFE.
 * loadConfig() is the startup hub that feeds data to every other tab.
 * saveConfig() writes all pricing/settings back to the database.
 */

var scheduleData = [];
var overridesData = [];
var categoriesData = [];
var yearBuiltData = [];
var newConData = [];
var healthCheckData = [];
var recommendationsData = [];
var _uid = 0;
function uid() { return 'svc_' + (++_uid) + '_' + Date.now().toString(36); }
var selDate = null;
var ocMonth, ocYear;

// ─── LOAD CONFIG FROM SUPABASE ────────────────────
async function loadConfig(){
  var sb = window._hbShared.sb;
  try {
    // Fetch all tables in parallel
    var [settingsRes, scheduleRes, overridesRes, baseRes, addonRes, tiersRes, discRes, couponsRes, catRes, ybRes, ncRes, hcRes, recRes, bookingsRes, agentsRes, contractorsRes, clientsRes, inspRecRes, invoicesRes, waiverVersionsRes, waiverSigsRes] = await Promise.all([
      sb.from('settings').select('*').single(),
      sb.from('schedule').select('*').order('dow'),
      sb.from('date_overrides').select('*').order('date_key'),
      sb.from('base_services').select('*').order('sort_order'),
      sb.from('addon_services').select('*').order('sort_order'),
      sb.from('home_size_tiers').select('*').order('sort_order'),
      sb.from('discount_tiers').select('*').order('sort_order'),
      sb.from('coupons').select('*').order('id'),
      sb.from('inspection_categories').select('*').order('sort_order'),
      sb.from('year_built_surcharges').select('*').order('sort_order'),
      sb.from('new_construction_items').select('*').order('sort_order'),
      sb.from('health_check_tiers').select('*').order('sort_order'),
      sb.from('service_recommendations').select('*').order('sort_order'),
      sb.from('bookings').select('*').order('created_at', { ascending: false }),
      sb.from('agents').select('id,name,email,phone,company,role,active,portal_token'),
      sb.from('contractors').select('*').order('sort_order'),
      sb.from('clients').select('*').order('created_at', { ascending: false }),
      sb.from('inspection_records').select('*').order('inspection_date', { ascending: false }),
      sb.from('invoices').select('*, invoice_line_items(*), payments(*)').order('created_at', { ascending: false }),
      fetch('https://fusravedbksupcsjfzda.supabase.co' + '/rest/v1/waiver_versions?order=created_at.desc&select=*', { headers: { 'apikey': window.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY } }).then(function(r){ return r.json().then(function(d){ return { data: Array.isArray(d) ? d : (console.warn('waiver_versions load error', d), []), error: null }; }); }),
      fetch('https://fusravedbksupcsjfzda.supabase.co' + '/rest/v1/waiver_signatures?order=signed_at.desc&select=*', { headers: { 'apikey': window.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY } }).then(function(r){ return r.json().then(function(d){ return { data: Array.isArray(d) ? d : (console.warn('waiver_signatures load error', d), []), error: null }; }); })
    ]);

    var s = settingsRes.data;

    // Build schedule object {0: null, 1: ["3:00 PM","8:30 PM"], ...}
    var schedule = {};
    (scheduleRes.data || []).forEach(function(row){
      if(!row.windows){ schedule[row.dow] = null; }
      else if(row.windows.length === 1){ schedule[row.dow] = row.windows[0]; }
      else { schedule[row.dow] = row.windows; }
    });
    scheduleData = scheduleRes.data || [];

    // Build dateOverrides object {"2026-02-20": ["9:00 AM","5:00 PM"], ...}
    var dateOverrides = {};
    (overridesRes.data || []).forEach(function(row){
      var key = row.date_key;
      if(typeof key === 'string' && key.length > 10) key = key.substring(0, 10); // trim time
      if(!row.windows){ dateOverrides[key] = null; }
      else if(row.windows.length === 1){ dateOverrides[key] = row.windows[0]; }
      else { dateOverrides[key] = row.windows; }
    });
    overridesData = overridesRes.data || [];

    // Build cfg in the old HEARTLAND_CONFIG shape
    var cfg = {
      schedule: schedule,
      dateOverrides: dateOverrides,
      INSPECTION_DURATION_HOURS: s.inspection_duration_hours,
      SLOT_STEP_MINUTES: s.slot_step_minutes,
      BUFFER_MINUTES: s.buffer_minutes,
      PUBLIC_WEEKS_AHEAD: s.public_weeks_ahead,
      ADMIN_WEEKS_AHEAD: s.admin_weeks_ahead,
      TIMEZONE: s.timezone,
      MIN_ADVANCE_HOURS: s.min_advance_hours,
      INCLUDE_STATE_TAX: s.include_state_tax || false,
      ENABLE_CONTRACTOR_DIRECTORY: s.enable_contractor_directory || false,
      scoreSettings: s.scoreSettings || null,
      draftCleanup:  s.draftCleanup  || { enabled: false, days: 30 },
      pricing: {
        baseServices: (baseRes.data || []).map(function(r){ return { id: r.id, name: r.name }; }),
        addonServices: (addonRes.data || []).map(function(r){
          var svc = { id: r.id, name: r.name, price: Number(r.price) };
          if(r.subtext) svc.subtext = r.subtext;
          if(r.sub_items && r.sub_items.length) svc.subItems = r.sub_items;
          return svc;
        }),
        homeSizeTiers: (tiersRes.data || []).map(function(r){ return { id: r.id, label: r.label, price: Number(r.price) }; }),
        discountTiers: (discRes.data || []).map(function(r){ return { id: r.id, services: r.services, pct: r.pct }; }),
        maxDiscountPct: s.max_discount_pct
      },
      coupons: (couponsRes.data || []).map(function(r){ return { id: r.id, code: r.code, value: Number(r.value), type: r.type, active: r.active }; })
    };

    // Assign cfg to shared BEFORE any render calls
    window._hbShared.cfg = cfg;

    // Load new table data into state
    categoriesData = (catRes.data || []).map(function(r){ return { id: r.id, name: r.name, tagline: r.tagline || '', icon: r.icon || '', has_home_size: r.has_home_size, has_year_built: r.has_year_built, has_addons: r.has_addons, has_discounting: r.has_discounting, active: r.active }; });
    window._hbShared.categories = categoriesData;
    yearBuiltData = (ybRes.data || []).map(function(r){ return { id: r.id, label: r.label, min_year: r.min_year, max_year: r.max_year, surcharge: Number(r.surcharge), active: r.active }; });
    newConData = (ncRes.data || []).map(function(r){ return { id: r.id, name: r.name, price: Number(r.price), is_bundle: r.is_bundle, includes: r.includes || [], active: r.active }; });
    healthCheckData = (hcRes.data || []).map(function(r){ return { id: r.id, name: r.name, price: Number(r.price), includes: r.includes || [], inherits_from: r.inherits_from || [], active: r.active }; });
    recommendationsData = (recRes.data || []).map(function(r){ return { id: r.id, addon_id: r.addon_id, field: r.field, operator: r.operator, value: r.value, reason: r.reason, priority: r.priority, active: r.active !== false }; });
    window._hbShared.contractors = (contractorsRes.data || []).map(function(r){ return { id: r.id, name: r.name, company: r.company, phone: r.phone || '', email: r.email || '', website: r.website || '', service_categories: r.service_categories || [], service_area: r.service_area || '', notes: r.notes || '', referral_arrangement: r.referral_arrangement || '', featured: !!r.featured, active: r.active !== false }; });
    window._hbShared.clients = clientsRes.data || [];
    window._hbShared.records = inspRecRes.data || [];
    window._hbShared.invoices = invoicesRes.data || [];
    window._hbShared.invoices = invoicesRes.data || [];
    window._hbShared.waiverVersions = waiverVersionsRes.data || [];
    window._hbShared.waiverSignatures = waiverSigsRes.data || [];

    // Bookings + agents — identify current logged-in user's role from agents table
    var agentsData = agentsRes.data || [];
    window._hbShared.agents = agentsData;
    var sessionRes = await sb.auth.getSession();
    var sessionUserId = sessionRes.data && sessionRes.data.session ? sessionRes.data.session.user.id : null;
    var sessionAgent = agentsData.find(function(a){ return a.id === sessionUserId; });
    window._hbShared.currentUserRole = (sessionAgent && sessionAgent.role) ? sessionAgent.role : 'inspector';
    window._hbShared.currentUserName = sessionAgent ? (sessionAgent.name || sessionAgent.email || '') : (sessionRes.data && sessionRes.data.session ? sessionRes.data.session.user.email : '');

    var agentMap = {};
    agentsData.forEach(function(a){ agentMap[a.id] = { name: a.name || a.email, company: a.company || '' }; });
    var bookingsData = (bookingsRes.data || []).map(function(b){
      var info = agentMap[b.agent_id] || { name: 'Unknown', company: '' };
      b.agent_name = info.name;
      b.agent_company = info.company;
      return b;
    });
    window._hbShared.bookings = bookingsData;

    // Backfill agent_id from bookings onto inspection records (agent_id lives on bookings)
    var inspectionRecordsData = window._hbShared.records;
    var bookingAgentMap = {};
    bookingsData.forEach(function(b) { if (b.id && b.agent_id) bookingAgentMap[b.id] = b.agent_id; });
    inspectionRecordsData.forEach(function(r) {
      if (!r.agent_id && r.booking_id && bookingAgentMap[r.booking_id]) {
        r.agent_id = bookingAgentMap[r.booking_id];
      }
    });

    // Show admin panel
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    applyRoleUI();
    renderWeekly(); renderSettings(); initOC(); renderPricing(); renderCoupons();
    renderCategories(); renderYearBuilt(); renderRecommendations(); renderNewCon(); renderHealthCheck();
    initBkCal(); initCal(); renderBookings(); renderContractors(); renderClientRecords();
    window.scoreSettings = cfg.scoreSettings || null; // pre-load score settings from config
    runDraftCleanupIfEnabled(); // auto-cleanup stale drafts if enabled
    setTimeout(function(){ if(window.renderInvoices) window.renderInvoices(); if(window.renderClientReports) window.renderClientReports(); }, 100);
    setTimeout(function(){ if(window.renderLaTemplates) window.renderLaTemplates(); }, 150);
    var _csg = document.getElementById('contractorsSidebarGroup'); if(_csg) _csg.style.display = cfg.ENABLE_CONTRACTOR_DIRECTORY ? '' : 'none';

  } catch(err){
    hwToast('Error loading config: ' + (err.message || err));
  }
}

// ─── SAVE CONFIG TO SUPABASE ────────────────────
async function saveConfig(){
  var cfg = window._hbShared.cfg;
  var sb = window._hbShared.sb;
  var btn = document.getElementById('saveBtn');
  var st = document.getElementById('saveStatus');
  btn.disabled = true;
  st.textContent = 'Saving...';
  st.className = 'save-status';

  try {
    readSettings(); readPricing();

    // 1. Settings
    await sb.from('settings').update({
      inspection_duration_hours: cfg.INSPECTION_DURATION_HOURS,
      slot_step_minutes: cfg.SLOT_STEP_MINUTES,
      buffer_minutes: cfg.BUFFER_MINUTES,
      public_weeks_ahead: cfg.PUBLIC_WEEKS_AHEAD,
      admin_weeks_ahead: cfg.ADMIN_WEEKS_AHEAD,
      timezone: cfg.TIMEZONE,
      min_advance_hours: cfg.MIN_ADVANCE_HOURS,
      include_state_tax: cfg.INCLUDE_STATE_TAX,
      enable_contractor_directory: cfg.ENABLE_CONTRACTOR_DIRECTORY,
      max_discount_pct: cfg.pricing.maxDiscountPct
    }).eq('id', 1);

    // 2. Schedule (upsert all 7 days)
    var schedRows = [];
    for(var d = 0; d < 7; d++){
      var entry = cfg.schedule[d];
      var windows = null;
      if(entry && entry !== 'closed'){
        if(Array.isArray(entry) && typeof entry[0] === 'string') windows = [entry]; // single window → wrap
        else if(Array.isArray(entry) && Array.isArray(entry[0])) windows = entry;   // multi window
      }
      schedRows.push({ dow: d, windows: windows });
    }
    await sb.from('schedule').upsert(schedRows, { onConflict: 'dow' });

    // 3. Date overrides — delete all then re-insert
    var today = new Date().toISOString().split('T')[0];
    await sb.from('date_overrides').delete().gte('date_key', '2000-01-01');
    var ovRows = [];
    for(var dk in cfg.dateOverrides){
      if(dk < today) continue; // skip past dates
      var ov = cfg.dateOverrides[dk];
      var ovWin = null;
      if(ov && ov !== 'closed' && ov !== null){
        if(Array.isArray(ov) && typeof ov[0] === 'string') ovWin = [ov];
        else if(Array.isArray(ov) && Array.isArray(ov[0])) ovWin = ov;
      }
      ovRows.push({ date_key: dk, windows: ovWin });
    }
    if(ovRows.length) await sb.from('date_overrides').insert(ovRows);

    // 4. Base services — delete all, re-insert with sort order
    await sb.from('base_services').delete().neq('id', '___never___');
    var bsRows = cfg.pricing.baseServices.map(function(s, i){ return { id: s.id, name: s.name, sort_order: i }; });
    if(bsRows.length) await sb.from('base_services').insert(bsRows);

    // 5. Addon services — delete all, re-insert
    await sb.from('addon_services').delete().neq('id', '___never___');
    var asRows = cfg.pricing.addonServices.map(function(s, i){
      return { id: s.id, name: s.name, price: s.price, subtext: s.subtext || null, sub_items: s.subItems || null, sort_order: i };
    });
    if(asRows.length) await sb.from('addon_services').insert(asRows);

    // 6. Home size tiers — delete all, re-insert
    await sb.from('home_size_tiers').delete().gt('id', 0);
    var htRows = cfg.pricing.homeSizeTiers.map(function(t, i){ return { label: t.label, price: t.price, sort_order: i }; });
    if(htRows.length) await sb.from('home_size_tiers').insert(htRows);

    // 7. Discount tiers — delete all, re-insert
    await sb.from('discount_tiers').delete().gt('id', 0);
    var dtRows = cfg.pricing.discountTiers.map(function(d, i){ return { services: d.services, pct: d.pct, sort_order: i }; });
    if(dtRows.length) await sb.from('discount_tiers').insert(dtRows);

    // 8. Coupons — delete all, re-insert
    await sb.from('coupons').delete().gt('id', 0);
    var cpRows = cfg.coupons.map(function(c){ return { code: c.code, value: c.value, type: c.type, active: c.active }; });
    if(cpRows.length) await sb.from('coupons').insert(cpRows);

    // 9. Service FAQs — only save if a service is selected
    var _faqSlug = window._hbShared.faqSlug;
    var _faqData = window._hbShared.faqData;
    if(_faqSlug){
      await sb.from('service_faqs').delete().eq('service_slug', _faqSlug);
      var fqRows = _faqData.map(function(f, i){
        return { service_slug: _faqSlug, question: f.question, answer: f.answer, sort_order: i, active: f.active !== false };
      }).filter(function(f){ return f.question.trim() && f.answer.trim(); });
      if(fqRows.length) await sb.from('service_faqs').insert(fqRows);
      // Reload to get fresh IDs
      if(window.loadFaqs) window.loadFaqs(_faqSlug);
    }

    // 10. Inspection Categories — delete all, re-insert
    await sb.from('inspection_categories').delete().neq('id', '___never___');
    var catRows = categoriesData.map(function(c, i){
      return { id: c.id, name: c.name, tagline: c.tagline || null, icon: c.icon || null, has_home_size: c.has_home_size, has_year_built: c.has_year_built, has_addons: c.has_addons, has_discounting: c.has_discounting, active: c.active !== false, sort_order: i };
    });
    if(catRows.length) await sb.from('inspection_categories').insert(catRows);

    // 11. Year Built Surcharges — delete all, re-insert
    await sb.from('year_built_surcharges').delete().gt('id', 0);
    var ybRows = yearBuiltData.map(function(y, i){
      return { label: y.label, min_year: y.min_year, max_year: y.max_year, surcharge: y.surcharge, active: true, sort_order: i };
    });
    if(ybRows.length) await sb.from('year_built_surcharges').insert(ybRows);

    // 12. New Construction Items — delete all, re-insert
    await sb.from('new_construction_items').delete().gt('id', 0);
    var ncRows = newConData.map(function(n, i){
      return { name: n.name, price: n.price, is_bundle: n.is_bundle, includes: n.includes || [], active: true, sort_order: i };
    });
    if(ncRows.length) await sb.from('new_construction_items').insert(ncRows);

    // 13. Health Check Tiers — delete all, re-insert
    await sb.from('health_check_tiers').delete().gt('id', 0);
    var hcRows = healthCheckData.map(function(t, i){
      return { name: t.name, price: t.price, includes: t.includes || [], inherits_from: t.inherits_from || [], active: true, sort_order: i };
    });
    if(hcRows.length) await sb.from('health_check_tiers').insert(hcRows);

    // 14. Service Recommendations — delete all, re-insert
    await sb.from('service_recommendations').delete().gt('id', 0);
    var recRows = recommendationsData.map(function(r, i){
      return { addon_id: r.addon_id, field: r.field, operator: r.operator, value: r.value, reason: r.reason, priority: r.priority, active: r.active !== false, sort_order: i };
    });
    if(recRows.length) await sb.from('service_recommendations').insert(recRows);

    // 15. Contractors — delete all, re-insert
    var contractorsData = window._hbShared.contractors;
    await sb.from('contractors').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    var conRows = contractorsData.map(function(c, i){
      return {
        name: c.name, company: c.company, phone: c.phone || null,
        email: c.email || null, website: c.website || null,
        service_categories: c.service_categories || [],
        service_area: c.service_area || null, notes: c.notes || null,
        referral_arrangement: c.referral_arrangement || null,
        featured: !!c.featured, active: c.active !== false, sort_order: i
      };
    });
    if(conRows.length) await sb.from('contractors').insert(conRows);

    // ── Write unified config_json blob for public wizard + agent portal ──
    // Build the exact HEARTLAND_CONFIG shape both consumers expect
    var configBlob = {
      // Scheduling
      schedule:                 cfg.schedule,
      dateOverrides:            cfg.dateOverrides,
      INSPECTION_DURATION_HOURS: cfg.INSPECTION_DURATION_HOURS,
      SLOT_STEP_MINUTES:        cfg.SLOT_STEP_MINUTES,
      BUFFER_MINUTES:           cfg.BUFFER_MINUTES,
      PUBLIC_WEEKS_AHEAD:       cfg.PUBLIC_WEEKS_AHEAD,
      ADMIN_WEEKS_AHEAD:        cfg.ADMIN_WEEKS_AHEAD,
      TIMEZONE:                 cfg.TIMEZONE,
      MIN_ADVANCE_HOURS:        cfg.MIN_ADVANCE_HOURS,
      // Pricing flags
      INCLUDE_STATE_TAX:        cfg.INCLUDE_STATE_TAX,
      ENABLE_CONTRACTOR_DIRECTORY: cfg.ENABLE_CONTRACTOR_DIRECTORY,
      // Pricing data
      pricing: {
        baseServices:   cfg.pricing.baseServices,
        addonServices:  cfg.pricing.addonServices,
        homeSizeTiers:  cfg.pricing.homeSizeTiers,
        discountTiers:  cfg.pricing.discountTiers,
        maxDiscountPct: cfg.pricing.maxDiscountPct
      },
      coupons:               cfg.coupons,
      // Inspection types / categories
      inspectionCategories:  categoriesData.filter(function(c){ return c.active !== false; }).map(function(c){ return { id: c.id, name: c.name, tagline: c.tagline, icon: c.icon, has_home_size: c.has_home_size, has_year_built: c.has_year_built, has_addons: c.has_addons, has_discounting: c.has_discounting }; }),
      yearBuiltSurcharges:   yearBuiltData.filter(function(y){ return y.active !== false; }).map(function(y){ return { id: y.id, label: y.label, min_year: y.min_year, max_year: y.max_year, surcharge: y.surcharge }; }),
      newConstructionItems:  newConData.filter(function(n){ return n.active !== false; }).map(function(n){ return { id: n.id, name: n.name, price: n.price, is_bundle: n.is_bundle, includes: n.includes || [] }; }),
      healthCheckTiers:      healthCheckData.filter(function(h){ return h.active !== false; }).map(function(h){ return { id: h.id, name: h.name, price: h.price, includes: h.includes, inherits_from: h.inherits_from }; }),
      serviceRecommendations: recommendationsData.filter(function(r){ return r.active !== false; }).map(function(r){ return { id: r.id, addon_id: r.addon_id, field: r.field, operator: r.operator, value: r.value, reason: r.reason, priority: r.priority }; }),
      scoreSettings:   cfg.scoreSettings  || getDefaultScoreSettings(),
      draftCleanup:    cfg.draftCleanup   || { enabled: false, days: 30 }
    };
    await sb.from('config_json').upsert({ id: 1, config: configBlob }, { onConflict: 'id' });

    st.textContent = 'Saved!';
    st.className = 'save-status ok';
    setTimeout(function(){ st.textContent = 'Ready'; st.className = 'save-status'; }, 3000);

  } catch(err){
    st.textContent = 'Error: ' + (err.message || 'Unknown');
    st.className = 'save-status err';
  }
  btn.disabled = false;
}

// ═══ WEEKLY DEFAULTS ════════════════════════════
function renderWeekly(){
  var cfg = window._hbShared.cfg;
  var el = document.getElementById('weeklyRows'), html = '';
  for(var i = 0; i < 7; i++){
    var entry = cfg.schedule[i];
    var isOpen = entry && entry !== 'closed' && entry !== null;
    var st = '', en = '';
    if(isOpen && Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string'){ st = to24(entry[0]); en = to24(entry[1]); }
    html += '<div class="day-row"><div class="day-name">' + DAYS[i] + '</div>';
    html += '<label class="toggle"><input type="checkbox" data-dow="' + i + '" ' + (isOpen ? 'checked' : '') + '><span class="slider"></span></label>';
    html += '<div class="day-times" id="dt' + i + '">';
    if(isOpen){ html += '<input type="time" id="ds' + i + '" value="' + st + '" data-dow="' + i + '"><span class="sep">to</span><input type="time" id="de' + i + '" value="' + en + '" data-dow="' + i + '">'; }
    else{ html += '<span class="day-closed">Closed</span>'; }
    html += '</div></div>';
  }
  el.innerHTML = html;
  el.querySelectorAll('.toggle input').forEach(function(inp){
    inp.addEventListener('change', function(){ var d = +this.getAttribute('data-dow'); window._hbShared.cfg.schedule[d] = this.checked ? ['3:00 PM','8:30 PM'] : null; renderWeekly(); renderOC(); });
  });
  el.querySelectorAll('.day-times input[type="time"]').forEach(function(inp){
    inp.addEventListener('change', function(){ var d = +this.getAttribute('data-dow'); var s = document.getElementById('ds'+d), e = document.getElementById('de'+d); if(s && e && s.value && e.value){ window._hbShared.cfg.schedule[d] = [to12(s.value), to12(e.value)]; renderOC(); }});
  });
}

// ═══ SETTINGS ═══════════════════════════════════
function renderSettings(){
  var cfg = window._hbShared.cfg;
  document.getElementById('sDur').value = cfg.INSPECTION_DURATION_HOURS || 2.5;
  document.getElementById('sStep').value = cfg.SLOT_STEP_MINUTES || 60;
  document.getElementById('sBuf').value = cfg.BUFFER_MINUTES || 30;
  document.getElementById('sPub').value = cfg.PUBLIC_WEEKS_AHEAD || 4;
  document.getElementById('sAdm').value = cfg.ADMIN_WEEKS_AHEAD || 6;
  document.getElementById('sMinAdvance').value = cfg.MIN_ADVANCE_HOURS !== undefined ? cfg.MIN_ADVANCE_HOURS : 24;
  document.getElementById('sStateTax').checked = !!cfg.INCLUDE_STATE_TAX;
  document.getElementById('sContractors').checked = !!cfg.ENABLE_CONTRACTOR_DIRECTORY;
}
function readSettings(){
  var cfg = window._hbShared.cfg;
  cfg.INSPECTION_DURATION_HOURS = parseFloat(document.getElementById('sDur').value) || 2.5;
  cfg.SLOT_STEP_MINUTES = parseInt(document.getElementById('sStep').value) || 60;
  cfg.BUFFER_MINUTES = parseInt(document.getElementById('sBuf').value) || 30;
  cfg.PUBLIC_WEEKS_AHEAD = parseInt(document.getElementById('sPub').value) || 4;
  cfg.ADMIN_WEEKS_AHEAD = parseInt(document.getElementById('sAdm').value) || 6;
  cfg.MIN_ADVANCE_HOURS = parseInt(document.getElementById('sMinAdvance').value) || 0;
  cfg.INCLUDE_STATE_TAX = document.getElementById('sStateTax').checked;
  cfg.ENABLE_CONTRACTOR_DIRECTORY = document.getElementById('sContractors').checked;
  var _csg2 = document.getElementById('contractorsSidebarGroup'); if(_csg2) _csg2.style.display = cfg.ENABLE_CONTRACTOR_DIRECTORY ? '' : 'none';
}

// ═══ DATE OVERRIDES CALENDAR ════════════════════
function initOC(){ var now = new Date(); ocMonth = now.getMonth(); ocYear = now.getFullYear(); renderOC(); }

function renderOC(){
  var cfg = window._hbShared.cfg;
  var el = document.getElementById('ocContainer');
  var now = new Date(), todayStr = dateKey(now);
  var admW = cfg.ADMIN_WEEKS_AHEAD || 6, pubW = cfg.PUBLIC_WEEKS_AHEAD || 4;
  var maxAdm = new Date(now.getTime() + admW*7*864e5), maxAdmStr = dateKey(maxAdm);
  var maxPub = new Date(now.getTime() + pubW*7*864e5), maxPubStr = dateKey(maxPub);
  var h = '<div class="oc-header"><button class="oc-nav" id="ocPrev">&#8249;</button><h3>' + MONTHS[ocMonth] + ' ' + ocYear + '</h3><button class="oc-nav" id="ocNext">&#8250;</button></div><div class="oc-grid">';
  for(var i = 0; i < 7; i++) h += '<div class="oc-dow">' + SHORT[i] + '</div>';
  var fd = new Date(ocYear, ocMonth, 1).getDay(), dim = new Date(ocYear, ocMonth+1, 0).getDate();
  for(var e = 0; e < fd; e++) h += '<div class="oc-cell empty"></div>';
  var boundaryInserted = false;
  for(var d = 1; d <= dim; d++){
    var k = ocYear + '-' + pad(ocMonth+1) + '-' + pad(d);
    var dow = new Date(ocYear, ocMonth, d).getDay();
    if(!boundaryInserted && k > maxPubStr && k <= maxAdmStr){ if(dow===0||d===1){ h += '<div class="oc-boundary">&#9650; Public calendar limit (4 wks) — dates below require call/email &#9650;</div>'; boundaryInserted = true; }}
    var cls = 'oc-cell', hasOv = cfg.dateOverrides && cfg.dateOverrides.hasOwnProperty(k);
    if(k < todayStr) cls += ' past';
    else if(k > maxAdmStr) cls += ' oor';
    else if(hasOv){ var ov = cfg.dateOverrides[k]; cls += (!ov || ov === 'closed' || ov === null) ? ' ov-closed' : ' ov-open'; }
    else{ var def = cfg.schedule[dow]; cls += (def && def !== 'closed' && def !== null) ? ' def-open' : ' def-closed'; }
    if(k === selDate) cls += ' sel';
    var canClick = k >= todayStr && k <= maxAdmStr;
    h += '<div class="' + cls + '"' + (canClick ? ' data-dk="' + k + '"' : '') + '>' + d;
    if(hasOv && canClick) h += '<span class="oc-dot"></span>';
    h += '</div>';
  }
  h += '</div>'; el.innerHTML = h;
  document.getElementById('ocPrev').addEventListener('click', function(){ ocMonth--; if(ocMonth < 0){ ocMonth = 11; ocYear--; } renderOC(); });
  document.getElementById('ocNext').addEventListener('click', function(){ ocMonth++; if(ocMonth > 11){ ocMonth = 0; ocYear++; } renderOC(); });
  document.getElementById('ocPrev').disabled = (ocYear === now.getFullYear() && ocMonth === now.getMonth());
  var mxM = maxAdm.getMonth(), mxY = maxAdm.getFullYear();
  document.getElementById('ocNext').disabled = (ocYear > mxY || (ocYear === mxY && ocMonth >= mxM));
  el.querySelectorAll('.oc-cell[data-dk]').forEach(function(c){ c.addEventListener('click', function(){ selDate = this.getAttribute('data-dk'); renderOC(); showEditor(selDate); }); });
}

function showEditor(dk){
  var cfg = window._hbShared.cfg;
  var ed = document.getElementById('ovEditor');
  var parts = dk.split('-'), dt = new Date(+parts[0], +parts[1]-1, +parts[2]);
  document.getElementById('ovTitle').textContent = DAYS[dt.getDay()] + ', ' + MONTHS[dt.getMonth()] + ' ' + parseInt(parts[2]) + ', ' + parts[0];
  var hasOv = cfg.dateOverrides && cfg.dateOverrides.hasOwnProperty(dk);
  var entry = hasOv ? cfg.dateOverrides[dk] : cfg.schedule[dt.getDay()];
  var isOpen = entry && entry !== 'closed' && entry !== null;
  var st = '15:00', en = '20:30';
  if(isOpen && Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string'){ st = to24(entry[0]); en = to24(entry[1]); }
  var h = '<p style="margin-bottom:14px;">';
  if(hasOv){ var ov = cfg.dateOverrides[dk]; if(!ov || ov === 'closed' || ov === null){ h += '<span class="ov-status-badge override-closed">Override — Closed</span>'; } else { h += '<span class="ov-status-badge override-open">Override — Custom Hours</span>'; }}
  else{ h += '<span class="ov-status-badge default">Using Weekly Default</span>'; }
  h += '</p>';
  h += '<div class="ov-times"><input type="time" id="ovS" value="' + st + '"><span class="sep">to</span><input type="time" id="ovE" value="' + en + '"></div>';
  h += '<div class="ov-actions"><button class="btn-open" id="ovOpen">Set Custom Hours</button><button class="btn-close" id="ovClose">Mark Closed</button>';
  if(hasOv) h += '<button class="btn-reset" id="ovReset">Reset to Default</button>';
  h += '</div>';
  document.getElementById('ovContent').innerHTML = h; ed.classList.add('active');
  document.getElementById('ovOpen').addEventListener('click', function(){ var s = document.getElementById('ovS').value, e = document.getElementById('ovE').value; if(!s || !e){ hwToast('Please set both start and end times.'); return; } window._hbShared.cfg.dateOverrides[dk] = [to12(s), to12(e)]; renderOC(); showEditor(dk); });
  document.getElementById('ovClose').addEventListener('click', function(){ window._hbShared.cfg.dateOverrides[dk] = null; renderOC(); showEditor(dk); });
  var resetBtn = document.getElementById('ovReset');
  if(resetBtn) resetBtn.addEventListener('click', function(){ delete window._hbShared.cfg.dateOverrides[dk]; renderOC(); showEditor(dk); });
}

// ═══ PRICING TAB ════════════════════════════════
function renderBaseServices(){
  var cfg = window._hbShared.cfg;
  var el = document.getElementById('baseServicesList'), svcs = cfg.pricing.baseServices, h = '';
  for(var i = 0; i < svcs.length; i++){
    h += '<div class="svc-item"><input class="svc-name-input" type="text" value="' + esc(svcs[i].name) + '" data-f="bn" data-i="' + i + '" placeholder="Service name"><span class="svc-badge">Tiered</span><button class="svc-remove" data-f="br" data-i="' + i + '" title="Remove">&#10005;</button></div>';
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-f="bn"]').forEach(function(inp){ inp.addEventListener('input', function(){ window._hbShared.cfg.pricing.baseServices[+this.dataset.i].name = this.value; }); });
  el.querySelectorAll('[data-f="br"]').forEach(function(btn){ btn.addEventListener('click', function(){ if(window._hbShared.cfg.pricing.baseServices.length <= 1){ hwToast('Need at least one base service.'); return; } window._hbShared.cfg.pricing.baseServices.splice(+this.dataset.i, 1); renderBaseServices(); }); });
}

function renderAddonServices(){
  var cfg = window._hbShared.cfg;
  var el = document.getElementById('addonServicesList'), svcs = cfg.pricing.addonServices, h = '';
  for(var i = 0; i < svcs.length; i++){
    var svc = svcs[i];
    h += '<div class="svc-addon-wrap" data-ai="' + i + '">';
    h += '<div class="svc-addon-main"><input class="svc-name-input" type="text" value="' + esc(svc.name) + '" data-f="an" data-i="' + i + '" placeholder="Service name"><span style="color:var(--text-light);font-size:15px;flex-shrink:0;">$</span><input class="svc-price-input" type="number" value="' + svc.price + '" data-f="ap" data-i="' + i + '" min="0" step="5"><button class="svc-remove" data-f="ar" data-i="' + i + '" title="Remove">&#10005;</button></div>';
    h += '<div class="svc-subtext-row"><label>Subtext</label><input class="svc-subtext-input" type="text" value="' + esc(svc.subtext || '') + '" data-f="ast" data-i="' + i + '" placeholder="e.g. (2 Samples Included)"></div>';
    h += '<div class="svc-subitems">';
    if(svc.subItems && svc.subItems.length){
      for(var j = 0; j < svc.subItems.length; j++){
        var sub = svc.subItems[j];
        h += '<div class="svc-subitem-row"><input type="text" value="' + esc(sub.name) + '" data-f="sin" data-i="' + i + '" data-j="' + j + '" placeholder="Sub-item name"><span class="svc-subitem-label">$</span><input type="number" value="' + sub.price + '" data-f="sip" data-i="' + i + '" data-j="' + j + '" min="0" step="5"><span class="svc-subitem-label">Min</span><input type="number" value="' + (sub.minQty||0) + '" data-f="simn" data-i="' + i + '" data-j="' + j + '" min="0" max="99" style="width:55px;"><span class="svc-subitem-label">Max</span><input type="number" value="' + (sub.maxQty||10) + '" data-f="simx" data-i="' + i + '" data-j="' + j + '" min="1" max="99" style="width:55px;"><button class="sub-remove" data-f="sir" data-i="' + i + '" data-j="' + j + '" title="Remove sub-item">&#10005;</button></div>';
      }
    }
    h += '<button class="add-sub-btn" data-f="sia" data-i="' + i + '">+ Add Sub-Item</button></div></div>';
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-f="an"]').forEach(function(inp){ inp.addEventListener('input', function(){ window._hbShared.cfg.pricing.addonServices[+this.dataset.i].name = this.value; }); });
  el.querySelectorAll('[data-f="ap"]').forEach(function(inp){ inp.addEventListener('input', function(){ window._hbShared.cfg.pricing.addonServices[+this.dataset.i].price = parseFloat(this.value) || 0; }); });
  el.querySelectorAll('[data-f="ast"]').forEach(function(inp){ inp.addEventListener('input', function(){ var val = this.value.trim(); if(val){ window._hbShared.cfg.pricing.addonServices[+this.dataset.i].subtext = val; } else { delete window._hbShared.cfg.pricing.addonServices[+this.dataset.i].subtext; } }); });
  el.querySelectorAll('[data-f="ar"]').forEach(function(btn){ btn.addEventListener('click', function(){ window._hbShared.cfg.pricing.addonServices.splice(+this.dataset.i, 1); renderAddonServices(); }); });
  el.querySelectorAll('[data-f="sin"]').forEach(function(inp){ inp.addEventListener('input', function(){ window._hbShared.cfg.pricing.addonServices[+this.dataset.i].subItems[+this.dataset.j].name = this.value; }); });
  el.querySelectorAll('[data-f="sip"]').forEach(function(inp){ inp.addEventListener('input', function(){ window._hbShared.cfg.pricing.addonServices[+this.dataset.i].subItems[+this.dataset.j].price = parseFloat(this.value) || 0; }); });
  el.querySelectorAll('[data-f="simn"]').forEach(function(inp){ inp.addEventListener('input', function(){ window._hbShared.cfg.pricing.addonServices[+this.dataset.i].subItems[+this.dataset.j].minQty = parseInt(this.value) || 0; }); });
  el.querySelectorAll('[data-f="simx"]').forEach(function(inp){ inp.addEventListener('input', function(){ window._hbShared.cfg.pricing.addonServices[+this.dataset.i].subItems[+this.dataset.j].maxQty = parseInt(this.value) || 10; }); });
  el.querySelectorAll('[data-f="sir"]').forEach(function(btn){ btn.addEventListener('click', function(){ var si = +this.dataset.i; window._hbShared.cfg.pricing.addonServices[si].subItems.splice(+this.dataset.j, 1); if(!window._hbShared.cfg.pricing.addonServices[si].subItems.length) delete window._hbShared.cfg.pricing.addonServices[si].subItems; renderAddonServices(); }); });
  el.querySelectorAll('[data-f="sia"]').forEach(function(btn){ btn.addEventListener('click', function(){ var si = +this.dataset.i; if(!window._hbShared.cfg.pricing.addonServices[si].subItems) window._hbShared.cfg.pricing.addonServices[si].subItems = []; window._hbShared.cfg.pricing.addonServices[si].subItems.push({ id: uid(), name: 'Additional Item', price: 50, minQty: 0, maxQty: 10 }); renderAddonServices(); }); });
}

function renderTiers(){
  var cfg = window._hbShared.cfg;
  var el = document.getElementById('tiersList'), tiers = cfg.pricing.homeSizeTiers, h = '';
  for(var i = 0; i < tiers.length; i++){
    h += '<div class="tier-item"><input class="svc-name-input" type="text" value="' + esc(tiers[i].label) + '" data-f="tl" data-i="' + i + '" placeholder="e.g. 0 – 1,500 sqft" style="width:100%"><div style="display:flex;align-items:center;gap:4px;justify-content:center;"><span style="color:var(--text-light);">$</span><input class="tier-input" type="number" value="' + tiers[i].price + '" data-f="tp" data-i="' + i + '" min="0" step="25"></div><button class="svc-remove" data-f="tr" data-i="' + i + '" title="Remove" style="margin:0 auto;">&#10005;</button></div>';
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-f="tl"]').forEach(function(inp){ inp.addEventListener('input', function(){ window._hbShared.cfg.pricing.homeSizeTiers[+this.dataset.i].label = this.value; }); });
  el.querySelectorAll('[data-f="tp"]').forEach(function(inp){ inp.addEventListener('input', function(){ window._hbShared.cfg.pricing.homeSizeTiers[+this.dataset.i].price = parseFloat(this.value) || 0; }); });
  el.querySelectorAll('[data-f="tr"]').forEach(function(btn){ btn.addEventListener('click', function(){ if(window._hbShared.cfg.pricing.homeSizeTiers.length <= 1){ hwToast('Need at least one tier.'); return; } window._hbShared.cfg.pricing.homeSizeTiers.splice(+this.dataset.i, 1); renderTiers(); }); });
}

function renderDiscounts(){
  var cfg = window._hbShared.cfg;
  var el = document.getElementById('discountsList'), discs = cfg.pricing.discountTiers, maxP = cfg.pricing.maxDiscountPct || 30, h = '';
  document.getElementById('maxDiscountCap').value = maxP;
  for(var i = 0; i < discs.length; i++){
    var lb = discs[i].services === 1 ? '1 service' : discs[i].services + ' services';
    var atCap = discs[i].pct >= maxP && discs[i].pct > 0;
    h += '<div class="disc-item"><div class="disc-label">' + lb + '</div><div style="display:flex;align-items:center;gap:4px;justify-content:center;"><input class="tier-input" type="number" value="' + discs[i].pct + '" data-f="dp" data-i="' + i + '" min="0" max="100" step="5"><span style="color:var(--text-light);">%</span></div><div class="disc-note">' + (discs[i].pct === 0 ? 'No discount' : discs[i].pct + '% off total') + (atCap ? '<span class="max-badge">At cap</span>' : '') + '</div></div>';
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-f="dp"]').forEach(function(inp){ inp.addEventListener('input', function(){ window._hbShared.cfg.pricing.discountTiers[+this.dataset.i].pct = parseFloat(this.value) || 0; renderDiscounts(); }); });
  document.getElementById('maxDiscountCap').oninput = function(){ window._hbShared.cfg.pricing.maxDiscountPct = parseInt(this.value) || 30; renderDiscounts(); };
}

function updatePreview(){
  var cfg = window._hbShared.cfg;
  if(!cfg || !cfg.pricing) return;
  var sel = document.getElementById('previewSize');
  sel.innerHTML = '<option value="">Select home size...</option>';
  cfg.pricing.homeSizeTiers.forEach(function(t, i){ sel.innerHTML += '<option value="' + i + '">' + esc(t.label) + ' — $' + t.price + '</option>'; });
  var ch = '';
  cfg.pricing.baseServices.forEach(function(s, i){ ch += '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:14px;"><input type="checkbox" class="pv-ck" data-t="b" data-i="' + i + '"> ' + esc(s.name) + ' <span style="color:var(--text-light);font-size:13px;">(tiered)</span></label>'; });
  cfg.pricing.addonServices.forEach(function(s, i){ ch += '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:14px;"><input type="checkbox" class="pv-ck" data-t="a" data-i="' + i + '"> ' + esc(s.name) + ' <span style="color:var(--text-light);font-size:13px;">$' + s.price + '</span></label>'; });
  document.getElementById('previewCheckboxes').innerHTML = ch;
  document.querySelectorAll('.pv-ck').forEach(function(cb){ cb.addEventListener('change', calcPreview); });
  sel.addEventListener('change', calcPreview);
}

function calcPreview(){
  var cfg = window._hbShared.cfg;
  var si = document.getElementById('previewSize').value;
  var bp = si !== '' ? cfg.pricing.homeSizeTiers[+si].price : 0;
  var lines = [], total = 0, cnt = 0;
  document.querySelectorAll('.pv-ck:checked').forEach(function(cb){
    var nm, pr;
    if(cb.dataset.t === 'b'){ nm = cfg.pricing.baseServices[+cb.dataset.i].name; pr = bp; }
    else { nm = cfg.pricing.addonServices[+cb.dataset.i].name; pr = cfg.pricing.addonServices[+cb.dataset.i].price; }
    lines.push({ n: nm, p: pr }); total += pr; cnt++;
  });
  var dp = 0, mp = cfg.pricing.maxDiscountPct || 30;
  for(var i = cfg.pricing.discountTiers.length - 1; i >= 0; i--){ if(cnt >= cfg.pricing.discountTiers[i].services){ dp = cfg.pricing.discountTiers[i].pct; break; }}
  if(dp > mp) dp = mp;
  var disc = Math.round(total * dp / 100), fin = total - disc;
  var box = document.getElementById('previewLines');
  if(!lines.length){ box.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:14px;">Select services above to preview</p>'; return; }
  var h = '';
  lines.forEach(function(l){ h += '<div class="pv-line"><span style="color:rgba(255,255,255,0.8);">' + esc(l.n) + '</span><span style="color:var(--secondary);font-weight:600;">$' + l.p + '</span></div>'; });
  if(disc > 0) h += '<div class="pv-line"><span style="color:var(--secondary);">Bundle Discount (' + dp + '%)</span><span style="color:#7fdb98;font-weight:600;">-$' + disc + '</span></div>';
  h += '<div class="pv-total"><span>Total</span><span style="color:var(--secondary);">$' + fin + '</span></div>';
  if(disc > 0) h += '<div class="pv-savings">You save $' + disc + ' with the bundle discount!</div>';
  box.innerHTML = h;
}

function renderPricing(){ renderBaseServices(); renderAddonServices(); renderTiers(); renderDiscounts(); updatePreview(); }
function readPricing(){ var cfg = window._hbShared.cfg; cfg.pricing.maxDiscountPct = parseInt(document.getElementById('maxDiscountCap').value) || 30; }

// ═══ COUPONS ════════════════════════════════════
function renderCoupons(){
  var cfg = window._hbShared.cfg;
  var el = document.getElementById('couponsList'); if(!el) return;
  var coupons = cfg.coupons || []; var h = '';
  for(var i = 0; i < coupons.length; i++){
    var c = coupons[i];
    h += '<div class="coupon-item">';
    h += '<input class="coupon-code-input" type="text" value="' + esc(c.code || '') + '" data-f="cc" data-i="' + i + '" placeholder="CODE">';
    h += '<div style="display:flex;align-items:center;gap:4px;"><input class="tier-input" type="number" value="' + (c.value || 0) + '" data-f="cv" data-i="' + i + '" min="0" step="5" style="width:80px;">';
    h += '<select class="coupon-type-select" data-f="ct" data-i="' + i + '"><option value="flat"' + (c.type !== 'percent' ? ' selected' : '') + '>$</option><option value="percent"' + (c.type === 'percent' ? ' selected' : '') + '>%</option></select></div>';
    h += '<div class="coupon-active-toggle"><label class="toggle" style="transform:scale(0.85);"><input type="checkbox" data-f="ca" data-i="' + i + '"' + (c.active !== false ? ' checked' : '') + '><span class="slider"></span></label><span>' + (c.active !== false ? 'Active' : 'Off') + '</span></div>';
    h += '<button class="svc-remove" data-f="cr" data-i="' + i + '" title="Remove">&#10005;</button>';
    h += '</div>';
  }
  if(!coupons.length){ h = '<p style="color:var(--text-light);font-size:14px;padding:12px 0;">No coupon codes yet. Click below to add one.</p>'; }
  el.innerHTML = h;
  el.querySelectorAll('[data-f="cc"]').forEach(function(inp){ inp.addEventListener('input', function(){ window._hbShared.cfg.coupons[+this.dataset.i].code = this.value.toUpperCase(); }); });
  el.querySelectorAll('[data-f="cv"]').forEach(function(inp){ inp.addEventListener('input', function(){ window._hbShared.cfg.coupons[+this.dataset.i].value = parseFloat(this.value) || 0; }); });
  el.querySelectorAll('[data-f="ct"]').forEach(function(sel){ sel.addEventListener('change', function(){ window._hbShared.cfg.coupons[+this.dataset.i].type = this.value; }); });
  el.querySelectorAll('[data-f="ca"]').forEach(function(inp){ inp.addEventListener('change', function(){ window._hbShared.cfg.coupons[+this.dataset.i].active = this.checked; this.closest('.coupon-active-toggle').querySelector('span:last-child').textContent = this.checked ? 'Active' : 'Off'; }); });
  el.querySelectorAll('[data-f="cr"]').forEach(function(btn){ btn.addEventListener('click', function(){ window._hbShared.cfg.coupons.splice(+this.dataset.i, 1); renderCoupons(); }); });
}

// ═══ INSPECTION CATEGORIES ════════════════════════
function renderCategories(){
  var el = document.getElementById('categoriesList'), h = '';
  for(var i = 0; i < categoriesData.length; i++){
    var c = categoriesData[i];
    h += '<div class="cat-card">';
    h += '<div class="cat-card-header">';
    h += '<div class="cat-card-icon"><input type="text" value="' + esc(c.icon || '') + '" data-f="ci" data-i="' + i + '" style="width:36px;height:36px;border:none;background:transparent;text-align:center;font-size:24px;padding:0;"></div>';
    h += '<div class="cat-card-title"><input class="svc-name-input" type="text" value="' + esc(c.name) + '" data-f="cn" data-i="' + i + '" placeholder="Category name"></div>';
    h += '<label class="toggle" style="transform:scale(0.8);"><input type="checkbox" data-f="cact" data-i="' + i + '"' + (c.active !== false ? ' checked' : '') + '><span class="slider"></span></label>';
    h += '<button class="svc-remove" data-f="cdel" data-i="' + i + '" title="Remove">&#10005;</button>';
    h += '</div>';
    h += '<div class="cat-card-fields">';
    h += '<input type="text" value="' + esc(c.tagline || '') + '" data-f="ctag" data-i="' + i + '" placeholder="Tagline (e.g. Know before you buy)">';
    h += '<input type="text" value="' + esc(c.id || '') + '" data-f="cid" data-i="' + i + '" placeholder="Slug ID (e.g. pre-purchase)" style="font-family:monospace;font-size:13px;">';
    h += '</div>';
    h += '<div class="cat-flags">';
    h += '<label class="cat-flag"><input type="checkbox" data-f="chs" data-i="' + i + '"' + (c.has_home_size ? ' checked' : '') + '> Has Home Size</label>';
    h += '<label class="cat-flag"><input type="checkbox" data-f="cyb" data-i="' + i + '"' + (c.has_year_built ? ' checked' : '') + '> Has Year Built</label>';
    h += '<label class="cat-flag"><input type="checkbox" data-f="cao" data-i="' + i + '"' + (c.has_addons ? ' checked' : '') + '> Has Add-Ons</label>';
    h += '<label class="cat-flag"><input type="checkbox" data-f="cdi" data-i="' + i + '"' + (c.has_discounting ? ' checked' : '') + '> Has Discounting</label>';
    h += '</div>';
    h += '</div>';
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-f="cn"]').forEach(function(inp){ inp.addEventListener('input', function(){ categoriesData[+this.dataset.i].name = this.value; }); });
  el.querySelectorAll('[data-f="ci"]').forEach(function(inp){ inp.addEventListener('input', function(){ categoriesData[+this.dataset.i].icon = this.value; }); });
  el.querySelectorAll('[data-f="ctag"]').forEach(function(inp){ inp.addEventListener('input', function(){ categoriesData[+this.dataset.i].tagline = this.value; }); });
  el.querySelectorAll('[data-f="cid"]').forEach(function(inp){ inp.addEventListener('input', function(){ categoriesData[+this.dataset.i].id = this.value; }); });
  el.querySelectorAll('[data-f="cact"]').forEach(function(inp){ inp.addEventListener('change', function(){ categoriesData[+this.dataset.i].active = this.checked; }); });
  el.querySelectorAll('[data-f="chs"]').forEach(function(inp){ inp.addEventListener('change', function(){ categoriesData[+this.dataset.i].has_home_size = this.checked; }); });
  el.querySelectorAll('[data-f="cyb"]').forEach(function(inp){ inp.addEventListener('change', function(){ categoriesData[+this.dataset.i].has_year_built = this.checked; }); });
  el.querySelectorAll('[data-f="cao"]').forEach(function(inp){ inp.addEventListener('change', function(){ categoriesData[+this.dataset.i].has_addons = this.checked; }); });
  el.querySelectorAll('[data-f="cdi"]').forEach(function(inp){ inp.addEventListener('change', function(){ categoriesData[+this.dataset.i].has_discounting = this.checked; }); });
  el.querySelectorAll('[data-f="cdel"]').forEach(async function(btn){ btn.addEventListener('click', async function(){ if(!await hwConfirm('Delete this category? This cannot be undone.', {title:'Delete Category', confirmLabel:'Delete'})) return; categoriesData.splice(+this.dataset.i, 1); renderCategories(); }); });
}

// ═══ YEAR BUILT SURCHARGES ════════════════════════
function renderYearBuilt(){
  var el = document.getElementById('yearBuiltList'), h = '';
  h += '<div class="yb-item" style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:0.5px;background:transparent;padding:8px 18px;"><span>Label</span><span style="text-align:center;">Min Year</span><span style="text-align:center;">Max Year</span><span style="text-align:center;">Surcharge</span><span></span></div>';
  for(var i = 0; i < yearBuiltData.length; i++){
    var y = yearBuiltData[i];
    h += '<div class="yb-item">';
    h += '<input class="svc-name-input" type="text" value="' + esc(y.label) + '" data-f="ybl" data-i="' + i + '" placeholder="e.g. 1950-1974">';
    h += '<input class="tier-input" type="number" value="' + (y.min_year || '') + '" data-f="ybmn" data-i="' + i + '" placeholder="null" style="width:auto;">';
    h += '<input class="tier-input" type="number" value="' + (y.max_year || '') + '" data-f="ybmx" data-i="' + i + '" placeholder="null" style="width:auto;">';
    h += '<div style="display:flex;align-items:center;gap:4px;justify-content:center;"><span style="color:var(--text-light);">$</span><input class="tier-input" type="number" value="' + y.surcharge + '" data-f="ybs" data-i="' + i + '" min="0" step="5" style="width:70px;"></div>';
    h += '<button class="svc-remove" data-f="ybr" data-i="' + i + '" title="Remove">&#10005;</button>';
    h += '</div>';
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-f="ybl"]').forEach(function(inp){ inp.addEventListener('input', function(){ yearBuiltData[+this.dataset.i].label = this.value; }); });
  el.querySelectorAll('[data-f="ybmn"]').forEach(function(inp){ inp.addEventListener('input', function(){ yearBuiltData[+this.dataset.i].min_year = this.value ? parseInt(this.value) : null; }); });
  el.querySelectorAll('[data-f="ybmx"]').forEach(function(inp){ inp.addEventListener('input', function(){ yearBuiltData[+this.dataset.i].max_year = this.value ? parseInt(this.value) : null; }); });
  el.querySelectorAll('[data-f="ybs"]').forEach(function(inp){ inp.addEventListener('input', function(){ yearBuiltData[+this.dataset.i].surcharge = parseFloat(this.value) || 0; }); });
  el.querySelectorAll('[data-f="ybr"]').forEach(function(btn){ btn.addEventListener('click', function(){ yearBuiltData.splice(+this.dataset.i, 1); renderYearBuilt(); }); });
}

// ═══ SERVICE RECOMMENDATIONS ═════════════════════
function renderRecommendations(){
  var cfg = window._hbShared.cfg;
  var el = document.getElementById('recommendationsList'), h = '';
  var addonOpts = cfg.pricing.addonServices.map(function(s){ return s; });
  var fieldOpts = [{v:'yearBuilt',l:'Year Built'},{v:'hasBasement',l:'Has Basement'},{v:'propertyType',l:'Property Type'}];
  var opOpts = [
    {v:'lt',  l:'is older than'},
    {v:'lte', l:'is older than or exactly'},
    {v:'gt',  l:'is newer than'},
    {v:'gte', l:'is newer than or exactly'},
    {v:'eq',  l:'equals'},
  ];
  var fieldLabels = {yearBuilt:'Year Built', hasBasement:'Has Basement', propertyType:'Property Type'};

  if (!recommendationsData.length) {
    h += '<div style="text-align:center;padding:32px 16px;color:var(--text-light);font-size:14px;">No rules yet. Click <strong>+ Add Recommendation Rule</strong> below to create your first one.</div>';
    el.innerHTML = h;
    return;
  }

  for(var i = 0; i < recommendationsData.length; i++){
    var r = recommendationsData[i];
    var addonName = (addonOpts.find(function(a){ return a.id === r.addon_id; }) || {}).name || 'Add-on';

    h += '<div class="rec-card">';

    // Top row — badge + remove
    h += '<div class="rec-card-top">';
    h += '<span class="rec-card-badge">Rule ' + (i+1) + '</span>';
    h += '<button class="rec-remove-btn" data-f="rec-rm" data-i="' + i + '" title="Delete rule">&times;</button>';
    h += '</div>';

    // Sentence builder
    h += '<div class="rec-sentence">';
    h += '<span class="rec-sentence-word">Recommend</span>';

    // Addon select
    h += '<select class="rec-select" data-f="rec-addon" data-i="' + i + '">';
    addonOpts.forEach(function(a){ h += '<option value="' + esc(a.id) + '"' + (a.id === r.addon_id ? ' selected' : '') + '>' + esc(a.name) + '</option>'; });
    h += '</select>';

    h += '<span class="rec-sentence-word">when</span>';

    // Field select
    h += '<select class="rec-select" data-f="rec-field" data-i="' + i + '">';
    fieldOpts.forEach(function(f){ h += '<option value="' + f.v + '"' + (f.v === r.field ? ' selected' : '') + '>' + f.l + '</option>'; });
    h += '</select>';

    // Operator select
    h += '<select class="rec-select" data-f="rec-op" data-i="' + i + '">';
    opOpts.forEach(function(o){ h += '<option value="' + o.v + '"' + (o.v === r.operator ? ' selected' : '') + '>' + o.l + '</option>'; });
    h += '</select>';

    // Value
    h += '<input class="rec-input-sm" type="text" value="' + esc(r.value) + '" data-f="rec-val" data-i="' + i + '" placeholder="e.g. 1980">';
    h += '</div>'; // end sentence

    // Bottom row — reason + priority
    h += '<div class="rec-reason-wrap" style="margin-top:4px;">';
    h += '<label class="rec-reason-label">Why show this? <span style="font-weight:400;text-transform:none;letter-spacing:0;">(shown to customer)</span></label>';
    h += '<input class="rec-reason-input" type="text" value="' + esc(r.reason) + '" data-f="rec-reason" data-i="' + i + '" placeholder="e.g. Homes built before 1980 may have elevated radon levels.">';
    h += '</div>';

    h += '</div>'; // end card
  }
  el.innerHTML = h;

  el.querySelectorAll('[data-f="rec-addon"]').forEach(function(sel){ sel.addEventListener('change', function(){ recommendationsData[+this.dataset.i].addon_id = this.value; }); });
  el.querySelectorAll('[data-f="rec-field"]').forEach(function(sel){ sel.addEventListener('change', function(){ recommendationsData[+this.dataset.i].field = this.value; }); });
  el.querySelectorAll('[data-f="rec-op"]').forEach(function(sel){ sel.addEventListener('change', function(){ recommendationsData[+this.dataset.i].operator = this.value; }); });
  el.querySelectorAll('[data-f="rec-val"]').forEach(function(inp){ inp.addEventListener('input', function(){ recommendationsData[+this.dataset.i].value = this.value; }); });
  el.querySelectorAll('[data-f="rec-reason"]').forEach(function(inp){ inp.addEventListener('input', function(){ recommendationsData[+this.dataset.i].reason = this.value; }); });

  el.querySelectorAll('[data-f="rec-rm"]').forEach(function(btn){ btn.addEventListener('click', function(){ recommendationsData.splice(+this.dataset.i, 1); renderRecommendations(); }); });
}

// ═══ NEW CONSTRUCTION ITEMS ═══════════════════════
function renderNewCon(){
  var el = document.getElementById('newConList'), h = '';
  var bundleCount = newConData.filter(function(n){ return n.is_bundle; }).length;
  for(var i = 0; i < newConData.length; i++){
    var n = newConData[i];
    var bullets = n.includes || [];
    h += '<div class="hc-card' + (n.is_bundle ? ' nc-bundle' : '') + '">';
    h += '<div class="hc-card-header">';
    h += '<input class="svc-name-input" type="text" value="' + esc(n.name) + '" data-f="ncn" data-i="' + i + '" placeholder="Phase name">';
    if(n.is_bundle) h += '<span class="nc-bundle-badge">Bundle</span>';
    h += '<div style="display:flex;align-items:center;gap:4px;"><span style="color:var(--text-light);">$</span><input class="svc-price-input" type="number" value="' + n.price + '" data-f="ncp" data-i="' + i + '" min="0" step="25"></div>';
    h += '<label class="cat-flag" style="font-size:12px;"><input type="checkbox" data-f="ncb" data-i="' + i + '"' + (n.is_bundle ? ' checked' : '') + '> Bundle</label>';
    h += '<button class="svc-remove" data-f="ncr" data-i="' + i + '" title="Remove">&#10005;</button>';
    h += '</div>';
    // Bullet list — matches HHC pattern
    h += '<div class="hc-bullets">';
    h += '<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">What\'s included:</div>';
    for(var b = 0; b < bullets.length; b++){
      h += '<div class="hc-bullet"><input type="text" value="' + esc(bullets[b]) + '" data-f="ncbl" data-i="' + i + '" data-b="' + b + '" placeholder="Feature item"><button class="sub-remove" data-f="ncbr" data-i="' + i + '" data-b="' + b + '" title="Remove">&#10005;</button></div>';
    }
    h += '<button class="add-sub-btn" data-f="ncba" data-i="' + i + '">+ Add Feature</button>';
    h += '</div>';
    h += '</div>';
  }
  if(bundleCount === 0 && newConData.length > 0){ h += '<p style="color:var(--accent);font-size:13px;margin-top:8px;font-weight:500;">&#9888; No item is marked as the bundle. Consider marking one.</p>'; }
  if(bundleCount > 1){ h += '<p style="color:var(--accent);font-size:13px;margin-top:8px;font-weight:500;">&#9888; Multiple items marked as bundle. Only one should be the bundle.</p>'; }
  el.innerHTML = h;
  el.querySelectorAll('[data-f="ncn"]').forEach(function(inp){ inp.addEventListener('input', function(){ newConData[+this.dataset.i].name = this.value; }); });
  el.querySelectorAll('[data-f="ncp"]').forEach(function(inp){ inp.addEventListener('input', function(){ newConData[+this.dataset.i].price = parseFloat(this.value) || 0; }); });
  el.querySelectorAll('[data-f="ncb"]').forEach(function(inp){ inp.addEventListener('change', function(){ newConData[+this.dataset.i].is_bundle = this.checked; renderNewCon(); }); });
  el.querySelectorAll('[data-f="ncr"]').forEach(function(btn){ btn.addEventListener('click', function(){ newConData.splice(+this.dataset.i, 1); renderNewCon(); }); });
  el.querySelectorAll('[data-f="ncbl"]').forEach(function(inp){ inp.addEventListener('input', function(){ newConData[+this.dataset.i].includes[+this.dataset.b] = this.value; }); });
  el.querySelectorAll('[data-f="ncbr"]').forEach(function(btn){ btn.addEventListener('click', function(){ newConData[+this.dataset.i].includes.splice(+this.dataset.b, 1); renderNewCon(); }); });
  el.querySelectorAll('[data-f="ncba"]').forEach(function(btn){ btn.addEventListener('click', function(){ var idx = +this.dataset.i; if(!newConData[idx].includes) newConData[idx].includes = []; newConData[idx].includes.push(''); renderNewCon(); var inputs = el.querySelectorAll('[data-f="ncbl"][data-i="' + idx + '"]'); if(inputs.length) inputs[inputs.length-1].focus(); }); });
}

// ═══ HOME HEALTH CHECK TIERS ══════════════════════
function renderHealthCheck(){
  var el = document.getElementById('healthCheckList'), h = '';
  for(var i = 0; i < healthCheckData.length; i++){
    var t = healthCheckData[i];
    var bullets = t.includes || [];
    var inherits = t.inherits_from || [];
    h += '<div class="hc-card">';
    h += '<div class="hc-card-header">';
    h += '<input class="svc-name-input" type="text" value="' + esc(t.name) + '" data-f="hcn" data-i="' + i + '" placeholder="Tier name">';
    h += '<div style="display:flex;align-items:center;gap:4px;"><span style="color:var(--text-light);">$</span><input class="svc-price-input" type="number" value="' + t.price + '" data-f="hcp" data-i="' + i + '" min="0" step="25"></div>';
    h += '<button class="svc-remove" data-f="hcr" data-i="' + i + '" title="Remove">&#10005;</button>';
    h += '</div>';
    // Inherits checkboxes
    if(healthCheckData.length > 1){
      h += '<div class="hc-inherits"><span style="font-weight:600;">Inherits from:</span>';
      for(var j = 0; j < healthCheckData.length; j++){
        if(j === i) continue;
        var otherId = healthCheckData[j].id;
        var isInherited = inherits.indexOf(otherId) >= 0;
        h += '<label><input type="checkbox" data-f="hci" data-i="' + i + '" data-oid="' + otherId + '"' + (isInherited ? ' checked' : '') + '> ' + esc(healthCheckData[j].name) + '</label>';
      }
      h += '</div>';
    }
    // Bullet list
    h += '<div class="hc-bullets">';
    h += '<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">This tier includes:</div>';
    for(var b = 0; b < bullets.length; b++){
      h += '<div class="hc-bullet"><input type="text" value="' + esc(bullets[b]) + '" data-f="hcbl" data-i="' + i + '" data-b="' + b + '" placeholder="Feature item"><button class="sub-remove" data-f="hcbr" data-i="' + i + '" data-b="' + b + '" title="Remove">&#10005;</button></div>';
    }
    h += '<button class="add-sub-btn" data-f="hcba" data-i="' + i + '">+ Add Feature</button>';
    h += '</div>';
    h += '</div>';
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-f="hcn"]').forEach(function(inp){ inp.addEventListener('input', function(){ healthCheckData[+this.dataset.i].name = this.value; }); });
  el.querySelectorAll('[data-f="hcp"]').forEach(function(inp){ inp.addEventListener('input', function(){ healthCheckData[+this.dataset.i].price = parseFloat(this.value) || 0; }); });
  el.querySelectorAll('[data-f="hcr"]').forEach(async function(btn){ btn.addEventListener('click', async function(){ if(!await hwConfirm('Delete this tier? This cannot be undone.', {title:'Delete Tier', confirmLabel:'Delete'})) return; healthCheckData.splice(+this.dataset.i, 1); renderHealthCheck(); }); });
  el.querySelectorAll('[data-f="hci"]').forEach(function(inp){ inp.addEventListener('change', function(){
    var idx = +this.dataset.i, oid = parseInt(this.dataset.oid);
    var arr = healthCheckData[idx].inherits_from || [];
    if(this.checked){ if(arr.indexOf(oid) < 0) arr.push(oid); }
    else { arr = arr.filter(function(x){ return x !== oid; }); }
    healthCheckData[idx].inherits_from = arr;
  }); });
  el.querySelectorAll('[data-f="hcbl"]').forEach(function(inp){ inp.addEventListener('input', function(){ healthCheckData[+this.dataset.i].includes[+this.dataset.b] = this.value; }); });
  el.querySelectorAll('[data-f="hcbr"]').forEach(function(btn){ btn.addEventListener('click', function(){ healthCheckData[+this.dataset.i].includes.splice(+this.dataset.b, 1); renderHealthCheck(); }); });
  el.querySelectorAll('[data-f="hcba"]').forEach(function(btn){ btn.addEventListener('click', function(){ var idx = +this.dataset.i; if(!healthCheckData[idx].includes) healthCheckData[idx].includes = []; healthCheckData[idx].includes.push(''); renderHealthCheck(); var inputs = el.querySelectorAll('[data-f="hcbl"][data-i="' + idx + '"]'); if(inputs.length) inputs[inputs.length-1].focus(); }); });
}

// ═══ "Add" BUTTON LISTENERS ═══════════════════════
document.addEventListener('DOMContentLoaded', function(){
  var addBaseBtn = document.getElementById('addBaseBtn');
  if(addBaseBtn) addBaseBtn.addEventListener('click', function(){ window._hbShared.cfg.pricing.baseServices.push({ id: uid(), name: 'New Inspection' }); renderBaseServices(); });

  var addAddonBtn = document.getElementById('addAddonBtn');
  if(addAddonBtn) addAddonBtn.addEventListener('click', function(){ window._hbShared.cfg.pricing.addonServices.push({ id: uid(), name: 'New Service', price: 100 }); renderAddonServices(); });

  var addTierBtn = document.getElementById('addTierBtn');
  if(addTierBtn) addTierBtn.addEventListener('click', function(){ window._hbShared.cfg.pricing.homeSizeTiers.push({ label: 'New Tier', price: 400 }); renderTiers(); });

  var addCouponBtn = document.getElementById('addCouponBtn');
  if(addCouponBtn) addCouponBtn.addEventListener('click', function(){
    if(!window._hbShared.cfg.coupons) window._hbShared.cfg.coupons = [];
    window._hbShared.cfg.coupons.push({ code: '', value: 0, type: 'flat', active: true });
    renderCoupons();
  });

  var addCategoryBtn = document.getElementById('addCategoryBtn');
  if(addCategoryBtn) addCategoryBtn.addEventListener('click', function(){
    categoriesData.push({ id: uid(), name: 'New Category', tagline: '', icon: '', has_home_size: false, has_year_built: false, has_addons: false, has_discounting: false, active: true });
    renderCategories();
  });

  var addYearBuiltBtn = document.getElementById('addYearBuiltBtn');
  if(addYearBuiltBtn) addYearBuiltBtn.addEventListener('click', function(){
    yearBuiltData.push({ label: 'New Bracket', min_year: null, max_year: null, surcharge: 0 });
    renderYearBuilt();
  });

  var addRecommendationBtn = document.getElementById('addRecommendationBtn');
  if(addRecommendationBtn) addRecommendationBtn.addEventListener('click', function(){
    var firstAddon = (window._hbShared.cfg.pricing.addonServices[0] || {}).id || 'radon';
    recommendationsData.push({ addon_id: firstAddon, field: 'yearBuilt', operator: 'lt', value: '2000', reason: '', priority: 5, active: true });
    renderRecommendations();
  });

  var recMasterToggle = document.getElementById('recMasterToggle');
  if(recMasterToggle) recMasterToggle.addEventListener('change', function(){
    var on = this.checked;
    recommendationsData.forEach(function(r){ r.active = on; });
    document.getElementById('recMasterLabel').textContent = on ? 'All On' : 'All Off';
    document.getElementById('recMasterLabel').style.color = on ? 'var(--primary)' : 'var(--text-light)';
  });

  var addNewConBtn = document.getElementById('addNewConBtn');
  if(addNewConBtn) addNewConBtn.addEventListener('click', function(){
    newConData.push({ name: 'New Phase', price: 0, is_bundle: false, includes: [], active: true });
    renderNewCon();
  });

  var addHealthCheckBtn = document.getElementById('addHealthCheckBtn');
  if(addHealthCheckBtn) addHealthCheckBtn.addEventListener('click', function(){
    healthCheckData.push({ name: 'New Tier', price: 0, includes: [], inherits_from: [], active: true });
    renderHealthCheck();
  });
});

// ═══ WINDOW EXPORTS ══════════════════════════════
window.loadConfig = loadConfig;
window.saveConfig = saveConfig;
window.renderWeekly = renderWeekly;
window.renderSettings = renderSettings;
window.readSettings = readSettings;
window.initOC = initOC;
window.renderOC = renderOC;
window.showEditor = showEditor;
window.renderBaseServices = renderBaseServices;
window.renderAddonServices = renderAddonServices;
window.renderTiers = renderTiers;
window.renderDiscounts = renderDiscounts;
window.updatePreview = updatePreview;
window.calcPreview = calcPreview;
window.renderPricing = renderPricing;
window.readPricing = readPricing;
window.renderCoupons = renderCoupons;
window.renderCategories = renderCategories;
window.renderYearBuilt = renderYearBuilt;
window.renderRecommendations = renderRecommendations;
window.renderNewCon = renderNewCon;
window.renderHealthCheck = renderHealthCheck;
