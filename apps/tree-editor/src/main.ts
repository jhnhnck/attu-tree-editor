/*
 * FamilyTreeEditor - browser entrypoint; mounts the root svelte component
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

const target = document.getElementById("app");
if (!target) {
    throw new Error("missing #app mount point");
}

const app = mount(App, { target });

export default app;
