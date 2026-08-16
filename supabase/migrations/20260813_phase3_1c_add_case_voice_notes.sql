BEGIN;

CREATE TABLE IF NOT EXISTS public.case_voice_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  timepoint_id uuid NOT NULL REFERENCES public.case_timepoints(id) ON DELETE CASCADE,
  raw_transcript text NOT NULL,
  confirmed_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_voice_notes_timepoint_created_at_idx
  ON public.case_voice_notes(timepoint_id, created_at);

ALTER TABLE public.case_voice_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'case_voice_notes' AND policyname = 'MVP anon can select case voice notes') THEN
    CREATE POLICY "MVP anon can select case voice notes" ON public.case_voice_notes FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'case_voice_notes' AND policyname = 'MVP anon can insert case voice notes') THEN
    CREATE POLICY "MVP anon can insert case voice notes" ON public.case_voice_notes FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'case_voice_notes' AND policyname = 'MVP anon can update case voice notes') THEN
    CREATE POLICY "MVP anon can update case voice notes" ON public.case_voice_notes FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'case_voice_notes' AND policyname = 'MVP anon can delete case voice notes') THEN
    CREATE POLICY "MVP anon can delete case voice notes" ON public.case_voice_notes FOR DELETE TO anon USING (true);
  END IF;
END
$$;

COMMIT;
