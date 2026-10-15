import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PairingState } from "@/integrations/mcp/pairing-state";
import { CONNECTION_LEASE_MS, PAIRING_TTL_MS } from "@/integrations/mcp/protocol";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const nonce = "33333333-3333-4333-8333-333333333333";

function fixture() {
  let now = 1000;
  let code = "";
  let verifications = 0;
  let nextUser = userId;
  let expiry = now + 3600_000;
  const state = new PairingState(
    async (_token, selected) => {
      verifications++;
      return {
        userId: nextUser,
        email: "owner@example.com",
        workspaceId: selected,
        expiresAt: expiry,
      };
    },
    (value) => {
      code = value;
    },
    () => now,
  );
  const connect = () =>
    state.complete({ ...state.start(code, nonce), workspaceId, accessToken: "first-token" });
  return {
    state,
    connect,
    code: () => code,
    count: () => verifications,
    advance: (ms: number) => {
      now += ms;
    },
    changeUser: () => {
      nextUser = nonce;
    },
    expires: (value: number) => {
      expiry = value;
    },
  };
}

describe("local pairing state", () => {
  it("requires a live one-time code and matching challenge", async () => {
    const f = fixture();
    assert.throws(() => f.state.authorization(workspaceId), /Connect through/);
    assert.throws(() => f.state.start("wrong", nonce), /invalid/);
    const original = f.code();
    f.advance(PAIRING_TTL_MS);
    assert.throws(() => f.state.start(original, nonce), /invalid/);
    assert.notEqual(original, f.code());
    const attempt = f.state.start(f.code(), nonce);
    await assert.rejects(
      f.state.complete({ ...attempt, challenge: "wrong", accessToken: "first", workspaceId }),
      /challenge/,
    );
    const connection = await f.state.complete({ ...attempt, accessToken: "first", workspaceId });
    assert.equal(f.state.authorization(workspaceId).token, "first");
    assert.throws(() => f.state.start(f.code(), nonce), /in use/);
    await assert.rejects(f.state.complete({ ...attempt, accessToken: "first", workspaceId }));
    assert.throws(() => f.state.authorization(nonce), /paired workspace/);
    f.state.disconnect(connection.connectionId, connection.credential);
    assert.throws(() => f.state.authorization(workspaceId));
  });
  it("renews leases, verifies changed tokens, and rejects replayed or stolen updates", async () => {
    const f = fixture();
    const connection = await f.connect();
    const update = {
      connectionId: connection.connectionId,
      credential: connection.credential,
      sequence: 1,
      accessToken: "first-token",
    };
    f.advance(30_000);
    await f.state.renew(update);
    assert.equal(f.count(), 1);
    await assert.rejects(f.state.renew(update), /Stale/);
    await assert.rejects(f.state.renew({ ...update, credential: "wrong", sequence: 2 }));
    await f.state.renew({ ...update, sequence: 2, accessToken: "refreshed" });
    assert.equal(f.count(), 2);
    assert.equal(f.state.authorization(workspaceId).token, "refreshed");
    f.changeUser();
    await assert.rejects(
      f.state.renew({ ...update, sequence: 3, accessToken: "different-account" }),
    );
    assert.throws(() => f.state.authorization(workspaceId));
  });
  it("expires without a timer tick and never extends beyond access-token expiration", async () => {
    const f = fixture();
    await f.connect();
    f.advance(CONNECTION_LEASE_MS);
    assert.throws(() => f.state.authorization(workspaceId));
    f.expires(1000 + CONNECTION_LEASE_MS + 1000);
    await f.connect();
    f.advance(1000);
    assert.throws(() => f.state.authorization(workspaceId));
  });
  it("does not activate an abandoned attempt after asynchronous verification", async () => {
    let code = "";
    let resolve!: (value: {
      userId: string;
      email: string;
      workspaceId: string;
      expiresAt: number;
    }) => void;
    const state = new PairingState(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
      (value) => {
        code = value;
      },
    );
    const attempt = state.start(code, nonce);
    const completing = state.complete({ ...attempt, workspaceId, accessToken: "fake" });
    await assert.rejects(state.complete({ ...attempt, workspaceId, accessToken: "fake" }));
    state.cancelAttempt(attempt);
    resolve({ userId, email: "owner@example.com", workspaceId, expiresAt: Date.now() + 3600_000 });
    await assert.rejects(completing);
    assert.throws(() => state.authorization(workspaceId));
  });
  it("invalidates outstanding searches and clears credentials on stop", async () => {
    const f = fixture();
    const connected = await f.connect();
    f.state.stop();
    assert.throws(() => f.state.assertCurrent(connected.connectionId));
    assert.throws(() => f.state.authorization(workspaceId));
    assert.throws(() => f.state.start(f.code(), nonce));
  });
});
