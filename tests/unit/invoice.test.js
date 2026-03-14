import { describe, it, expect } from 'vitest';

// Import exported functions from create-invoice and update-invoice
const { buildLineItems, calculateTotals } = require('../../functions/create-invoice');
const { recalculate } = require('../../functions/update-invoice');

// ─── buildLineItems ──────────────────────────────────────

describe('buildLineItems', () => {
  it('creates base service line item from booking', () => {
    const booking = { base_price: 350, home_size_tier: '1,501-2,500 sqft' };
    const items = buildLineItems(booking);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      description: 'Home Inspection (1,501-2,500 sqft)',
      quantity: 1,
      unit_price: 350,
      total: 350,
      item_type: 'base_service',
      taxable: true,
    });
  });

  it('creates add-on line items from services array', () => {
    const booking = {
      base_price: 300,
      services: [
        { name: 'Radon Testing', price: 150 },
        { name: 'Sewer Scope', price: 175 },
      ],
    };
    const items = buildLineItems(booking);
    expect(items).toHaveLength(3);
    expect(items[1].description).toBe('Radon Testing');
    expect(items[1].total).toBe(150);
    expect(items[1].item_type).toBe('addon');
    expect(items[2].description).toBe('Sewer Scope');
    expect(items[2].total).toBe(175);
  });

  it('creates discount line item as negative amount', () => {
    const booking = { base_price: 500, discount_amount: 50, discount_pct: 10 };
    const items = buildLineItems(booking);
    const discount = items.find(i => i.item_type === 'discount');
    expect(discount).toBeDefined();
    expect(discount.total).toBe(-50);
    expect(discount.description).toContain('10%');
    expect(discount.taxable).toBe(false);
  });

  it('creates coupon line item as negative amount', () => {
    const booking = { base_price: 400, coupon_discount: 25, coupon_code: 'SAVE25' };
    const items = buildLineItems(booking);
    const coupon = items.find(i => i.item_type === 'coupon');
    expect(coupon).toBeDefined();
    expect(coupon.total).toBe(-25);
    expect(coupon.description).toContain('SAVE25');
  });

  it('creates tax line item', () => {
    const booking = { base_price: 400, tax_amount: 25, tax_rate: 0.0625 };
    const items = buildLineItems(booking);
    const tax = items.find(i => i.item_type === 'tax');
    expect(tax).toBeDefined();
    expect(tax.total).toBe(25);
    expect(tax.description).toContain('6.25%');
    expect(tax.taxable).toBe(false);
  });

  it('returns empty array for booking with no pricing', () => {
    const items = buildLineItems({});
    expect(items).toHaveLength(0);
  });

  it('skips zero-price add-on services', () => {
    const booking = {
      base_price: 300,
      services: [{ name: 'Free Add-On', price: 0 }],
    };
    const items = buildLineItems(booking);
    expect(items).toHaveLength(1); // Only base service
  });

  it('handles full booking with all line item types', () => {
    const booking = {
      base_price: 375,
      home_size_tier: '2,501-3,500 sqft',
      services: [{ name: 'Radon Testing', price: 150 }],
      discount_amount: 30,
      discount_pct: 5,
      coupon_discount: 10,
      coupon_code: 'WELCOME',
      tax_amount: 30.31,
      tax_rate: 0.0625,
    };
    const items = buildLineItems(booking);
    expect(items).toHaveLength(5); // base + addon + discount + coupon + tax
    expect(items.map(i => i.item_type)).toEqual([
      'base_service', 'addon', 'discount', 'coupon', 'tax'
    ]);
    // sort_order is sequential
    expect(items.map(i => i.sort_order)).toEqual([0, 1, 2, 3, 4]);
  });
});

// ─── calculateTotals ─────────────────────────────────────

describe('calculateTotals', () => {
  it('calculates correct totals for simple booking', () => {
    const booking = { base_price: 400, tax_amount: 0, tax_rate: 0 };
    const items = buildLineItems(booking);
    const totals = calculateTotals(items, booking);
    expect(totals.subtotal).toBe(400);
    expect(totals.total).toBe(400);
    expect(totals.balance_due).toBe(400);
  });

  it('subtracts discount and coupon from total', () => {
    const booking = {
      base_price: 500,
      discount_amount: 50,
      coupon_discount: 25,
      tax_amount: 0,
    };
    const items = buildLineItems(booking);
    const totals = calculateTotals(items, booking);
    expect(totals.subtotal).toBe(500);
    expect(totals.discount_amount).toBe(50);
    expect(totals.coupon_discount).toBe(25);
    expect(totals.total).toBe(425);
    expect(totals.balance_due).toBe(425);
  });

  it('adds tax to total', () => {
    const booking = {
      base_price: 400,
      tax_amount: 25,
      tax_rate: 0.0625,
    };
    const items = buildLineItems(booking);
    const totals = calculateTotals(items, booking);
    expect(totals.subtotal).toBe(400);
    expect(totals.tax_amount).toBe(25);
    expect(totals.total).toBe(425);
  });

  it('handles full pricing with discounts, coupons, and tax', () => {
    const booking = {
      base_price: 375,
      services: [{ name: 'Radon', price: 150 }],
      discount_amount: 30,
      coupon_discount: 10,
      tax_amount: 30.31,
      tax_rate: 0.0625,
    };
    const items = buildLineItems(booking);
    const totals = calculateTotals(items, booking);
    expect(totals.subtotal).toBe(525); // 375 + 150
    expect(totals.total).toBe(515.31); // 525 - 30 - 10 + 30.31
  });

  it('rounds to 2 decimal places', () => {
    const booking = {
      base_price: 333.33,
      tax_amount: 20.8331,
      tax_rate: 0.0625,
    };
    const items = buildLineItems(booking);
    const totals = calculateTotals(items, booking);
    expect(totals.subtotal).toBe(333.33);
    expect(totals.tax_amount).toBe(20.83);
    expect(totals.total).toBe(354.16);
  });
});

// ─── recalculate (update-invoice) ────────────────────────

describe('recalculate', () => {
  it('calculates totals from mixed line items', () => {
    const items = [
      { total: 400, item_type: 'base_service' },
      { total: 150, item_type: 'addon' },
      { total: -50, item_type: 'discount' },
      { total: -25, item_type: 'coupon' },
      { total: 29.69, item_type: 'tax' },
    ];
    const result = recalculate(items);
    expect(result.subtotal).toBe(550);
    expect(result.discount_amount).toBe(50);
    expect(result.coupon_discount).toBe(25);
    expect(result.tax_amount).toBe(29.69);
    expect(result.total).toBe(504.69);
  });

  it('returns zero for empty line items', () => {
    const result = recalculate([]);
    expect(result.subtotal).toBe(0);
    expect(result.total).toBe(0);
  });

  it('handles single base service only', () => {
    const items = [{ total: 350, item_type: 'base_service' }];
    const result = recalculate(items);
    expect(result.subtotal).toBe(350);
    expect(result.discount_amount).toBe(0);
    expect(result.coupon_discount).toBe(0);
    expect(result.tax_amount).toBe(0);
    expect(result.total).toBe(350);
  });

  it('handles custom line items added to subtotal', () => {
    const items = [
      { total: 300, item_type: 'base_service' },
      { total: 75, item_type: 'custom' },
    ];
    const result = recalculate(items);
    expect(result.subtotal).toBe(375);
    expect(result.total).toBe(375);
  });

  it('uses absolute value for discount/coupon totals', () => {
    const items = [
      { total: 500, item_type: 'base_service' },
      { total: -100, item_type: 'discount' },
    ];
    const result = recalculate(items);
    expect(result.discount_amount).toBe(100);
    expect(result.total).toBe(400);
  });
});
