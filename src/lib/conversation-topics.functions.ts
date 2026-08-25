import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractSnippet } from "@/search/utils/snippet";
import { CTI_ENGINE_CONFIG } from "@/semantic/conversation-topics/engine/config";
import { topicScore } from "@/semantic/conversation-topics/engine/scoreTopics";

export type ConversationTopicEvidenceView = {
  messageId: string;
  similarity: number;
  snapshot: string;
  createdAt: string;
};

export type ConversationTopicView = {
  id: string;
  name: string;
  description: string | null;
  score: number;
  lastSeenAt: string;
  isCurrent: boolean;
  evidences: ConversationTopicEvidenceView[];
};

async function getCurrentWorkspaceUser(workspaceId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("workspace_users")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Not a member of this workspace");
  return data.id as string;
}

async function assertParticipant(conversationId: string, userId: string) {
  const { data: conv, error: cErr } = await supabaseAdmin
    .from("conversations")
    .select("id, workspace_id, current_topic_id")
    .eq("id", conversationId)
    .single();
  if (cErr || !conv) throw new Error("Conversation not found");
  const meWuId = await getCurrentWorkspaceUser(conv.workspace_id as string, userId);
  const { data: part } = await supabaseAdmin
    .from("conversation_participants")
    .select("workspace_user_id")
    .eq("conversation_id", conversationId)
    .eq("workspace_user_id", meWuId)
    .maybeSingle();
  if (!part) throw new Error("Not a participant of this conversation");
  return {
    currentTopicId: (conv.current_topic_id as string | null) ?? null,
  };
}

export const listConversationTopics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ConversationTopicView[]> => {
    const { currentTopicId } = await assertParticipant(
      data.conversationId,
      context.userId,
    );

    const { data: topicRows, error: topicError } = await supabaseAdmin
      .from("conversation_topics")
      .select("id, name, description, historical_weight, last_seen_at")
      .eq("conversation_id", data.conversationId)
      .eq("is_candidate", false);
    if (topicError) throw new Error(topicError.message);
    if (!topicRows || topicRows.length === 0) return [];

    const { data: evidenceRows, error: evidenceError } = await supabaseAdmin
      .from("conversation_topic_evidences")
      .select("topic_id, message_id, similarity, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (evidenceError) throw new Error(evidenceError.message);

    const messageIds = Array.from(
      new Set((evidenceRows ?? []).map((row) => row.message_id as string)),
    );

    const normalizedByMessageId = new Map<string, string>();
    if (messageIds.length > 0) {
      const { data: semantics, error: semanticsError } = await supabaseAdmin
        .from("message_semantics")
        .select("message_id, normalized_text")
        .in("message_id", messageIds);
      if (semanticsError) throw new Error(semanticsError.message);
      for (const row of semantics ?? []) {
        const text = row.normalized_text as string | null;
        if (text) normalizedByMessageId.set(row.message_id as string, text);
      }
    }

    const evidencesByTopicId = new Map<string, ConversationTopicEvidenceView[]>();
    for (const row of evidenceRows ?? []) {
      const topicId = row.topic_id as string;
      const messageId = row.message_id as string;
      const normalized = normalizedByMessageId.get(messageId) ?? "";
      const list = evidencesByTopicId.get(topicId) ?? [];
      list.push({
        messageId,
        similarity: row.similarity as number,
        snapshot: normalized ? extractSnippet(normalized, "") : "Message",
        createdAt: row.created_at as string,
      });
      evidencesByTopicId.set(topicId, list);
    }

    const now = new Date();
    const halfLife = CTI_ENGINE_CONFIG.CONVERSATION_TOPIC_SCORE_HALF_LIFE_HOURS;

    return topicRows.map((row) => {
      const lastSeenAt = row.last_seen_at as string;
      return {
        id: row.id as string,
        name: (row.name as string | null) ?? "Untitled topic",
        description: (row.description as string | null) ?? null,
        score: topicScore(
          row.historical_weight as number,
          new Date(lastSeenAt),
          now,
          halfLife,
        ),
        lastSeenAt,
        isCurrent: row.id === currentTopicId,
        evidences: evidencesByTopicId.get(row.id as string) ?? [],
      };
    });
  });
