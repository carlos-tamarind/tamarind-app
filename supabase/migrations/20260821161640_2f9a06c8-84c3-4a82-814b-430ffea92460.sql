-- Enums
CREATE TYPE public.conversation_suggestion_status AS ENUM ('PENDING', 'SHOWN', 'EXPIRED');
CREATE TYPE public.conversation_suggestion_feedback AS ENUM ('positive', 'negative');
CREATE TYPE public.conversation_suggestion_job_status AS ENUM ('QUEUED', 'PROCESSING', 'RETRY_WAIT', 'COMPLETED', 'FAILED');

-- Result rows
CREATE TABLE public.conversation_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  workspace_user_id uuid NOT NULL REFERENCES public.workspace_users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  conversation_topic_id uuid NOT NULL,
  status public.conversation_suggestion_status NOT NULL DEFAULT 'PENDING',
  entity_similarity_score real NOT NULL,
  llm_confidence real NOT NULL,
  reason text NOT NULL,
  notification_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  shown_at timestamptz,
  clicked_at timestamptz,
  dismissed_at timestamptz,
  feedback_at timestamptz,
  feedback_type public.conversation_suggestion_feedback,
  CONSTRAINT conversation_suggestions_participant_fkey
    FOREIGN KEY (conversation_id, workspace_user_id)
    REFERENCES public.conversation_participants(conversation_id, workspace_user_id) ON DELETE CASCADE,
  CONSTRAINT conversation_suggestions_topic_fkey
    FOREIGN KEY (conversation_topic_id, conversation_id)
    REFERENCES public.conversation_topics(id, conversation_id) ON DELETE CASCADE,
  CONSTRAINT conversation_suggestions_similarity_range CHECK (entity_similarity_score BETWEEN 0 AND 1),
  CONSTRAINT conversation_suggestions_confidence_range CHECK (llm_confidence BETWEEN 0 AND 1),
  CONSTRAINT conversation_suggestions_shown_after_created CHECK (shown_at IS NULL OR shown_at >= created_at),
  CONSTRAINT conversation_suggestions_clicked_requires_shown CHECK (clicked_at IS NULL OR shown_at IS NOT NULL),
  CONSTRAINT conversation_suggestions_dismissed_requires_shown CHECK (dismissed_at IS NULL OR shown_at IS NOT NULL),
  CONSTRAINT conversation_suggestions_feedback_requires_shown CHECK (feedback_at IS NULL OR shown_at IS NOT NULL),
  CONSTRAINT conversation_suggestions_feedback_pair CHECK ((feedback_at IS NULL) = (feedback_type IS NULL))
);

CREATE UNIQUE INDEX uniq_conversation_suggestions_pending
  ON public.conversation_suggestions (workspace_user_id, conversation_id)
  WHERE status = 'PENDING';
CREATE INDEX idx_conversation_suggestions_target_backoff
  ON public.conversation_suggestions (workspace_user_id, conversation_id, entity_id, created_at DESC);
CREATE INDEX idx_conversation_suggestions_cooldown
  ON public.conversation_suggestions (workspace_user_id, conversation_id, feedback_type, feedback_at DESC);
CREATE INDEX idx_conversation_suggestions_conversation_status
  ON public.conversation_suggestions (conversation_id, status);
CREATE INDEX idx_conversation_suggestions_expires_at
  ON public.conversation_suggestions (expires_at);
CREATE INDEX idx_conversation_suggestions_entity
  ON public.conversation_suggestions (entity_id);

CREATE TRIGGER trg_conversation_suggestions_last_modified
  BEFORE UPDATE ON public.conversation_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified_at();

GRANT SELECT, UPDATE ON public.conversation_suggestions TO authenticated;
GRANT ALL ON public.conversation_suggestions TO service_role;

ALTER TABLE public.conversation_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their suggestions"
  ON public.conversation_suggestions FOR SELECT TO authenticated
  USING (
    workspace_user_id = public.current_workspace_user_id(workspace_id)
    AND public.is_conversation_participant(conversation_id)
  );

CREATE POLICY "Owners update their suggestions"
  ON public.conversation_suggestions FOR UPDATE TO authenticated
  USING (
    workspace_user_id = public.current_workspace_user_id(workspace_id)
    AND public.is_conversation_participant(conversation_id)
  )
  WITH CHECK (
    workspace_user_id = public.current_workspace_user_id(workspace_id)
    AND public.is_conversation_participant(conversation_id)
  );

-- Queue
CREATE TABLE public.conversation_suggestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  workspace_user_id uuid NOT NULL REFERENCES public.workspace_users(id) ON DELETE CASCADE,
  status public.conversation_suggestion_job_status NOT NULL DEFAULT 'QUEUED',
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_suggestion_jobs_participant_fkey
    FOREIGN KEY (conversation_id, workspace_user_id)
    REFERENCES public.conversation_participants(conversation_id, workspace_user_id) ON DELETE CASCADE,
  CONSTRAINT conversation_suggestion_jobs_unique_pair UNIQUE (conversation_id, workspace_user_id),
  CONSTRAINT conversation_suggestion_jobs_attempts_nonneg CHECK (attempts >= 0)
);

CREATE INDEX idx_conversation_suggestion_jobs_claimable
  ON public.conversation_suggestion_jobs (next_retry_at, created_at)
  WHERE status IN ('QUEUED', 'RETRY_WAIT');
CREATE INDEX idx_conversation_suggestion_jobs_stale
  ON public.conversation_suggestion_jobs (started_at)
  WHERE status = 'PROCESSING';

CREATE TRIGGER trg_conversation_suggestion_jobs_last_modified
  BEFORE UPDATE ON public.conversation_suggestion_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified_at();

GRANT SELECT ON public.conversation_suggestion_jobs TO authenticated;
GRANT ALL ON public.conversation_suggestion_jobs TO service_role;

ALTER TABLE public.conversation_suggestion_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their suggestion jobs"
  ON public.conversation_suggestion_jobs FOR SELECT TO authenticated
  USING (
    workspace_user_id = public.current_workspace_user_id(workspace_id)
    AND public.is_conversation_participant(conversation_id)
  );