import { PAGE_EMBEDDING_CONFIG } from "./config";

const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isTransientEmbeddingError(status: number): boolean {
  return TRANSIENT_STATUS_CODES.has(status);
}

export function getNextRetryAt(attempts: number, now = Date.now()): Date {
  const { BASE_DELAY_RETRY_MS } = PAGE_EMBEDDING_CONFIG;
  const exponent = Math.max(0, attempts - 1);
  const delay = BASE_DELAY_RETRY_MS * 2 ** exponent + Math.random() * (BASE_DELAY_RETRY_MS * 0.1);
  return new Date(now + delay);
}

export function getCooldownUntil(now = Date.now()): Date {
  return new Date(now + PAGE_EMBEDDING_CONFIG.COOLDOWN_MS);
}

export function hasExceededTransientBackoffs(attempts: number): boolean {
  return attempts >= PAGE_EMBEDDING_CONFIG.MAX_TRANSIENT_BACKOFFS;
}

/** Postgres interval for chunk/topic claim RPCs `p_stale_after`. */
export function formatStaleAfterInterval(): string {
  return `${PAGE_EMBEDDING_CONFIG.STALE_AFTER_MS} milliseconds`;
}
