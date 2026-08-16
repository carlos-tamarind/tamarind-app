export class CtiPermanentError extends Error {
  readonly kind = "permanent" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CtiPermanentError";
  }
}

export class CtiTransientError extends Error {
  readonly kind = "transient" as const;
  readonly globalInfra: boolean;

  constructor(
    message: string,
    options?: { cause?: unknown; globalInfra?: boolean },
  ) {
    super(message, options);
    this.name = "CtiTransientError";
    this.globalInfra = options?.globalInfra ?? false;
  }
}
