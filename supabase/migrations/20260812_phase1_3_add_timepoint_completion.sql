BEGIN;

-- A timepoint is an upload batch. Existing timepoints predate draft support
-- and are therefore preserved as completed historical batches.
ALTER TABLE public.case_timepoints
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

UPDATE public.case_timepoints
SET completed_at = created_at
WHERE completed_at IS NULL;

COMMIT;
