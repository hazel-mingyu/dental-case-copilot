BEGIN;

-- DentCase Flow Phase 1.2-D
-- Add nullable patient birth year.
--
-- Does not create patients, patient_id, age, first_visit_at,
-- last_visit_at, or any new RLS policy.

ALTER TABLE public.cases
  ADD COLUMN birth_year integer NULL;

COMMIT;
