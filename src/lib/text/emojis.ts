const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;

function removeEmojiJoiners(text: string): string {
  return text
    .replace(/\u200d/g, "")
    .replace(/\ufe0f/g, "")
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");
}

export function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const withoutEmoji = removeEmojiJoiners(trimmed.replace(/\s/g, "").replace(EMOJI_REGEX, ""));

  return withoutEmoji.length === 0;
}

export function removeEmojis(text: string): string {
  return removeEmojiJoiners(text.replace(EMOJI_REGEX, ""));
}
