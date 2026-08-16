BEGIN;

-- Preserve review state consistency while allowing manual-only production
-- labels. A reviewed row may refer to an AI prediction (historical lineage)
-- or may deliberately have no reviewed_prediction_id (manual-only workflow).
ALTER TABLE public.image_reviews
  DROP CONSTRAINT IF EXISTS image_reviews_state_check;

ALTER TABLE public.image_reviews
  ADD CONSTRAINT image_reviews_state_check
  CHECK (
    (
      review_status = 'pending'
      AND view_label IS NULL
      AND reviewed_prediction_id IS NULL
      AND reviewed_at IS NULL
    )
    OR
    (
      review_status = 'reviewed'
      AND view_label IS NOT NULL
      AND reviewed_at IS NOT NULL
    )
  );

COMMIT;
