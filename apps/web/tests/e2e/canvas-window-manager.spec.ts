/*
 * FamilyTreeEditor - canvas-window-manager e2e
 * licensed under the MIT license; see LICENSE.md for full text
 *
 * runs against chromium + mobile (Pixel 7 device descriptor via
 * playwright.config.ts) so the same code drives both projects;
 * touch / pointer behaviour is covered by the synthetic touch path
 * playwright's mobile project exposes.
 *
 * canvas-window-manager phase 4: the phase-0 hello-world demo + the
 * popout-chrome probe deleted (DoD #12). the contract assertions
 * that previously rode on the demo windows (focus, pop-out, drag,
 * bbox clamp, pointer-no-fallthrough) relocated onto production
 * callers — the save-status Window is the canonical drag/pop target
 * because it's the only kind="window" item with both a docked + a
 * popped-out form across every viewport.
 */

import { test, expect, type Page } from "@playwright/test";

// taskbar model (canvas-chrome-v2 phase 6): a docked window renders its
// surface (titlebar + body) ONLY when docked-expanded; a docked-minimized
// window is represented by its taskbar pill alone. save-status and stats
// both load docked-MINIMIZED, so their titlebar / pop-out / collapse
// controls do not exist until the window is expanded. clicking a docked-
// minimized window's pill (pillClick) restores + expands it. this helper
// expands a window by clicking its pill and waits for the titlebar to
// appear, so the contract tests below can reach the window chrome.
async function expandViaPill(page: Page, pillTestId: string, windowId: string) {
    await expect(page.getByTestId(pillTestId)).toBeVisible();
    await page.getByTestId(pillTestId).click();
    await expect(page.getByTestId(`${windowId}-titlebar`)).toBeVisible();
}

test.describe("canvas-window-manager — production Window contract", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try {
                localStorage.clear();
                localStorage.setItem("fte.defaultEngine", "family-view");
            } catch {
                /* non-fatal */
            }
        });
    });

    test("save-status pill mounts inside the canvas-chrome tl dock", async ({ page }) => {
        // taskbar model: save-status loads docked-minimized, so the dock
        // carries its PILL (not a titlebar). expanding via the pill reveals
        // the window surface.
        await page.goto("/");
        const dock = page.getByTestId("canvas-chrome-dock-tl");
        await expect(dock).toBeVisible();
        await expect(page.getByTestId("save-status-pill")).toBeVisible();
        // minimized → no titlebar until expanded
        await expect(page.getByTestId("save-status-window-titlebar")).toHaveCount(0);
        await expandViaPill(page, "save-status-pill", "save-status-window");
    });

    test("clicking the save-status titlebar focuses the window", async ({ page }) => {
        await page.goto("/");
        await expandViaPill(page, "save-status-pill", "save-status-window");
        const window = page.locator("[data-canvas-window][data-window-id='save-status-window']");
        await expect(window).toBeVisible();
        await page.getByTestId("save-status-window-titlebar").click();
        await expect(window).toHaveAttribute("data-focused", "true");
    });

    test("popping out the save-status Window moves it into the WindowOverlay", async ({ page }) => {
        await page.goto("/");
        await expandViaPill(page, "save-status-pill", "save-status-window");
        const overlay = page.getByTestId("canvas-window-overlay");
        await expect(overlay).toBeAttached();
        await expect(
            overlay.locator("[data-popout-wrapper][data-window-id='save-status-window']"),
        ).toHaveCount(0);

        await page.getByTestId("save-status-window-popout").click();
        await expect(
            overlay.locator("[data-popout-wrapper][data-window-id='save-status-window']"),
        ).toBeVisible();
        // dock's docked copy hides (CanvasChromeDock filters popped-out items)
        const dock = page.getByTestId("canvas-chrome-dock-tl");
        await expect(dock.locator("[data-window-id='save-status-window']")).toHaveCount(0);
    });

    test("re-dock control flips back from the overlay into the dock", async ({ page }) => {
        await page.goto("/");
        await expandViaPill(page, "save-status-pill", "save-status-window");
        await page.getByTestId("save-status-window-popout").click();
        const overlay = page.getByTestId("canvas-window-overlay");
        await expect(
            overlay.locator("[data-popout-wrapper][data-window-id='save-status-window']"),
        ).toBeVisible();

        await page.getByTestId("save-status-window-popout").click();
        await expect(
            overlay.locator("[data-popout-wrapper][data-window-id='save-status-window']"),
        ).toHaveCount(0);
        // re-docked + still expanded → the docked window surface returns
        const dock = page.getByTestId("canvas-chrome-dock-tl");
        await expect(dock.locator("[data-window-id='save-status-window']")).toBeVisible();
    });

    test("WindowOverlay positioning wrapper does NOT carry data-canvas-chrome (phase-0 probe verdict)", async ({
        page,
    }) => {
        // pin the phase-0 probe verdict: popped-out wrappers do NOT
        // carry data-canvas-chrome so fitToView pans canvas content
        // under the popped-out window (matching the "drag aside to
        // reference" intent).
        await page.goto("/");
        await expandViaPill(page, "save-status-pill", "save-status-window");
        await page.getByTestId("save-status-window-popout").click();
        const popout = page.locator("[data-popout-wrapper][data-window-id='save-status-window']");
        await expect(popout).toBeVisible();
        const hasChromeAttr = await popout.evaluate((el) => el.hasAttribute("data-canvas-chrome"));
        expect(hasChromeAttr).toBe(false);
    });
});

test.describe("canvas-window-manager — drag + bbox follow + anchor anti-jump", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try {
                localStorage.clear();
                localStorage.setItem("fte.defaultEngine", "family-view");
            } catch {
                /* non-fatal */
            }
        });
    });

    // utility — pops out a window by its id and returns the overlay
    // wrapper locator. taskbar model (phase 6): a window must be docked-
    // expanded before its pop-out control exists, so we expand it via its
    // pill first when the titlebar isn't already showing. the pill testid
    // is derived from the well-known window↔pill pairs (save-status-window
    // → save-status-pill, stats-window → stats-pill). asserts the wrapper
    // exists after the pop-out click so failure surfaces at the right step.
    async function popOutAndGrab(page: import("@playwright/test").Page, id: string) {
        const pillTestId = id === "save-status-window" ? "save-status-pill" : "stats-pill";
        if ((await page.getByTestId(`${id}-titlebar`).count()) === 0) {
            await expect(page.getByTestId(pillTestId)).toBeVisible();
            await page.getByTestId(pillTestId).click();
            await expect(page.getByTestId(`${id}-titlebar`)).toBeVisible();
        }
        await page.getByTestId(`${id}-popout`).click();
        const wrapper = page.locator(`[data-popout-wrapper][data-window-id='${id}']`);
        await expect(wrapper).toBeVisible();
        return wrapper;
    }

    test("popped-out save-status Window drags 100px right and back; final bbox inside host", async ({
        page,
    }) => {
        await page.goto("/");
        const wrapper = await popOutAndGrab(page, "save-status-window");
        const host = page.locator("[data-canvas-host]");
        const hostBox = await host.boundingBox();
        const startBox = await wrapper.boundingBox();
        if (!hostBox || !startBox) throw new Error("missing bbox");

        // drag the titlebar 100px to the right via pointer events.
        const titlebar = page.getByTestId("save-status-window-titlebar");
        const titlebarBox = await titlebar.boundingBox();
        if (!titlebarBox) throw new Error("no titlebar bbox");
        const startX = titlebarBox.x + titlebarBox.width / 2;
        const startY = titlebarBox.y + titlebarBox.height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 100, startY, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(50);

        // assert the wrapper moved
        const midBox = await wrapper.boundingBox();
        if (!midBox) throw new Error("no mid bbox");
        expect(midBox.x).toBeGreaterThan(startBox.x);

        // drag back
        const newTitlebarBox = await titlebar.boundingBox();
        if (!newTitlebarBox) throw new Error("no new titlebar bbox");
        const t2x = newTitlebarBox.x + newTitlebarBox.width / 2;
        const t2y = newTitlebarBox.y + newTitlebarBox.height / 2;
        await page.mouse.move(t2x, t2y);
        await page.mouse.down();
        await page.mouse.move(t2x - 100, t2y, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(50);

        // final bbox inside host
        const endBox = await wrapper.boundingBox();
        if (!endBox) throw new Error("no end bbox");
        expect(endBox.x).toBeGreaterThanOrEqual(hostBox.x);
        expect(endBox.x + endBox.width).toBeLessThanOrEqual(hostBox.x + hostBox.width);
        expect(endBox.y).toBeGreaterThanOrEqual(hostBox.y);
        expect(endBox.y + endBox.height).toBeLessThanOrEqual(hostBox.y + hostBox.height);
    });

    test("clicking the lower-z popped-out window's titlebar brings it to top-z", async ({
        page,
    }, info) => {
        // chromium-only: this needs two windows popped out simultaneously
        // by clicking each dock pop-out control. on a 412px viewport a
        // 301px-wide popout covers the remaining dock controls (the tl
        // dock + a 301px window leave no clear column), so the second
        // pop-out click is intercepted. the z-order logic under test is
        // viewport-independent and fully exercised here.
        test.skip(info.project.name !== "chromium", "z-order drag mechanics run on chromium only");
        // seed stats-window as open so the stats Window registers on load
        await page.addInitScript(() => {
            localStorage.setItem("fte.dock.openedWindows", '["stats-window"]');
        });
        await page.goto("/");
        await popOutAndGrab(page, "save-status-window");
        await popOutAndGrab(page, "stats-window");
        const wrapperA = page.locator("[data-popout-wrapper][data-window-id='save-status-window']");
        const wrapperB = page.locator("[data-popout-wrapper][data-window-id='stats-window']");

        // drag B aside so A's titlebar is fully uncovered for the click.
        // the +24px cascade leaves B mostly overlapping A; without
        // separation, B's pointer-events-auto wrapper intercepts the
        // click intended for A's titlebar.
        const tbB = await page.getByTestId("stats-window-titlebar").boundingBox();
        if (!tbB) throw new Error("no titlebar B bbox");
        await page.mouse.move(tbB.x + tbB.width / 2, tbB.y + tbB.height / 2);
        await page.mouse.down();
        await page.mouse.move(tbB.x + tbB.width / 2, tbB.y + tbB.height / 2 + 200, {
            steps: 10,
        });
        await page.mouse.up();
        await page.waitForTimeout(50);

        // popping out B last raised it to the top of the z-band; click
        // A's titlebar to bring it forward.
        await page.getByTestId("save-status-window-titlebar").click();
        await page.waitForTimeout(20);

        const zA = await wrapperA.evaluate((el) =>
            parseInt((el as HTMLElement).style.zIndex || "0", 10),
        );
        const zB = await wrapperB.evaluate((el) =>
            parseInt((el as HTMLElement).style.zIndex || "0", 10),
        );
        expect(zA).toBeGreaterThan(zB);
    });

    test("dragging to each canvas-host edge releases inside host - 8px", async ({ page }) => {
        await page.goto("/");
        const wrapper = await popOutAndGrab(page, "save-status-window");
        const host = page.locator("[data-canvas-host]");
        const hostBoxMaybe = await host.boundingBox();
        if (!hostBoxMaybe) throw new Error("missing host bbox");
        const hb = hostBoxMaybe;

        // helper to drag to a target page-coord and assert the wrapper
        // ends up inside host - 8px on the matching edge.
        async function dragTo(tx: number, ty: number, edge: "left" | "right" | "top" | "bottom") {
            const titlebar = page.getByTestId("save-status-window-titlebar");
            const tb = await titlebar.boundingBox();
            if (!tb) throw new Error("no titlebar bbox");
            const sx = tb.x + tb.width / 2;
            const sy = tb.y + tb.height / 2;
            await page.mouse.move(sx, sy);
            await page.mouse.down();
            await page.mouse.move(tx, ty, { steps: 10 });
            await page.mouse.up();
            await page.waitForTimeout(50);
            const w = await wrapper.boundingBox();
            if (!w) throw new Error("no wrapper bbox after drag");
            if (edge === "left") expect(w.x).toBeGreaterThanOrEqual(hb.x);
            if (edge === "right") expect(w.x + w.width).toBeLessThanOrEqual(hb.x + hb.width);
            if (edge === "top") expect(w.y).toBeGreaterThanOrEqual(hb.y);
            if (edge === "bottom") expect(w.y + w.height).toBeLessThanOrEqual(hb.y + hb.height);
        }

        await dragTo(hb.x - 200, hb.y + hb.height / 2, "left");
        await dragTo(hb.x + hb.width + 200, hb.y + hb.height / 2, "right");
        await dragTo(hb.x + hb.width / 2, hb.y - 200, "top");
        await dragTo(hb.x + hb.width / 2, hb.y + hb.height + 200, "bottom");
    });

    test("opening sheet inspector re-clamps a popped-out window inside the post-resize host", async ({
        page,
    }, testInfo) => {
        // pixel-7 viewport: selecting a card auto-opens the sheet
        // inspector; that's the host-resize event we want to react to.
        // chromium at desktop viewport doesn't open the sheet so we
        // skip it there.
        const isMobile = testInfo.project.name === "mobile";
        test.skip(!isMobile, "sheet-inspector auto-open only fires on mobile viewport");

        await page.goto("/");
        await popOutAndGrab(page, "save-status-window");
        const wrapper = page.locator("[data-popout-wrapper][data-window-id='save-status-window']");
        // park it near the bottom so the sheet resize will need to
        // clamp the window upward.
        const titlebar = page.getByTestId("save-status-window-titlebar");
        const tb = await titlebar.boundingBox();
        const host = page.locator("[data-canvas-host]");
        const hostBox = await host.boundingBox();
        if (!tb || !hostBox) throw new Error("missing bbox");
        await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
        await page.mouse.down();
        await page.mouse.move(hostBox.x + hostBox.width / 2, hostBox.y + hostBox.height - 20, {
            steps: 10,
        });
        await page.mouse.up();
        await page.waitForTimeout(50);

        // open the sheet inspector by selecting a person card
        const cards = page.locator("[data-person-id]");
        await cards.first().click({ force: true });
        const inspector = page.locator('[aria-label="person inspector"]');
        await expect(inspector).toBeVisible();
        await page.waitForTimeout(400);

        // post-resize host shrinks; wrapper must clamp upward.
        const postHostBox = await host.boundingBox();
        const postBox = await wrapper.boundingBox();
        if (!postHostBox || !postBox) throw new Error("missing post bbox");
        expect(postBox.y + postBox.height).toBeLessThanOrEqual(
            postHostBox.y + postHostBox.height + 1,
        );
    });

    test("popping out a docked window removes it from the dock's visible set", async ({ page }) => {
        // popping out save-status removes it from the dock's visible set
        // (the items filter skips entries whose id is in popOutStates).
        // this is the core contract; force-collapse machinery was retired
        // in canvas-chrome-v2 phase 0.
        await page.addInitScript(() => localStorage.setItem("fte.debug.mode", "true"));
        await page.setViewportSize({ width: 600, height: 500 });
        await page.goto("/");

        const dock = page.getByTestId("canvas-chrome-dock-tl");
        // taskbar model: expand save-status via its pill so its docked
        // window surface (data-window-id) renders before we pop it out.
        await expandViaPill(page, "save-status-pill", "save-status-window");
        await expect(dock.locator("[data-window-id='save-status-window']")).toBeVisible();

        await page
            .getByTestId("save-status-window-popout")
            .evaluate((el) => (el as HTMLElement).click());
        await page.waitForTimeout(100);

        await expect(dock.locator("[data-window-id='save-status-window']")).toHaveCount(0);
    });

    // "popping out three windows keeps none overlapping the dock bbox"
    // (at 412x915) retired in canvas-chrome-v2 phase 0. it encoded the
    // bl-dock geometry: popouts cascade top-right, the dock sat bottom-
    // left, so the corners never collided "by construction". phase 0
    // moved the dock to tl with a full-height container (top-3 to
    // bottom-3, pointer-events-none, overflow-clip), so its bbox now
    // spans the whole left column — and on a 412px viewport a 301px-wide
    // popout cannot avoid overlapping it horizontally. the no-overlap
    // invariant is unsatisfiable under the new layout; pointer access to
    // dock controls under popouts is covered on desktop by the z-order
    // test below (chromium-only).

    // anchor anti-jump test retired in canvas-chrome-v2 phase 0: the
    // bottomClampPx / antiJumpHold mechanism was removed alongside
    // measureAndForceCollapse. tl dock positions via css top-3 with no
    // dynamic bottom override, so the jump no longer occurs.

    test("titlebar pointer drag over a card does not select the card or pan the canvas", async ({
        page,
    }) => {
        await page.goto("/");
        await popOutAndGrab(page, "save-status-window");

        // wait for a person card to appear so we can drag the
        // titlebar OVER it; ensures the titlebar pointer handlers
        // win over canvas + card listeners.
        const firstCard = page.locator("[data-person-id]").first();
        await expect(firstCard).toBeVisible();
        const cardBox = await firstCard.boundingBox();
        const titlebar = page.getByTestId("save-status-window-titlebar");
        const tb = await titlebar.boundingBox();
        if (!cardBox || !tb) throw new Error("missing bbox");

        // record the initial selection by reading from the dom — no
        // person card should be selected at start.
        const selectedBefore = await page.locator("[data-person-id][aria-pressed='true']").count();

        await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
        await page.mouse.down();
        // drag the titlebar over the card and release on top of it.
        await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2, {
            steps: 12,
        });
        await page.mouse.up();
        await page.waitForTimeout(50);

        // selection unchanged
        const selectedAfter = await page.locator("[data-person-id][aria-pressed='true']").count();
        expect(selectedAfter).toBe(selectedBefore);

        // window position should equal the release point modulo the
        // press-offset clamp. easier assertion: the titlebar's center
        // is near the card center (proves drag tracked the pointer
        // rather than fell through to a canvas pan).
        const newTitlebarBox = await titlebar.boundingBox();
        if (!newTitlebarBox) throw new Error("missing titlebar bbox after drag");
        const titlebarCenterY = newTitlebarBox.y + newTitlebarBox.height / 2;
        const cardCenterY = cardBox.y + cardBox.height / 2;
        // allow generous slack — clamp at the host edge may pull the
        // titlebar away from the exact card center. proving it landed
        // anywhere near the release point (and not back at the cascade
        // origin or off-screen) is the regression-catching guarantee.
        expect(Math.abs(titlebarCenterY - cardCenterY)).toBeLessThan(120);
    });
});

test.describe("canvas-window-manager phase 3 — debug-mode vs debug-menu-open split", () => {
    // each test sets fte.debug.mode in localStorage before navigation so
    // the debug pill registers on first paint. the help-menu toggle is
    // exercised in its own dedicated test below.
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try {
                localStorage.clear();
                localStorage.setItem("fte.defaultEngine", "family-view");
            } catch {
                /* non-fatal */
            }
        });
    });

    test("titlebar × closes the menu but leaves debug effects rendering", async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem("fte.debug.mode", "true"));
        await page.goto("/");
        // open the menu via the pill, then flip a debug overlay so we
        // have an observable debug effect to assert against.
        await page.getByTestId("debug-pill").click();
        await expect(page.getByTestId("debug-panel")).toBeVisible();
        // grid overlay is the canonical "is debugOptions still firing"
        // tell. flip it on, close the menu, assert overlay still paints.
        await page.getByTestId("debug-toggle-fv-showGrid").click();
        // close the menu via the Window titlebar's ×
        await page.getByTestId("debug-menu-close").click();
        await expect(page.getByTestId("debug-panel")).toHaveCount(0);
        // debug pill stays — debugMode is still on
        await expect(page.getByTestId("debug-pill")).toBeVisible();
        // and the grid toggle is preserved in state (re-opening shows
        // it still pressed) — proxy assertion that debugMode persisted
        // through the menu close
        await page.getByTestId("debug-pill").click();
        await expect(page.getByTestId("debug-toggle-fv-showGrid")).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    test("disable-debug-mode button retires effects, menu, and pill in one click", async ({
        page,
    }) => {
        await page.addInitScript(() => localStorage.setItem("fte.debug.mode", "true"));
        await page.goto("/");
        await page.getByTestId("debug-pill").click();
        await expect(page.getByTestId("debug-panel")).toBeVisible();
        // click "disable debug mode" inside the menu body
        await page.getByTestId("debug-disable").click();
        // menu unmounts
        await expect(page.getByTestId("debug-panel")).toHaveCount(0);
        // pill unmounts
        await expect(page.getByTestId("debug-pill")).toHaveCount(0);
    });

    test("Help -> Debug mode toggle off while menu open auto-closes the menu", async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem("fte.debug.mode", "true"));
        await page.goto("/");
        await page.getByTestId("debug-pill").click();
        await expect(page.getByTestId("debug-panel")).toBeVisible();
        // open the Help menu and click the Debug mode item
        await page.getByRole("button", { name: "Help" }).click();
        await page.getByRole("menuitem", { name: /Debug mode/ }).click();
        // menu auto-closes, pill retires
        await expect(page.getByTestId("debug-panel")).toHaveCount(0);
        await expect(page.getByTestId("debug-pill")).toHaveCount(0);
    });

    test("debug mode persists across reload; menu open state does not", async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem("fte.debug.mode", "true"));
        await page.goto("/");
        await expect(page.getByTestId("debug-pill")).toBeVisible();
        // open the menu so we can prove menu-open does NOT persist
        await page.getByTestId("debug-pill").click();
        await expect(page.getByTestId("debug-panel")).toBeVisible();
        // reload preserves localStorage but resets transient state
        await page.reload();
        await expect(page.getByTestId("debug-pill")).toBeVisible();
        await expect(page.getByTestId("debug-panel")).toHaveCount(0);
    });
});

test.describe("canvas-window-manager phase 4 — content fixes", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try {
                localStorage.clear();
                localStorage.setItem("fte.defaultEngine", "family-view");
            } catch {
                /* non-fatal */
            }
        });
    });

    test("save pill renders two glyphs (local + remote)", async ({ page }) => {
        await page.goto("/");
        const local = page.getByTestId("save-status-local-glyph");
        const remote = page.getByTestId("save-status-remote-glyph");
        await expect(local).toBeVisible();
        await expect(remote).toBeVisible();
        // initial state on a fresh untitled tree: not dirty, not signed in
        await expect(local).toHaveAttribute("data-state", "persisted");
        // tone is "saved" but no remote configured (cloud-off rendered)
        await expect(remote).toHaveAttribute("data-state", "saved");
    });

    test("expanding save Window via the pill shows local + remote rows", async ({ page }) => {
        // taskbar model (phase 6): save-status loads docked-minimized, so
        // there is no collapse button to grab. clicking the pill restores +
        // expands the window (pillClick docked-minimized branch), revealing
        // the body rows.
        await page.goto("/");
        await page.getByTestId("save-status-pill").click();
        await expect(page.getByTestId("save-status-popover")).toBeVisible();
        await expect(page.getByTestId("save-status-row-local")).toBeVisible();
        await expect(page.getByTestId("save-status-row-remote")).toBeVisible();
        // runtime row hides when debugMode is off
        await expect(page.getByTestId("save-status-row-runtime")).toHaveCount(0);
    });

    test("save Window runtime row shows editRev when debugMode is on", async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem("fte.debug.mode", "true"));
        await page.goto("/");
        await page.getByTestId("save-status-pill").click();
        await expect(page.getByTestId("save-status-row-runtime")).toBeVisible();
        await expect(page.getByTestId("save-status-edit-rev")).toBeVisible();
    });

    test("stats Window row click switches the pill metric", async ({ page }) => {
        // seed stats-window as open so the pill + window register on load
        await page.addInitScript(() => {
            localStorage.setItem("fte.dock.openedWindows", '["stats-window"]');
        });
        await page.goto("/");
        // wait for the stats pill to render (only when layoutStats + isOpen)
        const pill = page.getByTestId("stats-pill");
        await expect(pill).toBeVisible();
        // default metric is people
        await expect(pill).toHaveAttribute("data-selected-metric", "people");
        // taskbar model (phase 6): stats loads docked-minimized, so there
        // is no collapse button. click the pill to restore + expand the
        // window body (pillClick docked-minimized branch).
        await page.getByTestId("stats-pill").click();
        await expect(page.getByTestId("stats-popover")).toBeVisible();
        // clusters row may not exist on a single-cluster tree; only run
        // the click-to-switch assertion when the row is present
        const clustersRow = page.getByTestId("stats-row-clusters");
        if ((await clustersRow.count()) > 0) {
            await clustersRow.click();
            await expect(pill).toHaveAttribute("data-selected-metric", "clusters");
        }
        await page.getByTestId("stats-row-people").click();
        await expect(pill).toHaveAttribute("data-selected-metric", "people");
    });

    test("coi-breakdown Window mounts on a tree with zero consanguinity", async ({ page }) => {
        // phase-0 verdict-E fix: registration no longer gates on
        // coiBreakdown.length > 0. opening the toggle on an untitled
        // tree should mount the panel even though there are zero rows.
        await page.addInitScript(() => localStorage.setItem("fte.debug.mode", "true"));
        await page.goto("/");
        await page.keyboard.press("Control+Shift+KeyD");
        await expect(page.getByTestId("debug-panel")).toBeVisible();
        await page.getByTestId("debug-toggle-fv-showCoiBreakdown").click();
        await expect(page.getByTestId("family-view-debug-coi-breakdown")).toBeVisible();
    });

    test("benchmark: opening the debug menu p50 latency < 200ms", async ({ page }, info) => {
        // canvas-window-manager phase 4 benchmark assertion. the
        // phase-0 baseline named "load-bearing identity churn" in
        // DockRegistration's second $effect as the dominant cost; the
        // memo-by-identity fix in the same phase aims to keep the
        // open-menu p50 cheap. assert <200ms p50 across 5 trials —
        // generous to keep flake low on under-pressure CI, but still
        // catches the multi-hundred-ms regression class the phase-0
        // root cause produced.
        test.skip(info.project.name !== "chromium", "benchmark runs on chromium only");
        await page.addInitScript(() => localStorage.setItem("fte.debug.mode", "true"));
        await page.goto("/");
        await expect(page.getByTestId("debug-pill")).toBeVisible();

        const samples: number[] = [];
        for (let i = 0; i < 5; i++) {
            // make sure the menu is closed before each sample
            if ((await page.getByTestId("debug-panel").count()) > 0) {
                await page.keyboard.press("Control+Shift+KeyD");
                await expect(page.getByTestId("debug-panel")).toHaveCount(0);
            }
            const t0 = await page.evaluate(() => performance.now());
            await page.getByTestId("debug-pill").click();
            await page.getByTestId("debug-panel").waitFor({ state: "visible" });
            const t1 = await page.evaluate(() => performance.now());
            samples.push(t1 - t0);
        }
        samples.sort((a, b) => a - b);
        const p50 = samples[Math.floor(samples.length / 2)] ?? 0;
        console.info(`[canvas-window-manager] open-menu samples (ms): ${samples.join(", ")}`);
        console.info(`[canvas-window-manager] open-menu p50: ${p50.toFixed(1)} ms`);
        expect(p50).toBeLessThan(200);
    });
});

// kept in its own describe because the persistence assertions need
// fte.dock.openedWindows to survive page.reload(). the other describes'
// beforeEach clears localStorage via addInitScript, which re-runs on
// every navigation (including reload) and would wipe the open-state the
// test just wrote. playwright gives each test a fresh empty-storage
// context, so a clean start needs no explicit clear here — we only set
// the engine, idempotently, so it re-applies across the test's reloads.
test.describe("canvas-window-manager phase 0 — open/close persistence", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try {
                localStorage.setItem("fte.defaultEngine", "family-view");
            } catch {
                /* non-fatal */
            }
        });
    });

    test("canvas-chrome-v2 phase 0 walking skeleton: stats window open/close/persist lifecycle", async ({
        page,
    }) => {
        // fresh context → load → no stats pill → open via View menu →
        // pill appears → reload → pill still appears (persisted via
        // fte.dock.openedWindows) → close via X button → pill disappears →
        // reload → pill absent (persisted as closed).
        test.setTimeout(30_000);

        await page.goto("/");
        // default: fte.dock.openedWindows is absent; stats-window is closed.
        // the stats pill must be absent even after the canvas renders.
        await expect(page.locator("[data-person-id]").first()).toBeVisible();
        await expect(page.getByTestId("stats-pill")).toHaveCount(0);

        // open stats-window via View > Panels
        await page.getByRole("button", { name: "View" }).click();
        await page.getByRole("menuitem", { name: "stats", exact: true }).click();
        // pill should now mount (stats-window is open + layoutStats exists)
        await expect(page.getByTestId("stats-pill")).toBeVisible();

        // reload: fte.dock.openedWindows persisted → pill still visible.
        // taskbar model (phase 6): expand state is NOT persisted, so the
        // reopened window loads docked-minimized (pill only, no titlebar).
        await page.reload();
        await expect(page.locator("[data-person-id]").first()).toBeVisible();
        await expect(page.getByTestId("stats-pill")).toBeVisible();
        await expect(page.getByTestId("stats-window-titlebar")).toHaveCount(0);

        // expand via the pill so the titlebar × is reachable, then close
        await page.getByTestId("stats-pill").click();
        await expect(page.getByTestId("stats-window-titlebar")).toBeVisible();
        await page.getByTestId("stats-window-close").click();
        await expect(page.getByTestId("stats-pill")).toHaveCount(0);

        // reload: stats-window still closed (persisted as closed)
        await page.reload();
        await expect(page.locator("[data-person-id]").first()).toBeVisible();
        await expect(page.getByTestId("stats-pill")).toHaveCount(0);
    });
});

// canvas-chrome-v2 phase 2: the open/closed state machine drives every
// dock window, pills route through windowManager.pillClick (4-branch), and
// the debug menu's open-state is owned by windowManager (non-persisted)
// rather than a parallel debugMenuOpen flag.
test.describe("canvas-chrome-v2 phase 2 — pill state machine + debug-menu merge", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try {
                localStorage.setItem("fte.defaultEngine", "family-view");
            } catch {
                /* non-fatal */
            }
        });
    });

    test("clicking the stats pill restores (re-expands) a minimized stats window", async ({
        page,
    }) => {
        await page.goto("/");
        await expect(page.locator("[data-person-id]").first()).toBeVisible();

        // open stats via View > Panels — opens expanded by default
        await page.getByRole("button", { name: "View" }).click();
        await page.getByRole("menuitem", { name: "stats", exact: true }).click();
        await expect(page.getByTestId("stats-pill")).toBeVisible();
        const body = page.locator("#stats-window-body");
        await expect(body).toHaveAttribute("data-collapsed", "false");

        // minimize via the titlebar chevron. taskbar model (phase 6): a
        // docked-minimized window renders NOTHING in the dock (the whole
        // surface is filtered out), so the body element disappears entirely
        // — only the pill remains to represent it.
        await page.getByTestId("stats-window-collapse").click();
        await expect(body).toHaveCount(0);
        await expect(page.getByTestId("stats-window-titlebar")).toHaveCount(0);
        await expect(page.getByTestId("stats-pill")).toBeVisible();

        // clicking the pill on a docked-minimized window restores it (cc-v2
        // phase-2 pillClick branch), re-rendering the surface expanded
        await page.getByTestId("stats-pill").click();
        await expect(body).toHaveAttribute("data-collapsed", "false");
    });

    test("the debug pill toggles the debug menu open and closed via the merged windowManager path", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            try {
                localStorage.setItem("fte.debug.mode", "true");
            } catch {
                /* non-fatal */
            }
        });
        await page.goto("/");
        await expect(page.locator("[data-person-id]").first()).toBeVisible();

        const pill = page.getByTestId("debug-pill");
        await expect(pill).toBeVisible();
        // closed on load (open-state is non-persisted, fresh context)
        await expect(page.getByTestId("debug-panel")).toHaveCount(0);
        await expect(pill).toHaveAttribute("aria-pressed", "false");

        // first click opens
        await pill.click();
        await expect(page.getByTestId("debug-panel")).toBeVisible();
        await expect(pill).toHaveAttribute("aria-pressed", "true");

        // second click closes — the pill is a toggle through windowManager
        await pill.click();
        await expect(page.getByTestId("debug-panel")).toHaveCount(0);
        await expect(pill).toHaveAttribute("aria-pressed", "false");
    });
});

// taskbar model (canvas-chrome-v2 phase 6): drag-to-reorder lives on the
// TASKBAR PILLS, not the docked-window titlebars (most windows are minimized
// and have no titlebar). a pointerdown on a pill starts a HORIZONTAL drag;
// the drop math compares clientX against pill midpoints; the drop-indicator
// is a vertical accent line between pills. dragging a pill reorders the
// taskbar AND mirrors the order onto each pill's paired window so a docked-
// expanded window appears in the corresponding position. the three DoD
// cases: reorder a pill, drop-indicator visible mid-drag, cancel outside.
test.describe("canvas-chrome-v2 phase 6 — taskbar pill drag-to-reorder", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try {
                localStorage.clear();
                localStorage.setItem("fte.defaultEngine", "family-view");
                // debug mode on so the debug pill is reachable; seed stats
                // open so the tl taskbar carries save-status + stats + debug.
                localStorage.setItem("fte.debug.mode", "true");
                localStorage.setItem("fte.dock.openedWindows", '["stats-window"]');
            } catch {
                /* non-fatal */
            }
        });
        await page.setViewportSize({ width: 1280, height: 1100 });
    });

    // wait for all three tl taskbar pills (save-status, stats, debug) to
    // mount and return the pills-row locator.
    async function seedTaskbar(page: import("@playwright/test").Page) {
        await page.goto("/");
        await expect(page.locator("[data-person-id]").first()).toBeVisible();
        await expect(page.getByTestId("save-status-pill")).toBeVisible();
        await expect(page.getByTestId("stats-pill")).toBeVisible();
        await expect(page.getByTestId("debug-pill")).toBeVisible();
        return page.getByTestId("canvas-chrome-pills-tl");
    }

    // read the left-to-right pill order from the tl pills row. the row lays
    // pills out in sort order, so DOM order = visual order = sort order.
    async function pillOrderLeftToRight(pillRow: import("@playwright/test").Locator) {
        return pillRow
            .locator("[data-dock-pill-id]")
            .evaluateAll((els) =>
                els
                    .map((el) => el.getAttribute("data-dock-pill-id"))
                    .filter((id): id is string => id !== null),
            );
    }

    test("dragging the debug pill before the stats pill reorders the taskbar", async ({ page }) => {
        const pillRow = await seedTaskbar(page);
        // baseline: save-status (10), stats (20), debug-toggle (30)
        const before = await pillOrderLeftToRight(pillRow);
        expect(before.indexOf("stats")).toBeLessThan(before.indexOf("debug-toggle"));

        // drag the debug pill left, onto the stats pill's left half, so the
        // insert slot lands before stats.
        const debugPill = page.getByTestId("debug-pill");
        const statsPill = page.getByTestId("stats-pill");
        const dpb = await debugPill.boundingBox();
        const spb = await statsPill.boundingBox();
        if (!dpb || !spb) throw new Error("missing bbox");
        await page.mouse.move(dpb.x + dpb.width / 2, dpb.y + dpb.height / 2);
        await page.mouse.down();
        // move to just left of the stats pill's midpoint → insert before stats
        await page.mouse.move(spb.x + 2, spb.y + spb.height / 2, { steps: 12 });
        // the vertical drop-indicator should be visible mid-drag
        await expect(page.getByTestId("dock-drop-indicator").first()).toBeVisible();
        await page.mouse.up();
        await page.waitForTimeout(50);

        const after = await pillOrderLeftToRight(pillRow);
        // debug-toggle now sits before stats in the taskbar
        expect(after.indexOf("debug-toggle")).toBeLessThan(after.indexOf("stats"));
    });

    test("reordering a pill mirrors onto its docked-expanded window position", async ({ page }) => {
        const pillRow = await seedTaskbar(page);
        const dock = page.getByTestId("canvas-chrome-dock-tl");

        // expand both stats + debug windows so the panel stack carries both.
        // open debug first, then stats: the stats Window carries an outside-
        // click-close listener that minimizes it when a pointerdown lands
        // away from the stats window/pill, so we DRAG the STATS pill below
        // (its own pointerdown is exempt from that listener), keeping stats
        // expanded through the gesture. the debug menu has no auto-close.
        await page.getByTestId("debug-pill").click();
        await expect(dock.locator("[data-window-id='debug-menu']")).toBeVisible();
        await page.getByTestId("stats-pill").click();
        await expect(dock.locator("[data-window-id='stats-window']")).toBeVisible();

        // baseline window stack: stats-window (prio 25) above debug-menu (300)
        const windowOrder = async () =>
            dock
                .locator("[data-dock-panels] [data-dock-item-id]")
                .evaluateAll((els) =>
                    els
                        .map((el) => el.getAttribute("data-dock-item-id"))
                        .filter((id): id is string => id !== null),
                );
        const winBefore = await windowOrder();
        expect(winBefore.indexOf("stats-window")).toBeLessThan(winBefore.indexOf("debug-menu"));

        // drag the STATS pill right, past the debug pill's midpoint, so the
        // taskbar order becomes save-status, debug, stats.
        const debugPill = page.getByTestId("debug-pill");
        const statsPill = page.getByTestId("stats-pill");
        const dpb = await debugPill.boundingBox();
        const spb = await statsPill.boundingBox();
        if (!dpb || !spb) throw new Error("missing bbox");
        await page.mouse.move(spb.x + spb.width / 2, spb.y + spb.height / 2);
        await page.mouse.down();
        // move just past the debug pill's right edge → insert after debug
        await page.mouse.move(dpb.x + dpb.width - 1, dpb.y + dpb.height / 2, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(50);

        // pills reordered AND the paired windows followed: stats now sits
        // after debug in the taskbar, and stats-window sorts below debug-menu.
        const pillsAfter = await pillOrderLeftToRight(pillRow);
        expect(pillsAfter.indexOf("debug-toggle")).toBeLessThan(pillsAfter.indexOf("stats"));
        const winAfter = await windowOrder();
        expect(winAfter.indexOf("debug-menu")).toBeLessThan(winAfter.indexOf("stats-window"));
    });

    test("releasing outside the pill row cancels the reorder", async ({ page }) => {
        const pillRow = await seedTaskbar(page);
        const before = await pillOrderLeftToRight(pillRow);

        const debugPill = page.getByTestId("debug-pill");
        const dpb = await debugPill.boundingBox();
        if (!dpb) throw new Error("missing bbox");
        await page.mouse.move(dpb.x + dpb.width / 2, dpb.y + dpb.height / 2);
        await page.mouse.down();
        // drag far below the pill row, well outside it → dropIndex null
        await page.mouse.move(dpb.x + dpb.width / 2, dpb.y + 600, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(50);

        const after = await pillOrderLeftToRight(pillRow);
        // order unchanged — releasing away from the pills is a no-op
        expect(after).toEqual(before);
    });
});

// canvas-chrome-v2 phase 3: the dock corner is user-configurable + persisted
// (fte.dock.corner), and the full View > panels section lists all 8 dock
// windows — including the 5 family-view debug panels that have no standalone
// pill — making it the only way to reopen one after its titlebar × (cc2-1).
test.describe("canvas-chrome-v2 phase 3 — dock corner config + panels menu", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try {
                localStorage.setItem("fte.defaultEngine", "family-view");
            } catch {
                /* non-fatal */
            }
        });
    });

    test("selecting a dock corner re-homes the dock and persists across reload", async ({
        page,
    }) => {
        await page.goto("/");
        await expect(page.locator("[data-person-id]").first()).toBeVisible();

        // default corner is tl; save-status is non-closing so the dock always
        // carries at least the save pill and the corner container renders.
        await expect(page.getByTestId("canvas-chrome-dock-tl")).toBeVisible();

        // pick bottom-right via View > dock corner
        await page.getByRole("button", { name: "View", exact: true }).click();
        await page.getByRole("menuitem", { name: "dock corner: bottom-right" }).click();

        // dock moves to br; the tl container no longer renders
        await expect(page.getByTestId("canvas-chrome-dock-br")).toBeVisible();
        await expect(page.getByTestId("canvas-chrome-dock-tl")).toHaveCount(0);

        // reload: fte.dock.corner persisted → dock still anchored br
        await page.reload();
        await expect(page.locator("[data-person-id]").first()).toBeVisible();
        await expect(page.getByTestId("canvas-chrome-dock-br")).toBeVisible();
        await expect(page.getByTestId("canvas-chrome-dock-tl")).toHaveCount(0);
    });

    test("View > panels reopens a family-view debug panel closed via its titlebar × (cc2-1)", async ({
        page,
    }) => {
        test.setTimeout(60_000);
        // tall viewport so the dock + debug menu both fit without forced
        // collapse (mirrors canvas-chrome-dock.spec.ts case b).
        await page.setViewportSize({ width: 1440, height: 1200 });
        await page.addInitScript(() => {
            try {
                localStorage.setItem("fte.debug.mode", "true");
            } catch {
                /* non-fatal */
            }
        });
        await page.goto("/");
        await expect(page.locator("[data-person-id]").first()).toBeVisible();

        // enable the layout-metrics layer via the debug menu so the panel mounts
        await page.getByRole("button", { name: "toggle debug panel" }).click({ force: true });
        await expect(page.getByTestId("debug-panel")).toBeVisible();
        await page.getByTestId("debug-toggle-fv-showLayoutMetrics").click();

        const panel = page.getByTestId("family-view-debug-layout-metrics");
        await expect(panel).toBeVisible();

        // close via the titlebar × → isOpen false → the panel unmounts even
        // though the showLayoutMetrics layer is still on
        await page.getByTestId("family-view-debug-layout-metrics-close").click();
        await expect(panel).toHaveCount(0);

        // the only reopen path: View > panels > layout metrics
        await page.getByRole("button", { name: "View", exact: true }).click();
        await page.getByRole("menuitem", { name: "layout metrics" }).click();
        await expect(panel).toBeVisible();
    });
});
