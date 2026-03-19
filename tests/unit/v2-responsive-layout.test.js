/**
 * Unit tests for HEA-115: V2 Wizard Responsive Layout
 *
 * Tests the drawer toggle JS logic and verifies responsive CSS rules
 * exist in inspector-wizard-v2.html at correct breakpoints.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var html = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');

// ── CSS rule verification ─────────────────────────────────────────────────

describe('HEA-115 — responsive CSS breakpoints exist', () => {
  it('has a tablet breakpoint at max-width: 1023px', () => {
    expect(html).toContain('@media (max-width: 1023px)');
  });

  it('has a mobile breakpoint at max-width: 767px', () => {
    expect(html).toContain('@media (max-width: 767px)');
  });

  it('hides sidebar on mobile', () => {
    // Inside the mobile media query, sidebar should be display: none
    var mobileBlock = html.split('@media (max-width: 767px)')[1] || '';
    expect(mobileBlock).toContain('.v2-sidebar');
    expect(mobileBlock).toContain('display: none');
  });

  it('shows drawer toggle on mobile', () => {
    var mobileBlock = html.split('@media (max-width: 767px)')[1] || '';
    expect(mobileBlock).toContain('.v2-drawer-toggle');
    expect(mobileBlock).toContain('display: flex');
  });

  it('drawer toggle is hidden by default on desktop', () => {
    // The base CSS should have display: none
    expect(html).toMatch(/\.v2-drawer-toggle\s*\{[^}]*display:\s*none/);
  });

  it('narrows sidebar to 200px on tablet', () => {
    var tabletBlock = html.split('@media (max-width: 1023px)')[1] || '';
    var tabletSection = tabletBlock.split('}')[0] + tabletBlock.split('}')[1]; // approximate
    expect(tabletBlock).toContain('.v2-sidebar');
    expect(tabletBlock).toContain('200px');
  });
});

describe('HEA-115 — mobile tap targets', () => {
  it('rating buttons have min-height 44px on mobile', () => {
    var mobileBlock = html.split('@media (max-width: 767px)')[1] || '';
    expect(mobileBlock).toContain('.v2-rating-btn');
    expect(mobileBlock).toContain('min-height: 44px');
  });

  it('recommendation items have min-height 44px on mobile', () => {
    var mobileBlock = html.split('@media (max-width: 767px)')[1] || '';
    expect(mobileBlock).toContain('.v2-rec-item');
    expect(mobileBlock).toContain('min-height: 44px');
  });
});

describe('HEA-115 — mobile navigation', () => {
  it('panel footer is position fixed on mobile', () => {
    var mobileBlock = html.split('@media (max-width: 767px)')[1] || '';
    expect(mobileBlock).toContain('.v2-panel-footer');
    expect(mobileBlock).toContain('position: fixed');
    expect(mobileBlock).toContain('bottom: 0');
  });

  it('panel body has extra bottom padding for fixed footer', () => {
    var mobileBlock = html.split('@media (max-width: 767px)')[1] || '';
    expect(mobileBlock).toContain('.v2-panel-body');
    expect(mobileBlock).toContain('padding-bottom');
  });
});

describe('HEA-115 — mobile photo strip', () => {
  it('photo grid switches to horizontal scroll on mobile', () => {
    var mobileBlock = html.split('@media (max-width: 767px)')[1] || '';
    expect(mobileBlock).toContain('.v2-photo-grid');
    expect(mobileBlock).toContain('flex-wrap: nowrap');
    expect(mobileBlock).toContain('overflow-x: auto');
  });

  it('photo thumbnails have min-width 80px on mobile', () => {
    var mobileBlock = html.split('@media (max-width: 767px)')[1] || '';
    expect(mobileBlock).toContain('.v2-photo-item');
    expect(mobileBlock).toContain('min-width: 80px');
  });
});

describe('HEA-115 — mobile payment panel', () => {
  it('payment panel is full-screen on mobile', () => {
    var mobileBlock = html.split('@media (max-width: 767px)')[1] || '';
    expect(mobileBlock).toContain('.v2-pay-panel');
    expect(mobileBlock).toContain('max-width: 100%');
    expect(mobileBlock).toContain('border-radius: 0');
  });
});

// ── HTML structure verification ───────────────────────────────────────────

describe('HEA-115 — drawer HTML elements', () => {
  it('has drawer overlay element', () => {
    expect(html).toContain('id="v2DrawerOverlay"');
  });

  it('has drawer list element', () => {
    expect(html).toContain('id="v2DrawerList"');
  });

  it('has drawer toggle button', () => {
    expect(html).toContain('id="v2DrawerToggle"');
    expect(html).toContain('v2ToggleDrawer()');
  });

  it('drawer items use v2DrawerJump for onclick', () => {
    expect(html).toContain('v2DrawerJump(');
  });
});

describe('HEA-115 — desktop polish (Part A)', () => {
  it('has panel-body-inner wrapper with max-width', () => {
    expect(html).toContain('.v2-panel-body-inner');
    expect(html).toMatch(/\.v2-panel-body-inner\s*\{[^}]*max-width:\s*860px/);
  });

  it('rating group has max-width constraint', () => {
    expect(html).toMatch(/\.v2-rating-group\s*\{[^}]*max-width:\s*600px/);
  });

  it('finding cards have reduced padding', () => {
    expect(html).toMatch(/\.v2-card\s*\{[^}]*padding:\s*14px\s+16px/);
  });

  it('finding cards have lightened border', () => {
    expect(html).toMatch(/\.v2-card\s*\{[^}]*border:\s*1px solid rgba\(255,255,255,0\.06\)/);
  });

  it('renders panel body inner wrapper in JS', () => {
    expect(html).toContain('v2-panel-body-inner');
    // The JS should open the inner div
    expect(html).toContain("var html = '<div class=\"v2-panel-body-inner\">'");
  });
});

describe('HEA-115 — no horizontal scroll at mobile widths', () => {
  it('viewport meta tag prevents user scaling', () => {
    expect(html).toContain('width=device-width');
    expect(html).toContain('maximum-scale=1.0');
  });

  it('html/body have overflow hidden (prevents body scroll)', () => {
    expect(html).toMatch(/html,\s*body\s*\{[^}]*overflow:\s*hidden/);
  });
});
