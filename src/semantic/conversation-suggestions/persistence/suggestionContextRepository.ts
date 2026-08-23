import { formatEmbeddingVector, parseEmbeddingVector } from "@/lib/vector/embeddingVectorUtil";
import { PAGE_CHUNK_CONFIG } from "@/semantic/pages/page-chunks/engine/config";

import { CONVERSATION_SUGGESTION_ENGINE_CONFIG } from "../engine/config";
import type { SuggestionEntityType } from "../types/job";

export type EstablishedTopic = {
  id: string;
  name: string | null;
  description: string | null;
  embedding: number[];
  historicalWeight: number;
  lastSeenAt: Date;
  isWinner: boolean;
};

export type EmbeddedMessage = {
  id: string;
  createdAt: Date;
  normalizedText: string;
  embedding: number[];
};

export type SuggestionCandidate = {
  entityId: string;
  entityType: SuggestionEntityType;
  content: string;
  similarity: number;
  title: string | null;
  conversationId?: string;
  pageId?: string;
};

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function parseVector(value: string | null, label: string): number[] | null {
  if (!value) return null;
  try {
    const parsed = parseEmbeddingVector(value);
    return parsed.length > 0 ? parsed : null;
  } catch {
    throw new Error(`malformed ${label}`);
  }
}

export async function loadSuggestionContext(params: {
  conversationId: string;
  workspaceUserId: string;
}): Promise<{
  currentTopicId: string | null;
  winner: EstablishedTopic | null;
  establishedTopics: EstablishedTopic[];
  recentMessages: EmbeddedMessage[];
  lastEmbeddedAt: Date | null;
  lastNegativeFeedbackAt: Date | null;
  hasUnexpiredPending: boolean;
} | null> {
  const supabase = await getAdmin();
  const { conversationId, workspaceUserId } = params;

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, current_topic_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convError) throw convError;
  if (!conversation) return null;

  const currentTopicId = conversation.current_topic_id;

  const { data: topicRows, error: topicError } = await supabase
    .from("conversation_topics")
    .select("id, name, description, embedding, historical_weight, last_seen_at, is_candidate")
    .eq("conversation_id", conversationId)
    .eq("is_candidate", false);
  if (topicError) throw topicError;

  const establishedTopics: EstablishedTopic[] = [];
  for (const row of topicRows ?? []) {
    const embedding = parseVector(row.embedding, `topic ${row.id} embedding`);
    if (!embedding) continue;
    establishedTopics.push({
      id: row.id,
      name: row.name,
      description: row.description,
      embedding,
      historicalWeight: row.historical_weight,
      lastSeenAt: new Date(row.last_seen_at),
      isWinner: row.id === currentTopicId,
    });
  }

  const winner = establishedTopics.find((topic) => topic.isWinner) ?? null;

  const { data: messageRows, error: messageError } = await supabase
    .from("messages")
    .select("id, created_at")
    .eq("conversation_id", conversationId)
    .is("purged_at", null)
    .order("created_at", { ascending: false })
    .limit(80);
  if (messageError) throw messageError;

  const messageIds = (messageRows ?? []).map((row) => row.id);
  const createdAtById = new Map(
    (messageRows ?? []).map((row) => [row.id, new Date(row.created_at)]),
  );

  let lastEmbeddedAt: Date | null = null;
  const recentMessages: EmbeddedMessage[] = [];

  if (messageIds.length > 0) {
    const { data: semantics, error: semanticsError } = await supabase
      .from("message_semantics")
      .select("id, message_id, normalized_text")
      .in("message_id", messageIds)
      .eq("embedding_status", "EMBEDDED");
    if (semanticsError) throw semanticsError;

    const semanticsByMessageId = new Map((semantics ?? []).map((row) => [row.message_id, row]));
    const semanticsIds = (semantics ?? []).map((row) => row.id);

    const embeddingsBySemanticsId = new Map<string, number[]>();
    if (semanticsIds.length > 0) {
      const { data: embeddings, error: embeddingsError } = await supabase
        .from("message_embeddings")
        .select("message_semantics_id, embedding_vector")
        .in("message_semantics_id", semanticsIds)
        .eq("is_active", true);
      if (embeddingsError) throw embeddingsError;
      for (const row of embeddings ?? []) {
        const vector = parseVector(row.embedding_vector, "message embedding");
        if (vector) embeddingsBySemanticsId.set(row.message_semantics_id, vector);
      }
    }

    for (const messageId of messageIds) {
      const semanticsRow = semanticsByMessageId.get(messageId);
      if (!semanticsRow) continue;
      const embedding = embeddingsBySemanticsId.get(semanticsRow.id);
      if (!embedding) continue;
      const createdAt = createdAtById.get(messageId);
      if (!createdAt) continue;
      if (!lastEmbeddedAt) lastEmbeddedAt = createdAt;
      if (
        recentMessages.length <
        CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_LAST_MSGS_CONTEXT_THRESHOLD
      ) {
        recentMessages.push({
          id: messageId,
          createdAt,
          normalizedText: semanticsRow.normalized_text,
          embedding,
        });
      }
    }
  }

  const cooldownSince = new Date(
    Date.now() - CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_COOLDOWN_MS,
  ).toISOString();

  const { data: negative, error: negativeError } = await supabase
    .from("conversation_suggestions")
    .select("feedback_at")
    .eq("conversation_id", conversationId)
    .eq("workspace_user_id", workspaceUserId)
    .eq("feedback_type", "negative")
    .gt("feedback_at", cooldownSince)
    .order("feedback_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (negativeError) throw negativeError;

  const { data: pending, error: pendingError } = await supabase
    .from("conversation_suggestions")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("workspace_user_id", workspaceUserId)
    .eq("status", "PENDING")
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (pendingError) throw pendingError;

  return {
    currentTopicId,
    winner,
    establishedTopics,
    recentMessages,
    lastEmbeddedAt,
    lastNegativeFeedbackAt: negative?.feedback_at ? new Date(negative.feedback_at) : null,
    hasUnexpiredPending: Boolean(pending),
  };
}

export async function searchSuggestionCandidates(params: {
  workspaceId: string;
  workspaceUserId: string;
  queryEmbedding: number[];
  excludeMessageIds: Set<string>;
}): Promise<SuggestionCandidate[]> {
  const supabase = await getAdmin();
  const embedding = formatEmbeddingVector(params.queryEmbedding);
  const limit =
    CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_SEARCH_MATCHES_THRESHOLD;
  const threshold =
    CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_SEARCH_SIMILARITY_THRESHOLD;

  const [messagesResult, pagesResult] = await Promise.all([
    supabase.rpc("search_messages_semantic_for_user", {
      p_workspace_user_id: params.workspaceUserId,
      p_workspace_id: params.workspaceId,
      p_embedding: embedding,
      p_limit: limit,
      p_similarity_threshold: threshold,
    }),
    supabase.rpc("search_pages_semantic_for_user", {
      p_workspace_user_id: params.workspaceUserId,
      p_workspace_id: params.workspaceId,
      p_embedding: embedding,
      p_limit: limit,
      p_similarity_threshold: threshold,
      p_embedding_model: PAGE_CHUNK_CONFIG.PAGE_EMBEDDING_MODEL,
    }),
  ]);

  if (messagesResult.error) throw messagesResult.error;
  if (pagesResult.error) throw pagesResult.error;

  const candidates: SuggestionCandidate[] = [];

  for (const row of messagesResult.data ?? []) {
    if (params.excludeMessageIds.has(row.asset_id)) continue;
    candidates.push({
      entityId: row.asset_id,
      entityType: "message",
      content: row.match_text,
      similarity: row.score,
      title: row.title,
      conversationId: row.conversation_id,
    });
  }

  for (const row of pagesResult.data ?? []) {
    candidates.push({
      entityId: row.chunk_id,
      entityType: "page_chunk",
      content: row.match_text,
      similarity: row.score,
      title: row.title,
      pageId: row.asset_id,
    });
  }

  candidates.sort((a, b) => b.similarity - a.similarity);
  return candidates.slice(0, limit);
}

export async function loadEntityType(entityId: string): Promise<string | null> {
  const supabase = await getAdmin();
  const { data: entity, error } = await supabase
    .from("entities")
    .select("entity_type_id")
    .eq("id", entityId)
    .maybeSingle();
  if (error) throw error;
  if (!entity) return null;
  const { data: entityType, error: typeError } = await supabase
    .from("entity_types")
    .select("key")
    .eq("id", entity.entity_type_id)
    .maybeSingle();
  if (typeError) throw typeError;
  return entityType?.key ?? null;
}

export async function wasEntitySuggestedRecently(params: {
  conversationId: string;
  workspaceUserId: string;
  entityId: string;
}): Promise<boolean> {
  const supabase = await getAdmin();
  const since = new Date(
    Date.now() -
      CONVERSATION_SUGGESTION_ENGINE_CONFIG.CONVERSATION_SUGGESTION_BACKOFF_REPEATED_SUGGESTIONS_MS,
  ).toISOString();

  const { data, error } = await supabase
    .from("conversation_suggestions")
    .select("id")
    .eq("conversation_id", params.conversationId)
    .eq("workspace_user_id", params.workspaceUserId)
    .eq("entity_id", params.entityId)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
