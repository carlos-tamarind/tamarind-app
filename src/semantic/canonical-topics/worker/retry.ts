import { CANONICAL_TOPIC_WORKER_CONFIG } from "./config";

export function getNextRetryAt(attempts: number, now = Date.now()): Date {
  const { BASE_DELAY_RETRY_MS } = CANONICAL_TOPIC_WORKER_CONFIG;

  const exponent = Math.max(0, attempts - 1);
  const delay = BASE_DELAY_RETRY_MS * 2 ** exponent + Math.random() * (BASE_DELAY_RETRY_MS * 0.1);

  return new Date(now + delay);
}

export function getCooldownUntil(now = Date.now()): Date {
  return new Date(now + CANONICAL_TOPIC_WORKER_CONFIG.COOLDOWN_MS);
}

export function hasExceededTransientBackoffs(attempts: number): boolean {
  return attempts >= CANONICAL_TOPIC_WORKER_CONFIG.MAX_TRANSIENT_BACKOFFS;
}

export function formatStaleAfterInterval(): string {
  return `${CANONICAL_TOPIC_WORKER_CONFIG.STALE_AFTER_MS} milliseconds`;
}
