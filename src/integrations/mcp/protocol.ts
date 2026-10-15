import { z } from "zod/v4";
import { agentSessionSchema } from "../../search/agents/schema";

export const BRIDGE_PROTOCOL = "tamarind-mcp-v1";
export const PAIRING_TTL_MS = 5 * 60_000;
export const CONNECTION_LEASE_MS = 5 * 60_000;
export const HEARTBEAT_MS = 30_000;
export const HTTP_TIMEOUT_MS = 15_000;
const id = z.string().uuid();
const secret = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const code = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
const token = z.string().min(1).max(8192);
const base = { protocol: z.literal(BRIDGE_PROTOCOL), requestId: id };

export const browserCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("prove"), code, nonce: id }).strict(),
  z
    .object({
      ...base,
      type: z.literal("approve"),
      attemptId: id,
      challenge: secret,
      nonce: id,
      workspaceId: id,
      accessToken: token,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("renew"),
      connectionId: id,
      sequence: z.number().int().positive(),
      accessToken: token,
    })
    .strict(),
  z.object({ ...base, type: z.literal("disconnect"), connectionId: id }).strict(),
]);

export const bridgeResponseSchema = z.discriminatedUnion("type", [
  z.object({ protocol: z.literal(BRIDGE_PROTOCOL), type: z.literal("ready") }).strict(),
  z
    .object({ ...base, type: z.literal("challenge"), attemptId: id, challenge: secret, nonce: id })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("connected"),
      connectionId: id,
      session: agentSessionSchema,
      leaseExpiresAt: z.number(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("renewed"),
      connectionId: id,
      session: agentSessionSchema,
      leaseExpiresAt: z.number(),
    })
    .strict(),
  z.object({ ...base, type: z.literal("disconnected"), connectionId: id }).strict(),
  z.object({ ...base, type: z.literal("error"), message: z.string().max(200) }).strict(),
]);

export const pairingStartSchema = z.object({ code, nonce: id }).strict();
export const pairingCompleteSchema = z
  .object({ attemptId: id, challenge: secret, nonce: id, workspaceId: id, accessToken: token })
  .strict();
export const pairingCancelSchema = pairingCompleteSchema.omit({
  workspaceId: true,
  accessToken: true,
});
export const renewalSchema = z
  .object({
    connectionId: id,
    credential: secret,
    sequence: z.number().int().positive(),
    accessToken: token,
  })
  .strict();
export const disconnectSchema = z.object({ connectionId: id, credential: secret }).strict();
export type BrowserCommand = z.infer<typeof browserCommandSchema>;
export type BridgeResponse = z.infer<typeof bridgeResponseSchema>;

export function parsePairingOrigin(address: string): string {
  const url = new URL(address);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(address) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Use http://127.0.0.1:<port> from the local MCP diagnostics.");
  }
  return url.origin;
}

export function parseHostedOrigin(address: string): string {
  const url = new URL(address);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("TAMARIND_APP_URL must be an HTTPS origin without a path or credentials.");
  }
  return url.origin;
}
