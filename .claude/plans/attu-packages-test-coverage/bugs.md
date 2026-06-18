# bugs — attu-packages-test-coverage

## open

- **api-client: no way to clear onUnauthorized handler** — `onUnauthorized(handler)` sets module-level state with no unset/clear API. once registered, the handler fires on every 401 for the lifetime of the module instance. low severity in production (typically registered once at startup), but makes test isolation awkward (stale handler visible to later tests in the same file). fix: accept `undefined` as a valid argument to clear the handler, or expose a `clearOnUnauthorized()` helper.

## closed

(populated at phase close)
