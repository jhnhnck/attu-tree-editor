---
name: firefox-profiling-analyzer
description: Analyze a Firefox Profiler .json.gz capture from the FamilyTreeEditor app (or any web client). Use whenever the user shares a `.json.gz` profile, asks about CSS-transition / SetNeedStyleFlush / GCMajor / LongTask markers, or wants to triage performance regressions. Includes a stdlib-only Python analyzer script (`analyze.py`) that prints meta, threads, marker overview, GC events, LongTask distribution, Styles, top SetNeedStyleFlush cause stacks, and a "Notable anomalies" triage list. Documents schema v34 / preprocessedProfileVersion 61 quirks (shared stringArray, marker phase encoding, Reflow paired-phase trap), and how to translate findings to source code in apps/web/src/lib/.
---

# Profile — Firefox performance profiler analyzer

A working profile for the next agent (or human) doing performance analysis on
this codebase using Firefox Profiler data. It covers the extraction workflow,
what the profile structure looks like, what's worth chasing, and what to ignore.

---

## TL;DR — run the analyzer script

For any new `.json.gz`, the first move is the canned script bundled with this
skill:

```bash
python3 .claude/skills/firefox-profiling-analyzer/analyze.py "Firefox YYYY-MM-DD HH.MM profile.json.gz"
```

It prints meta, thread table, marker overview, DOMEvent breakdown, GC events,
LongTask distribution, Styles analysis, the top 10 `SetNeedStyleFlush` cause
stacks resolved to function/file/line, and a final "Notable anomalies" section
that flags items over hardcoded thresholds. Stdlib-only Python — no install.

Drop into ad-hoc Python only when the script's output points at something it
doesn't already break down (e.g. a marker type the script doesn't know about).

---

## Reading the .json.gz file

Firefox saves profiles as gzipped JSON. The standard capture tool (Ctrl+Shift+1
or the Firefox Profiler extension) exports a `.json.gz`. Read it with Python —
no dependencies needed:

```python
import json, gzip
with gzip.open("Firefox YYYY-MM-DD HH.MM profile.json.gz") as f:
    d = json.load(f)
```

The data is large — a 3-minute profile at 1 ms interval has ~180k samples per
thread and 220k+ markers on the busiest thread. Load it once and query it.

### Schema v34 / preprocessedProfileVersion 61 (current)

All profiles captured against Firefox 150+ on this project use this schema. Key
shape differences from older Firefox versions you may have seen documented:

- **`d['shared']['stringArray']`** — *single shared* string table for the whole
  profile. Per-thread `stringTable` does not exist. Marker `name` fields are
  integer indices into this array, not strings — resolve via
  `d['shared']['stringArray'][thread['markers']['name'][i]]`.
- **`d['shared']['stackTable']`, `frameTable`, `funcTable`, `resourceTable`** —
  also shared across threads.
- **Sample timing**: some threads carry `samples.time` (absolute), others carry
  `samples.timeDeltas` (incremental) within the same profile. Check for both.
- **Marker timing** is in `markers.startTime`, `markers.endTime`, `markers.phase`.
  No `markers.time` array.

### Marker phase encoding (the gotcha)

`markers.phase[i]` controls how to read `startTime[i]`/`endTime[i]`:

| phase | meaning | how to compute duration |
|:-:|:--|:--|
| 0 | instant | none — single timestamp in `startTime`, ignore `endTime` |
| 1 | complete interval | `endTime[i] - startTime[i]` (both fields are valid) |
| 2 | interval-start | save `startTime[i]`; pair with the next phase=3 of the same name |
| 3 | interval-end | duration = `endTime[i] - <pending phase-2 startTime>` |

Most markers (`Styles`, `LongTask`, `GCMajor`, `GCSlice`, `GCMinor`) use phase=1
— `startTime` and `endTime` populated in one record. **`Reflow (sync)` is the
exception** — it uses paired phase=2/phase=3 records, so naive
`endTime - startTime` returns garbage (≈ 1 million ms).

When in doubt, dump the phases first:
```python
from collections import Counter
print(Counter(thread['markers']['phase'][i]
              for i, n in enumerate(thread['markers']['name'])
              if n is not None and shared_str[n] == 'YourMarker'))
```

---

## Profile structure (schema v34)

```
d['meta']           → duration, interval, platform, appBuildID, configuration
d['shared']         → cross-thread tables:
  shared['stringArray']       → flat list of strings (function names, URLs, marker names)
  shared['stackTable']        → { prefix: [...], frame: [...] }
  shared['frameTable']        → { func: [...], line: [...], category: [...], ... }
  shared['funcTable']         → { name, lineNumber, columnNumber, resource, isJS, ... }
  shared['resourceTable']     → { name: [...], host: [...], type: [...] }
d['pages']          → list of {tabID, innerWindowID, url} — used to find the app thread
d['threads']        → list of thread objects:
  thread['name']                → "GeckoMain", "Compositor", "DOM Worker", ...
  thread['processName']         → "Isolated Web Content" (the app), "Parent Process", ...
  thread['pid'], thread['tid']  → process / thread IDs
  thread['usedInnerWindowIDs']  → which pages this thread served
  thread['samples']             → { stack, time | timeDeltas, threadCPUDelta, ... }
  thread['markers']             → { name, startTime, endTime, phase, data, category }
```

The sample `stack` index walks `shared['stackTable']['prefix']` up to -1 (or
null) to build a call chain. The terminal frame resolves through
`stackTable.frame[i]` → `frameTable.func[fid]` → `funcTable.name[func_idx]` →
`stringArray[name_idx]`.

For most analysis tasks, **markers are more useful than samples**. Markers are
named events with structured payloads — GC events, CSS transitions, DOM events,
paint timings. Samples are raw CPU snapshots and most will be "idle".

### Picking the app thread

The Parent Process GeckoMain *also* references the tab's innerWindowID (it
serves the URL bar / chrome). When matching `usedInnerWindowIDs` against
`localhost:5173`-bearing pages, you'll get matches for both pid=parent and the
content process. Always prefer `processName == 'Isolated Web Content'` (or
`'Web Content'`) — the parent process matches are misleading.

The analyzer script handles this in `find_app_thread()`.

---

## Key marker types and what they mean

### CSS transition  (note: marker name has a space — *not* `CSSTransition`)

```python
shared_str[name_idx] == 'CSS transition'
data['property']   # e.g. "border-top-color", "opacity", "transform"
```

Non-GPU properties (`background-color`, `border-*-color`, `color`) trigger
browser repaints on every animation frame. GPU-composited properties (`opacity`,
`transform`) do not — they're fine to leave. A burst of border/background-color
transitions almost always traces back to a Tailwind `transition-colors` class
on a component that's rendered many times simultaneously (e.g. a card repeated
across the tree canvas).

In this codebase, the fix was removing `transition-colors` from `PersonNode.svelte:80`.
If it returns, search for `transition-colors` in `*.svelte` files and check whether
it's on a multiply-rendered component.

### SetNeedStyleFlush — `style:` directive on a hot component

```python
shared_str[name_idx] == 'SetNeedStyleFlush'
data['cause']['stack']   # → resolve via shared stackTable
```

These are emitted whenever code calls `element.style.setProperty(...)` (and a
few other style-mutating paths). A volume in the **tens of thousands** during a
~3-minute profile is the signal — that means a per-frame reactive value is
being written to N visible nodes' inline styles.

Inspect the top cause stacks. If they look like
`CSS parsing → CSSStyleDeclaration.setProperty → update_styles → set_style → SomeComponent/<`
the call site is a Svelte `style:foo={reactiveValue}` directive on a multiply-
rendered component. The fix is to hoist the value to a CSS custom property on
the parent (the canvas stage / viewport / list container), set it once per
frame, and read it from the children with `var(--name)`.

Found in this codebase: `style:border-width={borderWidth}` on
`PersonNode.svelte:91` produced 18,119 SetNeedStyleFlush in one profile (and
contributed to 43 Styles flushes >16ms, max 50ms). The pattern to use instead
is `style:--node-border-width=…` on the canvas stage with
`border-width: var(--node-border-width, 2px)` on the node's CSS rule. One
setProperty per zoom frame replaces N × visible-nodes setProperty calls.

### GCMajor / GCMinor / GCSlice

```python
data['timings']['max_pause']        # ms — anything over 16ms drops frames
data['timings']['total_time']       # ms
data['timings']['reason']           # "ALLOC_TRIGGER", "FULL_GC_TIMER", "CC_FINISHED", "PAGE_HIDE"
data['timings']['allocated_bytes']  # heap *after* collection (peak ≈ before)
data['timings']['post_heap_size']   # JS heap after collection
```

(In v34 the field is `allocated_bytes`, not `heap_allocated_bytes` as some
older docs and the v31 version of this guide claimed.)

GC pauses over ~16 ms drop frames. Over ~50 ms they feel like stutters.
`ALLOC_TRIGGER` means the heap grew fast and forced a cycle — these happen
mid-interaction and are the most disruptive. `FULL_GC_TIMER` is a periodic
sweep on a timer; `CC_FINISHED` runs after the cycle collector and tends to
follow the bigger ones.

In this codebase the original culprit was the undo/redo history storing full
`Tree` snapshots — fixed with delta-based diffs in `domain/treeDiff.ts`. The
2026-04-27 profile shows GCMajor max_pause still hitting 49ms on
`ALLOC_TRIGGER` events: heap peaks at ~125 MB during heavy panning before
collapsing to ~46 MB. The remaining pressure is from Svelte's DOM
reconciliation (insert/remove during viewport culling), not from the app's own
data structures. If `allocated_bytes` climbs above ~150 MB at GC time, look
for new unbounded arrays.

### DOMEvent

```python
data['type'] == 'DOMEvent'
data['eventType']   # "pointermove", "pointerdown", "wheel", "MozAfterPaint"
```

High `pointermove` frequency (> 60/sec) during pan is expected — the canvas pan
handler listens globally. What matters is whether the handler does expensive
work. In this codebase the handler updates `panX`/`panY` (reactive, triggers a
CSS transform update on `panEl`) — that's fine and GPU-composited. What was
*not* fine was a `hostEl.style.cursor` write on every drag threshold crossing;
that's now a class toggle instead.

`MozAfterPaint` events show repaint frequency. A count proportional to your
frame rate (60/sec → ~3600 in 60 sec) is normal. Spikes above that mean
something is forcing extra paints outside the normal frame cycle.

### LongTask

Tasks > 50 ms in the main thread. Firefox marks these automatically.
A few per minute is acceptable. Dozens per minute while the user is just
panning or hovering is not — it means something in the main-thread event loop
is blocking.

---

## What the idle baseline looks like

A well-optimized SPA at rest will show **96–100% of samples in idle stacks**
for all threads. That's correct — it means the browser is sleeping between
frames. Do not chase "idle" as a performance problem. The signal is in the
non-idle samples and in marker payloads, not in raw sample counts.

If you see a thread with 80–90% non-idle samples, that thread is doing real
work. Identify what functions appear repeatedly in its non-idle stacks — those
are the hot paths.

---

## Extension noise — do not chase

Markers and samples from `moz-extension://` URLs are from the user's installed
browser extensions, not from the app. You'll often see idle-callback timeouts
from autofill/password-manager extensions. These show up in the marker list but
are outside your control. Filter them by checking `data.stack` for extension
URLs and skip. The profile noted 4,629 idle-callback timeouts from an autofill
extension — that's real overhead but unrelated to the app.

---

## Connecting profile findings to source code

The general workflow:

1. **Tally marker counts by type.** Find the dominant marker category.
2. **For CSS transitions**: `data['property']` names the animated CSS property.
   Search for `transition` in `.svelte` files; rule out GPU properties
   (`opacity`, `transform`) immediately. The offender will be a Tailwind
   utility like `transition-colors` on a frequently rendered element.
3. **For GC pressure**: look at `reason` and `allocated_bytes`. Then grep
   for large arrays that grow without bound — `past.push(...)`, unbounded caches
   (`new Map()` that only adds). In this codebase: `tree.svelte.ts` (fixed) and
   the portrait URL cache in `portraitUrls.svelte.ts` (bounded by explicit
   `revoke`/`clear` calls, not by size — worth monitoring on very large trees).
4. **For event frequency**: find the listener in source with
   `grep -rn "addEventListener\|on:pointermove\|onpointermove"`. Check what
   work the handler does per call — DOM reads and writes force synchronous
   layout and should be batched or deferred.
5. **For long tasks**: look at the call stack in the profiler UI rather than
   in the raw JSON — the Firefox Profiler web UI at profiler.firefox.com gives
   a flame chart that's much faster to read for stack analysis. Load the `.json.gz`
   directly into that UI for visual inspection.

---

## Performance wins already in this codebase (don't regress)

| Component | What's good | Why it matters |
|:---|:---|:---|
| `EdgeLayer.svelte` | One `<path>` per role; `vector-effect: non-scaling-stroke` | Pan/zoom is GPU-composited — no reparse of `d` per frame |
| `TreeCanvas.svelte` | Viewport culling of `PersonNode`s | Only visible cards render |
| `TreeCanvas.svelte` | Level-of-detail by zoom scale | Cards at scale < 0.06 render as dots, not full DOM |
| `TreeCanvas.svelte` | `contain: layout style` on `.canvas-stage` | DOM insertions during culling don't retrigger style recalculation outside the canvas |
| `TreeCanvas.svelte` | `onWheel` uses `hostW`/`hostH` (no `getBoundingClientRect`) | No forced synchronous layout on every zoom event |
| `tree.svelte.ts` | Delta-based undo history (`TreeDiff`) | 200-step history ≈ ~40 KB instead of ~40 MB |
| `PersonNode.svelte` | No `transition-colors` | 5-property color animations removed from every card |
| `PersonNode.svelte` / `.person-node-host` | `contain: layout style paint` | Each card's internal DOM changes are isolated from siblings |

If a future diff reintroduces `transition-colors` to `PersonNode.svelte`,
restores `Tree[]` snapshots in `tree.svelte.ts`, removes `contain: layout style`
from `.canvas-stage`, or re-adds `getBoundingClientRect()` to `onWheel`, those
are regressions.

## Open issues from the 2026-04-27 profile (not yet fixed)

- **`PersonNode.svelte:91` `style:border-width={borderWidth}`** — fires
  `CSSStyleDeclaration.setProperty` per visible node per zoom frame
  (18,119 `SetNeedStyleFlush` markers in a 3-minute profile). Hoist to a CSS
  custom property on the canvas stage so it's set once per frame instead of
  N × visible nodes. See the SetNeedStyleFlush section above for the pattern.
- **GCMajor `ALLOC_TRIGGER` events still hit 49ms max_pause** during heavy
  panning. Root cause is allocation pressure from Svelte's `{#each}` reconcile
  inserting/removing PersonNodes through viewport culling — `remove_effect_dom`
  → `Element.remove` is also the dominant `Reflow (sync)` cause. Reducing the
  per-node setProperty traffic should also reduce nursery churn.

---

## Approach when a new profile lands

1. **Run `python3 .claude/skills/firefox-profiling-analyzer/analyze.py path/to/profile.json.gz`** first.
   The "Notable anomalies" section at the bottom is the triage list. The
   sections above it back the anomalies up with numbers.
2. If the script flags **CSS transition** > 100, find `transition-*` on a
   multiply-rendered Svelte component and check whether the property is GPU-
   composited (transform/opacity = OK; color/border-color/background = bad).
3. If it flags **SetNeedStyleFlush** in the tens of thousands, the top cause
   stack tells you which component and which `style:` directive. Hoist to a
   CSS custom property on the parent.
4. If it flags **LongTask > 200ms** or **Styles > 30ms**, look at
   `elementsTraversed` and `stylesShared` in the Styles top-5 — high traversed
   with shared=0 means containment is missing or the contained subtree is huge.
5. If it flags **GCMajor max_pause > 30ms**, look at the `alloc(MB)` column —
   a peak above 100 MB means something is accumulating; otherwise it's
   reconciliation churn (pretty much intrinsic to Svelte's `{#each}` for now).
6. Translate findings to: **what the profile shows → what in the code causes
   it → concrete file:line → recommended fix and expected outcome**.
7. Sort by severity: repaint-per-frame issues > GC pauses > occasional long
   tasks > extension noise.

The script doesn't dig into samples (CPU stacks). For that, drop the `.json.gz`
into profiler.firefox.com — its flame chart is much faster to read than raw
sample-table queries in Python.

---

## What good looks like after fixes

Re-profile at the same interaction (pan the canvas, hover a few cards, make
a few edits) and compare:

- `CSS transition` marker count: should drop from thousands to near zero
- `GCMajor` max_pause: should drop from 49 ms to < 10 ms
- `allocated_bytes` at GC trigger: should drop proportionally
- `SetNeedStyleFlush` count: should drop into the low thousands once `style:`
  directives on hot components have been hoisted to CSS custom properties
- Overall frame rate in the Profiler's header timeline: should be smoother
  (fewer dips below the baseline)

---

## Caveats

- **Profile at the same interaction each time.** Profiling while idle produces
  no signal. Profiling while scrolling a large tree vs. editing a single person
  will show completely different bottlenecks.
- **Capture duration matters.** < 10 seconds may not include enough GC cycles
  to diagnose memory pressure. 60 seconds at 1 ms interval is a good default.
- **The profiler itself has overhead.** Extremely tight loops (< 1 ms per
  iteration) may not be visible in 1 ms sampling. If you suspect a specific
  function, use `console.time()`/`console.timeEnd()` or a `performance.mark`
  span to get precise timings.
