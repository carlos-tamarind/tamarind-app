import type { InsertMessageSemanticsInput, MessageSemantics } from "./types";

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

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export async function insertMessageSemantics(
  input: InsertMessageSemanticsInput,
): Promise<MessageSemantics> {
  const supabase = await getAdmin();
  const payload = stripUndefined({
    message_id: input.message_id,
    normalized_text: input.normalized_text,
    checksum: input.checksum,
    language: input.language,
    quality_score: input.quality_score,
    processable: input.processable,
    embedding_status: input.embedding_status,
  });

  const { data, error } = await supabase
    .from("message_semantics")
    .insert(payload)
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
