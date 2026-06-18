/*
 * typed fetch wrapper for the attu tree api.
 * thin re-export from @attu/api-client; configures the vite base URL.
 */

import { setApiPrefix } from "@attu/api-client";

// vite injects BASE_URL from `base` in vite.config.ts (`/trees/` in prod, `/` in
// dev). prefixing every request with it keeps cookies (path=/trees/) attached
// and routes through caddy's /trees/ mount.
setApiPrefix(import.meta.env.BASE_URL.replace(/\/$/, ""));

export * from "@attu/api-client";
