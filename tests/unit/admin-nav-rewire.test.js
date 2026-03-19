/**
 * Unit tests for HEA-103: Admin Nav Rewire
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var html = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');

// Extract the header actions HTML block (between the div and the user badge)
var headerActionsStart = html.indexOf('<!-- Right side: all 3 action items -->');
var headerActionsEnd = html.indexOf('<!-- Initials Avatar');
var headerActions = html.substring(headerActionsStart, headerActionsEnd);

// Extract the Settings sidebar group
var settingsGroupStart = html.indexOf('id="sidebarGroupSettings"');
var settingsGroupEnd = html.indexOf('id="sidebarGroupMisc"');
var settingsGroup = html.substring(settingsGroupStart, settingsGroupEnd);

describe('HEA-164 — Field Photos button retired', () => {
  it('no Field Photos button in header', () => {
    expect(headerActions).not.toContain('field-capture.html');
    expect(headerActions).not.toContain('Field Photos');
  });
});

describe('HEA-103 — Wizard Builder in Settings sidebar', () => {
  it('Wizard Builder nav item exists in Settings sidebar', () => {
    expect(settingsGroup).toContain('Wizard Builder');
  });

  it('Wizard Builder opens wizard-builder.html in new tab', () => {
    expect(settingsGroup).toContain("window.open('/wizard-builder.html'");
  });

  it('Wizard Builder uses tab-btn class', () => {
    var wizLine = settingsGroup.split('\n').find(function(l) { return l.includes('Wizard Builder'); });
    expect(wizLine).toContain('class="tab-btn"');
  });
});

describe('HEA-103 — Wizard Builder absent from header', () => {
  it('no Wizard Builder button in header actions', () => {
    expect(headerActions).not.toContain('Wizard Builder');
  });

  it('no red header button in header actions', () => {
    expect(headerActions).not.toContain('fp-header-btn--red');
  });
});

describe('HEA-103 — Inspection Wizard button unchanged', () => {
  it('still points to inspector-wizard-v2.html', () => {
    expect(headerActions).toContain("window.open('/inspector-wizard-v2.html'");
  });

  it('label is unchanged', () => {
    expect(headerActions).toContain('Inspection Wizard');
  });
});

describe('HEA-103 — other header buttons unchanged', () => {
  it('Field Payment button still present', () => {
    expect(headerActions).toContain('window.openFieldPayment()');
    expect(headerActions).toContain('Field Payment');
  });

  it('header has exactly 4 action buttons (Wizard, Payment, Narratives, Manual Narrative)', () => {
    var btnMatches = headerActions.match(/class="fp-header-btn"/g);
    expect(btnMatches).not.toBeNull();
    expect(btnMatches.length).toBe(4);
  });
});
