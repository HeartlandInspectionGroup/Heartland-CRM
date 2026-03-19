/**
 * Unit tests for HEA-129: V2 Wizard Test Mode Toggle
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var html = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');

describe('HEA-129 — test mode button', () => {
  it('has test mode button in HTML', () => {
    expect(html).toContain('id="v2TestModeBtn"');
  });

  it('button has onclick calling v2ToggleTestMode', () => {
    expect(html).toContain('v2ToggleTestMode()');
  });

  it('button label says Disable Required Fields', () => {
    expect(html).toContain('Disable Required Fields');
  });
});

describe('HEA-129 — test mode JS', () => {
  it('defines v2ToggleTestMode function', () => {
    expect(html).toContain('function v2ToggleTestMode()');
  });

  it('defaults v2TestMode to false on page load', () => {
    expect(html).toContain('window.v2TestMode = false');
  });

  it('toggle sets window.v2TestMode', () => {
    expect(html).toContain('window.v2TestMode = !window.v2TestMode');
  });

  it('changes button text to Required Fields Disabled when active', () => {
    expect(html).toContain('Required Fields Disabled');
  });

  it('changes button style to red when active', () => {
    expect(html).toContain('#c0392b');
  });
});

describe('HEA-129 — validation bypass when test mode is on', () => {
  it('v2ValidateCurrentSection returns true when v2TestMode is true', () => {
    var fn = html.substring(html.indexOf('function v2ValidateCurrentSection'), html.indexOf('function v2ValidateCurrentSection') + 200);
    expect(fn).toContain('if (window.v2TestMode) return true');
  });

  it('v2AllSectionsComplete returns true when v2TestMode is true', () => {
    var fn = html.substring(html.indexOf('function v2AllSectionsComplete'), html.indexOf('function v2AllSectionsComplete') + 200);
    expect(fn).toContain('if (window.v2TestMode) return true');
  });

  it('v2SubmitIllinois skips validation when v2TestMode is true', () => {
    var fn = html.substring(html.indexOf('function v2SubmitIllinois'), html.indexOf('function v2SubmitIllinois') + 1000);
    expect(fn).toContain('if (!window.v2TestMode)');
  });

  it('v2SubmitProfile skips property type check when v2TestMode is true', () => {
    expect(html).toContain('!propType && !window.v2TestMode');
  });
});

describe('HEA-129 — no persistence', () => {
  it('does not use localStorage for test mode', () => {
    // Search for localStorage references near v2TestMode
    var testModeSection = html.substring(html.indexOf('window.v2TestMode = false'), html.indexOf('window.v2TestMode = false') + 500);
    expect(testModeSection).not.toContain('localStorage');
  });
});
