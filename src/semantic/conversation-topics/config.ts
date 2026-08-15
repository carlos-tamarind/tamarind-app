export const CTI_CONFIG = {
  BASE_DELAY_RETRY_MS: 5_000,
  MAX_DELAY_RETRY_MS: 60_000 * 10,
  MAX_RETRY_COUNT: 10,
  /** Max jobs processed per cron tick to avoid worker CPU timeout. */
  MAX_JOBS_PER_TICK: 50,
} as const;
