/**
 * Unit tests for HEA-113: Annotation UI in Office Mode Wizard
 *
 * Verifies inspector-wizard-v2.html has annotation overlay, click handlers
 * on strip/card thumbnails, annotation badge, and correct JS wiring.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var html = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');

describe('HEA-113 — annotation overlay HTML', () => {
  it('has annotation overlay element', () => {
    expect(html).toContain('id="v2AnnotateOverlay"');
  });

  it('has canvas element', () => {
    expect(html).toContain('id="v2AnnotateCanvas"');
  });

  it('overlay is hidden by default (no open class)', () => {
    expect(html).toMatch(/class="v2-annotate-overlay"\s+id="v2AnnotateOverlay"/);
  });

  it('overlay uses position fixed and z-index 9999', () => {
    expect(html).toMatch(/\.v2-annotate-overlay\s*\{[^}]*position:\s*fixed/);
    expect(html).toMatch(/\.v2-annotate-overlay\s*\{[^}]*z-index:\s*9999/);
  });
});

describe('HEA-113 — toolbar has all tool controls', () => {
  it('has Arrow button', () => {
    expect(html).toContain("v2AnnSetTool('arrow')");
    expect(html).toContain('id="v2AnnArrow"');
  });

  it('has Circle button', () => {
    expect(html).toContain("v2AnnSetTool('circle')");
  });

  it('has Rectangle button', () => {
    expect(html).toContain("v2AnnSetTool('rect')");
  });

  it('has Text button', () => {
    expect(html).toContain("v2AnnSetTool('text')");
  });

  it('has color swatches for red, yellow, white', () => {
    expect(html).toContain("v2AnnSetColor('#e74c3c')");
    expect(html).toContain("v2AnnSetColor('#f1c40f')");
    expect(html).toContain("v2AnnSetColor('#ffffff')");
  });

  it('has Undo and Clear buttons in overlay HTML', () => {
    expect(html).toContain('onclick="AnnotationEngine.undo()"');
    expect(html).toContain('onclick="AnnotationEngine.clearAll()"');
  });

  it('has Done and Cancel buttons', () => {
    expect(html).toContain('id="v2AnnDoneBtn"');
    expect(html).toContain('onclick="v2AnnDone()"');
    expect(html).toContain('onclick="v2AnnCancel()"');
  });
});

describe('HEA-113 — tap target sizing', () => {
  it('tool buttons have min-height 44px', () => {
    expect(html).toMatch(/\.v2-ann-btn\s*\{[^}]*min-height:\s*44px/);
  });

  it('color swatches have min-height 44px', () => {
    expect(html).toMatch(/\.v2-ann-swatch\s*\{[^}]*min-height:\s*44px/);
  });
});

describe('HEA-113 — strip thumbnail click handler', () => {
  it('strip builds photoSrc variable from annotated_url || cloudinary_url', () => {
    expect(html).toContain('var photoSrc = photo.annotated_url || photo.cloudinary_url');
  });

  it('strip img has onclick wired to v2OpenAnnotate with photo.id and photoSrc', () => {
    // The JS builds: onclick="v2OpenAnnotate(\' + photo.id + \',\' + esc(photoSrc) + \')"
    expect(html).toMatch(/v2-photo-thumb[^>]*onclick="v2OpenAnnotate/);
    expect(html).toContain("esc(photoSrc) + '\\')\"");
  });
});

describe('HEA-113 — card thumbnail click handler', () => {
  it('card builds cardSrc variable from annotated_url || cloudinary_url', () => {
    expect(html).toContain('var cardSrc = photo.annotated_url || photo.cloudinary_url');
  });

  it('card img has onclick wired to v2OpenAnnotate with photo.id and cardSrc', () => {
    expect(html).toMatch(/v2-card-photo-thumb[^>]*onclick="v2OpenAnnotate/);
    expect(html).toContain("esc(cardSrc) + '\\')\"");
  });

  it('card unlink button has event.stopPropagation()', () => {
    expect(html).toContain('event.stopPropagation();v2UnlinkPhoto(');
  });
});

describe('HEA-113 — annotation badge', () => {
  it('badge CSS class is defined', () => {
    expect(html).toMatch(/\.v2-ann-badge\s*\{/);
  });

  it('strip renders badge conditionally on annotated_url', () => {
    // Check exact pattern used in the strip builder
    expect(html).toContain("if (photo.annotated_url) h += '<div class=\"v2-ann-badge\">");
  });

  it('card renders badge conditionally on annotated_url', () => {
    // Count occurrences of the badge pattern — should be at least 2 (strip + card)
    var matches = html.match(/if \(photo\.annotated_url\) h \+= '<div class="v2-ann-badge">/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('HEA-113 — annotation JS functions', () => {
  it('defines v2OpenAnnotate function', () => {
    expect(html).toContain('function v2OpenAnnotate(');
  });

  it('v2OpenAnnotate calls AnnotationEngine.init with canvas ID', () => {
    expect(html).toContain("AnnotationEngine.init('v2AnnotateCanvas', imageUrl)");
  });

  it('defines v2AnnDone function that calls AnnotationEngine.save', () => {
    expect(html).toContain('function v2AnnDone(');
    expect(html).toContain('AnnotationEngine.save(v2AnnPhotoId');
  });

  it('v2AnnDone updates v2Photos in-memory with new annotated_url', () => {
    expect(html).toContain('photo.annotated_url = annotatedUrl');
  });

  it('v2AnnDone calls v2RenderPanel after save', () => {
    // v2RenderPanel() should appear after the annotated_url assignment
    var doneIdx = html.indexOf('photo.annotated_url = annotatedUrl');
    var renderIdx = html.indexOf('v2RenderPanel()', doneIdx);
    expect(renderIdx).toBeGreaterThan(doneIdx);
  });

  it('defines v2AnnCancel function that destroys without saving', () => {
    expect(html).toContain('function v2AnnCancel(');
    // Get the cancel function body
    var cancelStart = html.indexOf('function v2AnnCancel(');
    var cancelBody = html.substring(cancelStart, cancelStart + 200);
    expect(cancelBody).toContain('AnnotationEngine.destroy()');
    expect(cancelBody).not.toContain('AnnotationEngine.save');
  });
});
