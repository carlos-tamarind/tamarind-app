import { CTI_CONFIG } from "./config";

export function getNextRetryAt(attemptCount: number, now = Date.now()): Date {
  const { BASE_DELAY_RETRY_MS, MAX_DELAY_RETRY_MS } = CTI_CONFIG;

  const delay = Math.min(
    BASE_DELAY_RETRY_MS * 2 ** attemptCount + Math.random() * BASE_DELAY_RETRY_MS,
    MAX_DELAY_RETRY_MS,
  );

  return new Date(now + delay);
}

export function hasExceededMaxRetries(attemptCount: number): boolean {
  return attemptCount >= CTI_CONFIG.MAX_RETRY_COUNT;
}

export function formatStaleAfterInterval(): string {
  return `${CTI_CONFIG.MAX_DELAY_RETRY_MS} milliseconds`;
}
