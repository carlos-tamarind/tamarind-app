CREATE TYPE public.conversation_type AS ENUM ('direct', 'group', 'channel');

ALTER TABLE public.conversations
  ADD COLUMN type public.conversation_type NOT NULL DEFAULT 'direct',
  ADD COLUMN image_url text;

UPDATE public.conversations c
SET type = CASE
  WHEN (SELECT count(*) FROM public.conversation_participants cp WHERE cp.conversation_id = c.id) > 2 THEN 'group'::public.conversation_type
  ELSE 'direct'::public.conversation_type
END;

ALTER TABLE public.messages REPLICA IDENTITY FULL;