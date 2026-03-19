/**
 * Unit tests for HEA-166: Wizard V2 purpose-built dropdowns per subsection field
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

var wizSrc = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');
var getReportSrc = readFileSync(resolve(__dirname, '../../functions/get-report.js'), 'utf8');

// 1. save-field-answer.js exists
describe('HEA-166 — save-field-answer.js', () => {
  it('function file exists', () => {
    expect(existsSync(resolve(__dirname, '../../functions/save-field-answer.js'))).toBe(true);
  });

  it('uses delete+insert pattern for partial unique indexes (HEA-175)', () => {
    var src = readFileSync(resolve(__dirname, '../../functions/save-field-answer.js'), 'utf8');
    expect(src).toContain('.delete()');
    expect(src).toContain('.insert(row)');
    expect(src).toContain('question_id');
  });

  it('requires record_id and field_id', () => {
    var src = readFileSync(resolve(__dirname, '../../functions/save-field-answer.js'), 'utf8');
    expect(src).toContain('record_id and field_id required');
  });
});

// 2. get-report.js returns field answers
describe('HEA-166 — get-report.js field answers', () => {
  it('fetches inspection_field_answers', () => {
    expect(getReportSrc).toContain("from('inspection_field_answers')");
  });

  it('returns v2_field_answers in response', () => {
    expect(getReportSrc).toContain('v2_field_answers');
  });

  it('keys answers by field_id', () => {
    expect(getReportSrc).toContain('v2.field_answers[a.field_id]');
  });
});

// 3. Wizard V2 loads options and answers
describe('HEA-166 — Wizard V2 data loading', () => {
  it('has v2FieldOptions state variable', () => {
    expect(wizSrc).toContain('var v2FieldOptions');
  });

  it('has v2FieldAnswers state variable', () => {
    expect(wizSrc).toContain('var v2FieldAnswers');
  });

  it('loads wizard_field_options from Supabase', () => {
    expect(wizSrc).toContain("from('wizard_field_options')");
  });

  it('loads inspection_field_answers from Supabase', () => {
    expect(wizSrc).toContain("from('inspection_field_answers')");
  });

  it('keys options by field_id', () => {
    expect(wizSrc).toContain('v2FieldOptions[o.field_id]');
  });
});

// 4. Dropdown rendering in subcards
describe('HEA-166 — Dropdown rendering', () => {
  it('checks v2FieldOptions for field in v2BuildSubcard', () => {
    var subIdx = wizSrc.indexOf('function v2BuildSubcard');
    var subEnd = wizSrc.indexOf('function v2BuildPhotoRow');
    var subBlock = wizSrc.substring(subIdx, subEnd);
    expect(subBlock).toContain('v2FieldOptions[field.id]');
  });

  it('renders select dropdown when options exist', () => {
    expect(wizSrc).toContain('v2-field-dropdown');
    expect(wizSrc).toContain('v2SaveFieldAnswer');
  });

  it('pre-selects saved answer', () => {
    var subIdx = wizSrc.indexOf('function v2BuildSubcard');
    var subEnd = wizSrc.indexOf('function v2BuildPhotoRow');
    var subBlock = wizSrc.substring(subIdx, subEnd);
    expect(subBlock).toContain('v2FieldAnswers[field.id]');
    expect(subBlock).toContain('selected');
  });

  it('shows text input for requires_text options', () => {
    expect(wizSrc).toContain('v2FieldText_');
    expect(wizSrc).toContain('requires_text');
  });

  it('no dropdown when field has no options', () => {
    var subIdx = wizSrc.indexOf('function v2BuildSubcard');
    var subEnd = wizSrc.indexOf('function v2BuildPhotoRow');
    var subBlock = wizSrc.substring(subIdx, subEnd);
    expect(subBlock).toContain('fieldOpts.length');
  });
});

// 5. Autosave functions
describe('HEA-166 — Autosave on change', () => {
  it('has v2SaveFieldAnswer function', () => {
    expect(wizSrc).toContain('v2SaveFieldAnswer');
    expect(wizSrc).toContain('save-field-answer');
  });

  it('has v2SaveFieldTextAnswer function', () => {
    expect(wizSrc).toContain('v2SaveFieldTextAnswer');
  });

  it('toggles text input visibility on dropdown change', () => {
    var fnIdx = wizSrc.indexOf('window.v2SaveFieldAnswer');
    var fnBlock = wizSrc.substring(fnIdx, fnIdx + 800);
    expect(fnBlock).toContain('requires_text');
    expect(fnBlock).toContain("style.display");
  });
});

// 6. State reset
describe('HEA-166 — State reset on back', () => {
  it('resets v2FieldOptions on v2BackToJobs', () => {
    expect(wizSrc).toContain('v2FieldOptions = {}');
  });

  it('resets v2FieldAnswers on v2BackToJobs', () => {
    expect(wizSrc).toContain('v2FieldAnswers = {}');
  });
});
