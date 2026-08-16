import type {
  InsertMessageSemanticsInput,
  MessageSemantics,
  UpdateMessageSemanticsInput,
} from "./types";

/**
 * Server-only repository for message_semantics rows.
 *
 * Uses the admin client (RLS bypassed) because the embedding pipeline is a
 * backend concern. supabaseAdmin is loaded inside each function so this
 * module can be imported from client-reachable graphs without leaking the
 * service-role client into the browser bundle.
 */

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function insertMessageSemantics(
  input: InsertMessageSemanticsInput,
): Promise<MessageSemantics> {
  const supabase = await getAdmin();
  const payload: Record<string, unknown> = {
    message_id: input.message_id,
    normalized_text: input.normalized_text,
    checksum: input.checksum,
  };
  if (input.language !== undefined) payload.language = input.language;
  if (input.quality_score !== undefined) payload.quality_score = input.quality_score;
  if (input.processable !== undefined) payload.processable = input.processable;
  if (input.embedding_status !== undefined) payload.embedding_status = input.embedding_status;

  const { data, error } = await supabase
    .from("message_semantics")
    .insert(payload as never)
    .select("*")
    .single();

  if (error) throw error;
  return data as MessageSemantics;
}

export async function findMessageSemanticsByMessageId(
  messageId: string,
): Promise<MessageSemantics | null> {
  const supabase = await getAdmin();
  const { data, error } = await supabase
    .from("message_semantics")
    .select("*")
    .eq("message_id", messageId)
    .maybeSingle();

  if (error) throw error;
  return (data as MessageSemantics | null) ?? null;
}

export async function findMessageSemanticsByChecksum(
  checksum: string,
): Promise<MessageSemantics | null> {
  const supabase = await getAdmin();
  const { data, error } = await supabase
    .from("message_semantics")
    .select("*")
    .eq("checksum", checksum)
    .maybeSingle();

  if (error) throw error;
  return (data as MessageSemantics | null) ?? null;
}

export async function updateMessageSemantics(
  id: string,
  input: UpdateMessageSemanticsInput,
): Promise<void> {
  const supabase = await getAdmin();
  const payload: Record<string, unknown> = {};

  if (input.embedding_status !== undefined) {
    payload.embedding_status = input.embedding_status;
  }
  if (input.last_error !== undefined) payload.last_error = input.last_error;
  if (input.last_processed_at !== undefined) {
    payload.last_processed_at = input.last_processed_at;
  }
  if (input.retry_count !== undefined) payload.retry_count = input.retry_count;
  if (input.next_retry_at !== undefined) payload.next_retry_at = input.next_retry_at;

  const { error } = await supabase
    .from("message_semantics")
    .update(payload as never)
    .eq("id", id);

  if (error) throw error;
}

export async function markMessageSemanticsEmbedded(id: string): Promise<void> {
  await updateMessageSemantics(id, {
    embedding_status: "EMBEDDED",
    last_error: null,
    last_processed_at: new Date().toISOString(),
  });
}

/** Marks semantics EMBEDDED and enqueues a CTI job in one DB transaction. */
export async function finalizeEmbeddedMessage(messageSemanticsId: string): Promise<void> {
  const supabase = await getAdmin();

  const { error } = await supabase.rpc("finalize_embedded_message", {
    p_message_semantics_id: messageSemanticsId,
  });

  if (error) throw error;
}

export async function markMessageSemanticsFailed(id: string, lastError: string): Promise<void> {
  await updateMessageSemantics(id, {
    embedding_status: "FAILED",
    last_error: lastError,
    last_processed_at: new Date().toISOString(),
  });
}

export async function requeueMessageSemanticsForRetry(
  id: string,
  params: { retryCount: number; nextRetryAt: Date; lastError: string },
): Promise<void> {
  await updateMessageSemantics(id, {
    embedding_status: "QUEUED",
    retry_count: params.retryCount,
    next_retry_at: params.nextRetryAt.toISOString(),
    last_error: params.lastError,
  });
}
