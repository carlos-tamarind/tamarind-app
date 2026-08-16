import type { ConversationTopicJob } from "./job";

export type CtiTransitionPlan = { kind: "noop" };

export interface ConversationTopicEngine {
  planTransition(input: { job: ConversationTopicJob }): Promise<CtiTransitionPlan>;
}
