-- ============================================================================
-- 002_document_summaries.sql
-- Add extracted_summary column for compact document representation
-- ============================================================================

ALTER TABLE public.documents ADD COLUMN extracted_summary text;
