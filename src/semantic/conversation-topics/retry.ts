import { CTI_CONFIG } from "./config";

export function getNextRetryAt(attemptCount: number, now = Date.now()): Date {
  const { BASE_DELAY_RETRY_MS } = CTI_CONFIG;

  const exponent = Math.max(0, attemptCount - 1);
  const delay =
    BASE_DELAY_RETRY_MS * 2 ** exponent + Math.random() * (BASE_DELAY_RETRY_MS * 0.1);

  return new Date(now + delay);
}

export function getConversationHaltUntil(now = Date.now()): Date {
  return new Date(now + CTI_CONFIG.CONVERSATION_HALT_MS);
}

export function hasExceededTransientBackoffs(attemptCount: number): boolean {
  return attemptCount >= CTI_CONFIG.MAX_TRANSIENT_BACKOFFS;
}

export function formatStaleAfterInterval(): string {
  return `${CTI_CONFIG.STALE_AFTER_MS} milliseconds`;
}
