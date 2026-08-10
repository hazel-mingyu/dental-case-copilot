BEGIN;

-- DentCase Flow Phase 1.2
-- Patient-oriented Case Workflow
--
-- This is a one-time versioned migration.
--
-- Preserves:
--   - all existing cases data
--   - all existing case_images data
--   - public.create_case RPC
--   - private.case_daily_counters
--   - existing RLS policies
--
-- Does not:
--   - create patients table
--   - create unique indexes
--   - modify create_case
--   - modify private.case_daily_counters
--   - modify RLS

ALTER TABLE public.cases
  ADD COLUMN patient_name text NULL;

ALTER TABLE public.cases
  ADD COLUMN patient_phone text NULL;

COMMIT;
