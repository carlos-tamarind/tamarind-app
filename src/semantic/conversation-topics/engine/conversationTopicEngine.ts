import type { ConversationTopicEngine } from "../types/plan";
import { planTransition } from "./planTransition";

export const conversationTopicEngine: ConversationTopicEngine = {
  planTransition,
};
