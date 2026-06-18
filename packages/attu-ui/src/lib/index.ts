/*
 * AttuUI - barrel exports
 * licensed under the MIT license; see LICENSE.md for full text
 */

// keyboard
export { formatCombo, isMac, installShortcuts } from "./keyboard.js";
export type { ShortcutBinding, ShortcutScope } from "./keyboard.js";

// palette
export type { PaletteItem } from "./palette.js";

// date
export { HaracalndeDate } from "./date/HaracalndeDate.js";
export type { HaracalndeDateData, Era } from "./date/HaracalndeDate.js";
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
export { default as Toasts } from "./components/ui/Toasts.svelte";

// form
export { default as Field } from "./components/form/Field.svelte";
export { default as DateInput } from "./components/form/DateInput.svelte";

// canvas
export { default as BackButton } from "./components/canvas/BackButton.svelte";
export { default as CanvasChromeDock } from "./components/canvas/CanvasChromeDock.svelte";
export { default as DockRegistration } from "./components/canvas/DockRegistration.svelte";
export { default as Window } from "./components/canvas/Window.svelte";
export { default as WindowOverlay } from "./components/canvas/WindowOverlay.svelte";
export { default as ZoomWidget } from "./components/canvas/ZoomWidget.svelte";
export { windowManager, WINDOW_MANAGER_CONSTANTS, NON_CLOSING_IDS } from "./components/canvas/windowManager.svelte.js";
export type { PopOutState, DockWindowState } from "./components/canvas/windowManager.svelte.js";

// shell
export { default as AboutDialog } from "./components/shell/AboutDialog.svelte";
export { default as AdminPanel } from "./components/shell/AdminPanel.svelte";
export { default as AuthBar } from "./components/shell/AuthBar.svelte";
export { default as LinkCodeDialog } from "./components/shell/LinkCodeDialog.svelte";
export { default as Menu } from "./components/shell/Menu.svelte";
export { default as MenuBar } from "./components/shell/MenuBar.svelte";
export { default as ProgressStrip } from "./components/shell/ProgressStrip.svelte";
export { default as SaveStatusPill } from "./components/shell/SaveStatusPill.svelte";
export { default as SettingsDialog } from "./components/shell/SettingsDialog.svelte";
export { default as ShareDialog } from "./components/shell/ShareDialog.svelte";

// help
export { default as ShortcutsOverlay } from "./components/help/ShortcutsOverlay.svelte";

// editor
export { default as CropperDialog } from "./components/editor/CropperDialog.svelte";
export { default as CropperCanvas } from "./components/editor/CropperCanvas.svelte";

// palette
export { default as CommandPalette } from "./components/palette/CommandPalette.svelte";
