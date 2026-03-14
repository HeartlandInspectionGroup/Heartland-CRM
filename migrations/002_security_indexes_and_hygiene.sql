-- ============================================================
-- Migration 002: Security Indexes & Schema Hygiene
-- Date: 2026-03-14
-- Purpose: Add indexes on PII lookup fields, fix schema gaps
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. INDEXES on email columns (prevent full-table scans on PII)
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inspection_records_cust_email
  ON public.inspection_records (cust_email);

CREATE INDEX IF NOT EXISTS idx_bookings_client_email
  ON public.bookings (client_email);

CREATE INDEX IF NOT EXISTS idx_waiver_signatures_client_email
  ON public.waiver_signatures (client_email);

CREATE INDEX IF NOT EXISTS idx_client_portal_tokens_client_email
  ON public.client_portal_tokens (client_email);

CREATE INDEX IF NOT EXISTS idx_client_portal_tokens_token
  ON public.client_portal_tokens (token);

CREATE INDEX IF NOT EXISTS idx_agents_email
  ON public.agents (email);

CREATE INDEX IF NOT EXISTS idx_audit_log_record_id
  ON public.audit_log (record_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.audit_log (created_at);
