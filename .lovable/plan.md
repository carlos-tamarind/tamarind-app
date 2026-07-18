## Restrict Page visibility options in New Page dialog by entrypoint

All four entrypoints (Navigation panel, empty central panel, conversation composer's "new page" button, conversation details modal, quoted-message "Create page") already funnel into `src/components/page/new-page-dialog.tsx`. The only change needed is to trim the visibility dropdown to the options that are actually valid for the current context, instead of showing all three with irrelevant ones disabled.

### Change

In `src/components/page/new-page-dialog.tsx`, replace the current `<SelectContent>` (which always renders Private / Workspace / Conversation, disabling the ones that don't apply) with a conditional render:

- When `conversationId` is falsy (entrypoints A, B — Navigation panel and empty central panel):
  - Render only `Private` and `Workspace` items (each with its existing icon).
- When `conversationId` is truthy (entrypoints C, D, E — conversation composer button, conversation details modal, quoted-message flow):
  - Render only the `Conversation` item.

The trigger keeps showing the selected value. `defaultVisibility` already resolves correctly (`"private"` outside a conversation, `"conversation"` inside), so no state logic changes are required.

Also simplify the handler's visibility narrowing accordingly — inside a conversation `visibility` is always `"conversation"`, outside it's `"private" | "workspace"` — no functional change, just removes now-unreachable branches.

### Version

Bump `src/lib/version.ts` patch to `0.1.29`.

### Non-goals

- No changes to server functions, permissions, collaborator logic, templates, or the conversation-side callers — those behaviors listed under B/C/D/E in the prompt are already wired.
- No visual redesign of the dialog itself.
