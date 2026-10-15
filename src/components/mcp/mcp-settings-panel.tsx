import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMcpConnection } from "./mcp-connection-state";

export function McpSettingsPanel({ workspaceId }: { workspaceId: string }) {
  const { user } = useAuth();
  const { status, connect, approve, disconnect } = useMcpConnection();
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const idle = status.phase === "Disconnected" || status.phase === "Error";
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Connect a local MCP search server to this workspace. It can retrieve the content you can
        access. Start it through your MCP client, then use the address and pairing code from its
        diagnostics.
      </p>
      <p role="status" className="text-sm font-medium">
        Status: {status.phase}
      </p>
      {status.error && (
        <p role="alert" className="text-sm text-destructive">
          {status.error}
        </p>
      )}
      {idle && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            connect(address, code);
            setCode("");
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="mcp-address">Local connection address</Label>
            <Input
              id="mcp-address"
              placeholder="http://127.0.0.1:43127"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mcp-code">Pairing code</Label>
            <Input
              id="mcp-code"
              type="password"
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </div>
          <Button type="submit">Connect</Button>
        </form>
      )}
      {!idle && (
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <p>Account: {status.email ?? user?.email}</p>
          <p className="break-all">Workspace: {workspaceId}</p>
          <p>Local process: {status.address}</p>
          {status.phase === "Awaiting approval" && (
            <>
              <p>
                Share your current session with this local process for read-only search. The session
                token carries your normal account permissions and stays in process memory.
              </p>
              <Button onClick={approve}>Approve connection</Button>
            </>
          )}
          <Button variant="outline" onClick={disconnect}>
            Disconnect
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Keep the hosted Tamarind tab and local pairing window open. You may close Settings. A
        reload, process restart, or expired connection requires pairing again.
      </p>
    </div>
  );
}
