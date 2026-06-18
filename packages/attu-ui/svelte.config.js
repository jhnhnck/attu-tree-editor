/*
 * AttuUI - svelte compiler config; runes mode enabled
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
    preprocess: vitePreprocess(),
    compilerOptions: {
        runes: true,
    },
};
