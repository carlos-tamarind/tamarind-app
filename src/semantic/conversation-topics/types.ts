import type { Database } from "@/integrations/supabase/types";

export type ConversationTopicJob =
  Database["public"]["Tables"]["conversation_topic_jobs"]["Row"];

export type CtiJobStatus = Database["public"]["Enums"]["cti_job_status"];

export type CtiTransitionPlan = { kind: "noop" };

export type CommitCtiJobResult = "committed" | "not_found" | "not_processing" | "not_next";

export interface ConversationTopicEngine {
  planTransition(input: { job: ConversationTopicJob }): Promise<CtiTransitionPlan>;
}
