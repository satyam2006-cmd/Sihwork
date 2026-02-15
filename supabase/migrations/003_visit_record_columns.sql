-- ============================================================================
-- 003_visit_record_columns.sql
-- Add red_flags and medication_changes columns to visit_records
-- ============================================================================

ALTER TABLE public.visit_records ADD COLUMN IF NOT EXISTS red_flags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.visit_records ADD COLUMN IF NOT EXISTS medication_changes jsonb NOT NULL DEFAULT '[]'::jsonb;
