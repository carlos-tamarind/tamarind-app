# Demo data for "second workspace" (Method A: real app + background jobs)

## Current state
- Workspace `4b132e23-…` has 4 members, all with confirmed access. It has no conversations or pages yet.

## Cast (4 users, enough for a realistic demo)
- Peter: Engineering Manager (admin)
- Sonia: Backend Engineer
- Anna: Product Manager
- Calvin: DevOps / Platform Engineer

## Story (one fictional product: "Atlas" billing platform)
Five themes, each one becoming a conversation topic and then a knowledge-base node:
1. **Q4 payments migration**: moving from a legacy Rails service to a TanStack/Node service, with deadlines and milestones.
2. **Staging environment instability**: flaky CI, broken deploys, Terraform drift, secrets rotation.
3. **Checkout bug triage**: ticket ATL-482 (double charges), repro steps, hotfix, postmortem.
4. **AI support assistant initiative**: an LLM pilot, evaluation, cost concerns, data privacy.
5. **Design system / assets handoff**: Figma tokens, icon repo, front-end framework upgrade.
6. (optional) **Release planning v2.3**: links themes 1, 3 and 5.

## Conversations (about 6–8 in total, 15–30 messages each)
- `#engineering` channel (all 4): themes 1, 2, 6
- `#product-eng` group (Peter, Maya, Tommy): themes 3, 4, 6
- `#platform` group (Luis, Tommy): theme 2
- DMs: Peter↔Maya (deadlines), Tommy↔Luis (staging fix), Maya↔Peter (AI pilot budget)
- Messages are written as natural chat: questions, decisions, links to tickets, short acks (these get skipped on purpose, which also shows how filtering works).
- Each theme spans at least 2 conversations, which gives the graph its connecting lines.

## Pages (about 8)
- Workspace (public): "Payments Migration RFC", "Staging Runbook", "AI Assistant Pilot Brief", "Design Tokens Guide", "v2.3 Release Plan"
- Conversation-scoped: "ATL-482 Postmortem" (in #product-eng), "Terraform Drift Notes" (in #platform)
- Private: Maya's "Pilot budget draft"
- Pages created from messages (quote blocks) where it fits naturally.
- Each page is 400+ words, so it's long enough to get topics extracted.

## How it gets entered (truly end-to-end)
- An automated browser signs in as each user and types messages and pages into the real app, the same way people would. This means every normal background step runs: message processing, topic detection, page analysis, and the knowledge base.
- Messages go in conversation by conversation with small pauses, so topic detection follows a natural order.
- After that I wait for the background jobs to finish (they run on their usual schedule), check progress, and confirm:
  - each conversation shows a topic map with 2+ topics
  - the knowledge base shows 4–6+ nodes and several lines between them, for Peter and for Tommy
- If any node is missing, I find out why (for example the visibility rule) and report it. I won't force data in.

## What I need from you
1. Choose 2 or 4 users. If 4: invite Maya and Luis (any test emails) and let me know once they've accepted.
2. I'll sign in as each user through the preview's test sign-in. You'll get an approval prompt for each account.

## Technical details
- Playwright scripts in `/tmp/browser/seed-demo/` with a JSON script of conversations and pages. Nothing is added to the repo, no packages, no migrations.
- Verification is read-only queries on conversation_topics, page_topics, canonical_topics and evidences, plus a call to get_canonical_topic_graph_for_user for each user.
- AI usage: about 150–200 messages and 8 pages go through embeddings and LLM calls, which costs a small amount of credits.
- Cleanup later is easy: everything lives in this one workspace.
