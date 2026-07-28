function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripInnerTags(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

function removeMsgQuoteBlocks(html: string): string {
  const openRe = /<div\b[^>]*\bclass="[^"]*\bmsg-quote\b[^"]*"[^>]*>/gi;
  let result = html;
  let match: RegExpExecArray | null;

  openRe.lastIndex = 0;
  while ((match = openRe.exec(result))) {
    const divRe = /<\/?div\b[^>]*>/gi;
    divRe.lastIndex = match.index + match[0].length;
    let depth = 1;
    let closeEnd = -1;

    let divMatch: RegExpExecArray | null;
    while ((divMatch = divRe.exec(result))) {
      if (divMatch[0].startsWith("</")) {
        depth--;
        if (depth === 0) {
          closeEnd = divMatch.index + divMatch[0].length;
          break;
        }
      } else {
        depth++;
      }
    }

    if (closeEnd === -1) {
      result = result.slice(0, match.index);
      break;
    }

    result = result.slice(0, match.index) + result.slice(closeEnd);
    openRe.lastIndex = match.index;
  }

  return result;
}

function removeTaggedBlocks(html: string, tagName: string): string {
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  let result = html;
  let match: RegExpExecArray | null;

  openRe.lastIndex = 0;
  while ((match = openRe.exec(result))) {
    const closeRe = new RegExp(`<\\/${tagName}\\b[^>]*>`, "gi");
    closeRe.lastIndex = match.index + match[0].length;
    let depth = 1;
    let closeEnd = -1;

    let tagMatch: RegExpExecArray | null;
    const anyTagRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
    anyTagRe.lastIndex = match.index + match[0].length;

    while ((tagMatch = anyTagRe.exec(result))) {
      if (tagMatch[0].startsWith("</")) {
        depth--;
        if (depth === 0) {
          closeEnd = tagMatch.index + tagMatch[0].length;
          break;
        }
      } else {
        depth++;
      }
    }

    if (closeEnd === -1) {
      result = result.slice(0, match.index);
      break;
    }

    result = result.slice(0, match.index) + result.slice(closeEnd);
    openRe.lastIndex = match.index;
  }

  return result;
}

function replaceMentionSpans(html: string): string {
  let result = html;

  result = result.replace(
    /<span\b[^>]*\bclass="[^"]*\bmention-page\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    (_, label) => `[[PAGE: ${decodeHtmlEntities(stripInnerTags(label)).trim()}]]`,
  );

  result = result.replace(
    /<span\b[^>]*\bclass="[^"]*\b(?:mention-user|mention-member)\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    (_, name) => `[[USER: ${decodeHtmlEntities(stripInnerTags(name)).trim()}]]`,
  );

  return result;
}

function removeSvgBlocks(html: string): string {
  return removeTaggedBlocks(html, "svg");
}

function stripDataAttributes(html: string): string {
  return html.replace(/\sdata-[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function convertPreCodeBlocks(html: string): string {
  return html.replace(/<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, code) => {
    const content = decodeHtmlEntities(stripInnerTags(code)).replace(/^\n+|\n+$/g, "");
    return `[[CODE_BLOCK]]\n${content}\n[[/CODE_BLOCK]]`;
  });
}

function convertInlineCode(html: string): string {
  return html.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, code) => {
    const content = decodeHtmlEntities(stripInnerTags(code));
    return `[[CODE]]${content}[[/CODE]]`;
  });
}

function extractAttribute(tag: string, attribute: string): string | undefined {
  const pattern = new RegExp(`${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = pattern.exec(tag);
  if (!match) return undefined;
  return match[1] ?? match[2] ?? match[3];
}

function convertAnchors(html: string): string {
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, attrs, inner) => {
    const href = extractAttribute(`<a ${attrs}>`, "href");
    if (href) return decodeHtmlEntities(href);
    return decodeHtmlEntities(stripInnerTags(inner)).trim();
  });
}

function convertImages(html: string): string {
  return html.replace(/<img\b([^>]*)\/?>/gi, (_, attrs) => {
    const alt = extractAttribute(`<img ${attrs}>`, "alt");
    if (alt && alt.trim()) {
      return `[[IMAGE: ${decodeHtmlEntities(alt).trim()}]]`;
    }
    return "[[IMAGE]]";
  });
}

function unwrapListWrappers(html: string): string {
  return html
    .replace(/<\/?ul\b[^>]*>/gi, "")
    .replace(/<\/?ol\b[^>]*>/gi, "");
}

function convertTables(html: string): string {
  return html.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, inner) => {
    let text = inner;
    text = text.replace(/<\/?(?:thead|tbody|tfoot|caption)\b[^>]*>/gi, "");
    text = text.replace(/<tr\b[^>]*>/gi, "\n");
    text = text.replace(/<\/tr>/gi, "");
    text = text.replace(/<t[hd]\b[^>]*>/gi, "\t");
    text = text.replace(/<\/t[hd]>/gi, "");
    text = stripInnerTags(text);
    return text.trim();
  });
}

function convertListItems(html: string): string {
  return html.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, content) => {
    const text = decodeHtmlEntities(stripInnerTags(content)).trim();
    return text ? `- ${text}\n` : "";
  });
}

function convertHeadings(html: string): string {
  return html.replace(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, content) => {
    const text = decodeHtmlEntities(stripInnerTags(content)).trim();
    return text ? `${text}\n` : "\n";
  });
}

function convertParagraphsAndBreaks(html: string): string {
  return html
    .replace(/<p\b[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "")
    .replace(/<br\b[^>]*\/?>/gi, "\n");
}

function unwrapInlineTags(html: string, tagNames: string[]): string {
  let result = html;
  for (const tag of tagNames) {
    result = result.replace(
      new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"),
      (_, content) => decodeHtmlEntities(stripInnerTags(content)),
    );
  }
  return result;
}

function unwrapGenericSpans(html: string): string {
  return html.replace(/<span\b[^>]*>([\s\S]*?)<\/span>/gi, (_, content) => content);
}

function convertGenericDivs(html: string): string {
  return html
    .replace(/<div\b[^>]*>/gi, "\n")
    .replace(/<\/div>/gi, "");
}

function stripRemainingTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function collapseNewlines(text: string): string {
  return text.replace(/\n{3,}/g, "\n").trim();
}

export function transformHtmlToText(raw: string): string {
  if (!/<[a-z][\s\S]*>/i.test(raw)) {
    return raw;
  }

  let result = raw;
  result = removeMsgQuoteBlocks(result);
  result = removeTaggedBlocks(result, "blockquote");
  result = replaceMentionSpans(result);
  result = removeSvgBlocks(result);
  result = stripDataAttributes(result);
  result = convertPreCodeBlocks(result);
  result = convertInlineCode(result);
  result = convertAnchors(result);
  result = convertImages(result);
  result = unwrapListWrappers(result);
  result = convertTables(result);
  result = convertListItems(result);
  result = convertHeadings(result);
  result = convertParagraphsAndBreaks(result);
  result = unwrapInlineTags(result, ["strong", "em", "b", "i"]);
  result = unwrapGenericSpans(result);
  result = convertGenericDivs(result);
  result = stripRemainingTags(result);
  result = decodeHtmlEntities(result);
  result = collapseNewlines(result);

  return result;
}
