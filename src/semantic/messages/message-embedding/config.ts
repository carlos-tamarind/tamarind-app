export const EMBEDDING_CONFIG = {
  EMBEDDING_BATCH_SIZE: 64,
  OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
  BASE_DELAY_RETRY_MS: 5_000,
  MAX_DELAY_RETRY_MS: 60_000 * 10,
  MAX_RETRY_COUNT: 10,
  /** Max batches processed per cron tick to avoid worker CPU timeout. */
  MAX_BATCHES_PER_TICK: 10,
} as const;
