/**
 * Unit tests for collect-payment-v2.js
 */

import { describe, it, expect, beforeEach } from 'vitest';

const mod = require('../../functions/collect-payment-v2');
const { handler } = mod;

function makeEvent(body, token) {
  return {
    httpMethod: 'POST',
    headers: { 'x-admin-token': token || 'test-token' },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

var mockUpdateResult;

function mockClient() {
  return {
    from: function () {
      return {
        update: function () {
          return {
            eq: function () {
              return Promise.resolve(mockUpdateResult);
            },
          };
        },
      };
    },
  };
}

function mockStripe(piStatus) {
  return {
    paymentIntents: {
      retrieve: function () {
        if (piStatus === 'error') {
          return Promise.reject(new Error('No such payment intent'));
        }
        return Promise.resolve({ status: piStatus || 'succeeded' });
      },
    },
  };
}

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'test-token';
  mockUpdateResult = { error: null };
  mod._setClient(mockClient());
  mod._setStripe(mockStripe('succeeded'));
});

describe('collect-payment-v2 — method guards', () => {
  it('returns 204 for OPTIONS', async () => {
    var res = await handler({ httpMethod: 'OPTIONS', headers: {}, queryStringParameters: {}, body: '' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 405 for GET', async () => {
    var res = await handler({ httpMethod: 'GET', headers: { 'x-admin-token': 'test-token' }, queryStringParameters: {}, body: '' });
    expect(res.statusCode).toBe(405);
  });

  it('returns 401 without admin token', async () => {
    var res = await handler({ httpMethod: 'POST', headers: {}, queryStringParameters: {}, body: '{}' });
    expect(res.statusCode).toBe(401);
  });
});

describe('collect-payment-v2 — validation', () => {
  it('returns 400 when record_id is missing', async () => {
    var res = await handler(makeEvent({ payment_method: 'cash' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/record_id required/);
  });

  it('returns 400 when payment_method is missing', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/payment_method required/);
  });

  it('returns 400 for invalid payment_method', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', payment_method: 'bitcoin' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/must be card, cash, or check/);
  });

  it('returns 400 when card payment missing stripe_payment_intent_id', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', payment_method: 'card' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/stripe_payment_intent_id required/);
  });
});

describe('collect-payment-v2 — cash payment', () => {
  it('sets payment_status = paid for cash', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', payment_method: 'cash' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });
});

describe('collect-payment-v2 — check payment', () => {
  it('sets payment_status = paid for check', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', payment_method: 'check' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });
});

describe('collect-payment-v2 — waive rejected', () => {
  it('rejects waive as invalid payment method', async () => {
    var res = await handler(makeEvent({ record_id: 'rec-1', payment_method: 'waive' }));
    expect(res.statusCode).toBe(400);
  });
});

describe('collect-payment-v2 — card payment', () => {
  it('succeeds when Stripe PaymentIntent is succeeded', async () => {
    var res = await handler(makeEvent({
      record_id: 'rec-1',
      payment_method: 'card',
      stripe_payment_intent_id: 'pi_test_123',
    }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it('returns 402 when Stripe retrieve fails', async () => {
    mod._setStripe(mockStripe('error'));
    var res = await handler(makeEvent({
      record_id: 'rec-1',
      payment_method: 'card',
      stripe_payment_intent_id: 'pi_bad',
    }));
    expect(res.statusCode).toBe(402);
    expect(JSON.parse(res.body).error).toMatch(/stripe verification failed/i);
  });

  it('returns 402 when PaymentIntent status is not succeeded', async () => {
    mod._setStripe(mockStripe('requires_payment_method'));
    var res = await handler(makeEvent({
      record_id: 'rec-1',
      payment_method: 'card',
      stripe_payment_intent_id: 'pi_incomplete',
    }));
    expect(res.statusCode).toBe(402);
    expect(JSON.parse(res.body).error).toMatch(/payment not completed/i);
  });
});

describe('collect-payment-v2 — DB errors', () => {
  it('returns 500 on DB update error', async () => {
    mockUpdateResult = { error: { message: 'DB down' } };
    mod._setClient(mockClient());

    var res = await handler(makeEvent({ record_id: 'rec-1', payment_method: 'cash' }));
    expect(res.statusCode).toBe(500);
  });
});
