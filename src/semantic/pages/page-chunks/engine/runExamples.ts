import { PAGE_CHUNK_HARD_LIMIT_TOKENS } from "./config";
import { chunkPageContent } from "./chunkPageContent";
import { countTokens } from "./countTokens";

type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
};

function text(value: string): TipTapNode {
  return { type: "text", text: value };
}

function paragraph(value: string): TipTapNode {
  return { type: "paragraph", content: [text(value)] };
}

function heading(level: number, value: string): TipTapNode {
  return { type: "heading", attrs: { level }, content: [text(value)] };
}

function doc(...content: TipTapNode[]): TipTapNode {
  return { type: "doc", content };
}

function words(count: number): string {
  return Array.from({ length: count }, (_, i) => `word${i}`).join(" ");
}

function assert(label: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`[${label}] ${detail ?? "assertion failed"}`);
  }
}

export function runPageChunkExamples(): void {
  console.log("Running page chunking examples...\n");

  {
    const chunks = chunkPageContent(doc(paragraph("")));
    assert("empty_doc", chunks.length === 0);
    console.log("✓ empty_doc");
  }

  {
    const chunks = chunkPageContent(
      doc(heading(1, "Title"), paragraph("Body of the section.")),
    );
    assert("heading_glued", chunks.length === 1, `got ${chunks.length}`);
    assert(
      "heading_glued_markdown",
      chunks[0].content.startsWith("# Title") && chunks[0].content.includes("Body of the section."),
    );
    console.log("✓ heading_glued");
  }

  {
    const chunks = chunkPageContent(doc(heading(2, "Lonely")));
    assert("trailing_heading_ok", chunks.length === 1);
    assert("trailing_heading_text", chunks[0].content === "## Lonely");
    console.log("✓ trailing_heading_ok");
  }

  {
    const first = words(40);
    const second = words(40);
    const chunks = chunkPageContent(doc(paragraph(first), paragraph(second)));
    assert("small_paragraphs_pack", chunks.length === 1, `got ${chunks.length}`);
    assert("small_paragraphs_join", chunks[0].content.includes(first) && chunks[0].content.includes(second));
    console.log("✓ small_paragraphs_pack");
  }

  {
    let n = 80;
    let oversized = words(n);
    while (countTokens(oversized) <= PAGE_CHUNK_HARD_LIMIT_TOKENS) {
      n += 40;
      oversized = words(n);
    }
    const chunks = chunkPageContent(doc(paragraph(oversized)));
    assert("oversized_block_unsplit", chunks.length === 1, `got ${chunks.length}`);
    assert(
      "oversized_over_hard_cap",
      chunks[0].token_count > PAGE_CHUNK_HARD_LIMIT_TOKENS,
    );
    console.log("✓ oversized_block_unsplit");
  }

  {
    let n = 80;
    let large = words(n);
    while (countTokens(large) <= PAGE_CHUNK_HARD_LIMIT_TOKENS / 2) {
      n += 20;
      large = words(n);
    }
    while (countTokens(`${large}\n\n${large}`) <= PAGE_CHUNK_HARD_LIMIT_TOKENS) {
      n += 20;
      large = words(n);
    }
    const chunks = chunkPageContent(doc(paragraph(large), paragraph(large)));
    assert("hard_cap_splits_paragraphs", chunks.length === 2, `got ${chunks.length}`);
    console.log("✓ hard_cap_splits_paragraphs");
  }

  {
    const a = chunkPageContent(doc(paragraph("stable checksum text")));
    const b = chunkPageContent(doc(paragraph("stable checksum text")));
    assert("checksum_stable", a.length === 1 && b.length === 1 && a[0].checksum === b[0].checksum);
    assert("checksum_hex", /^[a-f0-9]{64}$/.test(a[0].checksum));
    console.log("✓ checksum_stable");
  }

  {
    const chunks = chunkPageContent(
      doc({
        type: "bulletList",
        content: [
          { type: "listItem", content: [paragraph("alpha")] },
          { type: "listItem", content: [paragraph("beta")] },
        ],
      }),
    );
    assert("list_atomic", chunks.length === 1);
    assert("list_markdown", chunks[0].content.includes("- alpha") && chunks[0].content.includes("- beta"));
    console.log("✓ list_atomic");
  }

  console.log("\nAll page chunking examples passed.");
}

const isDirectRun = typeof process !== "undefined" && process.argv[1]?.includes("runExamples");

if (isDirectRun) {
  runPageChunkExamples();
}
