import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createHostedClient } from "./hosted-client";
import { startLocalListener } from "./local-listener";
import { PairingState } from "./pairing-state";
import { createSearchMcpServer } from "./tool";

async function main() {
  if (!process.env.TAMARIND_APP_URL)
    throw new Error("Set TAMARIND_APP_URL to your hosted HTTPS Tamarind origin.");
  const portValue = process.env.TAMARIND_MCP_PAIRING_PORT;
  if (
    portValue &&
    (!/^\d+$/.test(portValue) || Number(portValue) < 1 || Number(portValue) > 65535)
  ) {
    throw new Error("TAMARIND_MCP_PAIRING_PORT must be between 1 and 65535.");
  }
  const hosted = createHostedClient(process.env.TAMARIND_APP_URL);
  let pairingCode = "";
  let localOrigin = "";
  const report = (code: string) => {
    pairingCode = code;
    if (localOrigin)
      console.error(
        `[Tamarind MCP] Connect in hosted Workspace settings → MCP Server. Local address: ${localOrigin} · Pairing code: ${code} (expires in 5 minutes)`,
      );
  };
  const state = new PairingState(hosted.verify, report);
  const listener = await startLocalListener(state, hosted.origin, Number(portValue ?? 0));
  localOrigin = listener.origin;
  report(pairingCode);
  pairingCode = "";
  const timer = setInterval(() => state.tick(), 1000);
  timer.unref();
  const server = createSearchMcpServer(state, hosted);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    state.stop();
    await listener.close();
    await server.close();
  };
  const transport = new StdioServerTransport();
  await server.connect(transport);
  server.server.onclose = () => {
    void close();
  };
  process.stdin.once("end", () => {
    void close();
  });
  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });
}

void main().catch(() => {
  console.error(
    "[Tamarind MCP] Startup failed. Check TAMARIND_APP_URL, pairing port, and installed dependencies. No credentials are required in configuration.",
  );
  process.exitCode = 1;
});
