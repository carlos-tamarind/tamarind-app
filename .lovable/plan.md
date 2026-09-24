# Stop members from sharing pages they don't own

## The risk
When someone shares a page, the app only checks that they belong to the workspace. It never checks whether they are allowed to touch that page. So any member who knows (or guesses) a page's ID can share another person's **private** page into a conversation. That makes it visible to other people and adds them as collaborators, without the owner agreeing.

This covers two reported issues, which describe the same flaw:
- lov_finding_d965aedbc59ed223: the private page gets switched to conversation visibility
- lov_finding_e94866efe10700f7: share messages and collaborator entries get created

## Who can share after the fix
| Page type | Who can share |
|---|---|
| Private | Only the owner |
| Conversation | People in the linked conversation, or people already added as collaborators. This matches who can edit it today. |
| Workspace / external | Nobody (no change, still blocked) |
| In the trash | Nobody (no change, still blocked) |

Anyone else gets a plain "You cannot edit this page" error. The check runs **before** anything is written: no share message, no collaborator entries, no visibility change.

## What changes
1. In the page-sharing action, run the page permission check the app already uses when saving pages. It goes right after the existing trash and page-type checks and before any sharing happens.
2. Nothing changes in the share screen. Owners and allowed collaborators won't notice any difference.
3. Bump the app version to 0.3.257.
4. Run the type check, then mark only the two findings above as fixed.

## Out of scope
- No database changes, no new packages.
- The other open findings stay untouched: pages from another workspace in mentions, paid semantic search, the sign-in redirect, error details on page save, message logging, the catalog rules, and the stale worker findings.

## Technical details
- File: `src/lib/pages.functions.ts`, `sharePage` handler.
- After `assertPageNotTrashed` and the `workspace`/`external` rejection, call `assertCanEditPage(data.pageId, context.userId)` from `@/lib/pages.server`, imported dynamically like the other helpers. Use its `workspaceUserId` as `meWuId`, which replaces the separate `getCurrentWorkspaceUser` call.
- `assertCanEditPage` already makes a private page owner-only. For conversation pages it requires the caller to be a participant or a `page_collaborators` row. It throws before `shareToConversations` and before the `supabaseAdmin` update to the page's visibility.
- `shareToConversations` still checks that the caller participates in each target conversation. No change there.
- Version: `src/lib/version.ts` and `src/routes/__root.tsx`.
- Verification: `bunx tsgo --noEmit`, then use `manage_security_finding` to mark the two IDs as fixed.
