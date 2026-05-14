# relationship vocabulary - first-class non-traditional families

design study for extending the editor's connector / connection-type system so polycules, multi-parent children, dynastic clans, magical / non-genetic origins, cross-species pairings, transformations, and other "fictional or just non-western" family shapes become first-class instead of afterthoughts. grounds new vocabulary in (a) what genealogy, genetics, and the social sciences have already standardized, and (b) what the editor's data model + four-pass IR can absorb without rewriting the world.

reads alongside [`notes/agents.md`](../agents.md) §8.1 (the "permissive schema for fictional families" rule) and the schema-evolution entries in [`notes/to-do.md`](../to-do.md) (`parentIds[]`, `relationships[]`, `birthOrder`, family naming).

editor-side touch points:
- domain types: [`apps/web/src/lib/domain/types.ts`](../../apps/web/src/lib/domain/types.ts)
- linking ops: [`apps/web/src/lib/domain/tree.ts`](../../apps/web/src/lib/domain/tree.ts) (`linkParent`, `linkSpouse`, `updateCouple`)
- validation: [`apps/web/src/lib/domain/validate.ts`](../../apps/web/src/lib/domain/validate.ts)
- segment vocabulary: [`apps/web/src/lib/layout/edgeRouter.ts`](../../apps/web/src/lib/layout/edgeRouter.ts) (`EdgeKind`, `EdgeRole`, `Segment`)
- four-pass IR: [`apps/web/src/lib/layout/passes/`](../../apps/web/src/lib/layout/passes/) (`layer.ts`, `order.ts`, `place.ts`, `route.ts`)
- renderer: [`apps/web/src/lib/components/tree/EdgeLayer.svelte`](../../apps/web/src/lib/components/tree/EdgeLayer.svelte) + [`edgePath.ts`](../../apps/web/src/lib/components/tree/edgePath.ts)
- hyperbolic engine: [`apps/web/src/lib/layout/engines/hyperbolic-lr/layout.ts`](../../apps/web/src/lib/layout/engines/hyperbolic-lr/layout.ts)
- inspector ui: [`apps/web/src/lib/components/inspector/PersonalTab.svelte`](../../apps/web/src/lib/components/inspector/PersonalTab.svelte), [`ConnectionsTab.svelte`](../../apps/web/src/lib/components/inspector/ConnectionsTab.svelte)

---

## 1. how the field already draws families

short reference so we can borrow rather than invent. each subsection lists what's universal, where it diverges, and what it can't currently express.

### 1.1 medical pedigree (bennett nomenclature)

the only ratified standard, originally bennett et al. 1995, revised 2008 and 2022 (NSGC). vocabulary:

- **individuals**: square = male, circle = female, diamond = unknown / nonbinary. 2022 revision separates assigned-sex-at-birth (AMAB/AFAB/UAAB) from gender identity (shape). triangle = pregnancy loss. SB+slash = stillbirth.
- **state decorators**: diagonal slash through shape = deceased. arrow at lower-left = proband. filled / half-filled / dot-in-shape encode disease status and carrier status. dashes through age in years inside the shape.
- **pair line (horizontal)**: single = union; double = consanguineous; broken-with-`//` = separated or divorced.
- **descent**: vertical line drops from the pair-line midpoint to a horizontal **sibship bus**, with one drop per child. birth order is strict left→right oldest-first.
- **twins**: shared descent line forks into a Y. horizontal bar across the Y = monozygotic; no bar = dizygotic; `?` = zygosity unknown.
- **adoption**: square brackets around the shape (in vs out). dashed descent line to the social parents, solid to biological when both are drawn.
- **assisted reproduction (2022)**: dedicated symbols for donor, surrogate, IVF; a "D" or "S" label on the parent-edge.

### 1.2 consumer genealogy (ancestry, familysearch, myheritage, gramps, RM, FTM)

- layouts: pedigree (right-fanning ancestors), descendant (top-down), bowtie, hourglass, fan / circular.
- sex via shape OR colour (blue/pink) OR `♂/♀` glyph. dates inline.
- same-sex unions: most modern tools accept them by relabelling "husband/wife" → "partner1/partner2". GEDCOM 5.5 still assumes single HUSB / single WIFE; we already emit duplicate-HUSB / duplicate-WIFE as the workaround (see [`agents.md`](../agents.md) §8.1).
- **what they can't do**: >2 legal parents; polyamory; donor + surrogate + intended-parent as three first-class roles; chosen family.

### 1.3 genogram (clinical, mcgoldrick-gerson)

owns the **richest relationship-quality vocabulary** in the field. keeps pedigree shapes but layers extra edges between the same two people:

- single solid line = close bond; **double / triple parallel** = enmeshed / fused.
- dashed = emotional distance. zigzag = conflict; bold-red zigzag (or zigzag-with-arrow) = abuse / violence.
- `//` across an edge = estrangement / cutoff.
- arrow at one end = unidirectional (caregiving, idealisation, abuse).
- inline glyphs on the edge: heart = affection, `?` = ambivalence, `$` = financial dependence.

importantly: one pair of nodes can carry a marriage edge AND a conflict edge AND a sexual-affair edge **simultaneously, all distinct lines**. our edge model has no concept of stacked / parallel relationship layers - we should add one.

### 1.4 heraldic / dynastic

each individual is a **shield bearing personal arms**, not a geometric shape. marriages by impalement (two coats side-by-side) or quartering (heraldic blend); descent same as a pedigree. children of different wives are grouped under each wife's shield. used by wikipedia heraldic family templates and posters such as usefulcharts.

implication for us: a "house" / "dynasty" overlay (named grouping, optional armorial-style card frame) is well-precedented and adds a lot of information density without changing the tree.

### 1.5 animal pedigrees (akc, royal kennel club, livestock)

the only mainstream domain that routinely draws **5-to-10 generation cognatic trees with the same ancestor appearing many times**. visual conventions worth stealing:

- duplicate ancestors highlighted by red text or shaded background.
- coefficient-of-inbreeding (COI) computed and rendered as a single percentage at the proband, or a heatmap over the chart.
- grid-strict layout (sire on top, dam on bottom, recursively) so a 10-gen chart fits a poster.

we have no consanguinity surfacing today. for a world that includes cousin-marriage, divine-incest dynasties, time-travel self-parentage, etc., this is a one-evening feature with high payoff.

### 1.6 jiapu, moʻokūʻauhau, oral cognatic

- **jiapu (chinese)**: book-form, top-down patrilineal cascade; one **generation poem** assigns each generation a fixed character so cousins 200 years apart share a name component. dense name-rich vertical columns; wives traditionally marginal.
- **moʻokūʻauhau (hawaiian)**: cognatic; mana flows through whichever parent confers higher status. usually memorised orally. branches both directions, emphasises both lines, multiple lines may converge at named cultural founders.
- implication: **"founder convergence"** (many descent paths leading to one named ancestor) and **named generations** are first-class concepts in some traditions. fits naturally on top of a graph-with-cycles model; awkward on a pure tree.

### 1.7 fan wikis, fantasy, worldbuilding tools

- wikipedia `Template:Family tree`: unicode box-drawing characters. solid = biological, dashed = adopted, double = married, but **conventions diverge wiki-to-wiki**. targaryens encode incest by name repetition rather than a double-line.
- world anvil "bloodlines": auto-5-gen tree, no polycule support, asexual/agametic reproduction not modelled, "siblings raising children together" requires fudging.
- silmarillion appendices: rectangular layout with **house-membership grouping headers** (House of Bëor, House of Hador) rather than shape / colour.

takeaway: fictional-tree authors have no shared symbology and reinvent per work. there's a real opening for a tool that is opinionated about a richer vocabulary.

### 1.8 when the tree breaks: sociograms

once relationships are too dense - polycule co-parenting across three households, donor-conceived siblings raised separately, chosen family overlapping biological - tree metaphors fail and the field switches to **sociograms** (force-directed node-link diagrams). we already have a hyperbolic engine which is the right substrate for this; we just don't lean on it for the cases it would shine in.

---

## 2. current state of the editor

what is already permissive, what is hard-coded, what's an enum-with-unused-members.

### 2.1 data model

```ts
// apps/web/src/lib/domain/types.ts
type Gender = "m" | "f" | "u";

interface Person {
  gender: Gender;           // closed 3-value enum
  motherId?: PersonId;      // single scalar
  fatherId?: PersonId;      // single scalar
  spouseIds: PersonId[];    // unbounded array - polygamy works
  // no species, no pronouns, no identity-over-time, no role
}

interface CoupleRecord {
  leftId: PersonId;         // binary
  rightId: PersonId;        // binary
  unionIndex: number;       // disambiguates multiple unions per pair
  childIds: PersonId[];
  marriageDate?, isPrimary?, isCurrent?
  // no type (civil/religious/cohabitation/ritual), no "kind" enum
}
```

**what's already permissive**:
- self-couples (`leftId === rightId`) accepted, flagged as a non-blocking finding.
- ancestral cycles accepted, flagged via DFS.
- `gender: "u"` exists for non-binary / unknown / N/A.
- `spouseIds` is unbounded, so polygamy is technically representable as a fan of pairwise unions.
- gedcom emit duplicates `1 HUSB` / `1 WIFE` for same-sex couples instead of coercing roles.

**what's hard-coded traditional**:
- **two-parent ceiling** at the schema level: a child has exactly `motherId` + `fatherId`. there is no `parentIds: PersonId[]`. queued as a v1→v2 migration in [`to-do.md`](../to-do.md).
- **binary union entity**: `CoupleRecord.{leftId, rightId}` cannot hold three or more partners. polycules are forced into a fan of pair-records.
- **no relationship type beyond "current/ended"**: no civil-vs-religious-vs-ritual-vs-cohabit; no asymmetric / consent-pattern data; no "sworn-bond, master-apprentice, transformed-from" overlays. queued as v2→v3 in [`to-do.md`](../to-do.md) (the generic `relationships[]`).
- **gender drives parental role assignment**: `linkParent` reads parent gender, writes `motherId` or `fatherId`. a non-binary parent silently becomes "father" if `gender === "m"`, "mother" if `"f"`, undefined if `"u"`. ConnectionsTab still has two separate slots labelled mother / father.
- **no species / kind / sapience axis**: a dragon, a chair, an AI, and a human are all the same `Person` shape with the same kinship-term lookup.
- **no identity-over-time**: trans personhood, transformations, reincarnations, name changes that should change pronoun derivation - we treat each `Person` as a single immutable identity record.

### 2.2 layout pipeline + segment vocabulary

```ts
// apps/web/src/lib/layout/edgeRouter.ts
type EdgeKind = "bond" | "parent-drop" | "sibling-bus" | "child-drop" | "stub";
type EdgeRole = "blood" | "adopted" | "half" | "married" | "divorced";
```

- five segment **kinds**; this vocabulary is the geometric primitive set the renderer knows how to draw.
- five **roles**; only `married` and `divorced` are ever assigned. `adopted` and `half` are declared but **never set** because there's no data field to derive them from (route.ts hardcodes `"blood"` for every drop / bus). this is a placeholder waiting for the schema bump.
- four passes (layer → order → place → route) all assume **pair-anchored unions**: spouse-adjacency is enforced as a 2-element `spouseGroup`, joint-child fans are anchored at the midpoint of two parent slots, ghost-node insertion is one ghost per cross-rank spouse.

n-ary union support needs touchpoints in every pass:
- **layer.ts**: rank assignment for >2-parent children currently has no rule; assumes both parents on adjacent ranks.
- **order.ts**: `spouseGroup` needs to become "union cluster" with N members; the contiguous-cluster constraint is heavier than pair-adjacency.
- **place.ts**: spouse-bar midpoint becomes union-centroid; gap policy DELTA (2.5u) for spouse-pairs needs a wider variant for clusters.
- **route.ts**: `bond` is a single horizontal segment between two anchors; for N partners we need a **manifold**: triangle / polygon / cycle / arc / bus.

### 2.3 renderer

[`edgePath.ts`](../../apps/web/src/lib/components/tree/edgePath.ts) ships:

- straight bond, quadratic-bezier bundled bond (holten 2006) for long cross-lineage spans.
- straight vertical drops, bridge-hops (small arcs) at unavoidable perpendicular crossings.
- divorce ticks (`//`), stub caps (`⊢⊣`) for long-distance couples.

**not present**: per-role colour, per-role dash pattern, adoption brackets around a card, sibling bracket, twin Y-fork bar, consanguinity double-line, genogram-style parallel relationship edges, dynasty / house grouping frames, founder-convergence highlighting, duplicate-ancestor shading, COI display.

stroke styling is a single zoom-aware width; the renderer has no concept of stacked or layered edges between the same two endpoints.

### 2.4 ui

- PersonalTab gender picker: 3 hard-coded options. no pronoun field, no species, no role.
- ConnectionsTab: separate "mother" and "father" slots; the "add parent" affordance presupposes exactly one of each.
- spouse list works for N entries but every entry is a pair-record; there is no "join an existing union" or "create a 3-person household" affordance.
- no inspector tab for the as-yet-nonexistent `relationships[]` overlay (transformations, bonds, alias-of, etc.).

### 2.5 gap summary

| dimension | data model | layout | renderer | ui |
|:--|:--|:--|:--|:--|
| binary gender | hard 3-enum | reads gender | colour-neutral | hardcoded 3-option |
| 2-parent ceiling | hard | assumes 2 | drop fan assumes 2 | mother/father slots |
| binary union | hard `{left,right}` | pair-anchor | pair-bond geometry | pair add/remove |
| adoption | absent | role enum unused | no bracket / dash | absent |
| half-sibship | absent | role enum unused | no visual hint | absent |
| relationship type | only `current/primary` | n/a | n/a | absent |
| identity over time | absent | n/a | n/a | absent |
| species / kind | absent | n/a | n/a | absent |
| dynasty / house grouping | absent | n/a | no frame | absent |
| consanguinity surface | absent | n/a | no double-line / COI | absent |
| genogram relationship layer | absent | not modeled | single-line only | absent |

---

## 3. connection types we need to support

grouped by the axis they stretch. each is followed by §4 with concrete visual proposal.

**a. partnership shape**
1. monogamous pair (✅ today)
2. plural pair-fan (✅ today via `spouseIds[]`, awkward)
3. polyfidelitous closed N-union (triad, quad, polycule with internal-only relationships)
4. open / asymmetric polycule (V, branched, vee-and-pivot)
5. self-couple (✅ tolerated, no semantic)
6. ritual / sworn / non-romantic bond (oath-siblings, blood-brothers, magical pact)
7. ended union (divorce ✅; annulled, widowed, dissolved-by-transformation, ascended-out)

**b. parentage / origin**
8. multi-parent child (>2 genetic / legal / social parents of equal weight)
9. adopted-in / adopted-out / fostered (with social-vs-bio distinction)
10. donor / surrogate / assisted-reproduction (NSGC 2022 vocabulary)
11. step / honourary / chosen parent
12. sealed-to-parents (LDS-style parallel parental layer)
13. magical or non-genetic origin: cloned, hatched, grown, summoned, awoken, manufactured
14. asexual / agametic / parthenogenetic single-parent
15. multi-species / hybrid / chimera (carries traits of N species)
16. transformation / reincarnation / merge / split (same identity across forms; or two identities collapse into one; or one splits)
17. unknown / hidden / disputed parent (with confidence)

**c. sibship**
18. twin / triplet (monozygotic / dizygotic / unknown)
19. half-sibling (shared one parent of the N)
20. step-sibling
21. clone / batch (siblings instantiated together, no parent in the usual sense)
22. found-family sibship (chosen)

**d. group / overlay**
23. dynasty / house / clan (named grouping of many people across many generations)
24. household (people who cohabit, may cut across blood)
25. species / race / faction membership (independent of family)
26. covenant / pact / order (sworn body cutting across families)
27. estrangement / cutoff / exile (presence-of-tie + explicit severance)

**e. identity-and-state**
28. nonbinary / fluid / multi-gender (with optional AMAB/AFAB/UAAB for the medical layer)
29. dead, undead, ascended, missing, fictional-in-universe, time-displaced
30. duplicate ancestor (same person shows up at multiple positions in a cognatic tree)

---

## 4. visual + data design per connection type

each entry: **data**, **segment**, **sketch**, **routing**, **scale-out**. sketches are ascii; the real renderer would do svg.

### 4.1 polyfidelitous closed N-union (triad / quad / polycule)

- **data**: replace `CoupleRecord` with `UnionRecord { partnerIds: PersonId[]; kind: 'romantic'|'civil'|'ritual'|'cohabit'|...; closed: boolean; ... }`. partner array is the source of truth; legacy `leftId/rightId` becomes `partnerIds[0/1]` for migration.
- **segment**: new `kind: "union-manifold"` with `partnerIds[]` and a small geometric primitive: `ring`, `bus`, or `polygon`.
- **sketch (triad)**:
  ```
   [A]───┬───[B]
         │
        [C]
  ```
  for 4+, prefer a bus-with-tails:
  ```
   [A]──┬──[B]──┬──[C]──┬──[D]
        └──────────────────┘
                │
              (kids)
  ```
- **routing**: pick the **partner centroid** as the descent anchor; route a horizontal bus through all partners on the same rank, and short verticals from off-rank partners to a shared bus on the inter-rank gutter. one ghost per off-rank partner, same mechanism as today.
- **scale-out**: for N=3 use a triangle; for N≥4 use the centroid-anchored bus. above ~6 partners, render a single rounded "polycule node" with a chip-list of names, and let the user expand on click.

### 4.2 open / asymmetric polycule (V, vee-and-pivot, branched)

- **data**: a single union may not be the right model; each *pair-bond* within the polycule is its own `UnionRecord` with `closed: false`. for the meta-shape, allow an optional `PolyculeGroup { memberIds[]; name?; relationshipMatrix?: {a,b,kind}[] }` overlay.
- **segment**: each pair-bond is a normal bond segment; the polycule group is an optional **convex-hull frame** drawn behind the cluster, similar to a "house" frame (see 4.16).
- **sketch (V)**:
  ```
   [A]───[B]───[C]      A and C are not partners
            \
            [D]         B is also partnered with D
  ```
- **routing**: existing bond router suffices for pair-bonds; the hull/frame is an overlay pass after `place` (doesn't affect skeleton routing). hyperbolic engine: same idea, the frame is a hyperbolic polygon.
- **scale-out**: when the relationship matrix gets dense (≥4 partners with mutual pairwise bonds), prompt to convert to a closed `UnionRecord` (4.1) so the renderer collapses N(N-1)/2 lines into one bus.

### 4.3 multi-parent child (>2 parents of equal weight)

- **data**: replace `motherId` / `fatherId` with `parentIds: { personId; role?: 'mother'|'father'|'parent'|'progenitor'|'donor'|'surrogate'|'social'; pedi?: 'birth'|'adopted'|'foster'|'sealed'|'chosen'|'magical' }[]`. role is now decoupled from gender. queued in [`to-do.md`](../to-do.md) (parents v1→v2).
- **segment**: today `parent-drop` runs from one parent (or couple-midpoint) to one child. for N parents, **either**:
  - (a) `multi-parent-drop`: a small **parent gather** node above the child, with one line in from each parent and a single line down to the child. minimal new geometry.
  - (b) reuse the union manifold from 4.1 - treat the parents as a (possibly non-romantic) union whose only purpose is to be a parental anchor.
- **sketch (a)**:
  ```
   [A]   [B]   [C]
     \    │    /
      \   │   /
       ●──┴──●    <- parent gather (small pill)
           │
         [D]
  ```
- **routing**: gather node lives in the inter-rank gutter; placed at parent centroid. when one parent is on a different rank, run a ghost on the child's parent-row (same ghost mechanism as today, generalized to N members).
- **scale-out**: for 5+ parents we can collapse the gather into a small "★ ‍parents (N)" pill that expands on click and shows per-edge role labels.

### 4.4 adoption / foster / step (social vs biological)

- **data**: each entry in `parentIds[]` carries `pedi`. validation surfaces "no birth parent recorded" / "multiple birth parents" as findings.
- **segment**: `parent-drop` gains `role`-aware rendering. propose:
  - `blood` / birth: solid.
  - `adopted` / `sealed`: **dashed**.
  - `foster` / `step`: **dotted**.
  - `donor` / `surrogate`: **dash-dot** with role glyph at midpoint (small "D" or "S").
  - `social` / `chosen`: **double-dashed** (parallel pair of dashes).
- **sketch**:
  ```
   [Bio mum]      [Adoptive dad]
        │\\\\\\\\\\\\\\\\\\\\│       <- bio = solid; adoptive = dashed
        │                     │
        └────────┬────────────┘
                 │
              [child]
  ```
- **routing**: zero change to skeleton routing; only stroke pattern changes. the renderer needs a per-role dash table (today there is none).
- **scale-out**: arbitrary parent count handled by 4.3; this just decorates each drop.

### 4.5 donor / surrogate / assisted reproduction (NSGC 2022)

- **data**: `pedi: 'donor' | 'surrogate' | 'ivf-intended'`. donors and surrogates may or may not appear in the visible tree; if they're external, a `Person.display = "ghost-external"` flag would keep them off the canvas while preserving the edge.
- **segment**: dash-dot drop with a small `D` / `S` / `IVF` glyph at midpoint.
- **routing**: same drop geometry. add an "external donor" zone above the canvas - a small holding shelf above generation 0 for unattached donor records - so they don't push the regular layout out of shape.
- **scale-out**: clinical-mode toggle in View menu that shows / hides external-donor / surrogate edges en masse.

### 4.6 sibship grouping, twins, batches

- **data**: `Person.birthOrder?: number` (queued, v3→v4). new `SibshipDecorator { sibIds[]; kind: 'twins-MZ'|'twins-DZ'|'twins-?'|'triplets-MZ'|...|'clone-batch'|'litter'|'spawned-together' }`.
- **segment**: new `kind: "sibship-bracket"` that draws a horizontal bracket under the parent-drop, fanning into individual short verticals; for twin batches add a horizontal tie-bar across the fork (MZ = bar present, DZ = no bar, unknown = `?`).
- **sketch (MZ twins)**:
  ```
        [parent gather]
              │
              ●
             ╱─╲          <- horizontal bar = MZ
            ╱   ╲
          [A]   [B]
  ```
- **routing**: tightens existing sibship-bus; bracket is a new sub-segment kind drawn before the per-child drops.
- **scale-out**: for a "clone batch" of 30 instances, render a single sibship-cluster node ("clones (30)") that expands on demand.

### 4.7 half-sibling shading

- **data**: derived from `parentIds[]` - any two children sharing < all parents are half-siblings by some axis. validation surfaces "asymmetric sibship" findings.
- **segment**: sibship-bus gains `role: "half"` for the section between two children who don't share all parents. render as **lighter / dashed** sub-segment.
- **sketch**:
  ```
   [parents-1]        [parents-2]
        │                   │
        ●─────┐         ┌───●
        │     │·········│   │     <- dotted between half-sib pair
       [A]   [B]·······[C] [D]
  ```
- **routing**: bus is already drawn as a single segment; this requires splitting it at sibship-membership boundaries.
- **scale-out**: with N parents per child, "half" generalizes to a similarity coefficient (jaccard over `parentIds`); render colour intensity along the bus rather than a binary half/full distinction.

### 4.8 ritual / sworn / non-romantic bond

- **data**: separate `relationships[]` overlay entries with `kind: 'sworn-bond' | 'oath-sibling' | 'blood-brother' | 'master-apprentice' | 'covenant' | ...`. **does not** participate in the parent / partner / child skeleton.
- **segment**: new `kind: "overlay-bond"`, drawn as a **chained / linked** line (small ⛓-style breaks) or a thin double-stroke. always rendered above the skeleton.
- **routing**: routed independently of the rank-and-bus skeleton. uses force-directed / shortest-path overlay (no obstacle avoidance needed; can hop with bridge-arcs).
- **scale-out**: a toggle in View menu ("show overlays: sworn bonds, transformations, alias-of...") and a per-kind colour key.

### 4.9 transformation / reincarnation / merge / split

- **data**: `relationships[]` entry with `kind: 'transformed-from'|'reincarnated-as'|'merged-from'|'split-into'|'alias-of'; sourceIds[]; targetIds[]; cause?; date?`.
- **segment**: new `kind: "identity-arc"`, drawn as a **wavy** or **arrow** line, with explicit direction and a small glyph on the arc (☼ for transformation, ∞ for reincarnation, ⊕ for merge, ⊖ for split, ≡ for alias).
- **sketch (transformation)**:
  ```
   [Princess Linda]∼∼∼∼☼∼∼∼∼>[Linda-as-swan]
  ```
- **routing**: routed independently of skeleton. for "person became their own ancestor" (time loop), this is a self-loop drawn as a half-arc on the side of the card.
- **scale-out**: bundled identity-arcs become a "narrative thread" view in the canvas - colour-key by character.

### 4.10 cross-species / hybrid / chimera

- **data**: `Person.species: string` (open string, not enum). `Person.hybridOf?: PersonId[]` for the "made from two ancestors of different species" case (already covered by `parentIds[]` if both bio parents listed). add `Person.kind: 'biological'|'mechanical'|'spirit'|'collective'|'concept'|...` if we want to differentiate sentient from chair.
- **segment**: no new kind; this affects **card shape / frame**, not lines. propose:
  - shape stays driven by gender (square / circle / diamond per NSGC 2022 + custom).
  - **frame** encodes species / kind: solid border = biological human-typical, double border = magical, dashed border = mechanical, gradient border = hybrid (gradient blends colours of the constituent species).
- **routing**: irrelevant.
- **scale-out**: species colour-key lives in a sidebar legend; user can declare new species + pick frame style.

### 4.11 sealed-to-parents (parallel parental layer)

- **data**: a second `parentIds[]`-shaped field, `sealedParentIds[]`, OR a `pedi: 'sealed'` entry in `parentIds[]`. the parallel-layer option lets us draw both layers simultaneously without confusing the skeleton.
- **segment**: parallel `parent-drop` with dashed stroke and a different colour. visually one "primary" tree and one "sealing" tree co-exist in the same canvas.
- **routing**: routed as a second overlay pass with its own ghost-node logic. layered engine: a second rank-assignment per overlay layer; hyperbolic: a second set of geodesic arcs.
- **scale-out**: View menu toggle "show sealings" / "show fictive parents" / "show step-parents" - each is just another overlay layer with its own dash pattern.

### 4.12 magical / non-genetic origin (cloned, hatched, summoned, awoken)

- **data**: `parentIds[]` entries with `pedi: 'magical' | 'cloned' | 'hatched' | 'summoned' | 'manufactured' | ...`. for "no parent, just appeared", `parentIds[]` is empty and `Person.origin?: { kind; cause; date }` carries the story.
- **segment**: drop rendered with a **wavy** stroke; midpoint glyph (✨ summoned, ⚙ manufactured, ◯ hatched, ✦ awoken). for `origin` with no parent, a small **anchor halo** is drawn around the card with the origin glyph - no drop at all.
- **routing**: zero parents = node is a layout root for its branch; we already accept arbitrary roots.
- **scale-out**: origin glyphs are tabulated in the legend; same-origin batches can share a frame (4.10).

### 4.13 self-couple, self-parent (time-loop)

- **data**: today's self-couple is tolerated. self-parent (`Person.parentIds` includes self) currently cycles and is flagged.
- **segment**: bond / drop becomes a **self-loop arc** drawn on the side of the card, with the time-loop glyph (⟲) at midpoint.
- **sketch**:
  ```
       ⟲
   ┌─[A]─┐
   │     │
   └─────┘
  ```
- **routing**: self-loops are handled outside the rank-and-bus skeleton; routed as a side-arc of fixed radius.
- **scale-out**: distinct cycles (A→B→C→A) get a colour-coded poly-arc on the side, treated like a relationship overlay.

### 4.14 dynasty / house / clan / household / faction (group overlay)

- **data**: `Group { id; name; kind: 'dynasty'|'house'|'clan'|'household'|'faction'|'order'|'covenant'; memberIds[]; founderId?; armorial?; frame?: { color; style } }`. a person can be in any number of groups.
- **segment**: not an edge - a **frame / hull / band**. propose:
  - **hull**: convex/concave hull around members, with a tinted fill. svelte's d3-style polygon-hull works; for hyperbolic, a hyperbolic polygon.
  - **band**: a vertical (or radial) **lane** down a slice of the canvas, tinted by faction colour; cards inside the band visually belong even at distance.
  - **header**: a generation-spanning ribbon labelled with the group name and (optional) armorial.
- **sketch**:
  ```
   ┌─[House Marvane ━━━━━━━━━━━━━━━━━━━━]
   │   [A]───[B]               [C]─[D]
   │    │       \             /
   │   [E]─[F]   [G]      [H]      
   └────────────────────────────────────
  ```
- **routing**: overlay; runs after `place`. has no influence on skeleton routing but pushes nodes apart slightly via a soft constraint in `order` if groups want spatial cohesion.
- **scale-out**: groups can nest (House → Cadet Branch → Household). render nested groups with concentric frames or stacked ribbons. for very large dynasties, a "fold to founder" affordance shows only the named founder + a chip of (N descendants).

### 4.15 estrangement / cutoff / exile

- **data**: each pair-bond (parental, partner, sibling) gets optional `severance?: { kind: 'estranged'|'cutoff'|'exiled'|'disowned'|'killed-by'; date?; cause? }`.
- **segment**: existing edge is overdrawn with a **slash `//`** mark (just like the current divorce tick), but **doubled** for "cutoff" vs "divorce", and **red** for "killed-by".
- **routing**: zero change; this is a stroke decoration.
- **scale-out**: severance markers are aggregated into a kinship-relations summary in the inspector.

### 4.16 duplicate ancestor / consanguinity surfacing

- **data**: derived. validator already detects ancestor cycles; extend to mark "same person appears in N ancestor paths" with the count.
- **segment**: when ghost-spouse duplication renders the same person twice (already in place), the second instance gets a small chip-link icon (already in place). **add** a faint connecting arc between every pair of instances, and **highlight** all instances when one is hovered.
- **render**: a COI percentage on the proband card (small badge) when the tree is cognatic enough to warrant it; double-line bond for marriages where both partners share a known recent ancestor.
- **scale-out**: a "show consanguinity" view toggle; in the genealogist mode, duplicate ancestors get a coloured background tint by frequency.

### 4.17 nonbinary / fluid identity and AMAB/AFAB/UAAB

- **data**: replace `gender: 'm'|'f'|'u'` with `gender: { identity: string; pronouns?: string; assignedAtBirth?: 'AMAB'|'AFAB'|'UAAB'; fluid?: boolean }`. open string for identity (legacy m/f/u stay valid).
- **segment**: irrelevant - this affects card shape, not edges.
- **sketch**: shape = square / circle / diamond (driven by `identity`'s closest mapping, or explicit user pick); a tiny side-label `AMAB` / `AFAB` if the user has filled it in. fluid identity adds a small ◊ corner badge.
- **routing**: irrelevant.
- **scale-out**: pronouns flow into `kinship.ts` for kinship-term derivation; no more silent fallback to "father" / "mother" by gender enum.

### 4.18 confidence / disputed / hidden parentage

- **data**: each `parentIds[]` entry carries `confidence?: number (0..1)` and `source?: string`. `hidden?: boolean` lets the user record knowledge without showing the edge.
- **segment**: confidence < 1 renders the drop with reduced opacity + a small `?` glyph at midpoint. hidden edges are not drawn but appear as "hidden parent" tag on the card.
- **routing**: zero change to skeleton.
- **scale-out**: a "show hidden" view toggle reveals all suppressed edges at once.

---

## 5. summary of new vocabulary

**new segment kinds** (additions to `EdgeKind`):
- `union-manifold` (N-ary partnership bus / ring / polygon)
- `multi-parent-drop` with optional gather-node
- `sibship-bracket` (with twin tie-bar variant)
- `overlay-bond` (sworn / oath / pact / fictive)
- `identity-arc` (transformed / reincarnated / merged / split / alias)
- `self-loop` (time-loop / self-parent / self-couple)

**new segment roles** (additions to `EdgeRole`; many already declared as placeholders):
- existing: `blood`, `adopted`, `half`, `married`, `divorced`
- add: `social`, `chosen`, `step`, `foster`, `donor`, `surrogate`, `sealed`, `magical`, `cloned`, `hatched`, `summoned`, `manufactured`, `ritual`, `civil`, `cohabit`, `oath`, `transformed`, `reincarnated`, `merged-from`, `split-into`, `alias-of`, `severed`, `estranged`, `exiled`, `disowned`

**new stroke palette** (renderer additions):
- solid (default)
- dashed (adopted / sealed)
- dotted (foster / step)
- dash-dot (donor / surrogate)
- double-parallel (chosen / social / consanguineous)
- wavy (magical / transformation)
- chained (sworn / oath / ritual)
- arrow-terminated (unidirectional: caregiving, idealisation, abuse)
- doubled-slash (cutoff vs single-slash divorce)
- per-role colour palette (configurable)

**new card decorations**:
- frame style (solid / dashed / dotted / gradient) for species / kind
- shape (square / circle / diamond / triangle / shield) for gender identity + heraldic mode
- corner glyphs (✝ deceased, ⟲ time-loop, ✨ summoned, ⚙ manufactured)
- chip-link icon for duplicate instances (✅ exists)
- assigned-sex side label (AMAB / AFAB / UAAB)
- COI badge / consanguinity colour tint

**new overlay layers** (each is independently togglable in View menu):
- skeleton (always on)
- sealings / fictive parents / step-parents (each as separate parental layer)
- sworn / oath / ritual bonds
- transformations / reincarnations / merges
- group frames (dynasties, houses, households, factions)
- severances (estrangement / cutoff / exile)
- consanguinity highlighting

---

## 6. schema migration sketch

each bump ships with a `Migration` in [`apps/web/src/lib/domain/schema.ts`](../../apps/web/src/lib/domain/schema.ts) (see [`agents.md`](../agents.md) §8.3). proposed sequence:

1. **v1 → v2**: `motherId` / `fatherId` → `parentIds: ParentRef[]` where `ParentRef = { personId; role?; pedi? }`. legacy two-slot data converts trivially (mother + father → two entries with `role: 'mother'|'father'`, `pedi: 'birth'`). already queued.
2. **v2 → v3**: `CoupleRecord` → `UnionRecord { partnerIds: PersonId[]; kind?; closed?; ... }`. legacy `{leftId, rightId}` → `partnerIds: [leftId, rightId]`. already queued.
3. **v3 → v4**: add `relationships: Relationship[]` overlay (sworn bonds, transformations, alias-of, severances). already queued in [`to-do.md`](../to-do.md).
4. **v4 → v5**: extend `Person.gender` to a struct (`identity, pronouns, assignedAtBirth, fluid`); add `species`, `kind`, `origin`.
5. **v5 → v6**: add `Group[]` (dynasties / houses / households / factions / orders).
6. **v6 → v7**: add `SibshipDecorator[]` (twin classification, clone batches) and `Person.birthOrder`.

each bump has minimal blast radius because the migrations are pure data transforms and the validator's "validate-as-finding" stance means even malformed legacy data only surfaces warnings, never crashes (see [`agents.md`](../agents.md) §8.3).

---

## 7. routing considerations

### 7.1 layered engine ([`passes/`](../../apps/web/src/lib/layout/passes/))

- **layer.ts**: generalize rank assignment so a child with N parents picks the **highest-rank-1** as its rank; off-rank parents become ghosts on the rank above the child. avoids the current "single parent rank-assignment" defect (see [`bugs.md`](../bugs.md) - 12% of drops have negative height).
- **order.ts**: replace `spouseGroup` 2-element constraint with `unionCluster` of arbitrary size; cluster must remain contiguous along its rank. for N-ary unions where partners span ranks, the constraint loosens to "ghost adjacency" the same way today.
- **place.ts**: gap policy needs a third tier - `INTRA_UNION` (tight, < DELTA) for closed N-unions, `INTER_UNION_SAME_PARENT` (medium) for open polycules sharing a node, `BRANCH_GAP` (loose) for unrelated. spouse-bar midpoint becomes union-centroid; for non-coplanar unions, centroid is projected onto the highest-rank partner's row.
- **route.ts**: bond becomes union-manifold; one bus per coplanar partner set, plus L-bonds to off-rank partners (already supported as a pattern for ghost spouses). parent-drop fans out from a parent-gather node at the union centroid. half-sibship bus segmentation runs at the role boundary.
- **A\* obstacle-avoidance** (queued in [`to-do.md`](../to-do.md)) becomes load-bearing once overlays start crossing the skeleton. each overlay layer routes independently but shares the routing graph (corners of card AABBs + row-gutter alignment lines) so overlay edges hop instead of crossing.

### 7.2 hyperbolic engine ([`engines/hyperbolic-lr/`](../../apps/web/src/lib/layout/engines/hyperbolic-lr/))

- wedge allocation already supports irregular sub-wedge widths (see [`hyperbolic-geometry`] skill). **N-ary unions** fit naturally: each partner gets a small wedge, the union centroid is their hyperbolic barycentre, and children fan from the centroid. open polycules without a centroid use the hyperbolic equivalent of force-directed routing.
- **identity arcs / sworn bonds**: hyperbolic geodesics already, just with a different style.
- **group frames**: hyperbolic polygons drawn behind member wedges.
- **multi-parent drop**: a single geodesic from the parent-cluster centroid to the child works without modification.

the hyperbolic engine is structurally a better substrate for everything that breaks tree assumptions (cycles, polycules, multi-parent, fictive overlays). when the layered view falls apart, the View menu should suggest hyperbolic.

### 7.3 overlay layer

overlays (sworn bonds, transformations, severances, group frames) live in a **separate render pass** stacked above the skeleton. they:
- route independently (no participation in rank / order constraints).
- have their own stroke palette and z-order.
- are independently togglable.
- never affect undo / redo of the skeleton.

storing them as `relationships[]` (v3→v4 above) keeps the skeleton's domain ops (`linkParent`, `linkSpouse`, etc.) unaffected.

---

## 8. priority + sequencing

ordered by "smallest schema bump → largest payoff":

1. **stroke palette + role-driven rendering** in [`edgePath.ts`](../../apps/web/src/lib/components/tree/edgePath.ts). zero schema change; immediately surfaces the `adopted` / `half` / `divorced` distinctions that are already in the enum but invisible. one-evening change.
2. **per-role color + dash table** + view-menu toggles for them.
3. **`parentIds[]` migration** (v1→v2 in [`to-do.md`](../to-do.md)). unlocks multi-parent, donor/surrogate, adoption-vs-bio, sealings.
4. **multi-parent-drop renderer** (parent gather node). lets the new schema show up on the canvas.
5. **`UnionRecord` + `partnerIds[]` migration** (v2→v3). unlocks polycules.
6. **`union-manifold` segment** with bus / ring / polygon variants.
7. **`relationships[]` overlay schema** (v3→v4 in [`to-do.md`](../to-do.md)) + overlay render pass. unlocks sworn bonds, transformations, severances, alias-of.
8. **identity / species / origin extensions**.
9. **`Group[]` schema + frame / hull / band renderer**. dynasties, houses, factions.
10. **consanguinity surfacing** (COI badge, duplicate-ancestor highlighting, double-line consanguineous bonds).
11. **sibship decorators** (twins, batches).
12. **A\* obstacle-avoidance router** ([`to-do.md`](../to-do.md) entry). load-bearing once overlays exist.

each of 1-12 stands on its own; nothing must ship together with anything else.

---

## 9. export tiers - compatible vs accurate `.gdz`

the richer the schema gets (§§3-6), the bigger the gap between "what we can preserve" and "what other tools can read". today there's one export, a single GEDCOM-5.5-ish `.gdz` that loses anything outside the FamilyEcho dialect (see [`io/warnings.ts`](../../apps/web/src/lib/io/warnings.ts) for the current drop set). proposal: two tiers of `.gdz`, sharing the same bundle layout (`gedcom.ged` + `media/<personId>.<ext>` + `manifest.json` per the GEDZIP spec) so the carrier never forks - only the `gedcom.ged` content differs. the future native-JSON export noted in [`agents.md`](../agents.md) §8.2 is deferred from this proposal (dual-payload bundles introduced too many "which side of the archive is authoritative" edge cases for the value they'd add).

### 9.1 tier 1: compatible gdz (today's default, evolved to gedcom 7)

targets max interop with FamilyEcho, MyHeritage, Ancestry, FamilySearch, Gramps, RootsMagic, FTM. standard tags only; **no extension `_X_*` namespace**. modern parsers accept it without warnings; pre-5.5.1 parsers may complain about a few standard-but-recent tags.

lossy degradation table for the new vocabulary:

| schema | compatible-mode mapping | loss |
|:--|:--|:--|
| `parentIds[]` = mother + father | `1 HUSB` + `1 WIFE` on FAM | none |
| `parentIds[]` same-sex | duplicate `1 HUSB` or duplicate `1 WIFE` (today's behaviour) | none for GEDCOM 7 readers; partial for strict 5.5 |
| `parentIds[]` length `>2` | primary pair on the FAM; other parents → separate FAM with `FAMC / PEDI adopted` (or `foster` / `sealing`) | "one household" semantic lost; readers see N families |
| `pedi: 'birth'/'adopted'/'foster'/'sealed'` | `2 PEDI birth` / `adopted` / `foster` / `sealing` | none - PEDI is standard since 5.5.1 |
| `pedi: 'donor'/'surrogate'/'magical'/'cloned'/...` | `2 PEDI unknown` + free-text NOTE | type lost; text preserved |
| `UnionRecord.partnerIds[]` length 2 | one FAM | none |
| `UnionRecord.partnerIds[]` length `≥3` (polycule / polyfidelitous) | chain of pairwise FAMs, primary first | "one household" semantic lost; reader sees N(N-1)/2 marriages |
| `UnionRecord.kind` = `civil`/`religious`/`ritual`/`cohabit` | `1 MARR / 2 TYPE civil` etc. | none for GEDCOM 7; some 5.5 tools ignore TYPE |
| `gender.identity` (open string) + `assignedAtBirth` | `1 SEX M`/`F`/`X`/`U` (closest fit); identity string → NOTE | identity nuance lost |
| `gender.pronouns` | NOTE | derivable-only on re-import |
| `species` | NOTE on INDI | total |
| `Person.origin` (cloned / hatched / summoned / manufactured) | NOTE on `BIRT` event | total |
| `relationships[]` `sworn-bond`/`oath`/`ritual` | dropped (or one-line NOTE per endpoint) | total |
| `relationships[]` `transformed-from`/`reincarnated-as`/`alias-of` | dropped (or NOTE on subject INDI) | total |
| `Group[]` (dynasty / house / household / faction) | dropped (or NOTE on founder INDI listing members) | total |
| `severance` (estranged / cutoff / exiled / killed-by) | `1 EVEN / 2 TYPE estrangement` (non-standard but widely tolerated) | semi-lossless if reader preserves EVEN/TYPE |
| `SibshipDecorator` (twins-MZ / clone batch / litter) | NOTE on FAM | classification lost; sibship from shared FAMC preserved |
| `Person.birthOrder` | implied by `BIRT / DATE` order | exact integer lost; usually re-derivable |
| `display`, `anchorParentId`, `locationOrigin`, `wikiTitle` | dropped (today's behaviour) | minor |
| `confidence` / `hidden` per edge | dropped | minor |
| self-couple, self-parent (time loop), explicit ancestral cycle | **exporter errors out**; no graceful GEDCOM fallback exists | file would be malformed; user redirected to tier 2 |

user picks tier 1 when round-trip through another genealogy tool matters. validator surfaces a dropped-fields banner (already wired via [`io/warnings.ts`](../../apps/web/src/lib/io/warnings.ts) - just needs the new field set) before the download starts.

### 9.2 tier 2: accurate gdz (gedcom 7 + registered extension tags)

same `.gdz` carrier, same parser-tolerant `gedcom.ged`. uses **GEDCOM 7's `HEAD.SCHMA` extension mechanism** to register editor-specific tags under a stable namespace - e.g. `https://attuproject.org/trees/schema/v1#` with short forms `_TREES_*`. GEDCOM 7 parsers see the registration in the header, recognise the extension as well-formed, and either preserve the tags untouched (Gramps, FS-style tolerant tools) or silently ignore them (strict tools) - but they **don't reject the file**.

mapping for everything tier 1 had to drop:

| schema | accurate-mode tag | round-trip |
|:--|:--|:--|
| N-ary union | top-level `_TREES_UNION` record with `_PARTNER+`, `_KIND`, `_CLOSED`, `_PRIMARY` | full |
| union `kind` | `_TREES_KIND civil/religious/ritual/cohabit/...` | full |
| non-standard `pedi` (`donor`/`surrogate`/`magical`/`cloned`/`hatched`/...) | `2 PEDI <closest standard>` + `3 _TREES_PEDI <true value>` | full |
| `gender.{identity, pronouns, assignedAtBirth, fluid}` | sibling tags `_TREES_GENDER_IDENTITY` / `_PRONOUNS` / `_ASSIGNED_SEX` / `_GENDER_FLUID` under INDI | full |
| `species` | `_TREES_SPECIES <free string>` | full |
| `Person.kind` (biological / mechanical / spirit / collective / concept / ...) | `_TREES_PERSON_KIND` | full |
| `Person.origin` (cloned / hatched / summoned / awoken / manufactured) | `_TREES_ORIGIN_KIND` + `_ORIGIN_CAUSE` + `_ORIGIN_DATE` | full |
| `relationships[]` (sworn / oath / ritual / transformation / reincarnation / alias-of / merged-from / split-into) | top-level `_TREES_REL` records, each `_SOURCE`, `_TARGET`, `_KIND`, optional `_DATE` / `_CAUSE` / `_NOTES` | full |
| `Group[]` (dynasty / house / household / faction / order / covenant) | top-level `_TREES_GROUP` records, `_NAME`, `_KIND`, `_FOUNDER`, `_MEMBER+`, `_FRAME` | full |
| `SibshipDecorator` (twins-MZ / clone batch / litter / spawned-together) | `_TREES_SIBSHIP` on FAM with `_KIND`, `_MEMBER+` | full |
| `Person.birthOrder` | `_TREES_BIRTH_ORDER` on INDI | full |
| `display`, `anchorParentId`, `locationOrigin`, `wikiTitle` | `_TREES_DISPLAY` / `_ANCHOR_PARENT` / `_LOCATION_ORIGIN` / `_WIKI_TITLE` | full |
| `confidence` per linkage | `_TREES_CONFIDENCE <0..1>` on the FAMC / FAMS / `_REL` | full |
| `severance` per linkage | `_TREES_SEVERANCE` with `_KIND` / `_DATE` / `_CAUSE` | full |
| `hidden` per edge | `_TREES_HIDDEN Y` on the linkage | full |
| self-couple, self-parent, cycles | tolerated (we already accept on import; extension tags don't constrain structural shape) | full |

loss in accurate mode: zero, by design. the only thing not preserved is whatever the importer's UI can't display - that's a viewer issue, not a file issue.

users pick this tier for: archival, sharing between Trees collaborators, posting to the wiki for round-trip. banner reads "fully readable by FamilyTree Editor; other GEDCOM 7 tools see extras as comments."

### 9.3 ui flow

file → export menu offers two explicit choices with one-line subtitles:

- **GEDZIP (compatible)** — "works with Ancestry, MyHeritage, Gramps. Loses fictional details."
- **GEDZIP (accurate)** — "preserves everything. Other tools see extras as comments." *(default)*

the existing dropped-fields banner runs against both tiers separately ([`fieldsDroppedFor`](../../apps/web/src/lib/io/warnings.ts) gains a per-tier branch); the user sees the diff before downloading.

`ExportTarget` in [`io/warnings.ts`](../../apps/web/src/lib/io/warnings.ts) becomes `'gedzip-compatible' | 'gedzip-accurate'`; existing `'gedzip'` callers map to `'gedzip-compatible'` for back-compat. (the `'json'` target reserved in [`agents.md`](../agents.md) §8.2 stays out of scope here; if it lands later it joins this enum as a third value, no other changes needed.)

### 9.4 minimum information loss for tier 1 (compatible)

ordered by ROI, all without leaving standard tags:

1. **emit GEDCOM 7, not 5.5**. unlocks `SEX X` for non-binary, the `HEAD.SCHMA` extension registry (lets us upgrade tier 1 → tier 2 by header diff), `MARR / TYPE` qualifiers, multi-FAMC with distinct PEDI.
2. **collapse N-ary unions to primary pair + chain of additional pair-FAMs**, ordered by `isPrimary`. reader sees the primary union with all kids; extras appear as linked separate FAMs.
3. **collapse `>2` parents to primary pair + N-2 FAMC links with `PEDI adopted`/`foster`/`sealing`**. loses co-equal semantic but every parent is at least present and reachable.
4. **emit structured NOTE blocks for everything dropped** (gender identity, species, origin, transformations, group memberships) with a stable prefix like `# trees: species=dragon` so a re-import by our own tool can heuristically recover most fields. poor man's extension; lossy through other tools, lossless if it comes back to us. tier 2 does the same thing properly via `HEAD.SCHMA`.
5. **never emit self-couple / self-parent / explicit-cycle records** in tier 1; the exporter raises a blocking error and points the user at tier 2.

after 1-4, the bulk of "ordinary same-sex / multi-parent / adoptive" trees export to compatible-mode losslessly. only genuinely fictional content (transformations, dynasties, polycules, non-standard species, time loops) requires tier 2.

---

## 10. references

primary:

- bennett et al. 2008 - standardized human pedigree nomenclature (NSGC, j. of genetic counseling)
- bennett et al. 2022 - sex and gender inclusivity revision (NSGC)
- mcgoldrick & gerson - **genograms: assessment and intervention** (the canonical genogram vocabulary)
- gedcom 5.5 / gedcom 7 specifications (gedcom.io)
- familysearch ordinances policy (LDS sealings)

complementary:

- nsgc 2022 PDF: https://www.nsgc.org/Portals/0/J.E.D.I/Journal%20of%20Genetic%20Counseling%20-%202022%20-%20Bennett%20-%20Practice%20resourcefocused%20revision%20%20Standardized%20pedigree%20nomenclature.pdf
- iowa institute of human genetics - pedigree symbols guide
- family tree magazine - guide to nontraditional family trees
- sixgen.org - LGBTQ genealogy & software (series, parts 1-5) - documents where consumer tools fail
- genopro - emotional relationships in genograms (line vocabulary)
- creately - genogram symbols guide
- comparison of genealogy software (wikipedia)
- world anvil - bloodlines (community feedback documents the gaps)
- royal kennel club / institute of canine biology - COI / duplicate-ancestor handling
- usefulcharts - targaryen / habsburg posters (heraldic + dynastic conventions)
- wikipedia - help:family trees + template:family tree

internal:

- [`notes/agents.md`](../agents.md) §8.1 (permissive schema rule), §8.3 (migration runner contract)
- [`notes/to-do.md`](../to-do.md) - queued schema bumps (`parentIds[]`, `relationships[]`, birthOrder, family naming)
- [`notes/bugs.md`](../bugs.md) - multi-spouse bond routing defect + negative-drop defect (both load-bearing prerequisites for n-ary union routing)
- [`hyperbolic-geometry`] skill, [`tree-layout-ir`] skill, [`tree-debugger`] skill
