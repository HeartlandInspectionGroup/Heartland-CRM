import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Script, createContext } from 'vm';

// Load the data file in a VM context so we can access the global var
const filePath = join(__dirname, '../../assets/js/demo-report-data.js');
const code = readFileSync(filePath, 'utf-8');
const context = createContext({});
new Script(code).runInContext(context);
const DEMO_REPORT = context.DEMO_REPORT;

const VALID_CATEGORIES = ['electrical', 'plumbing', 'structural', 'roofing', 'hvac', 'exterior', 'interior'];
const VALID_SEVERITIES = ['major', 'minor', 'info'];
const REQUIRED_FINDING_FIELDS = ['id', 'category', 'severity', 'title', 'description', 'location', 'recommendation', 'photoCaption'];
const REQUIRED_PROPERTY_FIELDS = ['address', 'city', 'state', 'zip', 'yearBuilt', 'sqft', 'bedrooms', 'bathrooms', 'type'];

describe('DEMO_REPORT data integrity', () => {
  it('is defined and has required top-level keys', () => {
    expect(DEMO_REPORT).toBeDefined();
    expect(DEMO_REPORT).toHaveProperty('property');
    expect(DEMO_REPORT).toHaveProperty('inspection');
    expect(DEMO_REPORT).toHaveProperty('findings');
  });

  it('has exactly 20 findings', () => {
    expect(DEMO_REPORT.findings).toHaveLength(20);
  });

  it('has correct severity counts (4 major, 9 minor, 7 info)', () => {
    const counts = { major: 0, minor: 0, info: 0 };
    DEMO_REPORT.findings.forEach((f) => { counts[f.severity]++; });
    expect(counts.major).toBe(4);
    expect(counts.minor).toBe(9);
    expect(counts.info).toBe(7);
  });

  it('all findings have required fields', () => {
    DEMO_REPORT.findings.forEach((f) => {
      REQUIRED_FINDING_FIELDS.forEach((field) => {
        expect(f).toHaveProperty(field);
        expect(typeof f[field]).toBe('string');
        expect(f[field].length).toBeGreaterThan(0);
      });
    });
  });

  it('all finding IDs are unique', () => {
    const ids = DEMO_REPORT.findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all categories are valid', () => {
    DEMO_REPORT.findings.forEach((f) => {
      expect(VALID_CATEGORIES).toContain(f.category);
    });
  });

  it('all severities are valid', () => {
    DEMO_REPORT.findings.forEach((f) => {
      expect(VALID_SEVERITIES).toContain(f.severity);
    });
  });

  it('property has all required fields', () => {
    REQUIRED_PROPERTY_FIELDS.forEach((field) => {
      expect(DEMO_REPORT.property).toHaveProperty(field);
    });
  });

  it('inspection has date, inspector, and company', () => {
    expect(DEMO_REPORT.inspection).toHaveProperty('date');
    expect(DEMO_REPORT.inspection).toHaveProperty('inspector');
    expect(DEMO_REPORT.inspection).toHaveProperty('company');
  });
});
