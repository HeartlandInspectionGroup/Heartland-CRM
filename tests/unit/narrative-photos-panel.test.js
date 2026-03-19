/**
 * Unit tests for section panels rendering photos without findings (HEA-149)
 * Updated for per-finding narrative architecture
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var reviewHtml = readFileSync(resolve(__dirname, '../../narrative-review.html'), 'utf8');
var genSrc = readFileSync(resolve(__dirname, '../../functions/generate-narrative.js'), 'utf8');

describe('HEA-149 — Panels render for sections with photos but no findings', () => {
  it('activeSections includes sections with photos OR findings', () => {
    expect(reviewHtml).toContain('findingsBySection[s.id]');
    expect(reviewHtml).toContain('photosBySection[s.id]');
  });
});

describe('HEA-149 — Site Documentation subsection', () => {
  it('renders Site Documentation header', () => {
    expect(reviewHtml).toContain('Site Documentation');
  });

  it('renders photo grid for unlinked photos', () => {
    expect(reviewHtml).toContain('nr-sitedocs-grid');
    expect(reviewHtml).toContain('!p.finding_id');
  });

  it('shows empty state when no site docs', () => {
    expect(reviewHtml).toContain('No site documentation photos');
  });
});

describe('HEA-149 — generate-narrative.js buildPhotoUrlsFromDB independence', () => {
  it('groups by section_id not finding_id', () => {
    var fnIdx = genSrc.indexOf('function buildPhotoUrlsFromDB');
    var fnBlock = genSrc.substring(fnIdx, fnIdx + 300);
    expect(fnBlock).toContain('p.section_id');
    expect(fnBlock).not.toContain('p.finding_id');
  });
});
