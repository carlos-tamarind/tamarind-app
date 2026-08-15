import type { ConversationTopicEngine, CtiTransitionPlan } from "./types";

export const conversationTopicEngine: ConversationTopicEngine = {
  async planTransition(): Promise<CtiTransitionPlan> {
    return { kind: "noop" };
  },
};
