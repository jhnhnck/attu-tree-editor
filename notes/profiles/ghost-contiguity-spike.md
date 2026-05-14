# Ghost-contiguity algorithm spike (Phase 0c, 14 May 2026)

Feasibility spike for the post-pass that closes [bugs.md:13](../bugs.md#L13). See [notes/plans/layered-and-tooling.md](../plans/layered-and-tooling.md) Phase 0c for the go/no-go gate.

## Per-fixture results

| fixture | k | initial crossings | final crossings | Δ crossings | initial stranded (>5u) | final stranded | closure | swaps tried | swaps accepted | acceptance |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ghostStrandingDistilled | 0 | 0 | 0 | n/a | 1 | 1 | 0.0% | 1 | 0 | 0.0% |
| ghostStrandingDistilled | 2 | 0 | 0 | n/a | 1 | 1 | 0.0% | 1 | 0 | 0.0% |
| Akarians | 0 | 2734 | 2734 | 0.0% | 8 | 8 | 0.0% | 3 | 0 | 0.0% |
| Akarians | 2 | 2734 | 2734 | 0.0% | 8 | 8 | 0.0% | 3 | 0 | 0.0% |

## Verdict — Akarians DEMO (load-bearing)

- **k=0 strict**: closure 0.0%, crossings Δ 0.0% → **red**
- **k=2 relaxed**: closure 0.0%, crossings Δ 0.0% → **red**

**Overall Phase 2 gate: red**

Phase 2 is **dropped**. File [bugs.md:13](../bugs.md#L13) as a follow-up requiring a more sophisticated algorithm (e.g. moving the near toward the cluster median, or two-sided rank ordering). This plan ends at Phase 1 + 3 + 4.
