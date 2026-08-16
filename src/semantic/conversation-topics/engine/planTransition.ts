import { DebugLogger } from "@/lib/debugLogger";

import type { ConversationTopicJob } from "../types/job";
import type { CtiTransitionPlan } from "../types/plan";
import { classifyMatches } from "./classifyMatches";
import { CTI_ENGINE_CONFIG } from "./config";
import { CtiPlanBuilder } from "./ctiPlanBuilder";
import { loadCtiJobContext } from "./persistence/loadCtiContext";

const LOG_SCOPE = "cti-engine";

export async function planTransition(input: {
  job: ConversationTopicJob;
}): Promise<CtiTransitionPlan> {
  const ctx = await loadCtiJobContext(input.job);
  const route = classifyMatches(ctx.matches);
  const builder = new CtiPlanBuilder(ctx, new Date());

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "CTI_ROUTE",
    message: `job ${input.job.id} · tier ${route.tier} · ${ctx.matches.length} topics`,
  });

  switch (route.tier) {
    case 4:
    case 3:
      builder.addUnnamedCandidate(1);
      break;

    case 1:
      for (const topic of route.strongEstablished) {
        builder.reinforceEstablished(topic.id, topic.similarity);
      }
      for (const candidate of route.strongCandidates) {
        await builder.addCandidateEvidence(candidate.id, candidate.similarity);
      }
      {
        const ready = route.strongCandidates
          .filter((candidate) => {
            const topic = builder.getTopic(candidate.id);
            return (
              topic?.isCandidate === true &&
              topic.evidenceCount >=
                CTI_ENGINE_CONFIG.CONVERSATION_TOPIC_MINIMUM_EVIDENCE_THRESHOLD
            );
          })
          .sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id));

        for (const candidate of ready) {
          if (!builder.getTopic(candidate.id)?.isCandidate) continue;
          await builder.evaluatePromotion(candidate.id);
        }
      }
      break;

    case 2:
      await builder.applyTier2Decision();
      break;
  }

  const plan = builder.toPlan();
  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "CTI_PLAN",
    message: `job ${input.job.id} · ${plan.kind}`,
  });
  return plan;
}
