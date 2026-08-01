import { z } from "zod";

export const searchScopeSchema = z.enum(["all", "conversations", "pages", "users"]);
export type SearchScope = z.infer<typeof searchScopeSchema>;

export type SearchRequest = {
  query: string;
  embedding?: number[];
  scope: SearchScope;
  limit: 20;
};
