REVOKE ALL ON FUNCTION public.pinned_entities_validate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unpin_on_conversation_participant_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unpin_on_page_collaborator_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unpin_on_page_access_change() FROM PUBLIC, anon, authenticated;