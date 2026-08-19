import { PAGE_CHUNK_CONFIG } from "@/semantic/pages/page-chunks/engine/config";

export const PAGE_EMBEDDING_CONFIG = {
  /** Rows claimed per `claim_page_chunk_embedding_batch` call. */
  PAGE_EMBEDDING_BATCH_SIZE: 20,
  PAGE_EMBEDDING_MODEL: PAGE_CHUNK_CONFIG.PAGE_EMBEDDING_MODEL,
  /** Exponential backoff base for transient failures. */
  BASE_DELAY_RETRY_MS: 10_000,
  /** Transient backoffs before the row goes on a long cooldown (CTI pattern). */
  MAX_TRANSIENT_BACKOFFS: 5,
  /** Long cooldown applied after the transient budget is exhausted. */
  COOLDOWN_MS: 24 * 60 * 60 * 1000,
  /** Stale PROCESSING recovery window for `claim_page_chunk_embedding_batch`. */
  STALE_AFTER_MS: 10 * 60 * 1000,
  /** Max batches per cron tick to avoid worker CPU timeout. */
  MAX_BATCHES_PER_TICK: 5,
} as const;
