import { describe, it, expect } from 'vitest';
const {
  normaliseRentCast,
  normaliseMashvisor,
  normaliseRealtor,
  normaliseZillow,
} = require('../../functions/property-details');

// ─── Common normalized shape every normalizer must return ───
const EXPECTED_KEYS = [
  'found', 'yearBuilt', 'livingAreaSqft', 'lotSize', 'bedrooms',
  'bathrooms', 'propertyType', 'hasBasement', 'foundationType',
  'roofType', 'zestimate',
];

function expectNormalizedShape(result) {
  EXPECTED_KEYS.forEach((key) => {
    expect(result).toHaveProperty(key);
  });
}

// ══════════════════════════════════════════════
// normaliseRentCast
// ══════════════════════════════════════════════
describe('normaliseRentCast', () => {
  it('returns { found: false } for null input', () => {
    expect(normaliseRentCast(null)).toEqual({ found: false });
  });

  it('normalizes a full RentCast response', () => {
    const raw = {
      yearBuilt: 1985,
      squareFootage: 1800,
      lotSize: 8500,
      bedrooms: 3,
      bathrooms: 2,
      propertyType: 'Single Family',
      features: { basement: 'Finished', foundation: 'Poured Concrete', roof: 'Asphalt Shingle' },
    };
    const result = normaliseRentCast(raw);
    expectNormalizedShape(result);
    expect(result.found).toBe(true);
    expect(result.yearBuilt).toBe(1985);
    expect(result.livingAreaSqft).toBe(1800);
    expect(result.bedrooms).toBe(3);
    expect(result.hasBasement).toBe(true);
    expect(result.foundationType).toBe('Poured Concrete');
    expect(result.zestimate).toBeNull();
  });

  it('handles partial data (yearBuilt only)', () => {
    const result = normaliseRentCast({ yearBuilt: 2010 });
    expect(result.found).toBe(true);
    expect(result.livingAreaSqft).toBeNull();
    expect(result.bedrooms).toBeNull();
  });

  it('hasBasement is null when features is missing', () => {
    const result = normaliseRentCast({ yearBuilt: 2000 });
    expect(result.hasBasement).toBeNull();
  });

  it('found is false when no yearBuilt or squareFootage', () => {
    const result = normaliseRentCast({ propertyType: 'Condo' });
    expect(result.found).toBe(false);
  });
});

// ══════════════════════════════════════════════
// normaliseMashvisor
// ══════════════════════════════════════════════
describe('normaliseMashvisor', () => {
  it('returns { found: false } for null input', () => {
    expect(normaliseMashvisor(null)).toEqual({ found: false });
  });

  it('normalizes a full Mashvisor response', () => {
    const raw = {
      year_built: 1972,
      sqft: 2200,
      lot_size: 10000,
      beds: 4,
      baths: 2.5,
      property_type: 'Single Family',
      basement: 'Full',
      foundation: 'Block',
      roof: 'Metal',
    };
    const result = normaliseMashvisor(raw);
    expectNormalizedShape(result);
    expect(result.found).toBe(true);
    expect(result.yearBuilt).toBe(1972);
    expect(result.livingAreaSqft).toBe(2200);
    expect(result.hasBasement).toBe(true);
  });

  it('handles camelCase field fallbacks', () => {
    const raw = { year_built: 1990, squareFootage: 1500, bedrooms: 3, bathrooms: 1, lotSize: 5000 };
    const result = normaliseMashvisor(raw);
    expect(result.found).toBe(true);
    expect(result.livingAreaSqft).toBe(1500);
    expect(result.bedrooms).toBe(3);
    expect(result.lotSize).toBe(5000);
  });

  it('hasBasement is false for "none" string', () => {
    const result = normaliseMashvisor({ year_built: 2000, basement: 'None' });
    expect(result.hasBasement).toBe(false);
  });

  it('hasBasement is false for "no" string', () => {
    const result = normaliseMashvisor({ year_built: 2000, basement: 'No' });
    expect(result.hasBasement).toBe(false);
  });

  it('uses square_feet fallback for sqft', () => {
    const result = normaliseMashvisor({ square_feet: 1700 });
    expect(result.found).toBe(true);
    expect(result.livingAreaSqft).toBe(1700);
  });
});

// ══════════════════════════════════════════════
// normaliseRealtor
// ══════════════════════════════════════════════
describe('normaliseRealtor', () => {
  it('returns { found: false } for null input', () => {
    expect(normaliseRealtor(null)).toEqual({ found: false });
  });

  it('normalizes a full Realtor response with description object', () => {
    const raw = {
      description: {
        year_built: 1995,
        sqft: 2400,
        beds: 4,
        baths: 3,
        type: 'single_family',
        lot_sqft: 12000,
      },
    };
    const result = normaliseRealtor(raw);
    expectNormalizedShape(result);
    expect(result.found).toBe(true);
    expect(result.yearBuilt).toBe(1995);
    expect(result.livingAreaSqft).toBe(2400);
    expect(result.bedrooms).toBe(4);
    expect(result.bathrooms).toBe(3);
    expect(result.hasBasement).toBeNull(); // Realtor never provides this
    expect(result.zestimate).toBeNull();
  });

  it('falls back to top-level fields when description is empty', () => {
    const raw = { year_built: 2005, beds: 2, baths: 1 };
    const result = normaliseRealtor(raw);
    expect(result.found).toBe(true);
    expect(result.yearBuilt).toBe(2005);
    expect(result.bedrooms).toBe(2);
  });

  it('parses string numbers to integers', () => {
    const raw = { description: { year_built: '1988', sqft: '1600', beds: '3', baths: '2.5' } };
    const result = normaliseRealtor(raw);
    expect(result.yearBuilt).toBe(1988);
    expect(result.livingAreaSqft).toBe(1600);
    expect(result.bedrooms).toBe(3);
    expect(result.bathrooms).toBe(2.5);
  });
});

// ══════════════════════════════════════════════
// normaliseZillow
// ══════════════════════════════════════════════
describe('normaliseZillow', () => {
  it('returns { found: false } for null input', () => {
    expect(normaliseZillow(null)).toEqual({ found: false });
  });

  it('normalizes a full Zillow response', () => {
    const raw = {
      yearBuilt: 1960,
      livingArea: 1400,
      lotSize: 6000,
      bedrooms: 3,
      bathrooms: 1.5,
      homeType: 'SINGLE_FAMILY',
      zestimate: 185000,
      resoFacts: {
        basement: 'Full',
        foundationDetails: 'Poured Concrete',
        roofType: 'Asphalt Shingle',
      },
    };
    const result = normaliseZillow(raw);
    expectNormalizedShape(result);
    expect(result.found).toBe(true);
    expect(result.yearBuilt).toBe(1960);
    expect(result.livingAreaSqft).toBe(1400);
    expect(result.hasBasement).toBe(true);
    expect(result.zestimate).toBe(185000);
    expect(result.roofType).toBe('Asphalt Shingle');
  });

  it('falls back to resoFacts for missing top-level fields', () => {
    const raw = { resoFacts: { yearBuilt: 2010, livingArea: 2000, bedrooms: 4, bathrooms: 3 } };
    const result = normaliseZillow(raw);
    expect(result.found).toBe(true);
    expect(result.yearBuilt).toBe(2010);
    expect(result.livingAreaSqft).toBe(2000);
  });

  it('hasBasement is false for "No Basement"', () => {
    const result = normaliseZillow({ yearBuilt: 2000, resoFacts: { basement: 'No Basement' } });
    expect(result.hasBasement).toBe(false);
  });

  it('hasBasement is false for "none"', () => {
    const result = normaliseZillow({ yearBuilt: 2000, resoFacts: { basement: 'none' } });
    expect(result.hasBasement).toBe(false);
  });

  it('zestimate is parsed as integer', () => {
    const result = normaliseZillow({ yearBuilt: 2000, zestimate: '250000' });
    expect(result.zestimate).toBe(250000);
  });

  it('found is false when no yearBuilt or livingArea', () => {
    const result = normaliseZillow({ homeType: 'Condo' });
    expect(result.found).toBe(false);
  });
});
