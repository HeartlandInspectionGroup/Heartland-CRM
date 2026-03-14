import { describe, it, expect } from 'vitest';
const { parseAddress, normalizeAddress } = require('../../functions/property-details');

describe('parseAddress', () => {
  it('parses a full address with street, city, state, zip', () => {
    const result = parseAddress('123 Main St, Roscoe, IL 61073');
    expect(result).toEqual({
      street: '123 Main St',
      city: 'Roscoe',
      state: 'IL',
      zip: '61073',
    });
  });

  it('parses address with state but no zip', () => {
    const result = parseAddress('456 Oak Ave, Chicago, IL');
    expect(result.street).toBe('456 Oak Ave');
    expect(result.city).toBe('Chicago');
    expect(result.state).toBe('IL');
    expect(result.zip).toBeNull();
  });

  it('handles single-part address (street only)', () => {
    const result = parseAddress('789 Elm Blvd');
    expect(result.street).toBe('789 Elm Blvd');
    expect(result.city).toBeNull();
    expect(result.state).toBeNull();
    expect(result.zip).toBeNull();
  });

  it('handles extra spaces and commas gracefully', () => {
    const result = parseAddress('  100 Pine Rd ,  Springfield , IL  62704  ');
    expect(result.street).toBe('100 Pine Rd');
    expect(result.city).toBe('Springfield');
    expect(result.state).toBe('IL');
    expect(result.zip).toBe('62704');
  });

  it('handles lowercase state abbreviation', () => {
    const result = parseAddress('200 Cedar Ln, Madison, wi 53703');
    expect(result.state).toBe('WI');
    expect(result.zip).toBe('53703');
  });

  it('handles address with only street and city (two parts)', () => {
    const result = parseAddress('300 Birch Dr, Rockford');
    expect(result.street).toBe('300 Birch Dr');
    expect(result.city).toBe('Rockford');
    expect(result.state).toBeNull();
    expect(result.zip).toBeNull();
  });

  it('extracts zip when state abbreviation pattern does not match', () => {
    const result = parseAddress('400 Maple Ct, Beloit, 53511');
    expect(result.street).toBe('400 Maple Ct');
    expect(result.city).toBe('Beloit');
    expect(result.zip).toBe('53511');
  });
});

describe('normalizeAddress', () => {
  it('lowercases and trims', () => {
    expect(normalizeAddress('  123 Main ST  ')).toBe('123 main st');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeAddress('123   Main    St')).toBe('123 main st');
  });

  it('handles already-normalized input', () => {
    expect(normalizeAddress('456 oak ave')).toBe('456 oak ave');
  });
});
