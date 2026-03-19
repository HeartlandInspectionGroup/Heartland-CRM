/**
 * Unit tests for HEA-132: Payment Element upgrade (Apple Pay / Google Pay)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

var invoiceHtml = readFileSync(resolve(__dirname, '../../invoice.html'), 'utf8');
var createPaymentSrc = readFileSync(resolve(__dirname, '../../functions/create-payment.js'), 'utf8');
var netlifyToml = readFileSync(resolve(__dirname, '../../netlify.toml'), 'utf8');

// 1. Payment Element renders instead of Card Element
describe('HEA-132 — Payment Element replaces Card Element', () => {
  it('has #paymentElement mount point', () => {
    expect(invoiceHtml).toContain('id="paymentElement"');
  });

  it('does NOT have old #cardElement mount point', () => {
    expect(invoiceHtml).not.toContain('id="cardElement"');
  });

  it('creates payment element via .create("payment")', () => {
    expect(invoiceHtml).toContain(".create('payment')");
  });

  it('does NOT create card element', () => {
    expect(invoiceHtml).not.toContain("elements.create('card'");
  });

  it('mounts to #paymentElement', () => {
    expect(invoiceHtml).toContain("mount('#paymentElement')");
  });

  it('does NOT mount to #cardElement', () => {
    expect(invoiceHtml).not.toContain("mount('#cardElement')");
  });
});

// 2. Elements group created with clientSecret + appearance
describe('HEA-132 — Elements initialization with clientSecret', () => {
  it('passes clientSecret to elements()', () => {
    expect(invoiceHtml).toContain('clientSecret: clientSecret');
  });

  it('uses night theme appearance', () => {
    expect(invoiceHtml).toContain("theme: 'night'");
  });

  it('sets brand green as colorPrimary', () => {
    expect(invoiceHtml).toContain("colorPrimary: '#27ae60'");
  });

  it('sets dark background color', () => {
    expect(invoiceHtml).toContain("colorBackground: '#1a2332'");
  });

  it('sets text color', () => {
    expect(invoiceHtml).toContain("colorText: 'rgba(255,255,255,0.92)'");
  });

  it('uses Barlow font family', () => {
    expect(invoiceHtml).toContain("fontFamily: 'Barlow, sans-serif'");
  });
});

// 3. confirmPayment replaces confirmCardPayment
describe('HEA-132 — confirmPayment() replaces confirmCardPayment()', () => {
  it('uses stripe.confirmPayment()', () => {
    expect(invoiceHtml).toContain('stripeInstance.confirmPayment(');
  });

  it('does NOT use confirmCardPayment', () => {
    expect(invoiceHtml).not.toContain('confirmCardPayment');
  });

  it('passes elements to confirmPayment', () => {
    expect(invoiceHtml).toContain('elements: stripeElements');
  });

  it('uses redirect: if_required', () => {
    expect(invoiceHtml).toContain("redirect: 'if_required'");
  });

  it('sets return_url to current page', () => {
    expect(invoiceHtml).toContain('return_url: window.location.href');
  });
});

// 4. Old Card Element artifacts removed
describe('HEA-132 — Old Card Element artifacts removed', () => {
  it('no Name on Card input', () => {
    expect(invoiceHtml).not.toContain('id="invName"');
    expect(invoiceHtml).not.toContain('Name on Card');
  });

  it('no inv-card-wrap element', () => {
    expect(invoiceHtml).not.toContain('id="invCardWrap"');
    expect(invoiceHtml).not.toContain('inv-card-wrap');
  });

  it('no cardElement focus/blur listeners', () => {
    expect(invoiceHtml).not.toContain("cardElement.on('focus'");
    expect(invoiceHtml).not.toContain("cardElement.on('blur'");
    expect(invoiceHtml).not.toContain("cardElement.on('change'");
  });

  it('no old cardError element', () => {
    expect(invoiceHtml).not.toContain('id="cardError"');
  });

  it('has new payError element', () => {
    expect(invoiceHtml).toContain('id="payError"');
  });
});

// 5. create-payment.js uses automatic_payment_methods
describe('HEA-132 — create-payment.js automatic_payment_methods', () => {
  it('uses automatic_payment_methods: { enabled: true }', () => {
    expect(createPaymentSrc).toContain('automatic_payment_methods: { enabled: true }');
  });

  it('does NOT use payment_method_types', () => {
    expect(createPaymentSrc).not.toContain('payment_method_types');
  });
});

// 6. Apple Pay domain association file headers in netlify.toml
describe('HEA-132 — Apple Pay domain association in netlify.toml', () => {
  it('has header rule for .well-known path', () => {
    expect(netlifyToml).toContain('/.well-known/apple-developer-merchantid-domain-association');
  });

  it('sets Content-Type to application/octet-stream', () => {
    // Check the content-type is set near the well-known path
    var idx = netlifyToml.indexOf('apple-developer-merchantid-domain-association');
    var block = netlifyToml.substring(idx, idx + 200);
    expect(block).toContain('application/octet-stream');
  });

  it('allows CORS for Apple verification', () => {
    var idx = netlifyToml.indexOf('apple-developer-merchantid-domain-association');
    var block = netlifyToml.substring(idx, idx + 200);
    expect(block).toContain('Access-Control-Allow-Origin');
  });
});

// 7. Payment header updated
describe('HEA-132 — UI updates', () => {
  it('header says Pay Now instead of Pay by Card', () => {
    expect(invoiceHtml).toContain('Pay Now</h2>');
    expect(invoiceHtml).not.toContain('Pay by Card');
  });

  it('subtitle mentions Apple Pay and Google Pay', () => {
    expect(invoiceHtml).toContain('Apple Pay');
    expect(invoiceHtml).toContain('Google Pay');
  });
});

// 8. PaymentIntent created during init, not during handlePay
describe('HEA-132 — PaymentIntent created during initialization', () => {
  it('create-payment call is in initStripe, not handlePay', () => {
    // Find initStripe function body — it should contain create-payment fetch
    var initIdx = invoiceHtml.indexOf('async function initStripe()');
    var handleIdx = invoiceHtml.indexOf('window.handlePay');
    var initBlock = invoiceHtml.substring(initIdx, handleIdx);
    expect(initBlock).toContain('create-payment');

    // handlePay should NOT contain create-payment fetch
    var handleEnd = invoiceHtml.indexOf('function setLoading', handleIdx);
    var handleBlock = invoiceHtml.substring(handleIdx, handleEnd);
    expect(handleBlock).not.toContain('create-payment');
  });
});

// 9. Post-payment flow preserved
describe('HEA-132 — Post-payment flow preserved', () => {
  it('calls record-online-payment after success', () => {
    expect(invoiceHtml).toContain('record-online-payment');
  });

  it('sends booking_id and stripe_payment_intent_id', () => {
    expect(invoiceHtml).toContain('booking_id: bookingId');
    expect(invoiceHtml).toContain('stripe_payment_intent_id: result.paymentIntent.id');
  });

  it('redirects to portal_url when available', () => {
    expect(invoiceHtml).toContain('payData.portal_url');
    expect(invoiceHtml).toContain('window.location.href = payData.portal_url');
  });

  it('shows inline success as fallback', () => {
    expect(invoiceHtml).toContain('showSuccess(result.paymentIntent.id)');
  });
});
