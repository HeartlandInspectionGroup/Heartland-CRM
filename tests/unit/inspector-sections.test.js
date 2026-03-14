import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createContext, Script } from 'vm';
import { resolve } from 'path';

// Load inspector-sections.js in a sandboxed context
const sectionsPath = resolve(__dirname, '../../assets/js/inspector/inspector-sections.js');
const sectionsSource = readFileSync(sectionsPath, 'utf-8');

// Create a minimal browser-like environment
function createBrowserContext() {
  const ctx = {
    window: {},
    document: {
      addEventListener: () => {},
      dispatchEvent: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
    },
    navigator: { onLine: true, serviceWorker: null },
    localStorage: { getItem: () => null, setItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    fetch: () => Promise.reject(new Error('no network in test')),
    setTimeout: () => {},
    clearTimeout: () => {},
    Promise: Promise,
    console: console,
    CustomEvent: class CustomEvent {},
    Event: class Event {},
    URL: URL,
  };
  ctx.window = ctx;
  ctx.self = ctx;
  return createContext(ctx);
}

// Execute the sections module
const ctx = createBrowserContext();
new Script(sectionsSource).runInContext(ctx);
const sections = ctx.window.HIG_INSPECTOR.sections;
const FALLBACK_SECTIONS = sections.FALLBACK_SECTIONS;

describe('Inspector Sections — Fallback Data', () => {
  it('should have standard and addon sections', () => {
    const standard = FALLBACK_SECTIONS.filter(s => s.category === 'standard');
    const addon = FALLBACK_SECTIONS.filter(s => s.category === 'addon');
    expect(standard.length).toBeGreaterThan(10);
    expect(addon.length).toBeGreaterThan(5);
  });

  it('should have unique IDs for all sections', () => {
    const ids = FALLBACK_SECTIONS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have items array on every section', () => {
    FALLBACK_SECTIONS.forEach(s => {
      expect(Array.isArray(s.items)).toBe(true);
      expect(s.items.length).toBeGreaterThan(0);
    });
  });

  it('should have required fields for InterNACHI SOP "describe" items', () => {
    const sopDescribeItems = [];
    FALLBACK_SECTIONS.forEach(s => {
      s.items.forEach(item => {
        if (item.sop_describe) sopDescribeItems.push(item);
      });
    });
    // Should have at least the 6 mandatory InterNACHI describe items
    expect(sopDescribeItems.length).toBeGreaterThanOrEqual(6);
    sopDescribeItems.forEach(item => {
      expect(item.required).toBe(true);
      expect(item.type).toBe('select');
    });
  });
});

// getSectionsForInspection operates on the internal allSections array which
// requires loadSections() (network/IndexedDB) to populate. In unit tests,
// we test the filtering logic directly using FALLBACK_SECTIONS as the source.
function filterSections(allSections, orderedServices, propertyData) {
  orderedServices = orderedServices || [];
  return allSections.filter(function(section) {
    if (section.category === 'standard') {
      if (section.visibility_rules && section.visibility_rules.requires_property_attr) {
        var attr = section.visibility_rules.requires_property_attr;
        if (propertyData && !propertyData[attr]) return false;
      }
      return true;
    }
    if (section.category === 'addon' && section.addon_service_id) {
      return orderedServices.indexOf(section.addon_service_id) !== -1;
    }
    return false;
  });
}

describe('Inspector Sections — filtering logic', () => {
  it('should return only standard sections when no add-ons ordered', () => {
    const result = filterSections(FALLBACK_SECTIONS, [], {});
    const hasAddon = result.some(s => s.category === 'addon');
    expect(hasAddon).toBe(false);
    expect(result.length).toBeGreaterThan(10);
  });

  it('should include radon section when radon service is ordered', () => {
    const result = filterSections(FALLBACK_SECTIONS, ['radon'], {});
    const radon = result.find(s => s.id === 'radon-testing');
    expect(radon).toBeTruthy();
    expect(radon.category).toBe('addon');
  });

  it('should include multiple addon sections when multiple services ordered', () => {
    const result = filterSections(FALLBACK_SECTIONS, ['radon', 'mold', 'sewer'], {});
    const addons = result.filter(s => s.category === 'addon');
    expect(addons.length).toBe(3);
  });

  it('should exclude garage section when property has no garage', () => {
    const withGarage = filterSections(FALLBACK_SECTIONS, [], { has_garage: true });
    const withoutGarage = filterSections(FALLBACK_SECTIONS, [], { has_garage: false });
    const garageIn = withGarage.find(s => s.id === 'garage');
    const garageOut = withoutGarage.find(s => s.id === 'garage');
    expect(garageIn).toBeTruthy();
    expect(garageOut).toBeFalsy();
  });
});

describe('Inspector Sections — groupSections', () => {
  it('should group sections by group_name', () => {
    const grouped = sections.groupSections(FALLBACK_SECTIONS);
    expect(grouped.order.length).toBeGreaterThan(0);
    expect(grouped.order).toContain('Exterior');
    expect(grouped.order).toContain('Mechanical');
    expect(grouped.groups['Exterior'].length).toBeGreaterThan(0);
  });

  it('should preserve group ordering', () => {
    const grouped = sections.groupSections(FALLBACK_SECTIONS);
    const extIdx = grouped.order.indexOf('Exterior');
    const mechIdx = grouped.order.indexOf('Mechanical');
    expect(extIdx).toBeLessThan(mechIdx);
  });
});

describe('Inspector Sections — applyComplianceRules', () => {
  it('should not crash with empty compliance rules', () => {
    const secs = sections.getSectionsForInspection([], {});
    const result = sections.applyComplianceRules(secs, 'IL');
    expect(result.length).toBe(secs.length);
  });
});

describe('Inspector Sections — validateComment', () => {
  it('should return empty array for normal comments', () => {
    const violations = sections.validateComment('The roof has minor wear', 'WI');
    expect(violations).toEqual([]);
  });

  // Note: compliance rules are loaded from Supabase, so in unit test
  // with no network, getBlockedLanguage returns empty. This tests the
  // function doesn't crash.
  it('should handle empty state gracefully', () => {
    const violations = sections.validateComment('Some text', 'XX');
    expect(Array.isArray(violations)).toBe(true);
  });
});
