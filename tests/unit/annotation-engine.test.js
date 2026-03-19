/**
 * Unit tests for annotation-engine.js
 *
 * Tests the engine's state management logic and Cloudinary payload construction.
 * Fabric.js is not available in Vitest, so canvas operations are tested via
 * the shared module's source code patterns and the V2 HTML integration.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var engineSrc = readFileSync(resolve(__dirname, '../../shared/annotation-engine.js'), 'utf8');
var v2Html = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');

describe('annotation-engine.js — module structure', () => {
  it('exposes AnnotationEngine on window', () => {
    expect(engineSrc).toContain('window.AnnotationEngine');
  });

  it('exposes init method', () => {
    expect(engineSrc).toContain('init: init');
  });

  it('exposes setTool method', () => {
    expect(engineSrc).toContain('setTool: setTool');
  });

  it('exposes setColor method', () => {
    expect(engineSrc).toContain('setColor: setColor');
  });

  it('exposes undo method', () => {
    expect(engineSrc).toContain('undo: undo');
  });

  it('exposes clearAll method', () => {
    expect(engineSrc).toContain('clearAll: clearAll');
  });

  it('exposes save method', () => {
    expect(engineSrc).toContain('save: save');
  });

  it('exposes destroy method', () => {
    expect(engineSrc).toContain('destroy: destroy');
  });
});

describe('annotation-engine.js — tool validation', () => {
  it('supports arrow tool', () => {
    expect(engineSrc).toContain("'arrow'");
  });

  it('supports circle tool', () => {
    expect(engineSrc).toContain("'circle'");
  });

  it('supports rect tool', () => {
    expect(engineSrc).toContain("'rect'");
  });

  it('supports text tool', () => {
    expect(engineSrc).toContain("'text'");
  });

  it('validates tool names against allowed list', () => {
    expect(engineSrc).toMatch(/var valid = \['arrow', 'circle', 'rect', 'text'\]/);
  });
});

describe('annotation-engine.js — color support', () => {
  it('defaults to red', () => {
    expect(engineSrc).toContain("var currentColor = '#e74c3c'");
  });
});

describe('annotation-engine.js — undo logic', () => {
  it('pops from objectHistory on undo', () => {
    expect(engineSrc).toContain('objectHistory.pop()');
  });

  it('removes the popped object from canvas', () => {
    expect(engineSrc).toContain('canvas.remove(last)');
  });
});

describe('annotation-engine.js — clearAll logic', () => {
  it('iterates objectHistory and removes each', () => {
    expect(engineSrc).toContain('objectHistory.forEach');
    expect(engineSrc).toContain('canvas.remove(obj)');
  });

  it('resets objectHistory to empty array', () => {
    expect(engineSrc).toContain('objectHistory = []');
  });
});

describe('annotation-engine.js — Cloudinary upload', () => {
  it('uses correct Cloudinary cloud name', () => {
    expect(engineSrc).toContain("var CLOUD = 'dmztfzqfm'");
  });

  it('uses correct Cloudinary upload preset', () => {
    expect(engineSrc).toContain("var PRESET = 'slvlwkcf'");
  });

  it('uploads to Cloudinary API endpoint', () => {
    expect(engineSrc).toContain("'https://api.cloudinary.com/v1_1/' + CLOUD + '/image/upload'");
  });

  it('sends upload_preset in form data', () => {
    expect(engineSrc).toContain("fd.append('upload_preset', PRESET)");
  });

  it('sends file as annotated.jpg', () => {
    expect(engineSrc).toContain("fd.append('file', blob, 'annotated.jpg')");
  });

  it('stores in heartland/annotations folder', () => {
    expect(engineSrc).toContain("fd.append('folder', 'heartland/annotations')");
  });
});

describe('annotation-engine.js — save-annotated-photo integration', () => {
  it('calls save-annotated-photo function', () => {
    expect(engineSrc).toContain('/.netlify/functions/save-annotated-photo');
  });

  it('sends photo_id in request body', () => {
    expect(engineSrc).toContain('photo_id: photoId');
  });

  it('sends annotated_url from Cloudinary response', () => {
    expect(engineSrc).toContain('annotated_url: annotatedUrl');
  });

  it('does not fall back to window.ADMIN_TOKEN (HEA-247)', () => {
    expect(engineSrc).not.toContain("window.ADMIN_TOKEN");
  });
});

describe('V2 wizard — annotation engine integration', () => {
  it('loads Fabric.js CDN', () => {
    expect(v2Html).toContain('fabric.js/5.3.1/fabric.min.js');
  });

  it('loads annotation-engine.js', () => {
    expect(v2Html).toContain('src="/shared/annotation-engine.js"');
  });

  it('Fabric CDN loads before annotation engine', () => {
    var fabricIdx = v2Html.indexOf('fabric.js/5.3.1/fabric.min.js');
    var engineIdx = v2Html.indexOf('src="/shared/annotation-engine.js"');
    expect(fabricIdx).toBeLessThan(engineIdx);
  });
});

describe('V2 wizard — photo rendering prefers annotated_url', () => {
  it('photo strip uses annotated_url || cloudinary_url', () => {
    expect(v2Html).toContain('photo.annotated_url || photo.cloudinary_url');
  });

  it('card photos use annotated_url || cloudinary_url', () => {
    // Should appear at least twice (strip + card)
    var matches = v2Html.match(/photo\.annotated_url \|\| photo\.cloudinary_url/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('no remaining bare photo.cloudinary_url in img src attributes', () => {
    // Look for img src that uses cloudinary_url WITHOUT annotated_url fallback
    var pattern = /src="[^"]*esc\(photo\.cloudinary_url\)/g;
    var bareMatches = v2Html.match(pattern);
    expect(bareMatches).toBeNull();
  });
});
