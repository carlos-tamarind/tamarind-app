import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { BrowserMcpBridge, type BridgeStatus } from "@/integrations/mcp/browser-bridge";
import { McpConnectionContext } from "./mcp-connection-state";

export function McpConnectionProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const { session } = useAuth();
  const currentSession = useRef(session);
  const bridge = useRef<BrowserMcpBridge | null>(null);
  const [status, setStatus] = useState<BridgeStatus>({ phase: "Disconnected" });

  useEffect(() => {
    currentSession.current = session;
    bridge.current?.tick();
  }, [session]);

  useEffect(
    () => () => {
      bridge.current?.disconnect();
      bridge.current = null;
    },
    [workspaceId],
  );

  useEffect(() => {
    if (status.phase === "Disconnected" || status.phase === "Error") return;
    const timer = window.setInterval(() => bridge.current?.tick(), 1000);
    return () => window.clearInterval(timer);
  }, [status.phase]);

  const connect = (address: string, code: string) => {
    bridge.current ??= new BrowserMcpBridge(
      window,
      workspaceId,
      () => {
        const live = currentSession.current;
        return live ? { userId: live.user.id, accessToken: live.access_token } : null;
      },
      setStatus,
    );
    bridge.current.begin(address, code);
  };
  return (
    <McpConnectionContext.Provider
      value={{
        status,
        connect,
        approve: () => bridge.current?.approve(),
        disconnect: () => bridge.current?.disconnect(),
      }}
    >
      {children}
    </McpConnectionContext.Provider>
  );
}
