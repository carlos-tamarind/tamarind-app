/** Serialized into the loopback page; keep this function dependency-free. */
export function runPairingPage(appOrigin: string) {
  const protocol = "tamarind-mcp-v1";
  const opener = window.opener as Window | null;
  const status = document.getElementById("status")!;
  let credential = "";
  let connectionId = "";
  let busy = false;
  let connected = false;
  let attempt: { attemptId: string; challenge: string; nonce: string } | undefined;
  if (!opener) {
    status.textContent =
      "Open this window from Tamarind Settings. Your browser may have blocked the connection.";
    return;
  }
  const send = (message: Record<string, unknown>) =>
    opener.postMessage({ protocol, ...message }, appOrigin);
  const ready = setInterval(() => send({ type: "ready" }), 500);
  const readyTimeout = setTimeout(() => {
    clearInterval(ready);
    if (!connected)
      status.textContent =
        "No connection established. Check the hosted address and reopen from Settings.";
  }, 30_000);

  async function post(path: string, body: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      credentials: "omit",
      redirect: "error",
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error("The local connection failed. Pair again through Tamarind Settings.");
    return result;
  }

  window.addEventListener("message", (event: MessageEvent) => {
    const message = event.data;
    if (
      event.origin !== appOrigin ||
      event.source !== opener ||
      !message ||
      message.protocol !== protocol ||
      typeof message.requestId !== "string"
    )
      return;
    void (async () => {
      if (busy) {
        send({
          type: "error",
          requestId: message.requestId,
          message: "A connection request is already running.",
        });
        return;
      }
      busy = true;
      try {
        switch (message.type) {
          case "prove": {
            clearInterval(ready);
            clearTimeout(readyTimeout);
            const challenge = await post("/pair/start", {
              code: message.code,
              nonce: message.nonce,
            });
            attempt = challenge;
            status.textContent = "Return to Tamarind and approve sharing this workspace session.";
            send({ type: "challenge", requestId: message.requestId, ...challenge });
            break;
          }
          case "approve": {
            const result = await post("/pair/complete", {
              attemptId: message.attemptId,
              challenge: message.challenge,
              nonce: message.nonce,
              workspaceId: message.workspaceId,
              accessToken: message.accessToken,
            });
            credential = result.credential;
            connectionId = result.connectionId;
            connected = true;
            status.textContent =
              "Connected. Keep this window and the Tamarind tab open. You can close Settings.";
            const { credential: omitted, ...publicResult } = result;
            void omitted;
            send({ type: "connected", requestId: message.requestId, ...publicResult });
            break;
          }
          case "renew": {
            if (!credential || message.connectionId !== connectionId) throw new Error();
            const result = await post("/session", {
              connectionId,
              credential,
              sequence: message.sequence,
              accessToken: message.accessToken,
            });
            send({ type: "renewed", requestId: message.requestId, ...result });
            break;
          }
          case "disconnect": {
            if (!credential || message.connectionId !== connectionId) throw new Error();
            await post("/disconnect", { connectionId, credential });
            credential = "";
            connected = false;
            status.textContent = "Disconnected. You may close this window.";
            send({ type: "disconnected", requestId: message.requestId, connectionId });
            window.close();
            break;
          }
        }
      } catch {
        credential = "";
        connected = false;
        status.textContent = "Connection failed. Return to Tamarind Settings and pair again.";
        send({
          type: "error",
          requestId: message.requestId,
          message: "The local connection failed. Pair again through Tamarind Settings.",
        });
      } finally {
        busy = false;
      }
    })();
  });
  window.addEventListener("pagehide", () => {
    if (credential && connectionId) {
      void fetch("/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, connectionId }),
        keepalive: true,
      }).catch(() => {});
    } else if (attempt) {
      void fetch("/pair/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attempt),
        keepalive: true,
      }).catch(() => {});
    }
    credential = "";
  });
  send({ type: "ready" });
}

export function pairingPage(appOrigin: string, nonce: string) {
  const origin = JSON.stringify(appOrigin).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tamarind MCP pairing</title></head>
<body><h1>Tamarind MCP connection</h1><p id="status">Waiting for Tamarind Settings…</p>
<p>This window connects your browser session to the local search tool. Keep it open while connected.</p>
<script nonce="${nonce}">(${runPairingPage.toString()})(${origin});</script></body></html>`;
}
