# bugs — fix-test-placement

## open (none)

### B1 — three tests misclassified as "stay in tree-editor" (found phase 0)
- `toggle-indicator-sweep.test.ts`: tests Menu/MenuHarness exclusively; imports `MenuHarness` and `type MenuEntry from "$lib/components/shell/menu"` — pure attu-ui code; should MOVE to attu-ui in phase 3
- `toggle-indicator-visible-state.test.ts`: not in d7cefc4's 37-file list; cascade-fails because it imports `ToggleMenuHarness` which has broken imports; tests only attu-ui's Menu toggle behavior; should MOVE to attu-ui in phase 3
- `keyboard-reachability-dateinput.test.ts`: not in d7cefc4's 37-file list; cascade-fails because it imports `TabOrderHarness` which has broken imports; tests only attu-ui's DateInput; should MOVE to attu-ui in phase 3
- **route:** plan-revise phase 3 to add these three files; plan-revise phase 4 to remove toggle-indicator-sweep from scope (it becomes a phase-3 move, not a phase-4 fix)

### B2 — pre-existing @attu/ui type imports not from d7cefc4 (found phase 0)
- `CommandPalette.test.ts`: `import type { PaletteItem } from "@attu/ui"` — pre-existed d7cefc4; after move to attu-ui this needs updating to `import type { PaletteItem } from "$lib/components/palette/types"` (or wherever PaletteItem is defined in attu-ui $lib)
- `selection-palette-pick.test.ts`: same type import; stays in tree-editor where `@attu/ui` is appropriate
- **route:** add to phase 3 DoD: verify `CommandPalette.test.ts` has no `@attu/ui` imports after move (fix PaletteItem import to `$lib`)

## closed

### B1 — three tests misclassified as "stay in tree-editor" (phase 0 → closed by plan-revision)
toggle-indicator-sweep, toggle-indicator-visible-state, keyboard-reachability-dateinput reclassified to phase 3 move list.

### B2 — pre-existing @attu/ui type imports (phase 0 → closed by plan-revision)
CommandPalette.test.ts PaletteItem fix added to phase 3 DoD. selection-palette-pick.test.ts keeps its @attu/ui type import (appropriate for a tree-editor stay-file).
