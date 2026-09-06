import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDownloadSelection } from "./useDownloadSelection";

const click = (overrides: Partial<React.MouseEvent> = {}) =>
  ({ ctrlKey: false, metaKey: false, shiftKey: false, ...overrides }) as React.MouseEvent;

describe("useDownloadSelection", () => {
  it("selects one item and extends the selection with Shift", () => {
    const { result } = renderHook(() => useDownloadSelection(["one", "two", "three", "four"]));

    act(() => result.current.handleSelect("one", click()));
    act(() => result.current.handleSelect("four", click({ shiftKey: true })));

    expect(Array.from(result.current.selected)).toEqual(["one", "two", "three", "four"]);
  });

  it("toggles an item with Ctrl or Command", () => {
    const { result } = renderHook(() => useDownloadSelection(["one", "two"]));

    act(() => result.current.handleSelect("one", click()));
    act(() => result.current.handleSelect("two", click({ ctrlKey: true })));
    expect(Array.from(result.current.selected)).toEqual(["one", "two"]);

    act(() => result.current.handleSelect("one", click({ metaKey: true })));
    expect(Array.from(result.current.selected)).toEqual(["two"]);
  });

  it("selects all visible items and clears the selection", () => {
    const { result } = renderHook(() => useDownloadSelection(["one", "two"]));

    act(() => result.current.selectAll());
    expect(Array.from(result.current.selected)).toEqual(["one", "two"]);

    act(() => result.current.deselectAll());
    expect(result.current.selected.size).toBe(0);
  });

  it("selects only the contextual item", () => {
    const { result } = renderHook(() => useDownloadSelection(["one", "two"]));

    act(() => result.current.selectAll());
    act(() => result.current.selectOnly("two"));

    expect(Array.from(result.current.selected)).toEqual(["two"]);
  });
});
