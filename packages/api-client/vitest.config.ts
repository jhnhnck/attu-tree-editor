/*
 * api-client - vitest config; jsdom env for localStorage availability
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/unit/**/*.test.ts"],
        environment: "jsdom",
        globals: false,
    },
});
