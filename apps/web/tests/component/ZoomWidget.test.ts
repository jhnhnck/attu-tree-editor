/*
 * FamilyTreeEditor - ZoomWidget: trigger + popover (slider, fit, manual entry)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ZoomWidget from "$lib/components/canvas/ZoomWidget.svelte";

function baseProps() {
    return {
        scale: 1.0,
        onzoom: vi.fn(),
        onfit: vi.fn(),
    };
}

async function openPopover(): Promise<void> {
    await fireEvent.click(screen.getByLabelText("zoom"));
}

describe("ZoomWidget", () => {
    it("trigger button shows the current scale percentage", () => {
        render(ZoomWidget, { ...baseProps(), scale: 1.5 });
        expect(screen.getByLabelText("zoom")).toHaveTextContent("150%");
    });

    it("popover is closed by default; opens on trigger click", async () => {
        render(ZoomWidget, baseProps());
        expect(screen.queryByLabelText("fit to window")).toBeNull();
        await openPopover();
        expect(screen.getByLabelText("fit to window")).toBeInTheDocument();
    });

    it("clicking the fit button fires onfit and closes the popover", async () => {
        const props = baseProps();
        render(ZoomWidget, props);
        await openPopover();
        await fireEvent.click(screen.getByLabelText("fit to window"));
        expect(props.onfit).toHaveBeenCalledTimes(1);
        expect(screen.queryByLabelText("fit to window")).toBeNull();
    });

    it("zoom-in button calls onzoom with a larger scale", async () => {
        const props = baseProps();
        render(ZoomWidget, { ...props, scale: 1.0 });
        await openPopover();
        await fireEvent.click(screen.getByLabelText("zoom in"));
        expect(props.onzoom).toHaveBeenCalledTimes(1);
        expect(props.onzoom.mock.calls[0]?.[0]).toBeGreaterThan(1.0);
    });

    it("zoom-out button calls onzoom with a smaller scale", async () => {
        const props = baseProps();
        render(ZoomWidget, { ...props, scale: 1.0 });
        await openPopover();
        await fireEvent.click(screen.getByLabelText("zoom out"));
        expect(props.onzoom).toHaveBeenCalledTimes(1);
        expect(props.onzoom.mock.calls[0]?.[0]).toBeLessThan(1.0);
    });

    it("slider input fires onzoom with the mapped log-scale value", async () => {
        const props = baseProps();
        render(ZoomWidget, { ...props, scale: 1.0 });
        await openPopover();
        const slider = screen.getByLabelText<HTMLInputElement>("zoom level");
        // slider runs 0..1000; 0 maps to 10%, 1000 maps to 500%
        await fireEvent.input(slider, { target: { value: "0" } });
        expect(props.onzoom).toHaveBeenCalled();
        const last = props.onzoom.mock.calls.at(-1) as [number] | undefined;
        const v = last?.[0] ?? 0;
        expect(v).toBeGreaterThanOrEqual(0.09);
        expect(v).toBeLessThanOrEqual(0.11);
    });
});
