/**
 * Unit tests for per-finding narrative architecture
 * Covers: generate-narrative.js, save-narrative.js, narrative-review.html,
 * send-report-email.js, report.html
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var genSrc = readFileSync(resolve(__dirname, '../../functions/generate-narrative.js'), 'utf8');
var saveSrc = readFileSync(resolve(__dirname, '../../functions/save-narrative.js'), 'utf8');
var reviewHtml = readFileSync(resolve(__dirname, '../../narrative-review.html'), 'utf8');
var sendSrc = readFileSync(resolve(__dirname, '../../functions/send-report-email.js'), 'utf8');
var reportHtml = readFileSync(resolve(__dirname, '../../report.html'), 'utf8');

// ── generate-narrative.js ──

describe('Per-finding generation — generate-narrative.js', () => {
  it('supports per-finding mode when body.findings is provided', () => {
    expect(genSrc).toContain('body.findings && Array.isArray(body.findings)');
  });

  it('generates in parallel with Promise.all', () => {
    expect(genSrc).toContain('Promise.all(findingsInput.map');
  });

  it('calls generateForFinding per finding', () => {
    expect(genSrc).toContain('function generateForFinding(finding, apiKey, fetchFn)');
  });

  it('limits to 3 photos per finding', () => {
    expect(genSrc).toContain('.slice(0, 3)');
  });

  it('uses per-finding system prompt', () => {
    expect(genSrc).toContain('SYSTEM_PROMPT_FINDING');
    expect(genSrc).toContain('2-4 sentences');
  });

  it('updates inspection_findings.narrative on success', () => {
    expect(genSrc).toContain("from('inspection_findings')");
    expect(genSrc).toContain("narrative: r.narrative, narrative_status: 'draft'");
  });

  it('returns { narratives, mode: per_finding }', () => {
    expect(genSrc).toContain("mode: 'per_finding'");
  });

  it('preserves legacy per-section mode', () => {
    expect(genSrc).toContain("mode: 'per_section'");
    expect(genSrc).toContain("from('inspection_narratives')");
  });

  it('uses w_800,q_70,f_jpg transform', () => {
    expect(genSrc).toContain('w_800,q_70,f_jpg');
  });
});

// ── save-narrative.js ──

describe('Per-finding approval — save-narrative.js', () => {
  it('accepts approve_finding action', () => {
    expect(saveSrc).toContain("'approve_finding'");
  });

  it('requires finding_id for approve_finding', () => {
    expect(saveSrc).toContain('finding_id required for approve_finding');
  });

  it('updates inspection_findings with approved status', () => {
    expect(saveSrc).toContain("narrative_status: 'approved'");
    expect(saveSrc).toContain('narrative_approved_at');
  });

  it('scopes update to record_id for security', () => {
    expect(saveSrc).toContain(".eq('record_id', record_id)");
  });

  it('preserves existing approve/edit/revert actions', () => {
    expect(saveSrc).toContain("action === 'approve'");
    expect(saveSrc).toContain("action === 'edit'");
    expect(saveSrc).toContain("action === 'revert'");
  });
});

// ── narrative-review.html ──

describe('Narrative Review Studio — per-finding layout', () => {
  it('renders finding rows with 3-column grid', () => {
    expect(reviewHtml).toContain('nr-frow');
    expect(reviewHtml).toContain('nr-frow-photo');
    expect(reviewHtml).toContain('nr-frow-info');
    expect(reviewHtml).toContain('nr-frow-narr');
  });

  it('has per-finding textarea for narrative', () => {
    expect(reviewHtml).toContain('nr-narr-ta');
    expect(reviewHtml).toContain("id=\"narr_' + f.id");
  });

  it('has per-finding approve button', () => {
    expect(reviewHtml).toContain('nrApproveFinding');
  });

  it('has per-section Generate button', () => {
    expect(reviewHtml).toContain('nrGenerateSection');
  });

  it('has Approve All button per section', () => {
    expect(reviewHtml).toContain('nrApproveAllSection');
  });

  it('sends per-finding payload to generate-narrative', () => {
    expect(reviewHtml).toContain('findings: findingsPayload');
  });

  it('updates textareas inline after generation', () => {
    expect(reviewHtml).toContain("ta.value = narratives[fid]");
  });

  it('progress counts approved findings not sections', () => {
    expect(reviewHtml).toContain('findings approved');
  });

  it('has subsection collapse state', () => {
    expect(reviewHtml).toContain('nrSubsectionState');
    expect(reviewHtml).toContain('obsExpanded: true, docsExpanded: false');
  });
});

// ── send-report-email.js ──

describe('Send report preflight — per-finding check', () => {
  it('checks per-finding narratives', () => {
    expect(sendSrc).toContain("from('inspection_findings')");
    expect(sendSrc).toContain("not('narrative', 'is', null)");
    expect(sendSrc).toContain("neq('narrative_status', 'approved')");
  });

  it('blocks delivery when finding narratives not approved', () => {
    expect(sendSrc).toContain('finding narrative(s) not yet approved');
  });

  it('preserves existing section-level check', () => {
    expect(sendSrc).toContain("from('inspection_narratives')");
    expect(sendSrc).toContain("n.status === 'draft'");
  });
});

// ── report.html ──

describe('Report rendering — per-finding narratives', () => {
  it('detects per-finding mode via hasPerFindingNarratives', () => {
    expect(reportHtml).toContain('hasPerFindingNarratives');
    expect(reportHtml).toContain('f.narrative');
  });

  it('renders per-finding narrative below finding card', () => {
    expect(reportHtml).toContain('hasPerFindingNarratives && f.narrative');
  });

  it('preserves legacy section-level narrative for old inspections', () => {
    expect(reportHtml).toContain('!hasPerFindingNarratives');
    expect(reportHtml).toContain('v2Data.narratives[sec.id]');
  });
});
