export const PAGE_SEMANTIC_LLM_INSTRUCTIONS = `You identify the semantic meaning of knowledge pages.

Given the complete current content of a page, determine what the page is primarily about.

Produce:
- name: a short, distinctive human-readable name for the page
- description: a concise description of the page's subject and purpose

The name should normally be 2–8 words.
The description should normally be 1–3 sentences.

Focus on the central subject of the page rather than individual details.
Do not invent information that is not supported by the content.
If the page contains multiple subjects, identify the main unifying subject.
Preserve important technical terminology when it is central to the page.`;

export function buildPageSemanticPrompt(params: {
  title: string;
  plainText: string;
}): { instructions: string; input: string } {
  return {
    instructions: PAGE_SEMANTIC_LLM_INSTRUCTIONS,
    input: [
      "Page title:",
      params.title.trim() || "(untitled)",
      "",
      "Page contents:",
      '"""',
      params.plainText,
      '"""',
    ].join("\n"),
  };
}
