/**
 * Unit tests for create-payment.js Path B auth fix
 * Path B (wizard/field payment) now uses requireAuth() — accepts JWT or ADMIN_TOKEN
 * Path A (invoice.html with booking_id) remains unauthenticated
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var src = readFileSync(resolve(__dirname, '../../functions/create-payment.js'), 'utf8');

describe('create-payment.js — Path B auth', () => {
  it('imports requireAuth from shared auth.js', () => {
    expect(src).toContain("const { requireAuth } = require('./auth')");
  });

  it('calls requireAuth in Path B instead of inline x-admin-token check', () => {
    // Should contain requireAuth call
    expect(src).toContain('var authError = await requireAuth(event)');
    expect(src).toContain('if (authError) return authError');
    // Should NOT contain old inline token check
    expect(src).not.toContain("event.headers['x-admin-token']");
    expect(src).not.toContain('var adminToken = process.env.ADMIN_TOKEN');
    expect(src).not.toContain('reqToken !== adminToken');
  });
});

describe('create-payment.js — Path A unchanged', () => {
  it('Path A (booking_id + amount_cents) has no auth check', () => {
    // Path A block: from "if (booking_id && amount_cents)" to the else
    var pathAStart = src.indexOf('if (booking_id && amount_cents)');
    var pathAEnd = src.indexOf('else if (tier || amount_cents)');
    var pathA = src.substring(pathAStart, pathAEnd);
    expect(pathA).not.toContain('requireAuth');
    expect(pathA).not.toContain('Unauthorized');
  });
});
