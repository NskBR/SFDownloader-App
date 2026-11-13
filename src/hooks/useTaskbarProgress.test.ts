import { describe, expect, it } from "vitest";
import { ProgressBarStatus } from "@tauri-apps/api/window";
import { taskbarProgress } from "./useTaskbarProgress";

describe("Windows taskbar progress", () => {
  it("shows the download with the shortest ETA even if another has a higher percentage", () => {
    const fast = { status: "downloading", downloaded: 50, total: 100, speed: 50 } as const;
    const slow = { status: "downloading", downloaded: 90, total: 100, speed: 2 } as const;
    expect(taskbarProgress([slow, fast])).toEqual({ status: ProgressBarStatus.Normal, progress: 50 });
    expect(taskbarProgress([slow, { ...fast, status: "completed" }])).toEqual({
      status: ProgressBarStatus.Normal, progress: 90,
    });
  });

  it("shows indeterminate progress for an unknown size and switches to yellow when paused", () => {
    const unknown = { status: "downloading", downloaded: 100, total: null, speed: 10 } as const;
    expect(taskbarProgress([unknown]).status).toBe(ProgressBarStatus.Indeterminate);
    const paused = { ...unknown, status: "paused", downloaded: 45, total: 100 } as const;
    expect(taskbarProgress([paused])).toEqual({ status: ProgressBarStatus.Paused, progress: 45 });
    expect(taskbarProgress([paused, unknown]).status).toBe(ProgressBarStatus.Indeterminate);
    expect(taskbarProgress([{ ...paused, status: "cancelled" }]).status).toBe(ProgressBarStatus.None);
  });
});
