BEGIN;

-- Keep case_summaries on the existing MVP publishable-key + anon RLS model.
ALTER TABLE public.case_summaries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'case_summaries'
      AND policyname = 'MVP anon can select case summaries'
  ) THEN
    CREATE POLICY "MVP anon can select case summaries"
      ON public.case_summaries
      FOR SELECT TO anon
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'case_summaries'
      AND policyname = 'MVP anon can insert case summaries'
  ) THEN
    CREATE POLICY "MVP anon can insert case summaries"
      ON public.case_summaries
      FOR INSERT TO anon
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'case_summaries'
      AND policyname = 'MVP anon can update case summaries'
  ) THEN
    CREATE POLICY "MVP anon can update case summaries"
      ON public.case_summaries
      FOR UPDATE TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

COMMIT;
