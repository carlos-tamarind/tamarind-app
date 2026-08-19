import { createContext, useContext, useMemo, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type SaveStatusContextValue = {
  status: SaveStatus;
  setStatus: (status: SaveStatus) => void;
};

/**
 * Lets the page editor report autosave progress to chrome that lives outside
 * it (the status bar). Defaults to a no-op so the editor can render outside
 * the workspace shell without a provider.
 */
const SaveStatusContext = createContext<SaveStatusContextValue>({
  status: "idle",
  setStatus: () => {},
});

export function SaveStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const value = useMemo(() => ({ status, setStatus }), [status]);
  return (
    <SaveStatusContext.Provider value={value}>{children}</SaveStatusContext.Provider>
  );
}

export function useSaveStatus() {
  return useContext(SaveStatusContext);
}
