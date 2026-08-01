import { EMBEDDING_CONFIG } from "./config";

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export function isTransientEmbeddingError(status: number): boolean {
  return TRANSIENT_STATUS_CODES.has(status);
}

export function isPermanentEmbeddingError(status: number): boolean {
  return !isTransientEmbeddingError(status);
}

export function getNextRetryAt(retryCount: number, now = Date.now()): Date {
  const { BASE_DELAY_RETRY_MS, MAX_DELAY_RETRY_MS } = EMBEDDING_CONFIG;

  const delay = Math.min(
    BASE_DELAY_RETRY_MS * 2 ** retryCount + Math.random() * BASE_DELAY_RETRY_MS,
    MAX_DELAY_RETRY_MS,
  );

  return new Date(now + delay);
}

export function hasExceededMaxRetries(retryCount: number): boolean {
  return retryCount >= EMBEDDING_CONFIG.MAX_RETRY_COUNT;
}

export function formatStaleAfterInterval(): string {
  return `${EMBEDDING_CONFIG.MAX_DELAY_RETRY_MS} milliseconds`;
}
