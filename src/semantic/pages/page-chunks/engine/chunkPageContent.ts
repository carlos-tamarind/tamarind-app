import { computeMessageChecksum } from "@/semantic/messages/message-checksum/computeMessageChecksum";

import { PAGE_CHUNK_HARD_LIMIT_TOKENS } from "./config";
import { countTokens } from "./countTokens";

export type ProposedPageChunk = {
  content: string;
  checksum: string;
  token_count: number;
};

type TipTapNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  text?: string;
  content?: TipTapNode[];
};

type PageBlock = {
  text: string;
  isHeading: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNode(value: unknown): TipTapNode | null {
  if (!isRecord(value)) return null;
  return value as TipTapNode;
}

function inlineText(node: TipTapNode | null | undefined): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (node.type === "hardBreak") return "\n";
  if (node.type === "mention") {
    const label = node.attrs?.label;
    return typeof label === "string" ? label : "";
  }
  if (!node.content) return "";
  return node.content.map((child) => inlineText(child)).join("");
}

function serializeListItems(node: TipTapNode, ordered: boolean): string {
  const items = node.content ?? [];
  return items
    .map((item, index) => {
      const body = (item.content ?? [])
        .map((child) => serializeBlock(child).trim())
        .filter(Boolean)
        .join("\n");
      if (!body) return "";
      if (item.type === "taskItem") {
        const checked = item.attrs?.checked === true;
        return `- [${checked ? "x" : " "}] ${body}`;
      }
      if (ordered) return `${index + 1}. ${body}`;
      return `- ${body}`;
    })
    .filter(Boolean)
    .join("\n");
}

function serializeBlock(node: TipTapNode): string {
  switch (node.type) {
    case "heading": {
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 1;
      const marks = "#".repeat(Math.min(Math.max(level, 1), 6));
      return `${marks} ${inlineText(node)}`.trim();
    }
    case "paragraph":
      return inlineText(node).trim();
    case "blockquote": {
      const inner = (node.content ?? [])
        .map((child) => serializeBlock(child))
        .filter(Boolean)
        .join("\n");
      return inner
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    }
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      const code = inlineText(node);
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    case "bulletList":
    case "taskList":
      return serializeListItems(node, false);
    case "orderedList":
      return serializeListItems(node, true);
    case "horizontalRule":
      return "";
    default:
      if (node.content?.length) {
        return node.content.map((child) => serializeBlock(child)).filter(Boolean).join("\n\n");
      }
      return inlineText(node).trim();
  }
}

function collectAllText(node: TipTapNode): string {
  const parts: string[] = [];
  if (typeof node.text === "string") parts.push(node.text);
  if (node.type === "mention" && typeof node.attrs?.label === "string") {
    parts.push(node.attrs.label);
  }
  for (const child of node.content ?? []) {
    parts.push(collectAllText(child));
  }
  return parts.filter(Boolean).join(" ");
}

function topLevelBlocks(doc: TipTapNode): PageBlock[] {
  const children = doc.content ?? [];
  const blocks: PageBlock[] = [];
  for (const child of children) {
    const text = serializeBlock(child).trim();
    if (!text) continue;
    blocks.push({ text, isHeading: child.type === "heading" });
  }
  if (blocks.length === 0) {
    const fallback = collectAllText(doc).replace(/\s+/g, " ").trim();
    if (fallback) blocks.push({ text: fallback, isHeading: false });
  }
  return blocks;
}

function joinBlocks(blocks: PageBlock[]): string {
  return blocks.map((block) => block.text).join("\n\n");
}

function packBlocks(blocks: PageBlock[]): PageBlock[][] {
  const packed: PageBlock[][] = [];
  let current: PageBlock[] = [];

  const endsWithHeading = () =>
    current.length > 0 && current[current.length - 1].isHeading;

  const flush = () => {
    if (current.length === 0) return;
    packed.push(current);
    current = [];
  };

  for (const block of blocks) {
    if (current.length === 0) {
      current = [block];
      continue;
    }

    const candidate = [...current, block];
    const candidateTokens = countTokens(joinBlocks(candidate));

    if (candidateTokens <= PAGE_CHUNK_HARD_LIMIT_TOKENS || endsWithHeading()) {
      current = candidate;
      continue;
    }

    flush();
    current = [block];
  }

  flush();
  return packed;
}

export function chunkPageContent(content: unknown): ProposedPageChunk[] {
  const doc = asNode(content);
  if (!doc) return [];

  const root = doc.type === "doc" ? doc : { type: "doc", content: [doc] };
  const blocks = topLevelBlocks(root);
  const groups = packBlocks(blocks);

  const chunks: ProposedPageChunk[] = [];
  for (const group of groups) {
    const text = joinBlocks(group).trim();
    if (!text) continue;
    const token_count = countTokens(text);
    if (token_count <= 0) continue;
    chunks.push({
      content: text,
      checksum: computeMessageChecksum(text),
      token_count,
    });
  }
  return chunks;
}
