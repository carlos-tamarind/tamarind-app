REVOKE ALL ON FUNCTION public.validate_canonical_topic_evidence() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_page_topic_canonical_job() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_conversation_topic_canonical_job() FROM PUBLIC, anon, authenticated;