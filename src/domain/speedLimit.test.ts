import { describe, expect, it } from "vitest";
import { parseSpeedLimitMebibytesPerSecond } from "./speedLimit";

describe("speed limit parser", () => {
  it("parses presets and a decimal written with comma", () => {
    expect(parseSpeedLimitMebibytesPerSecond("10 MB/s")).toBe(10);
    expect(parseSpeedLimitMebibytesPerSecond("1,5 MB/s")).toBe(1.5);
    expect(parseSpeedLimitMebibytesPerSecond("25")).toBe(25);
  });

  it("recognizes both supported unlimited labels", () => {
    expect(parseSpeedLimitMebibytesPerSecond("Sem limite")).toBe(0);
    expect(parseSpeedLimitMebibytesPerSecond("No limit")).toBe(0);
    expect(parseSpeedLimitMebibytesPerSecond("  ")).toBe(0);
  });

  it("keeps invalid values distinguishable from unlimited", () => {
    expect(parseSpeedLimitMebibytesPerSecond("10 Mbps")).toBeNull();
    expect(parseSpeedLimitMebibytesPerSecond("fast")).toBeNull();
    expect(parseSpeedLimitMebibytesPerSecond("-1 MB/s")).toBeNull();
  });
});
