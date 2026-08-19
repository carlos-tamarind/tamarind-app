REVOKE ALL ON FUNCTION public.enqueue_page_topic_embedding() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_page_topic_embedding() TO service_role;
REVOKE ALL ON FUNCTION public.set_page_topic_embeddings_updated_at() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_page_topic_embeddings_updated_at() TO service_role;