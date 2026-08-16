/**
 * Server-only repository for conversation_topic_jobs rows.
 *
 * Uses the admin client (RLS bypassed) because the CTI pipeline is a
 * backend concern.
 */

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function markConversationTopicJobQuarantined(
  id: string,
  lastError: string,
): Promise<void> {
  const supabase = await getAdmin();

  const { error } = await supabase
    .from("conversation_topic_jobs")
    .update({
      status: "QUARANTINED",
      last_error: lastError,
      processing_started_at: null,
      next_retry_at: null,
    })
    .eq("id", id);

  if (error) throw error;
}

export async function markConversationTopicJobRetryWait(
  id: string,
  params: {
    nextRetryAt: Date;
    lastError: string;
    attemptCount?: number;
  },
): Promise<void> {
  const supabase = await getAdmin();

  const payload: Record<string, unknown> = {
    status: "RETRY_WAIT",
    next_retry_at: params.nextRetryAt.toISOString(),
    last_error: params.lastError,
    processing_started_at: null,
  };

  if (params.attemptCount !== undefined) {
    payload.attempt_count = params.attemptCount;
  }

  const { error } = await supabase
    .from("conversation_topic_jobs")
    .update(payload as never)
    .eq("id", id);

  if (error) throw error;
}
