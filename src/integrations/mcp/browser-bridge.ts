import type { AgentSession } from "../../search/agents/schema";
import {
  BRIDGE_PROTOCOL,
  HEARTBEAT_MS,
  bridgeResponseSchema,
  pairingStartSchema,
  parsePairingOrigin,
  type BrowserCommand,
} from "./protocol";

export type BrowserSession = { userId: string; accessToken: string };
export type BridgeStatus = {
  phase: "Disconnected" | "Pairing" | "Awaiting approval" | "Connecting" | "Connected" | "Error";
  address?: string;
  email?: string;
  error?: string;
};
type Pending = { type: "ready" | "prove" | "approve" | "renew"; id: string; token?: string };

/** Owns window messaging independently of the Settings dialog's mount lifetime. */
export class BrowserMcpBridge {
  private popup: Window | null = null;
  private origin = "";
  private nonce = "";
  private code = "";
  private expectedUserId = "";
  private challenge?: { attemptId: string; challenge: string };
  private pending?: Pending;
  private connectionId = "";
  private session?: AgentSession;
  private lease = 0;
  private deadline = 0;
  private sequence = 0;
  private lastRenewal = 0;
  private lastToken = "";
  private status: BridgeStatus = { phase: "Disconnected" };

  constructor(
    private host: Window,
    private workspaceId: string,
    private getSession: () => BrowserSession | null,
    private changed: (state: BridgeStatus) => void,
    private now = Date.now,
  ) {}

  private setStatus(status: BridgeStatus) {
    this.status = status;
    this.changed({ ...status });
  }
  private send(message: BrowserCommand) {
    this.popup?.postMessage(message, this.origin);
  }

  begin(address: string, code: string) {
    this.disconnect();
    try {
      this.origin = parsePairingOrigin(address.trim());
      this.nonce = crypto.randomUUID();
      pairingStartSchema.parse({ code: code.trim(), nonce: this.nonce });
      this.code = code.trim();
      const session = this.getSession();
      if (!session) throw new Error("Sign into Tamarind before connecting.");
      this.expectedUserId = session.userId;
      this.pending = { type: "ready", id: crypto.randomUUID() };
      this.deadline = this.now() + 20_000;
      this.host.addEventListener("message", this.receive);
      this.host.addEventListener("pagehide", this.unload);
      this.popup = this.host.open(
        `${this.origin}/connect`,
        `tamarind-mcp-${this.nonce}`,
        "width=500,height=400",
      );
      if (!this.popup)
        throw new Error("The pairing popup was blocked. Allow popups and try again.");
      this.setStatus({ phase: "Pairing", address: this.origin });
    } catch (error) {
      this.fail(
        error instanceof Error && !("issues" in error)
          ? error.message
          : "Use the pairing address and code from the local MCP diagnostics.",
      );
    }
  }

  approve() {
    if (this.status.phase !== "Awaiting approval" || !this.challenge) return;
    const session = this.getSession();
    if (!session || session.userId !== this.expectedUserId) {
      this.fail("The signed-in account changed. Start again.");
      return;
    }
    const requestId = crypto.randomUUID();
    this.pending = { type: "approve", id: requestId, token: session.accessToken };
    this.deadline = this.now() + 20_000;
    this.setStatus({ ...this.status, phase: "Connecting" });
    this.send({
      protocol: BRIDGE_PROTOCOL,
      type: "approve",
      requestId,
      ...this.challenge,
      nonce: this.nonce,
      workspaceId: this.workspaceId,
      accessToken: session.accessToken,
    });
  }

  private receive = (event: MessageEvent) => {
    if (event.origin !== this.origin || event.source !== this.popup) return;
    const parsed = bridgeResponseSchema.safeParse(event.data);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.type === "ready") {
      if (this.pending?.type !== "ready") return;
      this.pending.type = "prove";
      this.send({
        protocol: BRIDGE_PROTOCOL,
        type: "prove",
        requestId: this.pending.id,
        code: this.code,
        nonce: this.nonce,
      });
      this.code = "";
      return;
    }
    if (!this.pending || message.requestId !== this.pending.id) return;
    if (message.type === "error") {
      this.fail(message.message);
      return;
    }
    if (
      message.type === "challenge" &&
      this.pending.type === "prove" &&
      message.nonce === this.nonce
    ) {
      this.challenge = { attemptId: message.attemptId, challenge: message.challenge };
      this.pending = undefined;
      this.deadline = this.now() + 5 * 60_000;
      this.setStatus({ ...this.status, phase: "Awaiting approval" });
      return;
    }
    if (
      (message.type === "connected" && this.pending.type === "approve") ||
      (message.type === "renewed" &&
        this.pending.type === "renew" &&
        message.connectionId === this.connectionId)
    ) {
      if (
        message.session.workspaceId !== this.workspaceId ||
        message.session.userId !== this.expectedUserId ||
        message.leaseExpiresAt <= this.now() ||
        message.session.expiresAt <= this.now()
      ) {
        this.fail("The verified account or workspace did not match. Start again.");
        return;
      }
      this.connectionId = message.connectionId;
      this.session = message.session;
      this.lease = Math.min(message.leaseExpiresAt, message.session.expiresAt);
      this.lastToken = this.pending.token ?? "";
      this.lastRenewal = this.now();
      this.pending = undefined;
      this.deadline = 0;
      this.challenge = undefined;
      this.setStatus({ phase: "Connected", address: this.origin, email: message.session.email });
    }
  };

  tick() {
    if (this.status.phase === "Disconnected" || this.status.phase === "Error") return;
    if (this.popup?.closed) {
      this.fail("The pairing window closed. Connect again.");
      return;
    }
    const session = this.getSession();
    if (!session || session.userId !== this.expectedUserId) {
      this.disconnect();
      return;
    }
    if (this.deadline && this.now() >= this.deadline) {
      this.fail("The connection timed out. Check popup/security settings and pair again.");
      return;
    }
    if (this.status.phase !== "Connected") return;
    if (this.now() >= this.lease || !this.session || this.now() >= this.session.expiresAt) {
      this.fail("The connection expired. Pair again through Settings.");
      return;
    }
    if (
      !this.pending &&
      (this.now() - this.lastRenewal >= HEARTBEAT_MS || session.accessToken !== this.lastToken)
    ) {
      const requestId = crypto.randomUUID();
      this.pending = { type: "renew", id: requestId, token: session.accessToken };
      this.deadline = this.now() + 20_000;
      this.send({
        protocol: BRIDGE_PROTOCOL,
        type: "renew",
        requestId,
        connectionId: this.connectionId,
        sequence: ++this.sequence,
        accessToken: session.accessToken,
      });
    }
  }

  private unload = () => {
    this.disconnect();
  };
  private cleanup() {
    const popup = this.popup;
    if (popup && !popup.closed) {
      if (this.connectionId) {
        this.send({
          protocol: BRIDGE_PROTOCOL,
          type: "disconnect",
          requestId: crypto.randomUUID(),
          connectionId: this.connectionId,
        });
        this.host.setTimeout(() => popup.close(), 2000);
      } else popup.close();
    }
    this.host.removeEventListener("message", this.receive);
    this.host.removeEventListener("pagehide", this.unload);
    this.popup = null;
    this.pending = undefined;
    this.challenge = undefined;
    this.connectionId = "";
    this.session = undefined;
    this.code = "";
    this.nonce = "";
    this.expectedUserId = "";
    this.lastToken = "";
    this.sequence = 0;
    this.deadline = 0;
  }
  disconnect() {
    this.cleanup();
    this.setStatus({ phase: "Disconnected" });
  }
  private fail(message: string) {
    this.cleanup();
    this.setStatus({ phase: "Error", error: message });
  }
}
