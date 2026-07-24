import { acknowledgements } from "./acknowledgements";
import { shortcuts } from "./shortcuts";
import type { NormalizationResult } from "./types";

const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;

const NON_TEXT_MESSAGE_TYPES = new Set([
  "file",
  "image",
  "gif",
  "audio",
  "video",
  "attachment",
  "sticker",
  "document",
]);

function skipResult(rawMessage: string, skipReason: string): NormalizationResult {
  return {
    shouldPersist: false,
    rawMessage,
    skipReason,
  };
}

function isNonTextMessage(messageType?: string): boolean {
  if (!messageType) return false;
  return NON_TEXT_MESSAGE_TYPES.has(messageType.toLowerCase());
}

function removeEmojiJoiners(text: string): string {
  return text.replace(/\u200d/g, "").replace(/\ufe0f/g, "");
}

function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const withoutEmoji = removeEmojiJoiners(trimmed.replace(/\s/g, "").replace(EMOJI_REGEX, ""));

  return withoutEmoji.length === 0;
}

function isPunctuationOnly(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/[\p{L}\p{N}]/u.test(trimmed)) return false;
  if (isEmojiOnly(trimmed)) return false;
  return /[^\s]/.test(trimmed);
}

function removeEmojis(text: string): string {
  return removeEmojiJoiners(text.replace(EMOJI_REGEX, ""));
}

function stripMarkdown(text: string): string {
  const codeBlocks: string[] = [];
  let result = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__MD_CODE_${codeBlocks.length - 1}__`;
  });

  const inlineCodes: string[] = [];
  result = result.replace(/`[^`\n]+`/g, (match) => {
    inlineCodes.push(match);
    return `__MD_INLINE_${inlineCodes.length - 1}__`;
  });

  result = result.replace(/^#{1,6}\s+/gm, "");
  result = result.replace(/\*\*([^*]+)\*\*/g, "$1");
  result = result.replace(/\*([^*]+)\*/g, "$1");
  result = result.replace(/__([^_]+)__/g, "$1");
  result = result.replace(/_([^_]+)_/g, "$1");
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  result = result.replace(/^[-*_]{3,}\s*$/gm, "");

  result = result.replace(/__MD_INLINE_(\d+)__/g, (_, index) => {
    return inlineCodes[Number(index)] ?? "";
  });

  result = result.replace(/__MD_CODE_(\d+)__/g, (_, index) => {
    return codeBlocks[Number(index)] ?? "";
  });

  return result;
}

function cleanupText(text: string): string {
  let result = text.trim();
  result = result.replace(/\s*\n+\s*/g, " ");
  result = result.replace(/\s{2,}/g, " ");
  result = result.replace(/([!?.,:;])\1+/g, "$1");
  result = removeEmojis(result);
  result = stripMarkdown(result);
  result = result.replace(/\s{2,}/g, " ").trim();
  return result;
}

function expandShortcuts(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => shortcuts[token.toLowerCase()] ?? token.toLowerCase())
    .join(" ");
}

function sanitizePii(text: string): string {
  let result = text;

  result = result.replace(/\beyj[a-z0-9_-]+\.eyj[a-z0-9_-]+\.[a-z0-9_-]+\b/g, "[JWT]");

  result = result.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, "[TOKEN]");

  result = result.replace(/\b(sk|pk|api)[_-]?[a-z]*[_-]?[A-Za-z0-9]{16,}\b/gi, "[TOKEN]");

  result = result.replace(/\bapi[_-]?key\s*[:=]\s*\S+/gi, "[TOKEN]");

  result = result.replace(/\b(password|passwd|pwd)\s*[:=]\s*\S+/gi, "[PASSWORD]");

  result = result.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]");

  result = result.replace(/\b[a-z]{2}\d{2}[a-z0-9]{11,30}\b/g, "[IBAN]");

  result = result.replace(/\b(?:\d[ -]*?){13,19}\b/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19) {
      return "[IBAN]";
    }
    return match;
  });

  result = result.replace(
    /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}\b/g,
    "[PHONE]",
  );

  result = result.replace(/\bhttps?:\/\/[^\s]+/gi, (url) => {
    if (/[?&]|token|key|auth|session|sig=/i.test(url)) {
      return "[URL]";
    }
    return url;
  });

  return result;
}

function isLowValueAcknowledgement(text: string): boolean {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return false;
  return acknowledgements.has(tokens[0].toLowerCase());
}

export function normalizeMessage(rawMessage: string, messageType?: string): NormalizationResult {
  if (isNonTextMessage(messageType)) {
    return skipResult(rawMessage, "non_text");
  }

  if (isEmojiOnly(rawMessage)) {
    return skipResult(rawMessage, "emoji_only");
  }

  if (isPunctuationOnly(rawMessage)) {
    return skipResult(rawMessage, "punctuation_only");
  }

  const cleaned = cleanupText(rawMessage);
  const expanded = expandShortcuts(cleaned);
  const sanitized = sanitizePii(expanded);

  if (isLowValueAcknowledgement(sanitized)) {
    return {
      shouldPersist: false,
      rawMessage,
      normalizedText: sanitized,
      skipReason: "low_value_ack",
    };
  }

  return {
    shouldPersist: true,
    rawMessage,
    normalizedText: sanitized,
  };
}
