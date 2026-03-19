/**
 * Unit tests for HEA-137: Admin left nav reorder + V2 Wizard card layout
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var adminHtml = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');
var wizardHtml = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');

// ── Part 1: Admin left nav reorder ──────────────────────────

describe('HEA-137 — Admin nav order', () => {
  // Extract sidebar-group-label text in order from the sidebar nav
  function getNavGroupOrder() {
    var sidebarMatch = adminHtml.match(/<nav class="admin-sidebar"[^>]*>([\s\S]*?)<\/nav>/);
    if (!sidebarMatch) return [];
    var sidebarHtml = sidebarMatch[1];
    var labels = [];
    var re = /class="sidebar-group-label">(.*?)<\/div>/g;
    var m;
    while ((m = re.exec(sidebarHtml)) !== null) {
      labels.push(m[1].replace(/&amp;/g, '&'));
    }
    return labels;
  }

  it('nav groups appear in correct order', () => {
    var order = getNavGroupOrder();
    var expected = [
      'Bookings',
      'Clients',
      'Invoices',       // hidden but in place
      'Reports',        // hidden but in place
      'Agents',
      'Metrics',
      'Financials',
      'Broadcasts',
      'Scheduling',
      'Pricing',
      'Quality Control',
      'Legal & Compliance',
      'Settings',
      'Misc',
    ];
    expect(order).toEqual(expected);
  });

  it('all 14 nav groups present (including 2 hidden)', () => {
    var order = getNavGroupOrder();
    expect(order).toHaveLength(14);
  });

  it('Agents group appears before Metrics', () => {
    var order = getNavGroupOrder();
    expect(order.indexOf('Agents')).toBeLessThan(order.indexOf('Metrics'));
  });

  it('Legal & Compliance is its own group, not inside Settings', () => {
    expect(adminHtml).toContain('id="sidebarGroupLegal"');
    // Settings group should NOT contain legal-agreements
    var settingsMatch = adminHtml.match(/id="sidebarGroupSettings">([\s\S]*?)<\/div>\s*<div class="sidebar-group"/);
    if (settingsMatch) {
      expect(settingsMatch[1]).not.toContain('data-tab="legal-agreements"');
    }
  });

  it('Misc is after Settings', () => {
    var order = getNavGroupOrder();
    expect(order.indexOf('Misc')).toBeGreaterThan(order.indexOf('Settings'));
  });

  it('all data-tab values are preserved', () => {
    var expectedTabs = [
      'bookings', 'clientrecords', 'invoices', 'client-reports',
      'agents', 'metrics', 'revenue', 'broadcasts',
      'settings', 'defaults', 'overrides',
      'pricing', 'newcon', 'healthcheck', 'bundle', 'coupons',
      'qa-review', 'audit-log',
      'legal-agreements',
      'inspectors', 'draft-cleanup', 'score-settings', 'faqs', 'recommendations',
      'contractors',
      'my-account',
    ];
    expectedTabs.forEach(function (tab) {
      expect(adminHtml).toContain('data-tab="' + tab + '"');
    });
  });
});

// ── Part 2: V2 Wizard card layout ──────────────────────────

describe('HEA-137 — V2 Wizard card layout CSS', () => {
  it('defines .v2-content-card class', () => {
    expect(wizardHtml).toContain('.v2-content-card');
  });

  it('card has max-width 680px', () => {
    expect(wizardHtml).toContain('max-width: 680px');
  });

  it('card is centered with margin: 0 auto', () => {
    expect(wizardHtml).toContain('margin: 0 auto');
  });

  it('card has border-radius 12px', () => {
    expect(wizardHtml).toContain('border-radius: 12px');
  });

  it('mobile breakpoint at 720px removes card styling', () => {
    expect(wizardHtml).toContain('@media (max-width: 720px)');
    // After the media query, card should have no border-radius
    var mediaIdx = wizardHtml.indexOf('@media (max-width: 720px)');
    var block = wizardHtml.substring(mediaIdx, mediaIdx + 300);
    expect(block).toContain('border-radius: 0');
    expect(block).toContain('background: transparent');
  });
});

describe('HEA-137 — V2 Wizard card wrapping', () => {
  it('screenPicker has v2-content-card inside v2-body', () => {
    var pickerMatch = wizardHtml.match(/id="screenPicker">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<!--/);
    if (pickerMatch) {
      var pickerHtml = pickerMatch[1];
      expect(pickerHtml).toContain('class="v2-body"');
      expect(pickerHtml).toContain('class="v2-content-card"');
    } else {
      // Fallback: just check the overall structure
      var pickerIdx = wizardHtml.indexOf('id="screenPicker"');
      var nextScreen = wizardHtml.indexOf('id="screenIllinois"');
      var pickerBlock = wizardHtml.substring(pickerIdx, nextScreen);
      expect(pickerBlock).toContain('v2-content-card');
    }
  });

  it('screenIllinois has v2-content-card wrapping v2-form', () => {
    var ilIdx = wizardHtml.indexOf('id="screenIllinois"');
    var profileIdx = wizardHtml.indexOf('id="screenProfile"');
    var ilBlock = wizardHtml.substring(ilIdx, profileIdx);
    expect(ilBlock).toContain('v2-content-card');
    // v2-content-card should appear before v2-form
    var cardPos = ilBlock.indexOf('v2-content-card');
    var formPos = ilBlock.indexOf('class="v2-form"');
    expect(cardPos).toBeLessThan(formPos);
  });

  it('screenProfile has v2-content-card wrapping v2-form', () => {
    var profIdx = wizardHtml.indexOf('id="screenProfile"');
    var shellIdx = wizardHtml.indexOf('id="screenShell"');
    var profBlock = wizardHtml.substring(profIdx, shellIdx);
    expect(profBlock).toContain('v2-content-card');
    var cardPos = profBlock.indexOf('v2-content-card');
    var formPos = profBlock.indexOf('class="v2-form"');
    expect(cardPos).toBeLessThan(formPos);
  });

  it('v2-header is NOT inside v2-content-card on any screen', () => {
    // For each screen, v2-header should come before v2-content-card
    ['screenPicker', 'screenIllinois', 'screenProfile'].forEach(function (screenId) {
      var idx = wizardHtml.indexOf('id="' + screenId + '"');
      var nextScreen = wizardHtml.indexOf('<div class="screen"', idx + 1);
      if (nextScreen === -1) nextScreen = wizardHtml.length;
      var block = wizardHtml.substring(idx, nextScreen);
      var headerPos = block.indexOf('v2-header');
      var cardPos = block.indexOf('v2-content-card');
      expect(headerPos).toBeLessThan(cardPos);
    });
  });
});
