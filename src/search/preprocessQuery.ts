import { isEmojiOnly, removeEmojis } from "@/lib/text/emojis";

export function preprocessQuery(raw: string): string | null {
  if (isEmojiOnly(raw)) return null;

  let text = raw.trim();
  if (!text) return null;

  text = removeEmojis(text);
  text = text.replace(/\s+/g, " ").trim();

  if (!text || text.length < 3) return null;

  return text;
}
