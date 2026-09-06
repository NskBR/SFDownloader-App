import { describe, expect, it } from "vitest";
import { isPageId, navigationItems } from "./navigation";

describe("navigation", () => {
  it("accepts every registered page identifier", () => {
    for (const item of navigationItems) expect(isPageId(item.id)).toBe(true);
  });

  it("rejects an unknown page identifier", () => {
    expect(isPageId("unknown-page")).toBe(false);
  });
});
