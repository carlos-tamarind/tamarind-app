import type { ConversationTopicJob } from "../types/job";
import type { CtiTransitionPlan } from "../types/plan";

export async function planTransition(_input: {
  job: ConversationTopicJob;
}): Promise<CtiTransitionPlan> {
  return { kind: "noop" };
}
