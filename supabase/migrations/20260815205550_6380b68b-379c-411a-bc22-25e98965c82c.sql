REVOKE ALL ON FUNCTION public.claim_conversation_topic_job(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_conversation_topic_job(interval) TO service_role;