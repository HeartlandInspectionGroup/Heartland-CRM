import { describe, it, expect } from 'vitest';
const { inferCategories, getMatchingContractors } = require('../../functions/send-reminder');

describe('inferCategories', () => {

  it('infers electrical from "Electrical panel needs upgrade"', () => {
    const findings = [{ title: 'Electrical panel needs upgrade', severity: 'major' }];
    const cats = inferCategories(findings);
    expect(cats.has('electrical')).toBe(true);
    expect(cats.size).toBe(1);
  });

  it('infers multiple categories from mixed findings', () => {
    const findings = [
      { title: 'Roof shingles lifting', severity: 'major' },
      { title: 'Drain is slow in bathroom', severity: 'minor' },
    ];
    const cats = inferCategories(findings);
    expect(cats.has('roofing')).toBe(true);
    expect(cats.has('plumbing')).toBe(true);
  });

  it('skips addressed findings', () => {
    const findings = [
      { title: 'Electrical panel needs upgrade', severity: 'major', addressed: true },
      { title: 'Foundation crack', severity: 'minor' },
    ];
    const cats = inferCategories(findings);
    expect(cats.has('electrical')).toBe(false);
    expect(cats.has('structural')).toBe(true);
  });

  it('matches on location field', () => {
    const findings = [{ title: 'Noise detected', location: 'HVAC closet', severity: 'info' }];
    const cats = inferCategories(findings);
    expect(cats.has('hvac')).toBe(true);
  });

  it('is case insensitive', () => {
    const findings = [{ title: 'MOLD in attic', severity: 'major' }];
    const cats = inferCategories(findings);
    expect(cats.has('mold')).toBe(true);
  });

  it('returns empty set for empty findings', () => {
    expect(inferCategories([]).size).toBe(0);
    expect(inferCategories(null).size).toBe(0);
    expect(inferCategories(undefined).size).toBe(0);
  });
});

describe('getMatchingContractors', () => {

  const contractors = [
    { name: 'Sparky', service_categories: ['electrical'], featured: false },
    { name: 'RoofPro', service_categories: ['roofing'], featured: true },
    { name: 'AllTrades', service_categories: ['electrical', 'plumbing'], featured: false },
  ];

  it('filters to matching categories only', () => {
    const findings = [{ title: 'Electrical panel issue', severity: 'major' }];
    const result = getMatchingContractors(contractors, findings);
    const names = result.map(c => c.name);
    expect(names).toContain('Sparky');
    expect(names).toContain('AllTrades');
    expect(names).not.toContain('RoofPro');
  });

  it('falls back to all contractors when no keywords match', () => {
    const findings = [{ title: 'Something unusual', severity: 'info' }];
    const result = getMatchingContractors(contractors, findings);
    expect(result).toHaveLength(3);
  });

  it('sorts featured contractors first', () => {
    const findings = []; // no keywords → all contractors returned
    const result = getMatchingContractors(contractors, findings);
    expect(result[0].name).toBe('RoofPro');
    expect(result[0].featured).toBe(true);
  });

  it('returns empty array when no contractors provided', () => {
    expect(getMatchingContractors([], [{ title: 'Electrical issue' }])).toEqual([]);
    expect(getMatchingContractors(null, [])).toEqual([]);
  });

  it('excludes contractors with no service_categories', () => {
    const mixed = [
      { name: 'NoCats', service_categories: null, featured: false },
      { name: 'Empty', service_categories: [], featured: false },
      { name: 'Sparky', service_categories: ['electrical'], featured: false },
    ];
    const findings = [{ title: 'Electrical panel', severity: 'major' }];
    const result = getMatchingContractors(mixed, findings);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Sparky');
  });
});
