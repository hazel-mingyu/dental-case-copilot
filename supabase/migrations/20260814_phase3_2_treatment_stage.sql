BEGIN;

-- Reuse case_timepoints.stage for Phase 3.2 treatment-stage semantics.
-- Historical values are deliberately preserved: no automatic inference.
ALTER TABLE public.case_timepoints
  DROP CONSTRAINT IF EXISTS case_timepoints_stage_check;

-- Coerce a possible legacy enum to text before allowing the new values.
-- This preserves every existing value and avoids assigning a treatment meaning
-- to historical baseline/progress/final/follow_up/unknown records.
ALTER TABLE public.case_timepoints
  ALTER COLUMN stage DROP DEFAULT;

ALTER TABLE public.case_timepoints
  ALTER COLUMN stage TYPE text USING stage::text;

ALTER TABLE public.case_timepoints
  ALTER COLUMN stage DROP NOT NULL;

ALTER TABLE public.case_timepoints
  ADD CONSTRAINT case_timepoints_stage_check
  CHECK (stage IS NULL OR stage IN ('baseline', 'progress', 'final', 'follow_up', 'unknown', 'initial', 'ongoing', 'completed'));

COMMIT;
