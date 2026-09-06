import { describe, expect, it } from "vitest";
import { sortDownloads } from "./downloadOrdering";
import type { DownloadTask } from "./download";

const task = (id: string, values: Partial<DownloadTask> = {}): DownloadTask =>
  ({
    id,
    fileName: id,
    fileSize: 0,
    status: "pending",
    createdAt: "2026-01-01T00:00:00Z",
    priority: 1,
    queueOrder: 0,
    ...values,
  }) as DownloadTask;

describe("sortDownloads", () => {
  it("sorts by size without mutating the source list", () => {
    const downloads = [
      task("large", { fileSize: 20 }),
      task("small", { fileSize: 10 }),
    ];
    const sorted = sortDownloads(downloads, { key: "size", direction: "asc" });
    expect(sorted.map((item) => item.id)).toEqual(["small", "large"]);
    expect(downloads.map((item) => item.id)).toEqual(["large", "small"]);
  });

  it("sorts active statuses before completed statuses", () => {
    const sorted = sortDownloads(
      [
        task("done", { status: "completed" }),
        task("active", { status: "downloading" }),
      ],
      { key: "status", direction: "asc" },
    );
    expect(sorted.map((item) => item.id)).toEqual(["active", "done"]);
  });

  it("gives queue priority precedence over manual order", () => {
    const sorted = sortDownloads(
      [
        task("normal", { priority: 1, queueOrder: 0 }),
        task("urgent", { priority: 3, queueOrder: 99 }),
      ],
      { key: "queue", direction: "asc" },
    );
    expect(sorted.map((item) => item.id)).toEqual(["urgent", "normal"]);
  });
});
