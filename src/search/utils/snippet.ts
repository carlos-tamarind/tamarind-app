const MIN_SNIPPET_LENGTH = 80;
const MAX_SNIPPET_LENGTH = 180;

const SENTENCE_END = /[.!?]\s+/g;

function findSentenceStart(text: string, matchIndex: number): number {
  const before = text.slice(0, matchIndex);
  const matches = [...before.matchAll(SENTENCE_END)];
  if (matches.length === 0) return 0;
  const last = matches[matches.length - 1];
  return (last.index ?? 0) + last[0].length;
}

function findSentenceEnd(text: string, matchEnd: number): number {
  const after = text.slice(matchEnd);
  const match = SENTENCE_END.exec(after);
  if (!match || match.index === undefined) return text.length;
  return matchEnd + match.index + 1;
}

function padSnippet(text: string, matchIndex: number, matchLength: number): string {
  const halfWindow = Math.floor((MIN_SNIPPET_LENGTH - matchLength) / 2);
  let start = Math.max(0, matchIndex - halfWindow);
  let end = Math.min(text.length, matchIndex + matchLength + halfWindow);

  if (end - start < MIN_SNIPPET_LENGTH) {
    const deficit = MIN_SNIPPET_LENGTH - (end - start);
    start = Math.max(0, start - Math.floor(deficit / 2));
    end = Math.min(text.length, end + Math.ceil(deficit / 2));
  }

  return text.slice(start, end).trim();
}

function truncateAroundMatch(text: string, matchIndex: number, matchLength: number): string {
  const available = MAX_SNIPPET_LENGTH - 3;
  const matchStart = Math.max(0, matchIndex - Math.floor((available - matchLength) / 2));
  let snippet = text.slice(matchStart, matchStart + available).trim();

  if (matchStart > 0) snippet = `…${snippet}`;
  if (matchStart + available < text.length) snippet = `${snippet}…`;

  return snippet;
}

export function extractSnippet(text: string, query: string): string {
  if (!text) return "";

  const normalizedQuery = query.trim();
  if (!normalizedQuery) return text.slice(0, MAX_SNIPPET_LENGTH);

  const lowerText = text.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    const fallback = text.slice(0, MAX_SNIPPET_LENGTH).trim();
    return text.length > MAX_SNIPPET_LENGTH ? `${fallback}…` : fallback;
  }

  let sentenceStart = findSentenceStart(text, matchIndex);
  let sentenceEnd = findSentenceEnd(text, matchIndex + normalizedQuery.length);
  let snippet = text.slice(sentenceStart, sentenceEnd).trim();

  if (snippet.length < MIN_SNIPPET_LENGTH) {
    snippet = padSnippet(text, matchIndex, normalizedQuery.length);
  }

  if (snippet.length > MAX_SNIPPET_LENGTH) {
    snippet = truncateAroundMatch(text, matchIndex, normalizedQuery.length);
  }

  const prefixEllipsis = sentenceStart > 0 && !snippet.startsWith("…");
  const suffixEllipsis =
    sentenceEnd < text.length && !snippet.endsWith("…") && snippet.length <= MAX_SNIPPET_LENGTH;

  if (prefixEllipsis) snippet = `…${snippet}`;
  if (suffixEllipsis) snippet = `${snippet}…`;

  return snippet;
}
