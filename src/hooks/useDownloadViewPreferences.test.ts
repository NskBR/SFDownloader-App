import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDownloadViewPreferences } from "./useDownloadViewPreferences";

describe("useDownloadViewPreferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses the list view and date descending by default", () => {
    const { result } = renderHook(() => useDownloadViewPreferences());

    expect(result.current.view).toBe("list");
    expect(result.current.sort).toEqual({ key: "date", direction: "desc" });
  });

  it("toggles the direction when the same sort key is selected", () => {
    const { result } = renderHook(() => useDownloadViewPreferences());

    act(() => result.current.changeSort("queue"));
    expect(result.current.sort).toEqual({ key: "queue", direction: "asc" });

    act(() => result.current.changeSort("queue"));
    expect(result.current.sort).toEqual({ key: "queue", direction: "desc" });
    expect(JSON.parse(localStorage.getItem("sf-downloader.sort_preference") ?? "{}")).toEqual({
      key: "queue",
      direction: "desc",
    });
  });

  it("persists the selected view", () => {
    const { result, unmount } = renderHook(() => useDownloadViewPreferences());

    act(() => result.current.changeView("grid"));
    expect(localStorage.getItem("sf-downloader.view_preference")).toBe("grid");
    unmount();

    const restored = renderHook(() => useDownloadViewPreferences());
    expect(restored.result.current.view).toBe("grid");
  });
});
