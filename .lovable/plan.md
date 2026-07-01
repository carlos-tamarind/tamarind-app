## Conversation timestamp redesign

File: `src/components/conversation/conversation-window.tsx` (presentation-only change).

### 1. Day separators

Render the message list as a flat sequence of items. Insert a separator **before** any message whose local date differs from the previous message's local date.

- If the conversation has no messages, render the existing empty state and emit **no separators**.
- A separator always has at least one message directly below it (the message that triggered the new-day check), so it never appears as a trailing element or above an empty area.

Separator layout:

- Italic, muted label: `Sun, 28 Jun 2026` format. Build with `Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(d)`, then insert a comma after the weekday.
- Centered divider directly below the label, at `66%` of the message list width (`w-2/3`), using `border-t border-border/60`. It resizes automatically with the panel.
- Vertical spacing above/below (`mt-6 mb-4`) to separate day groups cleanly.

### 2. Per-message timestamps

Replace the existing `formatTimestamp` helper with a function that compares the message's local date to the current local date:

- Same calendar day as today → `HH:MM:SS`
- Yesterday or any earlier day → `YYYY-MM-DD HH:MM:SS`

Keep the timestamp in the same position under the bubble, same muted size.

### 3. Constraint: no orphaned day separators

Do not render a day separator unless it is immediately followed by a message. This naturally happens because the separator is inserted only before the first message of a new day. Empty conversations and trailing days therefore never show a separator alone.

### Notes

- No schema, server, or API changes.
- Time formatting is locale-independent for the numeric portions; the day separator uses English short weekday/month names as specified.
- The separator is a full-width `<li>` inside the existing `<ul>`, so it participates in the normal document flow and adapts to panel width changes.
