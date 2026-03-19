/**
 * Unit tests for HEA-86 Phase 3: ADMIN_TOKEN removed from client-side
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

var configSrc = readFileSync(resolve(__dirname, '../../config.js'), 'utf8');
var claudeMd = readFileSync(resolve(__dirname, '../../CLAUDE.md'), 'utf8');

describe('HEA-86 Phase 3 — ADMIN_TOKEN removed from config.js', () => {
  it('config.js does NOT set window.ADMIN_TOKEN', () => {
    expect(configSrc).not.toContain('window.ADMIN_TOKEN =');
  });

  it('config.js does NOT contain the token value', () => {
    expect(configSrc).not.toContain('3824d37e48745602d2f7de3bffd74fbf98063228b557110d');
  });

  it('config.js has a comment noting ADMIN_TOKEN was removed', () => {
    expect(configSrc).toContain('ADMIN_TOKEN removed');
  });

  it('config.js still has SUPABASE_URL', () => {
    expect(configSrc).toContain('window.SUPABASE_URL');
  });

  it('config.js still has SUPABASE_ANON_KEY', () => {
    expect(configSrc).toContain('window.SUPABASE_ANON_KEY');
  });
});

describe('HEA-86 Phase 3 — CLAUDE.md updated', () => {
  it('CLAUDE.md notes ADMIN_TOKEN is server-only', () => {
    expect(claudeMd).toContain('server-only env var');
  });

  it('CLAUDE.md does NOT expose the token value', () => {
    expect(claudeMd).not.toContain('3824d37e48745602d2f7de3bffd74fbf98063228b557110d');
  });
});
