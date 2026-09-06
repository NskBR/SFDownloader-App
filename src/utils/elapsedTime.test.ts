import { describe, expect, it } from "vitest";
import { elapsedSeconds, formatElapsed } from "./elapsedTime";

describe("elapsed time", () => {
  it("calculates a completed download duration", () => {
    expect(elapsedSeconds("2026-08-26T10:00:00Z", "2026-08-26T11:01:02Z")).toBe(3662);
  });

  it("clamps negative durations and handles unfinished downloads", () => {
    expect(elapsedSeconds("2026-08-26T11:00:00Z", "2026-08-26T10:00:00Z")).toBe(0);
    expect(elapsedSeconds("2026-08-26T10:00:00Z", null)).toBeNull();
  });

  it("formats short and long durations", () => {
    expect(formatElapsed(61)).toBe("1min 1s");
    expect(formatElapsed(3662)).toBe("1h 1min 2s");
    expect(formatElapsed(null)).toBe("—");
  });
});
