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
        files: ["**/*.svelte"],
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
        ignores: ["dist/", "node_modules/", "playwright-report/", "coverage/"],
    },
    {
        rules: {
            "no-console": ["warn", { allow: ["warn", "error", "info", "debug"] }],
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
        },
    },
);
