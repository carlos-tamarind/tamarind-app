import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractSnippet } from "@/search/utils/snippet";

export type CanonicalTopicView = {
  id: string;
  name: string;
  description: string;
  evidenceCount: number;
  updatedAt: string;
};

export type CanonicalTopicEvidenceView = {
  id: string;
  sourceType: string;
  sourceId: string;
  similarity: number | null;
  snapshot: string;
  createdAt: string;
};

async function assertWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("workspace_users")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Not a member of this workspace");
}

export const listCanonicalTopics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CanonicalTopicView[]> => {
    await assertWorkspaceMember(data.workspaceId, context.userId);

    const { data: rows, error } = await supabaseAdmin
      .from("canonical_topics")
      .select("id, name, description, evidence_count, updated_at")
      .eq("workspace_id", data.workspaceId)
      .order("evidence_count", { ascending: false });

    if (error) throw new Error(error.message);

    return (rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      evidenceCount: row.evidence_count,
      updatedAt: row.updated_at,
    }));
  });

export const getCanonicalTopicEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ canonicalTopicId: z.string().uuid(), workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CanonicalTopicEvidenceView[]> => {
    await assertWorkspaceMember(data.workspaceId, context.userId);

    const { data: topic, error: topicError } = await supabaseAdmin
      .from("canonical_topics")
      .select("id, workspace_id")
      .eq("id", data.canonicalTopicId)
      .maybeSingle();
    if (topicError) throw new Error(topicError.message);
    if (!topic || topic.workspace_id !== data.workspaceId) {
      throw new Error("Canonical topic not found");
    }

    const { data: evidenceRows, error: evidenceError } = await supabaseAdmin
      .from("canonical_topic_evidences")
      .select("id, source_type, source_id, similarity, created_at")
      .eq("canonical_topic_id", data.canonicalTopicId)
      .order("created_at", { ascending: false });
    if (evidenceError) throw new Error(evidenceError.message);
    if (!evidenceRows || evidenceRows.length === 0) return [];

    const conversationTopicIds = evidenceRows
      .filter((row) => row.source_type === "conversation_topic")
      .map((row) => row.source_id);
    const pageTopicIds = evidenceRows
      .filter((row) => row.source_type === "page_topic")
      .map((row) => row.source_id);

    const snapshotById = new Map<string, string>();

    if (conversationTopicIds.length > 0) {
      const { data: rows, error } = await supabaseAdmin
        .from("conversation_topics")
        .select("id, name, description")
        .in("id", conversationTopicIds);
      if (error) throw new Error(error.message);
      for (const row of rows ?? []) {
        const text = [row.name, row.description].filter(Boolean).join(": ");
        if (text) snapshotById.set(row.id, extractSnippet(text, ""));
      }
    }

    if (pageTopicIds.length > 0) {
      const { data: rows, error } = await supabaseAdmin
        .from("page_topics")
        .select("page_id, topic_name, topic_description")
        .in("page_id", pageTopicIds);
      if (error) throw new Error(error.message);
      for (const row of rows ?? []) {
        const text = `${row.topic_name}: ${row.topic_description}`;
        snapshotById.set(row.page_id, extractSnippet(text, ""));
      }
    }

    return evidenceRows.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      similarity: row.similarity,
      snapshot: snapshotById.get(row.source_id) ?? "(source unavailable)",
      createdAt: row.created_at,
    }));
  });
