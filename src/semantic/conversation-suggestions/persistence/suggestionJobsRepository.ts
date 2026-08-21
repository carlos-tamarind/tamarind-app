import type { Database } from "@/integrations/supabase/types";

import type {
  ApplyConversationSuggestionResult,
  ConversationSuggestionJob,
  EnqueueConversationSuggestionResult,
} from "../types/job";

export type DueSuggestionJobPair =
  Database["public"]["Functions"]["list_conversation_suggestion_jobs_due"]["Returns"][number];

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function listConversationSuggestionJobsDue(
  idle: string,
  cooldown: string,
  limit: number,
): Promise<DueSuggestionJobPair[]> {
  const supabase = await getAdmin();
  const { data, error } = await supabase.rpc("list_conversation_suggestion_jobs_due", {
    p_idle: idle,
    p_cooldown: cooldown,
    p_limit: limit,
  });
  if (error) throw error;
  return data ?? [];
}

export async function enqueueConversationSuggestionJob(
  conversationId: string,
  workspaceUserId: string,
): Promise<EnqueueConversationSuggestionResult> {
  const supabase = await getAdmin();
  const { data, error } = await supabase.rpc("enqueue_conversation_suggestion_job", {
    p_conversation_id: conversationId,
    p_workspace_user_id: workspaceUserId,
  });
  if (error) throw error;

  if (data === "enqueued" || data === "requeued" || data === "processing" || data === "not_found") {
    return data;
  }
  throw new Error(`Unexpected enqueue_conversation_suggestion_job result: ${String(data)}`);
}

export async function applyConversationSuggestionResult(params: {
  jobId: string;
  entityId?: string | null;
  conversationTopicId?: string | null;
  entitySimilarityScore?: number | null;
  llmConfidence?: number | null;
  reason?: string | null;
  notificationText?: string | null;
  expiresAt?: string | null;
}): Promise<ApplyConversationSuggestionResult> {
  const supabase = await getAdmin();
  const { data, error } = await supabase.rpc("apply_conversation_suggestion_result", {
    p_job_id: params.jobId,
    p_entity_id: params.entityId ?? undefined,
    p_conversation_topic_id: params.conversationTopicId ?? undefined,
    p_entity_similarity_score: params.entitySimilarityScore ?? undefined,
    p_llm_confidence: params.llmConfidence ?? undefined,
    p_reason: params.reason ?? undefined,
    p_notification_text: params.notificationText ?? undefined,
    p_expires_at: params.expiresAt ?? undefined,
  });
  if (error) throw error;

  if (
    data === "committed" ||
    data === "committed_none" ||
    data === "already_pending" ||
    data === "not_processing" ||
    data === "not_found"
  ) {
    return data;
  }
  throw new Error(`Unexpected apply_conversation_suggestion_result result: ${String(data)}`);
}

export async function markConversationSuggestionJobFailed(
  id: string,
  lastError: string,
): Promise<void> {
  const supabase = await getAdmin();
  const { error } = await supabase
    .from("conversation_suggestion_jobs")
    .update({
      status: "FAILED",
      last_error: lastError,
      started_at: null,
      next_retry_at: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function markConversationSuggestionJobRetryWait(
  id: string,
  params: {
    nextRetryAt: Date;
    lastError: string;
    attempts?: number;
  },
): Promise<void> {
  const supabase = await getAdmin();
  const payload: Record<string, unknown> = {
    status: "RETRY_WAIT",
    next_retry_at: params.nextRetryAt.toISOString(),
    last_error: params.lastError,
    started_at: null,
  };
  if (params.attempts !== undefined) {
    payload.attempts = params.attempts;
  }
  const { error } = await supabase
    .from("conversation_suggestion_jobs")
    .update(payload as never)
    .eq("id", id);
  if (error) throw error;
}

export type { ConversationSuggestionJob };
