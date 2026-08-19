import { formatEmbeddingVector } from "@/lib/vector/embeddingVectorUtil";

import { CtiPermanentError } from "../errors";
import type {
  CtiApplyPayload,
  CtiEvidenceInsert,
  CtiEvidenceMove,
  CtiTopicInsert,
  CtiTopicUpdate,
  CtiTransitionPlan,
} from "../types/plan";
import { CTI_ENGINE_CONFIG } from "./config";
import { embedCanonicalTopic } from "./embedCanonicalTopic";
import { hasCanonicalIdentity, l2NormalizeSum } from "./l2Normalize";
import type { CtiLlmTopic } from "./llm/prompts";
import { interpretCtiLlmDecision } from "./llm/interpretCtiLlm";
import { buildPromotionPrompt, buildTier2Prompt } from "./llm/prompts";
import type { CtiJobContext } from "./persistence/loadCtiContext";
import {
  loadTopicEvidenceEmbeddings,
  loadTopicEvidenceTexts,
} from "./persistence/loadCtiContext";
import { topicScore } from "./scoreTopics";
import { selectCurrentTopic } from "./selectCurrentTopic";

type WorkingTopic = {
  id: string;
  conversationId: string;
  name: string | null;
  description: string | null;
  embedding: number[] | null;
  historicalWeight: number;
  evidenceCount: number;
  isCandidate: boolean;
  lastSeenAt: string;
  firstSeenAt: string;
  isNew: boolean;
};

function cloneTopicFromMatch(
  match: CtiJobContext["matches"][number],
): WorkingTopic {
  return {
    id: match.id,
    conversationId: match.conversation_id,
    name: match.name,
    description: match.description,
    embedding: match.embedding,
    historicalWeight: match.historical_weight,
    evidenceCount: match.evidence_count,
    isCandidate: match.is_candidate,
    lastSeenAt: match.last_seen_at,
    firstSeenAt: match.first_seen_at,
    isNew: false,
  };
}

export class CtiPlanBuilder {
  private readonly nowIso: string;
  private readonly topics = new Map<string, WorkingTopic>();
  private readonly mutated = new Set<string>();
  private readonly evidences: CtiEvidenceInsert[] = [];
  private readonly moves: CtiEvidenceMove[] = [];
  private readonly deletes = new Set<string>();
  private readonly originalCurrentTopicId: string | null;

  constructor(
    private readonly ctx: CtiJobContext,
    private readonly now: Date,
  ) {
    this.nowIso = now.toISOString();
    this.originalCurrentTopicId = ctx.currentTopicId;
    for (const match of ctx.matches) {
      this.topics.set(match.id, cloneTopicFromMatch(match));
    }
  }

  get hasChanges(): boolean {
    return (
      this.mutated.size > 0 ||
      this.evidences.length > 0 ||
      this.moves.length > 0 ||
      this.deletes.size > 0
    );
  }

  getTopic(id: string): WorkingTopic | undefined {
    return this.topics.get(id);
  }

  establishedTopics(): WorkingTopic[] {
    return [...this.topics.values()].filter((topic) => !topic.isCandidate);
  }

  addUnnamedCandidate(similarity = 1): string {
    const id = crypto.randomUUID();
    const topic: WorkingTopic = {
      id,
      conversationId: this.ctx.conversationId,
      name: null,
      description: null,
      embedding: this.ctx.messageEmbedding,
      historicalWeight: 0,
      evidenceCount: 1,
      isCandidate: true,
      lastSeenAt: this.nowIso,
      firstSeenAt: this.nowIso,
      isNew: true,
    };
    this.topics.set(id, topic);
    this.mutated.add(id);
    this.evidences.push({
      topic_id: id,
      message_id: this.ctx.messageId,
      conversation_id: this.ctx.conversationId,
      similarity,
    });
    return id;
  }

  reinforceEstablished(topicId: string, amount: number): void {
    const topic = this.requireTopic(topicId);
    if (topic.isCandidate) {
      throw new CtiPermanentError(
        `impossible: cannot reinforce candidate ${topicId} as an established topic`,
      );
    }
    topic.historicalWeight += amount;
    topic.evidenceCount += 1;
    topic.lastSeenAt = this.nowIso;
    this.mutated.add(topicId);
  }

  async addCandidateEvidence(topicId: string, similarity: number): Promise<void> {
    const topic = this.requireTopic(topicId);
    if (!topic.isCandidate) {
      throw new CtiPermanentError(
        `impossible: cannot add candidate evidence to established topic ${topicId}`,
      );
    }

    this.evidences.push({
      topic_id: topicId,
      message_id: this.ctx.messageId,
      conversation_id: this.ctx.conversationId,
      similarity,
    });

    topic.evidenceCount += 1;
    topic.historicalWeight += similarity;
    topic.lastSeenAt = this.nowIso;

    if (!hasCanonicalIdentity(topic)) {
      const existing = await loadTopicEvidenceEmbeddings(topicId);
      topic.embedding = l2NormalizeSum([...existing, this.ctx.messageEmbedding]);
    }

    this.mutated.add(topicId);
  }

  async addNamedCandidate(params: {
    name: string;
    description: string;
    confidence: number;
  }): Promise<string> {
    const embedding = await embedCanonicalTopic(params.name, params.description);
    const id = crypto.randomUUID();
    const topic: WorkingTopic = {
      id,
      conversationId: this.ctx.conversationId,
      name: params.name,
      description: params.description,
      embedding,
      historicalWeight: params.confidence,
      evidenceCount: 1,
      isCandidate: true,
      lastSeenAt: this.nowIso,
      firstSeenAt: this.nowIso,
      isNew: true,
    };
    this.topics.set(id, topic);
    this.mutated.add(id);
    this.evidences.push({
      topic_id: id,
      message_id: this.ctx.messageId,
      conversation_id: this.ctx.conversationId,
      similarity: 1,
    });
    return id;
  }

  async evaluatePromotion(topicId: string): Promise<void> {
    const topic = this.requireTopic(topicId);
    if (!topic.isCandidate) return;
    if (topic.evidenceCount < CTI_ENGINE_CONFIG.CONVERSATION_TOPIC_MINIMUM_EVIDENCE_THRESHOLD) {
      return;
    }

    const llmTopics = this.llmTopicList();
    const evidenceTexts = await this.evidenceTextsFor(topicId);
    const prompt = buildPromotionPrompt({
      topics: llmTopics,
      candidateName: topic.name,
      candidateDescription: topic.description,
      evidenceTexts,
    });
    const decision = await interpretCtiLlmDecision(prompt);

    if (decision.decision === "existing") {
      const target = this.requireEstablished(decision.topic_id);
      this.mergeCandidateInto(topicId, target.id, decision.confidence);
      return;
    }

    const duplicate = this.findEstablishedByName(decision.new_topic.name);
    if (duplicate) {
      this.mergeCandidateInto(topicId, duplicate.id, decision.confidence);
      return;
    }

    const embedding = await embedCanonicalTopic(
      decision.new_topic.name,
      decision.new_topic.description,
    );
    topic.name = decision.new_topic.name;
    topic.description = decision.new_topic.description;
    topic.embedding = embedding;
    topic.historicalWeight += decision.confidence;
    topic.isCandidate = false;
    this.mutated.add(topicId);
  }

  async applyTier2Decision(): Promise<void> {
    const llmTopics = this.llmTopicList({ rankBy: "similarity" });
    const prompt = buildTier2Prompt({
      normalizedText: this.ctx.normalizedText,
      topics: llmTopics,
    });
    const decision = await interpretCtiLlmDecision(prompt);

    if (decision.decision === "existing") {
      this.reinforceEstablished(decision.topic_id, decision.confidence);
      return;
    }

    const duplicate = this.findEstablishedByName(decision.new_topic.name);
    if (duplicate) {
      this.reinforceEstablished(duplicate.id, decision.confidence);
      return;
    }

    await this.addNamedCandidate({
      name: decision.new_topic.name,
      description: decision.new_topic.description,
      confidence: decision.confidence,
    });
  }

  toPlan(): CtiTransitionPlan {
    if (!this.hasChanges) return { kind: "noop" };

    const payload = this.serializePayload();
    const nextCurrentId = this.selectWinner();
    if (nextCurrentId !== this.originalCurrentTopicId) {
      payload.currentTopicId = nextCurrentId;
    }

    return { kind: "apply", payload };
  }

  private mergeCandidateInto(
    candidateId: string,
    targetId: string,
    llmConfidence: number,
  ): void {
    const candidate = this.requireTopic(candidateId);
    const target = this.requireEstablished(targetId);

    this.moves.push({ from_topic_id: candidateId, to_topic_id: targetId });
    target.evidenceCount += candidate.evidenceCount;
    target.historicalWeight += candidate.historicalWeight + llmConfidence;
    target.lastSeenAt = this.nowIso;
    this.mutated.add(targetId);

    this.topics.delete(candidateId);
    this.mutated.delete(candidateId);
    this.deletes.add(candidateId);
  }

  private selectWinner(): string | null {
    const scored = this.establishedTopics().map((topic) => ({
      id: topic.id,
      score: topicScore(
        topic.historicalWeight,
        new Date(topic.lastSeenAt),
        this.now,
        CTI_ENGINE_CONFIG.CONVERSATION_TOPIC_SCORE_HALF_LIFE_HOURS,
      ),
    }));

    return selectCurrentTopic({
      topics: scored,
      currentTopicId: this.originalCurrentTopicId,
      hysteresis: CTI_ENGINE_CONFIG.CONVERSATION_TOPIC_SCORE_HYSTERESIS_PERCENTAGE,
    });
  }

  private serializePayload(): CtiApplyPayload {
    const topicsToInsert: CtiTopicInsert[] = [];
    const topicsToUpdate: CtiTopicUpdate[] = [];

    for (const topic of this.topics.values()) {
      if (!this.mutated.has(topic.id)) continue;
      if (!topic.embedding) {
        throw new CtiPermanentError(`missing required embedding for topic ${topic.id}`);
      }

      if (topic.isNew) {
        topicsToInsert.push({
          id: topic.id,
          conversation_id: topic.conversationId,
          name: topic.name,
          description: topic.description,
          embedding: formatEmbeddingVector(topic.embedding),
          historical_weight: topic.historicalWeight,
          evidence_count: topic.evidenceCount,
          is_candidate: topic.isCandidate,
          last_seen_at: topic.lastSeenAt,
          first_seen_at: topic.firstSeenAt,
        });
        continue;
      }

      const update: CtiTopicUpdate = {
        id: topic.id,
        name: topic.name,
        description: topic.description,
        embedding: formatEmbeddingVector(topic.embedding),
        historical_weight: topic.historicalWeight,
        evidence_count: topic.evidenceCount,
        is_candidate: topic.isCandidate,
        last_seen_at: topic.lastSeenAt,
      };
      topicsToUpdate.push(update);
    }

    return {
      topicsToInsert,
      topicsToUpdate,
      evidencesToInsert: this.evidences,
      evidencesToMove: this.moves,
      topicsToDelete: [...this.deletes],
    };
  }

  private llmTopicList(options?: { rankBy?: "score" | "similarity" }): CtiLlmTopic[] {
    const rankBy = options?.rankBy ?? "score";
    const similarityById = new Map(
      this.ctx.matches.map((match) => [match.id, match.similarity]),
    );

    return this.establishedTopics()
      .filter((topic) => hasCanonicalIdentity(topic))
      .map((topic) => ({
        id: topic.id,
        name: topic.name as string,
        description: topic.description as string,
        lastSeenAt: topic.lastSeenAt,
        historicalWeight: topic.historicalWeight,
      }))
      .sort((a, b) => {
        if (rankBy === "similarity") {
          return (
            (similarityById.get(b.id) ?? 0) - (similarityById.get(a.id) ?? 0) ||
            a.id.localeCompare(b.id)
          );
        }
        const scoreA = topicScore(
          a.historicalWeight,
          new Date(a.lastSeenAt),
          this.now,
          CTI_ENGINE_CONFIG.CONVERSATION_TOPIC_SCORE_HALF_LIFE_HOURS,
        );
        const scoreB = topicScore(
          b.historicalWeight,
          new Date(b.lastSeenAt),
          this.now,
          CTI_ENGINE_CONFIG.CONVERSATION_TOPIC_SCORE_HALF_LIFE_HOURS,
        );
        return scoreB - scoreA || a.id.localeCompare(b.id);
      })
      .slice(0, CTI_ENGINE_CONFIG.CTI_LLM_MAX_TOPICS)
      .map(({ id, name, description }) => ({ id, name, description }));
  }

  private async evidenceTextsFor(topicId: string): Promise<string[]> {
    const texts = await loadTopicEvidenceTexts(topicId);
    if (!texts.includes(this.ctx.normalizedText)) {
      texts.push(this.ctx.normalizedText);
    }
    return texts;
  }

  private findEstablishedByName(name: string): WorkingTopic | undefined {
    const needle = name.trim().toLowerCase();
    return this.establishedTopics().find(
      (topic) => topic.name?.trim().toLowerCase() === needle,
    );
  }

  private requireTopic(topicId: string): WorkingTopic {
    const topic = this.topics.get(topicId);
    if (!topic) {
      throw new CtiPermanentError(`invalid topic_id ${topicId}: topic not found`);
    }
    return topic;
  }

  private requireEstablished(topicId: string): WorkingTopic {
    const topic = this.requireTopic(topicId);
    if (topic.isCandidate) {
      throw new CtiPermanentError(
        `invalid topic_id ${topicId}: expected an established topic`,
      );
    }
    return topic;
  }
}
