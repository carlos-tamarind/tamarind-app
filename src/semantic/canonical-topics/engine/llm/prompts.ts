export type CanonicalTopicCandidate = {
  id: string;
  name: string;
  description: string;
  similarity: number;
};

function formatCandidates(topics: CanonicalTopicCandidate[]): string {
  if (topics.length === 0) return "(none)";
  return topics
    .map(
      (topic) =>
        `- id=${topic.id} (similarity ${topic.similarity.toFixed(2)})\n  name: ${topic.name}\n  description: ${topic.description}`,
    )
    .join("\n");
}

export function buildArbitrationPrompt(params: {
  candidateName: string;
  candidateDescription: string;
  topics: CanonicalTopicCandidate[];
}): { instructions: string; input: string } {
  return {
    instructions:
      "You decide whether a new topic candidate should be merged into one of the existing workspace-wide canonical topics, or should become its own new canonical topic. Use only the provided topics. Reply using the JSON schema.",
    input: [
      "New topic candidate:",
      `name: ${params.candidateName}`,
      `description: ${params.candidateDescription}`,
      "",
      "Existing canonical topics (nearest neighbors):",
      formatCandidates(params.topics),
      "",
      "Does the candidate represent the same idea as one of these canonical topics? Or is it distinct enough to become its own new canonical topic?",
      'If it matches one, set decision to "merge" and canonical_topic_id to that topic\'s id.',
      'If it is distinct, set decision to "create" and canonical_topic_id to null.',
    ].join("\n"),
  };
}

const CANONICAL_TOPIC_REGENERATION_INSTRUCTIONS = `You maintain the name and description of a workspace-wide canonical topic that aggregates several supporting topics from conversations and pages.

Given the canonical topic's current name/description and a sample of the topics currently supporting it, produce a refreshed name and description that best represents the whole set.

Produce:
- name: a short, distinctive human-readable name for the canonical topic
- description: a concise description of what the topic covers

The name should normally be 2-8 words.
The description should normally be 1-3 sentences.
Prefer a name/description broad enough to cover all the supporting evidence, not just the most recent one.`;

export function buildRegenerationPrompt(params: {
  currentName: string;
  currentDescription: string;
  evidenceTexts: string[];
}): { instructions: string; input: string } {
  const evidenceLines =
    params.evidenceTexts.length === 0
      ? ["(none)"]
      : params.evidenceTexts.map((text, index) => `${index + 1}. ${text}`);

  return {
    instructions: CANONICAL_TOPIC_REGENERATION_INSTRUCTIONS,
    input: [
      "Current canonical topic:",
      `name: ${params.currentName}`,
      `description: ${params.currentDescription}`,
      "",
      "Supporting evidence topics:",
      ...evidenceLines,
    ].join("\n"),
  };
}
