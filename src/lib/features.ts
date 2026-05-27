// Single source of truth for feature gating.
// Imported by BOTH client (UI hides/disables actions) and server (requireFeature
// enforces it). Frontend gating is UX only — every gated action MUST also be
// checked server-side.

export type PlanTier = "free" | "pro" | "enterprise";

export const PLAN_TIERS: readonly PlanTier[] = ["free", "pro", "enterprise"] as const;

// Capability map: feature key -> plans that grant it.
// Keep keys flat strings, lowercase, dot-separated by domain.
export const FEATURES = {
  // Pages
  "pages.create": ["free", "pro", "enterprise"],
  "pages.unlimited": ["pro", "enterprise"],
  "pages.externalShare": ["pro", "enterprise"],

  // Conversations
  "conversations.create": ["free", "pro", "enterprise"],
  "conversations.group": ["free", "pro", "enterprise"],

  // Search
  "search.fulltext": ["free", "pro", "enterprise"],
  "search.semantic": ["pro", "enterprise"],

  // Members / invites
  "invites.create": ["free", "pro", "enterprise"],
  "invites.unlimited": ["enterprise"],

  // Workspace admin
  "workspace.manage": ["free", "pro", "enterprise"],

  // AI (post-MVP, schema-ready)
  "ai.suggestions": ["pro", "enterprise"],
} as const satisfies Record<string, readonly PlanTier[]>;

export type FeatureKey = keyof typeof FEATURES;

export function hasFeature(plan: PlanTier, feature: FeatureKey): boolean {
  return (FEATURES[feature] as readonly PlanTier[]).includes(plan);
}

export class FeatureGateError extends Error {
  readonly code = "FEATURE_REQUIRED" as const;
  readonly statusCode = 402;
  constructor(
    public readonly feature: FeatureKey,
    public readonly currentPlan: PlanTier,
  ) {
    super(`Feature "${feature}" requires an upgrade from "${currentPlan}".`);
  }
}
