import { canonicalTopicText } from "@/semantic/embedding/canonicalTopicText";

import type { ApplyCanonicalTopicResult, CanonicalTopicJob } from "../types/job";
import { classifyMatch } from "./classifyMatch";
import { CANONICAL_TOPIC_ENGINE_CONFIG } from "./config";
import { embedCanonicalTopic } from "./embedCanonicalTopic";
import { buildArbitrationPrompt, buildRegenerationPrompt } from "./llm/prompts";
import { interpretCanonicalTopicArbitration } from "./llm/interpretArbitration";
import { interpretCanonicalTopicRegeneration } from "./llm/interpretRegeneration";
import { loadSourceTopicContent } from "./loadSourceTopic";
import {
  loadCanonicalTopicSnapshot,
  loadEvidenceTextsForRegeneration,
  matchCanonicalTopics,
} from "./persistence/loadCanonicalContext";
import {
  applyCanonicalTopicAdd,
  type CanonicalTopicAddPayload,
} from "./persistence/applyCanonicalTopicResult";

export async function planAdd(job: CanonicalTopicJob): Promise<ApplyCanonicalTopicResult> {
  const source = await loadSourceTopicContent(job);
  const embedding = await embedCanonicalTopic(source.name, source.description);

  const matches = await matchCanonicalTopics(job.workspace_id, embedding);
  const { tier, best } = classifyMatch(matches);

  const payload: CanonicalTopicAddPayload = {
    decision: "create",
    name: source.name,
    description: source.description,
    embedding,
    owning_entity_id: source.owningEntityId,
  };

  if (tier === "high" && best) {
    payload.decision = "reinforce";
    payload.canonical_topic_id = best.id;
    payload.similarity = best.similarity;
  } else if (tier === "medium" && best) {
    const prompt = buildArbitrationPrompt({
      candidateName: source.name,
      candidateDescription: source.description,
      topics: matches,
    });
    const arbitration = await interpretCanonicalTopicArbitration(prompt);

    if (arbitration.decision === "merge") {
      const matched = matches.find((m) => m.id === arbitration.canonical_topic_id);
      payload.decision = "reinforce";
      payload.canonical_topic_id = arbitration.canonical_topic_id;
      payload.similarity = matched?.similarity ?? 0;
    }
  }

  if (payload.decision === "reinforce" && payload.canonical_topic_id) {
    const target = await loadCanonicalTopicSnapshot(payload.canonical_topic_id);
    const nextEvidenceCount = target.evidenceCount + 1;
    const window = CANONICAL_TOPIC_ENGINE_CONFIG.CANONICAL_TOPIC_REGENERATION_EVIDENCE_WINDOW;

    if (nextEvidenceCount % window === 0) {
      const maxContext = CANONICAL_TOPIC_ENGINE_CONFIG.CANONICAL_TOPIC_LLM_MAX_CONTEXT_TOPIC_NUMBER;
      const priorEvidenceTexts = await loadEvidenceTextsForRegeneration(
        payload.canonical_topic_id,
        Math.max(0, maxContext - 1),
      );
      const evidenceTexts = [
        ...priorEvidenceTexts,
        canonicalTopicText(source.name, source.description),
      ];

      const regenPrompt = buildRegenerationPrompt({
        currentName: target.name,
        currentDescription: target.description,
        evidenceTexts,
      });
      const regenerated = await interpretCanonicalTopicRegeneration(regenPrompt);
      const regeneratedEmbedding = await embedCanonicalTopic(
        regenerated.name,
        regenerated.description,
      );

      payload.name = regenerated.name;
      payload.description = regenerated.description;
      payload.embedding = regeneratedEmbedding;
      payload.update_embedding = true;
    }
  }

  return applyCanonicalTopicAdd(job.id, payload);
}
