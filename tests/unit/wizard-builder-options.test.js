/**
 * Unit tests for HEA-162: Wizard Builder field options management
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

var wbHtml = readFileSync(resolve(__dirname, '../../wizard-builder.html'), 'utf8');

// 1. Options section in modal
describe('HEA-162 — Options section in field modal', () => {
  it('has fieldOptionsContainer element', () => {
    expect(wbHtml).toContain('id="fieldOptionsContainer"');
  });

  it('has Add Option button', () => {
    expect(wbHtml).toContain('wbAddOptionRow()');
    expect(wbHtml).toContain('+ Add Option');
  });

  it('label says Dropdown Options', () => {
    expect(wbHtml).toContain('Dropdown Options');
  });
});

// 2. Options loaded on modal open
describe('HEA-162 — Options pre-loaded on modal open', () => {
  it('wbOpenFieldModal loads wizard_field_options', () => {
    var fnIdx = wbHtml.indexOf('async function wbOpenFieldModal');
    var fnEnd = wbHtml.indexOf('async function wbSaveField');
    var fnBlock = wbHtml.substring(fnIdx, fnEnd);
    expect(fnBlock).toContain("from('wizard_field_options')");
    expect(fnBlock).toContain('wbRenderOptionRows');
  });
});

// 3. Helper functions exist
describe('HEA-162 — Option row helper functions', () => {
  it('defines wbRenderOptionRows', () => {
    expect(wbHtml).toContain('function wbRenderOptionRows(options)');
  });

  it('defines wbAddOptionRow', () => {
    expect(wbHtml).toContain('function wbAddOptionRow(opt)');
  });

  it('defines wbRemoveOptionRow', () => {
    expect(wbHtml).toContain('function wbRemoveOptionRow(btn)');
  });

  it('defines wbMoveOptionRow', () => {
    expect(wbHtml).toContain('function wbMoveOptionRow(btn, dir)');
  });

  it('defines wbGetOptionRows', () => {
    expect(wbHtml).toContain('function wbGetOptionRows()');
  });

  it('has auto-slugify for value field', () => {
    expect(wbHtml).toContain('wbAutoSlugify');
  });
});

// 4. Option row renders label, value, requires_text, reorder, delete
describe('HEA-162 — Option row HTML', () => {
  it('renders label input', () => {
    expect(wbHtml).toContain('wb-opt-label');
  });

  it('renders value input', () => {
    expect(wbHtml).toContain('wb-opt-value');
  });

  it('renders requires_text checkbox', () => {
    expect(wbHtml).toContain('wb-opt-text');
  });

  it('has move up/down buttons', () => {
    expect(wbHtml).toContain('wbMoveOptionRow(this,-1)');
    expect(wbHtml).toContain('wbMoveOptionRow(this,1)');
  });

  it('has delete button', () => {
    expect(wbHtml).toContain('wbRemoveOptionRow(this)');
  });
});

// 5. Save calls save-field-options
describe('HEA-162 — wbSaveField saves options', () => {
  it('calls save-field-options function after field save', () => {
    var fnIdx = wbHtml.indexOf('async function wbSaveField');
    var fnEnd = wbHtml.indexOf('function wbRenderOptionRows');
    var fnBlock = wbHtml.substring(fnIdx, fnEnd);
    expect(fnBlock).toContain('save-field-options');
    expect(fnBlock).toContain('wbGetOptionRows()');
  });
});

// 6. save-field-options.js exists
describe('HEA-162 — save-field-options.js', () => {
  it('function file exists', () => {
    expect(existsSync(resolve(__dirname, '../../functions/save-field-options.js'))).toBe(true);
  });

  it('deletes existing then inserts new', () => {
    var src = readFileSync(resolve(__dirname, '../../functions/save-field-options.js'), 'utf8');
    expect(src).toContain(".delete().eq('field_id', field_id)");
    expect(src).toContain('.insert(rows)');
  });

  it('sets order_index from array position', () => {
    var src = readFileSync(resolve(__dirname, '../../functions/save-field-options.js'), 'utf8');
    expect(src).toContain('order_index');
  });
});
