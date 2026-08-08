# Workspaces & Permissions

Tamarind is organized around workspaces — isolated tenant environments where teams collaborate. Each workspace has its own conversations, pages, and members.

## Workspace Model

| Concept | Table | Description |
|---------|-------|-------------|
| Workspace | `workspaces` | Tenant root with name and plan tier |
| Member | `workspace_users` | Links auth user to workspace with role |
| Role | `user_roles` | Catalog: admin, member, viewer |
| Invite | `workspace_invites` | Token-based email invitations |

A user can belong to multiple workspaces. The workspace rail in the UI allows switching between them.

## Roles

| Role | Capabilities |
|------|-------------|
| `admin` | Full workspace control: manage members, create/revoke invites, update workspace settings |
| `member` | Create and edit pages, participate in conversations, send messages |
| `viewer` | Read-only access to visible content |

Roles are assigned at invite time or during bootstrap. Conversation-level roles (`conversation_role`) exist separately in `conversation_participants` for group chat administration.

## Authorization

Three layers enforce access (see [Auth](../architecture/auth.md)):

1. **Postgres RLS** — all queries scoped by workspace membership
2. **Server function checks** — additional business logic assertions
3. **Plan-based feature gating** — capability restrictions by subscription tier

## Plan Tiers

Workspaces have a `plan` field: `free`, `pro`, or `enterprise`.

Feature capabilities are defined in [`src/lib/features.ts`](../../src/lib/features.ts):

| Feature | free | pro | enterprise |
|---------|------|-----|------------|
| `pages.create` | ✓ | ✓ | ✓ |
| `pages.unlimited` | | ✓ | ✓ |
| `pages.externalShare` | | ✓ | ✓ |
| `conversations.create` | ✓ | ✓ | ✓ |
| `conversations.group` | ✓ | ✓ | ✓ |
| `search.fulltext` | ✓ | ✓ | ✓ |
| `search.semantic` | | ✓ | ✓ |
| `invites.create` | ✓ | ✓ | ✓ |
| `invites.unlimited` | | | ✓ |
| `workspace.manage` | ✓ | ✓ | ✓ |
| `ai.suggestions` | | ✓ | ✓ |

### Enforcement

- **Server:** `requireFeature(workspaceId, featureKey)` throws `FeatureGateError` (HTTP 402)
- **Client:** `hasFeature(plan, featureKey)` hides or disables UI actions (UX only)

> **Note:** Only `invites.create` is actively gated in server code today. Other feature keys are infrastructure for future enforcement. Search UI and server functions are live, but `search.fulltext` and `search.semantic` are not yet enforced on the `executeSearch` path.

## Workspace Settings

**Route:** `/w/$workspaceId/settings`

**File:** [`src/routes/_authenticated.w.$workspaceId.settings.tsx`](../../src/routes/_authenticated.w.$workspaceId.settings.tsx)

Admin-only modal overlay for:

- Creating email invites (select role, copy link)
- Viewing pending invites
- Revoking invites

Server functions: [`src/lib/invites.functions.ts`](../../src/lib/invites.functions.ts)

## Page Visibility

Pages have a `visibility` enum that controls who can access them:

| Visibility | Who can see |
|------------|-------------|
| `private` | Owner and explicit collaborators only |
| `conversation` | Conversation participants (if linked) |
| `workspace` | All workspace members |
| `external` | Schema-ready; not yet implemented in UI |

Collaborators are tracked in `page_collaborators` when they edit a page.

## Related Docs

- [Auth](../architecture/auth.md) — RLS and token flow
- [User Search](../search/user_search.md) — Search overlay in the workspace UI
- [User Onboarding](user_onboarding.md) — How users join workspaces
- [Database](../architecture/database.md) — Schema details
