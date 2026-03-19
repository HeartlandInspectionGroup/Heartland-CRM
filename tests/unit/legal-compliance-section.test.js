/**
 * Unit tests for HEA-136: Legal & Compliance section
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

var adminHtml = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');
var legalSrc = readFileSync(resolve(__dirname, '../../scripts/admin-legal.js'), 'utf8');
var checkOwnerSrc = readFileSync(resolve(__dirname, '../../functions/check-owner.js'), 'utf8');
var sendBreachSrc = readFileSync(resolve(__dirname, '../../functions/send-breach-notification.js'), 'utf8');
var purgeSrc = readFileSync(resolve(__dirname, '../../functions/purge-old-records.js'), 'utf8');
var getOldSrc = readFileSync(resolve(__dirname, '../../functions/get-old-records.js'), 'utf8');

// 1. Renames
describe('HEA-136 — Renames', () => {
  it('sidebar nav says Legal & Compliance', () => {
    expect(adminHtml).toContain('Legal &amp; Compliance</button>');
  });

  it('card title says Legal & Compliance', () => {
    expect(adminHtml).toContain('card-title">Legal &amp; Compliance</h2>');
  });

  it('description mentions compliance tools', () => {
    expect(adminHtml).toContain('compliance tools');
  });

  it('data-tab attribute unchanged (legal-agreements)', () => {
    expect(adminHtml).toContain('data-tab="legal-agreements"');
  });
});

// 2. check-owner.js
describe('HEA-136 — check-owner.js', () => {
  it('exists', () => {
    expect(existsSync(resolve(__dirname, '../../functions/check-owner.js'))).toBe(true);
  });

  it('compares against OWNER_EMAIL env var', () => {
    expect(checkOwnerSrc).toContain('OWNER_EMAIL');
  });

  it('returns isOwner boolean', () => {
    expect(checkOwnerSrc).toContain('isOwner');
  });

  it('returns 401 when no JWT', () => {
    expect(checkOwnerSrc).toContain('statusCode: 401');
  });

  it('handles missing OWNER_EMAIL gracefully', () => {
    expect(checkOwnerSrc).toContain("process.env.OWNER_EMAIL || ''");
  });
});

// 3. send-breach-notification.js
describe('HEA-136 — send-breach-notification.js', () => {
  it('exists', () => {
    expect(existsSync(resolve(__dirname, '../../functions/send-breach-notification.js'))).toBe(true);
  });

  it('validates admin JWT', () => {
    expect(sendBreachSrc).toContain('requireAuth');
  });

  it('returns auth error for unauthenticated', () => {
    expect(sendBreachSrc).toContain('authError');
  });

  it('accepts scope parameter', () => {
    expect(sendBreachSrc).toContain("scope");
    expect(sendBreachSrc).toContain("'all'");
    expect(sendBreachSrc).toContain("'date_range'");
    expect(sendBreachSrc).toContain("'single'");
  });

  it('logs breach.notification_sent to audit trail', () => {
    expect(sendBreachSrc).toContain("'breach.notification_sent'");
    expect(sendBreachSrc).toContain('recipient_count');
  });

  it('returns 400 when scope missing', () => {
    expect(sendBreachSrc).toContain("'scope required'");
  });
});

// 4. purge-old-records.js
describe('HEA-136 — purge-old-records.js', () => {
  it('exists', () => {
    expect(existsSync(resolve(__dirname, '../../functions/purge-old-records.js'))).toBe(true);
  });

  it('validates owner JWT', () => {
    expect(purgeSrc).toContain('validateOwner');
  });

  it('returns 403 for non-owner', () => {
    expect(purgeSrc).toContain('statusCode: 403');
  });

  it('verifies records are older than 7 years', () => {
    expect(purgeSrc).toContain('setFullYear');
    expect(purgeSrc).toContain('7');
    expect(purgeSrc).toContain('cutoffDate');
  });

  it('deletes children in order', () => {
    expect(purgeSrc).toContain("from('inspection_finding_photos')");
    expect(purgeSrc).toContain("from('inspection_finding_recommendations')");
    expect(purgeSrc).toContain("from('inspection_findings')");
    expect(purgeSrc).toContain("from('inspection_narratives')");
    expect(purgeSrc).toContain("from('property_profiles')");
  });

  it('NEVER deletes waiver_signatures', () => {
    expect(purgeSrc).not.toContain("from('waiver_signatures').delete");
  });

  it('logs data.retention_purge to audit trail', () => {
    expect(purgeSrc).toContain("'data.retention_purge'");
  });
});

// 5. get-old-records.js
describe('HEA-136 — get-old-records.js', () => {
  it('exists', () => {
    expect(existsSync(resolve(__dirname, '../../functions/get-old-records.js'))).toBe(true);
  });

  it('uses requireAuth', () => {
    expect(getOldSrc).toContain('requireAuth');
  });

  it('filters by 7-year cutoff', () => {
    expect(getOldSrc).toContain('setFullYear');
    expect(getOldSrc).toContain('cutoffDate');
  });
});

// 6. Owner gate in admin.html
describe('HEA-136 — Owner gate', () => {
  it('calls laCheckOwnerAndRender on tab click', () => {
    expect(legalSrc).toContain('window.laCheckOwnerAndRender');
  });

  it('defines laCheckOwnerAndRender function', () => {
    expect(legalSrc).toContain('function laCheckOwnerAndRender');
  });

  it('calls check-owner.js function', () => {
    expect(legalSrc).toContain('check-owner');
  });

  it('has locked state element', () => {
    expect(adminHtml).toContain('id="laLockedState"');
    expect(adminHtml).toContain('restricted to the account owner');
  });

  it('hides sub-tabs when not owner', () => {
    expect(legalSrc).toContain("subs.style.display = 'none'");
  });
});

// 7. All 5 sub-tabs present
describe('HEA-136 — All 5 sub-tabs', () => {
  it('has Agreement Templates tab', () => {
    expect(adminHtml).toContain('data-lapanel="templates"');
  });

  it('has Signature Audit Log tab', () => {
    expect(adminHtml).toContain('data-lapanel="signatures"');
  });

  it('has Data Policy tab', () => {
    expect(adminHtml).toContain('data-lapanel="data-policy"');
  });

  it('has Breach Response tab', () => {
    expect(adminHtml).toContain('data-lapanel="breach"');
  });

  it('has Data Retention tab', () => {
    expect(adminHtml).toContain('data-lapanel="retention"');
  });
});

// 8. Data Policy content
describe('HEA-136 — Data Policy panel', () => {
  it('has panel element', () => {
    expect(adminHtml).toContain('id="laPanelDataPolicy"');
  });

  it('has retention policy table', () => {
    expect(adminHtml).toContain('Inspection records');
    expect(adminHtml).toContain('7 years');
    expect(adminHtml).toContain('Indefinite');
    expect(adminHtml).toContain('IL licensing requirement');
    expect(adminHtml).toContain('IRS/tax requirement');
  });

  it('has third-party providers table', () => {
    expect(adminHtml).toContain('Supabase');
    expect(adminHtml).toContain('Cloudinary');
    expect(adminHtml).toContain('Stripe');
    expect(adminHtml).toContain('Resend');
    expect(adminHtml).toContain('Anthropic');
    expect(adminHtml).toContain('NO client PII');
  });
});

// 9. Breach Response content
describe('HEA-136 — Breach Response panel', () => {
  it('has panel element', () => {
    expect(adminHtml).toContain('id="laPanelBreach"');
  });

  it('has Incident Response Checklist button', () => {
    expect(adminHtml).toContain('laBreachChecklistBtn');
    expect(legalSrc).toContain('Incident Response Checklist');
  });

  it('has scope radio buttons', () => {
    expect(adminHtml).toContain('name="laBreachScope"');
    expect(adminHtml).toContain('value="all"');
    expect(adminHtml).toContain('value="date_range"');
    expect(adminHtml).toContain('value="single"');
  });

  it('has message textarea with pre-filled template', () => {
    expect(adminHtml).toContain('id="laBreachMessage"');
    expect(adminHtml).toContain('[Client Name]');
    expect(adminHtml).toContain('security incident');
  });

  it('has preview and send buttons', () => {
    expect(adminHtml).toContain('laBreachPreviewBtn');
    expect(adminHtml).toContain('laBreachSendBtn');
  });

  it('checklist modal has 7 steps', () => {
    // Checklist content moved to admin-legal.js (HEA-239)
    expect(legalSrc).toContain('Identify what was accessed');
    expect(legalSrc).toContain('Determine how many clients');
    expect(legalSrc).toContain('Change all credentials');
    expect(legalSrc).toContain('notify IL Attorney General');
    expect(legalSrc).toContain('Review and patch');
  });
});

// 10. Data Retention content
describe('HEA-136 — Data Retention panel', () => {
  it('has panel element', () => {
    expect(adminHtml).toContain('id="laPanelRetention"');
  });

  it('has Last Purge indicator', () => {
    expect(adminHtml).toContain('laRetentionLastPurge');
    expect(legalSrc).toContain('Never purged');
  });

  it('has records table container', () => {
    expect(adminHtml).toContain('id="laRetentionTable"');
  });

  it('has Select All checkbox', () => {
    expect(adminHtml).toContain('id="laRetentionSelectAll"');
  });

  it('has Review & Delete Selected button', () => {
    expect(adminHtml).toContain('laRetentionPurgeBtn');
    expect(adminHtml).toContain('Delete Selected');
  });

  it('purge confirmation mentions preserved agreements', () => {
    expect(legalSrc).toContain('Signed agreements are preserved');
    expect(legalSrc).toContain('NOT be deleted');
  });

  it('laLoadRetention function exists', () => {
    expect(legalSrc).toContain('function laLoadRetention');
  });
});

// 11. No regression on existing tabs
describe('HEA-136 — Existing tabs preserved', () => {
  it('Agreement Templates panel still exists', () => {
    expect(adminHtml).toContain('id="laPanelTemplates"');
  });

  it('Signature Audit Log panel still exists', () => {
    expect(adminHtml).toContain('id="laPanelSignatures"');
  });

  it('renderLaTemplates still exposed', () => {
    expect(legalSrc).toContain('window.renderLaTemplates = renderLaTemplates');
  });
});
