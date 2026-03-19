/**
 * Unit tests for HEA-229: New Construction booking — card UI replacing checkboxes
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var indexSrc = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

// Extract the renderNCPanel function source
var ncPanelStart = indexSrc.indexOf('function renderNCPanel()');
var ncPanelEnd = indexSrc.indexOf('// ─── HOME HEALTH CHECK PANEL', ncPanelStart);
var ncPanelBlock = indexSrc.substring(ncPanelStart, ncPanelEnd);

describe('HEA-229 — NC panel renders cards instead of checkboxes', () => {
  it('renders .wiz-hc-card cards, not .wiz-addon-item checkboxes', () => {
    expect(ncPanelBlock).toContain('wiz-hc-card');
    expect(ncPanelBlock).not.toContain('wiz-addon-item');
    expect(ncPanelBlock).not.toContain('wiz-checkbox-row');
    expect(ncPanelBlock).not.toContain('wiz-check-box');
  });

  it('does not render "Individual Phases" toggle button', () => {
    expect(ncPanelBlock).not.toContain('Individual Phases');
    expect(ncPanelBlock).not.toContain('wiz-nc-toggle-btn');
    expect(ncPanelBlock).not.toContain('wizNCIndividual');
    expect(ncPanelBlock).not.toContain('wizNCBundle');
  });

  it('section label is "Choose Your Phase"', () => {
    expect(ncPanelBlock).toContain('Choose Your Phase');
    expect(ncPanelBlock).not.toContain('Select Inspection Phases');
  });

  it('bundle card has .wiz-nc-bundle-card class and "Best Value" badge', () => {
    expect(ncPanelBlock).toContain('wiz-nc-bundle-card');
    expect(ncPanelBlock).toContain('wiz-nc-best-value');
    expect(ncPanelBlock).toContain('Best Value');
  });

  it('individual phase cards have data-nc-id attribute', () => {
    expect(ncPanelBlock).toContain('data-nc-id="');
  });

  it('bundle card has data-nc-bundle attribute', () => {
    expect(ncPanelBlock).toContain('data-nc-bundle="true"');
  });

  it('does not render hidden #wizNCBundleInfo section', () => {
    expect(ncPanelBlock).not.toContain('wizNCBundleInfo');
    expect(ncPanelBlock).not.toContain('wizNCPhases');
  });

  it('uses wiz-hc-grid container for cards', () => {
    expect(ncPanelBlock).toContain('wiz-hc-grid');
  });

  it('renders includes as wiz-hc-features list', () => {
    expect(ncPanelBlock).toContain('wiz-hc-features');
  });
});

describe('HEA-229 — NC card selection logic', () => {
  it('phase cards deselect bundle when clicked', () => {
    expect(ncPanelBlock).toContain('ncBundleSelected = false');
  });

  it('bundle card clears selectedNCItems when selected', () => {
    expect(ncPanelBlock).toContain('selectedNCItems = []');
  });

  it('calls recalcPrice and validateStep after phase selection', () => {
    expect(ncPanelBlock).toContain('recalcPrice()');
    expect(ncPanelBlock).toContain('validateStep()');
  });
});

describe('HEA-229 — NC card CSS', () => {
  it('defines .wiz-nc-bundle-card full-width rule', () => {
    expect(indexSrc).toContain('.wiz-nc-bundle-card { grid-column: 1 / -1; }');
  });

  it('defines .wiz-nc-best-value badge style', () => {
    expect(indexSrc).toContain('.wiz-nc-best-value');
    expect(indexSrc).toContain('background: #27ae60');
  });

  it('removed old .wiz-nc-toggle-btn CSS', () => {
    expect(indexSrc).not.toContain('.wiz-nc-toggle-btn');
    expect(indexSrc).not.toContain('.wiz-nc-toggle {');
  });
});
