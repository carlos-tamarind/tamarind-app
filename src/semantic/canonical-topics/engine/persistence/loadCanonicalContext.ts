import { canonicalTopicText } from "@/semantic/embedding/canonicalTopicText";

import type { CanonicalTopicMatch } from "../classifyMatch";
import { CANONICAL_TOPIC_ENGINE_CONFIG } from "../config";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function matchCanonicalTopics(
  workspaceId: string,
  embedding: number[],
): Promise<CanonicalTopicMatch[]> {
  const supabase = await getAdmin();

  const { data, error } = await supabase.rpc("match_canonical_topics", {
    p_workspace_id: workspaceId,
    p_embedding: JSON.stringify(embedding),
    p_limit: CANONICAL_TOPIC_ENGINE_CONFIG.CANONICAL_TOPIC_LLM_MAX_CONTEXT_TOPIC_NUMBER,
  });

  if (error) throw error;
  return (data ?? []) as CanonicalTopicMatch[];
}

export type CanonicalTopicSnapshot = {
  evidenceCount: number;
  name: string;
  description: string;
};

export async function loadCanonicalTopicSnapshot(
  canonicalTopicId: string,
): Promise<CanonicalTopicSnapshot> {
  const supabase = await getAdmin();

  const { data, error } = await supabase
    .from("canonical_topics")
    .select("evidence_count, name, description")
    .eq("id", canonicalTopicId)
    .single();

  if (error) throw error;

  return {
    evidenceCount: data.evidence_count,
    name: data.name,
    description: data.description,
  };
}

/** Evidence texts for the regeneration LLM call, resolved per source_type. */
export async function loadEvidenceTextsForRegeneration(
  canonicalTopicId: string,
  limit: number,
): Promise<string[]> {
  const supabase = await getAdmin();

  const { data: evidenceRows, error: evidenceError } = await supabase
    .from("canonical_topic_evidences")
    .select("source_type, source_id")
    .eq("canonical_topic_id", canonicalTopicId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (evidenceError) throw evidenceError;
  if (!evidenceRows || evidenceRows.length === 0) return [];

  const conversationTopicIds = evidenceRows
    .filter((row) => row.source_type === "conversation_topic")
    .map((row) => row.source_id);
  const pageTopicIds = evidenceRows
    .filter((row) => row.source_type === "page_topic")
    .map((row) => row.source_id);

  const textById = new Map<string, string>();

  if (conversationTopicIds.length > 0) {
    const { data, error } = await supabase
      .from("conversation_topics")
      .select("id, name, description")
      .in("id", conversationTopicIds);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.name && row.description) {
        textById.set(row.id, canonicalTopicText(row.name, row.description));
      }
    }
  }

  if (pageTopicIds.length > 0) {
    const { data, error } = await supabase
      .from("page_topics")
      .select("page_id, topic_name, topic_description")
      .in("page_id", pageTopicIds);
    if (error) throw error;
    for (const row of data ?? []) {
      textById.set(row.page_id, canonicalTopicText(row.topic_name, row.topic_description));
    }
  }

  return evidenceRows
    .map((row) => textById.get(row.source_id))
    .filter((text): text is string => Boolean(text));
}
