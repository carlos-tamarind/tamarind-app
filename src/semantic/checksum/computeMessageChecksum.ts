import { createHash } from "node:crypto";

/**
 * Returns SHA256 hex digest of normalized text — exactly 64 characters.
 * Used before insert to populate message_semantics.checksum and for dedup.
 *
 * Deterministic: same input → same 64-char hex output. Pure — no side effects.
 */
export function computeMessageChecksum(normalizedText: string): string {
  return createHash("sha256").update(normalizedText, "utf8").digest("hex");
}
