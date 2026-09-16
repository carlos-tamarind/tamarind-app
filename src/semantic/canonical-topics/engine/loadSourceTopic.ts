import { CanonicalTopicPermanentError } from "../errors";
import type { CanonicalTopicJob } from "../types/job";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type SourceTopicContent = {
  name: string;
  description: string;
  owningEntityId: string;
};

/**
 * Loads the current name/description/owning-entity for an ADD job's source row.
 * Only two source kinds exist today (mirrors canonical_topic_source_types).
 *
 * Returns null when the source row no longer exists — a stale ADD, enqueued
 * before the row was deleted (or, for page_topic, deleted and re-created with
 * a new id since source_id is now the row's own synthetic id, not the page
 * id). That's a no-op for the caller, not a permanent error: the row being
 * malformed (still) is.
 */
export async function loadSourceTopicContent(
  job: CanonicalTopicJob,
): Promise<SourceTopicContent | null> {
  const supabase = await getAdmin();

  if (job.source_type === "conversation_topic") {
    const { data, error } = await supabase
      .from("conversation_topics")
      .select("name, description, conversation_id")
      .eq("id", job.source_id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    if (!data.name || !data.description) {
      throw new CanonicalTopicPermanentError(
        `conversation_topic ${job.source_id} has no established name/description`,
      );
    }

    return {
      name: data.name,
      description: data.description,
      owningEntityId: data.conversation_id,
    };
  }

  if (job.source_type === "page_topic") {
    const { data, error } = await supabase
      .from("page_topics")
      .select("page_id, topic_name, topic_description")
      .eq("id", job.source_id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      name: data.topic_name,
      description: data.topic_description,
      owningEntityId: data.page_id,
    };
  }

  throw new CanonicalTopicPermanentError(`Unknown canonical topic source type: ${job.source_type}`);
}
