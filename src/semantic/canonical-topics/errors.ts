export class CanonicalTopicPermanentError extends Error {
  readonly kind = "permanent" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CanonicalTopicPermanentError";
  }
}

export class CanonicalTopicTransientError extends Error {
  readonly kind = "transient" as const;
  readonly globalInfra: boolean;

  constructor(message: string, options?: { cause?: unknown; globalInfra?: boolean }) {
    super(message, options);
    this.name = "CanonicalTopicTransientError";
    this.globalInfra = options?.globalInfra ?? false;
  }
}
