#!/usr/bin/env python3
"""
Firefox profile analyzer — Gecko schema v34 / preprocessedProfileVersion 61.

Reads a `.json.gz` Firefox Profiler capture and prints a structured report:
marker counts, DOM events, GC events, LongTask distribution, Styles flush stats,
and the top SetNeedStyleFlush cause stacks resolved to function/file/line.

Stdlib-only; no install. Run from the project root:

    python3 .claude/skills/firefox-profiling-analyzer/analyze.py "Firefox YYYY-MM-DD HH.MM profile.json.gz"

The schema notes that drove this script are in this skill's SKILL.md.
"""

from __future__ import annotations

import gzip
import json
import sys
from collections import Counter


def load(path: str) -> dict:
    with gzip.open(path) as f:
        return json.load(f)


def find_app_thread(d: dict) -> dict | None:
    """Pick the GeckoMain thread serving the app tab. The Parent Process also
    references the tab's innerWindowID for chrome (URL bar etc.) — prefer the
    content process. Fall back to the busiest Isolated Web Content GeckoMain."""
    app_windows = {
        p["innerWindowID"]
        for p in d.get("pages", [])
        if "localhost" in p.get("url", "")
    }
    matches = []
    for t in d["threads"]:
        if t["name"] != "GeckoMain":
            continue
        used = set(t.get("usedInnerWindowIDs") or [])
        if used & app_windows:
            matches.append(t)
    if matches:
        # Prefer Isolated Web Content > Web Content > anything else.
        rank = {"Isolated Web Content": 0, "Web Content": 1}
        return min(matches, key=lambda t: rank.get(t.get("processName", ""), 99))
    candidates = [
        t
        for t in d["threads"]
        if t.get("processName") == "Isolated Web Content" and t["name"] == "GeckoMain"
    ]
    if candidates:
        return max(candidates, key=lambda t: len(t["markers"]["name"]))
    return None


def resolve_stack(sid: int | None, shared: dict, max_frames: int = 10) -> list[str]:
    """Walk shared stackTable -> frameTable -> funcTable -> stringArray."""
    frames: list[str] = []
    seen: set[int] = set()
    stack_t = shared["stackTable"]
    frame_t = shared["frameTable"]
    func_t = shared["funcTable"]
    res_t = shared["resourceTable"]
    strs = shared["stringArray"]
    while sid is not None and sid >= 0 and sid not in seen:
        seen.add(sid)
        fid = stack_t["frame"][sid]
        func_idx = frame_t["func"][fid]
        name_idx = func_t["name"][func_idx]
        name = strs[name_idx] if name_idx is not None else "?"
        line = func_t["lineNumber"][func_idx]
        res_idx = func_t["resource"][func_idx]
        filename = ""
        if res_idx is not None and res_idx >= 0 and res_idx < len(res_t["name"]):
            rn = res_t["name"][res_idx]
            if rn is not None and rn >= 0:
                filename = strs[rn]
        # Trim noisy localhost prefix for compactness.
        filename = filename.replace("http://localhost:5173", "")
        frames.append(f"{name} ({filename}:{line})")
        sid = stack_t["prefix"][sid]
        if len(frames) >= max_frames:
            break
    return frames


def interval_durations(
    thread: dict, target_name: str, shared_str: list[str]
) -> list[float]:
    """Compute durations for a marker name, handling all four phase encodings:
      0  instant — 0ms
      1  complete interval — endTime - startTime in one record
      2  interval-start — pair with the next phase=3 of the same name
      3  interval-end — paired with the preceding phase=2
    """
    names = thread["markers"]["name"]
    startT = thread["markers"]["startTime"]
    endT = thread["markers"]["endTime"]
    phases = thread["markers"]["phase"]
    durs: list[float] = []
    pending: float | None = None
    for i, n in enumerate(names):
        if n is None or shared_str[n] != target_name:
            continue
        p = phases[i]
        if p == 0:
            durs.append(0.0)
        elif p == 1:
            if startT[i] is not None and endT[i] is not None:
                durs.append(endT[i] - startT[i])
        elif p == 2:
            pending = startT[i]
        elif p == 3 and pending is not None:
            durs.append(endT[i] - pending)
            pending = None
    return durs


def stats(durs: list[float]) -> dict:
    if not durs:
        return {"count": 0}
    s = sorted(durs)
    return {
        "count": len(s),
        "min": s[0],
        "median": s[len(s) // 2],
        "max": s[-1],
        "total": sum(s),
        "p95": s[int(0.95 * len(s))],
    }


def fmt_dur(d: dict) -> str:
    if not d.get("count"):
        return "(none)"
    return (
        f"count={d['count']}  min={d['min']:.1f}ms  median={d['median']:.1f}ms  "
        f"p95={d['p95']:.1f}ms  max={d['max']:.1f}ms  total={d['total']:.0f}ms"
    )


# --- Report sections -----------------------------------------------------

def section(title: str) -> None:
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def report_meta(d: dict) -> None:
    section("Meta")
    m = d["meta"]
    start = m.get("profilingStartTime", 0)
    end = m.get("profilingEndTime", 0)
    print(f"  duration         {(end - start) / 1000:.1f}s ({end - start:.0f}ms)")
    print(f"  interval         {m.get('interval')}ms")
    print(f"  CPU              {m.get('CPUName')}  ({m.get('logicalCPUs')}t)")
    print(f"  build            {m.get('appBuildID')}  rv:{m.get('misc')}")
    cfg = m.get("configuration") or {}
    print(f"  active tab       {cfg.get('activeTabID')}")
    print(f"  features         {', '.join(cfg.get('features', []))}")
    print(f"  schema           v{m.get('version')} / processed v{m.get('preprocessedProfileVersion')}")


def report_threads(d: dict, app_thread: dict | None) -> None:
    section("Threads")
    print(f"  {'name':30} {'process':22} {'pid':>6} {'samples':>9} {'markers':>9}")
    for t in sorted(d["threads"], key=lambda t: -len(t["markers"]["name"])):
        marker = "  *" if t is app_thread else "   "
        print(
            f"{marker}{t['name'][:28]:30} {(t.get('processName') or '')[:20]:22} "
            f"{t['pid']:>6} {len(t['samples']['stack']):>9} {len(t['markers']['name']):>9}"
        )
    if app_thread is not None:
        print(f"\n  app thread: pid={app_thread['pid']} (* above)")


def report_markers_overview(thread: dict, shared_str: list[str]) -> Counter:
    section("Marker overview (app thread, top 30)")
    c: Counter = Counter()
    for n in thread["markers"]["name"]:
        if n is not None:
            c[shared_str[n]] += 1
    for name, cnt in c.most_common(30):
        print(f"  {cnt:>7}  {name}")
    return c


def report_dom_events(thread: dict, shared_str: list[str]) -> None:
    section("DOMEvent breakdown")
    names = thread["markers"]["name"]
    data = thread["markers"]["data"]
    types: Counter = Counter()
    for i, n in enumerate(names):
        if n is None or shared_str[n] != "DOMEvent":
            continue
        d2 = data[i]
        if isinstance(d2, dict):
            types[d2.get("eventType", "?")] += 1
    for ev, cnt in types.most_common(25):
        print(f"  {cnt:>6}  {ev or '<empty>'}")


def report_css_transitions(thread: dict, shared_str: list[str]) -> None:
    section("CSS transition (target: 0 — non-GPU transitions on hot components)")
    names = thread["markers"]["name"]
    data = thread["markers"]["data"]
    props: Counter = Counter()
    total = 0
    # Firefox uses "CSS transition" (with space); older builds used "CSSTransition".
    for i, n in enumerate(names):
        if n is None or shared_str[n] not in ("CSS transition", "CSSTransition"):
            continue
        total += 1
        d2 = data[i]
        if isinstance(d2, dict):
            props[d2.get("property", "?")] += 1
    print(f"  total: {total}")
    if not props:
        if total == 0:
            print("  (none — good)")
        return
    print("  by property:")
    for prop, cnt in props.most_common():
        print(f"    {cnt:>5}  {prop}")


def report_gc_major(thread: dict, shared_str: list[str]) -> None:
    section("GCMajor events")
    names = thread["markers"]["name"]
    data = thread["markers"]["data"]
    startT = thread["markers"]["startTime"]
    rows = []
    for i, n in enumerate(names):
        if n is None or shared_str[n] != "GCMajor":
            continue
        d2 = data[i] or {}
        t = d2.get("timings", {}) if isinstance(d2, dict) else {}
        rows.append(
            {
                "t": startT[i],
                "max_pause": t.get("max_pause", 0),
                "total_time": t.get("total_time", 0),
                "reason": t.get("reason", "?"),
                "alloc": t.get("allocated_bytes", 0),
                "post": t.get("post_heap_size", 0),
                "slices": t.get("slices", 0),
            }
        )
    print(f"  count: {len(rows)}")
    if rows:
        print(f"  {'t (ms)':>10}  {'max_pause':>10}  {'total':>8}  {'alloc(MB)':>9}  {'post(MB)':>9}  reason")
        for r in rows:
            print(
                f"  {r['t']:>10.0f}  {r['max_pause']:>10.1f}  {r['total_time']:>8.1f}"
                f"  {r['alloc'] / 1_048_576:>9.1f}  {r['post'] / 1_048_576:>9.1f}  {r['reason']}"
            )
        max_pauses = [r["max_pause"] for r in rows]
        print(
            f"\n  worst max_pause: {max(max_pauses):.1f}ms"
            f"  (>30ms: {sum(1 for p in max_pauses if p > 30)},"
            f" >50ms: {sum(1 for p in max_pauses if p > 50)})"
        )


def report_gc_slice(thread: dict, shared_str: list[str]) -> None:
    section("GCSlice + GCMinor")
    for marker in ("GCSlice", "GCMinor"):
        durs = interval_durations(thread, marker, shared_str)
        s = stats(durs)
        if s["count"]:
            over = sum(1 for d in durs if d > 16)
            print(f"  {marker}: {fmt_dur(s)}  >16ms={over}")
        else:
            print(f"  {marker}: (none)")


def report_long_tasks(thread: dict, shared_str: list[str]) -> None:
    section("LongTask (>50ms main-thread tasks)")
    durs = interval_durations(thread, "LongTask", shared_str)
    s = stats(durs)
    if not s["count"]:
        print("  (none)")
        return
    over_100 = sum(1 for d in durs if d > 100)
    over_200 = sum(1 for d in durs if d > 200)
    print(f"  {fmt_dur(s)}")
    print(f"  >100ms: {over_100}  >200ms: {over_200}")


def report_styles(thread: dict, shared_str: list[str]) -> None:
    section("Styles flush analysis")
    names = thread["markers"]["name"]
    data = thread["markers"]["data"]
    startT = thread["markers"]["startTime"]
    endT = thread["markers"]["endTime"]
    phases = thread["markers"]["phase"]
    rows = []
    pending_start: float | None = None
    pending_data: dict | None = None
    for i, n in enumerate(names):
        if n is None or shared_str[n] != "Styles":
            continue
        p = phases[i]
        d2 = data[i] if isinstance(data[i], dict) else {}
        if p == 1:
            if startT[i] is not None and endT[i] is not None:
                rows.append({"dur": endT[i] - startT[i], "data": d2})
        elif p == 2:
            pending_start = startT[i]
            pending_data = d2 or None
        elif p == 3 and pending_start is not None:
            dur = endT[i] - pending_start
            rows.append({"dur": dur, "data": pending_data or d2})
            pending_start = None
            pending_data = None
    print(f"  count: {len(rows)}")
    if not rows:
        return
    durs = [r["dur"] for r in rows]
    s = stats(durs)
    print(f"  duration: {fmt_dur(s)}")
    over_16 = sum(1 for d in durs if d > 16)
    over_30 = sum(1 for d in durs if d > 30)
    print(f"  >16ms: {over_16}  >30ms: {over_30}")
    traversed = [r["data"].get("elementsTraversed", 0) for r in rows]
    if traversed:
        traversed_sorted = sorted(traversed)
        print(
            f"  elementsTraversed: median={traversed_sorted[len(traversed_sorted) // 2]}"
            f"  max={max(traversed)}"
        )
    no_share = sum(1 for r in rows if r["data"].get("stylesShared", 0) == 0)
    no_reuse = sum(1 for r in rows if r["data"].get("stylesReused", 0) == 0)
    print(f"  stylesShared=0: {no_share}/{len(rows)}  stylesReused=0: {no_reuse}/{len(rows)}")
    print("\n  top 5 slowest:")
    for r in sorted(rows, key=lambda x: -x["dur"])[:5]:
        print(
            f"    {r['dur']:>6.1f}ms  traversed={r['data'].get('elementsTraversed', 0):>5}"
            f"  styled={r['data'].get('elementsStyled', 0):>5}"
            f"  shared={r['data'].get('stylesShared', 0):>3}"
            f"  reused={r['data'].get('stylesReused', 0):>3}"
        )


def report_setneed_causes(thread: dict, shared: dict) -> None:
    section("SetNeedStyleFlush — top cause stacks")
    shared_str = shared["stringArray"]
    names = thread["markers"]["name"]
    data = thread["markers"]["data"]
    total = 0
    causes: Counter = Counter()
    for i, n in enumerate(names):
        if n is None or shared_str[n] != "SetNeedStyleFlush":
            continue
        total += 1
        d2 = data[i]
        if not isinstance(d2, dict):
            continue
        cause = d2.get("cause", {})
        if isinstance(cause, dict):
            sid = cause.get("stack")
            if sid is not None:
                causes[sid] += 1
    print(f"  total markers: {total}")
    print(f"  distinct cause stacks: {len(causes)}")
    print()
    for sid, cnt in causes.most_common(10):
        frames = resolve_stack(sid, shared, max_frames=8)
        print(f"  {cnt:>6}  {' -> '.join(f[:50] for f in frames[:4])}")
        for f in frames[:8]:
            print(f"          {f}")
        print()


def report_anomalies(thread: dict, shared_str: list[str], counts: Counter) -> None:
    section("Notable anomalies")
    flagged = []
    css_trans = counts.get("CSS transition", 0) + counts.get("CSSTransition", 0)
    if css_trans > 100:
        flagged.append(
            f"CSS transition markers = {css_trans} (target: <100). "
            f"Find `transition-*` utility on a multiply-rendered Svelte component."
        )
    setneed = counts.get("SetNeedStyleFlush", 0)
    if setneed > 5_000:
        flagged.append(
            f"SetNeedStyleFlush = {setneed} — likely per-node style mutations "
            f"(e.g. `style:` directive on a hot component). Hoist to a CSS custom "
            f"property on the parent."
        )
    long_task_durs = interval_durations(thread, "LongTask", shared_str)
    over_200 = sum(1 for d in long_task_durs if d > 200)
    if over_200 > 0:
        flagged.append(f"{over_200} LongTask(s) > 200ms — multi-frame stalls")
    style_durs = interval_durations(thread, "Styles", shared_str)
    over_30 = sum(1 for d in style_durs if d > 30)
    if over_30 > 0:
        flagged.append(
            f"{over_30} Styles flush(es) > 30ms — element traversal cost; "
            f"check `contain: layout style` on the canvas stage."
        )
    if not flagged:
        print("  (none)")
    else:
        for line in flagged:
            print(f"  - {line}")


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    path = sys.argv[1]
    d = load(path)
    shared = d["shared"]
    shared_str = shared["stringArray"]
    print(f"profile: {path}")
    report_meta(d)
    app_thread = find_app_thread(d)
    report_threads(d, app_thread)
    if app_thread is None:
        print("\n  (no app thread identified — stopping here)")
        return 1
    counts = report_markers_overview(app_thread, shared_str)
    report_dom_events(app_thread, shared_str)
    report_css_transitions(app_thread, shared_str)
    report_gc_major(app_thread, shared_str)
    report_gc_slice(app_thread, shared_str)
    report_long_tasks(app_thread, shared_str)
    report_styles(app_thread, shared_str)
    report_setneed_causes(app_thread, shared)
    report_anomalies(app_thread, shared_str, counts)
    return 0


if __name__ == "__main__":
    sys.exit(main())
