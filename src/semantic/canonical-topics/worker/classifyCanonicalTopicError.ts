import { CanonicalTopicPermanentError, CanonicalTopicTransientError } from "../errors";

export type CanonicalTopicErrorClassification =
  | { kind: "permanent"; summary: string }
  | { kind: "transient"; summary: string; globalInfra: boolean };

const TRANSIENT_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const PERMANENT_HTTP_STATUS = new Set([400, 401, 403, 404, 405, 409, 410, 422]);

const GLOBAL_INFRA_PATTERNS = [
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /fetch failed/i,
  /network error/i,
  /connection (?:reset|refused|timeout|terminated)/i,
  /socket hang up/i,
  /supabase.*(?:5\d{2}|connection|timeout)/i,
  /database.*(?:connection|unavailable|timeout)/i,
  /postgrest.*(?:5\d{2}|connection)/i,
];

function summarizeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.length > 0) {
      return record.message.slice(0, 500);
    }
    try {
      return JSON.stringify(error).slice(0, 500);
    } catch {
      // fall through to String() below
    }
  }

  return String(error).slice(0, 500);
}

function extractHttpStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;

  const record = error as Record<string, unknown>;

  if (typeof record.status === "number") return record.status;
  if (typeof record.statusCode === "number") return record.statusCode;

  const code = record.code;
  if (typeof code === "string" && /^\d{3}$/.test(code)) {
    return Number(code);
  }

  return null;
}

function isGlobalInfraMessage(message: string): boolean {
  return GLOBAL_INFRA_PATTERNS.some((pattern) => pattern.test(message));
}

function isZodLikeError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  return record.name === "ZodError" || Array.isArray(record.issues);
}

export function classifyCanonicalTopicError(error: unknown): CanonicalTopicErrorClassification {
  const summary = summarizeError(error);

  if (error instanceof CanonicalTopicPermanentError) {
    return { kind: "permanent", summary };
  }

  if (error instanceof CanonicalTopicTransientError) {
    return {
      kind: "transient",
      summary,
      globalInfra: error.globalInfra || isGlobalInfraMessage(summary),
    };
  }

  if (isZodLikeError(error)) {
    return { kind: "permanent", summary: `validation: ${summary}` };
  }

  const status = extractHttpStatus(error);
  if (status !== null) {
    if (TRANSIENT_HTTP_STATUS.has(status)) {
      return {
        kind: "transient",
        summary: `${status}: ${summary}`,
        globalInfra: status >= 500,
      };
    }
    if (PERMANENT_HTTP_STATUS.has(status)) {
      return { kind: "permanent", summary: `${status}: ${summary}` };
    }
  }

  if (/timeout/i.test(summary) || /rate limit/i.test(summary)) {
    return {
      kind: "transient",
      summary,
      globalInfra: isGlobalInfraMessage(summary),
    };
  }

  if (
    /invalid|malformed|unexpected|unsupported|impossible|corrupt|missing required/i.test(summary)
  ) {
    return { kind: "permanent", summary };
  }

  return {
    kind: "transient",
    summary,
    globalInfra: isGlobalInfraMessage(summary),
  };
}
