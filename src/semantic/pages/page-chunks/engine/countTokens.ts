import { encode } from "gpt-tokenizer";

/** cl100k_base token count (same family as text-embedding-3-small). */
export function countTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}
