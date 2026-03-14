/**
 * inspector-app.js — Main application controller for the inspection wizard
 * Namespace: window.HIG_INSPECTOR.app
 *
 * Screens: Login → Dashboard → Detail → Agreement → Section Wizard → Review → Submit
 */
(function() {
  'use strict';

  var SUPABASE_URL = 'https://fusravedbksupcsjfzda.supabase.co';
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

  /* ═══ STATE ═══ */
  var currentInspector = null;
  var currentInspection = null;
  var activeSections = [];       /* sections for current inspection */
  var activeSectionIndex = 0;    /* current section index */
  var sectionDataMap = {};       /* section_id -> data */
  var photoMap = {};             /* section_id -> [photos] */
  var darkMode = false;
  var autoSaveTimer = null;
  var isDemo = false;            /* demo mode flag */

  var sync, db, sections, photos, voice;

  /* ═══ INITIALIZATION ═══ */
  function init() {
    db = window.HIG_INSPECTOR.db;
    sync = window.HIG_INSPECTOR.sync;
    sections = window.HIG_INSPECTOR.sections;
    photos = window.HIG_INSPECTOR.photos;
    voice = window.HIG_INSPECTOR.voice;

    /* Init modules */
    db.open().then(function() {
      sync.init();
      voice.init();
    });

    /* Dark mode */
    darkMode = localStorage.getItem('iw-dark-mode') === 'true';
    if (darkMode) document.body.classList.add('dark-mode');

    /* Demo mode detection */
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === 'true') {
      isDemo = true;
      initDemoMode();
      bindGlobalEvents();
      return;
    }

    /* Check stored session */
    var stored = sessionStorage.getItem('heartland_inspector');
    if (stored) {
      try {
        currentInspector = JSON.parse(stored);
        showDashboard();
      } catch (e) {
        sessionStorage.removeItem('heartland_inspector');
      }
    }

    bindGlobalEvents();
  }

  function bindGlobalEvents() {
    /* Login */
    var loginBtn = document.getElementById('iwLoginBtn');
    if (loginBtn) loginBtn.addEventListener('click', doLogin);
    var loginInput = document.getElementById('iwEmail');
    if (loginInput) loginInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doLogin();
    });

    /* Dark mode toggle */
    var darkBtn = document.getElementById('iwDarkToggle');
    if (darkBtn) darkBtn.addEventListener('click', toggleDarkMode);

    /* Logout */
    var logoutBtn = document.getElementById('iwLogoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

    /* Back buttons */
    document.addEventListener('click', function(e) {
      if (e.target.closest('.iw-back-btn')) {
        var screen = e.target.closest('.iw-back-btn').dataset.back;
        if (screen === 'dashboard') showDashboard();
        else if (screen === 'detail') showDetail(currentInspection);
        else if (screen === 'section') showSectionWizard();
      }
    });

    /* Section drawer toggle */
    var drawerBtn = document.getElementById('iwDrawerToggle');
    if (drawerBtn) drawerBtn.addEventListener('click', toggleSectionDrawer);

    /* Sync completed event */
    document.addEventListener('inspection-synced', function() {
      updateProgressUI();
    });
  }

  /* ═══ DEMO MODE ═══ */
  function createDemoInspection() {
    return {
      id: 'demo-' + Date.now(),
      client_id: '3bee2c02-85d7-4ca6-a14a-83a2efebaaff',
      inspection_address: '234 Training Lane, Rockford, IL 61101',
      inspection_date: new Date().toISOString().split('T')[0],
      state_code: 'IL',
      status: 'scheduled',
      ordered_services: ['radon', 'mold'],
      property_data: { has_garage: true, year_built: 1985, sqft: 2200 },
      clients: { name: 'Client Test', email: 'clienttest@mail.com', phone: '555-0000' },
      total_sections: 0,
      completed_sections: 0
    };
  }

  function initDemoMode() {
    /* Auto-login: use stored inspector or create temp identity */
    var stored = sessionStorage.getItem('heartland_inspector');
    if (stored) {
      try { currentInspector = JSON.parse(stored); } catch (e) { /* ignore */ }
    }
    if (!currentInspector) {
      currentInspector = {
        id: 'demo-inspector',
        name: 'Demo Inspector',
        email: 'demo@heartlandinspectiongroup.com',
        role: 'inspector',
        active: true
      };
    }

    /* Skip login + dashboard, go straight to detail */
    var demoInspection = createDemoInspection();
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('iwInspectorApp').style.display = '';
    document.getElementById('iwInspectorName').textContent = currentInspector.name;

    /* Add demo banner */
    showDemoBanner();
    document.body.classList.add('iw-demo-mode');

    /* Attempt Fullscreen API for mobile kiosk experience */
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(function() { /* user gesture required */ });
    }

    showDetail(demoInspection);
  }

  function showDemoBanner() {
    var banner = document.createElement('div');
    banner.id = 'iwDemoBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#f59321;color:#fff;text-align:center;padding:8px 12px;font-weight:600;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.2);';
    banner.textContent = '[DEMO MODE] This is a training inspection \u2014 data will only appear on the test client portal';
    document.body.prepend(banner);
    /* Push app content down to avoid overlap */
    document.body.style.paddingTop = '40px';
  }

  function isDemoInspection(inspection) {
    return inspection && typeof inspection.id === 'string' && inspection.id.startsWith('demo-');
  }

  function drawDemoSignature(canvas) {
    var ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.font = 'italic 24px cursive';
    ctx.fillStyle = '#888';
    ctx.fillText('Demo', 40, 90);
  }

  function submitDemoInspection() {
    /* Compile findings from sectionDataMap */
    var findings = {};
    activeSections.forEach(function(s) {
      var data = sectionDataMap[s.id] || {};
      findings[s.id] = {
        section_name: s.name,
        group_name: s.group_name,
        status: data.status || 'not_started',
        items: data.items || [],
        general_comment: data.general_comment || '',
        flagged: data.flagged || false,
        skip_reason: data.skip_reason || ''
      };
    });

    /* Build the v2 findings payload */
    var payload = {
      client_id: '3bee2c02-85d7-4ca6-a14a-83a2efebaaff',
      inspector_id: currentInspector.id === 'demo-inspector' ? null : currentInspector.id,
      inspection_address: currentInspection.inspection_address,
      inspection_date: currentInspection.inspection_date,
      state_code: currentInspection.state_code,
      ordered_services: currentInspection.ordered_services,
      property_data: currentInspection.property_data,
      status: 'delivered',
      total_sections: activeSections.length,
      completed_sections: countCompleted(),
      findings_v2: findings,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      notes: 'Demo/training inspection'
    };

    /* Insert into inspection_records for the test client */
    sync.sbFetch('inspection_records', {
      method: 'POST',
      body: JSON.stringify(payload)
    }).then(function(r) {
      if (!r.ok) throw new Error('Demo submit failed: ' + r.status);
      return r.json();
    }).then(function() {
      showDemoSuccess();
    }).catch(function(err) {
      console.error('[demo-submit]', err);
      alert('Demo submit error: ' + err.message + '\nSection data is still saved locally.');
    });
  }

  function showDemoSuccess() {
    showScreen('screenReview');
    var container = document.getElementById('iwReviewContent');
    container.innerHTML =
      '<div style="text-align:center;padding:40px 20px;">' +
        '<div style="font-size:64px;margin-bottom:16px;">&#x2705;</div>' +
        '<h2 style="margin-bottom:12px;">Demo Complete!</h2>' +
        '<p style="margin-bottom:24px;color:#555;max-width:400px;margin-left:auto;margin-right:auto;">' +
          'The training report has been delivered to the test client portal.' +
        '</p>' +
        '<div style="background:#f4f5f7;border-radius:8px;padding:16px;max-width:360px;margin:0 auto 24px;">' +
          '<p style="margin:0 0 4px;font-weight:600;">View the report:</p>' +
          '<p style="margin:0;">Client Portal &rarr; <strong>clienttest@mail.com</strong></p>' +
        '</div>' +
        '<button class="iw-btn iw-btn-secondary" onclick="window.close()">Close Window</button>' +
      '</div>';
  }

  /* ═══ LOGIN ═══ */
  function doLogin() {
    var emailInput = document.getElementById('iwEmail');
    var errEl = document.getElementById('iwLoginError');
    var email = emailInput.value.trim().toLowerCase();
    errEl.style.display = 'none';

    if (!email) {
      errEl.textContent = 'Please enter your email';
      errEl.style.display = '';
      return;
    }

    var url = 'agents?email=eq.' + encodeURIComponent(email) +
      '&or=(role.eq.inspector,role.eq.admin)&active=eq.true&select=*';

    sync.sbFetch(url).then(function(r) { return r.json(); }).then(function(rows) {
      if (rows && rows.length === 1) {
        currentInspector = rows[0];
        sessionStorage.setItem('heartland_inspector', JSON.stringify(currentInspector));
        showDashboard();
      } else {
        errEl.textContent = 'No active inspector account found for this email';
        errEl.style.display = '';
      }
    }).catch(function() {
      errEl.textContent = 'Connection error. Please try again.';
      errEl.style.display = '';
    });
  }

  function doLogout() {
    currentInspector = null;
    currentInspection = null;
    sessionStorage.removeItem('heartland_inspector');
    showScreen('loginScreen');
    document.getElementById('iwInspectorApp').style.display = 'none';
    document.getElementById('loginScreen').style.display = '';
  }

  /* ═══ SCREEN MANAGEMENT ═══ */
  function showScreen(screenId) {
    var screens = document.querySelectorAll('.iw-screen');
    screens.forEach(function(s) { s.classList.remove('active'); });
    var target = document.getElementById(screenId);
    if (target) target.classList.add('active');
    window.scrollTo(0, 0);
  }

  /* ═══ DASHBOARD ═══ */
  function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('iwInspectorApp').style.display = '';
    document.getElementById('iwInspectorName').textContent = currentInspector.name;
    showScreen('screenDashboard');
    loadDashboard();
  }

  function loadDashboard() {
    var container = document.getElementById('iwInspectionCards');
    container.innerHTML = '<div class="iw-loading">Loading inspections...</div>';

    sync.fetchTodayInspections(currentInspector.id).then(function(inspections) {
      if (!inspections || !inspections.length) {
        container.innerHTML = '<div class="iw-empty-state">' +
          '<div class="iw-empty-icon">📋</div>' +
          '<h3>No inspections today</h3>' +
          '<p>Check back later or contact the office.</p>' +
          '</div>';
        return;
      }

      container.innerHTML = inspections.map(function(insp) {
        var statusBadge = getStatusBadge(insp.status || 'scheduled');
        var clientName = insp.clients ? insp.clients.name : 'Unknown Client';
        return '<div class="iw-inspection-card" data-id="' + insp.id + '">' +
          '<div class="iw-card-header">' +
            '<span class="iw-card-time">' + formatTime(insp.inspection_date) + '</span>' +
            statusBadge +
          '</div>' +
          '<h3 class="iw-card-address">' + escapeHtml(insp.inspection_address) + '</h3>' +
          '<p class="iw-card-client">' + escapeHtml(clientName) + '</p>' +
          '<div class="iw-card-services">' + renderServiceTags(insp.ordered_services) + '</div>' +
          '<div class="iw-card-progress">' + renderProgressBar(insp) + '</div>' +
          '</div>';
      }).join('');

      /* Bind card clicks */
      container.querySelectorAll('.iw-inspection-card').forEach(function(card) {
        card.addEventListener('click', function() {
          var id = this.dataset.id;
          var insp = inspections.find(function(i) { return i.id === id; });
          if (insp) showDetail(insp);
        });
      });
    });
  }

  /* ═══ DETAIL SCREEN ═══ */
  function showDetail(inspection) {
    currentInspection = inspection;
    showScreen('screenDetail');

    var container = document.getElementById('iwDetailContent');
    var clientName = inspection.clients ? inspection.clients.name : 'Unknown';
    var clientEmail = inspection.clients ? inspection.clients.email : '';
    var clientPhone = inspection.clients ? inspection.clients.phone : '';

    container.innerHTML =
      '<div class="iw-detail-header">' +
        '<h2>' + escapeHtml(inspection.inspection_address) + '</h2>' +
        getStatusBadge(inspection.status || 'scheduled') +
      '</div>' +
      '<div class="iw-detail-info">' +
        '<div class="iw-info-row"><span class="iw-info-label">Client</span><span>' + escapeHtml(clientName) + '</span></div>' +
        (clientEmail ? '<div class="iw-info-row"><span class="iw-info-label">Email</span><a href="mailto:' + escapeHtml(clientEmail) + '">' + escapeHtml(clientEmail) + '</a></div>' : '') +
        (clientPhone ? '<div class="iw-info-row"><span class="iw-info-label">Phone</span><a href="tel:' + escapeHtml(clientPhone) + '">' + escapeHtml(clientPhone) + '</a></div>' : '') +
        '<div class="iw-info-row"><span class="iw-info-label">Date</span><span>' + inspection.inspection_date + '</span></div>' +
        '<div class="iw-info-row"><span class="iw-info-label">State</span><span>' + (inspection.state_code || 'IL') + '</span></div>' +
        '<div class="iw-info-row"><span class="iw-info-label">Services</span><div>' + renderServiceTags(inspection.ordered_services) + '</div></div>' +
      '</div>' +
      '<div class="iw-detail-actions">' +
        '<button class="iw-btn iw-btn-primary" id="iwStartInspection">' +
          (inspection.status === 'in_progress' ? 'Continue Inspection' : 'Start Inspection') +
        '</button>' +
      '</div>';

    document.getElementById('iwStartInspection').addEventListener('click', function() {
      startInspection(inspection);
    });
  }

  /* ═══ START INSPECTION ═══ */
  function startInspection(inspection) {
    currentInspection = inspection;
    var stateCode = inspection.state_code || 'IL';

    /* Load sections + compliance in parallel */
    var sectionDataPromise = isDemoInspection(inspection)
      ? Promise.resolve([])
      : sync.fetchSectionData(inspection.id);

    Promise.all([
      sections.loadSections(),
      sections.loadComplianceRules(stateCode),
      sectionDataPromise
    ]).then(function(results) {
      var existingData = results[2] || [];

      /* Filter sections for this inspection's ordered services */
      activeSections = sections.getSectionsForInspection(
        inspection.ordered_services || [],
        inspection.property_data || {}
      );

      /* Apply compliance rules */
      activeSections = sections.applyComplianceRules(activeSections, stateCode);

      /* Build section data map from existing data */
      sectionDataMap = {};
      existingData.forEach(function(sd) {
        sectionDataMap[sd.section_id] = sd;
      });

      /* Check agreement gate for IL */
      if (stateCode === 'IL' && inspection.status !== 'in_progress') {
        checkAgreementGate(inspection).then(function(hasAgreement) {
          if (hasAgreement) {
            beginSectionWizard(inspection);
          } else {
            showAgreementScreen(inspection);
          }
        });
      } else {
        beginSectionWizard(inspection);
      }
    });
  }

  /* ═══ AGREEMENT GATE ═══ */
  function checkAgreementGate(inspection) {
    if (isDemoInspection(inspection)) return Promise.resolve(false);
    return sync.sbFetch('inspection_agreements?inspection_record_id=eq.' + inspection.id + '&select=id')
      .then(function(r) { return r.json(); })
      .then(function(rows) { return rows && rows.length > 0; })
      .catch(function() { return false; });
  }

  function showAgreementScreen(inspection) {
    showScreen('screenAgreement');
    var stateCode = inspection.state_code || 'IL';
    var container = document.getElementById('iwAgreementContent');

    var agreementText = stateCode === 'IL' ? getILAgreementText() : getWIAgreementText();

    container.innerHTML =
      '<h2>Pre-Inspection Agreement</h2>' +
      '<p class="iw-agreement-state">State: ' + stateCode + '</p>' +
      '<div class="iw-agreement-text">' + escapeHtml(agreementText).replace(/\n/g, '<br>') + '</div>' +
      '<div class="iw-signature-section">' +
        '<div class="iw-sig-block">' +
          '<label>Client Signature</label>' +
          '<canvas id="iwClientSigCanvas" class="iw-sig-canvas" width="320" height="150"></canvas>' +
          '<button class="iw-btn iw-btn-small" id="iwClearClientSig">Clear</button>' +
        '</div>' +
        '<div class="iw-sig-block">' +
          '<label>Inspector Signature</label>' +
          '<canvas id="iwInspectorSigCanvas" class="iw-sig-canvas" width="320" height="150"></canvas>' +
          '<button class="iw-btn iw-btn-small" id="iwClearInspectorSig">Clear</button>' +
        '</div>' +
      '</div>' +
      '<button class="iw-btn iw-btn-primary" id="iwSignAgreement" disabled>Both Signatures Required</button>';

    /* Init signature pads */
    var clientCanvas = document.getElementById('iwClientSigCanvas');
    var inspectorCanvas = document.getElementById('iwInspectorSigCanvas');
    var clientSig = initSignaturePad(clientCanvas);
    var inspectorSig = initSignaturePad(inspectorCanvas);

    document.getElementById('iwClearClientSig').addEventListener('click', function() {
      clientSig.clear();
      checkSignatures();
    });
    document.getElementById('iwClearInspectorSig').addEventListener('click', function() {
      inspectorSig.clear();
      checkSignatures();
    });

    /* Demo mode: auto-draw signatures */
    if (isDemo) {
      drawDemoSignature(clientCanvas);
      drawDemoSignature(inspectorCanvas);
      clientSig.hasSignature = true;
      inspectorSig.hasSignature = true;
      checkSignatures();
    }

    function checkSignatures() {
      var btn = document.getElementById('iwSignAgreement');
      if (clientSig.hasSignature && inspectorSig.hasSignature) {
        btn.disabled = false;
        btn.textContent = 'Accept & Continue';
      } else {
        btn.disabled = true;
        btn.textContent = 'Both Signatures Required';
      }
    }

    /* Listen for signature changes */
    clientCanvas.addEventListener('pointerup', checkSignatures);
    inspectorCanvas.addEventListener('pointerup', checkSignatures);

    document.getElementById('iwSignAgreement').addEventListener('click', function() {
      /* Save agreement */
      var agreementData = {
        agreement_text: agreementText,
        state_code: stateCode,
        client_signature_url: clientCanvas.toDataURL('image/png'),
        inspector_signature_url: inspectorCanvas.toDataURL('image/png'),
        client_signed_at: new Date().toISOString(),
        inspector_signed_at: new Date().toISOString()
      };
      sync.saveAgreement(inspection.id, agreementData).then(function() {
        beginSectionWizard(inspection);
      });
    });
  }

  /** Simple signature pad using canvas */
  function initSignaturePad(canvas) {
    var ctx = canvas.getContext('2d');
    var drawing = false;
    var pad = { hasSignature: false, clear: function() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pad.hasSignature = false;
    }};

    ctx.strokeStyle = '#1a2530';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var touch = e.touches ? e.touches[0] : e;
      return {
        x: (touch.clientX - rect.left) * (canvas.width / rect.width),
        y: (touch.clientY - rect.top) * (canvas.height / rect.height)
      };
    }

    canvas.addEventListener('pointerdown', function(e) {
      drawing = true;
      var pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', function(e) {
      if (!drawing) return;
      var pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      pad.hasSignature = true;
      e.preventDefault();
    });

    canvas.addEventListener('pointerup', function() { drawing = false; });
    canvas.addEventListener('pointerleave', function() { drawing = false; });

    return pad;
  }

  function getILAgreementText() {
    return 'PRE-INSPECTION AGREEMENT — STATE OF ILLINOIS\n\n' +
      'This agreement is between the Client and Heartland Inspection Group ' +
      '("Inspector") for a home inspection of the property identified in this ' +
      'inspection record.\n\n' +
      'The inspection will be conducted in accordance with the Illinois Home ' +
      'Inspector License Act (225 ILCS 441) and the Standards of Practice adopted ' +
      'by the Illinois Department of Financial and Professional Regulation.\n\n' +
      'The inspection is a visual, non-invasive examination of the accessible ' +
      'areas of the property. It is not technically exhaustive and does not ' +
      'include concealed or inaccessible areas.\n\n' +
      'By signing below, both parties agree to the terms of this inspection.';
  }

  function getWIAgreementText() {
    return 'PRE-INSPECTION AGREEMENT — STATE OF WISCONSIN\n\n' +
      'This agreement is between the Client and Heartland Inspection Group ' +
      '("Inspector") for a home inspection of the property identified in this ' +
      'inspection record.\n\n' +
      'The inspection will be conducted in accordance with Wisconsin ' +
      'Administrative Code Chapter SPS 131-132 and §440.97.\n\n' +
      'The inspection is a visual, non-invasive examination of the accessible ' +
      'areas of the property. It is not technically exhaustive.\n\n' +
      'By signing below, both parties agree to the terms of this inspection.';
  }

  /* ═══ SECTION WIZARD ═══ */
  function beginSectionWizard(inspection) {
    /* Update status if needed */
    if (inspection.status === 'scheduled' || inspection.status === 'agreement_pending') {
      inspection.status = 'in_progress';
      if (!isDemoInspection(inspection)) {
        sync.saveStatusChange(inspection.id, 'in_progress');
      }
    }

    /* Update total sections count */
    inspection.total_sections = activeSections.length;
    if (!isDemoInspection(inspection)) {
      sync.sbFetch('inspection_records?id=eq.' + inspection.id, {
        method: 'PATCH',
        body: JSON.stringify({ total_sections: activeSections.length })
      });
    }

    /* Find first incomplete section or start at 0 */
    activeSectionIndex = 0;
    for (var i = 0; i < activeSections.length; i++) {
      var sd = sectionDataMap[activeSections[i].id];
      if (!sd || sd.status === 'not_started' || sd.status === 'in_progress') {
        activeSectionIndex = i;
        break;
      }
    }

    showSectionWizard();
  }

  function showSectionWizard() {
    showScreen('screenSection');
    renderCurrentSection();
    updateProgressUI();
    buildSectionDrawer();
  }

  function renderCurrentSection() {
    var section = activeSections[activeSectionIndex];
    if (!section) return;

    var container = document.getElementById('iwSectionContent');
    var existing = sectionDataMap[section.id] || {};
    var existingItems = existing.items || [];
    if (typeof existingItems === 'string') existingItems = JSON.parse(existingItems);

    /* Section header */
    var html = '<div class="iw-section-header">' +
      '<span class="iw-section-icon">' + (section.icon || '') + '</span>' +
      '<div>' +
        '<h2 class="iw-section-title">' + escapeHtml(section.name) + '</h2>' +
        '<span class="iw-section-group">' + escapeHtml(section.group_name) + '</span>' +
      '</div>' +
      '</div>';

    /* Checklist items */
    html += '<div class="iw-checklist">';
    section.items.forEach(function(item) {
      var savedItem = existingItems.find(function(si) { return si.id === item.id; }) || {};
      html += renderChecklistItem(item, savedItem);
    });
    html += '</div>';

    /* General comment area */
    html += '<div class="iw-comment-area">' +
      '<label>General Comments</label>' +
      '<div class="iw-comment-row">' +
        '<textarea id="iwSectionComment" class="iw-textarea" rows="3" placeholder="Enter observations...">' +
          escapeHtml(existing.general_comment || '') +
        '</textarea>' +
        '<button class="iw-voice-btn" title="Start dictation" id="iwVoiceBtn">🎤</button>' +
      '</div>' +
    '</div>';

    /* Photo area */
    html += '<div class="iw-photo-area">' +
      '<div class="iw-photo-header">' +
        '<label>Photos</label>' +
        '<div class="iw-photo-actions">' +
          '<button class="iw-btn iw-btn-small" id="iwCapturePhoto">📷 Camera</button>' +
          '<button class="iw-btn iw-btn-small" id="iwPickPhoto">🖼 Gallery</button>' +
        '</div>' +
      '</div>' +
      '<div id="iwPhotoGrid" class="iw-photo-grid"></div>' +
    '</div>';

    /* Section actions */
    html += '<div class="iw-section-actions">' +
      '<button class="iw-btn iw-btn-secondary" id="iwSkipSection"' +
        (section._compliance_mandatory ? ' disabled title="This section is required"' : '') +
      '>Skip</button>' +
      '<button class="iw-btn iw-btn-flag" id="iwFlagSection"' +
        (existing.flagged ? ' class="iw-btn iw-btn-flag flagged"' : '') +
      '>⚑ Flag</button>' +
      '<button class="iw-btn iw-btn-primary" id="iwCompleteSection">Complete & Next</button>' +
    '</div>';

    /* Navigation */
    html += '<div class="iw-section-nav">' +
      '<button class="iw-btn iw-btn-small" id="iwPrevSection"' +
        (activeSectionIndex === 0 ? ' disabled' : '') +
      '>← Previous</button>' +
      '<span class="iw-section-counter">' + (activeSectionIndex + 1) + ' / ' + activeSections.length + '</span>' +
      '<button class="iw-btn iw-btn-small" id="iwNextSection"' +
        (activeSectionIndex === activeSections.length - 1 ? ' disabled' : '') +
      '>Next →</button>' +
    '</div>';

    container.innerHTML = html;

    /* Bind events */
    bindSectionEvents(section);
    loadSectionPhotos(section);
  }

  function renderChecklistItem(item, savedData) {
    var html = '<div class="iw-checklist-item" data-item-id="' + item.id + '">';
    html += '<label class="iw-item-label">' + escapeHtml(item.label);
    if (item.required) html += ' <span class="iw-required">*</span>';
    if (item.compliance_note) html += ' <span class="iw-compliance-badge" title="' + escapeHtml(item.compliance_note) + '">⚖️</span>';
    html += '</label>';

    if (item.type === 'select') {
      html += '<select class="iw-select" data-item-id="' + item.id + '">';
      html += '<option value="">— Select —</option>';
      (item.options || []).forEach(function(opt) {
        var sel = savedData.value === opt ? ' selected' : '';
        html += '<option value="' + escapeHtml(opt) + '"' + sel + '>' + escapeHtml(opt) + '</option>';
      });
      html += '</select>';
    } else if (item.type === 'text') {
      html += '<input type="text" class="iw-input" data-item-id="' + item.id + '" value="' + escapeHtml(savedData.value || '') + '" />';
    } else if (item.type === 'condition') {
      var conditions = ['Satisfactory', 'Minor Defect', 'Major Defect', 'Not Inspected', 'Not Present'];
      html += '<div class="iw-condition-btns" data-item-id="' + item.id + '">';
      conditions.forEach(function(c) {
        var active = savedData.condition === c ? ' active' : '';
        var cls = c.toLowerCase().replace(/\s+/g, '-');
        html += '<button class="iw-cond-btn iw-cond-' + cls + active + '" data-condition="' + c + '">' + c + '</button>';
      });
      html += '</div>';
      /* Defect comment (shown when Minor/Major selected) */
      var showComment = savedData.condition === 'Minor Defect' || savedData.condition === 'Major Defect';
      html += '<textarea class="iw-item-comment' + (showComment ? '' : ' hidden') + '" data-item-id="' + item.id + '" placeholder="Describe the defect...">' +
        escapeHtml(savedData.comment || '') + '</textarea>';
    }

    html += '</div>';
    return html;
  }

  function bindSectionEvents(section) {
    /* Condition buttons */
    document.querySelectorAll('.iw-condition-btns').forEach(function(group) {
      group.querySelectorAll('.iw-cond-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          group.querySelectorAll('.iw-cond-btn').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          var itemId = group.dataset.itemId;
          var commentEl = document.querySelector('textarea.iw-item-comment[data-item-id="' + itemId + '"]');
          if (commentEl) {
            var isDefect = btn.dataset.condition === 'Minor Defect' || btn.dataset.condition === 'Major Defect';
            commentEl.classList.toggle('hidden', !isDefect);
          }
          scheduleAutoSave();
        });
      });
    });

    /* Select changes */
    document.querySelectorAll('.iw-select').forEach(function(sel) {
      sel.addEventListener('change', scheduleAutoSave);
    });

    /* Input changes */
    document.querySelectorAll('.iw-input').forEach(function(inp) {
      inp.addEventListener('input', scheduleAutoSave);
    });

    /* Item comments */
    document.querySelectorAll('.iw-item-comment').forEach(function(ta) {
      ta.addEventListener('input', function() {
        /* Validate blocked language */
        var violations = sections.validateComment(ta.value, currentInspection.state_code || 'IL');
        if (violations.length) {
          ta.classList.add('iw-warning');
          ta.title = violations.join('; ');
        } else {
          ta.classList.remove('iw-warning');
          ta.title = '';
        }
        scheduleAutoSave();
      });
    });

    /* General comment */
    var commentEl = document.getElementById('iwSectionComment');
    if (commentEl) {
      commentEl.addEventListener('input', function() {
        var violations = sections.validateComment(commentEl.value, currentInspection.state_code || 'IL');
        if (violations.length) {
          commentEl.classList.add('iw-warning');
          commentEl.title = violations.join('; ');
        } else {
          commentEl.classList.remove('iw-warning');
          commentEl.title = '';
        }
        scheduleAutoSave();
      });
    }

    /* Voice button */
    var voiceBtn = document.getElementById('iwVoiceBtn');
    if (voiceBtn) {
      voiceBtn.addEventListener('click', function() {
        voice.toggleListening(commentEl);
      });
    }

    /* Photo capture */
    var captureBtn = document.getElementById('iwCapturePhoto');
    if (captureBtn) captureBtn.addEventListener('click', function() {
      photos.capturePhoto().then(function(compressed) {
        return photos.savePhoto({
          inspectionId: currentInspection.id,
          sectionId: section.id
        }, compressed);
      }).then(function(record) {
        appendPhotoToGrid(record);
      }).catch(function(err) {
        if (err.message !== 'No photo selected') console.error('[photos]', err);
      });
    });

    var pickBtn = document.getElementById('iwPickPhoto');
    if (pickBtn) pickBtn.addEventListener('click', function() {
      photos.pickFromGallery().then(function(compressed) {
        return photos.savePhoto({
          inspectionId: currentInspection.id,
          sectionId: section.id
        }, compressed);
      }).then(function(record) {
        appendPhotoToGrid(record);
      }).catch(function(err) {
        if (err.message !== 'No photo selected') console.error('[photos]', err);
      });
    });

    /* Section actions */
    document.getElementById('iwSkipSection').addEventListener('click', function() {
      if (section._compliance_mandatory) return;
      var reason = prompt('Reason for skipping this section:');
      if (reason !== null) {
        saveSectionState(section.id, 'skipped', reason);
        goNextSection();
      }
    });

    document.getElementById('iwFlagSection').addEventListener('click', function() {
      var data = sectionDataMap[section.id] || {};
      data.flagged = !data.flagged;
      sectionDataMap[section.id] = data;
      this.classList.toggle('flagged', data.flagged);
      scheduleAutoSave();
    });

    document.getElementById('iwCompleteSection').addEventListener('click', function() {
      /* Validate required items */
      var missing = validateSectionItems(section);
      if (missing.length) {
        /* Scroll to first missing item and highlight it */
        var firstMissing = findFirstMissingElement(section);
        if (firstMissing) {
          firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstMissing.classList.add('iw-validation-error');
          setTimeout(function() { firstMissing.classList.remove('iw-validation-error'); }, 2000);
        }
        alert('Please complete required items:\n• ' + missing.join('\n• '));
        return;
      }
      saveSectionState(section.id, 'completed');
      goNextSection();
    });

    /* Navigation */
    document.getElementById('iwPrevSection').addEventListener('click', function() {
      if (activeSectionIndex > 0) {
        collectCurrentSectionData();
        activeSectionIndex--;
        renderCurrentSection();
        updateProgressUI();
        buildSectionDrawer();
      }
    });

    document.getElementById('iwNextSection').addEventListener('click', function() {
      if (activeSectionIndex < activeSections.length - 1) {
        collectCurrentSectionData();
        activeSectionIndex++;
        renderCurrentSection();
        updateProgressUI();
        buildSectionDrawer();
      }
    });
  }

  /* ═══ AUTO-SAVE ═══ */
  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function() {
      var section = activeSections[activeSectionIndex];
      if (!section) return;
      var data = collectCurrentSectionData();
      sync.autoSave(currentInspection.id, section.id, data);
    }, 1000);
  }

  function collectCurrentSectionData() {
    var section = activeSections[activeSectionIndex];
    if (!section) return {};

    var items = [];
    section.items.forEach(function(item) {
      var entry = { id: item.id };

      if (item.type === 'select') {
        var sel = document.querySelector('.iw-select[data-item-id="' + item.id + '"]');
        entry.value = sel ? sel.value : '';
      } else if (item.type === 'text') {
        var inp = document.querySelector('.iw-input[data-item-id="' + item.id + '"]');
        entry.value = inp ? inp.value : '';
      } else if (item.type === 'condition') {
        var activeBtn = document.querySelector('.iw-condition-btns[data-item-id="' + item.id + '"] .iw-cond-btn.active');
        entry.condition = activeBtn ? activeBtn.dataset.condition : '';
        var commentEl = document.querySelector('textarea.iw-item-comment[data-item-id="' + item.id + '"]');
        entry.comment = commentEl ? commentEl.value : '';
      }

      items.push(entry);
    });

    var commentEl = document.getElementById('iwSectionComment');
    var existing = sectionDataMap[section.id] || {};

    var data = {
      status: existing.status || 'in_progress',
      items: items,
      general_comment: commentEl ? commentEl.value : '',
      flagged: existing.flagged || false,
      skip_reason: existing.skip_reason || ''
    };

    sectionDataMap[section.id] = data;
    return data;
  }

  function saveSectionState(sectionId, status, skipReason) {
    collectCurrentSectionData();
    var data = sectionDataMap[sectionId] || {};
    data.status = status;
    if (skipReason) data.skip_reason = skipReason;
    sectionDataMap[sectionId] = data;
    sync.autoSave(currentInspection.id, sectionId, data);
    updateCompletedCount();
  }

  function validateSectionItems(section) {
    var missing = [];
    section.items.forEach(function(item) {
      if (!item.required) return;
      if (item.type === 'select') {
        var sel = document.querySelector('.iw-select[data-item-id="' + item.id + '"]');
        if (!sel || !sel.value) missing.push(item.label);
      } else if (item.type === 'text') {
        var inp = document.querySelector('.iw-input[data-item-id="' + item.id + '"]');
        if (!inp || !inp.value.trim()) missing.push(item.label);
      }
      /* Condition items are not strictly required (can be "Not Inspected") */
    });
    return missing;
  }

  function findFirstMissingElement(section) {
    for (var i = 0; i < section.items.length; i++) {
      var item = section.items[i];
      if (!item.required) continue;
      var el = null;
      if (item.type === 'select') {
        el = document.querySelector('.iw-select[data-item-id="' + item.id + '"]');
        if (el && !el.value) return el;
      } else if (item.type === 'text') {
        el = document.querySelector('.iw-input[data-item-id="' + item.id + '"]');
        if (el && !el.value.trim()) return el;
      }
    }
    return null;
  }

  /* ═══ SECTION NAVIGATION ═══ */
  function goNextSection() {
    if (activeSectionIndex < activeSections.length - 1) {
      activeSectionIndex++;
      renderCurrentSection();
      updateProgressUI();
      buildSectionDrawer();
      window.scrollTo(0, 0);
    } else {
      /* All sections done — show review */
      showReviewScreen();
    }
  }

  /* ═══ PHOTOS ═══ */
  function loadSectionPhotos(section) {
    var grid = document.getElementById('iwPhotoGrid');
    grid.innerHTML = '';

    db.getSectionPhotos(currentInspection.id, section.id).then(function(sectionPhotos) {
      photoMap[section.id] = sectionPhotos;
      sectionPhotos.forEach(function(p) { appendPhotoToGrid(p); });
    });
  }

  function appendPhotoToGrid(photoRecord) {
    var grid = document.getElementById('iwPhotoGrid');
    var url = photos.getLocalPhotoUrl(photoRecord);
    var div = document.createElement('div');
    div.className = 'iw-photo-thumb';
    div.dataset.photoId = photoRecord.id;
    div.innerHTML = '<img src="' + url + '" alt="Inspection photo" />' +
      '<button class="iw-photo-delete" title="Delete">×</button>' +
      '<input type="text" class="iw-photo-caption" placeholder="Caption..." value="' + escapeHtml(photoRecord.caption || '') + '" />';

    div.querySelector('.iw-photo-delete').addEventListener('click', function(e) {
      e.stopPropagation();
      if (confirm('Delete this photo?')) {
        photos.deletePhoto(photoRecord);
        div.remove();
      }
    });

    div.querySelector('.iw-photo-caption').addEventListener('change', function() {
      photoRecord.caption = this.value;
      db.savePhoto(photoRecord);
    });

    /* Fullscreen on tap */
    div.querySelector('img').addEventListener('click', function() {
      showFullscreenPhoto(url);
    });

    grid.appendChild(div);
  }

  function showFullscreenPhoto(url) {
    var overlay = document.getElementById('iwPhotoOverlay');
    var img = document.getElementById('iwPhotoOverlayImg');
    img.src = url;
    overlay.classList.add('active');
    overlay.addEventListener('click', function handler() {
      overlay.classList.remove('active');
      overlay.removeEventListener('click', handler);
    });
  }

  /* ═══ SECTION DRAWER ═══ */
  function buildSectionDrawer() {
    var drawer = document.getElementById('iwSectionDrawer');
    if (!drawer) return;

    var grouped = sections.groupSections(activeSections);
    var html = '<div class="iw-drawer-header"><h3>Sections</h3><button id="iwCloseDrawer">×</button></div>';

    grouped.order.forEach(function(groupName) {
      html += '<div class="iw-drawer-group"><h4>' + escapeHtml(groupName) + '</h4>';
      grouped.groups[groupName].forEach(function(s, idx) {
        var globalIdx = activeSections.indexOf(s);
        var data = sectionDataMap[s.id] || {};
        var statusCls = data.status || 'not_started';
        var activeCls = globalIdx === activeSectionIndex ? ' active' : '';
        html += '<button class="iw-drawer-item ' + statusCls + activeCls + '" data-idx="' + globalIdx + '">' +
          '<span class="iw-drawer-status-dot"></span>' +
          '<span>' + escapeHtml(s.name) + '</span>' +
          (data.flagged ? ' <span class="iw-flag-icon">⚑</span>' : '') +
        '</button>';
      });
      html += '</div>';
    });

    drawer.innerHTML = html;

    /* Bind clicks */
    drawer.querySelectorAll('.iw-drawer-item').forEach(function(item) {
      item.addEventListener('click', function() {
        collectCurrentSectionData();
        activeSectionIndex = parseInt(this.dataset.idx);
        renderCurrentSection();
        updateProgressUI();
        buildSectionDrawer();
        closeSectionDrawer();
      });
    });

    var closeBtn = document.getElementById('iwCloseDrawer');
    if (closeBtn) closeBtn.addEventListener('click', closeSectionDrawer);
  }

  function toggleSectionDrawer() {
    var drawer = document.getElementById('iwSectionDrawer');
    drawer.classList.toggle('open');
  }

  function closeSectionDrawer() {
    var drawer = document.getElementById('iwSectionDrawer');
    drawer.classList.remove('open');
  }

  /* ═══ PROGRESS UI ═══ */
  function updateProgressUI() {
    var completed = countCompleted();
    var total = activeSections.length;
    var pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    var bar = document.getElementById('iwProgressBar');
    if (bar) bar.style.width = pct + '%';

    var text = document.getElementById('iwProgressText');
    if (text) text.textContent = completed + ' / ' + total + ' sections (' + pct + '%)';
  }

  function countCompleted() {
    var count = 0;
    activeSections.forEach(function(s) {
      var d = sectionDataMap[s.id];
      if (d && (d.status === 'completed' || d.status === 'skipped' || d.status === 'na')) count++;
    });
    return count;
  }

  function updateCompletedCount() {
    var completed = countCompleted();
    if (isDemoInspection(currentInspection)) return;
    sync.sbFetch('inspection_records?id=eq.' + currentInspection.id, {
      method: 'PATCH',
      body: JSON.stringify({ completed_sections: completed })
    });
  }

  /* ═══ REVIEW SCREEN ═══ */
  function showReviewScreen() {
    collectCurrentSectionData();
    showScreen('screenReview');

    var container = document.getElementById('iwReviewContent');
    var grouped = sections.groupSections(activeSections);
    var allComplete = true;
    var flaggedSections = [];

    var html = '<h2>Pre-Submission Review</h2>';
    html += '<div class="iw-review-progress">' +
      '<div class="iw-progress-track"><div class="iw-progress-fill" style="width:' + (countCompleted() / activeSections.length * 100) + '%"></div></div>' +
      '<p>' + countCompleted() + ' / ' + activeSections.length + ' sections complete</p>' +
    '</div>';

    grouped.order.forEach(function(groupName) {
      html += '<div class="iw-review-group"><h3>' + escapeHtml(groupName) + '</h3>';
      grouped.groups[groupName].forEach(function(s) {
        var data = sectionDataMap[s.id] || {};
        var status = data.status || 'not_started';
        var icon = status === 'completed' ? '✅' : status === 'skipped' ? '⏭' : status === 'na' ? '—' : '❌';
        if (status === 'not_started' || status === 'in_progress') allComplete = false;
        if (data.flagged) flaggedSections.push(s.name);

        html += '<div class="iw-review-item ' + status + '">' +
          '<span class="iw-review-icon">' + icon + '</span>' +
          '<span class="iw-review-name">' + escapeHtml(s.name) + '</span>' +
          (data.flagged ? '<span class="iw-flag-icon">⚑</span>' : '') +
          '<span class="iw-review-status">' + formatStatus(status) + '</span>' +
        '</div>';
      });
      html += '</div>';
    });

    if (flaggedSections.length) {
      html += '<div class="iw-review-warning">⚠ Flagged sections: ' + flaggedSections.join(', ') + '</div>';
    }

    html += '<div class="iw-review-actions">' +
      '<button class="iw-btn iw-btn-secondary iw-back-btn" data-back="section">← Back to Sections</button>' +
      '<button class="iw-btn iw-btn-primary" id="iwSubmitInspection"' + (allComplete ? '' : ' disabled') + '>' +
        (allComplete ? 'Submit for Review' : 'Complete All Sections First') +
      '</button>' +
    '</div>';

    container.innerHTML = html;

    document.getElementById('iwSubmitInspection').addEventListener('click', function() {
      if (!allComplete) return;
      submitInspection();
    });
  }

  /* ═══ SUBMIT ═══ */
  function submitInspection() {
    if (isDemoInspection(currentInspection)) {
      submitDemoInspection();
      return;
    }
    /* Upload any pending photos first */
    photos.uploadPendingPhotos(currentInspection.id).then(function() {
      /* Force sync all remaining queue items */
      return sync.processQueue();
    }).then(function() {
      /* Update status to review */
      return sync.saveStatusChange(currentInspection.id, 'review');
    }).then(function() {
      /* Log audit entry */
      return sync.sbFetch('audit_log', {
        method: 'POST',
        body: JSON.stringify({
          inspection_record_id: currentInspection.id,
          actor_id: currentInspector.id,
          actor_type: 'inspector',
          action: 'inspection_submitted',
          details: {
            total_sections: activeSections.length,
            completed_sections: countCompleted(),
            flagged: activeSections.filter(function(s) { return (sectionDataMap[s.id] || {}).flagged; }).map(function(s) { return s.id; })
          }
        })
      });
    }).then(function() {
      alert('Inspection submitted for review!');
      showDashboard();
    }).catch(function(err) {
      console.error('[submit]', err);
      alert('Submission saved locally. It will sync when connection is restored.');
      showDashboard();
    });
  }

  /* ═══ DARK MODE ═══ */
  function toggleDarkMode() {
    darkMode = !darkMode;
    document.body.classList.toggle('dark-mode', darkMode);
    localStorage.setItem('iw-dark-mode', darkMode);
  }

  /* ═══ UTILITY ═══ */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTime(dateStr) {
    try {
      var d = new Date(dateStr + 'T09:00:00');
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch (e) { return dateStr; }
  }

  function formatStatus(status) {
    var labels = {
      'not_started': 'Not Started',
      'in_progress': 'In Progress',
      'completed': 'Completed',
      'skipped': 'Skipped',
      'na': 'N/A',
      'scheduled': 'Scheduled',
      'agreement_pending': 'Agreement Pending',
      'review': 'Under Review',
      'submitted': 'Submitted',
      'approved': 'Approved',
      'delivered': 'Delivered'
    };
    return labels[status] || status;
  }

  function getStatusBadge(status) {
    var colors = {
      'scheduled': '#6b7d8a',
      'agreement_pending': '#f59321',
      'in_progress': '#15516d',
      'review': '#f59321',
      'submitted': '#3d7a3c',
      'approved': '#3d7a3c',
      'delivered': '#3d7a3c'
    };
    var color = colors[status] || '#6b7d8a';
    return '<span class="iw-status-badge" style="background:' + color + '">' + formatStatus(status) + '</span>';
  }

  function renderServiceTags(services) {
    if (!services || !services.length) return '<span class="iw-tag">Standard Inspection</span>';
    return services.map(function(s) {
      return '<span class="iw-tag">' + escapeHtml(s) + '</span>';
    }).join('');
  }

  function renderProgressBar(insp) {
    var total = insp.total_sections || 0;
    var completed = insp.completed_sections || 0;
    if (!total) return '';
    var pct = Math.round((completed / total) * 100);
    return '<div class="iw-mini-progress"><div class="iw-mini-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="iw-mini-text">' + completed + '/' + total + '</span>';
  }

  /* ═══ INIT ON LOAD ═══ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ═══ EXPORT ═══ */
  window.HIG_INSPECTOR = window.HIG_INSPECTOR || {};
  window.HIG_INSPECTOR.app = {
    getCurrentInspection: function() { return currentInspection; },
    getCurrentInspector: function() { return currentInspector; },
    getActiveSections: function() { return activeSections; },
    getSectionDataMap: function() { return sectionDataMap; },
    isDemo: function() { return isDemo; }
  };

})();
