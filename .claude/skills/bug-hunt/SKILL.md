---
name: bug-hunt
description: >
  Structured debugging playbook for tracking down bugs — in a specific module or anywhere across the codebase. Trigger on "find this bug", "track down the issue", "debug X", "why is X broken", "hunt down a bug", "something's wrong with", "help me debug"; when behavior is incorrect and the cause is unknown; when you need a systematic plan before reading code. Not for writing features, code review, or performance profiling.
---

## reproduce first

Pin the exact inputs, state, and sequence that trigger the bug. A bug you can't reproduce reliably cannot be fixed reliably.

## narrow scope immediately

Ask: is the bad value coming from frontend, backend, or the boundary?
- **Network tab first** — is the request wrong, or the response? This alone splits the search space.
- **`pnpm typecheck`** — type errors masquerade as runtime bugs and are cheaper to catch here first.

## specific module (location roughly known)

1. Read the tests — they encode expected behavior; run just that module's suite first.
2. Trace the bad value — follow the single wrong value from its origin through every transformation; don't read the whole file.
3. Binary-search the call stack — insert a check at the midpoint; wrong before or after? Repeat until invariants first break.
4. Add assertions — `console.assert` or `invariant` around your hypothesis; let the runtime tell you when the assumption breaks.
5. `git bisect` — mark a good and bad commit, let git binary-search; finds the culprit in ~7 steps even across hundreds of commits.

## unknown location

1. Grep for the symptom — search the error string, the wrong output value, or the bad property name; usually lands you in the right file immediately.
2. Work backwards from the observable failure — find where the bad output is rendered or returned, then trace backwards through callers; don't guess forward.
3. Diff against known-good — `git diff <last-good-tag>` to surface recent changes; bugs introduced recently are almost always in the diff.
4. Eliminate variables — comment out features, simplify inputs, revert configs until the bug disappears; what you just removed is the cause.

## zoom out — is this a symptom?

Once you've found the exact line that breaks, pause before fixing it. Ask:

- **Does this same wrong assumption appear elsewhere?** Grep for the pattern, not just the instance. If three other callsites make the same mistake, the fix belongs one level up, not in three places.
- **Why was this assumption wrong in the first place?** If the answer is "the caller shouldn't have to know this", the boundary between modules is leaking — the fix is an invariant at the boundary, not a guard at the callsite.
- **Has this class of bug appeared before?** `git log --all -S "<symptom string>"` or `git log --grep="<keyword>"` to find prior related fixes. Two fixes for the same root cause means the root cause wasn't fixed.
- **Is the data model forcing this code to be defensive?** If the bug required adding a null check, an existence guard, or a fallback default, ask whether the type or schema should have prevented it. A `schemaVersion` migration or a stricter type may be the real fix.
- **Does the fix change behavior at a boundary the user never controls?** If so, the architectural layer (store, service, domain) is doing work that belongs in validation — see CLAUDE.md §permissive schema / validate-as-finding rule.

If any of these flag a broader issue, note it separately — fix the immediate bug, then surface the structural problem as a follow-up so it doesn't get lost.

## codebase-specific tools

- **Svelte 5 reactivity bugs** — `$inspect(value)` logs on every reactive update; cheapest reactive tracer available.
- **Component state** — browser devtools → Svelte panel shows live component state without console logs.
- **Type bugs** — `pnpm typecheck` before reaching for a debugger.
- **API shape bugs** — network tab before reading any backend code; confirm request and response shapes match the contract.

## meta-principle

Most bugs are wrong assumptions, not wrong code. Find which assumption broke; don't read all the code hoping to spot the error.
