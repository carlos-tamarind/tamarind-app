export type CtiLlmTopic = {
  id: string;
  name: string;
  description: string;
};

function formatTopics(topics: CtiLlmTopic[]): string {
  if (topics.length === 0) return "(none)";
  return topics
    .map(
      (topic) =>
        `- id=${topic.id}\n  name: ${topic.name}\n  description: ${topic.description}`,
    )
    .join("\n");
}

export function buildTier2Prompt(params: {
  normalizedText: string;
  topics: CtiLlmTopic[];
}): { instructions: string; input: string } {
  return {
    instructions:
      "You classify whether a conversation message matches an existing topic theme or should become a brand new topic. Use only the provided topics. Reply using the JSON schema.",
    input: [
      "Inbound message:",
      '"""',
      params.normalizedText,
      '"""',
      "",
      "Existing topics:",
      formatTopics(params.topics),
      "",
      "Does this message match any of the provided topic themes? Or should it become a brand new topic?",
      'If it matches, set decision to "existing" and topic_id to that topic id.',
      'If it is new, set decision to "new" and provide a concise name and description.',
    ].join("\n"),
  };
}

export function buildPromotionPrompt(params: {
  topics: CtiLlmTopic[];
  candidateName: string | null;
  candidateDescription: string | null;
  evidenceTexts: string[];
}): { instructions: string; input: string } {
  const candidateLines = [
    "Current candidate:",
    `name: ${params.candidateName ?? "(none)"}`,
    `description: ${params.candidateDescription ?? "(none)"}`,
  ];

  const evidenceLines =
    params.evidenceTexts.length === 0
      ? ["(none)"]
      : params.evidenceTexts.map((text, index) => `${index + 1}. ${text}`);

  return {
    instructions:
      "You evaluate a topic candidate and its evidence messages. Decide whether they match an existing topic or represent a coherent new topic. Use only the provided topics. Reply using the JSON schema.",
    input: [
      "Existing topics:",
      formatTopics(params.topics),
      "",
      ...candidateLines,
      "",
      "Evidence (normalized originating messages):",
      ...evidenceLines,
      "",
      "Does the current candidate and its evidence match any of the existing topics? If not, what coherent topic would this evidence represent?",
      'If it matches, set decision to "existing" and topic_id to that topic id.',
      'If it is new, set decision to "new" and provide a concise name and description.',
    ].join("\n"),
  };
}
