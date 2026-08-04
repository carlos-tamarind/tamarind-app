ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz NOT NULL DEFAULT now();

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_pages_title_trgm
  ON public.pages USING gin (title extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pages_content_trgm
  ON public.pages USING gin (plain_text extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_messages_normalized_trgm
  ON public.message_semantics USING gin (normalized_text extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_conversations_title_trgm
  ON public.conversations USING gin (title extensions.gin_trgm_ops);