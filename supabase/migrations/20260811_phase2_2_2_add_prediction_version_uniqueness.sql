BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS image_predictions_image_predictor_taxonomy_key
  ON public.image_predictions (image_id, predictor_version, taxonomy_version);

COMMIT;
