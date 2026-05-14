# HEAD.SCHMA interop probe

Synthetic GEDCOM 7 fixture for the relationship-vocabulary plan Phase 0
HEAD.SCHMA interop probe (see [notes/plans/relationship-vocabulary.md](../../../../notes/plans/relationship-vocabulary.md)).

## What it tests

The single file [head-schma-probe.ged](./head-schma-probe.ged) carries
a small family tree (5 people, House Veylan) annotated with every
extension tag the relationship-vocabulary plan will eventually emit:

- `_TREES_SPECIES` / `_TREES_PERSON_KIND` (Phase 5)
- `_TREES_GENDER_IDENTITY` / `_TREES_PRONOUNS` / `_TREES_GENDER_FLUID`
  (Phase 5)
- `_TREES_KIND` / `_TREES_CLOSED` on the union (Phase 3)
- `_TREES_REL` top-level record for an oath-sibling bond (Phase 4)
- `_TREES_GROUP` top-level record for House Veylan (Phase 6a)

All extension tags are registered in the `HEAD.SCHMA` block under the
`https://attuproject.org/trees/schema/v1#` namespace.

## How to run the probe (manual; user-driven)

The plan calls for uploading this file to four free-tier consumer
genealogy tools and recording per tool: did it load? were the
`_TREES_*` tags preserved on re-export, or stripped? did the
registration header cause warnings? was there a hard error?

1. **Gramps** — install locally (free, open-source). File → Import →
   GEDCOM. Check the import log for warnings; re-export and diff.
2. **Ancestry** (free tier) — Trees → Import GEDCOM. Check whether
   private tags survive a download.
3. **MyHeritage** (free tier) — Family Tree → Import. Same check.
4. **FamilySearch** (free) — Family Tree → Sources → Add. Same check.

Record outcomes in
[notes/plans/relationship-vocabulary.md](../../../../notes/plans/relationship-vocabulary.md)
under the Phase 0 bug-log section. Per user feedback the probe is
accepted-for-now — its outcome is informational, not scope-driving;
Phase 8 (single-tier GEDZIP + ship polish) revisits the result.

## What this file is NOT

- Not a regression test (no automated test harness loads it).
- Not the canonical Akarians fixture (`Akarians.ged` — that's the
  layered-engine test fixture).
- Not consumed by the editor at runtime — `notes/agents.md` documents
  the editor's GEDCOM 5.5.1 emission today; Phase 8 upgrades to GEDCOM
  7 with `HEAD.SCHMA` always-on.
