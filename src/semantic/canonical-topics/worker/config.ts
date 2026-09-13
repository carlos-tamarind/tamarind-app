export const CANONICAL_TOPIC_WORKER_CONFIG = {
  BASE_DELAY_RETRY_MS: 10_000,
  MAX_TRANSIENT_BACKOFFS: 5,
  COOLDOWN_MS: 24 * 60 * 60 * 1000,
  /** Stale PROCESSING recovery interval for claim_canonical_topic_job. */
  STALE_AFTER_MS: 10 * 60 * 1000,
  /** Max jobs processed per cron tick to avoid worker CPU timeout. */
  MAX_JOBS_PER_TICK: 5,
} as const;
