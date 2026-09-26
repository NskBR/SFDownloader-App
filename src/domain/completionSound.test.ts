import { describe, expect, it } from "vitest";
import { completionSoundGate } from "./completionSound";

describe("completionSoundGate", () => {
  it("accepts a completion once, then accepts a new completion after retry", () => {
    const accept = completionSoundGate();
    expect(accept({ id: "a", status: "downloading" })).toBe(false);
    expect(accept({ id: "a", status: "completed" })).toBe(true);
    expect(accept({ id: "a", status: "completed" })).toBe(false);
    expect(accept({ id: "b", status: "completed" })).toBe(true);
    expect(accept({ id: "a", status: "downloading" })).toBe(false);
    expect(accept({ id: "a", status: "completed" })).toBe(true);
    expect(accept({ id: "a", status: "cancelled" })).toBe(false);
  });
});
