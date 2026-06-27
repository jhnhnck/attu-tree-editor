/*
 * AttuUI - barrel exports
 * licensed under the MIT license; see LICENSE.md for full text
 */

// result
export { ok, err, type Result } from "./utils/result.js";

// keyboard
export { formatCombo, isMac, installShortcuts } from "./keyboard.js";
export type { ShortcutBinding, ShortcutScope } from "./keyboard.js";

// palette
export type { PaletteItem } from "./palette.js";

// date
export { HaracalndeDate, DateParseErrors } from "./date/HaracalndeDate.js";
export type { HaracalndeDateData, Era, DateParseError } from "./date/HaracalndeDate.js";
export { approxGregorianYear, approxGregorianLabel } from "./date/gregorian.js";

// state
export type { AuthStore } from "./state/auth.svelte.js";
export { authStore, DRY_RUN_USER } from "./state/auth.svelte.js";
export type { ToastsStore, Toast } from "./state/toasts.svelte.js";
export { createToastsStore } from "./state/toasts.svelte.js";
export type { ProgressStore, ProgressHandle } from "./state/progress.svelte.js";
export { createProgressStore } from "./state/progress.svelte.js";
export type { PreferencesStore, Theme, InspectorSide } from "./state/preferences.js";

// ui
export { default as Button } from "./components/ui/Button.svelte";
export { default as ContextMenu } from "./components/ui/ContextMenu.svelte";
export type { ContextMenuItem } from "./components/ui/ContextMenu.svelte";
export { default as Toasts } from "./components/ui/Toasts.svelte";

// form
export { default as Field } from "./components/form/Field.svelte";
export { default as DateInput } from "./components/form/DateInput.svelte";

// canvas
export { default as BackButton } from "./components/canvas/BackButton.svelte";
export { default as ZoomWidget } from "./components/canvas/ZoomWidget.svelte";
export { computeFit, measureCanvasChromeInsets, ZERO_INSETS } from "./components/canvas/fitMath.js";
export type { CanvasChromeInsets, FitInput, FitOutput } from "./components/canvas/fitMath.js";
export { computeDisplayPercent, DESIGN_CARD_WIDTH_PX } from "./components/canvas/zoomDisplay.js";
export type { DisplayPercentInput } from "./components/canvas/zoomDisplay.js";

// shell
export type { MenuConfig, MenuEntry, MenuItem, IconComponent } from "./components/shell/menu.js";
export { default as AboutDialog } from "./components/shell/AboutDialog.svelte";
export { default as AdminPanel } from "./components/shell/AdminPanel.svelte";
export { default as AuthBar } from "./components/shell/AuthBar.svelte";
export { default as LinkCodeDialog } from "./components/shell/LinkCodeDialog.svelte";
export { default as Menu } from "./components/shell/Menu.svelte";
export { default as MenuBar } from "./components/shell/MenuBar.svelte";
export { default as ProgressStrip } from "./components/shell/ProgressStrip.svelte";
export { default as SettingsDialog } from "./components/shell/SettingsDialog.svelte";
export { default as ShareDialog } from "./components/shell/ShareDialog.svelte";
export { default as Shell } from "./components/shell/Shell.svelte";

// help
export { default as ShortcutsOverlay } from "./components/help/ShortcutsOverlay.svelte";

// editor
export { default as CropperDialog } from "./components/editor/CropperDialog.svelte";
export { default as CropperCanvas } from "./components/editor/CropperCanvas.svelte";
export {
    coverScale,
    centerOnFrame,
    initialCoverTransform,
    extractSourceRect,
    MAX_ZOOM_MULTIPLE,
    panTransform,
    anchorZoom,
    clampTransform,
} from "./components/editor/cropperMath.js";
export type { Transform, Size } from "./components/editor/cropperMath.js";
export { loadSourceBitmap, __setOrientationProbe } from "./components/editor/loadSourceBitmap.js";
export type { SourceBitmap, LoadOptions } from "./components/editor/loadSourceBitmap.js";
export { encodePortrait, DOWNSCALE_RATIO_THRESHOLD } from "./components/editor/encodePortrait.js";
export type { EncodeOptions } from "./components/editor/encodePortrait.js";

// palette
export { default as CommandPalette } from "./components/palette/CommandPalette.svelte";

// dock (unified system)
export { dockStore } from "./components/dock/store.svelte.js";
export type { DockItemDef, DockWindowState, DockKind, DockCorner as DockCornerKind, DockRenderCtx, DockRenderSnippet } from "./components/dock/store.svelte.js";
export { default as DockCorner } from "./components/dock/DockCorner.svelte";
export { default as DockItem } from "./components/dock/DockItem.svelte";
export { default as DockWindow } from "./components/dock/DockWindow.svelte";
export { default as DockSurface } from "./components/dock/DockSurface.svelte";
export { default as DockModal } from "./components/dock/DockModal.svelte";
