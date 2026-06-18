/*
 * AttuEditor - browser entrypoint; mounts the editor svelte component
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { mount } from "svelte";
import App from "./App.svelte";
import "@attu/ui/theme.css";

// in production this div is injected by the mediawiki php extension.
// in dev (vite) the index.html provides it.
const target = document.getElementById("attu-editor");
if (!target) {
    throw new Error("missing #attu-editor mount point");
}

const app = mount(App, { target });

export default app;
