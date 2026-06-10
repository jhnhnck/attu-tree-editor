# bugs — migrate debug menu into dock

bug-triage operates on this file.

## open

- :o: `low priority` `low effort` `pre-existing` `defer` `visual-akarians-family-view.spec.ts` golden is stale on trunk - the baseline `apps/web/tests/e2e/visual-akarians-family-view.spec.ts-snapshots/akarians-family-view-chromium-linux.png` was last regenerated at commit `ab084cc` (before the per-card COI badge feature `1fd5528` and the pill-row horizontal reflow `4ad316d`). diff shows: tree zoom shift from chrome-bbox change (dock pill row is now wider), and new COI percent badges on cards. **disposition (2026-05-26): defer** — not caused by this plan; route to a separate "regenerate visuals" task on trunk.

## closed

(none)
