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
 */
export async function loadSourceTopicContent(job: CanonicalTopicJob): Promise<SourceTopicContent> {
  const supabase = await getAdmin();

  if (job.source_type === "conversation_topic") {
    const { data, error } = await supabase
      .from("conversation_topics")
      .select("name, description, conversation_id")
      .eq("id", job.source_id)
      .maybeSingle();

    if (error) throw error;
    if (!data || !data.name || !data.description) {
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
      .select("topic_name, topic_description")
      .eq("page_id", job.source_id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new CanonicalTopicPermanentError(`page_topic ${job.source_id} not found`);
    }

    return {
      name: data.topic_name,
      description: data.topic_description,
      owningEntityId: job.source_id,
    };
  }

  throw new CanonicalTopicPermanentError(`Unknown canonical topic source type: ${job.source_type}`);
}
