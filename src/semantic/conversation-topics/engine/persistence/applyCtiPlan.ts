import type { Json } from "@/integrations/supabase/types";

import type { CommitCtiJobResult } from "../../types/job";
import type { CtiApplyPayload, CtiTransitionPlan } from "../../types/plan";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function toJsonPayload(payload: CtiApplyPayload): Json {
  return JSON.parse(JSON.stringify(payload)) as Json;
}

export async function applyCtiPlanAndCommit(
  jobId: string,
  plan: CtiTransitionPlan,
): Promise<CommitCtiJobResult> {
  const supabase = await getAdmin();
  const payload: Json = plan.kind === "apply" ? toJsonPayload(plan.payload) : {};

  const { data, error } = await supabase.rpc("apply_cti_plan_and_commit", {
    p_job_id: jobId,
    p_plan: payload,
  });

  if (error) throw error;
  return data as CommitCtiJobResult;
}
