/**
 * Unit tests for HEA-128: Remove Waive, Add Price Adjustment, Update Payment Gate
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var v2Html = readFileSync(resolve(__dirname, '../../inspector-wizard-v2.html'), 'utf8');
var collectSrc = readFileSync(resolve(__dirname, '../../functions/collect-payment-v2.js'), 'utf8');
var getStatusSrc = readFileSync(resolve(__dirname, '../../functions/get-record-status.js'), 'utf8');
var submitSrc = readFileSync(resolve(__dirname, '../../functions/submit-inspection-v2.js'), 'utf8');

describe('HEA-128 — Waive tab removed from V2 wizard', () => {
  it('no Waive tab button in payment panel', () => {
    expect(v2Html).not.toContain("v2PayTab('waive')");
  });

  it('no v2PayWaive section div', () => {
    expect(v2Html).not.toContain('id="v2PayWaive"');
  });

  it('no v2PayWaiveBtn', () => {
    expect(v2Html).not.toContain('v2PayWaiveBtn');
  });

  it('no v2PayWaiveReason input', () => {
    expect(v2Html).not.toContain('v2PayWaiveReason');
  });

  it('tab sections map has no waive entry', () => {
    expect(v2Html).not.toMatch(/sections\s*=\s*\{[^}]*waive/);
  });

  it('payment panel still has Card, Cash, Check tabs', () => {
    expect(v2Html).toContain("v2PayTab('card')");
    expect(v2Html).toContain("v2PayTab('cash')");
    expect(v2Html).toContain("v2PayTab('check')");
  });
});

describe('HEA-128 — Waive removed from collect-payment-v2.js', () => {
  it('validMethods does not include waive', () => {
    expect(collectSrc).not.toMatch(/validMethods.*waive/);
  });

  it('no waived payment_status write', () => {
    expect(collectSrc).not.toContain("payment_status: 'waived'");
  });

  it('error message says card, cash, or check', () => {
    expect(collectSrc).toContain('card, cash, or check');
  });
});

describe('HEA-128 — Waive removed from submit-inspection-v2.js', () => {
  it('payment gate does not check for waived', () => {
    expect(submitSrc).not.toContain("!== 'waived'");
  });

  it('payment gate checks final_total for $0 bypass', () => {
    expect(submitSrc).toContain('Number(record.final_total || 0) > 0');
  });
});

describe('HEA-128 — Price adjustment input in V2 wizard', () => {
  it('has editable amount input', () => {
    expect(v2Html).toContain('id="v2PayAmountInput"');
  });

  it('amount input is type number', () => {
    expect(v2Html).toContain('type="number" id="v2PayAmountInput"');
  });

  it('v2PayOpen sets input value from final_total', () => {
    expect(v2Html).toContain("getElementById('v2PayAmountInput')");
    expect(v2Html).toContain('v2CurrentJob.final_total');
  });

  it('v2PayCharge reads from amount input', () => {
    expect(v2Html).toContain("var adjustedAmount = amtInput ? parseFloat(amtInput.value)");
  });

  it('v2PayCollect passes adjusted_amount in payload', () => {
    expect(v2Html).toContain('payload.adjusted_amount = adjustedAmount');
  });
});

describe('HEA-128 — Price adjustment in collect-payment-v2.js', () => {
  it('accepts adjusted_amount parameter', () => {
    expect(collectSrc).toContain('adjusted_amount');
  });

  it('updates final_total when adjusted', () => {
    expect(collectSrc).toContain("update({ final_total: adjNum })");
  });

  it('logs payment.amount_adjusted to audit', () => {
    expect(collectSrc).toContain("action: 'payment.amount_adjusted'");
    expect(collectSrc).toContain('original_amount');
    expect(collectSrc).toContain('adjusted_amount');
  });

  it('imports writeAuditLog', () => {
    expect(collectSrc).toContain("require('./write-audit-log')");
  });
});

describe('HEA-128 — $0 payment gate in get-record-status.js', () => {
  it('selects final_total from inspection_records', () => {
    expect(getStatusSrc).toContain('final_total');
    expect(getStatusSrc).toMatch(/select.*final_total/);
  });

  it('returns final_total in response', () => {
    expect(getStatusSrc).toContain('final_total: record.final_total');
  });
});

describe('HEA-128 — $0 gate in V2 wizard client-side', () => {
  it('gate checks final_total === 0 instead of waived', () => {
    expect(v2Html).toContain("Number(data.final_total) === 0");
    expect(v2Html).not.toContain("data.payment_status === 'waived'");
  });
});
