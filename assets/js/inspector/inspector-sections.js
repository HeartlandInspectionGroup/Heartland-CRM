/**
 * inspector-sections.js — Section template loading + compliance rule injection
 * Namespace: window.HIG_INSPECTOR.sections
 *
 * Loads inspection_sections from Supabase (fallback: IndexedDB cache / hardcoded).
 * Loads compliance_rules and injects required items based on state_code.
 * Filters sections by ordered_services for the inspection.
 */
(function() {
  'use strict';

  var allSections = [];
  var complianceRules = [];
  var loaded = false;

  /* ═══ HARDCODED FALLBACK SECTIONS ═══ */
  var FALLBACK_SECTIONS = [
    /* ── Exterior ── */
    { id: 'roof-covering', name: 'Roof Covering', category: 'standard', group_name: 'Exterior', sort_order: 1, icon: '🏠', required_by_sop: true, items: [
      { id: 'roof-type', label: 'Roof covering type', type: 'select', options: ['Asphalt shingle','Metal','Tile','Wood shake','Slate','Flat/membrane','Other'], required: true, sop_describe: true },
      { id: 'roof-condition', label: 'General condition', type: 'condition' },
      { id: 'roof-flashing', label: 'Flashings', type: 'condition' },
      { id: 'roof-gutters', label: 'Gutters & downspouts', type: 'condition' },
      { id: 'roof-skylights', label: 'Skylights (if present)', type: 'condition' },
      { id: 'roof-ventilation', label: 'Roof ventilation', type: 'condition' },
      { id: 'roof-penetrations', label: 'Penetrations & boots', type: 'condition' }
    ]},
    { id: 'exterior-walls', name: 'Exterior Walls & Cladding', category: 'standard', group_name: 'Exterior', sort_order: 2, icon: '🧱', required_by_sop: true, items: [
      { id: 'ext-cladding-type', label: 'Cladding material', type: 'select', options: ['Vinyl siding','Brick','Stone','Stucco','Wood','Fiber cement','Other'], required: true },
      { id: 'ext-cladding-cond', label: 'Cladding condition', type: 'condition' },
      { id: 'ext-trim', label: 'Trim & fascia', type: 'condition' },
      { id: 'ext-caulking', label: 'Caulking & sealants', type: 'condition' },
      { id: 'ext-windows', label: 'Window exteriors', type: 'condition' },
      { id: 'ext-doors', label: 'Exterior doors', type: 'condition' }
    ]},
    { id: 'grading-drainage', name: 'Grading & Drainage', category: 'standard', group_name: 'Exterior', sort_order: 3, icon: '🌧', required_by_sop: true, items: [
      { id: 'grade-slope', label: 'Grading slope away from foundation', type: 'condition' },
      { id: 'grade-drainage', label: 'Surface drainage', type: 'condition' },
      { id: 'grade-window-wells', label: 'Window wells', type: 'condition' },
      { id: 'grade-retaining', label: 'Retaining walls (if present)', type: 'condition' }
    ]},
    { id: 'decks-porches', name: 'Decks, Porches & Walkways', category: 'standard', group_name: 'Exterior', sort_order: 4, icon: '🪵', required_by_sop: true, items: [
      { id: 'deck-structure', label: 'Structural integrity', type: 'condition' },
      { id: 'deck-surface', label: 'Surface condition', type: 'condition' },
      { id: 'deck-railings', label: 'Railings & guards', type: 'condition' },
      { id: 'deck-stairs', label: 'Stairs & steps', type: 'condition' },
      { id: 'deck-ledger', label: 'Ledger board attachment', type: 'condition' }
    ]},
    { id: 'garage', name: 'Garage', category: 'standard', group_name: 'Exterior', sort_order: 5, icon: '🚗', required_by_sop: true, visibility_rules: { requires_property_attr: 'has_garage' }, items: [
      { id: 'garage-door', label: 'Garage door(s)', type: 'condition' },
      { id: 'garage-opener', label: 'Automatic opener', type: 'condition' },
      { id: 'garage-reverse', label: 'Auto-reverse safety', type: 'condition' },
      { id: 'garage-floor', label: 'Floor condition', type: 'condition' },
      { id: 'garage-firewall', label: 'Firewall separation', type: 'condition' }
    ]},

    /* ── Structure ── */
    { id: 'foundation', name: 'Foundation', category: 'standard', group_name: 'Structure', sort_order: 6, icon: '🏗', required_by_sop: true, items: [
      { id: 'found-type', label: 'Foundation type', type: 'select', options: ['Poured concrete','Block','Stone','Slab on grade','Pier','Other'], required: true, sop_describe: true },
      { id: 'found-cracks', label: 'Cracks', type: 'condition' },
      { id: 'found-moisture', label: 'Moisture intrusion signs', type: 'condition' },
      { id: 'found-settlement', label: 'Settlement indicators', type: 'condition' }
    ]},
    { id: 'basement-crawlspace', name: 'Basement / Crawlspace', category: 'standard', group_name: 'Structure', sort_order: 7, icon: '🔦', required_by_sop: true, items: [
      { id: 'base-walls', label: 'Wall condition', type: 'condition' },
      { id: 'base-floor', label: 'Floor condition', type: 'condition' },
      { id: 'base-moisture', label: 'Moisture / water stains', type: 'condition' },
      { id: 'base-sump', label: 'Sump pump (if present)', type: 'condition' },
      { id: 'base-insulation', label: 'Insulation', type: 'condition' },
      { id: 'base-vapor', label: 'Vapor barrier (crawlspace)', type: 'condition' }
    ]},
    { id: 'structural-framing', name: 'Structural Framing', category: 'standard', group_name: 'Structure', sort_order: 8, icon: '🪨', required_by_sop: true, items: [
      { id: 'frame-joists', label: 'Floor joists', type: 'condition' },
      { id: 'frame-beams', label: 'Beams & columns', type: 'condition' },
      { id: 'frame-subfloor', label: 'Subflooring', type: 'condition' },
      { id: 'frame-rafters', label: 'Roof framing (if visible)', type: 'condition' }
    ]},

    /* ── Mechanical ── */
    { id: 'heating', name: 'Heating System', category: 'standard', group_name: 'Mechanical', sort_order: 9, icon: '🔥', required_by_sop: true, items: [
      { id: 'heat-type', label: 'Heating method', type: 'select', options: ['Forced air furnace','Boiler (hot water)','Boiler (steam)','Heat pump','Electric baseboard','Radiant','Other'], required: true, sop_describe: true },
      { id: 'heat-energy', label: 'Energy source', type: 'select', options: ['Natural gas','Propane','Electric','Oil','Other'], required: true, sop_describe: true },
      { id: 'heat-condition', label: 'Equipment condition', type: 'condition' },
      { id: 'heat-filter', label: 'Filter condition', type: 'condition' },
      { id: 'heat-distribution', label: 'Distribution (ducts/pipes)', type: 'condition' },
      { id: 'heat-venting', label: 'Flue / venting', type: 'condition' }
    ]},
    { id: 'cooling', name: 'Cooling System', category: 'standard', group_name: 'Mechanical', sort_order: 10, icon: '❄️', required_by_sop: true, items: [
      { id: 'cool-type', label: 'Cooling method', type: 'select', options: ['Central AC','Heat pump','Mini-split','Window unit','Evaporative','None','Other'], required: true, sop_describe: true },
      { id: 'cool-energy', label: 'Energy source', type: 'select', options: ['Electric','Gas','Other'], required: true, sop_describe: true },
      { id: 'cool-condition', label: 'Equipment condition', type: 'condition' },
      { id: 'cool-condenser', label: 'Condenser unit', type: 'condition' },
      { id: 'cool-refrigerant', label: 'Refrigerant lines', type: 'condition' }
    ]},
    { id: 'electrical', name: 'Electrical System', category: 'standard', group_name: 'Mechanical', sort_order: 11, icon: '⚡', required_by_sop: true, items: [
      { id: 'elec-amperage', label: 'Service amperage', type: 'select', options: ['100 amp','150 amp','200 amp','400 amp','Other'], required: true, sop_describe: true },
      { id: 'elec-wiring', label: 'Wiring method', type: 'select', options: ['Romex (NM)','BX/armored','Conduit','Knob & tube','Aluminum','Mixed','Other'], required: true, sop_describe: true },
      { id: 'elec-panel', label: 'Main panel condition', type: 'condition' },
      { id: 'elec-breakers', label: 'Breakers / fuses', type: 'condition' },
      { id: 'elec-grounding', label: 'Grounding', type: 'condition' },
      { id: 'elec-gfci', label: 'GFCI protection', type: 'condition' },
      { id: 'elec-afci', label: 'AFCI protection', type: 'condition' },
      { id: 'elec-outlets', label: 'Outlets (sample)', type: 'condition' }
    ]},
    { id: 'plumbing', name: 'Plumbing System', category: 'standard', group_name: 'Mechanical', sort_order: 12, icon: '🔧', required_by_sop: true, items: [
      { id: 'plumb-supply', label: 'Water supply type', type: 'select', options: ['Municipal','Well','Other'], required: true, sop_describe: true },
      { id: 'plumb-pipe-material', label: 'Supply pipe material', type: 'select', options: ['Copper','PEX','CPVC','Galvanized','Polybutylene','Mixed','Other'], required: true },
      { id: 'plumb-pressure', label: 'Water pressure', type: 'condition' },
      { id: 'plumb-heater', label: 'Water heater', type: 'condition' },
      { id: 'plumb-heater-type', label: 'Water heater type', type: 'select', options: ['Tank gas','Tank electric','Tankless gas','Tankless electric','Other'], required: true },
      { id: 'plumb-drain', label: 'Drain/waste pipes', type: 'condition' },
      { id: 'plumb-fixtures', label: 'Fixtures (sample)', type: 'condition' },
      { id: 'plumb-leaks', label: 'Visible leaks', type: 'condition' }
    ]},

    /* ── Interior ── */
    { id: 'interior-rooms', name: 'Interior Rooms', category: 'standard', group_name: 'Interior', sort_order: 13, icon: '🛋', required_by_sop: true, items: [
      { id: 'int-walls', label: 'Walls & ceilings', type: 'condition' },
      { id: 'int-floors', label: 'Floors', type: 'condition' },
      { id: 'int-windows', label: 'Windows (interior)', type: 'condition' },
      { id: 'int-doors', label: 'Interior doors', type: 'condition' },
      { id: 'int-closets', label: 'Closets', type: 'condition' },
      { id: 'int-stairs', label: 'Stairways & railings', type: 'condition' }
    ]},
    { id: 'kitchen', name: 'Kitchen', category: 'standard', group_name: 'Interior', sort_order: 14, icon: '🍳', required_by_sop: true, items: [
      { id: 'kit-counters', label: 'Countertops & cabinets', type: 'condition' },
      { id: 'kit-sink', label: 'Sink & faucet', type: 'condition' },
      { id: 'kit-disposal', label: 'Garbage disposal', type: 'condition' },
      { id: 'kit-dishwasher', label: 'Dishwasher', type: 'condition' },
      { id: 'kit-range', label: 'Range / oven', type: 'condition' },
      { id: 'kit-hood', label: 'Range hood / exhaust', type: 'condition' },
      { id: 'kit-gfci', label: 'GFCI at counter outlets', type: 'condition' }
    ]},
    { id: 'bathrooms', name: 'Bathrooms', category: 'standard', group_name: 'Interior', sort_order: 15, icon: '🚿', required_by_sop: true, items: [
      { id: 'bath-toilet', label: 'Toilet', type: 'condition' },
      { id: 'bath-sink', label: 'Sink & faucet', type: 'condition' },
      { id: 'bath-tub', label: 'Tub / shower', type: 'condition' },
      { id: 'bath-caulk', label: 'Caulking & grout', type: 'condition' },
      { id: 'bath-exhaust', label: 'Exhaust fan', type: 'condition' },
      { id: 'bath-gfci', label: 'GFCI protection', type: 'condition' }
    ]},
    { id: 'laundry', name: 'Laundry', category: 'standard', group_name: 'Interior', sort_order: 16, icon: '🧺', required_by_sop: true, items: [
      { id: 'laun-connections', label: 'Washer connections', type: 'condition' },
      { id: 'laun-dryer-vent', label: 'Dryer vent', type: 'condition' },
      { id: 'laun-floor-drain', label: 'Floor drain', type: 'condition' }
    ]},

    /* ── Systems ── */
    { id: 'insulation-ventilation', name: 'Insulation & Ventilation', category: 'standard', group_name: 'Systems', sort_order: 17, icon: '🌡', required_by_sop: true, items: [
      { id: 'ins-attic', label: 'Attic insulation', type: 'condition' },
      { id: 'ins-attic-type', label: 'Attic insulation type', type: 'select', options: ['Fiberglass batt','Blown cellulose','Blown fiberglass','Spray foam','None visible','Other'], required: true },
      { id: 'ins-walls', label: 'Wall insulation (if visible)', type: 'condition' },
      { id: 'ins-ventilation', label: 'Attic ventilation', type: 'condition' },
      { id: 'ins-bath-vents', label: 'Bath/kitchen vents to exterior', type: 'condition' }
    ]},
    { id: 'fireplace-chimney', name: 'Fireplace & Chimney', category: 'standard', group_name: 'Systems', sort_order: 18, icon: '🔥', required_by_sop: true, items: [
      { id: 'fp-type', label: 'Fireplace type', type: 'select', options: ['Wood burning','Gas','Electric','None','Other'], required: true },
      { id: 'fp-firebox', label: 'Firebox condition', type: 'condition' },
      { id: 'fp-damper', label: 'Damper', type: 'condition' },
      { id: 'fp-chimney', label: 'Chimney exterior', type: 'condition' },
      { id: 'fp-cap', label: 'Chimney cap', type: 'condition' }
    ]},
    { id: 'smoke-co-detectors', name: 'Smoke & CO Detectors', category: 'standard', group_name: 'Systems', sort_order: 19, icon: '🚨', required_by_sop: true, items: [
      { id: 'smoke-present', label: 'Smoke detectors present', type: 'condition' },
      { id: 'smoke-locations', label: 'Proper locations', type: 'condition' },
      { id: 'co-present', label: 'CO detectors present', type: 'condition' },
      { id: 'co-locations', label: 'CO detector locations', type: 'condition' }
    ]},

    /* ── Attic ── */
    { id: 'attic', name: 'Attic', category: 'standard', group_name: 'Structure', sort_order: 20, icon: '🏚', required_by_sop: true, items: [
      { id: 'attic-access', label: 'Access method', type: 'select', options: ['Scuttle hole','Pull-down stairs','Walk-up','Not accessible','Other'], required: true },
      { id: 'attic-framing', label: 'Roof framing', type: 'condition' },
      { id: 'attic-sheathing', label: 'Sheathing', type: 'condition' },
      { id: 'attic-moisture', label: 'Moisture signs', type: 'condition' },
      { id: 'attic-wiring', label: 'Visible wiring', type: 'condition' },
      { id: 'attic-plumbing', label: 'Visible plumbing', type: 'condition' }
    ]},

    /* ── Add-On Services ── */
    { id: 'radon-testing', name: 'Radon Testing', category: 'addon', group_name: 'Add-On Services', sort_order: 100, icon: '☢️', addon_service_id: 'radon', required_by_sop: false, items: [
      { id: 'radon-device', label: 'Device placement location', type: 'text', required: true },
      { id: 'radon-floor', label: 'Lowest livable floor level', type: 'select', options: ['Basement','First floor','Other'], required: true },
      { id: 'radon-closed', label: 'Closed-house conditions verified', type: 'condition' },
      { id: 'radon-start', label: 'Test start date/time', type: 'text', required: true },
      { id: 'radon-end', label: 'Test end date/time (if completed)', type: 'text' },
      { id: 'radon-result', label: 'Result (pCi/L)', type: 'text' },
      { id: 'radon-mitigation', label: 'Existing mitigation system', type: 'condition' }
    ]},
    { id: 'mold-air-sampling', name: 'Mold / Air Quality Sampling', category: 'addon', group_name: 'Add-On Services', sort_order: 101, icon: '🦠', addon_service_id: 'mold', required_by_sop: false, items: [
      { id: 'mold-visual', label: 'Visible mold observed', type: 'condition' },
      { id: 'mold-location', label: 'Sample location(s)', type: 'text', required: true },
      { id: 'mold-samples', label: 'Number of samples taken', type: 'text', required: true },
      { id: 'mold-outdoor', label: 'Outdoor control sample', type: 'condition' },
      { id: 'mold-lab', label: 'Lab results (pending/received)', type: 'select', options: ['Pending','Received — attached'], required: true }
    ]},
    { id: 'sewer-scope', name: 'Sewer Scope', category: 'addon', group_name: 'Add-On Services', sort_order: 102, icon: '🔍', addon_service_id: 'sewer', required_by_sop: false, items: [
      { id: 'sewer-material', label: 'Sewer pipe material', type: 'select', options: ['PVC','Cast iron','Clay/terra cotta','Orangeburg','ABS','Mixed','Unknown'], required: true },
      { id: 'sewer-condition', label: 'Overall condition', type: 'condition' },
      { id: 'sewer-blockage', label: 'Blockages', type: 'condition' },
      { id: 'sewer-roots', label: 'Root intrusion', type: 'condition' },
      { id: 'sewer-belly', label: 'Bellies / sags', type: 'condition' },
      { id: 'sewer-joints', label: 'Joint separations', type: 'condition' }
    ]},
    { id: 'water-quality', name: 'Water Quality Testing', category: 'addon', group_name: 'Add-On Services', sort_order: 103, icon: '💧', addon_service_id: 'water', required_by_sop: false, items: [
      { id: 'water-source', label: 'Water source', type: 'select', options: ['Municipal','Well','Other'], required: true },
      { id: 'water-sample-loc', label: 'Sample location', type: 'text', required: true },
      { id: 'water-tests', label: 'Tests ordered', type: 'text', required: true },
      { id: 'water-lab', label: 'Lab results', type: 'select', options: ['Pending','Received — attached'], required: true }
    ]},
    { id: 'thermal-imaging', name: 'Thermal Imaging', category: 'addon', group_name: 'Add-On Services', sort_order: 104, icon: '🌡', addon_service_id: 'thermal', required_by_sop: false, items: [
      { id: 'thermal-equipment', label: 'Camera model', type: 'text' },
      { id: 'thermal-ext-temp', label: 'Exterior temperature', type: 'text' },
      { id: 'thermal-int-temp', label: 'Interior temperature', type: 'text' },
      { id: 'thermal-moisture', label: 'Moisture anomalies', type: 'condition' },
      { id: 'thermal-insulation', label: 'Insulation deficiencies', type: 'condition' },
      { id: 'thermal-electrical', label: 'Electrical hot spots', type: 'condition' }
    ]},
    { id: 'wdo-inspection', name: 'WDO / Termite Inspection', category: 'addon', group_name: 'Add-On Services', sort_order: 105, icon: '🐛', addon_service_id: 'wdo', required_by_sop: false, items: [
      { id: 'wdo-evidence', label: 'Evidence of infestation', type: 'condition' },
      { id: 'wdo-damage', label: 'Visible damage', type: 'condition' },
      { id: 'wdo-treatment', label: 'Previous treatment evidence', type: 'condition' },
      { id: 'wdo-tubes', label: 'Mud tubes', type: 'condition' },
      { id: 'wdo-wood-contact', label: 'Wood-soil contact', type: 'condition' },
      { id: 'wdo-moisture', label: 'Moisture conducive conditions', type: 'condition' }
    ]},
    { id: 'pre-listing', name: 'Pre-Listing Items', category: 'addon', group_name: 'Add-On Services', sort_order: 106, icon: '📋', addon_service_id: 'pre-listing', required_by_sop: false, items: [
      { id: 'prelist-curb', label: 'Curb appeal notes', type: 'text' },
      { id: 'prelist-cosmetic', label: 'Cosmetic improvements', type: 'text' },
      { id: 'prelist-safety', label: 'Safety concerns', type: 'condition' },
      { id: 'prelist-priority', label: 'Priority repair items', type: 'text' }
    ]},
    { id: 'new-construction', name: 'New Construction Phase', category: 'addon', group_name: 'Add-On Services', sort_order: 107, icon: '🏗', addon_service_id: 'new-construction', required_by_sop: false, items: [
      { id: 'newcon-phase', label: 'Construction phase', type: 'select', options: ['Pre-drywall','Final','11-month warranty','Other'], required: true },
      { id: 'newcon-framing', label: 'Framing quality', type: 'condition' },
      { id: 'newcon-mechanicals', label: 'Mechanical rough-ins', type: 'condition' },
      { id: 'newcon-code', label: 'Code compliance observations', type: 'condition' }
    ]},
    { id: 'pool-spa', name: 'Pool / Spa', category: 'addon', group_name: 'Add-On Services', sort_order: 108, icon: '🏊', addon_service_id: 'pool', required_by_sop: false, items: [
      { id: 'pool-type', label: 'Pool type', type: 'select', options: ['In-ground concrete','In-ground vinyl','In-ground fiberglass','Above ground','Hot tub/spa','Other'], required: true },
      { id: 'pool-surface', label: 'Surface condition', type: 'condition' },
      { id: 'pool-equipment', label: 'Equipment', type: 'condition' },
      { id: 'pool-safety', label: 'Safety barriers & covers', type: 'condition' },
      { id: 'pool-decking', label: 'Decking', type: 'condition' }
    ]},
    { id: 'well-septic', name: 'Well & Septic', category: 'addon', group_name: 'Add-On Services', sort_order: 109, icon: '🕳', addon_service_id: 'well-septic', required_by_sop: false, items: [
      { id: 'well-cap', label: 'Well cap condition', type: 'condition' },
      { id: 'well-pressure', label: 'Pressure tank', type: 'condition' },
      { id: 'septic-type', label: 'Septic type', type: 'select', options: ['Conventional','Mound','Aerobic','Unknown','Other'], required: true },
      { id: 'septic-age', label: 'Estimated age', type: 'text' },
      { id: 'septic-condition', label: 'Visible condition', type: 'condition' }
    ]},
    { id: 'outbuilding', name: 'Outbuildings / Detached Structures', category: 'addon', group_name: 'Add-On Services', sort_order: 110, icon: '🏚', addon_service_id: 'outbuilding', required_by_sop: false, items: [
      { id: 'out-type', label: 'Structure type', type: 'text', required: true },
      { id: 'out-roof', label: 'Roof condition', type: 'condition' },
      { id: 'out-structure', label: 'Structural condition', type: 'condition' },
      { id: 'out-electrical', label: 'Electrical (if present)', type: 'condition' }
    ]}
  ];

  /* ═══ LOAD SECTIONS ═══ */

  /** Load sections from Supabase, fallback to IndexedDB cache, then hardcoded */
  function loadSections() {
    if (loaded) return Promise.resolve(allSections);

    return window.HIG_INSPECTOR.sync.sbFetch('inspection_sections?active=eq.true&order=sort_order')
      .then(function(r) {
        if (!r.ok) throw new Error('Fetch sections failed');
        return r.json();
      })
      .then(function(rows) {
        if (rows && rows.length > 0) {
          allSections = rows.map(function(r) {
            if (typeof r.items === 'string') r.items = JSON.parse(r.items);
            if (typeof r.visibility_rules === 'string') r.visibility_rules = JSON.parse(r.visibility_rules);
            return r;
          });
          /* Cache for offline */
          window.HIG_INSPECTOR.db.cacheSectionTemplates(allSections);
        } else {
          throw new Error('No sections in DB');
        }
        loaded = true;
        return allSections;
      })
      .catch(function() {
        /* Try IndexedDB cache */
        return window.HIG_INSPECTOR.db.getCachedTemplates().then(function(cached) {
          if (cached && cached.length > 0) {
            allSections = cached;
          } else {
            allSections = FALLBACK_SECTIONS;
          }
          loaded = true;
          return allSections;
        });
      });
  }

  /* ═══ LOAD COMPLIANCE RULES ═══ */
  function loadComplianceRules(stateCode) {
    return window.HIG_INSPECTOR.sync.sbFetch(
      'compliance_rules?active=eq.true&or=(state_code.eq.' + stateCode + ',state_code.eq.ALL)&order=id'
    ).then(function(r) {
      if (!r.ok) throw new Error('Fetch compliance failed');
      return r.json();
    }).then(function(rules) {
      complianceRules = rules;
      return rules;
    }).catch(function() {
      complianceRules = [];
      return [];
    });
  }

  /* ═══ FILTER SECTIONS FOR AN INSPECTION ═══ */

  /**
   * Get applicable sections for an inspection based on ordered services.
   * Standard sections always included; addon sections only if service was ordered.
   */
  function getSectionsForInspection(orderedServices, propertyData) {
    orderedServices = orderedServices || [];

    return allSections.filter(function(section) {
      /* Standard sections always included */
      if (section.category === 'standard') {
        /* Check visibility rules */
        if (section.visibility_rules && section.visibility_rules.requires_property_attr) {
          var attr = section.visibility_rules.requires_property_attr;
          if (propertyData && !propertyData[attr]) return false;
        }
        return true;
      }

      /* Addon sections only if service was ordered */
      if (section.category === 'addon' && section.addon_service_id) {
        return orderedServices.indexOf(section.addon_service_id) !== -1;
      }

      return false;
    });
  }

  /* ═══ APPLY COMPLIANCE RULES ═══ */

  /**
   * Apply compliance rules to a set of sections.
   * Modifies sections in-place: injects items, marks required fields, etc.
   */
  function applyComplianceRules(sections, stateCode) {
    if (!complianceRules.length) return sections;

    var rulesBySection = {};
    var globalRules = [];

    complianceRules.forEach(function(rule) {
      if (rule.section_id) {
        if (!rulesBySection[rule.section_id]) rulesBySection[rule.section_id] = [];
        rulesBySection[rule.section_id].push(rule);
      } else {
        globalRules.push(rule);
      }
    });

    sections.forEach(function(section) {
      var rules = (rulesBySection[section.id] || []).concat(globalRules);

      rules.forEach(function(rule) {
        var config = typeof rule.rule_config === 'string' ? JSON.parse(rule.rule_config) : rule.rule_config;

        switch (rule.rule_type) {
          case 'inject_item':
            /* Add an item to the section's checklist */
            var exists = section.items.some(function(it) { return it.id === config.item_id; });
            if (!exists) {
              section.items.push({
                id: config.item_id,
                label: config.label,
                type: config.type || 'condition',
                options: config.options || null,
                required: config.required || false,
                compliance_note: rule.description,
                injected_by: rule.id
              });
            }
            break;

          case 'required_field':
            /* Make an existing item required */
            section.items.forEach(function(it) {
              if (it.id === config.item_id) {
                it.required = true;
                it.compliance_note = rule.description;
              }
            });
            break;

          case 'require_category':
            /* Add a severity category requirement */
            if (!section._compliance) section._compliance = {};
            section._compliance.require_category = config;
            break;

          case 'mandatory_section':
            /* Mark entire section as mandatory (cannot be skipped) */
            section.required_by_sop = true;
            section._compliance_mandatory = true;
            break;
        }
      });
    });

    return sections;
  }

  /** Get blocked language patterns for the state */
  function getBlockedLanguage(stateCode) {
    return complianceRules
      .filter(function(r) { return r.rule_type === 'block_language'; })
      .map(function(r) {
        var config = typeof r.rule_config === 'string' ? JSON.parse(r.rule_config) : r.rule_config;
        return {
          pattern: new RegExp(config.pattern, 'gi'),
          message: config.message || rule.description
        };
      });
  }

  /** Check a comment string against blocked language rules */
  function validateComment(text, stateCode) {
    var blocked = getBlockedLanguage(stateCode);
    var violations = [];
    blocked.forEach(function(rule) {
      if (rule.pattern.test(text)) {
        violations.push(rule.message);
        rule.pattern.lastIndex = 0; /* reset regex */
      }
    });
    return violations;
  }

  /* ═══ GROUP SECTIONS ═══ */
  function groupSections(sections) {
    var groups = {};
    var order = [];
    sections.forEach(function(s) {
      if (!groups[s.group_name]) {
        groups[s.group_name] = [];
        order.push(s.group_name);
      }
      groups[s.group_name].push(s);
    });
    return { groups: groups, order: order };
  }

  /* ═══ EXPORT ═══ */
  window.HIG_INSPECTOR = window.HIG_INSPECTOR || {};
  window.HIG_INSPECTOR.sections = {
    loadSections: loadSections,
    loadComplianceRules: loadComplianceRules,
    getSectionsForInspection: getSectionsForInspection,
    applyComplianceRules: applyComplianceRules,
    validateComment: validateComment,
    groupSections: groupSections,
    getAllSections: function() { return allSections; },
    getComplianceRules: function() { return complianceRules; },
    FALLBACK_SECTIONS: FALLBACK_SECTIONS
  };

})();
