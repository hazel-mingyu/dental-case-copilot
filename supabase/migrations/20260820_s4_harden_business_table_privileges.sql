BEGIN;

REVOKE ALL ON TABLE public.cases FROM anon, authenticated;
REVOKE ALL ON TABLE public.case_timepoints FROM anon, authenticated;
REVOKE ALL ON TABLE public.case_images FROM anon, authenticated;
REVOKE ALL ON TABLE public.case_voice_notes FROM anon, authenticated;
REVOKE ALL ON TABLE public.case_summaries FROM anon, authenticated;
REVOKE ALL ON TABLE public.image_reviews FROM anon, authenticated;
REVOKE ALL ON TABLE public.image_predictions FROM anon, authenticated;
REVOKE ALL ON TABLE public.vision_inference_runs FROM anon, authenticated;

GRANT SELECT, UPDATE, DELETE ON TABLE public.cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.case_timepoints TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.case_images TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.case_voice_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.case_summaries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.image_reviews TO authenticated;
GRANT SELECT ON TABLE public.image_predictions TO authenticated;

REVOKE ALL ON FUNCTION public.create_case(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_daily_api_quota(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_access_case_image(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dentcase_set_updated_at() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_case(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_daily_api_quota(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_case_image(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dentcase_set_updated_at() TO authenticated;

COMMIT;
