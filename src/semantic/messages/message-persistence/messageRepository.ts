/**
 * Server-only repository for message rows used by the scoring pipeline.
 *
 * Uses the admin client (RLS bypassed). supabaseAdmin is loaded inside each
 * function so this module can be imported from client-reachable graphs without
 * leaking the service-role client into the browser bundle.
 */

export type MessageRecord = {
  id: string;
  rawText: string;
  authorWorkspaceUserId: string | null;
  createdAt: string;
};

export type MessageWithPriorContext = {
  anchor: MessageRecord;
  conversationId: string;
  priorMessages: MessageRecord[];
};

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function findMessageWithPriorContext(
  messageId: string,
  priorLimit = 4,
): Promise<MessageWithPriorContext | null> {
  const supabase = await getAdmin();

  const { data: anchor, error: anchorError } = await supabase
    .from("messages")
    .select("id, raw_text, author_workspace_user_id, created_at, conversation_id, purged_at")
    .eq("id", messageId)
    .maybeSingle();

  if (anchorError) throw anchorError;
  if (!anchor) return null;
  if (anchor.purged_at) return null;

  const { data: priorDesc, error: priorError } = await supabase
    .from("messages")
    .select("id, raw_text, author_workspace_user_id, created_at")
    .eq("conversation_id", anchor.conversation_id)
    .is("purged_at", null)
    .lt("created_at", anchor.created_at)
    .order("created_at", { ascending: false })
    .limit(priorLimit);

  if (priorError) throw priorError;

  const priorMessages = [...(priorDesc ?? [])].reverse().map((message) => ({
    id: message.id,
    rawText: message.raw_text,
    authorWorkspaceUserId: message.author_workspace_user_id,
    createdAt: message.created_at,
  }));

  return {
    anchor: {
      id: anchor.id,
      rawText: anchor.raw_text,
      authorWorkspaceUserId: anchor.author_workspace_user_id,
      createdAt: anchor.created_at,
    },
    conversationId: anchor.conversation_id,
    priorMessages,
  };
}
