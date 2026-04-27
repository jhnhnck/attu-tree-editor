/*
 * FamilyTreeEditor - ZoomWidget: slider, fit button, mode toggle
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ZoomWidget from "$lib/components/canvas/ZoomWidget.svelte";

function baseProps() {
    return {
        scale: 1.0,
        mode: "select" as const,
        onzoom: vi.fn(),
        onfit: vi.fn(),
        onmodechange: vi.fn(),
    };
}

describe("ZoomWidget", () => {
    it("renders the current scale percentage as the label", () => {
        render(ZoomWidget, { ...baseProps(), scale: 1.5 });
        expect(screen.getByLabelText(/zoom percent/i)).toHaveTextContent("150%");
    });

    it("clicking the fit button fires onfit", async () => {
        const props = baseProps();
        render(ZoomWidget, props);
        await fireEvent.click(screen.getByLabelText("fit to window"));
        expect(props.onfit).toHaveBeenCalledTimes(1);
    });

    it("zoom-in button calls onzoom with a larger scale", async () => {
        const props = baseProps();
        render(ZoomWidget, { ...props, scale: 1.0 });
        await fireEvent.click(screen.getByLabelText("zoom in"));
        expect(props.onzoom).toHaveBeenCalledTimes(1);
        expect(props.onzoom.mock.calls[0]?.[0]).toBeGreaterThan(1.0);
    });

    it("zoom-out button calls onzoom with a smaller scale", async () => {
        const props = baseProps();
        render(ZoomWidget, { ...props, scale: 1.0 });
        await fireEvent.click(screen.getByLabelText("zoom out"));
        expect(props.onzoom).toHaveBeenCalledTimes(1);
        expect(props.onzoom.mock.calls[0]?.[0]).toBeLessThan(1.0);
    });

    it("slider input fires onzoom with the mapped log-scale value", async () => {
        const props = baseProps();
        render(ZoomWidget, { ...props, scale: 1.0 });
        const slider = screen.getByLabelText<HTMLInputElement>("zoom level");
        // slider runs 0..1000; 0 maps to 10%, 1000 maps to 500%
        await fireEvent.input(slider, { target: { value: "0" } });
        expect(props.onzoom).toHaveBeenCalled();
        const last = props.onzoom.mock.calls.at(-1) as [number] | undefined;
        const v = last?.[0] ?? 0;
        expect(v).toBeGreaterThanOrEqual(0.09);
        expect(v).toBeLessThanOrEqual(0.11);
    });

    it("hand toggle button flips select -> hand", async () => {
        const props = baseProps();
        render(ZoomWidget, { ...props, mode: "select" });
        await fireEvent.click(screen.getByLabelText(/switch to hand tool/i));
        expect(props.onmodechange).toHaveBeenCalledWith("hand");
    });

    it("hand toggle button flips hand -> select", async () => {
        const props = baseProps();
        render(ZoomWidget, { ...props, mode: "hand" });
        await fireEvent.click(screen.getByLabelText(/switch to select tool/i));
        expect(props.onmodechange).toHaveBeenCalledWith("select");
    });
});
