const LIST_LINE_PATTERN =
  /^\s*(?:[-*]|\d+[.)]|[a-zA-Z][.)]|[IVXLCDM]+[.)])\s+(.*)$/;

export function normalizePlainTextLists(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const match = LIST_LINE_PATTERN.exec(line);
      if (!match) return line;
      const content = match[1].trim();
      return content ? `- ${content}` : line;
    })
    .join("\n");
}
