import type { Database } from "@/integrations/supabase/types";

export type PageSemanticJob = Database["public"]["Tables"]["page_topic_jobs"]["Row"];

export type PageSemanticJobStatus = Database["public"]["Enums"]["page_semantic_job_status"];

export type ApplyPageSemanticResult =
  | "committed"
  | "drifted"
  | "not_processing"
  | "not_found";

export type EnqueuePageSemanticResult = "enqueued" | "requeued" | "processing";
