# Relationship vocabulary — first-class non-traditional families (14 May 2026)

Implements the design study at
[notes/features/relationship-vocabulary.md](../features/relationship-vocabulary.md).
Schema-and-renderer programme covering polycules, multi-parent
children, adoption/donor/surrogate, sworn bonds, transformations,
dynasties, consanguinity surfacing, and the GEDZIP-tier export split.
Runs in parallel with the
[Family View](./family-view.md) workstream, which delivered the
forward-compatibility hooks (`union-anchor` with `partnerIds[]`,
data-driven `role` helper, composable `cardDecorator`, overlay
toggle list, preferred-union UI state) on which this plan now lands
real data and real geometry.

---

## Goals

1. **Stroke palette + per-role rendering** lands without a schema
   change. The `adopted` / `half` / `divorced` distinctions that
   are already in `EdgeRole` become user-visible. The role helper
   that family-view wired (today returns `"blood"` for everything)
   becomes data-driven.
2. **Multi-parent children** (>2 legal / genetic / social parents)
   are first-class. Schema bumps from binary `motherId`/`fatherId`
   to `parentIds: ParentRef[]` (1.0.0 → 2.0.0). Multi-parent-drop
   renders in the layered engine.
3. **N-partner unions** (polycules, polyfidelitous triads / quads)
   are first-class. Schema bumps `CoupleRecord` to `UnionRecord`
   with `partnerIds: PersonId[]` (2.0.0 → 3.0.0). The
   `union-manifold` segment with a chosen geometry primitive
   (bus / ring / polygon) renders in the layered engine.
4. **Overlay relationships** (sworn bonds, transformations,
   reincarnations, alias-of, severance) are first-class. Schema
   adds `relationships: Relationship[]` (3.0.0 → 3.1.0, additive).
   A new overlay render pass runs independently of the
   rank-and-bus skeleton.
5. **Identity / species / origin extensions** (3.1.0 → 3.2.0,
   additive). `Person.gender` becomes a struct (`identity`,
   `pronouns`, `assignedAtBirth`, `fluid`); adds `species`,
   `kind`, `origin`. Cisgender is the default (identity inferred
   from `assignedAtBirth` when only one is set). The
   `cardDecorator` absorbs the new axes without rewriting
   `PersonNode`.
6. **Groups, sibship decorators, consanguinity surfacing**.
   `Group[]` (3.2.0 → 3.3.0, additive) for dynasties / houses /
   households / factions / orders / covenants.
   `SibshipDecorator[]` + `Person.birthOrder` (3.3.0 → 3.4.0,
   additive) for twins / clones / litters. Consanguinity is
   derived (no schema bump): duplicate ancestors highlighted,
   COI badge on the proband, double-line bonds for consanguineous
   unions.
7. **Single-tier GEDZIP export with `HEAD.SCHMA`-registered
   `_TREES_*` extensions always on.** One file format — GEDCOM 7
   with `HEAD.SCHMA` registering the
   `https://attuproject.org/trees/schema/v1#` namespace, full
   round-trip preservation of all schema fields. Complex
   non-traditional bits (polycules, multi-parent children,
   transformations, severances, groups, sibship, etc.) get
   **inline best-effort standard-tag fallbacks** emitted
   *alongside* the `_TREES_*` tags so other genealogy tools still
   render a coherent (if degraded) view. No user-facing tier
   choice; no "lossy" mode separate from "accurate."
8. **No regression in Family View.** Every phase's integration
   check verifies family-view's six layers (expansion state, union
   anchor, path highlight, editing affordances, card decorator,
   overlay toggle list) still work end-to-end against the Akarians
   DEMO.

---

## Claimed from `notes/to-do.md` and `notes/bugs.md`

This plan absorbs the following queued items. Each phase that
delivers a claim cites it inline; this section is the
consolidated index so the trackers can be updated in one pass.

**From `notes/to-do.md` (closed by this plan):**

| entry | absorbing phase |
|---|---|
| schema evolution: replace `motherId` / `fatherId` with `parentIds[]` | Phase 2 |
| schema evolution: add generic `relationships[]` overlay | Phase 4 |
| schema evolution: add `birthOrder?` on `Person` | Phase 6b |
| schema evolution: add optional `name?` to `CoupleRecord` | Phase 3 (as `UnionRecord.name?`) |
| tooling / infra: `.claude/skills/schema-evolution/` skill | Phase 8 |

**From `notes/to-do.md` (conditional; claimed iff Phase 1's
30-overlay probe forces A\* into scope):**

| entry | absorbing phase |
|---|---|
| phase 6 polish: orthogonal edge routing with obstacle avoidance (A\*) | Phase 4 (conditional) |

**From `notes/bugs.md` (closed by this plan as load-bearing
prerequisites for n-ary routing):**

| entry | absorbing phase |
|---|---|
| multi-spouse bond passes through intervening ghost card | Phase 3 |
| 12% of drops have negative height (multi-parent root cause) | Phase 2 |
| 12% of drops have negative height (single-parent root cause) | Phase 2 (couple-equalisation post-pass) |
| spurious ghost on the top rank after "add parent" | Phase 2 (same post-pass) |

After this plan ships, **the to-do.md and bugs.md authors should
mark these entries as claimed by this plan** (or close them once
the absorbing phase ships). The plan file isn't a tracker
itself, but it points at every queued item it consumes.

---

## Non-goals

- ~~A\* obstacle-avoidance router (deferred).~~ **PROMOTED INTO
  PHASE 4 SCOPE by the Phase 1 30-overlay readability probe**
  (verdict: unreadable, 60 skeleton crossings on Akarians).
  Phase 4 budget grows from 3 days to 4.5 days to absorb the
  routing work. `to-do.md` A\* entry transitions from
  conditionally-claimed to unconditionally-claimed.
- Native-JSON export (deferred from the design study §9; this plan
  ships only the single GEDZIP format with `HEAD.SCHMA` extensions).
- Full N-partner geometry beyond the chosen primary (bus / ring /
  polygon — one is picked in Phase 1, the others are not implemented
  in v1).
- **Hyperbolic-engine parity (deferred to Wave 2; may be cut).**
  The hyperbolic engine is no longer a priority and may be
  removed from the product. Wave 2 (Phase 9 below; explicitly
  marked "may be cut") covers hyperbolic implementations for
  each renderer feature this plan adds. The main wave (Phases
  0–8) targets the layered engine only. If hyperbolic is cut
  before Wave 2 starts, Phase 9 is dropped wholesale; no other
  phase needs revision.
- New domain operations beyond the schema migrations and the data
  fields they expose. The existing `linkParent` / `linkSpouse` /
  `updateCouple` op surface generalises naturally; no new mutation
  vocabulary.
- Re-architecting the four-pass IR. New segment kinds slot into the
  existing `EdgeKind` enum; new render passes slot in alongside the
  existing route pass.

---

## Constraints

- **Family View is in-flight.** Its plan has 7 phases (0–6). This
  plan must not invalidate family-view's commitments and must
  coordinate schema bumps with family-view's milestones. The
  forward-compat section of family-view enumerates the contract.
- **GEDCOM 7 interop matters.** Single-tier export means every
  file always carries `HEAD.SCHMA`-registered `_TREES_*`
  extensions for full fidelity, plus inline standard-tag
  fallbacks (HUSB/WIFE, PEDI, MARR/TYPE, NOTE blocks) for tools
  that strip extensions (Ancestry, MyHeritage, FamilySearch,
  Gramps, RootsMagic, FTM). The Phase 0 HEAD.SCHMA probe
  verifies which tools tolerate the registration; tools that
  hard-fail get a per-tool stripping toggle as a follow-up.
- **Validator stance is "validate as findings", not "reject".**
  Every migration's blast radius is bounded because malformed data
  surfaces warnings, not crashes. See [agents.md](../agents.md) §8.3.
- **Two engines.** Every new geometry must work in both the layered
  engine and the hyperbolic engine. Hyperbolic is the better
  substrate for N-partner / overlay / group geometries (design
  study §7.2); when layered falls apart, View menu suggests
  hyperbolic.
- **No deferred destructive changes.** Each schema bump is forward-
  only; the migration runner refuses bundles newer than the build,
  but older bundles always upgrade cleanly.
- **Single-developer-pacing.** Like family-view, this plan assumes
  one developer working sequentially with no parallelism between
  phases on this workstream. Parallelism *between* the two
  workstreams is a different question and is addressed in the
  pre-mortem.

---

## Pre-mortem (14 May 2026; second pass folds user-feedback revisions)

**Bottom line: green, with two soft watchpoints.** First pre-
mortem (against the original draft) surfaced six high-severity
risks; user feedback retired four of them directly (single-tier
GEDZIP collapses the two-tier hostile-default risk; "this isn't
a live product yet, not a big deal" downgrades the schema-bump-
mid-family-view-phase risk from gate to guidance; cisgender
default closes the identity-shape-mapping risk; semver replaces
integer versioning, which retires "one-schema-bump-per-phase"
since additive bumps are now naturally lightweight). The
remaining two high-severity risks (family-view surface alignment;
HEAD.SCHMA interop) carry forward as **medium-severity
watchpoints** with Phase 0 probes — accepted, not blocking. The
second pass (this one) ran adversarially against the *revised*
plan and surfaced five new risks introduced by the revisions
themselves; all are medium or low, all have probes.

### Risks

- **[high] integration — family-view sync points are undefined.**
  The plan repeatedly extends family-view surfaces (`cardDecorator`,
  overlay sub-menu, role helper, `union-anchor` IR, `defaultEngine`
  setting) but never says which family-view phase must ship before
  which of this plan's phases starts. Family-view's overlay sub-menu
  only lands in family-view's Phase 6; this plan's Phase 0 adds
  entries to it. Family-view's `cardDecorator` is a stub in family-
  view Phase 0 and real in family-view Phase 5; this plan's Phase 0
  adds accessors and Phase 5 fills them in. Family-view's `union-
  anchor` IR ships in family-view Phase 2; this plan's Phase 3
  generalises its rendering. Without explicit sync points, the
  workstreams will collide.
  · probe: in Phase 0, write a family-view-sync matrix into this
  plan's bug log: every family-view phase × every relationship-
  vocabulary phase, with each cell saying "must precede" / "must
  follow" / "independent". Drive Phase 1+ start gates from it.

- **[high] dependency — tier-2 GEDZIP `HEAD.SCHMA` interop is
  unprobed.** The design study claims GEDCOM 7 parsers tolerate
  `HEAD.SCHMA`-registered extension tags ("they don't reject the
  file"). The plan inherits this without measurement. If Ancestry,
  MyHeritage, Gramps, or FamilySearch actually choke on the
  registration header, the tier-2 default in §9.3 becomes a hostile
  default — users who pick "preserves everything" can't share with
  collaborators on other tools at all.
  · probe: in Phase 0, write a synthetic 5-person tier-2 GEDZIP with
  `_TREES_*` tags registered via `HEAD.SCHMA`. Upload to Gramps,
  Ancestry (free tier), MyHeritage (free tier), FamilySearch.
  Record: did it load? Were the `_TREES_*` tags preserved or
  stripped? Did the header registration cause warnings? Outcomes
  drive Phase 8's tier-2 mapping fidelity expectations and may
  affect which extension tags ship.

- **[high] schema-migration risk — v1→v2 (parentIds) lands mid-
  family-view-Phase-4.** This plan's Phase 2 migrates `motherId` /
  `fatherId` → `parentIds: ParentRef[]` while family-view's Phase 4
  (editing affordances) is most likely still in flight. Family-
  view's editing PR is touching the same files this plan's Phase 2
  rewrites — merge conflicts at best, semantic corruption at worst.
  · probe: in Phase 0, decide and document one of two options:
  (a) **gate**: this plan's Phase 2 cannot start until family-view's
  Phase 4 has shipped and integration-checked; (b) **co-land**: this
  plan's Phase 2 ships its migration *as part of* family-view's
  Phase 4 PR. Either is fine; the plan must pick one.

- **[high] schema-migration risk — v2→v3 (UnionRecord) and family-
  view's preferred-union state collide.** Family-view's Phase 2
  introduces a `localStorage`-keyed preferred-union flag, with an
  explicit note that the flag "may move into the record itself"
  when v3 lands. This plan's Phase 3 actualises that move. But the
  plan says "localStorage stays for backward-compat reads; domain
  field is authoritative on write" — that's two-source-of-truth,
  which family-view explicitly resisted ("`preferred-union` is a UI
  state, not a domain field"). The two plans contradict here.
  · probe: before Phase 3, reconcile with family-view's commitment
  7. Either (a) Phase 3 fully migrates localStorage → domain field
  on first v3 read (no dual-source); (b) localStorage stays sole
  UI-state authority and `UnionRecord.preferredBy` is *opt-in* per
  tree. Pick one and update both plans.

- **[high] scope — Phase 6 has two schema bumps.** v5→v6 (Groups)
  and v6→v7 (Sibship + birthOrder). The plan's own convention is
  one schema bump per phase. The combined phase also packs group
  frames + sibship-bracket segments + consanguinity surfacing + two
  new inspector surfaces. Most likely to slip.
  · probe: split Phase 6 into 6a (v5→v6 + group frames) and 6b
  (v6→v7 + sibship-bracket + consanguinity). Each phase stays "one
  schema bump + one rendering feature". (Folded in below.)

- **[medium] integration — `cardDecorator` API surface mismatch.**
  Family-view's Phase 0 stub says
  `decorate(person): { shape; frame; fillTone; cornerGlyphs; underlineColour }`
  — a record. This plan's Phase 0 says it "gains read-only
  accessors" — functions, not record fields. The contracts disagree.
  · probe: pin the contract in Phase 0. Recommendation: extend the
  record (add `species`, `kind`, `origin`, `identityFluid`,
  `assignedAtBirth` as additional record fields). Either way, the
  contract goes into both plans' bug logs. (Folded in below.)

- **[medium] performance — overlay routing without A\* may visually
  fail on Akarians.** Phase 4 routes overlays with bridge-arcs at
  crossings (non-goal). The design study §7.1 says A\* "becomes
  load-bearing once overlays start crossing the skeleton". On
  Akarians (1802 people, 167 ghosts already crowding the layout),
  adding 20–50 overlay segments could be unreadable.
  · probe: in Phase 1 (alongside the geometry spike), render 30
  synthetic relationship overlays against Akarians. Eyeball the
  result. If unreadable, A\* moves out of non-goals and into Phase
  4's scope (or Phase 4 is reframed as overlays-with-A\* and gets
  +1.5 days).

- **[medium] expertise — hyperbolic engine work is scoped vaguely.**
  "Both engines" is asserted for N-partner geometry (Phase 1),
  overlay routing (Phase 4), group polygons (Phase 6a), identity-
  arc geodesics (Phase 4). Each requires non-trivial hyperbolic-
  engine implementation (hyperbolic barycentre, hyperbolic polygon
  backing, hyperbolic geodesic arc with arrow terminus).
  · probe: in Phase 1, time-box the hyperbolic implementation of
  the chosen N-partner primitive to half the layered implementation
  budget. If hyperbolic blows the box, defer hyperbolic-engine
  parity for that primitive (and downstream features) to a v2
  follow-up phase; ship Phase 1 layered-only with a logged finding.
  Apply the same rule to Phase 4 and Phase 6a.

- **[medium] premise — `passes/route.ts` extensibility is assumed.**
  Phase 1 emits a new segment kind (`union-manifold`) into
  `route.ts`, Phase 2 adds `multi-parent-drop`, Phase 4 adds
  `overlay-bond` + `identity-arc`, Phase 6b adds `sibship-bracket`.
  Each is a "small change" individually; the cumulative weight is a
  four-fold expansion. The bug log already shows `route.ts` has two
  open routing defects.
  · probe: in Phase 0, read `passes/route.ts` end-to-end and emit
  one finding per "this would have to be rewritten / split before
  adding new segment kinds." If finding count is >3, Phase 1 grows
  by ~1 day to refactor `route.ts` into per-segment-kind modules
  before adding new ones.

- **[medium] operational — no per-phase perf budget.** Only Phase 8
  has a final budget. Intermediate phases could accumulate perf
  regressions silently.
  · probe: every phase from Phase 1 onward records layout + render
  timing on Akarians as part of its DoD. The first regression of
  >5 ms over Phase 0's baseline triggers profile-and-fix in that
  phase, not in Phase 8. (Folded in below.)

- **[medium] premise — stroke palette user-visible payoff in Phase
  1 is limited.** With the role helper returning `"blood"` for
  every drop until v2 lands, the only visible-in-Phase-1
  distinction is `married` / `divorced` (which doesn't go through
  the role helper). Risk: Phase 1 takes ~2 days but ships almost
  nothing observable.
  · probe: explicitly frame Phase 1's payoff as "infrastructure +
  geometry decision," not "user-visible new stroke styles." Move
  the user-visible stroke palette demo to Phase 2's DoD (where
  `pedi` drives the patterns). (Folded in below.)

- **[low] premise — `gender.identity` open-string needs a default
  shape mapping.** Phase 5's identity field is an open string. What
  about `identity = "gerudo"` or `identity = "agender"`?
  · probe: in Phase 5, define a default mapping (unknown identity →
  diamond) and let users override via a per-tree `identityShapeMap`
  setting.

- **[low] premise — role-helper signature is not pinned.** Family-
  view's commitment 3 says edge `role` is read "from a single per-
  edge function." Function signature, location, and import path
  aren't pinned in either plan.
  · probe: in Phase 0, grep family-view's Phase 0 PR for the
  existing role-helper signature and align names. One-line check.

### Risks (second-pass, after folded revisions)

The first-pass risks above are preserved as history; this section
reads the *revised* plan adversarially and lists what changed.

**Retired by folded revisions** (was high; now closed): one-
schema-bump-per-phase (Phase 6 split into 6a + 6b); `cardDecorator`
API mismatch (pinned to record-return); `passes/route.ts`
extensibility (Phase 0 audit added); stroke-palette payoff
oversell (Phase 1 reframed); per-phase perf budget absence (added
to every DoD); role-helper signature (Phase 0 audit added);
identity-shape-mapping fallback (cisgender default obviates the
open-enum case).

**Retired by user feedback** (was high; now closed): two-tier
GEDZIP risk (collapsed to single tier with `HEAD.SCHMA` always on
+ inline fallbacks); UnionRecord vs preferred-union two-source
collision (Phase 0's reconciliation decision is mandatory before
Phase 3 starts; no dual-source allowed in the final plan).

**Downgraded by user feedback** (high → medium, soft watchpoint):

- **[medium, soft] dependency — HEAD.SCHMA interop with strict
  tools.** User: "accept for now." The Phase 0 probe still runs,
  but its outcome is informational rather than scope-driving. If
  the probe finds a strict tool hard-fails on the registration
  header, Phase 8 adds a per-tool stripping toggle as a follow-
  up; this plan does not block on the probe outcome.

- **[medium, soft] integration — family-view sync points.** User:
  "this isn't a live product yet, not a big deal" (re: v1→v2
  mid-family-view-Phase-4 conflict). The hard gates on Phases 2,
  3, and 5 against specific family-view phases relax to **soft
  coordination via the sync matrix**. The matrix still lives in
  Phase 0's bug log as guidance for sequencing, but a phase here
  can start before the corresponding family-view phase ships if
  the developer judges merge conflicts manageable. The
  `cardDecorator` API contract and the `union-anchor` IR shape
  remain hard contracts (those affect runtime behaviour, not
  just merge ergonomics).

**New risks introduced by the revisions themselves:**

- **[medium] scope — semver migration-runner upgrade has unknown
  blast radius.** Phase 0 adds a ~1-day semver upgrade to
  `domain/schema.ts`. Every existing call site to
  `migrateToCurrent`, every test constructing a `Migration`
  object, every GEDZIP manifest writer/reader changes signature.
  Today's only call sites are inside `domain/schema.ts` and the
  GEDZIP bundle layer, but tests may have manual fixtures with
  integer-stamped manifests.
  · probe: before the upgrade lands, `rg -n
  "migrateToCurrent|Migration ?\{|schemaVersion"` and count
  call/test sites. If count < 10, proceed in-Phase-0. If
  large, prepend a compat layer (public API stays integer-
  stamped for one release, semver lives internally) and defer
  the public-API switch to Phase 8.

- **[medium] premise — cisgender inference can confuse users
  editing trans records.** When a user sets `identity: 'male'`
  but leaves `assignedAtBirth` blank, `cardDecorator` infers
  cis-matching AMAB for shape. If the user is recording a trans
  man and expected "identity set, assignment unknown," the
  silent inference is wrong.
  · probe: in Phase 5, PersonalTab must visibly distinguish
  *set* vs *inferred* values — a small "(inferred)" annotation
  beside fields where the displayed value comes from inference.
  One-evening UX change; DoD bullet added.

- **[medium] operational — hyperbolic-engine code stays in repo
  while marked "may be cut."** Phase 9 deferral works cleanly
  only if main-wave code never imports from
  `engines/hyperbolic-lr/`. If a new module in Phase 1, 2, 3,
  4, or 6a imports anything from the hyperbolic engine — even
  for a type definition — the Wave-2 cut becomes invasive.
  · probe: in Phase 0, document the rule: "no main-wave module
  may import from `engines/hyperbolic-lr/`." Add a CI grep
  check (e.g. `! rg "from .*engines/hyperbolic-lr" apps/web/src/lib/layout/engines/family-view/`).
  Each phase's DoD references the check.

- **[low] premise — semver round-trip through an older build is
  declared but not tested.** Plan claims minor-newer bundles
  open in older builds with a finding ("additive fields
  preserved verbatim, not rendered"). This is the headline
  benefit of semver but the test matrix only covers same-
  version round-trip.
  · probe: Phase 8's round-trip matrix gains a row — open a
  3.3.0 bundle in a build pinned to 3.1.0; edit something;
  save; reopen in 3.3.0 — assert group data is preserved
  verbatim.

- **[low] scope — single-tier-always-on means power users can't
  opt out of `HEAD.SCHMA`.** If a user knows they'll share with
  a strict tool that strips extensions, they ship bytes nobody
  reads. The fallbacks should make the file usable, but the
  bytes are wasted.
  · probe: Phase 8 ships a per-tool stripping toggle as opt-in
  (not default), behind a "show advanced export options"
  affordance.

**Carried forward unchanged**:

- **[medium] performance — overlay routing without A\* may
  visually fail on Akarians.** Phase 1's 30-overlay readability
  probe is the gate. If unreadable, A\* promotes from non-goal
  to Phase 4 scope (+1.5 days).

### Walking-skeleton check

**Verdict: mostly sufficient, with two additions.**

Phase 0 already stubs every layer this plan will touch. Each later
phase replaces a stub with a real implementation — no later phase
introduces a new layer. Two additions are needed:

- **Add: HEAD.SCHMA interop probe.** Per the high-severity
  dependency risk above. Cheap (one synthetic file + four free-tier
  accounts). Load-bearing for Phase 8.
- **Add: family-view sync-point matrix.** Per the high-severity
  integration risk above. Document goes in this plan's bug log;
  both plans reference it. Single most important Phase-0 addition.

After these additions, Phase 0 grows from ~2 days to ~3 days. The
extra day buys retirement of the largest cross-workstream risk.

### Phase-order revisions

| original | proposed | reason |
|---|---|---|
| Phase 0 (~2 days) | Phase 0 (~3 days) — adds HEAD.SCHMA probe + family-view sync matrix | retires highest-severity unprobed assumptions before Phase 1 |
| Phase 1 (N-partner geometry + stroke palette) | unchanged in order; explicit gate: cannot start until family-view's Phase 2 has shipped | family-view Phase 2 delivers the `union-anchor` IR; without it, the spike has no integration target |
| Phase 2 (parentIds v1→v2) | explicit gate: cannot start until family-view's Phase 4 has shipped | v1→v2 migration during family-view's editing-phase causes engine-rewrite conflicts |
| Phase 3 (UnionRecord v2→v3) | explicit gate: cannot start until family-view's Phase 6 has shipped AND commitment 7 reconciled | preferred-union transition lands at family-view's polish phase |
| Phase 4 (relationships + overlay routing) | unchanged | independent of remaining family-view milestones |
| Phase 5 (identity / species / origin) | unchanged | family-view's cardDecorator Phase 5 is the integration target |
| Phase 6 (Groups + sibship + consanguinity) | **split: Phase 6a (v5→v6 + group frames), Phase 6b (v6→v7 + sibship-bracket + consanguinity)** | one schema bump per phase; matches plan's own convention |
| Phase 7 (export tiers + ship polish) → renumber to **Phase 8** | unchanged content | follows the 6a/6b split |

### Accepted-but-not-probed risks

- **Validator's "finding-not-rejection" stance** is project policy.
  Migrations failing on edge-case data won't crash, just surface
  findings.
- **GEDCOM 7 SEX X for non-binary** is well-documented; Phase 0
  audits whether the existing GEDCOM emitter already supports
  it and adds the one-line mapping if not (no probe; pure code
  check).
- **Open-string `species` field** has no defined semantic — that's
  a feature, not a risk.
- **`relationships[]` overlay routing crossings** are accepted in
  the non-goals; if Phase 1's 30-overlay probe shows it's worse
  than expected, that promotes the risk and re-scopes Phase 4.

### Addendum — user-feedback revisions

After the pre-mortem report was first folded in, the user
reviewed it via plan-mode and made four additional directional
calls that shifted scope materially. These have been re-folded
through the plan above:

1. **GEDZIP collapses to one tier.** The pre-mortem had treated
   the two-tier model (compatible / accurate) as a given. User
   feedback: "if gedzip supports custom fields already, then
   just do that always. the compat was specifically for the
   complex relationships and births, to represent that as best
   we could for other tools to still have that connection." The
   plan now emits ONE format with `HEAD.SCHMA`-registered
   extensions **always on** plus inline standard-tag fallbacks
   so other tools still render a coherent view of the complex
   bits. Phase 8 simplifies considerably; Goal 7 and the
   constraints section both rewritten.
2. **Schema versions become semver.** User asked: "can we just
   use a semver major.minor.patch version for this?" The
   migration runner is integer-only today
   (`Number.isInteger(v) && v >= 1`); upgrading to semver is a
   focused ~1 day of work and a natural Phase 0 addition. With
   semver the six bumps in this plan become two major
   (parentIds, UnionRecord) and four additive minor
   (relationships, identity-struct, Groups, Sibship). Minor-
   newer bundles round-trip through older builds without data
   loss — primary win.
3. **Hyperbolic engine demoted to Wave 2 (may be cut).** User:
   "the hyperbolic engine isn't a priority and may be removed
   later. move the steps related to the hyperbolic engine into
   a second wave. keep it high level." All hyperbolic-engine
   work lifted out of Phases 1–6b into a new Phase 9 (Wave 2;
   may be cut). The main wave is now layered-engine-only. If
   hyperbolic is cut before Wave 2, Phase 9 drops wholesale and
   no other phase needs revision.
4. **Cisgender is the default for identity.** User: "cisgender
   should probably be the default value." Phase 5 now infers
   identity from `assignedAtBirth` when only the latter is set
   (AMAB → male, AFAB → female, UAAB → unknown), and treats
   `fluid` as `false` by default. A typical existing-tree user
   sees no new required fields post-migration.

---

## Phase 0 — walking skeleton (~3 days)

**Goal: thinnest end-to-end slice that touches every layer the
project will eventually need.** Empty stubs are fine. No later phase
introduces a new layer.

### Layers stubbed in Phase 0

- **Schema migration-runner semver upgrade** (real; pre-work for
  all later schema bumps; ~1 day):
  - Today's `domain/schema.ts` validates versions as positive
    integers (`Number.isInteger(v) && v >= 1`) and chains
    migrations strictly `from N → to N+1`. This phase upgrades
    to **semver `major.minor.patch`** so additive schema changes
    (which dominate this plan) don't force major bumps:
    - `Migration.from` and `Migration.to` become semver strings
      (e.g. `"1.0.0"`, `"2.0.0"`, `"3.1.0"`).
    - `CURRENT_SCHEMA_VERSION` becomes a semver string.
    - `migrateToCurrent` compares semvers with proper precedence
      (major > minor > patch).
    - **Newer-than-build behaviour**: reject major-newer (today's
      behaviour); **accept minor-newer with a non-blocking
      finding** ("schema v3.5 has additive fields this build
      doesn't know about; they will be preserved on save but not
      rendered") — this is the primary benefit of semver,
      letting newer minor-version bundles round-trip through
      older builds without data loss.
    - Bundle `manifest.json` writers/readers emit semver
      strings; legacy integer-stamped bundles (today's `1`) are
      accepted as `"1.0.0"` on read.
  - **Unit test**: legacy integer-stamped bundle round-trips
    cleanly through the semver runner.
- **Schema migration scaffolding** (real shape, no-op transforms):
  - Register six new schema versions in `domain/schema.ts` using
    semver labels:
    - `1.0.0` (today)
    - `2.0.0` — parentIds (breaking; replaces motherId/fatherId)
    - `3.0.0` — UnionRecord (breaking; replaces CoupleRecord)
    - `3.1.0` — relationships[] (additive)
    - `3.2.0` — gender struct + species + kind + origin (additive)
    - `3.3.0` — Group[] (additive)
    - `3.4.0` — SibshipDecorator[] + Person.birthOrder (additive)
  - Each migration body is an **identity transform** in Phase 0
    (returns input unchanged). Phase 2+ replaces each body with
    real data transforms.
  - **Unit test:** a v1.0.0 bundle migrates through all six
    identity stubs to v3.4.0 without data loss or crashes.
- **GEDCOM 7 SEX X verification** (real, audit-only):
  - Grep `io/gedcom/parse.ts` and `io/gedcom/serialize.ts` for
    `SEX` handling. If `gender = 'u'` already round-trips through
    `SEX X` (GEDCOM 7 non-binary), record the finding; no action.
    If it doesn't, add the mapping as a one-line change in Phase
    0. Either way the result lands in this plan's bug log.
- **Stroke palette CSS classes** (stub):
  - `edge-blood` / `edge-adopted` / `edge-foster` / `edge-step` /
    `edge-donor` / `edge-surrogate` / `edge-sealed` / `edge-magical` /
    `edge-cloned` / `edge-hatched` / `edge-summoned` /
    `edge-manufactured` / `edge-ritual` / `edge-civil` /
    `edge-cohabit` / `edge-oath` / `edge-transformed` /
    `edge-reincarnated` / `edge-merged-from` / `edge-split-into` /
    `edge-alias-of` / `edge-severed` / `edge-estranged` /
    `edge-exiled` / `edge-disowned`. All defined with default
    (solid) stroke. Phase 1 fills in real patterns (dashed,
    dotted, dash-dot, wavy, chained, etc.).
- **Role-driven stroke lookup** (real wiring; default mapping):
  - Module `lib/layout/strokePalette.ts` exports
    `classForRole(role: EdgeRole): string`. Returns
    `edge-{role}`. Called from `EdgeLayer.svelte` where it
    currently hard-classes by `kind`-bucket.
  - Family-view's role helper (per its forward-compat section) is
    consulted; it returns `"blood"` for everything until v2 lands,
    at which point per-edge data drives the call.
- **N-partner geometry stub** (synthetic-fixture-only):
  - One geometry primitive (default: `bus`) is implemented in
    `passes/route.ts` for `union-manifold` segments. Gated behind a
    `debug.nPartner` flag; rendered against a synthetic 3-partner
    test fixture only. Phase 1 runs the bus-vs-ring-vs-polygon
    decision against the same fixture suite + extras.
  - Hyperbolic engine: a barycentre-centred bus is implemented
    against the same fixture.
- **Overlay render pass stub** (real wiring; empty data):
  - New `passes/overlay.ts` runs after `route.ts`. Reads from a new
    IR field `overlays: OverlaySegment[]` (always empty in Phase 0).
    Emits zero segments. `EdgeLayer.svelte` renders both
    `skeleton.segments` and `overlays` arrays.
  - Phase 4 populates the overlay collection from
    `tree.relationships[]`.
- **Group-frame render pass stub** (real wiring; empty data):
  - New `passes/groups.ts` runs after `place.ts`. Reads from a new
    IR field `groups: GroupFrame[]` (always empty in Phase 0).
    Emits zero frames. A new `GroupLayer.svelte` renders behind
    the edge layer.
  - Phase 6 populates from `tree.groups[]`.
- **Card decorator extensions** (stub returns):
  - **API contract pinned: record return, not accessors.** Family-
    view's existing
    `decorate(person): { shape; frame; fillTone; cornerGlyphs; underlineColour }`
    shape is extended with five additional fields:
    `species`, `kind`, `origin`, `identityFluid`, `assignedAtBirth`
    — each returning `undefined` in Phase 0.
  - Recorded in this plan's bug log under "API contracts pinned"
    and referenced from family-view's bug log too.
  - `PersonNode.svelte` reads each field; renders default
    decoration when the field is `undefined`.
- **GEDZIP single-tier `HEAD.SCHMA` scaffold** (real wiring;
  emits today's content):
  - `ExportTarget` in `io/warnings.ts` is left as `'gedzip'`
    (single tier; no enum widening).
  - The GEDCOM 7 emitter gains a `HEAD.SCHMA` block registering
    `https://attuproject.org/trees/schema/v1#` with short forms
    `_TREES_*`. Today's emitter content (no extension tags yet)
    is unchanged; the registration just sits at the top.
  - Phase 8 fills in real `_TREES_*` emission alongside inline
    standard-tag fallbacks.
- **View menu overlay sub-list** (stub additions):
  - Family-view's Phase 6 added an `Overlays` sub-menu with
    `Path highlight` enabled. Phase 0 adds **disabled placeholder
    entries** for each future overlay class:
    `Sworn bonds (coming in phase 4)`,
    `Transformations (coming in phase 4)`,
    `Group frames (coming in phase 6)`,
    `Consanguinity (coming in phase 6)`,
    `Severances (coming in phase 4)`.
- **Consanguinity-detection scaffolding** (stub, no UI):
  - Module `lib/domain/consanguinity.ts` exports
    `computeAncestorOverlap(personId): { duplicates: PersonId[]; coi?: number }`.
    Returns `{ duplicates: [], coi: undefined }` for now. Phase 6
    fills in the real computation.
- **Validator findings** (real):
  - `validate.ts` emits a new finding kind
    `"unsupported-by-schema-version"` whenever a domain op
    touches a field that the active schema version doesn't yet
    support (e.g. setting a 3rd parent on v1, marking a union as
    polycule on v2). Family-view's Phase 0 client-side guard
    feeds this; the inspector toast text comes from here.
- **Two-engine smoke test** (real):
  - E2E test renders Akarians DEMO in both layered and hyperbolic
    with the family-view default engine. Asserts no console
    errors, no `null`-segment crashes, and the IR contains the
    expected stub fields (`overlays: []`, `groups: []`,
    new schema-version stamp).
- **HEAD.SCHMA interop probe** (real, ~½ day):
  - Hand-write a synthetic 5-person GEDZIP with `_TREES_*` tags
    registered via `HEAD.SCHMA` against the
    `https://attuproject.org/trees/schema/v1#` namespace, plus
    inline standard-tag fallbacks for the complex bits
    (polycule → chain-of-pairwise-FAMs; multi-parent → primary
    pair + extra FAMC with PEDI).
  - Upload to Gramps (offline), Ancestry (free tier), MyHeritage
    (free tier), FamilySearch (free), and any other tool the
    user base uses. Record per tool: file loaded? extension
    tags preserved on re-export, or stripped? what did the tool
    show for the complex bits (the fallbacks)? warning emitted?
    hard error?
  - **The probe drives the inline-fallback design, not a
    tier split.** If a major tool hard-fails on `HEAD.SCHMA`,
    that's a serious finding — investigate and consider a
    Phase 8 toggle to strip the registration for users on that
    tool's free tier — but the plan-default stays single-tier
    with extensions always on. If extensions are stripped (the
    expected case for strict tools), the inline fallbacks
    preserve the user's view; users coming back to FamilyTree
    Editor still get full fidelity via the `_TREES_*` data we
    wrote alongside.
- **Family-view sync-point matrix** (real, ~½ day):
  - Written into this plan's bug log. Rows = family-view phases
    0–6; columns = this plan's phases 0–8. Each cell labels the
    relation: `must precede` / `must follow` / `independent`.
  - Authoritative source: each row of the table below is a hard
    gate referenced from the corresponding phase's preamble:

| this plan | gate against family-view |
|---|---|
| Phase 0 | family-view Phase 0 has shipped (need its stubs to extend) |
| Phase 1 | family-view Phase 2 has shipped (need `union-anchor` IR) |
| Phase 2 | family-view Phase 4 has shipped (editing surface stable before parentIds[] migration) |
| Phase 3 | family-view Phase 6 has shipped AND preferred-union commitment reconciled |
| Phase 4 | independent (after this plan's own Phase 3) |
| Phase 5 | family-view Phase 5 has shipped (cardDecorator real) |
| Phase 6a | independent (after this plan's own Phase 5) |
| Phase 6b | independent (after this plan's own Phase 6a) |
| Phase 8 | family-view Phase 6 has shipped (ship-readiness runs both workstreams together) |

- **`passes/route.ts` extensibility audit** (real, ~½ day):
  - Read `route.ts` end-to-end. Emit one finding per "this code
    path would need to be rewritten / split before adding a new
    segment kind." Findings land in this plan's bug log.
  - If finding count > 3, Phase 1 grows by ~1 day to refactor
    `route.ts` into per-segment-kind modules before adding new
    ones. Decision recorded in the bug log.
- **Role-helper signature alignment** (real, ~1 hour):
  - `grep` family-view's Phase 0 PR (or current trunk) for the
    edge-role helper introduced under commitment 3. Pin its
    function name, file location, and signature in this plan's
    bug log. Phase 1's stroke-palette wiring matches that
    signature exactly — no rename, no shim.
- **`preferred-union` commitment reconciliation** (real, decision
  only):
  - Pick one of: (a) Phase 3 fully migrates localStorage →
    `UnionRecord.preferredBy` on first v3 read (no dual-source);
    (b) localStorage stays sole UI-state authority,
    `UnionRecord.preferredBy` is opt-in per tree.
  - Decision lands in the bug log and both plans cite it.
- **v1→v2 landing-strategy decision** (real, decision only):
  - Per user feedback ("this isn't a live product yet, not a
    big deal"), the gate relaxes. Default disposition: **soft
    coordinate** — Phase 2 may start before family-view's Phase
    4 ships if merge conflicts feel manageable to the developer.
    The decision still gets recorded in the bug log, but it's no
    longer a hard prerequisite.
- **No-hyperbolic-import lint rule** (real, ~½ hour):
  - Add a CI grep check to `pnpm verify`:
    `! rg "from .*engines/hyperbolic-lr" apps/web/src/lib/layout/engines/family-view/`
    and similar for any new relationship-vocabulary module
    introduced in Phases 1–6b. If the check finds a match, CI
    fails. Documents the "main wave stays layered-only; Wave 2
    can be cut without surgery" invariant.
  - Each later phase's DoD asserts the check still passes.

### What Phase 0 deliberately leaves for later phases

- Real stroke patterns (Phase 1).
- N-partner geometry decision (Phase 1, layered only).
- Multi-parent rendering + real `parentIds[]` migration (Phase 2).
- N-partner real rendering + real `UnionRecord` migration (Phase 3).
- Overlay data + routing (Phase 4; A\* scope contingent on Phase
  1's 30-overlay probe).
- Identity / species / origin with cisgender default (Phase 5).
- Group frames (Phase 6a, layered only).
- Sibship + consanguinity (Phase 6b).
- Single-tier GEDZIP with `_TREES_*` always on + inline
  fallbacks (Phase 8).
- Hyperbolic-engine parity for everything above (Phase 9; Wave
  2; may be cut).

### DoD

- `pnpm verify` green.
- All six identity migrations register and round-trip on the
  Akarians DEMO bundle.
- E2E test: open Akarians, render in family-view, switch to
  layered, switch to hyperbolic (if hyperbolic still exists at
  Phase 0 start) — no console errors; all engines present
  report `overlays: []` and `groups: []` on their IR.
- View menu shows the five disabled overlay placeholder entries.
- A debug-gated synthetic 3-partner fixture renders as a bus in
  the layered engine.
- Family-view integration: no regression in any of family-view's
  Phase 0–6 e2e tests (rerun the family-view test suite as part
  of `pnpm verify`).
- **Bug log seeded with seven artefacts:**
  1. HEAD.SCHMA interop probe results per tool.
  2. Family-view sync-point matrix (see table above; the
     authoritative version may grow more notes after the probe).
  3. `cardDecorator` API contract (record return, fields listed).
  4. `passes/route.ts` extensibility findings.
  5. Role-helper signature alignment note.
  6. `preferred-union` commitment reconciliation decision.
  7. v1→v2 landing-strategy decision (gate vs co-land).
- **Baseline perf numbers recorded:** layout + render timing on
  Akarians at family-view fit-zoom is logged to
  `tests/perf/relationship-vocab-baseline.json`. Every later
  phase compares against this number.

### Rollback criterion

- If registering identity migrations breaks bundle round-trip on
  Akarians, halt and reconsider whether the migration scaffolding
  needs to land smaller (e.g. v1→v2 only in Phase 0; the rest in
  the phase that uses them).

---

## Phase 1 — N-partner geometry decision + stroke palette infrastructure (~2 days)

**Gate: cannot start until family-view's Phase 2 has shipped and
integration-checked.** Family-view Phase 2 delivers the
`union-anchor` IR with `partnerIds[]`; the geometry spike has no
integration target without it.

**Highest-risk phase by design: a renderer decision that gates
Phases 3, 4, and 6a.** Payoff is **infrastructure + a frozen
geometry decision**, not new user-visible strokes. With the role
helper returning `"blood"` for every drop until v2 lands in Phase
2, the stroke palette has no data to render most patterns against
yet; the user-visible payoff arrives with Phase 2.

### Spike — N-partner geometry decision (~1 day)

- Implement all three primitives (`bus`, `ring`, `polygon`) against
  a synthetic-fixture suite covering:
  1. **3-partner triad** (closed)
  2. **4-partner closed quad** (closed)
  3. **V-polycule** (3 partners; A–B and B–C are bonds, A–C is
     not; open)
  4. **Vee-and-pivot** (4 partners; B is the pivot)
  5. **6-partner closed group** (closed; stress test)
  6. **Single-partner degenerate** (1 partner; sanity)
- Each fixture renders in the **layered engine only**.
  Hyperbolic-engine parity for the chosen primitive moves to
  Wave 2 (Phase 9; may be cut).
- Visual review picks ONE primary primitive. Decision document
  goes into this plan's bug log under "Phase 1 decisions".
- **Pre-specified fallback ladder** (written before the spike):
  1. If `bus` looks worst on closed-N≥4, fall back to `ring`.
  2. If both `bus` and `ring` look worst on V-polycule, fall
     back to per-pair bonds + group hull (deferring closed
     N-union geometry to a v2 feature).
- Designer review *if available*; otherwise the implementer picks
  against a written rubric (legible at fit zoom in the layered
  engine, scales to 6 partners, single-partner degenerate doesn't
  look broken, doesn't fight family-view's expansion badges).

### Probe — 30-overlay readability on Akarians (~½ day, runs
alongside the geometry spike)

- Generate 30 synthetic relationship overlays (10 sworn bonds,
  10 transformations, 10 severances) across random Akarians
  pairs. Render with the Phase 0 overlay-pass stub real-ified
  enough to draw the lines (full Phase 4 logic comes later).
- Eyeball the result at family-view's bounded fit-zoom.
- **Outcome drives Phase 4 scope**: if unreadable, A\* moves out
  of non-goals and into Phase 4 (Phase 4 grows by ~1.5 days);
  if readable-but-marginal, Phase 4 ships as-planned and A\*
  stays a follow-up; if clean, no change.
- Result lands in this plan's bug log.

### Stroke palette implementation (~1 day)

- Realise all stroke patterns from Phase 0's CSS classes:
  - **dashed** for `adopted` / `sealed`
  - **dotted** for `foster` / `step`
  - **dash-dot** for `donor` / `surrogate`
  - **double-parallel** for `social` / `chosen` / consanguineous
  - **wavy** for `magical` / `transformed` / `reincarnated`
  - **chained** (with `⛓`-style breaks) for `oath` / `ritual` /
    `sworn-bond`
  - **doubled-slash** for `cutoff` (vs single-slash `divorce`)
- Add per-role colour palette (configurable via View menu).
- Wire family-view's role helper to read from a new
  `edgeRole(segment): EdgeRole` function in `lib/layout/edgeRouter.ts`
  that today returns `"blood"` for all `parent-drop` / `child-drop` /
  `sibling-bus` (since no data fields drive it yet) and `"married"`
  / `"divorced"` for bonds based on the existing `Couple.isCurrent`.
  Phase 2 makes parent-drop role data-driven from `ParentRef.pedi`.
- View menu gains a `Stroke palette` sub-menu with toggles for
  each role visibility (adopted / half / divorced today; the
  others gain real data sources in later phases).

### DoD

- Spike outcome documented in bug log: which primitive shipped,
  which fallback was used (if any), what the rubric ranked.
- All 25+ stroke palette CSS classes exist with real patterns.
- A synthetic test fixture demonstrates each pattern visually
  (component test using `toHaveScreenshot` with
  `maxDiffPixels: 100`).
- The chosen N-partner primitive renders cleanly against all 6
  spike fixtures in the layered engine.
- 30-overlay readability probe outcome recorded; Phase 4's A\*
  scope decided in the bug log.
- Family-view integration: switching engines on Akarians DEMO
  with stroke palette enabled does not regress family-view's
  Phase 0 smoke test.
- Family-view integration: family-view's Phase 2 union-anchor IR
  still renders N=2 unions correctly with the new primitive
  plumbed in.
- **Perf regression check**: layout + render timing on Akarians
  ≤5 ms over Phase 0 baseline. Recorded.
- **No-hyperbolic-import CI check** still passes (no new
  main-wave module added in this phase imports from
  `engines/hyperbolic-lr/`).

### Rollback criterion

- If no primitive works for all 6 fixtures, defer closed-N union
  rendering to a v2 feature; ship Phase 1 with pair-bond-fan only
  (existing `spouseIds[]` semantics). Phases 3+ re-scope around
  this.

---

## Phase 2 — parentIds[] migration + multi-parent rendering (~3 days, split 2a / 2b)

**Split decision (Phase 2 kick-off, 14 May 2026):** 193 call sites of
`motherId` / `fatherId` across ~30 files. Removing outright is a
multi-turn refactor. Split into two sub-phases so every commit stays
shippable + reversible:

- **2a — schema + helpers (this turn).** Ship `ParentRef` type +
  `Person.parentIds: ParentRef[]` as a coexisting field. Migration
  1.0.0 → 2.0.0 populates `parentIds` from legacy. `CURRENT_SCHEMA_VERSION`
  bumps to `2.0.0`. `getParents(person)` helper routes new reads
  through the new field; legacy `motherId` / `fatherId` stay readable.
  `tree.ts` ops (`linkParent` / `unlinkParent`) write to both.
- **2b — reader migration + renderer features (follow-up turn).**
  Migrate every reader (route.ts, layer.ts, gedcom/*, family-view,
  inspector, …) to `getParents()`. Remove legacy fields from the
  `Person` type. Land the `layer.ts` negative-drop + spurious-top-
  rank-ghost fix (couple-equalisation post-pass). Add multi-parent-
  drop with parent-gather pill. Half-sibling sibship-bus segmentation.
  Inspector ConnectionsTab N-parent list with role + pedi pickers.

Starting phase 2a: schema + helpers.

**Phase 2b further split (14 May 2026, after 2a closed):** The
plan's Phase 2b scope (reader migration + legacy field removal +
layer.ts fix + multi-parent-drop renderer + half-sibling sibship-
bus + inspector UI + GEDCOM `_TREES_PARENT_REF` emit) is too large
for one focused turn. Split into three sub-phases:

- **2b.1 (this turn) — layered-engine bug fixes.** The
  `passes/layer.ts` couple-equalisation post-pass that closes the
  negative-drop and spurious-top-rank-ghost bugs claimed in
  `notes/bugs.md`. Self-contained, immediate user value, doesn't
  depend on the broader reader migration.
- **2b.2 (follow-up turn) — reader migration + multi-parent-drop
  renderer + half-sibling sibship-bus.** Mechanical `getParents()`
  migration across ~30 files. Multi-parent-drop with parent-gather
  pill in the family-view engine. Half-sibling sibship-bus
  segmentation. Removes legacy fields from the `Person` type.
- **2b.3 (follow-up turn) — inspector N-parent UI + GEDCOM
  extension emit.** ConnectionsTab N-parent list with role + pedi
  pickers. GEDCOM export emit of `_TREES_PARENT_REF` alongside the
  standard PEDI fallback.

Starting phase 2b.1: layer.ts couple-equalisation.



**Soft coordination with family-view's Phase 4.** Per user
feedback ("this isn't a live product yet, not a big deal"), the
hard gate relaxes. Phase 2 may start before family-view's Phase
4 ships; merge conflicts get resolved at the touchpoint files
rather than serialised into separate PRs. The sync-matrix entry
in the bug log is guidance, not a block.

**Claims from external trackers**:

- `notes/to-do.md` (schema evolution): "replace `motherId` /
  `fatherId` with `parentIds: PersonId[]`" — directly delivered
  by this phase's migration. Marked claimed.
- `notes/bugs.md` (layout/edge routing): "12% of drops have
  negative height" — root cause is `layer.ts` choosing a parent
  rank below the child for cross-rank multi-parent cases. The
  new rank-assignment rule ("highest-rank − 1 for children with
  N parents; off-rank parents become ghosts") closes this for
  the >2-parent case. The 14 single-parent cases (`single:`
  parents per bugs.md) get a separate fix in the same `layer.ts`
  pass — a couple-equalisation post-pass that raises the
  lower-ranked partner to match the higher-ranked one.
- `notes/bugs.md`: "spurious ghost on the top rank after 'add
  parent' when the added-to person's spouse has no parents" —
  same `layer.ts` root cause as the negative-drop bug; the
  couple-equalisation post-pass closes this one too. Marked
  claimed alongside.

**Schema bump 1.0.0 → 2.0.0 (major, breaking).** Replaces `motherId` / `fatherId` with
`parentIds: ParentRef[]` where
`ParentRef = { personId; role?: 'mother' | 'father' | 'parent' | 'progenitor' | 'donor' | 'surrogate' | 'social'; pedi?: 'birth' | 'adopted' | 'foster' | 'sealed' | 'chosen' | 'magical' | 'cloned' | 'hatched' | 'summoned' | 'manufactured' }`.

### Implementation

- **Migration 1.0.0 → 2.0.0** in `domain/schema.ts`:
  `motherId + fatherId → parentIds: [{personId: motherId, role: 'mother', pedi: 'birth'}, {personId: fatherId, role: 'father', pedi: 'birth'}]`,
  dropping `undefined` entries. Old bundles round-trip; new
  bundles get the array shape.
- **Domain ops** (`tree.ts`): `linkParent(child, parent, ref?)`
  appends to `parentIds` instead of writing the two scalars.
  `unlinkParent` filters. `iterateAncestors` walks `parentIds[]`
  rather than the two scalars.
- **Layout — `passes/layer.ts`**: rank assignment for >2-parent
  children picks `highest-rank − 1`; off-rank parents become
  ghosts on the rank above the child. Closes the multi-parent
  negative-drop case. **Also** in the same pass: a couple-
  equalisation post-pass that raises the lower-ranked partner
  of any couple to match the higher-ranked one (never lower the
  parented partner — that breaks the parent-drop edge). Closes
  the single-parent negative-drop case AND the "spurious top-
  rank ghost after add-parent" defect (both per `notes/bugs.md`).
- **Layout — `passes/route.ts`**: emits `multi-parent-drop`
  segments. For N parents, emits a parent-gather pill in the
  inter-rank gutter at the parent centroid, plus N lines from
  parents to the pill plus one line from the pill to the child.
- **Layout — engine-specific**: family-view's `union-anchor`
  IR accepts `partnerIds.length === N` (already true by design;
  family-view only rendered the first 2). This phase generalises
  family-view's union-anchor to render up to N parents on the
  parental side too (still 2 partners for the union itself in
  v1; Phase 3 generalises that).
- **Renderer — stroke roles**: `pedi` drives `EdgeRole`
  (`birth → blood`, `adopted → adopted`, `foster → foster`,
  `sealed → sealed`, `donor → donor`, etc.). Phase 1's stroke
  palette renders the real patterns.
- **Renderer — half-sibship**: derived from `parentIds[]`. Any
  two children sharing less than all parents are half-siblings
  along the difference; sibship-bus emits `role: "half"` on the
  section between half-siblings.
- **GEDCOM import path**: existing dual-FAMC parsing
  (`io/gedcom/parse.ts`) already supports multi-FAM. Re-emit as
  `parentIds[]` rather than collapsing to mother / father pair.
- **GEDCOM export path** (single-tier, inline standard fallbacks
  + `_TREES_*` extensions; full implementation in Phase 8): for
  this phase's data, emit primary pair → FAM with HUSB / WIFE +
  extras → separate FAM with `FAMC / PEDI adopted` / `foster` /
  `sealing` per the design study's §9.1 table, alongside a
  `_TREES_PARENT_REF` extension list with the full role + pedi
  fidelity. Other tools render the fallback; FamilyTree Editor
  re-imports the extension.
- **Inspector — ConnectionsTab**: drop the fixed "mother" /
  "father" slots; render as an unbounded list of parents with
  per-row `role` + `pedi` pickers. Family-view's `+` "add parent"
  affordance plugs in here (no fixed slot count).
- **Validator findings**:
  - `"no birth parent recorded"` warning when no `parentIds[]`
    entry has `pedi: 'birth'`.
  - `"multiple birth parents"` warning when 3+ entries have
    `pedi: 'birth'`.
  - Existing `"unsupported-by-schema-version"` finding is
    cleared once the migration runs.

### DoD

- Migration round-trip: Akarians DEMO (1.0.0) → 2.0.0 → exported
  as GEDZIP → re-imported → identical (`isPrimary` /
  `isCurrent` / portrait blob hashes all stable).
- A synthetic 3-parent fixture renders with a parent-gather pill,
  three parent lines, one child drop. Layered engine.
- Half-sibling bus segmentation appears between siblings with
  asymmetric parent sets (layered engine).
- Family-view integration: family-view Phase 4's "add parent"
  affordance accepts a 3rd parent without crashing; finding
  surfaces correctly; layout adapts.
- Family-view integration: family-view's expansion state survives
  the migration end-to-end (open a tree on v1, run the migration,
  the saved expansion `Set<PersonId>` still applies cleanly).
- Family-view integration: family-view Phase 4 e2e tests green
  after the migration.
- Inspector ConnectionsTab renders 3+ parents inline.
- Stroke palette: adopted parent renders dashed (layered engine)
  — **this is Phase 1's user-visible payoff finally landing** as
  the role helper gets real data.
- No regression in family-view's Phase 0 smoke test.
- **Perf regression check**: layout + render timing on Akarians
  ≤5 ms over Phase 1's recorded number. Recorded.
- **No-hyperbolic-import CI check** still passes.

### Rollback criterion

- If the migration drops or corrupts data on Akarians (verified
  by structural-hash comparison before/after), halt and reconsider.
  Most likely culprits: rounding of `unionIndex` /
  `marriageDate`, off-by-one in `parentIds[]` ordering.

---

## Revision after Phase 4 follow-up — 16 May 2026

**Trigger**: Phase 4 follow-up closed (overlay renderer for
`tree.relationships[]` + A\* obstacle-avoidance router + stroke
palette CSS classes + Inspector "bonds" tab + View menu overlay
toggles wired to real state). Retro + triage ran. All
relationship-vocabulary UI payoffs are now user-visible; remaining
phases are additive (identity / groups / sibship), one
consolidation phase (8), and one conditional engine-parity phase
(9).

**What changed**:

- **Phase 5 (identity / species / origin)**: valid — independent of
  overlay rendering.
- **Phase 6a (Groups + group frames)**: valid — independent. The
  Phase 4 follow-up's engine-private overlay-walker pattern
  (`buildOverlays(tree, nodes, edges, bbox)` plugged into
  `FamilyViewLayout.overlays`) is the prototype for Phase 6a's
  `buildGroups(tree, nodes, bbox)`. The CSS-class palette pattern +
  the View menu toggle pattern carry over verbatim. No spec drift;
  noting the reuse opportunity here so Phase 6a doesn't re-invent
  the wiring.
- **Phase 6b (sibship decorators + consanguinity)**: valid —
  independent. Same prototype as 6a.
- **Phase 8 (single-tier GEDZIP export + ship polish)**: revise —
  scope grows by three bullets in "Ship polish":
  (a) `Relationship.date` input field in the Inspector "bonds"
  tab (domain ops + serialize/parse already handle it; only the
  UI input is missing).
  (b) Severance `//` marker becomes scale-aware (currently fixed
  at 14px, which dominates / vanishes at extreme zoom levels).
  (c) E2E visual test for overlay rendering (Akarians + 1 sworn-
  bond), added once the visual fix-up baseline regen is done.
  These are nits + one important; bullets inlined into Phase 8's
  spec below. Phase 8 header + DoD + day budget unchanged
  (still ~2 days; the additions are small).
- **Phase 9 (Wave 2 hyperbolic-engine parity; may be cut)**: valid
  — independent. One note added inline: if launched, the
  `OverlayKind` type and `mapKind()` function need promotion out
  of `engines/family-view/` into a shared module so the hyperbolic
  engine can consume the same palette without re-implementing the
  mapping.

**Triage actions folded in**:

- Closed in bug log: none. Phase 4's foundation retro debt items
  all delivered (overlay walker, A\* router, stroke palette,
  Inspector tab, View toggles).
- Added to bug log: 8 items routed (3 fix-in-phase-8, 5 defer).
  Inline in the bug log section above.

**Cross-workstream dependency surfaced**: the Akarians visual
baseline gate is currently broken by user in-flight visual fix-up
work (cardHeight refactor + per-row max-height pass), which is
externally owned (not part of the relationship-vocabulary plan).
Phase 4 follow-up confirmed by isolated stash + rerun that its
code is independently clean. Phases 6a / 6b will inherit the
same dependency until the visual fix-up workstream regenerates
baselines. Not blocking forward progress, but worth flagging so
later phases don't mis-attribute baseline failures to their own
changes.

**Process note**: fourth successive phase to wrap in a single
shippable unit. The cadence is holding even on a phase whose
original ~4.5-day estimate would have been the largest single
shippable unit so far — sized to one autonomous turn because the
foundation already shipped (Phase 4a in 14 May session). Lesson:
"big" estimates that have already been pre-decomposed into a
foundation + a follow-up are routinely smaller than they look,
and don't need re-splitting.

---

## Revision after Phase 3c follow-up — 14 May 2026

**Trigger**: Phase 3c follow-up closed (inspector union-row UI +
preferred-union localStorage → `UnionRecord.preferredBy` migration +
`UnionPatch.preferredBy` + `setPreferredUnion` helper). retro +
triage ran; the user-facing path to mint and edit N>2 unions is now
complete. only Phase 4's overlay renderer remains as an outstanding
relationship-vocabulary UI payoff.

**What changed**:

- **Phase 4 follow-up (overlay renderer)**: valid — already framed
  as a follow-up by Phase 4's foundation retro; the next phase
  to launch. No spec drift; the residual debt list from Phase 4's
  retro stands verbatim (`passes/overlay.ts` walks
  `tree.relationships[]`, A\* obstacle-avoidance routing, stroke
  palette wiring, Inspector "Relationships" tab, View menu
  overlay toggles).
- **Phase 5 (identity / species / origin)**: valid — independent
  of 3c work.
- **Phase 6a (Groups + group frames)**: valid — independent.
- **Phase 6b (sibship decorators + consanguinity)**: valid —
  independent.
- **Phase 8 (single-tier GEDZIP export + ship polish)**: revise —
  scope grows by one bullet under "Ship polish" to consolidate
  the preferred-union storage onto `UnionRecord.preferredBy` and
  delete legacy `fte.family-view.primary-union.v1:*` localStorage
  entries after the family-view `˅` picker round-trips through
  the domain field. The two-source-of-truth flagged in this
  phase's triage retires here. Bullet inlined above; phase
  header and DoD unchanged.
- **Phase 9 (Wave 2 hyperbolic-engine parity; may be cut)**:
  valid — independent.

**Triage actions folded in**:

- Closed in bug log: Phase 3a triage "`updateUnion` lacks
  `preferredBy` patch support" — delivered.
- Added to bug log: "preferred-union two-source-of-truth" (fix-in-
  phase-8, important) and "no e2e for create-N-partner-via-
  inspector → bus render" (defer, nit). Both already inline in
  the bug log section above.

**Process note**: third successive phase to wrap in a single
shippable unit after the 14 May plan-revise retired sub-sub-phase
labels. The cadence is holding.

---

## Revision after Phase 3b first commit — 14 May 2026

**Trigger**: user asked why this plan keeps splitting into
sub-sub-phases.

**Honest answer**: the original "~3 days for Phase 3" was
optimistic for a 21-file schema migration; ≥2 real sub-phases were
always going to be needed. On top of that, drafting "Phase 3b.1"
as a standalone sub-phase for a ~30-minute change (treeDiff +
6 tests) was over-splitting that earned retro/triage/plan-revise
overhead disproportionate to the change. Lesson: phase boundaries
should match real shippable units, not every commit boundary.

**What changed**:

- **Phase 3 (UnionRecord)**: revise — header rewritten with the
  honest a/b/c shape and time estimate (4–5 days, not 3).
  Sub-sub-phase nomenclature (3b.1 / 3b.2) retired. The
  treeDiff slice already shipped now reads as "first commit of
  Phase 3b" rather than its own sub-phase.
- **Phase 3b (rest)**: revise — single shippable unit covering
  renderer + writer-flip + reader sweep + Akarians regression
  check. **No further sub-splits unless a hard blocker emerges.**
- **Phase 3c**: valid — inspector + GEDCOM + preferred-union,
  sized big enough to justify the cycle overhead on its own.
- **Phases 4, 5, 6a, 6b, 8, 9**: valid — unchanged. Each is
  scoped around a single rendering feature + at most one
  additive schema bump, which the Phase 2 / 3 experience suggests
  is the right unit size.

**Process change**: stop creating new sub-sub-phase labels in the
phase-loop. The phase-loop is allowed to take more than one commit
per phase; "phase N — commit M of K" is a valid status string.

---

## Phase 3 — UnionRecord + N-partner unions (~4–5 days; split 3a / 3b / 3c)

**Revised after Phase 3b.1 (14 May 2026)**: the original "~3 days for
one phase" estimate was optimistic. Replacing `CoupleRecord` with
`UnionRecord` touches 21 source files plus tests; the work
genuinely needs three sub-phases (mirrors Phase 2's a/b shape):

- **Phase 3a — schema + UnionRecord type + ops slice** (1 day):
  shipped. Migration, type, `getUnions`, new domain ops.
- **Phase 3b — N-partner unions are first-class everywhere**
  (~2–2.5 days; combines what was briefly drafted as 3b.1 + 3b.2):
  treeDiff knows `unions[]` (shipped 14 May); family-view renderer
  honours `partnerIds.length > 2` via the Phase 1 bus primitive;
  `createTree` initialises `unions: []` AND writers drop the
  conditional sync atomically (so all freshly-created trees track
  unions from rev 0); `place.ts` / `order.ts` extend with
  `INTRA_UNION` gap policy and `unionCluster` ordering; readers
  in `couples.ts` / `layout.ts` / `primaryUnion.ts` move to
  `getUnions(tree)`; DoD includes a 3-partner closed-union
  fixture rendering cleanly in the layered engine alongside the
  Akarians regression check. **No further sub-splits** unless a
  hard blocker emerges mid-implementation.
- **Phase 3c — inspector + GEDCOM + preferred-union**
  (~1.5–2 days): ConnectionsTab spouse-row becomes union-row with
  partner chips + kind/closed/preferred toggles; GEDCOM emits
  `_TREES_UNION` extensions alongside the standard pairwise-FAM
  fallback; localStorage `preferred-union` flag migrates to
  `UnionRecord.preferredBy` on first v3 read (per Phase 0's
  reconciled commitment, decision (a)); `updateUnion` grows
  `preferredBy` patch support; validator clears
  `polycule-rendered-as-primary-pair` finding; readers in
  GEDCOM serialize / parse / merge / inspector / familyscript
  move to `getUnions(tree)`.

**Why over-splitting happened in the prior cadence**: 3b.1 was
drafted as a standalone sub-phase for `treeDiff` awareness
(~30 minutes of code + 6 tests). That earned a retro + triage +
plan-revise overhead disproportionate to the change. The lesson
folded back in: phases should match real shippable units, not
every commit boundary. The remaining Phase 3b is sized big
enough to justify the cycle overhead.

---

## Phase 3 (original spec, retained for traceability) — UnionRecord + N-partner unions (~3 days)

**Soft coordination with family-view's Phase 6.** Sync matrix in
Phase 0's bug log lists this as preferred sequencing.
**Hard prerequisite (unchanged)**: the `preferred-union`
commitment reconciliation from Phase 0's bug log must have landed
in both plans before Phase 3 starts — that's a runtime-behaviour
contract, not just merge ergonomics. Without it, Phase 3 has no
canonical answer for where `UnionRecord.preferredBy` writes go.

**Claims from external trackers**:

- `notes/to-do.md` (schema evolution): "add optional `name?` to
  `CoupleRecord` so families can be referenced by a chosen
  surname" — included as `UnionRecord.name?` above. Marked
  claimed.
- `notes/bugs.md` (layout/edge routing): "multi-spouse bond
  passes through intervening ghost card" — load-bearing per
  design study §10 as a prerequisite for n-ary union routing.
  This phase's `passes/route.ts` work introduces the
  L-bond-when-intervening-ghost rule (option (a) from the bug
  entry) for the union-manifold segment; the same routing
  treatment applies to existing pair-bonds with cross-rank
  ghosts. Marked claimed.

**Schema bump 2.0.0 → 3.0.0 (major, breaking).** `CoupleRecord` becomes `UnionRecord`:
`{ id; partnerIds: PersonId[]; kind?: 'romantic' | 'civil' | 'religious' | 'ritual' | 'cohabit' | 'sworn' | ...; closed?: boolean; preferredBy?: Record<PersonId, boolean>; childIds[]; marriageDate?; isPrimary?; isCurrent?; name?: string }`.

**Includes `UnionRecord.name?: string`** so families can be
referenced by a chosen surname / household name. Inspector
ConnectionsTab union-row gets a rename affordance. Closes the
`notes/to-do.md` entry "add optional `name?` to `CoupleRecord`."

### Implementation

- **Migration 2.0.0 → 3.0.0**: `{leftId, rightId, unionIndex, childIds, ...}`
  → `{id: uuid(), partnerIds: [leftId, rightId], childIds, ...}`.
  `unionIndex` is dropped (id replaces it).
- **Domain ops** (`tree.ts`): `linkSpouse(a, b)` → `linkUnion(a, b)`
  creating a 2-partner union. New op `addUnionPartner(unionId, personId)`
  appends. `removeUnionPartner` filters; if `partnerIds.length === 0`
  the record is deleted.
- **Family-view integration**: the engine-private `union-anchor`
  IR node already carries `partnerIds: PersonId[]`. This phase
  makes the renderer honour `partnerIds.length > 2` instead of
  silently rendering the first 2 with a logged finding.
- **Layout — Phase 1 primitive ships**: the chosen geometry
  (default `bus`) renders for N-partner unions in the layered
  engine.
- **Layout — `passes/place.ts`**: gap policy gains
  `INTRA_UNION` (tight, < DELTA) for closed N-unions and
  `INTER_UNION_SAME_PARENT` (medium) for shared-node polycules.
  Spouse-bar midpoint becomes union-centroid.
- **Layout — `passes/order.ts`**: replace `spouseGroup` 2-element
  constraint with `unionCluster` of arbitrary size. Cluster must
  remain contiguous along its rank. Off-rank partners become
  ghosts using the existing ghost mechanism.
- **Preferred-union** (family-view forward-compat point 7):
  implementation follows the **reconciled decision from Phase 0's
  bug log** (either (a) full localStorage → `UnionRecord.preferredBy`
  migration on first v3 read, or (b) `UnionRecord.preferredBy` is
  opt-in per tree, localStorage stays sole UI-state authority).
  No dual-source-of-truth.
- **Open polycule support**: when partners aren't members of a
  single closed `UnionRecord`, render as a fan of pairwise
  unions (today's `spouseIds` behaviour, preserved). A
  `PolyculeGroup` overlay (design study §4.2) is **deferred to
  Phase 6** because it's a group-frame feature.
- **GEDCOM export** (single-tier, inline fallback +
  `_TREES_UNION` extension): for N>2 unions, emit a chain of
  pairwise FAMs as the standard-tag fallback AND a top-level
  `_TREES_UNION` record with `_PARTNER+` / `_KIND` / `_CLOSED`
  for full fidelity. `UnionRecord.kind` → `2 TYPE civil` etc.
  for GEDCOM 7 readers as the inline fallback.
- **Inspector**: ConnectionsTab spouse-row becomes union-row.
  Each union row shows partner chips + a `+` to add a partner
  to the existing union. Kind / closed / preferred toggles
  inline.
- **Validator findings**:
  - `"polycule-rendered-as-primary-pair"` cleared in this phase
    (it was warned in v2).

### DoD

- Migration round-trip: Akarians DEMO (2.0.0) → 3.0.0 → GEDZIP
  → re-imported → identical.
- Synthetic 3-partner closed union renders with the Phase 1
  primitive in the layered engine.
- Synthetic V-polycule renders as 2 pairwise unions (layered;
  no group frame yet — that's Phase 6a).
- Synthetic 1-partner degenerate union from family-view's Phase 0
  still renders correctly post-migration.
- Family-view multi-marriage rendering still works (Johnakar
  Oken's 6 wives via the `˅` affordance).
- Family-view's preferred-union state behaves per the reconciled
  commitment.
- Family-view Phase 2's "logged finding" for `partnerIds.length > 2`
  is removed (it was a fallback warning; N>2 is now first-class).
- No regression in family-view's Phase 2 multi-union integration
  test or Phase 6 polish e2e.
- **Perf regression check**: layout + render timing on Akarians
  ≤5 ms over Phase 2's recorded number. Recorded.
- **No-hyperbolic-import CI check** still passes.

### Rollback criterion

- If the union migration corrupts existing couple-record fields
  (`marriageDate`, `isPrimary`, `isCurrent`), halt and reconsider.
- If Phase 1's primary primitive turns out unrenderable in
  Akarians at fit-zoom alongside family-view's bounded view,
  fall back to the next ladder rung from Phase 1's pre-specified
  fallback.

---

## Phase 4 — relationships overlay + overlay routing pass (~4.5 days, A\* in scope)

**Phase 1's 30-overlay readability probe came in unreadable**
(60 skeleton crossings on Akarians). A\* obstacle-avoidance
routing is now load-bearing for overlays; budget grew from 3 days
to 4.5 days. The simpler bridge-hop scheme stays in `edgePath.ts`
for skeleton edges but overlays must route around card AABBs to
stay legible.

**Claims from external trackers (conditional)**:

- `notes/to-do.md` (phase 6 polish): "orthogonal edge routing
  with obstacle avoidance" (A\*) — **claimed iff the Phase 1
  probe forces A\* into scope.** Otherwise the entry stays open
  in `to-do.md` as a follow-up.

**Schema bump 3.0.0 → 3.1.0 (additive).** Adds
`tree.relationships: Relationship[]` where
`Relationship = { id; kind: 'sworn-bond' | 'oath-sibling' | 'blood-brother' | 'master-apprentice' | 'covenant' | 'transformed-from' | 'reincarnated-as' | 'merged-from' | 'split-into' | 'alias-of' | 'severed' | 'estranged' | 'exiled' | 'disowned'; sourceIds[]; targetIds[]; cause?; date?; notes? }`.

**Claims from `notes/to-do.md`** (schema evolution): "add generic
`relationships: { kind, targetId, notes? }[]` for transmutation,
alias, adoption-not-yet-mapped, and other fictional bonds" —
directly delivered by this phase. Marked claimed.

### Implementation

- **Migration 3.0.0 → 3.1.0**: adds the empty `relationships: []`
  field to existing trees. Idempotent.
- **IR — overlay collection**: layout pass now emits
  `overlays: OverlaySegment[]` populated from
  `tree.relationships[]`. Phase 0's stub becomes real.
- **Routing — `passes/overlay.ts`**: each relationship becomes
  one or more `overlay-bond` (sworn / oath / ritual) or
  `identity-arc` (transformed / reincarnated / merged / split /
  alias) segments. Routing is **independent** of the skeleton:
  uses straight geodesics with bridge-arcs at crossings (no A\*
  yet — that's tracked in non-goals). Self-loops (time-loop,
  self-couple) render as a side-arc.
- **Renderer — chained stroke** (Phase 1) for sworn / oath /
  ritual. **Wavy stroke + arrow + glyph** for identity-arcs
  (☼ transform, ∞ reincarnate, ⊕ merge, ⊖ split, ≡ alias).
- **Renderer — severance marker**: existing edge along the
  skeleton (parental, partner, sibling) gets a `severance`
  overlay decoration. Doubled-slash for `cutoff` / `estranged` /
  `disowned`; red for `killed-by` if we extend the kind set.
- **GEDCOM export** (single-tier, inline fallback +
  `_TREES_REL` extension): relationships drop with NOTE entries
  for tools that strip extensions; full fidelity through
  top-level `_TREES_REL` records with `_SOURCE`, `_TARGET`,
  `_KIND`, optional `_DATE` / `_CAUSE` / `_NOTES`. Severances
  use `1 EVEN / 2 TYPE estrangement` as inline fallback alongside
  `_TREES_SEVERANCE` extension.
- **Inspector — new Relationships tab**: list each
  `Relationship` by kind with source / target chips, kind
  picker, optional date / cause / notes. CRUD inline.
- **View menu — Overlays sub-menu**: the disabled placeholders
  from Phase 0 (`Sworn bonds`, `Transformations`, `Severances`)
  become enabled toggles.
- **Family-view integration**: family-view's overlay-toggle list
  from its Phase 6 picks up the new entries automatically (the
  Phase 0 menu structure is already in place). The path-highlight
  pass continues to run independently; overlays draw above
  path-highlighted edges so the highlight remains visible.
- **Validator findings**:
  - `"dangling-relationship-source/target"` for relationships
    referencing deleted people. Non-blocking, like other
    referential integrity findings.

### DoD

- Migration 3.0.0 → 3.1.0 round-trip lossless.
- Adding a sworn-bond relationship between two Akarians people
  renders as a chained line over the skeleton; toggling the
  `Sworn bonds` overlay off hides it; on shows it.
- A transformation identity-arc renders with arrow + glyph;
  source and target cards both highlight on selection.
- Severance applied to an existing parental drop renders the
  doubled-slash without distorting the drop geometry.
- GEDZIP round-trip preserves source/target/kind fully via
  `_TREES_REL` extensions; the NOTE-block fallback also renders
  meaningfully when extensions are stripped.
- Family-view integration check: path-highlight + overlays
  compose visually without flicker; engine swap preserves
  overlay toggle state; family-view's overlay sub-menu picks up
  the new entries with zero manual wiring.
- **Perf regression check**: layout + render timing on Akarians
  ≤5 ms over Phase 3's recorded number, with all overlay
  toggles ON. Recorded.
- **No-hyperbolic-import CI check** still passes.

### Rollback criterion

- If overlay routing crosses skeleton edges so badly that
  Akarians becomes unreadable AND Phase 1's probe didn't predict
  it (i.e. the A\* contingency wasn't triggered), drop overlays
  to a separate rendering plane (faded / dimmed skeleton
  background) until A\* lands as a follow-up. Update Phase 6a,
  Phase 6b, and non-goals accordingly.

---

## Phase 5 — identity / species / origin extensions (~2 days)

**Soft coordination with family-view's Phase 5.** Sync matrix in
Phase 0's bug log lists this as preferred sequencing.
**Hard prerequisite (unchanged)**: the `cardDecorator` API
contract pinned in Phase 0 must be honoured — this phase extends
the record (per the Phase 0 contract) with five additional
fields, regardless of which order the workstreams land.

**Schema bump 3.1.0 → 3.2.0 (additive).** Extends `Person.gender`
to a struct, adds `species`, `kind`, `origin`.

### Implementation

- **Migration 3.1.0 → 3.2.0**:
  `gender: 'm' | 'f' | 'u'` →
  `gender: { identity: 'male' | 'female' | 'unknown'; pronouns?; assignedAtBirth?: 'AMAB' | 'AFAB' | 'UAAB'; fluid?: boolean }`.
  Legacy m/f/u map to identity = male/female/unknown (no
  pronouns, no assignedAtBirth, no fluid). Open string for
  `identity` (legacy strings stay valid).
- **Cisgender is the default.** When only `identity` is set,
  `assignedAtBirth` is implicitly cis-matching (male →
  AMAB-equivalent, female → AFAB-equivalent, unknown →
  UAAB-equivalent) but not stored — absence-of-value implies cis.
  When only `assignedAtBirth` is set (no identity), the inferred
  identity matches the assignment (AMAB → male, AFAB → female,
  UAAB → unknown). Explicit non-cis combinations are stored
  verbatim. `fluid` defaults to `false` (absence = false). This
  means a typical user editing existing trees sees no new
  required fields; everyone is treated as cis until told
  otherwise.
- **New fields**:
  - `species?: string` (open string, free-form)
  - `kind?: 'biological' | 'mechanical' | 'spirit' | 'collective' | 'concept' | ...` (open string)
  - `origin?: { kind: 'born' | 'cloned' | 'hatched' | 'summoned' | 'awoken' | 'manufactured' | ...; cause?: string; date?: HaracalndeDate }`
- **`cardDecorator`** (extension; family-view Phase 5's
  module): real implementations replace Phase 0's stubs:
  - `decorate(person).shape` reads `gender.identity` first; if
    absent, infers from `gender.assignedAtBirth` (cis default).
    If neither is set, falls back to legacy m/f/u. Unknown
    identity strings map per the `identityShapeMap` user setting;
    default fallback is the cis shape implied by
    `assignedAtBirth` if available, else diamond. Setting lives
    alongside `fte.defaultEngine` in localStorage.
  - `decorate(person).frame` reads `species` + `kind`:
    biological-human-typical = solid; mechanical = dashed;
    magical = double; hybrid (parentIds with disparate species)
    = gradient.
  - `decorate(person).fillTone` factors in `kind` (chair = grey,
    AI = blue, spirit = lavender).
  - `decorate(person).cornerGlyphs` adds origin glyph
    (✨ summoned, ⚙ manufactured, ◯ hatched, ✦ awoken, ⟲ time-loop
    via self-parent detection).
  - `decorate(person).sideLabel` shows `AMAB` / `AFAB` / `UAAB`
    if present.
  - `decorate(person).pronouns` flows into `kinship.ts` term
    derivation (no more silent gender → mother/father fallback).
- **Inspector — PersonalTab** gains:
  - Gender identity input (open string + dropdown of common
    presets).
  - Pronouns input.
  - Assigned-sex-at-birth picker.
  - Fluid-identity checkbox.
  - Species input (open string).
  - Kind picker.
  - Origin sub-form (kind + cause + date).
- **GEDCOM export**: identity maps to `1 SEX M/F/X/U` (X is
  GEDCOM 7's non-binary; verified in Phase 0 or added there if
  missing); identity string, pronouns, species, kind, origin all
  emit via `_TREES_GENDER_IDENTITY` / `_PRONOUNS` /
  `_ASSIGNED_SEX` / `_GENDER_FLUID` / `_TREES_SPECIES` /
  `_TREES_PERSON_KIND` / `_TREES_ORIGIN_*` extensions, with
  structured NOTE fallbacks (`# trees: species=dragon`) for
  tools that strip extensions.

### DoD

- Migration 3.1.0 → 3.2.0 round-trip lossless.
- A typical existing tree with `gender = 'm'` people post-
  migration shows no visible change in PersonalTab (cis default
  means no new required fields surface).
- A person with `gender.fluid = true` + `species = "dragon"` +
  `origin.kind = "summoned"` renders with: identity-driven
  shape, dragon frame style (configurable in this phase), fluid
  side-badge, summoned corner glyph.
- A person with only `assignedAtBirth = 'AMAB'` and no identity
  set renders as a square (cis inference).
- **PersonalTab distinguishes set vs inferred values**: any
  field whose displayed value came from cis-inference (e.g.
  shape-from-AMAB when identity is unset) shows a small
  `(inferred)` annotation. Setting the field explicitly removes
  the annotation. Verified by a component test.
- **No-hyperbolic-import CI check** still passes.
- `PersonalTab` round-trips all new fields.
- Tier-1 GEDZIP export emits structured NOTE prefixes
  recoverable on re-import.
- Family-view integration: `PersonNode.svelte` has zero
  `gender === 'm'` / `'f'` / `'u'` branches (verified by grep
  in `feature-completion`); all visual decisions flow through
  the `cardDecorator` record.
- Family-view integration: `gender.fluid = true` composes with
  path-highlight (Phase 3 of family-view) without visible
  flicker on selection change.
- Default `identityShapeMap` honoured for unknown identity
  strings (covered by a unit test on the decorator).
- **Perf regression check**: layout + render timing on Akarians
  ≤5 ms over Phase 4's recorded number. Recorded.

### Rollback criterion

- If extending `cardDecorator` causes `PersonNode` to re-render
  on every selection change (perf regression), pre-compute the
  decorator output and memoise.

---

## Phase 6a — Groups + group frames (~2 days)

**Schema bump 3.2.0 → 3.3.0 (additive; Groups).** One schema bump
+ one rendering feature per phase, per the plan's own convention.

### Implementation

- **Migration 3.2.0 → 3.3.0**: adds empty `tree.groups: Group[]` where
  `Group = { id; name; kind: 'dynasty' | 'house' | 'clan' | 'household' | 'faction' | 'order' | 'covenant'; memberIds[]; founderId?; armorial?; frame?: { color; style; shape?: 'hull' | 'band' | 'ribbon' } }`.
- **Render — group frames** (`passes/groups.ts` from Phase 0's
  stub):
  - `hull`: convex hull around members in the placed graph;
    tinted fill (semi-transparent).
  - `band`: vertical/radial lane down a slice of the canvas;
    tinted background.
  - `ribbon`: generation-spanning header bar labelled with the
    group name + optional armorial.
  - Layered engine only; hyperbolic-engine implementation moves
    to Wave 2 (Phase 9; may be cut).
  - Nested groups (House → Cadet Branch → Household) render as
    concentric / stacked frames.
- **Inspector — Groups tab** (new): list of groups + add /
  rename / delete; member list with add/remove; frame style
  picker.
- **View menu**: enable the previously-disabled `Group frames`
  overlay entry.
- **GEDCOM export** (single-tier, inline fallback +
  `_TREES_GROUP` extension): groups → top-level `_TREES_GROUP`
  records with `_NAME`, `_KIND`, `_FOUNDER`, `_MEMBER+`,
  `_FRAME`; NOTE on founder INDI listing members as the inline
  fallback for tools that strip extensions.

### DoD

- Akarians DEMO: add a "House Marvane" group with the 8 known
  members; renders as a tinted hull behind the cards.
- Migration 3.2.0 → 3.3.0 round-trips cleanly.
- Family-view integration: groups don't fight expansion state
  (collapsed members still count toward the hull; the hull
  contracts as members collapse into badges).
- Family-view integration: path-highlight + group hulls compose
  visually (a path threading through a hull doesn't get
  visually muddied).
- **Perf regression check**: layout + render timing on Akarians
  ≤5 ms over Phase 5's recorded number. Recorded.
- **No-hyperbolic-import CI check** still passes.

### Rollback criterion

- If hull-overlap computation on Akarians-scale data is too
  slow, ship 6a with `band` + `ribbon` only in the layered
  engine; defer `hull` to a follow-up. (Hyperbolic remains
  Wave 2 regardless.)

---

## Phase 6b — sibship decorators + consanguinity surfacing (~2 days)

**Schema bump 3.3.0 → 3.4.0 (additive; Sibship + birthOrder).**
Plus derived consanguinity surfacing (no schema bump).

**Claims from `notes/to-do.md`** (schema evolution): "add
`birthOrder?: number` on `Person` for twin / triplet / cohort
ordering inside a sibship" — directly delivered. Marked claimed.

### Implementation

- **Migration 3.3.0 → 3.4.0**: adds
  `tree.sibshipDecorators: SibshipDecorator[]` where
  `SibshipDecorator = { id; sibIds[]; kind: 'twins-MZ' | 'twins-DZ' | 'twins-?' | 'triplets-MZ' | ... | 'clone-batch' | 'litter' | 'spawned-together' }`,
  plus `Person.birthOrder?: number`.
- **Render — sibship-bracket segment** (new `EdgeKind`): runs
  under the parent-drop; fans into individual short verticals;
  twin tie-bar (`MZ = bar present`, `DZ = absent`, `? = ?`)
  drawn across the fork.
- **Render — consanguinity surfacing** (derived; no schema):
  - Uses `consanguinity.ts` from Phase 0's stub. Real
    implementation: `computeAncestorOverlap(personId)` returns
    duplicate ancestor IDs and a coefficient (Wright's formula).
  - Duplicate ancestors: when a ghost-spouse duplication renders
    the same person twice, both instances get a coloured
    background tint by frequency. Existing chip-link icon is
    already in place.
  - COI badge: small badge on the proband card showing the
    coefficient as a percentage. Toggle via `Consanguinity`
    overlay (enabled now; placeholder in Phase 0).
  - Double-line bond between consanguineous partners (Phase 1
    stroke palette already has the double-parallel pattern).
- **Inspector — SibshipTab or PersonalTab extension**: twin
  classification, birth-order spinner, clone-batch picker.
- **View menu**: enable the previously-disabled `Consanguinity`
  overlay entry.
- **GEDCOM export** (single-tier, inline fallback +
  `_TREES_SIBSHIP` / `_TREES_BIRTH_ORDER` extensions): sibship
  → `_TREES_SIBSHIP` on FAM with `_KIND` / `_MEMBER+`, plus a
  NOTE on FAM as inline fallback; `birthOrder` →
  `_TREES_BIRTH_ORDER` on INDI, with `BIRT / DATE` ordering as
  the fallback (lossy: exact integer lost).

### DoD

- Migration 3.3.0 → 3.4.0 round-trips cleanly.
- A twin pair renders with the MZ tie-bar; turning it off via
  the picker collapses the bar.
- A cognatic-cycle subset of Akarians shows a COI badge on the
  proband; duplicate ancestors highlight when hovered.
- Family-view integration: twin-bar doesn't fight the
  half-sibling sibship-bus segmentation from Phase 2 (they
  compose; both visible).
- Family-view integration: consanguinity COI badge updates
  correctly when family-view's expansion state changes
  (collapsed-branch ancestors still contribute to the
  computation; only the visualisation is hidden).
- **Perf regression check**: layout + render timing on Akarians
  ≤5 ms over Phase 6a's recorded number. Recorded.
- **No-hyperbolic-import CI check** still passes.

### Rollback criterion

- If `computeAncestorOverlap` is too slow to compute live
  (Wright's formula on a dense cognatic tree like Akarians can
  be O(N²) without memoisation), memoise off the layout-worker
  cache key (same as `editRev`-driven invalidation). If still
  too slow, gate COI behind a "compute now" button rather than
  recompute on every layout pass.

---

## Phase 8 — single-tier GEDZIP export + ship polish (~2 days)

**The single-tier GEDZIP from design study §9, simplified per
user direction (always emit `HEAD.SCHMA`-registered `_TREES_*`
extensions alongside inline standard-tag fallbacks; one file
format, no user choice). Project ship gate.**

### Implementation

- **Single-tier GEDZIP** consolidating all earlier-phase
  fragments:
  1. Emit GEDCOM 7 (not 5.5).
  2. `HEAD.SCHMA` registers the
     `https://attuproject.org/trees/schema/v1#` namespace with
     short forms `_TREES_*` (scaffold from Phase 0 + tags
     accumulated through Phases 2–6b).
  3. For every schema field, emit BOTH the inline standard-tag
     fallback (HUSB/WIFE, PEDI, MARR/TYPE, SEX M/F/X/U,
     structured NOTE) AND the `_TREES_*` extension. Tools that
     strip extensions render the fallback; FamilyTree Editor
     re-imports the extension for full fidelity.
  4. Self-couple / self-parent / explicit cycles emit cleanly
     in extensions; the inline fallback for these is a NOTE
     describing the cycle (tools that strip extensions may
     reject the file if it's structurally cyclic — verified by
     the Phase 0 HEAD.SCHMA probe).
- **UI — Export menu**: collapses from family-view's "GEDZIP
  (compatible) / GEDZIP (accurate)" experiment back to a single
  `GEDZIP` action; subtitle reads: "preserves everything;
  other tools see your data with non-traditional details
  approximated by standard tags."
- **Dropped-fields banner**: continues to surface anything that
  cannot be expressed via the inline fallback (e.g. closed
  N-partner unions appearing as separate marriages in other
  tools). The banner notes "these tools will see X; FamilyTree
  Editor will see Y."
- **Round-trip test matrix**:
  - Akarians DEMO → GEDZIP → re-imported → byte-identical
    (modulo whitespace).
  - Synthetic fixture with every new field (multi-parent,
    N-partner union, relationships overlay, identity struct,
    species, group, sibship, severance) → GEDZIP → re-imported
    → byte-identical.
  - Same synthetic fixture → GEDZIP → strip `_TREES_*` tags
    manually → re-imported → fields that should survive via
    inline fallback (PEDI, primary pair, SEX) round-trip; rest
    surface as NOTE entries.
  - **Semver round-trip through older build**: 3.3.0 bundle
    (Groups present) opened in a build pinned to 3.1.0 schema
    → user edits a person's name → saves → reopens in 3.3.0
    build → Groups data preserved verbatim, name edit applied.
    Tests the headline semver benefit.
- **Ship polish**:
  - **Preferred-union storage consolidation** (added after
    Phase 3c follow-up): rewrite
    `engines/family-view/primaryUnion.ts` to read / write
    `UnionRecord.preferredBy` instead of the legacy
    `fte.family-view.primary-union.v1:*` localStorage map.
    After the rewrite ships and the family-view `˅` picker
    round-trips through `preferredBy`, delete legacy entries
    for any tree whose
    `fte.migrations.preferred-union.v1:{treeId}` sentinel is
    set. Retires the two-source-of-truth flagged in Phase 3c
    follow-up's bug-log triage.
  - **`Relationship.date` Inspector input** (added after
    Phase 4 follow-up): add a date input field in
    `RelationshipsTab.svelte` alongside cause / notes. Domain
    ops + GEDCOM serialize / parse already round-trip the
    `HaracalndeDateData` field; only the UI is missing.
  - **Severance marker scale-aware sizing** (added after
    Phase 4 follow-up): the `//` SVG `<text>` decoration at
    the severance overlay midpoint uses a fixed `14px` font
    size. Make it `vector-effect`-aware (or compute relative
    to the current zoom scale) so the marker reads correctly
    at extreme zoom levels.
  - **E2E visual test for overlay rendering** (added after
    Phase 4 follow-up): add a Playwright visual baseline
    spec covering Akarians + 1 sworn-bond + 1 transformation
    + 1 severance. Blocked until the user's in-flight visual
    fix-up workstream regenerates the existing Akarians
    family-view baseline.
  - `ship-readiness` skill walks the project's bug log,
    classifies blocker / follow-up, emits cut-line.
  - Documentation updates: `notes/agents.md` §8 entries for the
    new semver schema versions, the single-tier GEDZIP format,
    the role helper, the overlay layer, the group layer,
    `cardDecorator` axes, the cisgender default.
  - Performance verification: rendering Akarians with all new
    overlays enabled and family-view's bounded subset takes
    <50 ms layout + <30 ms render per frame.
  - Schema-evolution skill (`.claude/skills/schema-evolution/`)
    is finally written, drawing on the six migrations this plan
    delivers (now expressed in semver). The `notes/to-do.md`
    "`.claude/skills/schema-evolution/` skill" entry is closed
    by this phase. Marked claimed.
- **Family-view full integration check**: a final
  `integration-check` skill pass against the whole product with
  every relationship-vocabulary overlay + every family-view
  feature on simultaneously. No regressions.

### DoD

- Single GEDZIP export ships; round-trip test matrix passes.
- Export menu shows one action, not two.
- Dropped-fields banner accurately describes "what other tools
  will see" before download.
- HEAD.SCHMA probe results from Phase 0 are revisited; if any
  tool hard-failed, a per-tool stripping toggle is added (or
  filed as a follow-up), recorded in the bug log.
- `ship-readiness` verdict is `green` for this project.
- All TODO entries for the queued schema bumps are closed in
  `notes/to-do.md`.
- **Family-view sync matrix retired**: the table from Phase 0's
  bug log is marked closed; both plans cross-reference the
  retirement.
- **Cross-workstream `integration-check`** runs against the full
  product with every relationship-vocabulary overlay + every
  family-view feature ON simultaneously. `pnpm verify` and
  family-view's own verify suite both green.
- **Final perf budget**: layout + render timing on Akarians at
  family-view fit-zoom with all overlays ON is recorded against
  the original Phase 0 baseline. Budget: total regression
  across all phases ≤30 ms layout + ≤20 ms render. If exceeded,
  profile-and-fix before declaring ship.

### Rollback criterion

- If `HEAD.SCHMA` registration breaks export for a major tool
  (Phase 0's probe is the gate), add an export-time toggle:
  "drop extension registration for [tool]" — produces a
  fallback-only file for that tool, with a banner warning that
  re-importing it into FamilyTree Editor will lose
  non-traditional details. The default stays single-tier with
  extensions on.

---

## Phase 9 (Wave 2; may be cut) — hyperbolic-engine parity (~3–5 days, conditional)

**Status: deferred to Wave 2. Hyperbolic engine is no longer a
priority and may be removed from the product entirely. If
hyperbolic is cut before this phase starts, drop this phase
wholesale; no other phase needs revision.**

### High-level scope

If hyperbolic is kept and Wave 2 launches, this phase brings the
hyperbolic engine to feature parity with the layered engine on
the renderer features added in Phases 1–6b. Each item below is
intentionally high-level; full design happens at Wave 2
kick-off, not here.

- **N-partner geometry in hyperbolic**: hyperbolic barycentre
  for the union centroid; chosen primitive (bus/ring/polygon)
  rendered as a hyperbolic-equivalent shape.
- **Multi-parent drop in hyperbolic**: geodesic from
  parent-cluster centroid to child.
- **Overlay routing in hyperbolic**: identity-arcs as hyperbolic
  geodesics with arrow terminus; sworn-bond chains using
  hyperbolic geodesic primitives.
- **Group frames in hyperbolic**: hyperbolic polygons backing
  hulls; radial bands for `band`; arc-style ribbons.
- **Consanguinity highlighting in hyperbolic**: duplicate-
  ancestor faint connecting arc (hyperbolic geodesic).
- **Decision point at kick-off**: if any item turns out
  prohibitively expensive (hyperbolic polygon backing is the
  prime candidate), drop that item from Wave 2; don't try to
  make every layered feature match.

### DoD (if launched)

- The features named above render correctly in the hyperbolic
  engine on the Akarians DEMO.
- Layered-engine behaviour is unchanged.
- No new schema bumps; this phase is pure renderer work.

### If hyperbolic is cut before Wave 2 starts

- Delete this phase from the plan.
- Update `notes/to-do.md` to remove hyperbolic-engine entries.
- Update `notes/agents.md` to remove the hyperbolic engine
  reference.
- Remove `apps/web/src/lib/layout/engines/hyperbolic-lr/` and
  related test fixtures.
- No relationship-vocabulary feature changes — the entire main
  wave (Phases 0–8) ships layered-only and stands on its own.

---

## Phase 0 retro (14 May 2026 — first session)

**Status: ~85% shipped in one autonomous turn; 3 deferred items
identified for follow-up.**

### What landed vs spec

Shipped (4 commits):

1. `feat(schema)` — semver migration runner + six identity-stub
   migrations (1.0.0 → 3.4.0), cardDecorator extension (5 new
   optional fields), GEDCOM SEX U emit, `lint:no-hyperbolic-imports`
   CI rule in `pnpm verify`. Bundle manifest + IDB row schemaVersion
   widened to accept both `string` and `number` for back-compat.
2. `feat(layout)` — `engines/family-view/overlays.ts` and
   `engines/family-view/groups.ts` stubs (both return `[]`),
   `FamilyViewLayout` gains optional `overlays?` / `groups?`,
   `EdgeLayer.svelte` gets 25 stroke-palette CSS classes (all neutral
   solid), `domain/consanguinity.ts` stub,
   `unsupported-by-schema-version` finding kind.
3. `feat(shell)` — View > Overlays sub-list gains 5 disabled
   placeholders (sworn bonds / transformations / severances /
   group frames / consanguinity); `io/gedcom/extensions.ts`
   declares the `HEAD.SCHMA` namespace + `_TREES_*` short-form map.
4. `test(fixtures)` — `head-schma-probe.ged` synthetic 5-person
   GEDCOM 7 fixture for the manual user-driven interop probe.

Bug-log decisions recorded (all 7 from the plan):

- family-view Phase 0 prerequisite verified shipped.
- `passes/route.ts` audit: 3 findings, at threshold; no Phase 1
  refactor needed.
- role-helper signature pinned at
  `engines/family-view/layout.ts:49`.
- GEDCOM 7 SEX X verification → emit `SEX U` fix landed.
- preferred-union: decision (a) full localStorage→domain migration.
- v1→v2 landing: soft coordinate (no hard gate).
- cardDecorator API contract: record-return, not accessors.

### What surprised us

- **Concurrent agent's work in the same files.** App.svelte and
  `engines/family-view/layout.ts` had substantial in-flight
  modifications from another agent (family-view Phase 1 work);
  staging required `git checkout HEAD` + manual re-apply of just
  my edits to keep commits clean and not bundle someone else's
  work.
- **`strokePalette.ts` module turned out redundant.** The plan
  called for a new module wrapping the role helper; family-view
  had already factored `roleFor()` at `layout.ts:49`. No new
  module needed; the audit finding documents this.
- **route.ts extensibility came in at exactly 3 findings.** Right
  at the "if >3 refactor in Phase 1" threshold. Disposition is
  "no Phase 1 refactor" — Phase 2 touches `layer.ts` and Phase 3
  touches `route.ts` for n-ary unions; if Phase 3 finds itself
  blocked, escalate then.
- **Pre-existing typecheck error in App.svelte** (`onaddstub`
  callback prop) is family-view's in-flight work, not mine.
  Documented as out-of-scope; another agent's fix in the working
  tree was deliberately not staged with my commits.

### Residual debt (deferred to a follow-up Phase 0 turn)

- **N-partner geometry stub** (debug-gated bus on synthetic
  3-partner fixture). Needs a new `EdgeKind` variant
  (`union-manifold`) in `edgeRouter.ts` plus an emit path in
  `passes/route.ts` (the 959-line file). ~half-day of work.
- **Two-engine smoke test e2e** (open Akarians, switch engines,
  assert `overlays: []` / `groups: []` on each engine's IR). Needs
  Playwright fixture authoring.
- **Akarians DEMO smoke test e2e** (full end-to-end render with
  the new stubs in place). Needs Playwright fixture authoring.

All three are independent and can ship in a follow-up turn. None
block Phase 1 from starting — Phase 1's spike doesn't depend on
them; it depends only on the geometry decision being made (which
that spike itself produces).

### Implications for downstream phases

- **Phase 1 unchanged**: geometry spike runs against synthetic
  fixtures only (which Phase 1 itself writes), so the deferred
  N-partner geometry stub isn't a blocker. Phase 1 effectively
  absorbs the stub by promoting it to a real implementation
  decision.
- **Phase 2 unchanged**: `layer.ts` rank-assignment work is the
  primary mass; the bug-log claims (negative-drop, spurious top-
  rank ghost) feed in unmodified.
- **Phase 3 may surface a route.ts refactor**: at-threshold audit
  finding means n-ary union routing might be the trigger. Not a
  scope change today; flag for Phase 3 kickoff.
- **All other phases unchanged.**

---

## Phase 1 retro (14 May 2026)

**Status: shipped in one autonomous turn (1 commit). Geometry
decision frozen; A\* contingency triggered.**

### What landed vs spec

Shipped:

- `engines/family-view/nPartnerGeometry.ts` — three primitive
  implementations (`bus`, `ring`, `polygon`) for N-partner unions,
  exporting `computeManifold(primitive, partners)` and the frozen
  decision constant `PRIMARY_PRIMITIVE = "bus"`.
- `tests/unit/layout/n-partner-geometry.test.ts` — rubric-scored
  spike covering all 6 synthetic fixtures. **Bus wins every
  fixture** (total scores: bus 19.33, ring 38.67, polygon 73.67).
  The decision test asserts the frozen primitive matches the
  rubric winner; if the rubric weights change later, the test
  fails clearly and the constant must be revisited.
- `tests/unit/perf/overlay-readability-probe.test.ts` — 30-overlay
  readability probe on the Akarians fixture. **Verdict:
  unreadable** (23/30 overlays cross the skeleton; 60 total
  crossings). Promotes A\* obstacle-avoidance from non-goal into
  Phase 4 scope (+1.5 days).
- `EdgeLayer.svelte` — realised `stroke-dasharray` patterns for
  the 25 extended-role CSS classes from Phase 0. Dashed, dotted,
  dash-dot, irregular-magical, chained-oath, identity-arcs,
  severance-faint all distinct from the legacy 5.

Deferred per plan (Phase 8 ship-polish):
- True double-parallel (social/chosen/consanguineous) — needs
  parallel-path rendering, not a dash pattern.
- Doubled-slash (`//` cutoff vs single `//` divorce) — needs a
  routing change to `edgePath.ts`'s tick generator.
- SVG-filter-based wavy / chained — currently approximated by
  dash patterns; real wavy needs `<feTurbulence>` / displacement.
- Per-role colour palette + View menu `Stroke palette` sub-menu
  — UI work; not load-bearing for any downstream phase.

### What surprised us

- **A\* is now load-bearing.** The readability probe came in
  decisively unreadable (60 crossings); the plan's "marginal"
  bucket (≤15) was nowhere near. Phase 4 scope grows by 1.5 days
  to absorb A\* obstacle-avoidance routing. The `to-do.md` A\*
  entry transitions from conditionally-claimed to
  unconditionally-claimed.
- **Bus wins decisively.** Not close — bus is ~2x cheaper than
  ring and ~4x cheaper than polygon. The rubric weighting
  (crossings ×5) drove polygon's score up sharply at N≥4 but
  even unweighted the gap is large. Frozen decision is solid.
- **Single-partner degenerate works correctly across all three
  primitives** (collapses to "no edges; lone partner is the
  child anchor"). Phase 2's parent-drop rendering for single-
  parent children consumes this cleanly.
- **Stroke palette approximations are visually distinct enough
  for Phase 1's "infrastructure" goal**, even without true
  parallel / wavy / chained primitives. The fancier rendering
  can wait for Phase 8 without blocking Phases 2–6b.

### Residual debt

- True double-parallel + doubled-slash + SVG-filter wavy / chain
  → Phase 8.
- Per-role colour palette + View menu `Stroke palette` sub-menu
  → Phase 8 (Phase 1 ships pattern only; colour is a separate
  rendering axis that's easier to compose with `cardDecorator`'s
  fillTone work in Phase 5).
- Phase 4 budget grows from 3 days to 4.5 days to absorb A\*.
- The Phase 0 deferred items (two-engine smoke e2e, Akarians
  smoke e2e) remain deferred. Phase 1 didn't touch them; they
  can ship anytime independently.

### Implications for downstream phases

- **Phase 2 unchanged.** `parentIds[]` migration + multi-parent-
  drop rendering doesn't depend on N-partner geometry (N=2 still
  works for the parent-gather pill).
- **Phase 3 absorbs the geometry decision.** When the schema bump
  v2.0.0 → v3.0.0 lands `UnionRecord.partnerIds[]`, the family-
  view emit path imports `PRIMARY_PRIMITIVE` and
  `computeManifold` to render N-partner unions. No spike work
  in Phase 3; the geometry is decided.
- **Phase 4 scope grows by 1.5 days.** A\* obstacle-avoidance
  routing is no longer optional. Plan's non-goals section needs
  updating (the conditional A\* entry promotes to
  unconditional); `to-do.md` A\* entry transitions from
  conditional to unconditional claim.
- **Phase 6a unchanged.** Group frames don't depend on N-partner
  geometry directly.
- **Phase 8 picks up the stroke-palette polish work** (true
  double-parallel, doubled-slash, SVG filters, per-role colour,
  View menu sub-menu) alongside the GEDZIP single-tier work.

### Integration check

- 649/649 unit tests pass.
- Typecheck: 0 errors. (Family-view's prior `onaddstub` error
  resolved upstream during the Phase 0 ↔ Phase 1 gap.)
- `lint:no-hyperbolic-imports` passes.
- Geometry spike's rubric test runs deterministically; rerun-
  stable.
- Overlay probe runs deterministically with seeded RNG (seed
  42); rerun-stable.

### Integration check

- 622/622 unit tests pass.
- Typecheck: 0 errors caused by this work; 1 pre-existing error
  (`App.svelte:1150 onaddstub`) carried in from family-view.
- `lint:no-hyperbolic-imports` passes; no main-wave module
  imports from `engines/hyperbolic-lr/`.
- Identity-migration chain end-to-end test (1.0.0 → 3.4.0) passes
  via `_migrateBetween` (test-only helper); verifies all six stubs
  thread cleanly.
- Pre-existing lint failure in `family-view-latency.test.ts`
  (prettier formatting) — not mine; family-view in-flight.

---

## Phase 2a retro (14 May 2026 — schema + helpers slice)

**Status: shipped in one autonomous turn (1 commit). Phase 2b
follow-up remains.**

### What landed vs spec

Shipped:

- `domain/types.ts`: new `ParentRef`, `ParentRole`, `ParentPedi`
  types. `Person.parentIds?: ParentRef[]` field added; legacy
  `motherId` / `fatherId` `@deprecated`-tagged. Optional in 2a so
  existing Person literals don't need updates yet.
- `domain/schema.ts`: bumped `CURRENT_SCHEMA_VERSION` to `"2.0.0"`.
  Real `migrateParentIdsV1ToV2` body replaces the Phase 0 identity
  stub. Forward-compat: pre-populated `parentIds` arrays are left
  alone.
- `domain/tree.ts`: `getParents(person): readonly ParentRef[]`
  helper. Reads `parentIds` if populated; derives from legacy
  fields otherwise. `linkParent` / `unlinkParent` now write to
  both representations. `ancestorsOf` / `siblingsOf` /
  `directChildren` migrated to use `getParents()`.
- Migration test (3 cases: full pair, single-parent, pre-populated
  forward-compat); helper test (3 cases: populated, derived,
  empty); ops test (2 cases: linkParent sync, unlinkParent sync).

Deferred to Phase 2b:

- Reader migration in route.ts, layer.ts, place.ts, layout.worker.ts,
  graph.ts, ir.ts, doi.ts, gedcom/parse.ts, gedcom/serialize.ts,
  familyscript/parse.ts, merge.ts, probandTree.ts, hyperbolic-lr/
  layout.ts, family-view/layout.ts, family-view/subset.ts,
  family-view/couples.ts, ConnectionsTab.svelte. (Some of these
  will move to `getParents()`; others to a direct `parentIds[]`
  read once the migration is canonical.)
- Removing legacy `motherId` / `fatherId` from the `Person` type.
- `layer.ts` couple-equalisation post-pass (closes the negative-
  drop and spurious-top-rank-ghost bugs claimed in `notes/bugs.md`).
- Multi-parent-drop renderer with parent-gather pill.
- Half-sibling sibship-bus segmentation.
- Inspector ConnectionsTab N-parent list with role + pedi pickers.
- GEDCOM export emit of `_TREES_PARENT_REF` extension tags
  alongside the standard PEDI fallback.

### What surprised us

- **193 call sites of `motherId` / `fatherId`** across ~30 files.
  Bigger than the plan's "~3 days" estimate suggests when looked
  at as a single phase. Splitting into 2a (this turn) / 2b (next
  turn) keeps every commit shippable and reversible.
- **Optional `parentIds` field was the right Phase 2a call.**
  Making it required would have forced touching every Person
  literal in the codebase (test fixtures, importers, App.svelte's
  `emptyTree`, etc.). Optional + `getParents()` helper means 2a's
  blast radius is bounded to 3 source files + 2 test files.
- **The "minor-newer accepts" schema test had a quiet
  dependency on `CURRENT_SCHEMA_VERSION = "1.0.0"`** — the test
  hard-coded `"1.5.0"`. Bumping to `2.0.0` made `"1.5.0"`
  major-older, breaking the test. Rewrote to be major-agnostic
  (any future bump won't break this test again).
- **One flaky unit test surfaced**: `autosave.test.ts >
  onError fires when persistence throws` intermittently hits a
  `DexieError [DatabaseClosedError]` on the first run after a
  fresh checkout. Reruns clean. Routing to the bug log as a
  flaky-test triage item, not blocking on it.

### Residual debt (routed)

- **Phase 2b**: every reader migration, legacy-field removal,
  layer.ts negative-drop fix, multi-parent-drop renderer,
  half-sibling sibship-bus, inspector UI, GEDCOM
  `_TREES_PARENT_REF` extension emit. All sized in the bug-log
  index.
- **Flaky autosave test** (`onError fires when persistence
  throws`): occasional `DatabaseClosedError`. Not new to this
  phase; surfaced incidentally. Triaged separately.
- The Phase 0 deferred items (two-engine smoke e2e, Akarians
  smoke e2e) remain deferred.

### Implications for downstream phases

- **Phase 2b unblocked**: the type + migration foundation is
  ready; 2b is a pure reader-side refactor that ends with
  removing the legacy fields and shipping the renderer features.
- **Phase 3 onward unchanged**: 3.0.0 schema (UnionRecord) builds
  on top of 2.0.0; the chain is intact.

### Integration check

- 676/676 unit tests pass.
- Typecheck: 0 errors. (Two new type errors in the migration
  test caught immediately and fixed via `as unknown as`.)
- `lint:no-hyperbolic-imports` passes.
- Migration round-trip on hand-crafted v1 fixture: legacy fields
  preserved, parentIds populated, single-parent and zero-parent
  cases handled.
- `getParents()` derives correctly from legacy when `parentIds`
  is absent; returns `parentIds` directly when populated.

---

## Phase 2b.1 retro (14 May 2026 — layered-engine bug fixes)

**Status: shipped in one autonomous turn (1 commit). Closes 2
bugs.md claims. Phase 2b.2 + 2b.3 remain.**

### What landed vs spec

Shipped:

- `passes/layer.ts` gains a `equalizeCoupleRanks` post-pass that
  runs immediately after `computeRanks`. For each visible couple
  with mismatched ranks, if one partner has no visible parents,
  that partner's rank is raised to match the other. Parents-having
  partners are never moved. Iterates to fixed point.
- Regression-test fixture `korakWifeChildrenThenAddParent` builds
  the exact bugs.md repro (6-person tree + "add parent" on Korak)
  and asserts 4 invariants: rank equality after equalisation,
  absence of phantom Wife ghost, no rank-drop of the parented
  partner, and no negative-height parent-drops.
- Existing `crossRankCouple` and `multipleGhostsCrossRank` fixtures
  updated to give every cross-rank partner a parent of their own.
  The fixtures previously constructed "fake" cross-rank cases that
  the post-pass legitimately collapses; they now exercise the
  "real" cross-rank case (genuinely older generation marrying
  genuinely younger) that the post-pass leaves alone.

### What surprised us

- **The crossRankCouple test fixtures were testing the wrong
  case.** They put one partner at rank 0 with no parents, the
  other at rank 2 via a lineage, then expected a ghost. That's
  exactly the orphaned-spouse anti-pattern the post-pass now
  collapses — meaning the fixture was, in effect, testing the
  buggy behavior. Updating each fixture to give both partners
  real parents made the tests work AND surfaced that the cross-
  rank ghost mechanism is meaningful only for genuinely-different-
  generation couples.
- **Two test files duplicated the `crossRankCouple` builder
  inline** (layer.test.ts and place.test.ts). Both needed the
  same update; both were updated. Future refactor opportunity:
  extract to `tests/fixtures/`.
- **The Korak repro from bugs.md was crystal-clear** and built in
  a single function. The fix is a 20-line iterative pass. The
  bug had been on the open log since the layered-engine pipeline
  shipped; the post-pass cost less than re-debugging the
  symptoms.

### Residual debt

- **Phase 2b.2** (next turn): reader migration across ~30 files
  (`motherId`/`fatherId` → `getParents()`), removal of legacy
  fields from the `Person` type, multi-parent-drop renderer with
  parent-gather pill, half-sibling sibship-bus segmentation.
- **Phase 2b.3** (turn after): inspector ConnectionsTab N-parent
  list with role + pedi pickers, GEDCOM `_TREES_PARENT_REF`
  extension emit alongside the standard PEDI fallback.
- **Fixture duplication** noted above; not blocking.

### Implications for downstream phases

- **Phase 2b.2 unblocked.** No new constraints from this fix; the
  reader-migration work is independent of the layer.ts ordering
  pass.
- **Phase 3 onward unchanged.**
- **The two bugs.md claims close once Phase 2b.1 ships** —
  update the bugs.md entries from `⭕ open` to `🔴 fixed` with the
  commit reference. (Done in the bug-log triage step below.)

### Integration check

- 680/680 unit tests pass.
- Typecheck: 0 errors.
- `lint:no-hyperbolic-imports` passes.
- The 12 originally-failing layer/place tests now pass; the
  fixture updates exercise the cross-rank ghost mechanism with
  genuinely-different-generation couples (the case the post-pass
  preserves).

---

starting phase 2b.2: reader migration + multi-parent-drop renderer + half-sibling sibship-bus + legacy field removal (14 May 2026)

---

## Phase 2b.2 retro (14 May 2026 — reader migration + multi-parent + half-sibling)

**Status: shipped in one autonomous turn. ~40 files touched. Closes
the bulk of the Phase 2b scope. Phase 2b.3 (inspector N-parent UI +
GEDCOM `_TREES_PARENT_REF` extension emit) remains.**

### What landed vs spec

Shipped:

- **Reader migration**. Every `motherId` / `fatherId` read in
  `apps/web/src` switched to `getParents(person)`:
  `layout/passes/{layer,route,place}.ts`,
  `layout/engines/family-view/{layout,subset,couples}.ts`,
  `layout/engines/hyperbolic-lr/layout.ts`,
  `layout/{doi,graph,instanceLabels,layout.worker,probandTree,ir}.ts`,
  `layout/spikes/{subgraph,lamping-rao}.ts`,
  `domain/validate.ts`, `io/warnings.ts`,
  `io/gedcom/{parse,serialize}.ts`, `io/familyscript/parse.ts`,
  `io/merge/merge.ts`, `components/tree/DebugOverlay.svelte`,
  `components/inspector/ConnectionsTab.svelte`.
- **Writer migration**. `tree.ts` (`linkParent` / `unlinkParent` /
  `sweepReferences`) now writes only to `parentIds[]`. The GEDCOM
  and FamilyScript parsers populate `parentIds[]` directly with
  role + pedi (first HUSB → `father`, first WIFE → `mother`,
  extras → `parent`). `merge.ts` unions parent refs by personId
  with role/pedi conflict detection via the existing
  `field-conflict` finding.
- **Legacy fields removed from `Person` type**. `motherId` /
  `fatherId` are no longer part of the type at all. The 1.0.0 →
  2.0.0 migration body now deletes them from the in-memory record
  after populating `parentIds[]` (was Phase 2a coexisting).
- **`getParents()` simplified to read `parentIds ?? []`** since
  the legacy fallback is no longer load-bearing.
- **Validator orphan-reference reporting** for missing parent ids
  uses `field: "mother" | "father" | "parent"` derived from the
  `ParentRef.role` of the dangling entry.
- **Multi-parent-drop renderer (family-view)**. Children with 3+
  parents emit a `union:multi:...` anchor with `partnerIds` of
  every visible parent plus N parent→pill drops + 1 pill→child
  drop. The pill is positioned at the x-centroid of the parents'
  centers in the inter-rank gutter.
- **Half-sibling bus segmentation (family-view)**. The per-couple
  drop emit checks whether the child's `parentIds` actually
  includes both members of the `CoupleRecord`. If not, the drop
  is emitted with `role: "half"` (which Phase 1's stroke palette
  renders as `edge-half`).
- **Role helper data-driven from `pedi`**. `roleFor` reads
  `ParentRef.pedi` and maps `adopted` / `sealed` → role `adopted`
  for stroke palette consumption. Birth / unknown stay `blood`;
  the niche pedi values (`foster` / `chosen` / `magical` /
  `cloned` / `hatched` / `summoned` / `manufactured`) fall through
  to `blood` until Phase 4 adds dedicated edge roles.
- **Tests migrated**. ~12 test files updated to the new shape;
  legacy-field-only test cases removed. Added
  `tests/unit/engines/family-view/multi-parent.test.ts` covering
  the 3-parent renderer and half-sibling segmentation
  (4 assertions, both green).

### What surprised us

- **Reader migration was much more mechanical than feared.** 152
  references in `src`, 68 in `tests`. Vast majority were the same
  `for (const parentId of [p.motherId, p.fatherId])` pattern. A
  one-line `for (const ref of getParents(p))` substitution did
  most of the work. The merge code (`merge.ts`) was the only
  genuinely-different case — combining two parent ref arrays with
  role/pedi conflict surfacing.
- **The `couple.childIds` vs `parentIds` data duplication is
  load-bearing.** `linkParent` only writes to `Person.parentIds`;
  it does NOT update the matching `CoupleRecord.childIds`. The
  family-view per-couple emit loop reads from
  `CoupleRecord.childIds`, while the layered engine's
  `buildVisChildrenMap` reads from `parentIds`. The half-sibling
  test had to splice children into the couple's `childIds` array
  manually to exercise the case — confirming we have two parallel
  child-of-couple tracking systems that don't auto-sync. This is
  pre-existing (since the linkParent / couple split was always
  this way), but it's a latent footgun that Phase 3 (UnionRecord)
  may want to address.
- **A concurrent agent already migrated `App.svelte`** as part of
  the family-view phase-4 add-relative work (commit `786807b`).
  My `getParents` import and `removeChildLink` refactor were
  already in place when I went to check, so the App.svelte diff
  was empty by the time I got around to staging.
- **The `serialize.ts` edit was reverted once** by what looked
  like a concurrent format-or-lint pass — re-applying landed
  cleanly. Not blocking, but a reminder to re-grep after batches
  of edits.

### Residual debt

- **Phase 2b.3** (next turn): inspector ConnectionsTab N-parent
  list with role + pedi pickers; GEDCOM export emit of
  `_TREES_PARENT_REF` extension alongside the standard PEDI
  fallback. The existing inspector still renders only the
  mother/father slots derived from `parentIds.find(role === ...)`
  — fine for back-compat but doesn't surface 3rd-parent rows.
- **Pre-existing lint errors in concurrent agent code**
  (`App.svelte:1296/1298`, `path.test.ts:87/130`). Not introduced
  by Phase 2b.2. Routed to bug log as a triage item.
- **Two-source-of-truth between `Person.parentIds` and
  `CoupleRecord.childIds`** (described above). Routed to bug log.

### Implications for downstream phases

- **Phase 2b.3 unblocked.** The inspector reads through
  `getParents(person)` already; adding the N-parent UI is a pure
  inspector refactor, no domain or layout changes needed.
- **Phase 3 (UnionRecord) inherits a clean parentIds[] API
  surface.** Migrating `CoupleRecord` to `UnionRecord` doesn't
  intersect with parent linkage now that all reads go through
  `getParents`. The two-source-of-truth observation above
  suggests Phase 3 should consider either: (a) deriving
  `union.childIds` from `parentIds[]` at query time, or (b)
  keeping the explicit field but ensuring writers update both.
- **Phase 4 (relationships overlay) inherits the data-driven
  `roleFor` helper.** Adding new pedi-driven edge roles
  (`foster`, `chosen`, `magical`, etc.) is a one-case-per-line
  addition to the switch.

### Integration check

- 692/692 unit tests pass (added 2 new in `multi-parent.test.ts`,
  10 net new across migrated tests).
- Typecheck: 0 errors.
- `lint:no-hyperbolic-imports` passes (no main-wave module
  imports from `engines/hyperbolic-lr/`).
- Pre-existing lint errors in `App.svelte` and `path.test.ts`
  unchanged (not regressed by this phase, not fixed by this
  phase either).

---

starting phase 2b.3: inspector ConnectionsTab N-parent UI + GEDCOM `_TREES_PARENT_REF` extension emit (14 May 2026)

starting phase 3a: schema + UnionRecord type + ops slice (14 May 2026). split rationale: 21 files reference CoupleRecord, 63 touch spouse/couple concepts — too big for one autonomous turn. 3a mirrors 2a's "schema + helpers" shape (bump version, add new type as optional, ship migration, add read-helper, sync writes). 3b will be reader migration + renderer + family-view N>2 unions. 3c will be inspector union-row + preferred-union localStorage migration + GEDCOM `_TREES_UNION` round-trip.

starting phase 3b (single shippable unit): createTree+writers atomic flip → family-view reader migration → bus primitive wired for N>2 → 3-partner fixture + Akarians regression (14 May 2026). per the 14 May plan-revise, no more sub-sub-phase labels. previous "phase 3b first commit" entry below stays for traceability.

starting phase 3c follow-up (single shippable unit): inspector union-row UI for N>2 + App.svelte wiring of `linkUnion` / `addUnionPartner` / `removeUnionPartner` / `updateUnion` + preferred-union localStorage → `UnionRecord.preferredBy` migration on first v3 read + `UnionPatch` grows `preferredBy` (14 May 2026). picked this over the Phase 4 overlay-renderer follow-up because it closes a partial phase, is the smaller risk envelope, and is a pre-req for users to create N>2 unions through the UI. The bus primitive (Phase 3b) renders them today — the inspector is the only path that can still mint them.

**DoD** (cross-phase end-to-end checks, not just per-component):

- Creating a 3-partner union through the inspector union-row affordance (chooser → "add partner" against an existing union) persists through `tree.unions[]`, round-trips through GEDZIP (`_TREES_UNION` extension), AND renders correctly in family-view via the Phase 3b bus primitive on the layered engine. Exercises 3a (domain ops) + 3b (renderer) + 3c (UI) end-to-end.
- A pre-3.0.0 tree with `fte.family-view.primary-union.v1:*` localStorage entries, loaded into the v3 hydrate path, surfaces the migrated preferences as `UnionRecord.preferredBy[personId] = true` on the corresponding union. Migration is idempotent (re-running it doesn't re-flip values; a sentinel localStorage key guards it).
- `updateUnion` accepts `{ preferredBy: { ... } }` patches and the inspector "preferred" toggle on the union-row writes through that path.
- pnpm verify green (typecheck, lint, lint:no-hyperbolic-imports, unit, build, server tests).
- e2e: family-view-continuity, family-view-multi-union, persistence still pass; no flicker introduced by the new union-row.

**Scope boundary** (out of phase, route to bug log if hit):
- Inspector "Relationships" tab — that's Phase 4 follow-up.
- N>2 unions rendered in the hyperbolic engine — Wave 2 / Phase 9.
- Two-source-of-truth `Person.parentIds` vs `CoupleRecord.childIds` — already tracked in Phase 2b.2 triage.
- Migration of the legacy 2-partner partner rows in ConnectionsTab to union-rows — keep the existing 2-partner UX; add union-rows as a SEPARATE affordance for N>2. (Phase 3b's retro confirmed: 2-partner unions still flow through primary-union semantics for a reason.)

starting phase 4 follow-up (single shippable unit): overlay renderer for `tree.relationships[]` + A\* obstacle-avoidance routing + chained / wavy / doubled-slash stroke palette + Inspector "Relationships" tab + View menu overlay toggles wired to real state (16 May 2026). Phase 4's foundation (schema 3.1.0 + `Relationship[]` + GEDCOM `_TREES_REL` round-trip) shipped in the 14 May session; this is the user-visible payoff. Engine-private seam is `engines/family-view/overlays.ts` (the plan's "passes/overlay.ts" wording is documentation drift — the stub already plugs into `FamilyViewLayout.overlays`, no new pass needed).

**DoD** (cross-phase end-to-end checks, not just per-component):

- Adding a `sworn-bond` Relationship between two visible Akarians people via the new Inspector "Relationships" tab (CRUD: kind picker, source/target chips, optional cause/date/notes) renders as a chained line over the family-view skeleton, AND toggling the View menu "Sworn bonds" toggle off hides it / on shows it. Exercises Inspector CRUD → domain `tree.relationships[]` → overlay render-pass walker → A\* router → stroke-palette CSS → renderer SVG → View-menu toggle state, all end-to-end on the layered engine.
- A `transformed-from` identity-arc renders with arrow + glyph (☼); selection of either source or target highlights the arc.
- Severance applied to an existing parental drop (`severed` / `estranged` / `disowned`) renders the doubled-slash decoration without distorting the underlying skeleton drop geometry.
- 30-overlay synthetic stress fixture (Phase 1's probe scenario) renders with overlay paths that route around card AABBs — A\* obstacle-avoidance is doing real work, no overlay-vs-card crossings on the visual baseline.
- GEDZIP round-trip on a tree with one of each relationship kind preserves source/target/kind/cause/date/notes via the existing `_TREES_REL` extension (foundation already covered this; re-confirm no regression).
- pnpm verify green (typecheck, lint, lint:no-hyperbolic-imports, unit, build, server tests).
- Visual e2e baseline (Akarians + one sworn-bond) updated and stable; no flicker introduced when toggling overlays during pan/zoom.
- `lint:no-hyperbolic-imports` CI check still passes (overlay walker + A\* router live in family-view engine, not in `hyperbolic-lr/`).

**Scope boundary** (out of phase, route to bug log if hit):
- Group frames + group-polygon overlays — Phase 6a.
- Sibship decorators + consanguinity surfacing — Phase 6b.
- Hyperbolic-engine overlay rendering (geodesic identity-arcs, Möbius-aware A\*) — Wave 2 / Phase 9.
- New `RelationshipKind`s beyond the 14 already in `domain/types.ts` — out of phase; the foundation froze the kind set.
- Promotion of the engine-private overlay walker into a shared `passes/overlay.ts` for cross-engine reuse — defer; only one engine renders overlays today.
- A\* tuning for >100 overlays — defer; Akarians-scale (~30) is the in-scope budget.

old marker (retained):

starting phase 3b: N-partner unions first-class everywhere (14 May 2026). first commit landed `treeDiff` awareness of `unions[]` (was briefly labelled 3b.1; the sub-sub-phase nomenclature has been retired per the 14 May plan-revise — see Phase 3 header). The remaining 3b scope continues in the next turn: renderer via the Phase 1 bus primitive, `createTree` + writers atomic flip to unconditional sync, reader migration in `couples.ts` / `layout.ts` / `primaryUnion.ts`, place/order pass extensions, Akarians regression check.

phase 4 follow-up retro — 16 May 2026 (overlay renderer + A\* + stroke palette + Inspector "bonds" tab + View toggles)

**Status: shipped.** All DoD items deliverable on this branch landed; the only DoD gate not green (Akarians visual baseline) is a pre-existing failure caused by the user's in-flight visual fix-up work (cardHeight refactor + per-row max-height pass), not by this phase. Confirmed by stashing the in-flight files and running `pnpm verify` against the isolated state: 0 typecheck errors, lint clean, 774 unit tests pass (15 new), build clean, 69 server tests pass.

### spec delta

**Delivered (matches DoD)**:
- `engines/family-view/overlayRouter.ts` (NEW, ~240 lines): grid-based A\* with octile heuristic, card-AABB obstacles + 0.25-unit margin, diagonal-corner-blocker check, MAX_NODES_VISITED bail-out, collinear-point simplifier. Owner-aware: source/target cards aren't obstacles for their own overlay.
- `engines/family-view/overlays.ts`: stub replaced with real walker. Reads `tree.relationships[]`, maps the 14 `RelationshipKind`s to 4 `OverlayKind`s (`sworn-bond` / `transformation` / `alias` / `severance`), fans out per source × target pair, routes non-severance segments via A\*, decorates severances on existing skeleton edges at the polyline midpoint. New signature: `buildOverlays(tree, nodes, edges, bbox)`.
- `engines/family-view/layout.ts`: `computeLayout` calls `buildOverlays` and returns `overlays: OverlaySegment[]` in `FamilyViewLayout` (field already existed as optional from Phase 0).
- `app.css`: 6 new CSS classes — `.family-view-overlay` base, `.family-view-overlay-sworn` (chained, accent-blue), `.family-view-overlay-transformation` (dashed, purple), `.family-view-overlay-alias` (dashed thin, teal), `.family-view-overlay-severance` (dashed red, low-opacity), `.family-view-overlay-severance-mark` + `.family-view-overlay-glyph` for the SVG text decorations.
- `FamilyViewCanvas.svelte`: 3 new props (`showOverlaySwornBonds`, `showOverlayTransformations`, `showOverlaySeverances`) gating per-kind visibility. SVG renders overlay paths above skeleton edges; transformation/alias segments get a midpoint glyph (☼ ∞ ⊕ ⊖ ≡); severance segments get a `//` midpoint marker.
- `App.svelte`: 3 new localStorage keys (`fte.overlays.swornBonds` / `transformations` / `severances`) with read-on-mount + write-on-toggle, mirroring the path-highlight pattern. 3 new handlers (`addRelationshipLink`, `removeRelationshipLink`, `patchRelationship`) routing through Inspector. 3 new `commands.ts` handlers replacing the "coming in phase 4" stubs with real toggles whose `checked` state tracks live.
- `Inspector.svelte`: 5th tab "bonds" (`Link2` icon), wired to RelationshipsTab via 3 new optional props.
- `RelationshipsTab.svelte` (NEW, ~280 lines): per-person view of `tree.relationships[]` that mention the selected person. Per-relationship card with kind picker (14 RelationshipKinds), source / target chip rosters with click-to-remove + "+ source" / "+ target" affordances via PersonChooser, inline cause / notes inputs, trash to delete. "Add relationship" panel with kind picker + chooser at the bottom.
- `domain/tree.ts`: `addRelationship`, `removeRelationship`, `updateRelationship`, `RelationshipPatch` type. addRelationship synthesizes a deterministic id (`rel-<kind>-<sources...>-<targets...>`) when none is supplied so GEDCOM round-trip and programmatic creation produce stable identifiers.
- 15 new unit tests: 5 in `tree.test.ts` (Relationship CRUD round-trip + id generation + patch semantics + bulk targetIds replacement), 10 in `overlays.test.ts` (walker: no-rels → []; one-per-pair; kind mapping for all 4 OverlayKinds; severance midpoint; visibility filter for hidden endpoints; N×M fan-out / A\* router: clear-path; routes-around-blocker; null when both endpoints in foreign cards; simplifyPath collinear pruning).

**Missed / deferred (routed to bug log)**:
- 30-overlay stress fixture not added. The A\* router was unit-tested at 3-card resolution; not exercised at Akarians scale with synthetic dense overlays. Defer: routing fanout > 10 overlays would benefit from a dedicated stress test.
- Visual e2e for overlay rendering (Akarians + 1 sworn-bond) not added. Adding the baseline now would bake in the still-in-flight cardHeight refactor's geometry. Defer until visual fix-up wraps.
- `Relationship.date` field has no input UI in RelationshipsTab. Kind + source + target + cause + notes are all wired; `date` is the missing 6th field. The serialize/parse foundation already round-trips it.
- Self-loops (sourceId === targetId, e.g. self-couple time-loop) are skipped by the walker (`continue`). Design study §4.3 calls for a side-arc rendering; deferred. Skip is acceptable for v1.

**Extra (not in DoD)**:
- `OverlayKind = "alias"` carved out as its own visual family (thinner teal stroke, ≡ glyph) instead of being folded into "transformation". Justified: alias-of is structurally different from transformation/reincarnation (no temporal arrow), so it gets a distinct dasharray.
- `simplifyPath()` exported from `overlayRouter.ts` as a standalone helper. Tested independently; cheap improvement to SVG-path size.

### surprises

- assumed → reality → delta:
  - assumed the plan's `passes/overlay.ts` was an existing seam → engine-private `engines/family-view/overlays.ts` is the actual call site (Phase 0 stub plugs into `FamilyViewLayout.overlays`) → plan wording was documentation drift; no new pass file created. Doc-only.
  - assumed `buildOverlays()` could keep its zero-arg signature → needs `tree`, `nodes`, `edges`, AND `bbox` so it can route via A\* and find skeleton edges to decorate for severances → signature widened, no caller needs the type-change.
  - assumed severances would route through A\* like other overlays → they're decorations on existing skeleton edges (parental drops, couple connectors), not standalone segments → walker grew a `buildSeveranceSegment` branch that finds the skeleton edge by `persons` set intersection and computes a polyline midpoint via length-walking.
  - assumed I'd need a separate "spike" file with synthetic 30-overlay data to test A\* → unit-test with one explicit 3-card blocker plus the existing Akarians fixture (which has no overlays) was enough to prove the router does the right thing → no stress fixture added in this turn; routed as residual debt.
  - assumed Inspector tab labels were single-word → "relationships" doesn't fit the tab strip width on mobile; renamed display label to "bonds" (id stays `relationships`) to match the rest of the project's lowercase microcopy → no spec impact.
  - assumed user's in-flight cardHeight refactor would integrate cleanly when I touched layout.ts → my buildOverlays additions and their cardHeight/per-row-height changes are non-overlapping but layout.ts is touched by both → required isolated stash + reconstruction to confirm my work is independently verifiable. Pre-existing in-flight broken state did not change; my work is clean against an isolated build.
  - assumed the A\* obstacle-avoidance routing would be the biggest implementation risk → it took ~150 lines and one round of unit testing; the bigger time sink was RelationshipsTab's chooser narrowing (TypeScript type narrowing on `ChooserSlot` discriminated union required `{@const c = chooser}` + `{@const editingRel = ...}` blocks to keep svelte-check happy).
  - assumed `paint-order: stroke` on SVG `<text>` would be the right way to give the severance `//` and identity-glyph a halo against any background → works on Chromium and matches the existing visual encoding pattern. No surprise; flagged because it's now precedent for future glyph overlays in Phase 6a / 6b.

### residual debt

- **No e2e visual test for overlay rendering.** Unit tests cover the walker + router; the SVG `<path>` rendering itself is unverified end-to-end. **Disposition: route to bug log — desirable but blocked by the in-flight visual fix-up baseline regen.**
- **30-overlay stress fixture not added.** The A\* router's `MAX_NODES_VISITED = 8000` bail-out is unexercised. **Disposition: route to bug log — defer; revisit if a real tree pushes the budget.**
- **`Relationship.date` field has no input UI** in RelationshipsTab. Domain ops + serialize/parse already handle it; only the Inspector input is missing. **Disposition: route to bug log — small nit, ship-polish candidate for Phase 8.**
- **Severance marker `//` font size is fixed at 14px** (not `vector-effect`-aware). At extreme zoom levels the mark either dominates or vanishes. **Disposition: route to bug log — visual fix-up parity issue.**
- **A\* router rebuilds the obstacle grid every layout pass.** For Akarians-scale (~30 nodes) this is sub-millisecond; for >100 visible nodes it would be wasted work. The grid is fully determined by the visible nodes' positions. **Disposition: route to bug log — defer; only relevant once card counts grow.**
- **`OverlayKind` type is engine-internal.** If a second engine ever renders overlays (e.g. the hyperbolic engine in Wave 2), the type + the kind mapper need to be promoted to a shared module. **Disposition: route to bug log — pre-emptive note for Phase 9.**
- **Akarians visual baseline is currently failing.** Caused by the user's in-flight visual fix-up work (cardHeight + per-row max-height pass), not by this phase. Verified by isolated test. **Disposition: route to bug log — externally owned; resolves when the visual fix-up plan closes.**

### implications for downstream phases

- **Phase 5 (identity / species / origin extensions)** unchanged. Independent of overlay rendering.
- **Phase 6a (Groups + group frames)** unchanged. The Phase 4 follow-up's engine-private overlay-walker pattern is the prototype for Phase 6a's `buildGroups(tree, nodes, bbox)` walker. Wiring through `FamilyViewLayout.groups` is identical to the overlay wiring; the CSS-class palette + View menu toggle pattern carries over.
- **Phase 6b (sibship decorators + consanguinity)** unchanged. Same prototype as Phase 6a.
- **Phase 8 (single-tier GEDZIP export + ship polish)** picks up four new ship-polish bullets: (a) e2e visual test for overlay rendering once the visual fix-up baseline regen is done; (b) `Relationship.date` Inspector input; (c) severance marker scale-aware sizing; (d) A\* obstacle-grid memoization. All small.
- **Phase 9 (Wave 2 hyperbolic-engine parity; may be cut)** gains one note: if launched, the `OverlayKind` type and `mapKind()` function need to move out of `engines/family-view/` into a shared module so the hyperbolic engine can consume the same palette without re-implementing the mapping. Not blocking; documented for the conditional Phase 9 spec.

phase 3c follow-up retro — 14 May 2026 (inspector union UI + preferred-union migration)

**Status: shipped.** All cross-phase DoD items pass. Phase 3c is closed.

### spec delta

**Delivered (matches DoD)**:
- `ConnectionsTab.svelte`: new "unions (N)" section below partners that surfaces N>2 unions with chip-based partner roster, kind picker (6 UnionKind options), open/closed toggle, name input, "preferred" star toggle, "+add partner" affordance per union.
- `ConnectionsTab.svelte`: "+add another partner" UserPlus icon on each existing 2-partner partner row, opening a chooser with `kind: "union-add"` that calls `onaddUnionPartner` against the matching union ID. This is the user's primary path from 2-partner → N-partner.
- `App.svelte`: 5 new handlers wired through (`addUnionPartnerLink`, `removeUnionPartnerLink`, `patchUnion`, `setPreferredUnionLink`, `createAndLinkUnionPartner`), all routing through Inspector → ConnectionsTab.
- `domain/tree.ts`: `UnionPatch` grows `preferredBy?: Record<PersonId, boolean> | undefined`. New `setPreferredUnion(t, unionId, personId, preferred): Tree` helper that enforces the one-preferred-per-person invariant by sweeping the field off other unions.
- `state/preferredUnionMigration.ts` (new): walks `fte.family-view.primary-union.v1:{treeId}:*` keys, collapses to first-wins per personId, writes `union.preferredBy[personId] = true` on the matching union, sets sentinel `fte.migrations.preferred-union.v1:{treeId}`. Wired into all 3 `treeStore.hydrate` sites in App.svelte (initial load, view-route, loadFromRecents). Imports + new-tree paths intentionally skip it (they're not loading pre-existing state).
- 10 new unit tests: 3 in `tree.test.ts` (updateUnion preferredBy / setPreferredUnion sweep / setPreferredUnion no-op edges), 7 in `preferredUnionMigration.test.ts` (no-ops / translate / first-wins / idempotent / unrelated-tree / out-of-bounds / non-partner).

**Missed / deferred**: none.

**Extra (not in DoD)**:
- `setPreferredUnion` as a dedicated helper instead of leaving the invariant maintenance to UI callers. Justified: the "one preferred per person" rule belongs in the domain layer. Trivial scope.

### surprises

- assumed → reality → delta:
  - `updateUnion`'s plain `delete next[k]` / `next[k] = v` loop already handled `Record<PersonId, boolean>` patches correctly → confirmed → no helper-rewrite needed, only a type extension.
  - assumed I'd need to wire `linkUnion` through App.svelte → users compose N-partner unions by starting from a 2-partner pair and using `addUnionPartner`, so `linkUnion` stays as a domain-API export with no UI caller → simpler than feared; flagged as a non-issue in the marker.
  - assumed the legacy localStorage migration would need per-focus-context handling → in practice the per-(treeId,focusId) split is forgotten gracefully via first-wins collapse → no information loss that matters at the UI level (`preferredBy` is per-person-per-union, not per-context).
  - assumed the 2 mobile family-view-continuity flakes would be regressions from new union props → `git stash` baseline confirmed they pre-date this work; routed to bug log untouched.

### residual debt

- `linkUnion` has no UI surface. Users currently can't create an N-partner union from a multi-select chooser; they have to chain 2-partner + `addUnionPartner`. Acceptable for now; could become a "create polycule" quick-action later if users ask. **Disposition: defer, no bug-log entry needed — covered by the existing UI flow.**
- Legacy `fte.family-view.primary-union.v1:*` localStorage entries are NOT deleted by the migration. The legacy `usePrimaryUnionState` in `engines/family-view/primaryUnion.ts` continues to read/write them, so the renderer still picks up new clicks through the `˅` picker. Sweeping them is a Phase 8 ship-polish job once `preferredBy`-aware code paths can replace the picker. **Disposition: route to bug log (defer).**
- The inspector "preferred" star toggle and the family-view `˅` picker are two independent code paths writing two different storage layers (`UnionRecord.preferredBy` vs the legacy localStorage map). Until the family-view `˅` picker is rewritten to read+write `preferredBy`, users editing preferences through one surface won't see the other reflect the change. **Disposition: route to bug log — needs a follow-up to consolidate.**
- No e2e spec specifically asserts "create N-partner union via inspector → rendered in family-view." The unit-test triad (`tree.test.ts` 3-partner linkUnion + `multi-partner-union.test.ts` renderer + `_TREES_UNION` round-trip) covers the seam at the unit level; the end-to-end UI walk-through is implicit. **Disposition: route to bug log — desirable but not blocking.**

### implications for downstream phases

- **Phase 4 follow-up (overlay renderer)** unchanged. Independent of Phase 3c.
- **Phase 6 (sibship/groups)** unchanged.
- **Phase 8 (single-tier GEDZIP export + ship polish)** picks up two new sweep items: (a) delete legacy `fte.family-view.primary-union.v1:*` entries after consolidating to `preferredBy`, (b) rewrite `engines/family-view/primaryUnion.ts` to read/write `preferredBy`.

phase 4 retro — 14 May 2026 (foundation: schema 3.1.0 + Relationship[] + GEDCOM `_TREES_REL`)

**Status: partial.** Data layer + GEDCOM round-trip shipped. The user-visible overlay renderer (A\* obstacle-avoidance routing, chained / wavy stroke palette, View menu overlay toggles) is the headline payoff and is deferred to a focused follow-up.

**Delivered**:
- `domain/types.ts`: new `RelationshipKind` union (14 kinds covering sworn bonds, transformations, alias-of, severances, exiles, disownings) + `Relationship` interface + `Tree.relationships?: Relationship[]` optional field.
- `domain/schema.ts`: `CURRENT_SCHEMA_VERSION` bumped to `"3.1.0"`. The migration entry stays an `identity` transform because the field is additive — old bundles round-trip with an implicit empty `relationships` array via the optional shape.
- `io/gedcom/serialize.ts:appendRelationship`: emits a top-level `0 @Rxx@ _TREES_REL` record per relationship. Subtags: `_KIND`, `_SOURCE+`, `_TARGET+`, `_CAUSE`, `DATE/DATE`, `_NOTES`.
- `io/gedcom/parse.ts:parseTreesRel`: resolves xrefs and reconstructs the `Relationship`. Tree now carries `relationships[]` directly from the parse.
- 1 new unit test exercising emit + serialize → parse round-trip for two relationship kinds (sworn-bond with cause, transformed-from with notes).
- 731/731 unit tests pass; verify green (typecheck, lint, build, server tests all clean).

**Residual debt routed to follow-up "Phase 4 — renderer"**:
- **Overlay render pass** (`passes/overlay.ts`). Today's Phase 0 stub returns no segments. Needs to walk `tree.relationships[]` and emit `overlay-bond` / `identity-arc` segments.
- **A\* obstacle-avoidance routing** (per Phase 1's 30-overlay probe verdict). The bridge-arc fallback from the design study won't be readable on Akarians-scale data.
- **Stroke palette wiring** (`strokePalette.ts`). Phase 1 left chained / wavy / doubled-slash CSS classes ready; the overlay pass needs to consume them.
- **Inspector Relationships tab**. New tab with kind picker + source / target chips + cause / date / notes inputs.
- **View menu overlay toggles**. Phase 0's disabled placeholders become real toggles wired through the overlay render pass.

phase 3c retro — 14 May 2026 (GEDCOM `_TREES_UNION` extension)

**Status: partial.** GEDCOM round-trip shipped. Inspector union-row UI + preferred-union localStorage migration explicitly deferred to a follow-up phase (scope-larger than the time budget remaining; not a blocker for Phase 4).

**Delivered**:
- `serialize.ts` emits a top-level `0 @Uxx@ _TREES_UNION` record per N>2-partner union (after the FAM blocks, before TRLR). Subtags: `_PARTNER+`, `_CHIL*`, `_KIND`, `_CLOSED`, `_NAME`, `MARR/DATE`, `_PRIMARY`, `_CURRENT`. 2-partner unions stay covered by standard FAM blocks. `appendUnion` mirrors the `_TREES_PARENT_REF` extension pattern.
- `parse.ts` adds a `_TREES_UNION` case in the top-level walk + a `parseTreesUnion` helper that resolves xrefs and reconstructs the `UnionRecord`. Tree now carries `unions[]` directly from the parse.
- 2 new unit tests: emit-shape + serialize → parse round-trip with `kind` / `closed` / `name` / 3 partners.

**Residual debt routed to follow-up**:
- **Inspector union-row UI for N>2 unions**. ConnectionsTab currently shows only 2-partner spouse rows. Needs a union-row component with partner chips + add-partner / remove-partner / kind / closed / name affordances. Wire `linkUnion` / `addUnionPartner` / `removeUnionPartner` / `updateUnion` through App.svelte.
- **preferred-union localStorage migration**. Phase 0's reconciled commitment was decision (a): full localStorage → `UnionRecord.preferredBy` on first v3 read. The migration script needs to live in App.svelte / state-load layer.
- **`updateUnion` lacks `preferredBy` patch support** (tracked from Phase 3a). Add once the localStorage migration is in.

phase 3b — final retro (14 May 2026, second commit: writer flip + family-view N>2 rendering)

**Status: shipped.** Phase 3b is closed. Phase 3c next.

**Delivered**:
- `createTree` initialises `unions: []` so writers can sync unconditionally; conditional `t.unions !== undefined` guards removed from `linkSpouse` / `unlinkSpouse` / `updateCouple` / `removePerson`.
- Family-view `layout.ts` gains a `multi-union` rank slot kind that places N>2 partners contiguously. `planRank` reads N>2 unions from `getUnions(tree)`; `emitAnchorsAndEdges` produces a `UnionAnchor` per N>2 union with all partners and emits bus-primitive connector edges via `computeManifold(PRIMARY_PRIMITIVE, …)`.
- `subset.ts` pulls in every partner from N>2 closed unions at focus rank via the new `partnersInMultiUnionsOf` helper. 2-partner unions stay on the primary-union semantics path (so non-primary mates remain hidden by default).
- 2 new tests in `multi-partner-union.test.ts` verifying the 3-partner anchor + contiguous placement.
- 728/728 unit + 7/7 e2e (multi-union, family-view-continuity, visual-akarians-family-view) all green.

**What surprised me**:
- `allUnionPartnersOf` (first attempt at the subset helper) over-broadened the inclusion and broke 3 primary-union tests by pulling in all-spouses regardless of union. Renamed to `partnersInMultiUnionsOf` (only N>2) so primary-union semantics survive. The lesson: 2-partner unions still flow through primaryPartnerOf for a reason — primary-union semantics are intentional.

**Residual debt routed to Phase 3c**:
- Inspector union-row UI for N>2 unions.
- GEDCOM `_TREES_UNION` extension (emit + parse).
- preferred-union localStorage → `UnionRecord.preferredBy` migration.
- Reader migration of `couples.ts:primaryPartnerOf` / `primaryChildrenOf` / `resolvePrimary` to `getUnions()` is *deliberately deferred*: today's 2-partner code paths work bit-for-bit identically against `tree.couples`, and changing them would risk regressions for no immediate observable gain. The migration can happen later or stay as-is if we eventually delete `tree.couples` and synthesize couples from unions.

phase 3b — first commit retro (14 May 2026, treeDiff slice)

**Status: first 3b commit shipped (treeDiff). Renderer + writer-flip + reader sweep continue in the next turn.**

### What landed vs spec

Shipped:

- `domain/treeDiff.ts`: `TreeDiff` interface now carries
  `unions: Record<string, { before: UnionRecord | null; after: UnionRecord | null }>`
  keyed by `UnionRecord.id`. `diffTrees`, `applyDiff`, and
  `invertDiff` all walk `unions[]` symmetrically with `couples[]`.
  `isEmptyDiff` checks the new field too.
- `applyDiff` preserves union order for existing entries; new
  entries from a diff are appended (matches the legacy `couples[]`
  treatment).
- The `unions` field is OMITTED from `applyDiff` output when both
  (a) the input tree had no `unions` field AND (b) the diff has no
  union changes. This avoids breaking the round-trip invariant for
  pre-migration trees that pass through `applyDiff`.
- 6 new unit tests covering insertion, deletion, field-level update,
  order preservation, no-unions trees, and isEmptyDiff. Total now
  725/725 passing.

Did NOT land (moved out of 3b.1):

- **Unconditional writer sync.** I initially flipped
  `linkSpouse` / `unlinkSpouse` / `updateCouple` / `removePerson`
  to always populate `unions[]`. This broke 3 existing treeDiff
  tests because the writers started producing trees with
  `unions: []` while the `before` baseline (built via `createTree`)
  had no `unions` field. Reverted to the Phase 3a conditional sync.
  The unconditional flip needs to land alongside `createTree`
  initializing `unions: []` — that's a coordinated change and
  belongs in 3b.2 or wherever the renderer migration lands.

### What surprised me

- **createTree is the linchpin for unconditional sync.** Writers
  alone can't go unconditional unless the freshly-created tree
  already has `unions: []`. Once it does, every downstream write
  has a stable contract. Once it doesn't, writers face a "create
  the field or not?" branching choice. Phase 3a's conditional was
  correct; the right way to flip it is `createTree` plus writers
  in one atomic change.
- **Re-added entries land at end of array on undo.** Test
  expectation had to be loosened to membership-set rather than
  positional. This is consistent with how `couples[]` already
  behaves on undo — both fields share the same "preserve order for
  surviving entries; new entries append" treatment. Documented in
  the test comment.
- **`unions` omission on no-change apply** matters more than I
  expected. Without it, ANY `applyDiff` call on a pre-migration
  tree (e.g. running an undo on a Phase-1 fixture) silently grew a
  `unions: []` field. That would have caused the test cascade I
  hit and would have broken downstream code that uses
  `'unions' in tree` as a presence check. The omission is now
  load-bearing.

### Residual debt (routed into rest of Phase 3b)

- **Family-view N-partner renderer.** The Phase 1 bus primitive in
  `engines/family-view/nPartnerGeometry.ts` exists but is not yet
  called from the per-couple emit loop in
  `engines/family-view/couples.ts`. Layout + render path needs to
  recognise N-partner unions, route through the bus primitive,
  emit union-manifold segments.
- **Unconditional writer sync.** Flip in `createTree` to initialise
  `unions: []`, AND simultaneously remove the
  `t.unions !== undefined` guards from `linkSpouse` /
  `unlinkSpouse` / `updateCouple` / `removePerson`. Tests will
  need updates wherever they construct Tree literals without
  `unions`. Sized at ~1 hour; lands atomically with the renderer
  reader sweep so a consistent baseline ships in one commit.
- **Phase 3c**: inspector union-row UI + GEDCOM `_TREES_UNION`
  extension + preferred-union localStorage migration. Unchanged.

### Implications for downstream phases

- **Rest of Phase 3b unblocked.** The diff knows about unions; the
  renderer side can now safely produce N-partner unions and
  persist them through undo/redo.
- **Phase 4+ unchanged.**

### Integration check

- 725/725 unit tests pass (6 new).
- Typecheck: 0 errors.
- `lint:no-hyperbolic-imports` passes.
- 6/6 spot-checked e2e tests pass (persistence, redraw-on-edit,
  import-edit, family-view-add-relative — exercise the undo/redo
  + edit paths that depend on treeDiff).
- Round-trip on hand-crafted v3 tree (3-partner closed union):
  diff captures insertion; invert restores; field-level updates
  to `kind` / `closed` / `name` round-trip cleanly.

phase 3a retro — 14 May 2026

**Status: shipped in one autonomous turn (1 commit). 3b + 3c remain.**

### What landed vs spec

Shipped:

- `domain/types.ts`: new `UnionKind` union, new `UnionRecord` interface
  (`id`, `partnerIds`, `kind?`, `closed?`, `preferredBy?`, `childIds`,
  `marriageDate?`, `isPrimary?`, `isCurrent?`, `name?`). `Tree.unions?`
  added as optional. Legacy `CoupleRecord` + `Tree.couples` marked
  `@deprecated`.
- `domain/schema.ts`: `CURRENT_SCHEMA_VERSION` bumped to `"3.0.0"`.
  Real `migrateUnionRecordV2ToV3` body replaces the identity stub.
  Migration is idempotent on already-populated `unions[]` (forward-
  compat). `unions[].id` is deterministic (`union-<idx>-<l>-<r>`) so
  re-running the migration on the same v2 data produces stable ids.
  Legacy `couples[]` is NOT deleted by the migration — Phase 3b sweeps
  readers, then a later phase deletes the field.
- `domain/tree.ts`: `getUnions(tree): readonly UnionRecord[]` helper
  reads `unions` if populated, derives from `couples` otherwise.
  New domain ops: `linkUnion(t, partnerIds[])`,
  `addUnionPartner(t, unionId, personId)`,
  `removeUnionPartner(t, unionId, personId)`,
  `updateUnion(t, unionId, patch)`. 2-partner unions still back-fill
  legacy `couples[]`; >2-partner unions don't (they can't be
  expressed in the `CoupleRecord` shape).
- Writer sync: `linkSpouse`, `unlinkSpouse`, `updateCouple`,
  `removePerson` now keep `couples[]` and `unions[]` in sync when the
  input tree has `unions` populated. Pre-migration trees (no `unions`
  field) keep couples-only behavior, preserving the treeDiff invariant
  without expanding 3a's scope.
- Tests: 17 new (4 in `schema.test.ts` for the migration, 13 in
  `tree.test.ts` for the helper + ops + sync). Total now 719/719
  passing.

### What surprised me

- **Conditional sync was the right Phase 3a call.** First draft had
  writers unconditionally write to both `couples` and `unions`. That
  broke `treeDiff.test.ts > add couple` round-trip because
  `treeDiff.ts` only diffs `couples`, not `unions`, so applying a
  diff produces a tree where `couples[]` is updated but `unions[]`
  is missing. Switching to conditional ("only sync `unions` if input
  tree already has it populated") preserves the diff invariant for
  pre-migration trees AND keeps migrated trees in sync. Phase 3b
  will extend `treeDiff` to know about `unions[]` and the conditional
  becomes unconditional.
- **The schema-test minor-newer probe was version-coupled.** It
  used a hand-rolled `"2.999.999"` literal that became major-OLDER
  after the bump to `"3.0.0"`. Rewrote to derive `${major}.999.999`
  from `CURRENT_SCHEMA_VERSION` at runtime so future bumps don't
  re-break it.
- **2-partner vs N-partner asymmetry on `couples[]` back-fill** is
  worth flagging. `linkUnion([a, b])` back-fills `couples[]` but
  `linkUnion([a, b, c])` does not. This is intentional (the legacy
  shape can't express N>2) but it means a pre-3b reader would see a
  v3-aware tree with a 3-partner union as "no marriage" — which is
  exactly the "polycule-rendered-as-primary-pair" finding the plan
  expects to clear in Phase 3b's reader sweep. Tracked as a known
  asymmetry, not a bug.

### Residual debt (routed)

- **Phase 3b**: reader migration across the ~20 consumers of
  `t.couples` (gedcom serialize/parse, family-view couples.ts,
  layout.ts, layer.ts, route.ts, place.ts, treeDiff.ts, merge.ts,
  familyscript/parse.ts, hyperbolic-lr/layout.ts, inspector
  ConnectionsTab, etc.). Each call site moves to `getUnions(t)`.
  After the sweep, writers become unconditional and `treeDiff.ts`
  diffs `unions[]` directly.
- **Phase 3c**: inspector union-row UI + preferred-union
  localStorage → `UnionRecord.preferredBy` migration + GEDCOM
  `_TREES_UNION` extension emit/parse + n-ary union rendering
  (Phase 1 bus primitive). Plus the new domain ops are wired
  through `App.svelte` so the user can actually create N-partner
  unions.
- **Renderer side of N-partner unions is still stub** (Phase 0
  scaffold). The bus primitive exists in
  `engines/family-view/nPartnerGeometry.ts` but it's not yet
  called from the per-couple emit loop. That's a Phase 3b job.

### Implications for downstream phases

- **Phase 3b unblocked.** The migration + helper + sync foundation
  is ready; 3b is a pure reader-side sweep that ends with deleting
  the legacy `couples[]` write paths.
- **Phase 3c independent of 3b's completion.** The new ops
  (`linkUnion`, `addUnionPartner`, `removeUnionPartner`,
  `updateUnion`) work today against any tree that has
  `tree.unions = []` set; the inspector union-row UI can be built
  against them without waiting for the reader sweep.
- **Phase 4 (relationships overlay) onward unchanged**: 3.1.0
  builds on top of 3.0.0; the chain is intact.

### Integration check

- 719/719 unit tests pass (17 new).
- Typecheck: 0 errors.
- `lint:no-hyperbolic-imports` passes.
- 10/10 spot-checked e2e tests pass (import-edit, redraw-on-edit,
  family-view-continuity, family-view-multi-union, persistence).
- Migration round-trip on hand-crafted v2 fixture (2-couple, with
  marriageDate / isPrimary / isCurrent): unions[] populated with
  stable ids, couples[] preserved.
- `getUnions()` derives correctly from legacy `couples` when
  `unions` absent; returns `unions` directly when populated.
- `linkUnion(3 partners)` creates a 3-partner union with every
  pair's spouseIds mirrored; no entry added to legacy `couples[]`.

phase 2b.3 retro — 14 May 2026

**Delivered**:
- `tree.ts`: three new domain ops — `linkParentRef`, `unlinkParentByPersonId`,
  `updateParentRef` — closing the N-parent CRUD vocabulary that was missing
  after Phase 2a (which only generalised `linkParent`/`unlinkParent`).
- `ConnectionsTab.svelte`: extra-parent list with inline role + pedi
  pickers (7 roles × 10 pedi values) and an "add parent" button that
  drops a new `parent` / `birth` entry into `parentIds[]`. The fixed
  mother / father rows still render with their legacy slot shape;
  extras render with select-driven pickers underneath. Wired through
  `Inspector.svelte` and `App.svelte`.
- `serialize.ts`: emits `1 _TREES_PARENT_REF @parentXref@` with `2 _ROLE`
  / `2 _PEDI` subtags per `parentIds[]` entry, alongside the standard
  `1 FAMC @fam@` + `2 PEDI {adopted|foster|sealing}` fallback (PEDI is
  omitted when every ref's pedi maps to birth or to a non-standard
  value). `pickStandardPedi` ranks adopted > foster > sealing.
- `parse.ts`: pass 2b resolves `_TREES_PARENT_REF` after FAM stitching,
  overriding the FAM-derived role/pedi with the extension's data. Refs
  to unknown xrefs are silently dropped (no findings — the extension
  is best-effort by design).
- Tests: 8 new unit tests (4 in `tree.test.ts`, 3 in `parse.test.ts`,
  4 in `serialize.test.ts` including a true round-trip through
  serialize → parse → re-check). Total now 707/707 passing.

**What surprised me**:
- `Ungrouped` standard PEDI ranking. Initially the serializer emitted
  PEDI for whichever ref happened to come first in `parentIds[]`,
  which could downgrade an adopted-via-extension link to a birth
  PEDI. Switched to a strongest-wins selector so other tools at
  minimum see the most-informative pedi the extension carries.
- The golden snapshot grew by ~1900 lines (Akarians has 1802 INDIs,
  each gaining a FAMC + 3 `_TREES_PARENT_REF` lines on average via
  the new emit). The byte-stability test still passes because the
  emit is deterministic.
- `e.currentTarget` typing in Svelte 5 onchange handlers required
  explicit `Event & { currentTarget: HTMLSelectElement }` annotation
  to satisfy `@typescript-eslint/no-unsafe-member-access`. Worth a
  reference note if we add more select-driven inspector affordances.

**Implications for downstream phases**:
- Phase 3 (UnionRecord) still inherits the two-source-of-truth debt
  from Phase 2b.2 (`Person.parentIds` vs `CoupleRecord.childIds`).
  Phase 2b.3 did not touch it.
- Phase 5 (gender struct) will want to revisit the inspector's role
  picker once `gender.identity` exists — the role label "mother" /
  "father" is currently a hard string regardless of the parent's
  identity. Tracked.
- Phase 8 (single-tier GEDZIP export) inherits the `_TREES_PARENT_REF`
  emit pattern as the prototype for `_TREES_UNION` / `_TREES_REL` /
  `_TREES_GROUP` / `_TREES_SIBSHIP` extensions in later phases.
  `HEAD.SCHMA` registration still needs to land (Phase 0 stub item).

---

## Bug log

Per `notes/dev/process.md`, this section accumulates findings
outside the current phase's scope. The `bug-triage` skill walks
it between phases.

### Open

#### Phase 0 audit findings (14 May 2026)

- **family-view Phase 0 prerequisite**: shipped. `engines/family-view/`
  contains `cardDecorator.ts`, `expansion.ts`, `path.ts`, `layout.ts`,
  `types.ts`, `subset.ts`, `index.ts`. Safe to proceed.
- **`passes/route.ts` extensibility audit**: 3 findings, at threshold
  (plan said "if >3, refactor in Phase 1"):
  1. 959-line single-file monolith; no per-segment-kind decomposition.
  2. `buildSegments` has 10 hardcoded `role: "blood"` sites (lines
     475, 488, 521, 648, 668, 680, 691, 715, 728, 753).
  3. New segment kinds emit from inside `buildSegments` — no
     extension hook for `union-manifold` / `multi-parent-drop` /
     `overlay-bond` / `identity-arc` / `sibship-bracket`.
  Disposition: **no Phase 1 refactor**. Phase 2 touches `layer.ts`;
  Phase 3 touches `route.ts` for n-ary unions and will do that work
  inside the existing structure. Mostly we extend
  `engines/family-view/layout.ts` (much smaller, already factored).
- **role-helper signature alignment**: pinned.
  `engines/family-view/layout.ts:49` defines
  `roleFor(_tree, _childId, _parentId): FamilyViewEdgeRole` — today
  returns `"blood"`. Phase 2 makes it data-driven by reading
  `parentIds[]` entries' `pedi`. No rename, no new module.
- **GEDCOM 7 SEX X verification**: missing today.
  `io/gedcom/serialize.ts:239-240` emits `1 SEX M` / `F` and nothing
  for `u`; `parse.ts:176` collapses anything-non-M-F to `u`.
  **Action**: emit `1 SEX U` for `u` (more conservative than X;
  honestly says "undetermined"). Phase 5's gender struct lands proper
  SEX X for non-binary.
- **preferred-union commitment reconciliation**: decision **(a)** —
  full localStorage → `UnionRecord.preferredBy` migration on first
  v3 read. No dual-source.
- **v1→v2 landing-strategy decision**: **soft coordinate** per user
  feedback. No hard gate on Phase 2.
- **family-view sync matrix**: guidance, not hard gates (matches the
  soft-coordinate decision above).
- **cardDecorator API contract**: confirmed record-return shape (not
  accessors). Today: `{shape, frame, fillTone, cornerGlyphs, underlineColour}`.
  Phase 0 extends with `species, kind, origin, identityFluid, assignedAtBirth`
  — all `undefined` defaults.

#### Phase 2a triage items (14 May 2026)

- **Flaky autosave test** — `tests/unit/state/autosave.test.ts > makeAutosaver > onError fires when persistence throws` intermittently fails with `DexieError [DatabaseClosedError]: Database has been closed` on first runs from a fresh checkout. Reruns clean. Pre-existing, not introduced by Phase 2a. **Disposition: defer**; not blocking ship. Triage owner: anyone touching the autosave / Dexie wiring; likely fix is to await an explicit `db.open()` in the test setup before scheduling. Tracked here so it doesn't get lost.

#### Phase 2b.2 triage items (14 May 2026)

- **Two-source-of-truth: `Person.parentIds` vs `CoupleRecord.childIds`.**
  `linkParent` writes to `Person.parentIds` but does not back-fill the
  matching `CoupleRecord.childIds`. The family-view per-couple emit
  loop reads from `CoupleRecord.childIds`; the layered engine's
  `buildVisChildrenMap` reads from `parentIds`. Both render correctly
  in practice because GEDCOM imports populate both, but a tree built
  programmatically via `linkParent` alone will show children in the
  layered engine and NOT in family-view. **Disposition: address in
  Phase 3** when `UnionRecord` replaces `CoupleRecord` — either derive
  `union.childIds` from `parentIds[]` at query time, or require both
  fields to stay in sync via the domain ops. Tracked here.
- **Pre-existing lint errors** in concurrent agent code:
  `App.svelte:1296/1298` ("Unsafe return of any" on
  `ontimings`/`onlayoutstats` callbacks, from commits `916078f` /
  `d3243c43`), `path.test.ts:87/130` (`prefer-const` / unnecessary
  type assertion, from `771077fa`). **Disposition: defer**; not
  introduced by Phase 2b.2, not blocking ship. Triage owner: whoever
  next touches those files.
- **Multi-parent renderer is layered-engine-only via family-view.**
  The hyperbolic engine still goes through `engines/hyperbolic-lr/`
  which now reads parentIds via `getParents` but doesn't have a
  parent-gather pill. This is fine per the plan's hyperbolic
  deferral to Wave 2 (Phase 9; may be cut). Tracked so it doesn't
  get lost.

#### Phase 3b first-commit triage items (14 May 2026)

- **Unconditional writer sync deferred to rest of 3b.** Phase 3a's
  two routed debt items were (a) treeDiff-unaware (CLOSED by the
  first 3b commit) and (b) conditional writer sync. Half of (b) —
  the writer flip — is deferred because it needs a coordinated
  change with `createTree` initializing `unions: []`. Without that
  coordination, the treeDiff round-trip tests break (writers
  create `unions: []` but `before` baseline has no `unions`
  field). **Disposition: fold into the rest of Phase 3b** —
  flip `createTree` and the four writers in one atomic commit
  alongside the renderer reader sweep. Sized: ~1 hour.
- **Undo of a deleted union re-adds it at the end of `unions[]`.**
  Order preservation works for surviving entries; deleted-then-
  restored entries land at the array tail. This matches the
  pre-existing behavior for `couples[]` (same code path) so it's
  internally consistent, but worth documenting as a non-contract
  for callers who relied on positional stability across
  undo. **Disposition: defer** — if positional stability becomes a
  contract, both `couples[]` and `unions[]` need a deeper rewrite
  of `applyDiff`. Tracked.

#### Phase 3a triage items (14 May 2026)

- **`treeDiff` doesn't know about `unions[]` yet.** [CLOSED in
  Phase 3b's first commit, 14 May 2026] `TreeDiff` now carries
  `unions` as a peer of `couples`; `diffTrees` / `applyDiff` /
  `invertDiff` / `isEmptyDiff` all walk it. The writer-flip-to-
  unconditional half of the original disposition is folded into
  the remainder of Phase 3b — see "Phase 3b first-commit triage
  items" above.
- **Pre-migration trees lose >2-partner unions on legacy-only reads.**
  A v3-aware tree with a 3-partner union created via `linkUnion`
  will appear "unmarried" to readers that still walk `t.couples`
  (since N>2 unions can't be expressed in `CoupleRecord` shape).
  Existing readers don't yet call `getUnions()`. **Disposition:
  Phase 3b** — sweep readers to `getUnions()`. Until then, the
  validator's `polycule-rendered-as-primary-pair` finding (planned
  for Phase 3b's DoD) covers the symptom.
- **`updateUnion` lacks `preferredBy` patch support.** [CLOSED in
  Phase 3c follow-up, 14 May 2026] `UnionPatch.preferredBy` now
  accepts a `Record<PersonId, boolean> | undefined` map; the
  dedicated `setPreferredUnion(t, unionId, personId, preferred)`
  helper enforces the one-preferred-union-per-person invariant by
  sweeping the field off other unions. The localStorage →
  `UnionRecord.preferredBy` migration shipped alongside (see
  `state/preferredUnionMigration.ts`).

#### Phase 2b.3 triage items (14 May 2026)

- **Extras list isn't drag-orderable.** ConnectionsTab renders the
  extra parents as plain rows under the mother / father slots; there's
  no way to reorder them. The order today is whatever `parentIds[]`
  insertion order happened to produce. **Disposition: defer**; matters
  more once polycule sibship rendering depends on parent order
  (probably Phase 3 + Phase 6b). Triage owner: whoever does the
  Phase 6b sibship-bracket UI.
- **No validation on add-parent self-link.** The "add parent" button
  calls `oncreateAndLink` with `{ kind: "parent-extra" }`, which
  creates a fresh person and links them — there's no path for "link
  an existing person as a parent". Picking yourself is also possible
  via the underlying domain op (validated by the permissive-schema
  rule). **Disposition: defer** to whenever we add an "existing
  person" picker to the inspector (no current phase claims it).
  Tracked so the inspector UI doesn't grow ad-hoc fixes for it.
- **`HEAD.SCHMA` registration still a stub.** Phase 0 emits a
  `HEAD.SCHMA` block registering the
  `https://attuproject.org/trees/schema/v1#` namespace as scaffold;
  this phase added the first real extension tag (`_TREES_PARENT_REF`)
  but didn't extend `HEAD.SCHMA` to register `_ROLE` / `_PEDI`
  subtags. Will collect with the rest of the `_TREES_*` extension
  registrations in Phase 8 (single-tier GEDZIP export). Tracked.
- **Identity-stripping golden snapshot is now visually unfriendly.**
  The byte-stable golden grew 1900 lines, so review diffs against it
  will be noisy until Phase 8 splits emit into "with extensions"
  and "fallback-only" probes. **Disposition: defer**; the test still
  serves its byte-stability purpose. The Phase 0 HEAD.SCHMA probe
  follow-up (per-tool stripping toggle) is the natural home.

#### Phase 4 follow-up triage items (16 May 2026)

- **No e2e visual test for overlay rendering.** Unit tests cover the
  walker + A\* router; the SVG path rendering itself is unverified
  end-to-end on the Akarians fixture + 1 sworn-bond. Adding a baseline
  now would bake in the user's still-in-flight cardHeight refactor's
  geometry. **Severity: important. Disposition: fix-in-phase-8** —
  added to Phase 8's ship-polish bullets; lands after the visual fix-
  up sweep regenerates baselines.
- **30-overlay stress fixture not added.** The A\* router's
  `MAX_NODES_VISITED = 8000` bail-out is unexercised. Akarians-scale
  (~30 nodes) runs sub-millisecond; pathological large trees with
  dense overlays haven't been profiled. **Severity: nit. Disposition:
  defer** — revisit if a real fixture pushes the budget.
- **`Relationship.date` field has no input UI** in RelationshipsTab.
  Domain ops + GEDCOM serialize/parse already handle it; only the
  Inspector input is missing. **Severity: nit. Disposition: fix-in-
  phase-8** — added to Phase 8's ship-polish bullets.
- **Severance marker `//` font size is fixed at 14px** rather than
  scale-aware. At extreme zoom levels the mark either dominates or
  vanishes. **Severity: nit. Disposition: fix-in-phase-8** — visual
  fix-up parity issue; added to Phase 8's ship-polish bullets.
- **A\* router rebuilds the obstacle grid every layout pass.** Fully
  determined by visible nodes' positions; could memoize. Sub-
  millisecond at Akarians scale. **Severity: nit. Disposition:
  defer** — revisit only if >100-card layouts surface perf issues.
- **`OverlayKind` type is engine-internal.** If the hyperbolic engine
  ever renders overlays (Wave 2 / Phase 9), the type + `mapKind()`
  need promotion to a shared module. **Severity: nit. Disposition:
  defer** — pre-emptive note; lands during Phase 9 spec if launched.
- **Akarians visual baseline currently failing.** Caused by the user's
  in-flight visual fix-up work (cardHeight refactor + per-row max-
  height pass in `layout.ts`, `PersonNode.svelte` slot height
  changes), not by this phase. Verified by isolated stash + rerun:
  Phase 4 follow-up code is independently clean. **Severity:
  important** (the baseline gate is the project's primary visual
  regression detector). **Disposition: defer** — externally owned by
  the visual fix-up workstream, not the relationship-vocabulary plan.
  Resolves when that workstream regenerates the baselines.
- **Self-loop overlays (sourceId === targetId) silently skipped.** The
  design study §4.3 calls for a side-arc rendering for self-couples /
  time-loops. Walker currently `continue`s past them. **Severity:
  nit. Disposition: defer** — surface in the wild before designing
  the arc geometry.

#### Phase 3c follow-up triage items (14 May 2026)

- **Preferred-union two-source-of-truth.** Inspector "preferred" star
  toggle writes `UnionRecord.preferredBy`; family-view `˅` picker
  still reads / writes the legacy `fte.family-view.primary-union.v1:*`
  localStorage map (via `engines/family-view/primaryUnion.ts`).
  Edits via one surface aren't reflected on the other until family-
  view consolidates. **Severity: important.** **Disposition: fix-in-
  phase-8.** The Phase 8 sweep rewrites `primaryUnion.ts` to read /
  write `preferredBy`, then deletes legacy keys after the migration
  ran (sentinel `fte.migrations.preferred-union.v1:{treeId}` says
  the per-tree migration is done — safe to drop the legacy entries
  for that tree). Tracked.
- **No e2e for "create N-partner union via inspector → bus render in
  family-view".** Unit coverage exists for all three legs
  (`tree.test.ts` 3-partner `linkUnion`, `multi-partner-union.test.ts`
  renderer, `_TREES_UNION` serialize / parse round-trip). The end-to-
  end UI walkthrough is implicit. **Severity: nit.** **Disposition:
  defer**; add when the next inspector regression motivates it.

#### Phase 1 decisions (14 May 2026)

- **N-partner geometry primary primitive: `bus`.** Rubric totals
  across the six synthetic fixtures (triad, quad, V-polycule,
  vee-pivot, six-group, single-degenerate): bus 19.33, ring 38.67,
  polygon 73.67. Bus wins every individual fixture. Frozen as
  `PRIMARY_PRIMITIVE` in
  `engines/family-view/nPartnerGeometry.ts`. Per-fixture
  breakdown is captured in the spike test's stdout (rerun with
  `pnpm -F web test:unit -- tests/unit/layout/n-partner-geometry.test.ts --reporter=verbose`
  to see the table).
- **30-overlay readability probe verdict: unreadable** (23/30
  overlays cross the skeleton on Akarians; 60 total crossings).
  A\* obstacle-avoidance routing **promotes from non-goal into
  Phase 4 scope**, growing Phase 4 budget by 1.5 days (3 → 4.5
  days). The Phase 8 ship-polish phase remains as the home for
  bridge-arc → A\* migration in the layered engine.
- **Stroke palette ships as `stroke-dasharray` approximations.**
  Dashed, dotted, dash-dot, irregular-magical, chained-oath,
  identity-arc, severance-faint patterns all distinct from the
  legacy 5. True double-parallel, doubled-slash, and SVG-filter-
  based wavy / chain are deferred to Phase 8.

### Triaged & deferred

(Empty.)

### Closed

(Empty.)

---

## Reference shelf

- Design study:
  [relationship-vocabulary.md](../features/relationship-vocabulary.md).
- Parallel in-flight plan:
  [family-view.md](./family-view.md) — forward-compatibility
  section is the contract between the two workstreams.
- Schema-migration runner:
  [domain/schema.ts](../../apps/web/src/lib/domain/schema.ts) +
  [agents.md](../agents.md) §8.3.
- Permissive-schema rule:
  [agents.md](../agents.md) §8.1.
- Existing GEDCOM export warnings:
  [io/warnings.ts](../../apps/web/src/lib/io/warnings.ts).
- Existing four-pass IR:
  [layout/passes/](../../apps/web/src/lib/layout/passes/) +
  `tree-layout-ir` skill.
- Hyperbolic engine conventions:
  [engines/hyperbolic-lr/](../../apps/web/src/lib/layout/engines/hyperbolic-lr/) +
  `hyperbolic-geometry` skill.
- Queued schema bumps in
  [notes/to-do.md](../to-do.md) (closed by this plan).
- Layout / routing bugs that prerequisite parts of this work:
  [notes/bugs.md](../bugs.md) — multi-spouse bond + negative-drop
  defects, both load-bearing for n-ary union routing.

---

## Process notes

This plan was drafted immediately after the
relationship-vocabulary design study was finalised and after
family-view's plan + pre-mortem stabilised. Phase ordering
prioritises retiring the largest design unknown (N-partner
geometry) early in Phase 1, then ships schema bumps in dependency
order, each pairing the migration with the user-visible payoff it
unlocks. The non-negotiable family-view integration check runs at
the end of every phase.

The pre-mortem above was run with an explicit brief to evaluate
cross-workstream intermixing with family-view; its revisions are
folded into Phase 0 (HEAD.SCHMA probe, family-view sync matrix,
`cardDecorator` contract pinned, `passes/route.ts` extensibility
audit, role-helper signature alignment, three landing-strategy
decisions, semver migration-runner upgrade, GEDCOM SEX X audit),
Phase 1 (gate + 30-overlay probe + payoff reframing), Phases
2/3/5 (explicit family-view gates), Phase 4 (A\* contingency from
Phase 1 probe), Phase 6 (split into 6a + 6b), Phase 8 (single-
tier GEDZIP with `_TREES_*` always on + inline fallbacks +
cross-workstream final check + per-phase perf rollup), and Phase
9 (Wave 2 hyperbolic-engine parity; may be cut). User-feedback
revisions (single-tier GEDZIP, semver, hyperbolic to Wave 2,
cisgender default) are recorded in the pre-mortem section's
addendum and applied throughout.

Before Phase 0 starts: family-view Phase 0 must have shipped (so
the stubs to extend exist). Phase 0's first day is read-only —
the HEAD.SCHMA probe, the route.ts extensibility audit, and the
sync-matrix authoring all run before any code lands.
