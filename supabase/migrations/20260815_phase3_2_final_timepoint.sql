BEGIN;

-- Final-state workflow: completed_at means this upload batch is complete;
-- is_final independently means this is the case's final photo record.
ALTER TABLE public.case_timepoints
  ADD COLUMN IF NOT EXISTS is_final boolean NOT NULL DEFAULT false;

-- At most one active final photo record may exist per case.
CREATE UNIQUE INDEX IF NOT EXISTS case_timepoints_one_final_per_case
  ON public.case_timepoints (case_id)
  WHERE is_final = true;

COMMIT;
