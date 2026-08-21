import type { Node as PmNode } from "@tiptap/pm/model";

/** Turn chunk markdown into plaintext needles, longest first. */
export function chunkContentNeedles(content: string): string[] {
  const lines = content
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^>\s?/, "")
        .replace(/^[-*]\s+\[[ xX]\]\s+/, "")
        .replace(/^[-*+]\s+/, "")
        .replace(/^\d+\.\s+/, "")
        .replace(/^```\w*\s*/, "")
        .trim(),
    )
    .filter((line) => line.length >= 8);

  const needles: string[] = [];
  for (const line of lines) {
    needles.push(line);
    if (line.length > 80) needles.push(line.slice(0, 80).trimEnd());
    if (line.length > 40) needles.push(line.slice(0, 40).trimEnd());
  }
  return [...new Set(needles)];
}

function collectTextParts(doc: PmNode): Array<{ pos: number; text: string }> {
  const parts: Array<{ pos: number; text: string }> = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      parts.push({ pos, text: node.text });
    }
  });
  return parts;
}

export function findPlainTextRange(
  doc: PmNode,
  needle: string,
): { from: number; to: number } | null {
  if (!needle) return null;
  const parts = collectTextParts(doc);
  const joined = parts.map((part) => part.text).join("");
  const idx = joined.indexOf(needle);
  if (idx < 0) return null;

  const end = idx + needle.length;
  let cursor = 0;
  let from = -1;
  let to = -1;
  for (const part of parts) {
    const next = cursor + part.text.length;
    if (from < 0 && idx < next) {
      from = part.pos + (idx - cursor);
    }
    if (end <= next) {
      to = part.pos + (end - cursor);
      break;
    }
    cursor = next;
  }
  if (from < 0 || to <= from) return null;
  return { from, to };
}

export function findChunkRangeInDoc(
  doc: PmNode,
  chunkContent: string,
): { from: number; to: number } | null {
  for (const needle of chunkContentNeedles(chunkContent)) {
    const range = findPlainTextRange(doc, needle);
    if (range) return range;
  }
  return null;
}
