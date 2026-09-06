import { describe, expect, it } from "vitest";
import { normalizedCategoryExtensions, validCustomCategoryName } from "./customCategories";

describe("custom categories", () => {
  it("rejects path-like names and normalizes extensions", () => {
    expect(validCustomCategoryName("Series")).toBe(true);
    expect(validCustomCategoryName("../Series")).toBe(false);
    expect(normalizedCategoryExtensions(".MKV, mp4; mkv")).toEqual(["mkv", "mp4"]);
  });
});