import { createContext, useContext } from "react";
import type { BridgeStatus } from "@/integrations/mcp/browser-bridge";

type ConnectionContext = {
  status: BridgeStatus;
  connect: (address: string, code: string) => void;
  approve: () => void;
  disconnect: () => void;
};
export const McpConnectionContext = createContext<ConnectionContext | null>(null);

export function useMcpConnection() {
  const value = useContext(McpConnectionContext);
  if (!value) throw new Error("MCP connection must be used within the workspace shell.");
  return value;
}
