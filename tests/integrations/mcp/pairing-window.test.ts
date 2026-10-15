import assert from "node:assert/strict";
import { it } from "node:test";
import { BrowserMcpBridge, type BridgeStatus } from "@/integrations/mcp/browser-bridge";
import { PairingState } from "@/integrations/mcp/pairing-state";
import { startLocalListener } from "@/integrations/mcp/local-listener";

/** Exercises the actual serialized popup script and browser bridge together.
 * Window delivery is synthetic; this does not claim real Chrome compatibility. */
it(
  "prototypes approval, handoff, refresh and disconnect through the actual pairing page",
  { timeout: 10_000 },
  async () => {
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";
    const appOrigin = "https://app.tamarind.so";
    let code = "";
    let token = "synthetic-first-token";
    let verifications = 0;
    const state = new PairingState(
      async () => {
        verifications++;
        return {
          userId,
          workspaceId,
          email: "owner@example.com",
          expiresAt: Date.now() + 3600_000,
        };
      },
      (value) => {
        code = value;
      },
    );
    const listener = await startLocalListener(state, appOrigin);
    const hostListeners = new Map<string, (event: MessageEvent) => void>();
    const popupListeners = new Map<string, (event: MessageEvent) => void>();
    const timers: ReturnType<typeof setTimeout>[] = [];
    let status: BridgeStatus = { phase: "Disconnected" };
    const messages: unknown[] = [];
    const opener = {
      postMessage: (data: unknown, target: string) => {
        assert.equal(target, appOrigin);
        queueMicrotask(() =>
          hostListeners.get("message")?.({
            data,
            origin: listener.origin,
            source: popup,
          } as unknown as MessageEvent),
        );
      },
    };
    const popup = {
      opener,
      closed: false,
      addEventListener: (type: string, callback: (event: MessageEvent) => void) =>
        popupListeners.set(type, callback),
      postMessage: (data: unknown, target: string) => {
        assert.equal(target, listener.origin);
        messages.push(data);
        queueMicrotask(() =>
          popupListeners.get("message")?.({
            data,
            origin: appOrigin,
            source: opener,
          } as unknown as MessageEvent),
        );
      },
      close() {
        if (this.closed) return;
        this.closed = true;
        popupListeners.get("pagehide")?.({} as MessageEvent);
      },
    };
    const host = {
      addEventListener: (type: string, callback: (event: MessageEvent) => void) =>
        hostListeners.set(type, callback),
      removeEventListener: (type: string) => hostListeners.delete(type),
      open: () => popup,
      setTimeout: (callback: () => void, ms: number) => {
        const timer = setTimeout(callback, ms);
        timers.push(timer);
        return timer;
      },
    } as unknown as Window;
    const bridge = new BrowserMcpBridge(
      host,
      workspaceId,
      () => ({ userId, accessToken: token }),
      (next) => {
        status = next;
      },
    );
    const waitFor = async (condition: () => boolean) => {
      for (let tries = 0; tries < 500; tries++) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      assert.fail(`Pairing did not reach expected state (${status.phase}).`);
    };
    try {
      bridge.begin(listener.origin, code);
      const html = await (await fetch(`${listener.origin}/connect`)).text();
      const script = html.match(/<script[^>]*>([\s\S]*)<\/script>/)![1];
      const document = { getElementById: () => ({ textContent: "" }) };
      const localFetch = (path: string, init?: RequestInit) =>
        fetch(`${listener.origin}${path}`, {
          ...init,
          headers: { ...(init?.headers as Record<string, string>), Origin: listener.origin },
        });
      const interval = (callback: () => void, ms: number) => {
        const timer = setInterval(callback, ms);
        timers.push(timer);
        return timer;
      };
      const timeout = (callback: () => void, ms: number) => {
        const timer = setTimeout(callback, ms);
        timers.push(timer);
        return timer;
      };
      new Function("window", "document", "fetch", "setInterval", "setTimeout", script)(
        popup,
        document,
        localFetch,
        interval,
        timeout,
      );
      await waitFor(() => status.phase === "Awaiting approval");
      assert.equal(verifications, 0);
      assert.equal(JSON.stringify(messages).includes(token), false);
      bridge.approve();
      await waitFor(() => status.phase === "Connected");
      assert.equal(state.authorization(workspaceId).token, token);
      token = "synthetic-refreshed-token";
      bridge.tick();
      await waitFor(() => state.authorization(workspaceId).token === token);
      assert.equal(verifications, 2);
      bridge.disconnect();
      await waitFor(() => {
        try {
          state.authorization(workspaceId);
          return false;
        } catch {
          return true;
        }
      });
      assert.equal(status.phase, "Disconnected");
    } finally {
      bridge.disconnect();
      for (const timer of timers) {
        clearTimeout(timer);
        clearInterval(timer);
      }
      state.stop();
      await listener.close();
    }
  },
);
