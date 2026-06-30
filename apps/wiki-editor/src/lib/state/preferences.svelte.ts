export type Theme = "light" | "dark" | "auto";
export type DockCorner = "bl" | "tl" | "tr" | "br";

export interface WikiPreferencesStore {
    // appearance
    readonly theme: Theme;
    readonly corner: DockCorner;
    setTheme(t: Theme): void;
    setCorner(c: DockCorner): void;
    // editor
    readonly fontFamily: string;
    readonly fontSize: string;
    readonly tabSize: string;
    readonly syntaxTheme: string;
    readonly lineWrap: boolean;
    readonly lineNumbers: boolean;
    readonly minimap: boolean;
    readonly bracketMatching: boolean;
    readonly trimTrailingWhitespace: boolean;
    setFontFamily(v: string): void;
    setFontSize(v: string): void;
    setTabSize(v: string): void;
    setSyntaxTheme(v: string): void;
    setLineWrap(v: boolean): void;
    setLineNumbers(v: boolean): void;
    setMinimap(v: boolean): void;
    setBracketMatching(v: boolean): void;
    setTrimTrailingWhitespace(v: boolean): void;
    // autosave
    readonly autosaveEnabled: boolean;
    readonly autosaveInterval: string;
    readonly autosaveStorage: string;
    setAutosaveEnabled(v: boolean): void;
    setAutosaveInterval(v: string): void;
    setAutosaveStorage(v: string): void;
    // preview
    readonly previewMode: string;
    readonly previewTrigger: string;
    readonly previewTheme: string;
    setPreviewMode(v: string): void;
    setPreviewTrigger(v: string): void;
    setPreviewTheme(v: string): void;
    // lifecycle
    hydrate(): void;
}

const KEYS = {
    theme: "wiki.prefs.theme",
    corner: "wiki.dock.corner",
    fontFamily: "wiki.editor.fontFamily",
    fontSize: "wiki.editor.fontSize",
    tabSize: "wiki.editor.tabSize",
    syntaxTheme: "wiki.editor.syntaxTheme",
    lineWrap: "wiki.editor.lineWrap",
    lineNumbers: "wiki.editor.lineNumbers",
    minimap: "wiki.editor.minimap",
    bracketMatching: "wiki.editor.bracketMatching",
    trimTrailingWhitespace: "wiki.editor.trimTrailingWhitespace",
    autosaveEnabled: "wiki.autosave.enabled",
    autosaveInterval: "wiki.autosave.interval",
    autosaveStorage: "wiki.autosave.storage",
    previewMode: "wiki.preview.mode",
    previewTrigger: "wiki.preview.trigger",
    previewTheme: "wiki.preview.theme",
} as const;

function readStr<T extends string>(key: string, fallback: T): T {
    try {
        const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(key);
        return raw !== null ? (raw as T) : fallback;
    } catch {
        return fallback;
    }
}

function readBool(key: string, fallback: boolean): boolean {
    try {
        const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(key);
        if (raw === null) return fallback;
        return raw === "true";
    } catch {
        return fallback;
    }
}

function writePref(key: string, value: string): void {
    try {
        if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
    } catch {
        // quota / disabled storage is non-fatal
    }
}

function applyTheme(t: Theme): void {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    if (t === "auto") html.removeAttribute("data-theme");
    else html.setAttribute("data-theme", t);
}

export function createWikiPreferencesStore(): WikiPreferencesStore {
    let theme = $state<Theme>("auto");
    let corner = $state<DockCorner>("bl");
    let fontFamily = $state("JetBrains Mono");
    let fontSize = $state("14px");
    let tabSize = $state("4");
    let syntaxTheme = $state("Attu Dark");
    let lineWrap = $state(false);
    let lineNumbers = $state(true);
    let minimap = $state(false);
    let bracketMatching = $state(true);
    let trimTrailingWhitespace = $state(true);
    let autosaveEnabled = $state(false);
    let autosaveInterval = $state("1 minute");
    let autosaveStorage = $state("Browser storage");
    let previewMode = $state("Editor only");
    let previewTrigger = $state("On save");
    let previewTheme = $state("Match site theme");

    return {
        get theme() { return theme; },
        get corner() { return corner; },
        get fontFamily() { return fontFamily; },
        get fontSize() { return fontSize; },
        get tabSize() { return tabSize; },
        get syntaxTheme() { return syntaxTheme; },
        get lineWrap() { return lineWrap; },
        get lineNumbers() { return lineNumbers; },
        get minimap() { return minimap; },
        get bracketMatching() { return bracketMatching; },
        get trimTrailingWhitespace() { return trimTrailingWhitespace; },
        get autosaveEnabled() { return autosaveEnabled; },
        get autosaveInterval() { return autosaveInterval; },
        get autosaveStorage() { return autosaveStorage; },
        get previewMode() { return previewMode; },
        get previewTrigger() { return previewTrigger; },
        get previewTheme() { return previewTheme; },

        setTheme(t) { theme = t; applyTheme(t); writePref(KEYS.theme, t); },
        setCorner(c) { corner = c; writePref(KEYS.corner, c); },
        setFontFamily(v) { fontFamily = v; writePref(KEYS.fontFamily, v); },
        setFontSize(v) { fontSize = v; writePref(KEYS.fontSize, v); },
        setTabSize(v) { tabSize = v; writePref(KEYS.tabSize, v); },
        setSyntaxTheme(v) { syntaxTheme = v; writePref(KEYS.syntaxTheme, v); },
        setLineWrap(v) { lineWrap = v; writePref(KEYS.lineWrap, String(v)); },
        setLineNumbers(v) { lineNumbers = v; writePref(KEYS.lineNumbers, String(v)); },
        setMinimap(v) { minimap = v; writePref(KEYS.minimap, String(v)); },
        setBracketMatching(v) { bracketMatching = v; writePref(KEYS.bracketMatching, String(v)); },
        setTrimTrailingWhitespace(v) { trimTrailingWhitespace = v; writePref(KEYS.trimTrailingWhitespace, String(v)); },
        setAutosaveEnabled(v) { autosaveEnabled = v; writePref(KEYS.autosaveEnabled, String(v)); },
        setAutosaveInterval(v) { autosaveInterval = v; writePref(KEYS.autosaveInterval, v); },
        setAutosaveStorage(v) { autosaveStorage = v; writePref(KEYS.autosaveStorage, v); },
        setPreviewMode(v) { previewMode = v; writePref(KEYS.previewMode, v); },
        setPreviewTrigger(v) { previewTrigger = v; writePref(KEYS.previewTrigger, v); },
        setPreviewTheme(v) { previewTheme = v; writePref(KEYS.previewTheme, v); },

        hydrate() {
            theme = readStr<Theme>(KEYS.theme, "auto");
            corner = readStr<DockCorner>(KEYS.corner, "bl");
            fontFamily = readStr(KEYS.fontFamily, "JetBrains Mono");
            fontSize = readStr(KEYS.fontSize, "14px");
            tabSize = readStr(KEYS.tabSize, "4");
            syntaxTheme = readStr(KEYS.syntaxTheme, "Attu Dark");
            lineWrap = readBool(KEYS.lineWrap, false);
            lineNumbers = readBool(KEYS.lineNumbers, true);
            minimap = readBool(KEYS.minimap, false);
            bracketMatching = readBool(KEYS.bracketMatching, true);
            trimTrailingWhitespace = readBool(KEYS.trimTrailingWhitespace, true);
            autosaveEnabled = readBool(KEYS.autosaveEnabled, false);
            autosaveInterval = readStr(KEYS.autosaveInterval, "1 minute");
            autosaveStorage = readStr(KEYS.autosaveStorage, "Browser storage");
            previewMode = readStr(KEYS.previewMode, "Editor only");
            previewTrigger = readStr(KEYS.previewTrigger, "On save");
            previewTheme = readStr(KEYS.previewTheme, "Match site theme");
            applyTheme(theme);
        },
    };
}
