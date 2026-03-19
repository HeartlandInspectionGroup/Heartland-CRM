/**
 * Unit tests for HEA-126: Digital Payment Recording
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

var adminHtml = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');
var crTabSrc = readFileSync(resolve(__dirname, '../../scripts/admin-client-records-tab.js'), 'utf8');
var funcSrc = readFileSync(resolve(__dirname, '../../functions/record-digital-payment.js'), 'utf8');

// Function tests
const mod = require('../../functions/record-digital-payment');
const { handler } = mod;

function makeEvent(body, token) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-token': token || 'test-token', origin: 'https://heartland-crm.netlify.app' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

var mockUpdateResult;
function mockClient() {
  return {
    from: function () {
      return {
        update: function () { return { eq: function () { return Promise.resolve(mockUpdateResult); } }; },
        select: function () { return { eq: function () { return { maybeSingle: function () { return Promise.resolve({ data: { final_total: 375 }, error: null }); } }; } }; },
      };
    },
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  mockUpdateResult = { error: null };
  mod._setClient(mockClient());
});

describe('HEA-126 — record-digital-payment.js function', () => {
  it('exists', () => {
    expect(existsSync(resolve(__dirname, '../../functions/record-digital-payment.js'))).toBe(true);
  });

  it('returns 400 when record_id missing', async () => {
    var res = await handler(makeEvent({ method_detail: 'venmo', transaction_id: '123' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record_id required/);
  });

  it('returns 400 when method_detail missing', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', transaction_id: '123' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/method_detail required/);
  });

  it('returns 400 when transaction_id missing', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', method_detail: 'venmo' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/transaction_id required/);
  });

  it('returns 400 for invalid method_detail', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', method_detail: 'bitcoin', transaction_id: '123' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/venmo, paypal, or zelle/);
  });

  it('returns 200 for valid Venmo payment', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', method_detail: 'venmo', transaction_id: 'V123' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it('returns 200 for valid PayPal payment', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', method_detail: 'paypal', transaction_id: 'PP456' }));
    expect(res.statusCode).toBe(200);
  });

  it('returns 200 for valid Zelle payment', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', method_detail: 'zelle', transaction_id: 'Z789' }));
    expect(res.statusCode).toBe(200);
  });

  it('sets payment_status to paid', () => {
    expect(funcSrc).toContain("payment_status: 'paid'");
  });

  it('sets payment_method to digital', () => {
    expect(funcSrc).toContain("payment_method: 'digital'");
  });

  it('stores payment_method_detail', () => {
    expect(funcSrc).toContain('payment_method_detail: method_detail');
  });

  it('stores digital_transaction_id', () => {
    expect(funcSrc).toContain('digital_transaction_id: transaction_id');
  });

  it('logs payment.digital_recorded to audit trail', () => {
    expect(funcSrc).toContain("'payment.digital_recorded'");
  });

  it('uses requireAuth', () => {
    expect(funcSrc).toContain('requireAuth');
  });
});

describe('HEA-126 — Mark as Paid button on Scheduled cards', () => {
  it('renders Mark as Paid button', () => {
    expect(crTabSrc).toContain('cr-mark-paid');
    expect(crTabSrc).toContain('Mark as Paid');
  });

  it('button only shows when payment_status is not paid', () => {
    expect(crTabSrc).toContain("r.payment_status !== 'paid'");
  });

  it('button has data-action="mark-paid"', () => {
    expect(crTabSrc).toContain('data-action="mark-paid"');
  });

  it('button has data-amount attribute', () => {
    expect(crTabSrc).toContain('data-amount');
  });
});

describe('HEA-126 — Digital Payment modal', () => {
  it('modal element exists', () => {
    expect(adminHtml).toContain('id="crDigitalPayModal"');
  });

  it('has Venmo method button', () => {
    expect(adminHtml).toContain("data-method=\"venmo\"");
    expect(adminHtml).toContain('Venmo');
  });

  it('has PayPal method button', () => {
    expect(adminHtml).toContain("data-method=\"paypal\"");
    expect(adminHtml).toContain('PayPal');
  });

  it('has Zelle method button', () => {
    expect(adminHtml).toContain("data-method=\"zelle\"");
    expect(adminHtml).toContain('Zelle');
  });

  it('has Transaction ID input', () => {
    expect(adminHtml).toContain('id="dpTransactionId"');
  });

  it('has Amount input', () => {
    expect(adminHtml).toContain('id="dpAmount"');
  });

  it('has Confirm Payment button disabled by default', () => {
    expect(adminHtml).toContain('id="dpConfirmBtn"');
    expect(adminHtml).toMatch(/dpConfirmBtn.*disabled/);
  });

  it('has Cancel button', () => {
    expect(adminHtml).toContain("crDigitalPayModal').classList.remove('open')");
  });
});

describe('HEA-126 — Modal JS wiring', () => {
  it('_dpSelectMethod function exists', () => {
    expect(crTabSrc).toContain('window._dpSelectMethod');
  });

  it('_dpValidate function exists', () => {
    expect(crTabSrc).toContain('window._dpValidate');
  });

  it('_dpConfirm calls record-digital-payment', () => {
    expect(crTabSrc).toContain('record-digital-payment');
  });

  it('_dpConfirm refreshes Scheduled section on success', () => {
    expect(crTabSrc).toContain('renderScheduledSection()');
  });

  it('action handler opens modal on mark-paid click', () => {
    expect(crTabSrc).toContain("action === 'mark-paid'");
    expect(crTabSrc).toContain("crDigitalPayModal').classList.add('open')");
  });

  it('updates local record data on success', () => {
    expect(crTabSrc).toContain("rec.payment_status = 'paid'");
    expect(crTabSrc).toContain("rec.payment_method = 'digital'");
  });

  it('shows branded toast on success', () => {
    expect(crTabSrc).toContain("Payment recorded \\u2014");
  });
});
