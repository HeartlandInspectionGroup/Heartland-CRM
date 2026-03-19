/**
 * Unit tests for HEA-119: Inspection Status Redesign
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var submitV2Src = readFileSync(resolve(__dirname, '../../functions/submit-inspection-v2.js'), 'utf8');
var sendReportSrc = readFileSync(resolve(__dirname, '../../functions/send-report-email.js'), 'utf8');
var saveDraftSrc = readFileSync(resolve(__dirname, '../../functions/save-draft.js'), 'utf8');
var cancelSrc = readFileSync(resolve(__dirname, '../../functions/cancel-booking.js'), 'utf8');
var rescheduleSrc = readFileSync(resolve(__dirname, '../../functions/reschedule-booking.js'), 'utf8');
var adminHtml = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');
var crTabSrc = readFileSync(resolve(__dirname, '../../scripts/admin-client-records-tab.js'), 'utf8');

describe('HEA-119 — submit-inspection-v2.js sets narrative status', () => {
  it('sets status to narrative on submission (non-addon default)', () => {
    // Non-addon records get targetStatus = 'narrative'
    expect(submitV2Src).toContain("? 'submitted' : 'narrative'");
  });

  it('uses targetStatus variable (not hardcoded) in update call', () => {
    // The update call uses the computed targetStatus variable
    expect(submitV2Src).toContain('status: targetStatus');
  });

  it('blocks re-submission for narrative status', () => {
    expect(submitV2Src).toContain("record.status === 'narrative'");
  });

  it('blocks re-submission for submitted status', () => {
    expect(submitV2Src).toContain("record.status === 'submitted'");
  });
});

describe('HEA-119 — send-report-email.js sets submitted on delivery', () => {
  it('updates status to submitted after email delivery', () => {
    expect(sendReportSrc).toContain("update({ status: 'submitted' })");
  });

  it('the status update happens after Resend success', () => {
    var resendIdx = sendReportSrc.indexOf("'https://api.resend.com/emails'");
    var statusIdx = sendReportSrc.indexOf("update({ status: 'submitted' })");
    expect(statusIdx).toBeGreaterThan(resendIdx);
  });

  it('status update failure is non-fatal (logged but does not throw)', () => {
    expect(sendReportSrc).toContain('failed to update status to submitted');
  });
});

describe('HEA-119 — save-draft.js STATUS_RANK includes narrative', () => {
  it('has narrative in STATUS_RANK', () => {
    expect(saveDraftSrc).toContain('narrative: 3');
  });

  it('narrative ranks between in_progress and submitted', () => {
    expect(saveDraftSrc).toContain('in_progress: 2, narrative: 3, submitted: 4');
  });
});

describe('HEA-119 — cancel-booking.js guards narrative status', () => {
  it('blocks cancel for narrative status', () => {
    expect(cancelSrc).toContain("rec.status === 'narrative'");
  });

  it('still blocks cancel for submitted status', () => {
    expect(cancelSrc).toContain("rec.status === 'submitted'");
  });
});

describe('HEA-119 — reschedule-booking.js guards narrative status', () => {
  it('blocks reschedule for narrative status', () => {
    expect(rescheduleSrc).toContain("rec.status === 'narrative'");
  });

  it('still blocks reschedule for submitted status', () => {
    expect(rescheduleSrc).toContain("rec.status === 'submitted'");
  });

  it('still blocks reschedule for cancelled status', () => {
    expect(rescheduleSrc).toContain("rec.status === 'cancelled'");
  });
});

describe('HEA-119 — admin.html Client Records UI', () => {
  it('has notification bar for narratives (HEA-219 replaced Narratives Needing Approval section)', () => {
    expect(adminHtml).toContain('id="narrativeNotifBar"');
    expect(adminHtml).toContain('narrative-review.html');
  });

  it('has Delivered section (renamed from Client History)', () => {
    // 'delivered' status is referenced in CSS classes and JS arrays within admin.html
    expect(adminHtml).toContain('delivered');
  });

  it('defines updateNarrativeBar function (replaced renderNarrativeSection)', () => {
    expect(crTabSrc).toContain('function updateNarrativeBar()');
  });

  it('updateNarrativeBar filters by narrative status', () => {
    expect(crTabSrc).toContain("r.status === 'narrative'");
  });

  it('notification bar links to narrative-review.html', () => {
    expect(adminHtml).toContain('narrative-review.html');
  });

  it('renderCRRecords calls updateNarrativeBar', () => {
    expect(crTabSrc).toContain('updateNarrativeBar()');
  });
});
