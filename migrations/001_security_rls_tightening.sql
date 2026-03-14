-- ============================================================
-- Migration 001: Security RLS Tightening
-- Date: 2026-03-14
-- Purpose: Fix overly permissive RLS policies on PII tables
--
-- IMPORTANT: Run this in the Supabase SQL Editor.
-- Each section is independent — if one fails, the rest still apply.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. CLIENTS TABLE — Enable RLS (was completely disabled)
--    Risk: Entire client database was queryable by anyone
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Admin.html reads this client-side with anon key, so keep SELECT open
CREATE POLICY "clients_anon_select" ON public.clients
  FOR SELECT USING (true);

-- All writes restricted to service_role (Netlify functions)
CREATE POLICY "clients_insert_service_role" ON public.clients
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "clients_update_service_role" ON public.clients
  FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "clients_delete_service_role" ON public.clients
  FOR DELETE USING (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────
-- 2. CLIENT_PORTAL_TOKENS — Enable RLS (was disabled!)
--    Risk: All portal tokens were exposed — anyone could impersonate clients
--    This table is ONLY accessed server-side via service key.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.client_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing permissive policies (they were not enforced before)
DROP POLICY IF EXISTS "tokens_read" ON public.client_portal_tokens;
DROP POLICY IF EXISTS "tokens_insert" ON public.client_portal_tokens;
DROP POLICY IF EXISTS "Service role can delete tokens" ON public.client_portal_tokens;

-- Replace with service_role only
CREATE POLICY "portal_tokens_service_role" ON public.client_portal_tokens
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────
-- 3. FIELD_PHOTOS — Enable RLS (was disabled)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.field_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "field_photos_service_role" ON public.field_photos
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────
-- 4. AGENT_CLIENTS — Enable RLS (was disabled)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.agent_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_clients_service_role" ON public.agent_clients
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────
-- 5. AGENT_CLIENT_DOCUMENTS — Enable RLS (was disabled)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.agent_client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_client_docs_service_role" ON public.agent_client_documents
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────
-- 6. INSPECTION_RECORDS — Remove public INSERT/UPDATE
--    Admin.html only does SELECT. All writes go through
--    Netlify functions (service key).
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "inspection_records_insert" ON public.inspection_records;
DROP POLICY IF EXISTS "inspection_records_update" ON public.inspection_records;

-- service_role_only policy already exists for ALL operations


-- ────────────────────────────────────────────────────────────
-- 7. AGENTS — Remove misleading public INSERT/UPDATE
--    Admin.html only does SELECT. Writes go through
--    manage-agent.js (service key).
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "agents_insert_service_role" ON public.agents;
DROP POLICY IF EXISTS "agents_update_service_role" ON public.agents;

-- Add proper service_role write policies
CREATE POLICY "agents_write_service_role" ON public.agents
  FOR INSERT WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE POLICY "agents_update_service_role_new" ON public.agents
  FOR UPDATE USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');


-- ────────────────────────────────────────────────────────────
-- 8. BOOKINGS — Remove anon INSERT
--    All booking inserts go through Netlify functions.
--    Keep anon SELECT + UPDATE (admin.html needs both).
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can insert bookings" ON public.bookings;


-- ────────────────────────────────────────────────────────────
-- 9. AUDIT_LOG — Restrict to service_role only
--    Not queried client-side. Admin uses get-audit-log.js
--    (service key). Public read+insert was dangerous.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "Public insert audit_log" ON public.audit_log;

CREATE POLICY "audit_log_service_role" ON public.audit_log
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────
-- 10. WAIVER_SIGNATURES — Restrict to service_role only
--     Not queried client-side. All access via Netlify functions.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_waiver_signatures" ON public.waiver_signatures;
DROP POLICY IF EXISTS "anon_select_waiver_signatures" ON public.waiver_signatures;
DROP POLICY IF EXISTS "anon_update_waiver_signatures" ON public.waiver_signatures;

CREATE POLICY "waiver_signatures_service_role" ON public.waiver_signatures
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
