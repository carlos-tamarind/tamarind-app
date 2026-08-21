import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CONVERSATION_SUGGESTION_ENGINE_CONFIG } from "@/semantic/conversation-suggestions/engine/config";

const ALLOWED_ENTITY_TYPES = new Set(["message", "page_chunk"]);

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
    meWuId,
    workspaceId: conv.workspace_id as string,
    currentTopicId: (conv.current_topic_id as string | null) ?? null,
  };
}

async function loadOwnedSuggestion(params: {
  suggestionId: string;
  workspaceUserId: string;
  conversationId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("conversation_suggestions")
    .select("id, status, shown_at, feedback_type")
    .eq("id", params.suggestionId)
    .eq("workspace_user_id", params.workspaceUserId)
    .eq("conversation_id", params.conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Suggestion not found");
  return data;
}

export type PendingConversationSuggestion = {
  id: string;
  conversationId: string;
  entityId: string;
  entityType: "message" | "page_chunk";
  notificationText: string;
  targetConversationId: string | null;
  pageId: string | null;
  delayAfterOpenMs: number;
};

export const getPendingConversationSuggestion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<PendingConversationSuggestion | null> => {
    const { meWuId, currentTopicId } = await assertParticipant(data.conversationId, context.userId);
    if (!currentTopicId) return null;

    const { data: row, error } = await supabaseAdmin
      .from("conversation_suggestions")
      .select("id, conversation_id, entity_id, notification_text, conversation_topic_id")
      .eq("conversation_id", data.conversationId)
      .eq("workspace_user_id", meWuId)
      .eq("status", "PENDING")
      .eq("conversation_topic_id", currentTopicId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    const { data: entity, error: entityError } = await supabaseAdmin
      .from("entities")
      .select("id, entity_type_id")
      .eq("id", row.entity_id)
      .maybeSingle();
    if (entityError) throw new Error(entityError.message);
    if (!entity) return null;

    const { data: entityType, error: typeError } = await supabaseAdmin
      .from("entity_types")
      .select("key")
      .eq("id", entity.entity_type_id)
      .maybeSingle();
    if (typeError) throw new Error(typeError.message);
    const key = entityType?.key ?? null;
    if (!key || !ALLOWED_ENTITY_TYPES.has(key)) return null;

    let pageId: string | null = null;
    let targetConversationId: string | null = null;

    if (key === "page_chunk") {
      const { data: chunk, error: chunkError } = await supabaseAdmin
        .from("page_chunks")
        .select("page_id")
        .eq("id", row.entity_id)
        .maybeSingle();
      if (chunkError) throw new Error(chunkError.message);
      pageId = (chunk?.page_id as string | undefined) ?? null;
      if (!pageId) return null;
    } else {
      const { data: message, error: messageError } = await supabaseAdmin
        .from("messages")
        .select("conversation_id")
        .eq("id", row.entity_id)
        .maybeSingle();
      if (messageError) throw new Error(messageError.message);
      targetConversationId = (message?.conversation_id as string | undefined) ?? null;
      if (!targetConversationId) return null;
    }

    return {
      id: row.id,
      conversationId: row.conversation_id,
      entityId: row.entity_id,
      entityType: key as "message" | "page_chunk",
      notificationText: row.notification_text,
      targetConversationId,
      pageId,
      delayAfterOpenMs:
        CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_DELAY_AFTER_CONVERSATION_REOPEN_MS,
    };
  });

export const markConversationSuggestionShown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        suggestionId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { meWuId } = await assertParticipant(data.conversationId, context.userId);
    const row = await loadOwnedSuggestion({
      suggestionId: data.suggestionId,
      workspaceUserId: meWuId,
      conversationId: data.conversationId,
    });
    if (row.status !== "PENDING" && row.status !== "SHOWN") {
      throw new Error("Suggestion can no longer be shown");
    }
    if (row.status === "SHOWN") return { ok: true as const };

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("conversation_suggestions")
      .update({ status: "SHOWN", shown_at: now })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const markConversationSuggestionClicked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        suggestionId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { meWuId } = await assertParticipant(data.conversationId, context.userId);
    const row = await loadOwnedSuggestion({
      suggestionId: data.suggestionId,
      workspaceUserId: meWuId,
      conversationId: data.conversationId,
    });
    if (row.status !== "SHOWN" || !row.shown_at) {
      throw new Error("Suggestion has not been shown");
    }
    const { error } = await supabaseAdmin
      .from("conversation_suggestions")
      .update({ clicked_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const markConversationSuggestionDismissed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        suggestionId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { meWuId } = await assertParticipant(data.conversationId, context.userId);
    const row = await loadOwnedSuggestion({
      suggestionId: data.suggestionId,
      workspaceUserId: meWuId,
      conversationId: data.conversationId,
    });
    if (row.status !== "SHOWN" || !row.shown_at) {
      throw new Error("Suggestion has not been shown");
    }
    const { error } = await supabaseAdmin
      .from("conversation_suggestions")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const submitConversationSuggestionFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        suggestionId: z.string().uuid(),
        feedbackType: z.enum(["positive", "negative"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { meWuId } = await assertParticipant(data.conversationId, context.userId);
    const row = await loadOwnedSuggestion({
      suggestionId: data.suggestionId,
      workspaceUserId: meWuId,
      conversationId: data.conversationId,
    });
    if (row.status !== "SHOWN" || !row.shown_at) {
      throw new Error("Suggestion has not been shown");
    }
    if (row.feedback_type) return { ok: true as const, alreadySet: true as const };

    const { error } = await supabaseAdmin
      .from("conversation_suggestions")
      .update({
        feedback_type: data.feedbackType,
        feedback_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .is("feedback_type", null);
    if (error) throw new Error(error.message);
    return { ok: true as const, alreadySet: false as const };
  });
