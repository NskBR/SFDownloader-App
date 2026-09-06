import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useContextMenu } from "./useContextMenu";

const contextEvent = (x: number, y: number) =>
  ({ clientX: x, clientY: y, preventDefault: () => undefined }) as React.MouseEvent;

describe("useContextMenu", () => {
  it("opens the menu at the event coordinates", () => {
    const { result } = renderHook(() => useContextMenu<string>());

    act(() => result.current.openContextMenu(contextEvent(80, 120), "download-1"));

    expect(result.current.contextMenu).toEqual({ x: 80, y: 120, item: "download-1" });
  });

  it("closes the menu when Escape is pressed", () => {
    const { result } = renderHook(() => useContextMenu<string>());

    act(() => result.current.openContextMenu(contextEvent(80, 120), "download-1"));
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    expect(result.current.contextMenu).toBeNull();
  });
});
