import { describe, it, expect } from 'vitest';

// Replicate the pure functions from index.html / agent-portal.html
// These are inline in the HTML files, so we define them here for testing.

const STATE_TAX_RATES = {
  AL:4.00, AK:0, AZ:5.60, AR:6.50, CA:7.25, CO:2.90, CT:6.35, DE:0,
  FL:6.00, GA:4.00, HI:4.00, ID:6.00, IL:6.25, IN:7.00, IA:6.00, KS:6.50,
  KY:6.00, LA:4.45, ME:5.50, MD:6.00, MA:6.25, MI:6.00, MN:6.875, MS:7.00,
  MO:4.225, MT:0, NE:5.50, NV:6.85, NH:0, NJ:6.625, NM:4.875, NY:4.00,
  NC:4.75, ND:5.00, OH:5.75, OK:4.50, OR:0, PA:6.00, RI:7.00, SC:6.00,
  SD:4.20, TN:7.00, TX:6.25, UT:6.10, VT:6.00, VA:5.30, WA:6.50, WV:6.00,
  WI:5.00, WY:4.00, DC:6.00
};

function detectStateFromAddress(addr) {
  if (!addr) return null;
  var m = addr.match(/,\s*([A-Z]{2})\s*\d{5}/);
  return m ? m[1] : null;
}

function calculateTax(subtotal, stateCode) {
  if (!stateCode || subtotal <= 0) return 0;
  var rate = STATE_TAX_RATES[stateCode];
  if (rate === undefined || rate === 0) return 0;
  return Math.round(subtotal * rate / 100);
}

// ─── TESTS ────────────────────────────────────────

describe('STATE_TAX_RATES', () => {
  it('has entries for all 50 states + DC', () => {
    expect(Object.keys(STATE_TAX_RATES)).toHaveLength(51);
  });

  it('all rates are non-negative numbers', () => {
    Object.entries(STATE_TAX_RATES).forEach(([state, rate]) => {
      expect(typeof rate).toBe('number');
      expect(rate).toBeGreaterThanOrEqual(0);
    });
  });

  it('Oregon has 0% tax', () => {
    expect(STATE_TAX_RATES.OR).toBe(0);
  });

  it('Illinois has 6.25% tax', () => {
    expect(STATE_TAX_RATES.IL).toBe(6.25);
  });

  it('no state exceeds 10%', () => {
    Object.values(STATE_TAX_RATES).forEach((rate) => {
      expect(rate).toBeLessThanOrEqual(10);
    });
  });
});

describe('detectStateFromAddress', () => {
  it('extracts state from standard formatted address', () => {
    expect(detectStateFromAddress('123 Main St, Springfield, IL 62704')).toBe('IL');
  });

  it('extracts state from address with extra parts', () => {
    expect(detectStateFromAddress('456 Oak Ave, Apt 2B, Chicago, IL 60601')).toBe('IL');
  });

  it('extracts state from various states', () => {
    expect(detectStateFromAddress('100 Pine Rd, Portland, OR 97201')).toBe('OR');
    expect(detectStateFromAddress('200 Cedar Ln, Austin, TX 73301')).toBe('TX');
    expect(detectStateFromAddress('300 Birch Dr, New York, NY 10001')).toBe('NY');
  });

  it('returns null for address without state+zip pattern', () => {
    expect(detectStateFromAddress('123 Main St, Springfield')).toBeNull();
  });

  it('returns null for address with only zip (no state)', () => {
    expect(detectStateFromAddress('123 Main St, 62704')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(detectStateFromAddress('')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(detectStateFromAddress(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(detectStateFromAddress(undefined)).toBeNull();
  });

  it('does not match lowercase state abbreviation', () => {
    // The regex requires uppercase — addresses should be pre-formatted
    expect(detectStateFromAddress('123 Main St, Springfield, il 62704')).toBeNull();
  });

  it('handles zip+4 format', () => {
    // Regex expects 5-digit zip right after state
    expect(detectStateFromAddress('123 Main St, Chicago, IL 60601-1234')).toBe('IL');
  });
});

describe('calculateTax', () => {
  it('calculates tax for Illinois ($400 @ 6.25% = $25)', () => {
    expect(calculateTax(400, 'IL')).toBe(25);
  });

  it('calculates tax for Indiana ($350 @ 7% = $25)', () => {
    expect(calculateTax(350, 'IN')).toBe(25); // 350 * 7 / 100 = 24.5 → rounded to 25
  });

  it('rounds to nearest dollar', () => {
    // $100 @ 6.25% = 6.25 → rounds to 6
    expect(calculateTax(100, 'IL')).toBe(6);
    // $200 @ 6.25% = 12.5 → rounds to 13
    expect(calculateTax(200, 'IL')).toBe(13);
  });

  it('returns 0 for Oregon (no sales tax)', () => {
    expect(calculateTax(500, 'OR')).toBe(0);
  });

  it('returns 0 for Montana (no sales tax)', () => {
    expect(calculateTax(500, 'MT')).toBe(0);
  });

  it('returns 0 for Delaware (no sales tax)', () => {
    expect(calculateTax(500, 'DE')).toBe(0);
  });

  it('returns 0 for zero subtotal', () => {
    expect(calculateTax(0, 'IL')).toBe(0);
  });

  it('returns 0 for negative subtotal', () => {
    expect(calculateTax(-100, 'IL')).toBe(0);
  });

  it('returns 0 for unknown state code', () => {
    expect(calculateTax(500, 'XX')).toBe(0);
  });

  it('returns 0 for null state', () => {
    expect(calculateTax(500, null)).toBe(0);
  });

  it('handles fractional rates correctly (MN 6.875%)', () => {
    // $800 @ 6.875% = 55.00
    expect(calculateTax(800, 'MN')).toBe(55);
  });

  it('handles fractional rates correctly (MO 4.225%)', () => {
    // $1000 @ 4.225% = 42.25 → rounds to 42
    expect(calculateTax(1000, 'MO')).toBe(42);
  });
});
