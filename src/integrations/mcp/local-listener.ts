import { createServer, type IncomingMessage } from "node:http";
import { randomBytes } from "node:crypto";
import { z } from "zod/v4";
import { pairingPage } from "./pairing-page";
import { PairingError, type PairingState } from "./pairing-state";
import {
  pairingStartSchema,
  pairingCompleteSchema,
  pairingCancelSchema,
  renewalSchema,
  disconnectSchema,
} from "./protocol";

async function readBody(request: IncomingMessage) {
  if (!(request.headers["content-type"] ?? "").startsWith("application/json"))
    throw new PairingError("Use JSON.");
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (length > 16_384) throw new PairingError("The request is too large.");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export async function startLocalListener(state: PairingState, appOrigin: string, port = 0) {
  let origin = "";
  const server = createServer(
    { requestTimeout: 10_000, headersTimeout: 10_000 },
    (request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "no-referrer");
      const json = (body: unknown, status = 200) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(body));
      };
      void (async () => {
        // A strict Host check also prevents DNS-rebinding access to this listener.
        if (!origin || request.headers.host !== new URL(origin).host) {
          json({ error: "Forbidden" }, 403);
          return;
        }
        if (request.method === "GET" && request.url === "/connect") {
          const nonce = randomBytes(16).toString("base64");
          response.setHeader(
            "Content-Security-Policy",
            `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
          );
          response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          response.end(pairingPage(appOrigin, nonce));
          return;
        }
        if (request.method !== "POST") {
          json({ error: "Not found" }, 404);
          return;
        }
        if (
          request.headers.origin !== new URL(origin).origin ||
          request.headers["sec-fetch-site"] === "cross-site"
        ) {
          json({ error: "Forbidden" }, 403);
          return;
        }
        const raw = await readBody(request);
        switch (request.url) {
          case "/pair/start": {
            const input = pairingStartSchema.parse(raw);
            json(state.start(input.code, input.nonce));
            break;
          }
          case "/pair/complete":
            json(await state.complete(pairingCompleteSchema.parse(raw)));
            break;
          case "/pair/cancel":
            state.cancelAttempt(pairingCancelSchema.parse(raw));
            json({ ok: true });
            break;
          case "/session":
            json(await state.renew(renewalSchema.parse(raw)));
            break;
          case "/disconnect": {
            const input = disconnectSchema.parse(raw);
            state.disconnect(input.connectionId, input.credential);
            json({ ok: true });
            break;
          }
          default:
            json({ error: "Not found" }, 404);
        }
      })().catch((error: unknown) => {
        if (!response.headersSent)
          json(
            { error: error instanceof PairingError ? error.message : "Invalid pairing request." },
            error instanceof PairingError ||
              error instanceof z.ZodError ||
              error instanceof SyntaxError
              ? 400
              : 500,
          );
        else response.end();
      });
    },
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Pairing listener failed.");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
