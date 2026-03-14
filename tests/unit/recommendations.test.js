import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createContext, Script } from 'vm';
import { resolve } from 'path';

// Load availability-config.js using vm since it uses `var HEARTLAND_CONFIG = ...`
const configPath = resolve(__dirname, '../../assets/js/availability-config.js');
const configSource = readFileSync(configPath, 'utf-8');
const ctx = createContext({});
new Script(configSource).runInContext(ctx);
const CONFIG = ctx.HEARTLAND_CONFIG;

// Data-driven rule evaluator (mirrors index.html evaluateRule)
function evaluateRule(rule, data) {
  const fieldVal = data[rule.field];
  if (fieldVal === undefined || fieldVal === null) return false;
  const op = rule.operator;
  const target = rule.value;
  if (op === 'lt') return Number(fieldVal) < Number(target);
  if (op === 'lte') return Number(fieldVal) <= Number(target);
  if (op === 'gt') return Number(fieldVal) > Number(target);
  if (op === 'gte') return Number(fieldVal) >= Number(target);
  if (op === 'eq') return String(fieldVal) === target;
  if (op === 'regex') {
    try { return new RegExp(target, 'i').test(String(fieldVal)); } catch { return false; }
  }
  return false;
}

function getMatchingRecommendations(property) {
  return CONFIG.serviceRecommendations.filter((rule) => evaluateRule(rule, property));
}

function getMatchingIds(property) {
  return getMatchingRecommendations(property).map((r) => r.id);
}

describe('serviceRecommendations', () => {
  it('has exactly 8 rules', () => {
    expect(CONFIG.serviceRecommendations).toHaveLength(8);
  });

  it('old home with basement triggers radon (x2), sewer, wdo, mold, thermal, water', () => {
    const property = { yearBuilt: 1960, hasBasement: true };
    const ids = getMatchingIds(property);

    // radon fires twice (age + basement)
    expect(ids.filter((id) => id === 'radon')).toHaveLength(2);
    expect(ids).toContain('sewer');
    expect(ids).toContain('wdo');
    expect(ids).toContain('mold');
    expect(ids).toContain('thermal');
    expect(ids).toContain('water');
    expect(ids).toHaveLength(7);
  });

  it('new home without basement triggers nothing', () => {
    const property = { yearBuilt: 2020, hasBasement: false };
    const ids = getMatchingIds(property);
    expect(ids).toHaveLength(0);
  });

  it('1985 home without basement fires wdo and water (age-based)', () => {
    const property = { yearBuilt: 1985, hasBasement: false };
    const ids = getMatchingIds(property);
    // yearBuilt 1985: < 2000 (radon), < 1990 (wdo), NOT < 1980 (sewer), = 1985 NOT < 1985 (thermal), < 1990 (water)
    expect(ids).toContain('radon');
    expect(ids).toContain('wdo');
    expect(ids).toContain('water');
    // thermal requires < 1985, and 1985 is NOT < 1985
    expect(ids).not.toContain('thermal');
    expect(ids).not.toContain('sewer'); // requires < 1980
  });

  it('farm property triggers water recommendation regardless of year', () => {
    const property = { yearBuilt: 2020, hasBasement: false, propertyType: 'farm' };
    const ids = getMatchingIds(property);
    expect(ids).toContain('water');
  });

  it('ranch property type triggers water recommendation', () => {
    const property = { yearBuilt: 2020, hasBasement: false, propertyType: 'Ranch Style' };
    const ids = getMatchingIds(property);
    expect(ids).toContain('water');
  });

  it('rural property type triggers water recommendation', () => {
    const property = { yearBuilt: 2020, hasBasement: false, propertyType: 'rural residential' };
    const ids = getMatchingIds(property);
    expect(ids).toContain('water');
  });

  it('basement-only property triggers radon and mold', () => {
    const property = { yearBuilt: 2020, hasBasement: true };
    const ids = getMatchingIds(property);
    expect(ids).toContain('radon');
    expect(ids).toContain('mold');
    expect(ids).toHaveLength(2);
  });

  it('each rule has required fields: id, field, operator, value, reason, priority', () => {
    CONFIG.serviceRecommendations.forEach((rule, i) => {
      expect(rule.id, `rule[${i}].id`).toBeTruthy();
      expect(rule.field, `rule[${i}].field`).toBeTruthy();
      expect(rule.operator, `rule[${i}].operator`).toBeTruthy();
      expect(rule.value, `rule[${i}].value`).toBeTruthy();
      expect(rule.reason, `rule[${i}].reason`).toBeTruthy();
      expect(typeof rule.priority, `rule[${i}].priority`).toBe('number');
    });
  });
});

// Test the addonId-based keying used when rules come from Supabase
// Supabase rules have numeric `id` (DB row) and string `addonId` (service slug)
describe('recommendation keying (Supabase shape)', () => {
  // Mirrors the fixed logic: var recKey = rule.addonId || rule.id;
  function buildRecommendationMap(rules, data) {
    const recommendations = {};
    for (const rule of rules) {
      if (evaluateRule(rule, data)) {
        const recKey = rule.addonId || rule.id;
        if (!recommendations[recKey] || rule.priority > recommendations[recKey].priority) {
          recommendations[recKey] = rule;
        }
      }
    }
    return recommendations;
  }

  it('keys by addonId when Supabase-shaped rules are used', () => {
    const supabaseRules = [
      { id: 17, addonId: 'radon', field: 'yearBuilt', operator: 'lt', value: '2000', reason: 'test', priority: 10 },
      { id: 20, addonId: 'wdo', field: 'yearBuilt', operator: 'lt', value: '1990', reason: 'test', priority: 7 },
    ];
    const data = { yearBuilt: 1970 };
    const recs = buildRecommendationMap(supabaseRules, data);
    expect(recs['radon']).toBeDefined();
    expect(recs['wdo']).toBeDefined();
    expect(recs[17]).toBeUndefined();
    expect(recs[20]).toBeUndefined();
  });

  it('keys by id when local-config-shaped rules are used (no addonId)', () => {
    const localRules = [
      { id: 'radon', field: 'yearBuilt', operator: 'lt', value: '2000', reason: 'test', priority: 10 },
      { id: 'sewer', field: 'yearBuilt', operator: 'lt', value: '1980', reason: 'test', priority: 8 },
    ];
    const data = { yearBuilt: 1970 };
    const recs = buildRecommendationMap(localRules, data);
    expect(recs['radon']).toBeDefined();
    expect(recs['sewer']).toBeDefined();
  });

  it('higher priority wins when multiple Supabase rules match same addonId', () => {
    const rules = [
      { id: 17, addonId: 'radon', field: 'yearBuilt', operator: 'lt', value: '2000', reason: 'age', priority: 10 },
      { id: 18, addonId: 'radon', field: 'hasBasement', operator: 'eq', value: 'true', reason: 'basement', priority: 9 },
    ];
    const data = { yearBuilt: 1970, hasBasement: true };
    const recs = buildRecommendationMap(rules, data);
    expect(Object.keys(recs)).toEqual(['radon']);
    expect(recs['radon'].reason).toBe('age'); // priority 10 wins
  });
});
