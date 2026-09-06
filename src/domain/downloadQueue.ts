export interface QueueableDownload {
  id: string;
  status: string;
  priority: number;
  queueOrder: number;
}

export function queuePositions(tasks: QueueableDownload[]): Map<string, number> {
  const queued = tasks
    .filter((task) => task.status === "pending")
    .sort((left, right) => {
      const priority = right.priority - left.priority;
      if (priority !== 0) return priority;
      return left.queueOrder - right.queueOrder;
    });
  return new Map(queued.map((task, index) => [task.id, index + 1]));
}
