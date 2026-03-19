/**
 * Unit tests for narrative-review.html (HEA-140 + HEA-155 per-finding update)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

var reviewHtml = readFileSync(resolve(__dirname, '../../narrative-review.html'), 'utf8');
var genSrc = readFileSync(resolve(__dirname, '../../functions/generate-narrative.js'), 'utf8');
var netlifyToml = readFileSync(resolve(__dirname, '../../netlify.toml'), 'utf8');
var claudeMd = readFileSync(resolve(__dirname, '../../CLAUDE.md'), 'utf8');

describe('narrative-review.html — page scaffold', () => {
  it('file exists', () => {
    expect(existsSync(resolve(__dirname, '../../narrative-review.html'))).toBe(true);
  });

  it('requires Supabase auth', () => {
    expect(reviewHtml).toContain('sb.auth.getSession');
    expect(reviewHtml).toContain("window.location.href = 'admin.html'");
  });

  it('has getAuthHeader using Bearer token pattern', () => {
    expect(reviewHtml).toContain('async function getAuthHeader()');
    expect(reviewHtml).toContain("'Authorization': 'Bearer '");
  });

  it('loads config.js and Supabase CDN', () => {
    expect(reviewHtml).toContain('src="/config.js"');
    expect(reviewHtml).toContain('supabase-js');
  });
});

describe('narrative-review.html — job dropdown', () => {
  it('fetches inspection_records with status=narrative', () => {
    expect(reviewHtml).toContain(".eq('status', 'narrative')");
  });

  it('has job selector dropdown element', () => {
    expect(reviewHtml).toContain('id="nrJobSelect"');
  });

  it('shows empty state when no jobs', () => {
    expect(reviewHtml).toContain('No inspections awaiting narrative review');
  });
});

describe('narrative-review.html — section panels with findings', () => {
  it('fetches data via get-report service-role function', () => {
    expect(reviewHtml).toContain('get-report?id=');
    expect(reviewHtml).toContain('v2_findings');
  });

  it('renders severity badges', () => {
    expect(reviewHtml).toContain('nr-severity');
    expect(reviewHtml).toContain('nr-sev-safety');
    expect(reviewHtml).toContain('nr-sev-repair');
  });

  it('renders per-finding narrative textareas', () => {
    expect(reviewHtml).toContain('nr-narr-ta');
  });

  it('has lightbox', () => {
    expect(reviewHtml).toContain('id="nrLightbox"');
    expect(reviewHtml).toContain('nrOpenLightbox');
    expect(reviewHtml).toContain('nrCloseLightbox');
  });
});

describe('narrative-review.html — per-section generate', () => {
  it('has per-section Generate button', () => {
    expect(reviewHtml).toContain('nrGenerateSection');
  });

  it('sends per-finding payload', () => {
    expect(reviewHtml).toContain('findings: findingsPayload');
  });

  it('limits photos to 3 per finding', () => {
    expect(reviewHtml).toContain('.slice(0, 3)');
  });
});

describe('generate-narrative.js — dual mode', () => {
  it('supports per-finding mode', () => {
    expect(genSrc).toContain('body.findings');
    expect(genSrc).toContain("mode: 'per_finding'");
  });

  it('supports legacy per-section mode', () => {
    expect(genSrc).toContain("mode: 'per_section'");
  });

  it('defines applyCloudinaryTransform', () => {
    expect(genSrc).toContain('function applyCloudinaryTransform');
  });

  it('defines buildPhotoUrlsFromDB', () => {
    expect(genSrc).toContain('function buildPhotoUrlsFromDB');
  });
});

describe('generate-narrative.js — applyCloudinaryTransform', () => {
  var mod = require('../../functions/generate-narrative');
  var transform = mod._applyCloudinaryTransform;

  it('inserts transform after /upload/', () => {
    var url = 'https://res.cloudinary.com/dmztfzqfm/image/upload/v123/folder/photo.jpg';
    var result = transform(url);
    expect(result).toContain('/upload/w_800,q_70,f_jpg/');
  });

  it('returns original URL if no /upload/ segment', () => {
    expect(transform('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
  });

  it('returns falsy input unchanged', () => {
    expect(transform(null)).toBe(null);
    expect(transform('')).toBe('');
  });
});

describe('generate-narrative.js — buildPhotoUrlsFromDB', () => {
  var mod = require('../../functions/generate-narrative');
  var buildUrls = mod._buildPhotoUrlsFromDB;

  it('groups photos by section_id', () => {
    var photos = [
      { section_id: 's1', cloudinary_url: 'https://res.cloudinary.com/dmztfzqfm/image/upload/v1/a.jpg' },
      { section_id: 's1', cloudinary_url: 'https://res.cloudinary.com/dmztfzqfm/image/upload/v1/b.jpg' },
      { section_id: 's2', cloudinary_url: 'https://res.cloudinary.com/dmztfzqfm/image/upload/v1/c.jpg' },
    ];
    var result = buildUrls(photos);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['s1']).toHaveLength(2);
    expect(result['s2']).toHaveLength(1);
  });

  it('prefers annotated_url over cloudinary_url', () => {
    var photos = [
      { section_id: 's1', cloudinary_url: 'https://res.cloudinary.com/dmztfzqfm/image/upload/v1/orig.jpg', annotated_url: 'https://res.cloudinary.com/dmztfzqfm/image/upload/v1/annotated.jpg' },
    ];
    var result = buildUrls(photos);
    expect(result['s1'][0]).toContain('annotated');
  });

  it('applies Cloudinary transform', () => {
    var photos = [
      { section_id: 's1', cloudinary_url: 'https://res.cloudinary.com/dmztfzqfm/image/upload/v1/photo.jpg' },
    ];
    var result = buildUrls(photos);
    expect(result['s1'][0]).toContain('w_800,q_70,f_jpg');
  });

  it('caps at 10 photos per section', () => {
    var photos = [];
    for (var i = 0; i < 15; i++) {
      photos.push({ section_id: 's1', cloudinary_url: 'https://res.cloudinary.com/dmztfzqfm/image/upload/v1/p' + i + '.jpg' });
    }
    var result = buildUrls(photos);
    expect(result['s1']).toHaveLength(10);
  });

  it('returns empty object for null/empty input', () => {
    expect(buildUrls(null)).toEqual({});
    expect(buildUrls([])).toEqual({});
  });
});

describe('netlify.toml and CLAUDE.md', () => {
  it('netlify.toml has noindex header for narrative-review.html', () => {
    expect(netlifyToml).toContain('/narrative-review.html');
  });

  it('CLAUDE.md deploy zip includes narrative-review.html', () => {
    expect(claudeMd).toContain('narrative-review.html');
  });
});
