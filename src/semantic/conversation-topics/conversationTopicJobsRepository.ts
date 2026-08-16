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

export async function markConversationTopicJobFailed(
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
    })
    .eq("id", id);

  if (error) throw error;
}

export async function requeueConversationTopicJobForRetry(
  id: string,
  params: { nextRetryAt: Date; lastError: string },
): Promise<void> {
  const supabase = await getAdmin();

  const { error } = await supabase
    .from("conversation_topic_jobs")
    .update({
      status: "QUEUED",
      next_retry_at: params.nextRetryAt.toISOString(),
      last_error: params.lastError,
      processing_started_at: null,
    })
    .eq("id", id);

  if (error) throw error;
}
