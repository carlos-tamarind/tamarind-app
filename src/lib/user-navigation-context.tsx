import { createContext, useContext } from "react";

type UserNavigationContextValue = {
  workspaceId: string;
  myWorkspaceUserId: string | null;
  purgedMessageIds?: ReadonlySet<string>;
};

export const UserNavigationContext =
  createContext<UserNavigationContextValue | null>(null);

export function useUserNavigation() {
  return useContext(UserNavigationContext);
}
