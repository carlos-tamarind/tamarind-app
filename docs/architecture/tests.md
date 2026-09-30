# Tests

Tamarind has a small suite of **unit tests** for pure logic: functions whose output depends only on their input, with no database, network or browser. They run with [Bun's built-in test runner](https://bun.sh/docs/cli/test); there is no separate test framework to install.

## Location

All test files live under `tests/` at the repository root. The tree **mirrors `src/`**: a test sits at the same path as the module it covers, minus the leading `src/`.

```
tests/
├── lib/
│   ├── workspace-search.test.ts                 → src/lib/workspace-search.ts
│   └── knowledge-base/
│       ├── graph-reconcile.test.ts              → src/lib/knowledge-base/graph-reconcile.ts
│       ├── graph-schema.test.ts                 → src/lib/knowledge-base/graph-schema.ts
│       ├── layout.test.ts                       → src/lib/knowledge-base/layout.ts
│       └── visuals.test.ts                      → src/lib/knowledge-base/visuals.ts
└── semantic/conversation-topics/engine/
    └── classifyMatches.test.ts                  → src/semantic/conversation-topics/engine/classifyMatches.ts
```

Test files are never imported by the app, so they are not part of the Vite bundle or the deployed Worker.

## Running them

From the repository root:

| Goal | Command |
|------|---------|
| Run every test | `bun test` |
| Run one folder | `bun test tests/lib/knowledge-base` |
| Run one file | `bun test tests/lib/workspace-search.test.ts` |
| Run files whose path contains a word | `bun test reconcile` |
| Run tests whose name matches a pattern | `bun test -t "drops unreadable"` |
| Coverage report | `bun test --coverage` |

`bun test` searches the working directory recursively for files named `*.test.ts` (also `*_test`, `*.spec`, `*_spec`, and `.js`/`.tsx` variants), skipping `node_modules`. No configuration registers them: the filename is enough. `bunfig.toml` has no `[test]` section, so Bun's defaults apply.

Tests are not wired into `package.json` scripts or CI; run them by hand before opening a PR that touches covered code. They are typechecked with the rest of the project (`tsconfig.json` includes `tests/**/*.ts`) and linted by `bun run lint`.

## What is covered

| File | Covers |
|------|--------|
| `lib/workspace-search.test.ts` | URL search-param helpers: opening the [Knowledge Base](../interface/knowledge-base.md) clears open entities, the KB hides when a conversation and a page are both open, evidence deep links clear the opposite pane |
| `lib/knowledge-base/graph-schema.test.ts` | Parsing of the `get_canonical_topic_graph_for_user` response: snake_case → camelCase mapping, empty graphs, malformed payloads fail loudly |
| `lib/knowledge-base/graph-reconcile.test.ts` | The RLS cross-check behind KB visibility: topics RLS refuses are dropped with their links, readable ids the RPC didn't return are never added |
| `lib/knowledge-base/layout.test.ts` | The d3-force graph layout: deterministic output, finite positions for every node, similar topics placed closer |
| `lib/knowledge-base/visuals.test.ts` | Node size (evidence) and transparency (recency) stay within configured bounds |
| `semantic/conversation-topics/engine/classifyMatches.test.ts` | [CTI](../semantic/conversation_topics.md) similarity-tier routing (tiers 1–4) |

**Not covered:** server functions, database functions and RLS policies, React components, and end-to-end flows. Those need a Supabase project with the service-role key and a signed-in user, and are verified manually (see each feature doc).

## Writing a new test

1. Create `tests/<path under src>/<module>.test.ts`, mirroring the module's location.
2. Import the code under test with the `@/` alias (`import { layoutKnowledgeGraph } from "@/lib/knowledge-base/layout";`). Relative imports would break the mirror.
3. Use Node's test and assertion modules, which Bun runs natively:

   ```ts
   import assert from "node:assert/strict";
   import { describe, it } from "node:test";
   ```

4. Keep tests pure. If a module mixes logic with I/O, extract the logic into a pure function (as `graph-reconcile.ts` does for `getKnowledgeGraph`) and test that.

## Related Docs

- [Architecture Overview](overview.md) — Stack and server-function patterns
- [Deployment](deployment.md) — Build and runtime environment
