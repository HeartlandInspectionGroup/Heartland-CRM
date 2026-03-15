-- Migration: add license_number column to agents table
-- Required by HEA-92 — Illinois required fields screen in V2 wizard
-- Apply via Supabase SQL Editor

ALTER TABLE agents
ADD COLUMN license_number text;
