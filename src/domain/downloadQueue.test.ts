import { describe, expect, it } from "vitest";
import { queuePositions } from "./downloadQueue";

describe("queue positions", () => {
  it("orders pending tasks by priority and persisted queue order", () => {
    const positions = queuePositions([
      { id: "normal-later", status: "pending", priority: 1, queueOrder: 3 },
      { id: "urgent", status: "pending", priority: 3, queueOrder: 9 },
      { id: "active", status: "downloading", priority: 3, queueOrder: 1 },
      { id: "normal-first", status: "pending", priority: 1, queueOrder: 2 },
    ]);

    expect(positions.get("urgent")).toBe(1);
    expect(positions.get("normal-first")).toBe(2);
    expect(positions.get("normal-later")).toBe(3);
    expect(positions.has("active")).toBe(false);
  });
});
