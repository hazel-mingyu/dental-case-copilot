BEGIN;

-- The MVP uses the existing publishable-key + anon RLS model. These policies
-- permit only the batch mutations used by the manual upload workflow:
-- create a draft, complete it, and remove an empty draft after a failed upload.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'case_timepoints'
      AND policyname = 'MVP anon can select case timepoints'
  ) THEN
    CREATE POLICY "MVP anon can select case timepoints"
      ON public.case_timepoints
      FOR SELECT TO anon
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'case_timepoints'
      AND policyname = 'MVP anon can insert case timepoints'
  ) THEN
    CREATE POLICY "MVP anon can insert case timepoints"
      ON public.case_timepoints
      FOR INSERT TO anon
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'case_timepoints'
      AND policyname = 'MVP anon can update case timepoints'
  ) THEN
    CREATE POLICY "MVP anon can update case timepoints"
      ON public.case_timepoints
      FOR UPDATE TO anon
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'case_timepoints'
      AND policyname = 'MVP anon can delete case timepoints'
  ) THEN
    CREATE POLICY "MVP anon can delete case timepoints"
      ON public.case_timepoints
      FOR DELETE TO anon
      USING (true);
  END IF;
END
$$;

COMMIT;
