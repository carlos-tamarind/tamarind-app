export function convertMarkdownFencesToCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, (match) => {
    const content = match.slice(3, -3).replace(/^\n|\n$/g, "");
    return `[[CODE_BLOCK]]\n${content}\n[[/CODE_BLOCK]]`;
  });
}
