BEGIN;

CREATE TABLE IF NOT EXISTS public.vision_inference_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES public.case_images(id) ON DELETE CASCADE,
  prediction_id uuid NULL REFERENCES public.image_predictions(id) ON DELETE SET NULL,
  model text NOT NULL,
  predictor_version text NOT NULL,
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  success boolean NOT NULL,
  error_type text NULL CHECK (
    error_type IS NULL OR error_type IN (
      'timeout',
      'provider_error',
      'validation_error',
      'prediction_persist_error'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (success = true AND prediction_id IS NOT NULL AND error_type IS NULL)
    OR
    (success = false AND prediction_id IS NULL AND error_type IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS vision_inference_runs_image_id_created_at_idx
  ON public.vision_inference_runs (image_id, created_at DESC);

ALTER TABLE public.vision_inference_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MVP anon can insert vision inference runs"
  ON public.vision_inference_runs
  FOR INSERT
  TO anon
  WITH CHECK (true);

COMMIT;
