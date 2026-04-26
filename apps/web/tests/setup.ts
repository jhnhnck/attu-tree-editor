/*
 * FamilyTreeEditor - vitest setup; pulls in jest-dom matchers + cleanup
 * licensed under the MIT license; see LICENSE.md for full text
 */

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/svelte";

afterEach(() => {
    cleanup();
});
