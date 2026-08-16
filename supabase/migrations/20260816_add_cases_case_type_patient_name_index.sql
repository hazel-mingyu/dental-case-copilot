BEGIN;

-- Speed up the existing duplicate-case lookup without changing its semantics.
CREATE INDEX IF NOT EXISTS cases_case_type_patient_name_idx
  ON public.cases (case_type, patient_name);

COMMIT;
