export class PageSemanticPermanentError extends Error {
  readonly kind = "permanent" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PageSemanticPermanentError";
  }
}

export class PageSemanticTransientError extends Error {
  readonly kind = "transient" as const;
  readonly globalInfra: boolean;

  constructor(
    message: string,
    options?: { cause?: unknown; globalInfra?: boolean },
  ) {
    super(message, options);
    this.name = "PageSemanticTransientError";
    this.globalInfra = options?.globalInfra ?? false;
  }
}
