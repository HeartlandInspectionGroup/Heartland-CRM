-- Migration: add unique constraint for deterministic upsert in save-finding
-- Apply via Supabase SQL Editor before deploying save-finding.js

ALTER TABLE inspection_findings
ADD CONSTRAINT inspection_findings_record_section_field_uq
UNIQUE (record_id, section_id, field_id);
