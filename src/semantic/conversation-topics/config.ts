export const CTI_CONFIG = {
  BASE_DELAY_RETRY_MS: 10_000,
  MAX_TRANSIENT_BACKOFFS: 5,
  CONVERSATION_HALT_MS: 24 * 60 * 60 * 1000,
  /** Stale PROCESSING recovery interval for claim_conversation_topic_job. */
  STALE_AFTER_MS: 10 * 60 * 1000,
  /** Max jobs processed per cron tick to avoid worker CPU timeout. */
  MAX_JOBS_PER_TICK: 50,
} as const;
