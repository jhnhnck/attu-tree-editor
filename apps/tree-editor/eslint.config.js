/*
 * FamilyTreeEditor - eslint flat config; typescript-eslint + svelte plugin
 * licensed under the MIT license; see LICENSE.md for full text
 */

import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import globals from "globals";

export default ts.config(
    js.configs.recommended,
    ...ts.configs.recommendedTypeChecked,
    ...svelte.configs["flat/recommended"],
    {
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
                extraFileExtensions: [".svelte"],
            },
        },
    },
    {
        files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
        languageOptions: {
            parserOptions: {
                parser: ts.parser,
            },
        },
    },
    {
        files: ["*.js", "*.config.js"],
        ...ts.configs.disableTypeChecked,
    },
    {
        // generator scripts for committed test fixtures are run by hand
        // (`node *.gen.mjs`) and never imported by the app; keep them
        // outside the typescript-eslint project-service surface.
        ignores: [
            "dist/",
            "node_modules/",
            "playwright-report/",
            "coverage/",
            "tests/fixtures/*.gen.mjs",
        ],
    },
    {
        rules: {
            "no-console": ["warn", { allow: ["warn", "error", "info", "debug"] }],
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            // todo: re-enable after a sweep — eslint-plugin-svelte 3 added these
            // two rules. no-useless-children-snippet is stylistic (30+ sites).
            // prefer-svelte-reactivity is substantive — plain Map/Set in $state
            // doesn't propagate mutation. needs a careful audit (some sites are
            // local containers, others are reactive state with a latent bug).
            "svelte/no-useless-children-snippet": "off",
            "svelte/prefer-svelte-reactivity": "off",
        },
    },
);
