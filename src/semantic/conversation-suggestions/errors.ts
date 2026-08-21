export class ConversationSuggestionPermanentError extends Error {
  readonly kind = "permanent" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ConversationSuggestionPermanentError";
  }
}

export class ConversationSuggestionTransientError extends Error {
  readonly kind = "transient" as const;
  readonly globalInfra: boolean;

  constructor(message: string, options?: { cause?: unknown; globalInfra?: boolean }) {
    super(message, options);
    this.name = "ConversationSuggestionTransientError";
    this.globalInfra = options?.globalInfra ?? false;
  }
}
