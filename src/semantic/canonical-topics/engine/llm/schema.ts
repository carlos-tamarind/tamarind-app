import { z } from "zod";

import type { LlmJsonSchema } from "@/semantic/llm/types";

export const CANONICAL_TOPIC_ARBITRATION_JSON_SCHEMA: LlmJsonSchema = {
  name: "canonical_topic_arbitration",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["decision", "canonical_topic_id"],
    properties: {
      decision: { type: "string", enum: ["create", "merge"] },
      canonical_topic_id: { type: ["string", "null"] },
    },
  },
};

export const canonicalTopicArbitrationSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("create"),
    canonical_topic_id: z.null(),
  }),
  z.object({
    decision: z.literal("merge"),
    canonical_topic_id: z.string().trim().min(1),
  }),
]);

export type CanonicalTopicArbitrationDecision = z.infer<typeof canonicalTopicArbitrationSchema>;

export const CANONICAL_TOPIC_REGENERATION_JSON_SCHEMA: LlmJsonSchema = {
  name: "canonical_topic_regeneration",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["name", "description"],
    properties: {
      name: { type: "string" },
      description: { type: "string" },
    },
  },
};

export const canonicalTopicRegenerationSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
});

export type CanonicalTopicRegenerationOutput = z.infer<typeof canonicalTopicRegenerationSchema>;
