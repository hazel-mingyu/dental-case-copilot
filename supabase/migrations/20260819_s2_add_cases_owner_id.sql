BEGIN;

-- Phase S2, stage 1: establish the case owner field without assigning data.
-- Backfill and NOT NULL are deliberately separate, operator-confirmed steps.
ALTER TABLE public.cases
  ADD COLUMN owner_id uuid NULL REFERENCES auth.users(id);

CREATE INDEX cases_owner_id_idx
  ON public.cases(owner_id);

COMMIT;
