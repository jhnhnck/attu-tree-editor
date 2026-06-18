// worker-safe re-exports: no svelte components, no browser-only apis.
// used by files that run inside web workers (e.g. layout.worker.ts via domain types).
export { ok, err, type Result } from "./utils/result.js";
export { HaracalndeDate, DateParseErrors } from "./date/HaracalndeDate.js";
export type { HaracalndeDateData, Era, DateParseError } from "./date/HaracalndeDate.js";
export { approxGregorianYear, approxGregorianLabel } from "./date/gregorian.js";
