import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BrowserMcpBridge,
  type BridgeStatus,
  type BrowserSession,
} from "@/integrations/mcp/browser-bridge";
import {
  BRIDGE_PROTOCOL,
  parseHostedOrigin,
  parsePairingOrigin,
  type BrowserCommand,
} from "@/integrations/mcp/protocol";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const connectionId = "33333333-3333-4333-8333-333333333333";
const attemptId = "44444444-4444-4444-8444-444444444444";
const origin = "http://127.0.0.1:43127";

function fixture(blocked = false) {
  let now = 1000;
  let status: BridgeStatus = { phase: "Disconnected" };
  let session: BrowserSession | null = { userId, accessToken: "fake-token" };
  const listeners = new Map<string, (event: MessageEvent) => void>();
  const sent: BrowserCommand[] = [];
  const popup = {
    closed: false,
    close() {
      this.closed = true;
    },
    postMessage(message: BrowserCommand, target: string) {
      assert.equal(target, origin);
      sent.push(message);
    },
  };
  const host = {
    addEventListener: (type: string, fn: (event: MessageEvent) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
    open: (url: string) => {
      assert.equal(url, `${origin}/connect`);
      popup.closed = false;
      return blocked ? null : popup;
    },
    setTimeout: () => 1,
  } as unknown as Window;
  const bridge = new BrowserMcpBridge(
    host,
    workspaceId,
    () => session,
    (next) => {
      status = next;
    },
    () => now,
  );
  const receive = (data: unknown, from = origin, source: unknown = popup) =>
    listeners.get("message")?.({ data, origin: from, source } as MessageEvent);
  const prove = () => {
    bridge.begin(origin, "x".repeat(22));
    receive({ protocol: BRIDGE_PROTOCOL, type: "ready" });
    const request = sent.at(-1)!;
    assert.equal(request.type, "prove");
    if (request.type !== "prove") throw new Error();
    receive({
      protocol: BRIDGE_PROTOCOL,
      type: "challenge",
      requestId: request.requestId,
      nonce: request.nonce,
      attemptId,
      challenge: "y".repeat(43),
    });
  };
  const connected = () => {
    prove();
    bridge.approve();
    const request = sent.at(-1)!;
    receive({
      protocol: BRIDGE_PROTOCOL,
      type: "connected",
      requestId: request.requestId,
      connectionId,
      session: { userId, workspaceId, email: "owner@example.com", expiresAt: now + 3600_000 },
      leaseExpiresAt: now + 300_000,
    });
  };
  return {
    bridge,
    sent,
    receive,
    prove,
    connected,
    popup,
    status: () => status,
    advance: (ms: number) => {
      now += ms;
    },
    setSession: (next: BrowserSession | null) => {
      session = next;
    },
  };
}

describe("browser MCP bridge", () => {
  it("accepts only exact hosted and loopback origins", () => {
    assert.equal(parseHostedOrigin("https://app.tamarind.so/"), "https://app.tamarind.so");
    assert.equal(parsePairingOrigin(origin), origin);
    // URL normalizes an explicit HTTP default port away; it is still valid.
    assert.equal(parsePairingOrigin("http://127.0.0.1:80"), "http://127.0.0.1");
    for (const address of [
      "https://127.0.0.1:43127",
      "http://localhost:43127",
      `${origin}/other`,
      `${origin}?code=secret`,
      "http://user@127.0.0.1:43127",
      "http://127.0.0.1",
    ])
      assert.throws(() => parsePairingOrigin(address));
    for (const address of [
      origin,
      "https://app.tamarind.so/path",
      "https://user@app.tamarind.so",
      "https://app.tamarind.so#token",
    ])
      assert.throws(() => parseHostedOrigin(address));
  });
  it("ignores wrong windows, origins, challenges and stale request IDs", () => {
    const f = fixture();
    f.bridge.begin(origin, "x".repeat(22));
    f.receive({ protocol: BRIDGE_PROTOCOL, type: "ready" }, "https://evil.example");
    f.receive({ protocol: BRIDGE_PROTOCOL, type: "ready" }, origin, {});
    assert.equal(f.sent.length, 0);
    f.receive({ protocol: BRIDGE_PROTOCOL, type: "ready" });
    const request = f.sent[0];
    f.receive({
      protocol: BRIDGE_PROTOCOL,
      type: "challenge",
      requestId: connectionId,
      nonce: attemptId,
      attemptId,
      challenge: "x".repeat(43),
    });
    assert.equal(f.status().phase, "Pairing");
    f.receive({
      protocol: BRIDGE_PROTOCOL,
      type: "challenge",
      requestId: request.requestId,
      nonce: attemptId,
      attemptId,
      challenge: "x".repeat(43),
    });
    assert.equal(f.status().phase, "Pairing");
    f.bridge.disconnect();
  });
  it("sends no token until explicit approval and installs only matching identity", () => {
    const f = fixture();
    f.prove();
    assert.equal(f.status().phase, "Awaiting approval");
    assert.equal(JSON.stringify(f.sent).includes("fake-token"), false);
    f.bridge.approve();
    assert.equal(f.sent.at(-1)?.type, "approve");
    assert.equal(f.status().phase, "Connecting");
    f.receive({
      protocol: BRIDGE_PROTOCOL,
      type: "connected",
      requestId: f.sent.at(-1)!.requestId,
      connectionId,
      session: { userId: attemptId, workspaceId, email: "other@example.com", expiresAt: 3600_000 },
      leaseExpiresAt: 300_000,
    });
    assert.equal(f.status().phase, "Error");
  });
  it("renews from the live browser session and detects a closed popup", () => {
    const f = fixture();
    f.connected();
    assert.equal(f.status().phase, "Connected");
    f.advance(30_000);
    f.bridge.tick();
    assert.equal(f.sent.at(-1)?.type, "renew");
    f.popup.closed = true;
    f.bridge.tick();
    assert.equal(f.status().phase, "Error");
  });
  it("forwards new tokens immediately and disconnects on account change", () => {
    const f = fixture();
    f.connected();
    f.setSession({ userId, accessToken: "refreshed-token" });
    f.bridge.tick();
    const renewal = f.sent.at(-1)!;
    assert.equal(renewal.type, "renew");
    if (renewal.type === "renew") assert.equal(renewal.accessToken, "refreshed-token");
    f.setSession({ userId: attemptId, accessToken: "other-user" });
    f.bridge.tick();
    assert.equal(f.status().phase, "Disconnected");
    assert.equal(f.sent.at(-1)?.type, "disconnect");
  });
  it("fails visibly for popup blocking, timeout, or an expired lease", () => {
    const blocked = fixture(true);
    blocked.bridge.begin(origin, "x".repeat(22));
    assert.match(blocked.status().error!, /blocked/);
    const timedOut = fixture();
    timedOut.bridge.begin(origin, "x".repeat(22));
    timedOut.advance(20_000);
    timedOut.bridge.tick();
    assert.match(timedOut.status().error!, /timed out/);
    const expired = fixture();
    expired.connected();
    expired.advance(300_000);
    expired.bridge.tick();
    assert.match(expired.status().error!, /expired/);
  });
});
