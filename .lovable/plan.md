## Fix versioning rule

### 1. Correct the patch-increment rule
- The rule is: patch increments by **1** per change (e.g. 0.1.22 → 0.1.23), not by 0.1.
- Update `.lovable/plan.md` versioning section so future bumps follow the corrected rule.
- No change to `src/lib/version.ts` right now — current `0.1.22` stays until the next feature bump.

### 2. Add "Last commit" row to the console banner
- Update `src/lib/log-version.ts` to insert a **Last commit** row between **Built** and **Environment**.
- Per the existing rule ("if you don't have this information, ignore the whole row"), the row is omitted when no commit ID is available.

### Out of scope
- Creating `README.md` (explicitly excluded).
- Wiring a real git SHA into the build. Can be added later via a Vite `define` if you want the commit row to actually render.
