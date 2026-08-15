import type { CommitCtiJobResult } from "./types";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function commitCtiJob(jobId: string): Promise<CommitCtiJobResult> {
  const supabase = await getAdmin();

  const { data, error } = await supabase.rpc("commit_cti_job", {
    p_job_id: jobId,
  });

  if (error) throw error;
  return data as CommitCtiJobResult;
}

export async function releaseConversationTopicJob(jobId: string): Promise<void> {
  const supabase = await getAdmin();

  const { error } = await supabase.rpc("release_conversation_topic_job", {
    p_job_id: jobId,
  });

  if (error) throw error;
}
