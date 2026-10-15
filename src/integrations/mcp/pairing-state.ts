import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { agentSessionSchema, type AgentSession } from "../../search/agents/schema";
import { CONNECTION_LEASE_MS, PAIRING_TTL_MS } from "./protocol";

function matches(a: string, b: string) {
  const first = Buffer.from(a),
    second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
const secret = () => randomBytes(32).toString("base64url");
export class PairingError extends Error {}
type Connection = {
  id: string;
  credential: string;
  token: string;
  session: AgentSession;
  lease: number;
  sequence: number;
  attempt: Attempt;
};
type Attempt = { id: string; challenge: string; nonce: string; completing: boolean };

/** All credentials and connection state live only in this process. */
export class PairingState {
  private code = "";
  private codeExpiresAt = 0;
  private attempt?: Attempt;
  private connection?: Connection;
  private revision = 0;
  private stopped = false;

  constructor(
    private verify: (token: string, workspaceId: string) => Promise<AgentSession>,
    private reportCode: (code: string) => void,
    private now = Date.now,
  ) {
    this.rotate();
  }

  private rotate() {
    this.revision++;
    this.connection = undefined;
    this.attempt = undefined;
    this.code = randomBytes(16).toString("base64url");
    this.codeExpiresAt = this.now() + PAIRING_TTL_MS;
    if (!this.stopped) this.reportCode(this.code);
  }

  tick() {
    if (this.stopped) return;
    if (this.connection) {
      if (this.now() >= Math.min(this.connection.lease, this.connection.session.expiresAt))
        this.rotate();
    } else if (this.now() >= this.codeExpiresAt) this.rotate();
  }

  start(code: string, nonce: string) {
    this.tick();
    if (this.stopped || this.connection || this.attempt || !matches(code, this.code)) {
      throw new PairingError("Pairing code is invalid, expired, or already in use.");
    }
    this.attempt = { id: randomUUID(), challenge: secret(), nonce, completing: false };
    return { attemptId: this.attempt.id, challenge: this.attempt.challenge, nonce };
  }

  async complete(input: {
    attemptId: string;
    challenge: string;
    nonce: string;
    accessToken: string;
    workspaceId: string;
  }) {
    this.tick();
    const attempt = this.attempt;
    if (
      this.stopped ||
      this.connection ||
      !attempt ||
      attempt.completing ||
      input.attemptId !== attempt.id ||
      input.nonce !== attempt.nonce ||
      !matches(input.challenge, attempt.challenge)
    ) {
      throw new PairingError("Pairing challenge is invalid or expired. Start again.");
    }
    attempt.completing = true; // Reject duplicate completion while verification is in flight.
    const revision = this.revision;
    try {
      const session = agentSessionSchema.parse(
        await this.verify(input.accessToken, input.workspaceId),
      );
      this.tick();
      if (
        this.stopped ||
        revision !== this.revision ||
        session.workspaceId !== input.workspaceId ||
        session.expiresAt <= this.now()
      ) {
        throw new PairingError("Pairing expired or authorization changed. Start again.");
      }
      this.connection = {
        id: randomUUID(),
        credential: secret(),
        token: input.accessToken,
        session,
        lease: Math.min(this.now() + CONNECTION_LEASE_MS, session.expiresAt),
        sequence: 0,
        attempt,
      };
      this.attempt = undefined;
      this.code = "";
      return { ...this.publicConnection(), credential: this.connection.credential };
    } catch {
      if (!this.stopped && revision === this.revision) this.rotate();
      throw new PairingError(
        "Tamarind could not authorize this pairing. Check access and start again.",
      );
    }
  }

  private authenticated(id: string, credential: string) {
    this.tick();
    if (
      this.stopped ||
      !this.connection ||
      this.connection.id !== id ||
      !matches(credential, this.connection.credential)
    ) {
      throw new PairingError("Connection expired. Pair again through Tamarind Settings.");
    }
    return this.connection;
  }

  async renew(input: {
    connectionId: string;
    credential: string;
    sequence: number;
    accessToken: string;
  }) {
    const connection = this.authenticated(input.connectionId, input.credential);
    if (input.sequence <= connection.sequence)
      throw new PairingError("Stale session update rejected.");
    connection.sequence = input.sequence;
    const revision = this.revision;
    try {
      const session =
        input.accessToken === connection.token
          ? connection.session
          : agentSessionSchema.parse(
              await this.verify(input.accessToken, connection.session.workspaceId),
            );
      this.tick();
      if (
        this.stopped ||
        revision !== this.revision ||
        connection !== this.connection ||
        input.sequence !== connection.sequence
      )
        throw new PairingError("Stale session update rejected.");
      if (
        session.userId !== connection.session.userId ||
        session.workspaceId !== connection.session.workspaceId ||
        session.expiresAt <= this.now()
      ) {
        throw new PairingError("The authenticated account changed. Pair again.");
      }
      connection.token = input.accessToken;
      connection.session = session;
      connection.lease = Math.min(this.now() + CONNECTION_LEASE_MS, session.expiresAt);
      return this.publicConnection();
    } catch {
      if (revision === this.revision && connection.sequence === input.sequence) this.rotate();
      throw new PairingError("Session renewal failed. Pair again through Tamarind Settings.");
    }
  }

  disconnect(id: string, credential: string) {
    this.authenticated(id, credential);
    this.rotate();
  }

  cancelAttempt(input: { attemptId: string; challenge: string; nonce: string }) {
    const attempt = this.attempt ?? this.connection?.attempt;
    if (
      !attempt ||
      input.attemptId !== attempt.id ||
      input.nonce !== attempt.nonce ||
      !matches(input.challenge, attempt.challenge)
    ) {
      throw new PairingError("Pairing challenge is invalid or expired.");
    }
    this.rotate();
  }

  clearIfCurrent(connectionId: string) {
    if (this.connection?.id === connectionId) this.rotate();
  }

  authorization(workspaceId: string) {
    this.tick();
    if (this.stopped || !this.connection)
      throw new PairingError(
        "Connect through hosted Tamarind → Workspace settings → MCP Server first.",
      );
    if (this.connection.session.workspaceId !== workspaceId)
      throw new PairingError("Search is restricted to the paired workspace.");
    return { connectionId: this.connection.id, token: this.connection.token };
  }

  assertCurrent(connectionId: string) {
    this.tick();
    if (this.connection?.id !== connectionId)
      throw new PairingError("The connection ended. Search results were discarded.");
  }

  private publicConnection() {
    const connection = this.connection!;
    return {
      connectionId: connection.id,
      session: { ...connection.session },
      leaseExpiresAt: connection.lease,
    };
  }

  stop() {
    this.stopped = true;
    this.revision++;
    this.connection = undefined;
    this.attempt = undefined;
    this.code = "";
  }
}
