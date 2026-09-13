/**
 * Server-only repository for canonical_topic_jobs rows.
 *
 * Uses the admin client (RLS bypassed) because the canonicalization
 * pipeline is a backend concern.
 */

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function markCanonicalTopicJobQuarantined(
  id: string,
  lastError: string,
): Promise<void> {
  const supabase = await getAdmin();

  const { error } = await supabase
    .from("canonical_topic_jobs")
    .update({
      status: "QUARANTINED",
      last_error: lastError,
      started_at: null,
      next_retry_at: null,
    })
    .eq("id", id);

  if (error) throw error;
}

export async function markCanonicalTopicJobRetryWait(
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
    .from("canonical_topic_jobs")
    .update(payload as never)
    .eq("id", id);

  if (error) throw error;
}
