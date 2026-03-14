import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createContext, Script } from 'vm';
import { resolve } from 'path';

// Load availability-config.js
const configPath = resolve(__dirname, '../../assets/js/availability-config.js');
const configSource = readFileSync(configPath, 'utf-8');
const ctx = createContext({});
new Script(configSource).runInContext(ctx);
const CONFIG = ctx.HEARTLAND_CONFIG;

function matchTier(sqft) {
  const ranges = CONFIG.homeSizeTierRanges;
  for (let i = 0; i < ranges.length; i++) {
    if (sqft >= ranges[i].min && sqft <= ranges[i].max) return i;
  }
  return -1;
}

describe('homeSizeTierRanges', () => {
  it('has 5 tiers matching homeSizeTiers', () => {
    expect(CONFIG.homeSizeTierRanges).toHaveLength(5);
    expect(CONFIG.pricing.homeSizeTiers).toHaveLength(5);
  });

  it('1200 sqft → tier 0 (0–1,500)', () => {
    expect(matchTier(1200)).toBe(0);
  });

  it('2000 sqft → tier 1 (1,501–2,499)', () => {
    expect(matchTier(2000)).toBe(1);
  });

  it('2500 sqft → tier 2 (2,500–2,999)', () => {
    expect(matchTier(2500)).toBe(2);
  });

  it('3200 sqft → tier 3 (3,000–3,499)', () => {
    expect(matchTier(3200)).toBe(3);
  });

  it('4000 sqft → tier 4 (3,500+)', () => {
    expect(matchTier(4000)).toBe(4);
  });

  it('boundary: 1500 sqft → tier 0', () => {
    expect(matchTier(1500)).toBe(0);
  });

  it('boundary: 1501 sqft → tier 1', () => {
    expect(matchTier(1501)).toBe(1);
  });

  it('boundary: 2499 sqft → tier 1', () => {
    expect(matchTier(2499)).toBe(1);
  });

  it('boundary: 2999 sqft → tier 2', () => {
    expect(matchTier(2999)).toBe(2);
  });

  it('boundary: 3000 sqft → tier 3', () => {
    expect(matchTier(3000)).toBe(3);
  });

  it('boundary: 3499 sqft → tier 3', () => {
    expect(matchTier(3499)).toBe(3);
  });

  it('boundary: 3500 sqft → tier 4', () => {
    expect(matchTier(3500)).toBe(4);
  });

  it('very large home (10000 sqft) → tier 4', () => {
    expect(matchTier(10000)).toBe(4);
  });

  it('tier ranges are contiguous with no gaps', () => {
    const ranges = CONFIG.homeSizeTierRanges;
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].min).toBe(ranges[i - 1].max + 1);
    }
  });

  it('last tier has Infinity as max', () => {
    const last = CONFIG.homeSizeTierRanges[CONFIG.homeSizeTierRanges.length - 1];
    expect(last.max).toBe(Infinity);
  });

  it('each tier has a corresponding price', () => {
    CONFIG.homeSizeTierRanges.forEach((_, i) => {
      expect(CONFIG.pricing.homeSizeTiers[i]).toBeDefined();
      expect(typeof CONFIG.pricing.homeSizeTiers[i].price).toBe('number');
    });
  });
});

// Mirrors the label-parsing fallback used in agent-portal.html and index.html
// when homeSizeTierRanges is not present (e.g., Supabase config_json)
function parseTierLabel(rawLabel) {
  const label = (rawLabel || '').replace(/,/g, '');
  const plusMatch = label.match(/(\d+)\+/);
  if (plusMatch) return { min: parseInt(plusMatch[1]), max: Infinity };
  const rangeMatch = label.match(/(\d+)\s*[–—\-]\s*(\d+)/);
  if (rangeMatch) return { min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) };
  return null;
}

describe('tier label regex parsing (Supabase fallback)', () => {
  it('parses "0 – 1,500 sqft" (en-dash with spaces)', () => {
    expect(parseTierLabel('0 – 1,500 sqft')).toEqual({ min: 0, max: 1500 });
  });

  it('parses "1,501 – 2,499 sqft" (en-dash with spaces and commas)', () => {
    expect(parseTierLabel('1,501 – 2,499 sqft')).toEqual({ min: 1501, max: 2499 });
  });

  it('parses "2,500 – 3499 sqft" (en-dash with spaces, one comma)', () => {
    expect(parseTierLabel('2,500 – 3499 sqft')).toEqual({ min: 2500, max: 3499 });
  });

  it('parses "3,500+ sqft" (plus format)', () => {
    expect(parseTierLabel('3,500+ sqft')).toEqual({ min: 3500, max: Infinity });
  });

  it('parses "0-1500 sqft" (hyphen, no spaces)', () => {
    expect(parseTierLabel('0-1500 sqft')).toEqual({ min: 0, max: 1500 });
  });

  it('parses "1501—2499 sqft" (em-dash, no spaces)', () => {
    expect(parseTierLabel('1501\u20142499 sqft')).toEqual({ min: 1501, max: 2499 });
  });

  it('returns null for unparseable label', () => {
    expect(parseTierLabel('Unknown')).toBeNull();
  });
});
