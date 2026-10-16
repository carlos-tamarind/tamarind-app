/**
 * Strict sanitizer for internal redirect targets (e.g. ?redirect=... after login).
 *
 * Returns the target only when it is a same-origin relative path that the URL
 * parser resolves without any reinterpretation. Anything else — absolute URLs,
 * protocol-relative URLs ("//evil.com"), backslash tricks, control characters,
 * or values the parser would normalize — returns null.
 */
const DUMMY_ORIGIN = "https://redirect.invalid";

export function sanitizeInternalRedirect(
  target: string | null | undefined,
): string | null {
  if (!target) return null;
  if (target.length > 2048) return null;
  // Printable ASCII only, and never a backslash (used to smuggle
  // protocol-relative URLs past naive startsWith("/") checks).
  if (/[^\u0021-\u007e]|\\/.test(target)) return null;
  // Must be a single-leading-slash relative path; "//" would be protocol-relative.
  if (!target.startsWith("/") || target.startsWith("//")) return null;
  try {
    const url = new URL(target, DUMMY_ORIGIN);
    // A different origin means the string escaped the relative-path context
    // (e.g. an embedded absolute URL or a scheme override).
    if (url.origin !== DUMMY_ORIGIN) return null;
    // Reject anything the parser normalized differently from the raw input,
    // so what we navigate to is byte-for-byte what we validated.
    const rebuilt = url.pathname + url.search + url.hash;
    if (rebuilt !== target) return null;
    return target;
  } catch {
    return null;
  }
}
