import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { DebugLogger } from "@/lib/debugLogger";
import { KB_CONFIG } from "@/lib/knowledge-base/config";
import { reconcileGraphWithReadable } from "@/lib/knowledge-base/graph-reconcile";
import {
  KnowledgeGraphResponseError,
  parseKnowledgeGraphResponse,
} from "@/lib/knowledge-base/graph-schema";
import {
  KNOWLEDGE_TOPIC_NOT_FOUND,
  type KnowledgeEvidenceItem,
  type KnowledgeGraph,
  type KnowledgeTopicDetail,
} from "@/lib/knowledge-base/types";
import { extractSnippet } from "@/search/utils/snippet";

// Visibility premise: a topic is shown only if the viewer can read the owner of
// every one of its evidences. RLS on canonical_topics / canonical_topic_evidences
// is the final authority for that rule — see docs/interface/knowledge-base.md.

async function getCurrentWorkspaceUserId(workspaceId: string, userId: string): Promise<string> {
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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const getKnowledgeGraph = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<KnowledgeGraph> => {
    // Resolved from the session, never from input: the RPC trusts this id.
    const meWuId = await getCurrentWorkspaceUserId(data.workspaceId, context.userId);

    const rpcTimer = DebugLogger.time("knowledge-base", "graph.rpc");
    // service_role only; the function applies the visibility premise for meWuId.
    const { data: raw, error } = await supabaseAdmin.rpc("get_canonical_topic_graph_for_user", {
      p_workspace_user_id: meWuId,
      p_workspace_id: data.workspaceId,
      p_max_nodes: KB_CONFIG.MAX_NODES,
      p_neighbors: KB_CONFIG.SEMANTIC_NEIGHBORS,
      p_min_similarity: KB_CONFIG.SEMANTIC_MIN_SIMILARITY,
    });
    rpcTimer.end();
    if (error) throw new Error(error.message);

    let graph: KnowledgeGraph;
    try {
      graph = parseKnowledgeGraphResponse(raw);
    } catch (e) {
      if (e instanceof KnowledgeGraphResponseError) {
        console.error("[knowledge-base] malformed graph RPC response", {
          workspaceId: data.workspaceId,
          issuePaths: e.issuePaths.slice(0, 20),
        });
      }
      throw e;
    }
    if (graph.nodes.length === 0) return graph;

    // RLS cross-check: only topics the RLS policy also allows are returned.
    const rlsTimer = DebugLogger.time("knowledge-base", "graph.rlsCrossCheck");
    const readableIds = new Set<string>();
    for (const ids of chunk(
      graph.nodes.map((node) => node.id),
      KB_CONFIG.RLS_CHECK_BATCH_SIZE,
    )) {
      const { data: rows, error: rlsError } = await context.supabase
        .from("canonical_topics")
        .select("id")
        .eq("workspace_id", data.workspaceId)
        .in("id", ids);
      if (rlsError) throw new Error(rlsError.message);
      for (const row of rows ?? []) readableIds.add(row.id);
    }
    rlsTimer.end();

    const reconciled = reconcileGraphWithReadable(graph, readableIds);
    if (reconciled.droppedIds.length > 0) {
      // Ids only — never names or descriptions of topics the viewer can't read.
      console.warn("[knowledge-base] visibility drift between graph RPC and RLS", {
        workspaceId: data.workspaceId,
        droppedCount: reconciled.droppedIds.length,
        droppedIds: reconciled.droppedIds,
      });
    }
    return reconciled.graph;
  });

export const getKnowledgeTopicEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ canonicalTopicId: z.string().uuid(), workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<KnowledgeTopicDetail> => {
    await getCurrentWorkspaceUserId(data.workspaceId, context.userId);
    const timer = DebugLogger.time("knowledge-base", "topicEvidence");

    // From here on every read goes through context.supabase (RLS). Do not switch
    // any of them to supabaseAdmin: each statement re-checks visibility, and the
    // detail reads only follow ids from evidence RLS already returned, so evidence
    // attached mid-request can never leak.

    const { data: topic, error: topicError } = await context.supabase
      .from("canonical_topics")
      .select("id, workspace_id, name, description, last_evidence_at, updated_at")
      .eq("id", data.canonicalTopicId)
      .maybeSingle();
    if (topicError) throw new Error(topicError.message);
    if (!topic || topic.workspace_id !== data.workspaceId) {
      throw new Error(KNOWLEDGE_TOPIC_NOT_FOUND);
    }

    const { data: evidenceRows, error: evidenceError } = await context.supabase
      .from("canonical_topic_evidences")
      .select("source_type, source_id")
      .eq("canonical_topic_id", data.canonicalTopicId);
    if (evidenceError) throw new Error(evidenceError.message);
    if (!evidenceRows || evidenceRows.length === 0) {
      throw new Error(KNOWLEDGE_TOPIC_NOT_FOUND);
    }

    const conversationTopicIds = evidenceRows
      .filter((row) => row.source_type === "conversation_topic")
      .map((row) => row.source_id);
    const pageTopicIds = evidenceRows
      .filter((row) => row.source_type === "page_topic")
      .map((row) => row.source_id);

    const items: KnowledgeEvidenceItem[] = [];

    if (conversationTopicIds.length > 0) {
      items.push(...(await loadMessageEvidence(context.supabase, conversationTopicIds)));
    }
    if (pageTopicIds.length > 0) {
      items.push(...(await loadPageEvidence(context.supabase, pageTopicIds)));
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    timer.end();

    return {
      topic: {
        id: topic.id,
        name: topic.name,
        description: topic.description,
        lastActivityAt: topic.last_evidence_at ?? topic.updated_at,
      },
      items: items.slice(0, KB_CONFIG.MAX_EVIDENCE_ITEMS),
    };
  });

// The user-scoped client from requireSupabaseAuth — RLS applies to every read.
type RlsClient = SupabaseClient<Database>;

async function loadMessageEvidence(
  supabase: RlsClient,
  conversationTopicIds: string[],
): Promise<KnowledgeEvidenceItem[]> {
  const links: { message_id: string; conversation_id: string }[] = [];
  for (const ids of chunk(conversationTopicIds, KB_CONFIG.RLS_CHECK_BATCH_SIZE)) {
    const { data: rows, error } = await supabase
      .from("conversation_topic_evidences")
      .select("message_id, conversation_id")
      .in("topic_id", ids)
      .order("created_at", { ascending: false })
      .limit(KB_CONFIG.MAX_EVIDENCE_ITEMS);
    if (error) throw new Error(error.message);
    links.push(...(rows ?? []));
  }

  const conversationByMessage = new Map(links.map((l) => [l.message_id, l.conversation_id]));
  const messageIds = [...conversationByMessage.keys()];
  const items: KnowledgeEvidenceItem[] = [];

  for (const ids of chunk(messageIds, KB_CONFIG.RLS_CHECK_BATCH_SIZE)) {
    const [{ data: messages, error: messagesError }, { data: semantics, error: semanticsError }] =
      await Promise.all([
        supabase.from("messages").select("id, raw_text, created_at, purged_at").in("id", ids),
        supabase
          .from("message_semantics")
          .select("message_id, normalized_text")
          .in("message_id", ids),
      ]);
    if (messagesError) throw new Error(messagesError.message);
    if (semanticsError) throw new Error(semanticsError.message);

    const normalizedById = new Map(
      (semantics ?? []).map((row) => [row.message_id, row.normalized_text]),
    );
    for (const message of messages ?? []) {
      // Trashed messages keep their evidence until purge; don't surface them.
      if (message.purged_at) continue;
      const text = normalizedById.get(message.id) || message.raw_text;
      if (!text) continue;
      items.push({
        kind: "message",
        conversationId: conversationByMessage.get(message.id)!,
        messageId: message.id,
        snapshot: extractSnippet(text, ""),
        createdAt: message.created_at,
      });
    }
  }
  return items;
}

async function loadPageEvidence(
  supabase: RlsClient,
  pageTopicIds: string[],
): Promise<KnowledgeEvidenceItem[]> {
  const items: KnowledgeEvidenceItem[] = [];
  for (const ids of chunk(pageTopicIds, KB_CONFIG.RLS_CHECK_BATCH_SIZE)) {
    const { data: rows, error } = await supabase
      .from("page_topics")
      .select("page_id, page_snapshot, updated_at, pages(purged_at, last_modified_at)")
      .in("id", ids);
    if (error) throw new Error(error.message);
    for (const row of rows ?? []) {
      // Defense in depth: RLS already hides topics with trashed pages.
      if (row.pages?.purged_at) continue;
      items.push({
        kind: "page",
        pageId: row.page_id,
        snapshot: extractSnippet(row.page_snapshot, ""),
        createdAt: row.pages?.last_modified_at ?? row.updated_at,
      });
    }
  }
  return items;
}
