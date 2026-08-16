BEGIN;

ALTER TABLE public.case_summaries
  ADD COLUMN IF NOT EXISTS input_fingerprint text NULL;

COMMIT;
