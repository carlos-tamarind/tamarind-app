const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function isSafeExternalUrl(href: string): boolean {
  try {
    const url = new URL(href, typeof window !== "undefined" ? window.location.origin : "https://example.com");
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

export function openExternalUrl(href: string): boolean {
  if (!isSafeExternalUrl(href)) return false;
  window.open(href, "_blank", "noopener,noreferrer");
  return true;
}
