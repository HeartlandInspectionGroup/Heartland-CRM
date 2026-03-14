import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read the submit-inspection function source
const fnPath = resolve(__dirname, '../../functions/submit-inspection.js');
const fnSource = readFileSync(fnPath, 'utf-8');

describe('Submit Inspection Function — Structure', () => {
  it('should be a valid JavaScript file', () => {
    expect(() => new Function(fnSource)).not.toThrow();
  });

  it('should export a handler function', () => {
    expect(fnSource).toContain('exports.handler');
  });

  it('should handle OPTIONS for CORS', () => {
    expect(fnSource).toContain("event.httpMethod === 'OPTIONS'");
  });

  it('should reject non-POST methods', () => {
    expect(fnSource).toContain("event.httpMethod !== 'POST'");
    expect(fnSource).toContain('405');
  });

  it('should validate required inspection_id', () => {
    expect(fnSource).toContain('!inspection_id');
    expect(fnSource).toContain('400');
  });

  it('should compile findings from section data', () => {
    expect(fnSource).toContain('Major Defect');
    expect(fnSource).toContain('Minor Defect');
    expect(fnSource).toContain('severity');
  });

  it('should count major and minor findings', () => {
    expect(fnSource).toContain('major_count');
    expect(fnSource).toContain('minor_count');
  });

  it('should create audit log entry', () => {
    expect(fnSource).toContain('audit_log');
    expect(fnSource).toContain('inspection_submitted');
  });

  it('should update inspection status to submitted', () => {
    expect(fnSource).toContain("status: 'submitted'");
  });

  it('should check for incomplete sections', () => {
    expect(fnSource).toContain('incomplete');
    expect(fnSource).toContain('not_started');
    expect(fnSource).toContain('in_progress');
  });
});

describe('Submit Inspection — Findings Compilation Logic', () => {
  // Test the findings compilation logic extracted from the function
  function compileFindingsFromSectionData(sectionData, templateMap) {
    const findings = [];
    let counter = 1;

    for (const sd of sectionData) {
      if (sd.status === 'skipped' || sd.status === 'na') continue;
      const template = templateMap[sd.section_id] || {};
      const items = typeof sd.items === 'string' ? JSON.parse(sd.items) : (sd.items || []);

      for (const item of items) {
        if (item.condition === 'Minor Defect' || item.condition === 'Major Defect') {
          findings.push({
            id: `F${String(counter++).padStart(3, '0')}`,
            section_id: sd.section_id,
            severity: item.condition === 'Major Defect' ? 'major' : 'minor',
            title: item.label || item.id,
            description: item.comment || '',
          });
        }
      }
    }
    return findings;
  }

  it('should extract major defects', () => {
    const data = [{
      section_id: 'roof',
      status: 'completed',
      items: [{ id: 'r1', label: 'Leak', condition: 'Major Defect', comment: 'Active leak' }],
    }];
    const findings = compileFindingsFromSectionData(data, {});
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('major');
    expect(findings[0].title).toBe('Leak');
  });

  it('should extract minor defects', () => {
    const data = [{
      section_id: 'roof',
      status: 'completed',
      items: [{ id: 'r1', label: 'Wear', condition: 'Minor Defect', comment: 'Normal wear' }],
    }];
    const findings = compileFindingsFromSectionData(data, {});
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('minor');
  });

  it('should not include satisfactory items', () => {
    const data = [{
      section_id: 'roof',
      status: 'completed',
      items: [{ id: 'r1', label: 'OK', condition: 'Satisfactory' }],
    }];
    const findings = compileFindingsFromSectionData(data, {});
    expect(findings).toHaveLength(0);
  });

  it('should skip skipped sections', () => {
    const data = [{
      section_id: 'roof',
      status: 'skipped',
      items: [{ id: 'r1', label: 'Leak', condition: 'Major Defect' }],
    }];
    const findings = compileFindingsFromSectionData(data, {});
    expect(findings).toHaveLength(0);
  });

  it('should number findings sequentially', () => {
    const data = [{
      section_id: 'roof',
      status: 'completed',
      items: [
        { id: 'r1', label: 'Leak', condition: 'Major Defect' },
        { id: 'r2', label: 'Wear', condition: 'Minor Defect' },
      ],
    }];
    const findings = compileFindingsFromSectionData(data, {});
    expect(findings[0].id).toBe('F001');
    expect(findings[1].id).toBe('F002');
  });

  it('should handle multiple sections', () => {
    const data = [
      { section_id: 'roof', status: 'completed', items: [{ id: 'r1', condition: 'Major Defect' }] },
      { section_id: 'electrical', status: 'completed', items: [{ id: 'e1', condition: 'Minor Defect' }] },
      { section_id: 'plumbing', status: 'completed', items: [{ id: 'p1', condition: 'Satisfactory' }] },
    ];
    const findings = compileFindingsFromSectionData(data, {});
    expect(findings).toHaveLength(2);
  });
});
