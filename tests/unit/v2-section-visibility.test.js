/**
 * Unit tests for V2 wizard property-driven section visibility
 *
 * Tests v2ComputeVisibleSections — a pure function that filters sections
 * based on property profile values.
 */

import { describe, it, expect } from 'vitest';

// ── Pure function under test (same as inline in inspector-wizard-v2.html) ──

function v2ComputeVisibleSections(sections, profile) {
  if (!profile) return sections.slice();
  return sections.filter(function (sec) {
    var name = (sec.name || '').toLowerCase();
    if (profile.foundation_type === 'slab' && name.indexOf('basement') > -1) return false;
    if (profile.garage_type === 'none' && name.indexOf('garage') > -1) return false;
    if (profile.property_type === 'condo' && name.indexOf('exterior') > -1) return false;
    if (profile.has_pool === false && name.indexOf('pool') > -1) return false;
    if (profile.has_fireplace === false && name.indexOf('fireplace') > -1) return false;
    return true;
  });
}

// ── Test data ──────────────────────────────────────────────────────────────

var ALL_SECTIONS = [
  { id: 's1', name: 'Roofing', order_index: 0 },
  { id: 's2', name: 'Exterior', order_index: 1 },
  { id: 's3', name: 'Attached Garage', order_index: 2 },
  { id: 's4', name: 'Basement & Foundation', order_index: 3 },
  { id: 's5', name: 'Electrical', order_index: 5 },
  { id: 's6', name: 'Fireplace & Chimney', order_index: 9 },
  { id: 's7', name: 'Pool & Spa', order_index: 14 },
  { id: 's8', name: 'Kitchen', order_index: 11 },
];

function names(sections) {
  return sections.map(function (s) { return s.name; });
}

// ─── Slab foundation hides basement ───────────────────────────────────────

describe('visibility — slab foundation', () => {
  it('hides Basement & Foundation when foundation_type = slab', () => {
    var profile = { foundation_type: 'slab', garage_type: 'attached', property_type: 'single_family', has_pool: true, has_fireplace: true };
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, profile);
    expect(names(visible)).not.toContain('Basement & Foundation');
    expect(visible).toHaveLength(7);
  });

  it('keeps Basement & Foundation for non-slab foundations', () => {
    var profile = { foundation_type: 'basement', garage_type: 'attached', property_type: 'single_family', has_pool: true, has_fireplace: true };
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, profile);
    expect(names(visible)).toContain('Basement & Foundation');
  });
});

// ─── Garage type = none hides garage ──────────────────────────────────────

describe('visibility — garage type none', () => {
  it('hides Attached Garage when garage_type = none', () => {
    var profile = { foundation_type: 'basement', garage_type: 'none', property_type: 'single_family', has_pool: true, has_fireplace: true };
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, profile);
    expect(names(visible)).not.toContain('Attached Garage');
    expect(visible).toHaveLength(7);
  });

  it('keeps Attached Garage for garage_type = attached', () => {
    var profile = { foundation_type: 'basement', garage_type: 'attached', property_type: 'single_family', has_pool: true, has_fireplace: true };
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, profile);
    expect(names(visible)).toContain('Attached Garage');
  });
});

// ─── Condo hides exterior ─────────────────────────────────────────────────

describe('visibility — condo property type', () => {
  it('hides Exterior for property_type = condo', () => {
    var profile = { foundation_type: 'slab', garage_type: 'none', property_type: 'condo', has_pool: false, has_fireplace: false };
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, profile);
    expect(names(visible)).not.toContain('Exterior');
  });

  it('keeps Exterior for property_type = single_family', () => {
    var profile = { foundation_type: 'basement', garage_type: 'attached', property_type: 'single_family', has_pool: true, has_fireplace: true };
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, profile);
    expect(names(visible)).toContain('Exterior');
  });
});

// ─── Pool hidden when has_pool = false ────────────────────────────────────

describe('visibility — has_pool', () => {
  it('hides Pool & Spa when has_pool = false', () => {
    var profile = { foundation_type: 'basement', garage_type: 'attached', property_type: 'single_family', has_pool: false, has_fireplace: true };
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, profile);
    expect(names(visible)).not.toContain('Pool & Spa');
    expect(visible).toHaveLength(7);
  });

  it('keeps Pool & Spa when has_pool = true', () => {
    var profile = { foundation_type: 'basement', garage_type: 'attached', property_type: 'single_family', has_pool: true, has_fireplace: true };
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, profile);
    expect(names(visible)).toContain('Pool & Spa');
  });
});

// ─── Fireplace hidden when has_fireplace = false ──────────────────────────

describe('visibility — has_fireplace', () => {
  it('hides Fireplace & Chimney when has_fireplace = false', () => {
    var profile = { foundation_type: 'basement', garage_type: 'attached', property_type: 'single_family', has_pool: true, has_fireplace: false };
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, profile);
    expect(names(visible)).not.toContain('Fireplace & Chimney');
    expect(visible).toHaveLength(7);
  });

  it('keeps Fireplace & Chimney when has_fireplace = true', () => {
    var profile = { foundation_type: 'basement', garage_type: 'attached', property_type: 'single_family', has_pool: true, has_fireplace: true };
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, profile);
    expect(names(visible)).toContain('Fireplace & Chimney');
  });
});

// ─── No profile returns all sections ──────────────────────────────────────

describe('visibility — no profile', () => {
  it('returns all sections when profile is null', () => {
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, null);
    expect(visible).toHaveLength(ALL_SECTIONS.length);
  });

  it('returns all sections when profile is undefined', () => {
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, undefined);
    expect(visible).toHaveLength(ALL_SECTIONS.length);
  });
});

// ─── Multiple rules applied together ──────────────────────────────────────

describe('visibility — combined rules', () => {
  it('condo + slab + no garage + no pool + no fireplace hides multiple sections', () => {
    var profile = { foundation_type: 'slab', garage_type: 'none', property_type: 'condo', has_pool: false, has_fireplace: false };
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, profile);
    var visibleNames = names(visible);
    expect(visibleNames).not.toContain('Exterior');
    expect(visibleNames).not.toContain('Attached Garage');
    expect(visibleNames).not.toContain('Basement & Foundation');
    expect(visibleNames).not.toContain('Pool & Spa');
    expect(visibleNames).not.toContain('Fireplace & Chimney');
    // Remaining: Roofing, Electrical, Kitchen
    expect(visible).toHaveLength(3);
    expect(visibleNames).toContain('Roofing');
    expect(visibleNames).toContain('Electrical');
    expect(visibleNames).toContain('Kitchen');
  });

  it('no rules triggered = all sections visible', () => {
    var profile = { foundation_type: 'basement', garage_type: 'attached', property_type: 'single_family', has_pool: true, has_fireplace: true };
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, profile);
    expect(visible).toHaveLength(ALL_SECTIONS.length);
  });
});

// ─── Hidden sections excluded from navigation ─────────────────────────────

describe('visibility — navigation exclusion', () => {
  it('hidden sections not in visible array (nav uses visible array)', () => {
    var profile = { foundation_type: 'slab', garage_type: 'none', property_type: 'single_family', has_pool: true, has_fireplace: true };
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, profile);
    // Basement and Garage are hidden
    var visibleIds = visible.map(function (s) { return s.id; });
    expect(visibleIds).not.toContain('s3'); // Attached Garage
    expect(visibleIds).not.toContain('s4'); // Basement & Foundation
    // Nav would iterate 0..visible.length-1, so these are skipped
    expect(visible).toHaveLength(6);
  });
});

// ─── Hidden sections excluded from validation ─────────────────────────────

describe('visibility — validation exclusion', () => {
  it('validation only checks sections in visible array', () => {
    var profile = { foundation_type: 'slab', garage_type: 'none', property_type: 'single_family', has_pool: true, has_fireplace: true };
    var visible = v2ComputeVisibleSections(ALL_SECTIONS, profile);
    // If validation iterates v2VisibleSections, hidden sections are never checked
    var hiddenIds = ['s3', 's4'];
    visible.forEach(function (sec) {
      expect(hiddenIds).not.toContain(sec.id);
    });
  });
});

// ─── Case insensitivity ───────────────────────────────────────────────────

describe('visibility — case handling', () => {
  it('matches section names case-insensitively', () => {
    var sections = [
      { id: 's1', name: 'BASEMENT & FOUNDATION' },
      { id: 's2', name: 'exterior walls' },
    ];
    var profile = { foundation_type: 'slab', property_type: 'condo', garage_type: 'attached', has_pool: true, has_fireplace: true };
    var visible = v2ComputeVisibleSections(sections, profile);
    expect(visible).toHaveLength(0);
  });
});
