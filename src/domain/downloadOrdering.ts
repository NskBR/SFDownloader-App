import type { DownloadTask } from "./download";

export type DownloadSortKey = "status" | "size" | "date" | "queue";

export interface DownloadSort {
  key: DownloadSortKey;
  direction: "asc" | "desc";
}

const statusOrder: Record<string, number> = {
  downloading: 0,
  assembling: 1,
  extracting: 2,
  paused: 3,
  pending: 4,
  checking_files: 5,
  failed: 6,
  cancelled: 7,
  completed: 8,
};

export function sortDownloads(
  downloads: DownloadTask[],
  sort: DownloadSort,
): DownloadTask[] {
  const direction = sort.direction === "asc" ? 1 : -1;
  const queueRank = (item: DownloadTask) =>
    (3 - Math.max(0, Math.min(3, item.priority ?? 1))) * 1_000_000 +
    item.queueOrder;
  return [...downloads].sort((left, right) => {
    const values: Record<DownloadSortKey, [string | number, string | number]> =
      {
        status: [statusOrder[left.status] ?? 9, statusOrder[right.status] ?? 9],
        size: [left.fileSize ?? -1, right.fileSize ?? -1],
        date: [
          new Date(left.createdAt).getTime(),
          new Date(right.createdAt).getTime(),
        ],
        queue: [queueRank(left), queueRank(right)],
      };
    const [first, second] = values[sort.key];
    return (first < second ? -1 : first > second ? 1 : 0) * direction;
  });
}
